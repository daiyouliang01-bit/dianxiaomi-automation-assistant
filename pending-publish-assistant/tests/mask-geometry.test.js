import test from 'node:test';
import assert from 'node:assert/strict';

function intersectArea(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x);
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y);
  return w * h;
}

function mergeBoxes(boxes) {
  const sorted = [...boxes].sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const result = [];
  for (const box of sorted) {
    let merged = false;
    for (const r of result) {
      if (intersectArea(box, r) > 0) {
        const rx = Math.min(r.x, box.x);
        const ry = Math.min(r.y, box.y);
        r.width = Math.max(r.x + r.width, box.x + box.width) - rx;
        r.height = Math.max(r.y + r.height, box.y + box.height) - ry;
        r.x = rx;
        r.y = ry;
        merged = true;
        break;
      }
    }
    if (!merged) result.push({ ...box });
  }
  return result;
}

function validateAndMerge(boxes, imageWidth, imageHeight, limits = { perBoxRatio: 0.20, mergedRatio: 0.35 }) {
  const totalArea = imageWidth * imageHeight;
  const valid = boxes.filter(b => {
    b.x = Math.max(0, Math.min(b.x, imageWidth));
    b.y = Math.max(0, Math.min(b.y, imageHeight));
    b.width = Math.max(1, Math.min(b.width, imageWidth - b.x));
    b.height = Math.max(1, Math.min(b.height, imageHeight - b.y));
    if (b.width * b.height / totalArea > limits.perBoxRatio) return false;
    return true;
  });
  const merged = mergeBoxes(valid);
  const unionArea = unionAreaFn(merged);
  if (unionArea / totalArea > limits.mergedRatio) {
    const err = new Error(`合并面积 ${(unionArea / totalArea * 100).toFixed(1)}% 超限`);
    err.code = 'MASK_AREA_EXCEEDED';
    throw err;
  }
  return merged;
}

// Scanline union area
function unionAreaFn(boxes) {
  if (boxes.length <= 1) return boxes.reduce((s, b) => s + b.width * b.height, 0);
  const events = [];
  for (const b of boxes) {
    events.push({ x: b.x, type: 1, y1: b.y, y2: b.y + b.height });
    events.push({ x: b.x + b.width, type: -1, y1: b.y, y2: b.y + b.height });
  }
  events.sort((a, b) => a.x - b.x || b.type - a.type);
  let area = 0, prevX = events[0].x;
  const active = [];
  for (const e of events) {
    if (e.x > prevX && active.length) {
      active.sort((a, b) => a[0] - b[0]);
      let yS = active[0][0], yE = active[0][1], yL = 0;
      for (const s of active) {
        if (s[0] > yE) { yL += yE - yS; yS = s[0]; yE = s[1]; }
        else yE = Math.max(yE, s[1]);
      }
      yL += yE - yS;
      area += (e.x - prevX) * yL;
    }
    if (e.type === 1) active.push([e.y1, e.y2]);
    else {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i][0] === e.y1 && active[i][1] === e.y2) { active.splice(i, 1); break; }
      }
    }
    prevX = e.x;
  }
  return area;
}

test('坐标 Clamp：越界框修正', () => {
  const boxes = [{ x: -10, y: -5, width: 30, height: 30 }];
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 1);
  assert.equal(result[0].x, 0);
  assert.equal(result[0].y, 0);
  assert.ok(result[0].width <= 30);
  assert.ok(result[0].height <= 30);
});

test('单框面积超 20% → 丢弃', () => {
  const boxes = [{ x: 0, y: 0, width: 60, height: 60 }]; // 36% of 100x100
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 0);
});

test('两个重叠框合并', () => {
  const boxes = [
    { x: 0, y: 0, width: 20, height: 20 },
    { x: 10, y: 0, width: 20, height: 20 }, // overlaps previous
  ];
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 1);
  assert.equal(result[0].width, 30); // 0-30
  assert.equal(result[0].height, 20);
});

test('两个分离框不合并', () => {
  const boxes = [
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 50, y: 50, width: 10, height: 10 },
  ];
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 2);
});

test('合并面积超 35% → 抛异常', () => {
  // 3 boxes each under 20% individually, but union > 35%
  const boxes = [
    { x: 0, y: 0, width: 45, height: 30 },
    { x: 55, y: 0, width: 45, height: 30 },
    { x: 0, y: 45, width: 45, height: 30 },
  ];
  assert.throws(
    () => validateAndMerge(boxes, 100, 100),
    (err) => err.code === 'MASK_AREA_EXCEEDED'
  );
});

test('零面积框被拒绝', () => {
  const boxes = [{ x: 0, y: 0, width: 1, height: 1 }, { x: 10, y: 10, width: 1, height: 1 }];
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 2); // 1x1 < 20% so passes
});

test('默认 limits 使用 perBox 0.20 / merged 0.35', () => {
  const boxes = [{ x: 0, y: 0, width: 20, height: 50 }]; // 10% of 100x100
  const result = validateAndMerge(boxes, 100, 100);
  assert.equal(result.length, 1); // 10% < 20% → passed
});

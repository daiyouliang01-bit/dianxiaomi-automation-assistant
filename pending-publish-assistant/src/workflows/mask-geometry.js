/* 遮罩几何安全检查 */

(function() {
  var DXM_MASK_LIMITS = {
    perBoxRatio: 0.20,
    mergedRatio: 0.35,
    padding: 12,
    expandRatio: 0.15,
    secondaryExpandRatio: 0.05,
  };

  function dxmValidateAndMergeBoxes(boxes, imageWidth, imageHeight) {
    var totalArea = imageWidth * imageHeight;
    if (!boxes || !boxes.length) return [];

    var valid = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      b.x = Math.max(0, Math.min(b.x || 0, imageWidth));
      b.y = Math.max(0, Math.min(b.y || 0, imageHeight));
      b.width = Math.max(1, Math.min(b.width || 0, imageWidth - b.x));
      b.height = Math.max(1, Math.min(b.height || 0, imageHeight - b.y));
      var area = b.width * b.height;
      if (area <= 0) continue;
      if (area / totalArea > DXM_MASK_LIMITS.perBoxRatio) {
        console.warn('[mask] 单框面积占比 ' + (area / totalArea * 100).toFixed(1) + '% 超限，已丢弃');
        continue;
      }
      valid.push(b);
    }

    if (!valid.length) return [];

    var merged = dxmMergeOverlappingBoxes(valid);
    var unionArea = dxmUnionArea(merged);
    if (unionArea / totalArea > DXM_MASK_LIMITS.mergedRatio) {
      var err = new Error('合并遮罩面积 ' + (unionArea / totalArea * 100).toFixed(1) + '% 超限');
      err.code = 'MASK_AREA_EXCEEDED';
      throw err;
    }
    return merged;
  }

  function dxmMergeOverlappingBoxes(boxes) {
    var sorted = boxes.slice().sort(function(a, b) { return (b.width * b.height) - (a.width * a.height); });
    var result = [];
    for (var i = 0; i < sorted.length; i++) {
      var box = sorted[i];
      var merged = false;
      for (var j = 0; j < result.length; j++) {
        if (dxmIntersectionArea(box, result[j]) > 0) {
          var rx = Math.min(result[j].x, box.x);
          var ry = Math.min(result[j].y, box.y);
          result[j].width = Math.max(result[j].x + result[j].width, box.x + box.width) - rx;
          result[j].height = Math.max(result[j].y + result[j].height, box.y + box.height) - ry;
          result[j].x = rx;
          result[j].y = ry;
          merged = true;
          break;
        }
      }
      if (!merged) result.push({ x: box.x, y: box.y, width: box.width, height: box.height });
    }
    return result;
  }

  function dxmIntersectionArea(a, b) {
    var x = Math.max(a.x, b.x);
    var y = Math.max(a.y, b.y);
    var w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x);
    var h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y);
    return w * h;
  }

  function dxmUnionArea(boxes) {
    if (boxes.length <= 1) {
      var sum = 0;
      for (var i = 0; i < boxes.length; i++) sum += boxes[i].width * boxes[i].height;
      return sum;
    }
    var events = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      events.push({ x: b.x, type: 1, y1: b.y, y2: b.y + b.height });
      events.push({ x: b.x + b.width, type: -1, y1: b.y, y2: b.y + b.height });
    }
    events.sort(function(a, b) { return a.x - b.x || b.type - a.type; });
    var area = 0, prevX = events[0].x;
    var active = [];
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.x > prevX && active.length) {
        active.sort(function(a, b) { return a[0] - b[0]; });
        var yStart = active[0][0], yEnd = active[0][1];
        var yLen = 0;
        for (var j = 0; j < active.length; j++) {
          var seg = active[j];
          if (seg[0] > yEnd) { yLen += yEnd - yStart; yStart = seg[0]; yEnd = seg[1]; }
          else yEnd = Math.max(yEnd, seg[1]);
        }
        yLen += yEnd - yStart;
        area += (e.x - prevX) * yLen;
      }
      if (e.type === 1) active.push([e.y1, e.y2]);
      else {
        for (var k = active.length - 1; k >= 0; k--) {
          if (active[k][0] === e.y1 && active[k][1] === e.y2) { active.splice(k, 1); break; }
        }
      }
      prevX = e.x;
    }
    return area;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.dxmValidateAndMergeBoxes = dxmValidateAndMergeBoxes;
    globalThis.DXM_MASK_LIMITS = DXM_MASK_LIMITS;
  }
})();

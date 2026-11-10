import test from 'node:test';
import assert from 'node:assert/strict';

function pixelVariance(data) {
  let sum = 0, sumSq = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    sum += gray; sumSq += gray * gray; count += 1;
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

test('纯色块方差 ≈ 0', () => {
  const data = new Uint8ClampedArray(400).fill(128); // all gray 128
  for (let i = 0; i < 400; i += 4) { data[i + 3] = 255; } // alpha
  const v = pixelVariance(data);
  assert.ok(v < 0.001, `纯色块方差应为 0，实际 ${v}`);
});

test('黑白交替块方差很大', () => {
  const data = new Uint8ClampedArray(400);
  for (let i = 0; i < 400; i += 8) {
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    data[i + 4] = 255; data[i + 5] = 255; data[i + 6] = 255; data[i + 7] = 255;
  }
  const v = pixelVariance(data);
  assert.ok(v > 100, `交替色块方差应很大，实际 ${v}`);
});

test('空数据方差为 0', () => {
  assert.equal(pixelVariance(new Uint8ClampedArray(0)), 0);
});

test('一个像素方差为 0', () => {
  const data = new Uint8ClampedArray([128, 128, 128, 255]);
  assert.equal(pixelVariance(data), 0);
});

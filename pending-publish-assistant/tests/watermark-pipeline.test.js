const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'workflows', 'watermark-pipeline.js'),
  'utf8'
);

test('cloud vision failure is fail-closed before removal and own-watermark processing', () => {
  assert.match(source, /DXM_VISION_DETECTION_UNKNOWN/);
  assert.match(source, /detection\.cloud_vision_error/);

  const detectionIndex = source.indexOf('const detection = await dxmWmLiteDetect');
  const guardIndex = source.indexOf('detection.cloud_vision_error', detectionIndex);
  const boxesIndex = source.indexOf('if (detection.boxes.length)', detectionIndex);
  const ownWatermarkIndex = source.indexOf('dxmWmApplyOwnWatermark', detectionIndex);

  assert.ok(detectionIndex >= 0, 'detection call must exist');
  assert.ok(guardIndex > detectionIndex, 'cloud failure guard must follow detection');
  assert.ok(guardIndex < boxesIndex, 'cloud failure guard must run before box processing');
  assert.ok(guardIndex < ownWatermarkIndex, 'cloud failure guard must run before own watermark');
});

test('OCR-only mode does not require cloud vision', () => {
  assert.match(
    source,
    /detectionMode\s*!==\s*['"]ocr['"]\s*&&\s*detection\.cloud_vision_error/
  );
});

test('cloud detection carries batch-scoped provider contract and records actual provider', () => {
  assert.match(source, /batch_id:\s*visionSession\.batchId/);
  assert.match(source, /preferred_provider:\s*visionSession\.mainProviderId/);
  assert.match(source, /provider_order:\s*visionSession\.order/);
  assert.match(source, /detection\.provider_id/);
  assert.match(source, /action:\s*['"]dxm_record_vision_provider['"]/);
  assert.match(source, /generation:\s*visionSession\.generation/);
});

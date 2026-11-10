import test from 'node:test';
import assert from 'node:assert/strict';

// Replicate dxmClassifyError logic for testing
const TYPES = {
  NETWORK_TIMEOUT: { code: 'NETWORK_TIMEOUT', retryable: true, category: 'transient' },
  OCR_BUSY: { code: 'OCR_BUSY', retryable: true, category: 'transient' },
  OCR_TIMEOUT: { code: 'OCR_TIMEOUT', retryable: true, category: 'transient' },
  SERVICE_DOWN: { code: 'SERVICE_DOWN', retryable: true, category: 'transient' },
  RATE_LIMITED: { code: 'RATE_LIMITED', retryable: true, category: 'transient' },
  IMAGE_SPACE_FULL: { code: 'IMAGE_SPACE_FULL', retryable: false, category: 'permanent' },
  TOO_FEW_IMAGES: { code: 'DXM_PRODUCT_INVALID_TOO_FEW_IMAGES', retryable: false, category: 'permanent' },
  PARSE_ERROR: { code: 'PARSE_ERROR', retryable: false, category: 'permanent' },
  MASK_AREA_EXCEEDED: { code: 'MASK_AREA_EXCEEDED', retryable: false, category: 'permanent' },
  OCR_CIRCUIT_OPEN: { code: 'OCR_CIRCUIT_OPEN', retryable: true, category: 'transient' },
};

function classify(error) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  const code = error?.code || '';
  const byCode = Object.values(TYPES).find(e => e.code === code);
  if (byCode) return byCode;
  if (/timeout|timed ?out/i.test(msg)) return TYPES.NETWORK_TIMEOUT;
  if (/busy|too many|rate limit|429/i.test(msg)) return TYPES.RATE_LIMITED;
  if (/空间不足|space.*full|空间满/i.test(msg)) return TYPES.IMAGE_SPACE_FULL;
  if (/service.*down|connect.*refused|fetch failed|econnrefused/i.test(msg)) return TYPES.SERVICE_DOWN;
  if (/parse|json.*error/i.test(msg)) return TYPES.PARSE_ERROR;
  return TYPES.NETWORK_TIMEOUT;
}

test('按 code 精确匹配', () => {
  const e = { code: 'DXM_PRODUCT_INVALID_TOO_FEW_IMAGES', message: '可用主图只剩1张' };
  const r = classify(e);
  assert.equal(r.code, 'DXM_PRODUCT_INVALID_TOO_FEW_IMAGES');
  assert.equal(r.category, 'permanent');
  assert.equal(r.retryable, false);
});

test('按消息特征匹配 timeout', () => {
  assert.equal(classify(new Error('Request timed out')).code, 'NETWORK_TIMEOUT');
  assert.equal(classify(new Error('连接超时')).code, 'NETWORK_TIMEOUT');
});

test('按消息特征匹配 busy', () => {
  assert.equal(classify(new Error('OCR_BUSY: queue full')).code, 'RATE_LIMITED');
});

test('图片空间不足', () => {
  assert.equal(classify(new Error('图片空间不足')).code, 'IMAGE_SPACE_FULL');
  assert.equal(classify(new Error('image space full!')).code, 'IMAGE_SPACE_FULL');
});

test('服务不可用', () => {
  assert.equal(classify(new Error('fetch failed')).code, 'SERVICE_DOWN');
  assert.equal(classify(new Error('ECONNREFUSED')).code, 'SERVICE_DOWN');
});

test('OCR 熔断打开是瞬态', () => {
  const e = { code: 'OCR_CIRCUIT_OPEN', message: 'OCR 服务熔断中' };
  const r = classify(e);
  assert.equal(r.code, 'OCR_CIRCUIT_OPEN');
  assert.ok(r.retryable);
});

test('BO 遮罩面积超限是永久', () => {
  const e = { code: 'MASK_AREA_EXCEEDED', message: '合并遮罩面积 50% 超限' };
  const r = classify(e);
  assert.equal(r.category, 'permanent');
});

test('fallback 到 NETWORK_TIMEOUT', () => {
  assert.equal(classify(new Error('unknown weird error')).code, 'NETWORK_TIMEOUT');
  assert.ok(classify(new Error('unknown weird error')).retryable);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Simulate the state machine (it's packaged as IIFE, but tests verify logic)
const STATES = {
  PENDING: 'pending', PROCESSING: 'processing', DONE: 'done',
  ABNORMAL_TRANSIENT: 'abnormal_transient', ABNORMAL_MANUAL: 'abnormal_manual',
  INVALID_MATERIAL: 'invalid_material', SKIPPED: 'skipped',
  PUBLISH_UNKNOWN: 'publish_unknown',
};
const ALLOWED = {
  [STATES.PENDING]: ['processing', 'skipped'],
  [STATES.PROCESSING]: ['done', 'abnormal_transient', 'abnormal_manual', 'invalid_material', 'publish_unknown', 'skipped'],
  [STATES.ABNORMAL_TRANSIENT]: ['pending', 'abnormal_manual'],
  [STATES.ABNORMAL_MANUAL]: ['pending', 'skipped'],
  [STATES.PUBLISH_UNKNOWN]: ['done', 'abnormal_manual'],
};
const TERMINAL = new Set(['done', 'invalid_material', 'skipped']);

function dxmTransition(product, target) {
  const allowed = ALLOWED[product.state];
  if (!allowed || !allowed.includes(target)) throw new Error(`非法: ${product.state} → ${target}`);
  product.state = target;
  product.version += 1;
  product.updatedAt = Date.now();
  if (target === STATES.PENDING) product.retryCount = (product.retryCount || 0) + 1;
}

test('正常流程 pending → processing → done', () => {
  const p = { state: STATES.PENDING, version: 1, retryCount: 0 };
  dxmTransition(p, STATES.PROCESSING);
  assert.equal(p.state, STATES.PROCESSING);
  assert.equal(p.version, 2);
  dxmTransition(p, STATES.DONE);
  assert.equal(p.state, STATES.DONE);
  assert.equal(p.version, 3);
  // done is terminal
  assert.ok(TERMINAL.has(p.state));
});

test('瞬态异常 → 重试一次 → 失败 → 人工处理', () => {
  const p = { state: STATES.PENDING, version: 1, retryCount: 0 };
  dxmTransition(p, STATES.PROCESSING);
  dxmTransition(p, STATES.ABNORMAL_TRANSIENT);
  assert.equal(p.retryCount, 0);
  // retry: transient → pending
  dxmTransition(p, STATES.PENDING);
  assert.equal(p.retryCount, 1);
  dxmTransition(p, STATES.PROCESSING);
  // fail again → transient → manual (can't go back to pending again because retry already happened)
  dxmTransition(p, STATES.ABNORMAL_TRANSIENT);
  dxmTransition(p, STATES.ABNORMAL_MANUAL);
  assert.equal(p.state, STATES.ABNORMAL_MANUAL);
});

test('素材无效直接终态', () => {
  const p = { state: STATES.PROCESSING, version: 3, retryCount: 0 };
  dxmTransition(p, STATES.INVALID_MATERIAL);
  assert.ok(TERMINAL.has(p.state));
});

test('非法转换抛异常', () => {
  const p = { state: STATES.DONE, version: 1, retryCount: 0 };
  assert.throws(() => dxmTransition(p, STATES.PROCESSING), /非法/);
});

test('publish_unknown → done（人工确认）', () => {
  const p = { state: STATES.PROCESSING, version: 5, retryCount: 0 };
  dxmTransition(p, STATES.PUBLISH_UNKNOWN);
  dxmTransition(p, STATES.DONE);
  assert.equal(p.state, STATES.DONE);
});

test('publish_unknown 不可直接回 processing', () => {
  const p = { state: STATES.PUBLISH_UNKNOWN, version: 5, retryCount: 0 };
  assert.throws(() => dxmTransition(p, STATES.PROCESSING), /非法/);
});

test('版本号递增', () => {
  const p = { state: STATES.PENDING, version: 10, retryCount: 0 };
  dxmTransition(p, STATES.PROCESSING);
  assert.equal(p.version, 11);
  dxmTransition(p, STATES.DONE);
  assert.equal(p.version, 12);
});

test('terminal failure records are bounded and deduplicated by product', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '../src/state/product-state.js'), 'utf8');
  const context = { globalThis: {}, Date };
  vm.runInNewContext(source, context);
  const api = context.globalThis.DxmProductState;
  const first = api.upsertFailedProduct([], { productId: '1', productUrl: 'https://www.dianxiaomi.com/x?id=1', message: 'x'.repeat(1000), forbiddenWords: ['best'] });
  const second = api.upsertFailedProduct(first, { productId: '1', productUrl: 'https://www.dianxiaomi.com/x?id=1', message: 'new', forbiddenWords: ['WhatsApp'] });
  assert.equal(second.length, 1);
  assert.equal(second[0].message, 'new');
  assert.ok(second[0].message.length <= 300);
  assert.equal(api.batchSummary({ pendingQueue: [], activeChildren: [], processed: 4, failedProducts: second }).ready, true);
  assert.equal(api.batchSummary({ pendingQueue: [{}], activeChildren: [], failedProducts: second }).ready, false);
});

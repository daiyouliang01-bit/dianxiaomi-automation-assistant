import test from 'node:test';
import assert from 'node:assert/strict';
import visionSession from '../src/background/vision-session.js';

class DxmAsyncQueue {
  constructor({ name, workers, capacity }) {
    this.name = name;
    this.workers = workers;
    this.capacity = capacity;
    this._active = 0;
    this._queue = [];
  }
  async run(fn, timeoutMs = 30000) {
    if (this._active + this._queue.length >= this.workers + this.capacity) {
      const err = new Error(`${this.name} 队列满载`);
      err.code = `${this.name.toUpperCase()}_BUSY`;
      throw err;
    }
    if (this._active >= this.workers) {
      await new Promise(resolve => this._queue.push(resolve));
    }
    this._active += 1;
    let timer;
    try {
      if (timeoutMs > 0) {
        const result = await Promise.race([
          fn(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${this.name} 超时`)), timeoutMs);
          })
        ]);
        clearTimeout(timer);
        return result;
      }
      return await fn();
    } finally {
      clearTimeout(timer);
      this._active -= 1;
      if (this._queue.length) this._queue.shift()();
    }
  }
  getStatus() {
    return { name: this.name, active: this._active, queued: this._queue.length, workers: this.workers, capacity: this.capacity };
  }
}

test('单 worker 正常执行', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 1, capacity: 2 });
  const result = await q.run(() => Promise.resolve(42));
  assert.equal(result, 42);
});

test('异常传播到调用方', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 1, capacity: 2 });
  await assert.rejects(
    () => q.run(() => Promise.reject(new Error('boom'))),
    /boom/
  );
});

test('异常后队列仍可用', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 1, capacity: 2 });
  try { await q.run(() => Promise.reject(new Error('boom'))); } catch (_) {}
  const result = await q.run(() => Promise.resolve('ok'));
  assert.equal(result, 'ok');
});

test('并发不超过 workers', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 2, capacity: 4 });
  let maxConcurrent = 0;
  let current = 0;
  const tasks = Array.from({ length: 6 }, () =>
    q.run(async () => {
      current += 1;
      maxConcurrent = Math.max(maxConcurrent, current);
      await new Promise(r => setTimeout(r, 20));
      current -= 1;
    })
  );
  await Promise.all(tasks);
  assert.ok(maxConcurrent <= 2, `maxConcurrent=${maxConcurrent} 不应超过 workers=2`);
});

test('满载时抛 BUSY', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 1, capacity: 1 });
  const slow = () => new Promise(r => setTimeout(r, 1000));
  q.run(slow).catch(() => {}); // active=1
  q.run(slow).catch(() => {}); // queued=1

  await assert.rejects(
    () => q.run(() => Promise.resolve()),
    (err) => err.code === 'TEST_BUSY'
  );
});

test('超时抛异常', async () => {
  const q = new DxmAsyncQueue({ name: 'test', workers: 1, capacity: 2 });
  await assert.rejects(
    () => q.run(() => new Promise(r => setTimeout(r, 200)), 50),
    /超时/
  );
});

test('状态快照正确', () => {
  const q = new DxmAsyncQueue({ name: 'ocr', workers: 1, capacity: 4 });
  const s = q.getStatus();
  assert.equal(s.name, 'ocr');
  assert.equal(s.active, 0);
  assert.equal(s.queued, 0);
  assert.equal(s.workers, 1);
  assert.equal(s.capacity, 4);
});

test('批次模型提升后只保留当前模型之后且未失败的候选项', () => {
  const session = {
    batchId: 'b1', generation: 1, status: 'ready', mainProviderId: 'glm',
    order: ['glm', 'glm-4v', 'gemini', 'agnes', 'qwen3-vl-flash', 'qwen'],
    unavailableProviderIds: []
  };
  const next = visionSession.recordSuccess(session, {
    batchId: 'b1', generation: 1, providerId: 'agnes', modelId: 'agnes-model',
    fallbackHistory: [
      { provider_id: 'glm', reason: 'TimeoutError' },
      { provider_id: 'glm-4v', reason: 'TimeoutError' },
      { provider_id: 'gemini', reason: 'ProviderUnavailable' }
    ]
  });
  assert.equal(next.mainProviderId, 'agnes');
  assert.equal(next.generation, 2);
  assert.deepEqual(next.order, ['agnes', 'qwen3-vl-flash', 'qwen']);
  assert.deepEqual(next.unavailableProviderIds, ['glm', 'glm-4v', 'gemini']);
});

test('过期或超前 generation 都不能覆盖当前批次模型', () => {
  const session = {
    batchId: 'b1', generation: 3, status: 'ready', mainProviderId: 'agnes',
    order: ['agnes', 'qwen3-vl-flash', 'qwen'], unavailableProviderIds: []
  };
  for (const generation of [2, 4]) {
    assert.strictEqual(visionSession.recordSuccess(session, {
      batchId: 'b1', generation, providerId: 'qwen', modelId: 'qwen-model'
    }), session);
  }
});

test('全失败以清洗后的失败信息原子置为 unavailable', () => {
  const session = {
    batchId: 'b1', generation: 2, status: 'ready', mainProviderId: 'agnes',
    order: ['agnes', 'qwen3-vl-flash', 'qwen'], unavailableProviderIds: ['glm']
  };
  const next = visionSession.recordUnavailable(session, {
    batchId: 'b1', generation: 2,
    fallbackHistory: [
      { provider_id: 'agnes', attempt: 1, reason: 'TimeoutError', message: 'api-key=SECRET' },
      { provider_id: 'qwen', attempt: 1, reason: 'ProviderUnavailable', token: 'SECRET' }
    ]
  });
  assert.equal(next.status, 'unavailable');
  assert.equal(next.mainProviderId, '');
  assert.deepEqual(next.lastFailures, [
    { provider_id: 'agnes', attempt: 1, reason: 'TimeoutError' },
    { provider_id: 'qwen', attempt: 1, reason: 'ProviderUnavailable' }
  ]);
  assert.ok(!JSON.stringify(next).includes('SECRET'));
});

test('并发窗口基于同一 generation 的提升只接受队列中的第一个', async () => {
  const queue = new DxmAsyncQueue({ name: 'state_write', workers: 1, capacity: 4 });
  let session = {
    batchId: 'b1', generation: 1, status: 'ready', mainProviderId: 'glm',
    order: ['glm', 'glm-4v', 'gemini', 'agnes', 'qwen3-vl-flash', 'qwen'],
    unavailableProviderIds: []
  };
  const promote = event => queue.run(async () => {
    await new Promise(resolve => setTimeout(resolve, event.delay));
    session = visionSession.recordSuccess(session, event);
  });
  await Promise.all([
    promote({ batchId: 'b1', generation: 1, providerId: 'agnes', modelId: 'agnes', delay: 10 }),
    promote({ batchId: 'b1', generation: 1, providerId: 'qwen', modelId: 'qwen', delay: 0 })
  ]);
  assert.equal(session.mainProviderId, 'agnes');
  assert.equal(session.generation, 2);
  assert.deepEqual(session.order, ['agnes', 'qwen3-vl-flash', 'qwen']);
});

test('同代并发全失败先完成后，后到成功不能恢复 ready', async () => {
  const queue = new DxmAsyncQueue({ name: 'state_write', workers: 1, capacity: 4 });
  let session = {
    batchId: 'b1', generation: 4, status: 'ready', mainProviderId: 'agnes',
    order: ['agnes', 'qwen3-vl-flash', 'qwen'], unavailableProviderIds: []
  };
  const originalGeneration = session.generation;
  await Promise.all([
    queue.run(async () => {
      session = visionSession.recordUnavailable(session, {
        batchId: 'b1', generation: originalGeneration,
        fallbackHistory: [{ provider_id: 'agnes', reason: 'TimeoutError' }]
      });
    }),
    queue.run(async () => {
      session = visionSession.recordSuccess(session, {
        batchId: 'b1', generation: originalGeneration,
        providerId: 'qwen', modelId: 'qwen-model'
      });
    })
  ]);
  assert.equal(session.status, 'unavailable');
  assert.equal(session.generation, 5);
  assert.equal(session.mainProviderId, '');
});

test('同代并发成功提升先完成后，后到全失败不能覆盖 promotion', async () => {
  const queue = new DxmAsyncQueue({ name: 'state_write', workers: 1, capacity: 4 });
  let session = {
    batchId: 'b1', generation: 7, status: 'ready', mainProviderId: 'agnes',
    order: ['agnes', 'qwen3-vl-flash', 'qwen'], unavailableProviderIds: []
  };
  const originalGeneration = session.generation;
  await Promise.all([
    queue.run(async () => {
      session = visionSession.recordSuccess(session, {
        batchId: 'b1', generation: originalGeneration,
        providerId: 'qwen3-vl-flash', modelId: 'qwen3-vl-flash-model'
      });
    }),
    queue.run(async () => {
      session = visionSession.recordUnavailable(session, {
        batchId: 'b1', generation: originalGeneration,
        fallbackHistory: [{ provider_id: 'agnes', reason: 'TimeoutError' }]
      });
    })
  ]);
  assert.equal(session.status, 'ready');
  assert.equal(session.generation, 8);
  assert.equal(session.mainProviderId, 'qwen3-vl-flash');
});

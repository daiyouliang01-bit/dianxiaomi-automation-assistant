'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRpaMessageRouter } = require('../src/background/rpa-message-router.js');
const registryApi = require('../src/background/rpa-tab-registry.js');

function createHarness(overrides = {}) {
    const removed = [];
    const records = new Map();
    const chromeApi = {
        runtime: { lastError: null },
        tabs: {
            create(options, callback) { callback({ id: 91, ...options }); },
            async remove(tabId) { removed.push(tabId); }
        }
    };
    const registryStore = {
        async registerRpaTab(record) { records.set(record.tabId, record); },
        async unregisterRpaTab(tabId) { records.delete(tabId); },
        async getRpaTab(tabId) { return records.get(tabId) || null; },
        async countRpaTabs(runId) { return [...records.values()].filter((r) => r.runId === runId).length; },
        async closeRpaTabs(runId) {
            const ids = [...records.values()].filter((r) => r.runId === runId).map((r) => r.tabId);
            ids.forEach((id) => records.delete(id));
            return ids.length;
        },
        ...overrides.registryStore
    };
    const router = createRpaMessageRouter({
        chromeApi,
        registryStore,
        registryApi,
        waitForSlot: async () => {},
        createTabWithRetry: async () => ({ success: true, tabId: 91 }),
        wait: async () => {},
        now: () => 123,
        ...overrides.dependencies
    });
    return { router, chromeApi, registryStore, records, removed };
}

test('RPA router ignores unrelated messages and rejects unsafe target URLs', async () => {
    const { router } = createHarness();
    assert.equal(router.handleRpaMessage({ action: 'unrelated' }), null);
    assert.deepEqual(await router.handleRpaMessage({ action: 'open_edit_tabs', urls: ['https://evil.example/web/smt/edit?id=1234567890'] }), {
        success: false,
        results: [{ success: false, error: 'invalid_edit_url' }]
    });
    assert.deepEqual(await router.handleRpaMessage({ action: 'open_rpa_work_tab', url: 'https://evil.example/' }), {
        success: false,
        error: 'invalid_work_url'
    });
});

test('RPA router closes a newly created tab if persistent registration fails', async () => {
    const { router, removed } = createHarness({
        registryStore: { async registerRpaTab() { throw new Error('storage unavailable'); } }
    });
    const runId = 'run-register-failure';
    const url = `https://www.dianxiaomi.com/web/smt/edit?id=1234567890&rpa_run_id=${runId}`;
    const result = await router.handleRpaMessage({ action: 'open_rpa_tabs', runId, urls: [url] });
    assert.equal(result.success, false);
    assert.match(result.results[0].error, /register_failed/);
    assert.deepEqual(removed, [91]);
});

test('RPA router requires sender.tab and matching run id before closing', async () => {
    const { router, records, removed } = createHarness();
    records.set(91, { tabId: 91, runId: 'run-a' });
    assert.deepEqual(await router.handleRpaMessage({ action: 'close_tab', runId: 'run-a' }, {}), { error: 'no_tab' });
    assert.deepEqual(await router.handleRpaMessage({ action: 'close_tab', runId: 'run-b' }, { tab: { id: 91 } }), { error: 'run_id_mismatch' });
    assert.deepEqual(removed, []);
    assert.deepEqual(await router.handleRpaMessage({ action: 'close_tab', runId: 'run-a' }, { tab: { id: 91 } }), { closed: true });
    assert.deepEqual(removed, [91]);
});

test('RPA router opens a validated work tab next to the sender and reports Chrome errors', async () => {
    const harness = createHarness();
    assert.deepEqual(await harness.router.handleRpaMessage({
        action: 'open_rpa_work_tab',
        url: 'https://www.dianxiaomi.com/web/smt/smtProductList'
    }, { tab: { index: 4 } }), { success: true, tabId: 91 });

    harness.chromeApi.runtime.lastError = { message: 'tab create denied' };
    assert.deepEqual(await harness.router.handleRpaMessage({
        action: 'open_rpa_work_tab',
        url: 'https://www.dianxiaomi.com/web/smt/smtProductList'
    }), { success: false, error: 'tab create denied' });
});

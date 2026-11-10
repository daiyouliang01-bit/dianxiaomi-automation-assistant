'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChromeMock } = require('./_setup.js');

function createBackgroundEnvironment() {
    const stored = new Map();
    const openTabs = new Map();
    let nextTabId = 10;
    const chromeMock = createChromeMock({
        storage: {
            local: {
                get(key, callback) {
                    const keys = Array.isArray(key) ? key : [key];
                    const result = {};
                    keys.forEach((item) => {
                        if (stored.has(item)) result[item] = structuredClone(stored.get(item));
                    });
                    callback(result);
                },
                set(entries, callback) {
                    Object.entries(entries || {}).forEach(([key, value]) => stored.set(key, structuredClone(value)));
                    if (callback) callback();
                },
                remove(keys, callback) {
                    (Array.isArray(keys) ? keys : [keys]).forEach((key) => stored.delete(key));
                    if (callback) callback();
                }
            }
        },
        tabs: {
            query(_query, callback) { callback([...openTabs.values()].map((tab) => ({ ...tab }))); },
            async create(options, callback) {
                const tab = { id: nextTabId++, url: options.url, index: 0 };
                openTabs.set(tab.id, tab);
                if (callback) callback(tab);
                return tab;
            },
            async remove(tabId, callback) {
                openTabs.delete(tabId);
                if (callback) callback();
            }
        },
        windows: {
            async create(options, callback) {
                const tab = { id: nextTabId++, url: options.url, index: 0 };
                openTabs.set(tab.id, tab);
                const win = { id: nextTabId, tabs: [tab] };
                if (callback) callback(win);
                return win;
            }
        }
    });
    return { chromeMock, stored, openTabs };
}

function dispatch(listener, request, sender = {}) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) reject(new Error(`message timeout: ${request.action}`));
        }, 1000);
        const sendResponse = (response) => {
            settled = true;
            clearTimeout(timeout);
            resolve(response);
        };
        listener(request, sender, sendResponse);
    });
}

test('RPA background messages require and isolate run ids while manual tabs stay unregistered', async () => {
    const originalChrome = global.chrome;
    const environment = createBackgroundEnvironment();
    global.chrome = environment.chromeMock;
    delete require.cache[require.resolve('../src/background/background.js')];
    delete globalThis.RpaTabRegistry;
    delete globalThis.AiClient;
    delete globalThis.ForbiddenWordsCleaner;
    delete globalThis.RpaMessageRouter;
    delete globalThis.ImageFetchPolicy;
    require('../src/background/background.js');
    const listener = environment.chromeMock.runtime.onMessage.listeners[0];

    try {
        assert.deepEqual(
            await dispatch(listener, { action: 'open_rpa_tabs', urls: [] }),
            { success: false, error: 'missing_run_id' }
        );

        const runId = 'rpa-message-test';
        const url = `https://www.dianxiaomi.com/web/smt/edit?id=1234567890&rpa_auto=1&rpa_run_id=${runId}`;
        const opened = await dispatch(listener, { action: 'open_rpa_tabs', runId, urls: [url] });
        assert.equal(opened.success, true);
        const rpaTabId = opened.results[0].tabId;
        assert.deepEqual(await dispatch(listener, { action: 'query_active_rpa_tabs_count', runId }), { count: 1 });

        assert.deepEqual(
            await dispatch(listener, { action: 'close_tab', runId: 'rpa-other' }, { tab: { id: rpaTabId } }),
            { error: 'run_id_mismatch' }
        );
        assert.equal(environment.openTabs.has(rpaTabId), true);

        assert.deepEqual(
            await dispatch(listener, { action: 'close_tab', runId }, { tab: { id: rpaTabId } }),
            { closed: true }
        );

        const manualUrl = 'https://www.dianxiaomi.com/web/smt/edit?id=2222222222';
        assert.equal((await dispatch(listener, { action: 'open_edit_tabs', urls: [manualUrl] })).success, true);
        assert.deepEqual(await dispatch(listener, { action: 'query_active_rpa_tabs_count', runId }), { count: 0 });
    } finally {
        global.chrome = originalChrome;
    }
});

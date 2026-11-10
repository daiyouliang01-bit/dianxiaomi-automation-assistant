'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function createSessionStorage() {
    const store = new Map();
    return {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
        clear() { store.clear(); }
    };
}

function loadFreshRpaModules() {
    delete require.cache[require.resolve('../src/page-adapters/rpa-page-targeting.js')];
    delete require.cache[require.resolve('../src/workflows/rpa.js')];
    require('../src/page-adapters/rpa-page-targeting.js');
    require('../src/workflows/rpa.js');
}

async function withRpaGlobals(run) {
    const originalGlobals = {
        window: global.window,
        sessionStorage: global.sessionStorage,
        location: global.location,
        chrome: global.chrome,
        BroadcastChannel: global.BroadcastChannel,
        setInterval: global.setInterval,
        clearInterval: global.clearInterval,
        setTimeout: global.setTimeout,
        alert: global.alert,
        document: global.document,
        confirm: global.confirm
    };

    try {
        global.window = global;
        global.sessionStorage = createSessionStorage();
        global.location = { origin: 'https://www.dianxiaomi.com', href: 'https://www.dianxiaomi.com/web/smt/smtProductList?foo=1&rpa_auto=1&opt_mode=normal' };
        global.BroadcastChannel = function BroadcastChannel() {};
        global.setInterval = () => 0;
        global.setTimeout = () => 0;
        global.alert = () => {};
        global.confirm = () => true;
        return await run();
    } finally {
        Object.assign(global, originalGlobals);
    }
}

test('RPA queue stops before opening edit tabs when the selected store changes', async () => {
    await withRpaGlobals(() => {
        const messages = [];
        global.chrome = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                }
            }
        };

        const editLink = {
            innerText: '编辑',
            textContent: '编辑',
            getAttribute(name) {
                return name === 'href' ? '/web/smt/edit?id=39420316695315338' : '';
            },
            closest() {
                return null;
            }
        };
        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? [editLink] : [];
            }
        };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = { editLink: '编辑' };
        window.RpaSafety = { getProductId: () => null, shouldContinueAfterProductResult: () => true };
        window.RpaRunState = { update: () => Promise.resolve() };
        window.refreshRPAButtonState = () => {};
        window.getRpaPauseReason = () => null;
        window.getRpaCurrentStoreName = () => '0786-李俊频（工具）五公司';

        sessionStorage.setItem('rpa_running', '1');
        sessionStorage.setItem('rpa_locked_store_name', '0785-李俊频（工具）五公司');

        window.startRPAQueue();

        assert.equal(sessionStorage.getItem('rpa_running'), null);
        assert.deepEqual(messages, []);
    });
});

test('starting RPA keeps the current tab as the locked runner and defers the separate work tab until preflight completes', async () => {
    await withRpaGlobals(async () => {
        const messages = [];
        const calls = [];
        global.chrome = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                }
            }
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();

        window.RpaRunState = {
            start: async (payload) => {
                calls.push(['start', payload]);
                return { runId: 'rpa-test-run' };
            }
        };
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';
        window.startRpaImageSpacePreflight = async () => calls.push(['preflight']);

        const started = await window.startRpaAsDedicatedRunner(() => calls.push(['render']), { descriptionCleanupLevel: 'light' });

        assert.equal(started, true);
        assert.equal(sessionStorage.getItem('rpa_running'), '1');
        assert.equal(sessionStorage.getItem('rpa_current_run_id'), 'rpa-test-run');
        assert.equal(sessionStorage.getItem('rpa_locked_store_name'), '0785-李俊频（工具）五公司');
        assert.equal(sessionStorage.getItem('rpa_open_work_tab_after_preflight'), '1');
        assert.equal(sessionStorage.getItem('rpa_description_cleanup_level'), 'light');
        assert.deepEqual(calls, [['start', {
            mode: 'normal',
            storeName: '0785-李俊频（工具）五公司',
            saveDestination: 'pending_publish',
            descriptionCleanupLevel: 'light'
        }], ['render'], ['preflight']]);
        assert.deepEqual(messages, []);
    });
});

test('starting RPA stores the selected save destination for child edit tabs', async () => {
    await withRpaGlobals(async () => {
        const calls = [];
        global.chrome = {
            runtime: {
                sendMessage() {}
            }
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();

        window.RpaRunState = { start: async (payload) => calls.push(['start', payload]) };
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';
        window.startRpaImageSpacePreflight = async () => calls.push(['preflight']);

        const started = await window.startRpaAsDedicatedRunner(() => calls.push(['render']), {
            descriptionCleanupLevel: 'light',
            saveDestination: 'collection_box'
        });

        assert.equal(started, true);
        assert.equal(sessionStorage.getItem('rpa_save_destination'), 'collection_box');
        assert.deepEqual(calls, [['start', {
            mode: 'normal',
            storeName: '0785-李俊频（工具）五公司',
            saveDestination: 'collection_box',
            descriptionCleanupLevel: 'light'
        }], ['render'], ['preflight']]);
    });
});

test('RPA queue passes description cleanup level to child edit tabs', async () => {
    await withRpaGlobals(() => {
        const messages = [];
        global.chrome = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                }
            }
        };
        const editLink = {
            innerText: '编辑',
            textContent: '编辑',
            getAttribute(name) {
                return name === 'href' ? '/web/smt/edit?id=39420316695315338' : '';
            },
            closest() {
                return null;
            }
        };
        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? [editLink] : [];
            }
        };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = { editLink: '编辑' };
        window.RpaSafety = { getProductId: () => null, shouldContinueAfterProductResult: () => true };
        window.RpaRunState = { update: () => Promise.resolve() };
        window.getRpaPauseReason = () => null;
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';

        sessionStorage.setItem('rpa_running', '1');
        sessionStorage.setItem('rpa_locked_store_name', '0785-李俊频（工具）五公司');
        sessionStorage.setItem('rpa_description_cleanup_level', 'light');
        sessionStorage.setItem('rpa_save_destination', 'collection_box');
        sessionStorage.setItem('rpa_current_run_id', 'rpa-contract-test');

        window.startRPAQueue();

        assert.equal(messages[0].action, 'open_rpa_tabs');
        assert.equal(messages[0].runId, 'rpa-contract-test');
        const url = new URL(messages[0].urls[0], 'https://www.dianxiaomi.com');
        assert.equal(url.searchParams.get('rpa_auto'), '1');
        assert.equal(url.searchParams.get('opt_mode'), 'normal');
        assert.equal(url.searchParams.get('desc_clean'), 'light');
        assert.equal(url.searchParams.get('save_dest'), 'collection_box');
        assert.equal(url.searchParams.get('rpa_run_id'), 'rpa-contract-test');
    });
});

test('RPA child page resolves the plain save button for collection-box destination', async () => {
    await withRpaGlobals(() => {
        global.location = {
            origin: 'https://www.dianxiaomi.com',
            href: 'https://www.dianxiaomi.com/web/smt/edit?id=39420316695315338&rpa_auto=1&save_dest=collection_box'
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = {
            saveToDraft: '保存并移入待发布',
            saveToCollectionBox: '保存'
        };

        assert.equal(window.getRpaSaveDestinationFromUrl(), 'collection_box');
        assert.equal(window.getRpaSaveButtonText(), '保存');
        assert.match(window.getRpaSaveButtonXPath(), /normalize-space\(\.\)/);
        assert.doesNotMatch(window.getRpaSaveButtonXPath(), /contains\(\., '保存'\)/);
    });
});

test('RPA child page keeps pending-publish save as the default destination', async () => {
    await withRpaGlobals(() => {
        global.location = {
            origin: 'https://www.dianxiaomi.com',
            href: 'https://www.dianxiaomi.com/web/smt/edit?id=39420316695315338&rpa_auto=1'
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = {
            saveToDraft: '保存并移入待发布',
            saveToCollectionBox: '保存'
        };

        assert.equal(window.getRpaSaveDestinationFromUrl(), 'pending_publish');
        assert.equal(window.getRpaSaveButtonText(), '保存并移入待发布');
        assert.match(window.getRpaSaveButtonXPath(), /contains\(\., '保存并移入待发布'\)/);
    });
});

test('RPA queue completes when only manual-review products remain in the collection box', async () => {
    await withRpaGlobals(async () => {
        const updates = [];
        const messages = [];
        global.chrome = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                }
            }
        };

        const editLink = {
            innerText: '编辑',
            textContent: '编辑',
            getAttribute(name) {
                return name === 'href' ? '/web/smt/edit?id=394203167159990748' : '';
            },
            closest() {
                return null;
            }
        };
        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? [editLink] : [];
            }
        };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = { editLink: '编辑' };
        window.RpaSafety = {
            getProductId(value) {
                const match = String(value || '').match(/[?&]id=(\d+)/);
                return match ? match[1] : '';
            },
            shouldContinueAfterProductResult: () => true
        };
        window.RpaRunState = {
            update(payload) {
                updates.push(payload);
                return Promise.resolve({ products: {} });
            }
        };
        window.refreshRPAButtonState = () => updates.push({ type: 'button_refreshed' });
        window.getRpaPauseReason = () => null;
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';

        sessionStorage.setItem('rpa_running', '1');
        sessionStorage.setItem('rpa_locked_store_name', '0785-李俊频（工具）五公司');
        sessionStorage.setItem('rpa_manual_review_product_ids', JSON.stringify(['394203167159990748']));
        sessionStorage.setItem('rpa_current_run_id', 'rpa-finishing-run');

        window.startRPAQueue();

        assert.equal(sessionStorage.getItem('rpa_running'), null);
        assert.equal(sessionStorage.getItem('rpa_current_run_id'), null);
        assert.deepEqual(messages, [{ action: 'close_all_rpa_edit_tabs', runId: 'rpa-finishing-run' }]);
        assert.equal(updates[0].type, 'status');
        assert.equal(updates[0].status, 'completed');
        assert.match(updates[0].message, /只剩待人工处理产品/);
    });
});

test('RPA queue marks successful collection-box products as processed', async () => {
    await withRpaGlobals(async () => {
        const messages = [];
        const channels = [];
        let reloads = 0;
        global.location = {
            origin: 'https://www.dianxiaomi.com',
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList/draft?pageType=0',
            reload() {
                reloads++;
            }
        };
        global.BroadcastChannel = function BroadcastChannel(name) {
            this.name = name;
            this.close = () => {};
            channels.push(this);
        };
        global.setInterval = (callback) => {
            queueMicrotask(callback);
            return 1;
        };
        global.clearInterval = () => {};
        global.chrome = {
            runtime: {
                lastError: null,
                sendMessage(message, callback) {
                    messages.push(message);
                    if (message.action === 'query_active_rpa_tabs_count' && callback) callback({ count: 0 });
                }
            }
        };

        const editLink = {
            innerText: '编辑',
            textContent: '编辑',
            getAttribute(name) {
                return name === 'href' ? '/web/smt/edit?id=394203167159990748' : '';
            },
            closest() {
                return null;
            }
        };
        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? [editLink] : [];
            }
        };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = { editLink: '编辑' };
        window.RpaSafety = {
            getProductId(value) {
                const match = String(value || '').match(/[?&]id=(\d+)/);
                return match ? match[1] : '';
            },
            shouldContinueAfterProductResult: () => true
        };
        window.RpaRunState = { update: () => Promise.resolve({ products: {} }) };
        window.getRpaPauseReason = () => null;
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';

        sessionStorage.setItem('rpa_running', '1');
        sessionStorage.setItem('rpa_locked_store_name', '0785-李俊频（工具）五公司');
        sessionStorage.setItem('rpa_save_destination', 'collection_box');
        sessionStorage.setItem('rpa_current_run_id', 'rpa-success-run');

        delete window._rpa_bc;
        window.startRPAQueue();
        channels[0].onmessage({
            data: {
                runId: 'rpa-old-run',
                status: 'success',
                productUrl: 'https://www.dianxiaomi.com/web/smt/edit?id=394203167159990748&rpa_auto=1'
            }
        });
        assert.deepEqual(JSON.parse(sessionStorage.getItem('rpa_processed_product_ids') || '[]'), []);
        channels[0].onmessage({
            data: {
                runId: 'rpa-success-run',
                status: 'success',
                productUrl: 'https://www.dianxiaomi.com/web/smt/edit?id=394203167159990748&rpa_auto=1&save_dest=collection_box'
            }
        });
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(messages[0].action, 'open_rpa_tabs');
        assert.equal(reloads, 1);
        assert.deepEqual(JSON.parse(sessionStorage.getItem('rpa_processed_product_ids') || '[]'), ['394203167159990748']);
    });
});

test('RPA runner does not reload while a child tab is still active', async () => {
    await withRpaGlobals(() => {
        let reloads = 0;
        let intervalCallback = null;
        global.location = {
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList/draft?pageType=0',
            reload() { reloads++; }
        };
        global.setInterval = (callback) => {
            intervalCallback = callback;
            return 1;
        };
        global.clearInterval = () => {};
        global.chrome = {
            runtime: {
                lastError: null,
                sendMessage(message, callback) {
                    assert.equal(message.action, 'query_active_rpa_tabs_count');
                    callback({ count: 1 });
                }
            }
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();
        sessionStorage.setItem('rpa_running', '1');
        window.waitForAllTabsToCloseAndReload();
        intervalCallback();

        assert.equal(reloads, 0);
    });
});

test('RPA runner reloads when querying child tabs loses the extension context', async () => {
    await withRpaGlobals(() => {
        let reloads = 0;
        let intervalCallback = null;
        global.location = {
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList/draft?pageType=0',
            reload() { reloads++; }
        };
        global.setInterval = (callback) => {
            intervalCallback = callback;
            return 1;
        };
        global.clearInterval = () => {};
        global.chrome = {
            runtime: {
                lastError: { message: 'Extension context invalidated' },
                sendMessage(message, callback) {
                    assert.equal(message.action, 'query_active_rpa_tabs_count');
                    callback(undefined);
                }
            }
        };
        global.document = { querySelectorAll: () => [] };

        loadFreshRpaModules();
        sessionStorage.setItem('rpa_running', '1');
        window.waitForAllTabsToCloseAndReload();
        intervalCallback();

        assert.equal(reloads, 1);
    });
});

test('RPA queue completes when only processed collection-box products remain', async () => {
    await withRpaGlobals(() => {
        const updates = [];
        const messages = [];
        global.chrome = {
            runtime: {
                sendMessage(message) {
                    messages.push(message);
                }
            }
        };

        const editLink = {
            innerText: '编辑',
            textContent: '编辑',
            getAttribute(name) {
                return name === 'href' ? '/web/smt/edit?id=394203167159990748' : '';
            },
            closest() {
                return null;
            }
        };
        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? [editLink] : [];
            }
        };

        loadFreshRpaModules();

        window.UI_TEXT_CONFIG = { editLink: '编辑' };
        window.RpaSafety = {
            getProductId(value) {
                const match = String(value || '').match(/[?&]id=(\d+)/);
                return match ? match[1] : '';
            },
            shouldContinueAfterProductResult: () => true
        };
        window.RpaRunState = {
            update(payload) {
                updates.push(payload);
                return Promise.resolve({ products: {} });
            }
        };
        window.refreshRPAButtonState = () => updates.push({ type: 'button_refreshed' });
        window.getRpaPauseReason = () => null;
        window.getRpaCurrentStoreName = () => '0785-李俊频（工具）五公司';

        sessionStorage.setItem('rpa_running', '1');
        sessionStorage.setItem('rpa_locked_store_name', '0785-李俊频（工具）五公司');
        sessionStorage.setItem('rpa_save_destination', 'collection_box');
        sessionStorage.setItem('rpa_processed_product_ids', JSON.stringify(['394203167159990748']));

        window.startRPAQueue();

        assert.equal(sessionStorage.getItem('rpa_running'), null);
        assert.deepEqual(messages, []);
        assert.equal(updates[0].type, 'status');
        assert.equal(updates[0].status, 'completed');
        assert.match(updates[0].message, /已处理产品/);
    });
});

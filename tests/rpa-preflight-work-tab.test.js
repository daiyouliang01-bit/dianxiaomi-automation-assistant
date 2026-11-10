'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function createStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        }
    };
}

global.window = global;
require('./_setup.js');
global.document = {};
global.alert = () => {};

require('../src/workflows/rpa.js');

test('starts visible image-space preflight before opening the separate work tab', async () => {
    const calls = [];
    sessionStorage.clear();
    window.location = { href: 'https://www.dianxiaomi.com/web/smt/smtProductList' };

    window.RpaPageTargeting = {
        getSelectedStoreNameFromDocument: () => '0785-李俊频（工具）五公司',
        getStoreLockDecision: ({ lockedStoreName, currentStoreName }) => ({
            allowed: true,
            reason: 'matched',
            lockedStoreName: lockedStoreName || currentStoreName,
            currentStoreName
        })
    };
    window.RpaRunState = {
        start: async () => {
            calls.push('run-state-start');
        }
    };
    window.openRpaWorkTab = () => {
        calls.push('work-tab');
    };
    window.startRpaImageSpacePreflight = async () => {
        calls.push('image-space-preflight');
    };

    const started = await window.startRpaAsDedicatedRunner(() => calls.push('render'));

    assert.equal(started, true);
    assert.deepEqual(calls, ['run-state-start', 'render', 'image-space-preflight']);
    assert.equal(sessionStorage.getItem('rpa_open_work_tab_after_preflight'), '1');
});

test('opens the deferred work tab only once after image-space preflight returns', () => {
    const calls = [];
    sessionStorage.clear();
    sessionStorage.setItem('rpa_open_work_tab_after_preflight', '1');
    window.location = { href: 'https://www.dianxiaomi.com/web/smt/smtProductList' };
    window.openRpaWorkTab = (url) => {
        calls.push(url);
    };

    assert.equal(window.openDeferredRpaWorkTabIfNeeded(), true);
    assert.deepEqual(calls, ['https://www.dianxiaomi.com/web/smt/smtProductList']);
    assert.equal(sessionStorage.getItem('rpa_open_work_tab_after_preflight'), null);

    assert.equal(window.openDeferredRpaWorkTabIfNeeded(), false);
    assert.deepEqual(calls, ['https://www.dianxiaomi.com/web/smt/smtProductList']);
});

test('collection-box resume opens deferred work tab before dispatching the RPA queue', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'main.js'), 'utf8');
    const openIndex = mainSource.indexOf('window.openDeferredRpaWorkTabIfNeeded()');
    const queueIndex = mainSource.indexOf('window.startRPAQueue()', openIndex);

    assert.notEqual(openIndex, -1);
    assert.ok(queueIndex > openIndex, 'deferred work tab must be opened before queue dispatch starts');
});

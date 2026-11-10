'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

require('./_setup.js');
require('../src/page-adapters/rpa-page-targeting.js');
require('../src/workflows/rpa.js');

function createSessionStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

test('plug RPA cleanup runs no-plug restore instead of normal variant-code optimization', async () => {
    assert.equal(typeof window.runRpaCleanupStage, 'function', 'RPA cleanup stage helper must be exposed');

    const calls = [];
    window.isPlugOptimizationMode = () => true;
    window.runPlugNoPlugWorkflow = async (updateStatus) => {
        calls.push('plug-no-plug');
        updateStatus('插头选择完成');
    };
    window.silentRemoveForbiddenWords = () => calls.push('forbidden-cleanup');
    window.cleanupEmptyAttributes = async () => calls.push('empty-attrs');
    window.cleanupInvalidAttributes = async () => calls.push('invalid-attrs');
    window.cleanupCustomAttributesByLevel = async () => calls.push('custom-attrs');
    window.violentPurifyDesc = () => calls.push('violent-desc');
    window.silentOptimizeSingleProductVariants = () => calls.push('variant-code-optimization');

    const stageResults = { cleanup: 'skipped' };
    await window.runRpaCleanupStage(stageResults, (message) => calls.push(`log:${message}`));

    assert.equal(stageResults.cleanup, 'success');
    assert.ok(calls.includes('plug-no-plug'));
    assert.ok(calls.includes('custom-attrs'));
    assert.equal(calls.includes('variant-code-optimization'), false);
    delete window.isPlugOptimizationMode;
});

test('plug RPA light cleanup uses shared description strategy instead of deep violent cleanup', async () => {
    const calls = [];
    window.isPlugOptimizationMode = () => true;
    window.getRpaDescriptionCleanupLevelFromUrl = () => 'light';
    window.runPlugNoPlugWorkflow = async (updateStatus) => {
        calls.push('plug-no-plug');
        updateStatus('插头选择完成');
    };
    window.silentRemoveForbiddenWords = () => calls.push('forbidden-cleanup');
    window.cleanupEmptyAttributes = async () => calls.push('empty-attrs');
    window.cleanupInvalidAttributes = async () => calls.push('invalid-attrs');
    window.cleanupCustomAttributesByLevel = async () => calls.push('custom-attrs');
    window.runDescriptionCleanup = (options) => calls.push(`desc:${options.level}:${options.mode}:${options.surface}`);
    window.violentPurifyDesc = () => calls.push('violent-desc');

    const stageResults = { cleanup: 'skipped' };
    await window.runRpaCleanupStage(stageResults, (message) => calls.push(`log:${message}`));

    assert.equal(stageResults.cleanup, 'success');
    assert.ok(calls.includes('plug-no-plug'));
    assert.ok(calls.includes('desc:light:plug:rpa'));
    assert.ok(calls.includes('custom-attrs'));
    assert.equal(calls.includes('violent-desc'), false);
    delete window.isPlugOptimizationMode;
});

test('plug RPA queue passes plug mode to child edit tabs', () => {
    assert.equal(typeof window.startRPAQueue, 'function', 'RPA queue helper must be exposed');

    const originalSessionStorage = global.sessionStorage;
    const originalLocation = global.location;
    const originalDocument = global.document;
    const originalChrome = global.chrome;
    const originalBroadcastChannel = global.BroadcastChannel;
    const originalSetInterval = global.setInterval;
    const originalSetTimeout = global.setTimeout;
    const originalUITextConfig = window.UI_TEXT_CONFIG;
    const originalEnsureLock = window.ensureRpaStoreLockBeforeQueue;
    const originalIsPlug = window.isPlugOptimizationMode;
    const originalRpaSafety = window.RpaSafety;
    const originalRpaRunState = window.RpaRunState;
    const originalGetManualReviewIds = window.getRpaManualReviewProductIds;
    const originalGetRpaPauseReason = window.getRpaPauseReason;

    const sentMessages = [];
    const editLink = {
        innerText: '编辑',
        textContent: '编辑',
        getAttribute(name) {
            return name === 'href' ? '/web/smt/edit?id=39420316729597988' : null;
        },
        closest() {
            return null;
        }
    };

    global.sessionStorage = createSessionStorage();
    global.location = {
        origin: 'https://www.dianxiaomi.com',
        href: 'https://www.dianxiaomi.com/web/smt/smtProductList'
    };
    global.document = {
        querySelectorAll(selector) {
            return selector === 'a' ? [editLink] : [];
        }
    };
    global.chrome = {
        runtime: {
            sendMessage(message) {
                sentMessages.push(message);
            }
        }
    };
    global.BroadcastChannel = function BroadcastChannel() {
        this.close = () => {};
    };
    global.setInterval = () => 0;
    global.setTimeout = () => 0;

    window.UI_TEXT_CONFIG = { editLink: '编辑' };
    window.ensureRpaStoreLockBeforeQueue = () => true;
    window.isPlugOptimizationMode = () => true;
    window.RpaSafety = {
        getProductId: () => '',
        shouldContinueAfterProductResult: () => true
    };
    window.RpaRunState = { update: () => Promise.resolve() };
    window.getRpaManualReviewProductIds = () => new Set();
    window.getRpaPauseReason = () => null;
    localStorage.clear();
    sessionStorage.setItem('rpa_running', '1');

    try {
        window.startRPAQueue();

        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].action, 'open_rpa_tabs');
        assert.equal(sentMessages[0].urls.length, 1);

        const url = new URL(sentMessages[0].urls[0]);
        assert.equal(url.searchParams.get('rpa_auto'), '1');
        assert.equal(url.searchParams.get('opt_mode'), 'plug');
    } finally {
        global.sessionStorage = originalSessionStorage;
        global.location = originalLocation;
        global.document = originalDocument;
        global.chrome = originalChrome;
        global.BroadcastChannel = originalBroadcastChannel;
        global.setInterval = originalSetInterval;
        global.setTimeout = originalSetTimeout;
        window.UI_TEXT_CONFIG = originalUITextConfig;
        window.ensureRpaStoreLockBeforeQueue = originalEnsureLock;
        window.isPlugOptimizationMode = originalIsPlug;
        window.RpaSafety = originalRpaSafety;
        window.RpaRunState = originalRpaRunState;
        window.getRpaManualReviewProductIds = originalGetManualReviewIds;
        window.getRpaPauseReason = originalGetRpaPauseReason;
        delete window._rpa_bc;
        delete window._rpa_finished_count;
        delete window._rpa_success_count;
        delete window._rpa_failed_count;
        delete window._rpa_needs_review_count;
    }
});

test('RPA collection selector exposes plug mode', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'main.js'), 'utf8');
    const rpaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'workflows', 'rpa.js'), 'utf8');

    assert.match(mainSource, /RPA_OPTIMIZATION_MODE_OPTIONS[\s\S]*value:\s*'plug'/);
    assert.match(mainSource, /MANUAL_OPTIMIZATION_MODE_OPTIONS[\s\S]*value:\s*'plug'[\s\S]*label:\s*'[^']*插头优化/);
    assert.match(rpaSource, /ensureOptimizationModeSelector\([\s\S]*?['"]rpa-optimization-mode-selector['"][\s\S]*?\{[\s\S]*?surface:\s*['"]rpa['"][\s\S]*?\}/);
});

test('RPA surface keeps stored plug mode during load and storage refreshes', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'main.js'), 'utf8');
    const loadDataSource = mainSource.match(/window\.loadData = function\(\) \{[\s\S]*?window\.normalizeOptimizationMode = function/)[0];
    const storageChangeSource = mainSource.match(/chrome\.storage\.onChanged\.addListener\(\(changes, namespace\) => \{[\s\S]*?\/\/ --- 启动入口 ---/)[0];

    assert.match(loadDataSource, /rpaOptimizationMode/);
    assert.match(loadDataSource, /normalizeRpaOptimizationMode\(res\.rpaOptimizationMode \|\| res\.optimizationMode\)/);
    assert.match(storageChangeSource, /changes\.rpaOptimizationMode[\s\S]*normalizeRpaOptimizationMode\(changes\.rpaOptimizationMode\.newValue\)/);
});

test('RPA and manual selectors persist to separate storage keys to avoid cross-page jumps', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'main.js'), 'utf8');
    const setManualSource = mainSource.match(/window\.setOptimizationMode = function\(mode\) \{[\s\S]*?\n\};/)[0];
    const setRpaSource = mainSource.match(/window\.setRpaOptimizationMode = function\(mode\) \{[\s\S]*?\n\};/)[0];
    const storageChangeSource = mainSource.match(/chrome\.storage\.onChanged\.addListener\(\(changes, namespace\) => \{[\s\S]*?\/\/ --- 启动入口 ---/)[0];

    assert.match(setManualSource, /chrome\.storage\.local\.set\(\{\s*manualOptimizationMode:\s*window\.optimizationMode\s*\}\)/);
    assert.match(setRpaSource, /chrome\.storage\.local\.set\(\{\s*rpaOptimizationMode:\s*window\.optimizationMode\s*\}\)/);
    assert.match(storageChangeSource, /changes\.manualOptimizationMode/);
    assert.match(storageChangeSource, /changes\.rpaOptimizationMode/);
    assert.doesNotMatch(storageChangeSource, /changes\.optimizationMode/);
});

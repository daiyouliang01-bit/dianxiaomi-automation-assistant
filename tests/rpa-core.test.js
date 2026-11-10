'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('./_setup.js');
require('../src/workflows/rpa-image-space.js');
require('../src/workflows/rpa.js');

function createSessionStorage() {
    const store = new Map();
    return {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
        clear() { store.clear(); }
    };
}

test('resets runner state only on a non-edit page that was not programmatically reloaded', () => {
    assert.equal(window.shouldResetRpaRunnerState({ isProgrammaticReload: false, isEditPage: false }), true);
    assert.equal(window.shouldResetRpaRunnerState({ isProgrammaticReload: true, isEditPage: false }), false);
    assert.equal(window.shouldResetRpaRunnerState({ isProgrammaticReload: false, isEditPage: true }), false);
});

test('getRpaManualReviewProductIds returns empty set by default', () => {
    sessionStorage.clear();
    const result = window.getRpaManualReviewProductIds();
    assert.ok(result instanceof Set);
    assert.equal(result.size, 0);
});

test('markRpaProductForManualReview stores product id from URL', () => {
    sessionStorage.clear();
    window.RpaSafety = { getProductId: (url) => { const m = url.match(/id=(\d+)/); return m ? m[1] : ''; } };
    const id = window.markRpaProductForManualReview('https://x.com/edit?id=39420316729597988');
    assert.equal(id, '39420316729597988');
    const ids = window.getRpaManualReviewProductIds();
    assert.ok(ids.has('39420316729597988'));
});

test('markRpaProductForManualReview deduplicates product ids', () => {
    sessionStorage.clear();
    window.RpaSafety = { getProductId: (url) => { const m = url.match(/id=(\d+)/); return m ? m[1] : ''; } };
    window.markRpaProductForManualReview('https://x.com/edit?id=39420316729597988');
    window.markRpaProductForManualReview('https://x.com/edit?id=39420316729597988');
    const ids = window.getRpaManualReviewProductIds();
    assert.equal(ids.size, 1);
});

test('getRpaProcessedProductIds returns empty set by default', () => {
    sessionStorage.clear();
    const result = window.getRpaProcessedProductIds();
    assert.ok(result instanceof Set);
    assert.equal(result.size, 0);
});

test('markRpaProductAsProcessed stores product id', () => {
    sessionStorage.clear();
    window.RpaSafety = { getProductId: (url) => { const m = url.match(/id=(\d+)/); return m ? m[1] : ''; } };
    const id = window.markRpaProductAsProcessed('https://x.com/edit?id=39420316729597988');
    assert.equal(id, '39420316729597988');
    const ids = window.getRpaProcessedProductIds();
    assert.ok(ids.has('39420316729597988'));
});

test('clearRpaProcessedProductIds removes processed list', () => {
    sessionStorage.clear();
    window.RpaSafety = { getProductId: (url) => { const m = url.match(/id=(\d+)/); return m ? m[1] : ''; } };
    window.markRpaProductAsProcessed('https://x.com/edit?id=39420316729597988');
    window.clearRpaProcessedProductIds();
    assert.equal(window.getRpaProcessedProductIds().size, 0);
});

test('getRpaProductIdFromEditLink extracts id from href via RpaSafety', () => {
    window.RpaSafety = { getProductId: (str) => { const m = str.match(/id=(\d+)/); return m ? m[1] : ''; } };
    const link = {
        getAttribute(name) { return name === 'href' ? '/web/smt/edit?id=39420316729597988' : ''; },
        closest() { return null; }
    };
    assert.equal(window.getRpaProductIdFromEditLink(link), '39420316729597988');
});

test('getRpaProductIdFromEditLink returns empty for null link', () => {
    assert.equal(window.getRpaProductIdFromEditLink(null), '');
});

test('resolveProductEditUrlFromLink returns empty for null link', () => {
    assert.equal(window.resolveProductEditUrlFromLink(null), '');
});

test('resolveProductEditUrlFromLink returns empty for link without href', () => {
    const link = {
        getAttribute() { return ''; },
        closest() { return null; }
    };
    const result = window.resolveProductEditUrlFromLink(link);
    assert.equal(result, '');
});

test('isPendingPublishListPage returns true for offline URL', () => {
    window.UI_TEXT_CONFIG = { pendingPublishMarker: '待发布' };
    const result = window.isPendingPublishListPage({ href: 'https://www.dianxiaomi.com/web/smt/smtProductList?offline=1', pageText: '待发布 快捷操作 批量操作' });
    assert.equal(result, true);
});

test('isPendingPublishListPage returns false for non-offline URL', () => {
    window.UI_TEXT_CONFIG = { pendingPublishMarker: '待发布' };
    const result = window.isPendingPublishListPage({ href: 'https://www.dianxiaomi.com/web/smt/smtProductList', pageText: '待发布' });
    assert.equal(result, false);
});

test('getRpaCurrentStoreName delegates to RpaPageTargeting', () => {
    window.RpaPageTargeting = {
        getSelectedStoreNameFromDocument(doc) { return doc._testStore || '0785-李俊频（工具）五公司'; }
    };
    const name = window.getRpaCurrentStoreName();
    assert.ok(name.includes('0785'));
});

test('clearRpaStoreLock removes locked store from sessionStorage', () => {
    sessionStorage.clear();
    sessionStorage.setItem('rpa_locked_store_name', 'test-store');
    window.clearRpaStoreLock();
    assert.equal(sessionStorage.getItem('rpa_locked_store_name'), null);
});

test('clearRpaCurrentRunId removes the active run identity', () => {
    sessionStorage.setItem('rpa_current_run_id', 'rpa-old');
    window.clearRpaCurrentRunId();
    assert.equal(sessionStorage.getItem('rpa_current_run_id'), null);
});

test('closeRpaTabsForCurrentRun closes only the active run before state is cleared', () => {
    sessionStorage.setItem('rpa_current_run_id', 'run-stop-test');
    let sent = null;
    global.chrome = { runtime: { sendMessage(message) { sent = message; } } };
    assert.equal(window.closeRpaTabsForCurrentRun(), true);
    assert.deepEqual(sent, { action: 'close_all_rpa_edit_tabs', runId: 'run-stop-test' });
});

test('normalizeRpaDescriptionCleanupLevel returns deep for invalid input', () => {
    assert.equal(window.normalizeRpaDescriptionCleanupLevel('invalid'), 'deep');
    assert.equal(window.normalizeRpaDescriptionCleanupLevel(''), 'deep');
    assert.equal(window.normalizeRpaDescriptionCleanupLevel(null), 'deep');
});

test('normalizeRpaDescriptionCleanupLevel accepts light and deep', () => {
    assert.equal(window.normalizeRpaDescriptionCleanupLevel('light'), 'light');
    assert.equal(window.normalizeRpaDescriptionCleanupLevel('deep'), 'deep');
});

test('setRpaDescriptionCleanupLevel and getRpaDescriptionCleanupLevel roundtrip', () => {
    sessionStorage.clear();
    window.setRpaDescriptionCleanupLevel('light');
    assert.equal(window.getRpaDescriptionCleanupLevel(), 'light');
});

test('clearRpaDescriptionCleanupLevel removes stored level', () => {
    sessionStorage.clear();
    window.setRpaDescriptionCleanupLevel('light');
    window.clearRpaDescriptionCleanupLevel();
    assert.equal(window.getRpaDescriptionCleanupLevel(), 'deep');
});

test('normalizeRpaSaveDestination returns pending_publish for invalid input', () => {
    assert.equal(window.normalizeRpaSaveDestination('invalid'), 'pending_publish');
    assert.equal(window.normalizeRpaSaveDestination(''), 'pending_publish');
    assert.equal(window.normalizeRpaSaveDestination(null), 'pending_publish');
});

test('normalizeRpaSaveDestination accepts valid destinations', () => {
    assert.equal(window.normalizeRpaSaveDestination('pending_publish'), 'pending_publish');
    assert.equal(window.normalizeRpaSaveDestination('collection_box'), 'collection_box');
});

test('appendRpaQueryParam adds param to URL', () => {
    const url = window.appendRpaQueryParam('https://x.com/edit?id=1', 'opt_mode', 'plug');
    assert.ok(url.includes('opt_mode=plug'));
    assert.ok(url.includes('id=1'));
});

test('appendRpaQueryParam replaces existing param', () => {
    const url = window.appendRpaQueryParam('https://x.com/edit?id=1&opt_mode=normal', 'opt_mode', 'plug');
    assert.equal(url.match(/opt_mode=plug/g).length, 1);
    assert.equal(url.match(/opt_mode=normal/g), null);
});

test('getRpaWorkTabUrl strips RPA URL params', () => {
    global.location = { origin: 'https://www.dianxiaomi.com' };
    const cleaned = window.getRpaWorkTabUrl('https://x.com/list?rpa_auto=1&opt_mode=plug&rpa_runner=1&keep=1');
    assert.equal(cleaned, 'https://x.com/list?keep=1');
});

test('getRpaOptimizationMode returns plug when isPlugOptimizationMode is true', () => {
    window.isPlugOptimizationMode = () => true;
    assert.equal(window.getRpaOptimizationMode(), 'plug');
});

test('getRpaOptimizationMode returns normal when isPlugOptimizationMode is false', () => {
    window.isPlugOptimizationMode = () => false;
    assert.equal(window.getRpaOptimizationMode(), 'normal');
});

test('getRpaOptimizationMode returns normal when isPlugOptimizationMode is undefined', () => {
    delete window.isPlugOptimizationMode;
    assert.equal(window.getRpaOptimizationMode(), 'normal');
});

test('getRpaPlugType returns stored value', () => {
    sessionStorage.clear();
    sessionStorage.setItem('rpa_plug_type', 'eu_plug');
    assert.equal(window.getRpaPlugType(), 'eu_plug');
});

test('setRpaPlugType and clearRpaPlugType roundtrip', () => {
    sessionStorage.clear();
    window.setRpaPlugType('no_plug');
    assert.equal(window.getRpaPlugType(), 'no_plug');
    window.clearRpaPlugType();
    assert.equal(window.getRpaPlugType(), '');
});

test('getRpaSaveButtonText returns saveToDraft for pending_publish', () => {
    window.UI_TEXT_CONFIG = { saveToDraft: '保存并移入待发布', saveToCollectionBox: '保存' };
    assert.equal(window.getRpaSaveButtonText('pending_publish'), '保存并移入待发布');
});

test('getRpaSaveButtonText returns saveToCollectionBox for collection_box', () => {
    window.UI_TEXT_CONFIG = { saveToDraft: '保存并移入待发布', saveToCollectionBox: '保存' };
    assert.equal(window.getRpaSaveButtonText('collection_box'), '保存');
});

test('getRpaSaveButtonXPath returns pending-publish xpath', () => {
    window.UI_TEXT_CONFIG = { saveToDraft: '保存并移入待发布', saveToCollectionBox: '保存' };
    const xpath = window.getRpaSaveButtonXPath('pending_publish');
    assert.ok(xpath.includes('保存并移入待发布'));
});

test('getRpaSaveButtonXPath returns collection-box xpath', () => {
    window.UI_TEXT_CONFIG = { saveToDraft: '保存并移入待发布', saveToCollectionBox: '保存' };
    const xpath = window.getRpaSaveButtonXPath('collection_box');
    assert.ok(xpath.includes('保存'));
});

test('getRpaActiveUrls returns empty array by default', () => {
    sessionStorage.clear();
    assert.deepEqual(window.getRpaActiveUrls(), []);
});

test('getRpaActiveUrls parses stored JSON', () => {
    sessionStorage.clear();
    sessionStorage.setItem('rpa_active_urls', JSON.stringify(['url1', 'url2']));
    assert.deepEqual(window.getRpaActiveUrls(), ['url1', 'url2']);
});

test('isRpaButtonBusy returns false for non-disabled buttons', () => {
    const btn = { isConnected: true, disabled: false, className: 'btn', getAttribute: () => null };
    assert.equal(window.isRpaButtonBusy(btn), false);
});

test('isRpaButtonBusy detects disabled button', () => {
    const btn = { isConnected: true, disabled: true, className: 'btn', getAttribute: () => null };
    assert.equal(window.isRpaButtonBusy(btn), true);
});

test('isRpaButtonBusy detects loading class', () => {
    const btn = { isConnected: true, disabled: false, className: 'btn-loading', getAttribute: () => null };
    assert.equal(window.isRpaButtonBusy(btn), true);
});

test('isRpaButtonBusy detects aria-busy', () => {
    const btn = { isConnected: true, disabled: false, className: 'btn', getAttribute: (name) => name === 'aria-busy' ? 'true' : null };
    assert.equal(window.isRpaButtonBusy(btn), true);
});

test('getRpaVisibleFeedbackText collects visible text', () => {
    global.document = {
        querySelectorAll() { return []; },
        evaluate() { return { snapshotLength: 0 }; }
    };
    const text = window.getRpaVisibleFeedbackText();
    assert.equal(typeof text, 'string');
});

test('getRpaSaveDiagnostics returns object with url', () => {
    global.location = { href: 'https://x.com/edit?id=1' };
    const diag = window.getRpaSaveDiagnostics(null);
    assert.equal(diag.url, 'https://x.com/edit?id=1');
    assert.equal(typeof diag.feedback, 'string');
});

test('getRpaSaveGateDecision delegates structured stage results to the safety policy', () => {
    const originalSafety = window.RpaSafety;
    let received = null;
    window.RpaSafety = {
        canSaveAfterStages(stages) {
            received = stages;
            return { allowed: false, status: 'needs_review', reasons: ['清理优化失败'] };
        }
    };
    try {
        const decision = window.getRpaSaveGateDecision({
            translate: 'success',
            imageResize: 'success',
            cleanup: 'failed'
        }, 'normal');
        assert.deepEqual(received, {
            mode: 'normal',
            translate: 'success',
            imageResize: 'success',
            cleanup: 'failed'
        });
        assert.equal(decision.allowed, false);
    } finally {
        window.RpaSafety = originalSafety;
    }
});

test('blocked save gate reports needs_review and closes without entering save handling', () => {
    const originalBroadcastChannel = global.BroadcastChannel;
    const originalClose = window.closeRpaTabWithFallback;
    const messages = [];
    let closed = false;
    global.BroadcastChannel = class {
        postMessage(message) { messages.push(message); }
        close() {}
    };
    window.closeRpaTabWithFallback = () => { closed = true; };
    sessionStorage.setItem('rpa_current_run_id', 'run-gate-block');
    const stages = { translate: 'failed', imageResize: 'success', cleanup: 'success', save: 'skipped' };
    try {
        assert.equal(window.handleBlockedRpaSaveGate({ allowed: false, reasons: ['翻译失败'] }, stages), true);
        assert.equal(stages.save, 'blocked');
        assert.equal(closed, true);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].runId, 'run-gate-block');
        assert.equal(messages[0].status, 'needs_review');
        assert.deepEqual(messages[0].diagnostics.reasons, ['翻译失败']);
    } finally {
        global.BroadcastChannel = originalBroadcastChannel;
        window.closeRpaTabWithFallback = originalClose;
    }
});

test('requestRpaSpaceRecovery stores space_full reason in localStorage', () => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('rpa_current_run_id', 'rpa-space-run');
    window.requestRpaSpaceRecovery('图片空间不足');
    assert.deepEqual(JSON.parse(localStorage.getItem('dianxiaomi_rpa_pause_reason')), {
        reason: 'space_full',
        runId: 'rpa-space-run'
    });
    assert.equal(window.getRpaPauseReason(), 'space_full');
    sessionStorage.setItem('rpa_current_run_id', 'rpa-other-run');
    assert.equal(window.getRpaPauseReason(), '');
});

test('getRpaPauseReason reads pause reason from localStorage', () => {
    localStorage.clear();
    sessionStorage.clear();
    assert.equal(window.getRpaPauseReason(), '');
    localStorage.setItem('dianxiaomi_rpa_pause_reason', 'space_full');
    assert.equal(window.getRpaPauseReason(), 'space_full');
});

test('Chinese text detection recognises PC description content without flagging English', () => {
    assert.equal(window.containsChineseText('Product 尺寸说明 20 mm'), true);
    assert.equal(window.containsChineseText('Product Size 20 mm'), false);
    assert.equal(window.containsChineseText(''), false);
});

test('PC description text reader returns visible editor text and tolerates missing or broken editors', () => {
    const originalGetter = window.getPCEditorContainer;
    try {
        window.getPCEditorContainer = () => ({ innerText: '  Product 产品说明  ' });
        assert.equal(window.getRpaPcDescriptionText(), 'Product 产品说明');
        window.getPCEditorContainer = () => null;
        assert.equal(window.getRpaPcDescriptionText(), '');
        window.getPCEditorContainer = () => { throw new Error('cross-frame access denied'); };
        assert.equal(window.getRpaPcDescriptionText(), '');
    } finally {
        window.getPCEditorContainer = originalGetter;
    }
});

test('single Chinese-to-English click uses the existing translation control sequence', async () => {
    const originalDocument = global.document;
    const originalWaitForXPath = window.waitForXPath;
    const originalUITextConfig = window.UI_TEXT_CONFIG;
    const originalXPathResult = global.XPathResult;
    const originalMouseEvent = global.MouseEvent;
    const events = [];
    const translateButton = {
        dispatchEvent(event) { events.push(event.type); },
        click() { events.push('translate-button-click'); }
    };
    const translationLabel = {
        closest(selector) {
            assert.equal(selector, 'button, .el-dropdown');
            return translateButton;
        }
    };
    global.document = {
        evaluate() {
            return { snapshotLength: 1, snapshotItem: () => translationLabel };
        }
    };
    window.UI_TEXT_CONFIG = {
        oneClickTranslate: '一键翻译',
        translateChToEn: ['中文', '英语']
    };
    global.XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 };
    global.MouseEvent = class { constructor(type) { this.type = type; } };
    window.waitForXPath = async () => ({ click() { events.push('chinese-to-english-click'); } });
    try {
        assert.equal(await window.clickRpaChineseToEnglish(), true);
        assert.deepEqual(events, ['mouseenter', 'translate-button-click', 'chinese-to-english-click']);
    } finally {
        global.document = originalDocument;
        window.waitForXPath = originalWaitForXPath;
        window.UI_TEXT_CONFIG = originalUITextConfig;
        global.XPathResult = originalXPathResult;
        global.MouseEvent = originalMouseEvent;
    }
});

test('translation retry skips English and empty PC descriptions', async () => {
    const originalReader = window.getRpaPcDescriptionText;
    const originalClick = window.clickRpaChineseToEnglish;
    let clicks = 0;
    const waits = [];
    window.clickRpaChineseToEnglish = async () => { clicks++; return true; };
    try {
        window.getRpaPcDescriptionText = () => 'Product Size 20 mm';
        assert.deepEqual(await window.retryRpaTranslationIfNeeded({ waitImpl: async (ms) => waits.push(ms) }), {
            retried: false,
            reason: 'already_english'
        });
        window.getRpaPcDescriptionText = () => '';
        assert.deepEqual(await window.retryRpaTranslationIfNeeded({ waitImpl: async (ms) => waits.push(ms) }), {
            retried: false,
            reason: 'empty_description'
        });
        assert.equal(clicks, 0);
        assert.deepEqual(waits, []);
    } finally {
        window.getRpaPcDescriptionText = originalReader;
        window.clickRpaChineseToEnglish = originalClick;
    }
});

test('translation retry clicks once for Chinese PC description and waits exactly 2000ms', async () => {
    const originalReader = window.getRpaPcDescriptionText;
    const originalClick = window.clickRpaChineseToEnglish;
    let clicks = 0;
    const waits = [];
    window.getRpaPcDescriptionText = () => 'Product 产品尺寸 20 mm';
    window.clickRpaChineseToEnglish = async () => { clicks++; return true; };
    try {
        assert.deepEqual(await window.retryRpaTranslationIfNeeded({ waitImpl: async (ms) => waits.push(ms) }), {
            retried: true,
            reason: 'chinese_detected'
        });
        assert.equal(clicks, 1);
        assert.deepEqual(waits, [2000]);
    } finally {
        window.getRpaPcDescriptionText = originalReader;
        window.clickRpaChineseToEnglish = originalClick;
    }
});

test('translation retry failure is non-blocking and does not wait', async () => {
    const originalReader = window.getRpaPcDescriptionText;
    const originalClick = window.clickRpaChineseToEnglish;
    const logs = [];
    const waits = [];
    window.getRpaPcDescriptionText = () => '仍有中文';
    window.clickRpaChineseToEnglish = async () => { throw new Error('translation menu missing'); };
    try {
        assert.deepEqual(await window.retryRpaTranslationIfNeeded({
            waitImpl: async (ms) => waits.push(ms),
            log: (message) => logs.push(message)
        }), { retried: false, reason: 'retry_failed' });
        assert.deepEqual(waits, []);
        assert.equal(logs.length, 1);
        assert.match(logs[0], /translation menu missing/);
    } finally {
        window.getRpaPcDescriptionText = originalReader;
        window.clickRpaChineseToEnglish = originalClick;
    }
});

test('first translation keeps the original wait before checking PC description and second wait is 2000ms', async () => {
    const originalClick = window.clickRpaChineseToEnglish;
    const originalReader = window.getRpaPcDescriptionText;
    const events = [];
    let clickCount = 0;
    window.clickRpaChineseToEnglish = async () => {
        clickCount++;
        events.push(`click-${clickCount}`);
        return true;
    };
    window.getRpaPcDescriptionText = () => {
        events.push('read-pc-description');
        return '仍有中文';
    };
    const stageResults = { translate: 'skipped' };
    try {
        await window.runRpaTranslationStage(stageResults, () => {}, {
            waitImpl: async (milliseconds) => events.push(`wait-${milliseconds}`)
        });
        assert.equal(stageResults.translate, 'success');
        assert.deepEqual(events, [
            'click-1',
            `wait-${window.RPA_TRANSLATE_WAIT_MS}`,
            'read-pc-description',
            'click-2',
            'wait-2000'
        ]);
    } finally {
        window.clickRpaChineseToEnglish = originalClick;
        window.getRpaPcDescriptionText = originalReader;
    }
});

test('first translation without a control stays skipped and does not inspect PC description', async () => {
    const originalClick = window.clickRpaChineseToEnglish;
    const originalReader = window.getRpaPcDescriptionText;
    let reads = 0;
    window.clickRpaChineseToEnglish = async () => false;
    window.getRpaPcDescriptionText = () => { reads++; return '中文'; };
    const stageResults = { translate: 'unconfirmed' };
    try {
        await window.runRpaTranslationStage(stageResults, () => {}, { waitImpl: async () => {} });
        assert.equal(stageResults.translate, 'skipped');
        assert.equal(reads, 0);
    } finally {
        window.clickRpaChineseToEnglish = originalClick;
        window.getRpaPcDescriptionText = originalReader;
    }
});

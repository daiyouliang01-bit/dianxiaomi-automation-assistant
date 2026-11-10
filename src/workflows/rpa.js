// ============================================
// rpa.js — RPA 流水线核心逻辑
// 所有函数挂载到 window 上，供其他模块直接调用
// ============================================

// ==============================================
// === 🚢 全屏 RPA 流水线专属代码区 ===
// ==============================================

const RPA_MANUAL_REVIEW_IDS_KEY = 'rpa_manual_review_product_ids';
const RPA_PROCESSED_IDS_KEY = 'rpa_processed_product_ids';
const RPA_LOCKED_STORE_NAME_KEY = 'rpa_locked_store_name';
const RPA_LOCKED_SHOP_ID_KEY = 'rpa_locked_shop_id';
const RPA_DEFERRED_WORK_TAB_KEY = 'rpa_open_work_tab_after_preflight';
const RPA_DESCRIPTION_CLEANUP_LEVEL_KEY = 'rpa_description_cleanup_level';
const RPA_SAVE_DESTINATION_KEY = 'rpa_save_destination';
const RPA_SAVE_SUCCESS_CONFIRMATION_KEY = 'rpa_save_success_confirmation';
const RPA_PLUG_TYPE_KEY = 'rpa_plug_type';
const RPA_CURRENT_RUN_ID_KEY = 'rpa_current_run_id';
const RPA_SAVE_DESTINATIONS = {
    PENDING_PUBLISH: 'pending_publish',
    COLLECTION_BOX: 'collection_box'
};

window.getRpaCurrentRunId = function(rawUrl = ((window.location && window.location.href) || '')) {
    try {
        const fromUrl = new URL(rawUrl, window.location && window.location.origin || 'https://www.dianxiaomi.com')
            .searchParams.get('rpa_run_id');
        if (fromUrl) return fromUrl;
    } catch (_) {}
    try {
        return sessionStorage.getItem(RPA_CURRENT_RUN_ID_KEY) || '';
    } catch (_) {
        return '';
    }
};

window.shouldResetRpaRunnerState = function({ isProgrammaticReload, isEditPage } = {}) {
    return !isProgrammaticReload && !isEditPage;
};

window.clearRpaCurrentRunId = function() {
    try { sessionStorage.removeItem(RPA_CURRENT_RUN_ID_KEY); } catch (_) {}
};
window.closeRpaTabsForCurrentRun = function() {
    const runId = window.getRpaCurrentRunId();
    if (!runId || !window.chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') return false;
    chrome.runtime.sendMessage({ action: 'close_all_rpa_edit_tabs', runId });
    return true;
};
window.RPA_CHILD_RESULT_TIMEOUT_MS = 120000;
window.RPA_SAVE_OUTCOME_TIMEOUT_MS = 35000;
window.RPA_SAVE_OUTCOME_RETRY_AFTER_MS = 12000;
window.RPA_SAVE_OUTCOME_POLL_MS = 350;
window.RPA_WAIT_ELEMENT_TIMEOUT_MS = 30000;
window.RPA_WAIT_ELEMENT_INTERVAL_MS = 500;
window.RPA_WAIT_XPATH_TIMEOUT_MS = 5000;
window.RPA_POST_ACTION_DELAY_MS = 800;
window.RPA_TRANSLATE_WAIT_MS = 4000;
window.RPA_TRANSLATE_RETRY_WAIT_MS = 2000;
window.RPA_PRE_TRANSLATE_DELAY_MS = 800;

window.containsChineseText = function(text) {
    return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(text || ''));
};

window.getRpaPcDescriptionText = function() {
    try {
        const container = typeof window.getPCEditorContainer === 'function'
            ? window.getPCEditorContainer()
            : null;
        return container ? String(container.innerText || container.textContent || '').trim() : '';
    } catch (_) {
        return '';
    }
};

window.clickRpaChineseToEnglish = async function() {
    const transBtnSnap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.oneClickTranslate}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    if (transBtnSnap.snapshotLength === 0) return false;
    const tBtn = transBtnSnap.snapshotItem(0).closest('button, .el-dropdown');
    if (!tBtn) return false;
    tBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    tBtn.click();
    const chEnItem = await window.waitForXPath(`//li[contains(., '${window.UI_TEXT_CONFIG.translateChToEn[0]}') and contains(., '${window.UI_TEXT_CONFIG.translateChToEn[1]}')]`, { timeout: window.RPA_WAIT_XPATH_TIMEOUT_MS });
    let clicked = false;
    if (chEnItem) {
        chEnItem.click();
        clicked = true;
    }
    if (!clicked) tBtn.click();
    return true;
};

window.retryRpaTranslationIfNeeded = async function(options = {}) {
    const text = window.getRpaPcDescriptionText();
    if (!text) return { retried: false, reason: 'empty_description' };
    if (!window.containsChineseText(text)) return { retried: false, reason: 'already_english' };

    const waitImpl = typeof options.waitImpl === 'function'
        ? options.waitImpl
        : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const log = typeof options.log === 'function' ? options.log : (message) => console.warn(message);
    try {
        const clicked = await window.clickRpaChineseToEnglish();
        if (!clicked) return { retried: false, reason: 'translation_control_missing' };
        await waitImpl(window.RPA_TRANSLATE_RETRY_WAIT_MS);
        return { retried: true, reason: 'chinese_detected' };
    } catch (error) {
        log(`第二次中译英未完成，继续后续流程：${error.message}`);
        return { retried: false, reason: 'retry_failed' };
    }
};

window.runRpaTranslationStage = async function(stageResults, log = () => {}, options = {}) {
    const waitImpl = typeof options.waitImpl === 'function'
        ? options.waitImpl
        : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const clicked = await window.clickRpaChineseToEnglish();
    if (!clicked) {
        stageResults.translate = 'skipped';
        return { performed: false, retry: { retried: false, reason: 'first_translation_control_missing' } };
    }

    log("已派生系统级机翻，等待翻译完成...");
    await waitImpl(window.RPA_TRANSLATE_WAIT_MS);
    const retry = await window.retryRpaTranslationIfNeeded({
        waitImpl,
        log: (message) => console.warn('[RPA] ' + message)
    });
    if (retry.retried) log("PC 描述仍含中文，已补充执行一次中译英。");
    stageResults.translate = 'success';
    return { performed: true, retry };
};

window.getRpaManualReviewProductIds = function() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(RPA_MANUAL_REVIEW_IDS_KEY) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (_) {
        return new Set();
    }
};

window.markRpaProductForManualReview = function(productUrl) {
    const productId = window.RpaSafety.getProductId(productUrl);
    if (!productId) return '';
    const ids = window.getRpaManualReviewProductIds();
    ids.add(productId);
    sessionStorage.setItem(RPA_MANUAL_REVIEW_IDS_KEY, JSON.stringify([...ids]));
    return productId;
};

window.getRpaProcessedProductIds = function() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(RPA_PROCESSED_IDS_KEY) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch (_) {
        return new Set();
    }
};

window.markRpaProductAsProcessed = function(productUrl) {
    const productId = window.RpaSafety && window.RpaSafety.getProductId
        ? window.RpaSafety.getProductId(productUrl)
        : '';
    if (!productId) return '';
    const ids = window.getRpaProcessedProductIds();
    ids.add(productId);
    sessionStorage.setItem(RPA_PROCESSED_IDS_KEY, JSON.stringify([...ids]));
    return productId;
};

window.clearRpaProcessedProductIds = function() {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RPA_PROCESSED_IDS_KEY);
};

window.getRpaProductIdFromEditLink = function(link) {
    if (!link) return '';
    const rowId = link.closest('tr[rowid]')?.getAttribute('rowid');
    if (rowId && /^\d{6,}$/.test(rowId)) return rowId;
    return window.RpaSafety.getProductId(`${link.getAttribute('href') || ''} ${link.getAttribute('onclick') || ''}`);
};

window.resolveProductEditUrlFromLink = function(link) {
    if (!link || typeof link.getAttribute !== 'function') return '';
    let url = null;
    const href = link.getAttribute('href') || '';
    const onclick = link.getAttribute('onclick') || '';

    // 策略0：vxe-table 的 <tr> 自带 rowid 属性，直接就是产品 ID。
    const vxeRow = link.closest && link.closest('tr[rowid]');
    if (vxeRow) {
        const rowId = vxeRow.getAttribute('rowid');
        if (rowId && /^\d{10,}$/.test(rowId)) {
            url = `/web/smt/edit?id=${rowId}`;
        }
    }

    if (!url && (href.startsWith('/') || href.startsWith('http'))) {
        url = href;
    }

    if (!url) {
        const jsCode = href + ' ' + onclick;
        const match = jsCode.match(/['"]([^'"]*\/web\/smt\/edit\?[^'"]*)['"]/);
        if (match) url = match[1];
    }

    if (!url && href.startsWith('javascript:')) {
        const urlMatch = href.match(/['"]([^'"]*\?id=\d+[^'"]*)['"]/);
        if (urlMatch) url = urlMatch[1];
    }

    if (!url && link.closest) {
        const row = link.closest('tr, [class*="row"], [class*="item"]');
        if (row) {
            let productId = null;
            const checkbox = row.querySelector && row.querySelector('input[type="checkbox"][value]');
            if (checkbox && /^\d{10,}$/.test(checkbox.value)) {
                productId = checkbox.value;
            }

            if (!productId) {
                for (const attr of ['data-id', 'data-product-id', 'data-item-id', 'data-key']) {
                    const el = (row.querySelector && row.querySelector(`[${attr}]`)) || (row.hasAttribute && row.hasAttribute(attr) ? row : null);
                    if (el) {
                        const val = el.getAttribute(attr);
                        if (val && /^\d{10,}$/.test(val)) { productId = val; break; }
                    }
                }
            }

            if (!productId && row.querySelectorAll) {
                for (const rowLink of row.querySelectorAll('a[href]')) {
                    const h = rowLink.getAttribute('href') || '';
                    const m = h.match(/[?&]id=(\d{10,})/);
                    if (m) { productId = m[1]; break; }
                    const jm = h.match(/(\d{15,})/);
                    if (jm) { productId = jm[1]; break; }
                }
            }

            if (!productId && row.innerHTML) {
                const idMatch = row.innerHTML.match(/id[=:]["']?(\d{15,})/);
                if (idMatch) productId = idMatch[1];
            }

            if (productId) {
                url = `/web/smt/edit?id=${productId}`;
            }
        }
    }

    if (!url) return '';
    if (url.startsWith('/')) return window.location.origin + url;
    try {
        return new URL(url, window.location.origin).toString();
    } catch (_) {
        return url;
    }
};

window.getVisibleProductEditLinks = function() {
    return window.RpaPageTargeting.getCollectionBoxEditLinks(document);
};

window.isPendingPublishListPage = function({ href = window.location.href, pageText = document.body ? document.body.innerText : '' } = {}) {
    const normalizedHref = String(href || '').toLowerCase();
    const normalizedText = String(pageText || '').replace(/\s+/g, '');
    const marker = ((window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.pendingPublishMarker) || '待发布').replace(/\s+/g, '');
    let routeLooksPendingPublish = normalizedHref.includes('/smtproductlist/offline');
    try {
        const url = new URL(href, window.location.origin);
        routeLooksPendingPublish = routeLooksPendingPublish || url.searchParams.get('offline') === '1';
    } catch (_) {}
    return routeLooksPendingPublish
        && normalizedHref.includes('smtproductlist')
        && !normalizedHref.includes('/web/smt/edit')
        && normalizedText.includes(marker);
};

window.getPendingPublishEditUrls = function(limit = 5) {
    const links = typeof window.getRpaQueueEditLinks === 'function'
        ? window.getRpaQueueEditLinks()
        : window.getVisibleProductEditLinks();
    const urls = [];
    const seen = new Set();

    for (const link of links) {
        const rawUrl = window.resolveProductEditUrlFromLink(link);
        if (!rawUrl) continue;
        const cleanUrl = window.getRpaWorkTabUrl(rawUrl);
        if (!cleanUrl || seen.has(cleanUrl)) continue;
        seen.add(cleanUrl);
        urls.push(cleanUrl);
        if (urls.length >= limit) break;
    }
    return urls;
};

window.findPendingEditLauncherAnchor = function() {
    const quickAction = (window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.quickAction) || '快捷操作';
    const batchAction = (window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.batchAction) || '批量操作';
    const candidates = Array.from(document.querySelectorAll('button, .btn, .ant-btn, .el-button, a, div, span'));
    const findByText = (targetText) => candidates.find((element) => {
        const text = (element.innerText || element.textContent || '').replace(/\s+/g, '');
        if (text !== targetText.replace(/\s+/g, '')) return false;
        return !element.offsetHeight || element.offsetHeight > 0;
    });
    const anchor = findByText(quickAction) || findByText(batchAction);
    return anchor && anchor.closest ? anchor.closest('button, .btn, .ant-btn, .el-button, a, div') : anchor;
};

window.initPendingEditLauncherButton = function() {
    if (!window.isPendingPublishListPage || !window.isPendingPublishListPage()) return;
    if (document.getElementById('pending-edit-launcher-btn')) return;

    const anchor = window.findPendingEditLauncherAnchor();
    if (!anchor || !anchor.parentNode) return;

    const btn = document.createElement('button');
    btn.id = 'pending-edit-launcher-btn';
    btn.className = 'ai-optimize-btn';
    btn.type = 'button';
    btn.textContent = (window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.startEditButton) || '开始编辑';
    Object.assign(btn.style, {
        background: 'linear-gradient(135deg, #1890ff, #40a9ff)',
        boxShadow: '0 2px 6px rgba(24, 144, 255, 0.3)',
        color: 'white',
        marginLeft: '12px',
        marginRight: '12px',
        height: (anchor.offsetHeight || 32) + 'px',
        lineHeight: ((anchor.offsetHeight || 32) - 2) + 'px',
        padding: '0 16px',
        verticalAlign: 'top'
    });

    btn.onclick = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const urls = window.getPendingPublishEditUrls(5);
        if (urls.length === 0) {
            alert('未识别到可打开的待发布产品，请刷新页面后重试。');
            return;
        }
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = `打开中 ${urls.length} 个`;
        chrome.runtime.sendMessage({ action: 'open_edit_tabs', urls }, (response) => {
            btn.disabled = false;
            btn.textContent = originalText;
            if (!response || response.success === false) {
                alert(`打开编辑页失败：${response && (response.error || response.msg) ? (response.error || response.msg) : '请检查浏览器是否拦截弹窗。'}`);
            }
        });
    };

    anchor.parentNode.insertBefore(btn, anchor.nextSibling || null);
};

window.getRpaCurrentStoreName = function() {
    if (!window.RpaPageTargeting || !window.RpaPageTargeting.getSelectedStoreNameFromDocument) return '';
    return window.RpaPageTargeting.getSelectedStoreNameFromDocument(document);
};

window.clearRpaStoreLock = function() {
    sessionStorage.removeItem(RPA_LOCKED_STORE_NAME_KEY);
    sessionStorage.removeItem(RPA_DEFERRED_WORK_TAB_KEY);
};

window.normalizeRpaDescriptionCleanupLevel = function(level) {
    return level === 'light' ? 'light' : 'deep';
};

window.setRpaDescriptionCleanupLevel = function(level) {
    const normalized = window.normalizeRpaDescriptionCleanupLevel(level);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(RPA_DESCRIPTION_CLEANUP_LEVEL_KEY, normalized);
    return normalized;
};

window.getRpaDescriptionCleanupLevel = function() {
    if (typeof sessionStorage === 'undefined') return 'deep';
    return window.normalizeRpaDescriptionCleanupLevel(sessionStorage.getItem(RPA_DESCRIPTION_CLEANUP_LEVEL_KEY));
};

window.clearRpaDescriptionCleanupLevel = function() {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RPA_DESCRIPTION_CLEANUP_LEVEL_KEY);
};

window.getRpaDescriptionCleanupLevelFromUrl = function(rawUrl = ((window.location && window.location.href) || '')) {
    try {
        const url = new URL(rawUrl, (window.location && window.location.origin) || 'https://www.dianxiaomi.com');
        const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RPA_DESCRIPTION_CLEANUP_LEVEL_KEY) : '';
        return window.normalizeRpaDescriptionCleanupLevel(url.searchParams.get('desc_clean') || stored);
    } catch (_) {
        return window.getRpaDescriptionCleanupLevel();
    }
};

window.normalizeRpaSaveDestination = function(destination) {
    return destination === RPA_SAVE_DESTINATIONS.COLLECTION_BOX
        ? RPA_SAVE_DESTINATIONS.COLLECTION_BOX
        : RPA_SAVE_DESTINATIONS.PENDING_PUBLISH;
};

window.setRpaSaveDestination = function(destination) {
    const normalized = window.normalizeRpaSaveDestination(destination);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(RPA_SAVE_DESTINATION_KEY, normalized);
    return normalized;
};

window.getRpaSaveDestination = function() {
    if (typeof sessionStorage === 'undefined') return RPA_SAVE_DESTINATIONS.PENDING_PUBLISH;
    return window.normalizeRpaSaveDestination(sessionStorage.getItem(RPA_SAVE_DESTINATION_KEY));
};

window.clearRpaSaveDestination = function() {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RPA_SAVE_DESTINATION_KEY);
};

window.getRpaPlugType = function() {
    try {
        return sessionStorage.getItem(RPA_PLUG_TYPE_KEY) || '';
    } catch (_) { return ''; }
};

window.setRpaPlugType = function(plugType) {
    try { sessionStorage.setItem(RPA_PLUG_TYPE_KEY, plugType); } catch (_) {}
};

window.clearRpaPlugType = function() {
    try { sessionStorage.removeItem(RPA_PLUG_TYPE_KEY); } catch (_) {}
};

const RPA_CLEAN_FORBIDDEN_WORDS_KEY = 'rpa_clean_forbidden_words';

/**
 * 违禁词清理开关：默认启用，用户可在 RPA 启动配置中关闭。
 * 开关值写入 sessionStorage，便于在页面刷新/子进程间保持状态。
 */
window.isRpaForbiddenWordCleanupEnabled = function() {
    try {
        return sessionStorage.getItem(RPA_CLEAN_FORBIDDEN_WORDS_KEY) !== '0';
    } catch (_) { return true; }
};

window.setRpaForbiddenWordCleanupEnabled = function(enabled) {
    try { sessionStorage.setItem(RPA_CLEAN_FORBIDDEN_WORDS_KEY, enabled ? '1' : '0'); } catch (_) {}
};

window.clearRpaForbiddenWordCleanupEnabled = function() {
    try { sessionStorage.removeItem(RPA_CLEAN_FORBIDDEN_WORDS_KEY); } catch (_) {}
};

window.getRpaCleanForbiddenWordsFromUrl = function(rawUrl = ((window.location && window.location.href) || '')) {
    try {
        const url = new URL(rawUrl, (window.location && window.location.origin) || 'https://www.dianxiaomi.com');
        const urlValue = url.searchParams.get('clean_fw');
        if (urlValue === '1' || urlValue === 'true') return true;
        if (urlValue === '0' || urlValue === 'false') return false;
    } catch (_) {}
    return window.isRpaForbiddenWordCleanupEnabled();
};

const RPA_ATTRIBUTE_FIX_MODE_KEY = 'rpa_attribute_fix_mode';

window.normalizeRpaAttributeFixMode = function(level) {
    return level === 'complete' ? 'complete' : 'conservative';
};

window.setRpaAttributeFixMode = function(level) {
    const normalized = window.normalizeRpaAttributeFixMode(level);
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(RPA_ATTRIBUTE_FIX_MODE_KEY, normalized);
    return normalized;
};

window.getRpaAttributeFixMode = function() {
    if (typeof sessionStorage === 'undefined') return 'conservative';
    return window.normalizeRpaAttributeFixMode(sessionStorage.getItem(RPA_ATTRIBUTE_FIX_MODE_KEY));
};

window.clearRpaAttributeFixMode = function() {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RPA_ATTRIBUTE_FIX_MODE_KEY);
};

// 完全清洗 = 删除自定义属性全部行；保守清洗 = 仅删除命中关键词的行。默认保守。
window.getRpaAttributeFixModeFromUrl = function(rawUrl = ((window.location && window.location.href) || '')) {
    try {
        const url = new URL(rawUrl, (window.location && window.location.origin) || 'https://www.dianxiaomi.com');
        const urlValue = url.searchParams.get('rpa_fix_mode');
        if (urlValue === 'complete' || urlValue === 'conservative') return urlValue;
    } catch (_) {}
    return window.getRpaAttributeFixMode();
};

window.getRpaSaveDestinationFromUrl = function(rawUrl = ((window.location && window.location.href) || '')) {
    try {
        const url = new URL(rawUrl, (window.location && window.location.origin) || 'https://www.dianxiaomi.com');
        const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RPA_SAVE_DESTINATION_KEY) : '';
        return window.normalizeRpaSaveDestination(url.searchParams.get('save_dest') || stored);
    } catch (_) {
        return window.getRpaSaveDestination();
    }
};

window.getRpaActiveUrls = function() {
    try {
        const parsed = JSON.parse(sessionStorage.getItem('rpa_active_urls') || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
};

window.setRpaBatchDispatchedAt = function() {
    const now = Date.now();
    sessionStorage.setItem('rpa_batch_dispatched_at', String(now));
    return now;
};

window.getRpaBatchResultTimeoutDelay = function(startedAt, now = Date.now()) {
    const safeStartedAt = Number(startedAt);
    if (!Number.isFinite(safeStartedAt) || safeStartedAt <= 0) return window.RPA_CHILD_RESULT_TIMEOUT_MS;
    return Math.max(0, window.RPA_CHILD_RESULT_TIMEOUT_MS - Math.max(0, Number(now) - safeStartedAt));
};

window.clearRpaBatchResultTimeout = function() {
    if (window._rpa_batch_watchdog_timer) clearTimeout(window._rpa_batch_watchdog_timer);
    window._rpa_batch_watchdog_timer = null;
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('rpa_batch_dispatched_at');
};

window.handleRpaBatchResultTimeout = function() {
    window._rpa_batch_watchdog_timer = null;
    if (sessionStorage.getItem('rpa_running') !== '1') return;
    if (window._rpa_finished_count >= (window._rpa_current_batch_size || 5)) {
        window.waitForAllTabsToCloseAndReload();
        return;
    }
    console.warn('[RPA 母舰] 子页批处理超时，无子页返回结果，视为 RPA 意外中断，清理状态停止...');
    window.closeRpaTabsForCurrentRun();
    sessionStorage.removeItem('rpa_running');
    sessionStorage.removeItem('rpa_space_phase');
    window.clearRpaStoreLock();
    window.clearRpaDescriptionCleanupLevel();
    window.clearRpaSaveDestination();
    window.clearRpaBatchResultTimeout();
    window.clearRpaProcessedProductIds();
    window.clearRpaForbiddenWordCleanupEnabled();
    window.clearRpaCurrentRunId();
    window._rpa_queue_started_for_document = false;
    window._rpa_queue_resume_waiting = false;
    if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'stopped', message: 'RPA 已停止：子页批处理超时，请检查未完成的产品。' });
    console.warn('[RPA] RPA 已停止：子页批处理超时。');
};

window.scheduleRpaBatchResultTimeout = function() {
    window.clearRpaBatchResultTimeout();
    const dispatchedAt = sessionStorage.getItem('rpa_batch_dispatched_at');
    const delay = window.getRpaBatchResultTimeoutDelay(dispatchedAt ? Number(dispatchedAt) : 0);
    if (delay <= 0) {
        window.handleRpaBatchResultTimeout();
        return;
    }
    window._rpa_batch_watchdog_timer = setTimeout(window.handleRpaBatchResultTimeout, delay);
};

window.getRpaSaveButtonText = function(destination = window.getRpaSaveDestinationFromUrl()) {
    const normalized = window.normalizeRpaSaveDestination(destination);
    if (normalized === RPA_SAVE_DESTINATIONS.COLLECTION_BOX) {
        return (window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.saveToCollectionBox) || '保存';
    }
    return (window.UI_TEXT_CONFIG && window.UI_TEXT_CONFIG.saveToDraft) || '保存并移入待发布';
};

window.getRpaSaveButtonXPath = function(destination = window.getRpaSaveDestinationFromUrl()) {
    const normalized = window.normalizeRpaSaveDestination(destination);
    const buttonText = window.getRpaSaveButtonText(normalized);
    if (normalized === RPA_SAVE_DESTINATIONS.COLLECTION_BOX) {
        return `//text()[normalize-space(.)='${buttonText}']/parent::*`;
    }
    return `//text()[contains(., '${buttonText}')]/parent::*`;
};

window.confirmRpaSaveDestination = async function() {
    if (typeof window.showDxmChoiceDialog !== 'function') return RPA_SAVE_DESTINATIONS.PENDING_PUBLISH;
    const selectedDestination = await window.showDxmChoiceDialog({
        title: '选择完成后保存位置',
        options: [
            { label: '保存到采集箱', value: RPA_SAVE_DESTINATIONS.COLLECTION_BOX },
            { label: '保存到待发布', value: RPA_SAVE_DESTINATIONS.PENDING_PUBLISH, primary: true }
        ]
    });
    return window.normalizeRpaSaveDestination(selectedDestination);
};

window.confirmRpaPlugType = async function() {
    if (typeof window.showDxmChoiceDialog !== 'function') return 'no_plug';
    const plugTypeLabels = window.PlugSelection && window.PlugSelection.PLUG_TYPE_LABELS;
    if (!plugTypeLabels) return 'no_plug';
    const selected = await window.showDxmChoiceDialog({
        title: '选择插头类型',
        options: [
            { label: plugTypeLabels.no_plug, value: 'no_plug', primary: true },
            { label: plugTypeLabels.eu_plug, value: 'eu_plug' }
        ]
    });
    return selected || 'no_plug';
};

window.appendRpaQueryParam = function(rawUrl, key, value) {
    const url = new URL(rawUrl, (window.location && window.location.origin) || 'https://www.dianxiaomi.com');
    url.searchParams.set(key, value);
    return url.toString();
};

window.runRpaDescriptionCleanup = function(options = {}) {
    if (typeof window.runDescriptionCleanup === 'function') {
        return window.runDescriptionCleanup(options);
    }
    if (window.normalizeRpaDescriptionCleanupLevel(options.level) === 'light') {
        throw new Error(window.UI_TEXT_CONFIG.rpa.descriptionCleanupNotLoaded);
    }
    if (typeof window.violentPurifyDesc === 'function') {
        return window.violentPurifyDesc();
    }
};

window.lockRpaStoreForCurrentPage = function() {
    const currentStoreName = window.getRpaCurrentStoreName();
    const decision = window.RpaPageTargeting && window.RpaPageTargeting.getStoreLockDecision
        ? window.RpaPageTargeting.getStoreLockDecision({ lockedStoreName: currentStoreName, currentStoreName })
        : { allowed: false, reason: 'missing_current_store', lockedStoreName: '', currentStoreName: currentStoreName || '' };

    if (!decision.allowed) {
        alert('\u26a0\ufe0f RPA \u672a\u542f\u52a8\uff1a' + window.UI_TEXT_CONFIG.rpa.pleaseSelectStore);
        return '';
    }
    sessionStorage.setItem(RPA_LOCKED_STORE_NAME_KEY, decision.currentStoreName);
    return decision.currentStoreName;
};

window.stopRpaForStoreLock = function(decision) {
    const lockedStoreName = decision.lockedStoreName || '未锁定';
    const currentStoreName = decision.currentStoreName || '未识别';
    const message = decision.reason === 'store_changed'
        ? `RPA 已停止：启动店铺为「${lockedStoreName}」，当前页面为「${currentStoreName}」，为避免处理其他店铺产品，已停止派发。`
        : `RPA 已停止：无法确认当前店铺是否仍为「${lockedStoreName}」，为避免误处理其他店铺产品，已停止派发。`;

    window.closeRpaTabsForCurrentRun();
    sessionStorage.removeItem('rpa_running');
    sessionStorage.removeItem('rpa_space_phase');
    window.clearRpaStoreLock();
    window.clearRpaDescriptionCleanupLevel();
    window.clearRpaSaveDestination();
    window.clearRpaProcessedProductIds();
    window.clearRpaForbiddenWordCleanupEnabled();
    window.clearRpaCurrentRunId();
    window._rpa_queue_started_for_document = false;
    window._rpa_queue_resume_waiting = false;
    if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'stopped', message });
    if (window.refreshRPAButtonState) window.refreshRPAButtonState();
    console.warn('[RPA 店铺锁] ' + message);
    alert(`⚠️ ${message}\n\n请回到目标店铺后重新启动 RPA。`);
    return false;
};

window.ensureRpaStoreLockBeforeQueue = function() {
    const lockedStoreName = sessionStorage.getItem(RPA_LOCKED_STORE_NAME_KEY);
    const currentStoreName = window.getRpaCurrentStoreName();
    const decision = window.RpaPageTargeting && window.RpaPageTargeting.getStoreLockDecision
        ? window.RpaPageTargeting.getStoreLockDecision({ lockedStoreName, currentStoreName })
        : { allowed: false, reason: 'missing_current_store', lockedStoreName: lockedStoreName || '', currentStoreName: currentStoreName || '' };
    return decision.allowed || window.stopRpaForStoreLock(decision);
};

window.getRpaWorkTabUrl = function(rawUrl = window.location.href) {
    try {
        const url = new URL(rawUrl, window.location.origin);
        ['rpa_auto', 'opt_mode', 'rpa_runner'].forEach((key) => url.searchParams.delete(key));
        return url.toString();
    } catch (_) {
        return rawUrl;
    }
};

window.openRpaWorkTab = function(rawUrl = window.location.href) {
    const url = window.getRpaWorkTabUrl(rawUrl);
    if (!window.chrome || !chrome.runtime || !chrome.runtime.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'open_rpa_work_tab', url });
};

window.openDeferredRpaWorkTabIfNeeded = function(rawUrl = window.location.href) {
    if (sessionStorage.getItem(RPA_DEFERRED_WORK_TAB_KEY) !== '1') return false;
    sessionStorage.removeItem(RPA_DEFERRED_WORK_TAB_KEY);
    window.openRpaWorkTab(rawUrl);
    return true;
};

window.getRpaOptimizationMode = function() {
    if (window.isPlugOptimizationMode && window.isPlugOptimizationMode()) return 'plug';
    return 'normal';
};

window.startRpaAsDedicatedRunner = async function(renderRPAState, options = {}) {
    const lockedStoreName = window.lockRpaStoreForCurrentPage();
    if (!lockedStoreName) {
        if (renderRPAState) renderRPAState();
        return false;
    }

    const rpaMode = window.getRpaOptimizationMode();
    window.setRpaDescriptionCleanupLevel(options.descriptionCleanupLevel || 'deep');
    window.setRpaAttributeFixMode(options.attributeFixMode || 'conservative');
    window.setRpaSaveDestination(options.saveDestination || RPA_SAVE_DESTINATIONS.PENDING_PUBLISH);
    if (rpaMode === 'plug' && options.plugType) window.setRpaPlugType(options.plugType);
    const run = window.RpaRunState ? await window.RpaRunState.start({
        mode: rpaMode,
        storeName: lockedStoreName,
        saveDestination: window.getRpaSaveDestination(),
        descriptionCleanupLevel: window.getRpaDescriptionCleanupLevel()
    }) : null;
    const runId = run && run.runId
        ? run.runId
        : window.RpaRunStateModel && window.RpaRunStateModel.createRpaRunId
            ? window.RpaRunStateModel.createRpaRunId()
            : `rpa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(RPA_CURRENT_RUN_ID_KEY, runId);
    sessionStorage.setItem('rpa_running', '1');
    sessionStorage.removeItem('rpa_needs_review');
    sessionStorage.removeItem(RPA_MANUAL_REVIEW_IDS_KEY);
    window.clearRpaProcessedProductIds();
    window.setRpaForbiddenWordCleanupEnabled(
        options.cleanForbiddenWords !== undefined ? options.cleanForbiddenWords : true
    );
    sessionStorage.setItem(RPA_DEFERRED_WORK_TAB_KEY, '1');
    if (renderRPAState) renderRPAState();
    window.startRpaImageSpacePreflight().catch((error) => {
        window.closeRpaTabsForCurrentRun();
        sessionStorage.removeItem('rpa_running');
        window.clearRpaStoreLock();
        window.clearRpaDescriptionCleanupLevel();
        window.clearRpaSaveDestination();
        window.clearRpaProcessedProductIds();
        window.clearRpaForbiddenWordCleanupEnabled();
        window.clearRpaCurrentRunId();
        console.error('[RPA] 图片空间预检无法启动：', error);
        alert(`⚠️ RPA 未启动：${window.UI_TEXT_CONFIG.rpa.spacePreflightFailed} ${error.message}`);
    });
    return true;
};

window.finishRpaQueue = function(message = '采集箱中没有剩余待处理产品，RPA 已完成。') {
    window.closeRpaTabsForCurrentRun();
    sessionStorage.removeItem('rpa_running');
    sessionStorage.removeItem('rpa_space_phase');
    window.clearRpaStoreLock();
    window.clearRpaDescriptionCleanupLevel();
    window.clearRpaSaveDestination();
    window.clearRpaProcessedProductIds();
    window.clearRpaForbiddenWordCleanupEnabled();
    window.clearRpaCurrentRunId();
    if (window.RpaRunState) {
        window.RpaRunState.update({ type: 'status', status: 'completed', message })
            .then((run) => {
                if (window.RpaRunStateModel && window.RpaRunStateModel.summarizeRun) {
                    alert(window.RpaRunStateModel.summarizeRun(run).message);
                }
            });
    } else {
        alert(`RPA 自动处理完成\n成功：${window._rpa_success_count || 0} 条\n待确认：${window._rpa_needs_review_count || 0} 条\n失败：${window._rpa_failed_count || 0} 条`);
    }
    if (window.refreshRPAButtonState) window.refreshRPAButtonState();
    console.log('[RPA 母舰] ' + message);
};

// ============================================
// 母舰等待所有子标签关闭后刷新
// 替代原先 BroadcastChannel 收到结果后立即 reload 的做法，
// 避免子标签的 close_tab 消息因 extension context 失效而丢失。
// ============================================
window.waitForAllTabsToCloseAndReload = function() {
    console.log('[RPA 母舰] 等待全部子标签页关闭...');
    sessionStorage.setItem('rpa_programmatic_reload', '1');
    const checkInterval = setInterval(() => {
        if (sessionStorage.getItem('rpa_running') !== '1') {
            clearInterval(checkInterval);
            return;
        }
        try {
            chrome.runtime.sendMessage({
                action: 'query_active_rpa_tabs_count',
                runId: window.getRpaCurrentRunId()
            }, (response) => {
                try {
                    if (chrome.runtime.lastError) {
                        clearInterval(checkInterval);
                        window.location.reload();
                        return;
                    }
                } catch (_) {}
                if (response && response.count === 0) {
                    clearInterval(checkInterval);
                    window.location.reload();
                } else {
                    console.log(`[RPA 母舰] 等待 ${response ? response.count : '?'} 个子页签关闭...`);
                }
            });
        } catch (err) {
            clearInterval(checkInterval);
            window.location.reload();
        }
    }, 400);
};

/**
 * 关闭当前标签的辅助函数，带 fallback 机制。
 * 优先通过 chrome.runtime.sendMessage 通知 background 关闭，
 * 如果失败（extension context 已失效），尝试 window.close()。
 */
window.closeRpaTabWithFallback = function(attempts = 3) {
    const tryCloseViaBackground = (remaining) => {
        if (remaining <= 0) {
            console.warn('[RPA] close_tab 消息多次发送失败，尝试 window.close()');
            try { window.close(); } catch (_) {}
            return;
        }
        try {
            chrome.runtime.sendMessage({ action: 'close_tab', runId: window.getRpaCurrentRunId() }, () => {
                if (chrome.runtime.lastError) {
                    const delay = 400 * (attempts - remaining + 1);
                    console.warn(`[RPA] close_tab 发送失败（${chrome.runtime.lastError.message}），${delay}ms后重试...`);
                    setTimeout(() => tryCloseViaBackground(remaining - 1), delay);
                }
            });
        } catch (err) {
            console.warn('[RPA] close_tab 调用异常：', err.message);
            setTimeout(() => tryCloseViaBackground(remaining - 1), 400);
        }
    };
    tryCloseViaBackground(attempts);
};

// --- executeRPAChildProcess ---
// RPA 子舰：在单品编辑页执行 翻译→改图→清理→保存 四阶段管线

window.getRpaVisibleFeedbackText = function() {
    const selectors = [
        '.el-message', '.el-message-box', '.el-notification',
        '.ant-message', '.ant-notification', '.ant-modal',
        '.el-dialog', '.el-dialog__wrapper',
        '[role="alert"]', '[role="status"]', '[role="dialog"]'
    ];
    const messages = Array.from(document.querySelectorAll(selectors.join(',')))
        .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
        .map((el) => el.innerText || el.textContent || '');
    return messages.join(' ');
};

window.isRpaButtonBusy = function(button) {
    if (!button || !button.isConnected) return false;
    const className = String(button.className || '');
    const ariaBusy = button.getAttribute('aria-busy') === 'true';
    const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
    return ariaBusy || disabled || /loading|is-loading|btn-loading|ant-btn-loading/i.test(className);
};

window.waitForRpaSaveOutcome = async function(saveBtn, beforeUrl, options = {}) {
    const timeout = options.timeout || window.RPA_SAVE_OUTCOME_TIMEOUT_MS;
    const retryAfter = options.retryAfter || window.RPA_SAVE_OUTCOME_RETRY_AFTER_MS;
    const interval = options.interval || window.RPA_SAVE_OUTCOME_POLL_MS;
    const startedAt = Date.now();
    let sawBusy = false;
    let retried = false;

    while (Date.now() - startedAt < timeout) {
        const elapsedMs = Date.now() - startedAt;
        const isBusy = window.isRpaButtonBusy(saveBtn);
        if (isBusy) sawBusy = true;

        // 保存按钮点击后，店小秘会把属性格式错误直接标在对应行上。
        // 这类失败可以安全删除该行并重试，无需空等到整个保存超时。
        if (window.getInvalidAttributeRows && window.getInvalidAttributeRows().length > 0) {
            return { status: 'failure', source: 'attribute-validation', retried };
        }

        const outcome = window.RpaSafety.detectSaveOutcome({
            visibleText: window.getRpaVisibleFeedbackText(),
            beforeUrl,
            currentUrl: window.location.href,
            sawBusy,
            isBusy,
            elapsedMs
        });
        if (outcome.status !== 'pending') return { ...outcome, retried };

        if (!retried && elapsedMs >= retryAfter && !sawBusy && !isBusy && saveBtn && saveBtn.isConnected && !saveBtn.disabled) {
            retried = true;
            console.warn('[RPA] 保存按钮未出现请求状态，执行一次安全重试');
            const _r = saveBtn.getBoundingClientRect();
            const _cx = Math.max(0, _r.left + _r.width / 2);
            const _cy = Math.max(0, _r.top + _r.height / 2);
            const _o = { bubbles: true, cancelable: true, view: window, clientX: _cx, clientY: _cy };
            saveBtn.dispatchEvent(new MouseEvent('mousedown', _o));
            saveBtn.dispatchEvent(new MouseEvent('mouseup', _o));
            saveBtn.click();
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    return { status: 'pending', source: null, retried };
};

window.getRpaSaveDiagnostics = function(saveBtn) {
    return {
        url: window.location.href,
        feedback: window.getRpaVisibleFeedbackText(),
        buttonText: saveBtn ? (saveBtn.innerText || saveBtn.textContent || '').trim() : '',
        buttonClass: saveBtn ? String(saveBtn.className || '') : '',
        buttonDisabled: Boolean(saveBtn && saveBtn.disabled),
        buttonBusy: window.isRpaButtonBusy(saveBtn)
    };
};

window.getRpaSaveGateDecision = function(stageResults, mode = 'normal') {
    return window.RpaSafety.canSaveAfterStages({
        mode,
        translate: stageResults && stageResults.translate,
        imageResize: stageResults && stageResults.imageResize,
        cleanup: stageResults && stageResults.cleanup
    });
};

window.handleBlockedRpaSaveGate = function(saveGate, stageResults, log = () => {}) {
    if (!saveGate || saveGate.allowed) return false;
    stageResults.save = 'blocked';
    const detail = (saveGate.reasons || []).join('；') || '关键处理阶段未确认成功';
    log(`⚠️ 保存门禁已阻止自动保存：${detail}`);
    try {
        const bc = new BroadcastChannel('rpa_channel');
        bc.postMessage({
            runId: window.getRpaCurrentRunId(),
            status: 'needs_review',
            productUrl: window.location.href,
            detail,
            diagnostics: { stages: { ...stageResults }, reasons: [...(saveGate.reasons || [])] }
        });
        bc.close();
    } catch (_) {}
    window.closeRpaTabWithFallback();
    return true;
};

window.runRpaImageResizeStage = async function(stageResults, log = () => {}) {
    log('进入一键优化：正在模拟全框重做图(800x800)...');

    if (typeof window.triggerImageResize !== 'function') {
        throw new Error(window.UI_TEXT_CONFIG.rpa.imageOptimizeNotLoaded);
    }

    const resizeResult = await window.triggerImageResize();
    if (resizeResult && resizeResult.status === 'space_full') {
        stageResults.imageResize = 'space_full';
        if (window.requestRpaSpaceRecovery) {
            window.requestRpaSpaceRecovery(resizeResult.feedback || '图片空间不足');
        }
        const error = new Error(window.UI_TEXT_CONFIG.rpa.imageSpaceLow);
        error.code = 'RPA_SPACE_FULL';
        throw error;
    }
    if (resizeResult && resizeResult.status === 'unresizable') {
        stageResults.imageResize = 'unresizable';
        log('⚠️ 原图尺寸异常，跳过 800x800 生成，继续其他优化...');
    } else if (resizeResult && resizeResult.status === 'success') {
        stageResults.imageResize = 'success';
    } else if (resizeResult && (resizeResult.status === 'unavailable' || resizeResult.status === 'unknown')) {
        stageResults.imageResize = 'skipped';
        log('⚠️ 图片改图不可用或未完成，跳过此阶段，继续其他优化...');
    } else {
        stageResults.imageResize = 'unconfirmed';
    }
};

window.runRpaCleanupStage = async function(stageResults, log = () => {}) {
    const descriptionCleanupLevel = window.getRpaDescriptionCleanupLevelFromUrl();
    // 先读 URL 参数（母舰派发时写入），再回退到本地 sessionStorage
    const cleanForbiddenWords = window.getRpaCleanForbiddenWordsFromUrl(window.location.href);
    // 属性清洗级别：complete=完全清洗删全部自定义属性，conservative=保守清洗仅删命中行
    const attributeFixMode = window.getRpaAttributeFixModeFromUrl(window.location.href);

    if (window.isPlugOptimizationMode && window.isPlugOptimizationMode()) {
        if (typeof window.runPlugNoPlugWorkflow !== 'function') {
            throw new Error(window.UI_TEXT_CONFIG.rpa.plugOptimizeNotLoaded);
        }
        const plugType = window.getRpaPlugType() || (window.PlugSelection && window.PlugSelection.PLUG_TYPE_NO_PLUG) || 'no_plug';
        const plugLabel = (window.PlugSelection && window.PlugSelection.getPlugTypeLabel(plugType)) || '无电源插头';
        log(`插头模式(${plugLabel})：正在设置插头类型并恢复客户原始数据...`);
        await window.runPlugNoPlugWorkflow((message) => log(message), plugType);
        window.silentRemoveForbiddenWords({ cleanForbiddenWords });
        await window.cleanupEmptyAttributes();
        await window.cleanupInvalidAttributes();
        await window.cleanupCustomAttributesByLevel(attributeFixMode, log);
        window.runRpaDescriptionCleanup({ level: descriptionCleanupLevel, mode: 'plug', surface: 'rpa' });
        stageResults.cleanup = 'success';
        return;
    }

    log(descriptionCleanupLevel === 'light'
        ? '正在执行轻度详情清洗：保留普通图片和规格文字，清理链接图片、宣传尾部和违禁词...'
        : '正在施展斩词、纯文字剃刀化、变体强缩引擎...');
    window.silentRemoveForbiddenWords({ cleanForbiddenWords });
    await window.cleanupEmptyAttributes();
    await window.cleanupInvalidAttributes();
    await window.cleanupCustomAttributesByLevel(attributeFixMode, log);
    window.runRpaDescriptionCleanup({ level: descriptionCleanupLevel, mode: 'normal', surface: 'rpa' });
    window.silentOptimizeSingleProductVariants();
    stageResults.cleanup = 'success';
};

window.waitForSaveButton = async function(buttonText, timeout = 10000) {
    const pollInterval = 150;
    const startedAt = Date.now();
    const selectors = 'button, .ant-btn, .el-button, a, li, [role="button"]';
    const normalizedText = String(buttonText || '').replace(/\s+/g, '');
    if (!normalizedText) return null;

    const isExactMatch = (el) => {
        if (!el || el.offsetHeight <= 0) return false;
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, '');
        return text === normalizedText;
    };

    while (Date.now() - startedAt < timeout) {
        // DOM 扫描
        const matches = document.querySelectorAll(selectors);
        for (const el of matches) {
            if (isExactMatch(el)) return el;
        }

        // XPath 精确匹配（同步尝试，不作为 fallback）
        try {
            const xpath = `//text()[normalize-space(.)='${buttonText}']/parent::*`;
            const snap = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < snap.snapshotLength; i++) {
                const parent = snap.snapshotItem(i);
                const btn = parent.closest(selectors);
                if (btn && isExactMatch(btn)) return btn;
                if (btn) return btn;
            }
        } catch (_) {}

        await new Promise(r => setTimeout(r, pollInterval));
    }
    return null;
};

window.executeRPAChildProcess = async function() {
    document.body.insertAdjacentHTML('beforeend',
        '<div id="rpa-overlay" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);z-index:99999999;display:flex;align-items:center;justify-content:center;">' +
        '<div style="background:white;padding:20px 40px;border-radius:8px;font-size:16px;font-weight:bold;color:#722ed1;box-shadow:0 10px 30px rgba(0,0,0,0.5);">' +
        '<div style="font-size:30px;margin-bottom:10px;text-align:center;">🤖</div>' +
        '<div id="rpa-txt">RPA 子舰启动中...</div></div></div>');

    const log = (msg) => { document.getElementById('rpa-txt').innerText = msg; console.log("[RPA] " + msg); };
    const pauseState = { reason: window.getRpaPauseReason ? window.getRpaPauseReason() : '' };
    let childChannel = null;
    try {
        childChannel = new BroadcastChannel('rpa_channel');
        childChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'space_full') pauseState.reason = 'space_full';
        };
    } catch (_) {}
    const throwIfPausedForSpace = () => {
        if (pauseState.reason === 'space_full' || (window.getRpaPauseReason && window.getRpaPauseReason() === 'space_full')) {
            const error = new Error('RPA 已因图片空间不足暂停');
            error.code = 'RPA_SPACE_FULL';
            throw error;
        }
    };

    // 自动关闭分类提示等阻塞弹窗（持续巡逻）
    // 注意：保存结果弹窗（操作成功/保存成功/保存失败）不自动关，
    // 留给 waitForRpaSaveOutcome 先检测到，避免检测不到而超时 35 秒。
    const dialogDismissInterval = setInterval(() => {
        const SAVE_OUTCOME_KEYWORDS = ['操作成功', '保存成功', '您的产品编辑成功', '产品编辑成功', '编辑成功', '保存失败', '操作失败', '网络异常', '保存出错', '已移入待发布', '待发布产品'];
        const BATCH_RESIZE_KEYWORDS = ['选择全部', '生成JPG', '批量改图', '生成jpg', '图片尺寸', 'px'];
        const isSaveOutcomeDialog = (root) => {
            const t = (root.innerText || root.textContent || '').replace(/\s+/g, '');
            return SAVE_OUTCOME_KEYWORDS.some(k => t.includes(k));
        };
        const isBatchResizeDialog = (root) => {
            const t = (root.innerText || root.textContent || '').replace(/\s+/g, '');
            return BATCH_RESIZE_KEYWORDS.some(k => t.includes(k));
        };
        const modalBtns = document.querySelectorAll('.el-message-box__btns button, .ant-modal-footer button, .el-dialog__footer button');
        modalBtns.forEach(btn => {
            const text = (btn.innerText || btn.textContent || '').replace(/\s+/g, '');
            const root = btn.closest('.el-message-box, .ant-modal, .el-dialog');
            const modalText = root?.innerText || '';
            if (window.RpaSafety.classifyImageGenerationResult(modalText) === 'space_full') return;
            if (root && isSaveOutcomeDialog(root)) return;
            if ((text === window.UI_TEXT_CONFIG.confirmBtn[0] || text === window.UI_TEXT_CONFIG.confirmBtn[1] || text === window.UI_TEXT_CONFIG.dismissBtn) && btn.offsetHeight > 0) {
                console.log('[RPA] 自动关闭弹窗:', text);
                btn.click();
            }
        });
        document.querySelectorAll('.el-message-box, .ant-modal, .el-dialog__wrapper, [role="dialog"]').forEach(root => {
            if (isSaveOutcomeDialog(root)) return;
            if (isBatchResizeDialog(root)) return;
            const footerBtns = root.querySelectorAll('.el-message-box__btns button, .ant-modal-footer button, .el-dialog__footer button, [role="dialog"] footer button');
            const hasClickableFooter = Array.from(footerBtns).some(b => b.offsetHeight > 0 && !b.disabled);
            if (!hasClickableFooter) {
                const xBtn = root.querySelector('.el-message-box__headerbtn, .ant-modal-close, .el-dialog__headerbtn, [role="dialog"] .close, [role="dialog"] button[aria-label="Close"]');
                if (xBtn && xBtn.offsetHeight > 0) {
                    console.log('[RPA] 自动关闭弹窗 X');
                    xBtn.click();
                }
            }
        });
    }, 800);

    const stageResults = { translate: 'skipped', imageResize: 'skipped', cleanup: 'skipped', pricing: 'skipped', save: 'skipped' };

    try {
        throwIfPausedForSpace();
        log("等待页面初始化（等待一键翻译按钮出现）...");
        await window.waitForElement(() => {
            const modalBtn = document.querySelector('.el-message-box__btns button, .ant-modal-footer button');
            if (modalBtn && modalBtn.offsetHeight > 0) {
                const mText = (modalBtn.innerText || '').replace(/\s+/g, '');
                if (mText === window.UI_TEXT_CONFIG.confirmBtn[0] || mText === window.UI_TEXT_CONFIG.confirmBtn[1]) modalBtn.click();
            }
            const snap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.oneClickTranslate}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return snap.snapshotLength > 0 ? snap.snapshotItem(0) : null;
        }, { timeout: window.RPA_WAIT_ELEMENT_TIMEOUT_MS, interval: window.RPA_WAIT_ELEMENT_INTERVAL_MS });
        await new Promise(r => setTimeout(r, window.RPA_PRE_TRANSLATE_DELAY_MS));

        // === 阶段 1：一键翻译 ===
        try {
            throwIfPausedForSpace();
            log("触动一键翻译...");
            await window.runRpaTranslationStage(stageResults, log);
        } catch (translateErr) {
            stageResults.translate = 'failed';
            console.error('[RPA] 翻译阶段异常，跳过继续：', translateErr.message, translateErr);
            log("⚠️ 翻译阶段失败，跳过，继续后续流程...");
        }

        // === 阶段 2：图片改图 ===
        try {
            throwIfPausedForSpace();
            await window.runRpaImageResizeStage(stageResults, log);
        } catch (imgErr) {
            if (imgErr && imgErr.code === 'RPA_SPACE_FULL') throw imgErr;
            stageResults.imageResize = 'failed';
            console.error('[RPA] 图片改图阶段异常，跳过继续：', imgErr.message, imgErr);
            log("⚠️ 图片改图失败，跳过，继续后续流程...");
        }

        // === 阶段 3：违禁词清理 + 属性优化 ===
        try {
            throwIfPausedForSpace();
            await window.runRpaCleanupStage(stageResults, log);
        } catch (cleanErr) {
            stageResults.cleanup = 'failed';
            console.error('[RPA] 清理优化阶段异常，跳过继续：', cleanErr.message, cleanErr);
            log("⚠️ 清理优化失败，跳过，继续保存...");
            if (window.isPlugOptimizationMode && window.isPlugOptimizationMode()) throw cleanErr;
        }

        // === 阶段 3.5：货源价 → 零售价/货值/重量（插头模式跳过） ===
        try {
            throwIfPausedForSpace();
            if (typeof window.runRpaSkuPricingStage === 'function') {
                await window.runRpaSkuPricingStage(stageResults, log);
            }
        } catch (priceErr) {
            stageResults.pricing = 'failed';
            console.error('[RPA] 定价阶段异常，跳过继续：', priceErr.message, priceErr);
            log('⚠️ 自动定价失败，跳过，继续保存...');
        }

        const rpaMode = window.isPlugOptimizationMode && window.isPlugOptimizationMode() ? 'plug' : 'normal';
        const saveGate = window.getRpaSaveGateDecision(stageResults, rpaMode);
        if (window.handleBlockedRpaSaveGate(saveGate, stageResults, log)) return;

        await new Promise(r => setTimeout(r, window.RPA_POST_ACTION_DELAY_MS));

        // === 阶段 4：保存 ===
        throwIfPausedForSpace();
        let saveSuccess = false;
        let saveOutcome = { status: 'pending', source: null, retried: false };
        let saveBtn = null;
        try {
            const saveDestination = window.getRpaSaveDestinationFromUrl();
            const saveButtonText = window.getRpaSaveButtonText(saveDestination);
            log(`处理妥当！点击[${saveButtonText}]...`);
            saveBtn = await window.waitForSaveButton(saveButtonText);
            if (saveBtn) {
                const beforeSaveUrl = window.location.href;
                // 构造完整事件序列以兼容 Vue/Ant Design 事件处理
                saveBtn.focus();
                const rect = saveBtn.getBoundingClientRect();
                const cx = Math.max(0, rect.left + rect.width / 2);
                const cy = Math.max(0, rect.top + rect.height / 2);
                const evtOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
                saveBtn.dispatchEvent(new MouseEvent('mousedown', evtOpts));
                saveBtn.dispatchEvent(new MouseEvent('mouseup', evtOpts));
                saveBtn.click();
                log("保存指令已送出，等待后台反馈...");
                saveOutcome = await window.waitForRpaSaveOutcome(saveBtn, beforeSaveUrl);
                saveSuccess = saveOutcome.status === 'success';
                if (!saveSuccess && saveOutcome.source === 'attribute-validation') {
                    const cleanupResult = await window.cleanupInvalidAttributes();
                    if (cleanupResult.removed > 0 && saveBtn.isConnected && !saveBtn.disabled) {
                        log(`已删除 ${cleanupResult.removed} 条无效属性，重新保存...`);
                        const retryUrl = window.location.href;
                        saveBtn.focus();
                        const rRect = saveBtn.getBoundingClientRect();
                        const rcx = Math.max(0, rRect.left + rRect.width / 2);
                        const rcy = Math.max(0, rRect.top + rRect.height / 2);
                        const rOpts = { bubbles: true, cancelable: true, view: window, clientX: rcx, clientY: rcy };
                        saveBtn.dispatchEvent(new MouseEvent('mousedown', rOpts));
                        saveBtn.dispatchEvent(new MouseEvent('mouseup', rOpts));
                        saveBtn.click();
                        saveOutcome = await window.waitForRpaSaveOutcome(saveBtn, retryUrl);
                        saveSuccess = saveOutcome.status === 'success';
                    }
                }
            } else {
                log("找不到[保存]按钮！");
            }
            stageResults.save = saveSuccess ? 'success' : (saveOutcome.status === 'failure' ? 'failed' : 'unconfirmed');
        } catch (saveErr) {
            stageResults.save = 'failed';
            console.error('[RPA] 保存阶段异常：', saveErr.message, saveErr);
        }

        // === 输出阶段总结 ===
        const summary = `[RPA 总结] 翻译:${stageResults.translate} | 改图:${stageResults.imageResize} | 清理:${stageResults.cleanup} | 定价:${stageResults.pricing} | 保存:${stageResults.save}`;
        console.log(summary);
        if (saveSuccess) {
            log("✅ 保存成功！关闭弹窗...");
            // 关闭保存成功弹窗
            try {
                const xBtn = document.querySelector('.el-message-box__headerbtn, .ant-modal-close, .el-dialog__headerbtn, [role="dialog"] .close, [role="dialog"] button[aria-label="Close"]');
                if (xBtn && xBtn.offsetHeight > 0) xBtn.click();
            } catch(_){}
            try {
                const bc = new BroadcastChannel('rpa_channel');
                bc.postMessage({ runId: window.getRpaCurrentRunId(), status: 'success', productUrl: window.location.href, detail: `保存确认来源：${saveOutcome.source}` });
                bc.close();
            } catch(e){}
            window.closeRpaTabWithFallback();
        } else {
            const diagnostics = window.getRpaSaveDiagnostics(saveBtn);
            console.warn('[RPA] 保存未确认，标记为待手工处理后继续流水线：', diagnostics);
            log(`⚠️ 保存未确认，已记录为待手工处理并继续后续产品。(${summary})`);
            try {
                const bc = new BroadcastChannel('rpa_channel');
                bc.postMessage({ runId: window.getRpaCurrentRunId(), status: 'needs_review', productUrl: window.location.href, diagnostics: window.getRpaSaveDiagnostics(saveBtn) });
                bc.close();
            } catch(e){}
            window.closeRpaTabWithFallback();
        }

    } catch (e) {
        if (e && e.code === 'RPA_SPACE_FULL') {
            log('⏸️ 图片空间不足，已停止当前产品，等待空间清理后自动重试...');
            console.warn('[RPA] 图片空间不足，子页面停止且不保存：', e.message);
            try {
                const bc = new BroadcastChannel('rpa_channel');
                bc.postMessage({ runId: window.getRpaCurrentRunId(), status: 'paused_space', productUrl: window.location.href, detail: '图片空间不足，未保存当前产品。' });
                bc.close();
            } catch (_) {}
            window.closeRpaTabWithFallback();
            return;
        }
        log("RPA进程报错：" + e.message); console.error(e);
        await new Promise(r => setTimeout(r, window.RPA_POST_ACTION_DELAY_MS));
        try {
            const bc = new BroadcastChannel('rpa_channel');
                bc.postMessage({ runId: window.getRpaCurrentRunId(), status: 'failed', productUrl: window.location.href, detail: e.message || window.UI_TEXT_CONFIG.rpa.childPageException });
                bc.close();
        } catch(ex){}
        window.closeRpaTabWithFallback();
    } finally {
        clearInterval(dialogDismissInterval);
        if (childChannel) childChannel.close();
    }
};

// --- violentPurifyDesc ---
// 暴力净化描述：杀图、杀链接、杀公司宣发段落

window.violentPurifyDesc = function() {
    const container = window.getPCEditorContainer();
    if (!container) return;

    // 1. 删除所有 a 标签
    const links = container.querySelectorAll('a');
    links.forEach(a => { a.remove(); });

    // 2. 无差别杀图：直接将所有图片物理删掉彻底提速！
    const allImgs = container.querySelectorAll('img');
    allImgs.forEach(img => { img.remove(); });
    // 清除残留空壳包裹符 (防止留白)
    container.querySelectorAll('*').forEach(el => {
        if (!el.querySelector('img, iframe, input') && el.textContent.trim() === '' && el.tagName !== 'BR') {
             try { el.remove(); } catch(e){}
        }
    });

    const cutEverythingBelowAndRemove = (node, maxContainer) => {
        if (!node || !maxContainer.contains(node)) return;
        let current = node;
        while(current && current !== maxContainer) {
            let next = current.nextElementSibling || current.nextSibling;
            while (next) {
                let t = next;
                next = next.nextElementSibling || next.nextSibling;
                if (t.remove) t.remove();
            }
            current = current.parentElement;
        }
        if (node.remove) node.remove();
    };

    // 3. 杀掉公司宣发段落
    const elements = container.querySelectorAll('*');
    let foundNode = null;
    const cutKeywords = [
        'company', 'about us', 'factory show', 'factory display', 'certifications', 'exhibition',
        'contact us', 'why choose us', 'faq', 'f.a.q', 'frequently asked question'
    ];
    for (const el of elements) {
        if (el.children.length === 0 && el.textContent) {
            const text = el.textContent.toLowerCase().trim();
            if (cutKeywords.some(keyword => text.includes(keyword))) {
                foundNode = el; break;
            }
        }
    }
    if (foundNode) cutEverythingBelowAndRemove(foundNode, container);

    container.dispatchEvent(new Event('input', {bubbles: true}));
    container.dispatchEvent(new Event('blur', {bubbles: true}));
};

// --- initRPAButton ---
// 在采集箱列表页注入 RPA 母舰按钮

window.initRPAButton = function() {
    if (!window.isRPACollectionBoxPage || !window.isRPACollectionBoxPage()) return;
    if (document.getElementById('ai-rpa-mother-btn')) {
        if (window.refreshRPAButtonState) window.refreshRPAButtonState();
        window.ensureOptimizationModeSelector(document.getElementById('ai-rpa-mother-btn'), 'rpa-optimization-mode-selector', { surface: 'rpa' });
        return;
    }

    // 定位采集箱头部的任意锚点按钮，增加对超链接和DIV按钮的兼容性
    const snap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.listPageAnchors[0]}') or contains(., '${window.UI_TEXT_CONFIG.listPageAnchors[1]}') or contains(., '${window.UI_TEXT_CONFIG.listPageAnchors[2]}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    let anchor = null;
    for (let i = 0; i < snap.snapshotLength; i++) {
        const parentBtn = snap.snapshotItem(i).closest('button, .btn, .ant-btn, .el-button, a');
        // 同时排查一些非标按钮
        if (parentBtn && parentBtn.offsetHeight > 0) {
            anchor = parentBtn;
            break;
        }
    }

    if (!anchor) {
        // 退源方案：找页面第一个明显的按钮区
        anchor = document.querySelector('.btn-group, .el-button-group') || document.querySelector('.page-title');
    }
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'ai-rpa-mother-btn';
    btn.className = 'ai-optimize-btn';
    btn.type = 'button';
    btn.style.marginLeft = '12px'; btn.style.marginRight = '12px';
    btn.style.color = 'white'; btn.style.height = (anchor.offsetHeight || 32) + 'px';
    btn.style.lineHeight = ((anchor.offsetHeight || 32) - 2) + 'px';
    btn.style.padding = '0 16px'; btn.style.verticalAlign = 'top';

    const renderRPAState = () => {
        if (sessionStorage.getItem('rpa_running') === '1') {
             btn.innerHTML = '🛑 拦截并停止 RPA 母舰';
             btn.style.background = 'linear-gradient(135deg, #52c41a, #389e0d)';
             btn.style.boxShadow = '0 2px 6px rgba(82, 196, 26, 0.4)';
        } else {
             btn.innerHTML = '🤖 启动 RPA 流水线工厂 (每次5个)';
             btn.style.background = 'linear-gradient(135deg, #f5222d, #cf1322)';
             btn.style.boxShadow = '0 2px 6px rgba(245, 34, 45, 0.4)';
        }
    };
    window.refreshRPAButtonState = renderRPAState;
    renderRPAState();

    btn.onclick = async (e) => {
        e.preventDefault();
        if (sessionStorage.getItem('rpa_running') === '1') {
            window.closeRpaTabsForCurrentRun();
            sessionStorage.removeItem('rpa_running');
            window.clearRpaStoreLock();
            window.clearRpaDescriptionCleanupLevel();
            window.clearRpaAttributeFixMode();
            window.clearRpaSaveDestination();
            window.clearRpaProcessedProductIds();
            window.clearRpaForbiddenWordCleanupEnabled();
            window.clearRpaCurrentRunId();
            if (window.RpaRunState) await window.RpaRunState.update({ type: 'status', status: 'stopped', message: '用户手动停止 RPA。' });
            renderRPAState();
            alert("🛑 您已强行切断母线！机器人不拔插头不歇业，当前这门跑完了就彻底停机！");
        } else {
            const confirmMsg = `🚀 开机密码确认：无人职守 RPA大屠杀 模式！\n\n系统规则：\n1. 每次自动拔出顶部 5 个未被发布的产品放入子机页签处理。\n2. 纯无人管线流转：强译 -> 切版 -> 杀字斩图 -> 参数凝缩 -> 按选择保存 -> 拔插头关闭。\n3. 当前 5 台子机彻底干完炸碎后，母舰自动重查名单派下5台，无限轮回！\n\n【防拦截告警】第一次开炮必然被谷歌判定出窗口流，请紧盯左上角或右侧地址栏的红标【始终允许】！确认投送吗？`;
            if (confirm(confirmMsg)) {
                const descriptionCleanupLevel = window.confirmDescriptionCleanupLevel
                    ? await window.confirmDescriptionCleanupLevel()
                    : 'deep';
                const attributeFixMode = window.confirmAttributeFixMode
                    ? await window.confirmAttributeFixMode()
                    : 'conservative';
                const saveDestination = window.confirmRpaSaveDestination
                    ? await window.confirmRpaSaveDestination()
                    : RPA_SAVE_DESTINATIONS.PENDING_PUBLISH;
                let plugType = window.currentPlugType || 'no_plug';
                await window.startRpaAsDedicatedRunner(renderRPAState, { descriptionCleanupLevel, attributeFixMode, saveDestination, plugType });
            }
        }
    };

    anchor.parentNode.insertBefore(btn, anchor);
    window.ensureOptimizationModeSelector(btn, 'rpa-optimization-mode-selector', { surface: 'rpa' });
    if (typeof window.ensurePlugTypeSelector === 'function') {
        window.ensurePlugTypeSelector(document.getElementById('rpa-optimization-mode-selector'), 'rpa-plug-type-selector');
    }
};

// --- startRPAQueue ---
// RPA 母舰队列：提取编辑链接 → 打开子标签页 → 等待完成 → 刷新继续

window.startRPAQueue = function() {
    if (sessionStorage.getItem('rpa_running') !== '1') return;
    if (window.getRpaPauseReason && window.getRpaPauseReason() === 'space_full') return;
    if (!window.ensureRpaStoreLockBeforeQueue()) return;
    const rpaMode = window.getRpaOptimizationMode();

    // 获取处于列表中的编辑链接 (过滤出那些字面全是"编辑"的 a 标签，去除多余空格换行)
    const manualReviewIds = window.getRpaManualReviewProductIds();
    const processedIds = window.getRpaProcessedProductIds();
    const visibleEditLinks = window.RpaPageTargeting.getCollectionBoxEditLinks(document);
    const allEditLinks = visibleEditLinks.filter(a => {
        const productId = window.getRpaProductIdFromEditLink(a);
        return !productId || (!manualReviewIds.has(productId) && !processedIds.has(productId));
    });
    // 只要看到名字叫"编辑"的叶子节点就可以，因为我们这回用原生触发法解决！
    // 不再过滤网链！

    if (allEditLinks.length === 0) {
        if (visibleEditLinks.length > 0) {
            const skippedFlags = visibleEditLinks.reduce((flags, link) => {
                const productId = window.getRpaProductIdFromEditLink(link);
                return {
                    manual: flags.manual || (productId && manualReviewIds.has(productId)),
                    processed: flags.processed || (productId && processedIds.has(productId))
                };
            }, { manual: false, processed: false });
            const finishMessage = skippedFlags.processed && skippedFlags.manual
                ? '采集箱中只剩本轮已处理产品和待人工处理产品，RPA 自动部分已完成。'
                : skippedFlags.processed
                    ? '采集箱中只剩本轮已处理产品，RPA 自动部分已完成。'
                    : '采集箱中只剩待人工处理产品，RPA 自动部分已完成。';
            window.finishRpaQueue(finishMessage);
            return;
        }
        if (!window._rpa_queue_empty_stable) {
            window._rpa_queue_started_for_document = false;
            if (window.RpaRunState) window.RpaRunState.update({ type: 'note', message: '采集箱列表暂未渲染出编辑链接，继续等待下一批。' });
            if (window.scheduleRpaQueueResumeRetry) window.scheduleRpaQueueResumeRetry('edit_links_not_ready');
            console.log('[RPA 母舰] 暂未发现编辑链接，保持运行状态并等待采集箱渲染。');
            return;
        }
        window.finishRpaQueue('采集箱中没有剩余待处理产品，RPA 已完成。');
        return;
    }

    const batch = allEditLinks.slice(0, 5); // 抓 5 个目标

    window._rpa_finished_count = 0;
    window._rpa_success_count = window._rpa_success_count || 0;
    window._rpa_failed_count = window._rpa_failed_count || 0;
    window._rpa_current_batch_size = batch.length;
    window._rpa_seen_child_result_ids = new Set();

    if (!window._rpa_bc) {
        window._rpa_bc = new BroadcastChannel('rpa_channel');
        window._rpa_bc.onmessage = (e) => {
            const data = e.data;
            const currentRunId = window.getRpaCurrentRunId();
            if (currentRunId && (!data || typeof data !== 'object' || data.runId !== currentRunId)) {
                console.warn('[RPA 母舰] 忽略其他运行或缺少 runId 的子页消息。');
                return;
            }
            if (typeof data === 'object' && data.type === 'space_full') {
                sessionStorage.setItem('rpa_space_phase', 'preflight');
                if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'paused_space', message: '检测到图片空间不足，正在进入图片管理恢复空间。' });
                console.warn('[RPA 母舰] 检测到图片空间不足，暂停队列并进入图片管理：', data.reason || '');
                window.startRpaImageSpacePreflight().catch((error) => {
                    window.closeRpaTabsForCurrentRun();
                    sessionStorage.removeItem('rpa_running');
                    window.clearRpaStoreLock();
                    window.clearRpaDescriptionCleanupLevel();
                    window.clearRpaSaveDestination();
                    window.clearRpaProcessedProductIds();
                    window.clearRpaCurrentRunId();
                    console.error('[RPA 母舰] 图片空间恢复无法启动：', error);
                    alert(`\u26a0\ufe0f RPA \u5df2\u505c\u6b62\uff1a${window.UI_TEXT_CONFIG.rpa.spaceRecoveryFailed} ${error.message}`);
                });
                return;
            }
            if (typeof data === 'object' && data.status === 'needs_review') {
                const productId = window.markRpaProductForManualReview(data.productUrl);
                if (window.RpaRunState) window.RpaRunState.update({
                    type: 'product_result',
                    url: data.productUrl || 'unknown',
                    status: 'needs_review',
                    detail: productId ? `保存未确认，待手工处理：产品 ${productId}` : '保存未确认，待手工处理。'
                });
                console.warn('[RPA 母舰] 子页面保存未确认，已标记为待手工处理并继续其他任务：', data.diagnostics || {});
            }
            if (typeof data === 'object' && data.status === 'failed') {
                const productId = window.markRpaProductForManualReview(data.productUrl);
                if (window.RpaRunState) window.RpaRunState.update({
                    type: 'product_result',
                    url: data.productUrl || 'unknown',
                    status: 'failed',
                    detail: productId ? `执行异常，待手工处理：产品 ${productId}` : (data.detail || '执行异常，待手工处理。')
                });
                console.warn('[RPA 母舰] 子页面异常，已标记为待手工处理并继续其他任务：', data.detail || '');
            }
            // 兼容旧格式字符串 + 新格式对象
            const isFinished = (typeof data === 'string' && data === 'child_closed') || (typeof data === 'object' && data.status);
            if (isFinished && (typeof data !== 'object' || window.RpaSafety.shouldContinueAfterProductResult(data.status))) {
                window._rpa_finished_count++;
                window.setRpaBatchDispatchedAt();
                if (typeof data === 'object') {
                    if (data.status === 'success') {
                        window._rpa_success_count++;
                        window.markRpaProductAsProcessed(data.productUrl);
                    }
                    else if (data.status === 'needs_review') window._rpa_needs_review_count = (window._rpa_needs_review_count || 0) + 1;
                    else window._rpa_failed_count++;
                    if (!['needs_review', 'failed'].includes(data.status) && window.RpaRunState) {
                        window.RpaRunState.update({ type: 'product_result', url: data.productUrl || 'unknown', status: data.status, detail: data.detail || '' });
                    }
                }
                console.log(`[RPA 母舰] 进度: ${window._rpa_finished_count}/${batch.length}`);
                if (window._rpa_finished_count >= batch.length) {
                    console.log('[RPA 母舰] 本批次完成，等待全部子标签页关闭后刷新...');
                    window.clearRpaBatchResultTimeout();
                    window.waitForAllTabsToCloseAndReload();
                }
            }
        };
    }

    console.log("[RPA 母舰] 锁定目标，提取编辑链接...");
    const editUrls = [];
    batch.forEach(a => {
        let url = window.resolveProductEditUrlFromLink(a);

        if (url) {
            const rowCost = window.SkuPricing && window.SkuPricing.parseSourcePrice
                ? window.SkuPricing.parseSourcePrice((link.closest && (link.closest('tr, [class*="row"]') || {}).innerText) || '')
                : null;
            if (rowCost) url = window.appendRpaQueryParam(url, 'rpa_source_cost', String(rowCost));
            url = window.appendRpaQueryParam(url, 'rpa_auto', '1');
            url = window.appendRpaQueryParam(url, 'opt_mode', rpaMode);
            url = window.appendRpaQueryParam(url, 'desc_clean', window.getRpaDescriptionCleanupLevel());
            url = window.appendRpaQueryParam(url, 'rpa_fix_mode', window.getRpaAttributeFixMode());
            url = window.appendRpaQueryParam(url, 'save_dest', window.getRpaSaveDestination());
            url = window.appendRpaQueryParam(url, 'clean_fw', window.isRpaForbiddenWordCleanupEnabled() ? '1' : '0');
            url = window.appendRpaQueryParam(url, 'rpa_run_id', window.getRpaCurrentRunId());
            if (rpaMode === 'plug') url = window.appendRpaQueryParam(url, 'opt_plug_type', window.getRpaPlugType());
            editUrls.push(url);
        }
    });

    if (editUrls.length > 0) {
        console.log(`[RPA 母舰] 提取到 ${editUrls.length} 个编辑URL，通过扩展API打开标签页...`);
        if (window.RpaRunState) window.RpaRunState.update({ type: 'batch_opened', urls: editUrls, message: `本批次已派发 ${editUrls.length} 个产品。` });
        chrome.runtime.sendMessage({
            action: 'open_rpa_tabs',
            runId: window.getRpaCurrentRunId(),
            urls: editUrls
        });
        window.setRpaBatchDispatchedAt();
        window.scheduleRpaBatchResultTimeout();
    } else {
        console.warn("[RPA 母舰] 未能提取到任何编辑URL，尝试降级为原生点击...");
        // 修复被 AI 覆盖的防 CSP 拦截与错峰点击代码
        let delay = 0;
        batch.forEach((a) => {
            setTimeout(() => {
                try {
                    const rect = a.getBoundingClientRect();
                    const opts = { bubbles: true, cancelable: true, view: window, clientX: Math.max(0, rect.left + rect.width / 2), clientY: Math.max(0, rect.top + rect.height / 2) };
                    a.dispatchEvent(new MouseEvent('mousedown', opts));
                    a.dispatchEvent(new MouseEvent('mouseup', opts));
                    a.dispatchEvent(new MouseEvent('click', opts));
                } catch (e) { console.error("[RPA] 原生模拟点击报错:", e); }
            }, delay);
            delay += 600;
        });
        window.setRpaBatchDispatchedAt();
        window.scheduleRpaBatchResultTimeout();
    }

    // 母舰弹窗巡逻：自动跳过分类编辑、关闭提示弹窗
    setInterval(() => {
        const allBtns = document.querySelectorAll('button, .el-button, .ant-btn');
        for (const btn of allBtns) {
            const text = (btn.innerText || btn.textContent || '').replace(/\s+/g, '');
            // "跳过，去编辑产品" 分类弹窗
            if (text.includes(window.UI_TEXT_CONFIG.skipEditProduct[0]) && text.includes(window.UI_TEXT_CONFIG.skipEditProduct[1]) && btn.offsetHeight > 0) {
                console.log('[RPA 母舰] 自动跳过分类编辑弹窗');
                btn.click();
            }
            // "确定" 通用提示弹窗
            if ((text === window.UI_TEXT_CONFIG.confirmBtn[0] || text === window.UI_TEXT_CONFIG.confirmBtn[1]) && btn.offsetHeight > 0 && btn.closest('.el-message-box, .ant-modal, .el-dialog')) {
                console.log('[RPA 母舰] 自动关闭提示弹窗');
                btn.click();
            }
        }
    }, 800);

    // 兜底护卫机制：60秒后检查子标签是否全部关闭，未关时也走等待队列
    setTimeout(() => {
        if (sessionStorage.getItem('rpa_running') === '1') {
             console.log("[RPA 母舰] 兜底超时触发，进入等待队列...");
             window.waitForAllTabsToCloseAndReload();
        }
    }, 60000);
};

// ============================================
// main.js — 初始化入口 + 模式控制 + RPA 编排
// ============================================

// ============================================
// main.js — UI 按钮注入 + 管线逻辑 + 安检 + 同步 + 初始化入口
// 所有函数挂载到 window 上，供其他模块直接调用
// ============================================

const MANUAL_OPTIMIZATION_MODE_OPTIONS = [
    { value: 'normal', label: '普通产品' },
    { value: 'plug', label: '🔌 插头优化' }
];

const BATCH_OPTIMIZATION_MODE_OPTIONS = [
    { value: 'normal', label: '普通产品' },
    { value: 'plug', label: '插头优化' }
];

const RPA_OPTIMIZATION_MODE_OPTIONS = [
    { value: 'normal', label: '普通产品' },
    { value: 'plug', label: '插头' }
];

const STYLE_INLINE_FLEX_WRAPPER = 'display:inline-flex;align-items:center;gap:5px;margin-left:8px;vertical-align:top;white-space:nowrap;';
const STYLE_FILTER_LABEL = 'font-size:12px;color:#666;font-weight:bold;';
const STYLE_MODE_SELECT = 'height:32px;padding:0 6px;border:1px solid #722ed1;border-radius:4px;color:#531dab;background:#fff;font-size:12px;cursor:pointer;';
const STYLE_PLUG_SELECT = 'height:32px;padding:0 6px;border:1px solid #d9d9d9;border-radius:4px;color:#333;background:#fff;font-size:12px;cursor:pointer;';
// --- 初始化入口 ---

window.init = function() {
    const isProgrammaticReload = sessionStorage.getItem('rpa_programmatic_reload') === '1';
    sessionStorage.removeItem('rpa_programmatic_reload');
    const currentIsEditPage = window.location.href.includes('/web/smt/edit');
    const previousRunId = window.getRpaCurrentRunId ? window.getRpaCurrentRunId() : '';

    if (window.shouldResetRpaRunnerState({ isProgrammaticReload, isEditPage: currentIsEditPage })) {
        if (window.clearRpaStoreLock) window.clearRpaStoreLock();
        if (window.clearRpaDescriptionCleanupLevel) window.clearRpaDescriptionCleanupLevel();
        if (window.clearRpaSaveDestination) window.clearRpaSaveDestination();
        if (window.clearRpaProcessedProductIds) window.clearRpaProcessedProductIds();
        if (window.clearRpaBatchResultTimeout) window.clearRpaBatchResultTimeout();
        sessionStorage.removeItem('rpa_active_urls');
        sessionStorage.removeItem('rpa_image_resize');
        sessionStorage.removeItem('rpa_clean_forbidden_words');
        if (window.RpaRunState && window.RpaRunState.clear) {
            window.RpaRunState.clear();
        }
        // 仅在母舰页（采集箱）关闭上一轮残留的RPA子标签。
        // 子编辑页不需要也绝不能执行此操作，否则一打开就被自己关掉。
        try {
            if (previousRunId) chrome.runtime.sendMessage({ action: 'close_all_rpa_edit_tabs', runId: previousRunId });
        } catch (_) {}
        sessionStorage.removeItem('rpa_current_run_id');
    }

    const modeFromUrl = new URL(window.location.href).searchParams.get('opt_mode');
    const normalizedModeFromUrl = window.normalizeOptimizationMode(modeFromUrl);
    if (normalizedModeFromUrl !== 'normal') {
        window._forcedOptimizationMode = normalizedModeFromUrl;
        window.optimizationMode = normalizedModeFromUrl;
    }
    const plugTypeFromUrl = new URL(window.location.href).searchParams.get('opt_plug_type');
    if (plugTypeFromUrl && window.PlugSelection && window.PlugSelection.PLUG_TYPE_LABELS[plugTypeFromUrl]) {
        window.currentPlugType = plugTypeFromUrl;
        if (window.setRpaPlugType) window.setRpaPlugType(plugTypeFromUrl);
    }
    if (!window.currentPlugType) {
        window.currentPlugType = 'no_plug';
    }
    window.loadData();
    if (window.tryRunRpaImageSpacePreflight) window.tryRunRpaImageSpacePreflight();
    if (window.tryResumeRpaQueueAfterSpacePreflight) window.tryResumeRpaQueueAfterSpacePreflight();
    window.tryInjectButtons();
    const observer = new MutationObserver(() => {
        if (window._dianxiaomi_inject_timer) clearTimeout(window._dianxiaomi_inject_timer);
        window._dianxiaomi_inject_timer = setTimeout(() => {
            window.tryInjectButtons();
            if (window.tryRunRpaImageSpacePreflight) window.tryRunRpaImageSpacePreflight();
            if (window.tryResumeRpaQueueAfterSpacePreflight) window.tryResumeRpaQueueAfterSpacePreflight();
        }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 植入 window.open() 劫持器，为了突破草稿箱里的 javascript:void(0) 隐式调用
    if (!document.getElementById('rpa-open-hook')) {
        const script = document.createElement('script');
        script.id = 'rpa-open-hook';
        script.src = chrome.runtime.getURL('src/platform/inject-open-hook.js');
        document.documentElement.appendChild(script);
    }

    // RPA Trigger Hooks
    const urlStr = window.location.href.toLowerCase();

    if (sessionStorage.getItem('rpa_child_active') === '1' && !urlStr.includes('rpa_auto=1')) {
        sessionStorage.removeItem('rpa_child_active');
        if (typeof window.closeRpaTabWithFallback === 'function') {
            window.closeRpaTabWithFallback();
        } else {
            chrome.runtime.sendMessage({ action: 'close_tab', runId: window.getRpaCurrentRunId ? window.getRpaCurrentRunId() : '' }, () => { chrome.runtime.lastError; });
        }
        return;
    }
    if (urlStr.includes('rpa_auto=1') || (sessionStorage.getItem('rpa_running') === '1' && urlStr.includes('edit'))) {
        if (sessionStorage.getItem('rpa_child_active') === '1') return;
        sessionStorage.setItem('rpa_child_active', '1');
        window.waitForXPath(`//text()[contains(., '${window.UI_TEXT_CONFIG.oneClickTranslate}')]/parent::*`, { timeout: 30000, interval: 500 })
            .then(async () => {
                await new Promise(r => setTimeout(r, 800));
                window.executeRPAChildProcess();
            });
    } else {
        if (window.tryResumeRpaQueueAfterSpacePreflight) window.tryResumeRpaQueueAfterSpacePreflight();
    }
};
// 图片空间预检会先离开采集箱再返回。返回时页面正文通常比 content script 晚到，
// 因此必须在首屏和后续 DOM 更新中重试，而不是仅在 init 的那一刻判断一次。
window.RPA_QUEUE_EMPTY_STABLE_MS = window.RPA_QUEUE_EMPTY_STABLE_MS || 2500;
window.RPA_QUEUE_RESUME_WAIT_MS = window.RPA_QUEUE_RESUME_WAIT_MS || 90000;
window.RPA_QUEUE_RESUME_RETRY_MS = window.RPA_QUEUE_RESUME_RETRY_MS || 1500;
window.getRpaQueueEditLinks = function() {
    return Array.from(document.querySelectorAll('a')).filter((link) => {
        return (link.innerText || link.textContent || '').replace(/\s+/g, '') === window.UI_TEXT_CONFIG.editLink;
    });
};
window.getRpaQueueEmptyStable = function(pageText) {
    const hasEmptySignal = window.RpaPageTargeting && window.RpaPageTargeting.hasEmptyCollectionSignal
        ? window.RpaPageTargeting.hasEmptyCollectionSignal(pageText)
        : String(pageText || '').replace(/\s+/g, '').includes('暂无数据');
    if (!hasEmptySignal) {
        window._rpa_queue_empty_first_seen_at = 0;
        window._rpa_queue_empty_stable = false;
        return false;
    }
    if (!window._rpa_queue_empty_first_seen_at) window._rpa_queue_empty_first_seen_at = Date.now();
    window._rpa_queue_empty_stable = Date.now() - window._rpa_queue_empty_first_seen_at >= window.RPA_QUEUE_EMPTY_STABLE_MS;
    return window._rpa_queue_empty_stable;
};
window.getRpaQueueResumeState = function() {
    const pageText = document.body ? document.body.innerText : '';
    const editLinks = window.getRpaQueueEditLinks();
    const emptyStable = window.getRpaQueueEmptyStable(pageText);
    const decision = window.RpaPageTargeting.getQueueResumeDecision({
        rpaRunning: sessionStorage.getItem('rpa_running') === '1',
        spacePhase: sessionStorage.getItem('rpa_space_phase'),
        isCollectionBox: Boolean(window.isRPACollectionBoxPage && window.isRPACollectionBoxPage()),
        pageText,
        editLinkCount: editLinks.length,
        emptyStable
    });
    return { decision, editLinks, pageText, emptyStable };
};
window.scheduleRpaQueueResumeRetry = function(reason = 'waiting_for_collection_box_render') {
    if (sessionStorage.getItem('rpa_running') !== '1' || window._rpa_queue_resume_retry_timer) return;
    console.log(`[RPA 母舰] 采集箱暂未稳定，稍后继续检测：${reason}`);
    window._rpa_queue_resume_retry_timer = setTimeout(() => {
        window._rpa_queue_resume_retry_timer = null;
        if (sessionStorage.getItem('rpa_running') !== '1' || window._rpa_queue_started_for_document) return;
        window.tryResumeRpaQueueAfterSpacePreflight();
    }, window.RPA_QUEUE_RESUME_RETRY_MS);
};
window.tryResumeRpaQueueAfterSpacePreflight = function() {
    if (!window.RpaPageTargeting || !window.RpaPageTargeting.getQueueResumeDecision) return;
    const initialState = window.getRpaQueueResumeState();
    if (initialState.decision === 'idle' || window._rpa_queue_resume_waiting || window._rpa_queue_started_for_document) return;

    window._rpa_queue_resume_waiting = true;
    window.waitForElement(() => {
        const state = window.getRpaQueueResumeState();
        if (state.decision === 'start') return state.editLinks[0];
        if (state.decision === 'finalize') return document.body;
        return null;
    }, { timeout: window.RPA_QUEUE_RESUME_WAIT_MS, interval: 500 }).then((queueReady) => {
        window._rpa_queue_resume_waiting = false;
        const state = window.getRpaQueueResumeState();
        if (!queueReady || !['start', 'finalize'].includes(state.decision)) {
            window.scheduleRpaQueueResumeRetry('resume_wait_timeout');
            return;
        }
        if (window._rpa_queue_started_for_document) return;
        window._rpa_queue_started_for_document = true;
        window._rpa_queue_empty_stable = state.decision === 'finalize';
        if (state.decision === 'start' && window.openDeferredRpaWorkTabIfNeeded) {
            window.openDeferredRpaWorkTabIfNeeded();
        }
        window.startRPAQueue();
    });
};
window.tryInjectButtons = function() {
    window.initOptimizeTitleButton();
    window.initBulkOptimizeButton();
    window.initTopToolbarButtons();
    window.initRPAButton();
    if (window.initPendingEditLauncherButton) window.initPendingEditLauncherButton();
    if (window.initDxmClaimButton) window.initDxmClaimButton();
    if (window.ensureRpaRunCenter) window.ensureRpaRunCenter();
};
window.loadData = function() {
    chrome.storage.local.get(['whiteList', 'forbiddenWords', 'badImageCache', 'optimizationMode', 'manualOptimizationMode', 'rpaOptimizationMode'], (res) => {
        window.whiteList = res.whiteList || [];
        window.forbiddenWords = res.forbiddenWords || [];
        window.badImageCache = res.badImageCache || {};
        if (!window._forcedOptimizationMode) {
            const isRpaSurface = window.isRpaModeSurface && window.isRpaModeSurface();
            if (isRpaSurface) {
                window.optimizationMode = window.normalizeRpaOptimizationMode(res.rpaOptimizationMode || res.optimizationMode);
                if (!res.rpaOptimizationMode && res.optimizationMode) {
                    chrome.storage.local.set({ rpaOptimizationMode: window.optimizationMode });
                }
            } else {
                window.optimizationMode = window.normalizeManualOptimizationMode(res.manualOptimizationMode || res.optimizationMode);
                if (!res.manualOptimizationMode && res.optimizationMode) {
                    chrome.storage.local.set({ manualOptimizationMode: window.optimizationMode });
                }
            }
        }
        window.refreshOptimizationModeSelectors();
        window.tryInjectButtons();
    });
};
window.normalizeOptimizationMode = function(mode) {
    if (window.PlugSelection && window.PlugSelection.normalizeOptimizationMode) {
        return window.PlugSelection.normalizeOptimizationMode(mode);
    }
    if (mode === 'plug') return 'plug';
    return 'normal';
};

window.normalizeManualOptimizationMode = function(mode) {
    return window.normalizeOptimizationMode(mode);
};

window.normalizeRpaOptimizationMode = function(mode) {
    return window.normalizeOptimizationMode(mode);
};

window.isRpaModeSurface = function() {
    return Boolean(window.isRPACollectionBoxPage && window.isRPACollectionBoxPage());
};

window.isPlugOptimizationMode = function() {
    return window.normalizeOptimizationMode(window.optimizationMode) === 'plug';
};

window.isNoPlugBackfillMode = function() {
    return window.isPlugOptimizationMode();
};
window.getOptimizationModeForSelectorSurface = function(surface) {
    return surface === 'rpa'
        ? window.normalizeRpaOptimizationMode(window.optimizationMode)
        : window.normalizeManualOptimizationMode(window.optimizationMode);
};
window.refreshOptimizationModeSelectors = function() {
    document.querySelectorAll('select[data-optimization-mode-selector="true"]').forEach((select) => {
        if (document.activeElement === select) return;
        select.value = window.getOptimizationModeForSelectorSurface(select.dataset.optimizationModeSurface || 'manual');
    });
    document.querySelectorAll('#top-plug-type-selector').forEach((el) => {
        el.style.display = window.optimizationMode === 'plug' ? 'inline-flex' : 'none';
    });
};
window.setOptimizationMode = function(mode) {
    window._forcedOptimizationMode = null;
    window.optimizationMode = window.normalizeManualOptimizationMode(mode);
    window.refreshOptimizationModeSelectors();
    chrome.storage.local.set({ manualOptimizationMode: window.optimizationMode });
};
window.setRpaOptimizationMode = function(mode) {
    window._forcedOptimizationMode = null;
    window.optimizationMode = window.normalizeRpaOptimizationMode(mode);
    window.refreshOptimizationModeSelectors();
    chrome.storage.local.set({ rpaOptimizationMode: window.optimizationMode });
};
// --- 4. UI 创建 (顶部工具栏) ---

// --- 4.2 单品页面变体管线 ---

// --- 4.5 AI 优化按钮 ---

window.startOptimizeTitle = function(btn, titleInput) {
    const rawTitle = titleInput.value.trim();
    if (!rawTitle) {
        alert("⚠️ 原标题为空，请先输入原始标题后再点击优化。");
        return;
    }

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = '⏳ 优化中...';
    btn.style.opacity = '0.7';
    btn.style.cursor = 'wait';

    chrome.runtime.sendMessage({ action: "optimize_title", title: rawTitle }, (response) => {
        btn.disabled = false;
        btn.innerHTML = oldText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';

        if (chrome.runtime.lastError) {
             alert("❌ 插件通信失败，请刷新页面后重试。");
             return;
        }

        if (response && response.success) {
            titleInput.value = response.title;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
            if (window.silentRemoveForbiddenWords) window.silentRemoveForbiddenWords();

            const toast = document.createElement('div');
            toast.className = 'ai-toast';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        } else {
            alert("❌ 优化失败：" + (response ? response.msg : '未知错误'));
        }
    });
};

// --- 4.8 批量 AI 优化 ---

// --- 批量 SKU 的稳定身份与安全回填 ---
// 店小秘批量表格会在编辑标题后重渲染，不能再用单元格数组下标定位 SKU。

// --- 4.9 深度扫雷净化 ---

// --- 5. 安检逻辑 ---

// --- 6. 报告弹窗 ---

// ==============================================
// === 🚀 9. 一键优化管线 (One-Click Pipeline) ===
// ==============================================

// --- 汽摩配全项优化：品牌在标题/详情中保留为 for Brand，在属性中整行删除 ---

// 店小秘会把格式错误提示渲染在具体属性行内。只读取该行的专用校验节点，
// 确认该行不能保存时才点击其后的删除叉，避免误删其他正常属性。
window.startOneClickOptimize = async function() {
    const getDescriptionCleanupLevel = async () => window.confirmDescriptionCleanupLevel
        ? await window.confirmDescriptionCleanupLevel()
        : window.DESCRIPTION_CLEANUP_LEVELS.DEEP;
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0';
    overlay.style.width = '100vw'; overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.zIndex = '99999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
    overlay.innerHTML = `<div style="background:white;padding:20px 40px;border-radius:8px;font-size:18px;font-weight:bold;color:#722ed1;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <div style="font-size:30px; margin-bottom:10px; text-align:center;">🚀</div>
    <div id="one-click-txt">正在呼出图片重置面板 (Phase 1/2)...</div>
    <div style="font-size:12px;color:#999;margin-top:10px;text-align:center;font-weight:normal;">结束后您可立即切走网页</div>
    </div>`;
    document.body.appendChild(overlay);

    try {
        if (window.isNoPlugBackfillMode && window.isNoPlugBackfillMode()) {
            const plugType = window.currentPlugType || (window.PlugSelection && window.PlugSelection.PLUG_TYPE_NO_PLUG) || 'no_plug';
            await window.runPlugOneClickOptimizePipeline((message, color) => {
                document.getElementById('one-click-txt').innerText = message;
                document.getElementById('one-click-txt').style.color = color;
            }, plugType);
        } else {
            const descriptionCleanupLevel = await getDescriptionCleanupLevel();
            await window.triggerImageResize();

            document.getElementById('one-click-txt').innerText = "后台静默管线运转中 (Phase 2/2)...";
            document.getElementById('one-click-txt').style.color = "#52c41a";

            window.silentRemoveForbiddenWords();
            await window.cleanupEmptyAttributes();
            await window.cleanupInvalidAttributes();
            // 自定义属性清洗：完全清洗删全部行，保守清洗仅删 Size/Weight 等命中行（默认保守）
            const attributeFixMode = typeof window.getRpaAttributeFixModeFromUrl === 'function'
                ? window.getRpaAttributeFixModeFromUrl(window.location.href)
                : window.ATTRIBUTE_CLEANUP_LEVELS.CONSERVATIVE;
            await window.cleanupCustomAttributesByLevel(attributeFixMode);
            window.runDescriptionCleanup({ level: descriptionCleanupLevel, mode: 'normal', surface: 'single' });
            window.silentOptimizeSingleProductVariants();
        }

        await new Promise(r => setTimeout(r, 500));

    } catch (e) {
        console.error("OneClickPipeline Error:", e);
        alert("流程发生异常: " + e.message);
    } finally {
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        const toast = document.createElement('div');
        toast.className = 'ai-toast';
        toast.innerText = window.isPlugOptimizationMode && window.isPlugOptimizationMode()
            ? '🎉 插头优化完成：已选择无电源插头并恢复客户原始销售信息。'
            : '🎉 第一阶段UI操作已完毕！其它优化任务转入系统后台静默提速处理，您可以切换至下一个产品了！';
        toast.style.background = window.isNoPlugBackfillMode && window.isNoPlugBackfillMode() ? '#1677ff' : '#722ed1';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
};
// --- ⭐⭐⭐ 8. 同步功能 ---

window.fetchWithFallback = async function(urls) {
    let lastError = null;
    for (const url of urls) {
        try {
            const res = await fetch(`${url}?pageNo=1&pageSize=5000`);
            if (res.ok) {
                const text = await res.text();
                if (text.trim().startsWith('{')) {
                    const data = JSON.parse(text);
                    if (data && data.data && data.data.page && data.data.page.list) return data;
                }
            }
        } catch (err) { }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: 'pageNo=1&pageSize=5000'
            });
            if (res.ok) {
                const text = await res.text();
                 if (text.trim().startsWith('{')) {
                    const data = JSON.parse(text);
                    if (data && data.data && data.data.page && data.data.page.list) return data;
                 }
            }
        } catch (err) { lastError = err; }
    }
    throw lastError || new Error("所有接口尝试失败");
};
if (window === window.top) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.forbiddenWords) window.forbiddenWords = changes.forbiddenWords.newValue || [];
            if (changes.whiteList) window.whiteList = changes.whiteList.newValue || [];
            if (changes.badImageCache) window.badImageCache = changes.badImageCache.newValue || {};

            if (changes.rpaOptimizationMode && !window._forcedOptimizationMode && window.isRpaModeSurface && window.isRpaModeSurface()) {
                window.optimizationMode = window.normalizeRpaOptimizationMode(changes.rpaOptimizationMode.newValue);
                window.refreshOptimizationModeSelectors();
            }
            if (changes.manualOptimizationMode && !window._forcedOptimizationMode && (!window.isRpaModeSurface || !window.isRpaModeSurface())) {
                window.optimizationMode = window.normalizeManualOptimizationMode(changes.manualOptimizationMode.newValue);
                window.refreshOptimizationModeSelectors();
            }
        }
    });
}
// --- 启动入口 ---
if (window === window.top) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "start_sync_proxy") {
            window.fetchWithFallback(window.API_CANDIDATES)
                .then(data => {
                    const rawList = data.data.page.list;
                    const cleanList = rawList.map(item => item.bannedWord).filter(w => w);
                    chrome.storage.local.set({ 'forbiddenWords': cleanList }, () => {
                        sendResponse({ success: true, count: cleanList.length });
                    });
                })
                .catch(err => {
                    sendResponse({ success: false, msg: "同步失败：请确保已登录店小秘，并刷新页面重试。" });
                });
            return true;
        }
    });

    window.init();
}

// ============================================
// rpa-image-space.js — RPA 图片空间预检与恢复
// ============================================

(function() {
    const MINIMUM_SPACE_MB = 50;
    const PHASE_KEY = 'rpa_space_phase';
    const RETURN_URL_KEY = 'rpa_space_return_url';
    const PAUSE_KEY = 'dianxiaomi_rpa_pause_reason';
    const SPACE_FULL_REASON = 'space_full';
    const IMAGE_MANAGER_PATH = '/web/service/album';

    function visible(element) {
        return Boolean(element && element.offsetWidth > 0 && element.offsetHeight > 0);
    }

    function normalizedText(element) {
        return String(element && (element.innerText || element.textContent) || '').replace(/\s+/g, '').trim();
    }

    function cardText(candidate) {
        return String(candidate && (candidate.text || candidate.innerText || candidate.textContent) || '');
    }

    function hasFileMetadata(text) {
        return /\.(?:jpe?g|png|gif|webp|bmp)\b/i.test(text)
            || /\b\d{2,5}\s*[x×]\s*\d{2,5}\b/i.test(text)
            || /\b\d+(?:\.\d+)?\s*(?:KB|K|MB|M)\b/i.test(text);
    }

    function hasDeletableImageCards(candidates) {
        return (candidates || []).some((candidate) => {
            if (!candidate || candidate.visible === false) return false;
            const text = cardText(candidate);
            const normalized = text.replace(/\s+/g, '');
            const imageCount = Number(candidate.imageCount || 0);
            const checkboxCount = Number(candidate.checkboxCount || 0);
            const deleteButtonCount = Number(candidate.deleteButtonCount || 0);
            const hasImage = imageCount > 0;
            const hasOperation = checkboxCount > 0
                || deleteButtonCount > 0
                || /选用|删除|未锁定/.test(normalized);
            return hasImage && hasOperation && hasFileMetadata(text);
        });
    }

    function findVisibleText(text, exact = false) {
        return Array.from(document.querySelectorAll('a, button, span, div, li, label')).find((element) => {
            const value = normalizedText(element);
            return visible(element) && (exact ? value === text : value.includes(text));
        }) || null;
    }

    function findClickableText(text, exact = false) {
        const element = findVisibleText(text, exact);
        return element && (element.closest('a, button, li, label, [role="button"], .el-button, .ant-btn') || element);
    }

    function selectImageManagementEntry(candidates) {
        return (candidates || [])
            .filter((candidate) => candidate.visible && candidate.label === '图片管理')
            .sort((left, right) => left.top - right.top)[0] || null;
    }

    function resolveImageManagerUrl(originUrl) {
        return new URL(IMAGE_MANAGER_PATH, originUrl).href;
    }

    function parseVxePager(currentValue, totalValue) {
        const currentPage = Number(String(currentValue || '').trim());
        const totalPages = Number(String(totalValue || '').replace(/[^\d]/g, ''));
        if (!Number.isInteger(currentPage) || currentPage < 1 || !Number.isInteger(totalPages) || totalPages < currentPage) {
            return null;
        }
        return { currentPage, totalPages };
    }

    function parsePositiveInteger(value) {
        const text = String(value || '').replace(/[,\s]/g, '');
        const number = Number(text);
        return Number.isInteger(number) && number > 0 ? number : null;
    }

    function parseVxeRangeText(value) {
        const text = String(value || '').replace(/\s+/g, '');
        const match = text.match(/第([\d,]+)[\-－—~至]+([\d,]+)条[,，]?共([\d,]+)条/);
        if (!match) return null;
        const rangeStart = parsePositiveInteger(match[1]);
        const rangeEnd = parsePositiveInteger(match[2]);
        const totalRecords = parsePositiveInteger(match[3]);
        if (!rangeStart || !rangeEnd || !totalRecords || rangeStart > rangeEnd || rangeEnd > totalRecords) return null;
        return { rangeStart, rangeEnd, totalRecords };
    }

    function isPageSizeLabel(value) {
        return /^\d+条\/页$/.test(String(value || '').replace(/\s+/g, '').trim());
    }

    function parsePageSizeLabel(value) {
        const match = String(value || '').replace(/\s+/g, '').trim().match(/^(\d+)条\/页$/);
        return match ? parsePositiveInteger(match[1]) : null;
    }

    function getRangePage(range, pageSize) {
        if (!range || !pageSize) return null;
        const page = Math.floor((range.rangeStart - 1) / pageSize) + 1;
        return Number.isInteger(page) && page > 0 ? page : null;
    }

    function getRangeTotalPages(range, pageSize) {
        if (!range || !pageSize) return null;
        const pages = Math.ceil(range.totalRecords / pageSize);
        return Number.isInteger(pages) && pages > 0 ? pages : null;
    }

    function isPaginationActuallyAtPage(state, page) {
        const targetPage = Number(page);
        if (!state || !Number.isInteger(targetPage) || targetPage < 1) return false;
        if (Number(state.currentPage) !== targetPage) return false;
        if (state.type !== 'vxe' || !state.range || !state.pageSize) return true;
        return getRangePage(state.range, state.pageSize) === targetPage;
    }

    function findVxePageSizeOption(options, panelIsOpen) {
        if (!panelIsOpen) return null;
        return (options || []).find((option) => String(option && option.label || '').replace(/\s+/g, '') === '100条/页') || null;
    }

    function getVisibleVxePager() {
        return Array.from(document.querySelectorAll('.vxe-pager')).find(visible) || null;
    }

    function getImageManagementEntry() {
        const candidates = Array.from(document.querySelectorAll('a, button, span, div, li, label')).map((element) => {
            const rect = element.getBoundingClientRect();
            return {
                label: normalizedText(element),
                visible: visible(element),
                top: rect.top,
                element
            };
        });
        const candidate = selectImageManagementEntry(candidates);
        return candidate && (candidate.element.closest('a, button, li, [role="button"], .el-button, .ant-btn') || candidate.element);
    }

    function getTopServiceMenuTrigger() {
        return Array.from(document.querySelectorAll('a, button, span, div, li')).map((element) => ({
            element,
            label: normalizedText(element),
            visible: visible(element),
            top: element.getBoundingClientRect().top
        }))
            .filter((candidate) => candidate.visible && candidate.label === '服务' && candidate.top < 140)
            .sort((left, right) => left.top - right.top)[0]?.element || null;
    }

    function openServiceMenu(trigger) {
        const clickable = trigger.closest('a, button, li, [role="button"], .el-menu-item') || trigger;
        for (const target of [trigger, clickable]) {
            target.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
            target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        }
        clickable.click();
    }

    function wait(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function waitFor(check, timeout = 10000, interval = 300) {
        return window.waitForElement(check, { timeout, interval });
    }

    function setNativeValue(input, value) {
        const proto = input instanceof HTMLInputElement ? HTMLInputElement.prototype : Object.getPrototypeOf(input);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (typeof input.focus === 'function') input.focus();
        if (typeof input.select === 'function') input.select();
        if (setter && setter.set) setter.set.call(input, String(value));
        else input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        const enterEvent = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        input.dispatchEvent(new KeyboardEvent('keydown', enterEvent));
        input.dispatchEvent(new KeyboardEvent('keypress', enterEvent));
        input.dispatchEvent(new KeyboardEvent('keyup', enterEvent));
        input.blur();
    }

    window.isRpaImageManagerPage = function() {
        const text = normalizedText(document.body);
        return text.includes('空间使用情况') && text.includes('图片分类') && text.includes('文件类型');
    };

    window.getRpaImageSpaceText = function() {
        const text = document.body ? document.body.innerText : '';
        const match = text.match(/剩余(?:空间|容量)?\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:KB|K|MB|M|GB|G)\b/i);
        return match ? match[0] : '';
    };

    window.getRpaImagePagination = function() {
        // 店小秘当前页面使用 VXE Table 分页：页码与总页数分别位于
        // .vxe-pager--goto input 和 .vxe-pager--count，文本不再包含旧版的 “1 / 5105”。
        const vxePager = getVisibleVxePager();
        if (vxePager) {
            const input = vxePager.querySelector('.vxe-pager--goto input');
            const total = vxePager.querySelector('.vxe-pager--count');
            const sizeInput = vxePager.querySelector('.vxe-pager--sizes input');
            const pageSize = parsePageSizeLabel(sizeInput && sizeInput.value);
            const range = parseVxeRangeText(vxePager.textContent);
            const parsed = input && total && parseVxePager(input.value, total.textContent);
            if (parsed) {
                const rangePage = getRangePage(range, pageSize);
                const rangeTotalPages = getRangeTotalPages(range, pageSize);
                return {
                    ...parsed,
                    currentPage: rangePage || parsed.currentPage,
                    totalPages: rangeTotalPages || parsed.totalPages,
                    inputPage: parsed.currentPage,
                    pageSize,
                    range,
                    input,
                    pager: vxePager,
                    type: 'vxe'
                };
            }
        }

        for (const input of Array.from(document.querySelectorAll('input'))) {
            if (!visible(input) || !/^\d+$/.test(String(input.value || '').trim())) continue;
            let scope = input;
            for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
                const text = scope.innerText || scope.textContent || '';
                const match = text.match(/\/\s*(\d+)/);
                if (match) return { currentPage: Number(input.value), totalPages: Number(match[1]), input, pager: scope, type: 'legacy' };
            }
        }

        const match = (document.body ? document.body.innerText : '').match(/(\d+)\s*\/\s*(\d+)/);
        return match ? { currentPage: Number(match[1]), totalPages: Number(match[2]), input: null, pager: null, type: 'legacy' } : null;
    };

    async function setPageSizeTo100() {
        const pagination = window.getRpaImagePagination();
        if (!pagination) throw new Error('未能读取图片管理分页，已停止自动删图。');

        if (pagination.type === 'vxe' && pagination.pager) {
            const vxeSizeInput = pagination.pager.querySelector('.vxe-pager--sizes input');
            if (vxeSizeInput && normalizedText({ textContent: vxeSizeInput.value }) === '100条/页') return;

            const vxeSizeControl = vxeSizeInput && vxeSizeInput.closest('.vxe-select');
            if (!vxeSizeControl) throw new Error('未找到图片管理每页条数控件，已停止自动删图。');
            // VXE 的展开事件绑定在只读 input 上；点击外层容器会打开菜单，
            // 但在部分页面状态下会马上被同一次事件冒泡关闭。
            vxeSizeInput.click();
            const vxePanel = vxeSizeControl.querySelector('.vxe-select--panel');
            const openedPanel = await waitFor(() => {
                if (!vxePanel) return null;
                return getComputedStyle(vxePanel).display !== 'none' ? vxePanel : null;
            }, 5000);
            if (!openedPanel) throw new Error('未能打开图片管理每页条数下拉菜单，已停止自动删图。');

            const vxeOption = await waitFor(() => {
                const panelIsOpen = getComputedStyle(vxePanel).display !== 'none';
                const options = Array.from(vxePanel.querySelectorAll('.vxe-select-option')).map((element) => ({
                    label: normalizedText(element),
                    element
                }));
                const option = findVxePageSizeOption(options, panelIsOpen);
                return option && option.element ? option.element : null;
            }, 5000);
            if (!vxeOption) throw new Error('无法选择 100条/页，已停止自动删图。');
            vxeOption.click();
            const switched = await waitFor(() => {
                return vxeSizeInput.value === '100条/页' ? vxeSizeInput : null;
            }, 6000);
            if (!switched) throw new Error('图片管理未能切换到 100条/页，已停止自动删图。');
            await wait(350);
            return;
        }

        const pagerScope = pagination.pager || (pagination.input && pagination.input.parentElement && pagination.input.parentElement.parentElement);
        if (pagerScope && normalizedText(pagerScope).includes('100条/页')) return;

        const pageSizeControl = Array.from(document.querySelectorAll('button, span, div, li, input'))
            .find((element) => visible(element) && isPageSizeLabel(element.value || normalizedText(element)));
        const clickable = pageSizeControl && (pageSizeControl.closest('button, [role="button"], .el-select, .ant-select, div') || pageSizeControl);
        if (!clickable) throw new Error('未找到图片管理每页条数控件，已停止自动删图。');
        clickable.click();

        const option = await waitFor(() => {
            const options = Array.from(document.querySelectorAll('li, div, span')).filter((element) => visible(element) && normalizedText(element) === '100条/页');
            return options.length > 1 ? options[options.length - 1] : options[0] || null;
        }, 5000);
        if (!option) throw new Error('无法选择 100条/页，已停止自动删图。');
        (option.closest('li, [role="option"], div') || option).click();
        await wait(500);
    }

    async function goToPage(page) {
        const before = window.getRpaImagePagination();
        if (!before || !before.input) throw new Error('未找到图片管理页码输入框，已停止自动删图。');
        setNativeValue(before.input, page);
        const reached = await waitFor(() => {
            const state = window.getRpaImagePagination();
            return isPaginationActuallyAtPage(state, page) ? document.body : null;
        }, 8000);
        if (!reached) throw new Error(`图片管理未能跳转到第 ${page} 页，已停止自动删图。`);
        await wait(350);
        return window.getRpaImagePagination();
    }

    function buildImageCardCandidate(element) {
        if (!element) return null;
        const text = element.innerText || element.textContent || '';
        return {
            visible: visible(element),
            text,
            imageCount: element.querySelectorAll ? element.querySelectorAll('img, [style*="background-image"]').length : 0,
            checkboxCount: element.querySelectorAll ? element.querySelectorAll('input[type="checkbox"]').length : 0,
            deleteButtonCount: element.querySelectorAll ? Array.from(element.querySelectorAll('button, a, span')).filter((node) => /删除/.test(normalizedText(node))).length : 0,
            element
        };
    }

    function getCurrentPageImageCards() {
        const cards = new Set();
        const seeds = Array.from(document.querySelectorAll('img, [style*="background-image"], input[type="checkbox"]'));
        for (const seed of seeds) {
            let current = seed;
            for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
                const candidate = buildImageCardCandidate(current);
                if (hasDeletableImageCards([candidate])) {
                    cards.add(current);
                    break;
                }
            }
        }

        if (cards.size === 0) {
            const fallbackSelectors = 'li, .el-card, [class*="item"], [class*="card"], [class*="album"], [class*="image"], [class*="pic"]';
            Array.from(document.querySelectorAll(fallbackSelectors)).forEach((element) => {
                const candidate = buildImageCardCandidate(element);
                if (hasDeletableImageCards([candidate])) cards.add(element);
            });
        }

        return [...cards].filter(visible);
    }

    function currentPageHasImages() {
        return getCurrentPageImageCards().length > 0;
    }

    async function waitForStableImagePage(expectedPage) {
        let lastSignature = '';
        let stableSince = 0;
        const stable = await waitFor(() => {
            const state = window.getRpaImagePagination();
            if (!state || state.currentPage !== expectedPage) {
                lastSignature = '';
                stableSince = 0;
                return null;
            }
            const cardCount = getCurrentPageImageCards().length;
            const emptySignal = normalizedText(document.body).includes('暂无数据');
            if (cardCount === 0 && !emptySignal) return null;
            const signature = `${state.currentPage}/${state.totalPages}/${cardCount}/${emptySignal ? 'empty' : 'cards'}`;
            if (signature !== lastSignature) {
                lastSignature = signature;
                stableSince = Date.now();
                return null;
            }
            return Date.now() - stableSince >= 800 ? { ...state, cardCount, emptySignal } : null;
        }, 12000, 400);
        return stable || null;
    }

    function findDeleteConfirmationButton(dialogs) {
        for (const dialog of dialogs || []) {
            if (!dialog || !dialog.visible || !/(删除|移除|清空)/.test(String(dialog.text || ''))) continue;
            const button = (dialog.buttons || []).find((candidate) => {
                const label = normalizedText({ textContent: candidate && candidate.label });
                return label === '确定' || label === '确认' || label === '删除';
            });
            if (button) return button;
        }
        return null;
    }

    function getVisibleDeleteConfirmationButton() {
        const dialogSelector = [
            '.el-message-box', '.el-dialog', '.ant-modal', '.ant-popconfirm', '.ant-popover',
            '.vxe-modal', '.vxe-modal--wrapper', '.vxe-modal--box', '[role="dialog"]'
        ].join(',');
        const dialogs = Array.from(document.querySelectorAll(dialogSelector)).map((dialog) => ({
            visible: visible(dialog),
            text: dialog.innerText || dialog.textContent || '',
            buttons: Array.from(dialog.querySelectorAll('button, .el-button, .ant-btn, .vxe-button, [role="button"]')).map((element) => ({
                label: element.innerText || element.textContent || '',
                element
            }))
        }));
        const selected = findDeleteConfirmationButton(dialogs);
        return selected && selected.element ? selected.element : null;
    }

    async function selectCurrentPage() {
        const label = findClickableText('全选', true);
        if (!label) throw new Error('未找到图片管理全选控件，已停止自动删图。');
        const checkbox = label.querySelector('input[type="checkbox"]') || label.closest('label')?.querySelector('input[type="checkbox"]');
        if (!checkbox || !checkbox.checked) label.click();
        await wait(250);
    }

    async function deleteSelectedImages() {
        const deleteButton = Array.from(document.querySelectorAll('button, a, span')).find((element) => visible(element) && normalizedText(element) === '删除');
        if (!deleteButton) throw new Error('未找到图片管理批量删除按钮，已停止自动删图。');
        deleteButton.click();
        const confirmButton = await waitFor(() => {
            return getVisibleDeleteConfirmationButton();
        }, 5000);
        if (!confirmButton) throw new Error('图片删除确认框未出现，已停止自动删图。');
        confirmButton.click();
    }

    async function deleteOneSafePage() {
        await setPageSizeTo100();
        const beforeLast = window.getRpaImagePagination();
        if (!beforeLast) throw new Error('无法读取图片管理最后页，已停止自动删图。');
        const confirmedLast = await goToPage(beforeLast.totalPages);
        const targetPage = window.RpaSafety.getSafeCleanupPage(confirmedLast);
        if (!targetPage) throw new Error('无法安全定位“最后页前两页”，已停止自动删图。');

        const targetState = await goToPage(targetPage);
        if (!targetState || targetState.currentPage !== targetPage || targetPage <= 1) {
            return { status: 'page_changed' };
        }
        const stableTargetState = await waitForStableImagePage(targetPage);
        if (!stableTargetState) {
            return { status: 'page_loading_timeout' };
        }
        if (stableTargetState.totalPages !== confirmedLast.totalPages) {
            return { status: 'page_changed' };
        }
        if (!currentPageHasImages()) {
            return { status: 'empty_target_page' };
        }

        const beforeSpace = window.getRpaImageSpaceText();
        if (!beforeSpace) throw new Error('未能读取删除前剩余空间，已停止自动删图。');
        await selectCurrentPage();
        await deleteSelectedImages();
        const changed = await waitFor(() => {
            const space = window.getRpaImageSpaceText();
            return space && space !== beforeSpace ? document.body : null;
        }, 15000, 400);
        if (!changed) throw new Error('删除后图片空间未更新，已停止自动删图。');
        return { status: 'deleted' };
    }

    function showSpaceOverlay(message) {
        let overlay = document.getElementById('rpa-space-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rpa-space-overlay';
            overlay.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:99999999;background:#fff7e6;color:#ad4e00;border:1px solid #ffd591;border-radius:8px;padding:12px 16px;font-weight:bold;box-shadow:0 6px 16px rgba(0,0,0,.18);max-width:360px;';
            document.body.appendChild(overlay);
        }
        overlay.textContent = message;
    }

    async function openImageManagerFromNavigation() {
        window.location.href = resolveImageManagerUrl(window.location.href);
    }

    window.getRpaPauseReason = function() {
        const stored = localStorage.getItem(PAUSE_KEY) || '';
        if (!stored) return '';
        try {
            const state = JSON.parse(stored);
            if (!state || typeof state !== 'object') return '';
            const currentRunId = window.getRpaCurrentRunId
                ? window.getRpaCurrentRunId()
                : sessionStorage.getItem('rpa_current_run_id') || '';
            return !state.runId || !currentRunId || state.runId === currentRunId ? state.reason || '' : '';
        } catch (_) {
            // Backward compatibility for the pre-runId value used by V2.0.21.
            const currentRunId = window.getRpaCurrentRunId
                ? window.getRpaCurrentRunId()
                : sessionStorage.getItem('rpa_current_run_id') || '';
            return currentRunId ? '' : stored;
        }
    };

    window.RpaImageManagerNavigation = { selectImageManagementEntry, resolveImageManagerUrl };
    window.RpaImageManagerPagination = { parseVxePager, parseVxeRangeText, isPageSizeLabel, findVxePageSizeOption, isPaginationActuallyAtPage };
    window.RpaImageManagerDeletion = { findDeleteConfirmationButton, hasDeletableImageCards };

    window.requestRpaSpaceRecovery = function(reason = '图片空间不足') {
        const runId = window.getRpaCurrentRunId
            ? window.getRpaCurrentRunId()
            : sessionStorage.getItem('rpa_current_run_id') || '';
        localStorage.setItem(PAUSE_KEY, JSON.stringify({ reason: SPACE_FULL_REASON, runId }));
        try {
            const channel = new BroadcastChannel('rpa_channel');
            channel.postMessage({ type: SPACE_FULL_REASON, runId, reason });
            channel.close();
        } catch (_) {}
    };

    window.startRpaImageSpacePreflight = async function() {
        if (window.isRpaImageManagerPage()) return window.runRpaImageSpacePreflight();
        sessionStorage.setItem(PHASE_KEY, 'preflight');
        sessionStorage.setItem(RETURN_URL_KEY, window.location.href);
        if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'preflight', message: '正在打开图片管理并检查剩余空间。' });
        showSpaceOverlay('RPA 图片空间预检中：正在打开图片管理…');
        sessionStorage.setItem('rpa_programmatic_reload', '1');
        await openImageManagerFromNavigation();
    };

    window.runRpaImageSpacePreflight = async function() {
        if (window._rpa_space_preflight_running) return;
        window._rpa_space_preflight_running = true;
        try {
            showSpaceOverlay('RPA 图片空间预检：读取剩余空间…');
            let concurrentChanges = 0;
            let repositionAttempts = 0;
            for (let attempt = 0; attempt < 100; attempt++) {
                const spaceText = window.getRpaImageSpaceText();
                if (!spaceText) throw new Error('未能识别“剩余空间”数值，已停止自动删图。');
                if (window.RpaSafety.hasEnoughImageSpace(spaceText, MINIMUM_SPACE_MB)) {
                    localStorage.removeItem(PAUSE_KEY);
                    sessionStorage.setItem(PHASE_KEY, 'ready');
                    if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'running', message: `图片空间预检通过：${spaceText}。` });
                    showSpaceOverlay(`图片空间已达到 ${spaceText}，即将恢复 RPA。`);
                    await wait(800);
                    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
                    if (!returnUrl) throw new Error('缺少 RPA 返回地址，已停止自动恢复。');
                    sessionStorage.setItem('rpa_programmatic_reload', '1');
                    window.location.href = returnUrl;
                    return;
                }

                showSpaceOverlay(`剩余空间 ${spaceText}，正在处理“最后页前两页”的旧图…`);
                if (window.RpaRunState) window.RpaRunState.update({ type: 'note', message: `图片空间 ${spaceText}，准备清理最后页前两页的旧图。` });
                const result = await deleteOneSafePage();
                if (result.status === 'concurrent_change') {
                    concurrentChanges++;
                    if (concurrentChanges > 5) throw new Error('图片列表持续被其他用户变更，已停止自动删图。');
                    await wait(900);
                } else if (['page_changed', 'page_loading_timeout', 'empty_target_page'].includes(result.status)) {
                    repositionAttempts++;
                    if (repositionAttempts > 10) throw new Error('图片管理分页或图片卡片持续不稳定，已停止自动删图。');
                    if (window.RpaRunState) window.RpaRunState.update({ type: 'note', message: `图片管理页面暂不稳定（${result.status}），正在重新定位最后页前两页。` });
                    await wait(900);
                } else {
                    concurrentChanges = 0;
                    repositionAttempts = 0;
                }
            }
            throw new Error('已达到安全删除上限但空间仍不足 50M，已停止 RPA。');
        } catch (error) {
            sessionStorage.setItem(PHASE_KEY, 'blocked');
            if (window.RpaRunState) window.RpaRunState.update({ type: 'status', status: 'blocked', message: `图片空间预检失败：${error.message}` });
            console.error('[RPA 图片空间] 预检失败：', error);
            showSpaceOverlay(`图片空间预检已停止：${error.message}`);
            alert(`⚠️ RPA 未启动：${error.message}`);
        } finally {
            window._rpa_space_preflight_running = false;
        }
    };

    window.tryRunRpaImageSpacePreflight = function() {
        const phase = sessionStorage.getItem(PHASE_KEY);
        if (phase === 'preflight' && window.isRpaImageManagerPage()) {
            window.runRpaImageSpacePreflight();
        }
    };
})();

// ============================================
// rpa-page-targeting.js — RPA 页面边界判断
// ============================================

(function() {
    const COLLECTION_BOX_ROUTE_FRAGMENT = 'smtproductlist';
    const COLLECTION_BOX_MARKER = '速卖通采集箱';

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, '');
    }

    function normalizeStoreName(value) {
        return normalizeText(value).replace(/[－–—]/g, '-');
    }

    function isSpecificStoreName(value) {
        const normalized = normalizeStoreName(value);
        if (!normalized || normalized === '全部' || normalized.includes('店铺账号')) return false;
        const accountMarkers = normalized.match(/[A-Za-z0-9]{2,8}-/g) || [];
        return accountMarkers.length === 1 && /^[A-Za-z0-9]{2,8}-.+/.test(normalized);
    }

    function getStoreLockDecision({ lockedStoreName = '', currentStoreName = '' } = {}) {
        const lockedStore = normalizeStoreName(lockedStoreName);
        const currentStore = normalizeStoreName(currentStoreName);

        if (!isSpecificStoreName(lockedStore)) {
            return { allowed: false, reason: 'missing_lock', lockedStoreName: lockedStore, currentStoreName: currentStore };
        }
        if (!isSpecificStoreName(currentStore)) {
            return { allowed: false, reason: 'missing_current_store', lockedStoreName: lockedStore, currentStoreName: currentStore };
        }
        if (lockedStore !== currentStore) {
            return { allowed: false, reason: 'store_changed', lockedStoreName: lockedStore, currentStoreName: currentStore };
        }
        return { allowed: true, reason: 'matched', lockedStoreName: lockedStore, currentStoreName: currentStore };
    }

    function getSelectedStoreNameFromCandidates(candidates = []) {
        const selected = candidates
            .filter((candidate) => candidate && candidate.selected)
            .map((candidate) => normalizeStoreName(candidate.text))
            .filter(isSpecificStoreName)
            .sort((a, b) => a.length - b.length);
        return selected[0] || '';
    }

    function isVisibleElement(element) {
        if (!element) return false;
        if (element.offsetParent === null && element.offsetWidth === 0 && element.offsetHeight === 0) return false;
        return true;
    }

    function colorLooksWhite(value = '') {
        const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (!match) return /#fff(?:fff)?|white/i.test(String(value));
        return Number(match[1]) >= 230 && Number(match[2]) >= 230 && Number(match[3]) >= 230;
    }

    function colorLooksFilled(value = '') {
        const normalized = String(value || '').toLowerCase();
        return Boolean(normalized && normalized !== 'transparent' && normalized !== 'rgba(0, 0, 0, 0)' && normalized !== 'rgba(0,0,0,0)');
    }

    function elementLooksSelected(element) {
        if (!element || typeof element.getAttribute !== 'function') return false;
        const className = String(element.className || '').toLowerCase();
        if (/(^|\s)(active|selected|current|checked|is-active|is-selected)(\s|$)/.test(className)) return true;
        if (element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-current') === 'true') return true;

        if (typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(element);
            if (style && colorLooksFilled(style.backgroundColor) && colorLooksWhite(style.color)) return true;
        }
        return false;
    }

    function getSelectedStoreNameFromDocument(root) {
        const doc = root || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.querySelectorAll !== 'function') return '';

        const candidates = Array.from(doc.querySelectorAll('a,button,span,div,li,label')).map((element) => ({
            text: element.innerText || element.textContent || '',
            selected: isVisibleElement(element) && elementLooksSelected(element)
        }));
        return getSelectedStoreNameFromCandidates(candidates);
    }

    function parseDianxiaomiUrl(value) {
        try {
            const url = new URL(String(value || ''), 'https://www.dianxiaomi.com');
            if (url.hostname !== 'dianxiaomi.com' && !url.hostname.endsWith('.dianxiaomi.com')) return null;
            return url;
        } catch (_) {
            return null;
        }
    }

    function isProductEditUrl(value) {
        const url = parseDianxiaomiUrl(value);
        return Boolean(url && url.pathname.toLowerCase() === '/web/smt/edit' && /^\d{6,}$/.test(url.searchParams.get('id') || ''));
    }

    function isPendingPublishUrl(value) {
        const url = parseDianxiaomiUrl(value);
        if (!url || url.pathname.toLowerCase().includes('/web/smt/edit')) return false;
        const path = url.pathname.toLowerCase();
        return path.includes('/smtproductlist/offline') || (path.includes('smtproductlist') && url.searchParams.get('offline') === '1');
    }

    function linkTargetsProductEdit(link) {
        if (!link || typeof link.getAttribute !== 'function') return false;
        const href = link.getAttribute('href') || '';
        const onclick = link.getAttribute('onclick') || '';
        if (isProductEditUrl(href)) return true;
        if (/\/web\/smt\/edit\?[^'"\s)]*id=\d{6,}/i.test(`${href} ${onclick}`)) return true;
        const row = typeof link.closest === 'function' ? link.closest('tr[rowid]') : null;
        return Boolean(row && /^\d{6,}$/.test(row.getAttribute('rowid') || ''));
    }

    function getCollectionBoxEditLinks(root) {
        const doc = root || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.querySelectorAll !== 'function') return [];
        const tableRoots = Array.from(doc.querySelectorAll('table, .vxe-table, .el-table, [role="table"], [class*="product-list"]'));
        const scopes = tableRoots.length ? tableRoots : [doc];
        if (!tableRoots.length && typeof console !== 'undefined') {
            console.warn('[RPA 页面适配] 未找到已知商品表格容器，启用受限链接降级扫描。');
        }
        const seen = new Set();
        const links = [];
        scopes.forEach((scope) => {
            Array.from(scope.querySelectorAll('a')).forEach((link) => {
                const text = normalizeText(link.innerText || link.textContent || '');
                if (text !== '编辑' || !isVisibleElement(link) || !linkTargetsProductEdit(link) || seen.has(link)) return;
                seen.add(link);
                links.push(link);
            });
        });
        return links;
    }

    function isCollectionBoxPage({ href = '', pageText = '' } = {}) {
        const normalizedHref = String(href).toLowerCase();
        const isCollectionBoxRoute = normalizedHref.includes(COLLECTION_BOX_ROUTE_FRAGMENT) && !normalizedHref.includes('offline');
        return isCollectionBoxRoute && normalizeText(pageText).includes(COLLECTION_BOX_MARKER);
    }

    function shouldResumeRpaQueue({ rpaRunning = false, spacePhase = '', isCollectionBox = false } = {}) {
        const phaseAllowsQueue = spacePhase === 'ready' || spacePhase === '' || spacePhase === null;
        return Boolean(rpaRunning && phaseAllowsQueue && isCollectionBox);
    }

    function hasEmptyCollectionSignal(pageText = '') {
        return normalizeText(pageText).includes('暂无数据');
    }

    function shouldFinalizeRpaQueue({ rpaRunning = false, isCollectionBox = false, pageText = '', emptyStable = false, editLinkCount = 0 } = {}) {
        return Boolean(rpaRunning && isCollectionBox && emptyStable && Number(editLinkCount || 0) === 0 && hasEmptyCollectionSignal(pageText));
    }

    function getQueueResumeDecision({ rpaRunning = false, spacePhase = '', isCollectionBox = false, pageText = '', editLinkCount = 0, emptyStable = false } = {}) {
        if (!shouldResumeRpaQueue({ rpaRunning, spacePhase, isCollectionBox })) return 'idle';
        if (Number(editLinkCount || 0) > 0) return 'start';
        if (shouldFinalizeRpaQueue({ rpaRunning, isCollectionBox, pageText, emptyStable, editLinkCount })) return 'finalize';
        return hasEmptyCollectionSignal(pageText) ? 'wait_empty_stable' : 'wait_render';
    }

    window.RpaPageTargeting = {
        isCollectionBoxPage,
        shouldResumeRpaQueue,
        shouldFinalizeRpaQueue,
        hasEmptyCollectionSignal,
        getQueueResumeDecision,
        normalizeStoreName,
        isSpecificStoreName,
        getStoreLockDecision,
        getSelectedStoreNameFromCandidates,
        getSelectedStoreNameFromDocument,
        getSelectedStoreName: getSelectedStoreNameFromDocument,
        getCollectionBoxEditLinks,
        isProductEditUrl,
        isPendingPublishUrl
    };
    window.isRPACollectionBoxPage = function() {
        return isCollectionBoxPage({
            href: window.location.href,
            pageText: document.body ? document.body.innerText : ''
        });
    };
})();

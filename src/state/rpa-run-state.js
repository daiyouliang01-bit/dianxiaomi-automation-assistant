// ============================================
// rpa-run-state.js — RPA 运行状态与采集箱面板
// ============================================

(function() {
    const STORAGE_KEY = 'rpaRunStateV2';
    const FALLBACK_STORAGE_KEY = 'rpaRunStateV2Fallback';
    const MAX_EVENTS = 80;
    let updateQueue = Promise.resolve();
    let lastPanelRefreshAt = 0;
    let transientRun = null;

    function nowOf(event) {
        return Number(event && event.at) || Date.now();
    }

    function addEvent(run, event) {
        const entry = {
            at: nowOf(event),
            type: event.type,
            message: event.message || '',
            meta: event.meta || null
        };
        run.events = [...(run.events || []), entry].slice(-MAX_EVENTS);
    }

    function cloneRun(run) {
        return {
            ...run,
            products: { ...(run.products || {}) },
            events: [...(run.events || [])]
        };
    }

    function createRpaRunId(now = Date.now(), randomUuid) {
        const uuidFactory = randomUuid || (
            typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function'
                ? () => crypto.randomUUID()
                : () => Math.random().toString(36).slice(2)
        );
        const suffix = String(uuidFactory()).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        return `rpa-${Number(now) || Date.now()}-${suffix || Math.random().toString(36).slice(2)}`;
    }

    function createRun({
        mode = 'normal',
        now = Date.now(),
        runId = createRpaRunId(now),
        storeName = '',
        saveDestination = 'pending_publish',
        descriptionCleanupLevel = 'deep'
    } = {}) {
        return {
            runId,
            mode,
            storeName,
            saveDestination,
            descriptionCleanupLevel,
            status: 'preflight',
            startedAt: now,
            updatedAt: now,
            products: {},
            events: [{ at: now, type: 'run_started', message: 'RPA 已启动，等待图片空间预检。', meta: null }]
        };
    }

    function reduce(run, event) {
        const next = cloneRun(run);
        const at = nowOf(event);
        next.updatedAt = at;

        if (event.type === 'batch_opened') {
            (event.urls || []).forEach((url) => {
                if (!url) return;
                next.products[url] = next.products[url] || { status: 'queued', addedAt: at, updatedAt: at, detail: '' };
            });
            addEvent(next, { ...event, message: event.message || `已派发 ${Object.keys(next.products).length} 个产品任务。` });
            return next;
        }

        if (event.type === 'product_result') {
            const previous = next.products[event.url] || { addedAt: at };
            next.products[event.url] = {
                ...previous,
                status: event.status,
                updatedAt: at,
                detail: event.detail || ''
            };
            addEvent(next, { ...event, message: event.message || `产品结果：${event.status}` });
            return next;
        }

        if (event.type === 'status') {
            next.status = event.status;
            addEvent(next, { ...event, message: event.message || `RPA 状态变更为 ${event.status}` });
            return next;
        }

        if (event.type === 'note') {
            addEvent(next, event);
            return next;
        }

        return next;
    }

    function getChromeStorageArea() {
        return typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
    }

    function getFallbackRun() {
        try {
            if (typeof sessionStorage === 'undefined') return transientRun;
            return JSON.parse(sessionStorage.getItem(FALLBACK_STORAGE_KEY) || 'null') || transientRun;
        } catch (_) {
            return transientRun;
        }
    }

    function setFallbackRun(run) {
        transientRun = run || null;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(run));
        } catch (_) {}
    }

    function storageGet() {
        const storageArea = getChromeStorageArea();
        if (!storageArea || typeof storageArea.get !== 'function') return Promise.resolve(getFallbackRun());
        return new Promise((resolve) => {
            try {
                storageArea.get([STORAGE_KEY], (result) => {
                    const run = result && result[STORAGE_KEY] || getFallbackRun();
                    transientRun = run || null;
                    resolve(run || null);
                });
            } catch (_) {
                resolve(getFallbackRun());
            }
        });
    }

    function storageSet(run) {
        setFallbackRun(run);
        const storageArea = getChromeStorageArea();
        if (!storageArea || typeof storageArea.set !== 'function') return Promise.resolve();
        return new Promise((resolve) => {
            try { storageArea.set({ [STORAGE_KEY]: run }, resolve); }
            catch (_) { resolve(); }
        });
    }

    function storageRemove() {
        setFallbackRun(null);
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(FALLBACK_STORAGE_KEY);
        } catch (_) {}
        const storageArea = getChromeStorageArea();
        if (!storageArea || typeof storageArea.remove !== 'function') return Promise.resolve();
        return new Promise((resolve) => {
            try { storageArea.remove(STORAGE_KEY, resolve); }
            catch (_) { resolve(); }
        });
    }

    function statusText(status) {
        return {
            preflight: '图片空间预检中',
            running: '运行中',
            paused_space: '因图片空间暂停',
            needs_review: '等待人工确认',
            completed: '已完成',
            stopped: '已停止',
            blocked: '已阻止'
        }[status] || status || '未开始';
    }

    function modeText(mode) {
        return {
            plug: '插头',
            normal: '普通产品'
        }[mode] || '普通产品';
    }

    function productSummary(run) {
        const values = Object.values(run.products || {});
        const count = (status) => values.filter(item => item.status === status).length;
        return `完成 ${count('success')} · 待确认 ${count('needs_review')} · 失败 ${count('failed')} · 暂停 ${count('paused_space')} · 队列 ${count('queued')}`;
    }

    function summarizeRun(run) {
        const values = Object.values(run && run.products || {});
        const count = (status) => values.filter(item => item.status === status).length;
        const success = count('success');
        const needsReview = count('needs_review');
        const executionFailed = count('failed');
        const failed = executionFailed;
        const queued = count('queued');
        const paused = count('paused_space');
        return {
            total: values.length,
            success,
            failed,
            needsReview,
            executionFailed,
            queued,
            paused,
            message: `RPA 自动处理完成\n成功：${success} 条\n待确认：${needsReview} 条\n失败：${failed} 条`
        };
    }

    function renderPanel(run) {
        if (!window.isRPACollectionBoxPage || !window.isRPACollectionBoxPage()) return;
        let panel = document.getElementById('rpa-run-center');
        if (!run) {
            if (panel) panel.remove();
            return;
        }
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'rpa-run-center';
            panel.style.cssText = 'position:fixed;right:18px;bottom:76px;z-index:99999999;width:300px;background:#fff;border:1px solid #d9d9d9;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);font-size:12px;color:#262626;overflow:hidden;';
            document.body.appendChild(panel);
        }
        panel.replaceChildren();

        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 12px;background:#f0f5ff;border-bottom:1px solid #d6e4ff;font-weight:700;color:#1d39c4;';
        header.textContent = `RPA 运行中心 · ${statusText(run.status)}`;
        panel.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:10px 12px;line-height:1.65;';
        const runLine = document.createElement('div');
        runLine.textContent = `运行：${run.runId} · ${modeText(run.mode)}`;
        const productLine = document.createElement('div');
        productLine.textContent = productSummary(run);
        const lastEvent = document.createElement('div');
        lastEvent.style.cssText = 'margin-top:6px;color:#595959;word-break:break-word;';
        lastEvent.textContent = `最近：${run.events && run.events.length ? run.events.at(-1).message : '暂无事件'}`;
        body.append(runLine, productLine, lastEvent);
        panel.appendChild(body);

        if (['completed', 'stopped', 'needs_review', 'blocked'].includes(run.status)) {
            const footer = document.createElement('div');
            footer.style.cssText = 'padding:0 12px 10px;text-align:right;';
            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.textContent = '清除记录';
            clearButton.style.cssText = 'border:0;background:#fff;color:#1677ff;cursor:pointer;padding:0;';
            clearButton.onclick = () => window.RpaRunState.clear();
            footer.appendChild(clearButton);
            panel.appendChild(footer);
        }
    }

    const RpaRunState = {
        async start(options = {}) {
            const run = createRun(options);
            await storageSet(run);
            renderPanel(run);
            return run;
        },
        async get() {
            return storageGet();
        },
        async update(event) {
            updateQueue = updateQueue.then(async () => {
                const current = await storageGet();
                if (!current) return null;
                const next = reduce(current, event);
                await storageSet(next);
                renderPanel(next);
                return next;
            });
            return updateQueue;
        },
        async clear() {
            await storageRemove();
            renderPanel(null);
        },
        async initPanel() {
            renderPanel(await storageGet());
        }
    };

    window.RpaRunStateModel = { createRpaRunId, createRun, reduce, modeText, summarizeRun };
    window.RpaRunState = RpaRunState;
    window.ensureRpaRunCenter = function() {
        if (!window.isRPACollectionBoxPage || !window.isRPACollectionBoxPage()) return;
        if (Date.now() - lastPanelRefreshAt < 1000) return;
        lastPanelRefreshAt = Date.now();
        RpaRunState.initPanel();
    };

    if (window === window.top && typeof chrome !== 'undefined' && chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes[STORAGE_KEY]) renderPanel(changes[STORAGE_KEY].newValue || null);
        });
    }
})();

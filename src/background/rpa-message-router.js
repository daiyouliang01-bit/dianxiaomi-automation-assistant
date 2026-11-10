'use strict';

(function initRpaMessageRouter(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.RpaMessageRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModule() {
    const ACTIONS = new Set([
        'open_rpa_tabs',
        'open_edit_tabs',
        'open_rpa_work_tab',
        'close_tab',
        'query_active_rpa_tabs_count',
        'close_all_rpa_edit_tabs'
    ]);

    function createRpaMessageRouter({
        chromeApi,
        registryStore,
        registryApi,
        waitForSlot,
        createTabWithRetry,
        wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        now = Date.now
    }) {
        if (!chromeApi || !registryStore || !registryApi) throw new Error('RPA 消息路由依赖不完整');

        function isDianxiaomiUrl(value) {
            try {
                const url = new URL(String(value || ''));
                return (url.protocol === 'https:' || url.protocol === 'http:')
                    && (url.hostname === 'dianxiaomi.com' || url.hostname.endsWith('.dianxiaomi.com'));
            } catch (_) {
                return false;
            }
        }

        async function openTabs(request) {
            const urls = Array.isArray(request.urls) ? request.urls : [];
            const isRpaRequest = request.action === 'open_rpa_tabs';
            const runId = String(request.runId || '').trim();
            if (isRpaRequest && !runId) return { success: false, error: 'missing_run_id' };

            const results = [];
            for (let index = 0; index < urls.length; index++) {
                const url = String(urls[index] || '');
                if (!isRpaRequest && !registryApi.isDianxiaomiEditUrl(url)) {
                    results.push({ success: false, error: 'invalid_edit_url' });
                    continue;
                }
                if (isRpaRequest) {
                    let parsed;
                    try { parsed = new URL(url); } catch (_) { parsed = null; }
                    if (!parsed || !registryApi.isDianxiaomiEditUrl(url) || parsed.searchParams.get('rpa_run_id') !== runId) {
                        results.push({ success: false, error: 'invalid_rpa_url' });
                        continue;
                    }
                    await waitForSlot(runId);
                }
                if (index > 0) await wait(1500);
                const result = await createTabWithRetry(url);
                if (isRpaRequest && result.success) {
                    try {
                        const parsed = new URL(url);
                        await registryStore.registerRpaTab({
                            tabId: result.tabId,
                            runId,
                            productId: parsed.searchParams.get('id') || '',
                            url,
                            createdAt: now()
                        });
                    } catch (error) {
                        try { await chromeApi.tabs.remove(result.tabId); } catch (_) {}
                        results.push({ success: false, error: `register_failed: ${error.message}` });
                        continue;
                    }
                }
                results.push(result);
            }
            return { success: results.every((result) => result.success), results };
        }

        function openWorkTab(request, sender) {
            if (!isDianxiaomiUrl(request.url)) {
                return Promise.resolve({ success: false, error: 'invalid_work_url' });
            }
            const createOptions = { url: request.url, active: true };
            if (sender.tab && Number.isInteger(sender.tab.index)) createOptions.index = sender.tab.index + 1;
            return new Promise((resolve) => {
                chromeApi.tabs.create(createOptions, (tab) => {
                    const lastError = chromeApi.runtime.lastError;
                    resolve(lastError
                        ? { success: false, error: lastError.message }
                        : { success: true, tabId: tab && tab.id });
                });
            });
        }

        async function closeTab(request, sender) {
            const tabId = sender.tab && sender.tab.id;
            const runId = String(request.runId || '').trim();
            if (!tabId) return { error: 'no_tab' };
            if (!runId) return { error: 'missing_run_id' };
            const record = await registryStore.getRpaTab(tabId);
            if (!record || record.runId !== runId) return { error: 'run_id_mismatch' };
            await chromeApi.tabs.remove(tabId);
            await registryStore.unregisterRpaTab(tabId);
            return { closed: true };
        }

        function handleRpaMessage(request = {}, sender = {}) {
            if (!ACTIONS.has(request.action)) return null;
            if (request.action === 'open_rpa_tabs' || request.action === 'open_edit_tabs') return openTabs(request);
            if (request.action === 'open_rpa_work_tab') return openWorkTab(request, sender);
            if (request.action === 'close_tab') return closeTab(request, sender);
            const runId = String(request.runId || '').trim();
            if (!runId) {
                return Promise.resolve(request.action === 'query_active_rpa_tabs_count'
                    ? { error: 'missing_run_id', count: 0 }
                    : { error: 'missing_run_id', closed: 0 });
            }
            if (request.action === 'query_active_rpa_tabs_count') {
                return registryStore.countRpaTabs(runId).then((count) => ({ count }));
            }
            return registryStore.closeRpaTabs(runId).then((closed) => ({ closed }));
        }

        return { handleRpaMessage };
    }

    return { createRpaMessageRouter };
});

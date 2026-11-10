(function initRpaTabRegistry(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.RpaTabRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRegistryApi() {
    'use strict';

    function isDianxiaomiEditUrl(rawUrl) {
        try {
            const url = new URL(String(rawUrl || ''));
            const isDianxiaomi = url.hostname === 'dianxiaomi.com' || url.hostname.endsWith('.dianxiaomi.com');
            return isDianxiaomi && url.pathname.toLowerCase().includes('/web/smt/edit');
        } catch (_) {
            return false;
        }
    }

    function createRpaTabRecord(input = {}) {
        const tabId = Number(input.tabId);
        const runId = String(input.runId || '').trim();
        const productId = String(input.productId || '').trim();
        const url = String(input.url || '').trim();
        const createdAt = Number(input.createdAt);

        if (!Number.isInteger(tabId) || tabId <= 0) throw new TypeError('RPA tabId 必须是正整数');
        if (!runId) throw new TypeError('RPA runId 不能为空');
        if (!isDianxiaomiEditUrl(url)) throw new TypeError('RPA 标签必须指向店小秘编辑页');
        if (!Number.isFinite(createdAt) || createdAt <= 0) throw new TypeError('RPA createdAt 必须是有效时间戳');

        return { tabId, runId, productId, url, createdAt };
    }

    function upsertRpaTabRecord(records, rawRecord) {
        const record = createRpaTabRecord(rawRecord);
        return (Array.isArray(records) ? records : [])
            .filter((item) => Number(item && item.tabId) !== record.tabId)
            .concat(record);
    }

    function removeRpaTabRecord(records, tabId) {
        const numericTabId = Number(tabId);
        return (Array.isArray(records) ? records : [])
            .filter((record) => Number(record && record.tabId) !== numericTabId);
    }

    function getActiveRpaTabsForRun(records, runId) {
        const normalizedRunId = String(runId || '').trim();
        if (!normalizedRunId) return [];
        return (Array.isArray(records) ? records : [])
            .filter((record) => record && record.runId === normalizedRunId);
    }

    function reconcileRpaTabRecords(records, openTabs) {
        const openTabById = new Map(
            (Array.isArray(openTabs) ? openTabs : [])
                .filter((tab) => tab && Number.isInteger(Number(tab.id)))
                .map((tab) => [Number(tab.id), tab])
        );
        return (Array.isArray(records) ? records : []).filter((record) => {
            const tab = record && openTabById.get(Number(record.tabId));
            return Boolean(tab && isDianxiaomiEditUrl(tab.url));
        });
    }

    function createRpaTabRegistryStore(options = {}) {
        const chromeApi = options.chromeApi;
        const storageKey = options.storageKey || 'rpa_tab_registry_v2';
        if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local || !chromeApi.tabs) {
            throw new TypeError('RPA 标签注册表需要 chrome.storage.local 和 chrome.tabs');
        }

        let operationQueue = Promise.resolve();
        let reconciledOnce = false;

        function enqueue(operation) {
            const result = operationQueue.then(operation, operation);
            operationQueue = result.catch(() => {});
            return result;
        }

        function getLastError() {
            return chromeApi.runtime && chromeApi.runtime.lastError;
        }

        function readRecords() {
            return new Promise((resolve, reject) => {
                chromeApi.storage.local.get(storageKey, (result) => {
                    const error = getLastError();
                    if (error) {
                        reject(new Error(error.message || String(error)));
                        return;
                    }
                    resolve(Array.isArray(result && result[storageKey]) ? result[storageKey] : []);
                });
            });
        }

        function writeRecords(records) {
            return new Promise((resolve, reject) => {
                chromeApi.storage.local.set({ [storageKey]: records }, () => {
                    const error = getLastError();
                    if (error) reject(new Error(error.message || String(error)));
                    else resolve();
                });
            });
        }

        function queryOpenTabs() {
            return new Promise((resolve, reject) => {
                chromeApi.tabs.query({}, (tabs) => {
                    const error = getLastError();
                    if (error) reject(new Error(error.message || String(error)));
                    else resolve(Array.isArray(tabs) ? tabs : []);
                });
            });
        }

        function removeTab(tabId) {
            return new Promise((resolve, reject) => {
                chromeApi.tabs.remove(tabId, () => {
                    const error = getLastError();
                    if (error) reject(new Error(error.message || String(error)));
                    else resolve();
                });
            });
        }

        async function reconcileUnlocked() {
            const [records, openTabs] = await Promise.all([readRecords(), queryOpenTabs()]);
            const reconciled = reconcileRpaTabRecords(records, openTabs);
            await writeRecords(reconciled);
            reconciledOnce = true;
            return reconciled;
        }

        async function ensureReconciledUnlocked() {
            return reconciledOnce ? readRecords() : reconcileUnlocked();
        }

        return {
            storageKey,
            registerRpaTab(rawRecord) {
                return enqueue(async () => {
                    const records = await readRecords();
                    const updated = upsertRpaTabRecord(records, rawRecord);
                    await writeRecords(updated);
                    reconciledOnce = true;
                });
            },
            unregisterRpaTab(tabId) {
                return enqueue(async () => {
                    const records = await readRecords();
                    await writeRecords(removeRpaTabRecord(records, tabId));
                });
            },
            countRpaTabs(runId) {
                return enqueue(async () => getActiveRpaTabsForRun(await ensureReconciledUnlocked(), runId).length);
            },
            getRpaTab(tabId) {
                return enqueue(async () => {
                    const records = await ensureReconciledUnlocked();
                    return records.find((record) => record.tabId === Number(tabId)) || null;
                });
            },
            closeRpaTabs(runId) {
                return enqueue(async () => {
                    const records = await ensureReconciledUnlocked();
                    const targets = getActiveRpaTabsForRun(records, runId);
                    const closedIds = [];
                    for (const record of targets) {
                        try {
                            await removeTab(record.tabId);
                            closedIds.push(record.tabId);
                        } catch (_) {
                            // Keep failed closures registered so the caller can retry safely.
                        }
                    }
                    const remaining = records.filter((record) => !closedIds.includes(record.tabId));
                    await writeRecords(remaining);
                    return closedIds.length;
                });
            },
            reconcileRpaTabs() {
                return enqueue(reconcileUnlocked);
            }
        };
    }

    return {
        isDianxiaomiEditUrl,
        createRpaTabRecord,
        upsertRpaTabRecord,
        removeRpaTabRecord,
        getActiveRpaTabsForRun,
        reconcileRpaTabRecords,
        createRpaTabRegistryStore
    };
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const registryPath = '../src/background/rpa-tab-registry.js';

function loadRegistry() {
    delete require.cache[require.resolve(registryPath)];
    return require(registryPath);
}

function validRecord(overrides = {}) {
    return {
        tabId: 42,
        runId: 'rpa-1785290000000-a1b2',
        productId: '394203167159990748',
        url: 'https://www.dianxiaomi.com/web/smt/edit?id=394203167159990748&rpa_auto=1',
        createdAt: 1785290000000,
        ...overrides
    };
}

test('creates a normalized RPA tab record', () => {
    const registry = loadRegistry();
    assert.deepEqual(registry.createRpaTabRecord(validRecord()), validRecord());
});

test('rejects records without a positive tab id or run id', () => {
    const registry = loadRegistry();
    assert.throws(() => registry.createRpaTabRecord(validRecord({ tabId: 0 })), /tabId/);
    assert.throws(() => registry.createRpaTabRecord(validRecord({ runId: '' })), /runId/);
});

test('rejects non-Dianxiaomi or non-edit URLs', () => {
    const registry = loadRegistry();
    assert.throws(
        () => registry.createRpaTabRecord(validRecord({ url: 'https://evil.example/web/smt/edit?id=1' })),
        /店小秘编辑页/
    );
    assert.throws(
        () => registry.createRpaTabRecord(validRecord({ url: 'https://www.dianxiaomi.com/web/smt/smtProductList' })),
        /店小秘编辑页/
    );
});

test('upserts by tab id without mutating the original records', () => {
    const registry = loadRegistry();
    const original = [validRecord()];
    const replacement = validRecord({ runId: 'rpa-new', productId: '2' });
    const result = registry.upsertRpaTabRecord(original, replacement);

    assert.equal(original[0].runId, 'rpa-1785290000000-a1b2');
    assert.deepEqual(result, [replacement]);
});

test('removes a record by tab id and filters active tabs by run id', () => {
    const registry = loadRegistry();
    const records = [
        validRecord(),
        validRecord({ tabId: 43, runId: 'rpa-other', productId: '3' })
    ];

    assert.deepEqual(registry.getActiveRpaTabsForRun(records, 'rpa-other'), [records[1]]);
    assert.deepEqual(registry.removeRpaTabRecord(records, 42), [records[1]]);
});

test('reconciles only registered records whose tabs are still open on their recorded edit URL', () => {
    const registry = loadRegistry();
    const records = [
        validRecord(),
        validRecord({ tabId: 43, runId: 'rpa-other', productId: '3' }),
        validRecord({ tabId: 44, runId: 'rpa-third', productId: '4' })
    ];
    const openTabs = [
        { id: 42, url: records[0].url },
        { id: 43, url: 'https://www.dianxiaomi.com/web/smt/smtProductList' },
        { id: 99, url: 'https://www.dianxiaomi.com/web/smt/edit?id=manual' }
    ];

    assert.deepEqual(registry.reconcileRpaTabRecords(records, openTabs), [records[0]]);
});

function createRegistryChrome(initialRecords = [], initialTabs = []) {
    let records = structuredClone(initialRecords);
    let tabs = structuredClone(initialTabs);
    const removedTabIds = [];
    return {
        chromeApi: {
            storage: {
                local: {
                    get(key, callback) { callback({ [key]: structuredClone(records) }); },
                    set(value, callback) {
                        records = structuredClone(value.rpa_tab_registry_v2 || []);
                        if (callback) callback();
                    }
                }
            },
            tabs: {
                query(_query, callback) { callback(structuredClone(tabs)); },
                remove(tabId, callback) {
                    removedTabIds.push(tabId);
                    tabs = tabs.filter((tab) => tab.id !== tabId);
                    if (callback) callback();
                }
            },
            runtime: { lastError: null }
        },
        getRecords: () => structuredClone(records),
        getRemovedTabIds: () => [...removedTabIds]
    };
}

test('persists registered tabs across registry store instances', async () => {
    const registry = loadRegistry();
    const record = validRecord();
    const environment = createRegistryChrome([], [{ id: record.tabId, url: record.url }]);
    const firstWorker = registry.createRpaTabRegistryStore({ chromeApi: environment.chromeApi });
    await firstWorker.registerRpaTab(record);

    const restartedWorker = registry.createRpaTabRegistryStore({ chromeApi: environment.chromeApi });
    assert.equal(await restartedWorker.countRpaTabs(record.runId), 1);
});

test('reconcile removes closed or navigated registered tabs without adopting manual edit tabs', async () => {
    const registry = loadRegistry();
    const records = [validRecord(), validRecord({ tabId: 43, runId: 'rpa-other' })];
    const environment = createRegistryChrome(records, [
        { id: 42, url: records[0].url },
        { id: 43, url: 'https://www.dianxiaomi.com/web/smt/smtProductList' },
        { id: 99, url: 'https://www.dianxiaomi.com/web/smt/edit?id=manual' }
    ]);
    const store = registry.createRpaTabRegistryStore({ chromeApi: environment.chromeApi });

    assert.deepEqual(await store.reconcileRpaTabs(), [records[0]]);
    assert.deepEqual(environment.getRecords(), [records[0]]);
});

test('closes only tabs belonging to the requested run', async () => {
    const registry = loadRegistry();
    const records = [validRecord(), validRecord({ tabId: 43, runId: 'rpa-other' })];
    const environment = createRegistryChrome(records, records.map((record) => ({ id: record.tabId, url: record.url })));
    const store = registry.createRpaTabRegistryStore({ chromeApi: environment.chromeApi });

    assert.equal(await store.closeRpaTabs(validRecord().runId), 1);
    assert.deepEqual(environment.getRemovedTabIds(), [42]);
    assert.deepEqual(environment.getRecords(), [records[1]]);
});

test('looks up only explicitly registered tab ids', async () => {
    const registry = loadRegistry();
    const record = validRecord();
    const environment = createRegistryChrome([record], [{ id: record.tabId, url: record.url }]);
    const store = registry.createRpaTabRegistryStore({ chromeApi: environment.chromeApi });

    assert.deepEqual(await store.getRpaTab(record.tabId), record);
    assert.equal(await store.getRpaTab(999), null);
});

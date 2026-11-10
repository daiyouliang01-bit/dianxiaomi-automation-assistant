'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;

let RpaPageTargeting;
try {
    require('../src/page-adapters/rpa-page-targeting.js');
    RpaPageTargeting = global.RpaPageTargeting;
} catch (_) {
    RpaPageTargeting = null;
}

test('targets only the AliExpress collection-box page for RPA injection', () => {
    assert.ok(RpaPageTargeting, 'RpaPageTargeting must expose collection-box page detection');

    assert.equal(
        RpaPageTargeting.isCollectionBoxPage({
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList',
            pageText: '数据采集 > 速卖通采集箱'
        }),
        true
    );

    assert.equal(
        RpaPageTargeting.isCollectionBoxPage({
            href: 'https://www.dianxiaomi.com/web/collect/index',
            pageText: '产品 > 通用服务 > 数据采集'
        }),
        false
    );
});

test('rejects similar collection URLs without the collection-box page marker', () => {
    assert.ok(RpaPageTargeting, 'RpaPageTargeting must expose collection-box page detection');

    assert.equal(
        RpaPageTargeting.isCollectionBoxPage({
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList',
            pageText: '产品 > 通用服务 > 数据采集'
        }),
        false
    );

    assert.equal(
        RpaPageTargeting.isCollectionBoxPage({
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList?offline=1',
            pageText: '数据采集 > 速卖通采集箱'
        }),
        false
    );
});

test('allows an RPA queue to resume only after space recovery and collection-box rendering are both ready', () => {
    assert.ok(RpaPageTargeting, 'RpaPageTargeting must expose RPA resume eligibility');

    assert.equal(
        RpaPageTargeting.shouldResumeRpaQueue({ rpaRunning: true, spacePhase: 'ready', isCollectionBox: true }),
        true
    );
    assert.equal(
        RpaPageTargeting.shouldResumeRpaQueue({ rpaRunning: true, spacePhase: 'preflight', isCollectionBox: true }),
        false
    );
    assert.equal(
        RpaPageTargeting.shouldResumeRpaQueue({ rpaRunning: true, spacePhase: 'ready', isCollectionBox: false }),
        false
    );
    assert.equal(
        RpaPageTargeting.shouldResumeRpaQueue({ rpaRunning: false, spacePhase: 'ready', isCollectionBox: true }),
        false
    );
});

test('recognises an empty, rendered collection box as a completed RPA run', () => {
    assert.equal(
        RpaPageTargeting.shouldFinalizeRpaQueue({ rpaRunning: true, isCollectionBox: true, pageText: '速卖通采集箱 暂无数据', emptyStable: true }),
        true
    );
    assert.equal(
        RpaPageTargeting.shouldFinalizeRpaQueue({ rpaRunning: true, isCollectionBox: true, pageText: '速卖通采集箱 编辑' }),
        false
    );
    assert.equal(
        RpaPageTargeting.shouldFinalizeRpaQueue({ rpaRunning: false, isCollectionBox: true, pageText: '暂无数据' }),
        false
    );
});

test('does not complete the RPA queue on a transient empty collection-box render', () => {
    assert.equal(
        RpaPageTargeting.shouldFinalizeRpaQueue({
            rpaRunning: true,
            isCollectionBox: true,
            pageText: '数据采集 > 速卖通采集箱 暂无数据',
            emptyStable: false
        }),
        false
    );
});

test('blocks an RPA queue when the selected store no longer matches the locked store', () => {
    assert.ok(RpaPageTargeting, 'RpaPageTargeting must expose store-lock helpers');

    assert.deepEqual(
        RpaPageTargeting.getStoreLockDecision({
            lockedStoreName: '0785-李俊频（工具）五公司',
            currentStoreName: '0785 - 李俊频（工具） 五公司'
        }),
        { allowed: true, reason: 'matched', lockedStoreName: '0785-李俊频（工具）五公司', currentStoreName: '0785-李俊频（工具）五公司' }
    );

    assert.deepEqual(
        RpaPageTargeting.getStoreLockDecision({
            lockedStoreName: '0785-李俊频（工具）五公司',
            currentStoreName: '0786-李俊频（工具）五公司'
        }),
        { allowed: false, reason: 'store_changed', lockedStoreName: '0785-李俊频（工具）五公司', currentStoreName: '0786-李俊频（工具）五公司' }
    );
});

test('extracts the selected specific store from active store-account candidates', () => {
    assert.equal(
        RpaPageTargeting.getSelectedStoreNameFromCandidates([
            { text: '全部', selected: false },
            { text: '327-李俊频（工具）五公司', selected: false },
            { text: '0785 - 李俊频（工具） 五公司', selected: true },
            { text: '0786-李俊频（工具）五公司', selected: false }
        ]),
        '0785-李俊频（工具）五公司'
    );
});

test('returns only visible edit links inside the collection-box table', () => {
    const valid = { innerText: '编辑', offsetParent: {}, offsetWidth: 10, offsetHeight: 10, getAttribute: (name) => name === 'href' ? '/web/smt/edit?id=1234567890' : '' };
    const hidden = { innerText: '编辑', offsetParent: null, offsetWidth: 0, offsetHeight: 0, getAttribute: () => '/web/smt/edit?id=2234567890' };
    const navigation = { innerText: '编辑', offsetParent: {}, offsetWidth: 10, offsetHeight: 10, getAttribute: () => '/settings/edit' };
    const table = { querySelectorAll: () => [valid, hidden] };
    const doc = {
        querySelectorAll(selector) {
            if (selector.includes('table')) return [table];
            if (selector === 'a') return [valid, hidden, navigation];
            return [];
        }
    };

    assert.deepEqual(RpaPageTargeting.getCollectionBoxEditLinks(doc), [valid]);
});

test('recognises only valid product edit and pending-publish URLs', () => {
    assert.equal(RpaPageTargeting.isProductEditUrl('https://www.dianxiaomi.com/web/smt/edit?id=1234567890'), true);
    assert.equal(RpaPageTargeting.isProductEditUrl('https://evil.example/web/smt/edit?id=1234567890'), false);
    assert.equal(RpaPageTargeting.isPendingPublishUrl('https://www.dianxiaomi.com/web/smt/smtProductList/offline'), true);
    assert.equal(RpaPageTargeting.isPendingPublishUrl('https://www.dianxiaomi.com/web/smt/edit?offline=1'), false);
});

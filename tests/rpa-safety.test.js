'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

let RpaSafety;
try {
    require('../src/safety/rpa-safety.js');
    RpaSafety = global.RpaSafety;
} catch (_) {
    RpaSafety = null;
}

test('confirms saves through visible feedback, an editor exit, or a completed save-button cycle', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');

    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '操作成功', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'success', source: 'feedback' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/list' }),
        { status: 'success', source: 'navigation' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1', sawBusy: true, isBusy: false, elapsedMs: 1000 }),
        { status: 'success', source: 'button-cycle' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '保存失败，请稍后重试', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'failure', source: 'feedback' }
    );
});

test('detects pending-publish save from the exact success dialog text', () => {
    const dialogText = '操作成功，请到\u300C待发布产品\u300D中查看！';
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: dialogText, beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'success', source: 'feedback' }
    );
});

test('detects moved-to-pending-publish text as save success', () => {
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '已移入待发布', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'success', source: 'feedback' }
    );
});

test('detects expanded failure keywords as save failure', () => {
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '网络异常，请重试', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'failure', source: 'feedback' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '保存出错，请稍后重试', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'failure', source: 'feedback' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '请求失败，请刷新页面', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1' }),
        { status: 'failure', source: 'feedback' }
    );
});

test('confirms collection-box saves through product edit success dialogs', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');

    assert.deepEqual(
        RpaSafety.detectSaveOutcome({
            visibleText: '消息提示 您的产品编辑成功! 创建新产品 继续编辑',
            beforeUrl: '/web/smt/edit?id=1&rpa_auto=1&save_dest=collection_box',
            currentUrl: '/web/smt/edit?id=1&rpa_auto=1&save_dest=collection_box'
        }),
        { status: 'success', source: 'feedback' }
    );
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({
            visibleText: '消息提示 您的产品编辑成功！ 创建新产品 继续编辑',
            beforeUrl: '/web/smt/edit?id=1&rpa_auto=1&save_dest=collection_box',
            currentUrl: '/web/smt/edit?id=1&rpa_auto=1&save_dest=collection_box'
        }),
        { status: 'success', source: 'feedback' }
    );
});

test('does not assume an unchanged page has saved', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');
    assert.deepEqual(
        RpaSafety.detectSaveOutcome({ visibleText: '', beforeUrl: '/web/smt/edit?id=1', currentUrl: '/web/smt/edit?id=1', sawBusy: false, isBusy: false, elapsedMs: 30000 }),
        { status: 'pending', source: null }
    );
});

test('allows saving only after required RPA stages are safe', () => {
    assert.deepEqual(
        RpaSafety.canSaveAfterStages({
            mode: 'normal',
            translate: 'success',
            imageResize: 'success',
            cleanup: 'success'
        }),
        { allowed: true, status: 'ready', reasons: [] }
    );
    assert.deepEqual(
        RpaSafety.canSaveAfterStages({
            mode: 'normal',
            translate: 'skipped',
            imageResize: 'success',
            cleanup: 'success'
        }),
        { allowed: true, status: 'ready', reasons: [] }
    );
});

test('blocks saving after image-space, cleanup, translation, or plug restore failures', () => {
    const cases = [
        [{ mode: 'normal', translate: 'success', imageResize: 'space_full', cleanup: 'success' }, /图片空间不足/],
        [{ mode: 'normal', translate: 'success', imageResize: 'success', cleanup: 'failed' }, /清理优化失败/],
        [{ mode: 'normal', translate: 'failed', imageResize: 'success', cleanup: 'success' }, /翻译失败/],
        [{ mode: 'plug', translate: 'success', imageResize: 'success', cleanup: 'failed' }, /插头设置或数据恢复失败/]
    ];
    cases.forEach(([stages, expectedReason]) => {
        const decision = RpaSafety.canSaveAfterStages(stages);
        assert.equal(decision.allowed, false);
        assert.equal(decision.status, 'needs_review');
        assert.match(decision.reasons.join('；'), expectedReason);
    });
});

test('blocks saving when a required stage has no confirmed result', () => {
    const decision = RpaSafety.canSaveAfterStages({
        mode: 'normal',
        translate: 'success',
        imageResize: 'unconfirmed',
        cleanup: 'success'
    });
    assert.equal(decision.allowed, false);
    assert.match(decision.reasons.join('；'), /图片处理未确认/);
});

test('marks blank or validation-error custom attribute rows for deletion', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose attribute-row safety rules');
    assert.equal(RpaSafety.shouldDeleteAttributeRow({ name: 'capacity', value: '' }), true);
    assert.equal(RpaSafety.shouldDeleteAttributeRow({ name: '', value: '18650' }), true);
    assert.equal(
        RpaSafety.shouldDeleteAttributeRow({
            name: 'capacity',
            value: '52、18650',
            validationText: '请输入英文、数字或空格符号！'
        }),
        true
    );
    assert.equal(RpaSafety.shouldDeleteAttributeRow({ name: 'voltage', value: '36V/48V' }), true);
    assert.equal(RpaSafety.shouldDeleteAttributeRow({ name: 'certification', value: 'ISO 9001: 2015' }), true);
    assert.equal(RpaSafety.shouldDeleteAttributeRow({ name: 'voltage', value: '36V 48V' }), false);
});

test('keeps the queue moving and identifies a product that requires manual review', () => {
    assert.equal(RpaSafety.shouldContinueAfterProductResult('needs_review'), true);
    assert.equal(RpaSafety.shouldContinueAfterProductResult('success'), true);
    assert.equal(RpaSafety.shouldContinueAfterProductResult('paused_space'), false);
    assert.equal(
        RpaSafety.getProductId('https://www.dianxiaomi.com/web/smt/edit?id=39420316695315338&rpa_auto=1'),
        '39420316695315338'
    );
});

test('distinguishes image-space exhaustion from an unresizable source image', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');
    assert.equal(RpaSafety.classifyImageGenerationResult('图片空间不足，请清理后再试'), 'space_full');
    assert.equal(RpaSafety.classifyImageGenerationResult('图片内存不足，无法继续生成'), 'space_full');
    assert.equal(RpaSafety.classifyImageGenerationResult('原图尺寸异常，无法生成 800x800 图片'), 'unresizable');
    assert.equal(RpaSafety.classifyImageGenerationResult('网络波动，请稍后重试'), 'unknown');
});

test('chooses only the page two positions before a confirmed last page for automatic image deletion', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');
    assert.equal(RpaSafety.getSafeCleanupPage({ currentPage: 1026, totalPages: 1026 }), 1024);
    assert.equal(RpaSafety.getSafeCleanupPage({ currentPage: 1024, totalPages: 1026 }), null);
    assert.equal(RpaSafety.getSafeCleanupPage({ currentPage: 1, totalPages: 1026 }), null);
    assert.equal(RpaSafety.getSafeCleanupPage({ currentPage: 3, totalPages: 3 }), null);
});

test('parses image-space values in megabytes and requires at least 50M', () => {
    assert.ok(RpaSafety, 'RpaSafety must expose save and image safety helpers');
    assert.equal(RpaSafety.parseStorageMegabytes('剩余空间 0.46M'), 0.46);
    assert.equal(RpaSafety.parseStorageMegabytes('剩余空间：50 MB'), 50);
    assert.equal(RpaSafety.parseStorageMegabytes('剩余空间 1.5G'), 1536);
    assert.equal(RpaSafety.hasEnoughImageSpace('剩余空间 49.99M', 50), false);
    assert.equal(RpaSafety.hasEnoughImageSpace('剩余空间 50.00M', 50), true);
});

test('loads RPA safety helpers before RPA and main scripts', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts[0].js;
    assert.ok(scripts.includes('src/safety/rpa-safety.js'));
    assert.ok(scripts.indexOf('src/safety/rpa-safety.js') < scripts.indexOf('src/workflows/rpa.js'));
    assert.ok(scripts.indexOf('src/safety/rpa-safety.js') < scripts.indexOf('src/content/main.js'));
});

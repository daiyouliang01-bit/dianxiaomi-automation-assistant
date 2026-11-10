'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

let RpaImageManagerNavigation;
let RpaImageManagerPagination;
let RpaImageManagerDeletion;
try {
    require('../src/workflows/rpa-image-space.js');
    RpaImageManagerNavigation = global.RpaImageManagerNavigation;
    RpaImageManagerPagination = global.RpaImageManagerPagination;
    RpaImageManagerDeletion = global.RpaImageManagerDeletion;
} catch (_) {
    RpaImageManagerNavigation = null;
    RpaImageManagerPagination = null;
    RpaImageManagerDeletion = null;
}

test('selects the visible image-management menu entry after the service menu opens', () => {
    assert.ok(RpaImageManagerNavigation, 'RpaImageManagerNavigation must expose service-menu entry selection');
    const candidates = [
        { label: '图片管理', visible: false, top: 0, element: 'hidden-entry' },
        { label: '图片管理', visible: true, top: 198, element: 'service-menu-entry' },
        { label: '图片银行', visible: true, top: 258, element: 'other-entry' }
    ];

    assert.equal(
        RpaImageManagerNavigation.selectImageManagementEntry(candidates).element,
        'service-menu-entry'
    );
});

test('uses the verified direct image-management route instead of relying on the service menu', () => {
    assert.ok(RpaImageManagerNavigation, 'RpaImageManagerNavigation must expose the direct image-management route');
    assert.equal(
        RpaImageManagerNavigation.resolveImageManagerUrl('https://www.dianxiaomi.com/web/smt/smtProductList/draft?pageType=0'),
        'https://www.dianxiaomi.com/web/service/album'
    );
});

test('parses the current VXE image-manager pager contract', () => {
    assert.ok(RpaImageManagerPagination, 'RpaImageManagerPagination must expose VXE pager parsing');
    assert.deepEqual(
        RpaImageManagerPagination.parseVxePager('1', '5105'),
        { currentPage: 1, totalPages: 5105 }
    );
    assert.equal(RpaImageManagerPagination.parseVxePager('1', ''), null);
    assert.equal(RpaImageManagerPagination.isPageSizeLabel('100条/页'), true);
});

test('uses the VXE record range to avoid confirming a page jump before the list changes', () => {
    assert.ok(RpaImageManagerPagination, 'RpaImageManagerPagination must expose VXE range confirmation');
    assert.deepEqual(
        RpaImageManagerPagination.parseVxeRangeText('第107501-107600条，共 107748 条记录'),
        { rangeStart: 107501, rangeEnd: 107600, totalRecords: 107748 }
    );

    const staleAfterTyping = {
        type: 'vxe',
        currentPage: 1078,
        totalPages: 1078,
        pageSize: 100,
        range: { rangeStart: 107501, rangeEnd: 107600, totalRecords: 107748 }
    };
    assert.equal(
        RpaImageManagerPagination.isPaginationActuallyAtPage(staleAfterTyping, 1078),
        false
    );

    const realLastPage = {
        type: 'vxe',
        currentPage: 1078,
        totalPages: 1078,
        pageSize: 100,
        range: { rangeStart: 107701, rangeEnd: 107748, totalRecords: 107748 }
    };
    assert.equal(
        RpaImageManagerPagination.isPaginationActuallyAtPage(realLastPage, 1078),
        true
    );
});

test('selects the VXE 100-per-page option only after its dropdown panel is open', () => {
    const options = [
        { label: '20条/页' },
        { label: '100条/页' },
        { label: '300条/页' }
    ];

    assert.equal(RpaImageManagerPagination.findVxePageSizeOption(options, false), null);
    assert.equal(RpaImageManagerPagination.findVxePageSizeOption(options, true), options[1]);
});

test('finds the confirm button inside a visible delete-confirmation dialog, including VXE dialogs', () => {
    assert.ok(RpaImageManagerDeletion, 'RpaImageManagerDeletion must expose delete-confirmation selection');
    const vxeConfirm = { label: '确定' };
    assert.equal(
        RpaImageManagerDeletion.findDeleteConfirmationButton([
            { visible: true, text: '您确定要删除选中的图片吗？', buttons: [{ label: '取消' }, vxeConfirm] },
            { visible: true, text: '普通提示', buttons: [{ label: '确定' }] }
        ]),
        vxeConfirm
    );
});

test('detects visible image cards even when the copy-url text is rendered as an icon only', () => {
    assert.ok(RpaImageManagerDeletion, 'RpaImageManagerDeletion must expose image-card detection');

    const visibleImageCard = {
        visible: true,
        text: '选用 myfile.jpg 800 × 800 74.95KB 未锁定 删除',
        imageCount: 1,
        checkboxCount: 1,
        deleteButtonCount: 1
    };

    assert.equal(
        RpaImageManagerDeletion.hasDeletableImageCards([visibleImageCard]),
        true
    );
});

test('does not treat an empty image-manager page as having deletable images', () => {
    assert.ok(RpaImageManagerDeletion, 'RpaImageManagerDeletion must expose image-card detection');

    assert.equal(
        RpaImageManagerDeletion.hasDeletableImageCards([
            { visible: true, text: '暂无数据', imageCount: 0, checkboxCount: 0, deleteButtonCount: 0 },
            { visible: true, text: '上传图片 删除图片', imageCount: 0, checkboxCount: 0, deleteButtonCount: 0 }
        ]),
        false
    );
});

test('loads image-space recovery before RPA orchestration scripts', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const scripts = manifest.content_scripts[0].js;

    assert.ok(scripts.includes('src/workflows/rpa-image-space.js'));
    assert.ok(scripts.indexOf('src/workflows/rpa-image-space.js') < scripts.indexOf('src/workflows/rpa.js'));
    assert.ok(scripts.indexOf('src/workflows/rpa-image-space.js') < scripts.indexOf('src/content/main.js'));
});

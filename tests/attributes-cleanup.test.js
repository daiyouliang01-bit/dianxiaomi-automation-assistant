'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;

require('./_setup.js');
require('../src/content/description-cleaner.js');

function createRow(name, value) {
    const nameInput = { value: name, tagName: 'INPUT' };
    const valueInput = { value, tagName: 'INPUT' };
    const icon = {
        tagName: 'I',
        className: 'icon_close',
        clicked: 0,
        click() { this.clicked++; }
    };
    const row = {
        querySelector(selector) {
            if (selector === 'i.icon_close') return icon;
            if (selector === 'input') return nameInput;
            return null;
        },
        querySelectorAll(selector) {
            if (selector === 'input') return [nameInput, valueInput];
            if (selector === 'span, i, button, a, em, svg') return [icon];
            return [];
        }
    };
    return { row, icon, nameInput };
}

// 模拟真实页面行为：点击 icon_close 后该行从容器 DOM 中被移除（Vue 重渲染）。
function createContainer(rows) {
    const children = rows.map((entry) => entry.row);
    rows.forEach((entry) => {
        entry.icon.click = function () {
            this.clicked++;
            const index = children.indexOf(entry.row);
            if (index >= 0) children.splice(index, 1);
        };
    });
    return {
        querySelectorAll(selector) {
            assert.equal(selector, 'div.custom-attr-item');
            return children.slice();
        }
    };
}

test('normalizes attribute cleanup levels to complete or conservative', () => {
    assert.equal(window.normalizeAttributeCleanupLevel('complete'), 'complete');
    assert.equal(window.normalizeAttributeCleanupLevel('conservative'), 'conservative');
    assert.equal(window.normalizeAttributeCleanupLevel('unknown-value'), 'conservative');
    assert.equal(window.normalizeAttributeCleanupLevel(undefined), 'conservative');
});

test('conservative mode deletes only rows whose name hits the keyword patterns', () => {
    const hits = ['Size', 'WEIGHT', 'Material', 'origin country', 'Brand Name', 'High-concerned chemical', '尺寸', '重量', '材质', '产地', '品牌', '高关注化学品'];
    hits.forEach((name) => {
        assert.equal(window.shouldDeleteCustomAttributeRow(name, 'conservative'), true, `expected ${name} to match`);
    });

    const safe = ['Length', 'Color', 'Custom Engraving', 'Voltage', 'Original Part', 'Capacity', ''];
    safe.forEach((name) => {
        assert.equal(window.shouldDeleteCustomAttributeRow(name, 'conservative'), false, `expected ${name} not to match`);
    });

    assert.equal(window.shouldDeleteCustomAttributeRow('anything', 'complete'), true);
});

test('complete cleanup deletes every custom attribute row and reports totals', async () => {
    const entries = [
        createRow('Length', '10'),
        createRow('Color', 'Red'),
        createRow('Material', 'Steel')
    ];
    const container = createContainer(entries);
    global.document = { querySelector(selector) { assert.equal(selector, '.smtCustomAttrs'); return container; } };

    const logs = [];
    const result = await window.cleanupCustomAttributesByLevel('complete', (message) => logs.push(message));

    assert.equal(result.removed, 3);
    assert.equal(result.total, 3);
    entries.forEach((entry) => assert.equal(entry.icon.clicked, 1));
    assert.ok(logs.some((message) => message.includes('完全清洗共删除 3')));
    delete global.document;
});

test('conservative cleanup deletes only keyword rows and leaves safe rows untouched', async () => {
    const entries = [
        createRow('Length', '10'),
        createRow('Brand Name', 'ACME'),
        createRow('Color', 'Red'),
        createRow('产地', 'China')
    ];
    const container = createContainer(entries);
    global.document = { querySelector(selector) { assert.equal(selector, '.smtCustomAttrs'); return container; } };

    const result = await window.cleanupCustomAttributesByLevel('conservative');

    assert.equal(result.removed, 2);
    assert.equal(result.total, 4);
    assert.equal(entries[0].icon.clicked, 0);
    assert.equal(entries[1].icon.clicked, 1);
    assert.equal(entries[2].icon.clicked, 0);
    assert.equal(entries[3].icon.clicked, 1);
    delete global.document;
});

test('cleanup stops safely when a row has no delete button', async () => {
    const entries = [
        createRow('Material', 'Steel')
    ];
    const container = createContainer(entries);
    // 模拟找不到 icon_close：清空按钮选择
    const originalQuery = entries[0].row.querySelector;
    entries[0].row.querySelector = () => null;
    global.document = { querySelector(selector) { assert.equal(selector, '.smtCustomAttrs'); return container; } };

    const logs = [];
    const result = await window.cleanupCustomAttributesByLevel('complete', (message) => logs.push(message));

    assert.equal(result.removed, 0);
    assert.equal(result.total, 1);
    assert.ok(logs.some((message) => message.includes('未找到删除按钮')));
    entries[0].row.querySelector = originalQuery;
    delete global.document;
});

test('cleanup returns empty result when the custom attribute container is absent', async () => {
    global.document = { querySelector(selector) { assert.equal(selector, '.smtCustomAttrs'); return null; } };

    const result = await window.cleanupCustomAttributesByLevel('complete');

    assert.deepEqual(result, { removed: 0, total: 0 });
    delete global.document;
});

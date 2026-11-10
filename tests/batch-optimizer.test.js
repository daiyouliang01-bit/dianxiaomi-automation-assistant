'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
global.UI_TEXT_CONFIG = {
    skuCode: '商品编码',
    customName: '自定义名称',
    productTitle: '产品标题',
    selectGroup: '选择分组'
};
global.SkuMapping = {
    normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
};

require('../src/content/batch-optimizer.js');

test('collects title cells only by the explicit virtual-table column index', () => {
    const titleCell = {
        getAttribute(name) {
            if (name === 'data-row-index') return '0';
            if (name === 'data-column-index') return '1';
            return null;
        },
        getBoundingClientRect() { return { width: 350, height: 332, top: 100 }; }
    };
    const titleTable = {
        querySelectorAll(selector) {
            assert.equal(selector, 'td[data-column-index="1"]');
            return [titleCell];
        }
    };
    const titleHeader = {
        innerText: '产品标题',
        parentNode: { children: [] },
        closest(selector) {
            if (selector === 'th') return this;
            if (selector === 'td') return null;
            if (selector === 'table') return titleTable;
            return null;
        },
        getBoundingClientRect() { return { width: 350, height: 32 }; }
    };
    titleHeader.parentNode.children = [{}, titleHeader];
    global.document = {
        querySelectorAll(selector) {
            if (selector === 'th, td, div.cell') return [titleHeader];
            throw new Error(`unexpected selector ${selector}`);
        }
    };

    assert.deepEqual(global.getTitleTds(), [titleCell]);
});

test('collects a stable title task from every row in a virtual table', async () => {
    let renderedRow = null;
    const rows = [0, 1, 2].map((index) => ({
        scrollIntoView() { renderedRow = index; }
    }));
    const table = { tBodies: [{ rows }] };
    const originalGetTitleTable = global.getTitleTable;
    const originalGetTitleColumnIndex = global.getTitleColumnIndex;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalExtractTitle = global.extractBulkTitleFromCell;
    const originalWaitForElement = global.waitForElement;
    global.getTitleTable = () => table;
    global.getTitleColumnIndex = () => 1;
    global.findTitleCellByCoordinates = (rowIndex) => renderedRow === rowIndex ? { rowIndex } : null;
    global.extractBulkTitleFromCell = (cell) => `title-${cell.rowIndex}`;
    global.waitForElement = (finder) => Promise.resolve(finder());

    let tasks;
    try {
        tasks = await global.collectAllTitleTasks();
    } finally {
        global.getTitleTable = originalGetTitleTable;
        global.getTitleColumnIndex = originalGetTitleColumnIndex;
        global.findTitleCellByCoordinates = originalFindTitleCell;
        global.extractBulkTitleFromCell = originalExtractTitle;
        global.waitForElement = originalWaitForElement;
    }

    assert.deepEqual(tasks, [
        { rowIndex: 0, columnIndex: 1, originalTitle: 'title-0' },
        { rowIndex: 1, columnIndex: 1, originalTitle: 'title-1' },
        { rowIndex: 2, columnIndex: 1, originalTitle: 'title-2' }
    ]);
});

test('scrolls a virtual placeholder row into view before writing its title', async () => {
    let scrolled = false;
    let renderedCell = null;
    const placeholder = {
        scrollIntoView() {
            scrolled = true;
            renderedCell = { id: 'rendered-title-cell' };
        }
    };
    const table = { tBodies: [{ rows: [placeholder] }] };
    const originalGetTitleTable = global.getTitleTable;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalWaitForElement = global.waitForElement;
    global.getTitleTable = () => table;
    global.findTitleCellByCoordinates = () => renderedCell;
    global.waitForElement = (finder) => Promise.resolve(finder());

    let result;
    try {
        result = await global.ensureTitleTaskRendered({ rowIndex: 0, columnIndex: 1 });
    } finally {
        global.getTitleTable = originalGetTitleTable;
        global.findTitleCellByCoordinates = originalFindTitleCell;
        global.waitForElement = originalWaitForElement;
    }

    assert.equal(scrolled, true);
    assert.deepEqual(result, { id: 'rendered-title-cell' });
});

test('accepts only non-empty pure-English optimized titles within 128 characters', () => {
    assert.equal(global.isOptimizedBulkTitleValid('Adjustable Galvanized Steel Prop for Concrete Formwork Support'), true);
    assert.equal(global.isOptimizedBulkTitleValid('可调节 Galvanized Steel Prop'), false);
    assert.equal(global.isOptimizedBulkTitleValid('A'.repeat(129)), false);
    assert.equal(global.isOptimizedBulkTitleValid(''), false);
});

test('does not report a title write as successful when the final cell value was not committed', async () => {
    let editing = false;
    let displayedTitle = 'Original Chinese Title';
    const input = {
        tagName: 'INPUT',
        value: displayedTitle,
        dispatchEvent() {}
    };
    const clickTarget = { click() { editing = true; } };
    const cell = {
        querySelector(selector) {
            if (selector === 'div.cell') return clickTarget;
            if (selector.includes('input') || selector.includes('textarea')) return editing ? input : null;
            return null;
        },
        contains(node) { return node === input; },
        get innerText() { return displayedTitle; }
    };
    const originalEnsure = global.ensureTitleTaskRendered;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalWaitForElement = global.waitForElement;
    const originalDocument = global.document;
    global.ensureTitleTaskRendered = () => Promise.resolve(cell);
    global.findTitleCellByCoordinates = () => cell;
    global.waitForElement = (finder) => Promise.resolve(typeof finder === 'function' ? finder() : null);
    global.document = { activeElement: null };

    await assert.rejects(
        async () => {
            try {
                await global.writeTitleTask(
                    { rowIndex: 0, columnIndex: 1, originalTitle: displayedTitle },
                    'Verified English Product Title'
                );
            } finally {
                global.ensureTitleTaskRendered = originalEnsure;
                global.findTitleCellByCoordinates = originalFindTitleCell;
                global.waitForElement = originalWaitForElement;
                global.document = originalDocument;
            }
        },
        /写入后未能通过校验/
    );
});

test('commits a title by clicking an adjacent virtual row before verifying it', async () => {
    let editing = false;
    let pendingTitle = '';
    let displayedTitle = 'Original Chinese Title';
    const input = {
        tagName: 'TEXTAREA',
        value: displayedTitle,
        focus() {},
        select() {},
        dispatchEvent(event) {
            if (event.type === 'input') pendingTitle = this.value;
        }
    };
    const clickTarget = { click() { editing = true; } };
    const cell = {
        querySelector(selector) {
            if (selector === 'div.cell') return clickTarget;
            if (selector.includes('input') || selector.includes('textarea')) return editing ? input : null;
            return null;
        },
        get innerText() { return displayedTitle; }
    };
    const adjacentCell = {
        click() {
            displayedTitle = pendingTitle;
            editing = false;
        }
    };
    const table = { tBodies: [{ rows: [{ cells: [cell] }, { cells: [adjacentCell] }] }] };
    const originalEnsure = global.ensureTitleTaskRendered;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalGetTitleTable = global.getTitleTable;
    const originalWaitForElement = global.waitForElement;
    global.ensureTitleTaskRendered = () => Promise.resolve(cell);
    global.findTitleCellByCoordinates = () => cell;
    global.getTitleTable = () => table;
    global.waitForElement = (finder) => Promise.resolve(typeof finder === 'function' ? finder() : null);

    let result;
    try {
        result = await global.writeTitleTask(
            { rowIndex: 0, columnIndex: 1, originalTitle: displayedTitle },
            'Verified English Product Title'
        );
    } finally {
        global.ensureTitleTaskRendered = originalEnsure;
        global.findTitleCellByCoordinates = originalFindTitleCell;
        global.getTitleTable = originalGetTitleTable;
        global.waitForElement = originalWaitForElement;
    }

    assert.equal(result, true);
    assert.equal(displayedTitle, 'Verified English Product Title');
});

test('falls back to the fixed title header when a virtual adjacent row does not end editing', async () => {
    let editing = false;
    let pendingTitle = '';
    let displayedTitle = 'Original Chinese Title';
    let adjacentClicks = 0;
    let headerMouseDowns = 0;
    const input = {
        tagName: 'TEXTAREA',
        value: displayedTitle,
        focus() {},
        select() {},
        dispatchEvent(event) {
            if (event.type === 'input') pendingTitle = this.value;
        }
    };
    const cell = {
        querySelector(selector) {
            if (selector === 'div.cell') return { click() { editing = true; } };
            if (selector.includes('input') || selector.includes('textarea')) return editing ? input : null;
            return null;
        },
        get innerText() { return displayedTitle; }
    };
    const adjacentCell = { click() { adjacentClicks += 1; } };
    const titleHeader = {
        dispatchEvent(event) {
            if (event.type === 'mousedown') {
                headerMouseDowns += 1;
                displayedTitle = pendingTitle;
                editing = false;
            }
        }
    };
    const table = { tBodies: [{ rows: [{ cells: [cell] }, { cells: [adjacentCell] }] }] };
    const originalEnsure = global.ensureTitleTaskRendered;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalGetTitleTable = global.getTitleTable;
    const originalGetTitleHeader = global.getTitleHeader;
    const originalWaitForElement = global.waitForElement;
    global.ensureTitleTaskRendered = () => Promise.resolve(cell);
    global.findTitleCellByCoordinates = () => cell;
    global.getTitleTable = () => table;
    global.getTitleHeader = () => titleHeader;
    global.waitForElement = (finder) => Promise.resolve(typeof finder === 'function' ? finder() : null);

    let result;
    try {
        result = await global.writeTitleTask(
            { rowIndex: 0, columnIndex: 1, originalTitle: displayedTitle },
            'Header Committed English Product Title'
        );
    } finally {
        global.ensureTitleTaskRendered = originalEnsure;
        global.findTitleCellByCoordinates = originalFindTitleCell;
        global.getTitleTable = originalGetTitleTable;
        global.getTitleHeader = originalGetTitleHeader;
        global.waitForElement = originalWaitForElement;
    }

    assert.equal(result, true);
    assert.equal(adjacentClicks, 1);
    assert.equal(headerMouseDowns, 1);
    assert.equal(displayedTitle, 'Header Committed English Product Title');
});

test('retries one title write when the first click-away commit is not reflected', async () => {
    let editing = false;
    let pendingTitle = '';
    let displayedTitle = 'Original Chinese Title';
    let commitAttempts = 0;
    const input = {
        tagName: 'TEXTAREA',
        value: displayedTitle,
        focus() {},
        select() {},
        dispatchEvent(event) {
            if (event.type === 'input') pendingTitle = this.value;
        }
    };
    const cell = {
        querySelector(selector) {
            if (selector === 'div.cell') return { click() { editing = true; } };
            if (selector.includes('input') || selector.includes('textarea')) return editing ? input : null;
            return null;
        },
        get innerText() { return displayedTitle; }
    };
    const adjacentCell = {
        click() {
            commitAttempts += 1;
            editing = false;
            if (commitAttempts === 2) displayedTitle = pendingTitle;
        }
    };
    const table = { tBodies: [{ rows: [{ cells: [cell] }, { cells: [adjacentCell] }] }] };
    const originalEnsure = global.ensureTitleTaskRendered;
    const originalFindTitleCell = global.findTitleCellByCoordinates;
    const originalGetTitleTable = global.getTitleTable;
    const originalWaitForElement = global.waitForElement;
    global.ensureTitleTaskRendered = () => Promise.resolve(cell);
    global.findTitleCellByCoordinates = () => cell;
    global.getTitleTable = () => table;
    global.waitForElement = (finder) => Promise.resolve(typeof finder === 'function' ? finder() : null);

    let result;
    try {
        result = await global.writeTitleTask(
            { rowIndex: 0, columnIndex: 1, originalTitle: displayedTitle },
            'Retried English Product Title'
        );
    } finally {
        global.ensureTitleTaskRendered = originalEnsure;
        global.findTitleCellByCoordinates = originalFindTitleCell;
        global.getTitleTable = originalGetTitleTable;
        global.waitForElement = originalWaitForElement;
    }

    assert.equal(result, true);
    assert.equal(commitAttempts, 2);
    assert.equal(displayedTitle, 'Retried English Product Title');
});

test('continues later title writes and reports only verified successes', async () => {
    const attempted = [];
    const originalWriteTitleTask = global.writeTitleTask;
    global.writeTitleTask = async (task) => {
        attempted.push(task.originalTitle);
        if (task.originalTitle === 'broken') throw new Error('verification failed');
        return true;
    };
    const originalError = console.error;
    console.error = () => {};

    let result;
    try {
        result = await global.writeTitleTasksSafely(
            [
                { originalTitle: 'first' },
                { originalTitle: 'broken' },
                { originalTitle: 'last' }
            ],
            ['First English Title', 'Broken English Title', 'Last English Title']
        );
    } finally {
        global.writeTitleTask = originalWriteTitleTask;
        console.error = originalError;
    }

    assert.deepEqual(attempted, ['first', 'broken', 'last']);
    assert.equal(result.written, 2);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.failures, [
        { originalTitle: 'broken', message: 'verification failed' }
    ]);
});

test('collects SKU cells only from the table that owns the SKU header', () => {
    const skuCell = {
        getAttribute(name) {
            if (name === 'data-row-index') return '0';
            if (name === 'data-column-index') return '4';
            return null;
        },
        getBoundingClientRect() { return { width: 120, height: 32, top: 100 }; }
    };
    const skuTable = {
        querySelectorAll(selector) {
            assert.equal(selector, 'td[data-column-index="4"]');
            return [skuCell];
        }
    };
    const skuHeader = {
        innerText: '商品编码',
        classList: ['shared-column'],
        parentNode: { children: [] },
        closest(selector) {
            if (selector === 'th') return this;
            if (selector === 'td') return null;
            if (selector === 'table') return skuTable;
            return null;
        },
        getBoundingClientRect() { return { width: 120, height: 32, left: 300, right: 420 }; }
    };
    skuHeader.parentNode.children = [{}, {}, {}, {}, skuHeader];
    global.document = {
        querySelectorAll(selector) {
            if (selector === 'th, td, div.cell') return [skuHeader];
            throw new Error(`must not query unrelated page content with ${selector}`);
        }
    };

    assert.deepEqual(global.getSkuTds(), [skuCell]);
});

test('does not treat a virtual placeholder spanning all columns as a SKU cell', () => {
    const placeholder = {
        getAttribute() { return null; },
        getBoundingClientRect() { return { width: 1500, height: 332, top: 100 }; }
    };
    const skuTable = {
        querySelectorAll(selector) {
            assert.equal(selector, 'td[data-column-index="4"]');
            return [];
        }
    };
    const skuHeader = {
        innerText: '商品编码',
        classList: ['blue-bg'],
        parentNode: { children: [] },
        closest(selector) {
            if (selector === 'th') return this;
            if (selector === 'td') return null;
            if (selector === 'table') return skuTable;
            return null;
        },
        getBoundingClientRect() { return { width: 200, height: 32, left: 1000, right: 1200 }; }
    };
    skuHeader.parentNode.children = [{}, {}, {}, {}, skuHeader];
    global.document = {
        querySelectorAll(selector) {
            if (selector === 'th, td, div.cell') return [skuHeader];
            if (selector === 'tbody td') return [placeholder];
            throw new Error(`unexpected selector ${selector}`);
        }
    };

    assert.deepEqual(global.getSkuTds(), []);
});

test('collects real SKU descriptors from every row in a virtual table', async () => {
    let renderedRow = null;
    const rows = [0, 1, 2].map((index) => ({
        scrollIntoView() { renderedRow = index; }
    }));
    const table = { tBodies: [{ rows }] };
    const originalGetSkuTable = global.getSkuTable;
    const originalGetSkuColumnIndex = global.getSkuColumnIndex;
    const originalFindSkuCell = global.findSkuCellByCoordinates;
    const originalGetDescriptors = global.getSkuCandidateDescriptors;
    const originalWaitForElement = global.waitForElement;
    global.getSkuTable = () => table;
    global.getSkuColumnIndex = () => 4;
    global.findSkuCellByCoordinates = (rowIndex) => renderedRow === rowIndex ? { rowIndex } : null;
    global.getSkuCandidateDescriptors = (cells) => cells.map(cell => ({ originalCode: `sku-${cell.rowIndex}` }));
    global.waitForElement = (finder) => Promise.resolve(finder());

    let descriptors;
    try {
        descriptors = await global.collectAllSkuCandidateDescriptors();
    } finally {
        global.getSkuTable = originalGetSkuTable;
        global.getSkuColumnIndex = originalGetSkuColumnIndex;
        global.findSkuCellByCoordinates = originalFindSkuCell;
        global.getSkuCandidateDescriptors = originalGetDescriptors;
        global.waitForElement = originalWaitForElement;
    }

    assert.deepEqual(descriptors.map(item => item.originalCode), ['sku-0', 'sku-1', 'sku-2']);
});

test('uses the source product URL as a stable product key across DOM rerenders', () => {
    const makeCell = () => {
        const sourceLink = {
            getAttribute(name) {
                return name === 'href'
                    ? 'https://www.alibaba.com/product-detail/example_1601830851939.html'
                    : null;
            }
        };
        const row = {
            getAttribute() { return null; },
            querySelector(selector) {
                if (selector.includes('checkbox')) return null;
                if (selector.includes('a[href')) return sourceLink;
                return null;
            }
        };
        return {
            getAttribute() { return null; },
            closest(selector) { return selector === 'tr' ? row : null; }
        };
    };

    assert.equal(
        global.getSkuProductKey(makeCell()),
        global.getSkuProductKey(makeCell())
    );
    assert.match(global.getSkuProductKey(makeCell()), /^source:/);
});

test('uses 店小秘 virtual-table coordinates as stable SKU identity', () => {
    const makeCell = () => {
        const row = {
            getAttribute() { return null; },
            querySelector(selector) {
                if (selector.includes('checkbox')) return null;
                if (selector.includes('a[href')) return null;
                if (selector.includes('data-row-index')) {
                    return {
                        getAttribute(name) {
                            if (name === 'data-row-index') return '37';
                            return null;
                        }
                    };
                }
                return null;
            }
        };
        return {
            getAttribute(name) {
                if (name === 'data-row-index') return '37';
                if (name === 'data-column-index') return '5';
                return null;
            },
            closest(selector) { return selector === 'tr' ? row : null; }
        };
    };

    assert.equal(global.getSkuProductKey(makeCell()), 'virtual-row:37');
    assert.equal(global.getSkuProductKey(makeCell()), 'virtual-row:37');
});

test('uses a stable index identity for a SKU without a variant id', () => {
    const target = { getAttribute() { return null; } };
    assert.equal(global.getSkuVariantKey(target, '原始中文编码', -1), 'index:0');
});

test('scrolls a virtual placeholder row into view before resolving a SKU', async () => {
    let scrolled = false;
    let renderedTarget = null;
    const placeholder = {
        scrollIntoView() {
            scrolled = true;
            renderedTarget = { id: 'rendered-sku' };
        }
    };
    const table = {
        tBodies: [{ rows: [placeholder] }]
    };
    const originalGetSkuTable = global.getSkuTable;
    const originalFindSkuTaskTarget = global.findSkuTaskTargetByCoordinates;
    const originalWaitForElement = global.waitForElement;
    global.getSkuTable = () => table;
    global.findSkuTaskTargetByCoordinates = () => renderedTarget;
    global.waitForElement = (finder) => Promise.resolve(finder());

    let result;
    try {
        result = await global.ensureSkuTaskRendered({ rowIndex: 0, columnIndex: 5, variationIndex: 0 });
    } finally {
        global.getSkuTable = originalGetSkuTable;
        global.findSkuTaskTargetByCoordinates = originalFindSkuTaskTarget;
        global.waitForElement = originalWaitForElement;
    }

    assert.equal(scrolled, true);
    assert.deepEqual(result, { id: 'rendered-sku' });
});

test('re-resolves SKU target via resolveSkuTaskTarget instead of using cached target', async () => {
    const staleTarget = { isConnected: false };
    const currentTarget = {
        isConnected: true,
        tagName: 'DIV',
        querySelectorAll() { return []; },
        querySelector() { return null; },
        closest() { return null; },
        scrollIntoView() {},
        contains() { return false; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; },
        dispatchEvent() {}
    };
    let resolveCalls = 0;

    global.document = {
        querySelectorAll() { return []; },
        activeElement: null
    };
    global.resolveSkuTaskTarget = (task) => {
        resolveCalls += 1;
        assert.equal(task.originalCode, '原始中文编码');
        return { target: currentTarget };
    };
    // Mock waitForElement to return null (no input found)
    const origWait = global.waitForElement;
    global.waitForElement = () => Promise.resolve(null);

    let thrown = false;
    let catchMsg = '';
    try {
        await global.writeSkuTask({
            target: staleTarget,
            originalCode: '原始中文编码',
            productKey: 'product:1',
            variantKey: 'variant:1'
        }, 'Safe-Code');
    } catch (e) {
        thrown = true;
        catchMsg = e.message;
    }

    global.waitForElement = origWait;
    assert.equal(thrown, true);
    assert.equal(resolveCalls, 1);
});

test('continues writing later SKU tasks when one SKU cannot be resolved', async () => {
    const attempted = [];
    global.sanitizeSkuCode = (value) => value;
    global.writeSkuTask = async (task) => {
        attempted.push(task.originalCode);
        if (task.originalCode === 'broken') throw new Error('target disappeared');
        return true;
    };
    const originalError = console.error;
    console.error = () => {};

    let result;
    try {
        result = await global.writeSkuTasksSafely([
            { originalCode: 'first', optimizedCode: 'First' },
            { originalCode: 'broken', optimizedCode: 'Broken' },
            { originalCode: 'last', optimizedCode: 'Last' }
        ]);
    } finally {
        console.error = originalError;
    }

    assert.deepEqual(attempted, ['first', 'broken', 'last']);
    assert.equal(result.written, 2);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.failures, [
        { originalCode: 'broken', message: 'target disappeared' }
    ]);
});

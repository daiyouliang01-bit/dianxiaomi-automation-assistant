'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

let SkuMapping;
try {
    require('../src/domain/sku-mapping.js');
    SkuMapping = global.SkuMapping;
} catch (_) {
    SkuMapping = null;
}

test('resolves a multi-variant SKU by stable identity after the DOM order changes', () => {
    assert.ok(SkuMapping, 'SkuMapping must be available to resolve SKU targets safely');

    const task = {
        productKey: 'product:9001',
        variantKey: 'variant:color-white',
        originalCode: '单边功率计改装 左曲柄'
    };
    const candidatesInNewDomOrder = [
        {
            productKey: 'product:9001',
            variantKey: 'variant:color-yellow',
            originalCode: '单边功率计改装 右曲柄',
            target: 'yellow-input'
        },
        {
            productKey: 'product:9001',
            variantKey: 'variant:color-white',
            originalCode: '单边功率计改装 左曲柄',
            target: 'white-input'
        }
    ];

    assert.equal(
        SkuMapping.resolveUniqueTarget(task, candidatesInNewDomOrder).target,
        'white-input'
    );
});

test('refuses an ambiguous SKU target instead of overwriting the first variant', () => {
    assert.ok(SkuMapping, 'SkuMapping must be available to reject ambiguous SKU targets');

    const task = {
        productKey: 'product:9002',
        variantKey: 'variant:missing',
        originalCode: 'Black'
    };
    const candidates = [
        { ...task, target: 'first-input' },
        { ...task, target: 'second-input' }
    ];

    assert.throws(
        () => SkuMapping.resolveUniqueTarget(task, candidates),
        /unable to uniquely resolve/i
    );
});

test('keeps each AI SKU result paired with its original task and validates result count', () => {
    assert.ok(SkuMapping, 'SkuMapping must be available to pair AI results safely');

    const tasks = [
        { id: 'white', originalCode: '左曲柄' },
        { id: 'yellow', originalCode: '右曲柄' }
    ];

    assert.deepEqual(
        SkuMapping.attachOptimizedCodes(tasks, ['PwrMtr Mod L-Crank', 'PwrMtr Mod R-Crank']),
        [
            { id: 'white', originalCode: '左曲柄', optimizedCode: 'PwrMtr Mod L-Crank' },
            { id: 'yellow', originalCode: '右曲柄', optimizedCode: 'PwrMtr Mod R-Crank' }
        ]
    );
    assert.throws(
        () => SkuMapping.attachOptimizedCodes(tasks, ['only-one-result']),
        /result count/i
    );
});

test('treats pure English numeric short product codes as compliant', () => {
    assert.ok(SkuMapping, 'SkuMapping must expose product-code compliance rules');
    assert.equal(typeof SkuMapping.isCodeCompliant, 'function');

    assert.equal(SkuMapping.isCodeCompliant('Standard'), true);
    assert.equal(SkuMapping.isCodeCompliant('OE'), true);
    assert.equal(SkuMapping.isCodeCompliant('2214210612'), true);
    assert.equal(SkuMapping.isCodeCompliant('380*30mm'), true);
    assert.equal(SkuMapping.isCodeCompliant('39*39*6cm'), true);
    assert.equal(SkuMapping.isCodeCompliant('Black-5-22"'), true);
    assert.equal(SkuMapping.isCodeCompliant('Silver-5-19"'), true);
    assert.equal(SkuMapping.isCodeCompliant('Customized-4-21"'), true);
    assert.equal(SkuMapping.isCodeCompliant('中文编码'), false);
    assert.equal(SkuMapping.isCodeCompliant('VeryLongEnglishCodeThatExceedsLimitPlusMoreChars12345'), false);
    assert.equal(SkuMapping.isCodeCompliant('52、18650'), false);
});

test('normalizes Chinese material product codes while preserving the core specification', () => {
    assert.ok(SkuMapping, 'SkuMapping must expose product-code normalization rules');
    assert.equal(typeof SkuMapping.normalizeProductCode, 'function');

    assert.equal(
        SkuMapping.normalizeProductCode('ERGO15 碳纤维车把740-80m'),
        'ERGO15 Crb 740-80m'
    );
    assert.equal(
        SkuMapping.normalizeProductCode('ERGO15 铝合金车把740-80m'),
        'ERGO15 Alu 740-80m'
    );
    assert.equal(
        SkuMapping.normalizeProductCode('ERGO15 Crb 740-80m'),
        'ERGO15 Crb 740-80m'
    );
});

test('uses local product-code cleanup before AI when material and specification are clear', () => {
    assert.ok(SkuMapping, 'SkuMapping must expose SKU task construction');

    const tasks = SkuMapping.buildSkuOptimizationTasks([
        { productKey: 'product:1', variantKey: 'variant:1', originalCode: 'ERGO15 碳纤维车把740-80m', target: 'input-1' },
        { productKey: 'product:2', variantKey: 'variant:2', originalCode: '中文编码', target: 'input-2' },
        { productKey: 'product:3', variantKey: 'variant:3', originalCode: 'ERGO15 Alu 740-80m', target: 'input-3' }
    ]);

    assert.equal(tasks[0].needsLocalWrite, true);
    assert.equal(tasks[0].needsOptimize, false);
    assert.equal(tasks[0].localOptimizedCode, 'ERGO15 Crb 740-80m');
    assert.equal(tasks[1].needsLocalWrite, false);
    assert.equal(tasks[1].needsOptimize, true);
    assert.equal(tasks[2].needsLocalWrite, false);
    assert.equal(tasks[2].needsOptimize, false);
});

test('does not capture volatile row and cell positions in SKU tasks', () => {
    const td = { parentElement: null };
    const tr = { cells: [td], parentElement: { rows: [] } };
    td.parentElement = tr;
    tr.parentElement.rows = [tr];
    const target = {
        closest(selector) { return selector === 'td' ? td : null; }
    };
    const previousDocument = global.document;
    global.document = {
        querySelectorAll() {
            throw new Error('global tbody positions are not stable SKU identity');
        }
    };

    let tasks;
    try {
        tasks = SkuMapping.buildSkuOptimizationTasks([
            { productKey: 'product:stable', variantKey: 'variant:stable', originalCode: '中文编码', target }
        ]);
    } finally {
        global.document = previousDocument;
    }

    assert.equal(tasks.length, 1);
    assert.equal(Object.hasOwn(tasks[0], '_rowIndex'), false);
    assert.equal(Object.hasOwn(tasks[0], '_cellIndex'), false);
});

test('combines local product-code cleanup tasks with AI optimized code results', () => {
    assert.ok(SkuMapping, 'SkuMapping must expose optimized SKU write-task assembly');
    assert.equal(typeof SkuMapping.buildOptimizedCodeWriteTasks, 'function');

    const tasks = SkuMapping.buildSkuOptimizationTasks([
        { productKey: 'product:1', variantKey: 'variant:1', originalCode: 'ERGO15 碳纤维车把740-80m', target: 'input-1' },
        { productKey: 'product:2', variantKey: 'variant:2', originalCode: '中文编码', target: 'input-2' },
        { productKey: 'product:3', variantKey: 'variant:3', originalCode: 'ERGO15 Alu 740-80m', target: 'input-3' }
    ]);

    assert.deepEqual(
        SkuMapping.buildOptimizedCodeWriteTasks(tasks, ['Manual Code']),
        [
            { ...tasks[0], optimizedCode: 'ERGO15 Crb 740-80m' },
            { ...tasks[1], optimizedCode: 'Manual Code' }
        ]
    );
});



test('keeps short English inch product codes unchanged instead of abbreviating them', () => {
    assert.ok(SkuMapping, 'SkuMapping must expose SKU task construction');

    const tasks = SkuMapping.buildSkuOptimizationTasks([
        { productKey: 'product:1', variantKey: 'variant:1', originalCode: 'Black-5-22"', target: 'input-1' },
        { productKey: 'product:2', variantKey: 'variant:2', originalCode: 'Silver-5-19"', target: 'input-2' },
        { productKey: 'product:3', variantKey: 'variant:3', originalCode: 'Customized-4-21"', target: 'input-3' }
    ]);

    assert.deepEqual(
        tasks.map(task => ({
            originalCode: task.originalCode,
            needsOptimize: task.needsOptimize,
            needsLocalWrite: task.needsLocalWrite,
            localOptimizedCode: task.localOptimizedCode
        })),
        [
            { originalCode: 'Black-5-22"', needsOptimize: false, needsLocalWrite: false, localOptimizedCode: '' },
            { originalCode: 'Silver-5-19"', needsOptimize: false, needsLocalWrite: false, localOptimizedCode: '' },
            { originalCode: 'Customized-4-21"', needsOptimize: false, needsLocalWrite: false, localOptimizedCode: '' }
        ]
    );
});

test('verifies a written SKU by stable identity after its original code has changed', () => {
    assert.ok(SkuMapping, 'SkuMapping must be available to verify SKU writes safely');
    assert.equal(typeof SkuMapping.resolveUniqueIdentity, 'function');

    const task = {
        productKey: 'product:9003',
        variantKey: 'variant:color-white',
        originalCode: '原始中文编码'
    };
    const candidatesAfterWrite = [
        {
            productKey: 'product:9003',
            variantKey: 'variant:color-yellow',
            originalCode: 'PwrMtr Mod R-Crank',
            target: 'yellow-input'
        },
        {
            productKey: 'product:9003',
            variantKey: 'variant:color-white',
            originalCode: 'PwrMtr Mod L-Crank',
            target: 'white-input'
        }
    ];

    assert.equal(
        SkuMapping.resolveUniqueIdentity(task, candidatesAfterWrite).target,
        'white-input'
    );
});

test('loads the SKU mapping module before main.js in the content-script pipeline', () => {
    const manifestPath = path.join(__dirname, '..', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.content_scripts[0].js;

    assert.ok(scripts.includes('src/domain/sku-mapping.js'));
    assert.ok(scripts.indexOf('src/domain/sku-mapping.js') < scripts.indexOf('src/content/main.js'));
});

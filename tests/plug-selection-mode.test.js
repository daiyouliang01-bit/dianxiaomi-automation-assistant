'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

require('../src/workflows/plug-selection.js');

test('plug optimization is the only special mode after medical refactor', () => {
    assert.equal(window.PlugSelection.MODE, 'plug');
    assert.equal(window.PlugSelection.normalizeOptimizationMode('plug'), 'plug');
    assert.equal(window.PlugSelection.normalizeOptimizationMode('unknown'), 'normal');
    assert.equal(window.PlugSelection.isPlugOptimizationMode('plug'), true);
    assert.equal(window.PlugSelection.isPlugOptimizationMode('normal'), false);
});

test('plug snapshot keeps required sales fields and ignores delivery/product validity fields', () => {
    const snapshot = window.PlugSelection.createPlugSnapshot({
        retailPrice: '2066.17',
        declaredValue: '1652.94',
        stock: '19',
        stockDeduction: '付款减库存',
        weight: '1.50',
        dimensions: { length: '18', width: '15', height: '6' },
        logisticsAttributes: ['普货', '内电'],
        productCode: 'RC-001'
    });
    assert.equal(snapshot.retailPrice, '2066.17');
    assert.equal(snapshot.declaredValue, '1652.94');
    assert.equal(snapshot.stock, '19');
    assert.equal(snapshot.stockDeduction, '付款减库存');
    assert.equal(snapshot.weight, '1.50');
    assert.equal(snapshot.dimensions.length, '18');
    assert.equal(snapshot.dimensions.width, '15');
    assert.equal(snapshot.dimensions.height, '6');
    assert.equal(snapshot.originalBox, '是');
    assert.deepEqual(snapshot.logisticsAttributes, ['普货', '内电']);
    assert.equal(snapshot.productCode, 'RC-001');
});

test('plug snapshot reports missing logistics selections as unsafe', () => {
    const snapshot = window.PlugSelection.createPlugSnapshot({
        retailPrice: '2066.17',
        declaredValue: '1652.94',
        stock: '19',
        stockDeduction: '付款减库存',
        weight: '1.50',
        dimensions: { length: '18', width: '15', height: '6' },
        logisticsAttributes: []
    });
    assert.deepEqual(window.PlugSelection.getMissingPlugSnapshotFields(snapshot), ['logisticsAttributes']);
});

test('plug snapshot allows blank product code because customers may leave it empty', () => {
    const snapshot = window.PlugSelection.createPlugSnapshot({
        retailPrice: '2066.17',
        declaredValue: '1652.94',
        stock: '19',
        stockDeduction: '付款减库存',
        weight: '1.50',
        dimensions: { length: '18', width: '15', height: '6' },
        logisticsAttributes: ['普货', '内电']
    });
    assert.deepEqual(window.PlugSelection.getMissingPlugSnapshotFields(snapshot), []);
});

test('getMissingPlugSnapshotFields returns empty for complete plug snapshot', () => {
    assert.deepEqual(window.PlugSelection.getMissingPlugSnapshotFields({
        retailPrice: '2066.17',
        declaredValue: '1652.94',
        stock: '19',
        stockDeduction: '付款减库存',
        weight: '1.50',
        dimensions: { length: '18', width: '15', height: '6' },
        originalBox: '是',
        logisticsAttributes: ['普货', '内电']
    }), []);
});

test('getMissingPlugSnapshotFields lists missing logistics attributes', () => {
    assert.deepEqual(window.PlugSelection.getMissingPlugSnapshotFields({
        retailPrice: '2066.17',
        declaredValue: '1652.94',
        stock: '19',
        stockDeduction: '付款减库存',
        weight: '1.50',
        dimensions: { length: '18', width: '15', height: '6' },
        originalBox: '是',
        logisticsAttributes: []
    }), ['logisticsAttributes']);
});



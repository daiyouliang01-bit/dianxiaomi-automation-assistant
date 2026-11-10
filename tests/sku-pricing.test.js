'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const SkuPricing = require('../src/domain/sku-pricing.js');

test('reads rpa_source_cost from edit URL', () => {
    assert.equal(SkuPricing.costFromSearch('?id=1&rpa_source_cost=25.46&rpa_auto=1'), 25.46);
    assert.equal(SkuPricing.costFromSearch('?id=1'), null);
});

test('parses 货源价 from collection-box style text', () => {
    const text = 'alibaba 高强度网 「0785-李俊频」 「零 25.46 CNY」 「批 24.19 CNY」';
    assert.equal(SkuPricing.parseSourcePrice(text), 25.46);
});

test('computes retail = declared = (cost + 5) * 2.469', () => {
    assert.equal(SkuPricing.computeRetailPrice(25.46), 75.21);
});

test('does not overwrite an already converted retail price', () => {
    assert.equal(SkuPricing.shouldWriteRetail('75.21', 25.46, 75.21), false);
});

test('overwrites empty or source-equal retail', () => {
    assert.equal(SkuPricing.shouldWriteRetail('', 25.46, 75.21), true);
    assert.equal(SkuPricing.shouldWriteRetail('25.46', 25.46, 75.21), true);
    assert.equal(SkuPricing.shouldWriteRetail('0', 25.46, 75.21), true);
});

test('parses weight grams to kg and only fills empty weight', () => {
    assert.equal(SkuPricing.parseWeightKg('净重 200g'), 0.2);
    assert.equal(SkuPricing.parseWeightKg('0.35kg'), 0.35);
    assert.equal(SkuPricing.shouldWriteWeight('', 0.2), true);
    assert.equal(SkuPricing.shouldWriteWeight('0.5', 0.2), false);
});

test('rejects missing cost', () => {
    assert.equal(SkuPricing.parseSourcePrice('暂无数据'), null);
    assert.equal(SkuPricing.computeRetailPrice(null), null);
    assert.equal(SkuPricing.shouldWriteRetail('', null, null), false);
});

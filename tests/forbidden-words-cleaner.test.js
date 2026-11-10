'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cleanerPath = '../src/safety/forbidden-words-cleaner.js';

function loadCleaner() {
    // Use globalThis to load the IIFE module like in production
    // This simulates how it loads in both content scripts and background
    const existing = globalThis.ForbiddenWordsCleaner;
    delete require.cache[require.resolve(cleanerPath)];
    globalThis.ForbiddenWordsCleaner = undefined;
    const api = require(cleanerPath);
    globalThis.ForbiddenWordsCleaner = api;
    return api;
}

test('cleanText returns empty string for empty input', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('', ['bad'], []), '');
    assert.equal(api.cleanText(null, ['bad'], []), '');
    assert.equal(api.cleanText(undefined, ['bad'], []), '');
});

test('cleanText returns unchanged text when no forbidden words match', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('hello world', ['bad'], []), 'hello world');
    assert.equal(api.cleanText('Premium Quality Product', ['bad'], []), 'Premium Quality Product');
});

test('cleanText removes forbidden words using word boundaries', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('Hot Sale New Product', ['Hot Sale', 'New'], []), 'Product');
});

test('cleanText does not match partial words', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('Cat Category Catalog', ['Cat'], []), 'Category Catalog');
});

test('cleanText respects whitelist', () => {
    const api = loadCleaner();
    const forbidden = ['hot', 'sale', 'free'];
    const whiteList = ['sale'];
    // 'hot' not whitelisted → removed; 'sale' whitelisted → kept; 'free' removed
    assert.equal(api.cleanText('Hot Sale Free Shipping', forbidden, whiteList), 'Sale Shipping');
});

test('cleanText handles multiple forbidden word removal', () => {
    const api = loadCleaner();
    const forbidden = ['hot', 'sale', 'free', 'shipping', 'new'];
    assert.equal(api.cleanText('Hot Sale Free Shipping New Product', forbidden, []), 'Product');
});

test('cleanText ignores empty and whitespace-only words in the list', () => {
    const api = loadCleaner();
    const forbidden = ['', '  ', 'bad', null, undefined];
    assert.equal(api.cleanText('good bad product', forbidden, []), 'good product');
});

test('cleanText handles special regex characters in forbidden words', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('C.D.I component', ['C.D.I'], []), 'component');
    // Note: \b before non-word chars like ( and $ doesn't form a word boundary
    // This is a known limitation of the \bword\b approach inherited from V2 3
    assert.equal(api.cleanText('test (product) here', ['(product)'], []), 'test (product) here');
    assert.equal(api.cleanText('price $100 cost', ['$100'], []), 'price $100 cost');
});

test('cleanText folds multiple spaces after removal', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('Hot  Sale   Free   Shipping', ['Hot', 'Sale', 'Free', 'Shipping'], []), '');
});

test('cleanText handles forbiddenWords as objects with word property', () => {
    const api = loadCleaner();
    const forbidden = [{ word: 'hot' }, { word: 'sale' }];
    assert.equal(api.cleanText('Hot Sale Product', forbidden, []), 'Product');
});

test('cleanText is case insensitive', () => {
    const api = loadCleaner();
    // 'HOT', 'hot' match 'hot'; 'Sale', 'SALE' don't match 'hot'
    assert.equal(api.cleanText('HOT Sale hot SALE', ['hot'], []), 'Sale SALE');
});

test('cleanTextNode returns same result as cleanText', () => {
    const api = loadCleaner();
    assert.equal(api.cleanTextNode('Hot Sale Product', ['hot', 'sale'], []), 'Product');
    assert.equal(api.cleanTextNode('', ['bad'], []), '');
    assert.equal(api.cleanTextNode('clean text', ['bad'], []), 'clean text');
});

test('escapeRegex escapes all special regex characters', () => {
    const api = loadCleaner();
    assert.equal(api.escapeRegex('.'), '\\.');
    assert.equal(api.escapeRegex('$100'), '\\$100');
    assert.equal(api.escapeRegex('(test)'), '\\(test\\)');
    assert.equal(api.escapeRegex('[abc]'), '\\[abc\\]');
});

test('toWord extracts string from various input types', () => {
    const api = loadCleaner();
    assert.equal(api.toWord('test'), 'test');
    assert.equal(api.toWord({ word: 'test' }), 'test');
    assert.equal(api.toWord(null), '');
    assert.equal(api.toWord(undefined), '');
    assert.equal(api.toWord(123), '');
});

test('cleanText trims the final result', () => {
    const api = loadCleaner();
    assert.equal(api.cleanText('  Hot Sale  ', ['Hot', 'Sale'], []), '');
    assert.equal(api.cleanText('  Hello World  ', ['bad'], []), 'Hello World');
});

test('cleanText handles concurrent removal without intermediate state issues', () => {
    const api = loadCleaner();
    // Removing all words should leave empty string, not create a space
    assert.equal(api.cleanText('A B C', ['A', 'B', 'C'], []), '');
});

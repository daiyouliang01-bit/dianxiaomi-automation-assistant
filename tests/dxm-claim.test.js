'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
global.document = { querySelectorAll() { return []; }, getElementById() { return null; } };
global.sessionStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); }
};
global.alert = () => {};
global.HTMLInputElement = class {};
global.HTMLTextAreaElement = class {};

require('../src/workflows/dxm-claim.js');

test('detects 数据采集中心 URL', () => {
    assert.equal(window.isDxmDataAcquisitionPage('https://www.dianxiaomi.com/web/productCrawl/dataAcquisition'), true);
    assert.equal(window.isDxmDataAcquisitionPage('https://www.dianxiaomi.com/web/smt/smtProductList/draft'), false);
});

test('claim source file exposes runDxmClaimToStore', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/workflows/dxm-claim.js'), 'utf8');
    assert.match(src, /认领到采集箱/);
    assert.match(src, /rpa_locked_store_name/);
    assert.match(src, /limit: 5/);
    assert.equal(typeof window.runDxmClaimToStore, 'function');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

test('manifest grants only the hosts required by content scripts, AI clients and HTTPS product images', () => {
    assert.deepEqual(manifest.host_permissions, [
        '*://*.dianxiaomi.com/*',
        'https://dashscope.aliyuncs.com/*',
        'https://generativelanguage.googleapis.com/*',
        'https://*/*'
    ]);
    assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
    assert.equal(manifest.permissions.includes('scripting'), false);
});

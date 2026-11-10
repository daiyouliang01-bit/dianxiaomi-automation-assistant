'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/background/image-fetch-policy.js');

test('image fetch policy accepts public HTTPS images and rejects unsafe targets', () => {
    assert.equal(policy.isAllowedRemoteImageUrl('https://ae01.alicdn.com/kf/example.jpg'), true);
    for (const url of [
        'http://ae01.alicdn.com/example.jpg',
        'file:///etc/passwd',
        'https://localhost/image.jpg',
        'https://127.0.0.1/image.jpg',
        'https://10.0.0.8/image.jpg',
        'https://192.168.1.2/image.jpg',
        'https://169.254.169.254/latest/meta-data',
        'https://[::1]/image.jpg',
        'https://[fc00::1]/image.jpg',
        'https://[fe80::1]/image.jpg',
        'https://metadata.google.internal/computeMetadata/v1/'
    ]) assert.equal(policy.isAllowedRemoteImageUrl(url), false, url);
});

test('image fetch policy limits batch size, MIME type and payload size', () => {
    assert.equal(policy.limitImageUrls(Array.from({ length: 100 }, (_, i) => `https://cdn.example/${i}.jpg`)).length, 30);
    assert.throws(() => policy.validateImageResponse({ ok: true, headers: { get: () => 'text/html' } }), /不是图片/);
    assert.throws(() => policy.validateImageResponse({ ok: true, headers: { get: (name) => name === 'content-type' ? 'image/png' : String(9 * 1024 * 1024) } }), /过大/);
    assert.doesNotThrow(() => policy.validateImageResponse({ ok: true, headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : '1024' } }));
    assert.doesNotThrow(() => policy.validateImageResponse({ ok: true, headers: { get: () => '' } }));
});

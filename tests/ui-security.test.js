'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.window = global;
require('../src/content/ui-injector.js');

test('security report escapes untrusted forbidden-word and location text', () => {
    assert.equal(
        window.escapeReportHtml(`<img src=x onerror="alert('x')"> & 说明`),
        '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; 说明'
    );
});

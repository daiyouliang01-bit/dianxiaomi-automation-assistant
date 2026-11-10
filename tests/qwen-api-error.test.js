'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChromeMock } = require('./_setup.js');

global.window = global;
global.chrome = createChromeMock();

require('../src/background/background.js');

test('qwen access denied errors are converted to an actionable Chinese message', () => {
    const qwen = global.QwenApiForTest;
    assert.ok(qwen, 'QwenApiForTest must expose qwen API helpers');

    const message = qwen.buildQwenApiErrorMessage(
        403,
        JSON.stringify({
            error: {
                message: 'Workspace endpoint access denied.',
                id: '25517763-bdda-9c23-8db3-2c8abc123ac7',
                type: 'access_denied',
                code: 'access_denied'
            }
        })
    );

    assert.match(message, /千问接口访问被拒绝/);
    assert.match(message, /普通 DashScope\/百炼 API Key/);
    assert.match(message, /模型 qwen-plus/);
    assert.match(message, /额度和欠费状态/);
    assert.match(message, /25517763-bdda-9c23-8db3-2c8abc123ac7/);
    assert.doesNotMatch(message, /^API Error: 403 - \{/);
});

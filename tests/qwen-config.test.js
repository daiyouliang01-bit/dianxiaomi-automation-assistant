'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'background.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'background', 'ai-client.js'), 'utf8');

test('qwen calls use the ordinary DashScope compatible endpoint and qwen-plus model', () => {
    assert.match(
        backgroundSource,
        /const QWEN_BASE_URL = 'https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1';/
    );
    assert.match(backgroundSource, /const QWEN_CHAT_COMPLETIONS_URL = `\$\{QWEN_BASE_URL\}\/chat\/completions`;/);
    assert.match(backgroundSource, /const QWEN_MODEL = 'qwen-plus';/);
    assert.doesNotMatch(backgroundSource, /ws-4a9lr86cmtp31z2y\.cn-beijing\.maas\.aliyuncs\.com/);
    assert.doesNotMatch(backgroundSource, /qwen3\.7-max/);
    assert.match(clientSource, /https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1\/chat\/completions/);
    const qwenCallCount = (backgroundSource.match(/AiClientApi\.requestQwenChat\(/g) || []).length;
    const configuredModelCount = (backgroundSource.match(/model: QWEN_MODEL/g) || []).length;
    assert.ok(qwenCallCount >= 4, '应包含单标题、批量标题、标题修复和编码优化请求');
    assert.equal(configuredModelCount, qwenCallCount, '每个千问请求都必须显式使用 QWEN_MODEL');
    assert.doesNotMatch(backgroundSource, /fetch\(QWEN_CHAT_COMPLETIONS_URL/);
});

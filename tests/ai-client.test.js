'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const clientPath = '../src/background/ai-client.js';

function loadClient() {
    delete require.cache[require.resolve(clientPath)];
    return require(clientPath);
}

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body; },
        async text() { return JSON.stringify(body); }
    };
}

test('Qwen client sends bearer authentication and returns parsed JSON', async () => {
    const client = loadClient();
    let request = null;
    const result = await client.requestQwenChat({
        apiKey: 'qwen-secret',
        model: 'qwen-plus',
        messages: [{ role: 'user', content: 'hello' }],
        temperature: 0.1,
        fetchImpl: async (url, options) => {
            request = { url, options };
            return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
        }
    });

    assert.equal(request.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer qwen-secret');
    assert.equal(JSON.parse(request.options.body).model, 'qwen-plus');
    assert.equal(result.choices[0].message.content, 'ok');
});

test('AI client retries transient responses but not access-denied responses', async () => {
    const client = loadClient();
    let attempts = 0;
    const waits = [];
    const result = await client.requestQwenChat({
        apiKey: 'key',
        model: 'qwen-plus',
        messages: [],
        maxRetries: 2,
        waitImpl: async (milliseconds) => waits.push(milliseconds),
        fetchImpl: async () => {
            attempts++;
            return attempts < 3 ? jsonResponse({ error: { message: 'busy' } }, 503) : jsonResponse({ choices: [] });
        }
    });
    assert.deepEqual(result, { choices: [] });
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [1000, 2000]);

    let deniedAttempts = 0;
    await assert.rejects(
        client.requestQwenChat({
            apiKey: 'key',
            model: 'qwen-plus',
            messages: [],
            maxRetries: 3,
            fetchImpl: async () => {
                deniedAttempts++;
                return jsonResponse({ error: { message: 'denied' } }, 403);
            }
        }),
        (error) => error.status === 403 && /denied/.test(error.body)
    );
    assert.equal(deniedAttempts, 1);
});

test('Gemini client keeps the API key out of the URL', async () => {
    const client = loadClient();
    let request = null;
    await client.requestGeminiContent({
        apiKey: 'gemini-secret',
        model: 'models/gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        fetchImpl: async (url, options) => {
            request = { url, options };
            return jsonResponse({ candidates: [] });
        }
    });

    assert.doesNotMatch(request.url, /gemini-secret/);
    assert.equal(request.options.headers['x-goog-api-key'], 'gemini-secret');
    assert.match(request.url, /models\/gemini-2\.5-flash:generateContent$/);
});

test('Gemini model listing keeps the API key out of the URL', async () => {
    const client = loadClient();
    let request = null;
    const result = await client.listGeminiModels({
        apiKey: 'gemini-secret',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return jsonResponse({ models: [{ name: 'models/gemini-2.5-flash' }] });
        }
    });

    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models');
    assert.equal(request.options.headers['x-goog-api-key'], 'gemini-secret');
    assert.deepEqual(result.models, [{ name: 'models/gemini-2.5-flash' }]);
});

test('AI client rejects missing credentials before making a request', async () => {
    const client = loadClient();
    let called = false;
    await assert.rejects(
        client.requestQwenChat({ apiKey: '', fetchImpl: async () => { called = true; } }),
        /API Key/
    );
    assert.equal(called, false);
});

test('AI client retries network failures and reports invalid JSON without retrying', async () => {
    const client = loadClient();
    let networkAttempts = 0;
    const result = await client.requestQwenChat({
        apiKey: 'key',
        maxRetries: 1,
        waitImpl: async () => {},
        fetchImpl: async () => {
            networkAttempts++;
            if (networkAttempts === 1) throw new Error('socket closed');
            return jsonResponse({ choices: [] });
        }
    });
    assert.deepEqual(result, { choices: [] });
    assert.equal(networkAttempts, 2);

    let jsonAttempts = 0;
    await assert.rejects(client.requestQwenChat({
        apiKey: 'key',
        maxRetries: 3,
        fetchImpl: async () => ({
            ok: true,
            status: 200,
            async json() { jsonAttempts++; throw new SyntaxError('invalid JSON'); },
            async text() { return 'not-json'; }
        })
    }), /invalid JSON/);
    assert.equal(jsonAttempts, 1);
});

test('AI client rejects responses missing the provider protocol structure', async () => {
    const client = loadClient();
    await assert.rejects(client.requestQwenChat({
        apiKey: 'key',
        fetchImpl: async () => jsonResponse({ request_id: 'x' })
    }), /choices/);
    await assert.rejects(client.requestGeminiContent({
        apiKey: 'key',
        model: 'gemini-2.5-flash',
        fetchImpl: async () => jsonResponse({ promptFeedback: {} })
    }), /candidates/);
});

test('AI client aborts a hung request at the configured timeout', async () => {
    const client = loadClient();
    await assert.rejects(client.requestQwenChat({
        apiKey: 'key',
        timeoutMs: 5,
        maxRetries: 0,
        fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason));
        })
    }), /超时/);
});

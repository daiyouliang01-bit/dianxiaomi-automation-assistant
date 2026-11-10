'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sync = require('../src/shared/forbidden-sync.js');

function hangingFetch(_url, options = {}) {
    return new Promise((resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
        }, { once: true });
    });
}

function validResponse(words) {
    return {
        ok: true,
        async text() {
            return JSON.stringify({ data: { page: { list: words.map(bannedWord => ({ bannedWord })) } } });
        }
    };
}

test('first hanging endpoint times out and the next endpoint succeeds', async () => {
    const calls = [];
    const fetchImpl = (url, options) => {
        calls.push({ url, method: options?.method || 'GET' });
        if (url.startsWith('/first')) return hangingFetch(url, options);
        return Promise.resolve(validResponse(['alpha']));
    };

    const result = await sync.fetchForbiddenWords(['/first', '/second'], {
        fetchImpl,
        requestTimeoutMs: 15,
        totalTimeoutMs: 100
    });

    assert.deepEqual(result.data.page.list, [{ bannedWord: 'alpha' }]);
    assert.equal(calls.at(-1).url.startsWith('/second'), true);
});

test('all hanging endpoints terminate with a typed timeout error', async () => {
    const started = Date.now();
    await assert.rejects(
        sync.fetchForbiddenWords(['/first', '/second'], {
            fetchImpl: hangingFetch,
            requestTimeoutMs: 10,
            totalTimeoutMs: 35
        }),
        error => error && error.code === 'SYNC_TIMEOUT'
    );
    assert.ok(Date.now() - started < 250, 'sync must have a finite duration');
});

test('popup watchdog restores the button when content never responds', async () => {
    const button = { disabled: true, innerText: '⏳ 正在请求页面...' };
    const status = { innerHTML: '', innerText: '' };

    await sync.runPopupSync({
        sendMessage() {},
        button,
        status,
        watchdogMs: 15
    });

    assert.equal(button.disabled, false);
    assert.equal(button.innerText, '🔄 同步店小秘词库');
    assert.match(status.innerHTML, /页面响应超时/);
});

test('sync button can display request status using the real popup structure', () => {
    const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
    const popupScript = fs.readFileSync(path.join(__dirname, '..', 'src/popup/popup.js'), 'utf8');
    const elements = new Map();
    for (const match of popupHtml.matchAll(/\bid="([^"]+)"/g)) {
        elements.set(match[1], {
            disabled: false,
            innerHTML: '',
            innerText: '',
            listeners: {},
            addEventListener(type, listener) {
                this.listeners[type] = listener;
            }
        });
    }

    const context = {
        document: { getElementById: id => elements.get(id) || null },
        chrome: {
            storage: {
                local: {
                    get(_keys, callback) { callback({ forbiddenWords: [] }); }
                }
            },
            tabs: {
                query(_query, callback) {
                    callback([{ id: 1, url: 'https://www.dianxiaomi.com/web/index' }]);
                },
                sendMessage() {}
            },
            runtime: { lastError: null }
        },
        window: {
            DxmForbiddenSync: {
                runPopupSync() {}
            }
        },
        console
    };

    vm.runInNewContext(popupScript, context);
    assert.doesNotThrow(() => elements.get('syncBtn').listeners.click());
    assert.equal(elements.get('status').innerText, '正在通过页面抓取数据...');
});

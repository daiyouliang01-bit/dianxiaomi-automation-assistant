'use strict';

function createStorage() {
    const store = new Map();
    return {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
        clear() { store.clear(); }
    };
}

function createEventMock() {
    const listeners = [];
    return {
        listeners,
        addListener(listener) { listeners.push(listener); },
        removeListener(listener) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
        }
    };
}

function createChromeMock(overrides = {}) {
    const values = new Map();
    const storageLocal = {
        get(keys, callback) {
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            const result = {};
            requestedKeys.filter(Boolean).forEach((key) => {
                if (values.has(key)) result[key] = values.get(key);
            });
            if (callback) callback(result);
        },
        set(entries, callback) {
            Object.entries(entries || {}).forEach(([key, value]) => values.set(key, value));
            if (callback) callback();
        },
        remove(keys, callback) {
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => values.delete(key));
            if (callback) callback();
        }
    };
    const chromeMock = {
        runtime: {
            lastError: null,
            onMessage: createEventMock(),
            onStartup: createEventMock(),
            onInstalled: createEventMock(),
            sendMessage() {}
        },
        tabs: {
            onRemoved: createEventMock(),
            onUpdated: createEventMock(),
            query(_queryInfo, callback) { if (callback) callback([]); },
            async create(options, callback) {
                const tab = { id: 1, url: options && options.url };
                if (callback) callback(tab);
                return tab;
            },
            async remove(_tabId, callback) { if (callback) callback(); }
        },
        windows: {
            async create(options, callback) {
                const tabId = Math.floor(Math.random() * 9000) + 1000;
                const tab = { id: tabId, url: options && options.url };
                const win = { id: 1, tabs: [tab] };
                if (callback) callback(win);
                return win;
            }
        },
        storage: {
            local: storageLocal,
            onChanged: createEventMock()
        }
    };

    Object.entries(overrides).forEach(([namespace, replacement]) => {
        chromeMock[namespace] = {
            ...(chromeMock[namespace] || {}),
            ...(replacement || {})
        };
    });
    return chromeMock;
}

global.window = global;

if (typeof global.localStorage === 'undefined') {
    global.localStorage = createStorage();
}
if (typeof global.sessionStorage === 'undefined') {
    global.sessionStorage = createStorage();
}
if (typeof global.document === 'undefined') {
    global.document = {};
}
if (typeof global.alert === 'undefined') {
    global.alert = () => {};
}
if (typeof global.location === 'undefined') {
    global.location = { href: 'https://example.com', origin: 'https://example.com' };
}

module.exports = { createStorage, createEventMock, createChromeMock };

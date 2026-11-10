'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function createSessionStorage() {
    const values = new Map();
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
}

function loadFreshRpaModule() {
    delete require.cache[require.resolve('../src/page-adapters/rpa-page-targeting.js')];
    require('../src/page-adapters/rpa-page-targeting.js');
    delete require.cache[require.resolve('../src/workflows/rpa.js')];
    require('../src/workflows/rpa.js');
}

function makeEditLink(href, { onclick = '', rowid = '' } = {}) {
    const row = rowid
        ? {
            getAttribute(name) {
                return name === 'rowid' ? rowid : null;
            },
            querySelector() {
                return null;
            },
            querySelectorAll() {
                return [];
            },
            innerHTML: ''
        }
        : null;

    return {
        innerText: '编辑',
        textContent: '编辑',
        getAttribute(name) {
            if (name === 'href') return href;
            if (name === 'onclick') return onclick;
            return '';
        },
        closest(selector) {
            if (row && selector === 'tr[rowid]') return row;
            if (row && /tr|row|item/.test(selector)) return row;
            return null;
        }
    };
}

function makeElement(tagName = 'button') {
    const element = {
        tagName: tagName.toUpperCase(),
        style: {},
        children: [],
        parentNode: null,
        innerText: '',
        textContent: '',
        innerHTML: '',
        offsetHeight: 32,
        disabled: false,
        type: '',
        className: '',
        onclick: null,
        appendChild(child) {
            child.parentNode = element;
            element.children.push(child);
        },
        closest() {
            return element;
        }
    };
    return element;
}

async function withLauncherGlobals(run) {
    const originalGlobals = {
        window: global.window,
        location: global.location,
        document: global.document,
        chrome: global.chrome,
        sessionStorage: global.sessionStorage,
        alert: global.alert
    };

    try {
        global.window = global;
        global.location = {
            origin: 'https://www.dianxiaomi.com',
            href: 'https://www.dianxiaomi.com/web/smt/smtProductList/offline'
        };
        global.sessionStorage = createSessionStorage();
        global.alert = () => {};
        global.UI_TEXT_CONFIG = {
            editLink: '编辑',
            startEditButton: '开始编辑',
            quickAction: '快捷操作',
            batchAction: '批量操作',
            pendingPublishMarker: '待发布'
        };
        return await run();
    } finally {
        Object.assign(global, originalGlobals);
    }
}

test('pending publish launcher resolves only five clean edit URLs without RPA flags', async () => {
    await withLauncherGlobals(() => {
        const links = [
            makeEditLink('/web/smt/edit?id=100000000000001&rpa_auto=1&opt_mode=plug'),
            makeEditLink('https://www.dianxiaomi.com/web/smt/edit?id=100000000000002&rpa_runner=1'),
            makeEditLink('', { rowid: '100000000000003' }),
            makeEditLink('javascript:void(0)', { onclick: "open('/web/smt/edit?id=100000000000004&rpa_auto=1')" }),
            makeEditLink('/web/smt/edit?id=100000000000005'),
            makeEditLink('/web/smt/edit?id=100000000000006')
        ];

        global.document = {
            querySelectorAll(selector) {
                return selector === 'a' ? links : [];
            }
        };

        loadFreshRpaModule();

        assert.equal(typeof window.getPendingPublishEditUrls, 'function');
        const urls = window.getPendingPublishEditUrls(5);

        assert.equal(urls.length, 5);
        assert.deepEqual(
            urls.map((url) => new URL(url).searchParams.get('id')),
            [
                '100000000000001',
                '100000000000002',
                '100000000000003',
                '100000000000004',
                '100000000000005'
            ]
        );
        assert.ok(urls.every((url) => !url.includes('rpa_auto=') && !url.includes('opt_mode=') && !url.includes('rpa_runner=')));
    });
});

test('pending publish launcher button inserts after quick action and opens five tabs only', async () => {
    await withLauncherGlobals(async () => {
        const toolbar = {
            children: [],
            insertBefore(child, reference) {
                child.parentNode = toolbar;
                const index = toolbar.children.indexOf(reference);
                if (index === -1) toolbar.children.push(child);
                else toolbar.children.splice(index, 0, child);
            },
            appendChild(child) {
                child.parentNode = toolbar;
                toolbar.children.push(child);
            }
        };
        const batchButton = makeElement('button');
        batchButton.innerText = '批量操作';
        batchButton.textContent = '批量操作';
        batchButton.parentNode = toolbar;
        const quickButton = makeElement('button');
        quickButton.innerText = '快捷操作';
        quickButton.textContent = '快捷操作';
        quickButton.parentNode = toolbar;
        toolbar.children.push(batchButton, quickButton);

        const links = Array.from({ length: 6 }, (_, index) => makeEditLink(`/web/smt/edit?id=10000000000000${index + 1}&rpa_auto=1`));
        const elementsById = new Map();
        const messages = [];

        global.document = {
            body: { innerText: '速卖通 > 待发布 批量操作 快捷操作' },
            createElement(tagName) {
                const element = makeElement(tagName);
                Object.defineProperty(element, 'id', {
                    get() {
                        return element._id || '';
                    },
                    set(value) {
                        element._id = value;
                        elementsById.set(value, element);
                    }
                });
                return element;
            },
            getElementById(id) {
                return elementsById.get(id) || null;
            },
            querySelectorAll(selector) {
                if (selector === 'a') return links;
                if (selector.includes('button')) return [batchButton, quickButton];
                return [];
            }
        };
        global.chrome = {
            runtime: {
                sendMessage(message, callback) {
                    messages.push(message);
                    if (callback) callback({ success: true });
                }
            }
        };

        loadFreshRpaModule();

        assert.equal(typeof window.initPendingEditLauncherButton, 'function');
        window.initPendingEditLauncherButton();

        const button = elementsById.get('pending-edit-launcher-btn');
        assert.ok(button, 'button should be inserted on pending publish page');
        assert.equal(button.textContent || button.innerText || button.innerHTML, '开始编辑');
        assert.equal(toolbar.children.indexOf(button), toolbar.children.indexOf(quickButton) + 1);

        await button.onclick({ preventDefault() {} });

        assert.equal(sessionStorage.getItem('rpa_running'), null);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].action, 'open_edit_tabs');
        assert.equal(messages[0].urls.length, 5);
        assert.ok(messages[0].urls.every((url) => !url.includes('rpa_auto=')));
    });
});

test('pending publish launcher is not inserted on the collection-box draft page', async () => {
    await withLauncherGlobals(() => {
        location.href = 'https://www.dianxiaomi.com/web/smt/smtProductList/draft';

        const toolbar = {
            children: [],
            insertBefore(child, reference) {
                child.parentNode = toolbar;
                const index = toolbar.children.indexOf(reference);
                if (index === -1) toolbar.children.push(child);
                else toolbar.children.splice(index, 0, child);
            }
        };
        const quickButton = makeElement('button');
        quickButton.innerText = '快捷操作';
        quickButton.textContent = '快捷操作';
        quickButton.parentNode = toolbar;
        toolbar.children.push(quickButton);

        const elementsById = new Map();
        global.document = {
            body: { innerText: '数据采集 > 速卖通采集箱 待发布产品 发布失败 快捷操作' },
            createElement(tagName) {
                const element = makeElement(tagName);
                Object.defineProperty(element, 'id', {
                    get() {
                        return element._id || '';
                    },
                    set(value) {
                        element._id = value;
                        elementsById.set(value, element);
                    }
                });
                return element;
            },
            getElementById(id) {
                return elementsById.get(id) || null;
            },
            querySelectorAll(selector) {
                if (selector.includes('button')) return [quickButton];
                return [];
            }
        };

        loadFreshRpaModule();

        assert.equal(window.isPendingPublishListPage(), false);
        window.initPendingEditLauncherButton();

        assert.equal(elementsById.has('pending-edit-launcher-btn'), false);
        assert.equal(toolbar.children.length, 1);
    });
});

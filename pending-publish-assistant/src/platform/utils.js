// ============================================
// utils.js — 通用工具函数
// 所有函数挂载到 window 上，供其他模块直接调用
// ============================================

// --- 🔧 智能等待工具函数 (Polling Utilities) ---

/**
 * 智能轮询等待 DOM 元素出现（替代硬编码 setTimeout 死等）
 * @param {string|Function} selectorOrFn - CSS 选择器字符串，或返回目标元素/null 的自定义查找函数
 * @param {object} [options] - 配置
 * @param {number} [options.timeout=10000] - 最大等待毫秒数
 * @param {number} [options.interval=100] - 轮询间隔毫秒数
 * @param {Element} [options.parent=document] - CSS 选择器的搜索起点
 * @param {boolean} [options.visible=false] - 是否要求元素物理可见 (offsetHeight > 0)
 * @returns {Promise<Element|null>} 找到的元素，超时则返回 null
 */
window.waitForElement = function(selectorOrFn, options = {}) {
    const { timeout = 10000, interval = 100, parent = document, visible = false } = options;
    return new Promise((resolve) => {
        const finder = typeof selectorOrFn === 'function'
            ? selectorOrFn
            : () => parent.querySelector(selectorOrFn);
        const check = () => {
            const el = finder();
            return (el && (!visible || (el.offsetHeight > 0 && el.offsetWidth > 0))) ? el : null;
        };

        const immediate = check();
        if (immediate) return resolve(immediate);

        const startTime = Date.now();
        const timer = setInterval(() => {
            const el = check();
            if (el) {
                clearInterval(timer);
                resolve(el);
            } else if (Date.now() - startTime >= timeout) {
                clearInterval(timer);
                console.warn('[waitForElement] timeout (' + timeout + 'ms):', typeof selectorOrFn === 'string' ? selectorOrFn : 'custom finder');
                resolve(null);
            }
        }, interval);
    });
};

/**
 * 通过 XPath 表达式智能等待可见元素出现
 * @param {string} expression - XPath 表达式
 * @param {object} [options] - 同 waitForElement 的 options
 * @returns {Promise<Element|null>}
 */
window.waitForXPath = function(expression, options = {}) {
    return window.waitForElement(() => {
        const snap = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < snap.snapshotLength; i++) {
            const el = snap.snapshotItem(i);
            if (el.offsetHeight > 0) return el;
        }
        return null;
    }, options);
};

// --- 🖼️ 图片智能移除 ---

/**
 * 智能移除图片节点并消除它遗留的"空窗期白框"
 * @param {Element} img - 要移除的图片元素
 */
window.removeImageSmart = function(img) {
    let parent = img.parentElement;
    if (img) img.remove();

    // 向上追溯寻找被抽干的空壳块标签 (p, div，span 等) 顺手扬了，防止留下大段空白
    let depth = 0;
    while(parent && parent.tagName !== 'BODY' && depth < 3) {
        // 如果父节点里既没有真正的图片，也没有实际文字（全空格或只剩 <br>）
        if (!parent.querySelector('img, iframe, input') && parent.textContent.trim() === '') {
            let nextParent = parent.parentElement;
            parent.remove();
            parent = nextParent;
            depth++;
        } else {
            break;
        }
    }
};

// --- 🔍 文本匹配工具 ---

/**
 * 正则特殊字符转义
 * @param {string} string - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
window.escapeRegExp = function(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * 在文本中检测违禁词
 * @param {string} text - 待检测文本
 * @param {string} locationName - 位置名称（用于回调）
 * @param {Function} foundCallback - 发现违禁词时的回调
 */
window.checkText = function(text, locationName, foundCallback) {
    if (!text) return;
    window.forbiddenWords.forEach(word => {
        const regex = new RegExp(`\\b${window.escapeRegExp(word)}\\b`, 'gi');
        if (regex.test(text) && !window.whiteList.includes(word)) {
            foundCallback(word);
        }
    });
};
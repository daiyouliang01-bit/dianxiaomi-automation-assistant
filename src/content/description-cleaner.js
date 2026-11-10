// ============================================
// description-cleaner.js — 描述清理、违禁词、属性操作
// ============================================

window.getPCEditorContainer = function() {
    let scopeNode = document.getElementById('describeInfo');
    if (!scopeNode) {
         console.warn("[PCEditor] 未找到 describeInfo 锚点，降级为全屏扫描");
         scopeNode = document;
    }

    let fallbackEd = null;

    const iframes = scopeNode.querySelectorAll('iframe');
    for (let iframe of iframes) {
        try {
            const doc = iframe.contentWindow.document;
            if (doc && doc.body) {
                if (doc.querySelectorAll('img').length > 0) {
                    console.log("[PCEditor] 成功利用 describeInfo 锚定带有图片的富文本内核", doc.body);
                    return doc.body;
                }
                if (doc.body.contentEditable === "true" || doc.body.classList.contains('view') || doc.body.classList.contains('ke-content')) {
                    fallbackEd = doc.body;
                }
            }
        } catch(e) {}
    }

    if (fallbackEd) return fallbackEd;

    const editables = scopeNode.querySelectorAll('[contenteditable="true"]');
    for (let el of editables) {
        if (el.clientHeight > 50) return el;
    }

    return null;
};
window.getDescriptionEditorContainers = function() {
    const containers = [];
    const seen = new Set();
    const scopeNode = document.getElementById('describeInfo') || document;
    const addContainer = (container) => {
        if (!container || seen.has(container)) return;
        seen.add(container);
        containers.push(container);
    };

    scopeNode.querySelectorAll('iframe').forEach((iframe) => {
        try {
            const doc = iframe.contentWindow && iframe.contentWindow.document;
            if (!doc || !doc.body) return;
            const descriptionFrameSelector = window.Selectors && window.Selectors.descriptionFrame;
            if (
                (descriptionFrameSelector && iframe.matches(descriptionFrameSelector)) ||
                doc.querySelectorAll('img').length > 0 ||
                doc.body.contentEditable === 'true' ||
                doc.body.classList.contains('view') ||
                doc.body.classList.contains('ke-content')
            ) {
                addContainer(doc.body);
            }
        } catch (e) {}
    });

    scopeNode.querySelectorAll('[contenteditable="true"]').forEach((el) => {
        if ((el.clientHeight || 0) > 50 || (el.innerText || el.textContent || '').trim()) addContainer(el);
    });

    addContainer(window.getPCEditorContainer());
    return containers;
};

window.DESCRIPTION_CLEANUP_LEVELS = { DEEP: 'deep', LIGHT: 'light' };
window.normalizeDescriptionCleanupLevel = function(level) {
    return level === window.DESCRIPTION_CLEANUP_LEVELS.LIGHT
        ? window.DESCRIPTION_CLEANUP_LEVELS.LIGHT
        : window.DESCRIPTION_CLEANUP_LEVELS.DEEP;
};
window.DESCRIPTION_PROMOTIONAL_KEYWORDS = [
    'company', 'company profile', 'about us', 'factory show', 'factory display',
    'certifications', 'exhibition', 'contact us', 'why choose us',
    'faq', 'f.a.q', 'frequently asked question', 'frequently asked questions'
];
window.nodeHasJumpIntent = function(node) {
    if (!node || typeof node.getAttribute !== 'function') return false;
    const attrs = ['href', 'onclick', 'data-href', 'data-url', 'data-link'];
    const attrText = attrs.map((attr) => node.getAttribute(attr) || '').join(' ').toLowerCase();
    return /(https?:\/\/|www\.|location|window\.open|href|open\s*\()/.test(attrText);
};
window.isLinkedDescriptionImage = function(img) {
    if (!img) return false;
    if (img.closest && img.closest('a')) return true;
    let current = img;
    while (current) {
        if (window.nodeHasJumpIntent(current)) return true;
        current = current.parentElement;
    }
    return false;
};
window.pruneEmptyDescriptionShells = function(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    Array.from(container.querySelectorAll('*')).reverse().forEach((el) => {
        if (el === container || el.tagName === 'BR') return;
        if (['IMG', 'IFRAME', 'INPUT'].includes(el.tagName)) return;
        if (el.querySelectorAll && el.querySelectorAll('img, iframe, input').length > 0) return;
        if ((el.textContent || '').trim() === '' && typeof el.remove === 'function') el.remove();
    });
};
window.removeLinkedDescriptionImages = function(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return 0;
    let removed = 0;
    Array.from(container.querySelectorAll('img')).forEach((img) => {
        if (window.isLinkedDescriptionImage(img) && typeof img.remove === 'function') {
            img.remove();
            removed++;
        }
    });
    window.pruneEmptyDescriptionShells(container);
    return removed;
};
window.removePromotionalDescriptionTail = function(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return false;
    const elements = Array.from(container.querySelectorAll('*'));
    for (const el of elements) {
        if (el.children && el.children.length > 0) continue;
        const text = String(el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (text && window.DESCRIPTION_PROMOTIONAL_KEYWORDS.some((keyword) => text.includes(keyword))) {
            return window.cutElementAndFollowingContent(el, container);
        }
    }
    return false;
};
window.escapeDescriptionRegExp = function(value) {
    if (window.escapeRegExp) return window.escapeRegExp(value);
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
window.cleanDescriptionTextNodes = function(container, options = {}) {
    if (!container) return 0;
    const cleanForbiddenWords = options.cleanForbiddenWords !== false;
    const doc = container.ownerDocument || document;
    const nodeFilter = doc.defaultView?.NodeFilter?.SHOW_TEXT || 4;
    if (typeof doc.createTreeWalker !== 'function') return 0;
    const walker = doc.createTreeWalker(container, nodeFilter);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let changed = 0;
    textNodes.forEach((node) => {
        const original = node.nodeValue || '';
        let cleaned = original;
        if (cleanForbiddenWords && window.ForbiddenWordsCleaner) {
            cleaned = window.ForbiddenWordsCleaner.cleanTextNode(original, window.forbiddenWords, window.whiteList);
        }
        if (cleaned !== original) {
            node.nodeValue = cleaned;
            changed++;
        }
    });
    return changed;
};
window.runLightDescriptionCleanup = function(options = {}) {
    const mode = window.normalizeOptimizationMode(options.mode || window.optimizationMode);
    const containers = options.containers || window.getDescriptionEditorContainers();
    if (!containers || containers.length === 0) return;
    containers.forEach((container) => {
        window.removeLinkedDescriptionImages(container);
        window.removePromotionalDescriptionTail(container);
        window.cleanDescriptionTextNodes(container, { mode });
        container.dispatchEvent(window.makeBubblingEvent ? window.makeBubblingEvent('input') : new Event('input', { bubbles: true }));
        container.dispatchEvent(window.makeBubblingEvent ? window.makeBubblingEvent('change') : new Event('change', { bubbles: true }));
        container.dispatchEvent(window.makeBubblingEvent ? window.makeBubblingEvent('blur') : new Event('blur', { bubbles: true }));
    });
};
window.runDescriptionCleanup = function(options = {}) {
    const level = window.normalizeDescriptionCleanupLevel(options.level);
    const mode = window.normalizeOptimizationMode(options.mode || window.optimizationMode);
    const surface = options.surface || 'single';
    if (level === window.DESCRIPTION_CLEANUP_LEVELS.LIGHT) {
        window.runLightDescriptionCleanup({ mode, containers: options.containers });
        return;
    }
    if (surface === 'single') {
        window.silentPurifyDesc();
        return;
    }
    window.violentPurifyDesc();
};
window.startPurifyDesc = async function() {
    const container = window.getPCEditorContainer();
    if (!container) {
        alert("😭 未能锁定 PC 端编辑框。此页面的底层接口可能已被店小秘加密保护。");
        return;
    }

    if(!confirm(`此操作将严格对【PC端描述】进行物理切割：\n1. 销毁一切超链接\n2. 删除所有图片\n3. 清除品牌/厂家信息\n4. 切除 Company Profile 废话\n\n确定执行？`)) return;

    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.style.width = "350px";
    document.body.appendChild(toast);

    const updateToast = (msg) => { toast.innerText = msg; };
    const btn = document.getElementById('purify-desc-btn');
    if(btn) { btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5'; }

    try {
        updateToast(`正在清剿 PC 端富文本编辑器...`);

        const links = container.querySelectorAll('a');
        let linkCount = 0;
        links.forEach(a => { a.remove(); linkCount++; });

        const allImgs = container.querySelectorAll('img');
        let imgCount = allImgs.length;
        allImgs.forEach(img => { window.removeImageSmart(img); });

        const brandRegex = /brand|品牌|manufacturer|factory\s*name/i;
        const allElements = container.querySelectorAll('*');
        let brandCount = 0;
        for (const el of allElements) {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.trim();
                if (brandRegex.test(text)) {
                    const blockParent = el.closest('p, div, tr, li, span, strong, b, font') || el;
                    if (container.contains(blockParent) && blockParent !== container) {
                        blockParent.remove();
                    } else {
                        el.remove();
                    }
                    brandCount++;
                }
            }
        }

        const cutEverythingBelowAndRemove = (node, maxContainer) => {
            if (!node || !maxContainer.contains(node)) return;
            let current = node;
            while(current && current !== maxContainer) {
                let next = current.nextElementSibling || current.nextSibling;
                while (next) {
                    let t = next;
                    next = next.nextElementSibling || next.nextSibling;
                    if (t.remove) t.remove();
                }
                current = current.parentElement;
            }
            if (node.remove) node.remove();
        };

        const freshElements = container.querySelectorAll('*');
        let foundNode = null;
        const cutKeywords = [
            'company', 'about us', 'factory show', 'factory display', 'certifications', 'exhibition',
            'contact us', 'why choose us', 'faq', 'f.a.q', 'frequently asked question'
        ];
        for (const el of freshElements) {
            if (el.children.length === 0 && el.textContent) {
                const text = el.textContent.toLowerCase().trim();
                if (cutKeywords.some(keyword => text.includes(keyword))) {
                    foundNode = el; break;
                }
            }
        }
        if (foundNode) {
            cutEverythingBelowAndRemove(foundNode, container);
        }

        container.dispatchEvent(new Event('input', {bubbles: true}));
        container.dispatchEvent(new Event('blur', {bubbles: true}));

        updateToast(`🎉 极速净化完毕！砍掉 ${linkCount} 处链接、${imgCount} 张图片、${brandCount} 处品牌信息！`);
        setTimeout(() => toast.remove(), 3000);

    } catch (err) {
        alert("🚨 [执行异常被捕获]：\n" + err.message);
        console.error(err);
        updateToast("❌ 遇未知错误，净化中断。");
        setTimeout(() => toast.remove(), 3000);
    }

    if(btn) { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; }
};
window.setReactiveInputValue = function(input, value) {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) nativeSetter.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
};
window.cutElementAndFollowingContent = function(node, maxContainer) {
    if (!node || !maxContainer || !maxContainer.contains(node)) return false;
    let current = node;
    while (current && current !== maxContainer) {
        let next = current.nextElementSibling || current.nextSibling;
        while (next) {
            const target = next;
            next = next.nextElementSibling || next.nextSibling;
            if (target.remove) target.remove();
        }
        current = current.parentElement;
    }
    if (node.remove) node.remove();
    return true;
};
window.getAttributeRow = function(input) {
    return input.closest('tr, .ant-row, .el-form-item, li, [class*="attr-item"], [class*="custom-attr"]') || input.parentElement?.parentElement || null;
};
window.findAttributeDeleteButton = function(row) {
    let btn = row.querySelector('[class*="close"], [class*="delete"], [class*="remove"], .anticon-close, .el-icon-close, .el-icon-error');
    if (btn) return btn;

    for (const el of row.querySelectorAll('span, i, button, a, em, svg')) {
        const label = (el.innerText || el.textContent || '').trim();
        if (label === '×' || label === '✕' || label === '✖' || label === 'X' || label === 'x') return el;
    }

    const smalls = Array.from(row.querySelectorAll('span, i, button, a, em')).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.width < 40 && rect.height > 0 && rect.height < 40;
    });
    return smalls[smalls.length - 1] || null;
};
window.silentRemoveForbiddenWords = function(options = {}) {
    // 开关层级：显式传参 > RPA session 标志 > 默认 true
    const cleanForbiddenWords = typeof options.cleanForbiddenWords === 'boolean'
        ? options.cleanForbiddenWords
        : (window.isRpaForbiddenWordCleanupEnabled
            ? window.isRpaForbiddenWordCleanupEnabled()
            : true);
    if (!cleanForbiddenWords) return;
    if (window.forbiddenWords.length === 0) return;

    const titleInput = document.querySelector(window.Selectors.title);
    if (titleInput && window.ForbiddenWordsCleaner) {
        const val = titleInput.value;
        const cleaned = window.ForbiddenWordsCleaner.cleanText(val, window.forbiddenWords, window.whiteList);
        if (cleaned !== val) {
            titleInput.value = cleaned;
            titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }

    // 描述 iframe：改用 TreeWalker 逐文本节点替换，避免 innerHTML 赋值破坏编辑器 DOM
    const iframe = document.querySelector(window.Selectors.descriptionFrame);
    if (iframe && iframe.contentDocument) {
        const body = iframe.contentDocument.body;
        if (typeof window.cleanDescriptionTextNodes === 'function') {
            const changed = window.cleanDescriptionTextNodes(body, { cleanForbiddenWords: true });
            if (changed > 0) {
                body.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    const attrInputs = document.querySelectorAll(window.Selectors.attributes);
    attrInputs.forEach((input) => {
        if (!window.ForbiddenWordsCleaner) return;
        const val = input.value;
        const cleaned = window.ForbiddenWordsCleaner.cleanText(val, window.forbiddenWords, window.whiteList);
        if (cleaned !== val) {
            input.value = cleaned;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    });
};
window.cleanupEmptyAttributes = async function() {
    const attrInputs = Array.from(document.querySelectorAll(window.Selectors.attributes));
    if (attrInputs.length === 0) return;

    const findDeleteBtn = (row) => {
        let btn = row.querySelector('[class*="close"], [class*="delete"], [class*="remove"], .anticon-close, .el-icon-close, .el-icon-error');
        if (!btn) {
            for (const el of row.querySelectorAll('span, i, button, a, em, svg')) {
                const t = (el.innerText || el.textContent || '').trim();
                if (t === '×' || t === '✕' || t === '✖' || t === 'X' || t === 'x') { btn = el; break; }
            }
        }
        if (!btn) {
            const smalls = Array.from(row.querySelectorAll('span, i, button, a, em')).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.width < 40 && r.height > 0 && r.height < 40;
            });
            if (smalls.length > 0) btn = smalls[smalls.length - 1];
        }
        return btn;
    };

    const getRowName = (input) => {
        const row = input.closest('tr, .ant-row, .el-form-item, li, [class*="attr-item"], [class*="custom-attr"]') || input.parentElement?.parentElement;
        if (!row) return '';
        const allInputs = row.querySelectorAll('input');
        if (allInputs.length >= 2 && allInputs[0] !== input) {
            return (allInputs[0].value || '').trim().toLowerCase();
        }
        const label = row.querySelector('.ant-form-item-label label, label');
        if (label) return (label.innerText || '').replace(':', '').trim().toLowerCase();
        return '';
    };

    const rowsToDelete = new Set();
    const emptyInputs = attrInputs.filter(input => input.value.trim() === '');
    emptyInputs.forEach(input => rowsToDelete.add(input));

    const seenNames = new Map();
    attrInputs.forEach(input => {
        if (rowsToDelete.has(input)) return;
        const name = getRowName(input);
        if (!name) return;
        if (seenNames.has(name)) {
            rowsToDelete.add(input);
        } else {
            seenNames.set(name, input);
        }
    });

    if (rowsToDelete.size === 0) return;

    console.log(`[属性清理] 发现 ${rowsToDelete.size} 个问题属性行（空值/重复），准备自动删除...`);

    const deleteList = Array.from(rowsToDelete).reverse();
    for (const input of deleteList) {
        const row = input.closest('tr, .ant-row, .el-form-item, li, [class*="attr-item"], [class*="custom-attr"]') || input.parentElement?.parentElement;
        if (!row) continue;

        const deleteBtn = findDeleteBtn(row);
        if (deleteBtn) {
            deleteBtn.click();
            await new Promise(r => setTimeout(r, 300));
            console.log(`[属性清理] 已删除一个问题属性行`);
        }
    }
};
window.getInvalidAttributeRows = function() {
    const rows = Array.from(document.querySelectorAll(window.Selectors.attributes))
        .map((input) => window.getAttributeRow(input))
        .filter(Boolean)
        .filter((row, index, allRows) => allRows.indexOf(row) === index);

    return rows.map((row) => {
        const inputs = Array.from(row.querySelectorAll('input')).filter((input) => input.matches(window.Selectors.attributes));
        if (inputs.length < 2) return null;

        const validationNodes = Array.from(row.querySelectorAll(
            '.el-form-item__error, .ant-form-item-explain-error, .ant-form-item-has-error, .help-block, .error, [role="alert"], [role="status"]'
        )).filter((node) => node.offsetWidth > 0 && node.offsetHeight > 0);
        const validationText = validationNodes.map((node) => node.innerText || node.textContent || '').join(' ');
        const invalidState = inputs.some((input) => {
            return input.getAttribute('aria-invalid') === 'true' || input.matches(':invalid') || Boolean(input.closest('.is-error, .has-error, .ant-form-item-has-error'));
        });

        if (!window.RpaSafety.shouldDeleteAttributeRow({
            name: inputs[0].value,
            value: inputs[1].value,
            validationText,
            invalidState
        })) return null;
        return { row, validationText };
    }).filter(Boolean);
};
window.cleanupInvalidAttributes = async function() {
    const rows = window.getInvalidAttributeRows();
    let removed = 0;
    let unresolved = 0;

    for (const item of rows.reverse()) {
        const deleteBtn = window.findAttributeDeleteButton(item.row);
        if (!deleteBtn) {
            unresolved++;
            console.warn('[属性清理] 检测到无效属性，但未找到该行删除按钮：', item.validationText || item.row.innerText || '');
            continue;
        }
        deleteBtn.click();
        removed++;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (removed || unresolved) console.log(`[属性清理] 无效属性：已删除 ${removed} 条，无法删除 ${unresolved} 条。`);
    return { removed, unresolved };
};

// ---- 清洗级别 → 自定义属性整行删除（合并自 V2 业务规则）----
// 完全清洗：删除「属性信息 → 自定义属性」区 .smtCustomAttrs 的全部行；
// 保守清洗：仅删除属性名含 Size/Weight、Material、Origin、Brand Name、
// High-concerned chemical（含中文 尺寸/重量/材质/产地/品牌/高关注化学品）的行。
// 注意：不动「产品属性」系统标准属性区，避免误删必填项。

window.ATTRIBUTE_CLEANUP_LEVELS = { COMPLETE: 'complete', CONSERVATIVE: 'conservative' };
window.normalizeAttributeCleanupLevel = function(level) {
    return level === window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE
        ? window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE
        : window.ATTRIBUTE_CLEANUP_LEVELS.CONSERVATIVE;
};
window.CUSTOM_ATTRIBUTE_NAME_PATTERNS = [
    /\b(size|sizes|weight|weights|material|materials|origin)\b/i,
    /\bbrand\s*name\b/i,
    /\bhigh[\s\-]*concerned\s*chemical\b/i,
    /尺寸|重量|材质|产地|品牌|高关注化学品/
];
window.shouldDeleteCustomAttributeRow = function(name, level) {
    if (level === window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE) return true;
    const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
    if (!cleanName) return false;
    return window.CUSTOM_ATTRIBUTE_NAME_PATTERNS.some((pattern) => pattern.test(cleanName));
};
// 实时重查 DOM：店小秘删除行后 class 编号（smtCustomAttrItemNN）会重排，
// 每次循环必须重新查询，不能复用旧节点。
window.getCustomAttributeRows = function() {
    const container = document.querySelector && document.querySelector('.smtCustomAttrs');
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    return Array.from(container.querySelectorAll('div.custom-attr-item'));
};
window.getCustomAttributeRowName = function(row) {
    if (!row || typeof row.querySelectorAll !== 'function') return '';
    const inputs = row.querySelectorAll('input');
    const nameInput = inputs && inputs[0];
    return nameInput ? String(nameInput.value || '').trim() : '';
};
window.cleanupCustomAttributesByLevel = async function(level, log = () => {}) {
    const normalized = window.normalizeAttributeCleanupLevel(level);
    const rows = window.getCustomAttributeRows();
    const total = rows.length;
    let removed = 0;

    // 逐轮重查：complete 模式从末尾向前删完所有行；conservative 模式每轮
    // 只删最后一个命中的行，避免 index 漂移。
    const maxLoops = Math.max(50, total * 2 + 10);
    for (let loop = 0; loop < maxLoops; loop++) {
        const currentRows = window.getCustomAttributeRows();
        if (currentRows.length === 0) break;

        let targetIndex = -1;
        if (normalized === window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE) {
            targetIndex = currentRows.length - 1;
        } else {
            for (let i = currentRows.length - 1; i >= 0; i--) {
                const name = window.getCustomAttributeRowName(currentRows[i]);
                if (window.shouldDeleteCustomAttributeRow(name, normalized)) {
                    targetIndex = i;
                    break;
                }
            }
        }
        if (targetIndex < 0) break;

        const row = currentRows[targetIndex];
        const name = window.getCustomAttributeRowName(row);
        let deleteBtn = row.querySelector('i.icon_close');
        if (!deleteBtn) deleteBtn = window.findAttributeDeleteButton(row);
        if (!deleteBtn) {
            log(`⚠️ 自定义属性行未找到删除按钮，停止该级别清洗（剩余 ${currentRows.length} 行）`);
            break;
        }

        deleteBtn.click();
        removed++;
        log(`⏳ 属性清洗：已删除「${name || '(空名)'}」（${removed}/${total}）`);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (removed) log(`🎉 属性清洗完成：${normalized === window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE ? '完全清洗' : '保守清洗'}共删除 ${removed} 条自定义属性。`);
    return { removed, total };
};
window.silentPurifyDesc = function() {
    const container = window.getPCEditorContainer();
    if (!container) return;

    const links = container.querySelectorAll('a');
    links.forEach(a => { a.remove(); });

    const cutEverythingBelowAndRemove = (node, maxContainer) => {
        if (!node || !maxContainer.contains(node)) return;
        let current = node;
        while(current && current !== maxContainer) {
            let next = current.nextElementSibling || current.nextSibling;
            while (next) {
                let t = next;
                next = next.nextElementSibling || next.nextSibling;
                if (t.remove) t.remove();
            }
            current = current.parentElement;
        }
        if (node.remove) node.remove();
    };

    const elements = container.querySelectorAll('*');
    let foundNode = null;
    const cutKeywords = [
        'company', 'about us', 'factory show', 'factory display', 'certifications', 'exhibition',
        'contact us', 'why choose us', 'faq', 'f.a.q', 'frequently asked question'
    ];
    for (const el of elements) {
        if (el.children.length === 0 && el.textContent) {
            const text = el.textContent.toLowerCase().trim();
            if (cutKeywords.some(keyword => text.includes(keyword))) {
                foundNode = el; break;
            }
        }
    }
    if (foundNode) cutEverythingBelowAndRemove(foundNode, container);

    const remainingImgs = Array.from(container.querySelectorAll('img')).filter(img => {
        let realSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-ks-lazyload') || img.src;
        return realSrc && !realSrc.startsWith('data:');
    });

    let aiPendingImgs = [];
    let stateChanged = false;

    remainingImgs.forEach(img => {
        let realSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-ks-lazyload') || img.src;
        if (realSrc && realSrc.startsWith('//')) realSrc = 'https:' + realSrc;
        const urlLower = realSrc.toLowerCase();
        let matchedRegex = false;

        if (urlLower.includes('alibaba.com') || urlLower.includes('1688.com') || urlLower.includes('alicdn.com/img/') || urlLower.includes('shopee') || urlLower.includes('lazada')) {
            matchedRegex = true;
        } else {
            for (const word of window.forbiddenWords) {
                const sword = typeof word === 'string' ? word : word.word;
                if (sword && urlLower.includes(sword.toLowerCase())) {
                    matchedRegex = true; break;
                }
            }
        }

        if (matchedRegex) {
            window.removeImageSmart(img); stateChanged = true;
        } else if (window.badImageCache[img.src]) {
            if (window.badImageCache[img.src].has_company_info === true) {
                cutEverythingBelowAndRemove(img, container);
            } else {
                window.removeImageSmart(img);
            }
            stateChanged = true;
        } else {
            aiPendingImgs.push(img);
        }
    });

    // 违禁词文本节点清洗：不自依赖调用方先执行
    if (window.ForbiddenWordsCleaner && window.forbiddenWords.length > 0) {
        const textChanged = window.cleanDescriptionTextNodes(container, { cleanForbiddenWords: true });
        if (textChanged > 0) stateChanged = true;
    }

    if (stateChanged) {
         container.dispatchEvent(new Event('input', {bubbles: true}));
         container.dispatchEvent(new Event('blur', {bubbles: true}));
    }

    if (aiPendingImgs.length > 0) {
        const urls = aiPendingImgs.map(img => {
            let realSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-ks-lazyload') || img.src;
            if (realSrc && realSrc.startsWith('//')) {
                realSrc = 'https:' + realSrc;
            }
            return realSrc;
        });

        chrome.runtime.sendMessage({
            action: "analyze_images_bulk",
            imageUrls: urls,
            forbiddenWords: [...window.forbiddenWords.map(w => typeof w === 'string' ? w : w.word), "tax", "duty"]
        }, (response) => {
            if (response && response.success && response.results) {
                let aiKilled = false;
                response.results.forEach((res, index) => {
                    if (res.is_dirty) {
                        const badImg = aiPendingImgs[index];
                        if(badImg && container.contains(badImg)) {
                            if (res.has_company_info) {
                                cutEverythingBelowAndRemove(badImg, container);
                            } else {
                                window.removeImageSmart(badImg);
                            }
                            aiKilled = true;
                        }
                    }
                });
                if(aiKilled) {
                    container.dispatchEvent(new Event('input', {bubbles: true}));
                    container.dispatchEvent(new Event('blur', {bubbles: true}));
                }
            }
        });
    }
};

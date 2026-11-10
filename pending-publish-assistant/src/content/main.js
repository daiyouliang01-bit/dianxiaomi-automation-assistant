// ============================================
// main.js — UI 按钮注入 + 管线逻辑 + 安检 + 同步 + 初始化入口
// 所有函数挂载到 window 上，供其他模块直接调用
// ============================================

// --- 初始化入口 ---

window.init = function() {
    window.loadData();
    window.tryInjectButtons();
    const observer = new MutationObserver(() => {
        if (window._dianxiaomi_inject_timer) clearTimeout(window._dianxiaomi_inject_timer);
        window._dianxiaomi_inject_timer = setTimeout(() => {
            window.tryInjectButtons();
        }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 植入自动发布离站提示抑制器，避免后台关闭待发布编辑页时被 beforeunload 卡住。
    if (!document.getElementById('dxm-auto-publish-open-hook')) {
        const script = document.createElement('script');
        script.id = 'dxm-auto-publish-open-hook';
        script.src = chrome.runtime.getURL('src/platform/inject-open-hook.js');
        document.documentElement.appendChild(script);
    }
};

window.tryInjectButtons = function() {
    window.initTopToolbarButtons();
    if (typeof window.dxmRefreshListControlsForCurrentPage === 'function') {
        window.dxmRefreshListControlsForCurrentPage();
    }
};

window.loadData = function() {
    chrome.storage.local.get(['whiteList', 'forbiddenWords', 'badImageCache', 'optimizationMode'], (res) => {
        window.whiteList = res.whiteList || [];
        window.forbiddenWords = res.forbiddenWords || [];
        window.badImageCache = res.badImageCache || {};
        window.tryInjectButtons();
    });
};

window.DxmPublishSafety = window.DxmPublishSafety || (() => {
    const IMAGE_SPACE_PATTERNS = ['图片空间不足', '图片内存不足', '存储空间不足', '可用空间不足', '剩余空间不足', '容量不足', '空间不足', '空间已满', '空间满', '存储已满'];
    const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const includesAny = (text, values) => values.some(value => text.includes(value));
    return {
        classifyImageGenerationResult(message) {
            const text = normalizeText(message);
            if (includesAny(text, IMAGE_SPACE_PATTERNS)) return 'space_full';
            if (/(原图|图片|图像).{0,12}(尺寸|大小).{0,12}(异常|不规则|不符合|无法)/i.test(text) ||
                /无法.{0,16}(生成|制作).{0,16}(800\s*[x×]\s*800)/i.test(text)) {
                return 'unresizable';
            }
            return 'unknown';
        },
        shouldDeleteAttributeRow({ name = '', value = '', validationText = '', invalidState = false } = {}) {
            const cleanName = normalizeText(name);
            const cleanValue = normalizeText(value);
            if (!cleanName || !cleanValue) return true;
            if (!/^[A-Za-z0-9 ]+$/.test(cleanName) || !/^[A-Za-z0-9 ]+$/.test(cleanValue)) return true;
            return Boolean(invalidState || normalizeText(validationText));
        }
    };
})();

// --- 4. UI 创建 (顶部工具栏) ---

window.initTopToolbarButtons = function() {
    // 不再注入"安全检测"和"净化描述"按钮——它们影响"一键翻译"按钮的正常使用
};

// --- 4.5 描述净化 ---

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
            if (el.children.length === 0 && el.textContent && !container.contains(el) === false) {
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

// --- 5. 安检逻辑 ---

window.startCheck = function() {
    if (window.forbiddenWords.length === 0) {
        alert("⚠️ 本地词库为空，请点击右上角插件图标进行【同步】！");
        return;
    }
    let issues = [];

    const titleInput = document.querySelector(window.Selectors.title);
    if (titleInput) {
        window.checkText(titleInput.value, "标题", (word) => {
            issues.push({ location: "标题", type: 'title', word: word, target: titleInput, action: 'value' });
        });
    }

    const iframe = document.querySelector(window.Selectors.descriptionFrame);
    if (iframe && iframe.contentDocument) {
        const body = iframe.contentDocument.body;
        window.checkText(body.innerText, "描述", (word) => {
             issues.push({ location: "描述", type: 'desc', word: word, target: body, action: 'html' });
        });
    }

    const attrInputs = document.querySelectorAll(window.Selectors.attributes);
    attrInputs.forEach((input, index) => {
        let labelName = `属性行 ${index + 1}`;
        try {
            const row = input.closest('.ant-row');
            if (row) {
                const label = row.querySelector('.ant-form-item-label label');
                if (label) labelName = label.innerText.replace(':', '').trim();
            }
        } catch(e) {}
        window.checkText(input.value, labelName, (word) => {
            issues.push({ location: labelName, type: 'attr', word: word, target: input, action: 'value' });
        });
    });
    window.showReport(issues);
};

// --- 6. 报告弹窗 ---

window.showReport = function(issues) {
    const old = document.getElementById('check-report-modal');
    if (old) old.remove();
    const oldOverlay = document.getElementById('modal-overlay');
    if (oldOverlay) oldOverlay.remove();

    if (issues.length === 0) {
        alert("🎉 完美！安检通过。");
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    document.body.appendChild(overlay);
    const modal = document.createElement('div');
    modal.id = 'check-report-modal';

    const rowsHtml = issues.map((issue, idx) => `
        <tr id="issue-row-${idx}">
            <td><span class="loc-tag loc-${issue.type}">${issue.location}</span></td>
            <td><span class="danger-word">${issue.word}</span></td>
            <td>
                <button class="action-btn btn-delete" data-index="${idx}">删除</button>
                <button class="action-btn btn-whitelist" data-index="${idx}">信任</button>
            </td>
        </tr>
    `).join('');

    modal.innerHTML = `
        <div class="report-header">
            <span class="report-title">⚠️ 发现 ${issues.length} 个风险项</span>
            <span class="report-close" id="modal-close-btn">✖</span>
        </div>
        <div class="report-body">
            <table class="report-table">
                <thead><tr><th>位置</th><th>违禁词</th><th>操作</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('modal-close-btn').onclick = window.closeModal;
    overlay.onclick = window.closeModal;

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = function() {
            const idx = this.getAttribute('data-index');
            window.fixIssue(parseInt(idx));
        };
    });

    document.querySelectorAll('.btn-whitelist').forEach(btn => {
        btn.onclick = function() {
            const idx = this.getAttribute('data-index');
            window.addToWhitelist(parseInt(idx));
        };
    });

    window.currentIssues = issues;
};

window.closeModal = function() {
    const modal = document.getElementById('check-report-modal');
    const overlay = document.getElementById('modal-overlay');
    if (modal) modal.remove();
    if (overlay) overlay.remove();
};

window.fixIssue = function(idx) {
    const issue = window.currentIssues[idx];
    if (!issue) return;

    if (issue.action === 'value' && !document.body.contains(issue.target)) {
        alert("⚠️ 页面元素已失效，请重新刷新页面后再试。");
        return;
    }

    const regex = new RegExp(`\\b${window.escapeRegExp(issue.word)}\\b`, 'gi');

    if (issue.action === 'value') {
        let val = issue.target.value;
        issue.target.value = val.replace(regex, '').replace(/\s{2,}/g, ' ');

        issue.target.dispatchEvent(new Event('input', { bubbles: true }));
        issue.target.dispatchEvent(new Event('change', { bubbles: true }));
        issue.target.dispatchEvent(new Event('blur', { bubbles: true }));

    } else if (issue.action === 'html') {
        let html = issue.target.innerHTML;
        issue.target.innerHTML = html.replace(regex, '');
        issue.target.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const row = document.getElementById(`issue-row-${idx}`);
    if(row) row.style.display = 'none';

    const remaining = document.querySelectorAll('#check-report-modal tr[id^="issue-row-"]:not([style*="none"])');
    if (remaining.length === 0) {
        setTimeout(() => { window.closeModal(); alert("✨ 全部修复完成！"); }, 300);
    }
};

window.addToWhitelist = function(idx) {
    const issue = window.currentIssues[idx];
    if(confirm(`确定要将 "${issue.word}" 加入白名单吗？`)) {
        window.whiteList.push(issue.word);
        chrome.storage.local.set({ whiteList: window.whiteList });
        window.currentIssues.forEach((item, i) => {
            if(item.word === issue.word) {
                const row = document.getElementById(`issue-row-${i}`);
                if(row) row.style.display = 'none';
            }
        });
    }
};

// --- 7. 文本检查工具 ---

window.checkText = function(text, location, callback) {
    if (!text) return;
    window.forbiddenWords.forEach(word => {
        if (!word || word.trim().length === 0) return;
        const w = word.trim().toLowerCase();
        if (window.whiteList.map(item => item.toLowerCase()).includes(w)) return;
        try {
            const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
            if (regex.test(text)) {
                callback(word);
            }
        } catch (e) { }
    });
};

window.escapeRegExp = function(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

window.removeImageSmart = function(img) {
    if (!img || !img.parentNode) return;
    const parent = img.parentNode;
    if (parent.tagName === 'A') {
        parent.remove();
    } else {
        img.remove();
    }
};

// --- ⭐⭐⭐ 8. 一键优化管线 (One-Click Pipeline) ---

window.getImageGenerationFeedbackText = function() {
    return document.body ? document.body.innerText : '';
};

window.waitForImageGenerationResult = async function() {
    const startedAt = Date.now();
    const timeout = 25000;
    while (Date.now() - startedAt < timeout) {
        const feedback = window.getImageGenerationFeedbackText() || (document.body ? document.body.innerText : '');
        const classification = window.DxmPublishSafety.classifyImageGenerationResult(feedback);
        if (classification === 'space_full' || classification === 'unresizable') return { status: classification, feedback };
        if (/(生成成功|处理成功|操作成功|图片制作成功)/.test(feedback)) return { status: 'success', feedback };
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    return { status: 'unknown', feedback: window.getImageGenerationFeedbackText() };
};

window.makeBubblingEvent = function(type) {
    const EventCtor = window.Event || globalThis.Event;
    try {
        return new EventCtor(type, { bubbles: true });
    } catch (_) {
        return { type, bubbles: true };
    }
};

window.writeImageResizeTargetSize = function(input, size) {
    if (!input) return false;
    const value = String(size);
    const view = input.ownerDocument?.defaultView || window;
    const prototypes = [
        input.constructor?.prototype,
        input.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement?.prototype : view.HTMLInputElement?.prototype,
        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype
    ].filter(Boolean);

    const nativeDescriptor = prototypes
        .map(proto => Object.getOwnPropertyDescriptor(proto, 'value'))
        .find(descriptor => descriptor && descriptor.set);

    if (nativeDescriptor && nativeDescriptor.set) nativeDescriptor.set.call(input, value);
    else input.value = value;

    input.dispatchEvent(window.makeBubblingEvent('input'));
    input.dispatchEvent(window.makeBubblingEvent('change'));
    input.dispatchEvent(window.makeBubblingEvent('blur'));
    return String(input.value || '').trim() === value;
};

window.isVisibleElement = function(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
};

window.findImageResizeSizeInputs = function(root = document) {
    const doc = root.ownerDocument || document;
    const candidates = new Set();
    const visibleDialogs = Array.from(doc.querySelectorAll('.el-dialog, .ant-modal, .modal, [role="dialog"]'))
        .filter(window.isVisibleElement);
    const scopes = visibleDialogs.length > 0 ? visibleDialogs : [doc];

    const addCandidate = (input, contextText = '') => {
        if (!input || !window.isVisibleElement(input)) return;
        const value = String(input.value || '').trim();
        const placeholder = String(input.getAttribute?.('placeholder') || input.placeholder || '');
        const context = `${contextText} ${placeholder} ${value}`;
        if (/px|像素|尺寸|宽|高|图片/i.test(context) || /^\d{2,5}$/.test(value)) {
            candidates.add(input);
        }
    };

    scopes.forEach((scope) => {
        const inputs = Array.from(scope.querySelectorAll('input[type="text"], input[type="number"], input:not([type])'));
        inputs.forEach((input) => {
            const contextNode = input.closest?.('.el-form-item, .ant-form-item, .el-input, .input-group, label, div') || input.parentElement;
            addCandidate(input, contextNode ? (contextNode.innerText || contextNode.textContent || '') : '');
        });
    });

    const pxTextSnap = doc.evaluate
        ? doc.evaluate("//text()[contains(., 'px')]/parent::*", doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
        : null;
    if (pxTextSnap) {
        for (let i = 0; i < pxTextSnap.snapshotLength; i++) {
            const el = pxTextSnap.snapshotItem(i);
            const parent = el.parentElement;
            if (!parent || !window.isVisibleElement(parent)) continue;
            const scopedInputs = parent.querySelectorAll('input[type="text"], input[type="number"], input:not([type])');
            scopedInputs.forEach(input => addCandidate(input, parent.innerText || parent.textContent || 'px'));
            const previousInput = el.previousElementSibling && el.previousElementSibling.tagName === 'INPUT' ? el.previousElementSibling : null;
            addCandidate(previousInput, parent.innerText || parent.textContent || 'px');
        }
    }

    return Array.from(candidates);
};

window.triggerImageResize = async function() {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const normalize = value => String(value || '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, '').trim();
    const visible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const textOf = el => normalize(el?.textContent || el?.innerText || el?.getAttribute?.('title') || el?.getAttribute?.('aria-label') || '');
    const rectInside = (innerRect, outerRect, tolerance = 8) => {
        if (!innerRect || !outerRect) return false;
        return innerRect.left >= outerRect.left - tolerance &&
            innerRect.right <= outerRect.right + tolerance &&
            innerRect.top >= outerRect.top - tolerance &&
            innerRect.bottom <= outerRect.bottom + tolerance;
    };
    const hasExactVisibleText = (scope, expectedText) => {
        return Array.from((scope || document).querySelectorAll('span, a, button, div, label'))
            .some(el => visible(el) && textOf(el) === expectedText);
    };
    const clickPlain = async el => {
        if (!el) return false;
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        await sleep(120);
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        el.click?.();
        await sleep(250);
        return true;
    };
    const trustedClickRect = async (targetRect, fromRect) => {
        if (!targetRect || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
        if (targetRect.width <= 0 || targetRect.height <= 0) return false;
        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                action: 'trusted_mouse_click',
                startX: fromRect ? fromRect.left + fromRect.width / 2 : targetRect.left + targetRect.width / 2,
                startY: fromRect ? fromRect.top + fromRect.height / 2 : targetRect.top + targetRect.height / 2,
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.top + targetRect.height / 2,
                steps: 16
            }, response => {
                if (chrome.runtime.lastError || !response?.success) {
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    };
    const clickTrustedThenPlain = async (el, from = null) => {
        if (!el) return false;
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        await sleep(160);
        const rect = el.getBoundingClientRect();
        const fromRect = from?.getBoundingClientRect?.() || rect;
        const trusted = await trustedClickRect(rect, fromRect);
        if (trusted) {
            await sleep(650);
            return true;
        }
        return clickPlain(el);
    };
    const trustedMoveToRect = async (targetRect, fromRect, holdMs = 650) => {
        if (!targetRect || typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
        if (targetRect.width <= 0 || targetRect.height <= 0) return false;
        return new Promise(resolve => {
            chrome.runtime.sendMessage({
                action: 'trusted_mouse_move',
                startX: fromRect ? fromRect.left + fromRect.width / 2 : targetRect.left + targetRect.width / 2,
                startY: fromRect ? fromRect.top + fromRect.height / 2 : targetRect.top + targetRect.height / 2,
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.top + targetRect.height / 2,
                holdMs
            }, response => {
                if (chrome.runtime.lastError || !response?.success) {
                    resolve(false);
                    return;
                }
                resolve(true);
            });
        });
    };
    const trustedMoveToElement = async (target, from = null, holdMs = 650) => {
        if (!target) return false;
        const targetRect = target.getBoundingClientRect();
        const fromRect = (from || target).getBoundingClientRect?.() || targetRect;
        return trustedMoveToRect(targetRect, fromRect, holdMs);
    };
    const dispatchPointerMouseEvents = (el, clientX, clientY, eventTypes = null) => {
        if (!el) return;
        const doc = el.ownerDocument || document;
        const view = doc.defaultView || window;
        const types = eventTypes || [
            'pointerenter',
            'pointerover',
            'pointermove',
            'mouseenter',
            'mouseover',
            'mousemove'
        ];
        types.forEach(type => {
            const isPointer = type.startsWith('pointer');
            const EventCtor = isPointer && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
            el.dispatchEvent(new EventCtor(type, {
                bubbles: !type.endsWith('enter'),
                cancelable: true,
                view,
                clientX,
                clientY,
                button: 0,
                buttons: type.includes('down') ? 1 : 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        });
    };
    const hoverPlain = async (el, from = document.body) => {
        if (!el) return false;
        el.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        await sleep(80);
        const moved = await trustedMoveToElement(el, from, 850);
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        dispatchPointerMouseEvents(el, clientX, clientY);
        await sleep(moved ? 250 : 650);
        return true;
    };
    const hoverEditImageTrigger = async (trigger, section, xRatio = 0.58, holdMs = 1100) => {
        if (!trigger) return false;
        section?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        await sleep(100);
        if (section && visible(section)) {
            const sectionRect = section.getBoundingClientRect();
            await trustedMoveToElement(section, document.body, 260);
            dispatchPointerMouseEvents(
                section,
                sectionRect.left + sectionRect.width / 2,
                sectionRect.top + Math.min(sectionRect.height * 0.28, 130)
            );
            await sleep(160);
        }
        trigger.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        await sleep(80);
        const rect = trigger.getBoundingClientRect();
        const fromRect = section?.getBoundingClientRect?.() || rect;
        const editImageHoverRect = {
            left: rect.left + Math.max(4, rect.width * xRatio) - 3,
            top: rect.top + rect.height / 2 - 3,
            width: 6,
            height: 6
        };
        await trustedMoveToRect(editImageHoverRect, fromRect, holdMs);
        const clientX = editImageHoverRect.left + editImageHoverRect.width / 2;
        const clientY = editImageHoverRect.top + editImageHoverRect.height / 2;
        const target = document.elementFromPoint(clientX, clientY) || trigger;
        [trigger, target].filter(Boolean).forEach(el => {
            dispatchPointerMouseEvents(el, clientX, clientY);
        });
        await sleep(holdMs);
        return true;
    };
    const clickEditImageTriggerForMenu = async trigger => {
        if (!trigger) return false;
        const rect = trigger.getBoundingClientRect();
        const clientX = rect.left + Math.min(rect.width * 0.58, rect.width - 8);
        const clientY = rect.top + rect.height / 2;
        const target = document.elementFromPoint(clientX, clientY) || trigger;
        [trigger, target].filter(Boolean).forEach(el => {
            dispatchPointerMouseEvents(el, clientX, clientY, [
                'pointerenter',
                'pointerover',
                'pointermove',
                'mouseenter',
                'mouseover',
                'mousemove',
                'pointerdown',
                'mousedown',
                'pointerup',
                'mouseup',
                'click'
            ]);
        });
        target.click?.();
        if (target !== trigger) trigger.click?.();
        await sleep(650);
        return true;
    };
    const findControl = (matcher, scope = document) => {
        return Array.from(scope.querySelectorAll('button, a, li, label, span, div, [role="button"], .el-dropdown, .el-dropdown-menu__item'))
            .filter(visible)
            .map(el => el.closest('button, a, li, label, [role="button"], .el-dropdown-menu__item, .el-dropdown') || el)
            .filter((el, index, arr) => arr.indexOf(el) === index)
            .find(el => matcher(normalize(el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || ''))) || null;
    };
    const findProductInfoCard = () => {
        const titleNodes = Array.from(document.querySelectorAll('h1, h2, h3, legend, label, span, div'))
            .filter(visible)
            .filter(el => textOf(el) === '产品信息');
        const candidates = [];
        titleNodes.forEach(title => {
            let current = title;
            for (let depth = 0; current && current !== document.body && depth < 9; depth += 1, current = current.parentElement) {
                const rect = current.getBoundingClientRect();
                if (rect.width < 620 || rect.height < 180) continue;
                const text = textOf(current);
                if (!text.includes('产品图片') || !text.includes('产品分组')) continue;
                const hasProductImageLabel = Array.from(current.querySelectorAll('label, span, div'))
                    .some(el => visible(el) && textOf(el).replace(/^[*：:]+/, '').includes('产品图片'));
                if (!hasProductImageLabel) continue;
                candidates.push({ node: current, area: rect.width * rect.height, top: rect.top });
            }
        });
        return candidates
            .sort((a, b) => a.area - b.area || a.top - b.top)[0]?.node || null;
    };
    const getEditImageClickable = source => {
        if (!source) return null;
        return source.closest?.('a.img-options-action-btn, a.ant-dropdown-trigger, [class*="dropdown-trigger"], button, a, [role="button"]') ||
            source.closest?.('a, button, [role="button"]') ||
            source;
    };
    const isValidatedEditImageTrigger = (trigger, section = null, productInfoCard = null) => {
        if (!trigger || !visible(trigger)) return false;
        const text = textOf(trigger);
        if (!text.includes(window.UI_TEXT_CONFIG.editImage) ||
            text.includes('导出') ||
            text.includes('添加水印') ||
            text.includes('选择图片')) {
            return false;
        }
        if (!hasExactVisibleText(trigger, window.UI_TEXT_CONFIG.editImage) &&
            text !== window.UI_TEXT_CONFIG.editImage &&
            !Array.from(trigger.querySelectorAll?.('span, em, i, div') || [])
                .some(el => visible(el) && textOf(el) === window.UI_TEXT_CONFIG.editImage)) {
            return false;
        }
        const triggerRect = trigger.getBoundingClientRect();
        const sectionRect = section?.getBoundingClientRect?.();
        const cardRect = productInfoCard?.getBoundingClientRect?.();
        if (sectionRect && !rectInside(triggerRect, sectionRect, 12)) return false;
        if (cardRect && !rectInside(triggerRect, cardRect, 12)) return false;
        const scopeText = textOf(section || productInfoCard || trigger.parentElement || document.body);
        return scopeText.includes('产品图片') && scopeText.includes('主图最多选用');
    };
    const findValidatedEditImageTrigger = (scope = document, section = null, productInfoCard = null) => {
        const root = scope || document;
        const candidates = [];
        Array.from(root.querySelectorAll('button, a, [role="button"], span, div'))
            .filter(visible)
            .forEach(node => {
                const nodeText = textOf(node);
                if (nodeText !== window.UI_TEXT_CONFIG.editImage && !nodeText.includes(window.UI_TEXT_CONFIG.editImage)) return;
                const clickable = getEditImageClickable(node);
                if (!isValidatedEditImageTrigger(clickable, section, productInfoCard)) return;
                const rect = clickable.getBoundingClientRect();
                const exactScore = nodeText === window.UI_TEXT_CONFIG.editImage ? 100 : 0;
                candidates.push({ el: clickable, rect, score: exactScore - rect.width * rect.height * 0.001 });
            });
        const unique = [];
        candidates.forEach(item => {
            if (!unique.some(existing => existing.el === item.el)) unique.push(item);
        });
        return unique.sort((a, b) => b.score - a.score || a.rect.left - b.rect.left)[0]?.el || null;
    };
    const isBatchResizeText = text => {
        return text.includes(window.UI_TEXT_CONFIG.batchResizeImage) ||
            text.includes('批量修改图片尺寸') ||
            text.includes('批量改图尺寸') ||
            text.includes('批量改图片尺寸') ||
            text.includes('改图片尺寸');
    };
    const isGenerateJpgText = text => {
        return text.includes(window.UI_TEXT_CONFIG.generateJpg) ||
            /生成JPG图片[?？]?$/.test(text) ||
            text.includes('生成JPG图片') ||
            (text.includes('生成JPG') && !text.includes('生成PNG')) ||
            (text.includes('生成jpg') && !text.includes('生成png')) ||
            text.includes('生成图片');
    };
    const findProductImageSection = () => {
        const productInfoCard = findProductInfoCard();
        const searchRoot = productInfoCard || document;
        const labelNodes = Array.from(searchRoot.querySelectorAll('label, span, div, td, th'))
            .filter(visible)
            .filter(el => {
                const text = normalize(el.textContent).replace(/^[*：:]+/, '');
                return text.includes('产品图片') && !text.includes('营销图片');
            });
        const candidates = [];
        labelNodes.forEach(label => {
            let current = label.parentElement;
            for (let depth = 0; current && current !== document.body && depth < 9; depth += 1, current = current.parentElement) {
                const rect = current.getBoundingClientRect();
                if (rect.width < 520 || rect.height < 120) continue;
                const text = normalize(current.textContent || '');
                const hasProductInfoAnchor = !productInfoCard || productInfoCard.contains(current);
                const hasProductImageLabel = Array.from(current.querySelectorAll('label, span, div'))
                    .some(el => visible(el) && normalize(el.textContent).replace(/^[*：:]+/, '').includes('产品图片'));
                const hasEdit = !!findValidatedEditImageTrigger(current, current, productInfoCard);
                const hasProductHints = text.includes('主图最多选用') ||
                    text.includes('点击图片拖动') ||
                    text.includes('添加水印') ||
                    Array.from(current.querySelectorAll('img')).filter(img => {
                        const imgRect = img.getBoundingClientRect();
                        return imgRect.width >= 45 && imgRect.height >= 45;
                    }).length >= 2;
                if (hasProductInfoAnchor && hasProductImageLabel && hasEdit && hasProductHints) {
                    candidates.push({ node: current, area: rect.width * rect.height, top: rect.top });
                }
            }
        });
        return candidates
            .sort((a, b) => a.area - b.area || a.top - b.top)[0]?.node || null;
    };
    const findBatchResizeMenuItem = anchor => {
        const anchorRect = anchor?.getBoundingClientRect?.();
        const candidates = [];
        const getClickable = el => {
            let current = el;
            for (let depth = 0; current && current !== document.body && depth < 6; depth += 1, current = current.parentElement) {
                const rect = current.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;
                const tag = current.tagName;
                const role = current.getAttribute('role') || '';
                const cls = current.className || '';
                if (/^(BUTTON|A|LI|LABEL)$/.test(tag) ||
                    role === 'button' || role === 'menuitem' ||
                    String(cls).includes('dropdown') || String(cls).includes('menu')) {
                    return current;
                }
            }
            return el;
        };

        Array.from(document.querySelectorAll(
            'button, a, li, div, span, [role="button"], [role="menuitem"], .el-dropdown-menu__item, [class*="dropdown"], [class*="menu"]'
        )).forEach(el => {
            const text = normalize(`${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`);
            if (!isBatchResizeText(text)) return;
            const clickable = getClickable(el);
            if (!visible(clickable)) return;
            const rect = clickable.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 16 || rect.width > 360 || rect.height > 80) return;
            if (anchorRect) {
                const belowTrigger = rect.top >= anchorRect.top - 12 && rect.top <= anchorRect.bottom + 260;
                const horizontallyNear = rect.right >= anchorRect.left - 260 && rect.left <= anchorRect.right + 260;
                if (!belowTrigger || !horizontallyNear) return;
            }
            candidates.push({ el: clickable, rect, exact: text === normalize(window.UI_TEXT_CONFIG.batchResizeImage) });
        });

        const unique = [];
        candidates.forEach(item => {
            if (!unique.some(existing => existing.el === item.el)) unique.push(item);
        });

        return unique.sort((a, b) => {
            if (a.exact !== b.exact) return a.exact ? -1 : 1;
            if (!anchorRect) return (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
            const anchorCenter = anchorRect.left + anchorRect.width / 2;
            const centerA = a.rect.left + a.rect.width / 2;
            const centerB = b.rect.left + b.rect.width / 2;
            const scoreA = Math.abs(a.rect.top - anchorRect.bottom) + Math.abs(centerA - anchorCenter) * 0.2;
            const scoreB = Math.abs(b.rect.top - anchorRect.bottom) + Math.abs(centerB - anchorCenter) * 0.2;
            return scoreA - scoreB;
        })[0]?.el || null;
    };
    const findFirstDropdownRowBelow = anchor => {
        const anchorRect = anchor?.getBoundingClientRect?.();
        if (!anchorRect || typeof document.elementsFromPoint !== 'function') return null;
        const sampleXList = [
            anchorRect.left + anchorRect.width / 2,
            anchorRect.left + Math.min(anchorRect.width * 0.3, 36),
            anchorRect.right - Math.min(anchorRect.width * 0.3, 36)
        ];
        const rows = [];
        for (const sampleX of sampleXList) {
            for (let y = anchorRect.bottom + 6; y <= anchorRect.bottom + 120; y += 5) {
                const stack = document.elementsFromPoint(sampleX, y);
                for (const hit of stack) {
                    let current = hit;
                    for (let depth = 0; current && current !== document.body && depth < 6; depth += 1, current = current.parentElement) {
                        const rect = current.getBoundingClientRect();
                        const style = getComputedStyle(current);
                        const rowShape = rect.width >= 70 && rect.width <= 280 && rect.height >= 20 && rect.height <= 48;
                        const below = rect.top >= anchorRect.bottom - 8 && rect.top <= anchorRect.bottom + 140;
                        const near = rect.right >= anchorRect.left - 220 && rect.left <= anchorRect.right + 220;
                        if (rowShape && below && near && style.display !== 'none' && style.visibility !== 'hidden') {
                            if (!rows.some(row => Math.abs(row.rect.top - rect.top) < 3 && Math.abs(row.rect.left - rect.left) < 3)) {
                                rows.push({ el: current, rect, text: normalize(current.textContent || '') });
                            }
                            break;
                        }
                    }
                }
            }
        }
        const textMatched = rows.find(row => isBatchResizeText(row.text));
        if (textMatched) return textMatched.el;
        return rows.sort((a, b) => a.rect.top - b.rect.top)[0]?.el || null;
    };
    const waitFor = async (getter, timeout = 5000, interval = 160) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            const result = getter();
            if (result) return result;
            await sleep(interval);
        }
        return null;
    };
    const activeDialog = () => {
        const scoreDialog = el => {
            const text = normalize(el.textContent || '');
            return (text.includes('批量改图片尺寸') ? 1000 : 0) +
                (text.includes('变化至') ? 350 : 0) +
                (text.includes('生成JPG') ? 350 : 0) +
                (text.includes('生成PNG') ? 120 : 0) +
                (text.includes('图片小边') || text.includes('等比例调整') ? 80 : 0) +
                (el.querySelector?.('input') ? 200 : 0);
        };
        const dialogs = Array.from(document.querySelectorAll('.el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"], .ant-modal-content'))
            .filter(visible)
            .map(el => ({ el, text: normalize(el.textContent), rect: el.getBoundingClientRect() }))
            .filter(item => item.text.includes('选择全部') || item.text.includes('生成JPG') || item.text.includes('图片尺寸') || item.text.includes('px'));
        const bestDialog = dialogs.sort((a, b) => {
            const scoreDiff = scoreDialog(b.el) - scoreDialog(a.el);
            if (scoreDiff) return scoreDiff;
            return (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
        })[0]?.el;
        if (bestDialog) return bestDialog;

        const markers = Array.from(document.querySelectorAll('button, a, label, span, div'))
            .filter(el => visible(el) && /选择全部|全选|生成JPG|生成jpg|图片尺寸|px/.test(el.textContent || ''));
        const inlineCandidates = [];
        markers.forEach(marker => {
            let current = marker;
            for (let depth = 0; current && current !== document.body && depth < 7; depth += 1, current = current.parentElement) {
                const rect = current.getBoundingClientRect();
                const text = normalize(current.textContent);
                const area = rect.width * rect.height;
                if (area > 10000 && area < window.innerWidth * window.innerHeight * 0.85 &&
                    (text.includes('选择全部') || text.includes('生成JPG') || text.includes('图片尺寸') || text.includes('变化至')) &&
                    current.querySelector('input')) {
                    inlineCandidates.push({ el: current, area, score: scoreDialog(current) });
                }
            }
        });
        return inlineCandidates.sort((a, b) => b.score - a.score || a.area - b.area)[0]?.el || null;
    };
    const findTextAnchorElements = (scope, matcher) => {
        return Array.from((scope || document).querySelectorAll('button, a, label, span, div, em, i, strong, b'))
            .filter(visible)
            .filter(el => matcher(textOf(el)));
    };
    const removeBlockingWorkflowOverlay = () => {
        document.getElementById('dxm-workflow-overlay')?.remove();
        document.getElementById('dxm-template-overlay')?.remove();
    };
    const findResizeOpeningMask = () => {
        const label = document.getElementById('one-click-txt');
        if (!label || !visible(label)) return null;
        const labelText = textOf(label);
        if (!/呼出图片重置面板|优化汽摩配主图尺寸/.test(labelText)) return null;
        return label.closest('[data-dxm-one-click-overlay="true"]') ||
            label.closest('#dxm-one-click-overlay') ||
            label.parentElement?.parentElement ||
            label.parentElement ||
            label;
    };
    const hideResizeOpeningMask = () => {
        const mask = findResizeOpeningMask();
        if (!mask) return false;
        mask.setAttribute('data-dxm-hidden-before-jpg-click', 'true');
        mask.style.display = 'none';
        mask.style.pointerEvents = 'none';
        return true;
    };
    const waitForResizeOpeningMaskGone = async () => {
        hideResizeOpeningMask();
        const gone = await waitFor(() => {
            const mask = findResizeOpeningMask();
            return !mask || !visible(mask) ? true : null;
        }, 5000, 120);
        return !!gone;
    };
    const isBatchResizeDialog = el => {
        if (!el || !visible(el)) return false;
        const text = textOf(el);
        const hasDialogTitle = text.includes('批量改图片尺寸') ||
            text.includes('批量修改图片尺寸') ||
            text.includes('批量改图尺寸');
        return hasDialogTitle && (text.includes('生成JPG') || text.includes('变化至') || text.includes('图片小边'));
    };
    const findResizeSizeInputsByTextAnchor = dialog => {
        if (!dialog) return [];
        const dialogText = textOf(dialog);
        if (!dialogText.includes('批量改图片尺寸') && !dialogText.includes('图片尺寸')) return [];
        const inputs = Array.from(dialog.querySelectorAll('input'))
            .filter(input => visible(input) && !/checkbox|radio|hidden|file/i.test(input.type || ''))
            .map(input => ({
                input,
                rect: input.getBoundingClientRect(),
                value: String(input.value || input.getAttribute('value') || input.getAttribute('aria-valuenow') || '').trim()
            }))
            .filter(item => item.rect.width > 10 && item.rect.height > 10);
        if (!inputs.length) return [];

        const changeAnchors = findTextAnchorElements(dialog, text => text.includes('变化至') || text.includes('变换至'));
        const pxAnchors = findTextAnchorElements(dialog, text => text === 'px' || text.endsWith('px') || text.includes('像素'));
        const scored = [];
        inputs.forEach(item => {
            const centerX = item.rect.left + item.rect.width / 2;
            const centerY = item.rect.top + item.rect.height / 2;
            let score = /^\d{2,5}$/.test(item.value) ? 80 : 0;
            changeAnchors.forEach(anchor => {
                const rect = anchor.getBoundingClientRect();
                const sameLine = Math.abs(centerY - (rect.top + rect.height / 2)) <= 34;
                const toRight = centerX >= rect.right - 8 && centerX <= rect.right + 260;
                if (sameLine && toRight) score = Math.max(score, 650 - Math.abs(centerY - (rect.top + rect.height / 2)));
            });
            pxAnchors.forEach(anchor => {
                const rect = anchor.getBoundingClientRect();
                const sameLine = Math.abs(centerY - (rect.top + rect.height / 2)) <= 34;
                const toLeft = centerX <= rect.left + 16 && centerX >= rect.left - 260;
                if (sameLine && toLeft) score = Math.max(score, 600 - Math.abs(centerY - (rect.top + rect.height / 2)));
            });
            const contextText = textOf(item.input.closest('.el-form-item, .ant-form-item, .ant-input-number, label, div, td, tr') || item.input.parentElement);
            if (contextText.includes('px') || contextText.includes('变化至') || contextText.includes('尺寸')) score += 120;
            if (score > 0) scored.push({ ...item, score });
        });
        const byAnchor = scored.sort((a, b) => b.score - a.score)[0]?.input;
        if (byAnchor) return [byAnchor];

        const fallback = typeof window.findImageResizeSizeInputs === 'function'
            ? window.findImageResizeSizeInputs(dialog)
            : [];
        return fallback.filter(input => dialog.contains(input));
    };
    const findGenerateJpgButtonByTextAnchor = dialog => {
        if (!isBatchResizeDialog(dialog)) return null;
        const candidates = findTextAnchorElements(dialog, isGenerateJpgText)
            .map(el => el.closest('button, a, [role="button"]') || el)
            .filter(el => visible(el) && dialog.contains(el))
            .map(el => ({ el, rect: el.getBoundingClientRect(), text: textOf(el) }))
            .filter(item => !item.text.includes('生成PNG'));
        return candidates.sort((a, b) => {
            const exactA = a.text.includes('生成JPG图片') ? 100 : 0;
            const exactB = b.text.includes('生成JPG图片') ? 100 : 0;
            return exactB - exactA || (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
        })[0]?.el || null;
    };
    const getDialogImageDimensions = dialog => {
        if (!dialog || !visible(dialog)) return [];
        const text = textOf(dialog);
        const dimensions = [];
        const seen = new Set();
        Array.from(text.matchAll(/(\d{2,5})\s*[Xx×]\s*(\d{2,5})/g)).forEach(match => {
            const width = Number(match[1]);
            const height = Number(match[2]);
            if (!Number.isFinite(width) || !Number.isFinite(height)) return;
            if (width < 80 || height < 80 || width > 12000 || height > 12000) return;
            const key = `${width}x${height}`;
            if (seen.has(key)) return;
            seen.add(key);
            dimensions.push({ width, height, key });
        });
        return dimensions;
    };
    const dimensionsSignature = dimensions => dimensions.map(item => item.key).join('|');
    const dimensionsConfirmGeneratedJpg = (beforeDimensions, afterDimensions) => {
        if (!afterDimensions.length) return false;
        const afterHas800 = afterDimensions.some(item => item.width === 800 || item.height === 800);
        if (!afterHas800) return false;
        const beforeSignature = dimensionsSignature(beforeDimensions);
        const afterSignature = dimensionsSignature(afterDimensions);
        if (beforeSignature && beforeSignature !== afterSignature) return true;
        const allSelectedLookResized = afterDimensions.length >= 2 &&
            afterDimensions.every(item => item.width === 800 || item.height === 800);
        return allSelectedLookResized;
    };
    const isGenerateButtonBusy = button => {
        if (!button || !document.body.contains(button)) return true;
        const text = textOf(button);
        const classText = String(button.className || '');
        return button.disabled ||
            button.getAttribute('aria-disabled') === 'true' ||
            /loading|disabled|is-loading|is-disabled/.test(classText) ||
            /处理中|生成中|执行中|加载中/.test(text);
    };
    const getResizeProcessingSignal = (button, dialog, beforeDimensions) => {
        const feedback = window.getImageGenerationFeedbackText?.() || (document.body ? document.body.innerText : '');
        const afterDimensions = getDialogImageDimensions(dialog);
        const dialogGone = !document.body.contains(dialog) || !visible(dialog);
        const resized = dimensionsConfirmGeneratedJpg(beforeDimensions, afterDimensions);
        const processingSeen = /(正在执行|正在处理|处理中|图片处理|一键优化|生成中|加载中|请稍候|请稍等)/.test(feedback);
        const busy = isGenerateButtonBusy(button);
        return {
            started: dialogGone || resized || processingSeen || busy,
            dialogGone,
            resized,
            processingSeen,
            busy,
            afterSignature: dimensionsSignature(afterDimensions)
        };
    };
    const waitForGenerateStartSignal = async (button, dialog, beforeDimensions, timeout = 2800) => {
        const started = Date.now();
        let signal = getResizeProcessingSignal(button, dialog, beforeDimensions);
        while (!signal.started && Date.now() - started < timeout) {
            await sleep(220);
            signal = getResizeProcessingSignal(button, dialog, beforeDimensions);
        }
        return signal;
    };
    const clickElementOnly = async el => {
        if (!el) return false;
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        await sleep(120);
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const target = document.elementFromPoint(clientX, clientY) || el;
        dispatchPointerMouseEvents(target, clientX, clientY, [
            'pointerenter',
            'pointerover',
            'pointermove',
            'mouseenter',
            'mouseover',
            'mousemove'
        ]);
        el.click?.();
        await sleep(450);
        return true;
    };
    const clickGenerateJpgWithVerification = async (findButton, dialog, beforeDimensions) => {
        const attempts = [];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
            removeBlockingWorkflowOverlay();
            const openingMaskGone = await waitForResizeOpeningMaskGone();
            if (!openingMaskGone) {
                attempts.push({ attempt, found: false, blockedBy: 'resize_opening_mask' });
                break;
            }
            await sleep(120);
            const button = await waitFor(() => findButton(), 1200, 120);
            if (!button) {
                attempts.push({ attempt, found: false });
                break;
            }
            const rect = button.getBoundingClientRect();
            const clickMethod = attempt === 1
                ? 'trusted_mouse_click'
                : attempt === 2
                    ? 'element_click'
                    : 'plain_mouse_events';
            const clicked = attempt === 1
                ? await clickTrustedThenPlain(button, dialog)
                : attempt === 2
                    ? await clickElementOnly(button)
                    : await clickPlain(button);
            const signal = await waitForGenerateStartSignal(button, dialog, beforeDimensions, 3000);
            attempts.push({
                attempt,
                found: true,
                clickMethod,
                clicked,
                buttonText: textOf(button),
                buttonRect: {
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                },
                ...signal
            });
            if (signal.started) {
                return { started: true, reason: 'processing_signal_seen', attempts };
            }
        }
        return { started: false, reason: 'no_processing_signal', attempts };
    };
    const setNativeValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, value);
        else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const finish = result => {
        window.dxmLastImageResizeResult = {
            ...result,
            at: Date.now()
        };
        return window.dxmLastImageResizeResult;
    };
    const findDialogCloseControl = dlg => {
        if (!dlg) return null;
        const explicit = dlg.querySelector(
            '.el-dialog__headerbtn, .el-dialog__close, .ant-modal-close, .ant-modal-close-x, ' +
            '[aria-label="Close"], [aria-label="close"], [aria-label="关闭"]'
        );
        if (explicit && visible(explicit)) return explicit;
        const candidates = Array.from(dlg.querySelectorAll('button, a, span, i, em, svg'))
            .filter(el => visible(el))
            .filter(el => {
                const t = textOf(el);
                return t === '×' || t === '✕' || t === '✖' || t === 'x' || t === 'X' || t === '关闭';
            });
        return candidates.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return (Math.abs(rb.top - ra.top) > 6) ? (ra.top - rb.top) : (rb.right - ra.right);
        })[0] || null;
    };
    const closeBatchResizeDialog = async (dlg, timeout = 4500) => {
        const started = Date.now();
        let attempts = 0;
        while (Date.now() - started < timeout) {
            const stillThere = dlg && document.body.contains(dlg) && visible(dlg) && isBatchResizeDialog(dlg);
            const fallback = activeDialog();
            const current = stillThere ? dlg : (isBatchResizeDialog(fallback) ? fallback : null);
            if (!current) return { closed: true, attempts };
            attempts += 1;
            const closeBtn = findDialogCloseControl(current);
            if (closeBtn) {
                await clickPlain(closeBtn);
            } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
            }
            await sleep(420);
        }
        const leftover = activeDialog();
        return { closed: !(leftover && isBatchResizeDialog(leftover)), attempts };
    };
    const waitForResizeActionDone = async (beforeDimensions, timeout = 45000) => {
        const started = Date.now();
        let lastResult = null;
        let processingSeen = false;
        while (Date.now() - started < timeout) {
            const feedback = window.getImageGenerationFeedbackText?.() || (document.body ? document.body.innerText : '');
            processingSeen = processingSeen || /(正在执行|正在处理|处理中|图片处理|一键优化|生成中|加载中|请稍候|请稍等)/.test(feedback);
            const classification = window.DxmPublishSafety?.classifyImageGenerationResult
                ? window.DxmPublishSafety.classifyImageGenerationResult(feedback)
                : 'unknown';
            const result = (classification === 'space_full' || classification === 'unresizable')
                ? { status: classification, feedback }
                : /(生成成功|处理成功|操作成功|图片制作成功)/.test(feedback)
                    ? { status: 'success', feedback }
                    : { status: 'unknown', feedback };
            lastResult = result;
            if (result.status === 'success' ||
                result.status === 'space_full' ||
                result.status === 'unresizable') {
                return result;
            }
            if (!document.body.contains(dialog) || !visible(dialog)) {
                return { status: 'success', feedback: '批量改图弹窗已关闭' };
            }
            const afterDimensions = getDialogImageDimensions(dialog);
            if (dimensionsConfirmGeneratedJpg(beforeDimensions, afterDimensions)) {
                return {
                    status: 'success',
                    feedback: `弹窗内图片尺寸已变更为 800 边：${dimensionsSignature(afterDimensions)}`
                };
            }
            await sleep(350);
        }
        if (processingSeen) {
            return {
                status: 'unknown',
                feedback: 'processing_seen_but_not_finished'
            };
        }
        return lastResult || { status: 'unknown', feedback: window.getImageGenerationFeedbackText?.() || '' };
    };

    const productInfoCard = await waitFor(() => findProductInfoCard(), 2500);
    const productImageSection = await waitFor(() => findProductImageSection(), 3500);
    const editImgTrigger = await waitFor(() =>
        (productImageSection ? findValidatedEditImageTrigger(productImageSection, productImageSection, productInfoCard) : null) ||
        findValidatedEditImageTrigger(productInfoCard || document, productImageSection, productInfoCard)
    , 3000);
    if (!editImgTrigger) {
        console.warn("未找到'编辑图片'按钮，跳过 800×800 图片处理。");
        return finish({ status: 'unavailable', step: 'edit_image_button', message: "未找到'编辑图片'按钮" });
    }
    if (!isValidatedEditImageTrigger(editImgTrigger, productImageSection, productInfoCard)) {
        console.warn("'编辑图片'按钮未通过产品信息/产品图片/文字三重校验。");
        return finish({
            status: 'unavailable',
            step: 'edit_image_text_verify',
            message: "'编辑图片'按钮未通过产品信息/产品图片/文字三重校验"
        });
    }
    await hoverEditImageTrigger(editImgTrigger, productImageSection, 0.58, 1100);

    const findOpenedBatchResizeItem = () =>
        findBatchResizeMenuItem(editImgTrigger) ||
        findFirstDropdownRowBelow(editImgTrigger);
    let batchResizeItem = await waitFor(() =>
        findOpenedBatchResizeItem()
    , 2200);
    if (!batchResizeItem) {
        for (const xRatio of [0.5, 0.66, 0.42]) {
            await hoverEditImageTrigger(editImgTrigger, productImageSection, xRatio, 900);
            batchResizeItem = await waitFor(() =>
                findOpenedBatchResizeItem()
            , 1600);
            if (batchResizeItem) break;
        }
    }
    if (!batchResizeItem) {
        await clickEditImageTriggerForMenu(editImgTrigger);
        batchResizeItem = await waitFor(() => findOpenedBatchResizeItem(), 2200);
    }
    if (!batchResizeItem) {
        console.warn("未找到'批量改图片尺寸'菜单项，跳过 800×800 图片处理。");
        return finish({ status: 'unavailable', step: 'batch_resize_menu', message: "未找到'批量改图片尺寸'菜单项" });
    }
    await clickPlain(batchResizeItem);

    const dialog = await waitFor(() => activeDialog(), 4500);
    if (!dialog) {
        console.warn("批量改图弹窗未成功加载。");
        return finish({ status: 'unavailable', step: 'resize_dialog', message: '批量改图弹窗未成功加载' });
    }
    if (!isBatchResizeDialog(dialog)) {
        console.warn("当前弹窗未通过'批量改图片尺寸'文字锚点校验。");
        return finish({ status: 'unavailable', step: 'resize_dialog_text_verify', message: "当前弹窗未通过'批量改图片尺寸'文字锚点校验" });
    }

    await sleep(120);
    const inputs = Array.from(dialog.querySelectorAll('input'))
        .filter(input => visible(input) && !/checkbox|radio|hidden|file/i.test(input.type || ''));
    const sizeInputs = findResizeSizeInputsByTextAnchor(dialog);
    const targets = (sizeInputs.length ? sizeInputs : inputs).slice(0, 4);
    targets.forEach(input => setNativeValue(input, '800'));
    if (!targets.length) {
        console.warn("未能锁定图片尺寸输入框，跳过 800×800 图片处理。");
        await closeBatchResizeDialog(dialog);
        return finish({ status: 'unavailable', step: 'size_inputs', message: '未能锁定图片尺寸输入框' });
    }

    const genBtn = await waitFor(() =>
        findGenerateJpgButtonByTextAnchor(dialog) ||
        findControl(isGenerateJpgText, dialog)
    , 3500);
    if (!genBtn) {
        console.warn("找不到生成JPG图片的按钮。");
        await closeBatchResizeDialog(dialog);
        return finish({ status: 'unavailable', step: 'generate_jpg_button', message: '找不到生成JPG图片的按钮' });
    }
    const beforeDimensions = getDialogImageDimensions(dialog);
    const openingMaskGone = await waitForResizeOpeningMaskGone();
    if (!openingMaskGone) {
        console.warn("等待'正在呼出图片重置面板'遮罩消失超时。");
        await closeBatchResizeDialog(dialog);
        return finish({
            status: 'unavailable',
            step: 'resize_opening_mask',
            message: "等待'正在呼出图片重置面板'遮罩消失超时"
        });
    }
    const generateClick = await clickGenerateJpgWithVerification(() =>
        findGenerateJpgButtonByTextAnchor(dialog) ||
        findControl(isGenerateJpgText, dialog)
    , dialog, beforeDimensions);
    const result = await waitForResizeActionDone(beforeDimensions, generateClick.started ? 45000 : 6500);
    const closeResult = await closeBatchResizeDialog(dialog);
    return finish({
        ...result,
        generateClick,
        closeResult,
        step: result.status === 'success' ? 'resize_done' : 'generate_jpg_button',
        message: result.status === 'success'
            ? '已执行：批量改图片尺寸并生成 800 JPG'
            : generateClick.started
                ? `已触发生成 JPG，但结果未确认：${result.feedback || result.status || 'unknown'}`
                : '已核对“批量改图片尺寸”和“生成JPG图片”，但连续点击后未出现处理信号'
    });
};

// --- ⭐⭐⭐ 8. 同步功能 ---

window.fetchWithFallback = async function(urls) {
    return window.DxmForbiddenSync.fetchForbiddenWords(urls, {
        requestTimeoutMs: 7000,
        totalTimeoutMs: 45000
    });
};

// --- 7. 热更新 ---
if (window === window.top) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.forbiddenWords) window.forbiddenWords = changes.forbiddenWords.newValue || [];
            if (changes.whiteList) window.whiteList = changes.whiteList.newValue || [];
            if (changes.badImageCache) window.badImageCache = changes.badImageCache.newValue || {};
        }
    });
}

// --- 启动入口 ---
if (window === window.top) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "start_sync_proxy") {
            window.fetchWithFallback(window.API_CANDIDATES)
                .then(data => {
                    const rawList = data.data.page.list;
                    const cleanList = rawList.map(item => item.bannedWord).filter(w => w);
                    chrome.storage.local.set({ 'forbiddenWords': cleanList }, () => {
                        sendResponse({ success: true, count: cleanList.length });
                    });
                })
                .catch(err => {
                    const messages = {
                        SYNC_TIMEOUT: '词库接口响应超时，请稍后重试。',
                        AUTH_REQUIRED: '店小秘登录状态已失效，请重新登录后重试。',
                        INCOMPATIBLE_RESPONSE: '店小秘词库接口响应结构已变更。'
                    };
                    sendResponse({
                        success: false,
                        code: err && err.code || 'SYNC_FAILED',
                        msg: messages[err && err.code] || '词库接口请求失败，请确认已登录并重试。'
                    });
                });
            return true;
        }
    });

    window.init();
}

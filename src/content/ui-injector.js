// ============================================
// ui-injector.js — UI 按钮注入、选择器、模态框、图片操作
// ============================================

window.escapeReportHtml = function(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

window.configureOptimizationModeSelector = function(select, surface) {
    const selectorSurface = surface === 'rpa' ? 'rpa' : surface === 'batch' ? 'batch' : 'manual';
    const options = selectorSurface === 'rpa'
        ? RPA_OPTIMIZATION_MODE_OPTIONS
        : selectorSurface === 'batch'
        ? BATCH_OPTIMIZATION_MODE_OPTIONS
        : MANUAL_OPTIMIZATION_MODE_OPTIONS;

    select.dataset.optimizationModeSelector = 'true';
    select.dataset.optimizationModeSurface = selectorSurface;
    select.textContent = '';
    options.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });
    select.value = window.getOptimizationModeForSelectorSurface(selectorSurface);
    select.onchange = () => {
        if (selectorSurface === 'rpa') {
            window.setRpaOptimizationMode(select.value);
        } else {
            window.setOptimizationMode(select.value);
        }
    };
};
window.ensureOptimizationModeSelector = function(anchor, id, options = {}) {
    if (!anchor || !anchor.parentNode) return;
    const surface = options.surface === 'rpa' ? 'rpa' : options.surface === 'batch' ? 'batch' : 'manual';
    const existing = document.getElementById(id);
    if (existing) {
        if (existing.dataset.optimizationModeSurface !== surface) {
            window.configureOptimizationModeSelector(existing, surface);
        }
        window.refreshOptimizationModeSelectors();
        return;
    }

    const wrapper = document.createElement('span');
    wrapper.style.cssText = STYLE_INLINE_FLEX_WRAPPER;
    const label = document.createElement('span');
    label.textContent = '模式';
    label.style.cssText = STYLE_FILTER_LABEL;
    const select = document.createElement('select');
    select.id = id;
    select.style.cssText = STYLE_MODE_SELECT;
    window.configureOptimizationModeSelector(select, surface);

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
};
window.ensurePlugTypeSelector = function(anchor, id) {
    if (!anchor || !anchor.parentNode) return;
    if (!window.PlugSelection || !window.PlugSelection.PLUG_TYPE_LABELS) return;
    const existing = document.getElementById(id);
    if (existing) {
        existing.style.display = window.optimizationMode === 'plug' ? 'inline-flex' : 'none';
        return;
    }
    const wrapper = document.createElement('span');
    wrapper.id = id;
    if (window.optimizationMode === 'plug') {
        wrapper.style.cssText = STYLE_INLINE_FLEX_WRAPPER;
    } else {
        wrapper.style.display = 'none';
    }
    const label = document.createElement('span');
    label.textContent = '插头';
    label.style.cssText = STYLE_FILTER_LABEL;
    const select = document.createElement('select');
    select.style.cssText = STYLE_PLUG_SELECT;
    Object.entries(window.PlugSelection.PLUG_TYPE_LABELS).forEach(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        if (value === (window.currentPlugType || 'no_plug')) option.selected = true;
        select.appendChild(option);
    });
    select.onchange = function() {
        window.currentPlugType = this.value;
    };
    wrapper.appendChild(label);
    wrapper.appendChild(select);
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
};
window.initTopToolbarButtons = function() {
    if (window.location.href.toLowerCase().includes('batch')) return;
    if (document.getElementById('top-forbidden-check-btn') && document.getElementById('top-purify-desc-btn')) return;

    let translateBtn = null;
    const snap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.oneClickTranslate}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < snap.snapshotLength; i++) {
        const el = snap.snapshotItem(i);
        const parentBtn = el.closest('button, .btn, .ant-btn, .el-button, .btn-group');
        if (parentBtn && parentBtn.offsetHeight > 0) {
            translateBtn = parentBtn;
            break;
        }
    }

    if (translateBtn && translateBtn.parentNode) {
        const h = translateBtn.offsetHeight || 32;

        if (!document.getElementById('top-forbidden-check-btn')) {
            const checkBtn = document.createElement('button');
            checkBtn.id = 'top-forbidden-check-btn';
            checkBtn.innerHTML = '🛡️ 安全检测';
            checkBtn.className = 'ai-optimize-btn';
            checkBtn.type = 'button';
            Object.assign(checkBtn.style, {
                background: 'linear-gradient(135deg, #ff4d4f, #ff7875)',
                boxShadow: '0 2px 6px rgba(255, 77, 79, 0.3)',
                color: 'white',
                marginLeft: '12px',
                height: h + 'px',
                lineHeight: (h - 2) + 'px',
                padding: '0 16px',
                verticalAlign: 'top'
            });
            checkBtn.onclick = (e) => { e.preventDefault(); window.startCheck(); };

            if (translateBtn.nextSibling) {
                translateBtn.parentNode.insertBefore(checkBtn, translateBtn.nextSibling);
            } else {
                translateBtn.parentNode.appendChild(checkBtn);
            }
        }

        if (!document.getElementById('top-oneclick-btn')) {
            const oneClickBtn = document.createElement('button');
            oneClickBtn.id = 'top-oneclick-btn';
            oneClickBtn.innerHTML = '🚀 一键优化';
            oneClickBtn.className = 'ai-optimize-btn';
            oneClickBtn.type = 'button';
            Object.assign(oneClickBtn.style, {
                background: 'linear-gradient(135deg, #722ed1, #9254de)',
                boxShadow: '0 2px 6px rgba(114, 46, 209, 0.3)',
                color: 'white',
                marginLeft: '12px',
                height: h + 'px',
                lineHeight: (h - 2) + 'px',
                padding: '0 16px',
                verticalAlign: 'top'
            });
            oneClickBtn.onclick = (e) => { e.preventDefault(); window.startOneClickOptimize(); };

            const checkBtn = document.getElementById('top-forbidden-check-btn');
            const insertAfterNode = checkBtn || translateBtn;
            if (insertAfterNode.nextSibling) {
                 translateBtn.parentNode.insertBefore(oneClickBtn, insertAfterNode.nextSibling);
            } else {
                translateBtn.parentNode.appendChild(oneClickBtn);
            }
        }

        window.ensureOptimizationModeSelector(document.getElementById('top-oneclick-btn'), 'top-optimization-mode-selector');
        window.ensurePlugTypeSelector(document.getElementById('top-oneclick-btn'), 'top-plug-type-selector');
    }
};
window.findTitleInput = function() {
    let input = document.querySelector(window.Selectors.title);
    if (input) return input;

    const snap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.productTitle}') or contains(., '${window.UI_TEXT_CONFIG.titleLabel}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < snap.snapshotLength; i++) {
        const label = snap.snapshotItem(i);
        const row = label.closest('.ant-row, .el-form-item, tr');
        if (row) {
            const candidate = row.querySelector('input[type="text"], textarea');
            if (candidate) return candidate;
        }
    }
    return null;
};
window.initOptimizeTitleButton = function() {
    if (document.getElementById('ai-optimize-btn')) {
        return;
    }

    const titleInput = window.findTitleInput();
    if (titleInput && !document.getElementById('ai-optimize-btn')) {
        const btn = document.createElement('button');
        btn.id = 'ai-optimize-btn';
        btn.innerHTML = '✨ AI 优化';
        btn.className = 'ai-optimize-btn';
        btn.type = 'button';

        const wrapper = titleInput.parentElement;
        if (wrapper) {
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '8px';
            titleInput.style.flex = '1';
            wrapper.appendChild(btn);

            btn.onclick = (e) => {
                e.preventDefault();
                window.startOptimizeTitle(btn, titleInput);
            };
        }
    }
};
window.initBulkOptimizeButton = function() {
    if (!window.location.href.toLowerCase().includes('batch')) return;
    if (document.getElementById('ai-bulk-optimize-btn')) return;

    let translateBtn = null;
    const snap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.oneClickTranslate}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < snap.snapshotLength; i++) {
        const el = snap.snapshotItem(i);
        const parentBtn = el.closest('button, .btn, .ant-btn, .el-button');
        if (parentBtn) {
            translateBtn = parentBtn;
            break;
        }
    }

    if (translateBtn && translateBtn.parentNode) {
        const btn = document.createElement('button');
        btn.id = 'ai-bulk-optimize-btn';
        btn.innerHTML = '🚀 批量标题优化';
        btn.className = 'ai-optimize-btn';
        btn.type = 'button';

        btn.style.background = 'linear-gradient(135deg, #722ed1, #9254de)';
        btn.style.boxShadow = '0 2px 6px rgba(114, 46, 209, 0.3)';
        btn.style.marginLeft = '12px';
        btn.style.marginRight = '12px';
        btn.style.color = 'white';

        const h = translateBtn.offsetHeight || 32;
        btn.style.height = h + 'px';
        btn.style.lineHeight = (h - 2) + 'px';
        btn.style.padding = '0 16px';
        btn.style.verticalAlign = 'top';

        btn.onclick = (e) => {
            e.preventDefault();
            window.startBulkOptimize();
        };

        translateBtn.parentNode.insertBefore(btn, translateBtn);
        window.ensureOptimizationModeSelector(btn, 'batch-optimization-mode-selector', { surface: 'batch' });
    }
};
window.showDxmChoiceDialog = function(config = {}) {
    const options = Array.isArray(config.options) ? config.options : [];
    if (!options.length) return Promise.resolve(null);
    if (typeof document === 'undefined' || !document.body || !document.createElement) {
        return Promise.resolve(options[0].value);
    }

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(15, 23, 42, 0.42)';
        overlay.style.zIndex = '2147483647';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '24px';

        const dialog = document.createElement('div');
        dialog.style.width = 'min(440px, 100%)';
        dialog.style.background = '#fff';
        dialog.style.borderRadius = '8px';
        dialog.style.boxShadow = '0 18px 48px rgba(15, 23, 42, 0.28)';
        dialog.style.padding = '24px';
        dialog.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
        dialog.style.color = '#1f2937';

        const title = document.createElement('div');
        title.textContent = config.title || '请选择';
        title.style.fontSize = '20px';
        title.style.fontWeight = '700';
        title.style.lineHeight = '1.4';
        title.style.marginBottom = config.message ? '8px' : '20px';
        dialog.appendChild(title);

        if (config.message) {
            const message = document.createElement('div');
            message.textContent = config.message;
            message.style.fontSize = '14px';
            message.style.lineHeight = '1.6';
            message.style.color = '#667085';
            message.style.marginBottom = '20px';
            dialog.appendChild(message);
        }

        const actions = document.createElement('div');
        actions.style.display = 'grid';
        actions.style.gridTemplateColumns = options.length > 1 ? `repeat(${options.length}, minmax(0, 1fr))` : '1fr';
        actions.style.gap = '12px';

        const resolveOnce = (value) => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            resolve(value);
        };

        options.forEach((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = option.label;
            button.style.height = '44px';
            button.style.border = '0';
            button.style.borderRadius = '8px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '16px';
            button.style.fontWeight = '700';
            button.style.whiteSpace = 'nowrap';
            button.style.background = option.primary ? '#155bd4' : '#e8f0fe';
            button.style.color = option.primary ? '#fff' : '#1f2937';
            button.onclick = () => resolveOnce(option.value);
            actions.appendChild(button);
        });

        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    });
};
window.confirmDescriptionCleanupLevel = async function() {
    const selectedLevel = await window.showDxmChoiceDialog({
        title: '选择详情页清理模式',
        options: [
            { label: '完全清理', value: window.DESCRIPTION_CLEANUP_LEVELS.DEEP, primary: true },
            { label: '保守清理', value: window.DESCRIPTION_CLEANUP_LEVELS.LIGHT }
        ]
    });
    return window.normalizeDescriptionCleanupLevel(selectedLevel);
};
window.confirmAttributeFixMode = async function() {
    const selectedLevel = await window.showDxmChoiceDialog({
        title: '选择自定义属性清洗级别',
        options: [
            { label: '完全清洗（删除全部自定义属性）', value: window.ATTRIBUTE_CLEANUP_LEVELS.COMPLETE, primary: true },
            { label: '保守清洗（仅删 Size/Weight、Material、Origin、Brand Name、高关注化学品等行）', value: window.ATTRIBUTE_CLEANUP_LEVELS.CONSERVATIVE }
        ]
    });
    return window.normalizeAttributeCleanupLevel(selectedLevel);
};
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
            <td><span class="loc-tag loc-${window.escapeReportHtml(issue.type)}">${window.escapeReportHtml(issue.location)}</span></td>
            <td><span class="danger-word">${window.escapeReportHtml(issue.word)}</span></td>
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
window.getImageGenerationFeedbackText = function() {
    if (window.getRpaVisibleFeedbackText) return window.getRpaVisibleFeedbackText();
    return document.body ? document.body.innerText : '';
};
window.waitForImageGenerationResult = async function() {
    const startedAt = Date.now();
    const timeout = 25000;
    while (Date.now() - startedAt < timeout) {
        const feedback = window.getImageGenerationFeedbackText() || (document.body ? document.body.innerText : '');
        const classification = window.RpaSafety.classifyImageGenerationResult(feedback);
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
        if (/px|像素|尺寸|宽|高|图片/i.test(context)) {
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

    if (scopes.length > 0) {
        scopes.forEach((scope) => {
            const pxTextSnap = doc.evaluate
                ? doc.evaluate(".//text()[contains(., 'px')]/parent::*", scope, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
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
        });
    }

    return Array.from(candidates);
};
window.triggerImageResize = async function() {
    return new Promise(async (resolve, reject) => {
        const editImgBtnSnap = document.evaluate(`//text()[contains(., '${window.UI_TEXT_CONFIG.editImage}')]/parent::*`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (editImgBtnSnap.snapshotLength === 0) {
            console.warn("未找到'编辑图片'按钮，可能页面结构不同或不是单品编辑页。");
            return resolve({ status: 'unavailable' });
        }

        const editImgTrigger = editImgBtnSnap.snapshotItem(0).closest('div, span, li, button, .el-dropdown');
        if (!editImgTrigger) return resolve({ status: 'unavailable' });

        editImgTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        editImgTrigger.click();

        const batchResizeItem = await window.waitForXPath(`//text()[contains(., '${window.UI_TEXT_CONFIG.batchResizeImage}')]/parent::*`, { timeout: 5000 });
        if (!batchResizeItem) {
            console.warn("未找到'批量改图片尺寸'菜单项。");
            return resolve({ status: 'unavailable' });
        }
        batchResizeItem.click();

        // 等待弹窗出现并校验文字锚点
        const resizeDialogMarker = await window.waitForXPath(`//text()[contains(., '${window.UI_TEXT_CONFIG.selectAll}')]/parent::*`, { timeout: 5000 });
        if (!resizeDialogMarker) {
            // 尝试第二锚点：生成JPG 按钮
            const fallbackMarker = document.querySelector('.el-dialog__body, .ant-modal-body, [role="dialog"]');
            const fbText = fallbackMarker ? (fallbackMarker.innerText || '').replace(/\s+/g, '') : '';
            if (!/选择全部|生成JPG|生成jpg|图片尺寸|批量改图/i.test(fbText)) {
                console.warn("批量改图弹窗未成功加载。");
                return resolve({ status: 'unavailable' });
            }
        }

        await new Promise(r => setTimeout(r, 100));

        // 用 native setter 写入 800，不触发 Vue 事件以避免 Ant Design 报错
        const sizeInputs = window.findImageResizeSizeInputs();
        if (sizeInputs.length > 0) {
            sizeInputs.forEach((input) => {
                const proto = input.constructor && input.constructor.prototype;
                const nativeDescriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
                if (nativeDescriptor && nativeDescriptor.set) {
                    nativeDescriptor.set.call(input, '800');
                } else {
                    input.value = '800';
                }
            });
        } else {
            console.warn("未能精准锁定 800 px 的输入框，这可能导致未按预期尺寸生成！");
        }

        await new Promise(r => setTimeout(r, 200));

        // 多重策略找生成按钮
        let genBtn = null;
        // 策略1：XPath 精确查找
        genBtn = await window.waitForXPath(`//span[contains(text(), '${window.UI_TEXT_CONFIG.generateJpg}')]/parent::button | //button[contains(., '${window.UI_TEXT_CONFIG.generateJpg}')]`, { timeout: 2000 });

        // 策略2：querySelector 兜底
        if (!genBtn) {
            const allBtns = document.querySelectorAll('button, .ant-btn, .el-button');
            genBtn = Array.from(allBtns).find(btn =>
                btn.offsetHeight > 0 && /生成JPG|生成jpg/i.test(btn.innerText || '')
            );
        }

        // 策略3：XPath 无span包裹
        if (!genBtn) {
            genBtn = await window.waitForXPath(`//button[contains(text(), '${window.UI_TEXT_CONFIG.generateJpg}')]`, { timeout: 1000 });
        }

        if (genBtn) {
            genBtn.click();
            resolve(await window.waitForImageGenerationResult());
        } else {
            console.warn("找不到生成JPG图片的按钮。");
            resolve({ status: 'unavailable' });
        }
    });
};

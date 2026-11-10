// 店小秘“待发布”商品循环自动化。
// 图片水印/品牌清理保留人工复核点，其余步骤可继续自动执行。

window.DXM_DEFAULT_DESCRIPTION_TEMPLATE = `Dear friend,

Sincerely welcome to our store!

The price displayed on the page is only a partial deposit. Since the product is shipped by sea, the weight displayed is not marked according to the actual weight. Please contact me before placing an order—I will calculate the actual shipping cost based on your country and provide you with an actual quote for the model you need. You may likely enjoy a discount!

If you are interested in other models of this product, please feel free to contact us, and I will send you the direct purchase link immediately.

If you have any detailed inquiries, you are also welcome to contact me at any time. Looking forward to serving you!

📞 WhatsApp: +86 18679661688

📧 E-mail: kevinpaper@163.com`;

window.dxmStorageGet = function(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
};

window.dxmStorageSet = function(values) {
    return new Promise(resolve => chrome.storage.local.set(values, resolve));
};

window.dxmLooksLikeOfflinePublishListDom = function() {
    const text = window.dxmNormalizeText(document.body?.innerText || '');
    if (!text) return false;
    if (text.includes('草稿') || text.includes('在线产品')) return false;
    return text.includes('待发布产品') &&
        (text.includes('批量操作') || text.includes('快捷操作')) &&
        (text.includes('创建产品') || text.includes('导入/导出') || text.includes('同步分组'));
};

window.dxmIsOfflinePublishListPage = function(url = location.href) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('/web/smt/smtproductlist/draft')) return false;
    if (lower.includes('/web/smt/smtproductlist/offline')) return true;
    if (lower.includes('/web/smt/smtproductlist') && window.dxmLooksLikeOfflinePublishListDom?.()) return true;
    return false;
};

window.dxmRemoveListControlsIfWrongPage = function() {
    if (window.dxmIsOfflinePublishListPage()) return;
    document.getElementById('dxm-auto-publish-controls')?.remove();
};

window.dxmNormalizeText = function(value) {
    return String(value || '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/\s+/g, '')
        .trim();
};

window.dxmEnableNoTranslateGuard = function(scope = document) {
    try {
        const doc = scope.ownerDocument || scope;
        doc.documentElement?.setAttribute('translate', 'no');
        doc.documentElement?.classList?.add('notranslate', 'dxm-no-translate-page');
        doc.body?.setAttribute('translate', 'no');
        doc.body?.classList?.add('notranslate', 'dxm-no-translate-page');
        doc.querySelectorAll?.(
            '[data-dxm-description-template="1"], [contenteditable="true"], textarea, iframe'
        ).forEach(node => {
            node.setAttribute?.('translate', 'no');
            node.classList?.add?.('notranslate');
            if (node.tagName === 'IFRAME') {
                try {
                    const iframeDoc = node.contentDocument;
                    iframeDoc?.documentElement?.setAttribute('translate', 'no');
                    iframeDoc?.documentElement?.classList?.add('notranslate', 'dxm-no-translate-page');
                    iframeDoc?.body?.setAttribute('translate', 'no');
                    iframeDoc?.body?.classList?.add('notranslate', 'dxm-no-translate-page');
                } catch (_) {}
            }
        });
    } catch (_) {}
};

window.dxmSuppressTranslationWidgets = function() {
    if (window._dxmTranslationInteractionActive) return;
    const looksLikeTranslateWidget = node => {
        if (!node || node.closest?.('#dxm-auto-publish-controls, #dxm-template-overlay, #dxm-workflow-overlay, .dxm-manual-panel')) {
            return false;
        }
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width < 80 || rect.height < 40 || rect.width > 420 || rect.height > 420) return false;
        const style = getComputedStyle(node);
        const fixedOrFloating = ['fixed', 'absolute', 'sticky'].includes(style.position) || Number(style.zIndex || 0) >= 1000;
        if (!fixedOrFloating) return false;
        const text = window.dxmNormalizeText(node.textContent || '');
        if (!text) return false;
        return (
            text.includes('普通翻译') &&
            (text.includes('高级翻译') || text.includes('源语言') || text.includes('翻译设置') || text.includes('中文→中文'))
        ) || (
            text.includes('源语言→语言') &&
            text.includes('设置') &&
            text.includes('翻译')
        );
    };

    document.querySelectorAll(
        '#goog-gt-tt, .goog-tooltip, .goog-tooltip:hover, .goog-te-balloon-frame, iframe.goog-te-menu-frame, .skiptranslate, div, iframe'
    ).forEach(node => {
        const isKnownGoogleWidget = node.matches?.(
            '#goog-gt-tt, .goog-tooltip, .goog-te-balloon-frame, iframe.goog-te-menu-frame'
        );
        if (!isKnownGoogleWidget && !looksLikeTranslateWidget(node)) return;
        node.setAttribute?.('data-dxm-suppressed-translate-widget', '1');
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('visibility', 'hidden', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
    });
};

window.dxmFindVisibleByText = function(text, selectors = 'button, a, li, span, div') {
    const normalized = window.dxmNormalizeText(text);
    return Array.from(document.querySelectorAll(selectors)).find(el => {
        if (!el.offsetWidth || !el.offsetHeight) return false;
        return window.dxmNormalizeText(el.textContent).includes(normalized);
    }) || null;
};

window.dxmIsVisibleElement = function(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element) || getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01;
};

window.dxmClickText = async function(text, timeout = 6000, selectors) {
    const target = await window.waitForElement(
        () => window.dxmFindVisibleByText(text, selectors),
        { timeout, interval: 200 }
    );
    if (!target) return false;
    const clickable = target.closest('button, a, li, label, [role="button"], .el-dropdown, .ant-btn') || target;
    clickable.click();
    return true;
};

window.dxmFocusStep = async function(label, options = {}) {
    const {
        click = false,
        timeout = 5000,
        selectors = 'button, a, li, label, h1, h2, h3, h4, span, div, th'
    } = options;
    const target = await window.waitForElement(
        () => window.dxmFindVisibleByText(label, selectors),
        { timeout, interval: 200 }
    );
    if (!target) return null;

    const focusTarget = target.closest(
        'button, a, li, label, [role="button"], .el-form-item, .ant-form-item, section, fieldset, tr'
    ) || target;
    focusTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusTarget.classList.add('dxm-step-focus');
    setTimeout(() => focusTarget.classList.remove('dxm-step-focus'), 1200);
    await new Promise(resolve => setTimeout(resolve, 350));

    if (click) {
        const clickable = target.closest('button, a, li, label, [role="button"], .el-dropdown, .ant-btn') || target;
        clickable.click();
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    return focusTarget;
};

window.dxmExtractEditUrl = function(link) {
    const row = link.closest('tr[rowid], tr, [class*="row"], [class*="item"]');
    const rowId = row?.getAttribute('rowid');
    if (rowId && /^\d{10,}$/.test(rowId)) return `/web/smt/edit?id=${rowId}`;

    const href = link.getAttribute('href') || '';
    if (href.startsWith('/') || href.startsWith('http')) return href;

    const source = `${href} ${link.getAttribute('onclick') || ''}`;
    const urlMatch = source.match(/['"]([^'"]*\/web\/smt\/edit\?[^'"]*)['"]/);
    if (urlMatch) return urlMatch[1];

    const idMatch = source.match(/[?&]id=(\d{10,})/);
    if (idMatch) return `/web/smt/edit?id=${idMatch[1]}`;

    const checkbox = row?.querySelector('input[type="checkbox"][value]');
    if (checkbox && /^\d{10,}$/.test(checkbox.value)) {
        return `/web/smt/edit?id=${checkbox.value}`;
    }
    return null;
};

window.DXM_AUTO_PUBLISH_MAX_CONCURRENT = 5;
window.DXM_AUTO_PUBLISH_PHASE_KEY = 'dxmAutoPublishPhaseV2';
const DXM_BATCH_VISION_PROVIDER_ORDER = Object.freeze([
    'glm', 'glm-4v', 'gemini', 'agnes', 'qwen3-vl-flash', 'qwen'
]);
window.DXM_BATCH_VISION_PROVIDER_ORDER = DXM_BATCH_VISION_PROVIDER_ORDER;

window.dxmRuntimeMessage = function(payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, response => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!response?.success) return reject(new Error(response?.msg || '后台请求失败'));
            resolve(response);
        });
    });
};

window.dxmNormalizeAutoPublishUrl = function(url) {
    const absolute = new URL(url, location.origin);
    absolute.searchParams.set('dxm_auto_publish', '1');
    return absolute.toString();
};

window.dxmProductKeyFromUrl = function(url) {
    try {
        const parsed = new URL(url, location.origin);
        return parsed.searchParams.get('id') || parsed.href.replace(/[#?].*$/, '');
    } catch (_) {
        return String(url || '');
    }
};

window.dxmGetAutoPublishPhase = function() {
    try {
        return JSON.parse(sessionStorage.getItem(window.DXM_AUTO_PUBLISH_PHASE_KEY) || 'null');
    } catch (_) {
        return null;
    }
};

window.dxmSetAutoPublishPhase = function(phase, extra = {}) {
    try {
        sessionStorage.setItem(window.DXM_AUTO_PUBLISH_PHASE_KEY, JSON.stringify({
            phase,
            productKey: window.dxmProductKeyFromUrl(location.href),
            url: location.href,
            at: Date.now(),
            ...extra
        }));
    } catch (_) {}
};

window.dxmClearAutoPublishPhase = function() {
    try {
        sessionStorage.removeItem(window.DXM_AUTO_PUBLISH_PHASE_KEY);
    } catch (_) {}
};

window.dxmIsCurrentAutoPublishChild = async function() {
    try {
        const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        if (!state?.running) return false;
        const currentKey = window.dxmProductKeyFromUrl(location.href);
        return (state.activeChildren || []).some(child => {
            const key = child.key || window.dxmProductKeyFromUrl(child.url);
            return key && key === currentKey;
        });
    } catch (_) {
        return false;
    }
};

window.dxmCollectSelectedPendingProducts = function() {
    if (!window.dxmIsOfflinePublishListPage()) return [];

    const rows = [];
    const seenRows = new Set();
    const checkedInputs = Array.from(document.querySelectorAll('input[type="checkbox"]'))
        .filter(input => input.checked || input.closest('.is-checked, .checked, [aria-checked="true"]'));

    checkedInputs.forEach(input => {
        const row = input.closest('tr[rowid], tr, [class*="row"], [class*="item"]');
        if (!row || seenRows.has(row)) return;
        seenRows.add(row);
        rows.push(row);
    });

    const products = [];
    const seenKeys = new Set();
    rows.forEach((row, index) => {
        const editLink = Array.from(row.querySelectorAll('a, button, span'))
            .find(el => el.offsetWidth && el.offsetHeight && window.dxmNormalizeText(el.textContent) === '编辑');
        let url = editLink ? window.dxmExtractEditUrl(editLink) : null;
        if (!url) {
            const rowId = row.getAttribute('rowid');
            const checkbox = row.querySelector('input[type="checkbox"][value]');
            const id = /^\d{10,}$/.test(rowId || '') ? rowId :
                (/^\d{10,}$/.test(checkbox?.value || '') ? checkbox.value : '');
            if (id) url = `/web/smt/edit?id=${id}`;
        }
        if (!url) return;
        const normalizedUrl = window.dxmNormalizeAutoPublishUrl(url);
        const key = window.dxmProductKeyFromUrl(normalizedUrl);
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        products.push({ url: normalizedUrl, key, index });
    });
    return products;
};

window.dxmShowTemplateModal = async function() {
    document.getElementById('dxm-template-overlay')?.remove();
    const stored = await window.dxmStorageGet(['dxmDescriptionTemplate', 'dxmDescriptionTemplateImageUrl']);
    const value = stored.dxmDescriptionTemplate || window.DXM_DEFAULT_DESCRIPTION_TEMPLATE;
    const imageUrl = stored.dxmDescriptionTemplateImageUrl || '';

    const overlay = document.createElement('div');
    overlay.id = 'dxm-template-overlay';
    overlay.innerHTML = `
      <div class="dxm-modal">
        <div class="dxm-modal-title">📝 描述模板</div>
        <div class="dxm-modal-hint">文字会加粗、居中、字号 18，并粘贴到 PC 端描述最上方；模板图片会插在文字下方。</div>
        <textarea id="dxm-template-textarea"></textarea>
        <label class="dxm-template-image-label" for="dxm-template-image-url">模板图片链接</label>
        <input id="dxm-template-image-url" type="url" placeholder="https://... 或选择本地图片后自动填入" />
        <div class="dxm-template-image-tools">
          <input id="dxm-template-image-file" type="file" accept="image/*" />
          <button type="button" id="dxm-template-image-clear">清除图片</button>
        </div>
        <div id="dxm-template-image-preview" class="dxm-template-image-preview"></div>
        <div class="dxm-modal-actions">
          <button type="button" id="dxm-template-reset">恢复默认</button>
          <button type="button" id="dxm-template-cancel">取消</button>
          <button type="button" id="dxm-template-save" class="primary">保存模板</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#dxm-template-textarea');
    const imageInput = overlay.querySelector('#dxm-template-image-url');
    const imageFile = overlay.querySelector('#dxm-template-image-file');
    const imagePreview = overlay.querySelector('#dxm-template-image-preview');
    const renderImagePreview = () => {
        const url = imageInput.value.trim();
        imagePreview.innerHTML = url
            ? `<img src="${url.replace(/"/g, '&quot;')}" alt="模板图片预览">`
            : '<span>未设置模板图片。</span>';
    };
    textarea.value = value;
    imageInput.value = imageUrl;
    renderImagePreview();
    imageInput.oninput = renderImagePreview;
    imageFile.onchange = () => {
        const file = imageFile.files?.[0];
        if (!file) return;
        if (!/^image\//i.test(file.type || '')) return alert('请选择图片文件。');
        const reader = new FileReader();
        reader.onload = () => {
            imageInput.value = String(reader.result || '');
            renderImagePreview();
        };
        reader.readAsDataURL(file);
    };
    overlay.querySelector('#dxm-template-image-clear').onclick = () => {
        imageInput.value = '';
        imageFile.value = '';
        renderImagePreview();
    };
    overlay.querySelector('#dxm-template-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#dxm-template-reset').onclick = () => {
        textarea.value = window.DXM_DEFAULT_DESCRIPTION_TEMPLATE;
        imageInput.value = '';
        imageFile.value = '';
        renderImagePreview();
    };
    overlay.querySelector('#dxm-template-save').onclick = async () => {
        const template = textarea.value.trim();
        if (!template) return alert('描述模板不能为空。');
        const nextImageUrl = imageInput.value.trim();
        if (nextImageUrl && !/^(https?:\/\/|data:image\/)/i.test(nextImageUrl)) {
            return alert('模板图片请使用 http(s) 图片链接，或选择本地图片。');
        }
        await window.dxmStorageSet({
            dxmDescriptionTemplate: template,
            dxmDescriptionTemplateImageUrl: nextImageUrl
        });
        overlay.remove();
        alert('描述模板已保存。');
    };
};

window.dxmRenderListControls = function() {
    if (!window.dxmIsOfflinePublishListPage()) {
        window.dxmRemoveListControlsIfWrongPage();
        return;
    }
    const existing = document.getElementById('dxm-auto-publish-controls');
    if (existing) {
        const rect = existing.getBoundingClientRect();
        const style = getComputedStyle(existing);
        if (existing.isConnected && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden') {
            return;
        }
        existing.remove();
    }

    const toolbarControls = Array.from(document.querySelectorAll('button, a, span, div, [role="button"], .el-dropdown'))
        .filter(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const text = window.dxmNormalizeText(el.textContent);
            return text === '快捷操作' || text === '批量操作';
        })
        .map(el => ({ el, text: window.dxmNormalizeText(el.textContent) }));
    const quickText =
        toolbarControls.find(item => item.text === '快捷操作')?.el ||
        toolbarControls.find(item => item.text === '批量操作')?.el;
    const quickControl = quickText?.closest('button, a, [role="button"], .el-dropdown') || quickText;
    const insertionAnchor = quickControl?.closest?.('button, a, [role="button"], .el-dropdown, .btn, .el-button, .btn-group') || quickControl;
    const toolbarFallback = quickControl?.closest?.('.btn-group, .el-button-group, [class*="toolbar"], [class*="operate"], [class*="button"], [class*="search"]') ||
        Array.from(document.querySelectorAll('.btn-group, .page-title, .el-button-group, [class*="toolbar"], [class*="operate"], [class*="button"], [class*="search"]'))
            .find(node => node.offsetWidth && node.offsetHeight) ||
        Array.from(document.querySelectorAll('div'))
            .find(node => {
                if (!node.offsetWidth || !node.offsetHeight) return false;
                const text = window.dxmNormalizeText(node.textContent || '');
                return text.includes('批量操作') && text.includes('快捷操作');
            });
    const insertParent = insertionAnchor?.parentNode || toolbarFallback || document.body;

    const controls = document.createElement('span');
    controls.id = 'dxm-auto-publish-controls';
    controls.innerHTML = `
      <div class="dxm-auto-publish-title">待发布自动发布</div>
      <button type="button" id="dxm-auto-publish-start" class="ai-optimize-btn dxm-start-btn">🚀 启动自动发布</button>
      <button type="button" id="dxm-template-open" class="ai-optimize-btn dxm-template-btn">📝 描述模板</button>`;
    if (insertionAnchor?.parentNode && insertionAnchor.isConnected) {
        insertionAnchor.parentNode.insertBefore(controls, insertionAnchor.nextSibling);
    } else {
        insertParent.appendChild(controls);
    }

    // 入口位于页面工具栏附近，但作为独立兄弟节点插入；阻止事件冒泡，避免触发店小秘原生菜单。
    ['click', 'mousedown', 'mouseup', 'mouseover', 'mouseenter', 'pointerdown', 'pointerup'].forEach(type => {
        controls.addEventListener(type, event => {
            event.stopPropagation();
        });
    });

    controls.querySelector('#dxm-template-open').onclick = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        window.dxmShowTemplateModal();
    };
    controls.querySelector('#dxm-auto-publish-start').onclick = async event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!window.dxmIsOfflinePublishListPage()) {
            window.dxmRemoveListControlsIfWrongPage();
            alert('当前页面不是"待发布"列表。请回到 /web/smt/smtProductList/offline 页面后再启动自动发布。');
            return;
        }

        const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        if (state?.running) {
            if (confirm('自动发布正在运行。确定停止吗？')) {
                await window.dxmStorageSet({
                    dxmPublishState: {
                        ...state,
                        running: false,
                        activeChildren: [],
                        activeChild: false,
                        stoppedAt: Date.now()
                    }
                });
                window.dxmRefreshListControlsForCurrentPage();
                await window.dxmRefreshStartButton();
            }
            return;
        }

        const approved = confirm(
            '确定启动待发布商品自动处理吗？\n\n' +
            '本次只处理当前已勾选的数据，最多同时打开 5 个商品编辑页。\n\n' +
            '流程：中文翻译英文 → 一键优化 → 800×800 → 图片人工复核 → PC描述模板 → 无线端描述 → 立即发布。\n\n' +
            '图片水印、品牌、网址、Logo 和主图排序阶段会暂停，必须由你确认后才继续发布。'
        );
        if (!approved) return;

        const pendingQueue = window.dxmCollectSelectedPendingProducts();
        if (!pendingQueue.length) {
            alert('请先勾选需要自动发布的商品数据。');
            return;
        }

        const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await window.dxmStorageSet({
            dxmPublishState: {
                running: false,
                startRequested: true,
                listUrl: location.href,
                total: pendingQueue.length,
                maxConcurrent: window.DXM_AUTO_PUBLISH_MAX_CONCURRENT,
                pendingQueue,
                activeChildren: [],
                completedUrls: [],
                processed: 0,
                failed: 0,
                startedAt: Date.now(),
                visionSession: {
                    batchId,
                    order: [...window.DXM_BATCH_VISION_PROVIDER_ORDER],
                    mainProviderId: '',
                    mainModelId: '',
                    status: 'probing',
                    unavailableProviderIds: [],
                    probeResults: [],
                    generation: 0,
                    updatedAt: Date.now()
                }
            },
            // 新一轮开始清空上一轮遗留的全局信息流。
            dxmWorkflowStream: []
        });
        chrome.runtime.sendMessage({ action: 'open_windows_panel' });
        const visionResponse = await window.dxmRuntimeMessage({
            action: 'dxm_initialize_vision_session',
            batchId,
            order: [...DXM_BATCH_VISION_PROVIDER_ORDER]
        });
        if (visionResponse.visionSession?.status !== 'ready') {
            alert('六个图片模型均不可调用，本批次未启动。请检查 IPE 模型配置。');
            return;
        }
        window.dxmProcessNextPendingProduct();
    };

    window.dxmRefreshStartButton();
};

window.dxmRefreshStartButton = async function() {
    const button = document.getElementById('dxm-auto-publish-start');
    if (!button) return;
    const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
    if (state?.running) {
        const activeCount = (state.activeChildren || []).length;
        const totalText = state.total ? ` / ${state.total}` : '';
        button.textContent = `🛑 停止自动发布（已完成 ${state.processed || 0}${totalText}，进行中 ${activeCount}）`;
        button.classList.add('running');
    } else {
        button.textContent = '🚀 启动自动发布';
        button.classList.remove('running');
    }
};

window.dxmProcessNextPendingProduct = async function() {
    if (!window.dxmIsOfflinePublishListPage()) return;
    if (window._dxmProcessNextPendingProductBusy) return;
    window._dxmProcessNextPendingProductBusy = true;
    try {
        const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        if (!state?.running) return;
        chrome.runtime.sendMessage({ action: 'schedule_auto_publish_tabs' }, response => {
            if (chrome.runtime.lastError || !response?.success) {
                console.warn('[待发布自动化] 补开标签页请求失败：', chrome.runtime.lastError?.message || response?.msg);
            }
            setTimeout(window.dxmRefreshStartButton, 300);
        });
    } finally {
        window._dxmProcessNextPendingProductBusy = false;
    }
};

// ---------- 工作流综合信息框：左侧固定、可拖动 ----------
//
// 之前是屏幕居中的全屏遮罩，现在改成左侧一个小面板，常驻显示当前
// 商品、当前步骤、去水印每张图的进度。面板整体 pointer-events:none
// （沿用之前的安全考虑：PC端描述"选择图片→引用产品图片"这类步骤
// 需要点击穿透到店小秘页面本身，尤其是自动化用CDP模拟的"可信点击"
// 是按屏幕坐标真实命中最上层元素的，不是找DOM节点直接点，如果面板
// 挡住了真实目标会点错）——只有顶部拖动条本身（.dxm-workflow-drag-handle）
// 在CSS里单独开了 pointer-events:auto，仅供人工拖动。
//
// 位置用 chrome.storage.local 持久化，同一页面内多次调用（每个步骤
// 切换都会整个重建这个面板）用 window.dxmWorkflowPanelPosition 缓存，
// 避免每次都读一次storage；用户实际拖动后才写回storage。

function dxmLoadWorkflowPanelPosition(callback) {
    if (window.dxmWorkflowPanelPosition) { callback(window.dxmWorkflowPanelPosition); return; }
    try {
        chrome.storage.local.get(['dxmWorkflowPanelPosition'], result => {
            if (chrome.runtime.lastError) { callback(null); return; }
            window.dxmWorkflowPanelPosition = result.dxmWorkflowPanelPosition || null;
            callback(window.dxmWorkflowPanelPosition);
        });
    } catch (error) {
        callback(null);
    }
}

function dxmSaveWorkflowPanelPosition(position) {
    window.dxmWorkflowPanelPosition = position;
    try { chrome.storage.local.set({ dxmWorkflowPanelPosition: position }); } catch (error) {}
}

function dxmMakeWorkflowPanelDraggable(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('mousedown', event => {
        if (event.target.closest('.dxm-workflow-toggle')) return; // 折叠按钮自己处理点击，不触发拖动
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        event.preventDefault();
    });
    document.addEventListener('mousemove', event => {
        if (!dragging) return;
        const nextLeft = Math.max(4, Math.min(window.innerWidth - 60, startLeft + (event.clientX - startX)));
        const nextTop = Math.max(4, Math.min(window.innerHeight - 40, startTop + (event.clientY - startY)));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    });
    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        dxmSaveWorkflowPanelPosition({
            left: parseFloat(panel.style.left) || 18,
            top: parseFloat(panel.style.top) || 70
        });
    });
}

window.dxmShowWorkflowOverlay = function(message, options = {}) {
    const wasCollapsed = document.getElementById('dxm-workflow-overlay')?.classList.contains('dxm-workflow-panel-collapsed')
        ?? window.dxmWorkflowPanelCollapsed ?? false;
    document.getElementById('dxm-workflow-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dxm-workflow-overlay';
    if (wasCollapsed) overlay.classList.add('dxm-workflow-panel-collapsed');

    const productId = window.dxmProductKeyFromUrl ? window.dxmProductKeyFromUrl(location.href) : '';
    overlay.innerHTML = `
      <div class="dxm-workflow-drag-handle">
        <span>${options.icon || '🤖'} 自动发布流程</span>
        <span class="dxm-workflow-toggle" title="折叠/展开">${wasCollapsed ? '▸' : '▾'}</span>
      </div>
      <div class="dxm-workflow-body">
        ${productId ? `<div class="dxm-workflow-product">商品：${productId}</div>` : ''}
        <div id="dxm-workflow-model" class="dxm-workflow-product" style="font-size:11px;color:#888"></div>
        <div id="dxm-workflow-message">${message}</div>
        <div id="dxm-workflow-log" class="dxm-workflow-log"></div>
        <div class="dxm-workflow-actions"></div>
      </div>`;
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    // 商品浮层与控制台读取同一个批次状态，避免误显示 IPE 全局 active provider。
    window.dxmStorageGet(['dxmPublishState']).then(function(data) {
        var vision = data.dxmPublishState?.visionSession || {};
        var node = document.getElementById('dxm-workflow-model');
        if (!node) return;
        var labels = {qwen:'Qwen','qwen3-vl-flash':'Qwen3-VL-Flash',gemini:'Gemini',glm:'GLM','glm-4v':'GLM-4V',agnes:'Agnes'};
        if (vision.status === 'ready') {
            node.textContent = '🤖 当前图片模型：' + (labels[vision.mainProviderId] || vision.mainProviderId) + ' · ' + (vision.mainModelId || '-');
        } else if (vision.status === 'probing') {
            node.textContent = '🤖 当前图片模型：正在按顺序测试…';
        } else if (vision.status === 'unavailable') {
            node.textContent = '🤖 当前图片模型：六个模型均不可用';
        }
    }).catch(function() {});

    // 面板每换一个大步骤会整体重建，用 window 上缓存的最近日志重新渲染，
    // 保证滚动日志跨重建连续，不会一重建就清空。
    dxmRenderWorkflowLog();

    const savedPosition = window.dxmWorkflowPanelPosition;
    overlay.style.left = `${savedPosition?.left ?? 18}px`;
    overlay.style.top = `${savedPosition?.top ?? 70}px`;
    dxmLoadWorkflowPanelPosition(position => {
        if (!position || document.getElementById('dxm-workflow-overlay') !== overlay) return;
        overlay.style.left = `${position.left}px`;
        overlay.style.top = `${position.top}px`;
    });

    // 每个大步骤重建面板时，把它的标题消息也推进全局信息流，让
    // 窗口快捷面板能反映“翻译→一键优化→去水印→营销图→描述→发布”
    // 这些跨窗口的阶段推进，而不只是去水印的图片级子步骤。
    if (message && !options.silentLog) {
        window.dxmPushWorkflowLog?.(message, 'step');
    }

    const handle = overlay.querySelector('.dxm-workflow-drag-handle');
    dxmMakeWorkflowPanelDraggable(overlay, handle);
    handle.querySelector('.dxm-workflow-toggle').addEventListener('click', () => {
        const collapsed = overlay.classList.toggle('dxm-workflow-panel-collapsed');
        window.dxmWorkflowPanelCollapsed = collapsed;
        handle.querySelector('.dxm-workflow-toggle').textContent = collapsed ? '▸' : '▾';
    });

    return overlay;
};

// ---------- 综合信息流：最近 5 条滚动日志 ----------
//
// window.dxmWorkflowLogLines 存最近若干条日志（跨面板重建保留），
// 渲染时只显示最近 5 条。每条带一个类型(kind)决定颜色（done绿/
// excluded灰/普通默认）。

const DXM_WORKFLOW_LOG_MAX = 5;

function dxmRenderWorkflowLog() {
    const container = document.getElementById('dxm-workflow-log');
    if (!container) return;
    const lines = (window.dxmWorkflowLogLines || []).slice(-DXM_WORKFLOW_LOG_MAX);
    container.replaceChildren();
    lines.forEach(line => {
        const row = document.createElement('div');
        row.className = 'dxm-workflow-log-row' + (line.kind ? ` ${line.kind}` : '');
        row.innerHTML = `<span class="t">${line.time}</span><span class="m">${line.text}</span>`;
        container.appendChild(row);
    });
    container.scrollTop = container.scrollHeight;
}

window.dxmPushWorkflowLog = function(text, kind = '') {
    if (!window.dxmWorkflowLogLines) window.dxmWorkflowLogLines = [];
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    // 面板每换大步骤会整体重建并重推同一条标题，连续相同的就跳过，避免刷屏。
    const last = window.dxmWorkflowLogLines[window.dxmWorkflowLogLines.length - 1];
    if (last && last.text === text && last.kind === kind) return;
    const entry = { text, kind, time };
    window.dxmWorkflowLogLines.push(entry);
    // 只留最近若干条，避免数组无限增长（渲染只取最后5条，这里稍多留一点缓冲）
    if (window.dxmWorkflowLogLines.length > 40) {
        window.dxmWorkflowLogLines = window.dxmWorkflowLogLines.slice(-40);
    }
    dxmRenderWorkflowLog();
    // 同一条日志镜像进 chrome.storage 的全局信息流，供窗口快捷面板
    // 汇总显示所有窗口的进度（解决只能看到当前窗口信息流的问题）。
    dxmMirrorLogToStream(entry);
};

// 把单条日志追加进 chrome.storage.local.dxmWorkflowStream 的全局信息流。
// 带上商品 key + 时间戳，让窗口快捷面板能标注是哪个窗口在跑到哪一步。
// 多窗口并发写同一个数组理论上会有极小概率的读改写竞争、偶尔丢一条，
// 对纯状态展示无影响，换取实现简单，不额外引入锁。
function dxmMirrorLogToStream(entry) {
    try {
        const productKey = window.dxmProductKeyFromUrl
            ? window.dxmProductKeyFromUrl(location.href)
            : '';
        chrome.storage.local.get(['dxmWorkflowStream'], data => {
            if (chrome.runtime.lastError) return;
            const stream = Array.isArray(data.dxmWorkflowStream) ? data.dxmWorkflowStream : [];
            stream.push({ ...entry, product: productKey, ts: Date.now() });
            // 多窗口共用这一个数组，保留多一点，避免某个窗口话多把别的窗口
            // 的日志挤没了（面板按窗口分组、每个窗口只显示最近几条）。
            chrome.storage.local.set({ dxmWorkflowStream: stream.slice(-150) });
        });
    } catch (error) {
        // 信息流镜像属于附加能力，失败不影响主流程。
    }
}

// 把本地服务回传的排除原因(exclude_reason)翻译成中文短语。
function dxmWorkflowExcludeReasonText(reason) {
    if (!reason) return '未标注原因';
    if (reason === 'large_center_watermark') return '居中大面积水印，消除会伤商品';
    if (reason === 'pervasive_violation_text') return '违规文字铺太开，无法局部消除';
    if (reason.startsWith('cloud_vision:')) return `云视觉判为${reason.slice('cloud_vision:'.length)}`;
    return reason;
}

// 去水印按图片粒度的进度，作为一条日志推进滚动信息流，供
// dxmRunWatermarkForAutoPublish 的 onProgress 回调调用。
window.dxmUpdateWorkflowImageProgress = function(update) {
    if (!Number.isFinite(update.imageIndex)) return;
    const stageLabel = {
        fetching: '拉取原图', detecting: '检测水印', excluded: '跳过',
        removing_watermark: '消除水印', downloading: '下载结果',
        applying_watermark: '合成自有水印', done: '完成'
    }[update.stage];
    if (!stageLabel) return; // start/clearing/uploading/finished 这些整体阶段不进图片日志
    const kind = update.stage === 'done' ? 'done' : (update.stage === 'excluded' ? 'excluded' : '');
    // 排除时把具体原因一并写进信息流，方便对着实拍图判断是哪条规则排的。
    const reasonSuffix = update.stage === 'excluded'
        ? `（${dxmWorkflowExcludeReasonText(update.excludeReason)}）`
        : '';
    window.dxmPushWorkflowLog(`图 ${update.imageIndex + 1}/${update.imageCount}：${stageLabel}${reasonSuffix}`, kind);
};

window.dxmFindProductImageDialog = function() {
    const visibleContainers = Array.from(document.querySelectorAll(
        '.el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"]'
    )).filter(node => node.offsetWidth && node.offsetHeight &&
        window.dxmFindVisibleExactText('全部', node) &&
        window.dxmFindVisibleExactText('选择', node));

    // 某些版本的图片窗口没有通用 modal 类名，从“全部”向上找包含“选择”的最小容器。
    const allControls = Array.from(document.querySelectorAll(
        'button, a, li, label, span, div, [role="button"]'
    )).filter(node => node.offsetWidth && node.offsetHeight &&
        window.dxmNormalizeText(node.textContent) === '全部');
    allControls.forEach(control => {
        let current = control.parentElement;
        for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
            if (current !== document.body &&
                current.offsetWidth && current.offsetHeight &&
                window.dxmFindVisibleExactText('选择', current)) {
                visibleContainers.push(current);
                break;
            }
        }
    });

    return visibleContainers.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.width * rectA.height - rectB.width * rectB.height;
    })[0] || null;
};

window.dxmFindDialogActionControl = function(label, dialog, options = {}) {
    if (!dialog) return null;
    const expected = window.dxmNormalizeText(label);
    const { preferFooter = false } = options;
    const dialogRect = dialog.getBoundingClientRect();
    const controls = Array.from(dialog.querySelectorAll(
        'button, a, label, span, div, [role="button"], input[type="button"], input[type="submit"]'
    )).filter(el => {
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        if (!rect || rect.width <= 0 || rect.height <= 0 ||
            style.display === 'none' || style.visibility === 'hidden') return false;
        const text = window.dxmNormalizeText(el.textContent || el.value || el.getAttribute('title') || el.getAttribute('aria-label') || '');
        return text === expected;
    }).map(el => {
        const clickable = el.closest('button, a, label, [role="button"]') || el;
        const rect = clickable.getBoundingClientRect();
        const tagScore = /^(BUTTON|A|LABEL)$/.test(clickable.tagName) || clickable.getAttribute('role') === 'button' ? 80 : 0;
        const footerScore = preferFooter && rect.top > dialogRect.top + dialogRect.height * 0.58 ? 120 : 0;
        const rightScore = preferFooter && rect.left > dialogRect.left + dialogRect.width * 0.52 ? 35 : 0;
        const smallAreaScore = -Math.min(80, (rect.width * rect.height) / 600);
        return { el: clickable, rect, score: tagScore + footerScore + rightScore + smallAreaScore };
    }).filter((item, index, arr) =>
        item.rect.width > 8 && item.rect.height > 8 &&
        arr.findIndex(other => other.el === item.el) === index
    );
    return controls.sort((a, b) => b.score - a.score)[0]?.el || null;
};

window.dxmInsertProductImagesIntoPcDescription = async function(selectImageButton, imageInsertAnchor = null) {
    if (!selectImageButton) throw new Error('PC端描述工具栏：找不到“选择图片”');
    window.dxmShowWorkflowOverlay('正在引用产品图片到 PC 描述…');
    const fromElement = imageInsertAnchor || selectImageButton;
    let dialog = null;

    if (typeof window.dxmTrustedImageMenuSequence === 'function') {
        const buttonRect = selectImageButton.getBoundingClientRect();
        const fromRect = fromElement.getBoundingClientRect?.() || buttonRect;
        await window.dxmTrustedImageMenuSequence(buttonRect, fromRect);
        dialog = await window.waitForElement(
            () => window.dxmFindProductImageDialog(),
            { timeout: 3200, interval: 140 }
        );
    }

    if (!dialog) {
        await window.dxmSafeElementClick(selectImageButton, fromElement);
        const clickedReference =
            await window.dxmClickDropdownItemAtText('引用产品图片', selectImageButton) ||
            await window.dxmClickLastImageMenuRow(selectImageButton);
        if (clickedReference) {
            dialog = await window.waitForElement(
                () => window.dxmFindProductImageDialog(),
                { timeout: 2800, interval: 120 }
            );
        }
    }

    if (!dialog && typeof window.dxmTrustedImageMenuSequence === 'function') {
        const buttonRect = selectImageButton.getBoundingClientRect();
        const fromRect = fromElement.getBoundingClientRect?.() || buttonRect;
        await window.dxmTrustedImageMenuSequence(buttonRect, fromRect);
        dialog = await window.waitForElement(
            () => window.dxmFindProductImageDialog(),
            { timeout: 3200, interval: 140 }
        );
    }

    if (!dialog) throw new Error('PC端描述：引用产品图片弹窗未出现');

    const allControl = await window.waitForElement(
        () => window.dxmFindDialogActionControl('全部', dialog),
        { timeout: 3500, interval: 120 }
    );
    if (!allControl) throw new Error('PC端描述：引用产品图片弹窗中找不到“全部”');
    await window.dxmSafeElementClick(allControl, dialog);
    await new Promise(resolve => setTimeout(resolve, 120));

    const chooseControl = await window.waitForElement(
        () => window.dxmFindDialogActionControl('选择', dialog, { preferFooter: true }),
        { timeout: 3500, interval: 120 }
    );
    if (!chooseControl) throw new Error('PC端描述：引用产品图片弹窗中找不到“选择”按钮');
    await window.dxmSafeElementClick(chooseControl, allControl);

    const closed = await window.waitForElement(
        () => (dialog.isConnected && dialog.offsetWidth && dialog.offsetHeight ? null : true),
        { timeout: 6000, interval: 150 }
    );
    if (!closed) throw new Error('PC端描述：已点击“选择”，但引用产品图片弹窗未关闭');
    return true;
};

window.dxmWaitForManualPcImageInsert = function(anchor) {
    document.getElementById('dxm-manual-image-panel')?.remove();
    return new Promise(resolve => {
        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            panel.remove();
            resolve(value);
        };

        const panel = document.createElement('aside');
        panel.id = 'dxm-manual-image-panel';
        panel.innerHTML = `
          <div class="dxm-manual-title">PC 描述插图</div>
          <div class="dxm-manual-body">
            1. 点 <b>选择图片 ▼</b><br>
            2. 选 <b>引用产品图片 → 全部 → 选择</b><br>
            3. 图片插入后继续无线端
          </div>
          <div class="dxm-manual-tip" id="dxm-manual-image-tip">
            光标已放在模板下方。不要刷新页面。
          </div>
          <div class="dxm-manual-actions">
            <button type="button" id="dxm-manual-locate">定位</button>
            <button type="button" id="dxm-manual-stop">停止</button>
            <button type="button" id="dxm-manual-done" class="primary">完成，下一步</button>
          </div>`;
        document.body.appendChild(panel);

        panel.querySelector('#dxm-manual-locate').onclick = () => {
            anchor?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            anchor?.classList?.add('dxm-step-focus');
            setTimeout(() => anchor?.classList?.remove('dxm-step-focus'), 1200);
        };
        panel.querySelector('#dxm-manual-stop').onclick = async () => {
            const data = await window.dxmStorageGet(['dxmPublishState']);
            await window.dxmStorageSet({ dxmPublishState: { ...data.dxmPublishState, running: false } });
            finish('stop');
        };
        panel.querySelector('#dxm-manual-done').onclick = () => finish('manual_done');
    });
};

window.dxmWaitForManualWirelessDescription = function(anchor) {
    clearInterval(window.__dxmWirelessGenerateConfirmGuardTimer);
    clearInterval(window.__dxmWirelessSaveGuardTimer);
    document.getElementById('dxm-manual-wireless-panel')?.remove();
    return new Promise(resolve => {
        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            panel.remove();
            resolve(value);
        };

        const panel = document.createElement('aside');
        panel.id = 'dxm-manual-wireless-panel';
        panel.className = 'dxm-manual-panel';
        panel.innerHTML = `
          <div class="dxm-manual-title">无线端描述</div>
          <div class="dxm-manual-body">
            1. 点 <b>使用新版编辑器</b><br>
            2. 点 <b>根据 PC 端描述一键生成</b><br>
            3. 点右上角 <b>保存</b>，返回后继续发布
          </div>
          <div class="dxm-manual-tip">
            无线端半自动。保存返回商品页后再继续。
          </div>
          <div class="dxm-manual-actions">
            <button type="button" id="dxm-wireless-locate">定位</button>
            <button type="button" id="dxm-wireless-stop">停止</button>
            <button type="button" id="dxm-wireless-done" class="primary">保存好了，发布</button>
          </div>`;
        document.body.appendChild(panel);

        panel.querySelector('#dxm-wireless-locate').onclick = async () => {
            const target = await window.dxmFocusWirelessDescription?.() || anchor;
            target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            target?.classList?.add('dxm-step-focus');
            setTimeout(() => target?.classList?.remove('dxm-step-focus'), 1200);
        };
        panel.querySelector('#dxm-wireless-stop').onclick = async () => {
            const data = await window.dxmStorageGet(['dxmPublishState']);
            await window.dxmStorageSet({ dxmPublishState: { ...data.dxmPublishState, running: false } });
            finish('stop');
        };
        panel.querySelector('#dxm-wireless-done').onclick = async () => {
            if (window.dxmIsInWirelessNewEditorFullscreen?.()) {
                alert('还在新版编辑器里，请先点击右上角“保存”，返回商品编辑页后再继续发布。');
                return;
            }
            const returned = await window.dxmWaitForWirelessEditorReturn?.(2000);
            if (returned === false) {
                alert('还没有检测到已保存返回的无线端描述区域，请确认保存完成后再继续发布。');
                return;
            }
            finish('manual_done');
        };
    });
};

window.dxmWaitForManualWirelessNewEditor = function(anchor) {
    document.getElementById('dxm-manual-wireless-new-editor-panel')?.remove();
    return new Promise(resolve => {
        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            panel.remove();
            resolve(value);
        };

        const panel = document.createElement('aside');
        panel.id = 'dxm-manual-wireless-new-editor-panel';
        panel.className = 'dxm-manual-panel';
        panel.innerHTML = `
          <div class="dxm-manual-title">无线端新版编辑器</div>
          <div class="dxm-manual-body">
            1. 点绿色 <b>使用新版编辑器</b><br>
            2. 进入新版编辑器后继续
          </div>
          <div class="dxm-manual-tip">
            找不到按钮时点“定位”。
          </div>
          <div class="dxm-manual-actions">
            <button type="button" id="dxm-wireless-new-locate">定位</button>
            <button type="button" id="dxm-wireless-new-stop">停止</button>
            <button type="button" id="dxm-wireless-new-done" class="primary">继续</button>
          </div>`;
        document.body.appendChild(panel);

        const locate = async () => {
            const target = await window.dxmFocusWirelessDescription?.() || anchor;
            if (!target) return;
            target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            target.classList?.add('dxm-step-focus');
            setTimeout(() => target.classList?.remove('dxm-step-focus'), 1200);
        };
        locate();

        panel.querySelector('#dxm-wireless-new-locate').onclick = locate;
        panel.querySelector('#dxm-wireless-new-stop').onclick = async () => {
            const data = await window.dxmStorageGet(['dxmPublishState']);
            await window.dxmStorageSet({ dxmPublishState: { ...data.dxmPublishState, running: false } });
            finish('stop');
        };
        panel.querySelector('#dxm-wireless-new-done').onclick = () => finish('manual_done');
    });
};

window.dxmGetProductImageContext = function() {
    const editImageText = Array.from(document.querySelectorAll('button, span, div, a'))
        .find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            return window.dxmNormalizeText(el.textContent) === '编辑图片';
        });
    const section = editImageText?.closest(
        '.el-form-item, .ant-form-item, section, fieldset, [class*="product"], [class*="image"], tr'
    ) || editImageText?.parentElement?.parentElement || document;

    const sources = [];
    const seen = new Set();
    section.querySelectorAll('img').forEach(img => {
        let src = img.currentSrc || img.getAttribute('data-src') || img.getAttribute('data-original') || img.src;
        if (src?.startsWith('//')) src = `https:${src}`;
        if (!src || src.startsWith('data:') || seen.has(src)) return;
        const rect = img.getBoundingClientRect();
        if (rect.width < 60 || rect.height < 60) return;
        seen.add(src);
        sources.push(src);
    });
    return { section: section === document ? editImageText : section, sources: sources.slice(0, 12) };
};

window.dxmWaitForImageReview = async function() {
    // 运行模式开关（"图片检查"设置，存 chrome.storage.local.dxmWmRunConfig.reviewMode）：
    //   review（默认）—— 去水印后停在这里，等人工核对图片再点"继续"
    //   auto          —— 全自动，不停，直接继续走后面的营销图/描述/发布
    const runCfg = (await window.dxmStorageGet(['dxmWmRunConfig'])).dxmWmRunConfig || {};
    if (runCfg.reviewMode === 'auto') {
        window.dxmPushWorkflowLog?.('全自动模式：跳过图片人工检查', 'step');
        return true;
    }

    const context = window.dxmGetProductImageContext();
    context.section?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    const resizeResult = window.dxmLastImageResizeResult || null;
    const resizeStatusText = (() => {
        if (!resizeResult) return '未读取到执行状态';
        if (resizeResult.status === 'success') return '已执行成功：800 JPG';
        if (resizeResult.status === 'space_full') return '未完成：图片空间不足';
        if (resizeResult.status === 'unresizable') return '未完成：原图尺寸异常';
        if (resizeResult.status === 'unavailable') return `未执行：${resizeResult.message || resizeResult.step || '入口未找到'}`;
        return `未确认：${resizeResult.message || resizeResult.status || 'unknown'}`;
    })();
    const resizeStatusClass = resizeResult?.status === 'success' ? 'ok' : 'warn';

    const watermarkResult = window.dxmLastWatermarkResult || null;
    const watermarkStatusText = (() => {
        if (!watermarkResult) return '未读取到执行状态';
        if (watermarkResult.status !== 'success') return `未完成：${watermarkResult.message || watermarkResult.status || 'unknown'}`;
        const parts = [`处理 ${watermarkResult.processedCount} 张`];
        if (watermarkResult.excludedCount) parts.push(`跳过宣传图 ${watermarkResult.excludedCount} 张`);
        return `已执行成功：${parts.join('，')}`;
    })();
    const watermarkStatusClass = watermarkResult?.status === 'success' ? 'ok' : 'warn';

    return new Promise(resolve => {
        document.getElementById('dxm-image-review-panel')?.remove();
        const panel = document.createElement('aside');
        panel.id = 'dxm-image-review-panel';
        panel.innerHTML = `
          <div class="dxm-review-header">
            <strong>产品图片检查</strong>
            <button type="button" id="dxm-review-jump">定位</button>
          </div>
          <div class="dxm-review-status ${resizeStatusClass}">批量改图片尺寸：${resizeStatusText}</div>
          <div class="dxm-review-status ${watermarkStatusClass}">去水印：${watermarkStatusText}</div>
          <div class="dxm-review-note">核对主图和营销图；继续后自动生成营销图。</div>
          <div class="dxm-workflow-actions">
            <button type="button" id="dxm-image-stop">停止流程</button>
            <button type="button" id="dxm-image-continue" class="primary">图片已检查，继续</button>
          </div>`;
        document.body.appendChild(panel);

        panel.querySelector('#dxm-review-jump').onclick = () => {
            const latest = window.dxmGetProductImageContext();
            latest.section?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        };
        panel.querySelector('#dxm-image-stop').onclick = async () => {
            const data = await window.dxmStorageGet(['dxmPublishState']);
            await window.dxmStorageSet({ dxmPublishState: { ...data.dxmPublishState, running: false } });
            panel.remove();
            resolve(false);
        };
        panel.querySelector('#dxm-image-continue').onclick = () => {
            panel.remove();
            resolve(true);
        };
    });
};

window.dxmFindScopedSection = function(label) {
    const labelNode = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, span, div, th'))
        .find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const text = window.dxmNormalizeText(el.textContent).replace(/[：:]+$/, '');
            return text === window.dxmNormalizeText(label).replace(/[：:]+$/, '');
        });
    if (!labelNode) return null;
    return labelNode.closest(
        '.el-form-item, .ant-form-item, section, fieldset, tr, [class*="marketing"], [class*="image"]'
    ) || labelNode.parentElement?.parentElement || null;
};

window.dxmFindWirelessDescriptionContext = function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const exactWirelessLabel = el => {
        const text = window.dxmNormalizeText(el.textContent).replace(/[：:]+$/, '');
        return text === '无线端描述';
    };
    const labels = Array.from(document.querySelectorAll('label, span, div, th'))
        .filter(el => isVisible(el) && exactWirelessLabel(el));
    const contexts = [];

    labels.forEach(labelNode => {
        let current = labelNode;
        for (let depth = 0; current && current !== document.body && depth < 9; depth += 1, current = current.parentElement) {
            const text = window.dxmNormalizeText(current.textContent);
            const rect = current.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            let score = 0;
            if (text.includes('不填写无线端描述')) score += 45;
            if (text.includes('使用老版编辑器') || text.includes('使用旧版编辑器')) score += 45;
            if (text.includes('使用新版编辑器')) score += 45;
            if (current.querySelector('input[type="radio"]')) score += 25;
            if (current.querySelector('img')) score += 10;
            if (score >= 70) {
                contexts.push({
                    label: labelNode,
                    wrapper: current,
                    rect,
                    score,
                    area: rect.width * rect.height
                });
            }
        }
    });

    const best = contexts.sort((a, b) => b.score - a.score || a.area - b.area)[0];
    if (best) return best;
    const fallback = window.dxmFindScopedSection('无线端描述');
    return fallback ? { label: fallback, wrapper: fallback, rect: fallback.getBoundingClientRect(), score: 1 } : null;
};

window.dxmFocusWirelessDescription = async function() {
    const context = window.dxmFindWirelessDescriptionContext();
    const target = context?.wrapper || context?.label || window.dxmFindVisibleByText('无线端描述') || document.body;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList?.add('dxm-step-focus');
    setTimeout(() => target.classList?.remove('dxm-step-focus'), 1200);
    await new Promise(resolve => setTimeout(resolve, 350));
    return target;
};

window.dxmPlainDomClick = async function(element) {
    if (!element) return false;
    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 120));
    const rect = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView;
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
        element.dispatchEvent(new view.MouseEvent(type, {
            bubbles: type !== 'mouseenter',
            cancelable: true,
            view,
            clientX,
            clientY,
            button: 0
        }));
    });
    element.click?.();
    await new Promise(resolve => setTimeout(resolve, 250));
    return true;
};

window.dxmFindWirelessEditorHeaderSaveButton = function() {
    const controls = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'))
        .filter(el => window.dxmIsVisibleElement?.(el))
        .filter(el => window.dxmNormalizeText(el.textContent) === '保存');
    const candidates = controls.map(el => {
        const clickable = el.closest?.('button, a, [role="button"]') || el;
        if (!window.dxmIsVisibleElement?.(clickable)) return null;
        if (clickable.closest?.('#dxm-auto-publish-panel, #dxm-workflow-overlay')) return null;
        const rect = clickable.getBoundingClientRect();
        const text = window.dxmNormalizeText(clickable.textContent || el.textContent);
        if (text !== '保存') return null;
        let contextScore = 0;
        for (let current = clickable.parentElement, depth = 0;
            current && current !== document.body && depth < 8;
            current = current.parentElement, depth += 1) {
            const marker = window.dxmNormalizeText(current.textContent || '');
            if (marker.includes('根据PC端描述一键生成') || (marker.includes('根据') && marker.includes('PC') && marker.includes('一键生成'))) contextScore += 65;
            if (marker.includes('批量操作')) contextScore += 25;
            if (marker.includes('关闭')) contextScore += 40;
            if (marker.includes('新版编辑器')) contextScore += 15;
            const parentRect = current.getBoundingClientRect?.();
            if (parentRect && parentRect.top >= 80 && parentRect.top <= 280 && parentRect.right > window.innerWidth * 0.65) contextScore += 10;
        }
        const topScore = rect.top >= 80 && rect.top <= 285 ? 90 : 0;
        const rightScore = rect.left > window.innerWidth * 0.76 ? 90 : (rect.left > window.innerWidth * 0.62 ? 45 : 0);
        const sizeScore = rect.width >= 38 && rect.width <= 110 && rect.height >= 26 && rect.height <= 58 ? 30 : 0;
        const style = getComputedStyle(clickable);
        const orangeScore = /rgb\(\s*(?:230|240|245|250|255)\s*,\s*(?:80|90|100|110|120|130)\s*,\s*(?:40|50|60|70|80)/i.test(style.backgroundColor) ? 25 : 0;
        return {
            clickable,
            rect,
            score: contextScore + topScore + rightScore + sizeScore + orangeScore
        };
    }).filter(Boolean)
        .filter(item => item.score >= 135)
        .sort((a, b) => b.score - a.score || b.rect.left - a.rect.left);
    return candidates[0]?.clickable || null;
};

window.dxmFindNewMobileEditorTopControl = function(kind) {
    if (kind === 'save') {
        const headerSave = window.dxmFindWirelessEditorHeaderSaveButton?.();
        if (headerSave) return headerSave;
    }
    const controls = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'))
        .filter(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    const match = el => {
        const text = window.dxmNormalizeText(el.textContent);
        if (kind === 'generate') {
            const lower = text.toLowerCase();
            return lower.includes('根据') && lower.includes('pc') &&
                lower.includes('描述') && lower.includes('一键生成');
        }
        if (kind === 'save') return text === '保存';
        return false;
    };
    const candidates = controls
        .filter(match)
        .map(el => {
            const clickable = el.closest('button, a, [role="button"]') || el;
            const rect = clickable.getBoundingClientRect();
            const text = window.dxmNormalizeText(clickable.textContent || el.textContent);
            const topHeaderScore = rect.top >= 80 && rect.top <= 240 ? 80 : 0;
            const rightScore = rect.left > window.innerWidth * 0.55 ? 40 : 0;
            const buttonScore = /BUTTON|A/.test(clickable.tagName) || clickable.getAttribute('role') === 'button' ? 20 : 0;
            const exactSaveScore = kind === 'save' && text === '保存' ? 40 : 0;
            const areaPenalty = Math.min(40, (rect.width * rect.height) / 9000);
            return { clickable, rect, score: topHeaderScore + rightScore + buttonScore + exactSaveScore - areaPenalty };
        })
        .filter(item => item.rect.width > 20 && item.rect.height > 20)
        .sort((a, b) => b.score - a.score);
    return candidates[0]?.clickable || null;
};

window.dxmFindControl = function(label, scope = document) {
    const expected = window.dxmNormalizeText(label);
    return Array.from(scope.querySelectorAll(
        'button, a, li, label, [role="button"], span, i, [title], [aria-label]'
    )).find(el => {
        if (!el.offsetWidth || !el.offsetHeight) return false;
        const marker = window.dxmNormalizeText(
            `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''}`
        );
        return marker === expected || marker.includes(expected);
    }) || null;
};

window.dxmFindExactControl = function(label, scope = document) {
    const expected = window.dxmNormalizeText(label);
    return Array.from(scope.querySelectorAll(
        'button, a, li, label, [role="button"], span, i, [title], [aria-label]'
    )).find(el => {
        if (!el.offsetWidth || !el.offsetHeight) return false;
        const text = window.dxmNormalizeText(el.textContent);
        const title = window.dxmNormalizeText(el.getAttribute('title'));
        const aria = window.dxmNormalizeText(el.getAttribute('aria-label'));
        return text === expected || title === expected || aria === expected;
    }) || null;
};

window.dxmFindVisibleExactText = function(label, scope = document) {
    const expected = window.dxmNormalizeText(label);
    const textMatches = Array.from(scope.querySelectorAll(
        'button, a, li, label, [role="button"], [role="menuitem"], span, i, div, p, td, [title], [aria-label]'
    )).filter(el => {
        const text = window.dxmNormalizeText(el.textContent);
        const title = window.dxmNormalizeText(el.getAttribute('title'));
        const aria = window.dxmNormalizeText(el.getAttribute('aria-label'));
        return text === expected || title === expected || aria === expected;
    });

    // 菜单文字层自身可能没有尺寸；向上找到首个真实可见、可接收鼠标事件的容器。
    const visibleTargets = textMatches.map(source => {
        let current = source;
        for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
            const rect = current.getBoundingClientRect();
            const style = current.ownerDocument.defaultView.getComputedStyle(current);
            if (rect.width > 0 && rect.height > 0 &&
                style.display !== 'none' && style.visibility !== 'hidden') {
                return current;
            }
        }
        return null;
    }).filter(Boolean);

    return Array.from(new Set(visibleTargets)).sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.width * rectA.height - rectB.width * rectB.height;
    })[0] || null;
};

window.dxmDispatchPointerMouseEvents = function(target, clientX, clientY, eventTypes = null) {
    if (!target) return;
    const doc = target.ownerDocument || document;
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
        const EventCtor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
        target.dispatchEvent(new EventCtor(type, {
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

window.dxmMouseMoveAndClick = async function(target, fromElement = null) {
    if (!target) return false;
    const doc = target.ownerDocument;
    const targetRect = target.getBoundingClientRect();
    const fromRect = fromElement?.getBoundingClientRect?.() || targetRect;
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    for (let step = 1; step <= 6; step += 1) {
        const clientX = startX + (endX - startX) * step / 6;
        const clientY = startY + (endY - startY) * step / 6;
        const hoverTarget = doc.elementFromPoint(clientX, clientY) || target;
        window.dxmDispatchPointerMouseEvents(hoverTarget, clientX, clientY, [
            step === 1 ? 'pointerover' : 'pointermove',
            step === 1 ? 'mouseover' : 'mousemove'
        ]);
        await new Promise(resolve => setTimeout(resolve, 70));
    }

    window.dxmDispatchPointerMouseEvents(target, endX, endY, [
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
    // UEditor 部分菜单监听元素自身的原生 click，而不响应手工派发的 click 事件。
    if (typeof target.click === 'function') {
        target.click();
    }
    return true;
};

window.dxmTrustedMouseClick = async function(targetRect, fromRect) {
    const targetX = Number.isFinite(targetRect.left) && Number.isFinite(targetRect.width)
        ? targetRect.left + targetRect.width / 2
        : Number(targetRect.x);
    const targetY = Number.isFinite(targetRect.top) && Number.isFinite(targetRect.height)
        ? targetRect.top + targetRect.height / 2
        : Number(targetRect.y);
    const startRect = fromRect || targetRect;
    const startX = Number.isFinite(startRect.left) && Number.isFinite(startRect.width)
        ? startRect.left + startRect.width / 2
        : Number(startRect.x);
    const startY = Number.isFinite(startRect.top) && Number.isFinite(startRect.height)
        ? startRect.top + startRect.height / 2
        : Number(startRect.y);
    const request = {
        action: 'trusted_mouse_click',
        startX,
        startY,
        x: targetX,
        y: targetY
    };
    return new Promise(resolve => {
        chrome.runtime.sendMessage(request, response => {
            if (chrome.runtime.lastError || !response?.success) {
                console.warn(
                    '[trusted_mouse_click]',
                    chrome.runtime.lastError?.message || response?.msg || '点击失败'
                );
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
};

window.dxmTrustedMouseMove = async function(targetRect, fromRect, holdMs = 650) {
    const targetX = Number.isFinite(targetRect.left) && Number.isFinite(targetRect.width)
        ? targetRect.left + targetRect.width / 2
        : Number(targetRect.x);
    const targetY = Number.isFinite(targetRect.top) && Number.isFinite(targetRect.height)
        ? targetRect.top + targetRect.height / 2
        : Number(targetRect.y);
    const startRect = fromRect || targetRect;
    const startX = Number.isFinite(startRect.left) && Number.isFinite(startRect.width)
        ? startRect.left + startRect.width / 2
        : Number(startRect.x);
    const startY = Number.isFinite(startRect.top) && Number.isFinite(startRect.height)
        ? startRect.top + startRect.height / 2
        : Number(startRect.y);
    const request = {
        action: 'trusted_mouse_move',
        startX,
        startY,
        x: targetX,
        y: targetY,
        holdMs
    };
    return new Promise(resolve => {
        chrome.runtime.sendMessage(request, response => {
            if (chrome.runtime.lastError || !response?.success) {
                console.warn(
                    '[trusted_mouse_move]',
                    chrome.runtime.lastError?.message || response?.msg || '鼠标移动失败'
                );
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
};

window.dxmSafeElementClick = async function(element, fromElement = null) {
    if (!element) return false;
    const from = fromElement || element;
    element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    await new Promise(resolve => setTimeout(resolve, 60));

    if (typeof window.dxmMouseMoveAndClick === 'function') {
        await window.dxmMouseMoveAndClick(element, from);
    await new Promise(resolve => setTimeout(resolve, 120));
        return true;
    }

    if (typeof element.click === 'function') {
        element.click();
        await new Promise(resolve => setTimeout(resolve, 120));
        return true;
    }

    const targetRect = element.getBoundingClientRect();
    const fromRect = from.getBoundingClientRect?.() || targetRect;
    if (targetRect.width > 0 && targetRect.height > 0 &&
        typeof window.dxmTrustedMouseClick === 'function') {
        const trusted = await window.dxmTrustedMouseClick(targetRect, fromRect);
        if (trusted) {
            await new Promise(resolve => setTimeout(resolve, 180));
            return true;
        }
    }
    return false;
};

window.dxmTrustedImageMenuSequence = async function(buttonRect, fromRect) {
    // 截图中的菜单结构固定为：
    // 标题、本地上传、空间图片、网络图片、图片银行、引用产品图片。
    // 最后一项中心位于按钮下沿约 160px，横向位于菜单左侧约 65px。
    const request = {
        action: 'trusted_image_menu_sequence',
        startX: fromRect.left + fromRect.width / 2,
        startY: fromRect.top + fromRect.height / 2,
        buttonX: buttonRect.right - Math.min(10, buttonRect.width * 0.12),
        buttonY: buttonRect.top + buttonRect.height / 2,
        itemX: buttonRect.left + Math.min(68, Math.max(52, buttonRect.width * 0.72)),
        itemY: buttonRect.bottom + 160
    };
    return new Promise(resolve => {
        chrome.runtime.sendMessage(request, response => {
            if (chrome.runtime.lastError || !response?.success) {
                console.warn(
                    '[trusted_image_menu_sequence]',
                    chrome.runtime.lastError?.message || response?.msg || '鼠标动作链失败'
                );
                resolve(false);
                return;
            }
            resolve(true);
        });
    });
};

window.dxmClickDropdownItemAtText = async function(label, anchor) {
    if (!anchor) return false;
    const anchorRect = anchor.getBoundingClientRect();
    const documents = Array.from(new Set([anchor.ownerDocument, document].filter(Boolean)));
    const candidates = [];
    const normalizedLabel = window.dxmNormalizeText(label);

    documents.forEach(doc => {
        Array.from(doc.querySelectorAll(
            'div, span, td, tr, li, a, label, p, em, [role="menuitem"], [role="button"], [class*="menu"]'
        )).forEach(el => {
            const text = window.dxmNormalizeText(el.textContent);
            if (text !== normalizedLabel && !text.includes(normalizedLabel)) return;
            const rect = el.getBoundingClientRect();
            const style = doc.defaultView.getComputedStyle(el);
            if (rect.width <= 0 || rect.height <= 0 ||
                style.display === 'none' || style.visibility === 'hidden') return;
            // UEditor 的菜单经常直接挂到 body，且按钮靠右时菜单会向左展开；
            // 因此只用垂直范围和可见性约束，横向用打分排序，不硬过滤。
            if (rect.top < anchorRect.top - 20 || rect.top > anchorRect.bottom + 360) return;
            if (rect.left < -20 || rect.top < -20 ||
                rect.left > window.innerWidth + 20 || rect.top > window.innerHeight + 20) return;
            const clickable = el.closest('li, a, [role="menuitem"], [role="button"], .edui-menuitem, .edui-box, div') || el;
            const clickRect = clickable.getBoundingClientRect();
            candidates.push({ el: clickable, rect: clickRect.width && clickRect.height ? clickRect : rect, doc });
        });
    });

    const match = candidates.sort((a, b) => {
        const centerA = a.rect.left + a.rect.width / 2;
        const centerB = b.rect.left + b.rect.width / 2;
        const anchorCenter = anchorRect.left + anchorRect.width / 2;
        const scoreA = Math.abs(a.rect.top - anchorRect.bottom) + Math.abs(centerA - anchorCenter) * 0.2;
        const scoreB = Math.abs(b.rect.top - anchorRect.bottom) + Math.abs(centerB - anchorCenter) * 0.2;
        return scoreA - scoreB ||
            (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
    })[0];
    if (!match) return false;

    const centerX = match.rect.left + match.rect.width / 2;
    const centerY = match.rect.top + match.rect.height / 2;
    // 首选网页原生点击，菜单未消失时再回退 Chrome 调试接口。
    const hit = match.doc.elementFromPoint(centerX, centerY) || match.el;
    await window.dxmMouseMoveAndClick(hit, anchor);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (!window.dxmFindVisibleExactText(label, match.doc)) return true;

    const trusted = await window.dxmTrustedMouseClick(match.rect, anchorRect);
    if (trusted) {
        await new Promise(resolve => setTimeout(resolve, 220));
        if (!window.dxmFindVisibleExactText(label, match.doc)) return true;
    }
    return false;
};

window.dxmClickLastImageMenuRow = async function(anchor) {
    if (!anchor) return false;
    const doc = anchor.ownerDocument;
    const anchorRect = anchor.getBoundingClientRect();
    const sampleX = anchorRect.left + Math.min(Math.max(anchorRect.width * 0.55, 42), 75);
    const rows = [];

    // 从按钮下沿开始逐像素带扫描。菜单实际共有标题和五个选项，
    // 最后一条可点击窄行就是“引用产品图片”。
    for (let y = anchorRect.bottom + 8; y <= anchorRect.bottom + 230; y += 5) {
        const stack = typeof doc.elementsFromPoint === 'function'
            ? doc.elementsFromPoint(sampleX, y)
            : [doc.elementFromPoint(sampleX, y)];
        for (const hit of stack) {
            let current = hit;
            for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
                if (current === doc.body || current === doc.documentElement) break;
                const rect = current.getBoundingClientRect();
                const style = doc.defaultView.getComputedStyle(current);
                const nearMenu = rect.left <= sampleX && rect.right >= sampleX &&
                    rect.top >= anchorRect.bottom - 4 &&
                    rect.top <= anchorRect.bottom + 220;
                const rowShape = rect.height >= 18 && rect.height <= 42 &&
                    rect.width >= 65 && rect.width <= 260;
                if (nearMenu && rowShape &&
                    style.display !== 'none' && style.visibility !== 'hidden') {
                    if (!rows.some(row =>
                        Math.abs(row.rect.top - rect.top) < 3 &&
                        Math.abs(row.rect.bottom - rect.bottom) < 3)) {
                        rows.push({ element: current, rect });
                    }
                    break;
                }
            }
        }
    }

    const sortedRows = rows.sort((a, b) => a.rect.top - b.rect.top);
    if (sortedRows.length < 4) return false;

    // 排除可能的菜单标题，取最下面一行；截图中该行就是“引用产品图片”。
    const targetRow = sortedRows[sortedRows.length - 1];
    await window.dxmMouseMoveAndClick(targetRow.element, anchor);
    await new Promise(resolve => setTimeout(resolve, 160));
    let trusted = false;

    // 菜单消失，或页面出现新的较大浮层，都表示命令已触发。
    let afterHit = doc.elementFromPoint(
        targetRow.rect.left + targetRow.rect.width / 2,
        targetRow.rect.top + targetRow.rect.height / 2
    );
    let afterRect = afterHit?.getBoundingClientRect?.();
    if (!afterRect ||
        Math.abs(afterRect.top - targetRow.rect.top) > 5 ||
        afterRect.height > 60) {
        return true;
    }

    trusted = await window.dxmTrustedMouseClick(targetRow.rect, anchorRect);
    if (trusted) await new Promise(resolve => setTimeout(resolve, 220));
    afterHit = doc.elementFromPoint(
        targetRow.rect.left + targetRow.rect.width / 2,
        targetRow.rect.top + targetRow.rect.height / 2
    );
    afterRect = afterHit?.getBoundingClientRect?.();
    return !afterRect ||
        Math.abs(afterRect.top - targetRow.rect.top) > 5 ||
        afterRect.height > 60;
};

window.dxmGetPcEditorContext = function() {
    const pcLabel = Array.from(document.querySelectorAll('label, div, span, th'))
        .find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const text = window.dxmNormalizeText(el.textContent).replace(/^[*：:]+/, '');
            return text === 'PC端描述' || text.startsWith('PC端描述');
        }) || null;

    const hasEditorFingerprint = node => {
        if (!node.offsetWidth || !node.offsetHeight) return false;
        return !!window.dxmFindExactControl('选择图片', node) &&
            !!(node.querySelector('iframe') || node.querySelector('[contenteditable="true"]'));
    };

    const candidates = [];

    // 先从“PC端描述”标签所在区域查找，防止误选“产品信息”中的图片控件。
    if (pcLabel) {
        let root = pcLabel.parentElement;
        for (let depth = 0; root && depth < 7; depth++, root = root.parentElement) {
            const matchingDescendants = [root, ...Array.from(root.querySelectorAll(
                '.cke, .edui-editor, div, section, fieldset, td, [class*="editor"]'
            ))].filter(hasEditorFingerprint);
            candidates.push(...matchingDescendants);
            if (matchingDescendants.length) break;
        }
    }

    // 兼容标签和编辑器不在同一常规表单容器中的页面结构。
    if (!candidates.length) {
        candidates.push(...Array.from(document.querySelectorAll(
            '.cke, .edui-editor, [class*="wysiwyg"], [class*="rich-editor"], [class*="richText"], [class*="editor"]'
        )).filter(hasEditorFingerprint));
    }

    const unique = Array.from(new Set(candidates));
    const wrapper = unique.sort((a, b) => {
        if (pcLabel) {
            const labelRect = pcLabel.getBoundingClientRect();
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            const distanceA = Math.abs(rectA.top - labelRect.bottom);
            const distanceB = Math.abs(rectB.top - labelRect.bottom);
            if (Math.abs(distanceA - distanceB) > 40) return distanceA - distanceB;
        }
        const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
        const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
        return areaA - areaB;
    })[0] || null;
    if (!wrapper) return null;

    const iframe = wrapper.querySelector('iframe');
    let editor = null;
    if (iframe) {
        try { editor = iframe.contentDocument?.body || null; } catch (_) {}
    }
    if (!editor) {
        editor = wrapper.querySelector('[contenteditable="true"], textarea');
    }

    return {
        pcLabel,
        wrapper,
        iframe,
        editor,
        fullscreen: window.dxmFindExactControl('全屏', wrapper),
        minimize: window.dxmFindExactControl('最小化', wrapper) ||
            window.dxmFindExactControl('退出全屏', wrapper),
        selectImage: window.dxmFindExactControl('选择图片', wrapper)
    };
};

window.dxmFindPcFullscreenControl = function(context) {
    const wrapperRect = context?.wrapper?.getBoundingClientRect?.();
    const candidates = Array.from(document.querySelectorAll(
        'button, a, [role="button"], span, i, [title], [aria-label]'
    )).map(source => {
        const marker = window.dxmNormalizeText(
            `${source.textContent || ''} ${source.getAttribute('title') || ''} ${source.getAttribute('aria-label') || ''}`
        );
        if (!marker.includes('全屏') || marker.includes('退出全屏') || marker.includes('最小化')) return null;
        const control = source.closest('button, a, [role="button"]') || source;
        const rect = control.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        const style = control.ownerDocument?.defaultView?.getComputedStyle(control) || getComputedStyle(control);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0.01) return null;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const nearPcEditor = !!wrapperRect &&
            centerX >= wrapperRect.left - 40 && centerX <= wrapperRect.right + 40 &&
            centerY >= wrapperRect.top - 80 && centerY <= wrapperRect.bottom + 40;
        const distance = wrapperRect
            ? Math.abs(centerX - wrapperRect.right) + Math.abs(centerY - wrapperRect.top)
            : rect.top + Math.abs(window.innerWidth - rect.right);
        return { control, score: (nearPcEditor ? 100000 : 0) - distance };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    return candidates[0]?.control || null;
};

window.dxmIsPcEditorFullscreen = function(context) {
    if (!context?.wrapper) return false;
    const wrapper = context.wrapper;
    const rect = wrapper.getBoundingClientRect();
    const style = getComputedStyle(wrapper);
    const classText = String(wrapper.className || '').toLowerCase();
    const hasExitControl = !!(
        window.dxmFindExactControl('最小化', wrapper) ||
        window.dxmFindExactControl('退出全屏', wrapper)
    );
    return hasExitControl ||
        classText.includes('fullscreen') ||
        classText.includes('full-screen') ||
        ((style.position === 'fixed' || style.position === 'absolute') &&
            rect.width >= window.innerWidth * 0.75 &&
            rect.height >= window.innerHeight * 0.65) ||
        (rect.width >= window.innerWidth * 0.88 && rect.height >= window.innerHeight * 0.75);
};

window.dxmRemoveExistingDescriptionTemplates = function(editor) {
    const doc = editor?.ownerDocument;
    if (!doc) return 0;

    let removed = 0;
    editor.querySelectorAll('[data-dxm-description-template="1"]').forEach(node => {
        node.remove();
        removed += 1;
    });

    // 旧版本插件没有 data 标记，因此按模板的首句和邮箱结尾删除完整区间。
    // 这里同时清理英文模板和被店小秘/翻译插件转成中文后的模板，避免 PC/无线端出现两段说明。
    // 使用 DOM Range 可处理模板被拆成多个 p/div/span，或整段直接位于编辑器根节点的情况。
    for (let pass = 0; pass < 10; pass += 1) {
        const walker = doc.createTreeWalker(
            editor,
            doc.defaultView.NodeFilter.SHOW_TEXT
        );
        const entries = [];
        let fullText = '';
        let textNode;
        while ((textNode = walker.nextNode())) {
            const start = fullText.length;
            fullText += textNode.nodeValue || '';
            entries.push({ node: textNode, start, end: fullText.length });
        }

        const lower = fullText.toLowerCase();
        const compactLower = lower.replace(/\s+/g, '');
        const markers = [
            'dear friend',
            'sincerely welcome to our store',
            'the price displayed on the page is only a partial deposit',
            '亲爱的朋友',
            '诚挚欢迎光临本店',
            '页面上显示的价格仅为部分定金',
            '由于产品通过海运发货'
        ];
        const starts = markers
            .map(marker => {
                const markerLower = marker.toLowerCase();
                const direct = lower.indexOf(markerLower);
                if (direct >= 0) return direct;
                const compact = compactLower.indexOf(markerLower.replace(/\s+/g, ''));
                if (compact < 0) return -1;
                let nonSpaceSeen = 0;
                for (let i = 0; i < fullText.length; i += 1) {
                    if (!/\s/.test(fullText[i])) {
                        if (nonSpaceSeen === compact) return i;
                        nonSpaceSeen += 1;
                    }
                }
                return -1;
            })
            .filter(index => index >= 0);
        if (!starts.length) break;

        const startIndex = Math.min(...starts);
        let emailIndex = lower.indexOf('kevinpaper@163.com', startIndex);
        if (emailIndex < 0) emailIndex = lower.indexOf('18679661688', startIndex);
        if (emailIndex < 0) emailIndex = lower.indexOf('whatsapp', startIndex);
        if (emailIndex < 0) break;
        const emailEndIndex = lower.indexOf('kevinpaper@163.com', emailIndex);
        const phoneEndIndex = lower.indexOf('18679661688', emailIndex);
        const endCandidates = [
            emailEndIndex >= 0 ? emailEndIndex + 'kevinpaper@163.com'.length : -1,
            phoneEndIndex >= 0 ? phoneEndIndex + '18679661688'.length : -1
        ].filter(index => index >= 0);
        const endIndex = endCandidates.length ? Math.max(...endCandidates) : emailIndex + 8;

        const startEntry = entries.find(entry =>
            startIndex >= entry.start && startIndex < entry.end
        );
        const endEntry = entries.find(entry =>
            endIndex > entry.start && endIndex <= entry.end
        );
        if (!startEntry || !endEntry) break;

        const range = doc.createRange();
        range.setStart(startEntry.node, startIndex - startEntry.start);
        range.setEnd(endEntry.node, endIndex - endEntry.start);
        range.deleteContents();
        removed += 1;
    }

    const isStandaloneContactLine = text => {
        const compact = window.dxmNormalizeText(text).toLowerCase();
        if (!compact) return false;
        const hasContact = compact.includes('kevinpaper@163.com') ||
            compact.includes('18679661688') ||
            compact.includes('whatsapp');
        if (!hasContact) return false;
        const hasTemplateBody = compact.includes('dearfriend') ||
            compact.includes('sincerelywelcometoourstore') ||
            compact.includes('thepricedisplayedonthepage') ||
            compact.includes('亲爱的朋友') ||
            compact.includes('页面上显示的价格仅为部分定金') ||
            compact.includes('由于产品通过海运发货');
        return !hasTemplateBody && compact.length <= 90;
    };

    // 旧模板被分段删除后，有时会只残留一行 “E-mail: kevinpaper@163.com”。
    // 这类孤立联系方式不属于商品原描述，插入新模板前一并删除。
    Array.from(editor.querySelectorAll('p, div, span, strong, b')).reverse().forEach(node => {
        if (node.closest?.('[data-dxm-description-template="1"]')) return;
        if (!isStandaloneContactLine(node.textContent || '')) return;
        if (node.querySelector('img, video, iframe, table')) return;
        node.remove();
        removed += 1;
    });

    const contactWalker = doc.createTreeWalker(
        editor,
        doc.defaultView.NodeFilter.SHOW_TEXT
    );
    const orphanTextNodes = [];
    let contactTextNode;
    while ((contactTextNode = contactWalker.nextNode())) {
        if (contactTextNode.parentElement?.closest?.('[data-dxm-description-template="1"]')) continue;
        if (isStandaloneContactLine(contactTextNode.nodeValue || '')) orphanTextNodes.push(contactTextNode);
    }
    orphanTextNodes.forEach(node => {
        node.parentNode?.removeChild(node);
        removed += 1;
    });

    // 清理删除区间后遗留的空格式块，不触碰包含图片等内容的节点。
    Array.from(editor.querySelectorAll('p, div, span, strong, b')).reverse().forEach(node => {
        if (!node.textContent.trim() && !node.querySelector('img, video, iframe, table, br')) {
            node.remove();
        }
    });
    return removed;
};

window.dxmCreateDescriptionTemplateBlock = function(doc, template, imageUrl = '') {
    const block = doc.createElement('div');
    block.setAttribute('data-dxm-description-template', '1');
    block.setAttribute('translate', 'no');
    block.classList.add('notranslate');
    block.style.fontSize = '18px';
    block.style.fontWeight = 'bold';
    block.style.textAlign = 'center';
    block.style.whiteSpace = 'pre-wrap';
    const textNode = doc.createElement('div');
    textNode.textContent = template;
    block.appendChild(textNode);
    if (imageUrl && /^(https?:\/\/|data:image\/)/i.test(String(imageUrl))) {
        const imageWrap = doc.createElement('div');
        imageWrap.setAttribute('data-dxm-description-template-image', '1');
        imageWrap.style.marginTop = '16px';
        imageWrap.style.textAlign = 'center';
        const img = doc.createElement('img');
        img.src = imageUrl;
        img.alt = 'description template image';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'inline-block';
        imageWrap.appendChild(img);
        block.appendChild(imageWrap);
    }
    return block;
};

window.dxmPlaceCaretAfterDescriptionTemplate = function(editor, templateBlock) {
    const doc = editor?.ownerDocument;
    const win = doc?.defaultView;
    if (!editor || !doc || !win || !templateBlock?.isConnected) return null;

    editor.querySelectorAll('[data-dxm-image-insert-anchor="1"]').forEach(node => node.remove());

    const anchor = doc.createElement('div');
    anchor.setAttribute('data-dxm-image-insert-anchor', '1');
    anchor.setAttribute('translate', 'no');
    anchor.className = 'notranslate';
    anchor.style.minHeight = '18px';
    anchor.style.textAlign = 'center';
    anchor.innerHTML = '<br>';
    templateBlock.insertAdjacentElement('afterend', anchor);

    try {
        editor.focus?.();
        const selection = win.getSelection?.();
        if (selection) {
            const range = doc.createRange();
            range.selectNodeContents(anchor);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    } catch (error) {
        console.warn('[待发布自动化] 设置 PC 描述插图光标失败：', error.message);
    }

    return anchor;
};

window.dxmFindMobileGeneratedDescriptionRoot = function() {
    const hasTemplateMarker = text => {
        const normalized = window.dxmNormalizeText(text).toLowerCase();
        return normalized.includes('kevinpaper@163.com') ||
            normalized.includes('18679661688') ||
            normalized.includes('dearfriend') ||
            normalized.includes('亲爱的朋友') ||
            normalized.includes('页面上显示的价格仅为部分定金') ||
            normalized.includes('由于产品通过海运发货');
    };
    const candidates = Array.from(document.querySelectorAll(
        '[contenteditable="true"], textarea, div, section, article'
    )).filter(node => {
        if (node.closest?.('#dxm-workflow-overlay, #dxm-manual-wireless-panel, #dxm-manual-wireless-new-editor-panel')) return false;
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width < 220 || rect.height < 35) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (!hasTemplateMarker(node.value || node.textContent || '')) return false;
        return true;
    }).map(node => {
        const rect = node.getBoundingClientRect();
        const textLength = String(node.value || node.textContent || '').length;
        const isEditable = node.matches?.('[contenteditable="true"], textarea') ? 0 : 1;
        return { node, rect, textLength, area: rect.width * rect.height, isEditable };
    });

    return candidates
        .filter(item => item.textLength > 20)
        .sort((a, b) =>
            a.isEditable - b.isEditable ||
            a.area - b.area ||
            a.textLength - b.textLength
        )[0]?.node || null;
};

window.dxmFindWirelessNewEditorContentRoot = function() {
    if (!window.dxmIsInWirelessNewEditorFullscreen?.()) return null;
    const excludedText = /添加模块|使用中模块|查看帮助|根据PC端描述一键生成|批量操作|保存|关闭|新版编辑器/;
    const candidates = Array.from(document.querySelectorAll(
        '[contenteditable="true"], textarea, section, article, div'
    )).filter(node => {
        if (node.closest?.('#dxm-workflow-overlay, #dxm-manual-wireless-panel, #dxm-manual-wireless-new-editor-panel, #dxm-manual-wireless-consistency-panel')) {
            return false;
        }
        if (node.matches?.('button, a, [role="button"]')) return false;
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width < 240 || rect.height < 80) return false;
        if (rect.width > window.innerWidth * 0.82 || rect.height > window.innerHeight * 0.92) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const text = String(node.value || node.innerText || node.textContent || '').trim();
        const imageCount = node.querySelectorAll?.('img')?.length || 0;
        if (text.length < 20 && imageCount <= 0) return false;
        if (excludedText.test(text) && text.length < 260 && imageCount <= 0) return false;
        return true;
    }).map(node => {
        const rect = node.getBoundingClientRect();
        const text = String(node.value || node.innerText || node.textContent || '').trim();
        const imageCount = node.querySelectorAll?.('img')?.length || 0;
        const editableScore = node.matches?.('[contenteditable="true"], textarea') ? 180 : 0;
        const centerColumnScore = rect.left > window.innerWidth * 0.18 && rect.left < window.innerWidth * 0.72 ? 80 : 0;
        const topScore = rect.top > 70 ? 30 : 0;
        const areaPenalty = Math.min(160, (rect.width * rect.height) / 9000);
        return {
            node,
            score: editableScore + centerColumnScore + topScore + Math.min(text.length, 1200) + imageCount * 120 - areaPenalty,
            area: rect.width * rect.height,
            textLength: text.length
        };
    });

    return candidates
        .sort((a, b) => b.score - a.score || a.area - b.area || b.textLength - a.textLength)[0]?.node || null;
};

window.dxmFindWirelessPreviewContentRoot = function() {
    const context = window.dxmFindWirelessDescriptionContext?.();
    const wrapper = context?.wrapper || window.dxmFindScopedSection('无线端描述');
    if (!wrapper) return null;
    const candidates = Array.from(wrapper.querySelectorAll(
        '[contenteditable="true"], textarea, section, article, div'
    )).filter(node => {
        if (node.closest?.('#dxm-workflow-overlay, #dxm-manual-wireless-panel, #dxm-manual-wireless-new-editor-panel, #dxm-manual-wireless-consistency-panel')) {
            return false;
        }
        if (node.matches?.('button, a, label, [role="button"]')) return false;
        if (node.querySelector?.('input[type="radio"]')) return false;
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.width < 220 || rect.height < 70) return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const text = String(node.value || node.innerText || node.textContent || '').trim();
        const imageCount = node.querySelectorAll?.('img')?.length || 0;
        if (text.length < 20 && imageCount <= 0) return false;
        const normalized = window.dxmNormalizeText(text);
        if (/不填写无线端描述|使用老版编辑器|使用旧版编辑器|使用新版编辑器|清空无线端描述/.test(normalized) &&
            text.length < 260 && imageCount <= 0) {
            return false;
        }
        return true;
    }).map(node => {
        const rect = node.getBoundingClientRect();
        const text = String(node.value || node.innerText || node.textContent || '').trim();
        const imageCount = node.querySelectorAll?.('img')?.length || 0;
        return {
            node,
            score: text.length + imageCount * 180 - Math.min(160, (rect.width * rect.height) / 12000),
            textLength: text.length
        };
    });

    return candidates.sort((a, b) => b.score - a.score || b.textLength - a.textLength)[0]?.node || null;
};

window.dxmGetDescriptionSnapshot = function(root) {
    if (!root) return { text: '', compact: '', length: 0, imageCount: 0, keywords: [] };
    const rawText = String(root.value || root.innerText || root.textContent || '');
    const text = rawText.replace(/\s+/g, ' ').trim();
    const compact = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
    const imageCount = root.querySelectorAll?.('img')?.length || 0;
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]+/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 5 && ![
            'dear', 'friend', 'please', 'contact', 'whatsapp', 'email',
            'sincerely', 'welcome', 'store', 'price', 'displayed', 'actual'
        ].includes(word));
    const keywords = Array.from(new Set(words)).slice(0, 30);
    const signature = `${text.length}:${imageCount}:${compact.slice(0, 180)}:${compact.slice(-180)}`;
    return { text, compact, length: text.length, imageCount, keywords, signature };
};

window.dxmSnapshotLooksSameAs = function(currentSnapshot, beforeSnapshot) {
    if (!currentSnapshot || !beforeSnapshot) return false;
    if (currentSnapshot.signature === beforeSnapshot.signature) return true;
    if (currentSnapshot.compact && currentSnapshot.compact === beforeSnapshot.compact) return true;
    const beforeHead = beforeSnapshot.compact?.slice(0, 140);
    const beforeTail = beforeSnapshot.compact?.slice(-140);
    const sameHead = beforeHead && currentSnapshot.compact.startsWith(beforeHead);
    const sameTail = beforeTail && currentSnapshot.compact.endsWith(beforeTail);
    return !!(sameHead && sameTail && Math.abs(currentSnapshot.length - beforeSnapshot.length) < 30);
};

window.dxmSnapshotsLookCloseEnough = function(expectedSnapshot, actualSnapshot) {
    if (!expectedSnapshot || !actualSnapshot) return false;
    if (actualSnapshot.length < 80) return false;
    if (expectedSnapshot.length >= 250 && actualSnapshot.length < expectedSnapshot.length * 0.45) return false;
    const expectedKeywords = expectedSnapshot.keywords || [];
    if (expectedKeywords.length < 6) return true;
    const shared = expectedKeywords.filter(keyword =>
        actualSnapshot.compact.includes(keyword.replace(/[^a-z0-9]+/g, ''))
    );
    return shared.length >= Math.min(5, Math.ceil(expectedKeywords.length * 0.25));
};

window.dxmNormalizeTemplateText = function(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
};

window.dxmGetTemplateFirstParagraph = function(template) {
    const text = String(template || '')
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n/)
        .map(part => part.trim())
        .filter(Boolean)[0] || '';
    return text || String(template || '').split(/\n/).map(line => line.trim()).filter(Boolean)[0] || '';
};

window.dxmTemplateTextMatches = function(template, snapshot) {
    const firstParagraph = window.dxmGetTemplateFirstParagraph(template);
    const templateCompact = window.dxmNormalizeTemplateText(firstParagraph);
    const targetCompact = snapshot?.compact || window.dxmNormalizeTemplateText(snapshot?.text || '');
    if (!templateCompact || !targetCompact) {
        return { ok: false, reason: '缺少描述模板第一段或无线端最终文字' };
    }
    if (targetCompact.includes(templateCompact)) {
        return { ok: true, reason: '无线端描述模板第一段文字一致' };
    }
    return { ok: false, reason: '无线端描述模板第一段文字与 PC 端模板不一致' };
};

window.dxmWaitForWirelessContentStable = async function(options = {}) {
    const {
        timeout = 35000,
        interval = 700,
        stableRounds = 3,
        minLength = 80,
        beforeSnapshot = null,
        requireChanged = false
    } = options;
    const started = Date.now();
    let lastSignature = '';
    let stableCount = 0;
    let lastSnapshot = null;
    const beforeSignature = beforeSnapshot?.signature || '';
    const beforeCompact = beforeSnapshot?.compact || '';

    const changedFromBefore = snapshot => {
        if (!requireChanged) return true;
        if (!beforeSnapshot) return true;
        if (snapshot.signature === beforeSignature) return false;
        if (beforeCompact && snapshot.compact === beforeCompact) return false;
        const beforeHead = beforeCompact.slice(0, 120);
        const beforeTail = beforeCompact.slice(-120);
        const sameHead = beforeHead && snapshot.compact.startsWith(beforeHead);
        const sameTail = beforeTail && snapshot.compact.endsWith(beforeTail);
        return !(sameHead && sameTail && Math.abs(snapshot.length - beforeSnapshot.length) < 20);
    };

    while (Date.now() - started < timeout) {
        const root = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
        if (root) {
            const snapshot = window.dxmGetDescriptionSnapshot(root);
            const signature = snapshot.signature;
            if (snapshot.length >= minLength && changedFromBefore(snapshot)) {
                stableCount = signature === lastSignature ? stableCount + 1 : 1;
                lastSignature = signature;
                lastSnapshot = snapshot;
                if (stableCount >= stableRounds) {
                    return { root, snapshot, stable: true };
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    const root = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
    return {
        root,
        snapshot: root ? window.dxmGetDescriptionSnapshot(root) : lastSnapshot,
        stable: false
    };
};

window.dxmWaitBrieflyForWirelessGenerated = async function(beforeSnapshot = null, timeout = 5000) {
    const started = Date.now();
    let lastSnapshot = null;
    while (Date.now() - started < timeout) {
        const root = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
        if (root) {
            const snapshot = window.dxmGetDescriptionSnapshot(root);
            lastSnapshot = snapshot;
            const changed = !beforeSnapshot || !window.dxmSnapshotLooksSameAs(snapshot, beforeSnapshot);
            if (changed && (snapshot.length >= 80 || snapshot.imageCount > 0)) {
                return { root, snapshot, ready: true };
            }
        }
        await new Promise(resolve => setTimeout(resolve, 350));
    }
    const root = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
    const snapshot = root ? window.dxmGetDescriptionSnapshot(root) : lastSnapshot;
    return { root, snapshot, ready: !!snapshot };
};

window.dxmIsElementClickableNow = function(element) {
    const clickable = element?.closest?.('button, a, [role="button"]') || element;
    if (!clickable || !clickable.isConnected) return false;
    const rect = clickable.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(clickable);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    if (clickable.disabled || clickable.getAttribute?.('aria-disabled') === 'true') return false;
    if (/\b(is-disabled|disabled|ant-btn-disabled)\b/.test(String(clickable.className || ''))) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit) return true;
    if (hit === clickable || clickable.contains(hit)) return true;
    const hitClickable = hit.closest?.('button, a, [role="button"]');
    if (hitClickable === clickable) return true;
    if (hit.closest?.('#dxm-workflow-overlay')) return true;
    const hitStyle = getComputedStyle(hit);
    return hitStyle.pointerEvents === 'none';
};

window.dxmFindElementBlockingRectCenter = function(rect, expectedElement = null) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const expected = expectedElement?.closest?.('button, a, [role="button"]') || expectedElement;
    const stack = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(x, y)
        : [document.elementFromPoint(x, y)].filter(Boolean);
    for (const node of stack) {
        if (!node || node === document.documentElement || node === document.body) continue;
        if (node.closest?.('#dxm-workflow-overlay')) continue;
        if (expected && (node === expected || expected.contains(node) || node.contains?.(expected))) return null;
        const style = getComputedStyle(node);
        if (style.pointerEvents === 'none' || style.display === 'none' || style.visibility === 'hidden') continue;
        const nodeRect = node.getBoundingClientRect?.();
        if (!nodeRect || nodeRect.width <= 0 || nodeRect.height <= 0) continue;
        const classText = String(node.className || '');
        const zIndex = Number(style.zIndex || 0);
        const looksLikeMask = /loading|mask|modal|dialog|overlay|spin|shade|block/i.test(classText) ||
            style.position === 'fixed' ||
            zIndex >= 1000;
        if (looksLikeMask) return node;
    }
    return null;
};

window.dxmFindClickableWirelessSaveButton = function() {
    const saveButton = window.dxmFindNewMobileEditorTopControl('save');
    if (!saveButton) return null;
    const clickable = saveButton.closest?.('button, a, [role="button"]') || saveButton;
    if (!clickable?.isConnected) return null;
    if (clickable.disabled || clickable.getAttribute?.('aria-disabled') === 'true') return null;
    if (/\b(is-disabled|disabled|ant-btn-disabled)\b/.test(String(clickable.className || ''))) return null;
    const rect = clickable.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const style = getComputedStyle(clickable);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    return clickable;
};

window.dxmFindBlockingWirelessLoadingDialog = function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const loadingText = /正在等待无线端描述内容加载完成|正在生成无线端描述|正在生成为无线端描述|正在生成|内容加载完成|请稍候|请稍等|加载中/;
    return Array.from(document.querySelectorAll(
        '.el-loading-mask, .el-message-box, .el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"], [class*="loading"], div'
    )).find(node => {
        if (!isVisible(node)) return false;
        if (node.closest?.('#dxm-workflow-overlay')) return false;
        const classText = String(node.className || '');
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (/el-loading-mask|loading|mask|spin|modal|dialog/i.test(classText) &&
            rect.width > window.innerWidth * 0.12 &&
            rect.height > window.innerHeight * 0.08 &&
            style.pointerEvents !== 'none') {
            return true;
        }
        const text = String(node.textContent || '');
        if (!loadingText.test(text)) return false;
        if (rect.width < 220 || rect.height < 80) return false;
        const zIndex = Number(style.zIndex || 0);
        return style.position === 'fixed' || style.position === 'absolute' || zIndex >= 1000 ||
            rect.width > window.innerWidth * 0.22 || rect.height > window.innerHeight * 0.12;
    }) || null;
};

window.dxmGetWirelessRenderState = function(beforeSnapshot = null) {
    const root = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
    const snapshot = root ? window.dxmGetDescriptionSnapshot(root) : null;
    const changed = snapshot ? (!beforeSnapshot || !window.dxmSnapshotLooksSameAs(snapshot, beforeSnapshot)) : false;
    const rendered = !!snapshot && (snapshot.length >= 80 || snapshot.imageCount > 0);
    return { root, snapshot, changed, rendered };
};

window.dxmWaitForWirelessRenderedOrSaveClickable = async function(beforeSnapshot = null, timeout = 6500) {
    const startedAt = Date.now();
    let lastState = window.dxmGetWirelessRenderState(beforeSnapshot);
    while (Date.now() - startedAt < timeout) {
        const saveButton = window.dxmFindClickableWirelessSaveButton();
        const loadingDialog = window.dxmFindBlockingWirelessLoadingDialog();
        lastState = window.dxmGetWirelessRenderState(beforeSnapshot);
        if (lastState.rendered && saveButton) {
            document.getElementById('dxm-workflow-overlay')?.remove();
            return {
                ...lastState,
                ready: true,
                saveButton,
                reason: loadingDialog ? 'save_clickable_after_render' : 'rendered_and_save_clickable'
            };
        }
        if (saveButton && !loadingDialog) {
            document.getElementById('dxm-workflow-overlay')?.remove();
            return {
                ...lastState,
                ready: true,
                saveButton,
                reason: 'save_clickable_without_blocking_dialog'
            };
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    const saveButton = window.dxmFindClickableWirelessSaveButton();
    if (saveButton) {
        document.getElementById('dxm-workflow-overlay')?.remove();
        return {
            ...lastState,
            ready: true,
            saveButton,
            reason: 'save_clickable_timeout_fast_path'
        };
    }

    return {
        ...lastState,
        ready: false,
        saveButton: null,
        reason: 'wireless_render_or_save_clickable_timeout'
    };
};

window.dxmGetTemplateReadyMarker = function(template = '') {
    const lines = String(template || window.DXM_DEFAULT_DESCRIPTION_TEMPLATE || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    return lines[0] || 'Dear friend';
};

window.dxmNormalizeTemplateTextForCompare = function(value = '') {
    return String(value || '')
        .toLowerCase()
        .replace(/&nbsp;/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
};

window.dxmGetWirelessVisibleTextForTemplateCheck = function(root = null) {
    const parts = [];
    const pushText = value => {
        const text = String(value || '').trim();
        if (text) parts.push(text);
    };
    pushText(root?.innerText || root?.textContent || '');
    pushText(document.body?.innerText || document.body?.textContent || '');
    return parts.join('\n');
};

window.dxmQuickCheckWirelessTemplateBeforeSave = async function(template, timeout = 3500) {
    const marker = window.dxmGetTemplateReadyMarker(template);
    const markerCompact = window.dxmNormalizeTemplateTextForCompare(marker);
    const defaultMarkerCompact = window.dxmNormalizeTemplateTextForCompare('Dear friend');
    const startedAt = Date.now();
    let lastSnapshot = null;
    while (Date.now() - startedAt < timeout) {
        const root = window.dxmFindWirelessNewEditorContentRoot?.() || window.dxmFindMobileGeneratedDescriptionRoot?.();
        const snapshot = root ? window.dxmGetDescriptionSnapshot(root) : null;
        const visibleText = window.dxmGetWirelessVisibleTextForTemplateCheck(root);
        const compactText = window.dxmNormalizeTemplateTextForCompare(`${snapshot?.text || ''}\n${visibleText}`);
        const hasMarker = Boolean(
            (markerCompact && compactText.includes(markerCompact)) ||
            compactText.includes(defaultMarkerCompact)
        );
        if (hasMarker) {
            return { ok: true, root, snapshot, marker };
        }
        lastSnapshot = snapshot || lastSnapshot;
        await new Promise(resolve => setTimeout(resolve, 180));
    }
    return { ok: false, snapshot: lastSnapshot, marker };
};

window.dxmDescriptionsLookConsistent = function(pcSnapshot, wirelessSnapshot) {
    if (!pcSnapshot || !wirelessSnapshot) {
        return { ok: false, reason: '缺少 PC 或无线端描述内容' };
    }
    if (wirelessSnapshot.length < 80) {
        return { ok: false, reason: `无线端描述文字过短：${wirelessSnapshot.length} 字符` };
    }
    if (pcSnapshot.length >= 300 && wirelessSnapshot.length < pcSnapshot.length * 0.25) {
        return {
            ok: false,
            reason: `无线端描述明显短于 PC 端：PC ${pcSnapshot.length} / 无线 ${wirelessSnapshot.length}`
        };
    }
    const templateMarkers = ['dearfriend', 'sincerelywelcometoourstore', 'kevinpaper163com', '18679661688'];
    const missingTemplate = templateMarkers
        .filter(marker => pcSnapshot.compact.includes(marker) && !wirelessSnapshot.compact.includes(marker));
    if (missingTemplate.length >= 2) {
        return { ok: false, reason: '无线端描述缺少英文模板关键内容' };
    }
    const sharedKeywords = pcSnapshot.keywords
        .filter(keyword => wirelessSnapshot.compact.includes(keyword.replace(/[^a-z0-9]+/g, '')));
    if (pcSnapshot.keywords.length >= 8 && sharedKeywords.length < Math.min(4, Math.ceil(pcSnapshot.keywords.length * 0.25))) {
        return { ok: false, reason: '无线端描述与 PC 端商品内容关键词差异较大' };
    }
    if (pcSnapshot.imageCount > 0 && wirelessSnapshot.imageCount === 0) {
        return { ok: false, reason: '无线端描述没有检测到图片' };
    }
    return { ok: true, reason: 'PC 与无线端描述简单对比通过' };
};

window.dxmWaitForManualWirelessConsistencyFix = function(reason) {
    document.getElementById('dxm-manual-wireless-consistency-panel')?.remove();
    return new Promise(resolve => {
        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            panel.remove();
            resolve(value);
        };

        const panel = document.createElement('aside');
        panel.id = 'dxm-manual-wireless-consistency-panel';
        panel.className = 'dxm-manual-panel';
        panel.innerHTML = `
          <div class="dxm-manual-title">⚠️ 请手动核对无线端描述</div>
          <div class="dxm-manual-body">
            插件发现无线端描述和 PC 端描述可能不一致：<br>
            <b>${String(reason || '').replace(/[<>&"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char]))}</b><br>
            请在当前新版编辑器里手动调整并保存，完成后再继续发布。
          </div>
          <div class="dxm-manual-actions">
            <button type="button" id="dxm-wireless-consistency-stop">停止整个流程</button>
            <button type="button" id="dxm-wireless-consistency-done" class="primary">我已手动修好并保存，继续发布</button>
          </div>`;
        document.body.appendChild(panel);

        panel.querySelector('#dxm-wireless-consistency-stop').onclick = async () => {
            const data = await window.dxmStorageGet(['dxmPublishState']);
            await window.dxmStorageSet({ dxmPublishState: { ...data.dxmPublishState, running: false } });
            finish('stop');
        };
        panel.querySelector('#dxm-wireless-consistency-done').onclick = () => finish('manual_done');
    });
};

window.dxmEnsureEnglishTemplateInMobileEditor = async function(template) {
    window.dxmEnableNoTranslateGuard();
    window.dxmSuppressTranslationWidgets();
    const root = window.dxmFindMobileGeneratedDescriptionRoot();
    if (!root) return false;

    root.setAttribute?.('translate', 'no');
    root.classList?.add?.('notranslate');
    if (root.tagName === 'TEXTAREA') {
        const value = String(root.value || '');
        const hasChineseTemplate = /亲爱的朋友|页面上显示的价格仅为部分定金|由于产品通过海运发货|海运|实际报价/.test(value);
        const hasEnglishTemplate = /Dear friend|Sincerely welcome to our store|kevinpaper@163\.com/i.test(value);
        if (!hasChineseTemplate && hasEnglishTemplate) return true;
        root.value = `${template}\n\n${value
            .replace(/亲爱的朋友[\s\S]*?kevinpaper@163\.com/gi, '')
            .replace(/页面上显示的价格仅为部分定金[\s\S]*?kevinpaper@163\.com/gi, '')
            .trim()}`;
        root.dispatchEvent(new Event('input', { bubbles: true }));
        root.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    const removed = window.dxmRemoveExistingDescriptionTemplates(root);
    const currentText = root.textContent || '';
    const alreadyEnglish = /Dear friend|Sincerely welcome to our store|kevinpaper@163\.com/i.test(currentText) &&
        !/亲爱的朋友|页面上显示的价格仅为部分定金|由于产品通过海运发货/.test(currentText);
    if (!alreadyEnglish || removed > 0) {
        root.insertBefore(window.dxmCreateDescriptionTemplateBlock(root.ownerDocument, template), root.firstChild || null);
    }
    root.dispatchEvent(new Event('input', { bubbles: true }));
    root.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 250));
    return true;
};

window.dxmClickControl = async function(label, options = {}) {
    const { scope = document, timeout = 5000 } = options;
    const control = await window.waitForElement(
        () => window.dxmFindControl(label, scope),
        { timeout, interval: 200 }
    );
    if (!control) return false;
    const clickable = control.closest('button, a, li, label, [role="button"]') || control;
    clickable.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clickable.classList.add('dxm-step-focus');
    setTimeout(() => clickable.classList.remove('dxm-step-focus'), 1200);
    await new Promise(resolve => setTimeout(resolve, 300));
    clickable.click();
    return true;
};

window.dxmFindTopTranslateTrigger = function() {
    const controls = Array.from(document.querySelectorAll(
        'button, a, [role="button"], .el-dropdown, .btn-group, .el-button, span, div'
    )).filter(el => {
        if (!el.offsetWidth || !el.offsetHeight) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const text = window.dxmNormalizeText(el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '');
        if (!text.includes('一键翻译')) return false;
        // 排除大容器，避免命中整块顶部区域或页面主体。
        const rect = el.getBoundingClientRect();
        if (rect.width > 260 || rect.height > 80) return false;
        return rect.top >= 45 && rect.top <= 180;
    });

    const candidates = controls.map(el => {
        const clickable = el.closest('button, a, [role="button"], .el-dropdown, .btn-group, .el-button') || el;
        const rect = clickable.getBoundingClientRect();
        const text = window.dxmNormalizeText(clickable.textContent || el.textContent);
        return {
            el: clickable,
            rect,
            score:
                (text === '一键翻译' ? 80 : 0) +
                (rect.top >= 60 && rect.top <= 140 ? 50 : 0) +
                (rect.width >= 60 && rect.width <= 160 ? 30 : 0) -
                Math.min(30, rect.width * rect.height / 1200)
        };
    }).filter((item, index, arr) =>
        item.rect.width > 20 && item.rect.height > 18 &&
        arr.findIndex(other => other.el === item.el) === index
    );

    return candidates.sort((a, b) => b.score - a.score)[0]?.el || null;
};

window.dxmFindTranslateZhEnOption = function(trigger) {
    const triggerRect = trigger?.getBoundingClientRect?.() || { left: 0, right: window.innerWidth, bottom: 60 };
    const menuSelector = [
        '.el-dropdown-menu',
        '.el-popper',
        '.ant-dropdown',
        '[role="menu"]',
        'ul',
        'li',
        '[role="menuitem"]',
        '.el-dropdown-menu__item',
        'a',
        'span',
        'div'
    ].join(',');

    const candidates = Array.from(document.querySelectorAll(menuSelector))
        .filter(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            if (rect.top < triggerRect.bottom - 20 || rect.top > triggerRect.bottom + 260) return false;
            if (rect.left > triggerRect.right + 260 || rect.right < triggerRect.left - 80) return false;
            const compact = String(el.textContent || '').replace(/\s+/g, '');
            return compact.includes('中文') && compact.includes('英文');
        })
        .map(el => {
            let clickable = el.closest('li, [role="menuitem"], .el-dropdown-menu__item, a, [role="button"]') || el;
            const rawText = String(clickable.textContent || el.textContent || '');
            const compact = rawText.replace(/\s+/g, '');
            const rect = clickable.getBoundingClientRect();
            const directText = String(el.textContent || '').replace(/\s+/g, '');
            const menuClass = String(clickable.className || '');
            const isWholeMenu = compact.includes('普通翻译') && compact.includes('高级翻译') &&
                compact.indexOf('中文') !== compact.lastIndexOf('中文');
            const isCustom = compact.includes('自定义翻译');
            const rowShape = rect.width >= 60 && rect.width <= 260 && rect.height >= 18 && rect.height <= 52;
            const nearTrigger = Math.abs((rect.left + rect.width / 2) - (triggerRect.left + triggerRect.width / 2));
            const topDistance = Math.max(0, rect.top - triggerRect.bottom);
            return {
                el: clickable,
                rect,
                score:
                    (directText === '中文→英文' || directText === '中文-英文' || directText === '中文英文' ? 120 : 0) +
                    (/el-dropdown-menu__item|menuitem/i.test(menuClass) ? 60 : 0) +
                    (rowShape ? 55 : 0) +
                    (!isCustom ? 25 : -100) +
                    (!isWholeMenu ? 70 : -180) -
                    Math.min(40, nearTrigger * 0.12) -
                    Math.min(40, topDistance * 0.08) -
                    Math.min(80, (rect.width * rect.height) / 3500)
            };
        })
        .filter((item, index, arr) =>
            item.rect.width > 20 && item.rect.height > 16 &&
            arr.findIndex(other => other.el === item.el) === index
        )
        .sort((a, b) => b.score - a.score);

    return candidates[0]?.score > 0 ? candidates[0].el : null;
};

window.dxmRegenerateMarketingImage = async function() {
    const section = await window.waitForElement(
        () => window.dxmFindScopedSection('营销图片'),
        { timeout: 5000, interval: 250 }
    );
    if (!section) throw new Error('找不到“营销图片”区域');
    section.classList.add('dxm-step-focus');
    setTimeout(() => section.classList.remove('dxm-step-focus'), 1200);

    // 只在“营销图片”区域内寻找删除控件，防止误删产品主图。
    const hasMarketingImage = Array.from(section.querySelectorAll('img')).some(img => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src || '';
        return rect.width >= 60 && rect.height >= 60 && src && !src.startsWith('data:');
    });

    if (hasMarketingImage) {
        const deleteControls = Array.from(section.querySelectorAll(
            'button, a, [role="button"], [title], [aria-label], [class*="delete"], [class*="remove"], .el-icon-delete'
        )).filter(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            const marker = window.dxmNormalizeText(
                `${el.textContent || ''} ${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.className || ''}`
            ).toLowerCase();
            return marker.includes('删除') || marker.includes('delete') || marker.includes('remove');
        });

        if (deleteControls.length === 0) {
            throw new Error('营销图片已存在，但找不到该区域内的删除按钮');
        }

        for (const control of deleteControls) {
            if (!control.isConnected) continue;
            control.click();
            const confirmButton = await window.waitForElement(() => {
                return Array.from(document.querySelectorAll(
                    '.el-message-box__btns button, .ant-modal-footer button, .el-dialog__footer button'
                )).find(btn => {
                    if (!btn.offsetWidth || !btn.offsetHeight) return false;
                    const text = window.dxmNormalizeText(btn.textContent);
                    return text === '确定' || text === '确认' || text === 'OK';
                }) || null;
            }, { timeout: 1200, interval: 100 });
            if (confirmButton) confirmButton.click();
            await new Promise(resolve => setTimeout(resolve, 350));
        }
    }

    const generateButton = Array.from(section.querySelectorAll('button, a, [role="button"], span'))
        .find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            return window.dxmNormalizeText(el.textContent) === '一键生成';
        });
    if (!generateButton) throw new Error('找不到营销图片的“一键生成”按钮');
    (generateButton.closest('button, a, [role="button"]') || generateButton).click();
    await new Promise(resolve => setTimeout(resolve, 1800));
};

window.dxmRunTranslate = async function() {
    let triggerText = await window.waitForElement(
        () => window.dxmFindTopTranslateTrigger(),
        { timeout: 12000, interval: 250 }
    );
    if (!triggerText) throw new Error('找不到顶部“一键翻译”按钮');

    const focusControl = action => new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action }, response => {
            if (chrome.runtime.lastError || !response?.success) {
                reject(new Error(chrome.runtime.lastError?.message || response?.msg || `${action} 失败`));
                return;
            }
            resolve(response);
        });
    });

    let focusClaimed = false;
    window._dxmTranslationInteractionActive = true;
    try {
        await focusControl('claim_tab_focus');
        focusClaimed = true;

        // 排队期间页面可能重绘，获得互斥后重新取当前按钮和坐标。
        triggerText = window.dxmFindTopTranslateTrigger();
        if (!triggerText) throw new Error('获得翻译焦点后找不到“一键翻译”按钮');
        triggerText.scrollIntoView({ behavior: 'auto', block: 'center' });
        triggerText.classList.add('dxm-step-focus');
        setTimeout(() => triggerText.classList.remove('dxm-step-focus'), 1200);
        await new Promise(resolve => setTimeout(resolve, 180));

        const trigger = triggerText.querySelector(
            '.caret, .el-icon-arrow-down, .anticon-down, [class*="arrow"], [class*="dropdown"], [aria-haspopup="menu"]'
        ) || triggerText;
        const triggerRect = trigger.getBoundingClientRect();
        const triggerClicked = await window.dxmTrustedMouseClick(triggerRect, triggerRect);
        if (!triggerClicked) throw new Error('CDP 未能点击“一键翻译”');

        let option = await window.waitForElement(
            () => window.dxmFindTranslateZhEnOption(triggerText),
            { timeout: 3500, interval: 180 }
        );
        if (!option) {
            const retryRect = trigger.getBoundingClientRect();
            const retryClicked = await window.dxmTrustedMouseClick(retryRect, retryRect);
            if (!retryClicked) throw new Error('CDP 未能重试打开翻译菜单');
            option = await window.waitForElement(
                () => window.dxmFindTranslateZhEnOption(triggerText),
                { timeout: 3500, interval: 180 }
            );
        }
        if (!option) throw new Error('找不到下拉菜单项“中文 → 英文”');
        const optionClickable = option.closest('li, [role="menuitem"], .el-dropdown-menu__item, a, [role="button"]') || option;
        const optionRect = optionClickable.getBoundingClientRect();
        const optionClicked = await window.dxmTrustedMouseClick(optionRect, triggerRect);
        if (!optionClicked) throw new Error('CDP 未能点击“中文 → 英文”');
        await new Promise(resolve => setTimeout(resolve, 300));
    } finally {
        window._dxmTranslationInteractionActive = false;
        if (focusClaimed) await focusControl('release_tab_focus').catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 4200));
};

window.dxmRunTranslateWithPcVerification = async function() {
    await window.dxmRunTranslate();
    const pcContext = await window.waitForElement(
        () => window.dxmGetPcEditorContext?.()?.editor ? window.dxmGetPcEditorContext() : null,
        { timeout: 6000, interval: 200 }
    );
    if (!pcContext?.editor) throw new Error('翻译后无法读取 PC 端描述');
    const text = String(pcContext.editor.value || pcContext.editor.innerText || pcContext.editor.textContent || '');
    if (!/[\u4e00-\u9fff]/u.test(text)) return { attempts: 1 };

    window.dxmShowWorkflowOverlay?.('PC 端描述仍存在中文字符，正在重新翻译一次…');
    await window.dxmRunTranslate();
    return { attempts: 2 };
};

window.dxmFindVisibleFloatingNewWirelessEditorButton = function() {
    const wirelessContext = window.dxmFindWirelessDescriptionContext?.();
    const mobileSection = wirelessContext?.wrapper || window.dxmFindScopedSection('无线端描述') || document;
    const sectionRect = mobileSection?.getBoundingClientRect?.() || null;
    const visibleExactControls = Array.from(document.querySelectorAll('button, a, [role="button"], label, span, div'))
        .filter(el => window.dxmIsVisibleElement?.(el));
    const wirelessLabel = Array.from(document.querySelectorAll('label, span, div'))
        .find(el => window.dxmIsVisibleElement?.(el) &&
            window.dxmNormalizeText(el.textContent) === '无线端描述');
    const wirelessLabelRect = wirelessLabel?.getBoundingClientRect?.() || null;
    const clearButtons = visibleExactControls
        .filter(el => window.dxmNormalizeText(el.textContent) === '清空无线端描述')
        .map(el => (el.closest('button, a, [role="button"]') || el).getBoundingClientRect());
    const oldEditorButtons = visibleExactControls
        .filter(el => window.dxmNormalizeText(el.textContent) === '使用旧版编辑器')
        .map(el => (el.closest('button, a, [role="button"]') || el).getBoundingClientRect());
    const radioNewEditorRects = visibleExactControls
        .filter(el => window.dxmNormalizeText(el.textContent) === '使用新版编辑器')
        .filter(el => {
            for (let current = el; current && current !== document.body; current = current.parentElement) {
                if (current.matches?.('label') || current.querySelector?.('input[type="radio"]')) return true;
                if (current === mobileSection) break;
            }
            return false;
        })
        .map(el => (el.closest('button, a, [role="button"]') || el).getBoundingClientRect());
    const candidates = [];
    const controls = visibleExactControls
        .filter(el => window.dxmNormalizeText(el.textContent) === '使用新版编辑器')
        .filter(el => {
            if (mobileSection !== document && mobileSection.contains(el)) return true;
            if (!sectionRect) return true;
            const rect = (el.closest('button, a, [role="button"]') || el).getBoundingClientRect();
            const horizontallyNear = rect.right >= sectionRect.left - 80 && rect.left <= sectionRect.right + 80;
            const verticallyNear = rect.top >= sectionRect.top - 40 && rect.top <= sectionRect.bottom + 260;
            return horizontallyNear && verticallyNear;
        });

    controls.forEach(control => {
        const clickable = control.closest('button, a, [role="button"]') || control;
        const rect = clickable.getBoundingClientRect();
        const exactText = window.dxmNormalizeText(clickable.textContent || control.textContent);

        if (wirelessLabelRect && rect.top <= wirelessLabelRect.top + 20) return;
        if (!window.dxmIsVisibleElement?.(clickable)) return;
        if (exactText !== '使用新版编辑器') return;

        // 用户确认的目标是无线端预览图上方的绿色悬浮按钮；
        // 顶部 radio/label 里的“使用新版编辑器”只表示选项状态，不能当作进入按钮点击。
        let nearRadio = false;
        for (let current = control, depth = 0;
            current && current !== mobileSection && current !== document.body && depth < 6;
            current = current.parentElement, depth += 1) {
            const text = window.dxmNormalizeText(current.textContent);
            const isPreviewActionGroup = text.includes('使用新版编辑器') &&
                text.includes('使用旧版编辑器') &&
                text.includes('清空无线端描述');
            if (current.matches?.('label') ||
                current.matches?.('input[type="radio"]') ||
                (current.querySelector?.('input[type="radio"]') && !isPreviewActionGroup)) {
                nearRadio = true;
                break;
            }
        }
        if (nearRadio) return;

        let current = clickable.parentElement;
        let floatingContainer = null;
        for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
            const text = window.dxmNormalizeText(current.textContent);
            if (text.includes('使用新版编辑器') &&
                text.includes('使用旧版编辑器') &&
                text.includes('清空无线端描述')) {
                floatingContainer = current;
                break;
            }
        }
        const styleText = `${clickable.getAttribute('style') || ''} ${clickable.className || ''}`;
        const computed = getComputedStyle(clickable);
        const greenScore = /green|success|#52c41a|#00|rgb\(.*(?:128|158|196)/i.test(styleText) ||
            /rgb\(\s*(?:0|19|20|24|52|67|71|76|82|90|100|103|110|120|130)\s*,\s*(?:120|128|140|150|160|170|180|190|196|200)/i.test(computed.backgroundColor);
        const insideWirelessSection = mobileSection !== document && mobileSection.contains(clickable);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const isAboveOldEditor = oldEditorButtons.some(oldRect => {
            const oldCenterX = oldRect.left + oldRect.width / 2;
            const oldCenterY = oldRect.top + oldRect.height / 2;
            return oldCenterY > centerY &&
                oldCenterY - centerY >= 28 &&
                oldCenterY - centerY <= 95 &&
                Math.abs(oldCenterX - centerX) < 150;
        });
        const isAboveClear = clearButtons.some(clearRect => {
            const clearCenterX = clearRect.left + clearRect.width / 2;
            const clearCenterY = clearRect.top + clearRect.height / 2;
            return clearCenterY > centerY &&
                clearCenterY - centerY >= 65 &&
                clearCenterY - centerY <= 190 &&
                Math.abs(clearCenterX - centerX) < 170;
        });
        const separatedFromRadio = !radioNewEditorRects.some(radioRect => {
            const radioCenterY = radioRect.top + radioRect.height / 2;
            return Math.abs(radioCenterY - centerY) < 45;
        });
        const buttonShapeScore = rect.width >= 110 && rect.width <= 240 && rect.height >= 30 && rect.height <= 62 ? 45 : 0;
        const clearRelationScore = clearButtons.reduce((score, clearRect) => {
            const clearCenterX = clearRect.left + clearRect.width / 2;
            const verticalGap = clearRect.top - rect.top;
            const horizontalGap = Math.abs(clearCenterX - centerX);
            if (verticalGap > 35 && verticalGap < 190 && horizontalGap < 130) return Math.max(score, 90);
            if (verticalGap > 20 && verticalGap < 240 && horizontalGap < 180) return Math.max(score, 55);
            return score;
        }, 0);
        const oldEditorRelationScore = oldEditorButtons.reduce((score, oldRect) => {
            const oldCenterX = oldRect.left + oldRect.width / 2;
            const oldCenterY = oldRect.top + oldRect.height / 2;
            const verticalGap = oldCenterY - centerY;
            const horizontalGap = Math.abs(oldCenterX - centerX);
            if (verticalGap > 15 && verticalGap < 95 && horizontalGap < 120) return Math.max(score, 45);
            return score;
        }, 0);
        candidates.push({
            control: clickable,
            rect,
            score:
                (floatingContainer ? 100 : 0) +
                (isAboveOldEditor ? 150 : -120) +
                (isAboveClear ? 85 : 0) +
                clearRelationScore +
                Math.min(oldEditorRelationScore, 35) +
                (insideWirelessSection ? 35 : 0) +
                (greenScore ? 90 : -160) +
                (separatedFromRadio ? 55 : -120) +
                buttonShapeScore +
                (window.dxmIsElementClickableNow?.(clickable) ? 35 : 0) +
                (rect.top > 120 ? 10 : 0) -
                rect.top * 0.001
        });
    });

    const target = candidates
        .filter(item => item.rect.width > 20 && item.rect.height > 18)
        .sort((a, b) => b.score - a.score)[0];
    return target && target.score >= 150 ? target.control : null;
};

window.dxmWaitForStableFloatingNewWirelessEditorButton = async function(timeout = 4500) {
    const startedAt = Date.now();
    let lastSignature = '';
    let stableSince = 0;
    while (Date.now() - startedAt < timeout) {
        const button = window.dxmFindVisibleFloatingNewWirelessEditorButton?.();
        if (button && window.dxmNormalizeText(button.textContent) === '使用新版编辑器') {
            const rect = button.getBoundingClientRect();
            const style = getComputedStyle(button);
            const signature = [
                Math.round(rect.left),
                Math.round(rect.top),
                Math.round(rect.width),
                Math.round(rect.height),
                style.backgroundColor,
                window.dxmNormalizeText(button.textContent)
            ].join(':');
            if (signature === lastSignature) {
                stableSince = stableSince || Date.now();
                if (Date.now() - stableSince >= 160 && window.dxmIsElementClickableNow?.(button)) {
                    return button;
                }
            } else {
                lastSignature = signature;
                stableSince = 0;
            }
        } else {
            lastSignature = '';
            stableSince = 0;
        }
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    return null;
};

window.dxmWaitForVisibleFloatingNewWirelessEditorButton = function(timeout = 2500) {
    return window.waitForElement(
        () => window.dxmFindVisibleFloatingNewWirelessEditorButton?.(),
        { timeout, interval: 120 }
    );
};

window.dxmRectIntersectsViewport = function(rect, margin = 24) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return rect.bottom > margin &&
        rect.right > margin &&
        rect.top < window.innerHeight - margin &&
        rect.left < window.innerWidth - margin;
};

window.dxmVisibleViewportRect = function(rect, margin = 12) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const left = Math.max(rect.left, margin);
    const top = Math.max(rect.top, margin);
    const right = Math.min(rect.right, window.innerWidth - margin);
    const bottom = Math.min(rect.bottom, window.innerHeight - margin);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
};

window.dxmScrollIntoViewOnlyIfNeeded = async function(element) {
    if (!element?.getBoundingClientRect) return;
    const rect = element.getBoundingClientRect();
    if (window.dxmRectIntersectsViewport(rect, 48)) return;
    element.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    await new Promise(resolve => setTimeout(resolve, 120));
};

function _dxmFindNewEditorRadioOption() {
  var context = window.dxmFindWirelessDescriptionContext();
  var wrapper = context ? (context.wrapper || null) : (window.dxmFindScopedSection('无线端描述'));
  if (!wrapper) return null;

  var candidates = Array.from(wrapper.querySelectorAll(
    'label, span, div, button, a, input[type="radio"]'
  ))
    .filter(function(el) {
      return typeof window.dxmIsVisibleElement === 'function' ? window.dxmIsVisibleElement(el) : (el.offsetWidth > 0 && el.offsetHeight > 0);
    })
    .filter(function(el) {
      var text = window.dxmNormalizeText(el.textContent);
      return text === '使用新版编辑器' || text.indexOf('使用新版编辑器') === 0;
    });

  // Priority: real radio > label > plain element
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].matches && candidates[i].matches('input[type="radio"]')) return candidates[i];
  }
  for (var j = 0; j < candidates.length; j++) {
    var radio = candidates[j].querySelector ? candidates[j].querySelector('input[type="radio"]') : null;
    if (radio) return radio;
    var forId = candidates[j].getAttribute ? candidates[j].getAttribute('for') : null;
    if (forId) {
      var target = document.getElementById(forId);
      if (target && target.matches && target.matches('input[type="radio"]')) return target;
    }
  }
  return candidates[0] || null;
}

window.dxmClickFloatingNewWirelessEditorButton = async function() {
    const wirelessContext = window.dxmFindWirelessDescriptionContext?.();
    const mobileSection = wirelessContext?.wrapper || window.dxmFindScopedSection('无线端描述') || document;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await window.dxmRevealWirelessEditorActions(mobileSection, { requireStableButton: true });
        const target = await window.dxmWaitForStableFloatingNewWirelessEditorButton(2600);
        if (!target) continue;

        await window.dxmScrollIntoViewOnlyIfNeeded(target);
        target.classList.add('dxm-step-focus');
        setTimeout(() => target.classList.remove('dxm-step-focus'), 1000);
        await new Promise(resolve => setTimeout(resolve, 80));
        const targetRect = target.getBoundingClientRect();
        const fromRect = mobileSection?.getBoundingClientRect?.() || targetRect;
        await window.dxmSafeElementClick(target, mobileSection === document ? target : mobileSection);
        await new Promise(resolve => setTimeout(resolve, 220));
        if (window.dxmIsInWirelessNewEditorFullscreen?.()) return true;
        const opened = await window.waitForElement(
            () => window.dxmIsInWirelessNewEditorFullscreen?.() ? document.body : null,
            { timeout: 1300, interval: 120 }
        );
        if (opened) return true;
        if (targetRect.width > 0 && targetRect.height > 0 && typeof window.dxmTrustedMouseClick === 'function') {
            const trusted = await window.dxmTrustedMouseClick(targetRect, fromRect).catch(() => false);
            if (trusted) {
                const openedAfterTrusted = await window.waitForElement(
                    () => window.dxmIsInWirelessNewEditorFullscreen?.() ? document.body : null,
                    { timeout: 1800, interval: 120 }
                );
                if (openedAfterTrusted) return true;
            }
        }
    }
  // ===== 策略 2：radio 直选（不依赖颜色/位置/间距） =====
  var radioBtn = _dxmFindNewEditorRadioOption();
  if (radioBtn) {
    await window.dxmScrollIntoViewOnlyIfNeeded(radioBtn);
    await new Promise(function(resolve) { setTimeout(resolve, 80); });
    await window.dxmSafeElementClick(radioBtn, radioBtn);
    var opened = await window.waitForElement(
      function() { return window.dxmIsInWirelessNewEditorFullscreen() ? document.body : null; },
      { timeout: 3500, interval: 200 }
    );
    if (opened) return true;
  }

  return false;
};

window.dxmRevealWirelessEditorActions = async function(anchor = null, options = {}) {
    const previewRoot = window.dxmFindWirelessPreviewContentRoot?.();
    const previewImage = Array.from(previewRoot?.querySelectorAll?.('img') || [])
        .map(img => ({ img, rect: img.getBoundingClientRect() }))
        .filter(item => item.rect.width >= 120 && item.rect.height >= 80)
        .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0]?.img || null;
    // 悬停触发只需要鼠标进入无线端预览区域；优先用预览容器，避免为了某张图片强制滚动页面。
    const target = previewRoot || previewImage || anchor || window.dxmFindScopedSection('无线端描述') || document.body;
    if (!target) return false;
    await window.dxmScrollIntoViewOnlyIfNeeded(target);
    const rect = target.getBoundingClientRect?.();
    const visibleRect = window.dxmVisibleViewportRect(rect, 18);
    const doc = target.ownerDocument || document;
    const hoverBase = visibleRect || rect;
    const hoverPoints = hoverBase && hoverBase.width > 0 && hoverBase.height > 0
        ? [
            // 绿色按钮是 hover 后才完全显示；在当前可见区域内移动，避免触发页面滚动。
            { x: hoverBase.left + hoverBase.width * 0.5, y: hoverBase.top + hoverBase.height * 0.5 },
            { x: hoverBase.left + hoverBase.width * 0.5, y: hoverBase.top + hoverBase.height * 0.42 },
            { x: hoverBase.left + hoverBase.width * 0.5, y: hoverBase.top + hoverBase.height * 0.62 },
            { x: hoverBase.left + hoverBase.width * 0.42, y: hoverBase.top + hoverBase.height * 0.54 },
            { x: hoverBase.left + hoverBase.width * 0.58, y: hoverBase.top + hoverBase.height * 0.54 }
        ]
        : [{ x: window.innerWidth / 2, y: window.innerHeight / 2 }];
    for (const point of hoverPoints) {
        if (hoverBase && hoverBase.width > 0 && hoverBase.height > 0 && typeof window.dxmTrustedMouseMove === 'function') {
            await window.dxmTrustedMouseMove(
                { left: point.x - 1, top: point.y - 1, width: 2, height: 2 },
                hoverBase,
                120
            );
        }
        const stack = typeof doc.elementsFromPoint === 'function'
            ? doc.elementsFromPoint(point.x, point.y)
            : [doc.elementFromPoint(point.x, point.y)];
        const hoverTargets = Array.from(new Set([target, ...stack.filter(Boolean)]));
        hoverTargets.forEach(el => {
            if (typeof window.dxmDispatchPointerMouseEvents === 'function') {
                window.dxmDispatchPointerMouseEvents(el, point.x, point.y);
            }
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        if (window.dxmFindVisibleFloatingNewWirelessEditorButton?.()) {
            break;
        }
    }
    if (options.requireStableButton) {
        await window.dxmWaitForStableFloatingNewWirelessEditorButton(500);
    } else {
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    return true;
};

window.dxmIsInWirelessNewEditorFullscreen = function() {
    const generate = window.dxmFindNewMobileEditorTopControl('generate');
    const save = window.dxmFindNewMobileEditorTopControl('save');
    const hasTitle = Array.from(document.querySelectorAll('h1, h2, h3, div, span'))
        .some(el => el.offsetWidth && el.offsetHeight &&
            window.dxmNormalizeText(el.textContent) === '新版编辑器');
    const bodyText = window.dxmNormalizeText(document.body?.innerText || document.body?.textContent || '');
    const editorHints = bodyText.includes('根据PC端描述一键生成') ||
        (bodyText.includes('添加模块') && bodyText.includes('使用中模块')) ||
        (bodyText.includes('批量操作') && bodyText.includes('关闭'));
    return !!(save && hasTitle && (generate || editorHints));
};

window.dxmIsWirelessGenerateConfirmText = function(text) {
    const normalized = window.dxmNormalizeText(text);
    const generateWord = normalized.includes('一键生成') || normalized.includes('一建生成');
    if (!generateWord) return false;
    return (
        normalized.includes('确定一键生成') ||
        normalized.includes('确定一建生成') ||
        normalized.includes('将会替换掉现有的无线端内容') ||
        normalized.includes('替换掉现有的无线端内容') ||
        (normalized.includes('替换') && (normalized.includes('无线端内容') || normalized.includes('无线端描述'))) ||
        (normalized.includes('平台要求描述图宽度') && normalized.includes('不支持GIF格式')) ||
        (normalized.includes('不符合要求的图片') && normalized.includes('自动移除'))
    );
};

window.dxmLooksLikeWirelessGenerateConfirmDialog = function(node) {
    if (!node || !window.dxmIsWirelessGenerateConfirmText(node.textContent || '')) return false;
    const rect = node.getBoundingClientRect?.();
    if (!rect || rect.width < 260 || rect.height < 120 ||
        rect.width > Math.min(window.innerWidth * 0.92, 760) ||
        rect.height > Math.min(window.innerHeight * 0.72, 520)) {
        return false;
    }
    const text = window.dxmNormalizeText(node.textContent || '');
    const controls = Array.from(node.querySelectorAll(
        'button, a, [role="button"], span, div, input[type="button"], input[type="submit"]'
    )).filter(el => {
        const elRect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        if (!elRect || elRect.width <= 0 || elRect.height <= 0 ||
            style.display === 'none' || style.visibility === 'hidden') return false;
        const label = window.dxmNormalizeText(el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
        return label === '确定' || label === '确认' || label === '取消' || label.toUpperCase() === 'OK';
    });
    const hasConfirm = controls.some(el => {
        const label = window.dxmNormalizeText(el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
        return label === '确定' || label === '确认' || label.toUpperCase() === 'OK';
    });
    const hasCancel = text.includes('取消') || controls.some(el =>
        window.dxmNormalizeText(el.textContent || el.value || '') === '取消'
    );
    return hasConfirm && (hasCancel || text.includes('提示'));
};

window.dxmFindWirelessGenerateConfirmDialog = function() {
    const isVisible = el => {
        if (!el) return false;
        if (el.closest?.('#dxm-workflow-overlay, #dxm-template-overlay, .dxm-manual-panel')) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const dialogSelectors = [
        '.el-message-box',
        '.el-dialog',
        '.ant-modal',
        '.layui-layer',
        '.ivu-modal',
        '.next-dialog',
        '.arco-modal',
        '.semi-modal',
        '[role="dialog"]',
        '.modal',
        '[class*="dialog"]',
        '[class*="modal"]',
        '[class*="message"]',
        '[class*="confirm"]',
        '[class*="popup"]',
        '[class*="layer"]'
    ].join(', ');
    const standard = Array.from(document.querySelectorAll(dialogSelectors))
        .filter(isVisible)
        .find(dialog => window.dxmLooksLikeWirelessGenerateConfirmDialog(dialog));
    if (standard) return standard;

    const all = Array.from(document.querySelectorAll('div, section, article'))
        .filter(isVisible)
        .filter(node => window.dxmLooksLikeWirelessGenerateConfirmDialog(node))
        .map(node => {
            const rect = node.getBoundingClientRect();
            return { node, area: rect.width * rect.height, rect };
        })
        .filter(item => item.rect.width >= 220 && item.rect.height >= 120)
        .sort((a, b) => a.area - b.area);
    return all[0]?.node || null;
};

window.dxmFindWirelessGenerateConfirmButton = function(dialog) {
    if (!dialog) return null;
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const dialogRect = dialog.getBoundingClientRect();
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div, input[type="button"], input[type="submit"]'))
        .filter(isVisible)
        .filter(el => {
            const text = window.dxmNormalizeText(el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
            return text === '确定' || text === '确认' || text.toUpperCase() === 'OK';
        })
        .filter(el => {
            if (dialog.contains(el)) return true;
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            return centerX >= dialogRect.left && centerX <= dialogRect.right &&
                centerY >= dialogRect.top && centerY <= dialogRect.bottom;
        })
        .map(el => {
            const clickable = el.closest('button, a, [role="button"]') || el;
            const rect = clickable.getBoundingClientRect();
            const classText = String(clickable.className || '');
            const text = window.dxmNormalizeText(clickable.textContent || clickable.value || '');
            const primaryScore = /primary|blue|confirm|sure|ok/i.test(classText) ? 120 : 0;
            const exactScore = text === '确定' ? 80 : 0;
            const rightSideScore = rect.left > dialogRect.left + dialogRect.width / 2 ? 12 : 0;
            return { el: clickable, rect, score: primaryScore + exactScore + rightSideScore + rect.width * rect.height };
        });
    return candidates.sort((a, b) => b.score - a.score)[0]?.el || null;
};

window.dxmClickWirelessGenerateConfirmOnce = async function() {
    const dialog = window.dxmFindWirelessGenerateConfirmDialog();
    const button = window.dxmFindWirelessGenerateConfirmButton(dialog);
    if (!dialog || !button) return false;
    const isVisible = el => {
        if (!el) return false;
        const elRect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return elRect && elRect.width > 0 && elRect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    document.getElementById('dxm-workflow-overlay')?.remove();
    button.scrollIntoView?.({ behavior: 'auto', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 40));
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointTarget = document.elementFromPoint(x, y);
    const clickable = pointTarget?.closest?.('button, a, [role="button"]') || button.closest?.('button, a, [role="button"]') || button;
    const view = clickable.ownerDocument?.defaultView || window;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        const EventCtor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
        clickable.dispatchEvent(new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            view,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type.includes('down') ? 1 : 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    });
    clickable.click?.();
    window.__dxmWirelessGenerateConfirmClickedAt = Date.now();
    await new Promise(resolve => setTimeout(resolve, 120));
    if (!dialog.isConnected || !isVisible(dialog)) return true;

    if (typeof window.dxmTrustedMouseClick === 'function') {
        const clicked = await window.dxmTrustedMouseClick(rect, rect).catch(() => false);
        await new Promise(resolve => setTimeout(resolve, 180));
        if (clicked) window.__dxmWirelessGenerateConfirmClickedAt = Date.now();
    }
    return true;
};

window.dxmStartWirelessGenerateConfirmGuard = function(durationMs = 30000) {
    clearInterval(window.__dxmWirelessGenerateConfirmGuardTimer);
    const startedAt = Date.now();
    let clicking = false;
    window.__dxmWirelessGenerateConfirmGuardTimer = setInterval(async () => {
        if (Date.now() - startedAt > durationMs) {
            clearInterval(window.__dxmWirelessGenerateConfirmGuardTimer);
            window.__dxmWirelessGenerateConfirmGuardTimer = null;
            return;
        }
        if (clicking) return;
        if (!window.dxmFindWirelessGenerateConfirmDialog()) return;
        clicking = true;
        try {
            await window.dxmClickWirelessGenerateConfirmOnce();
        } finally {
            clicking = false;
        }
    }, 300);
};

window.dxmConfirmWirelessGenerateDialog = async function() {
    const isVisible = el => {
        if (!el) return false;
        if (el.closest?.('#dxm-workflow-overlay, #dxm-template-overlay, .dxm-manual-panel')) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const isGenerateConfirmText = text => {
        return window.dxmIsWirelessGenerateConfirmText(text);
    };
    const dialogSelectors = [
        '.el-message-box',
        '.el-dialog',
        '.ant-modal',
        '.layui-layer',
        '.ivu-modal',
        '.next-dialog',
        '.arco-modal',
        '.semi-modal',
        '[role="dialog"]',
        '.modal',
        '[class*="dialog"]',
        '[class*="modal"]',
        '[class*="message"]',
        '[class*="confirm"]',
        '[class*="popup"]',
        '[class*="layer"]'
    ].join(', ');
    const findDialog = () => {
        const standard = Array.from(document.querySelectorAll(dialogSelectors))
            .filter(isVisible)
            .find(dialog => isGenerateConfirmText(dialog.textContent || '') &&
                window.dxmLooksLikeWirelessGenerateConfirmDialog(dialog));
        if (standard) return standard;

        const all = Array.from(document.querySelectorAll('div, section, article'))
            .filter(isVisible)
            .filter(node => isGenerateConfirmText(node.textContent || '') &&
                window.dxmLooksLikeWirelessGenerateConfirmDialog(node))
            .map(node => {
                const rect = node.getBoundingClientRect();
                return { node, area: rect.width * rect.height, rect };
            })
            .filter(item => item.rect.width >= 220 && item.rect.height >= 120)
            .sort((a, b) => a.area - b.area);
        return all[0]?.node || null;
    };
    const findConfirmButton = dialog => {
        const dialogRect = dialog.getBoundingClientRect();
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], span, div, input[type="button"], input[type="submit"]'))
            .filter(isVisible)
            .filter(el => {
                const text = window.dxmNormalizeText(el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '');
                return text === '确定' || text === '确认' || text.toUpperCase() === 'OK';
            })
            .filter(el => {
                if (dialog.contains(el)) return true;
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                return centerX >= dialogRect.left && centerX <= dialogRect.right &&
                    centerY >= dialogRect.top && centerY <= dialogRect.bottom;
            })
            .map(el => {
                const clickable = el.closest('button, a, [role="button"]') || el;
                const rect = clickable.getBoundingClientRect();
                const classText = String(clickable.className || '');
                const text = window.dxmNormalizeText(clickable.textContent || clickable.value || '');
                const primaryScore = /primary|blue|confirm|sure|ok/i.test(classText) ? 120 : 0;
                const exactScore = text === '确定' ? 80 : 0;
                const rightSideScore = rect.left > dialogRect.left + dialogRect.width / 2 ? 12 : 0;
                return { el: clickable, rect, score: primaryScore + exactScore + rightSideScore + rect.width * rect.height };
            });
        return candidates.sort((a, b) => b.score - a.score)[0]?.el || null;
    };

    document.getElementById('dxm-workflow-overlay')?.remove();
    window.dxmStartWirelessGenerateConfirmGuard(30000);
    const dialog = await window.waitForElement(findDialog, { timeout: 9000, interval: 120 });
    if (!dialog) {
        // 守护器可能已经先一步点击“确定”，此时确认框正常消失。
        // 后续仍会检查生成内容，没生成就停止，因此这里不再因为没捕捉到弹窗而暂停。
        window.__dxmWirelessGenerateConfirmSkippedAt = Date.now();
        return true;
    }

    const confirmButton = findConfirmButton(dialog);
    if (!confirmButton) throw new Error('无线端描述：一键生成确认弹窗中找不到“确定”按钮');

    const clickable = confirmButton.closest?.('button, a, [role="button"]') || confirmButton;
    clickable.classList.add('dxm-step-focus');
    setTimeout(() => clickable.classList.remove('dxm-step-focus'), 1000);
    await new Promise(resolve => setTimeout(resolve, 60));
    clickable.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
    await new Promise(resolve => setTimeout(resolve, 40));
    await window.dxmClickWirelessGenerateConfirmOnce();
    const waitUntilDialogDisappears = timeout => window.waitForElement(() => {
        const latest = findDialog();
        return latest && isVisible(latest) ? null : true;
    }, {
        timeout,
        interval: 120
    });
    let disappeared = await waitUntilDialogDisappears(700);
    if (!disappeared && typeof window.dxmTrustedMouseClick === 'function') {
        const rect = clickable.getBoundingClientRect();
        await window.dxmTrustedMouseClick(rect, rect).catch(() => false);
        disappeared = await waitUntilDialogDisappears(4500);
    }
    if (!disappeared) throw new Error('无线端描述：“确定”已点击但确认弹窗未消失');
    return true;
};

window.dxmFindWirelessSaveSuccessDialog = function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    return Array.from(document.querySelectorAll(
        '.el-message-box, .el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"], [class*="message"]'
    )).find(dialog => {
        if (!isVisible(dialog)) return false;
        const text = window.dxmNormalizeText(dialog.textContent);
        return (text.includes('产品编辑成功') || text.includes('您的产品编辑成功')) &&
            text.includes('继续编辑');
    }) || null;
};

window.dxmHandleWirelessSaveSuccessDialog = async function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const dialog = await window.waitForElement(
        () => window.dxmFindWirelessSaveSuccessDialog(),
        { timeout: 12000, interval: 200 }
    );
    if (!dialog) return false;

    const continueButton = Array.from(dialog.querySelectorAll('button, a, [role="button"], span, div'))
        .find(el => isVisible(el) && window.dxmNormalizeText(el.textContent) === '继续编辑');
    if (!continueButton) throw new Error('无线端描述：保存成功弹窗中找不到“继续编辑”按钮');
    await window.dxmPlainDomClick(continueButton.closest('button, a, [role="button"]') || continueButton);
    await window.waitForElement(() => (dialog.isConnected && isVisible(dialog) ? null : true), {
        timeout: 8000,
        interval: 200
    });
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
};

window.dxmWaitForWirelessEditorReturn = async function(timeout = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (!window.dxmIsInWirelessNewEditorFullscreen?.()) {
            const previewRoot = window.dxmFindWirelessPreviewContentRoot?.();
            if (previewRoot) return true;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return false;
};

window.dxmWaitForWirelessSaveRefreshOrJump = async function(options = {}) {
    const {
        beforeUrl = location.href,
        timeout = 30000,
        stableMs = 1800
    } = options;
    const startedAt = Date.now();
    let stableSince = 0;
    let sawEditorExit = false;
    let sawUrlChange = false;

    while (Date.now() - startedAt < timeout) {
        const inNewEditor = !!window.dxmIsInWirelessNewEditorFullscreen?.();
        const previewRoot = window.dxmFindWirelessPreviewContentRoot?.();
        const ready = document.readyState === 'complete';
        const urlChanged = location.href !== beforeUrl;
        const currentUrl = String(location.href || '').toLowerCase();
        const productListReady = urlChanged && ready &&
            (currentUrl.includes('/web/smt/smtproductlist') || window.dxmIsOfflinePublishListPage?.(location.href));
        const editPageReady = ready && currentUrl.includes('/web/smt/edit') && !inNewEditor;

        sawEditorExit = sawEditorExit || !inNewEditor;
        sawUrlChange = sawUrlChange || urlChanged;

        const ordinaryEditPageReady = sawEditorExit && !!previewRoot && ready;
        const refreshOrJumpSeen = sawUrlChange || ordinaryEditPageReady || productListReady || editPageReady;
        if (productListReady) {
            return {
                ok: true,
                urlChanged: sawUrlChange,
                editorExited: sawEditorExit,
                previewReady: false,
                productListReady: true,
                editPageReady: false,
                elapsedMs: Date.now() - startedAt
            };
        }
        if (refreshOrJumpSeen && ordinaryEditPageReady) {
            if (!stableSince) stableSince = Date.now();
            if (Date.now() - stableSince >= stableMs) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    ok: true,
                    urlChanged: sawUrlChange,
                    editorExited: sawEditorExit,
                    previewReady: true,
                    productListReady: false,
                    editPageReady: true,
                    elapsedMs: Date.now() - startedAt
                };
            }
        } else if (refreshOrJumpSeen && editPageReady) {
            if (!stableSince) stableSince = Date.now();
            if (Date.now() - stableSince >= stableMs) {
                await new Promise(resolve => setTimeout(resolve, 500));
                return {
                    ok: true,
                    urlChanged: sawUrlChange,
                    editorExited: sawEditorExit,
                    previewReady: !!previewRoot,
                    productListReady: false,
                    editPageReady: true,
                    elapsedMs: Date.now() - startedAt
                };
            }
        } else {
            stableSince = 0;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    return {
        ok: false,
        urlChanged: sawUrlChange,
        editorExited: sawEditorExit,
        previewReady: !!window.dxmFindWirelessPreviewContentRoot?.(),
        productListReady: false,
        editPageReady: false,
        elapsedMs: Date.now() - startedAt
    };
};

window.dxmWaitForWirelessSaveClickSignal = async function(beforeUrl = location.href, timeout = 3500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (location.href !== beforeUrl) return true;
        if (window.dxmFindWirelessSaveSuccessDialog?.()) return true;
        if (!window.dxmIsInWirelessNewEditorFullscreen?.() && window.dxmFindWirelessPreviewContentRoot?.()) return true;
        await new Promise(resolve => setTimeout(resolve, 220));
    }
    return false;
};

window.dxmDispatchRobustMouseClick = function(element) {
    const clickable = element?.closest?.('button, a, [role="button"]') || element;
    if (!clickable) return false;
    const rect = clickable.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const doc = clickable.ownerDocument || document;
    const view = doc.defaultView || window;
    const pointTarget = doc.elementFromPoint?.(x, y);
    const target = pointTarget?.closest?.('button, a, [role="button"]') || clickable;
    const eventInit = {
        bubbles: true,
        cancelable: true,
        view,
        clientX: x,
        clientY: y,
        screenX: Math.round((window.screenX || 0) + x),
        screenY: Math.round((window.screenY || 0) + y),
        button: 0,
        buttons: 1,
        detail: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
    };
    ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown'].forEach(type => {
        const EventCtor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
        target.dispatchEvent(new EventCtor(type, eventInit));
    });
    ['pointerup', 'mouseup', 'click'].forEach(type => {
        const EventCtor = type.startsWith('pointer') && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
        target.dispatchEvent(new EventCtor(type, { ...eventInit, buttons: 0 }));
    });
    target.click?.();
    if (target !== clickable) clickable.click?.();
    return true;
};

window.dxmClickWirelessSaveOnce = async function(preferredSaveButton = null) {
    const saveButton = preferredSaveButton ||
        window.dxmFindWirelessEditorHeaderSaveButton?.() ||
        window.dxmFindNewMobileEditorTopControl('save');
    if (!saveButton) return false;
    const saveClickable = saveButton.closest?.('button, a, [role="button"]') || saveButton;
    if (!saveClickable?.isConnected) return false;
    if (saveClickable.disabled || saveClickable.getAttribute?.('aria-disabled') === 'true') return false;
    if (/\b(is-disabled|disabled|ant-btn-disabled)\b/.test(String(saveClickable.className || ''))) return false;
    document.getElementById('dxm-workflow-overlay')?.remove();
    saveClickable.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
    await new Promise(resolve => setTimeout(resolve, 40));
    const rect = saveClickable.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointTarget = document.elementFromPoint(x, y);
    const hitClickable = pointTarget?.closest?.('button, a, [role="button"]') || null;
    const clickable = hitClickable && (hitClickable === saveClickable || saveClickable.contains(hitClickable) || hitClickable.contains?.(saveClickable))
        ? hitClickable
        : saveClickable;
    const clickTargets = Array.from(new Set([
        clickable,
        saveClickable,
        pointTarget,
        saveButton
    ].filter(Boolean)));

    clickTargets.forEach(target => {
        if (!target?.isConnected) return;
        window.dxmDispatchRobustMouseClick(target);
        target.click?.();
    });
    await new Promise(resolve => setTimeout(resolve, 120));
    window.__dxmWirelessLastSaveClick = {
        at: Date.now(),
        trusted: false,
        targetCount: clickTargets.length,
        rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        },
        text: window.dxmNormalizeText(saveClickable.textContent || '')
    };
    return true;
};

window.dxmStartWirelessSaveGuard = function(durationMs = 45000) {
    clearInterval(window.__dxmWirelessSaveGuardTimer);
    const startedAt = Date.now();
    let clicking = false;
    window.__dxmWirelessSaveGuardTimer = setInterval(async () => {
        if (Date.now() - startedAt > durationMs ||
            (!window.dxmIsInWirelessNewEditorFullscreen?.() && window.dxmFindWirelessPreviewContentRoot?.())) {
            clearInterval(window.__dxmWirelessSaveGuardTimer);
            window.__dxmWirelessSaveGuardTimer = null;
            return;
        }
        if (clicking) return;
        const saveButton = window.dxmFindClickableWirelessSaveButton?.() ||
            window.dxmFindWirelessEditorHeaderSaveButton?.() ||
            window.dxmFindNewMobileEditorTopControl?.('save');
        if (!saveButton) return;
        clicking = true;
        try {
            await window.dxmClickWirelessSaveOnce(saveButton);
        } finally {
            clicking = false;
        }
    }, 900);
};

window.dxmSaveWirelessEditorAndReturn = async function(options = {}) {
    const {
        beforeSnapshot = null,
        generatedSnapshot = null,
        template = null,
        requireStable = true
    } = options;

    let snapshot = generatedSnapshot;
    if (requireStable) {
        window.dxmShowWorkflowOverlay('正在检测无线端描述渲染与保存按钮状态…');
        const generatedResult = await window.dxmWaitForWirelessRenderedOrSaveClickable(beforeSnapshot, 5000);
        if (!generatedResult.ready) throw new Error('无线端描述：短暂等待后仍未检测到生成内容或可点击保存按钮，暂不保存');
        snapshot = generatedResult.snapshot;
    }

    const finalTemplate = template || (await window.dxmStorageGet(['dxmDescriptionTemplate'])).dxmDescriptionTemplate || window.DXM_DEFAULT_DESCRIPTION_TEMPLATE;
    await window.dxmEnsureEnglishTemplateInMobileEditor(finalTemplate);

    document.getElementById('dxm-workflow-overlay')?.remove();
    const saveButton = await window.waitForElement(
        () => window.dxmFindClickableWirelessSaveButton() ||
            window.dxmFindWirelessEditorHeaderSaveButton?.() ||
            window.dxmFindNewMobileEditorTopControl('save'),
        { timeout: 12000, interval: 200 }
    );
    if (!saveButton) throw new Error('无线端描述：找不到右上角“保存”按钮');

    const saveClickable = saveButton.closest?.('button, a, [role="button"]') || saveButton;
    saveClickable.classList.add('dxm-step-focus');
    setTimeout(() => saveClickable.classList.remove('dxm-step-focus'), 1000);
    await new Promise(resolve => setTimeout(resolve, 250));
    const beforeSaveUrl = location.href;
    window.dxmSetAutoPublishPhase?.('wireless_saving', {
        beforeSaveUrl,
        snapshotSignature: snapshot?.signature || ''
    });
    window.dxmStartWirelessSaveGuard(45000);
    let saveClicked = false;
    let saveClickSignal = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const latestSaveButton = attempt === 1
            ? saveClickable
            : (window.dxmFindClickableWirelessSaveButton() ||
                window.dxmFindWirelessEditorHeaderSaveButton?.() ||
                window.dxmFindNewMobileEditorTopControl('save'));
        saveClicked = await window.dxmClickWirelessSaveOnce(latestSaveButton);
        if (!saveClicked) {
            await new Promise(resolve => setTimeout(resolve, 180));
            continue;
        }
        saveClickSignal = await window.dxmWaitForWirelessSaveClickSignal(beforeSaveUrl, attempt === 1 ? 3600 : 2200);
        if (saveClickSignal) break;
        if (typeof window.dxmTrustedMouseClick === 'function') {
            const latestRect = latestSaveButton?.getBoundingClientRect?.();
            if (latestRect?.width > 0 && latestRect?.height > 0) {
                await window.dxmTrustedMouseClick(latestRect, latestRect).catch(() => false);
                saveClickSignal = await window.dxmWaitForWirelessSaveClickSignal(beforeSaveUrl, 1800);
                if (saveClickSignal) break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 180));
    }
    if (!saveClicked) throw new Error('无线端描述：未能点击右上角“保存”按钮');

    window.dxmShowWorkflowOverlay('正在等待无线端描述保存、页面刷新或跳回编辑页…');
    const startedAt = Date.now();
    while (Date.now() - startedAt < 18000) {
        if (!window.dxmIsInWirelessNewEditorFullscreen?.() && window.dxmFindWirelessPreviewContentRoot?.()) {
            break;
        }
        if (location.href !== beforeSaveUrl) {
            break;
        }
        const successDialog = window.dxmFindWirelessSaveSuccessDialog?.();
        if (successDialog) {
            await window.dxmHandleWirelessSaveSuccessDialog();
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 180));
    }
    const saveNavigation = await window.dxmWaitForWirelessSaveRefreshOrJump({
        beforeUrl: beforeSaveUrl,
        timeout: 22000,
        stableMs: 900
    });
    if (!saveNavigation.ok) {
        throw new Error('无线端描述：保存后未检测到页面刷新或跳回普通编辑页，暂不发布');
    }
    window.dxmSetAutoPublishPhase?.('wireless_saved_waiting_publish', {
        beforeSaveUrl,
        saveNavigation
    });
    return { snapshot, saveNavigation, saveClicked, saveClickSignal };
};

window.dxmValidateWirelessAfterSave = async function(expectedSnapshot, beforeSnapshot, template) {
    await window.dxmFocusWirelessDescription();
    const finalRoot = await window.waitForElement(
        () => window.dxmFindWirelessPreviewContentRoot(),
        { timeout: 8000, interval: 250 }
    );
    const finalSnapshot = window.dxmGetDescriptionSnapshot(finalRoot);
    return window.dxmTemplateTextMatches(template, finalSnapshot);
};

window.dxmRunWirelessDescriptionAuto = async function() {
    window.dxmEnableNoTranslateGuard();
    window.dxmSuppressTranslationWidgets();
    window.dxmShowWorkflowOverlay('正在自动生成无线端描述…');
    const wirelessAnchor = await window.dxmFocusWirelessDescription();
    await new Promise(resolve => setTimeout(resolve, 180));

    if (!window.dxmIsInWirelessNewEditorFullscreen()) {
        let opened = false;
        for (let attempt = 0; attempt < 4 && !opened; attempt += 1) {
            await window.dxmRevealWirelessEditorActions(wirelessAnchor);
            opened = await window.dxmClickFloatingNewWirelessEditorButton();
            if (!opened) {
                await window.dxmWaitForVisibleFloatingNewWirelessEditorButton(900);
                await new Promise(resolve => setTimeout(resolve, 180));
            }
            if (opened) {
                const fullscreenReady = await window.waitForElement(
                    () => window.dxmIsInWirelessNewEditorFullscreen() ? true : null,
                    { timeout: 5000, interval: 180 }
                );
                opened = !!fullscreenReady;
            }
        }
        if (!opened) throw new Error('无线端描述：未能自动点击“使用新版编辑器”进入新版编辑器');
    }

    await new Promise(resolve => setTimeout(resolve, 250));
    const generateMobile = await window.waitForElement(
        () => window.dxmFindNewMobileEditorTopControl('generate'),
        { timeout: 6000, interval: 150 }
    );
    if (!generateMobile) throw new Error('无线端描述：找不到“根据 PC 端描述一键生成”');
    const generateButton = generateMobile.closest?.('button, a, [role="button"]') || generateMobile;
    generateButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    generateButton.classList.add('dxm-step-focus');
    setTimeout(() => generateButton.classList.remove('dxm-step-focus'), 1000);
    await new Promise(resolve => setTimeout(resolve, 80));

    const beforeGenerateRoot = window.dxmFindWirelessNewEditorContentRoot() || window.dxmFindMobileGeneratedDescriptionRoot();
    const beforeGenerateSnapshot = window.dxmGetDescriptionSnapshot(beforeGenerateRoot);
    window.dxmStartWirelessGenerateConfirmGuard(45000);
    await window.dxmSafeElementClick(generateButton, generateButton);
    await new Promise(resolve => setTimeout(resolve, 120));
    await window.dxmConfirmWirelessGenerateDialog();

    window.dxmShowWorkflowOverlay('一键生成已确认，正在等待无线端内容稳定…');
    const generatedResult = await window.dxmWaitForWirelessRenderedOrSaveClickable(beforeGenerateSnapshot, 6500);
    if (!generatedResult.ready) {
        throw new Error('无线端描述：一键生成确认后内容仍未加载完成，暂不保存');
    }
    await new Promise(resolve => setTimeout(resolve, 1500));

    const stored = await window.dxmStorageGet(['dxmDescriptionTemplate', 'dxmDescriptionTemplateImageUrl']);
    const template = stored.dxmDescriptionTemplate || window.DXM_DEFAULT_DESCRIPTION_TEMPLATE;
    const templateImageUrl = stored.dxmDescriptionTemplateImageUrl || '';
    const saveResult = await window.dxmSaveWirelessEditorAndReturn({
        beforeSnapshot: beforeGenerateSnapshot,
        generatedSnapshot: generatedResult.snapshot,
        template,
        requireStable: false
    });

    window.dxmShowWorkflowOverlay('正在确认无线端描述已保存返回…');
    const returned = saveResult.saveNavigation?.ok || await window.dxmWaitForWirelessEditorReturn(15000);
    if (!returned) throw new Error('无线端描述：保存后未检测到页面刷新或返回');

    if (saveResult.saveNavigation?.previewReady) {
        const consistency = await window.dxmValidateWirelessAfterSave(
            saveResult.snapshot || generatedResult.snapshot,
            beforeGenerateSnapshot,
            template
        );
        if (!consistency.ok) throw new Error(`无线端描述：保存后核对失败，${consistency.reason}`);
    }
    window.dxmShowWorkflowOverlay('无线端描述已自动保存，正在准备发布…');
    return saveResult;
};

window.dxmApplyDescriptionTemplate = async function() {
    window.dxmEnableNoTranslateGuard();
    window.dxmSuppressTranslationWidgets();
    await window.dxmFocusStep('描述信息', { click: true, timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 180));

    const stored = await window.dxmStorageGet(['dxmDescriptionTemplate', 'dxmDescriptionTemplateImageUrl']);
    const template = stored.dxmDescriptionTemplate || window.DXM_DEFAULT_DESCRIPTION_TEMPLATE;
    const templateImageUrl = stored.dxmDescriptionTemplateImageUrl || '';

    // 只锁定同时包含“全屏”和“选择图片”的 PC 端描述编辑器工具栏。
    let pcContext = await window.waitForElement(
        () => window.dxmGetPcEditorContext(),
        { timeout: 4500, interval: 180 }
    );
    if (!pcContext?.wrapper || !pcContext.fullscreen || !pcContext.selectImage) {
        throw new Error('PC端描述：无法锁定包含“全屏/选择图片”的编辑器工具栏');
    }
    pcContext.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pcContext.wrapper.classList.add('dxm-step-focus');
    setTimeout(() => pcContext?.wrapper?.classList.remove('dxm-step-focus'), 1200);
    await new Promise(resolve => setTimeout(resolve, 120));
    pcContext.fullscreen.click();
    await window.waitForElement(
        () => window.dxmIsPcEditorFullscreen(window.dxmGetPcEditorContext()) ? true : null,
        { timeout: 2500, interval: 120 }
    );

    // 全屏可能重建 DOM，必须重新获取并验证真实状态。
    pcContext = window.dxmGetPcEditorContext();
    if (!window.dxmIsPcEditorFullscreen(pcContext)) {
        throw new Error('PC端描述：已点击“全屏”，但编辑器未进入全屏状态');
    }

    const editor = pcContext.editor;
    if (!editor) throw new Error('PC端描述：全屏后找不到编辑内容区域');
    window.dxmEnableNoTranslateGuard(editor);
    editor.setAttribute?.('translate', 'no');
    editor.classList?.add?.('notranslate');
    const editorAnchor = pcContext.iframe || pcContext.wrapper;
    editorAnchor?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    editorAnchor?.classList?.add('dxm-step-focus');
    setTimeout(() => editorAnchor?.classList?.remove('dxm-step-focus'), 1200);

    // 先覆盖旧模板：兼容旧插件写入但没有 data 标记的单行或多段模板。
    window.dxmRemoveExistingDescriptionTemplates(editor);

    const block = window.dxmCreateDescriptionTemplateBlock(editor.ownerDocument, template, templateImageUrl);
    editor.insertBefore(block, editor.firstChild || null);
    let imageInsertAnchor = window.dxmPlaceCaretAfterDescriptionTemplate(editor, block);
    window.dxmEnableNoTranslateGuard(editor);
    window.dxmSuppressTranslationWidgets();
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    try {
        // 全屏编辑器中的图片插入顺序：
        // 选择图片 → 引用产品图片 → 全部 → 选择。
        // 重新读取全屏后的编辑器，只点击它自己工具栏中的“选择图片”。
        pcContext = window.dxmGetPcEditorContext();
        if (!pcContext?.wrapper || !window.dxmIsPcEditorFullscreen(pcContext)) {
            throw new Error('PC端描述：插图前编辑器已退出全屏');
        }
        const pcSelectImage = window.dxmFindExactControl('选择图片', pcContext.wrapper);
        if (!pcSelectImage) throw new Error('PC端描述工具栏：找不到“选择图片”');
        if (pcContext.editor && block.isConnected) {
            imageInsertAnchor = window.dxmPlaceCaretAfterDescriptionTemplate(pcContext.editor, block);
        }
        imageInsertAnchor?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        pcSelectImage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pcSelectImage.classList.add('dxm-step-focus');
        setTimeout(() => pcSelectImage.classList.remove('dxm-step-focus'), 1200);
        await new Promise(resolve => setTimeout(resolve, 100));
        await window.dxmInsertProductImagesIntoPcDescription(pcSelectImage, imageInsertAnchor);
    } catch (error) {
        throw globalThis.DxmProductState.mapPcInsertError(error);
    }
    window.dxmShowWorkflowOverlay('PC 描述图片已插入，正在生成无线端描述…');

    pcContext = window.dxmGetPcEditorContext();
    if (pcContext?.editor) {
        window.dxmLastPcDescriptionSnapshot = window.dxmGetDescriptionSnapshot(pcContext.editor);
    }

    // 图片插入完成后，只在仍处于 PC 描述全屏时退出全屏；如果你已手动退出，则直接继续。
    if (pcContext?.wrapper && window.dxmIsPcEditorFullscreen(pcContext)) {
        const minimize = window.dxmFindExactControl('最小化', pcContext.wrapper) ||
            window.dxmFindExactControl('退出全屏', pcContext.wrapper) ||
            window.dxmFindExactControl('全屏', pcContext.wrapper);
        if (minimize) {
            (minimize.closest('button, a, [role="button"]') || minimize).click();
            await new Promise(resolve => setTimeout(resolve, 220));
        }
    }

    return await window.dxmRunWirelessDescriptionAuto();
};

window.dxmFindPublishSuccessDialog = function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const hasSuccessText = el => {
        const text = String(el.textContent || '');
        return text.includes('产品已提交发布') ||
            (text.includes('已提交发布') && (text.includes('发布中') || text.includes('发布失败') || text.includes('在线产品')));
    };
    const standard = Array.from(document.querySelectorAll(
        '.el-message-box, .el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"], [class*="message"], [class*="popup"], [class*="layer"]'
    )).find(modal => isVisible(modal) && hasSuccessText(modal));
    if (standard) return standard;

    const textNodeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
    );
    let textNode;
    while ((textNode = textNodeWalker.nextNode())) {
        if (!String(textNode.nodeValue || '').includes('已提交发布')) continue;
        let current = textNode.parentElement;
        for (let depth = 0; current && current !== document.body && depth < 8; depth += 1, current = current.parentElement) {
            if (!isVisible(current) || !hasSuccessText(current)) continue;
            const rect = current.getBoundingClientRect();
            if (rect.width >= 260 && rect.height >= 80 && rect.width <= window.innerWidth * 0.95) {
                return current;
            }
        }
    }
    return null;
};

window.dxmFindForbiddenPublishDialog = function() {
    const isVisible = el => {
        if (!el) return false;
        const rect = el.getBoundingClientRect?.();
        const style = getComputedStyle(el);
        return rect && rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    };
    const matchForbidden = modal => {
        const text = String(modal.innerText || modal.textContent || '');
        const compact = window.dxmNormalizeText(text);
        const hasForbiddenTitle = compact.includes('违禁词检测结果') || compact.includes('禁词检测结果') || compact.includes('违禁词');
        const hasDescriptionForbidden = compact.includes('描述违禁词') || compact.includes('描述禁词');
        const hasReturnEdit = compact.includes('返回修改');
        if (!hasForbiddenTitle || !hasDescriptionForbidden || !hasReturnEdit) return null;
        return { status: 'forbidden_description', modal, text };
    };
    const dialogs = Array.from(document.querySelectorAll(
        '.el-message-box, .el-dialog, .ant-modal, [role="dialog"], .modal, [class*="dialog"], [class*="modal"], [class*="message"], [class*="popup"], [class*="layer"]'
    )).filter(isVisible);
    const concrete = dialogs.map(matchForbidden).find(Boolean);
    if (concrete) return concrete;
    return isVisible(document.body) ? matchForbidden(document.body) : null;
};

window.dxmClickForbiddenReturnToEdit = async function(forbiddenResult) {
    const modal = forbiddenResult?.modal || forbiddenResult;
    if (!modal) throw Object.assign(new Error('发布失败：找不到违禁词检测弹窗'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    const button = window.dxmFindDialogActionControl?.('返回修改', modal, { preferFooter: true });
    if (!button) throw Object.assign(new Error('找不到“返回修改”'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    const rect = button.getBoundingClientRect();
    const clicked = await window.dxmTrustedMouseClick(rect, rect);
    if (!clicked) throw Object.assign(new Error('CDP 未能点击“返回修改”'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    const hidden = await window.waitForElement(
        () => !button.isConnected || !modal.isConnected || !window.dxmIsVisibleElement(modal) ? true : null,
        { timeout: 8000, interval: 100 }
    );
    if (!hidden) {
        throw Object.assign(new Error('返回修改后违禁词弹窗未消失'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    }
};

/**
 * 删除 UEditor 编辑器最后一张产品图片之后的所有内容（文本、表格等），保留模版和图片。
 */
window.dxmRemovePcDescriptionContentAfterProductImages = function(editor) {
    if (!editor) return 0;
    const doc = editor.ownerDocument || document;
    const productImages = Array.from(editor.querySelectorAll('img')).filter(img => {
        if (!img.isConnected || img.closest('[data-dxm-description-template="1"], [data-dxm-description-template-image="1"]')) return false;
        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        return !!src;
    });
    const lastProductImage = productImages[productImages.length - 1];
    const templateBlock = editor.querySelector('[data-dxm-description-template="1"]');
    const anchor = editor.querySelector('[data-dxm-image-insert-anchor="1"]');
    let keepNode = lastProductImage?.closest('p, div, section, article, figure, table') || lastProductImage || anchor || templateBlock;
    if (!keepNode || !editor.contains(keepNode)) return 0;

    let removed = 0;
    const removeFollowingSiblings = node => {
        let current = node?.nextSibling;
        while (current) {
            const next = current.nextSibling;
            current.parentNode?.removeChild(current);
            removed += 1;
            current = next;
        }
    };

    removeFollowingSiblings(keepNode);
    let current = keepNode.parentNode;
    while (current && current !== editor && editor.contains(current)) {
        removeFollowingSiblings(current);
        current = current.parentNode;
    }

    Array.from(editor.querySelectorAll('p, div, span')).reverse().forEach(node => {
        if (!node.textContent.trim() && !node.querySelector('img, video, iframe, table, br')) {
            node.remove();
            removed += 1;
        }
    });
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    doc.defaultView?.dispatchEvent?.(new Event('resize'));
    return removed;
};

window.dxmRepairForbiddenTail = async function(result, auth, productKey) {
    window.dxmShowWorkflowOverlay('检测到描述违禁词，正在返回修改并清理 PC 描述…');
    await window.dxmClickForbiddenReturnToEdit(result);
    await window.dxmWaitForAutoPublishEditReady?.(12000);
    await window.dxmFocusStep('描述信息', { click: true, timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 180));

    let pcContext = await window.waitForElement(
        () => window.dxmGetPcEditorContext(),
        { timeout: 4500, interval: 180 }
    );
    if (!pcContext?.wrapper || !pcContext.fullscreen || !pcContext.editor) {
        throw Object.assign(new Error('描述违禁词修复：无法锁定 PC 端描述编辑器（需要全屏和选择图片）'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    }
    if (!window.dxmIsPcEditorFullscreen(pcContext)) {
        pcContext.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 120));
        pcContext.fullscreen.click();
        const fullscreenReady = await window.waitForElement(
            () => window.dxmIsPcEditorFullscreen(window.dxmGetPcEditorContext()) ? true : null,
            { timeout: 2500, interval: 120 }
        );
        if (!fullscreenReady) {
            throw Object.assign(new Error('点击“全屏”后 PC 端描述未进入全屏'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
        }
    }
    pcContext = window.dxmGetPcEditorContext();
    if (!pcContext?.editor) {
        throw Object.assign(new Error('描述违禁词修复：全屏后找不到编辑内容区域'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });
    }
    const removed = window.dxmRemovePcDescriptionContentAfterProductImages(pcContext.editor);
    window.dxmLastPcDescriptionSnapshot = window.dxmGetDescriptionSnapshot(pcContext.editor);

    const minimize = window.dxmFindExactControl('最小化', pcContext.wrapper) ||
        window.dxmFindExactControl('退出全屏', pcContext.wrapper) ||
        window.dxmFindExactControl('全屏', pcContext.wrapper);
    if (minimize) {
        (minimize.closest('button, a, [role="button"]') || minimize).click();
        await new Promise(resolve => setTimeout(resolve, 220));
    }
    const minimized = await window.waitForElement(
        () => {
            const currentPcContext = window.dxmGetPcEditorContext();
            return currentPcContext?.wrapper && !window.dxmIsPcEditorFullscreen(currentPcContext)
                ? currentPcContext
                : null;
        },
        { timeout: 3000, interval: 120 }
    );
    if (!minimized) throw Object.assign(new Error('退出全屏后 PC 端描述仍处于全屏'), { code: 'DXM_PC_EDITOR_NOT_FOUND' });

    window.dxmShowWorkflowOverlay('已清理最后一张产品图片后的全部内容，正在重新生成无线端描述后再次发布…');
    await window.dxmRunWirelessDescriptionAuto();
};

window.dxmPublishCurrentProductWithForbiddenRetry = async function() {
    const productKey = window.dxmProductKeyFromUrl(location.href);
    const stored = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState || {};
    const activeChild = (stored.activeChildren || []).find(child => (child.key || window.dxmProductKeyFromUrl(child.url)) === productKey);
    const auth = { batchId: stored.visionSession?.batchId || '' };
    let repairState = activeChild?.forbiddenRepair || globalThis.DxmProductState.createForbiddenRepairState();
    const terminal = async (error, parsed = { words: [] }) => {
        const failure = { productId: productKey, productUrl: location.href, errorType: 'FORBIDDEN_WORD_REPAIR_FAILED', errorCode: error.code || 'FORBIDDEN_VERIFICATION_FAILED', forbiddenWords: parsed.words || [], wordHistory: repairState.wordHistory || [], stage: 'republish_after_forbidden_repair', message: String(error.message || error).slice(0, 300), repairAttempts: repairState.attempts || 0 };
        let ack;
        try { ack = await chrome.runtime.sendMessage({ action: 'dxm_persist_forbidden_failure_and_close', productKey, batchId: auth.batchId, failure }); }
        catch (_) { ack = null; }
        if (!ack?.persisted) throw Object.assign(new Error('违禁词失败信息未持久化，不关闭页面'), { code: 'DXM_FORBIDDEN_FAILURE_NOT_PERSISTED' });
        return { status: 'terminal_failed', persisted: true };
    };
    for (;;) {
        const publishResult = await window.dxmPublishCurrentProduct();
        if (publishResult?.status !== 'forbidden_description') return publishResult;
        const parsed = globalThis.DxmProductState.parseForbiddenDialog(publishResult.text);
        const transition = globalThis.DxmProductState.nextForbiddenRepair(repairState, parsed.words, parsed.rawText);
        repairState = transition.state;
        if (transition.action === 'terminal') {
            return terminal(Object.assign(new Error(transition.errorCode === 'FORBIDDEN_DIALOG_WORD_MISSING' ? '返回的描述违禁词没有具体词，需人工处理' : '两轮修复后仍存在描述违禁词'), { code: transition.errorCode }), parsed);
        }
        try { await window.dxmRepairForbiddenTail(publishResult, auth, productKey); }
        catch (error) { throw globalThis.DxmProductState.mapForbiddenRepairInfrastructureError(error); }
        repairState = { ...repairState, status: 'verified' };
        const verifiedAck = await chrome.runtime.sendMessage({ action: 'dxm_commit_state_patch', patch: { productKey, forbiddenRepair: repairState } }).catch(() => null);
        if (!verifiedAck?.success) throw globalThis.DxmProductState.mapForbiddenRepairInfrastructureError(Object.assign(new Error('违禁词校验状态持久化失败'), { code: 'DXM_FORBIDDEN_STATE_STALE' }));
    }
};

window.dxmPublishCurrentProduct = async function() {
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise(resolve => setTimeout(resolve, 160));

    const publishButton = await window.waitForElement(() => {
        return Array.from(document.querySelectorAll('button, [role="button"], .el-dropdown'))
            .filter(el => el.offsetWidth && el.offsetHeight)
            .filter(el => el.getBoundingClientRect().top < 260)
            .find(el => {
                const text = window.dxmNormalizeText(el.textContent);
                return text === '发布' || text.startsWith('发布');
            }) || null;
    }, { timeout: 6000, interval: 200 });
    if (!publishButton) throw new Error('找不到顶部“发布”下拉按钮');
    publishButton.classList.add('dxm-step-focus');
    setTimeout(() => publishButton.classList.remove('dxm-step-focus'), 1200);
    publishButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 120));

    const publishArrow = publishButton.querySelector(
        '.caret, .el-icon-arrow-down, .anticon-down, [class*="arrow"], [class*="dropdown"], [aria-haspopup="menu"]'
    ) || publishButton;
    publishArrow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    publishArrow.click();

    const publishNow = await window.waitForElement(() => {
        return Array.from(document.querySelectorAll(
            'li, [role="menuitem"], .el-dropdown-menu__item, .ant-dropdown-menu-item'
        )).find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            return window.dxmNormalizeText(el.textContent) === '立即发布';
        }) || null;
    }, { timeout: 6000, interval: 200 });
    if (!publishNow) throw new Error('找不到发布菜单项“立即发布”');
    publishNow.click();

    const publishResult = await window.waitForElement(() => {
        const forbiddenResult = window.dxmFindForbiddenPublishDialog();
        if (forbiddenResult) return forbiddenResult;
        const successModal = window.dxmFindPublishSuccessDialog();
        return successModal ? { status: 'published', modal: successModal } : null;
    }, { timeout: 16000, interval: 250 });
    if (!publishResult) throw new Error('未确认产品已提交发布');
    if (publishResult?.status === 'forbidden_description') return publishResult;

    const closeButton = Array.from(publishResult.modal.querySelectorAll('button, a, [role="button"], span, div'))
        .find(el => {
            if (!el.offsetWidth || !el.offsetHeight) return false;
            return window.dxmNormalizeText(el.textContent) === '关闭';
        });
    if (!closeButton) throw new Error('发布成功，但找不到成功提示中的“关闭”按钮');
    (closeButton.closest('button, a, [role="button"]') || closeButton).click();
    await new Promise(resolve => setTimeout(resolve, 180));
    return publishResult;
};

async function dxmSafePublishClick() {
  var stateData = await window.dxmStorageGet(['dxmPublishState']);
  var state = stateData.dxmPublishState;
  if (!state || !state.running) return false;
  var productKey = window.dxmProductKeyFromUrl(location.href);
  var children = state.activeChildren || [];
  var found = null;
  for (var i = 0; i < children.length; i++) {
    var ck = children[i].key || window.dxmProductKeyFromUrl(children[i].url);
    if (ck === productKey) { found = children[i]; break; }
  }
  if (found && found.publishState === 'publish_unknown') {
    var gateErr = new Error('已请求发布但结果未确认，禁止重复点击');
    gateErr.code = 'PUBLISH_UNKNOWN_GATE';
    throw gateErr;
  }
  return true;
}

window.dxmSafePublishClick = dxmSafePublishClick;

window.dxmRunAutoPublishProduct = async function() {
    if (window._dxmRunAutoPublishProductBusy) return;
    window._dxmRunAutoPublishProductBusy = true;
    try {
        window.dxmEnableNoTranslateGuard();
        window.dxmSuppressTranslationWidgets();
        const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        if (!state?.running) return;

        const overlay = window.dxmShowWorkflowOverlay('正在执行：中文翻译英文…');
        const setMessage = text => {
            const node = document.getElementById('dxm-workflow-message');
            if (node) node.textContent = text;
        };

        // 预取云模型信息，用于信息框显示
        (async function() {
            if (window._dxmCachedModelLabel) return;
            try {
                var res = await fetch('http://127.0.0.1:8765/api/v1/vision/providers', { signal: AbortSignal.timeout(3000) });
                var data = await res.json();
                var active = data.active_provider || '';
                var info = data.providers?.[active];
                var labels = {qwen:'Qwen','qwen3-vl-flash':'Qwen3-VL',gemini:'Gemini',glm:'GLM-4.6V','glm-4v':'GLM-4V',agnes:'Agnes'};
                window._dxmCachedModelLabel = labels[active] || active;
                window._dxmCachedModelId = info?.model_id || '';
                var n = document.getElementById('dxm-workflow-model');
                if (n && window._dxmCachedModelLabel && window._dxmCachedModelId) {
                    n.textContent = '🤖 ' + window._dxmCachedModelLabel + ' · ' + window._dxmCachedModelId;
                }
            } catch(_) {}
        })();

        await window.dxmRunTranslateWithPcVerification();
        setMessage('正在执行：一键优化与 800×800 图片处理…');
        await window.dxmFocusStep('一键优化', { timeout: 5000 });
        await window.triggerImageResize();

        // 800×800 处理完成后紧接着自动去水印，不停下来等人工确认——
        // 检测(OCR+云视觉图形logo) -> 店小秘AI消除 -> 合成自有水印 ->
        // 归档原图/成品到 ~/Documents/速卖通自动化/{商品id}/ -> 写回主图。
        // 失败走下面统一的 catch（记录 lastError、跳过这个商品、批次继续），
        // 不额外新增暂停逻辑。
        setMessage('正在去除图片水印…');
        const watermarkResult = await window.dxmRunWatermarkForAutoPublish({
            onProgress: update => {
                const node = document.getElementById('dxm-workflow-message');
                if (node) {
                    const progress = Number.isFinite(update.imageIndex) ? `[${update.imageIndex + 1}/${update.imageCount}]` : '';
                    const stageText = {
                        start: `正在去除图片水印…（共 ${update.total} 张）`,
                        fetching: `正在拉取原图 ${progress}…`,
                        detecting: `正在检测水印 ${progress}…`,
                        excluded: `跳过宣传/展会图 ${progress}…`,
                        removing_watermark: `正在消除水印 ${progress}…`,
                        downloading: `正在下载处理结果 ${progress}…`,
                        applying_watermark: `正在合成自有水印 ${progress}…`,
                        done: `已完成 ${progress}`,
                        clearing: '正在清空原图…',
                        uploading: `正在写回 ${update.count} 张处理后的图片…`,
                        finished: '去水印完成'
                    }[update.stage];
                    if (stageText) node.textContent = stageText;
                }
                // 逐张图的进度作为一条日志推进滚动信息流（带imageIndex的阶段）；
                // start/clearing/uploading/finished 这类整体阶段单独推一条汇总日志。
                if (Number.isFinite(update.imageIndex)) {
                    window.dxmUpdateWorkflowImageProgress?.(update);
                } else {
                    const summary = {
                        start: `开始去水印，共 ${update.total} 张`,
                        clearing: '清空原图，准备写回',
                        uploading: `写回 ${update.count} 张处理后的图片`,
                        finished: '去水印完成'
                    }[update.stage];
                    if (summary) window.dxmPushWorkflowLog?.(summary, update.stage === 'finished' ? 'done' : '');
                }
            }
        });
        window.dxmLastWatermarkResult = { status: 'success', ...watermarkResult, at: Date.now() };

        overlay.remove();

        const continued = await window.dxmWaitForImageReview();
        if (!continued) return;

        window.dxmShowWorkflowOverlay('正在生成营销图片…');
        await window.dxmRegenerateMarketingImage();

        window.dxmShowWorkflowOverlay('正在写入 PC 描述模板…');
        await window.dxmApplyDescriptionTemplate();

        document.getElementById('dxm-workflow-message').textContent = '准备发布当前商品…';
        const publishOutcome = await window.dxmPublishCurrentProductWithForbiddenRetry();
        if (publishOutcome?.status === 'terminal_failed') return;

        const latest = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        const productUrl = window.dxmNormalizeAutoPublishUrl(location.href);
        const productKey = window.dxmProductKeyFromUrl(productUrl);
        const completedUrls = [
            ...((latest.completedUrls || []).filter(Boolean)),
            productUrl
        ].filter((url, index, arr) => {
            const key = window.dxmProductKeyFromUrl(url);
            return arr.findIndex(item => window.dxmProductKeyFromUrl(item) === key) === index;
        }).slice(-500);
        const activeChildren = (latest.activeChildren || []).filter(child => {
            const key = child.key || window.dxmProductKeyFromUrl(child.url);
            return key !== productKey;
        });
        await window.dxmStorageSet({
            dxmPublishState: {
                ...latest,
                activeChildren,
                activeChild: activeChildren.length > 0,
                processed: (latest.processed || 0) + 1,
                completedUrls,
                lastCompletedAt: Date.now(),
                lastCompletedUrl: productUrl
            }
        });
        window.dxmClearAutoPublishPhase?.();
        chrome.runtime.sendMessage({ action: 'schedule_auto_publish_tabs' });
        chrome.runtime.sendMessage({ action: 'close_tab' });
    } catch (error) {
  var classified = null;
  if (typeof globalThis !== 'undefined' && globalThis.DxmError) {
    classified = globalThis.DxmError.CLASSIFY(error);
  }
  var isPermanent = classified && classified.category === 'permanent';
  var code = classified ? classified.code : (error.code || 'UNKNOWN');

  if (globalThis.DxmProductState.shouldPreservePageForError(error.code)) {
    window.dxmPushWorkflowLog('❌ 违禁词修复未完成，为保留现场不关闭页面：' + error.message, 'excluded');
    return;
  }

  window.dxmPushWorkflowLog(
    isPermanent
      ? '❌ 商品无效（' + code + '）：' + error.message
      : '⚠️ 瞬态错误（' + code + '），稍后重试：' + error.message,
    isPermanent ? 'excluded' : ''
  );

  // Send state patch to background
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    var productKey = window.dxmProductKeyFromUrl ? window.dxmProductKeyFromUrl(location.href) : '';
    chrome.runtime.sendMessage({
      action: 'dxm_commit_state_patch',
      patch: {
        productKey: productKey,
        productState: isPermanent ? 'invalid_material' : 'abnormal_transient',
        errorCode: code,
        errorMessage: error.message,
      }
    });
    // Wait briefly for state write to complete before closing
    await new Promise(function(resolve) { setTimeout(resolve, 250); });
  }

  if (typeof window !== 'undefined' && window.close) {
    window.close();
  }
  return;
    } finally {
        window._dxmRunAutoPublishProductBusy = false;
    }
};

window.dxmWaitForAutoPublishEditReady = function(timeout = 18000) {
    return window.waitForElement(() => {
        if (!String(location.href || '').toLowerCase().includes('/web/smt/edit')) return null;
        if (document.readyState === 'loading') return null;
        const text = String(document.body?.innerText || '');
        if (text.includes('基本信息') || text.includes('产品信息') ||
            text.includes('描述信息') || text.includes('商品信息') ||
            text.includes('产品标题')) {
            return true;
        }
        return document.querySelector('input, textarea, [contenteditable="true"]') ? true : null;
    }, { timeout, interval: 250 });
};

window.dxmStartAutoPublishChildFromMessage = async function() {
    if (!String(location.href || '').toLowerCase().includes('/web/smt/edit')) return false;
    const hasUrlFlag = new URL(location.href).searchParams.get('dxm_auto_publish') === '1';
    const isActiveChild = await window.dxmIsCurrentAutoPublishChild?.();
    if (!hasUrlFlag && !isActiveChild) return false;
    await window.dxmWaitForAutoPublishEditReady();
    window.dxmSetAutoPublishPhase?.('full_auto_publish_started');
    setTimeout(() => {
        window.dxmRunAutoPublishProduct().catch(error => {
            console.error('[待发布自动化] 子流程启动失败：', error);
        });
    }, 0);
    return true;
};

if (!window._dxmAutoPublishMessageListenerInstalled) {
    window._dxmAutoPublishMessageListenerInstalled = true;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.action !== 'dxm_start_auto_publish_child') return false;
        window.dxmStartAutoPublishChildFromMessage()
            .then(started => sendResponse({ success: true, started }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    });
}

window.dxmResumeAutoPublishAfterWirelessReload = async function() {
    if (window._dxmResumeAutoPublishAfterWirelessReloadBusy) return;
    window._dxmResumeAutoPublishAfterWirelessReloadBusy = true;
    try {
        const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        if (!state?.running) return;
        const phase = window.dxmGetAutoPublishPhase?.();
        const currentKey = window.dxmProductKeyFromUrl(location.href);
        const isActiveChild = (state.activeChildren || []).some(child => {
            const key = child.key || window.dxmProductKeyFromUrl(child.url);
            return key && key === currentKey;
        });
        if (!isActiveChild) return;

        window.dxmEnableNoTranslateGuard();
        window.dxmSuppressTranslationWidgets();
        if (window.dxmIsInWirelessNewEditorFullscreen?.()) {
            window.dxmShowWorkflowOverlay('检测到无线端编辑器已打开，正在补点保存并等待返回…');
            const root = window.dxmFindWirelessNewEditorContentRoot?.() || window.dxmFindMobileGeneratedDescriptionRoot?.();
            const snapshot = root ? window.dxmGetDescriptionSnapshot(root) : null;
            await window.dxmSaveWirelessEditorAndReturn({
                generatedSnapshot: snapshot,
                requireStable: false
            });
        } else if (phase?.phase === 'wireless_saving' || phase?.phase === 'wireless_saved_waiting_publish') {
            window.dxmShowWorkflowOverlay('检测到无线端已保存返回，正在继续发布…');
            const returned = await window.dxmWaitForWirelessEditorReturn(12000);
            if (!returned && !String(location.href || '').toLowerCase().includes('/web/smt/edit')) {
                throw new Error('无线端保存后未返回商品编辑页，暂不发布');
            }
        } else {
            return;
        }

        window.dxmSetAutoPublishPhase?.('publishing_after_wireless_save');
        const publishOutcome = await window.dxmPublishCurrentProductWithForbiddenRetry();
        if (publishOutcome?.status === 'terminal_failed') return;

        const latest = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        const productUrl = window.dxmNormalizeAutoPublishUrl(location.href);
        const productKey = window.dxmProductKeyFromUrl(productUrl);
        const completedUrls = [
            ...((latest.completedUrls || []).filter(Boolean)),
            productUrl
        ].filter((url, index, arr) => {
            const key = window.dxmProductKeyFromUrl(url);
            return arr.findIndex(item => window.dxmProductKeyFromUrl(item) === key) === index;
        }).slice(-500);
        const activeChildren = (latest.activeChildren || []).filter(child => {
            const key = child.key || window.dxmProductKeyFromUrl(child.url);
            return key !== productKey;
        });
        await window.dxmStorageSet({
            dxmPublishState: {
                ...latest,
                activeChildren,
                activeChild: activeChildren.length > 0,
                processed: (latest.processed || 0) + 1,
                completedUrls,
                lastCompletedAt: Date.now(),
                lastCompletedUrl: productUrl
            }
        });
        window.dxmClearAutoPublishPhase?.();
        chrome.runtime.sendMessage({ action: 'schedule_auto_publish_tabs' });
        chrome.runtime.sendMessage({ action: 'close_tab' });
    } catch (error) {
        console.error('[待发布自动化恢复]', error);
        const latest = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
        const productKey = window.dxmProductKeyFromUrl(location.href);
        const activeChildren = (latest?.activeChildren || []).filter(child => {
            const key = child.key || window.dxmProductKeyFromUrl(child.url);
            return key !== productKey;
        });
        await window.dxmStorageSet({
            dxmPublishState: {
                ...latest,
                running: latest?.running !== false,
                activeChildren,
                activeChild: activeChildren.length > 0,
                failed: (latest?.failed || 0) + 1,
                lastError: error.message,
                lastChildFailedAt: Date.now()
            }
        });
        window.dxmClearAutoPublishPhase?.();
        chrome.runtime.sendMessage({ action: 'schedule_auto_publish_tabs' });
        alert(`自动发布恢复失败：${error.message}`);
    } finally {
        window._dxmResumeAutoPublishAfterWirelessReloadBusy = false;
    }
};

window.dxmRefreshListControlsForCurrentPage = function() {
    if (!document.body) return;
    if (!window.dxmIsOfflinePublishListPage()) {
        window.dxmRemoveListControlsIfWrongPage();
        return;
    }
    window.dxmRenderListControls();
    window.dxmRefreshStartButton();
};

window.initDxmPublishAutomation = function() {
    const url = location.href.toLowerCase();

    // 只在"待发布"列表页或带 dxm_auto_publish=1 的编辑页执行，
    // 普通编辑页什么都不做，避免干扰页面自身功能（如"一键翻译"）。
    const isOfflineList = window.dxmIsOfflinePublishListPage();
    const isAutoPublishEdit = url.includes('/web/smt/edit') &&
        new URL(location.href).searchParams.get('dxm_auto_publish') === '1';
    if (!isOfflineList && !isAutoPublishEdit) return;

    if (isAutoPublishEdit) {
        window.dxmEnableNoTranslateGuard();
        window.dxmSuppressTranslationWidgets();
        // 自动化编辑页定时防护，防止翻译组件干扰
        if (!window._dxmTranslateWidgetSuppressTimer) {
            window._dxmTranslateWidgetSuppressTimer = setInterval(() => {
                const stillAuto = location.href.includes('/web/smt/edit') &&
                    (new URL(location.href).searchParams.get('dxm_auto_publish') === '1' ||
                        !!window.dxmGetAutoPublishPhase?.());
                if (stillAuto) {
                    window.dxmEnableNoTranslateGuard();
                    window.dxmSuppressTranslationWidgets();
                }
            }, 800);
        }
    }

    window.dxmRefreshListControlsForCurrentPage();
    [300, 900, 1800, 3600].forEach(delay => {
        setTimeout(window.dxmRefreshListControlsForCurrentPage, delay);
    });
    setInterval(function() {
        if (window.dxmIsOfflinePublishListPage()) {
            window.dxmRefreshListControlsForCurrentPage();
        }
    }, 5000);
    if (isOfflineList) {
        // 以下代码只在待发布列表页执行（列表页按钮、发布调度、存储监听）
        if (!window._dxmPublishAutomationObserver && document.body) {
            window._dxmPublishAutomationObserver = new MutationObserver(() => {
                clearTimeout(window._dxmPublishAutomationInjectTimer);
                window._dxmPublishAutomationInjectTimer = setTimeout(window.dxmRefreshListControlsForCurrentPage, 160);
            });
            window._dxmPublishAutomationObserver.observe(document.body, { childList: true, subtree: true });
        }
        setTimeout(() => {
            window.dxmProcessNextPendingProduct();
        }, 500);
        if (!window._dxmPublishAutomationContinueTimer) {
            window._dxmPublishAutomationContinueTimer = setInterval(async () => {
                const state = (await window.dxmStorageGet(['dxmPublishState'])).dxmPublishState;
                if (state?.running && (state.pendingQueue || []).length) {
                    window.dxmProcessNextPendingProduct();
                }
                window.dxmRefreshListControlsForCurrentPage();
            }, 1500);
        }
        if (!window._dxmPublishStorageListenerInstalled) {
            window._dxmPublishStorageListenerInstalled = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes.dxmPublishState) return;
                const previous = changes.dxmPublishState.oldValue;
                const current = changes.dxmPublishState.newValue;
                const previousActive = (previous?.activeChildren || []).length;
                const currentActive = (current?.activeChildren || []).length;
                const maxConcurrent = Number(current?.maxConcurrent || window.DXM_AUTO_PUBLISH_MAX_CONCURRENT || 5);
                if (current?.running &&
                    (current.lastCompletedAt !== previous?.lastCompletedAt ||
                        current.lastActiveTabClosedAt !== previous?.lastActiveTabClosedAt ||
                        currentActive < maxConcurrent ||
                        currentActive < previousActive)) {
                    setTimeout(window.dxmProcessNextPendingProduct, 300);
                }
                setTimeout(window.dxmRefreshStartButton, 300);
            });
        }
    }
    if (url.includes('/web/smt/edit')) {
        setTimeout(async () => {
            const hasUrlFlag = new URL(location.href).searchParams.get('dxm_auto_publish') === '1';
            const phase = window.dxmGetAutoPublishPhase?.();
            const isActiveChild = await window.dxmIsCurrentAutoPublishChild?.();
            if (hasUrlFlag) {
                await window.dxmStartAutoPublishChildFromMessage();
                return;
            }
            if (isActiveChild && (
                phase?.phase === 'wireless_saving' ||
                phase?.phase === 'wireless_saved_waiting_publish' ||
                phase?.phase === 'publishing_after_wireless_save' ||
                window.dxmIsInWirelessNewEditorFullscreen?.()
            )) {
                await window.dxmResumeAutoPublishAfterWirelessReload();
            }
        }, 1200);
    }
};

window.initDxmPublishAutomation();

// --- 调试桥接（仅在 F12 手动发送事件时触发，不影响正常页面行为） ---
// 用法（F12 Console 直接运行）：
//   document.body.dispatchEvent(new CustomEvent('dxm', {detail: 'btn'}));     // 查找一键翻译按钮
//   document.body.dispatchEvent(new CustomEvent('dxm', {detail: 'bi'}));      // 按钮位置信息
//   document.body.dispatchEvent(new CustomEvent('dxm', {detail: 'menu'}));    // 查找菜单项
//   document.body.dispatchEvent(new CustomEvent('dxm', {detail: 'dropdown'}));// background 打开下拉
(function() {
    if (document.getElementById('dxm-panel')) return;
    var panel = document.createElement('div');
    panel.id = 'dxm-panel';
    panel.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:999999;background:rgba(0,0,0,0.85);color:#0f0;padding:8px 14px;font:13px/1.5 monospace;max-width:70vw;max-height:280px;overflow:auto;border-radius:6px;display:none;white-space:pre-wrap;word-break:break-all;pointer-events:none;';
    document.body.appendChild(panel);
    function _show(msg, isErr) {
        panel.style.display = 'block';
        panel.textContent = (isErr ? '❌ ' : '✅ ') + new Date().toLocaleTimeString() + ' ' + String(msg || '').slice(0, 500);
        panel.style.color = isErr ? '#ff6b6b' : '#0f0';
        setTimeout(function(){ panel.style.display = 'none'; }, 12000);
    }
    document.body.addEventListener('dxm', async function(evt) {
        var cmd = (evt.detail && evt.detail.cmd) || (typeof evt.detail === 'string' ? evt.detail : '');
        if (!cmd) return;
        _show('执行中...');
        try {
            var result;
            if (cmd === 'btn') {
                var b = window.dxmFindTopTranslateTrigger();
                result = b ? '✅ ' + b.tagName + ' ' + b.className.slice(0,40) : '❌ 未找到';
            } else if (cmd === 'bi') {
                var b = document.querySelector('.translation-btn,.ant-btn-primary.translation-btn');
                if (!b) result = '❌ 未找到';
                else { var r = b.getBoundingClientRect();
                    result = 'w=' + Math.round(r.width) + ' h=' + Math.round(r.height) + ' top=' + Math.round(r.top) + ' left=' + Math.round(r.left); }
            } else if (cmd === 'menu') {
                var b = window.dxmFindTopTranslateTrigger();
                if (!b) result = '❌ 先找按钮';
                else result = window.dxmFindTranslateZhEnOption(b) ? '✅ 找到菜单项' : '❌ 未找到菜单项';
            } else if (cmd === 'dropdown') {
                chrome.runtime.sendMessage({action: 'dxm_open_dropdown'}, function(resp) {
                    _show(resp && resp.success ? '✅ ' + (resp.result||'done') : '❌ ' + (resp?.msg||'no response'));
                });
                return;
            } else if (cmd.indexOf('exec ') === 0) {
                var code = cmd.slice(5);
                chrome.runtime.sendMessage({action: 'dxm_open_dropdown', _exec: code}, function(resp) {
                    _show(resp && resp.success ? '✅ ' + (resp.result||'done') : '❌ ' + (resp?.msg||'no response'));
                });
                return;
            }
            _show(result !== undefined ? String(result).slice(0,400) : 'ok');
        } catch(e) { _show(e.message, true); }
    });
})();

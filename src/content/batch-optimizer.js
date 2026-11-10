// ============================================
// batch-optimizer.js — 批量标题优化、SKU 操作
// ============================================

// ---- 虚拟表格引擎（合并自 dist v2.0.126 生产热修版）----

window.showGlobalLockOverlay = function (message) {
    let overlay = document.getElementById('ai-global-lock-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ai-global-lock-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '100px';
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
        overlay.style.padding = '12px 24px';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.borderRadius = '8px';
        overlay.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = '#fff';
        overlay.style.fontSize = '14px';
        overlay.style.fontWeight = 'bold';
        overlay.style.pointerEvents = 'none';
        overlay.style.userSelect = 'none';
        overlay.style.backdropFilter = 'blur(4px)';
        overlay.style.whiteSpace = 'pre-wrap';
        overlay.style.textAlign = 'center';
        overlay.style.transition = 'opacity 0.3s';
        document.body.appendChild(overlay);
    }
    overlay.innerText = message || '⏳ 正在处理中...';
};

window.hideGlobalLockOverlay = function () {
    const overlay = document.getElementById('ai-global-lock-overlay');
    if (overlay) overlay.remove();
};

window.findScrollContainer = function () {
    const candidates = [
        document.querySelector('.el-table__body-wrapper'),
        document.querySelector('.table-responsive'),
        document.querySelector('.main-content'),
        document.documentElement,
        document.body
    ].filter(Boolean);
    return candidates.find(c => c.scrollHeight > c.clientHeight) || candidates[0] || document.documentElement;
};

// 快速预扫：以固定步长遍历滚动容器，强制 Vue 挂载屏幕外的虚拟行。
window.preloadAllRows = async function () {
    const scrollContainer = window.findScrollContainer();
    const originalScrollTop = scrollContainer.scrollTop;
    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const step = 300;

    let currentScroll = 0;
    while (true) {
        scrollContainer.scrollTop = currentScroll;
        window.dispatchEvent(new Event('scroll'));
        await new Promise(r => setTimeout(r, 30));

        if (currentScroll >= maxScroll) break;
        currentScroll = Math.min(maxScroll, currentScroll + step);
    }

    scrollContainer.scrollTop = originalScrollTop;
    window.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 30));
};

// 全景滚动扫描器：逐段滚动并回调可见数据，触底 3 次后停止并复位。
window.virtualTableScanner = async function (onVisibleData, onFinish) {
    const container = window.findScrollContainer();
    container.scrollTop = 0;
    await new Promise(r => setTimeout(r, 400));

    let lastScrollTop = -1;
    let bottomHitCount = 0;
    let maxLoops = 200;

    while (maxLoops-- > 0) {
        await onVisibleData();

        const step = Math.max(200, (container.clientHeight || window.innerHeight) * 0.5);
        container.scrollTop += step;
        await new Promise(r => setTimeout(r, 400));

        if (container.scrollTop <= lastScrollTop || container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
            bottomHitCount++;
        } else {
            bottomHitCount = 0;
        }

        lastScrollTop = container.scrollTop;
        if (bottomHitCount >= 3) break;
    }

    container.scrollTop = 0;
    await new Promise(r => setTimeout(r, 400));
    if (onFinish) await onFinish();
};

// 多级输入框激活：优先直取，其次点击 data-v- 编辑节点并轮询 Vue 插入 textarea，
// 再退化为双击、同行检索、activeElement 与 popover 输入框兜底。
window.findAndActivateTitleInput = async function (cell, skipScroll = false) {
    if (!cell) return null;

    const inputSelector = 'textarea, input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), .el-input__inner, .el-textarea__inner';

    let input = cell.querySelector(inputSelector);
    if (input) return input;

    const row = cell.closest ? cell.closest('tr') : null;
    const clickTarget = cell.querySelector('div[data-v-], p:not(.gray-b), p, div.cell, .cell, .product-title') || cell;

    if (!skipScroll && clickTarget.scrollIntoView) {
        clickTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
        await new Promise(r => setTimeout(r, 40));
    }

    const rect = clickTarget.getBoundingClientRect();
    const commonOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.max(0, rect.left + rect.width / 2),
        clientY: Math.max(0, rect.top + rect.height / 2)
    };

    try {
        clickTarget.dispatchEvent(new MouseEvent('mousedown', commonOpts));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', commonOpts));
        clickTarget.dispatchEvent(new MouseEvent('click', commonOpts));
    } catch (_) { }
    if (typeof clickTarget.click === 'function') {
        try { clickTarget.click(); } catch (_) { }
    }
    if (typeof clickTarget.focus === 'function') {
        try { clickTarget.focus(); } catch (_) { }
    }

    for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(r => setTimeout(r, 40));
        input = cell.querySelector(inputSelector);
        if (input) return input;
    }

    try {
        clickTarget.dispatchEvent(new MouseEvent('dblclick', commonOpts));
    } catch (_) { }
    for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 40));
        input = cell.querySelector(inputSelector);
        if (input) return input;
    }

    if (row) {
        input = row.querySelector(inputSelector);
        if (input) return input;
    }

    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        return active;
    }

    const popoverInput = document.querySelector('.el-popover:not([style*="display: none"]) textarea, .el-popover:not([style*="display: none"]) input, .el-table__body-wrapper textarea:focus, .el-table__body-wrapper input:focus');
    if (popoverInput) return popoverInput;

    return null;
};

// 通过原生 setter 写入并派发 input/change/blur，确保 Vue 响应式更新。
window.setReactiveInputValue = function (input, value) {
    if (!input) return;
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) nativeSetter.set.call(input, value);
    else input.value = value;
    try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {
        console.warn('[批量优化] 事件派发被页面框架拦截（已安全忽略）：', e);
    }
};

// ---- 虚拟表格引擎结束 ----

window.sanitizeSkuCode = function(code) {
    let c = String(code || '').replace(/[^a-zA-Z0-9 \(\)\.\-\/\*"]/g, '');
    if (c.length > 49) c = c.substring(0, 49).trim();
    return c.replace(/[\.\-\( ]+$/, '');
};

window.getSingleProductVariantInputs = function() {
    let inputs = [];
    const ths = document.querySelectorAll('th, td, div.cell');
    let targetTh = null;
    for (let th of ths) {
        if (th.innerText && (th.innerText.includes(window.UI_TEXT_CONFIG.customName) || th.innerText.replace(/\s/g, '').includes(window.UI_TEXT_CONFIG.skuCode) || th.innerText.includes('SKU'))) {
            targetTh = th.closest('th') || th.closest('td') || th;
            if (targetTh.getBoundingClientRect().width > 0) {
                break;
            }
        }
    }

    if (targetTh) {
        const headerRect = targetTh.getBoundingClientRect();
        const centerX = headerRect.left + headerRect.width / 2;
        const tableContainer = targetTh.closest('.el-table') || targetTh.closest('table') || document;
        const allInputs = tableContainer.querySelectorAll('input[type="text"], input:not([type]), textarea');

        allInputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                if (rect.top >= headerRect.top - 10) {
                    if (centerX >= rect.left && centerX <= rect.right) {
                        inputs.push(input);
                    }
                }
            }
        });
    }
    return inputs;
};
window.startOptimizeSingleProductVariants = async function() {
    const inputs = window.getSingleProductVariantInputs().filter(input => input.value.trim().length > 0);

    if (inputs.length === 0) {
        alert("😭 雷达扫描失败：未能在这页找到任何【自定义名称】的有效输入框。");
        return;
    }

    if (!confirm(`🚀 锁定成功！探测到这页有 ${inputs.length} 个【自定义变体名称】需要被优化。\n\n按【确认】后，将动用千问 AI 模型极速缩放清洗到49字符以内！`)) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'ai-toast';
    toast.innerText = `⏳ 千问模型极速处理中... (${inputs.length} 个词条)`;
    document.body.appendChild(toast);

    const rawNames = inputs.map(input => input.value.trim());

    const triggerReactInput = (inp, val) => {
        inp.value = val;
        inp.dispatchEvent(new Event('input', {bubbles: true}));
        inp.dispatchEvent(new Event('change', {bubbles: true}));
        inp.dispatchEvent(new Event('blur', {bubbles: true}));
        let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (nativeSetter && nativeSetter.set) {
            nativeSetter.set.call(inp, val);
            inp.dispatchEvent(new Event('input', {bubbles: true}));
            inp.dispatchEvent(new Event('change', {bubbles: true}));
        }
    };

    const inputsToOptimize = [];
    const inputsToOptimizeIndices = [];

    for (let i = 0; i < inputs.length; i++) {
        let val = inputs[i].value.trim();
        val = val.replace(/(\d{3})[Xx]\d{2,3}\s+(\d{3})[Xx]\d{2,3}/g, "$1/$2");
        val = val.replace(/（/g, '(').replace(/）/g, ')');

        const isFullySafe = window.SkuMapping && window.SkuMapping.isCodeCompliant
            ? window.SkuMapping.isCodeCompliant(val)
            : !/[\u4e00-\u9fa5]/.test(val) && val.length <= 49 && !/[^a-zA-Z0-9 \(\)\.\-\/\*"]/.test(val);
        const localCode = window.SkuMapping && window.SkuMapping.normalizeProductCode
            ? window.SkuMapping.normalizeProductCode(val)
            : '';

        if (isFullySafe) {
            triggerReactInput(inputs[i], val);
        } else if (localCode) {
            triggerReactInput(inputs[i], localCode);
        } else {
            inputsToOptimize.push(val);
            inputsToOptimizeIndices.push(i);
        }
    }

    if (inputsToOptimize.length === 0) {
        toast.innerText = `🎉 恭喜！判定全部合规！无需动用AI干预，极速填表完成！`;
        setTimeout(()=>toast.remove(), 4000);
        return;
    }

    toast.innerText = `⏳ 极速体检：拦截了 ${inputsToOptimize.length} 条违规长属性交由千问 AI 抢救... (${inputs.length - inputsToOptimize.length}条秒过原生保护)`;

    chrome.runtime.sendMessage({
        action: "bulk_optimize_product_codes",
        codes: inputsToOptimize
    }, async (response) => {
        if(chrome.runtime.lastError) {
             toast.innerText = "❌ 管线通信失败，请检查网络";
             setTimeout(()=>toast.remove(), 3000);
             return;
        }

        if (response && response.success) {
            const newNames = response.codes;
            toast.innerText = `✅ 千问 AI 处理完成！正在全自动填表...`;

            for(let j = 0; j < inputsToOptimizeIndices.length; j++) {
                const i = inputsToOptimizeIndices[j];
                const input = inputs[i];
                let newT = newNames[j];
                if (!newT) {
                    newT = inputsToOptimize[j].substring(0, 49);
                }

                newT = window.sanitizeSkuCode(newT);
                triggerReactInput(input, newT);
            }
            toast.innerText = `🎉 恭喜大满贯！所有属性词条均已通过极致净化，绿灯放行！`;
            setTimeout(()=>toast.remove(), 4000);
        } else {
            console.error(response);
            toast.innerText = "❌ 报错：" + (response ? response.msg : "未知错误");
            setTimeout(()=>toast.remove(), 5000);
        }
    });
};
window.getTitleHeader = function() {
    const ths = document.querySelectorAll('th, td, div.cell');
    for (let th of ths) {
        if (th.innerText && th.innerText.replace(/\s/g, '').includes(window.UI_TEXT_CONFIG.productTitle)) {
            const titleHeader = th.closest('th') || th.closest('td');
            if (titleHeader && titleHeader.getBoundingClientRect().width > 0) return titleHeader;
        }
    }
    return null;
};
window.getTitleTable = function() {
    const titleHeader = window.getTitleHeader();
    return titleHeader ? titleHeader.closest('table') : null;
};
window.getTitleColumnIndex = function() {
    const titleHeader = window.getTitleHeader();
    if (!titleHeader || !titleHeader.parentNode) return -1;
    return Array.from(titleHeader.parentNode.children).indexOf(titleHeader);
};
window.findTitleCellByCoordinates = function(rowIndex, columnIndex) {
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
    const titleTable = window.getTitleTable();
    return titleTable
        ? titleTable.querySelector(`td[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`)
        : null;
};
window.getTitleTds = function() {
    const titleTable = window.getTitleTable();
    const titleColumnIndex = window.getTitleColumnIndex();
    if (!titleTable || titleColumnIndex < 0) return [];
    return Array.from(titleTable.querySelectorAll(`td[data-column-index="${titleColumnIndex}"]`));
};
window.isBulkTitleCounterText = function(value) {
    return /^\d{1,3}\s*\/\s*128$/.test(String(value || '').trim());
};
window.isPlausibleBulkTitleLine = function(value) {
    const line = String(value || '').replace(/\s+/g, ' ').trim();
    if (!line || line.length <= 5) return false;
    if (window.isBulkTitleCounterText(line)) return false;
    if (/^\d+\s*\/\s*\d+$/.test(line)) return false;
    if (/^[\d\s/]+$/.test(line)) return false;
    if (/^「.*」$/.test(line)) return false;
    if (/^(alibaba|淘宝|1688)$/i.test(line)) return false;
    if (window.UI_TEXT_CONFIG && line.includes(window.UI_TEXT_CONFIG.oneClickTranslate)) return false;
    return /[A-Za-z]/.test(line) || /[一-龥]/.test(line);
};
window.extractBulkTitleFromCell = function(cell) {
    if (!cell) return '';

    const inputSelector = 'textarea, input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])';
    const inputs = cell.querySelectorAll ? Array.from(cell.querySelectorAll(inputSelector)) : [];
    for (const input of inputs) {
        const value = String(input && input.value || '').replace(/\s+/g, ' ').trim();
        if (window.isPlausibleBulkTitleLine(value)) return value;
    }

    const textNode = cell.querySelector ? (cell.querySelector('.product-title, .title-text, .cell') || cell) : cell;
    const text = String(textNode && (textNode.innerText || textNode.textContent) || '');
    const lines = text.split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return lines.find(line => window.isPlausibleBulkTitleLine(line)) || '';
};
window.collectAllTitleTasks = async function(onProgress) {
    const titleTable = window.getTitleTable();
    const titleColumnIndex = window.getTitleColumnIndex();
    const tbody = titleTable && titleTable.tBodies ? titleTable.tBodies[0] : null;
    if (!tbody || titleColumnIndex < 0) return [];

    const tasks = [];
    const rowCount = tbody.rows.length;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        let cell = window.findTitleCellByCoordinates(rowIndex, titleColumnIndex);
        if (!cell) {
            const row = tbody.rows[rowIndex];
            if (row) row.scrollIntoView({ behavior: 'instant', block: 'center' });
            cell = await window.waitForElement(
                () => window.findTitleCellByCoordinates(rowIndex, titleColumnIndex),
                { timeout: 3000, interval: 50 }
            );
        }

        const originalTitle = cell ? window.extractBulkTitleFromCell(cell) : '';
        if (cell && originalTitle) {
            tasks.push({ rowIndex, columnIndex: titleColumnIndex, originalTitle });
        } else {
            console.warn(`[标题采集跳过] 虚拟表格第 ${rowIndex + 1} 行未能提取有效标题`);
        }

        if (typeof onProgress === 'function') {
            onProgress({ index: rowIndex, total: rowCount, collected: tasks.length });
        }
    }

    return tasks;
};
window.isOptimizedBulkTitleValid = function(value) {
    const title = String(value || '').replace(/\s+/g, ' ').trim();
    return title.length > 5 &&
        title.length <= 128 &&
        /^[\x20-\x7E]+$/.test(title) &&
        /[A-Za-z]/.test(title);
};
window.dispatchBulkTitleMouseSequence = function(target) {
    if (!target || typeof target.dispatchEvent !== 'function') return false;
    const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    eventTypes.forEach((type) => {
        const EventConstructor = type.startsWith('pointer') && typeof PointerEvent !== 'undefined'
            ? PointerEvent
            : (typeof MouseEvent !== 'undefined' ? MouseEvent : Event);
        target.dispatchEvent(new EventConstructor(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: type.endsWith('down') ? 1 : 0
        }));
    });
    return true;
};
window.ensureTitleTaskRendered = async function(task) {
    let cell = window.findTitleCellByCoordinates(task && task.rowIndex, task && task.columnIndex);
    if (cell) return cell;
    if (!task || !Number.isInteger(task.rowIndex)) return null;

    const titleTable = window.getTitleTable();
    const placeholderRow = titleTable && titleTable.tBodies && titleTable.tBodies[0]
        ? titleTable.tBodies[0].rows[task.rowIndex]
        : null;
    if (!placeholderRow) return null;

    placeholderRow.scrollIntoView({ behavior: 'instant', block: 'center' });
    cell = await window.waitForElement(
        () => window.findTitleCellByCoordinates(task.rowIndex, task.columnIndex),
        { timeout: 3000, interval: 50 }
    );
    return cell || null;
};
window.writeTitleTask = async function(task, optimizedTitle) {
    const newTitle = String(optimizedTitle || '').replace(/\s+/g, ' ').trim();
    if (!window.isOptimizedBulkTitleValid(newTitle)) {
        throw new Error(`标题 ${task && task.originalTitle || ''} 的优化结果不符合纯英文或128字符标准`);
    }

    const inputSelector = 'input[type="text"], textarea';
    let lastFailure = '写入后未能通过校验';

    for (let attempt = 0; attempt < 2; attempt++) {
        const initialCell = await window.ensureTitleTaskRendered(task);
        if (!initialCell) {
            lastFailure = '未能渲染对应商品行';
            continue;
        }

        const clickTarget = initialCell.querySelector('div.cell') || initialCell;
        clickTarget.click();
        const input = await window.waitForElement(() => {
            const currentCell = window.findTitleCellByCoordinates(task.rowIndex, task.columnIndex) || initialCell;
            return currentCell.querySelector(inputSelector);
        }, { timeout: 3000, interval: 50 });
        if (!input) {
            lastFailure = '未生成对应输入框';
            continue;
        }

        const proto = input.tagName === 'TEXTAREA'
            ? (typeof window.HTMLTextAreaElement !== 'undefined' ? window.HTMLTextAreaElement.prototype : null)
            : (typeof window.HTMLInputElement !== 'undefined' ? window.HTMLInputElement.prototype : null);
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
        if (typeof input.focus === 'function') input.focus();
        if (typeof input.select === 'function') input.select();
        if (nativeSetter && nativeSetter.set) nativeSetter.set.call(input, newTitle);
        else input.value = newTitle;

        const inputEvent = typeof InputEvent !== 'undefined'
            ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: newTitle })
            : new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        await new Promise(resolve => setTimeout(resolve, 60));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // 店小秘的标题 textarea 由 click-outside 提交；单纯 blur/Enter 不会退出编辑状态。
        let commitTarget = null;
        try {
            const titleTable = window.getTitleTable();
            const rows = titleTable && titleTable.tBodies && titleTable.tBodies[0]
                ? titleTable.tBodies[0].rows
                : null;
            if (rows && rows.length > 1) {
                const commitRowIndex = task.rowIndex < rows.length - 1 ? task.rowIndex + 1 : task.rowIndex - 1;
                const commitRow = rows[commitRowIndex];
                commitTarget = commitRow && commitRow.cells && commitRow.cells[0]
                    ? commitRow.cells[0]
                    : commitRow;
            }
        } catch (_) {
            commitTarget = null;
        }
        if (commitTarget && typeof commitTarget.click === 'function') commitTarget.click();
        else if (typeof input.blur === 'function') input.blur();

        // 虚拟占位行本身不一定可交互；若编辑框仍在，用固定表头触发 click-outside 提交。
        await new Promise(resolve => setTimeout(resolve, 80));
        const afterAdjacentCell = window.findTitleCellByCoordinates(task.rowIndex, task.columnIndex) || initialCell;
        if (afterAdjacentCell && afterAdjacentCell.querySelector(inputSelector)) {
            let titleHeader = null;
            try {
                titleHeader = window.getTitleHeader();
            } catch (_) {
                titleHeader = null;
            }
            if (titleHeader) window.dispatchBulkTitleMouseSequence(titleHeader);
        }

        await new Promise(resolve => setTimeout(resolve, 120));
        const verified = await window.waitForElement(() => {
            const currentCell = window.findTitleCellByCoordinates(task.rowIndex, task.columnIndex);
            if (!currentCell || currentCell.querySelector(inputSelector)) return null;
            const finalTitle = window.extractBulkTitleFromCell(currentCell);
            return window.SkuMapping.normalizeText(finalTitle) === window.SkuMapping.normalizeText(newTitle)
                ? currentCell
                : null;
        }, { timeout: 1800, interval: 50 });
        if (verified) return true;

        const finalCell = window.findTitleCellByCoordinates(task.rowIndex, task.columnIndex);
        const actualTitle = finalCell ? window.extractBulkTitleFromCell(finalCell) : '';
        lastFailure = `写入后未能通过校验（第${attempt + 1}次，期望“${newTitle}”，实际“${actualTitle}”）`;
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`标题 ${task.originalTitle} ${lastFailure}`);
};
window.writeTitleTasksSafely = async function(tasks, optimizedTitles, onProgress) {
    if (!Array.isArray(tasks) || !Array.isArray(optimizedTitles) || tasks.length !== optimizedTitles.length) {
        throw new Error(`标题结果数量不匹配：任务 ${Array.isArray(tasks) ? tasks.length : 0}，结果 ${Array.isArray(optimizedTitles) ? optimizedTitles.length : 0}`);
    }

    const result = { written: 0, failed: 0, failures: [] };
    for (let index = 0; index < tasks.length; index++) {
        const task = tasks[index];
        try {
            await window.writeTitleTask(task, optimizedTitles[index]);
            result.written += 1;
        } catch (error) {
            result.failed += 1;
            result.failures.push({
                originalTitle: task.originalTitle,
                message: error && error.message ? error.message : String(error)
            });
            console.error(`[标题写入失败] ${task.originalTitle}：${error && error.message ? error.message : error}`, error);
        }

        if (typeof onProgress === 'function') {
            onProgress({ index, total: tasks.length, ...result });
        }
        await new Promise(resolve => setTimeout(resolve, 80));
    }
    return result;
};
window.normalizeBulkTitleVariantFact = function(value) {
    return String(value || '')
        .replace(/[‐‑–—]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, '-')
        .trim();
};
window.isUsefulBulkTitleVariantFact = function(value, originalTitle = '') {
    const fact = window.normalizeBulkTitleVariantFact(value);
    if (!fact || fact.length < 3) return false;
    if (window.isBulkTitleCounterText(fact)) return false;
    if (/^\d+(?:\.\d+)?$/.test(fact)) return false;
    if (/^(?:alibaba|淘宝|1688|无)$/i.test(fact)) return false;
    if (/^[\d\s.,/￥¥$CNY]+$/i.test(fact)) return false;
    if (/李俊频|公司|店铺|产品分组|库存|零售价/.test(fact)) return false;
    if (originalTitle && fact === window.normalizeBulkTitleVariantFact(originalTitle)) return false;

    return /\b(?:BPW|Trailer|Axle|Flange|Flg|Custom|Colors?|PCD|ET|CB|Inch|Wheel|Hub)\b/i.test(fact) ||
        /\b\d+(?:\.\d+)?J\b/i.test(fact) ||
        /\b\d+(?:\.\d+)?x\d+(?:\.\d+)?\b/i.test(fact) ||
        /\b\d{2,3}\s*mm\b/i.test(fact);
};
window.extractBulkTitleVariantFacts = function(cell, originalTitle = '', skuDescriptors = []) {
    if (!cell) return [];

    const facts = [];
    const seen = new Set();
    const pushFact = (value) => {
        const fact = window.normalizeBulkTitleVariantFact(value);
        const key = fact.toLowerCase();
        if (!window.isUsefulBulkTitleVariantFact(fact, originalTitle) || seen.has(key)) return;
        seen.add(key);
        facts.push(fact);
    };

    let productKey = '';
    try {
        productKey = typeof window.getSkuProductKey === 'function' ? window.getSkuProductKey(cell) : '';
    } catch (_) {
        productKey = '';
    }

    if (productKey) {
        (skuDescriptors || [])
            .filter((descriptor) => descriptor && descriptor.productKey === productKey)
            .forEach((descriptor) => pushFact(descriptor.originalCode));
    }

    if (facts.length === 0) {
        const row = cell.closest && cell.closest('tr');
        const rowText = String(row && (row.innerText || row.textContent) || '');
        rowText.split(/\n+/).forEach((line) => {
            pushFact(line.replace(/\s+/g, ' ').trim());
        });
    }

    return facts.slice(0, 8);
};
window.getSkuHeader = function() {
    const ths = document.querySelectorAll('th, td, div.cell');

    for (let th of ths) {
        if (th.innerText && (th.innerText.replace(/\s/g, '').includes(window.UI_TEXT_CONFIG.skuCode) || th.innerText.replace(/\s/g, '').includes(window.UI_TEXT_CONFIG.customName))) {
            const tempTh = th.closest('th') || th.closest('td');
            if (tempTh && tempTh.getBoundingClientRect().width > 0) {
                return tempTh;
            }
        }
    }

    return null;
};
window.getSkuTable = function() {
    const skuHeader = window.getSkuHeader();
    return skuHeader ? skuHeader.closest('table') : null;
};
window.getSkuColumnIndex = function() {
    const skuHeader = window.getSkuHeader();
    if (!skuHeader || !skuHeader.parentNode) return -1;
    return Array.from(skuHeader.parentNode.children).indexOf(skuHeader);
};
window.findSkuCellByCoordinates = function(rowIndex, columnIndex) {
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
    const skuTable = window.getSkuTable();
    return skuTable
        ? skuTable.querySelector(`td[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`)
        : null;
};
window.getSkuTds = function() {
    const skuTable = window.getSkuTable();
    if (!skuTable) return [];
    const skuColumnIndex = window.getSkuColumnIndex();
    if (skuColumnIndex < 0) return [];
    const rawCells = Array.from(skuTable.querySelectorAll(`td[data-column-index="${skuColumnIndex}"]`));

    let uniqueCells = [];
    let seenY = new Set();

    for (let cell of rawCells) {
        const rect = cell.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const topY = Math.round(rect.top);
        let isDuplicate = false;

        for (let seen of seenY) {
            if (Math.abs(seen - topY) < 5) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            seenY.add(topY);
            uniqueCells.push(cell);
        }
    }

    return uniqueCells;
};
window.getSkuCodeText = function(target) {
    const input = target.querySelector('input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
    if (input) return (input.value || '').trim();

    const textNode = target.querySelector('div.no-new-line') || target;
    return (textNode.innerText || textNode.textContent || '').trim();
};
window.getSkuProductKey = function(cell) {
    const row = cell.closest('tr') || cell;
    const nodes = [row, cell];
    const attrNames = ['rowid', 'data-rowid', 'data-product-id', 'data-item-id', 'data-id', 'data-key'];

    for (const node of nodes) {
        if (!node) continue;
        for (const attrName of attrNames) {
            const value = node.getAttribute && node.getAttribute(attrName);
            if (value && value.trim()) return `${attrName}:${value.trim()}`;
        }
    }

    // 店小秘虚拟长表格会销毁屏幕外的真实行，但 data-row-index 在同一批次内保持稳定。
    const virtualRowIndex = cell.getAttribute && cell.getAttribute('data-row-index');
    if (virtualRowIndex !== null && String(virtualRowIndex).trim()) {
        return `virtual-row:${String(virtualRowIndex).trim()}`;
    }

    const idInput = row.querySelector('input[type="checkbox"][value], input[data-product-id], input[data-id]');
    if (idInput) {
        const value = idInput.getAttribute('data-product-id') || idInput.getAttribute('data-id') || idInput.value;
        if (value && String(value).trim()) return `input:${String(value).trim()}`;
    }

    // 店小秘批量表格重渲染时 DOM 节点会整体替换，但商品来源链接保持稳定。
    const sourceLink = row.querySelector && row.querySelector('a[href^="http"]');
    if (sourceLink) {
        const href = sourceLink.getAttribute('href');
        if (href && String(href).trim()) {
            return `source:${String(href).trim().replace(/[?#].*$/, '')}`;
        }
    }

    // 没有业务 ID 时仅允许在当前未重渲染的 DOM 中使用该节点；节点替换后会安全失败。
    if (!window._skuTransientProductKeys) window._skuTransientProductKeys = new WeakMap();
    if (!window._skuTransientProductKeyCounter) window._skuTransientProductKeyCounter = 0;
    if (!window._skuTransientProductKeys.has(cell)) {
        window._skuTransientProductKeyCounter += 1;
        window._skuTransientProductKeys.set(cell, `dom:${window._skuTransientProductKeyCounter}`);
    }
    return window._skuTransientProductKeys.get(cell);
};
window.getSkuVariantKey = function(target, originalCode, variationIndex) {
    const attrNames = ['data-item-index', 'data-variation-id', 'data-variant-id', 'data-id', 'data-key'];
    for (const attrName of attrNames) {
        const value = target.getAttribute && target.getAttribute(attrName);
        if (value && value.trim()) return `attr:${attrName}:${value.trim()}`;
    }

    // 单变体编码没有 data-item-index；使用产品行内固定的第 0 项，避免编码改写后身份随值变化。
    return `index:${variationIndex >= 0 ? variationIndex : 0}`;
};
window.getSkuCandidateDescriptors = function(cells) {
    const descriptors = [];

    const skuCells = Array.isArray(cells) ? cells : window.getSkuTds();
    skuCells.forEach((cell) => {
        const productKey = window.getSkuProductKey(cell);
        const variationDivs = Array.from(cell.querySelectorAll('div.editing-element.variation-item'));
        const targets = variationDivs.length > 0 ? variationDivs : [cell];

        targets.forEach((target, variationIdx) => {
            const originalCode = window.getSkuCodeText(target);
            if (!originalCode || originalCode.includes(window.UI_TEXT_CONFIG.skuCode) || originalCode.includes(window.UI_TEXT_CONFIG.customName)) return;

            const rawRowIndex = cell.getAttribute && cell.getAttribute('data-row-index');
            const rawColumnIndex = cell.getAttribute && cell.getAttribute('data-column-index');
            const rowIndex = /^\d+$/.test(String(rawRowIndex)) ? Number(rawRowIndex) : null;
            const columnIndex = /^\d+$/.test(String(rawColumnIndex)) ? Number(rawColumnIndex) : null;

            descriptors.push({
                productKey,
                variantKey: window.getSkuVariantKey(target, originalCode, variationIdx),
                originalCode,
                target,
                rowIndex,
                columnIndex,
                variationIndex: variationDivs.length > 0 ? variationIdx : -1,
                _variationIndex: variationDivs.length > 0 ? variationIdx : -1
            });
        });
    });

    const identityCounts = new Map();
    descriptors.forEach((descriptor) => {
        const key = `${descriptor.productKey}\u0000${descriptor.variantKey}`;
        identityCounts.set(key, (identityCounts.get(key) || 0) + 1);
    });

    descriptors.forEach((descriptor) => {
        const key = `${descriptor.productKey}\u0000${descriptor.variantKey}`;
        if (identityCounts.get(key) > 1) {
            descriptor.identityError = `商品 ${descriptor.productKey} 存在无法唯一识别的变体 ${descriptor.variantKey}`;
        }
    });

    return descriptors;
};
window.collectAllSkuCandidateDescriptors = async function(onProgress) {
    const skuTable = window.getSkuTable();
    const skuColumnIndex = window.getSkuColumnIndex();
    const tbody = skuTable && skuTable.tBodies ? skuTable.tBodies[0] : null;
    if (!tbody || skuColumnIndex < 0) return [];

    const descriptors = [];
    const rowCount = tbody.rows.length;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        let cell = window.findSkuCellByCoordinates(rowIndex, skuColumnIndex);
        if (!cell) {
            const row = tbody.rows[rowIndex];
            if (row) row.scrollIntoView({ behavior: 'instant', block: 'center' });
            cell = await window.waitForElement(
                () => window.findSkuCellByCoordinates(rowIndex, skuColumnIndex),
                { timeout: 3000, interval: 50 }
            );
        }

        if (!cell) {
            console.warn(`[SKU 采集跳过] 虚拟表格第 ${rowIndex + 1} 行未能渲染`);
        } else {
            descriptors.push(...window.getSkuCandidateDescriptors([cell]));
        }

        if (typeof onProgress === 'function') {
            onProgress({ index: rowIndex, total: rowCount, collected: descriptors.length });
        }
    }

    return descriptors;
};
window.findSkuTaskTargetByCoordinates = function(task) {
    if (!task || !Number.isInteger(task.rowIndex) || !Number.isInteger(task.columnIndex)) return null;
    const cell = window.findSkuCellByCoordinates(task.rowIndex, task.columnIndex);
    if (!cell) return null;
    if (!Number.isInteger(task.variationIndex) || task.variationIndex < 0) return cell;

    const exact = cell.querySelector(`div.editing-element.variation-item[data-item-index="${task.variationIndex}"]`);
    if (exact) return exact;
    return Array.from(cell.querySelectorAll('div.editing-element.variation-item'))[task.variationIndex] || null;
};
window.ensureSkuTaskRendered = async function(task) {
    let target = window.findSkuTaskTargetByCoordinates(task);
    if (target) return target;
    if (!task || !Number.isInteger(task.rowIndex)) return null;

    const skuTable = window.getSkuTable();
    const placeholderRow = skuTable && skuTable.tBodies && skuTable.tBodies[0]
        ? skuTable.tBodies[0].rows[task.rowIndex]
        : null;
    if (!placeholderRow) return null;

    placeholderRow.scrollIntoView({ behavior: 'instant', block: 'center' });
    target = await window.waitForElement(
        () => window.findSkuTaskTargetByCoordinates(task),
        { timeout: 3000, interval: 50 }
    );
    return target || null;
};
window.resolveSkuTaskTarget = function(task) {
    if (task.identityError) throw new Error(task.identityError);
    return window.SkuMapping.resolveUniqueTarget(task, window.getSkuCandidateDescriptors());
};
window.writeSkuTask = async function(task, cleanCode) {
    await window.ensureSkuTaskRendered(task);
    const candidate = window.resolveSkuTaskTarget(task);
    const clickTarget = candidate.target;

    clickTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 20));

    const rect = clickTarget.getBoundingClientRect();
    const commonOpts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.max(0, rect.left + rect.width / 2),
        clientY: Math.max(0, rect.top + rect.height / 2)
    };
    clickTarget.dispatchEvent(new MouseEvent('mousedown', commonOpts));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', commonOpts));
    clickTarget.dispatchEvent(new MouseEvent('click', commonOpts));

    const INPUT_SELECTORS = 'input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, .el-input__inner, input.el-input__inner, .ant-input';

    const inputNode = await window.waitForElement(() => {
        const currentTarget = window.findSkuTaskTargetByCoordinates(task) || clickTarget;
        const localInput = currentTarget.querySelector(INPUT_SELECTORS);
        if (localInput) return localInput;
        const activeElement = document.activeElement;
        return activeElement && currentTarget.contains(activeElement) ? activeElement : null;
    }, { timeout: 3000, interval: 50 });

    if (!inputNode) {
        throw new Error(`编码 ${task.originalCode} 未生成对应输入框`);
    }

    const proto = inputNode.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (nativeSetter && nativeSetter.set) nativeSetter.set.call(inputNode, cleanCode);
    else inputNode.value = cleanCode;

    inputNode.dispatchEvent(new Event('input', { bubbles: true }));
    inputNode.dispatchEvent(new Event('change', { bubbles: true }));
    inputNode.dispatchEvent(new Event('blur', { bubbles: true }));
    inputNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

    const verified = await window.waitForElement(() => {
        try {
            const current = window.SkuMapping.resolveUniqueIdentity(task, window.getSkuCandidateDescriptors());
            return window.SkuMapping.normalizeText(current.originalCode) === window.SkuMapping.normalizeText(cleanCode) ? current.target : null;
        } catch (_) {
            return null;
        }
    }, { timeout: 3000, interval: 50 });

    if (!verified) {
        throw new Error(`编码 ${task.originalCode} 写入后未能通过身份校验`);
    }
    return true;
};
window.writeSkuTasksSafely = async function(tasks, onProgress) {
    const result = { written: 0, failed: 0, failures: [] };
    const writeTasks = Array.isArray(tasks) ? tasks : [];

    for (let index = 0; index < writeTasks.length; index++) {
        const task = writeTasks[index];
        let cleanCode = window.sanitizeSkuCode(task.optimizedCode || '');
        if (!cleanCode) {
            console.warn(`[SKU 容灾] ${task.originalCode} AI 返回为空，使用原始值兜底`);
            cleanCode = window.sanitizeSkuCode(task.originalCode) || String(task.originalCode || '');
        }

        try {
            const written = await window.writeSkuTask(task, cleanCode);
            if (written) {
                result.written += 1;
            } else {
                throw new Error('当前页面中的编码内容与任务不一致');
            }
        } catch (error) {
            result.failed += 1;
            result.failures.push({
                originalCode: task.originalCode,
                message: error && error.message ? error.message : String(error)
            });
            console.error(`[SKU 写入失败] ${task.originalCode}：${error && error.message ? error.message : error}`, error);
        }

        if (typeof onProgress === 'function') {
            onProgress({ index, total: writeTasks.length, ...result });
        }
        await new Promise(resolve => setTimeout(resolve, 80));
    }

    return result;
};
window.startBulkOptimize = async function() {
    try {
        window.showGlobalLockOverlay('⏳ 引擎初始化，全景雷达扫描中 (请勿操作页面)...');

        // 快速预扫：以固定步长撑开虚拟表格，让屏幕外的行先挂载，大幅减少逐行唤醒等待。
        await window.preloadAllRows();

        const titleTasks = await window.collectAllTitleTasks();

        if (titleTasks.length === 0) {
            alert("😭 火箭发射失败：插件未能在这个网页结构中识别到【产品标题】列。请尝试按 F5 重新刷新当前批量编辑页面！");
            return;
        }

        // 虚拟表格的占位行横跨所有列，必须逐行唤醒后再采集真正的商品编码。
        const skuPreviewDescriptors = await window.collectAllSkuCandidateDescriptors();
        const skuPreviewTasks = window.SkuMapping.buildSkuOptimizationTasks(skuPreviewDescriptors, {
            mode: 'normal'
        });

        if(titleTasks.length === 0 && skuPreviewTasks.length === 0) {
            alert("😭 未能在此页表格中提取到有效的产品标题或商品编码内容！");
            return;
        }

        const titleMsg = titleTasks.length > 0 ? `${titleTasks.length} 个产品标题` : '';
        const skuMsg = skuPreviewTasks.length > 0 ? `${skuPreviewTasks.length} 个商品编码` : '';
        const combinedMsg = [titleMsg, skuMsg].filter(m => m).join(' 和 ');
        const modelDesc = skuPreviewTasks.length > 0
            ? `标题 → 千问模型 精编，商品编码 → 千问模型 极速翻译缩写`
            : `即将使用千问模型进行标题优化`;
        if(!confirm(`🚀 批量优化引擎启动！捕捉到 ${combinedMsg}\n${modelDesc}\n期间请务必不要点击前台网页，确认开始吗？`)) return;

        const toast = document.createElement('div');
        toast.className = 'ai-toast';
        toast.style.width = "400px";
        document.body.appendChild(toast);

        let titleProgress = `⏳ 标题管线初始化 (${titleTasks.length} 个)`;
        let skuProgress = skuPreviewTasks.length > 0 ? `⏳ 编码管线初始化 (${skuPreviewTasks.length} 个)` : ``;
        const updateToast = () => {
             toast.innerText = skuPreviewTasks.length > 0 ? `${titleProgress}\n${skuProgress}` : titleProgress;
        };
        updateToast();

        const btn = document.getElementById('ai-bulk-optimize-btn');
        if(btn) { btn.style.pointerEvents = 'none'; btn.style.opacity = '0.5'; }

        // ========== 并行发射 API ==========
        let titleResPromise = null;
        let titleSuccessCount = 0, titleFailCount = 0;
        let skuWritten = 0, skuSkipped = 0, skuFailed = 0;
        if (titleTasks.length > 0) {
            titleProgress = `⏳ 标题 AI 优化中 (千问模型, ${titleTasks.length}个)...`; updateToast();
            titleResPromise = new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "bulk_optimize_titles",
                    titles: titleTasks.map(t => t.originalTitle),
                    mode: 'normal'
                }, (response) => {
                    if (chrome.runtime.lastError) { resolve({ success: false, msg: chrome.runtime.lastError.message }); return; }
                    resolve(response || { success: false, msg: '无响应' });
                });
            });
        }

        // ========== 阶段 1：标题 DOM 写入 ==========
        if (titleResPromise) {
            const titleRes = await titleResPromise;

            if (titleRes && titleRes.success) {
                const newTitles = titleRes.titles;
                titleProgress = `✅ 标题优化完成，填表中：0/${titleTasks.length}`; updateToast();
                const titleWriteResult = await window.writeTitleTasksSafely(titleTasks, newTitles, (progress) => {
                    titleProgress = `⏳ 标题填表：${progress.index + 1}/${progress.total}（成功${progress.written}，失败${progress.failed}）`;
                    updateToast();
                });
                titleSuccessCount = titleWriteResult.written;
                titleFailCount = titleWriteResult.failed;
                const titleSummary = titleFailCount > 0
                    ? `⚠️ 标题填写完成：成功 ${titleSuccessCount} 个，失败 ${titleFailCount} 个`
                    : `✅ 标题全部填写完成 (${titleTasks.length}个)`;
                titleProgress = titleSummary; updateToast();
            } else {
                titleProgress = `❌ 标题管线失败：${titleRes ? titleRes.msg : '未知'}`; updateToast();
            }
        }

        // 标题写入会触发表格重渲染；SKU 必须在此后重新采集身份，不能复用旧的单元格位置。
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        await new Promise(r => setTimeout(r, 1500));

        // ========== 阶段 2：按稳定身份优化并写回 SKU ==========
        skuProgress = '⏳ 正在逐行采集虚拟表格中的真实商品编码...'; updateToast();
        const skuDescriptors = await window.collectAllSkuCandidateDescriptors((progress) => {
            skuProgress = `⏳ 编码采集：${progress.index + 1}/${progress.total}（已识别${progress.collected}个）`;
            updateToast();
        });
        const skuTasks = window.SkuMapping.buildSkuOptimizationTasks(skuDescriptors, {
            mode: 'normal'
        });

        if (skuTasks.length > 0) {
            const unsafeTasks = skuTasks.filter(task => (task.needsOptimize || task.needsLocalWrite) && task.identityError);
            if (unsafeTasks.length > 0) {
                throw new Error(`检测到 ${unsafeTasks.length} 个 SKU 无法唯一定位，已停止写入以避免编码错位。`);
            }

            const needsSkuOptimize = skuTasks.filter(task => task.needsOptimize);
            const localWriteCount = skuTasks.filter(task => task.needsLocalWrite).length;
            skuSkipped = skuTasks.length - needsSkuOptimize.length - localWriteCount;

            if (needsSkuOptimize.length === 0 && localWriteCount === 0) {
                skuProgress = `✅ 全部 ${skuTasks.length} 个编码均为纯英文且≤49字符，无需 AI 处理`; updateToast();
            } else {
                let aiCodes = [];
                if (needsSkuOptimize.length > 0) {
                    skuProgress = `⏳ 编码 AI 优化中 (本地规则 ${localWriteCount}个，千问模型 ${needsSkuOptimize.length}个，${skuSkipped}个跳过)...`; updateToast();
                    const skuRes = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            action: 'bulk_optimize_product_codes',
                            codes: needsSkuOptimize.map(task => task.originalCode)
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                resolve({ success: false, msg: chrome.runtime.lastError.message });
                                return;
                            }
                            resolve(response || { success: false, msg: '无响应' });
                        });
                    });

                    if (!skuRes || !skuRes.success) {
                        throw new Error(`编码 API 失败：${skuRes ? skuRes.msg : '未知错误'}`);
                    }
                    aiCodes = skuRes.codes;
                } else {
                    skuProgress = `⏳ 编码本地规则处理中 (${localWriteCount}个，${skuSkipped}个跳过)...`; updateToast();
                }

                const optTasks = window.SkuMapping.buildOptimizedCodeWriteTasks(skuTasks, aiCodes);
                skuProgress = `✅ 编码优化完成，安全填表中：0/${optTasks.length}`; updateToast();

                const writeResult = await window.writeSkuTasksSafely(optTasks, (progress) => {
                    skuProgress = `⏳ 编码填表：${progress.index + 1}/${progress.total}（成功${progress.written}，失败${progress.failed}）`;
                    updateToast();
                });
                skuWritten = writeResult.written;
                skuFailed = writeResult.failed;

                skuProgress = skuFailed > 0
                    ? `⚠️ 编码填写完成：成功${skuWritten}个，失败${skuFailed}个，跳过${skuSkipped}个`
                    : `✅ 编码全部填写并校验完成 (${skuWritten}个，跳过${skuSkipped}个)`;
                updateToast();
            }
        }

        titleProgress = '🎉 全盘双擎优化完成！';
        skuProgress = '请点击网页右上角保存。';
        updateToast();
        console.log(`[批量优化总结] 标题：${titleTasks.length} 条 (成功${titleSuccessCount}, 失败${titleFailCount}) | 编码：${skuTasks.length} 条 (写入${skuWritten}, 失败${skuFailed}, 跳过${skuSkipped})`);
        setTimeout(() => window.hideGlobalLockOverlay(), 3000);
        setTimeout(() => toast.remove(), 5000);
        if (btn) { btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; }

    } catch (err) {
        window.hideGlobalLockOverlay();
        const btn = document.getElementById('ai-bulk-optimize-btn');
        if (btn) {
            btn.style.pointerEvents = 'auto';
            btn.style.opacity = '1';
        }
        if (err && (err.message || '').includes('Extension context invalidated')) {
            alert("⚠️ 检测到自动化插件在后台已被重新加载或更新。\n请按键盘 F5 键刷新当前页面，即可继续正常运行最新版！");
            return;
        }
        alert("🚨 插件内部发生冲突，导致执行中断！错误详情：\n" + (err.stack || err.message));
        console.error(err);
    }
};
window.silentOptimizeSingleProductVariants = function() {
    const inputs = window.getSingleProductVariantInputs().filter(input => input.value.trim().length > 0);
    if (inputs.length === 0) return;

    const triggerReactInput = (inp, val) => {
         inp.value = val;
         inp.dispatchEvent(new Event('input', {bubbles: true}));
         inp.dispatchEvent(new Event('change', {bubbles: true}));
         inp.dispatchEvent(new Event('blur', {bubbles: true}));
         let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
         if (nativeSetter && nativeSetter.set) {
             nativeSetter.set.call(inp, val);
             inp.dispatchEvent(new Event('input', {bubbles: true}));
             inp.dispatchEvent(new Event('change', {bubbles: true}));
         }
    };

    const inputsToOptimize = [];
    const inputsToOptimizeIndices = [];

    for (let i = 0; i < inputs.length; i++) {
        let val = inputs[i].value.trim();
        val = val.replace(/(\d{3})[Xx]\d{2,3}\s+(\d{3})[Xx]\d{2,3}/g, "$1/$2");
        val = val.replace(/（/g, '(').replace(/）/g, ')');

        const isFullySafe = window.SkuMapping && window.SkuMapping.isCodeCompliant
            ? window.SkuMapping.isCodeCompliant(val)
            : !/[\u4e00-\u9fa5]/.test(val) && val.length <= 49 && !/[^a-zA-Z0-9 \(\)\.\-\/\*"]/.test(val);
        const localCode = window.SkuMapping && window.SkuMapping.normalizeProductCode
            ? window.SkuMapping.normalizeProductCode(val)
            : '';

        if (isFullySafe) {
            triggerReactInput(inputs[i], val);
        } else if (localCode) {
            triggerReactInput(inputs[i], localCode);
        } else {
            inputsToOptimize.push(val);
            inputsToOptimizeIndices.push(i);
        }
    }

    if (inputsToOptimize.length === 0) return;

    chrome.runtime.sendMessage({
        action: "bulk_optimize_product_codes",
        codes: inputsToOptimize
    }, (response) => {
        if (response && response.success) {
            const newNames = response.codes;
            for(let j = 0; j < inputsToOptimizeIndices.length; j++) {
                const i = inputsToOptimizeIndices[j];
                const input = inputs[i];
                let newT = newNames[j];
                if (!newT) { newT = inputsToOptimize[j].substring(0, 49); }

                newT = window.sanitizeSkuCode(newT);
                triggerReactInput(input, newT);
            }
        }
    });
};

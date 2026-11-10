/**
 * 自动发布控制台：启动自动发布时打开的小窗口，做成两列表格——
 *   每一行对应一个正在跑的商品窗口：
 *     左格 = 窗口（商品id + 跳转按钮，来自 dxmPublishState.activeChildren，
 *            由 background.js 的 scheduleAutoPublishTabs 写入 windowId/tabId）
 *     右格 = 这个窗口自己的信息流（从 dxmWorkflowStream 里按 product key
 *            过滤出属于该窗口的日志，各商品页 content script 镜像写入）
 * 跟着 storage 变化自动刷新，另有 3s 兜底轮询。
 */

function dxmPanelProductKeyFromUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.searchParams.get('id') || url;
    } catch (error) {
        return url;
    }
}

function dxmPanelChildKey(child) {
    return child.key || dxmPanelProductKeyFromUrl(child.url || '');
}

// 把全局信息流按商品 key 分组，方便每个窗口取自己那一份。
function dxmPanelGroupStream(stream) {
    const groups = {};
    (Array.isArray(stream) ? stream : []).forEach(entry => {
        const key = entry.product || '';
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    });
    return groups;
}

function dxmPanelRenderLogCell(cell, lines) {
    cell.replaceChildren();
    const recent = (lines || []).slice(-6);
    if (!recent.length) {
        const empty = document.createElement('div');
        empty.className = 'log-empty';
        empty.textContent = '等待流程信息…';
        cell.appendChild(empty);
        return;
    }
    recent.forEach(line => {
        const row = document.createElement('div');
        row.className = 'log-row' + (line.kind ? ` ${line.kind}` : '');
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = line.time || '';
        const m = document.createElement('span');
        m.className = 'm';
        m.textContent = line.text || '';
        row.appendChild(t);
        row.appendChild(m);
        cell.appendChild(row);
    });
    cell.scrollTop = cell.scrollHeight;
}

function dxmPanelRenderRows(state, stream) {
    const children = state.activeChildren || [];
    const groups = dxmPanelGroupStream(stream);
    const rows = document.getElementById('rows');
    rows.replaceChildren();

    if (!children.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = state.running ? '暂无正在处理的窗口…' : '没有运行中的窗口';
        rows.appendChild(empty);
        const failures = state.failedProducts || [];
        if (!state.running && !(state.pendingQueue || []).length && failures.length) {
            const summary = document.createElement('div');
            summary.className = 'failure-summary';
            summary.appendChild(document.createTextNode('失败商品汇总：成功 ' + Math.max(0, Number(state.processed || 0)) + ' 个，失败 ' + failures.length + ' 个'));
            failures.forEach(item => {
                const line = document.createElement('div');
                const link = document.createElement('a');
                link.href = item.productUrl || '#';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = item.productId || item.productUrl || '-';
                line.appendChild(link);
                line.appendChild(document.createTextNode(' · ' + (item.forbiddenWords || []).join('/') + ' · ' + (item.stage || '-') + ' · ' + (item.errorCode || '-')));
                summary.appendChild(line);
            });
            rows.appendChild(summary);
        }
        return;
    }

    children.forEach((child, index) => {
        const key = dxmPanelChildKey(child);
        const row = document.createElement('div');
        row.className = 'row';

        // 左格：窗口
        const cellWin = document.createElement('div');
        cellWin.className = 'cell-win';
        const name = document.createElement('div');
        name.className = 'win-name';
        name.textContent = `窗口 ${index + 1}`;
        const id = document.createElement('div');
        id.className = 'win-id';
        id.textContent = `#${key}`;
        id.title = child.url || '';
        const button = document.createElement('button');
        button.textContent = '跳转';
        button.disabled = !child.windowId || !child.tabId;
        button.addEventListener('click', async () => {
            if (child.windowId) await chrome.windows.update(child.windowId, { focused: true }).catch(() => {});
            if (child.tabId) await chrome.tabs.update(child.tabId, { active: true }).catch(() => {});
        });
        cellWin.appendChild(name);
        cellWin.appendChild(id);
        cellWin.appendChild(button);

        // 右格：这个窗口自己的信息流
        const cellLog = document.createElement('div');
        cellLog.className = 'cell-log';
        dxmPanelRenderLogCell(cellLog, groups[key]);

        row.appendChild(cellWin);
        row.appendChild(cellLog);
        rows.appendChild(row);
    });
}

async function dxmPanelRender() {
    const { dxmPublishState, dxmWorkflowStream } = await chrome.storage.local.get([
        'dxmPublishState', 'dxmWorkflowStream'
    ]);
    const state = dxmPublishState || {};
    const children = state.activeChildren || [];
    const vision = state.visionSession || {};
    const labels = { glm: 'GLM', 'glm-4v': 'GLM-4V', gemini: 'Gemini', agnes: 'Agnes', 'qwen3-vl-flash': 'Qwen3-VL-Flash', qwen: 'Qwen' };
    const modelNode = document.getElementById('vision-model-status');
    if (vision.status === 'ready') {
        modelNode.textContent = `🤖 当前图片模型：${labels[vision.mainProviderId] || vision.mainProviderId} · ${vision.mainModelId || '-'}`;
    } else if (vision.status === 'probing') {
        modelNode.textContent = '🤖 当前图片模型：正在按顺序测试…';
    } else if (vision.status === 'switching') {
        modelNode.textContent = '🤖 当前图片模型：正在顺延…';
    } else if (vision.status === 'unavailable') {
        modelNode.textContent = '🤖 当前图片模型：六个模型均不可用';
    } else {
        modelNode.textContent = '🤖 当前图片模型：等待批次启动';
    }

    document.getElementById('stats').textContent = state.running
        ? `进行中 ${children.length} · 已完成 ${state.processed || 0} · 剩余 ${(state.pendingQueue || []).length}`
        : '当前没有正在运行的自动发布';

    dxmPanelRenderRows(state, dxmWorkflowStream);
}

dxmPanelRender();
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.dxmPublishState || changes.dxmWorkflowStream) dxmPanelRender();
});
// storage.onChanged 理论上够用，这里加一个兜底轮询防止极端情况下漏刷新。
setInterval(dxmPanelRender, 3000);

importScripts('vision-session.js');

// ===== 内联资源队列 (resource-pool.js) =====
function DxmAsyncQueue(conf) {
  this.name = conf.name;
  this.workers = conf.workers;
  this.capacity = conf.capacity;
  this._active = 0;
  this._queue = [];
}
DxmAsyncQueue.prototype.run = function(fn, timeoutMs) {
  var self = this;
  timeoutMs = timeoutMs || 30000;
  if (self._active + self._queue.length >= self.workers + self.capacity) {
    var busyErr = new Error(self.name + ' 队列满载');
    busyErr.code = self.name.toUpperCase() + '_BUSY';
    return Promise.reject(busyErr);
  }
  var waitPromise = Promise.resolve();
  if (self._active >= self.workers) {
    waitPromise = new Promise(function(resolve) { self._queue.push(resolve); });
  }
  return waitPromise.then(function() {
    self._active += 1;
    var timer;
    function onDone() { self._active -= 1; if (self._queue.length) self._queue.shift()(); }
    var race;
    if (timeoutMs > 0) {
      race = Promise.race([
        Promise.resolve().then(function() { return fn(); }),
        new Promise(function(_, reject) { timer = setTimeout(function() { reject(new Error(self.name + ' 超时')); }, timeoutMs); })
      ]);
    } else {
      race = Promise.resolve().then(function() { return fn(); });
    }
    return race.then(function(result) { clearTimeout(timer); onDone(); return result; }, function(err) { clearTimeout(timer); onDone(); throw err; });
  });
};

var DXM_GLOBAL_QUEUES = Object.freeze({
  imageDownload: new DxmAsyncQueue({ name: 'image_download', workers: 4, capacity: 8 }),
  ocr:           new DxmAsyncQueue({ name: 'ocr', workers: 1, capacity: 4 }),
  inpaint:       new DxmAsyncQueue({ name: 'inpaint', workers: 1, capacity: 0 }),
  canvas:        new DxmAsyncQueue({ name: 'canvas', workers: 3, capacity: 6 }),
  stateWrite:    new DxmAsyncQueue({ name: 'state_write', workers: 1, capacity: 64 }),
});

var DXM_BATCH_VISION_PROVIDER_ORDER = Object.freeze([
  'glm', 'glm-4v', 'gemini', 'agnes', 'qwen3-vl-flash', 'qwen'
]);
var dxmVisionProbePromise = null;

async function dxmInitializeVisionSession(batchId, requestedOrder) {
  if (dxmVisionProbePromise?.batchId === batchId) return dxmVisionProbePromise.promise;
  const order = DXM_BATCH_VISION_PROVIDER_ORDER.filter(id =>
    (!Array.isArray(requestedOrder) || requestedOrder.includes(id))
  );
  const promise = (async () => {
    const probeResults = [];
    let selected = null;
    for (const providerId of order) {
      try {
        const response = await fetch(`http://127.0.0.1:8765/api/v1/vision/providers/${encodeURIComponent(providerId)}/test`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        const result = await response.json();
        probeResults.push({
          providerId,
          status: result.status === 'READY' ? 'READY' : 'UNAVAILABLE',
          modelId: result.status === 'READY' ? String(result.model_id || '') : ''
        });
        if (result.status === 'READY') { selected = result; break; }
      } catch (_) {
        probeResults.push({ providerId, status: 'UNAVAILABLE', modelId: '' });
      }
    }
    return DXM_GLOBAL_QUEUES.stateWrite.run(async () => {
      const current = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState || {};
      if (current.visionSession?.batchId !== batchId) return current.visionSession || null;
      const visionSession = {
        ...current.visionSession,
        order,
        mainProviderId: selected?.provider_id || '',
        mainModelId: selected?.model_id || '',
        status: selected ? 'ready' : 'unavailable',
        unavailableProviderIds: probeResults.filter(item => item.status !== 'READY').map(item => item.providerId),
        probeResults,
        generation: selected ? 1 : 0,
        updatedAt: Date.now()
      };
      await dxmSetStorage({
        dxmPublishState: {
          ...current,
          running: Boolean(selected && current.startRequested),
          startRequested: false,
          visionSession
        }
      });
      return visionSession;
    }, 30000);
  })();
  dxmVisionProbePromise = { batchId, promise };
  try { return await promise; } finally {
    if (dxmVisionProbePromise?.batchId === batchId) dxmVisionProbePromise = null;
  }
}

async function dxmRecordVisionProvider(request) {
  return DXM_GLOBAL_QUEUES.stateWrite.run(async () => {
    const current = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState || {};
    const session = current.visionSession;
    const visionSession = DxmVisionSession.recordSuccess(session, request);
    if (visionSession === session) return session;
    await dxmSetStorage({ dxmPublishState: { ...current, visionSession } });
    return visionSession;
  }, 30000);
}

async function dxmRecordVisionUnavailable(request) {
  return DXM_GLOBAL_QUEUES.stateWrite.run(async () => {
    const current = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState || {};
    const session = current.visionSession;
    const visionSession = DxmVisionSession.recordUnavailable(session, request);
    if (visionSession === session) return session || null;
    await dxmSetStorage({ dxmPublishState: { ...current, visionSession } });
    return visionSession;
  }, 30000);
}

// ===== 内联熔断器 (circuit-breaker.js) =====
function DxmCircuitBreaker(conf) {
  this.name = conf.name;
  this.failureThreshold = conf.failureThreshold || 3;
  this.cooldownMs = conf.cooldownMs || 60000;
  this._failures = 0;
  this._state = 'closed';
  this._openedAt = null;
}
DxmCircuitBreaker.prototype.isOpen = function() { return this._state === 'open'; };
DxmCircuitBreaker.prototype.recordFailure = function() { this._failures += 1; if (this._failures >= this.failureThreshold) { this._state = 'open'; this._openedAt = Date.now(); } };
DxmCircuitBreaker.prototype.recordSuccess = function() { this._failures = 0; this._state = 'closed'; };
DxmCircuitBreaker.prototype.attemptReset = function() { if (this._state !== 'open') return true; if (Date.now() - this._openedAt >= this.cooldownMs) { this._state = 'half-open'; return true; } return false; };

var DXM_CIRCUIT_BREAKERS = Object.freeze({
  ocr:         new DxmCircuitBreaker({ name: 'ocr', failureThreshold: 3, cooldownMs: 30000 }),
  cloudVision: new DxmCircuitBreaker({ name: 'cloud_vision', failureThreshold: 2, cooldownMs: 60000 }),
});

console.log('[dxm] Service Worker 已启动');

function waitForTabDelay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function dxmGetStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function dxmSetStorage(values) {
    return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

function dxmIsTrustedProductSender(sender, productKey) {
    try {
        var url = new URL(sender && sender.tab && sender.tab.url || '');
        return Boolean(sender && sender.tab && sender.tab.id && /(^|\.)dianxiaomi\.com$/i.test(url.hostname) && url.pathname.toLowerCase().includes('/web/smt/edit') && dxmProductKeyFromUrl(url.href) === String(productKey || ''));
    } catch (_) { return false; }
}

async function dxmPersistForbiddenFailureAndClose(tabId, productKey, batchId, failure) {
    await DXM_GLOBAL_QUEUES.stateWrite.run(async function() {
        var current = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState || {};
        var bound = current.visionSession?.batchId === batchId && (current.activeChildren || []).some(child => child.tabId === tabId && (child.key || dxmProductKeyFromUrl(child.url)) === productKey);
        if (!bound) throw Object.assign(new Error('批次或活动商品绑定已过期'), { code: 'DXM_FORBIDDEN_STATE_STALE' });
        var safe = { productId: String(failure.productId || productKey).slice(0, 100), productUrl: String(failure.productUrl || '').slice(0, 500), errorType: 'FORBIDDEN_WORD_REPAIR_FAILED', errorCode: String(failure.errorCode || 'FORBIDDEN_VERIFICATION_FAILED').slice(0, 100), message: String(failure.message || '').slice(0, 300), stage: String(failure.stage || '').slice(0, 100), forbiddenWords: (failure.forbiddenWords || []).slice(0, 10).map(word => String(word).slice(0, 80)), wordHistory: (failure.wordHistory || []).slice(0, 2).map(row => (row || []).slice(0, 10).map(word => String(word).slice(0, 80))), repairAttempts: Math.min(2, Math.max(0, Number(failure.repairAttempts) || 0)), failedAt: Date.now() };
        var failedProducts = (current.failedProducts || []).filter(function(item) { return String(item.productId) !== safe.productId; }).concat([safe]).slice(-500);
        var activeChildren = (current.activeChildren || []).filter(function(child) { return (child.key || dxmProductKeyFromUrl(child.url)) !== productKey; });
        await dxmSetStorage({ dxmPublishState: { ...current, failedProducts: failedProducts, activeChildren: activeChildren, activeChild: activeChildren.length > 0, failed: failedProducts.length, lastChildFailedAt: Date.now(), _version: (current._version || 0) + 1 } });
    }, 30000);
    return { success: true, persisted: true };
}

function dxmNormalizeAutoPublishUrl(url) {
    const absolute = new URL(url, 'https://www.dianxiaomi.com');
    absolute.searchParams.set('dxm_auto_publish', '1');
    return absolute.toString();
}

function dxmProductKeyFromUrl(url) {
    try {
        const parsed = new URL(url, 'https://www.dianxiaomi.com');
        return parsed.searchParams.get('id') || parsed.href.replace(/[#?].*$/, '');
    } catch (_) {
        return String(url || '');
    }
}

function dxmIsOfflinePublishListUrl(url) {
    const lower = String(url || '').toLowerCase();
    return lower.includes('/web/smt/smtproductlist/offline') && !lower.includes('/web/smt/smtproductlist/draft');
}

let dxmAutoPublishScheduling = false;
let dxmAutoPublishScheduleAgain = false;
const DXM_PENDING_TAB_BIND_TTL_MS = 5000;
const DXM_AUTO_PUBLISH_PATROL_ALARM = 'dxm_auto_publish_patrol';

async function dxmWakeAutoPublishTab(tabId, retries = 18) {
    if (!tabId) return false;
    for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab?.id) return false;
            if (tab.url && !tab.url.includes('/web/smt/edit')) return false;
            const response = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, {
                    action: 'dxm_start_auto_publish_child',
                    source: 'background_schedule',
                    attempt
                }, reply => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    resolve(reply);
                });
            });
            if (response?.success && response?.started) return true;
        } catch (_) {}
        await waitForTabDelay(Math.min(1200, 220 + attempt * 120));
    }
    return false;
}

async function dxmAutoPublishActiveChildren(rawActiveChildren, completedKeys) {
    const active = [];
    const seen = new Set();
    const now = Date.now();

    for (const child of rawActiveChildren || []) {
        if (!child?.url) continue;
        const key = child.key || dxmProductKeyFromUrl(child.url);
        if (!key || completedKeys.has(key) || seen.has(key)) continue;

        if (child.tabId) {
            try {
                const tab = await chrome.tabs.get(child.tabId);
                const tabUrl = tab?.url || '';
                if (tabUrl.includes('/web/smt/edit') && dxmProductKeyFromUrl(tabUrl) === key) {
                    active.push({ ...child, key });
                    seen.add(key);
                }
            } catch (_) {
            }
            continue;
        }

        if (!child.openedAt || now - Number(child.openedAt) < DXM_PENDING_TAB_BIND_TTL_MS) {
            active.push({ ...child, key });
            seen.add(key);
        }
    }

    return active;
}

async function scheduleAutoPublishTabs() {
    if (dxmAutoPublishScheduling) {
        dxmAutoPublishScheduleAgain = true;
        return { success: true, busy: true };
    }

    dxmAutoPublishScheduling = true;
    try {
        let openedTotal = 0;
        do {
            dxmAutoPublishScheduleAgain = false;
            const data = await dxmGetStorage(['dxmPublishState']);
            const state = data.dxmPublishState;
            console.log('[bg-debug] state: running=', state?.running, 'pendingQueue=', (state?.pendingQueue || []).length, 'activeChildren=', (state?.activeChildren || []).length);
            if (!state?.running) return { success: true, opened: openedTotal };
            if (state.listUrl && !dxmIsOfflinePublishListUrl(state.listUrl)) {
                await dxmSetStorage({
                    dxmPublishState: {
                        ...state,
                        running: false,
                        activeChildren: [],
                        activeChild: false,
                        lastError: '自动发布只能从待发布 offline 列表启动，当前状态来源不是待发布页面',
                        stoppedAt: Date.now()
                    }
                });
                return { success: false, opened: openedTotal, msg: '自动发布只能从待发布 offline 列表启动' };
            }

            const maxConcurrent = Number(state.maxConcurrent || 5);
            const completedKeys = new Set((state.completedUrls || []).map(dxmProductKeyFromUrl).filter(Boolean));
            const activeChildren = await dxmAutoPublishActiveChildren(state.activeChildren || [], completedKeys);
            const activeKeys = new Set(activeChildren.map(child => child.key || dxmProductKeyFromUrl(child.url)).filter(Boolean));
            const pendingQueue = [...(state.pendingQueue || [])];
            const toOpen = [];

            while (activeChildren.length + toOpen.length < maxConcurrent && pendingQueue.length) {
                const next = pendingQueue.shift();
                if (!next?.url) continue;
                const url = dxmNormalizeAutoPublishUrl(next.url);
                const key = next.key || dxmProductKeyFromUrl(url);
                if (!key || completedKeys.has(key) || activeKeys.has(key)) continue;
                const child = { ...next, url, key, openedAt: Date.now() };
                activeKeys.add(key);
                toOpen.push(child);
            }

            if (!toOpen.length) {
                if (!pendingQueue.length && !activeChildren.length) {
                    await dxmSetStorage({
                        dxmPublishState: {
                            ...state,
                            pendingQueue,
                            activeChildren,
                            activeChild: false,
                            running: false,
                            completedAt: Date.now()
                        }
                    });
                    // 批次末尾：尝试瞬态重试
                    if (!pendingQueue.length && !toOpen.length) {
                        await dxmRetryTransientAtBatchEnd();
                    }
                } else if (pendingQueue.length !== (state.pendingQueue || []).length ||
                    activeChildren.length !== (state.activeChildren || []).length) {
                    await dxmSetStorage({
                        dxmPublishState: {
                            ...state,
                            pendingQueue,
                            activeChildren,
                            activeChild: activeChildren.length > 0,
                            lastQueueCleanedAt: Date.now()
                        }
                    });
                }
                if (dxmAutoPublishScheduleAgain) continue;
                return { success: true, opened: openedTotal };
            }

            await dxmSetStorage({
                dxmPublishState: {
                    ...state,
                    pendingQueue,
                    activeChildren: [...activeChildren, ...toOpen],
                    activeChild: true,
                    finalCheckAfterReload: false,
                    lastOpenedAt: Date.now()
                }
            });

            const openedTabIds = [];
            console.log('[bg-debug] 准备打开 toOpen.length=', toOpen.length);
            for (let index = 0; index < toOpen.length; index += 1) {
                const child = toOpen[index];
                console.log('[bg-debug] 打开窗口 #' + index + ': url=' + child.url);
                if (index > 0) await waitForTabDelay(180);
                try {
                    const win = await chrome.windows.create({ url: child.url, focused: false, type: 'normal' });
                    console.log('[bg-debug] chrome.windows.create 成功, winId=', win?.id);
                    let tab = win?.tabs?.[0];
                    if (!tab?.id && win?.id) {
                        const tabsInWindow = await chrome.tabs.query({ windowId: win.id });
                        tab = tabsInWindow[0];
                    }
                    if (tab?.id) openedTabIds.push(tab.id);
                    const latest = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState;
                    if (!latest?.running) continue;
                    const active = (latest.activeChildren || []).map(item => {
                        const itemKey = item.key || dxmProductKeyFromUrl(item.url);
                        return itemKey === child.key ? { ...item, tabId: tab.id, windowId: win?.id } : item;
                    });
                    await dxmSetStorage({
                        dxmPublishState: {
                            ...latest,
                            activeChildren: active,
                            activeChild: active.length > 0,
                            lastOpenedAt: Date.now()
                        }
                    });
                } catch (error) {
                    console.error('[bg-debug] chrome.windows.create 失败:', error.message, error);
                    const latest = (await dxmGetStorage(['dxmPublishState'])).dxmPublishState;
                    const active = (latest.activeChildren || []).filter(item =>
                        (item.key || dxmProductKeyFromUrl(item.url)) !== child.key
                    );
                    await dxmSetStorage({
                        dxmPublishState: {
                            ...latest,
                            running: false,
                            activeChildren: active,
                            activeChild: active.length > 0,
                            lastError: error.message || '新标签页打开失败'
                        }
                    });
                    throw error;
                }
            }

            await Promise.all(openedTabIds.map(tabId =>
                dxmWakeAutoPublishTab(tabId).catch(error => {
                    console.warn('[schedule_auto_publish_tabs] 唤醒自动发布标签失败：', error.message);
                    return false;
                })
            ));

            openedTotal += toOpen.length;
            if (!dxmAutoPublishScheduleAgain) return { success: true, opened: openedTotal };
        } while (dxmAutoPublishScheduleAgain);
        return { success: true, opened: openedTotal };
    } finally {
        dxmAutoPublishScheduling = false;
    }
}

async function dxmWakeActiveAutoPublishChildren(reason = 'patrol') {
    const data = await dxmGetStorage(['dxmPublishState']);
    const state = data.dxmPublishState;
    if (!state?.running) return { success: true, running: false };

    const completedKeys = new Set((state.completedUrls || []).map(dxmProductKeyFromUrl).filter(Boolean));
    const activeChildren = await dxmAutoPublishActiveChildren(state.activeChildren || [], completedKeys);
    if (activeChildren.length !== (state.activeChildren || []).length) {
        await dxmSetStorage({
            dxmPublishState: {
                ...state,
                activeChildren,
                activeChild: activeChildren.length > 0,
                lastQueueCleanedAt: Date.now()
            }
        });
        scheduleAutoPublishTabs().catch(error => {
            console.warn('[待发布自动化] 巡检补开失败：', error.message);
        });
    }

    const tabIds = activeChildren.map(child => child.tabId).filter(Boolean);
    await Promise.all(tabIds.map(tabId =>
        dxmWakeAutoPublishTab(tabId, reason === 'tab_updated' ? 8 : 4).catch(error => {
            console.warn('[待发布自动化] 唤醒后台标签失败：', error.message);
            return false;
        })
    ));
    if (reason === 'patrol' || activeChildren.length < Number(state.maxConcurrent || 5)) {
        scheduleAutoPublishTabs().catch(error => {
            console.warn('[待发布自动化] 巡检补齐标签失败：', error.message);
        });
    }
    return { success: true, running: true, activeCount: activeChildren.length };
}

async function dxmShouldScheduleAutoPublish(state) {
    if (!state?.running) return false;
    const pendingQueue = state.pendingQueue || [];
    if (!pendingQueue.length) return false;
    const maxConcurrent = Number(state.maxConcurrent || 5);
    const completedKeys = new Set((state.completedUrls || []).map(dxmProductKeyFromUrl).filter(Boolean));
    const activeChildren = await dxmAutoPublishActiveChildren(state.activeChildren || [], completedKeys);
    return activeChildren.length < maxConcurrent;
}

async function dxmEnsureAutoPublishPatrolAlarm() {
    if (!chrome?.alarms?.create) return;
    try {
        await chrome.alarms.create(DXM_AUTO_PUBLISH_PATROL_ALARM, { periodInMinutes: 0.5 });
    } catch (_) {}
}

let dxmWindowsPanelId = null;

async function dxmOpenWindowsPanel() {
    if (dxmWindowsPanelId !== null) {
        try {
            await chrome.windows.update(dxmWindowsPanelId, { focused: true });
            return { success: true, windowId: dxmWindowsPanelId, reused: true };
        } catch (error) {
            dxmWindowsPanelId = null;
        }
    }
    const win = await chrome.windows.create({
        url: chrome.runtime.getURL('windows-panel.html'),
        type: 'popup',
        width: 540,
        height: 560,
        left: 40,
        top: 80,
        focused: true
    });
    dxmWindowsPanelId = win?.id ?? null;
    if (dxmWindowsPanelId !== null && chrome?.windows?.onRemoved?.addListener) {
        const listener = (closedId) => {
            if (closedId === dxmWindowsPanelId) {
                dxmWindowsPanelId = null;
                chrome.windows.onRemoved.removeListener(listener);
            }
        };
        chrome.windows.onRemoved.addListener(listener);
    }
    return { success: true, windowId: dxmWindowsPanelId, reused: false };
}

async function dispatchTrustedMouseClick(tabId, request) {
    const debuggee = { tabId };
    const startX = Number(request.startX);
    const startY = Number(request.startY);
    const x = Number(request.x);
    const y = Number(request.y);
    if (![startX, startY, x, y].every(Number.isFinite)) {
        throw new Error('真实鼠标坐标无效');
    }

    const moveSteps = Math.max(8, Math.min(24, Number(request.steps) || 14));
    const moveMouse = async () => {
        for (let i = 1; i <= moveSteps; i += 1) {
            const t = i / moveSteps;
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: startX + (x - startX) * eased,
                y: startY + (y - startY) * eased,
                button: 'none',
                buttons: 0
            });
            await waitForTabDelay(18);
        }
    };

    await chrome.debugger.attach(debuggee, '1.3');
    try {
        await moveMouse();
        await waitForTabDelay(80);
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            buttons: 1,
            clickCount: 1
        });
        await waitForTabDelay(90);
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            buttons: 0,
            clickCount: 1
        });
    } finally {
        await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

async function dispatchTrustedMouseMove(tabId, request) {
    const debuggee = { tabId };
    const startX = Number(request.startX);
    const startY = Number(request.startY);
    const x = Number(request.x);
    const y = Number(request.y);
    if (![startX, startY, x, y].every(Number.isFinite)) {
        throw new Error('真实鼠标移动坐标无效');
    }

    const moveSteps = Math.max(8, Math.min(24, Number(request.steps) || 14));
    await chrome.debugger.attach(debuggee, '1.3');
    try {
        for (let i = 1; i <= moveSteps; i += 1) {
            const t = i / moveSteps;
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: startX + (x - startX) * eased,
                y: startY + (y - startY) * eased,
                button: 'none',
                buttons: 0
            });
            await waitForTabDelay(18);
        }
        await waitForTabDelay(Number(request.holdMs) || 650);
    } finally {
        await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

async function dispatchTrustedImageMenuSequence(tabId, request) {
    const debuggee = { tabId };
    const startX = Number(request.startX);
    const startY = Number(request.startY);
    const buttonX = Number(request.buttonX);
    const buttonY = Number(request.buttonY);
    const itemX = Number(request.itemX);
    const itemY = Number(request.itemY);
    if (![startX, startY, buttonX, buttonY, itemX, itemY].every(Number.isFinite)) {
        throw new Error('真实鼠标菜单坐标无效');
    }

    const moveTo = async (fromX, fromY, toX, toY, steps = 12) => {
        for (let i = 1; i <= steps; i += 1) {
            const t = i / steps;
            const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: fromX + (toX - fromX) * eased,
                y: fromY + (toY - fromY) * eased,
                button: 'none',
                buttons: 0
            });
            await waitForTabDelay(18);
        }
    };

    const clickAt = async (x, y) => {
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            buttons: 1,
            clickCount: 1
        });
        await waitForTabDelay(90);
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            buttons: 0,
            clickCount: 1
        });
    };

    await chrome.debugger.attach(debuggee, '1.3');
    try {
        await moveTo(startX, startY, buttonX, buttonY, 14);
        await waitForTabDelay(80);
        await clickAt(buttonX, buttonY);
        await waitForTabDelay(260);
        await moveTo(buttonX, buttonY, itemX, itemY, 14);
        await waitForTabDelay(100);
        await clickAt(itemX, itemY);
    } finally {
        await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

async function removeTabAcceptingDialogs(tabId) {
    const debuggee = { tabId };
    let attached = false;
    let listener = null;

    const acceptDialog = async () => {
        try {
            await chrome.debugger.sendCommand(debuggee, 'Page.handleJavaScriptDialog', { accept: true });
        } catch (error) {
        }
    };

    try {
        await chrome.debugger.attach(debuggee, '1.3');
        attached = true;

        listener = (source, method) => {
            if (source?.tabId !== tabId || method !== 'Page.javascriptDialogOpening') return;
            acceptDialog();
        };
        chrome.debugger.onEvent.addListener(listener);

        await chrome.debugger.sendCommand(debuggee, 'Page.enable').catch(() => {});
        await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: "try { window.__dxmSuppressBeforeUnload = true; window.onbeforeunload = null; } catch (e) {} true;"
        }).catch(() => {});

        try {
            await chrome.tabs.remove(tabId);
            return;
        } catch (error) {
            await acceptDialog();
            await waitForTabDelay(250);
            await chrome.tabs.remove(tabId);
        }
    } catch (error) {
        console.warn('[close_tab] 调试协议接管离站确认失败，回退普通关闭：', error.message);
        await chrome.tabs.remove(tabId);
    } finally {
        if (listener) chrome.debugger.onEvent.removeListener(listener);
        if (attached) await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

class DxmSimpleMutex {
    constructor() { this._locked = false; this._waiters = []; }
    lock() {
        return new Promise(resolve => {
            if (!this._locked) { this._locked = true; resolve(); }
            else { this._waiters.push(resolve); }
        });
    }
    unlock() {
        const next = this._waiters.shift();
        if (next) next();
        else this._locked = false;
    }
}

const dxmFocusMutex = new DxmSimpleMutex();
let dxmFocusPreviousActiveTabId = null;

async function dxmClaimTabFocus(tabId) {
    await dxmFocusMutex.lock();
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        dxmFocusPreviousActiveTabId = activeTab && activeTab.id !== tabId ? activeTab.id : null;
        if (dxmFocusPreviousActiveTabId !== null || !activeTab) {
            await chrome.tabs.update(tabId, { active: true });
            await waitForTabDelay(150);
        }
    } catch (error) {
        dxmFocusMutex.unlock();
        throw error;
    }
}

async function dxmReleaseTabFocus() {
    const previous = dxmFocusPreviousActiveTabId;
    dxmFocusPreviousActiveTabId = null;
    if (previous !== null) {
        await chrome.tabs.update(previous, { active: true }).catch(() => {});
    }
    dxmFocusMutex.unlock();
}

async function uploadFilesViaRealChooser(tabId, filePaths, timeoutMs = 15000) {
    await dxmClaimTabFocus(tabId);
    try {
        return await uploadFilesViaRealChooserFocused(tabId, filePaths, timeoutMs);
    } finally {
        await dxmReleaseTabFocus();
    }
}

async function uploadFilesViaRealChooserFocused(tabId, filePaths, timeoutMs = 15000) {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, '1.3');
    let settled = false;
    let listener = null;
    try {
        await chrome.debugger.sendCommand(debuggee, 'Page.enable');
        await chrome.debugger.sendCommand(debuggee, 'DOM.enable');

        const evalPoint = async (expression) => {
            const res = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
                expression,
                returnByValue: true
            });
            return res?.result?.value || null;
        };
        const realClick = async (x, y) => {
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
            await waitForTabDelay(40);
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
            await waitForTabDelay(80);
            await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
        };

        const findTriggerPoint = () => evalPoint(`(() => {
            const module = document.querySelector('.img-module.productMainImgModule');
            const scope = module ? (module.closest('.ant-form-item') || module.parentElement) : document;
            const cands = Array.from(scope.querySelectorAll('*')).filter(el => {
                const t = (el.textContent || '').trim();
                const r = el.getBoundingClientRect();
                return t === '选择图片' && r.width > 0 && r.height > 0;
            });
            cands.sort((a, b) => a.childElementCount - b.childElementCount);
            const el = cands[0];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);
        const findItemPoint = () => evalPoint(`(() => {
            const cands = Array.from(document.querySelectorAll('*')).filter(el => {
                const t = (el.textContent || '').trim();
                const r = el.getBoundingClientRect();
                return t === '本地图片' && r.width > 0 && r.height > 0;
            });
            cands.sort((a, b) => a.childElementCount - b.childElementCount);
            const el = cands[0];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        })()`);

        let itemPoint = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3 && !itemPoint; attempt += 1) {
            try {
                const triggerPoint = await findTriggerPoint();
                if (!triggerPoint) throw new Error('未找到主图区域"选择图片"按钮');
                await realClick(triggerPoint.x, triggerPoint.y);
                await waitForTabDelay(500 + (attempt - 1) * 300);
                itemPoint = await findItemPoint();
                if (!itemPoint) throw new Error('未找到"本地图片"菜单项（下拉可能没展开成功）');
            } catch (error) {
                lastError = error;
                await waitForTabDelay(200);
            }
        }
        if (!itemPoint) throw lastError || new Error('未找到"本地图片"菜单项（下拉可能没展开成功）');

        await chrome.debugger.sendCommand(debuggee, 'Page.setInterceptFileChooserDialog', { enabled: true });
        const fileChooserPromise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    chrome.debugger.onEvent.removeListener(listener);
                    reject(new Error(`等待系统文件选择框超时（${timeoutMs}ms）`));
                }
            }, timeoutMs);
            listener = (source, method, params) => {
                if (source.tabId !== tabId || method !== 'Page.fileChooserOpened') return;
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                chrome.debugger.onEvent.removeListener(listener);
                resolve(params);
            };
            chrome.debugger.onEvent.addListener(listener);
        });

        await realClick(itemPoint.x, itemPoint.y);
        const chooser = await fileChooserPromise;
        if (!chooser.backendNodeId) throw new Error('文件选择框事件未返回 backendNodeId');

        await chrome.debugger.sendCommand(debuggee, 'DOM.setFileInputFiles', {
            files: filePaths,
            backendNodeId: chooser.backendNodeId
        });
        return { success: true, injectedCount: filePaths.length };
    } finally {
        if (listener) chrome.debugger.onEvent.removeListener(listener);
        await chrome.debugger.sendCommand(debuggee, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
        await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

function downloadUrlToLocalFile(url, options = {}) {
    const filenameHint = options.filenameHint || `dxm-watermark-${Date.now()}.jpg`;
    const timeoutMs = options.timeoutMs || 30000;

    return new Promise((resolve, reject) => {
        let settled = false;
        let downloadId = null;

        const cleanup = () => {
            chrome.downloads.onChanged.removeListener(onChanged);
            clearTimeout(timer);
        };
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve(result);
        };

        const onChanged = delta => {
            if (downloadId === null || delta.id !== downloadId) return;
            if (delta.state?.current === 'complete') {
                chrome.downloads.search({ id: downloadId }, items => {
                    if (chrome.runtime.lastError) {
                        finish(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    const item = items?.[0];
                    if (!item?.filename) {
                        finish(new Error('下载完成但找不到本地文件路径'));
                        return;
                    }
                    finish(null, { filename: item.filename, downloadId });
                });
            } else if (delta.state?.current === 'interrupted') {
                finish(new Error(`下载中断: ${delta.error?.current || '未知原因'}`));
            }
        };

        const timer = setTimeout(() => {
            finish(new Error(`下载超时（${timeoutMs}ms）: ${url}`));
        }, timeoutMs);

        chrome.downloads.onChanged.addListener(onChanged);
        chrome.downloads.download(
            { url, filename: filenameHint, conflictAction: 'uniquify', saveAs: false },
            id => {
                if (chrome.runtime.lastError) {
                    finish(new Error(chrome.runtime.lastError.message));
                    return;
                }
                downloadId = id;
            }
        );
    });
}

async function setFileInputFilesDirectly(tabId, selector, filePaths) {
    const debuggee = { tabId };
    await chrome.debugger.attach(debuggee, '1.3');
    try {
        await chrome.debugger.sendCommand(debuggee, 'DOM.enable');
        const { root } = await chrome.debugger.sendCommand(debuggee, 'DOM.getDocument', { depth: -1, pierce: true });
        const { nodeId } = await chrome.debugger.sendCommand(debuggee, 'DOM.querySelector', {
            nodeId: root.nodeId,
            selector
        });
        if (!nodeId) {
            throw new Error(`未找到元素: ${selector}`);
        }
        await chrome.debugger.sendCommand(debuggee, 'DOM.setFileInputFiles', {
            files: filePaths,
            nodeId
        });
        const dispatched = await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
            expression: `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                if (!input) return 0;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return input.files ? input.files.length : 0;
            })()`
        });
        const fileCount = Number(dispatched?.result?.value || 0);
        if (fileCount !== filePaths.length) {
            throw new Error(`文件控件接收数量不一致：期望 ${filePaths.length}，实际 ${fileCount}`);
        }
        return { success: true, injectedCount: fileCount };
    } finally {
        await chrome.debugger.detach(debuggee).catch(() => {});
    }
}

// ===== 冷启动恢复未完成批次 =====
async function dxmRecoverInterruptedBatch() {
  const data = await dxmGetStorage(['dxmPublishState']);
  const state = data.dxmPublishState;
  if (!state?.running) return;
  await dxmSetStorage({
    dxmPublishState: {
      ...state,
      activeChildren: [],
      activeChild: false,
      recoveredAt: Date.now()
    }
  });
  scheduleAutoPublishTabs().catch(error => {
    console.warn('[恢复] 冷启动补开失败：', error.message);
  });
}

// ===== 瞬态商品末尾重试 =====
async function dxmRetryTransientAtBatchEnd() {
  const data = await dxmGetStorage(['dxmPublishState']);
  const state = data.dxmPublishState;
  if (!state?.running) return;
  const transient = state.transientQueue || [];
  if (!transient.length) return;
  const pending = state.pendingQueue || [];
  const active = state.activeChildren || [];
  if (pending.length > 0 || active.length > 0) return;

  await dxmSetStorage({
    dxmPublishState: {
      ...state,
      pendingQueue: [...transient, ...pending],
      transientQueue: [],
      retryAttemptedAt: Date.now()
    }
  });
  scheduleAutoPublishTabs().catch(error => {
    console.warn('[瞬态重试] 重新入队失败：', error.message);
  });
}

// ===== 临时文件清理 =====
async function dxmCleanupTempFiles() {
  var TEMP_DIR = 'dxm-temp';
  var MAX_AGE_MS = 6 * 3600 * 1000;
  var now = Date.now();
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.search) {
    chrome.downloads.search({ query: [TEMP_DIR], state: 'complete' }, function(items) {
      if (!items || !items.length) return;
      items.forEach(function(item) {
        if (item.endTime && (now - new Date(item.endTime).getTime()) > MAX_AGE_MS) {
          chrome.downloads.erase({ id: item.id });
        }
      });
    });
  }
}

if (chrome?.tabs?.onRemoved?.addListener) {
    chrome.tabs.onRemoved.addListener((tabId) => {
        (async () => {
            const data = await dxmGetStorage(['dxmPublishState']);
            const state = data.dxmPublishState;
            if (!state?.running) return;

            const activeChildren = state.activeChildren || [];
            const hasClosedChild = activeChildren.some(child => child.tabId === tabId);
            if (!hasClosedChild) {
                setTimeout(() => {
                    scheduleAutoPublishTabs().catch(error => {
                        console.warn('[待发布自动化] 标签关闭后全量补齐失败：', error.message);
                    });
                }, 350);
                return;
            }

            const nextActiveChildren = activeChildren.filter(child => child.tabId !== tabId);
            await dxmSetStorage({
                dxmPublishState: {
                    ...state,
                    activeChildren: nextActiveChildren,
                    activeChild: nextActiveChildren.length > 0,
                    lastActiveTabClosedAt: Date.now()
                }
            });

            setTimeout(() => {
                scheduleAutoPublishTabs().catch(error => {
                    console.warn('[待发布自动化] 标签关闭后补开失败：', error.message);
                });
            }, 350);
        })().catch(error => {
            console.warn('[待发布自动化] 清理已关闭标签失败：', error.message);
        });
    });
}

if (chrome?.tabs?.onUpdated?.addListener) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status !== 'complete') return;
        const tabUrl = tab?.url || '';
        if (!tabUrl.includes('/web/smt/edit') || !tabUrl.includes('dxm_auto_publish=1')) return;
        dxmWakeAutoPublishTab(tabId, 10).catch(error => {
            console.warn('[待发布自动化] 标签加载完成后唤醒失败：', error.message);
        });
    });
}

if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.dxmPublishState) return;
        const state = changes.dxmPublishState.newValue;
        dxmShouldScheduleAutoPublish(state)
            .then(shouldSchedule => {
                if (!shouldSchedule) return;
                dxmEnsureAutoPublishPatrolAlarm();
                scheduleAutoPublishTabs().catch(error => {
                    console.warn('[待发布自动化] 状态变化后顺序补开失败：', error.message);
                });
            })
            .catch(error => {
                console.warn('[待发布自动化] 状态变化巡检失败：', error.message);
            });
    });
}

if (chrome?.runtime?.onStartup?.addListener) {
    chrome.runtime.onStartup.addListener(() => {
        dxmEnsureAutoPublishPatrolAlarm();
        dxmRecoverInterruptedBatch();
    });
}

if (chrome?.runtime?.onInstalled?.addListener) {
    chrome.runtime.onInstalled.addListener(() => {
        dxmEnsureAutoPublishPatrolAlarm();
    });
}

if (chrome?.alarms?.onAlarm?.addListener) {
    dxmEnsureAutoPublishPatrolAlarm();
    chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm?.name === 'dxm_temp_cleanup') {
            dxmCleanupTempFiles();
            return;
        }
        if (alarm?.name !== DXM_AUTO_PUBLISH_PATROL_ALARM) return;
        dxmWakeActiveAutoPublishChildren('alarm_patrol').catch(error => {
            console.warn('[待发布自动化] alarm 巡检失败：', error.message);
        });
    });
}
if (chrome?.alarms?.create) {
  chrome.alarms.create('dxm_temp_cleanup', { periodInMinutes: 360 });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "trusted_mouse_click") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        dispatchTrustedMouseClick(tabId, request)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "trusted_mouse_move") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        dispatchTrustedMouseMove(tabId, request)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "trusted_image_menu_sequence") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        dispatchTrustedImageMenuSequence(tabId, request)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "open_auto_publish_tab") {
        chrome.tabs.create({ url: request.url, active: request.active === true })
            .then(async tab => {
                if (String(request.url || '').includes('dxm_auto_publish=1')) {
                    dxmWakeAutoPublishTab(tab.id).catch(() => false);
                }
                sendResponse({ success: true, tabId: tab.id });
            })
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "schedule_auto_publish_tabs") {
        scheduleAutoPublishTabs()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "dxm_initialize_vision_session") {
        dxmInitializeVisionSession(request.batchId, request.order)
            .then(visionSession => sendResponse({ success: true, visionSession }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "dxm_record_vision_provider") {
        dxmRecordVisionProvider(request)
            .then(visionSession => sendResponse({ success: true, visionSession }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "dxm_record_vision_unavailable") {
        dxmRecordVisionUnavailable(request)
            .then(visionSession => sendResponse({ success: true, visionSession }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "dxm_persist_forbidden_failure_and_close") {
        const tabId = sender.tab && sender.tab.id;
        if (!dxmIsTrustedProductSender(sender, request.productKey)) { sendResponse({ success: false, code: 'DXM_FORBIDDEN_SENDER_INVALID', msg: '未授权的商品页请求' }); return; }
        dxmPersistForbiddenFailureAndClose(tabId, request.productKey, request.batchId, request.failure || {}).then(result => {
            sendResponse(result); // ACK 必须先于关页，否则 sender 被移除后收不到持久化确认。
            setTimeout(() => removeTabAcceptingDialogs(tabId).catch(() => {}).finally(() => scheduleAutoPublishTabs()), 0);
        }).catch(error => sendResponse({ success: false, msg: String(error.message || '').slice(0, 200) }));
        return true;
    } else if (request.action === "close_tab") {
        const tabId = sender.tab && sender.tab.id;
        if (tabId) {
            const initialDelay = 80 + (tabId % 3) * 70;
            setTimeout(async () => {
                for (let attempt = 0; attempt < 5; attempt++) {
                    try {
                        await removeTabAcceptingDialogs(tabId);
                        sendResponse({ success: true });
                        return;
                    } catch (err) {
                        const delay = 500 * (attempt + 1);
                        console.warn('[close_tab] 重试 ' + (attempt + 1) + '/5：', err.message);
                        await waitForTabDelay(delay);
                    }
                }
                sendResponse({ success: false, msg: '关闭标签失败' });
            }, initialDelay);
            return true;
        }
    } else if (request.action === "download_url_to_file") {
        downloadUrlToLocalFile(request.url, {
            filenameHint: request.filenameHint,
            timeoutMs: request.timeoutMs
        })
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "set_file_input_files_directly") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        setFileInputFilesDirectly(tabId, request.selector, request.filePaths)
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "upload_via_real_chooser") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        uploadFilesViaRealChooser(tabId, request.filePaths, request.timeoutMs)
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "claim_tab_focus") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) {
            sendResponse({ success: false, msg: '无法获取当前标签页' });
            return;
        }
        dxmClaimTabFocus(tabId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "release_tab_focus") {
        dxmReleaseTabFocus()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "open_windows_panel") {
        dxmOpenWindowsPanel()
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, msg: error.message }));
        return true;
    } else if (request.action === "pool_run") {
        if (!DXM_GLOBAL_QUEUES) {
            sendResponse({ success: false, msg: '资源队列未初始化' });
            return;
        }
        const pool = DXM_GLOBAL_QUEUES[request.pool];
        if (!pool) {
            sendResponse({ success: false, msg: '未知队列: ' + request.pool });
            return;
        }
        pool.run(async () => {
            const taskId = request.taskId;
            // For fetch tasks
            if (taskId === 'fetch') {
                const params = request.params || {};
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), request.timeoutMs || 15000);
                try {
                    const resp = await fetch(params.url, { ...params.options, signal: controller.signal });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return await resp.blob();
                } finally {
                    clearTimeout(timer);
                }
            }
            throw new Error('未知任务类型: ' + taskId);
        }, request.timeoutMs || 30000)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, msg: error.message, code: error.code || '' }));
        return true;
    } else if (request.action === "dxm_commit_state_patch") {
        if (!DXM_GLOBAL_QUEUES) {
            sendResponse({ success: false, msg: '资源队列未初始化' });
            return;
        }
        const stateWriteQueue = DXM_GLOBAL_QUEUES.stateWrite;
        const { productKey, ...fields } = request.patch || {};
        stateWriteQueue.run(async () => {
            const data = await dxmGetStorage(['dxmPublishState']);
            const current = data.dxmPublishState || {};

            // Apply the patch to the matching activeChild
            const nextActive = (current.activeChildren || []).map(child => {
                const key = child.key || dxmProductKeyFromUrl(child.url);
                if (key === productKey) {
                    return { ...child, ...fields, updatedAt: Date.now() };
                }
                return child;
            });

            // Check if it's in transientQueue
            const nextTransient = (current.transientQueue || []).map(child => {
                const key = child.key || dxmProductKeyFromUrl(child.url);
                if (key === productKey) {
                    return { ...child, ...fields, updatedAt: Date.now() };
                }
                return child;
            });

            const next = { ...current, activeChildren: nextActive, transientQueue: nextTransient };
            next._version = (current._version || 0) + 1;

            await dxmSetStorage({ dxmPublishState: next });
            return next;
        }).then(state => {
            sendResponse({ success: true, _version: state._version });
        }).catch(error => {
            sendResponse({ success: false, msg: error.message });
        });
        return true;
    } else if (request.action === "dxm_open_dropdown") {
        const tabId = sender.tab && sender.tab.id;
        if (!tabId) { sendResponse({ success: false, msg: 'no tab' }); return; }
        chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                try {
                    var btn = document.querySelector('.translation-btn,.ant-btn-primary.translation-btn');
                    if (!btn) return 'no_btn';

                    // 滚动到顶部
                    window.scrollTo({top:0, behavior:'instant'});
                    btn.scrollIntoView({block:'center'});

                    var log = [];
                    log.push('btn_found');

                    // ====== 找到页面上所有 Vue 组件实例 ======
                    // Ant Design Vue 的 a-dropdown 可能在任何位置
                    // 遍历所有元素，找有 __vueParentComponent 的容器组件
                    var allEls = document.querySelectorAll('*');
                    var dropdownInstances = [];

                    for (var i = 0; i < allEls.length; i++) {
                        try {
                            var el = allEls[i];
                            // 跳过无意义元素
                            if (!el.__vueParentComponent && !el.__vnode) continue;

                            // 检查 element 的 class 或 data 属性看是否包含翻译相关
                            var cls = (el.className || '') + ' ' + (el.id || '');
                            var isTranslateArea = cls.indexOf('translate') >= 0 || cls.indexOf('translation') >= 0 || cls.indexOf('btn-box') >= 0;

                            [el.__vueParentComponent, el.__vnode].forEach(function(src) {
                                if (!src || typeof src !== 'object') return;
                                var comp = src.component || src;
                                if (!comp) return;

                                // 检查 setupState / ctx 中是否有翻译相关函数
                                var sources = [comp.setupState, comp.ctx, comp.exposed];
                                sources.forEach(function(s, si) {
                                    if (!s || typeof s !== 'object') return;
                                    var keys = Object.keys(s);
                                    keys.forEach(function(key) {
                                        if (typeof s[key] !== 'function') return;
                                        var k = key.toLowerCase();
                                        if (k.indexOf('ranslat') >= 0 || k.indexOf('翻') >= 0 || k.indexOf('translate') >= 0) {
                                            log.push('fn_' + key + '@' + (si === 0 ? 'setup' : si === 1 ? 'ctx' : 'exposed'));
                                            // 尝试调用
                                            try { s[key](); log.push('called_' + key); } catch(e) { log.push('call_err_' + key); }
                                        }
                                    });
                                });

                                // 检查 props 中是否有 visible
                                var props = comp.props;
                                if (props && typeof props === 'object') {
                                    if ('visible' in props || 'open' in props) {
                                        dropdownInstances.push({el: el, comp: comp, props: props, tag: el.tagName, cls: (el.className||'').slice(0,30)});
                                    }
                                }
                            });
                        } catch(e) {}
                    }

                    // ====== 找到的 dropdown 实例：强制打开 ======
                    if (dropdownInstances.length) {
                        log.push('dropdown_found_' + dropdownInstances.length);
                        dropdownInstances.forEach(function(di) {
                            try {
                                if (di.props.visible !== undefined) di.props.visible = true;
                                if (di.props.open !== undefined) di.props.open = true;
                                log.push('opened_' + (di.cls || di.tag));
                            } catch(e) {}
                        });
                    } else {
                        log.push('no_dropdown');
                    }

                    return log.join(',');
                } catch(e) { return 'err:' + e.message; }
            }
        }).then(results => {
            sendResponse({ success: true, result: results[0]?.result ?? null });
        }).catch(error => {
            sendResponse({ success: false, msg: error.message });
        });
        return true;
    }
});

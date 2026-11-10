(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.DxmForbiddenSync = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    function syncError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetchImpl(url, { ...options, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    async function parseCompatibleResponse(response) {
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw syncError('AUTH_REQUIRED', '店小秘登录状态已失效');
            }
            throw syncError('HTTP_ERROR', '词库接口请求失败');
        }
        let data;
        try {
            data = JSON.parse(await response.text());
        } catch (_) {
            throw syncError('INCOMPATIBLE_RESPONSE', '词库接口响应格式不兼容');
        }
        if (!data || !data.data || !data.data.page || !Array.isArray(data.data.page.list)) {
            if (data && (data.code === 2001 || /\u9a8c\u8bc1|\u767b\u5f55/.test(String(data.msg || '')))) {
                throw syncError('AUTH_REQUIRED', '店小秘登录状态已失效');
            }
            throw syncError('INCOMPATIBLE_RESPONSE', '词库接口响应格式不兼容');
        }
        return data;
    }

    async function fetchForbiddenWords(urls, options = {}) {
        const fetchImpl = options.fetchImpl || fetch;
        const requestTimeoutMs = options.requestTimeoutMs || 7000;
        const totalTimeoutMs = options.totalTimeoutMs || 45000;
        const deadline = Date.now() + totalTimeoutMs;
        let lastError = null;
        let sawTimeout = false;

        for (const url of urls) {
            for (const requestOptions of [
                {},
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: 'pageNo=1&pageSize=5000'
                }
            ]) {
                const remaining = deadline - Date.now();
                if (remaining <= 0) throw syncError('SYNC_TIMEOUT', '词库同步超时');
                const requestUrl = requestOptions.method === 'POST'
                    ? url
                    : `${url}?pageNo=1&pageSize=5000`;
                try {
                    const response = await fetchWithTimeout(
                        fetchImpl,
                        requestUrl,
                        requestOptions,
                        Math.min(requestTimeoutMs, remaining)
                    );
                    return await parseCompatibleResponse(response);
                } catch (error) {
                    if (error && error.name === 'AbortError') {
                        sawTimeout = true;
                        lastError = syncError('SYNC_TIMEOUT', '词库接口响应超时');
                    } else {
                        lastError = error;
                    }
                }
            }
        }
        if (sawTimeout && (!lastError || lastError.code === 'SYNC_TIMEOUT')) {
            throw syncError('SYNC_TIMEOUT', '词库接口响应超时');
        }
        throw lastError || syncError('INCOMPATIBLE_RESPONSE', '词库接口响应格式不兼容');
    }

    function runPopupSync({ sendMessage, button, status, watchdogMs = 50000 }) {
        return new Promise(resolve => {
            let settled = false;
            const finish = response => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                button.disabled = false;
                button.innerText = '🔄 同步店小秘词库';
                if (response && response.success) {
                    status.innerHTML = `<span class="success">✅ 同步成功！</span><br>获取到 ${response.count} 个违禁词。`;
                } else {
                    const message = response && response.msg ? response.msg : '页面响应超时，请刷新店小秘页面后重试。';
                    status.innerHTML = `<span class="error">❌ 同步失败</span><br>${message}`;
                }
                resolve(response || { success: false, code: 'CONTENT_TIMEOUT' });
            };
            const timer = setTimeout(() => finish(null), watchdogMs);
            sendMessage(finish);
        });
    }

    return { fetchForbiddenWords, runPopupSync };
});

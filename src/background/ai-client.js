'use strict';

(function initAiClient(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.AiClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAiClient() {
    const QWEN_CHAT_COMPLETIONS_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

    const defaultWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function requireApiKey(apiKey) {
        if (typeof apiKey !== 'string' || !apiKey.trim()) {
            throw new Error('未配置 API Key');
        }
        return apiKey.trim();
    }

    function normalizeRetries(maxRetries) {
        if (maxRetries === undefined) return 2;
        if (!Number.isInteger(maxRetries) || maxRetries < 0) {
            throw new TypeError('maxRetries 必须是非负整数');
        }
        return maxRetries;
    }

    function shouldRetryStatus(status) {
        return status === 429 || status >= 500;
    }

    function normalizeTimeout(timeoutMs) {
        if (timeoutMs === undefined) return 45000;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs 必须是正数');
        return timeoutMs;
    }

    async function requestJson({ url, options, fetchImpl, waitImpl, maxRetries, timeoutMs }) {
        const doFetch = fetchImpl || globalThis.fetch;
        if (typeof doFetch !== 'function') throw new Error('当前环境不支持 fetch');
        const wait = waitImpl || defaultWait;
        const retryLimit = normalizeRetries(maxRetries);
        const requestTimeout = normalizeTimeout(timeoutMs);

        for (let attempt = 0; ; attempt++) {
            let response;
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => {
                controller.abort(new Error(`AI 请求超时（${requestTimeout}ms）`));
            }, requestTimeout) : null;
            try {
                response = await doFetch(url, controller ? { ...options, signal: controller.signal } : options);
            } catch (error) {
                if (attempt >= retryLimit) throw error;
                await wait(1000 * (attempt + 1));
                continue;
            } finally {
                if (timeoutId !== null) clearTimeout(timeoutId);
            }

            if (response.ok) return response.json();

            let body = '';
            try {
                body = await response.text();
            } catch (_) {
                body = '';
            }
            const error = new Error(`AI 请求失败 (HTTP ${response.status})${body ? `: ${body}` : ''}`);
            error.status = response.status;
            error.body = body;
            if (!shouldRetryStatus(response.status) || attempt >= retryLimit) throw error;
            await wait(1000 * (attempt + 1));
        }
    }

    async function requestQwenChat({
        apiKey,
        model,
        messages,
        temperature,
        fetchImpl,
        waitImpl,
        maxRetries,
        timeoutMs
    } = {}) {
        const key = requireApiKey(apiKey);
        const data = await requestJson({
            url: QWEN_CHAT_COMPLETIONS_URL,
            options: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model || 'qwen-plus',
                    messages: Array.isArray(messages) ? messages : [],
                    ...(temperature === undefined ? {} : { temperature })
                })
            },
            fetchImpl,
            waitImpl,
            maxRetries,
            timeoutMs
        });
        if (!data || !Array.isArray(data.choices)) throw new Error('千问响应缺少 choices 数组');
        return data;
    }

    async function requestGeminiContent({
        apiKey,
        model,
        contents,
        generationConfig,
        fetchImpl,
        waitImpl,
        maxRetries,
        timeoutMs
    } = {}) {
        const key = requireApiKey(apiKey);
        if (typeof model !== 'string' || !model.trim()) throw new Error('未指定 Gemini 模型');
        const modelName = model.trim().replace(/^models\//, '');
        const data = await requestJson({
            url: `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent`,
            options: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key
                },
                body: JSON.stringify({
                    contents: Array.isArray(contents) ? contents : [],
                    ...(generationConfig === undefined ? {} : { generationConfig })
                })
            },
            fetchImpl,
            waitImpl,
            maxRetries,
            timeoutMs
        });
        if (!data || !Array.isArray(data.candidates)) throw new Error('Gemini 响应缺少 candidates 数组');
        return data;
    }

    async function listGeminiModels({ apiKey, fetchImpl, waitImpl, maxRetries, timeoutMs } = {}) {
        const key = requireApiKey(apiKey);
        const data = await requestJson({
            url: `${GEMINI_BASE_URL}/models`,
            options: {
                method: 'GET',
                headers: { 'x-goog-api-key': key }
            },
            fetchImpl,
            waitImpl,
            maxRetries,
            timeoutMs
        });
        if (!data || !Array.isArray(data.models)) throw new Error('Gemini 模型响应缺少 models 数组');
        return data;
    }

    return {
        requestQwenChat,
        requestGeminiContent,
        listGeminiModels
    };
});

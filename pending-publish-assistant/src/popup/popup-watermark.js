/**
 * ============================================================
 * 去水印设置面板 —— 独立文件，独立于 popup.js
 * ============================================================
 * 这里管理的是"水印消除AI"（云视觉图形logo检测）和"水印模板"两块
 * 配置，全部对接本地图片服务(127.0.0.1:8765)，跟 popup.js 里
 * Gemini/千问（发布助手自身用于标题/属性/营销图识别）完全独立，
 * 不共享任何状态、不互相调用。
 * ============================================================
 */

const DXM_WM_POPUP_IPE_BASE = 'http://127.0.0.1:8765';

async function dxmWmPopupFetchJson(path, options = {}) {
    const response = await fetch(`${DXM_WM_POPUP_IPE_BASE}${path}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let payload;
    try {
        payload = await response.json();
    } catch (e) {
        throw new Error(`本地图片服务无响应或返回异常 (HTTP ${response.status})`);
    }
    if (!response.ok) {
        throw new Error(payload.error || `本地图片服务 HTTP ${response.status}`);
    }
    return payload;
}

function dxmWmSetStatus(message, type = '') {
    const node = document.getElementById('wmStatus');
    if (!node) return;
    node.textContent = message;
    node.className = type;
    node.style.color = type === 'error' ? '#ff4d4f' : (type === 'success' ? '#52c41a' : '#666');
}

// ---------- 水印消除 AI（云视觉 provider 列表） ----------

const DXM_WM_PROVIDER_LABELS = {
    qwen: '通义千问（视觉）',
    'qwen3-vl-flash': '千问 3 VL Flash',
    gemini: 'Gemini（视觉）',
    glm: '智谱 GLM-4.6V',
    'glm-4v': '智谱 GLM-4V',
    agnes: 'Agnes'
};

async function dxmWmLoadProviders() {
    const container = document.getElementById('wmProviderList');
    if (!container) return;
    try {
        const data = await dxmWmPopupFetchJson('/api/v1/vision/providers');
        const activeProvider = data.active_provider;
        const providers = data.providers || {};
        container.replaceChildren();

        Object.entries(providers).forEach(([providerId, info]) => {
            const row = document.createElement('div');
            row.className = 'wm-provider-row';

            const nameWrap = document.createElement('label');
            nameWrap.className = 'wm-provider-name';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'wmActiveProvider';
            radio.className = 'wm-radio';
            radio.value = providerId;
            radio.checked = providerId === activeProvider;
            radio.addEventListener('change', () => dxmWmSetActiveProvider(providerId));

            const nameText = document.createElement('span');
            nameText.textContent = DXM_WM_PROVIDER_LABELS[providerId] || providerId;

            const badge = document.createElement('span');
            badge.className = `wm-badge ${info.api_key_configured ? 'on' : 'off'}`;
            badge.textContent = info.api_key_configured ? '已配置' : '未配置';

            nameWrap.appendChild(radio);
            nameWrap.appendChild(nameText);
            nameWrap.appendChild(badge);

            const keyInput = document.createElement('input');
            keyInput.type = 'password';
            keyInput.placeholder = '填入Key';

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '保存';
            saveBtn.addEventListener('click', () => dxmWmSaveProviderKey(providerId, keyInput));

            row.appendChild(nameWrap);
            row.appendChild(keyInput);
            row.appendChild(saveBtn);
            container.appendChild(row);
        });

        if (!Object.keys(providers).length) {
            const empty = document.createElement('div');
            empty.className = 'empty-brand';
            empty.textContent = '本地图片服务未返回任何模型（服务是否已启动？）';
            container.appendChild(empty);
        }
    } catch (error) {
        container.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'empty-brand';
        empty.textContent = `无法连接本地图片服务：${error.message}`;
        container.appendChild(empty);
    }
}

async function dxmWmSetActiveProvider(providerId) {
    try {
        await dxmWmPopupFetchJson('/api/v1/vision/active-provider', {
            method: 'POST',
            body: { provider_id: providerId }
        });
        dxmWmSetStatus(`已切换水印消除AI为：${DXM_WM_PROVIDER_LABELS[providerId] || providerId}`, 'success');
    } catch (error) {
        dxmWmSetStatus(`切换失败：${error.message}`, 'error');
    }
    dxmWmLoadProviders();
}

async function dxmWmSaveProviderKey(providerId, keyInput) {
    const key = keyInput.value.trim();
    if (!key) {
        dxmWmSetStatus('请先输入Key再保存。', 'error');
        return;
    }
    try {
        await dxmWmPopupFetchJson(`/api/v1/vision/providers/${providerId}/secret`, {
            method: 'POST',
            body: { apiKey: key }
        });
        dxmWmSetStatus(`${DXM_WM_PROVIDER_LABELS[providerId] || providerId} 的Key已保存（仅用于水印消除，与发布助手自身的Gemini/千问无关）。`, 'success');
        keyInput.value = '';
        dxmWmLoadProviders();
    } catch (error) {
        dxmWmSetStatus(`保存失败：${error.message}`, 'error');
    }
}

// ---------- 水印模板 ----------

function dxmWmReadTemplateForm() {
    return {
        enabled: document.getElementById('wmEnabled').checked,
        template_id: document.getElementById('wmTemplateId').value,
        apply_scope: document.getElementById('wmApplyScope').value,
        opacity: Number(document.getElementById('wmOpacity').value),
        logo_scale: Number(document.getElementById('wmLogoScale').value),
        text_scale: Number(document.getElementById('wmTextScale').value)
    };
}

function dxmWmFillTemplateForm(settings) {
    document.getElementById('wmEnabled').checked = !!settings.enabled;
    document.getElementById('wmTemplateId').value = settings.template_id;
    document.getElementById('wmApplyScope').value = settings.apply_scope;
    document.getElementById('wmOpacity').value = settings.opacity;
    document.getElementById('wmLogoScale').value = settings.logo_scale;
    document.getElementById('wmTextScale').value = settings.text_scale;
    dxmWmSyncRangeLabels();
}

function dxmWmSyncRangeLabels() {
    document.getElementById('wmOpacityVal').textContent = document.getElementById('wmOpacity').value;
    document.getElementById('wmLogoScaleVal').textContent = document.getElementById('wmLogoScale').value;
    document.getElementById('wmTextScaleVal').textContent = document.getElementById('wmTextScale').value;
}

async function dxmWmLoadTemplateSettings() {
    try {
        const settings = await dxmWmPopupFetchJson('/api/v1/settings/watermark');
        dxmWmFillTemplateForm(settings);
    } catch (error) {
        dxmWmSetStatus(`读取水印模板设置失败：${error.message}`, 'error');
    }
}

async function dxmWmSaveTemplateSettings() {
    try {
        const settings = await dxmWmPopupFetchJson('/api/v1/settings/watermark', {
            method: 'POST',
            body: dxmWmReadTemplateForm()
        });
        dxmWmFillTemplateForm(settings);
        dxmWmSetStatus('水印模板设置已保存。', 'success');
    } catch (error) {
        dxmWmSetStatus(`保存失败：${error.message}`, 'error');
    }
}

async function dxmWmPreviewTemplate() {
    const img = document.getElementById('wmPreviewImg');
    dxmWmSetStatus('正在生成预览…');
    try {
        const result = await dxmWmPopupFetchJson('/api/v1/settings/watermark/preview', {
            method: 'POST',
            body: { settings: dxmWmReadTemplateForm() }
        });
        img.src = result.data_url;
        img.style.display = 'block';
        dxmWmSetStatus('预览已更新（用的是内置占位图，不影响真实商品图）。', 'success');
    } catch (error) {
        dxmWmSetStatus(`预览失败：${error.message}`, 'error');
    }
}

// ---------- 运行配置开关（检测方式 / 混用触发 / 运行模式）----------
// 这三个是"工作流行为"开关，内容脚本(去水印管线、自动发布)要读，所以存
// chrome.storage.local.dxmWmRunConfig，不走本地服务。跟模型Key(存本地服务)
// 分开：Key是"用哪个模型"，这里是"怎么用/要不要停"。

function dxmWmSyncMixedTriggerVisibility() {
    const mode = document.getElementById('wmDetectionMode').value;
    // 混用触发只有 mixed 模式下才有意义，其它模式隐藏。
    document.getElementById('wmMixedTriggerField').style.display = mode === 'mixed' ? '' : 'none';
}

function dxmWmLoadRunConfig() {
    chrome.storage.local.get(['dxmWmRunConfig'], data => {
        const cfg = data.dxmWmRunConfig || {};
        document.getElementById('wmDetectionMode').value =
            ['ocr', 'mixed', 'model'].includes(cfg.detectionMode) ? cfg.detectionMode : 'mixed';
        document.getElementById('wmMixedTrigger').value =
            ['always', 'ocr_miss'].includes(cfg.mixedTrigger) ? cfg.mixedTrigger : 'always';
        document.getElementById('wmReviewMode').value =
            ['auto', 'review'].includes(cfg.reviewMode) ? cfg.reviewMode : 'review';
        dxmWmSyncMixedTriggerVisibility();
    });
}

function dxmWmSaveRunConfig() {
    const cfg = {
        detectionMode: document.getElementById('wmDetectionMode').value,
        mixedTrigger: document.getElementById('wmMixedTrigger').value,
        reviewMode: document.getElementById('wmReviewMode').value
    };
    chrome.storage.local.set({ dxmWmRunConfig: cfg }, () => {
        dxmWmSetStatus('运行设置已保存（立即对下一个商品生效）。', 'success');
    });
    dxmWmSyncMixedTriggerVisibility();
}

// ---------- 模型判定沉淀 → 规则草稿 ----------

async function dxmWmLoadRuleSummary() {
    const pre = document.getElementById('wmRuleSummary');
    dxmWmSetStatus('正在梳理模型判定…');
    try {
        const data = await dxmWmPopupFetchJson('/api/v1/vision/verdict-summary');
        pre.style.display = 'block';
        if (!data.total) {
            pre.textContent = data.note || '还没有模型判定记录。';
            dxmWmSetStatus('暂无数据：先用"混用/纯模型"模式跑几个商品。', '');
            return;
        }
        const lines = [
            `样本数：${data.total}`,
            `OCR与模型判定一致率：${(data.ocr_vision_agree_ratio * 100).toFixed(1)}%`,
            '',
            '模型判为排除的图 · 按类型：',
            JSON.stringify(data.exclude_by_image_type, null, 2),
            '',
            '模型判为排除的图 · 按原因码：',
            JSON.stringify(data.exclude_by_reason_code, null, 2),
            '',
            '模型检出的水印 · region_type 分布：',
            JSON.stringify(data.watermark_region_types, null, 2),
            '',
            '模型检出的水印 · 位置分布：',
            JSON.stringify(data.watermark_positions, null, 2),
            '',
            'OCR vs 模型 排除对照：',
            JSON.stringify(data.ocr_vs_vision_exclude, null, 2),
            '',
            data.hint || ''
        ];
        pre.textContent = lines.join('\n');
        dxmWmSetStatus('已梳理。', 'success');
    } catch (error) {
        dxmWmSetStatus(`梳理失败：${error.message}`, 'error');
    }
}

// ---------- 初始化 ----------
// 脚本标签放在 body 末尾，此时DOM已经解析完毕，直接顶层执行即可
// （跟同目录 popup.js 的写法一致），不需要等 DOMContentLoaded——
// 这个事件在脚本运行前很可能已经触发过了，监听器会永远等不到。

dxmWmLoadProviders();
dxmWmLoadTemplateSettings();
dxmWmLoadRunConfig();

document.getElementById('wmSaveSettingsBtn').addEventListener('click', dxmWmSaveTemplateSettings);
document.getElementById('wmPreviewBtn').addEventListener('click', dxmWmPreviewTemplate);
['wmOpacity', 'wmLogoScale', 'wmTextScale'].forEach(id => {
    document.getElementById(id).addEventListener('input', dxmWmSyncRangeLabels);
});
// 三个运行开关改动即存，无需额外"保存"按钮。
['wmDetectionMode', 'wmMixedTrigger', 'wmReviewMode'].forEach(id => {
    document.getElementById(id).addEventListener('change', dxmWmSaveRunConfig);
});
document.getElementById('wmRuleSummaryBtn').addEventListener('click', dxmWmLoadRuleSummary);

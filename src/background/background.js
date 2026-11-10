const RpaTabRegistryApi = (() => {
    if (globalThis.RpaTabRegistry) return globalThis.RpaTabRegistry;
    if (typeof importScripts === 'function') {
        importScripts('rpa-tab-registry.js');
        return globalThis.RpaTabRegistry;
    }
    if (typeof require === 'function') return require('./rpa-tab-registry.js');
    throw new Error('RPA 标签注册表模块未加载');
})();
const rpaTabRegistryStore = RpaTabRegistryApi.createRpaTabRegistryStore({ chromeApi: chrome });
const AiClientApi = (() => {
    if (globalThis.AiClient) return globalThis.AiClient;
    if (typeof importScripts === 'function') {
        importScripts('ai-client.js');
        return globalThis.AiClient;
    }
    if (typeof require === 'function') return require('./ai-client.js');
    throw new Error('AI 请求客户端模块未加载');
})();
const ForbiddenWordsCleanerApi = (() => {
    if (globalThis.ForbiddenWordsCleaner) return globalThis.ForbiddenWordsCleaner;
    if (typeof importScripts === 'function') {
        importScripts('../safety/forbidden-words-cleaner.js');
        return globalThis.ForbiddenWordsCleaner;
    }
    if (typeof require === 'function') return require('../safety/forbidden-words-cleaner.js');
    throw new Error('违禁词清洗模块未加载');
})();
const RpaMessageRouterApi = (() => {
    if (globalThis.RpaMessageRouter) return globalThis.RpaMessageRouter;
    if (typeof importScripts === 'function') {
        importScripts('rpa-message-router.js');
        return globalThis.RpaMessageRouter;
    }
    if (typeof require === 'function') return require('./rpa-message-router.js');
    throw new Error('RPA 消息路由模块未加载');
})();
const ImageFetchPolicyApi = (() => {
    if (globalThis.ImageFetchPolicy) return globalThis.ImageFetchPolicy;
    if (typeof importScripts === 'function') {
        importScripts('image-fetch-policy.js');
        return globalThis.ImageFetchPolicy;
    }
    if (typeof require === 'function') return require('./image-fetch-policy.js');
    throw new Error('远程图片安全策略模块未加载');
})();
const TitleOptimizationApi = (() => {
    if (globalThis.TitleOptimization) return globalThis.TitleOptimization;
    if (typeof importScripts === 'function') {
        importScripts('../domain/title-optimization.js');
        return globalThis.TitleOptimization;
    }
    if (typeof require === 'function') return require('../domain/title-optimization.js');
    throw new Error('标题优化校验模块未加载');
})();

// 引入 user 提供的 prompt
const SYSTEM_PROMPT = `# Role: 资深速卖通标题优化专家 & 产品合规质检员 (AliExpress SEO & QA Specialist)

## Core Mission
你是一个精通速卖通搜索算法、SEO规则，同时具备严格产品数据校验能力的AI专家。你的任务是接收用户提供的原始产品信息，**先进行严格的"防幻觉/防呆校验"，再基于校验后的准确数据进行 SEO 标题重构**。

## ⚠️ PHASE 1: 强制防呆与防幻觉校验 (Critical Validation - 最高优先级)
在撰写任何标题之前，必须先对输入数据进行以下逻辑检查。若发现错误，必须以【修正策略】为准，严禁将错误信息写入标题。

### 1. 物理互斥检测 (Logic Conflict Check)
- **动力源互斥**：严禁同一标题出现 [Gasoline, Petrol, Diesel, Engine] 与 [Electric, Volt, V, Plug-in]。
    - *判定*：若型号含 "E" 或 "Electric"，保留电相关词；若含 "HP" 且无电压，保留油相关词。
- **材质/状态互斥**：严禁 Solid Wood + Plastic，New + Used 等矛盾组合。

### 2. 参数常识校验 (Sanity Check)
- **单位量级**：检查数值是否符合常识。若异常，优先信任型号或图片信息。
- **未知即留白**：**严禁猜测！** 如果原标题未提供电压、功率等关键参数，**绝对禁止**使用"智能补充"功能去编造。直接省略该属性，不要为了凑词而造假。

### 3. 语言与来源处理
- **中文翻译 （绝对强制，不得出现中文字符）**：如果输入数据包含中文，必须将其精准翻译为地道的英文行业术语。输出标题中绝对不能留任何中文字符。
- **剔除无效信息**：删除 Hot Sale, Free Shipping 等营销词、特殊符号、内部ERP代码。
- **侵权规避**：涉及他人品牌时，必须在前面加 "For" (例如: Case For iPhone)。

---

## ⚡ PHASE 2: SEO 优化与重构逻辑 (Optimization Logic)
基于 Phase 1 校验通过的**准确数据**，执行以下优化：

### 1. 重构硬性规则
- **字数限制**：总长度严格控制在 128 个字符以内，尽量写满但不要溢出。
- **黄金前60字符**：必须将搜索量最大、最核心的关键词（产品词+核心属性）放在前60个字符内。
- **大小写规范**：除连词/介词/虚词外，每个单词首字母必须大写。
- **去重防作弊**：同一关键词最多出现 2 次。
- **数字规范**：使用阿拉伯数字（如 4K, 1080P, 5.5HP）。

## User Input Handling
- 如果输入包含内部备注（如人名、公司名），请直接忽略。
- **特别指令**：如果输入数据缺失关键属性（如电压），请在内部处理时标记"缺失"，并在标题中留空，**切勿自行脑补**。

## Output
只返回优化后的纯英文标题文本。绝对不允许出现中文字符。不要引号，不要序号，不要 markdown，不要任何说明文字。`;

const SYSTEM_PROMPT_ATTR = `你是一位电商属性SEO优化专家。你的任务是对每一个属性词条进行“优先级萃取与缩写”。
# Task
必须遵守以下客户的**终极强制指令**：
1. 【提取三要素】：你的最高优先级是从原字符串中提取三种信息：①产品型号（如 T47-68）、②核心材质/工艺（如 Ceramic, Steel）、③颜色（如 Black, Gold）。
2. 【无情删减修饰词】：原字符串里的任何普通名词（如 Bearing, Hub, Set, Parts, Accessories 等）和无意义形容词，**统统删除，绝不保留！**
3. 【极简拼接与缩写】：拼接优先级为：型号 + 材质 + 颜色。
   - 如果组合后可能超长，必须极限缩写！
   - 材质缩写示例：Ceramic -> Cer, Ordinary -> Ord
   - 颜色缩写示例：Black -> Blk, Silver -> Sil, Yellow -> Yel, Green -> Grn
   - 前后轮缩写示例：如果是“单前轮”，切勿写 Single front，直接写 Front；如果是“单后轮”，直接写 Rear。必须扔掉 Single 这个废词。
   - 🌟【超长轮毂型号特例】：遇到前后轮毂等超长组合型号（如 "110X20 157X12"，或者 "110X15 148X12"），**必须**缩写为核心维度 "110/157" 或 "110/148"（省略掉 X 及后面的孔径），以防报错。
   - 组装示例1："110X20 157X12 HG -10.5mm" -> 必须输出 "110/157 HG -10.5mm"
   - 组装示例2："Single rear 142X12 HG" -> 输出 "Rear 142X12 HG"
   - 组装示例3："Black Red Gold Silver" -> 输出 "Blk Red Gld Sil"
   - 组装示例4："T47-68-24r-ordinary Bearing" -> 输出 "T47-68-24r Ord"
4. 【绝对纯英文约束】：输出结果绝对不允许出现中文字符！如果带有中文字符，若表达三要素之一可翻译简写，否则直接删除。只允许英文字母、数字、空格，及 (). - 四个符号。
5. 【字符长度断头台】：最终输出结果绝对不能超过 19 个字符（含空格），如果超过，继续丢弃颜色以外的次要信息。

# Output
必须保证输出为一个严谨的 JSON 数组结构（字符串数组），数组内元素的顺序和数量要求与输入一模一样。如果原文处理后实在为空，也请返回原文的缩写或保留最核心单词，不要返回空字符串。只准返回纯净的 JSON 数组（以 [ 开头，以 ] 结尾），绝不能带有任何 Markdown 格式(如 \`\`\`json) 或其他文字。`;

const SYSTEM_PROMPT_BULK = `# Role: 资深速卖通标题优化专家 & 产品合规质检员 (AliExpress SEO & QA Specialist)

## Core Mission
你是一个精通速卖通搜索算法、SEO规则，同时具备严格产品数据校验能力的AI专家。你收到一个 JSON 数组的原始标题，请先进行严格的"防幻觉/防呆校验"，再基于校验后的准确数据进行 SEO 标题重构。返回等长的 JSON 数组。

## ⚠️ PHASE 1: 强制防呆与防幻觉校验 (Critical Validation - 最高优先级)
在撰写任何标题之前，必须先对输入数据进行以下逻辑检查。若发现错误，必须以【修正策略】为准，严禁将错误信息写入标题。

### 1. 物理互斥检测 (Logic Conflict Check)
- **动力源互斥**：严禁同一标题出现 [Gasoline, Petrol, Diesel, Engine] 与 [Electric, Volt, V, Plug-in]。
    - *判定*：若型号含 "E" 或 "Electric"，保留电相关词；若含 "HP" 且无电压，保留油相关词。
- **材质/状态互斥**：严禁 Solid Wood + Plastic，New + Used 等矛盾组合。

### 2. 参数常识校验 (Sanity Check)
- **单位量级**：检查数值是否符合常识。若异常，优先信任型号或图片信息。
- **未知即留白**：**严禁猜测！** 如果原标题未提供电压、功率等关键参数，**绝对禁止**使用"智能补充"功能去编造。直接省略该属性，不要为了凑词而造假。

### 3. 语言与来源处理
- **中文翻译 （绝对强制，不得出现中文字符）**：如果输入数据包含中文，必须将其精准翻译为地道的英文行业术语。输出标题中绝对不能留任何中文字符。
- **剔除无效信息**：删除 Hot Sale, Free Shipping 等营销词、特殊符号、内部ERP代码。
- **侵权规避**：涉及他人品牌时，必须在前面加 "For" (例如: Case For iPhone)。

---

## ⚡ PHASE 2: SEO 优化与重构逻辑 (Optimization Logic)
基于 Phase 1 校验通过的**准确数据**，执行以下优化：

### 1. 重构硬性规则
- **字数限制**：总长度严格控制在 128 个字符以内，尽量写满但不要溢出。
- **黄金前60字符**：必须将搜索量最大、最核心的关键词（产品词+核心属性）放在前60个字符内。
- **大小写规范**：除连词/介词/虚词外，每个单词首字母必须大写。
- **去重防作弊**：同一关键词最多出现 2 次。
- **数字规范**：使用阿拉伯数字（如 4K, 1080P, 5.5HP）。

### 2. 多样性控制 — 每一条标题必须唯一 (Diversity Control — CRITICAL)
🚨 **所有输出的标题必须彼此不同！禁止任何两条标题相同或只有两三词之差！**

当批量生成时，必须为每一条标题选择不同的结构与措辞：

- **10种基础结构轮换**（按输入顺序循环使用，禁止连续两条用相同结构）：
  1. Brand + Model + Core Keyword + Attributes + Scenario
  2. Core Attributes + Core Keyword + Brand + Model
  3. Scenario/Application + Core Keyword + Attributes + Model
  4. Attribute-Feature + Model + Keyword + Use Case
  5. Keyword + Model + Key Feature + Scenario
  6. Application + Brand + Model + Size/Color + Keyword
  7. Feature-1 + Feature-2 + Core Keyword + Model
  8. Core Keyword + Size/Capacity + Material + Model
  9. Use Case + Attribute 1 + Attribute 2 + Model + Keyword
  10. Model + Material + Feature + Core Keyword + Scenario

- **同义词轮换**：强制在不同标题中使用同义词替换（例：Polisher / Grinder / Smoother; Machine / Tool / Equipment; 品牌名可换位或缩写）。

- **差异化锚点**：仔细对比每个输入产品的不同点（材料、颜色、尺寸、型号等），将最独特的属性提前到标题前部。即使产品非常相似，也要用不同的修饰词、场景词制造差异。

- **禁止偷懒**：不准直接套用前一条标题改一两个词就交差。必须重新审视该产品的完整特征后独立撰写。

## User Input Handling
- 如果输入包含内部备注（如人名、公司名），请直接忽略。
- **特别指令**：如果输入数据缺失关键属性（如电压），请在内部处理时标记"缺失"，并在标题中留空，**切勿自行脑补**。
- 每条标题独立处理，不得借用同批次中的事实、词汇、参数。

## Output
返回 ONLY 一个纯 JSON 数组的优化后标题字符串。每个元素是单行纯英文标题文本，不要包含分析、说明、序号。必须以 [ 开头，以 ] 结尾。返回数量与顺序必须与输入完全一致。不要 markdown，不要注释，不要说明。`;

const SYSTEM_PROMPT_BULK_REPAIR = `You repair AliExpress product titles that failed strict validation.
Translate every source title into a complete, natural English SEO title without inventing facts.
Every result must contain at least one English letter, use printable ASCII characters only, and be 6 to 128 characters long.
Do not output Chinese, explanations, numbering, markdown, empty strings, or placeholders.
Return ONLY a valid JSON string array with exactly the same order and number of elements as the input.`;


const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_CHAT_COMPLETIONS_URL = `${QWEN_BASE_URL}/chat/completions`;
const QWEN_MODEL = 'qwen-plus';
const QWEN_ACCESS_DENIED_MESSAGE = `千问接口访问被拒绝：当前插件保存的 API Key 无法访问 ${QWEN_BASE_URL} 或模型 ${QWEN_MODEL}。请在插件弹窗确认已保存普通 DashScope/百炼 API Key，并检查账号是否已开通模型调用权限、额度和欠费状态。`;


function normalizeOrdinaryTitleResult(value, maxLength = 128) {
    let cleaned = String(value || '')
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, ' ')
        .replace(/\*\*/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/[一-龥]/g, '')  // 🔒 保险清除中文字符，确保输出纯英文
        .replace(/\s{2,}/g, ' ')
        .trim();

    if (cleaned.length <= maxLength) return cleaned;

    const words = cleaned.split(' ');
    while (words.join(' ').length > maxLength && words.length > 1) {
        words.pop();
    }

    const wordLimited = words.join(' ').trim();
    return wordLimited.length <= maxLength ? wordLimited : wordLimited.slice(0, maxLength).trim();
}

function extractTitleFromOutput(text) {
    const trimmed = String(text || '').trim();
    const structuredMatch = trimmed.match(/\[优化后标题\]\s*[：:]\s*(.+)/);
    if (structuredMatch) {
        let title = structuredMatch[1]
            .replace(/\s*\(\d+\s*字符.*?\)\s*$/, '')
            .replace(/\s*\(\d+\s*chars?.*?\)\s*$/i, '')
            .replace(/^\d{1,3}\s*\/\s*\d{3}\s*$/, '')
            .trim();
        if (title) return title;
    }
    const result = normalizeOrdinaryTitleResult(trimmed);
    if (result && result.length > 5) return result;
    console.warn('[extractTitleFromOutput] 无法提取标题，原始返回:', trimmed.substring(0, 200));
    return result;
}

function cleanBulkTitleResult(title, forbiddenWords, whiteList, label) {
    let cleaned = extractTitleFromOutput(title);

    if (forbiddenWords.length > 0) {
        const before = cleaned;
        cleaned = ForbiddenWordsCleanerApi.cleanText(cleaned, forbiddenWords, whiteList);
        if (cleaned !== before) console.log(`[违禁词过滤] ${label} 已清除违禁词`);
    }

    if (/[一-龥]/.test(cleaned)) {
        console.log(`[中文过滤] ${label} 清除残留中文`);
        cleaned = cleaned.replace(/[一-龥]/g, '').replace(/\s{2,}/g, ' ').trim();
    }

    if (cleaned.length > 128) {
        cleaned = normalizeOrdinaryTitleResult(cleaned);
        console.log(`[硬截断] ${label} 截断至 ${cleaned.length} 字符`);
    }

    return cleaned;
}

function parseBulkTitleResponse(data, expectedLength, label) {
    if (!data.choices || data.choices.length === 0) {
        throw new Error(`${label} 未返回 choices`);
    }

    const rawText = String(data.choices[0].message.content || '').trim();
    const startIdx = rawText.indexOf('[');
    const endIdx = rawText.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
        throw new Error(`${label} 未返回有效 JSON 数组: ${rawText.substring(0, 100)}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText.substring(startIdx, endIdx + 1));
    } catch (_) {
        throw new Error(`${label} JSON Parse Error: ${rawText.substring(0, 100)}`);
    }
    if (!Array.isArray(parsed) || parsed.length !== expectedLength) {
        throw new Error(`${label} 数量不匹配：期望 ${expectedLength}，收到 ${Array.isArray(parsed) ? parsed.length : 0}`);
    }
    return parsed;
}

function waitForRpaTabDelay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function createRpaTabWithRetry(url, retries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const win = await chrome.windows.create({
                url,
                type: 'normal',
                width: 1100,
                height: 900,
                left: 100 + Math.floor(Math.random() * 300),
                top: 50 + Math.floor(Math.random() * 150)
            });
            return { success: true, tabId: win.tabs[0].id };
        } catch (error) {
            lastError = error;
            const delay = 600 * (attempt + 1);
            console.warn(`[open_rpa_tabs] 创建标签失败，第 ${attempt + 1}/${retries} 次重试将在 ${delay}ms 后进行：`, error.message);
            await waitForRpaTabDelay(delay);
        }
    }
    return { success: false, error: lastError ? lastError.message : 'unknown tab creation error' };
}

const MAX_CONCURRENT_RPA_TABS = 5;

/**
 * 等待可用的RPA标签槽位（最多5个并发）
 */
async function waitForRpaTabSlot(runId) {
    let activeCount = await rpaTabRegistryStore.countRpaTabs(runId);
    while (activeCount >= MAX_CONCURRENT_RPA_TABS) {
        console.log(`[RPA] 已达到最大并发数 ${MAX_CONCURRENT_RPA_TABS}，等待标签关闭... (当前: ${activeCount})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        activeCount = await rpaTabRegistryStore.countRpaTabs(runId);
    }
}

const rpaMessageRouter = RpaMessageRouterApi.createRpaMessageRouter({
    chromeApi: chrome,
    registryStore: rpaTabRegistryStore,
    registryApi: RpaTabRegistryApi,
    waitForSlot: waitForRpaTabSlot,
    createTabWithRetry: createRpaTabWithRetry,
    wait: waitForRpaTabDelay
});

// 任何标签关闭时，仅移除持久化注册表中的同一标签。
chrome.tabs.onRemoved.addListener((tabId) => {
    rpaTabRegistryStore.unregisterRpaTab(tabId).catch((error) => {
        console.warn('[RPA] 清理已关闭标签记录失败：', error.message);
    });
});

// 子标签保存后可能被店小秘导航到列表页，此时 content script 已死，
// 无法 sendMessage close_tab。此处监听 URL 变化自动关闭。
// 注意：仅当URL是真实的http/https页面且不包含编辑路径时才关闭，
// 避免chrome://newtab/等中间URL导致标签被误关。
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url &&
        (changeInfo.url.startsWith('http://') || changeInfo.url.startsWith('https://')) &&
        !changeInfo.url.includes('/web/smt/edit')) {
        rpaTabRegistryStore.getRpaTab(tabId).then((record) => {
            if (!record) return;
            console.log(`[RPA] 子标签 ${tabId} 离开编辑页，自动关闭：${changeInfo.url.substring(0, 120)}`);
            return chrome.tabs.remove(tabId);
        }).catch((error) => {
            console.warn('[RPA] 自动关闭已离开编辑页的标签失败：', error.message);
        });
    }
});

// 浏览器或扩展启动后，以仍然打开的已登记标签恢复状态，不接管用户手工标签。
const reconcileRpaTabsOnLifecycle = () => rpaTabRegistryStore.reconcileRpaTabs().catch((error) => {
    console.warn('[RPA] 恢复标签注册表失败：', error.message);
});
chrome.runtime.onStartup.addListener(reconcileRpaTabsOnLifecycle);
chrome.runtime.onInstalled.addListener(reconcileRpaTabsOnLifecycle);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "optimize_title") {
        const title = request.title;
        
        chrome.storage.local.get(['qwenApiKey'], async (result) => {
            const apiKey = result.qwenApiKey;
            if (!apiKey) {
                sendResponse({ success: false, msg: "未配置千问 API Key，请点击插件图标配置。" });
                return;
            }

            try {
                const data = await AiClientApi.requestQwenChat({
                    apiKey,
                    model: QWEN_MODEL,
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: `原标题为：${title}\n\n只返回优化后的纯英文标题文本，绝对不能出现中文字符。不要引号，不要 markdown，不要任何说明。` }
                    ],
                    temperature: 0.1
                });
                let optimizedTitle = "";
                if (data.choices && data.choices.length > 0) {
                    optimizedTitle = extractTitleFromOutput(data.choices[0].message.content);
                }

                if (optimizedTitle) {
                    sendResponse({ success: true, title: optimizedTitle });
                } else {
                    sendResponse({ success: false, msg: "AI 未返回有效标题，请重试。" });
                }

            } catch (error) {
                console.error("千问 API 请求失败:", error);
                const message = error.status
                    ? buildQwenApiErrorMessage(error.status, error.body)
                    : error.message;
                sendResponse({ success: false, msg: "接口调用失败: " + message });
            }
        });

        // 返回 true 表示将异步发送响应
        return true; 
    } else if (request.action === "bulk_optimize_titles") {
        const titles = request.titles;
        
        
        chrome.storage.local.get(['qwenApiKey', 'forbiddenWords', 'whiteList'], async (result) => {
            const apiKey = result.qwenApiKey;
            if (!apiKey) {
                sendResponse({ success: false, msg: "未配置千问 API Key，请点击插件图标配置。" });
                return;
            }

            try {
                const chunkSize = 15;
                const chunkPromises = [];
                
                for (let i = 0; i < titles.length; i += chunkSize) {
                    const chunkTitles = titles.slice(i, i + chunkSize);
                    const chunkIndex = i / chunkSize;
                    
                    const chunkPromise = (async () => {
                        // 千问 RPM 宽松，微量错峰即可
                        if (chunkIndex > 0) {
                            await new Promise(res => setTimeout(res, chunkIndex * 300));
                        }
                        
                        const userMsg = `以下是一个需要被优化的原始标题 JSON 数组：\n${JSON.stringify(chunkTitles)}\n\n请严格按上述规则处理，返回等长的纯 JSON 数组。每个元素是单行纯英文标题文本，不要包含分析、说明、序号。不要 markdown 代码块，只要纯 JSON。`;
                        
                        const data = await AiClientApi.requestQwenChat({
                            apiKey,
                            model: QWEN_MODEL,
                            messages: [
                                { role: "system", content: SYSTEM_PROMPT_BULK },
                                { role: "user", content: userMsg }
                            ],
                            temperature: 0.1,
                            maxRetries: 3
                        });
                        let optimizedPartial = null;
                        
                        // OpenAI 兼容格式：从 choices[0].message.content 中取结果
                        if (data.choices && data.choices.length > 0) {
                            let rawText = data.choices[0].message.content.trim();
                            const startIdx = rawText.indexOf('[');
                            const endIdx = rawText.lastIndexOf(']');
                            if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
                                throw new Error("千问未返回有效 JSON 数组: " + rawText.substring(0, 100));
                            }
                            try {
                                optimizedPartial = JSON.parse(rawText.substring(startIdx, endIdx + 1));
                            } catch (e) {
                                throw new Error("JSON Parse Error: " + rawText.substring(0, 100));
                            }
                        }
                        
                        if (!optimizedPartial || !Array.isArray(optimizedPartial) || optimizedPartial.length !== chunkTitles.length) {
                             throw new Error(`Length mismatch at chunk ${chunkIndex}`);
                        }
                        if (optimizedPartial.length > 0) {
                            console.log('[千问标题原始返回 示例]', optimizedPartial.slice(0, 2));
                        }
                        
                        return { index: chunkIndex, titles: optimizedPartial };
                    })();
                    
                    chunkPromises.push(chunkPromise);
                }
                
                // ⚡️ 并行发射，统一收网
                const resultsUnsorted = await Promise.all(chunkPromises);
                resultsUnsorted.sort((a, b) => a.index - b.index);
                
                let optimizedTitles = [];
                resultsUnsorted.forEach(res => {
                    optimizedTitles = optimizedTitles.concat(res.titles);
                });

                
                // --- 后置安全过滤：违禁词清除 + 字符硬截断 ---
                const forbiddenWords = result.forbiddenWords || [];
                const whiteList = result.whiteList || [];

                optimizedTitles = optimizedTitles.map((title, idx) =>
                    cleanBulkTitleResult(title, forbiddenWords, whiteList, `标题[${idx}]`)
                );

                const repairResult = await TitleOptimizationApi.repairInvalidTitles({
                    sourceTitles: titles,
                    optimizedTitles,
                    maxPasses: 3,
                    optimizeBatch: async (retryTitles, pass) => {
                        console.warn(`[标题定向重试] 第 ${pass} 轮，共 ${retryTitles.length} 条`);
                        const retryChunkSize = 15;
                        const retryChunks = [];

                        for (let i = 0; i < retryTitles.length; i += retryChunkSize) {
                            const chunkTitles = retryTitles.slice(i, i + retryChunkSize);
                            const chunkIndex = i / retryChunkSize;
                            retryChunks.push((async () => {
                                if (chunkIndex > 0) await new Promise(resolve => setTimeout(resolve, chunkIndex * 300));
                                const data = await AiClientApi.requestQwenChat({
                                    apiKey,
                                    model: QWEN_MODEL,
                                    messages: [
                                        { role: 'system', content: SYSTEM_PROMPT_BULK_REPAIR },
                                        {
                                            role: 'user',
                                            content: `Repair these source titles and return an equal-length JSON string array:\n${JSON.stringify(chunkTitles)}`
                                        }
                                    ],
                                    temperature: 0,
                                    maxRetries: 3
                                });
                                return {
                                    index: chunkIndex,
                                    titles: parseBulkTitleResponse(data, chunkTitles.length, `标题重试分片 ${chunkIndex}`)
                                };
                            })());
                        }

                        const retryResults = await Promise.all(retryChunks);
                        retryResults.sort((a, b) => a.index - b.index);
                        return retryResults
                            .flatMap(item => item.titles)
                            .map((title, idx) => cleanBulkTitleResult(
                                title,
                                forbiddenWords,
                                whiteList,
                                `重试标题[${idx}]`
                            ));
                    }
                });
                optimizedTitles = repairResult.titles;
                if (repairResult.invalidIndexes.length > 0) {
                    console.warn(`[标题定向重试] 仍有 ${repairResult.invalidIndexes.length} 条未通过严格校验`, repairResult.invalidIndexes);
                }
                if (optimizedTitles.length === titles.length) {
                    sendResponse({ success: true, titles: optimizedTitles });
                } else {
                    sendResponse({ success: false, msg: `Length mismatch` });
                }

            } catch (error) {
                console.error("千问 Bulk Title API failed:", error);
                sendResponse({ success: false, msg: error.message });
            }
        });
        return true;
    } else if (request.action === "bulk_optimize_attributes") {
        const attributes = request.attributes;
        
        chrome.storage.local.get(['geminiApiKey'], async (result) => {
            const apiKey = result.geminiApiKey;
            if (!apiKey) {
                sendResponse({ success: false, msg: "未配置 Gemini API Key" });
                return;
            }

            try {
                const listData = await AiClientApi.listGeminiModels({ apiKey });
                
                let targetModel = "";
                if (listData && listData.models) {
                    const validModels = listData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'));
                    if (validModels.length === 0) throw new Error("未找到可用的 Gemini 模型");
                    const preferred = validModels.find(m => m.name.includes('flash')) || validModels.find(m => m.name.includes('pro')) || validModels[0];
                    targetModel = preferred.name;
                } else throw new Error("获取模型列表为空");

                const chunkSize = 15;
                const resultsUnsorted = [];
                
                for (let i = 0; i < attributes.length; i += chunkSize) {
                    const chunkAttrs = attributes.slice(i, i + chunkSize);
                    const chunkIndex = i / chunkSize;
                    
                    const bulkPrompt = `${SYSTEM_PROMPT_ATTR}\n\n以下是一个需要被优化的原始属性 JSON 数组：\n${JSON.stringify(chunkAttrs)}\n\n(CRITICAL INSTRUCTION: You MUST process EVERY attribute sequentially. Return ONLY a valid JSON array of strings containing the optimized attributes in EXACT same order and length. No markdown.)`;
                    
                    if (chunkIndex > 0) await new Promise(res => setTimeout(res, 2000));
                    const data = await AiClientApi.requestGeminiContent({
                        apiKey,
                        model: targetModel,
                        contents: [{ role: "user", parts: [{ text: bulkPrompt }] }],
                        generationConfig: { temperature: 0.1 },
                        maxRetries: 4
                    });
                    let optimizedPartial = null;
                    
                    if (data.candidates && data.candidates.length > 0) {
                        const firstCandidate = data.candidates[0];
                        if (firstCandidate.content && firstCandidate.content.parts && firstCandidate.content.parts.length > 0) {
                             let rawText = firstCandidate.content.parts[0].text.trim();
                             rawText = rawText.replace(/^```json/i, '').replace(/```$/i, '').trim();
                             try {
                                 optimizedPartial = JSON.parse(rawText);
                             } catch (e) {
                                 throw new Error("JSON Parse Error");
                             }
                        }
                    }
                    
                    if (!optimizedPartial || !Array.isArray(optimizedPartial) || optimizedPartial.length !== chunkAttrs.length) {
                         throw new Error("Length mismatch");
                    }
                    
                    resultsUnsorted.push({ index: chunkIndex, attributes: optimizedPartial });
                }
                
                resultsUnsorted.sort((a, b) => a.index - b.index);
                
                let optimizedAttrs = [];
                resultsUnsorted.forEach(res => {
                    optimizedAttrs = optimizedAttrs.concat(res.attributes);
                });

                if (optimizedAttrs.length === attributes.length) {
                    sendResponse({ success: true, attributes: optimizedAttrs });
                } else {
                    sendResponse({ success: false, msg: `组装失败` });
                }

            } catch (error) {
                console.error("Gemini Bulk Attr API failed:", error);
                sendResponse({ success: false, msg: error.message });
            }
        });
        return true;
    } else if (request.action === "bulk_optimize_product_codes") {
        let codes = request.codes;
        const emptyIndices = [];
        codes = codes.map((c, i) => {
            const trimmed = String(c || '').trim();
            if (!trimmed) emptyIndices.push(i);
            return trimmed;
        });
        const nonEmptyCodes = codes.filter(c => c.length > 0);
        const hasEmpties = emptyIndices.length > 0;
        if (hasEmpties) {
            console.log(`[SKU] 过滤掉 ${emptyIndices.length} 个空编码，实际发送 ${nonEmptyCodes.length} 个`);
        }
        
        chrome.storage.local.get(['qwenApiKey', 'forbiddenWords', 'whiteList'], async (result) => {
            const apiKey = result.qwenApiKey;
            if (!apiKey) {
                sendResponse({ success: false, msg: "未配置千问 API Key，请点击插件图标配置。" });
                return;
            }

            try {
                const SKU_PROMPT = `你是跨境电商 SKU 编码优化专家。产品编码是客户下单后仓库匹配对应商品的唯一依据，必须保留关键辨识信息。

# 任务
将中文产品编码翻译/缩写为纯英文编码，严格遵守以下规则：

## 核心原则：保留 SKU 辨识力
编码的本质是让仓库能区分不同变体。你必须保留以下关键维度（按优先级排列）：
1. **型号/规格**（如 GUB 1173, PRO143C, R7, ERGO15）→ 原样保留
2. **尺寸/数值/规格尾缀**（如 26寸, 700C, 27.5, 740-80m, 740-90m, 440*120mm）→ 必须完整保留，严禁把 740-80m 改成 740
3. **颜色**（如 亮光, 黑色, 红蓝）→ 翻译缩写：Glossy, Blk, Red/Blue
4. **材质/工艺**（如 碳纤维, 铝合金, 全碳, 3D打印, UD锻造纹）→ 翻译缩写：Crb, Alu, Full Crb, 3D Print, UD Forged

## 店小秘产品编码格式优先级
- 如果原编码已经是纯英文/数字/允许符号且不超过 19 字符，必须原样保留在输出数组中，不要改写。
- 如果原编码包含中文材质和明确规格，优先输出"型号 + 材质缩写 + 规格"，例如 ERGO15 碳纤维车把740-80m → ERGO15 Crb 740-80m，ERGO15 铝合金车把740-80m → ERGO15 Alu 740-80m。
- 产品大类词如 车把、Handlebar、Bar 不是区分 SKU 的第一要素，空间不足时优先删除；型号、材质、规格不能删除。

## 必须删除的垃圾文字
- 营销废话：下单就送, 买一送一, 新品, 热卖, 特价, 包邮, 限时, 促销
- 冗余修饰：高品质, 高强度, 舒适, 超轻, 透气, 专业级
- 重复的产品大类名：自行车, 坐垫, 座垫, 鞍座, 配件, 零件（除非是唯一辨识信息）

## 格式约束
1. 只允许英文字母、数字、空格、(). - / * 和英寸双引号 " 这几个符号
2. 每条编码不超过 19 个字符（含空格）
3. 超长时优先缩写颜色和材质，型号和尺寸绝不能丢
4. 缩写参考：Carbon→Crb, Glossy→Gls, Matte→Mat, Black→Blk, White→Wht, Silver→Sil, Forged→Fgd

# 输出
返回一个 JSON 字符串数组（以 [ 开头 ] 结尾），元素顺序和数量必须与输入完全一致。即使输入为空字符串，也要在对应位置返回空字符串。禁止输出 Markdown 格式。`;

                const workingCodes = hasEmpties ? nonEmptyCodes : codes;
                const chunkSize = 15;
                const chunkPromises = [];
                
                for (let i = 0; i < workingCodes.length; i += chunkSize) {
                    const chunkCodes = workingCodes.slice(i, i + chunkSize);
                    const chunkIndex = i / chunkSize;
                    
                    const chunkPromise = (async () => {
                        // 千问 RPM 较宽松，微量错峰即可
                        if (chunkIndex > 0) {
                            await new Promise(res => setTimeout(res, chunkIndex * 300));
                        }
                        
                        const chunkCodeStrings = chunkCodes.map(c => String(c));
                        const userMsg = `以下是需要优化的原始产品编码 JSON 数组：\n${JSON.stringify(chunkCodeStrings)}\n\n必须返回等长的纯 JSON 数组，元素数量严格等于 ${chunkCodes.length}。即使输入编码无需修改，也必须在对应位置原样保留。不要省略或添加任何元素。`;
                        
                        let optimizedPartial = null;
                        const maxRetries = 3;
                        for (let r = 0; r <= maxRetries; r++) {
                            try {
                                if (r > 0) {
                                    console.warn(`[千问容灾] 编码分块 ${chunkIndex} 重试 ${r}/${maxRetries}`);
                                    const delaySec = (r + 1) * 3;
                                    await new Promise(res => setTimeout(res, delaySec * 1000));
                                }
                                
                                const data = await AiClientApi.requestQwenChat({
                                    apiKey,
                                    model: QWEN_MODEL,
                                    messages: [
                                        { role: "system", content: SKU_PROMPT },
                                        { role: "user", content: userMsg }
                                    ],
                                    temperature: 0.1,
                                    maxRetries: 0
                                });
                                let partial = null;
                                
                                if (data.choices && data.choices.length > 0) {
                                    const rawText = data.choices[0].message.content.trim();
                                    const startIdx = rawText.indexOf('[');
                                    const endIdx = rawText.lastIndexOf(']');
                                    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
                                        if (r === maxRetries) throw new Error("千问未返回有效 JSON 数组: " + rawText.substring(0, 100));
                                        continue;
                                    }
                                    try {
                                        partial = JSON.parse(rawText.substring(startIdx, endIdx + 1));
                                    } catch (e) {
                                        if (r === maxRetries) throw new Error("JSON Parse Error: " + rawText.substring(0, 100));
                                        continue;
                                    }
                                }
                                
                                if (!partial || !Array.isArray(partial) || partial.length !== chunkCodes.length) {
                                    const actualLen = partial && Array.isArray(partial) ? partial.length : 'N/A';
                                    console.warn(`[千问容灾] 编码分块 ${chunkIndex} 长度不匹配 (期望 ${chunkCodes.length}，实际 ${actualLen})`);
                                    if (r === maxRetries) {
                                        console.warn(`[千问容灾] 编码分块 ${chunkIndex} 已重试耗尽，使用原始值作为兜底`);
                                        optimizedPartial = chunkCodes.map(c => String(c));
                                        break;
                                    }
                                    continue;
                                }
                                
                                optimizedPartial = partial;
                                break;
                                
                            } catch (e) {
                                if (e.status && e.status !== 429 && e.status < 500) {
                                    throw new Error(buildQwenApiErrorMessage(e.status, e.body));
                                }
                                if (r === maxRetries) throw e;
                                if (!e.message.includes('API Error')) {
                                    const delaySec = (r + 1) * 3;
                                    await new Promise(res => setTimeout(res, delaySec * 1000));
                                }
                            }
                        }
                        
                        return { index: chunkIndex, codes: optimizedPartial };
                    })();
                    
                    chunkPromises.push(chunkPromise);
                }
                
                const resultsUnsorted = await Promise.all(chunkPromises);
                resultsUnsorted.sort((a, b) => a.index - b.index);
                
                let optimizedCodes = [];
                resultsUnsorted.forEach(res => {
                    optimizedCodes = optimizedCodes.concat(res.codes);
                });

                if (hasEmpties) {
                    emptyIndices.forEach(idx => {
                        optimizedCodes.splice(idx, 0, '');
                    });
                }

                // 🔒 SKU 编码最后兜底：清除残留中文字符，只保留字母/数字/允许符号
                optimizedCodes = optimizedCodes.map(c => {
                    if (!c) return c;
                    const cleaned = String(c).replace(/[一-龥]/g, '').replace(/\s{2,}/g, ' ').trim();
                    return cleaned || c.replace(/[一-龥]/g, '').replace(/\s+/g, ' ').trim() || '';
                });

                // 🔒 违禁词过滤：清除编码中的违禁词
                const forbiddenCodes = result.forbiddenWords || [];
                const whiteCodes = result.whiteList || [];
                if (forbiddenCodes.length > 0) {
                    optimizedCodes = optimizedCodes.map((code) => {
                        if (!code) return code;
                        return ForbiddenWordsCleanerApi.cleanText(String(code), forbiddenCodes, whiteCodes);
                    });
                }

                if (optimizedCodes.length === codes.length) {
                    sendResponse({ success: true, codes: optimizedCodes });
                } else {
                    sendResponse({ success: false, msg: `组装失败` });
                }

            } catch (error) {
                console.error("千问 Bulk Product Code API failed:", error);
                sendResponse({ success: false, msg: error.message });
            }
        });
        return true;
    } else if (request.action === "analyze_images_bulk") {
        const imageUrls = Array.isArray(request.imageUrls)
            ? request.imageUrls.slice(0, ImageFetchPolicyApi.MAX_IMAGE_COUNT)
            : [];
        const forbiddenWords = Array.isArray(request.forbiddenWords) ? request.forbiddenWords : [];
        
        chrome.storage.local.get(['geminiApiKey'], async (result) => {
            const apiKey = result.geminiApiKey;
            if (!apiKey) {
                sendResponse({ success: false, msg: "未配置 Gemini API Key" });
                return;
            }
            try {
                // 1. 获取所有图片的 Base64 数据
                const base64List = await Promise.all(imageUrls.map(async (url) => {
                    try {
                        if (!ImageFetchPolicyApi.isAllowedRemoteImageUrl(url)) return null;
                        const imgRes = await fetch(url);
                        ImageFetchPolicyApi.validateImageResponse(imgRes);
                        const blob = await imgRes.blob();
                        ImageFetchPolicyApi.validateImageBlob(blob);
                        const base64Data = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        return {
                            url: url,
                            mimeType: base64Data.split(';')[0].split(':')[1],
                            data: base64Data.split(',')[1]
                        };
                    } catch (e) {
                        return null; // 若单张图下载失败则跳过
                    }
                }));

                const validImages = base64List.map((img, idx) => {
                    if(img) img.originalIndex = idx;
                    return img;
                }).filter(img => img !== null);

                if (validImages.length === 0) {
                    throw new Error("所有详情图均无法获取到有效数据，可能是外链严重设防。");
                }

                // 2. 查寻可用模型
                const listData = await AiClientApi.listGeminiModels({ apiKey });
                
                let targetModel = "";
                // 优先使用明确支持图片输入的模型
                const VISION_MODELS = [
                    'gemini-1.5-flash',
                    'gemini-2.0-flash',
                    'gemini-1.5-pro'
                ];
                if (listData && listData.models) {
                    const validModels = listData.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'));
                    if (validModels.length === 0) throw new Error("未找到可用的 Gemini 模型");
                    for (const preferred of VISION_MODELS) {
                        const match = validModels.find(m => m.name.includes(preferred));
                        if (match) { targetModel = match.name; break; }
                    }
                    if (!targetModel) {
                        const fallback = validModels.find(m => m.name.includes('flash')) || validModels.find(m => m.name.includes('pro')) || validModels[0];
                        targetModel = fallback.name;
                    }
                } else throw new Error("获取模型列表为空");

                // 3. 构建超级多模态分块指令
                const promptText = `
你是一个极其严格的OCR图像分析AI。你的任务是审查商品详情配图，识别出包含"公司营销/关于我们/联系方式"等无用介绍的垃圾图片。
请仔细读取【每一张图】中的文字，不管是大字标题还是边角小字都绝不能漏掉！只要匹配致命特征，必须判决 \`is_dirty: true\`。

【致命特征1：公司介绍/关于我们 (最高优先级)】：
包含诸如 About Us, Company Profile, Factory Show, Certifications, Exhibition 等明确的公司/工厂介绍标题或文本。
(注意：此项极其重要！一旦在图片中看到 "About Us" 或 "COMPANY PROFILE" 等文字，不仅要判定 is_dirty: true，还必须同时输出 \`has_company_info: true\` 标志！)

【致命特征2：其他违规】：
1. 包含以下具体词语（忽略大小写）：Contact us, Skype, WhatsApp, FAQ, Q&A, Why Choose Us, Warranty, Payment, Feedback, Shipping。
2. 包含明显的联系方式：电话号码（如 +86-, Tel, Phone, WhatsApp）、电子邮箱（@）、网址（www., .com）、社交媒体。
3. 包含明显的水印或他人英文Logo暗纹。
4. 包含用户指定的违禁词：${forbiddenWords.join(", ")}。

(CRITICAL INSTRUCTION: You MUST process EVERY SINGLE image index provided. Return an array of objects where each object corresponds to an image index you received. Do NOT skip any image.)
(CRITICAL JSON FORMAT REQUIRED: DO NOT wrap the array in markdown backticks like \`\`\`json. Output raw JSON array only. Return identical length to input size.)
Example Format:
[
  { "img_index": 0, "is_dirty": true, "has_company_info": true, "reason": "Found huge text 'About Us' and 'Company Profile'" },
  { "img_index": 1, "is_dirty": true, "has_company_info": false, "reason": "Found phone number and WhatsApp" },
  { "img_index": 2, "is_dirty": false, "has_company_info": false, "reason": "Only shows product details, clean" }
]
`;
                // 🚀 高能升级：将原本的串行队列升级为【无情的高并发弹幕】！
                // 🚀 高能升级：针对 Google 免费 API 最新的 20 RPM（每分钟20次）严苛限流策略！
                // 将切片打包量从 5 张图粗暴提升至 15 张图，大幅压榨单次请求的算力，彻底绕过频率拦截封控网！
                const chunkSize = 15; 
                const chunkPromises = [];

                for (let i = 0; i < validImages.length; i += chunkSize) {
                    const chunk = validImages.slice(i, i + chunkSize);
                    const chunkIndex = i / chunkSize;
                    
                    const chunkPromise = (async () => {
                        // 换回 Flash 模型极速版，错峰发车延迟缩短到 2.5 秒，保证白嫖版的并发配额并获得闪电般的速度
                        await new Promise(r => setTimeout(r, chunkIndex * 2500));
                        
                        const parts = [{ text: promptText }];
                        chunk.forEach((imgObj) => {
                            parts.push({ text: `Image index ${imgObj.originalIndex}:` });
                            parts.push({
                                inlineData: {
                                    mimeType: imgObj.mimeType,
                                    data: imgObj.data
                                }
                            });
                        });

                        let data;
                        try {
                            data = await AiClientApi.requestGeminiContent({
                                apiKey,
                                model: targetModel,
                                contents: [{ role: "user", parts }],
                                generationConfig: { temperature: 0.1 }
                            });
                        } catch (error) {
                            console.warn(`[图片审查容错] 切片 ${chunkIndex} 请求失败，已跳过：${error.message}`);
                            return [];
                        }
                        if (data.candidates && data.candidates.length > 0) {
                            let rawText = data.candidates[0].content.parts[0].text;
                            try {
                                const startIdx = rawText.indexOf('[');
                                const endIdx = rawText.lastIndexOf(']');
                                if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                                    let jsonStr = rawText.substring(startIdx, endIdx + 1);
                                    return JSON.parse(jsonStr);
                                } else {
                                    console.warn("AI未返回JSON数组结构: " + rawText);
                                }
                            } catch (e) {
                                console.error("AI Json解析失败:", rawText);
                            }
                        }
                        return [];
                    })();
                    
                    chunkPromises.push(chunkPromise);
                }

                // ⚡️ 万箭齐发！统一收网！
                const resultsArrays = await Promise.all(chunkPromises);
                
                let allResults = [];
                resultsArrays.forEach(arr => {
                    allResults = allResults.concat(arr);
                });

                // 因为原先有些图可能下载失败跳过了，我们用一个完全干净的覆盖映射数组传回去
                const fullResultsMap = new Array(imageUrls.length).fill({ is_dirty: false, has_company_info: false, reason: "Fetch Failed/Skipped" });
                allResults.forEach(res => {
                    if(res.img_index !== undefined && res.img_index < fullResultsMap.length) {
                        fullResultsMap[res.img_index] = res;
                    }
                });

                // 将确认为违禁的图片 URL 记录到内存黑名单，方便下次秒杀，节省配额
                try {
                    const storeData = await chrome.storage.local.get(['badImageCache']);
                    let cache = storeData.badImageCache || {};
                    let cacheUpdated = false;
                    allResults.forEach(res => {
                        if (res.is_dirty && res.img_index !== undefined && res.img_index < imageUrls.length) {
                            const url = imageUrls[res.img_index];
                            if (url && !cache[url]) {
                                // 升级：不仅记录 true，还要记录是否包含公司信息，以便下次仍然能执行物理截断
                                cache[url] = { is_dirty: true, has_company_info: !!res.has_company_info };
                                cacheUpdated = true;
                            }
                        }
                    });
                    if (cacheUpdated) {
                        await chrome.storage.local.set({ badImageCache: cache });
                    }
                } catch(e) { console.error("Cache saving err:", e); }

                sendResponse({ success: true, results: fullResultsMap });

            } catch (error) {
                console.error("Bulk Image Analysis Request failed:", error);
                sendResponse({ success: false, msg: "批量图像分析失败: " + error.message });
            }
        });
        return true;
    } else {
        const routed = rpaMessageRouter.handleRpaMessage(request, sender);
        if (routed) {
            routed
                .then(sendResponse)
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }
    }
});

function buildQwenApiErrorMessage(status, errText) {
    const model = 'qwen-plus';
    let requestId = '';
    let detail = '';
    try {
        const body = JSON.parse(errText);
        requestId = body.error && body.error.id || '';
        detail = body.error && body.error.message || '';
    } catch (_) {
        detail = errText;
    }
    const lines = [
        `千问接口访问被拒绝（HTTP ${status}）`,
        `请检查以下可能的原因：`,
        `1. 使用普通 DashScope/百炼 API Key，而不是专有模型 API Key`,
        `2. 模型 ${model} 是否已开通`,
        `3. API Key 对应的账户额度和欠费状态`,
    ];
    if (detail) lines.push(`错误详情：${detail}`);
    if (requestId) lines.push(`请求 ID：${requestId}`);
    return lines.join('\n');
}

globalThis.QwenApiForTest = { buildQwenApiErrorMessage };

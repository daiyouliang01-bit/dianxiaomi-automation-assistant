updateCount();

// 加载已保存的 Gemini Key
chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
        document.getElementById('geminiKey').value = result.geminiApiKey;
    }
});

document.getElementById('saveKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('geminiKey').value.trim();
    const statusDiv = document.getElementById('status');
    if (!key) {
        statusDiv.innerHTML = `<span class="error">❌ 请输入 API Key</span>`;
        return;
    }
    chrome.storage.local.set({ geminiApiKey: key }, () => {
        statusDiv.innerHTML = `<span class="success">✅ Gemini Key 保存成功！</span>`;
        setTimeout(() => {
            statusDiv.innerText = "准备就绪。";
        }, 2000);
    });
});

// 加载已保存的千问 Key
chrome.storage.local.get(['qwenApiKey'], (result) => {
    if (result.qwenApiKey) {
        document.getElementById('qwenKey').value = result.qwenApiKey;
    }
});

document.getElementById('saveQwenKeyBtn').addEventListener('click', () => {
    const key = document.getElementById('qwenKey').value.trim();
    const statusDiv = document.getElementById('status');
    if (!key) {
        statusDiv.innerHTML = `<span class="error">❌ 请输入千问 API Key</span>`;
        return;
    }
    chrome.storage.local.set({ qwenApiKey: key }, () => {
        statusDiv.innerHTML = `<span class="success">✅ 千问 Key 保存成功！</span>`;
        setTimeout(() => {
            statusDiv.innerText = "准备就绪。";
        }, 2000);
    });
});

document.getElementById('syncBtn').addEventListener('click', () => {
    const statusDiv = document.getElementById('status');
    const btn = document.getElementById('syncBtn');

    // 1. 获取当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const currentTab = tabs[0];

        // 🛡️ 防呆检查：如果你没在店小秘页面，就提示错误
        if (!currentTab || !String(currentTab.url || '').includes("dianxiaomi.com")) {
            statusDiv.innerHTML = `<span class="error">❌ 同步失败</span><br>请先打开并<b>刷新</b>任意店小秘页面，再点击同步。`;
            return;
        }

        btn.disabled = true;
        btn.innerText = '⏳ 正在请求页面...';
        statusDiv.innerText = "正在通过页面抓取数据...";

        // 2. 发送指令给 content.js
        chrome.tabs.sendMessage(currentTab.id, { action: "start_sync_proxy" }, (response) => {
            btn.disabled = false;
            btn.innerText = '🔄 同步店小秘词库';

            // 检查连接错误（比如页面没刷新，content.js 还没注入）
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                statusDiv.innerHTML = `<span class="error">❌ 连接失败</span><br>请<b>刷新当前网页</b>后重试！`;
                return;
            }

            // 处理结果
            if (response && response.success) {
                statusDiv.innerHTML = `<span class="success">✅ 同步成功！</span><br>获取到 ${response.count} 个违禁词。`;
                updateCount();
            } else {
                statusDiv.textContent = `❌ 同步失败：${response && response.msg ? response.msg : '未知错误'}`;
                statusDiv.className = 'error';
            }
        });
    });
});

function updateCount() {
    chrome.storage.local.get(['forbiddenWords'], (result) => {
        document.getElementById('currentCount').innerText = result.forbiddenWords ? result.forbiddenWords.length : 0;
    });
}

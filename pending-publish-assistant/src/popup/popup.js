updateCount();

// 同步按钮
document.getElementById('syncBtn').addEventListener('click', () => {
    const statusDiv = document.getElementById('status');
    const btn = document.getElementById('syncBtn');

    // 1. 获取当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const currentTab = tabs[0];

        // 🛡️ 防呆检查：如果你没在店小秘页面，就提示错误
        if (!currentTab || !currentTab.url.includes("dianxiaomi.com")) {
            statusDiv.innerHTML = `<span class="error">❌ 同步失败</span><br>请先打开并<b>刷新</b>任意店小秘页面，再点击同步。`;
            return;
        }

        btn.disabled = true;
        btn.innerText = '⏳ 正在请求页面...';
        statusDiv.innerText = "正在通过页面抓取数据...";

        // 2. 发送指令给 content.js
        window.DxmForbiddenSync.runPopupSync({
            button: btn,
            status: statusDiv,
            watchdogMs: 50000,
            sendMessage: done => chrome.tabs.sendMessage(currentTab.id, { action: "start_sync_proxy" }, (response) => {
            // 检查连接错误（比如页面没刷新，content.js 还没注入）
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                statusDiv.innerHTML = `<span class="error">❌ 连接失败</span><br>请<b>刷新当前网页</b>后重试！`;
                done({ success: false, msg: '未连接到店小秘页面，请刷新当前页面后重试。' });
                return;
            }
            done(response);
            if (response && response.success) updateCount();
            })
        });
    });
});

function updateCount() {
    chrome.storage.local.get(['forbiddenWords'], (result) => {
        document.getElementById('currentCount').innerText = result.forbiddenWords ? result.forbiddenWords.length : 0;
    });
}

// 待发布自动化离站提示抑制器
// 独立文件注入，绕过页面 CSP 对内联脚本的限制
(function() {
    const isAutomationPage = () => {
        const query = String(location.search || '');
        return /[?&]dxm_auto_publish=1\b/.test(query)
            || sessionStorage.getItem('dxmAutoPublishPhaseV2');
    };

    const suppressBeforeUnload = () => {
        if (!isAutomationPage()) return;
        window.__dxmSuppressBeforeUnload = true;
        try {
            window.onbeforeunload = null;
        } catch (error) {
            // 页面可能冻结了属性，后台关闭标签时仍会兜底接受原生确认框。
        }
    };

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (String(type).toLowerCase() === 'beforeunload' && isAutomationPage()) {
            window.__dxmSuppressBeforeUnload = true;
            return;
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    suppressBeforeUnload();
    window.addEventListener('DOMContentLoaded', suppressBeforeUnload, true);
    window.addEventListener('pageshow', suppressBeforeUnload, true);
    var _dxmHookIterations = 0;
    var DXM_HOOK_MAX_ITERATIONS = 600;
    var _dxmHookTimer = setInterval(function() {
      _dxmHookIterations += 1;
      if (_dxmHookIterations > DXM_HOOK_MAX_ITERATIONS) {
        clearInterval(_dxmHookTimer);
        return;
      }
      suppressBeforeUnload();
    }, 500);
})();

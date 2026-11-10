(function() {
    // ---- console 静默罩（本地静默，ai_debug 开关控制，不回传远程日志）----
    const console = {
        log: (...args) => {
            try {
                if (typeof localStorage !== 'undefined' && (localStorage.getItem('ai_debug') === '1' || localStorage.getItem('ai_debug') === 'true')) {
                    window.console.log(...args);
                }
            } catch (e) {}
        },
        warn: (...args) => {
            try {
                if (typeof localStorage !== 'undefined' && (localStorage.getItem('ai_debug') === '1' || localStorage.getItem('ai_debug') === 'true')) {
                    window.console.warn(...args);
                }
            } catch (e) {}
        },
        error: (...args) => {
            try {
                if (typeof localStorage !== 'undefined' && (localStorage.getItem('ai_debug') === '1' || localStorage.getItem('ai_debug') === 'true')) {
                    window.console.error(...args);
                }
            } catch (e) {}
        },
        info: (...args) => {
            try {
                if (typeof localStorage !== 'undefined' && (localStorage.getItem('ai_debug') === '1' || localStorage.getItem('ai_debug') === 'true')) {
                    window.console.info(...args);
                }
            } catch (e) {}
        }
    };

    const originalOpen = window.open;
    window.open = function(url, name, specs) {
        if (sessionStorage.getItem('rpa_running') === '1' && url && !url.includes('rpa_auto=') && url.includes('rpa_run_id=')) {
            const separator = url.includes('?') ? '&' : '?';
            url = url + separator + 'rpa_auto=1';
        }
        return originalOpen.call(window, url, name, specs);
    };

    // 劫持 window.focus()，防止页面初始化或输入框聚焦时强制抢占/激活当前浏览器窗口焦点
    window.focus = function() {
        console.log('[RPA Safety] Blocked window.focus() call to prevent active focus stealing.');
    };

    // 汽摩配/医疗等 RPA 自动优化模式下拦截 unload/beforeunload。
    // 店小秘编辑页的 Permissions Policy 禁止 unload，转发该监听会在扩展错误页产生 violation。
    const rpaSearch = String(window.location.search || '');
    const isRpaConfiguredPage = /[?&](opt_mode|desc_clean|save_dest|rpa_image_resize|rpa_clean_forbidden_words)=/i.test(rpaSearch);
    if (isRpaConfiguredPage) {
        // 彻底断开与母页的 opener 关系，防止子页保存成功后重载母页导致 RPA 运行中心消失或流程中断
        try {
            Object.defineProperty(window, 'opener', {
                get() { return null; },
                set() {}
            });
        } catch (e) {
            console.warn('[RPA Safety] Failed to nullify window.opener:', e.message);
        }

        // 劫持原生弹窗，避免在后台标签运行时弹出原生对话框而被浏览器强行翻转/夺取到前台
        window.alert = function(msg) {
            console.log('[RPA Safety] Blocked native window.alert call:', msg);
            sessionStorage.setItem('rpa_last_server_error', String(msg));
            return undefined;
        };

        window.confirm = function(msg) {
            console.log('[RPA Safety] Blocked native window.confirm call (auto-returning true):', msg);
            return true;
        };

        window.prompt = function(msg, defaultText) {
            console.log('[RPA Safety] Blocked native window.prompt call:', msg);
            return defaultText || '';
        };

        window.onbeforeunload = null;
        const originalAddEventListener = window.addEventListener;
        window.addEventListener = function(type, listener, options) {
            if (type === 'unload' || type === 'beforeunload') {
                console.log(`[RPA Safety] Blocked window.addEventListener('${type}') to prevent page freeze.`);
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        // 拦截 window.onunload 赋值
        Object.defineProperty(window, 'onunload', {
            get() { return null; },
            set(val) { console.log('[RPA Safety] Blocked window.onunload assignment.'); }
        });
    }

    // 拦截并吃掉由于 RPA 极速回写导致 Ant Design 销毁时在页面上抛出的 Unhandled Rejection 警告红字
    window.addEventListener('unhandledrejection', function(event) {
        try {
            if (event.reason) {
                const msg = String(event.reason.message || event.reason || '');
                if (msg.includes("reading 'textArea'") || msg.includes("reading 'input'") || msg.includes("Cannot read properties of null")) {
                    event.preventDefault(); // 阻止向控制台输出红字报错
                }
            }
        } catch(e){}
    });

    window.addEventListener('error', function(event) {
        try {
            const msg = String(event.message || '');
            if (msg.includes("reading 'textArea'") || msg.includes("reading 'input'") || msg.includes("Cannot read properties of null")) {
                event.preventDefault(); // 阻止向控制台输出红字报错
            }
        } catch(e){}
    });
})();

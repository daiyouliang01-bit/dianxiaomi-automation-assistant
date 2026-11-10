// ============================================
// dxm-claim.js — 数据采集中心：一键认领到当前/锁定店铺
// ============================================

(function () {
    'use strict';

    const CLAIM_BTN_ID = 'dxm-claim-to-store-btn';
    const LOCK_KEY = 'rpa_locked_store_name';

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function compact(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    window.isDxmDataAcquisitionPage = function (href) {
        const url = String(href || (window.location && window.location.href) || '').toLowerCase();
        return url.includes('/web/productcrawl/dataacquisition');
    };

    function resolveTargetStoreName() {
        try {
            const locked = sessionStorage.getItem(LOCK_KEY);
            if (locked && window.RpaPageTargeting && window.RpaPageTargeting.isSpecificStoreName(locked)) {
                return window.RpaPageTargeting.normalizeStoreName(locked);
            }
        } catch (_) {}
        if (window.getRpaCurrentStoreName) {
            const current = window.getRpaCurrentStoreName();
            if (current) return current;
        }
        return '';
    }

    function findClaimLinks() {
        return Array.from(document.querySelectorAll('a')).filter((a) => {
            const text = compact(a.innerText || a.textContent);
            if (text !== '认领') return false;
            const href = a.getAttribute('href') || '';
            return href === 'javascript:' || href === 'javascript:;' || href === '#';
        }).filter((a) => a.offsetWidth > 0 || a.offsetHeight > 0);
    }

    function findClaimDialog() {
        const dialogs = Array.from(document.querySelectorAll('.ant-modal, [role="dialog"]'));
        return dialogs.find((d) => {
            const r = d.getBoundingClientRect();
            if (r.width < 200) return false;
            const text = compact(d.innerText);
            return text.includes('认领到采集箱') || (text.includes('选择店铺') && text.includes('速卖通'));
        }) || null;
    }

    function clickTextIn(root, exact) {
        const nodes = Array.from(root.querySelectorAll('label, span, div, a, [class*="checkbox"], [class*="radio"]'));
        const target = nodes.find((el) => compact(el.innerText || el.textContent) === exact);
        if (!target) return false;
        target.click();
        return true;
    }

    function checkStoreInDialog(dialog, storeName) {
        const needle = compact(storeName);
        const boxes = Array.from(dialog.querySelectorAll('input[type="checkbox"], .ant-checkbox-wrapper, label'));
        let match = boxes.find((el) => compact(el.innerText || el.textContent).includes(needle) && compact(el.innerText || el.textContent).length < 80);
        if (!match) {
            match = boxes.find((el) => /[A-Za-z0-9]{2,8}-/.test(compact(el.innerText || el.textContent)));
        }
        if (!match) return false;
        match.click();
        return true;
    }

    function clickConfirm(dialog) {
        const btn = Array.from(dialog.querySelectorAll('button')).find((el) => compact(el.innerText) === '确定' && !el.disabled);
        if (!btn) return false;
        btn.click();
        return true;
    }

    window.runDxmClaimToStore = async function (options = {}) {
        const storeName = options.storeName || resolveTargetStoreName();
        const limit = Number(options.limit || 5);
        if (!storeName) {
            alert('⚠️ 未锁定店铺。请先在采集箱选中具体店铺并启动过一次 RPA（会记住店铺），或在本页选中店铺后再认领。');
            return { ok: false, reason: 'no_store' };
        }
        let claimed = 0;
        for (let i = 0; i < limit; i += 1) {
            const links = findClaimLinks();
            if (links.length === 0) break;
            links[0].click();
            let dialog = null;
            for (let w = 0; w < 20; w += 1) {
                await sleep(250);
                dialog = findClaimDialog();
                if (dialog) break;
            }
            if (!dialog) return { ok: false, reason: 'no_dialog', claimed };
            clickTextIn(dialog, '速卖通');
            await sleep(400);
            if (!checkStoreInDialog(dialog, storeName)) {
                return { ok: false, reason: 'no_store_checkbox', claimed, storeName };
            }
            await sleep(400);
            if (!clickConfirm(dialog)) {
                return { ok: false, reason: 'no_confirm', claimed };
            }
            claimed += 1;
            await sleep(1200);
        }
        return { ok: true, claimed, storeName };
    };

    window.initDxmClaimButton = function () {
        if (!window.isDxmDataAcquisitionPage()) return;
        if (document.getElementById(CLAIM_BTN_ID)) return;

        const anchors = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const startBtn = anchors.find((el) => compact(el.innerText) === '开始采集' && el.offsetHeight > 0);
        const btn = document.createElement('button');
        btn.id = CLAIM_BTN_ID;
        btn.type = 'button';
        btn.textContent = '一键认领到当前店铺';
        btn.style.cssText = 'margin-left:8px;height:32px;padding:0 12px;border:none;border-radius:4px;background:#1677ff;color:#fff;cursor:pointer;font-size:12px;vertical-align:top;';
        btn.onclick = async (e) => {
            e.preventDefault();
            if (btn.dataset.busy === '1') return;
            btn.dataset.busy = '1';
            const old = btn.textContent;
            btn.textContent = '认领中…';
            try {
                const result = await window.runDxmClaimToStore({ limit: 5 });
                if (!result.ok) {
                    alert(`认领未完成：${result.reason || '未知'}（已认领 ${result.claimed || 0}）`);
                } else if (result.claimed === 0) {
                    alert('当前页没有可认领商品。');
                } else {
                    alert(`已认领 ${result.claimed} 条到「${result.storeName}」。请到速卖通采集箱用 RPA 编辑。`);
                }
            } catch (err) {
                alert(`认领失败：${err.message || err}`);
            }
            btn.textContent = old;
            btn.dataset.busy = '0';
        };

        if (startBtn && startBtn.parentNode) {
            startBtn.parentNode.insertBefore(btn, startBtn.nextSibling);
        } else {
            document.body.appendChild(btn);
        }
    };
})();

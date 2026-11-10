// ============================================
// sku-pricing-fill.js — 编辑页写入零售价/货值/重量
// 普通产品 RPA 在清理阶段之后、保存之前执行。插头模式不覆盖客户原价。
// ============================================

(function () {
    'use strict';

    function setNativeValue(input, value) {
        if (!input) return false;
        const str = String(value);
        const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
        if (setter) setter.call(input, str);
        else input.value = str;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function visibleInputs(root) {
        return Array.from((root || document).querySelectorAll('input[type="text"], input[type="number"], input:not([type])'))
            .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled);
    }

    function compact(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    function inputsUnderHeader(headerText) {
        const needle = compact(headerText);
        const headers = Array.from(document.querySelectorAll('th, .vxe-header--column, .ant-table-cell, .ant-table-thead td, [class*="header"]'));
        let header = null;
        for (const el of headers) {
            if (compact(el.innerText || el.textContent).includes(needle) && el.offsetWidth > 0) {
                header = el;
                break;
            }
        }
        if (!header) {
            return visibleInputs().filter((input) => {
                const ph = compact(input.placeholder);
                const aria = compact(input.getAttribute('aria-label'));
                return ph.includes(needle) || aria.includes(needle);
            });
        }
        const row = header.parentElement;
        if (!row) return [];
        const idx = Array.from(row.children).indexOf(header);
        if (idx < 0) return [];
        const bodyRows = document.querySelectorAll('.ant-table-tbody tr, .vxe-body--row, tbody tr, .ait-table-row');
        const found = [];
        bodyRows.forEach((tr) => {
            const cell = tr.children[idx];
            if (!cell) return;
            visibleInputs(cell).forEach((input) => found.push(input));
        });
        return found;
    }

    function readSourceCost() {
        const pricing = window.SkuPricing;
        if (!pricing) return null;
        const fromUrl = pricing.costFromSearch(window.location.search);
        if (fromUrl) return fromUrl;
        const bodyText = document.body ? document.body.innerText : '';
        let cost = pricing.parseSourcePrice(bodyText);
        if (cost) return cost;
        const labeled = Array.from(document.querySelectorAll('td, div, span, label')).find((el) => compact(el.innerText).includes('货源价'));
        if (labeled) cost = pricing.parseSourcePrice(labeled.innerText || labeled.parentElement && labeled.parentElement.innerText);
        return cost || null;
    }

    function readSourceWeightKg() {
        const pricing = window.SkuPricing;
        if (!pricing) return null;
        const bodyText = document.body ? document.body.innerText : '';
        return pricing.parseWeightKg(bodyText);
    }

    window.runRpaSkuPricingStage = async function (stageResults, log) {
        const logger = typeof log === 'function' ? log : () => {};
        stageResults = stageResults || {};
        if (window.isPlugOptimizationMode && window.isPlugOptimizationMode()) {
            stageResults.pricing = 'skipped_plug';
            logger('插头模式：跳过自动定价，保留客户原价。');
            return { status: 'skipped_plug' };
        }
        const pricing = window.SkuPricing;
        if (!pricing) {
            stageResults.pricing = 'skipped';
            logger('⚠️ 定价模块未加载，跳过。');
            return { status: 'skipped' };
        }

        const cost = readSourceCost();
        if (!cost) {
            stageResults.pricing = 'skipped_no_cost';
            logger('⚠️ 未读到货源价，跳过自动定价。');
            return { status: 'skipped_no_cost' };
        }
        const retail = pricing.computeRetailPrice(cost);
        if (!retail) {
            stageResults.pricing = 'skipped';
            return { status: 'skipped' };
        }

        const retailInputs = inputsUnderHeader('零售价').concat(inputsUnderHeader('零售价格'));
        const valueInputs = inputsUnderHeader('货值');
        const weightInputs = inputsUnderHeader('重量').concat(inputsUnderHeader('重量(kg)'));
        let wrote = 0;
        let skippedExisting = 0;

        retailInputs.forEach((input) => {
            if (pricing.shouldWriteRetail(input.value, cost, retail)) {
                if (setNativeValue(input, retail.toFixed(2))) wrote += 1;
            } else skippedExisting += 1;
        });
        valueInputs.forEach((input) => {
            if (pricing.shouldWriteRetail(input.value, cost, retail)) {
                if (setNativeValue(input, retail.toFixed(2))) wrote += 1;
            } else skippedExisting += 1;
        });

        const weightKg = readSourceWeightKg();
        let weightWrote = 0;
        if (weightKg) {
            weightInputs.forEach((input) => {
                if (pricing.shouldWriteWeight(input.value, weightKg)) {
                    if (setNativeValue(input, String(weightKg))) weightWrote += 1;
                }
            });
        }

        stageResults.pricing = wrote > 0 ? 'success' : (skippedExisting > 0 ? 'kept_existing' : 'unconfirmed');
        logger(`定价：货源¥${cost} → 零售/货值¥${retail.toFixed(2)}（写入${wrote}，保留${skippedExisting}）${weightWrote ? `，重量${weightKg}kg×${weightWrote}` : ''}`);
        return { status: stageResults.pricing, cost, retail, wrote, skippedExisting, weightWrote };
    };
})();

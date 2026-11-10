// ============================================
// sku-pricing.js — 货源价 → 零售价/货值 纯计算
// 不碰 DOM。公式：零售价 = 货值 = (成本 + 国内运费) × 倍率
// ============================================

(function (root) {
    'use strict';

    const DEFAULTS = {
        freightCny: 5,
        multiplier: 2.469
    };

    function parseNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    function costFromSearch(search) {
        const match = String(search || '').match(/[?&]rpa_source_cost=([\d.]+)/);
        if (!match) return null;
        const n = parseNumber(match[1]);
        return n !== null && n > 0 && n < 100000 ? n : null;
    }

    function parseSourcePrice(text) {
        const raw = String(text || '');
        const patterns = [
            /零\s*([\d.]+)\s*CNY/i,
            /货源价(?:格)?[^\d]{0,8}([\d.]+)/,
            /¥\s*([\d.]+)/,
            /([\d.]+)\s*CNY/i
        ];
        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (!match) continue;
            const n = parseNumber(match[1]);
            if (n !== null && n > 0 && n < 100000) return n;
        }
        return null;
    }

    function parseWeightKg(text) {
        const raw = String(text || '');
        const kg = raw.match(/(\d+(?:\.\d+)?)\s*kg/i);
        if (kg) {
            const n = parseNumber(kg[1]);
            if (n !== null && n > 0 && n < 100) return n;
        }
        const g = raw.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\b/i);
        if (g) {
            const n = parseNumber(g[1]);
            if (n !== null && n > 0 && n < 100000) return Math.round((n / 1000) * 1000) / 1000;
        }
        return null;
    }

    function roundMoney(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return Math.round(n * 100) / 100;
    }

    function computeRetailPrice(cost, options = {}) {
        const freight = options.freightCny === undefined ? DEFAULTS.freightCny : Number(options.freightCny);
        const multiplier = options.multiplier === undefined ? DEFAULTS.multiplier : Number(options.multiplier);
        const n = Number(cost);
        if (!Number.isFinite(n) || n <= 0) return null;
        return roundMoney((n + freight) * multiplier);
    }

    function existingLooksUnconverted(existing, cost) {
        const current = parseNumber(existing);
        if (current === null || current <= 0) return true;
        if (cost === null || cost <= 0) return false;
        const ratio = Math.abs(current - cost) / cost;
        return ratio <= 0.05;
    }

    function shouldWriteRetail(existing, cost, computed) {
        if (computed === null || computed <= 0) return false;
        return existingLooksUnconverted(existing, cost);
    }

    function shouldWriteWeight(existing, computedKg) {
        if (computedKg === null || computedKg <= 0) return false;
        const current = parseNumber(existing);
        return current === null || current <= 0;
    }

    const api = {
        DEFAULTS,
        parseNumber,
        costFromSearch,
        parseSourcePrice,
        parseWeightKg,
        roundMoney,
        computeRetailPrice,
        existingLooksUnconverted,
        shouldWriteRetail,
        shouldWriteWeight
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.SkuPricing = api;
})(typeof window !== 'undefined' ? window : globalThis);

'use strict';

(function initTitleOptimization(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.TitleOptimization = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTitleOptimization() {
    function normalizeTitle(value) {
        return String(value || '')
            .replace(/[‐‑‒–—―]/g, '-')
            .replace(/[‘’‚‛]/g, "'")
            .replace(/[“”„‟]/g, '"')
            .replace(/…/g, '...')
            .replace(/[^\x20-\x7E]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isValidTitle(value) {
        const title = normalizeTitle(value);
        return title.length > 5 &&
            title.length <= 128 &&
            /^[\x20-\x7E]+$/.test(title) &&
            /[A-Za-z]/.test(title);
    }

    function findInvalidIndexes(titles) {
        return (Array.isArray(titles) ? titles : [])
            .map((title, index) => isValidTitle(title) ? -1 : index)
            .filter(index => index >= 0);
    }

    async function repairInvalidTitles({
        sourceTitles,
        optimizedTitles,
        optimizeBatch,
        maxPasses = 2
    } = {}) {
        if (!Array.isArray(sourceTitles) || !Array.isArray(optimizedTitles)) {
            throw new TypeError('标题修复需要源标题和优化标题数组');
        }
        if (sourceTitles.length !== optimizedTitles.length) {
            throw new Error(`标题修复数量不匹配：源标题 ${sourceTitles.length}，优化结果 ${optimizedTitles.length}`);
        }
        if (typeof optimizeBatch !== 'function') throw new TypeError('标题修复缺少 optimizeBatch');
        if (!Number.isInteger(maxPasses) || maxPasses < 0) throw new TypeError('maxPasses 必须是非负整数');

        const titles = optimizedTitles.map(normalizeTitle);
        let invalidIndexes = findInvalidIndexes(titles);
        let attempts = 0;

        for (let pass = 1; pass <= maxPasses && invalidIndexes.length > 0; pass++) {
            const retrySources = invalidIndexes.map(index => sourceTitles[index]);
            const retryResults = await optimizeBatch(retrySources, pass);
            if (!Array.isArray(retryResults) || retryResults.length !== retrySources.length) {
                throw new Error(`标题修复结果数量不匹配：期望 ${retrySources.length}，收到 ${Array.isArray(retryResults) ? retryResults.length : 0}`);
            }

            invalidIndexes.forEach((originalIndex, retryIndex) => {
                titles[originalIndex] = normalizeTitle(retryResults[retryIndex]);
            });
            attempts = pass;
            invalidIndexes = findInvalidIndexes(titles);
        }

        return { titles, invalidIndexes, attempts };
    }

    return Object.freeze({
        normalizeTitle,
        isValidTitle,
        findInvalidIndexes,
        repairInvalidTitles
    });
});

// ============================================
// sku-mapping.js — 批量 SKU 的稳定任务映射
// 不依赖 DOM 顺序；页面层只需提供带身份信息的候选目标。
// ============================================

(function(root) {
    'use strict';

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function isCodeCompliant(code) {
        if (!code) return true;
        const onlyAscii = /^[a-zA-Z0-9 \(\)\.\-\*\/"]+$/.test(String(code));
        return onlyAscii && String(code).length <= 49;
    }

    const MATERIAL_RULES = [
        { pattern: /(碳纤维|全碳|碳纤)/, code: 'Crb' },
        { pattern: /(铝合金|铝制|铝)/, code: 'Alu' }
    ];

    function detectMaterial(value) {
        const text = String(value || '');
        const rule = MATERIAL_RULES.find(item => item.pattern.test(text));
        return rule ? rule.code : '';
    }

    function getAsciiSkuSegments(value) {
        return String(value || '').match(/[A-Za-z0-9]+(?:[.\-\*\/][A-Za-z0-9]+)*/g) || [];
    }

    function isSpecificationSegment(segment) {
        const text = String(segment || '');
        return /\d+(?:[.\-\*\/]\d+)+[A-Za-z]*/.test(text) || /\d+(?:mm|cm|m|in|inch)$/i.test(text);
    }

    function joinSkuParts(parts) {
        return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    function chooseSkuWithinLimit(candidates) {
        return candidates.find(code => code && isCodeCompliant(code)) || '';
    }

    function normalizeProductCode(code) {
        const original = normalizeText(code);
        if (!original) return '';
        if (isCodeCompliant(original)) return original;

        const material = detectMaterial(original);
        if (!material) return '';

        const segments = getAsciiSkuSegments(original);
        if (segments.length === 0) return '';

        const specIndex = segments.findIndex(isSpecificationSegment);
        const modelSegments = specIndex === -1 ? segments : segments.slice(0, specIndex);
        const specSegments = specIndex === -1 ? [] : segments.slice(specIndex);
        const model = modelSegments.join(' ');
        const compactModel = modelSegments.join('');
        const spec = specSegments.join(' ');
        const compactSpec = specSegments.join('');

        return chooseSkuWithinLimit([
            joinSkuParts([model, material, spec]),
            joinSkuParts([compactModel, material, compactSpec]),
            joinSkuParts([modelSegments[0], material, specSegments.at(-1)])
        ]);
    }

    function buildSkuOptimizationTasks(candidates) {
        return (Array.isArray(candidates) ? candidates : []).map((candidate, index) => ({
            ...candidate,
            id: `sku:${index}:${candidate.productKey}:${candidate.variantKey}`,
            ...(() => {
                const compliant = isCodeCompliant(candidate.originalCode);
                const localOptimizedCode = compliant ? '' : normalizeProductCode(candidate.originalCode);
                const needsLocalWrite = Boolean(localOptimizedCode && normalizeText(localOptimizedCode) !== normalizeText(candidate.originalCode));
                return {
                    localOptimizedCode,
                    needsLocalWrite,
                    needsOptimize: !compliant && !needsLocalWrite
                };
            })()
        }));
    }

    function sameIdentity(left, right) {
        return normalizeText(left) === normalizeText(right);
    }

    function resolveUniqueTarget(task, candidates) {
        if (!task || !Array.isArray(candidates)) {
            throw new Error('Unable to uniquely resolve SKU target: invalid mapping data');
        }

        const matches = candidates.filter(candidate =>
            candidate &&
            sameIdentity(candidate.productKey, task.productKey) &&
            sameIdentity(candidate.variantKey, task.variantKey) &&
            sameIdentity(candidate.originalCode, task.originalCode)
        );

        if (matches.length !== 1) {
            throw new Error(`Unable to uniquely resolve SKU target: found ${matches.length} matches`);
        }

        return matches[0];
    }

    function resolveUniqueIdentity(task, candidates) {
        if (!task || !Array.isArray(candidates)) {
            throw new Error('Unable to uniquely resolve SKU identity: invalid mapping data');
        }

        const matches = candidates.filter(candidate =>
            candidate &&
            sameIdentity(candidate.productKey, task.productKey) &&
            sameIdentity(candidate.variantKey, task.variantKey)
        );

        if (matches.length !== 1) {
            throw new Error(`Unable to uniquely resolve SKU identity: found ${matches.length} matches`);
        }

        return matches[0];
    }

    function attachOptimizedCodes(tasks, optimizedCodes) {
        if (!Array.isArray(tasks) || !Array.isArray(optimizedCodes)) {
            throw new Error('SKU result count validation failed: tasks and results must be arrays');
        }
        if (tasks.length !== optimizedCodes.length) {
            throw new Error(`SKU result count mismatch: expected ${tasks.length}, received ${optimizedCodes.length}`);
        }

        return tasks.map((task, index) => ({
            ...task,
            optimizedCode: optimizedCodes[index]
        }));
    }

    function buildOptimizedCodeWriteTasks(tasks, optimizedCodes) {
        if (!Array.isArray(tasks)) {
            throw new Error('SKU write-task assembly failed: tasks must be an array');
        }
        const localTasks = tasks
            .filter(task => task && task.needsLocalWrite)
            .map(task => ({ ...task, optimizedCode: task.localOptimizedCode }));
        const aiTasks = attachOptimizedCodes(
            tasks.filter(task => task && task.needsOptimize),
            optimizedCodes || []
        );
        return localTasks.concat(aiTasks);
    }

    root.SkuMapping = Object.freeze({
        normalizeText,
        isCodeCompliant,
        normalizeProductCode,
        buildSkuOptimizationTasks,
        resolveUniqueTarget,
        resolveUniqueIdentity,
        attachOptimizedCodes,
        buildOptimizedCodeWriteTasks
    });
})(typeof window !== 'undefined' ? window : globalThis);

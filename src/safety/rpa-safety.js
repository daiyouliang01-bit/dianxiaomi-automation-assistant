// ============================================
// rpa-safety.js — RPA 保存、图片与删图安全规则
// ============================================

(function() {
    const SAVE_SUCCESS_TEXTS = ['操作成功', '保存成功', '您的产品编辑成功', '产品编辑成功', '编辑成功', '已移入待发布', '待发布产品'];
    const SAVE_FAILURE_TEXTS = ['保存失败', '操作失败', '网络异常', '保存出错', '请求失败'];
    const IMAGE_SPACE_PATTERNS = ['图片空间不足', '图片内存不足', '存储空间不足', '可用空间不足', '剩余空间不足', '容量不足', '空间不足', '空间已满', '空间满', '存储已满'];

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function includesAny(text, values) {
        return values.some((value) => text.includes(value));
    }

    function isEditorUrl(url) {
        return /(?:^|[/#?&])edit(?:[/?#&]|$)/i.test(String(url || '')) || /[?&]id=/.test(String(url || ''));
    }

    function detectSaveOutcome({ visibleText = '', beforeUrl = '', currentUrl = '', sawBusy = false, isBusy = false, elapsedMs = 0 } = {}) {
        const text = normalizeText(visibleText);
        if (includesAny(text, SAVE_FAILURE_TEXTS)) return { status: 'failure', source: 'feedback' };
        if (includesAny(text, SAVE_SUCCESS_TEXTS)) return { status: 'success', source: 'feedback' };
        if (beforeUrl && currentUrl && beforeUrl !== currentUrl && isEditorUrl(beforeUrl) && !isEditorUrl(currentUrl)) {
            return { status: 'success', source: 'navigation' };
        }
        if (sawBusy && !isBusy && elapsedMs >= 500) return { status: 'success', source: 'button-cycle' };
        return { status: 'pending', source: null };
    }

    function classifyImageGenerationResult(message) {
        const text = normalizeText(message);
        if (includesAny(text, IMAGE_SPACE_PATTERNS)) return 'space_full';
        if (/(原图|图片|图像).{0,12}(尺寸|大小).{0,12}(异常|不规则|不符合|无法)/i.test(text) || /无法.{0,16}(生成|制作).{0,16}(800\s*[x×]\s*800)/i.test(text)) {
            return 'unresizable';
        }
        return 'unknown';
    }

    function getSafeCleanupPage({ currentPage, totalPages } = {}) {
        const current = Number(currentPage);
        const total = Number(totalPages);
        if (!Number.isInteger(current) || !Number.isInteger(total) || total < 4 || current !== total) return null;
        const target = total - 2;
        return target > 1 ? target : null;
    }

    function parseStorageMegabytes(value) {
        const text = normalizeText(value).replace(/,/g, '');
        const match = text.match(/剩余(?:空间|容量)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(KB|K|MB|M|GB|G)\b/i) || text.match(/(\d+(?:\.\d+)?)\s*(KB|K|MB|M|GB|G)\b/i);
        if (!match) return null;
        const amount = Number(match[1]);
        const unit = match[2].toUpperCase();
        if (!Number.isFinite(amount)) return null;
        if (unit === 'G' || unit === 'GB') return amount * 1024;
        if (unit === 'K' || unit === 'KB') return amount / 1024;
        return amount;
    }

    function hasEnoughImageSpace(value, minimumMegabytes = 50) {
        const amount = parseStorageMegabytes(value);
        return amount !== null && amount >= minimumMegabytes;
    }

    function shouldDeleteAttributeRow({ name = '', value = '', validationText = '', invalidState = false } = {}) {
        const cleanName = normalizeText(name);
        const cleanValue = normalizeText(value);
        if (!cleanName || !cleanValue) return true;
        // 店小秘自定义属性的保存规则：仅允许英文字母、数字和空格。
        // 例如 “36V/48V”、“52、18650”、“ISO 9001: 2015” 都必须整行删除。
        if (!/^[A-Za-z0-9 ]+$/.test(cleanName) || !/^[A-Za-z0-9 ]+$/.test(cleanValue)) return true;
        // validationText 必须来自该行的专用校验节点；一旦存在，代表店小秘已拒绝该行。
        return Boolean(invalidState || normalizeText(validationText));
    }

    function shouldContinueAfterProductResult(status) {
        return ['success', 'needs_review', 'failed'].includes(String(status || ''));
    }

    function canSaveAfterStages({ mode = 'normal', translate, imageResize, cleanup } = {}) {
        const reasons = [];
        if (!['success', 'skipped'].includes(translate)) {
            reasons.push(translate === 'failed' ? '翻译失败' : '翻译结果未确认');
        }
        if (imageResize === 'space_full') reasons.push('图片空间不足');
        else if (imageResize === 'failed') reasons.push('图片处理失败');
        else if (imageResize === 'unresizable') reasons.push('原图尺寸异常，图片处理未完成');
        else if (!['success', 'skipped'].includes(imageResize)) reasons.push('图片处理未确认');

        if (cleanup !== 'success') {
            reasons.push(mode === 'plug' ? '插头设置或数据恢复失败' : '清理优化失败');
        }
        return reasons.length
            ? { allowed: false, status: 'needs_review', reasons }
            : { allowed: true, status: 'ready', reasons: [] };
    }

    function getProductId(value) {
        const text = String(value || '');
        const match = text.match(/[?&]id=(\d{6,})/i) || text.match(/\bid\s*[:=]\s*["']?(\d{6,})/i);
        return match ? match[1] : '';
    }

    window.RpaSafety = {
        detectSaveOutcome,
        classifyImageGenerationResult,
        getSafeCleanupPage,
        parseStorageMegabytes,
        hasEnoughImageSpace,
        shouldDeleteAttributeRow,
        shouldContinueAfterProductResult,
        canSaveAfterStages,
        getProductId
    };
})();

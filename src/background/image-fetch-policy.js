'use strict';

(function initImageFetchPolicy(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ImageFetchPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPolicy() {
    const MAX_IMAGE_COUNT = 30;
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    function isPrivateIpv4(hostname) {
        const parts = hostname.split('.').map(Number);
        if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
        return parts[0] === 10
            || parts[0] === 127
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 168)
            || parts[0] === 0;
    }

    function isAllowedRemoteImageUrl(value) {
        try {
            const url = new URL(String(value || ''));
            const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
            if (url.protocol !== 'https:' || !hostname) return false;
            if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return false;
            if (hostname === 'metadata.google.internal' || hostname === '::1' || /^f[cd][0-9a-f]{2}:/i.test(hostname) || /^fe[89ab][0-9a-f]:/i.test(hostname)) return false;
            if (isPrivateIpv4(hostname)) return false;
            return true;
        } catch (_) {
            return false;
        }
    }

    function limitImageUrls(values) {
        if (!Array.isArray(values)) return [];
        return values.filter(isAllowedRemoteImageUrl).slice(0, MAX_IMAGE_COUNT);
    }

    function validateImageResponse(response) {
        if (!response || !response.ok) throw new Error(`图片下载失败${response ? ` (HTTP ${response.status})` : ''}`);
        const contentType = String(response.headers && response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.startsWith('image/')) throw new Error('远程资源不是图片');
        const contentLength = Number(response.headers && response.headers.get('content-length') || 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) throw new Error('远程图片过大');
        return true;
    }

    function validateImageBlob(blob) {
        if (!blob || !String(blob.type || '').toLowerCase().startsWith('image/')) throw new Error('下载内容不是图片');
        if (Number(blob.size || 0) > MAX_IMAGE_BYTES) throw new Error('下载图片超过 5MB');
        return true;
    }

    return { MAX_IMAGE_COUNT, MAX_IMAGE_BYTES, isAllowedRemoteImageUrl, limitImageUrls, validateImageResponse, validateImageBlob };
});

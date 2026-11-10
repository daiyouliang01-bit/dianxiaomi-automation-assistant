'use strict';

(function initForbiddenWordsCleaner(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ForbiddenWordsCleaner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createForbiddenWordsCleaner() {
    'use strict';

    function toWord(value) {
        return typeof value === 'string' ? value : (value && value.word) || '';
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function cleanText(text, forbiddenWords, whiteList) {
        let result = String(text || '');
        if (!result) return result;

        const words = (Array.isArray(forbiddenWords) ? forbiddenWords : [])
            .map(toWord)
            .filter(Boolean);

        if (words.length === 0) return result;

        const whiteListLower = (Array.isArray(whiteList) ? whiteList : [])
            .map((w) => String(w).toLowerCase());

        for (const word of words) {
            const w = word.trim().toLowerCase();
            if (!w) continue;
            if (whiteListLower.includes(w)) continue;
            try {
                const escaped = escapeRegex(w);
                const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
                result = result.replace(regex, '');
            } catch (_) {}
        }

        result = result.replace(/\s{2,}/g, ' ').trim();
        return result;
    }

    function cleanTextNode(text, forbiddenWords, whiteList) {
        return cleanText(text, forbiddenWords, whiteList);
    }

    return {
        cleanText,
        cleanTextNode,
        escapeRegex,
        toWord
    };
});

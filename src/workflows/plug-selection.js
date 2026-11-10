// ============================================
// plug-selection.js — 插头选择 Type-C/No Plug 属性恢复流程
// ============================================

(function(root) {
    const PLUG_MODE = 'plug';
    const MODE = PLUG_MODE;
    const NORMAL_MODE = 'normal';
    const PLUG_TYPE_NO_PLUG = 'no_plug';
    const PLUG_TYPE_EU = 'eu_plug';
    const PLUG_TYPE_LABELS = {
        no_plug: '无电源插头',
        eu_plug: '100V-240V 欧规插头'
    };
    const PLUG_MULTI_VARIANT_DECLARED_VALUE_SNAPSHOT = 'multi_variant_declared_value_only';
    const DECLARED_VALUE_RATE = 0.8;
    const REQUIRED_FIELDS = [
        'retailPrice',
        'declaredValue',
        'stock',
        'stockDeduction',
        'weight',
        'dimensions.length',
        'dimensions.width',
        'dimensions.height',
        'originalBox',
        'logisticsAttributes'
    ];

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function compactText(value) {
        return normalizeText(value).replace(/\s+/g, '');
    }

    function unique(values) {
        const seen = new Set();
        const result = [];
        (values || []).forEach((value) => {
            const label = normalizeText(value);
            if (!label || seen.has(label)) return;
            seen.add(label);
            result.push(label);
        });
        return result;
    }

    const LOGISTICS_LABELS = [
        '非纽扣锂金属电池',
        '非纽扣锂离子电池',
        '充电盒式蓝牙耳机',
        '纽扣式锂电池',
        '铅酸蓄电池',
        '镍氢电池',
        '特货其他',
        '敏感其他',
        '其他电池',
        '危险品',
        '干电池',
        '禁运',
        '普货',
        '纯电',
        '强磁',
        '液体',
        '粉末',
        '膏体',
        '外电',
        '弱磁',
        '内电'
    ];

    function normalizeOptimizationMode(mode) {
        if (mode === PLUG_MODE) return PLUG_MODE;
        return NORMAL_MODE;
    }

    function isPlugOptimizationMode(mode) {
        return normalizeOptimizationMode(mode) === PLUG_MODE;
    }

    function getNoPlugWorkflowLabel() {
        return '插头优化';
    }

    function createPlugSnapshot(input = {}) {
        const dimensions = input.dimensions || {};
        return {
            retailPrice: normalizeText(input.retailPrice),
            declaredValue: normalizeText(input.declaredValue),
            stock: normalizeText(input.stock),
            stockDeduction: normalizeText(input.stockDeduction),
            weight: normalizeText(input.weight),
            dimensions: {
                length: normalizeText(dimensions.length),
                width: normalizeText(dimensions.width),
                height: normalizeText(dimensions.height)
            },
            originalBox: '是',
            logisticsAttributes: unique(input.logisticsAttributes),
            productCode: normalizeText(input.productCode)
        };
    }

    function getValueByPath(target, path) {
        return path.split('.').reduce((value, key) => value && value[key], target);
    }

    function getMissingPlugSnapshotFields(snapshot) {
        return REQUIRED_FIELDS.filter((field) => {
            const value = getValueByPath(snapshot, field);
            if (Array.isArray(value)) return value.length === 0;
            return !normalizeText(value);
        });
    }

    function getNodeText(node) {
        return normalizeText(node && (node.innerText || node.textContent || node.value || ''));
    }

    function labelOfNativeInput(input) {
        const label = input && typeof input.closest === 'function' ? input.closest('label') : null;
        return getNodeText(label || input);
    }

    function knownLogisticsLabelsFromText(value) {
        const text = compactText(value);
        if (!text) return [];
        return unique(LOGISTICS_LABELS
            .filter((label) => text.includes(compactText(label)))
            .sort((left, right) => right.length - left.length));
    }

    function getNearestSingleLogisticsLabel(element) {
        let current = element;
        for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
            const text = getNodeText(current);
            const labels = knownLogisticsLabelsFromText(text);
            if (labels.length === 1 && compactText(text).length <= compactText(labels[0]).length + 24) return labels[0];
        }
        return '';
    }

    function labelOfCustomChecked(element) {
        return getNearestSingleLogisticsLabel(element) || getNodeText(element);
    }

    function getCheckedLogisticsLabels(dialog) {
        if (!dialog || typeof dialog.querySelectorAll !== 'function') return [];
        const labels = [];
        Array.from(dialog.querySelectorAll('input[type="radio"], input[type="checkbox"]')).forEach((input) => {
            if (input && input.checked) labels.push(getNearestSingleLogisticsLabel(input) || labelOfNativeInput(input));
        });
        Array.from(dialog.querySelectorAll('.is-checked, .el-radio.is-checked, .el-checkbox.is-checked, [aria-checked="true"]')).forEach((element) => {
            labels.push(labelOfCustomChecked(element));
        });
        return unique(labels.map((label) => label.replace(/[：:]/g, ' ')));
    }

    function visible(element) {
        if (!element) return false;
        if (typeof element.getBoundingClientRect === 'function') {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }
        if ('offsetWidth' in element || 'offsetHeight' in element) return Boolean(element.offsetWidth || element.offsetHeight);
        return true;
    }

    function candidateElements(rootNode = root.document) {
        if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return [];
        return Array.from(rootNode.querySelectorAll('label, span, div, td, th, button, a, li'));
    }

    function findTextElement(text, { rootNode = root.document, exact = false } = {}) {
        const target = compactText(text);
        return findTextElements(text, { rootNode, exact })[0] || null;
    }

    function findTextElements(text, { rootNode = root.document, exact = false } = {}) {
        const target = compactText(text);
        return candidateElements(rootNode).filter((element) => {
            if (!visible(element)) return false;
            const value = compactText(getNodeText(element));
            return exact ? value === target : value.includes(target);
        });
    }

    function closestScope(element) {
        if (!element || typeof element.closest !== 'function') return element || null;
        return element.closest('tr, .el-form-item, .ant-form-item, .form-item, .form-row, .row, li, div') || element;
    }

    function collectScopesNearLabel(label) {
        const scopes = [];
        const addScope = (scope) => {
            if (scope && !scopes.includes(scope)) scopes.push(scope);
        };
        let current = closestScope(label);
        for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) addScope(current);
        if (label && label.nextElementSibling) addScope(label.nextElementSibling);
        if (label && label.parentElement && label.parentElement.nextElementSibling) addScope(label.parentElement.nextElementSibling);
        return scopes;
    }

    function findInputGroupsNearLabel(labelText, rootNode = root.document) {
        const groups = [];
        const labels = findTextElements(labelText, { rootNode });
        labels.forEach((label) => {
            collectScopesNearLabel(label).forEach((scope) => {
                if (!scope || typeof scope.querySelectorAll !== 'function') return;
                const inputs = Array.from(scope.querySelectorAll('input, textarea, select')).filter(visible);
                if (inputs.length > 0) groups.push({ label, scope, inputs, text: getNodeText(scope) });
            });
        });
        return groups;
    }

    function inputValue(input) {
        if (!input) return '';
        if ('value' in input) return normalizeText(input.value);
        if (typeof input.getAttribute === 'function') return normalizeText(input.getAttribute('value'));
        return '';
    }

    function parseNumericValue(value) {
        const cleaned = normalizeText(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        return cleaned ? Number(cleaned[0]) : NaN;
    }

    function calculateDeclaredValueFromRetailPrice(retailPrice) {
        const value = parseNumericValue(retailPrice);
        if (!Number.isFinite(value) || value <= 0) return '';
        return (Math.round(value * DECLARED_VALUE_RATE * 100) / 100).toFixed(2);
    }

    function scoreInputGroup(group, minCount = 1) {
        const inputs = group && Array.isArray(group.inputs) ? group.inputs : [];
        const text = compactText(group && group.text);
        const filledCount = inputs.filter((input) => inputValue(input)).length;
        let score = inputs.length;
        if (inputs.length >= minCount) score += 1000;
        score += filledCount * 80;
        if (text.includes('长') && text.includes('宽') && text.includes('高')) score += 60;
        if (inputs.length > minCount + 3) score -= (inputs.length - minCount) * 120;
        if (text.includes('批量') || text.includes('全部电压/插头')) score -= 80;
        return score;
    }

    function hasClosest(element, selector) {
        if (!element || typeof element.closest !== 'function') return false;
        try {
            return Boolean(element.closest(selector));
        } catch (_) {
            return false;
        }
    }

    function scoreSnapshotInputGroup(group, { minCount = 1 } = {}) {
        const inputs = group && Array.isArray(group.inputs) ? group.inputs : [];
        const text = normalizeText(group && group.text);
        const compact = compactText(text);
        const labelText = normalizeText(getNodeText(group && group.label));
        const filledCount = inputs.filter((input) => inputValue(input)).length;
        let score = scoreInputGroup(group, minCount);
        if (inputs.length === minCount) score += 260;
        if (inputs.length > minCount + 2) score -= (inputs.length - minCount) * 180;
        if (filledCount >= minCount) score += 320;
        if (/[：:]/.test(labelText)) score += 360;
        if (hasClosest(group && group.scope, 'table, [role="table"], .el-table, .ant-table')) score -= 900;
        if (hasClosest(group && group.label, 'table, [role="table"], .el-table, .ant-table')) score -= 900;
        if (compact.includes('批量') || compact.includes('全部电压/插头') || compact.includes('实际收入') || compact.includes('批发价')) score -= 900;
        if (compact.includes('发货期限') || compact.includes('产品有效期')) score -= 500;
        return score;
    }

    function pickSnapshotInputGroup(groups, { minCount = 1 } = {}) {
        const candidates = (groups || []).filter((group) => group && Array.isArray(group.inputs) && group.inputs.length > 0);
        if (candidates.length === 0) return { inputs: [] };
        const qualified = candidates.filter((group) => group.inputs.length >= minCount);
        const pool = qualified.length > 0 ? qualified : candidates;
        return pool
            .map((group, index) => ({ group, index, score: scoreSnapshotInputGroup(group, { minCount }) }))
            .sort((left, right) => right.score - left.score || left.index - right.index)[0].group;
    }

    function pickInputGroup(groups, { minCount = 1 } = {}) {
        const candidates = (groups || []).filter((group) => group && Array.isArray(group.inputs) && group.inputs.length > 0);
        if (candidates.length === 0) return { inputs: [] };
        const qualified = candidates.filter((group) => group.inputs.length >= minCount);
        const pool = qualified.length > 0 ? qualified : candidates;
        return pool
            .map((group, index) => ({ group, index, score: scoreInputGroup(group, minCount) }))
            .sort((left, right) => right.score - left.score || left.index - right.index)[0].group;
    }

    function findInputsNearLabel(labelText, rootNode = root.document, options = {}) {
        return pickInputGroup(findInputGroupsNearLabel(labelText, rootNode), options).inputs || [];
    }

    function findDimensionInputs(rootNode = root.document) {
        return findInputsNearLabel('包装尺寸', rootNode, { minCount: 3 }).slice(0, 3);
    }

    function findSnapshotInputsNearLabel(labelText, rootNode = root.document, options = {}) {
        return pickSnapshotInputGroup(findInputGroupsNearLabel(labelText, rootNode), options).inputs || [];
    }

    function findSnapshotDimensionInputs(rootNode = root.document) {
        return findSnapshotInputsNearLabel('包装尺寸', rootNode, { minCount: 3 }).slice(0, 3);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getDocumentForRoot(rootNode = root.document) {
        if (rootNode && rootNode.documentElement) return rootNode;
        if (rootNode && rootNode.ownerDocument) return rootNode.ownerDocument;
        return root.document;
    }

    function scrollToPlugSnapshotArea(rootNode = root.document, attempt = 0) {
        const doc = getDocumentForRoot(rootNode);
        const view = rootNode && rootNode.defaultView || doc && doc.defaultView || root;
        if (root.location && root.location.hash !== '#packageInfo') {
            try { root.location.hash = 'packageInfo'; } catch (_) {}
        }
        const scrollHeight = Math.max(
            doc && doc.documentElement && doc.documentElement.scrollHeight || 0,
            doc && doc.body && doc.body.scrollHeight || 0,
            rootNode && rootNode.documentElement && rootNode.documentElement.scrollHeight || 0,
            rootNode && rootNode.body && rootNode.body.scrollHeight || 0
        );
        const viewportHeight = view && view.innerHeight
            || doc && doc.documentElement && doc.documentElement.clientHeight
            || 900;
        const maxTop = Math.max(0, scrollHeight - viewportHeight);
        const ratios = [0.35, 0.5, 0.65, 0.8, 0.95, 1];
        const top = Math.round(maxTop * ratios[attempt % ratios.length]);
        if (view && typeof view.scrollTo === 'function') {
            try { view.scrollTo({ top, behavior: 'instant' }); return; } catch (_) {}
            try { view.scrollTo(0, top); return; } catch (_) {}
        }
        if (doc && doc.documentElement) doc.documentElement.scrollTop = top;
        if (doc && doc.body) doc.body.scrollTop = top;
    }

    async function ensureSnapshotDimensionsRendered(rootNode = root.document, { timeout = 2500, interval = 120 } = {}) {
        if (findSnapshotDimensionInputs(rootNode).length >= 3) return true;
        const startedAt = Date.now();
        let attempt = 0;
        while (Date.now() - startedAt < timeout) {
            scrollToPlugSnapshotArea(rootNode, attempt);
            if (findSnapshotDimensionInputs(rootNode).length >= 3) return true;
            await sleep(interval);
            if (findSnapshotDimensionInputs(rootNode).length >= 3) return true;
            attempt += 1;
        }
        return false;
    }

    function getSnapshotFieldAliases(labelText) {
        const label = compactText(labelText);
        if (label.includes('零售价格') || label.includes('零售价')) return ['零售价格', '零售价', '请输入零售价格'];
        if (label.includes('货值')) return ['货值', '请输入货值'];
        if (label.includes('库存')) return ['库存数量', '库存', '请输入库存数量'];
        if (label.includes('重量')) return ['重量', '请输入重量'];
        if (label.includes('商品编码')) return ['商品编码'];
        return [labelText];
    }

    function inputMarkerText(input) {
        if (!input) return '';
        return [
            input.placeholder,
            getAttrText(input, 'placeholder'),
            getAttrText(input, 'aria-label'),
            getAttrText(input, 'title'),
            getAttrText(input, 'name'),
            getAttrText(input, 'id')
        ].join(' ');
    }

    function scoreSnapshotInputByMarker(input, labelText) {
        const aliases = getSnapshotFieldAliases(labelText).map(compactText).filter(Boolean);
        const marker = compactText(inputMarkerText(input));
        const value = inputValue(input);
        if (!marker || aliases.length === 0) return -Infinity;
        let score = -Infinity;
        aliases.forEach((alias) => {
            if (marker.includes(alias)) score = Math.max(score, 800 + alias.length);
        });
        if (score === -Infinity) return score;
        if (value) score += 120;
        if (marker.includes('请输入')) score += 260;
        if (marker.includes('包装后') || marker.includes('发货期限') || marker.includes('产品有效期')) score -= 900;
        if (hasClosest(input, 'table, [role="table"], .el-table, .ant-table')) score -= 500;
        return score;
    }

    function findSnapshotInputsByMarker(labelText, rootNode = root.document) {
        if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return [];
        return Array.from(rootNode.querySelectorAll('input, textarea, select'))
            .filter(visible)
            .map((input, index) => ({ input, index, score: scoreSnapshotInputByMarker(input, labelText) }))
            .filter((item) => item.score > -Infinity)
            .sort((left, right) => right.score - left.score || left.index - right.index)
            .map((item) => item.input);
    }

    function getClassText(element) {
        const cls = element && element.className;
        if (!cls) return '';
        if (typeof cls === 'string') return cls;
        if (typeof cls.baseVal === 'string') return cls.baseVal;
        return String(cls);
    }

    function getAttrText(element, name) {
        if (!element || typeof element.getAttribute !== 'function') return '';
        return normalizeText(element.getAttribute(name));
    }

    function isTrustedLogisticsEditElement(element) {
        const marker = [
            getNodeText(element),
            getClassText(element),
            getAttrText(element, 'aria-label'),
            getAttrText(element, 'title'),
            getAttrText(element, 'data-original-title')
        ].join(' ');
        const compactMarker = compactText(marker);
        return compactMarker.includes('编辑') || /(^|\b|[-_])(edit|pencil)(\b|[-_]|$)/i.test(marker);
    }

    function getLogisticsEditCandidatesFromScope(scope, { allowFallback = false } = {}) {
        if (!scope || typeof scope.querySelectorAll !== 'function') return null;
        const candidates = Array.from(scope.querySelectorAll('button, a, span, i, svg, [role="button"]')).filter(visible);
        const trusted = candidates.filter(isTrustedLogisticsEditElement);
        if (trusted.length > 0) return trusted;
        if (!allowFallback) return [];

        const fallback = candidates.filter((element) => {
            const tag = String(element.tagName || '').toUpperCase();
            const marker = `${getClassText(element)} ${getAttrText(element, 'role')} ${getAttrText(element, 'title')}`;
            const text = compactText(getNodeText(element));
            return /^(BUTTON|A|I|SVG)$/.test(tag)
                || /button|btn|icon|operate|action|pointer|click/i.test(marker)
                || (tag === 'SPAN' && text && text.length <= 4);
        });
        return fallback.length > 0 ? fallback : candidates.slice(0, 3);
    }

    function getTrustedLogisticsEditButtonFromScope(scope, options = {}) {
        const candidates = getLogisticsEditCandidatesFromScope(scope, options);
        return candidates && candidates[0] || null;
    }

    function getPlugVariantLogisticsEditButton(row) {
        const cell = getPlugVariantCell(row, '物流属性');
        return getTrustedLogisticsEditButtonFromScope(cell, { allowFallback: true });
    }

    function getLogisticsLabelsFromDisplayText(value) {
        const text = normalizeText(value);
        if (!text || !compactText(text).includes('物流属性')) return [];
        const found = LOGISTICS_LABELS
            .filter((label) => compactText(text).includes(compactText(label)))
            .sort((left, right) => right.length - left.length);
        if (found.length > 0) return unique(found);

        const cleaned = text
            .replace(/物流属性|说明|编辑|批量|请选择|已选|支持拖拽|\*|\?|？|（|）|\(|\)/g, ' ')
            .replace(/[：:]/g, ' ');
        const ignored = new Set(['物流属性', '说明', '编辑', '批量', '请选择', '已选', '支持拖拽']);
        return unique(cleaned.split(/[、,，;；\s]+/).filter((label) => {
            const valueText = normalizeText(label);
            if (!valueText || ignored.has(valueText)) return false;
            if (/^[\d.%+-]+$/.test(valueText)) return false;
            if (/^(CNY|kg|cm|长|宽|高)$/i.test(valueText)) return false;
            return true;
        }));
    }

    function findDisplayedLogisticsLabels(rootNode = root.document) {
        const labels = findTextElements('物流属性', { rootNode });
        for (const label of labels) {
            for (const scope of collectScopesNearLabel(label)) {
                const text = getNodeText(scope);
                if (compactText(text).length > 120) continue;
                const values = getLogisticsLabelsFromDisplayText(text);
                if (values.length > 0) return values;
            }
        }
        return [];
    }

    function logisticsLabelsIncludeAll(currentLabels, expectedLabels) {
        const current = new Set(unique(currentLabels).map((label) => compactText(label)));
        const expected = unique(expectedLabels).map((label) => compactText(label)).filter(Boolean);
        return expected.length > 0 && expected.every((label) => current.has(label));
    }

    function displayedLogisticsMatches(labels, rootNode = root.document) {
        return logisticsLabelsIncludeAll(findDisplayedLogisticsLabels(rootNode), labels);
    }

    function findLogisticsEditButton(rootNode = root.document) {
        const rowButton = getPlugVariantLogisticsEditButton(rootNode);
        if (rowButton) return rowButton;

        const labels = findTextElements('物流属性', { rootNode });
        for (const label of labels) {
            for (const scope of collectScopesNearLabel(label)) {
                const button = getTrustedLogisticsEditButtonFromScope(scope);
                if (button) return button;
            }
        }
        if (rootNode && rootNode !== root.document) return getTrustedLogisticsEditButtonFromScope(rootNode);
        return null;
    }

    function findDialogByTitle(title = '物流属性') {
        const doc = root.document;
        if (!doc || typeof doc.querySelectorAll !== 'function') return null;
        const selectors = '.el-dialog, .el-dialog__wrapper, .ant-modal, .ant-modal-root, .modal, .modal-dialog, [role="dialog"], .el-message-box, .layui-layer';
        return Array.from(doc.querySelectorAll(selectors)).find((dialog) => visible(dialog) && compactText(getNodeText(dialog)).includes(compactText(title))) || null;
    }

    function getClickTargets(node) {
        const targets = [];
        const add = (target) => {
            if (target && !targets.includes(target) && visible(target)) targets.push(target);
        };
        if (node && typeof node.closest === 'function') {
            add(node.closest('button, a, [role="button"], label, .el-button, .ant-btn'));
        }
        add(node);
        let current = node && node.parentElement;
        for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) add(current);
        return targets;
    }

    const OPTION_SCOPE_SELECTOR = 'label, .ant-checkbox-wrapper, .ant-tree-treenode, .el-checkbox, li, [role="treeitem"], [role="option"]';
    const OPTION_CONTROL_SELECTOR = 'input[type="checkbox"], input[type="radio"], .ant-tree-checkbox, .ant-checkbox, .el-checkbox__input, .el-checkbox, [role="checkbox"]';

    function waitMs(ms) {
        return new Promise((resolve) => {
            const timer = root.setTimeout || setTimeout;
            timer(resolve, ms);
        });
    }

    function getOptionScope(element) {
        if (!element) return null;
        if (typeof element.closest === 'function') return element.closest(OPTION_SCOPE_SELECTOR) || element;
        return element;
    }

    function queryOptionControls(scope) {
        const controls = [];
        const add = (control) => {
            if (control && !controls.includes(control) && visible(control)) controls.push(control);
        };
        if (!scope) return controls;
        const marker = `${String(scope.tagName || '')} ${getClassText(scope)} ${getAttrText(scope, 'role')}`.toLowerCase();
        if (/input/.test(marker) || /checkbox|radio/.test(marker)) add(scope);
        if (typeof scope.querySelectorAll === 'function') {
            Array.from(scope.querySelectorAll(OPTION_CONTROL_SELECTOR)).forEach(add);
        }
        return controls;
    }

    function getOptionCandidateScore(element, label) {
        if (!element) return -Infinity;
        const target = compactText(label);
        const value = compactText(getNodeText(element));
        if (!target || !value.includes(target)) return -Infinity;

        const tag = String(element.tagName || '').toUpperCase();
        const classText = getClassText(element);
        const marker = `${tag} ${classText} ${getAttrText(element, 'role')}`;
        const controls = queryOptionControls(element);
        let score = value === target ? 1000 : 200;
        if (controls.length > 0) score += 350;
        if (/LABEL|LI/.test(tag)) score += 180;
        if (/checkbox|tree|option|select|radio/i.test(marker)) score += 160;
        if (tag === 'SPAN' && /title|label|text/i.test(marker)) score += 120;
        if (tag === 'DIV') score -= 180;
        if (value.length > target.length * 3) score -= Math.min(650, value.length - target.length);
        return score;
    }

    function findOptionScopeByText(label, rootNode = root.document) {
        const candidates = findTextElements(label, { rootNode })
            .map((element, index) => ({ element, scope: getOptionScope(element), index }))
            .filter((item) => item.scope);
        const uniqueScopes = [];
        candidates.forEach((item) => {
            if (!uniqueScopes.some((candidate) => candidate.scope === item.scope)) uniqueScopes.push(item);
        });
        const scored = uniqueScopes
            .map((item) => ({
                scope: item.scope,
                index: item.index,
                score: Math.max(getOptionCandidateScore(item.scope, label), getOptionCandidateScore(item.element, label))
            }))
            .filter((item) => item.score > -Infinity)
            .sort((left, right) => right.score - left.score || left.index - right.index);
        return scored[0] ? scored[0].scope : null;
    }

    function optionControlIsChecked(control) {
        if (!control) return false;
        if (control.checked) return true;
        const aria = getAttrText(control, 'aria-checked').toLowerCase();
        const marker = `${getClassText(control)} ${getAttrText(control, 'class')}`.toLowerCase();
        return aria === 'true'
            || marker.includes('is-checked')
            || marker.includes('checkbox-wrapper-checked')
            || marker.includes('checkbox-checked')
            || marker.includes('radio-checked');
    }

    function optionControlIsActive(control) {
        if (!control) return false;
        if (optionControlIsChecked(control)) return true;
        if (control.indeterminate) return true;
        const aria = getAttrText(control, 'aria-checked').toLowerCase();
        const marker = `${getClassText(control)} ${getAttrText(control, 'class')}`.toLowerCase();
        return aria === 'mixed'
            || marker.includes('indeterminate')
            || marker.includes('halfchecked')
            || marker.includes('half-checked');
    }

    function optionScopeIsChecked(scope) {
        return queryOptionControls(scope).some(optionControlIsChecked) || optionControlIsChecked(scope);
    }

    function optionScopeIsActive(scope) {
        return queryOptionControls(scope).some(optionControlIsActive) || optionControlIsActive(scope);
    }

    function isOptionChecked(label, rootNode = root.document) {
        return optionScopeIsChecked(findOptionScopeByText(label, rootNode));
    }

    function isOptionActive(label, rootNode = root.document) {
        return optionScopeIsActive(findOptionScopeByText(label, rootNode));
    }

    function isNoPlugSelectionReady(rootNode = root.document) {
        return Boolean(findNoPlugRow(rootNode))
            && isOptionActive('Type-C/No Plug', rootNode)
            && isOptionChecked('无电源插头', rootNode);
    }

    function getOptionClickTargets(scope) {
        const targets = [];
        const add = (target) => {
            if (target && !targets.includes(target) && visible(target)) targets.push(target);
        };
        queryOptionControls(scope).forEach(add);
        add(scope);
        if (scope && typeof scope.querySelectorAll === 'function') {
            Array.from(scope.querySelectorAll('label, span, button, [role="button"]')).forEach(add);
        }
        return targets;
    }

    async function waitForOptionState(label, predicate, rootNode = root.document, timeout = 1500) {
        const finder = () => {
            const scope = findOptionScopeByText(label, rootNode);
            return scope && predicate(scope) ? scope : null;
        };
        if (root.waitForElement) {
            return Boolean(await root.waitForElement(finder, { timeout, interval: 120 }));
        }
        await waitMs(80);
        return Boolean(finder());
    }

    function clickNode(node) {
        if (!node) return false;
        if (typeof node.click === 'function') {
            node.click();
            return true;
        }
        return false;
    }

    async function captureLogisticsAttributes(rootNode = root.document) {
        const displayedLabels = findDisplayedLogisticsLabels(rootNode);
        if (displayedLabels.length > 0) return displayedLabels;
        const editButton = findLogisticsEditButton(rootNode);
        if (!editButton) return [];
        const dialog = await openDialogFromEditElement(editButton, '物流属性');
        if (!dialog) return [];
        const labels = getCheckedLogisticsLabels(dialog);
        await closeLogisticsDialog(dialog, false);
        return labels;
    }

    function readFirstInput(labelText, rootNode = root.document) {
        const input = findInputsNearLabel(labelText, rootNode)[0];
        return input ? normalizeText(input.value) : '';
    }

    function readSnapshotFirstInput(labelText, rootNode = root.document) {
        const input = findSnapshotInputsByMarker(labelText, rootNode)[0] || findSnapshotInputsNearLabel(labelText, rootNode)[0];
        return input ? normalizeText(input.value) : '';
    }

    function readCheckedRadioLabel(labelText, rootNode = root.document) {
        const label = findTextElement(labelText, { rootNode });
        const scope = closestScope(label);
        if (!scope || typeof scope.querySelectorAll !== 'function') return '';
        const checked = Array.from(scope.querySelectorAll('input[type="radio"], input[type="checkbox"]')).find((input) => input.checked);
        return checked ? labelOfNativeInput(checked).replace(labelText, '') : '';
    }

    async function waitForDialog(title = '物流属性', { timeout = 5000, interval = 200 } = {}) {
        if (root.waitForElement) {
            return root.waitForElement(() => findDialogByTitle(title), { timeout, interval });
        }
        return findDialogByTitle(title);
    }

    async function openDialogFromEditElement(editButton, title = '物流属性') {
        for (const target of getClickTargets(editButton)) {
            clickNode(target);
            const dialog = await waitForDialog(title, { timeout: 1200, interval: 150 });
            if (dialog) return dialog;
        }
        return waitForDialog(title, { timeout: 3000, interval: 200 });
    }

    async function closeLogisticsDialog(dialog, preferConfirm = false) {
        if (!dialog || typeof dialog.querySelectorAll !== 'function') return;
        const labels = preferConfirm ? ['确定', '确认'] : ['取消', '关闭'];
        const buttons = Array.from(dialog.querySelectorAll('button, a, span')).filter(visible);
        const selected = buttons.find((button) => labels.includes(compactText(getNodeText(button))));
        if (selected) {
            clickNode(selected);
            return;
        }
        const close = buttons.find((button) => /×|x|关闭/i.test(getNodeText(button)) || /close/i.test(String(button.className || '')));
        if (close) clickNode(close);
    }

    async function capturePlugProductSnapshot(rootNode = root.document) {
        const multiVariantSnapshot = capturePlugMultiVariantDeclaredValueSnapshot(rootNode);
        if (multiVariantSnapshot) return multiVariantSnapshot;
        await ensureSnapshotDimensionsRendered(rootNode);
        const dimensionInputs = findSnapshotDimensionInputs(rootNode);
        const snapshot = createPlugSnapshot({
            retailPrice: readSnapshotFirstInput('零售价格', rootNode) || readSnapshotFirstInput('零售价', rootNode),
            declaredValue: readSnapshotFirstInput('货值', rootNode),
            stock: readSnapshotFirstInput('库存数量', rootNode) || readSnapshotFirstInput('库存', rootNode),
            stockDeduction: readCheckedRadioLabel('扣减方式', rootNode),
            weight: readSnapshotFirstInput('重量', rootNode),
            dimensions: {
                length: dimensionInputs[0] ? dimensionInputs[0].value : '',
                width: dimensionInputs[1] ? dimensionInputs[1].value : '',
                height: dimensionInputs[2] ? dimensionInputs[2].value : ''
            },
            originalBox: '是',
            logisticsAttributes: await captureLogisticsAttributes(rootNode),
            productCode: readSnapshotFirstInput('商品编码', rootNode)
        });
        const missing = getMissingPlugSnapshotFields(snapshot);
        if (missing.length > 0) throw new Error(`插头选择字段读取失败：${missing.join(', ')}`);
        return snapshot;
    }

    function dispatchInputEvent(input, type, value) {
        if (!input) return;
        const view = input.ownerDocument && input.ownerDocument.defaultView || root;
        try {
            const event = type === 'input' && view.InputEvent
                ? new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: String(value || '') })
                : new view.Event(type, { bubbles: true });
            input.dispatchEvent(event);
        } catch (_) {
            try { input.dispatchEvent(new Event(type, { bubbles: true })); } catch (_) {}
        }
    }

    function setValueWithExecCommand(input, value) {
        if (!input || input.disabled || input.readOnly) return false;
        const text = String(value);
        const doc = input.ownerDocument || root.document;
        if (!doc || typeof doc.execCommand !== 'function') return false;
        try {
            if (typeof input.focus === 'function') input.focus();
            if (typeof input.select === 'function') input.select();
            else if (typeof input.setSelectionRange === 'function') input.setSelectionRange(0, input.value.length);
            input.value = '';
            dispatchInputEvent(input, 'input', '');
            const inserted = doc.execCommand('insertText', false, text);
            dispatchInputEvent(input, 'input', text);
            dispatchInputEvent(input, 'change', text);
            dispatchInputEvent(input, 'blur', text);
            return inserted && normalizeText(input.value) === normalizeText(text);
        } catch (_) {
            return false;
        }
    }

    function setNativeValue(input, value) {
        if (!input) return false;
        const text = String(value);
        if (setValueWithExecCommand(input, text)) return true;
        const view = input.ownerDocument && input.ownerDocument.defaultView || root;
        const proto = input.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement && view.HTMLTextAreaElement.prototype : view.HTMLInputElement && view.HTMLInputElement.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        try {
            if (typeof input.focus === 'function') input.focus();
        } catch (_) {}
        let assigned = false;
        if (descriptor && descriptor.set) {
            try {
                descriptor.set.call(input, text);
                assigned = true;
            } catch (_) {}
        }
        if (!assigned) {
            try {
                input.value = text;
                assigned = true;
            } catch (_) {
                return false;
            }
        }
        ['input', 'keyup', 'change', 'blur'].forEach((type) => dispatchInputEvent(input, type, text));
        return normalizeText(input.value) === normalizeText(text);
    }

    function uniqueElements(elements) {
        const result = [];
        (elements || []).forEach((element) => {
            if (element && !result.includes(element)) result.push(element);
        });
        return result;
    }

    function setFirstWritableValue(inputs, value) {
        for (const input of uniqueElements(inputs)) {
            if (setNativeValue(input, value)) return true;
        }
        return false;
    }

    function queryAllBySelectors(node, selectors) {
        if (!node || typeof node.querySelectorAll !== 'function') return [];
        const result = [];
        selectors.forEach((selector) => {
            try {
                Array.from(node.querySelectorAll(selector)).forEach((element) => {
                    if (element && !result.includes(element)) result.push(element);
                });
            } catch (_) {}
        });
        return result;
    }

    function closestBySelectors(element, selectors) {
        if (!element || typeof element.closest !== 'function') return null;
        for (const selector of selectors) {
            try {
                const found = element.closest(selector);
                if (found) return found;
            } catch (_) {}
        }
        return null;
    }

    function getRowCells(row) {
        return queryAllBySelectors(row, [
            'td, [role="cell"]',
            'td, th, [role="cell"], [role="gridcell"], .ant-table-cell, .el-table__cell, .vxe-body--column'
        ]).filter(visible);
    }

    function getRowControls(row) {
        if (!row || typeof row.querySelectorAll !== 'function') return [];
        return Array.from(row.querySelectorAll('input, textarea, select')).filter(visible);
    }

    function getPlugSkuHeaderCells(row) {
        const scope = closestBySelectors(row, [
            'table, [role="table"], [role="grid"], .ant-table, .el-table, .vxe-table, .smt-sku-table, .sku-table'
        ]) || (row && row.parentElement);
        return queryAllBySelectors(scope, [
            'thead th, thead [role="columnheader"]',
            '[role="columnheader"]',
            '.ant-table-thead .ant-table-cell',
            '.el-table__header-wrapper th, .el-table__header-wrapper .el-table__cell',
            '.vxe-header--column',
            'th'
        ]).filter(visible);
    }

    function getPlugSkuHeaderAliases(labelText) {
        const label = compactText(labelText);
        if (label.includes('零售价')) return ['零售价', '零售价格'];
        if (label.includes('货值')) return ['货值'];
        if (label.includes('库存')) return ['库存'];
        if (label.includes('重量')) return ['重量'];
        if (label.includes('包装尺寸')) return ['包装尺寸', '长宽高', '长', '宽', '高'];
        if (label.includes('是否原箱')) return ['是否原箱'];
        if (label.includes('物流属性')) return ['物流属性'];
        if (label.includes('商品编码')) return ['商品编码'];
        if (label.includes('电压') || label.includes('插头')) return ['电压/插头类型', '电压插头类型'];
        return [labelText];
    }

    function getPlugSkuHeaderIndex(row, labelText) {
        const aliases = getPlugSkuHeaderAliases(labelText).map(compactText).filter(Boolean);
        const headers = getPlugSkuHeaderCells(row);
        return headers.findIndex((header) => {
            const text = compactText(getNodeText(header));
            return aliases.some((alias) => text.includes(alias));
        });
    }

    function hasPlugSkuHeaderContext(row) {
        const headerText = compactText(getPlugSkuHeaderCells(row).map(getNodeText).join(' '));
        return headerText.includes('零售价') && headerText.includes('货值') && headerText.includes('库存');
    }

    function getNoPlugRowCandidateScore(row) {
        const text = compactText(getNodeText(row));
        if (!text.includes('无电源插头')) return -Infinity;
        if (isPlugSkuBatchOrHeaderRow(row)) return -Infinity;
        const cells = getRowCells(row);
        const controls = getRowControls(row);
        let score = 100;
        if (cells.length >= 8) score += 1000;
        if (controls.length >= 6) score += 800;
        if (text.includes('零售价') && text.includes('货值') && text.includes('库存')) score += 240;
        if (text.includes('Type-C/NoPlug') || text.includes('USBType-C')) score -= 220;
        if (text.includes('暂无已选')) score -= 500;
        if (text.length > 800) score -= 300;
        return score;
    }

    function findNoPlugRow(rootNode = root.document) {
        if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return null;
        return Array.from(rootNode.querySelectorAll('tr, [role="row"]'))
            .map((row, index) => ({ row, index, score: getNoPlugRowCandidateScore(row) }))
            .filter((item) => item.score > -Infinity)
            .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.row || null;
    }

    function getPlugVariantCellIndex(labelText) {
        const label = compactText(labelText);
        if (label.includes('零售价')) return 1;
        if (label.includes('货值')) return 2;
        if (label.includes('库存')) return 5;
        if (label.includes('重量')) return 6;
        if (label.includes('包装尺寸')) return 7;
        if (label.includes('是否原箱')) return 8;
        if (label.includes('物流属性')) return 9;
        if (label.includes('商品编码')) return 10;
        return -1;
    }

    function getPlugVariantCellOffset(row) {
        const cells = getRowCells(row);
        const first = compactText(getNodeText(cells[0]));
        if (first.includes('无电源插头') || first.includes('Type-C/NoPlug')) return 0;
        const second = compactText(getNodeText(cells[1]));
        if (second.includes('无电源插头') || second.includes('Type-C/NoPlug')) return 1;
        return 0;
    }

    function getPlugVariantCell(row, labelText) {
        if (!row || typeof row.querySelectorAll !== 'function') return null;
        const cells = getRowCells(row);
        const headerIndex = getPlugSkuHeaderIndex(row, labelText);
        if (headerIndex >= 0 && cells[headerIndex]) return cells[headerIndex];
        const index = getPlugVariantCellIndex(labelText);
        const offset = getPlugVariantCellOffset(row);
        return index >= 0 && cells[index + offset] ? cells[index + offset] : null;
    }

    function getPlugVariantInputsByLabel(row, labelText) {
        const inputs = getRowControls(row);
        const label = compactText(labelText);
        if (label.includes('零售价')) return inputs.slice(0, 1);
        if (label.includes('货值')) return inputs.slice(1, 2);
        if (label.includes('库存')) return inputs.slice(2, 3);
        if (label.includes('重量')) return inputs.slice(3, 4);
        if (label.includes('包装尺寸')) return inputs.slice(4, 7);
        if (label.includes('是否原箱')) return inputs.slice(7, 8);
        if (label.includes('商品编码')) return inputs.slice(8, 9);
        return [];
    }

    function getCellInputs(row, labelText) {
        if (!row || typeof row.querySelectorAll !== 'function') return [];
        const mappedCell = getPlugVariantCell(row, labelText);
        if (mappedCell && typeof mappedCell.querySelectorAll === 'function') {
            const inputs = Array.from(mappedCell.querySelectorAll('input, textarea, select')).filter(visible);
            if (inputs.length > 0) return inputs;
        }
        const rowInputs = getPlugVariantInputsByLabel(row, labelText);
        if (rowInputs.length > 0) return rowInputs;
        const cells = getRowCells(row);
        const headers = Array.from((row.closest && row.closest('table') || root.document || {}).querySelectorAll ? (row.closest('table') || root.document).querySelectorAll('th, [role="columnheader"]') : []);
        const targetIndex = headers.findIndex((header) => compactText(getNodeText(header)).includes(compactText(labelText)));
        const scope = targetIndex >= 0 ? cells[targetIndex] : cells.find((cell) => compactText(getNodeText(cell)).includes(compactText(labelText))) || row;
        return scope && typeof scope.querySelectorAll === 'function' ? Array.from(scope.querySelectorAll('input, textarea, select')).filter(visible) : [];
    }

    function writeTableField(row, labelText, value) {
        const input = getCellInputs(row, labelText)[0];
        return input ? setNativeValue(input, value) : false;
    }

    function getPlugSkuFirstCellText(row) {
        return normalizeText(getNodeText(getRowCells(row)[0]));
    }

    function isPlugSkuBatchOrHeaderRow(row) {
        const text = compactText(getNodeText(row));
        const firstCellText = compactText(getPlugSkuFirstCellText(row));
        if (!text) return true;
        if (firstCellText.includes('全部颜色') || firstCellText === '颜色') return true;
        if (text.includes('批量填充') || text.includes('批量·') || text.includes('全部电压/插头')) return true;
        if (text.includes('零售价') && text.includes('货值') && text.includes('库存') && !firstCellText) return true;
        return false;
    }

    function getPlugSkuDeclaredInput(row) {
        return getCellInputs(row, '货值')[0] || getPlugVariantInputsByLabel(row, '货值')[0] || null;
    }

    function getPlugSkuRetailInput(row) {
        return getCellInputs(row, '零售价')[0] || getPlugVariantInputsByLabel(row, '零售价')[0] || null;
    }

    function getPlugSkuProductCodeInput(row) {
        return getCellInputs(row, '商品编码')[0] || getPlugVariantInputsByLabel(row, '商品编码')[0] || null;
    }

    function findPlugSkuRows(rootNode = root.document, { requireNoPlug = false } = {}) {
        if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return [];
        return queryAllBySelectors(rootNode, [
            'tr, [role="row"]',
            '.ant-table-row, .el-table__row, .vxe-body--row, .smt-sku-row, .sku-row'
        ])
            .filter(visible)
            .filter((row) => {
                if (isPlugSkuBatchOrHeaderRow(row)) return false;
                const controls = getRowControls(row);
                const hasHeader = hasPlugSkuHeaderContext(row);
                if (controls.length < (hasHeader ? 2 : 8)) return false;
                const text = compactText(getNodeText(row));
                if (requireNoPlug && !text.includes('无电源插头')) return false;
                const declaredInput = getPlugSkuDeclaredInput(row);
                const retailInput = getPlugSkuRetailInput(row);
                return Boolean(declaredInput && retailInput);
            });
    }

    function getPlugSkuRowKey(row, index = 0) {
        const productCodeInput = getPlugSkuProductCodeInput(row);
        const productCode = inputValue(productCodeInput);
        if (productCode) return compactText(productCode);
        const firstCellText = getPlugSkuFirstCellText(row);
        if (firstCellText) return compactText(firstCellText);
        return `row:${index}`;
    }

    function createPlugSkuDeclaredValueEntry(row, index = 0) {
        const declaredInput = getPlugSkuDeclaredInput(row);
        const retailInput = getPlugSkuRetailInput(row);
        const productCodeInput = getPlugSkuProductCodeInput(row);
        const productCode = inputValue(productCodeInput) || getPlugSkuFirstCellText(row);
        const declaredValue = inputValue(declaredInput) || calculateDeclaredValueFromRetailPrice(inputValue(retailInput));
        return {
            index,
            key: getPlugSkuRowKey(row, index),
            productCode,
            declaredValue
        };
    }

    function capturePlugMultiVariantDeclaredValueSnapshot(rootNode = root.document) {
        const rows = findPlugSkuRows(rootNode);
        if (rows.length < 1) return null;
        const entries = rows.map((row, index) => createPlugSkuDeclaredValueEntry(row, index));
        const missing = entries.filter((entry) => !entry.declaredValue).map((entry) => entry.productCode || `第${entry.index + 1}行`);
        if (missing.length > 0) throw new Error(`插头选择SKU货值读取/生成失败：${missing.join('、')}`);
        return {
            type: PLUG_MULTI_VARIANT_DECLARED_VALUE_SNAPSHOT,
            rows: entries
        };
    }

    function restorePlugMultiVariantDeclaredValues(snapshot, rootNode = root.document) {
        const rows = findPlugSkuRows(rootNode, { requireNoPlug: true });
        const fallbackRows = rows.length > 0 ? rows : findPlugSkuRows(rootNode);
        const rowByKey = new Map();
        fallbackRows.forEach((row, index) => rowByKey.set(getPlugSkuRowKey(row, index), row));
        const failed = [];
        (snapshot.rows || []).forEach((entry) => {
            const row = rowByKey.get(entry.key) || fallbackRows[entry.index];
            const declaredInput = getPlugSkuDeclaredInput(row);
            const ok = declaredInput ? setNativeValue(declaredInput, entry.declaredValue) : false;
            if (!ok) failed.push(entry.productCode || `第${entry.index + 1}行`);
        });
        if (failed.length > 0) throw new Error(`插头选择多SKU货值回填失败：${failed.join('、')}`);
        return true;
    }

    function dropdownAlreadyDisplaysValue(control, label) {
        if (!control) return false;
        const target = compactText(label);
        if (!target) return false;
        if (compactText(inputValue(control)) === target) return true;
        const scopes = [];
        const addScope = (scope) => {
            if (scope && !scopes.includes(scope)) scopes.push(scope);
        };
        if (typeof control.closest === 'function') {
            ['.ant-select', '.ant-select-selector', '.el-select', '.el-form-item', '.ant-form-item', '.form-item'].forEach((selector) => {
                try { addScope(control.closest(selector)); } catch (_) {}
            });
        }
        let current = control.parentElement;
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) addScope(current);
        return scopes.some((scope) => {
            const text = compactText(getNodeText(scope));
            if (!text || !text.includes(target)) return false;
            if (text === target) return true;
            if (text.includes('是否原箱') && text.length <= compactText('是否原箱').length + target.length + 12) return true;
            return text.length <= target.length + 12;
        });
    }

    async function selectDropdownValue(control, label) {
        if (!control) return false;
        if (dropdownAlreadyDisplaysValue(control, label)) return true;
        if (control.tagName === 'SELECT') {
            const option = Array.from(control.options || []).find((item) => compactText(item.textContent || item.label || item.value) === compactText(label));
            if (option) control.value = option.value;
            else control.value = label;
            try { control.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
            return compactText(control.value || control.textContent) === compactText(label) || Boolean(option);
        }
        clickNode(control);
        const option = root.waitForElement
            ? await root.waitForElement(() => findTextElement(label, { rootNode: root.document, exact: true }), { timeout: 3000, interval: 150 })
            : findTextElement(label, { rootNode: root.document, exact: true });
        if (!option) return false;
        clickNode(option);
        return true;
    }

    async function restoreOriginalBox(row, rootNode = root.document) {
        const controls = uniqueElements([
            getCellInputs(row, '是否原箱')[0],
            findInputsNearLabel('是否原箱', rootNode)[0],
            rootNode !== root.document ? findInputsNearLabel('是否原箱', root.document)[0] : null
        ]);
        if (controls.some((control) => dropdownAlreadyDisplaysValue(control, '是'))) return true;
        for (const control of controls) {
            if (await selectDropdownValue(control, '是')) return true;
        }
        return false;
    }

    function findDialogOption(dialog, label) {
        if (!dialog || typeof dialog.querySelectorAll !== 'function') return null;
        const target = compactText(label);
        const candidates = Array.from(dialog.querySelectorAll('label, .ant-checkbox-wrapper, .el-radio, .el-checkbox, [role="radio"], [role="checkbox"], span, div, li'))
            .map((element, index) => {
                if (!visible(element)) return null;
                const text = compactText(getNodeText(element));
                const labels = knownLogisticsLabelsFromText(text);
                const matched = text === target || (labels.length === 1 && compactText(labels[0]) === target);
                if (!matched) return null;
                return {
                    element,
                    index,
                    score: getOptionCandidateScore(element, label)
                };
            })
            .filter(Boolean)
            .filter((item) => item.score > -Infinity)
            .sort((left, right) => right.score - left.score || left.index - right.index);
        return candidates[0] ? candidates[0].element : null;
    }

    function getLogisticsDialogOptionScope(dialog, label) {
        const direct = findDialogOption(dialog, label);
        if (!direct) return null;
        let current = direct;
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
            const labels = knownLogisticsLabelsFromText(getNodeText(current));
            if (labels.length === 1 && compactText(labels[0]) === compactText(label)) return current;
        }
        return direct;
    }

    function isLogisticsDialogOptionChecked(scope) {
        if (!scope) return false;
        if (optionControlIsChecked(scope)) return true;
        return queryOptionControls(scope).some(optionControlIsChecked);
    }

    async function clickLogisticsDialogOption(dialog, label) {
        const scope = getLogisticsDialogOptionScope(dialog, label);
        if (!scope) throw new Error(`物流属性选项未找到：${label}`);
        if (isLogisticsDialogOptionChecked(scope)) return true;
        for (const target of getOptionClickTargets(scope)) {
            if (!clickNode(target)) continue;
            const ok = root.waitForElement
                ? await root.waitForElement(() => isLogisticsDialogOptionChecked(scope), { timeout: 1200, interval: 120 })
                : isLogisticsDialogOptionChecked(scope);
            if (ok) return true;
        }
        return isLogisticsDialogOptionChecked(scope);
    }

    async function restoreLogisticsAttributes(labels, rootNode = root.document) {
        const expectedLabels = unique(labels);
        if (displayedLogisticsMatches(expectedLabels, rootNode)) return true;
        if (rootNode && rootNode !== root.document && displayedLogisticsMatches(expectedLabels, root.document)) return true;

        const editButton = findLogisticsEditButton(rootNode)
            || (rootNode && rootNode !== root.document ? findLogisticsEditButton(root.document) : null);
        if (!editButton) throw new Error('未找到物流属性编辑入口');
        const dialog = await openDialogFromEditElement(editButton, '物流属性');
        if (!dialog) throw new Error('物流属性弹窗未打开');
        for (const label of expectedLabels) {
            const ok = await clickLogisticsDialogOption(dialog, label);
            if (!ok) throw new Error(`物流属性回填失败：${label}`);
        }
        const restoredLabels = getCheckedLogisticsLabels(dialog);
        const missing = expectedLabels.filter((label) => !logisticsLabelsIncludeAll(restoredLabels, [label]));
        if (missing.length > 0) throw new Error(`物流属性回填失败：${missing.join(', ')}`);
        await closeLogisticsDialog(dialog, true);
        return true;
    }

    async function restorePlugProductSnapshot(snapshot, rootNode = root.document) {
        if (snapshot && snapshot.type === PLUG_MULTI_VARIANT_DECLARED_VALUE_SNAPSHOT) {
            return restorePlugMultiVariantDeclaredValues(snapshot, rootNode);
        }
        const row = findNoPlugRow(rootNode);
        const writes = [];
        const write = (label, action) => {
            const ok = action();
            writes.push({ label, ok });
            return ok;
        };
        const restoreInputs = (labelText, aliases = []) => uniqueElements([
            ...getCellInputs(row, labelText),
            ...aliases.flatMap((alias) => getCellInputs(row, alias)),
            ...findInputsNearLabel(labelText, rootNode),
            ...aliases.flatMap((alias) => findInputsNearLabel(alias, rootNode))
        ]);
        const rowDimensionInputs = getCellInputs(row, '包装尺寸');
        const flatDimensionInputs = findDimensionInputs(rootNode);
        const dimensionInputsAt = (index) => uniqueElements([rowDimensionInputs[index], flatDimensionInputs[index]]);
        write('零售价', () => setFirstWritableValue(restoreInputs('零售价', ['零售价格']), snapshot.retailPrice));
        write('货值', () => setFirstWritableValue(restoreInputs('货值'), snapshot.declaredValue));
        write('库存', () => setFirstWritableValue(restoreInputs('库存', ['库存数量']), snapshot.stock));
        write('重量', () => setFirstWritableValue(restoreInputs('重量'), snapshot.weight));
        write('包装长度', () => setFirstWritableValue(dimensionInputsAt(0), snapshot.dimensions.length));
        write('包装宽度', () => setFirstWritableValue(dimensionInputsAt(1), snapshot.dimensions.width));
        write('包装高度', () => setFirstWritableValue(dimensionInputsAt(2), snapshot.dimensions.height));
        write('商品编码', () => {
            const productCodeInputs = restoreInputs('商品编码');
            if (productCodeInputs.length === 0 && !normalizeText(snapshot.productCode)) return true;
            return setFirstWritableValue(productCodeInputs, snapshot.productCode);
        });
        writes.push({ label: '是否原箱', ok: await restoreOriginalBox(row, rootNode) });
        const failed = writes.filter((item) => !item.ok).map((item) => item.label);
        if (failed.length > 0) throw new Error(`插头选择字段回填失败：${failed.join('、')}`);
        await restoreLogisticsAttributes(snapshot.logisticsAttributes, row || rootNode);
        return true;
    }

    async function clickOptionByText(label, { expectedState = 'clicked' } = {}) {
        const option = root.waitForElement
            ? await root.waitForElement(() => findOptionScopeByText(label, root.document), { timeout: 8000, interval: 250 })
            : findOptionScopeByText(label, root.document);
        if (!option) throw new Error(`未找到插头选择选项：${label}`);
        if (expectedState === 'checked' && optionScopeIsChecked(option)) return true;
        if (expectedState === 'unchecked' && !optionScopeIsChecked(option)) return true;
        if (expectedState === 'active' && optionScopeIsActive(option)) return true;

        const expected = (scope) => {
            if (expectedState === 'checked') return optionScopeIsChecked(scope);
            if (expectedState === 'unchecked') return !optionScopeIsChecked(scope);
            if (expectedState === 'active') return optionScopeIsActive(scope);
            return true;
        };

        for (const target of getOptionClickTargets(option)) {
            if (!clickNode(target)) continue;
            if (expectedState === 'clicked') return true;
            if (await waitForOptionState(label, expected, root.document)) return true;
        }
        throw new Error(`插头选择选项勾选失败：${label}`);
    }

    function getPlugTypeLabel(plugType) {
        return PLUG_TYPE_LABELS[plugType] || PLUG_TYPE_LABELS[PLUG_TYPE_NO_PLUG];
    }

    function findAndClickCheckbox(labelText) {
        for (const w of document.querySelectorAll('.ant-checkbox-wrapper')) {
            if (w.textContent.trim() === labelText) {
                const input = w.querySelector('.ant-checkbox-input');
                if (input) { input.click(); return true; }
                w.click(); return true;
            }
        }
        for (const lb of document.querySelectorAll('label')) {
            if (lb.textContent.trim() === labelText) {
                const input = lb.querySelector('input');
                if (input) { input.click(); return true; }
                lb.click(); return true;
            }
        }
        return false;
    }

    async function selectPlugOption(plugType) {
        const type = plugType || PLUG_TYPE_NO_PLUG;
        const label = getPlugTypeLabel(type);
        if (type === PLUG_TYPE_EU) {
            if (!findAndClickCheckbox(label)) {
                throw new Error(`未找到插头选择选项：${label}`);
            }
            return true;
        }
        await clickOptionByText('Type-C/No Plug');
        await clickOptionByText(label, { expectedState: 'checked' });
        await clickOptionByText('USB Type-C', { expectedState: 'unchecked' });
        if (root.waitForElement) {
            const ready = await root.waitForElement(() => isNoPlugSelectionReady(root.document), { timeout: 10000, interval: 300 });
            if (!ready) throw new Error(`插头选择${label}规格行未生成`);
        } else if (!isNoPlugSelectionReady(root.document)) {
            throw new Error(`插头选择${label}规格行未生成`);
        }
        return true;
    }

    async function runPlugNoPlugWorkflow(updateStatus = () => {}, plugType) {
        const type = plugType || PLUG_TYPE_NO_PLUG;
        const label = getNoPlugWorkflowLabel();
        const plugLabel = getPlugTypeLabel(type);
        if (type === PLUG_TYPE_EU) {
            updateStatus(`${label}：选择 ${plugLabel}...`, '#722ed1');
            await selectPlugOption(type);
            updateStatus(`${label}：插头类型已设置为 ${plugLabel}。`, '#52c41a');
            return true;
        }
        updateStatus(`${label}：读取客户已填写的价格、库存、尺寸和物流属性...`, '#1677ff');
        const snapshot = await capturePlugProductSnapshot(root.document);
        updateStatus(`${label}：选择 Type-C/No Plug / ${plugLabel}...`, '#722ed1');
        await selectPlugOption(type);
        updateStatus(`${label}：回填客户原始数据和物流属性...`, '#08979c');
        await restorePlugProductSnapshot(snapshot, root.document);
        updateStatus(`${label}：电压/插头属性与原始数据已恢复。`, '#52c41a');
        return snapshot;
    }

    async function runPlugOneClickOptimizePipeline(updateStatus = () => {}, plugType) {
        return root.runPlugNoPlugWorkflow(updateStatus, plugType);
    }

    root.PlugSelection = {
        MODE,
        PLUG_MODE,
        PLUG_TYPE_NO_PLUG,
        PLUG_TYPE_EU,
        PLUG_TYPE_LABELS,
        getPlugTypeLabel,
        normalizeOptimizationMode,
        isPlugOptimizationMode,
        createPlugSnapshot,
        getMissingPlugSnapshotFields,
        getCheckedLogisticsLabels,
        pickInputGroup,
        pickSnapshotInputGroup,
        findSnapshotInputsNearLabel,
        findSnapshotInputsByMarker,
        getLogisticsLabelsFromDisplayText,
        isTrustedLogisticsEditElement,
        logisticsLabelsIncludeAll,
        getLogisticsDialogOptionScope,
        isLogisticsDialogOptionChecked,
        getClickTargets,
        getOptionCandidateScore,
        isNoPlugSelectionReady,
        getNoPlugRowCandidateScore,
        getPlugVariantCellIndex,
        getPlugVariantInputsByLabel,
        getPlugVariantLogisticsEditButton,
        capturePlugProductSnapshot,
        restorePlugProductSnapshot,
        selectPlugOption,
        runPlugNoPlugWorkflow,
        runPlugOneClickOptimizePipeline
    };
    root.runPlugNoPlugWorkflow = runPlugNoPlugWorkflow;
    root.runPlugOneClickOptimizePipeline = runPlugOneClickOptimizePipeline;
})(typeof window !== 'undefined' ? window : globalThis);

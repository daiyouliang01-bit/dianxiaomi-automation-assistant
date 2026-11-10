'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadProductState() {
  const context = { globalThis: {}, Date };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/state/product-state.js'), 'utf8'), context);
  return context.globalThis.DxmProductState;
}

function loadAutoPublishFunction(name, contextOverrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/workflows/auto-publish.js'), 'utf8');
  const start = source.indexOf(`window.${name} =`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf('\nwindow.', start + 8);
  const snippet = source.slice(start, next >= 0 ? next : source.length);
  const context = {
    window: {
      dxmNormalizeText: value => String(value || '').replace(/\s+/g, ''),
      ...contextOverrides.window
    },
    document: contextOverrides.document,
    getComputedStyle: contextOverrides.getComputedStyle || (() => ({ display: 'block', visibility: 'visible' })),
    ...contextOverrides
  };
  vm.runInNewContext(snippet, context);
  return context.window[name];
}

function loadTopLevelFunction(file, name, contextOverrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let end = brace;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) { end += 1; break; }
    }
  }
  const context = { ...contextOverrides };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.loaded = ${name};`, context);
  return context.loaded;
}

function visibleDialog(text, parentElement = null) {
  return {
    innerText: text,
    textContent: text,
    parentElement,
    getBoundingClientRect() { return { width: 500, height: 240 }; }
  };
}

test('legacy forbidden detector accepts a visible nested result container', () => {
  const ancestor = { closest() { return {}; } };
  const nested = visibleDialog('违禁词检测结果\n描述违禁词：best\n返回修改', ancestor);
  const find = loadAutoPublishFunction('dxmFindForbiddenPublishDialog', {
    document: { querySelectorAll() { return [nested]; } }
  });

  const result = find();
  assert.equal(result?.status, 'forbidden_description');
  assert.equal(result?.modal, nested);
});

test('legacy forbidden detector falls back to body text when no standard dialog matches', () => {
  const body = visibleDialog('违禁词检测结果\n描述违禁词：best\n返回修改');
  const find = loadAutoPublishFunction('dxmFindForbiddenPublishDialog', {
    document: {
      body,
      querySelectorAll(selector) { return selector.includes('body') ? [body] : []; }
    }
  });

  assert.equal(find()?.status, 'forbidden_description');
});

test('legacy forbidden detector prefers the concrete dialog over the page body', () => {
  const body = visibleDialog('页面内容\n违禁词检测结果\n描述违禁词：best\n返回修改');
  const dialog = visibleDialog('违禁词检测结果\n描述违禁词：best\n返回修改');
  const find = loadAutoPublishFunction('dxmFindForbiddenPublishDialog', {
    document: {
      body,
      querySelectorAll(selector) { return selector.includes('body') ? [body, dialog] : [dialog]; }
    }
  });

  assert.equal(find()?.modal, dialog);
});

test('return-to-edit uses only the CDP trusted click path', async () => {
  const button = {
    isConnected: true,
    getBoundingClientRect() { return { left: 10, top: 20, width: 80, height: 30 }; },
    click() { throw new Error('ordinary click must not be used'); }
  };
  const modal = { isConnected: true };
  let trustedClicks = 0;
  const clickReturn = loadAutoPublishFunction('dxmClickForbiddenReturnToEdit', {
    document: {},
    window: {
      dxmFindDialogActionControl() { return button; },
      dxmIsVisibleElement(element) { return element.isConnected; },
      async dxmTrustedMouseClick() { trustedClicks += 1; button.isConnected = false; return true; },
      async waitForElement(predicate) { return predicate(); }
    }
  });

  await assert.doesNotReject(() => clickReturn({ modal }));
  assert.equal(trustedClicks, 1);
  assert.equal(button.isConnected, false);
});

test('one-click translation serializes focus and trusted-clicks both controls', async () => {
  const trustedTargets = [];
  const focusActions = [];
  const triggerRect = { left: 20, top: 70, width: 100, height: 30 };
  const optionRect = { left: 20, top: 110, width: 140, height: 30 };
  const trigger = {
    classList: { add() {}, remove() {} },
    scrollIntoView() {},
    getBoundingClientRect() { return triggerRect; },
    querySelector() { return null; },
    dispatchEvent() {},
    click() {}
  };
  const option = {
    getBoundingClientRect() { return optionRect; },
    closest() { return this; },
    dispatchEvent() {},
    click() {}
  };
  const runTranslate = loadAutoPublishFunction('dxmRunTranslate', {
    setTimeout(callback) { callback(); return 1; },
    MouseEvent: class {},
    window: {
      waitForElement(predicate) { return Promise.resolve(predicate()); },
      dxmFindTopTranslateTrigger() { return trigger; },
      dxmFindTranslateZhEnOption() { return option; },
      async dxmTrustedMouseClick(rect) { trustedTargets.push(rect); return true; }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(request, callback) {
          focusActions.push(request.action);
          callback({ success: true });
        }
      }
    }
  });

  await runTranslate();

  assert.deepEqual(focusActions, ['claim_tab_focus', 'release_tab_focus']);
  assert.deepEqual(trustedTargets, [triggerRect, optionRect]);
});

test('PC translation verification retries once when even one Chinese character remains', async () => {
  let translations = 0;
  const editor = { innerText: '英文 description' };
  const verifyTranslation = loadAutoPublishFunction('dxmRunTranslateWithPcVerification', {
    window: {
      async dxmRunTranslate() {
        translations += 1;
        editor.innerText = translations === 1 ? 'English 中' : 'English only';
      },
      waitForElement(predicate) { return Promise.resolve(predicate()); },
      dxmGetPcEditorContext() { return { editor }; }
    }
  });

  const result = await verifyTranslation();

  assert.equal(translations, 2);
  assert.equal(result.attempts, 2);
});

test('PC translation verification does not retry when no Chinese character remains', async () => {
  let translations = 0;
  const editor = { innerText: 'English only' };
  const verifyTranslation = loadAutoPublishFunction('dxmRunTranslateWithPcVerification', {
    window: {
      async dxmRunTranslate() { translations += 1; },
      waitForElement(predicate) { return Promise.resolve(predicate()); },
      dxmGetPcEditorContext() { return { editor }; }
    }
  });

  const result = await verifyTranslation();

  assert.equal(translations, 1);
  assert.equal(result.attempts, 1);
});

test('parses concrete forbidden words and retains bounded dialog diagnostics', () => {
  const api = loadProductState();
  const result = api.parseForbiddenDialog('违禁词检测结果\n描述违禁词：best、WhatsApp\n返回修改');
  assert.deepEqual(Array.from(result.words), ['best', 'WhatsApp']);
  assert.match(result.rawText, /描述违禁词/);
  assert.ok(result.rawText.length <= 500);
});

test('rejects a generic forbidden dialog with no concrete word', () => {
  const api = loadProductState();
  const result = api.parseForbiddenDialog('违禁词检测结果\n描述违禁词\n返回修改');
  assert.deepEqual(Array.from(result.words), []);
  assert.equal(result.errorCode, 'FORBIDDEN_DIALOG_WORD_MISSING');
});

test('parses multiline forbidden chips but excludes dialog actions', () => {
  const api = loadProductState();
  const result = api.parseForbiddenDialog('违禁词检测结果\n描述违禁词\nBest\nWhats App\n返回修改');
  assert.deepEqual(Array.from(result.words), ['Best', 'Whats App']);
});

test('editor controls distinguish ordinary, fullscreen, and missing states', () => {
  const api = loadProductState();
  assert.deepEqual({ ...api.decideEditorState({ fullscreen: true, minimize: false }) }, { state: 'ordinary', clickFullscreen: true });
  assert.deepEqual({ ...api.decideEditorState({ fullscreen: false, minimize: true }) }, { state: 'fullscreen', clickFullscreen: false });
  assert.deepEqual({ ...api.decideEditorState({ fullscreen: false, minimize: false }) }, { state: 'location_failure', clickFullscreen: false });
});

test('PC fullscreen entry resolves a visible fullscreen control coordinate independently of wrapper binding', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/workflows/auto-publish.js'), 'utf8');
  assert.match(source, /window\.dxmFindPcFullscreenControl\s*=/);
  assert.match(source, /getAttribute\('title'\)/);
  assert.match(source, /getAttribute\('aria-label'\)/);
  const start = source.indexOf('window.dxmRepairForbiddenTail');
  const end = source.indexOf('window.dxmPublishCurrentProductWithForbiddenRetry', start);
  const body = source.slice(start, end);
  assert.match(body, /pcContext\.fullscreen\.click\(\)/);
  assert.doesNotMatch(body, /dxmFindPcFullscreenControl/);
});

test('state machine permits a second repair only for a new word', () => {
  const api = loadProductState();
  let state = api.createForbiddenRepairState();
  let step = api.nextForbiddenRepair(state, ['best'], 'dialog 1');
  assert.equal(step.action, 'repair');
  state = step.state;
  step = api.nextForbiddenRepair(state, ['best'], 'dialog 2');
  assert.equal(step.action, 'terminal');
  assert.equal(step.errorCode, 'FORBIDDEN_WORD_REPEATED');

  state = api.nextForbiddenRepair(api.createForbiddenRepairState(), ['best'], 'dialog 1').state;
  step = api.nextForbiddenRepair(state, ['WhatsApp'], 'dialog 2');
  assert.equal(step.action, 'repair');
  assert.equal(step.state.attempts, 2);
  step = api.nextForbiddenRepair(step.state, ['third'], 'dialog 3');
  assert.equal(step.action, 'terminal');
  assert.equal(step.errorCode, 'FORBIDDEN_RETRY_EXHAUSTED');
});

test('serialized active-child repair state survives reload and still caps repairs at two', () => {
  const api = loadProductState();
  const first = api.nextForbiddenRepair(api.createForbiddenRepairState(), ['A'], 'one').state;
  const restored = JSON.parse(JSON.stringify(first));
  const second = api.nextForbiddenRepair(restored, ['B'], 'two').state;
  const restoredAgain = JSON.parse(JSON.stringify(second));
  const third = api.nextForbiddenRepair(restoredAgain, ['C'], 'three');
  assert.equal(third.action, 'terminal');
  assert.equal(third.errorCode, 'FORBIDDEN_RETRY_EXHAUSTED');
  assert.deepEqual(Array.from(restoredAgain.wordHistory, row => Array.from(row)), [['A'], ['B']]);
});

test('failed infrastructure does not consume a repair and the same word can be repaired after recovery', () => {
  const api = loadProductState();
  const persisted = api.createForbiddenRepairState();

  const failedCandidate = api.nextForbiddenRepair(persisted, ['best'], 'first dialog');
  assert.equal(failedCandidate.action, 'repair');
  assert.equal(failedCandidate.state.attempts, 1);
  assert.equal(persisted.attempts, 0);
  assert.deepEqual(Array.from(persisted.wordHistory), []);

  const recoveredCandidate = api.nextForbiddenRepair(persisted, ['best'], 'same dialog after recovery');
  assert.equal(recoveredCandidate.action, 'repair');
  const committed = { ...recoveredCandidate.state, status: 'verified' };
  assert.equal(committed.attempts, 1);
  assert.deepEqual(Array.from(committed.wordHistory, row => Array.from(row)), [['best']]);
});

test('trim and UEditor failures preserve the page instead of allowing close', () => {
  const api = loadProductState();
  assert.equal(api.shouldPreservePageForError('DXM_PC_LAST_IMAGE_NOT_FOUND'), true);
  assert.equal(api.shouldPreservePageForError('DXM_UE_SYNC_FAILED'), true);
  assert.equal(api.shouldPreservePageForError('DXM_FORBIDDEN_FAILURE_NOT_PERSISTED'), true);
  assert.equal(api.shouldPreservePageForError('NETWORK_TIMEOUT'), false);
});

test('all product-image insertion failures map to one preserve-page error with causeCode', () => {
  const api = loadProductState();
  const cases = [
    Object.assign(new Error('未授权'), { code: 'DXM_FORBIDDEN_SENDER_INVALID' }),
    Object.assign(new Error('批次过期'), { code: 'DXM_FORBIDDEN_STATE_STALE' }),
    new Error('引用产品图片弹窗未出现')
  ];
  const mapped = cases.map(api.mapPcInsertError);
  assert.deepEqual(Array.from(mapped, item => item.code), ['DXM_PC_INSERT_FAILED', 'DXM_PC_INSERT_FAILED', 'DXM_PC_INSERT_FAILED']);
  assert.deepEqual(Array.from(mapped, item => item.causeCode), ['DXM_FORBIDDEN_SENDER_INVALID', 'DXM_FORBIDDEN_STATE_STALE', 'UNKNOWN']);
  mapped.forEach(item => assert.equal(api.shouldPreservePageForError(item.code), true));
});

test('forbidden repair infrastructure failures preserve page and are not business terminal failures', () => {
  const api = loadProductState();
  const mapped = api.mapForbiddenRepairInfrastructureError(Object.assign(new Error('UE sync'), { code: 'DXM_UE_SYNC_FAILED' }));
  assert.equal(mapped.code, 'DXM_PC_FORBIDDEN_REPAIR_FAILED');
  assert.equal(mapped.causeCode, 'DXM_UE_SYNC_FAILED');
  assert.equal(api.shouldPreservePageForError(mapped.code), true);
  assert.equal(api.isForbiddenBusinessTerminal('FORBIDDEN_WORD_REPEATED'), true);
  assert.equal(api.isForbiddenBusinessTerminal(mapped.code), false);
});

test('forbidden cleanup directly trims the already located PC editor', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/background/background.js'), 'utf8');
  assert.doesNotMatch(source, /action === "dxm_clear_forbidden_tail_after_last_image"/);
  const workflow = fs.readFileSync(path.join(__dirname, '../src/workflows/auto-publish.js'), 'utf8');
  const start = workflow.indexOf('window.dxmRepairForbiddenTail');
  const end = workflow.indexOf('window.dxmPublishCurrentProductWithForbiddenRetry', start);
  const body = workflow.slice(start, end);
  assert.match(body, /dxmRemovePcDescriptionContentAfterProductImages\(pcContext\.editor\)/);
  assert.match(body, /pcContext\.fullscreen\.click\(\)/);
  assert.match(body, /FindExactControl\('最小化'/);
  assert.match(body, /!window\.dxmIsPcEditorFullscreen\(currentPcContext\)/);
  assert.ok(body.indexOf('FindExactControl(\'最小化\'') < body.indexOf('dxmRunWirelessDescriptionAuto'));
  assert.ok(body.indexOf('!window.dxmIsPcEditorFullscreen(currentPcContext)') < body.indexOf('dxmRunWirelessDescriptionAuto'));
  assert.doesNotMatch(body, /dxm_clear_forbidden_tail_after_last_image/);
});

test('description-forbidden prompt starts cleanup even when no concrete word is parsed', () => {
  const api = loadProductState();
  const transition = api.nextForbiddenRepair(api.createForbiddenRepairState(), [], '描述违禁词\n返回修改');
  assert.equal(transition.action, 'repair');
  assert.equal(transition.state.attempts, 1);
});

test('terminal failure handler persists before closing and releases the active slot', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/background/background.js'), 'utf8');
  const start = source.indexOf('async function dxmPersistForbiddenFailureAndClose');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n}', start) + 2);
  assert.match(source, /sendResponse\(result\); \/\/ ACK/);
  assert.ok(source.indexOf('sendResponse(result); // ACK') < source.indexOf('setTimeout(() => removeTabAcceptingDialogs'));
  assert.match(body, /failedProducts/);
  assert.match(body, /activeChildren/);
  assert.match(source, /removeTabAcceptingDialogs\(tabId\).*finally\(\(\) => scheduleAutoPublishTabs\(\)\)/s);
});

test('stable forbidden error taxonomy and batch-only final summary are present', () => {
  const errors = fs.readFileSync(path.join(__dirname, '../src/state/error-types.js'), 'utf8');
  ['FORBIDDEN_DIALOG_WORD_MISSING', 'FORBIDDEN_EDITOR_LOCATION_FAILED', 'FORBIDDEN_UE_SYNC_FAILED', 'FORBIDDEN_VERIFICATION_FAILED', 'FORBIDDEN_WORD_REPEATED', 'FORBIDDEN_RETRY_EXHAUSTED'].forEach(code => assert.match(errors, new RegExp(code)));
  const panel = fs.readFileSync(path.join(__dirname, '../src/panel/windows-panel.js'), 'utf8');
  assert.match(panel, /failedProducts/);
  assert.match(panel, /pendingQueue/);
  assert.match(panel, /activeChildren/);
  assert.match(panel, /失败商品汇总/);
});

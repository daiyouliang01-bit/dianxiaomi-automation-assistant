/* 商品状态机 */

(function() {
  const DXM_PRODUCT_STATES = Object.freeze({
    PENDING:            'pending',
    PROCESSING:         'processing',
    DONE:               'done',
    ABNORMAL_TRANSIENT: 'abnormal_transient',
    ABNORMAL_MANUAL:    'abnormal_manual',
    INVALID_MATERIAL:   'invalid_material',
    SKIPPED:            'skipped',
    PUBLISH_UNKNOWN:    'publish_unknown',
  });

  const DXM_ALLOWED_TRANSITIONS = Object.freeze({
    [DXM_PRODUCT_STATES.PENDING]:            ['processing', 'skipped'],
    [DXM_PRODUCT_STATES.PROCESSING]:         ['done', 'abnormal_transient', 'abnormal_manual', 'invalid_material', 'publish_unknown', 'skipped'],
    [DXM_PRODUCT_STATES.ABNORMAL_TRANSIENT]: ['pending', 'abnormal_manual'],
    [DXM_PRODUCT_STATES.ABNORMAL_MANUAL]:    ['pending', 'skipped'],
    [DXM_PRODUCT_STATES.PUBLISH_UNKNOWN]:    ['done', 'abnormal_manual'],
  });

  function dxmCreateProduct(input) {
    return {
      productId: input.productId,
      url: input.url,
      state: DXM_PRODUCT_STATES.PENDING,
      version: 1,
      step: null,
      imageStates: [],
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      originalsCleared: false,
      imagesWritten: false,
      publishRequested: false,
      publishConfirmedAt: null,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function dxmTransition(product, targetState) {
    const allowed = DXM_ALLOWED_TRANSITIONS[product.state];
    if (!allowed || !allowed.includes(targetState)) {
      throw new Error('非法状态转换：' + product.state + ' → ' + targetState + '（商品 ' + (product.productId || product.key || '') + '）');
    }
    product.state = targetState;
    product.version += 1;
    product.updatedAt = Date.now();
    if (targetState === DXM_PRODUCT_STATES.PENDING && (product.retryCount || 0) < 1) {
      product.retryCount += 1;
    }
  }

  function dxmBeginImageTask(product, imageIndex, stage) {
    var taskVersion = product.version + ':' + imageIndex + ':' + stage + ':' + Date.now();
    return { taskVersion: taskVersion, productVersion: product.version };
  }

  function dxmAcceptTaskResult(product, taskToken) {
    var expectedVersion = String(product.version);
    var tokenVersion = String(taskToken || '').split(':')[0];
    return tokenVersion === expectedVersion;
  }

  function dxmBoundedText(value, limit) {
    return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit || 300);
  }

  function dxmParseForbiddenDialog(text) {
    var rawText = dxmBoundedText(text, 500);
    var words = [];
    var patterns = [
      /(?:描述违禁词|描述禁词)\s*[：:]\s*([^\n\r]+)/ig,
      /(?:违禁词|禁词)\s*[【\[]([^\]\u3011]+)[\]\u3011]/ig
    ];
    patterns.forEach(function(pattern) {
      var match;
      while ((match = pattern.exec(rawText))) {
        String(match[1] || '').split(/[,，、;；|]/).forEach(function(part) {
          var word = part.trim().replace(/^(?:是|为)\s*/, '').replace(/\s*(?:返回修改|请修改).*$/, '').trim();
          if (word && word.length <= 80 && !/^(?:描述违禁词|描述禁词|返回修改)$/.test(word) && !words.includes(word)) words.push(word);
        });
      }
    });
    if (!words.length) {
      var chipBlock = rawText.match(/(?:描述违禁词|描述禁词)\s*[\r\n]+([\s\S]*?)(?:[\r\n]+返回修改|$)/i);
      if (chipBlock) String(chipBlock[1] || '').split(/[\r\n,，、;；|]+/).forEach(function(part) {
        var word = part.trim();
        if (word && word.length <= 80 && !/^(?:取消|确定|关闭|返回修改|描述违禁词)$/.test(word) && !words.includes(word)) words.push(word);
      });
    }
    return { words: words, rawText: rawText, errorCode: words.length ? '' : 'FORBIDDEN_DIALOG_WORD_MISSING' };
  }

  function dxmDecideEditorState(controls) {
    if (controls && controls.minimize) return { state: 'fullscreen', clickFullscreen: false };
    if (controls && controls.fullscreen) return { state: 'ordinary', clickFullscreen: true };
    return { state: 'location_failure', clickFullscreen: false };
  }

  function dxmCreateForbiddenRepairState() {
    return { attempts: 0, wordHistory: [], lastDialogText: '', status: 'idle' };
  }

  function dxmNextForbiddenRepair(input, words, dialogText) {
    var state = input || dxmCreateForbiddenRepairState();
    var cleanWords = Array.from(new Set((words || []).map(function(word) { return dxmBoundedText(word, 80).trim(); }).filter(Boolean)));
    if (state.attempts >= 2) return { action: 'terminal', errorCode: 'FORBIDDEN_RETRY_EXHAUSTED', state: { ...state, status: 'terminal_failed', lastDialogText: dxmBoundedText(dialogText, 500) } };
    var normalized = cleanWords.map(function(word) { return word.normalize('NFKC').replace(/\s/g, '').toLowerCase(); });
    var seen = (state.wordHistory || []).flat().map(function(word) { return String(word).normalize('NFKC').replace(/\s/g, '').toLowerCase(); });
    if (normalized.some(function(word) { return seen.includes(word); })) return { action: 'terminal', errorCode: 'FORBIDDEN_WORD_REPEATED', state: { ...state, status: 'terminal_failed', lastDialogText: dxmBoundedText(dialogText, 500) } };
    return { action: 'repair', state: { attempts: state.attempts + 1, wordHistory: cleanWords.length ? [...(state.wordHistory || []), cleanWords] : (state.wordHistory || []), lastDialogText: dxmBoundedText(dialogText, 500), status: 'repairing' } };
  }

  function dxmUpsertFailedProduct(existing, record) {
    var safe = {
      productId: dxmBoundedText(record && record.productId, 100),
      productUrl: dxmBoundedText(record && record.productUrl, 500),
      errorType: 'FORBIDDEN_WORD_REPAIR_FAILED',
      errorCode: dxmBoundedText(record && record.errorCode || 'FORBIDDEN_VERIFICATION_FAILED', 100),
      forbiddenWords: (record && record.forbiddenWords || []).slice(0, 10).map(function(word) { return dxmBoundedText(word, 80); }),
      wordHistory: (record && record.wordHistory || []).slice(0, 2).map(function(row) { return row.slice(0, 10).map(function(word) { return dxmBoundedText(word, 80); }); }),
      stage: dxmBoundedText(record && record.stage || 'republish_after_forbidden_repair', 100),
      message: dxmBoundedText(record && record.message, 300),
      repairAttempts: Math.min(2, Math.max(0, Number(record && record.repairAttempts) || 0)),
      failedAt: Number(record && record.failedAt) || Date.now()
    };
    return (existing || []).filter(function(item) { return String(item.productId) !== safe.productId; }).concat([safe]);
  }

  function dxmBatchSummary(state) {
    var failures = state && state.failedProducts || [];
    return { ready: !(state && state.pendingQueue || []).length && !(state && state.activeChildren || []).length, successCount: Math.max(0, Number(state && state.processed || 0)), failureCount: failures.length, failures: failures };
  }

  function dxmShouldPreservePageForError(code) {
    return code === 'DXM_FORBIDDEN_FAILURE_NOT_PERSISTED' || /^(?:DXM_PC_|DXM_UE_)/.test(String(code || ''));
  }

  function dxmMapPcInsertError(error) {
    var causeCode = String(error && error.code || 'UNKNOWN').slice(0, 100);
    var mapped = new Error('产品图片插入/尾部清理阶段失败 [' + causeCode + ']：' + String(error && error.message || error || '').slice(0, 240));
    mapped.code = 'DXM_PC_INSERT_FAILED';
    mapped.causeCode = causeCode;
    return mapped;
  }

  function dxmMapForbiddenRepairInfrastructureError(error) {
    var causeCode = String(error && error.code || 'UNKNOWN').slice(0, 100);
    var mapped = new Error('违禁词 PC 尾部修复基础设施失败 [' + causeCode + ']：' + String(error && error.message || error || '').slice(0, 240));
    mapped.code = 'DXM_PC_FORBIDDEN_REPAIR_FAILED'; mapped.causeCode = causeCode;
    return mapped;
  }

  function dxmIsForbiddenBusinessTerminal(code) {
    return ['FORBIDDEN_WORD_REPEATED', 'FORBIDDEN_RETRY_EXHAUSTED', 'FORBIDDEN_DIALOG_WORD_MISSING'].includes(String(code || ''));
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.DxmProductState = {
      createProduct: dxmCreateProduct,
      transition: dxmTransition,
      beginImageTask: dxmBeginImageTask,
      acceptTaskResult: dxmAcceptTaskResult,
      STATES: DXM_PRODUCT_STATES,
      ALLOWED_TRANSITIONS: DXM_ALLOWED_TRANSITIONS,
      parseForbiddenDialog: dxmParseForbiddenDialog,
      decideEditorState: dxmDecideEditorState,
      createForbiddenRepairState: dxmCreateForbiddenRepairState,
      nextForbiddenRepair: dxmNextForbiddenRepair,
      upsertFailedProduct: dxmUpsertFailedProduct,
      batchSummary: dxmBatchSummary,
      shouldPreservePageForError: dxmShouldPreservePageForError,
      mapPcInsertError: dxmMapPcInsertError,
      mapForbiddenRepairInfrastructureError: dxmMapForbiddenRepairInfrastructureError,
      isForbiddenBusinessTerminal: dxmIsForbiddenBusinessTerminal,
    };
  }
})();

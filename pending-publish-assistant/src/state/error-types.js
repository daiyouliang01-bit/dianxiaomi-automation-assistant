/* 错误分类体系 */

(function() {
  var DXM_ERROR = Object.freeze({
    NETWORK_TIMEOUT:   { code: 'NETWORK_TIMEOUT',   retryable: true,  category: 'transient' },
    OCR_BUSY:          { code: 'OCR_BUSY',           retryable: true,  category: 'transient' },
    OCR_TIMEOUT:       { code: 'OCR_TIMEOUT',        retryable: true,  category: 'transient' },
    SERVICE_DOWN:      { code: 'SERVICE_DOWN',       retryable: true,  category: 'transient' },
    RATE_LIMITED:      { code: 'RATE_LIMITED',       retryable: true,  category: 'transient' },
    TAB_CRASHED:       { code: 'TAB_CRASHED',        retryable: true,  category: 'transient' },
    IMAGE_SPACE_FULL:  { code: 'IMAGE_SPACE_FULL',   retryable: false, category: 'permanent' },
    INVALID_IMAGE:     { code: 'INVALID_IMAGE',       retryable: false, category: 'permanent' },
    TOO_FEW_IMAGES:    { code: 'DXM_PRODUCT_INVALID_TOO_FEW_IMAGES', retryable: false, category: 'permanent' },
    BOX_AREA_EXCEEDED: { code: 'BOX_AREA_EXCEEDED',   retryable: false, category: 'permanent' },
    MASK_INVALID:      { code: 'MASK_INVALID',         retryable: false, category: 'permanent' },
    PARSE_ERROR:       { code: 'PARSE_ERROR',          retryable: false, category: 'permanent' },
    CONFIG_MISSING:    { code: 'CONFIG_MISSING',       retryable: false, category: 'permanent' },
    PUBLISH_UNKNOWN_GATE: { code: 'PUBLISH_UNKNOWN_GATE', retryable: false, category: 'permanent' },
    INPAINT_SIZE_MISMATCH: { code: 'INPAINT_SIZE_MISMATCH', retryable: false, category: 'permanent' },
    INPAINT_SOLID_BLOCK:   { code: 'INPAINT_SOLID_BLOCK',   retryable: false, category: 'permanent' },
    WATERMARK_UNREPAIRABLE: { code: 'WATERMARK_UNREPAIRABLE', retryable: false, category: 'permanent' },
    MASK_AREA_EXCEEDED:  { code: 'MASK_AREA_EXCEEDED',  retryable: false, category: 'permanent' },
    OCR_CIRCUIT_OPEN:    { code: 'OCR_CIRCUIT_OPEN',     retryable: true,  category: 'transient' },
    DXM_NO_SAFE_BOXES:   { code: 'DXM_NO_SAFE_BOXES',   retryable: false, category: 'permanent' },
    FORBIDDEN_DIALOG_WORD_MISSING: { code: 'FORBIDDEN_DIALOG_WORD_MISSING', retryable: false, category: 'permanent' },
    FORBIDDEN_UE_SYNC_FAILED: { code: 'FORBIDDEN_UE_SYNC_FAILED', retryable: false, category: 'permanent' },
    FORBIDDEN_VERIFICATION_FAILED: { code: 'FORBIDDEN_VERIFICATION_FAILED', retryable: false, category: 'permanent' },
    FORBIDDEN_WORD_REPEATED: { code: 'FORBIDDEN_WORD_REPEATED', retryable: false, category: 'permanent' },
    FORBIDDEN_RETRY_EXHAUSTED: { code: 'FORBIDDEN_RETRY_EXHAUSTED', retryable: false, category: 'permanent' },
    DXM_UE_EDITOR_AMBIGUOUS: { code: 'DXM_UE_EDITOR_AMBIGUOUS', retryable: false, category: 'permanent' },
    DXM_UE_BOUNDARY_NOT_FOUND: { code: 'DXM_UE_BOUNDARY_NOT_FOUND', retryable: false, category: 'permanent' },
    DXM_UE_SYNC_UNAVAILABLE: { code: 'DXM_UE_SYNC_UNAVAILABLE', retryable: false, category: 'permanent' },
    DXM_UE_SYNC_FAILED: { code: 'DXM_UE_SYNC_FAILED', retryable: false, category: 'permanent' },
    DXM_UE_VERIFICATION_FAILED: { code: 'DXM_UE_VERIFICATION_FAILED', retryable: false, category: 'permanent' },
    DXM_FORBIDDEN_FAILURE_NOT_PERSISTED: { code: 'DXM_FORBIDDEN_FAILURE_NOT_PERSISTED', retryable: false, category: 'permanent' },
    DXM_FORBIDDEN_STATE_STALE: { code: 'DXM_FORBIDDEN_STATE_STALE', retryable: false, category: 'permanent' },
    DXM_FORBIDDEN_SENDER_INVALID: { code: 'DXM_FORBIDDEN_SENDER_INVALID', retryable: false, category: 'permanent' },
    DXM_UE_NO_RESULT: { code: 'DXM_UE_NO_RESULT', retryable: false, category: 'permanent' },
    DXM_UE_EDITOR_ARGUMENT_INVALID: { code: 'DXM_UE_EDITOR_ARGUMENT_INVALID', retryable: false, category: 'permanent' },
    DXM_UE_BRIDGE_FAILED: { code: 'DXM_UE_BRIDGE_FAILED', retryable: false, category: 'permanent' },
    DXM_FORBIDDEN_CHILD_INACTIVE: { code: 'DXM_FORBIDDEN_CHILD_INACTIVE', retryable: false, category: 'permanent' },
    DXM_PC_INSERT_FAILED: { code: 'DXM_PC_INSERT_FAILED', retryable: false, category: 'permanent' },
    DXM_PC_FORBIDDEN_REPAIR_FAILED: { code: 'DXM_PC_FORBIDDEN_REPAIR_FAILED', retryable: false, category: 'permanent' },
    DXM_PC_EDITOR_NOT_FOUND: { code: 'DXM_PC_EDITOR_NOT_FOUND', retryable: false, category: 'permanent' },
    DXM_PC_LAST_IMAGE_NOT_FOUND: { code: 'DXM_PC_LAST_IMAGE_NOT_FOUND', retryable: false, category: 'permanent' },
    FORBIDDEN_EDITOR_LOCATION_FAILED: { code: 'FORBIDDEN_EDITOR_LOCATION_FAILED', retryable: false, category: 'permanent' },
  });

  function dxmClassifyError(error) {
    var msg = (error?.message || String(error || '')).toLowerCase();
    var code = error?.code || '';

    var byCode = Object.values(DXM_ERROR).find(function(e) { return e.code === code; });
    if (byCode) return byCode;

    if (/timeout|timed ?out/i.test(msg)) return DXM_ERROR.NETWORK_TIMEOUT;
    if (/busy|too many|rate limit|429/i.test(msg)) return DXM_ERROR.RATE_LIMITED;
    if (/空间不足|space.*full|空间满/i.test(msg)) return DXM_ERROR.IMAGE_SPACE_FULL;
    if (/service.*down|connect.*refused|fetch failed|econnrefused/i.test(msg)) return DXM_ERROR.SERVICE_DOWN;
    if (/parse|json.*error/i.test(msg)) return DXM_ERROR.PARSE_ERROR;
    if (/invalid.*image|decode.*fail/i.test(msg)) return DXM_ERROR.INVALID_IMAGE;

    return DXM_ERROR.NETWORK_TIMEOUT;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.DxmError = { CLASSIFY: dxmClassifyError, TYPES: DXM_ERROR };
  }
})();

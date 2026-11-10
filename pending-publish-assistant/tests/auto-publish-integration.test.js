'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('manifest loads auto-publish after main.js and grants debugger permission', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const scripts = manifest.content_scripts[0].js;

    assert.ok(manifest.permissions.includes('debugger'));
    assert.ok(manifest.permissions.includes('alarms'));
    assert.ok(scripts.includes('src/content/main.js'));
    assert.ok(scripts.includes('src/workflows/auto-publish.js'));
    assert.doesNotMatch(scripts.join('\n'), /rpa/i);
    // auto-publish.js should come after main.js in the content script loading order
    assert.ok(scripts.indexOf('src/workflows/auto-publish.js') > scripts.indexOf('src/content/main.js'));
});

test('auto-publish keeps its own state key and only injects on offline pages', () => {
    const source = read('src/workflows/auto-publish.js');

    assert.match(source, /dxmPublishState/);
    assert.doesNotMatch(source, /rpa_running/);
    assert.match(source, /dxmIsOfflinePublishListPage/);
    assert.match(source, /dxmLooksLikeOfflinePublishListDom/);
    assert.match(source, /待发布产品/);
    assert.match(source, /\/web\/smt\/smtproductlist\/offline/);
    assert.match(source, /\/web\/smt\/smtproductlist/);
    assert.match(source, /\/web\/smt\/smtproductlist\/draft/);
    assert.match(source, /dxmRemoveListControlsIfWrongPage/);
});

test('auto-publish keeps helpers for translated Chinese description cleanup', () => {
    const source = read('src/workflows/auto-publish.js');

    assert.match(source, /亲爱的朋友/);
    assert.match(source, /页面上显示的价格仅为部分定金/);
    assert.match(source, /dxmEnsureEnglishTemplateInMobileEditor/);
    assert.match(source, /isStandaloneContactLine/);
    assert.match(source, /孤立联系方式/);
});

test('auto-publish suppresses browser translation widgets and marks templates no-translate', () => {
    const source = read('src/workflows/auto-publish.js');
    const css = read('style.css');

    assert.match(source, /dxmEnableNoTranslateGuard/);
    assert.match(source, /dxmSuppressTranslationWidgets/);
    assert.match(source, /translate', 'no'/);
    assert.match(source, /notranslate/);
    assert.match(source, /普通翻译/);
    assert.match(source, /高级翻译/);
    assert.match(css, /data-dxm-suppressed-translate-widget/);
    assert.match(css, /goog-te-menu-frame/);
});

test('auto-publish recognises the current publish-success dialog wording', () => {
    const source = read('src/workflows/auto-publish.js');

    assert.match(source, /产品已提交发布/);
    assert.match(source, /已提交发布/);
    assert.match(source, /发布中/);
    assert.match(source, /发布失败/);
    assert.match(source, /在线产品/);
    assert.match(source, /NodeFilter\.SHOW_TEXT/);
});

test('auto-publish uses verified per-product two-repair forbidden state machine', () => {
    const source = read('src/workflows/auto-publish.js');

    assert.match(source, /dxmFindForbiddenPublishDialog/);
    assert.match(source, /违禁词检测结果/);
    assert.match(source, /描述违禁词/);
    assert.match(source, /返回修改/);
    assert.doesNotMatch(source, /DXM_FORBIDDEN_PUBLISH_RETRY_KEY/);
    assert.match(source, /parseForbiddenDialog/);
    assert.match(source, /data-dxm-description-template-image/);
    assert.match(source, /dxmRepairForbiddenTail/);
    assert.match(source, /await window\.dxmRunWirelessDescriptionAuto\(\)/);
    assert.match(source, /const publishResult = await window\.dxmPublishCurrentProduct\(\)/);
    assert.match(source, /publishResult\?\.status === 'forbidden_description'/);
    assert.match(source, /nextForbiddenRepair/);
    assert.match(source, /dxmRemovePcDescriptionContentAfterProductImages\(pcContext\.editor\)/);
    assert.doesNotMatch(source, /dxm_clear_forbidden_tail_after_last_image/);
    assert.match(source, /dxm_persist_forbidden_failure_and_close/);
    assert.match(source, /persisted/);
});

test('PC image preparation ordinary errors are inside the unified preserve-page mapping boundary', () => {
    const source = read('src/workflows/auto-publish.js');
    const fullscreenThrow = source.indexOf('插图前编辑器已退出全屏');
    const start = source.lastIndexOf('try {', fullscreenThrow);
    const selectThrow = source.indexOf('PC端描述工具栏：找不到', start);
    const mapper = source.indexOf('mapPcInsertError(error)', start);
    assert.ok(start >= 0 && fullscreenThrow > start && selectThrow > start);
    assert.ok(mapper > fullscreenThrow && mapper > selectThrow);
});

test('forbidden repair waits for its modal to disappear before resolving the PC editor', () => {
    const source = read('src/workflows/auto-publish.js');
    const start = source.indexOf('window.dxmClickForbiddenReturnToEdit');
    const end = source.indexOf('window.dxmPublishCurrentProductWithForbiddenRetry', start);
    const body = source.slice(start, end);
    assert.match(body, /!modal\.isConnected/);
    assert.match(body, /dxmIsVisibleElement\(modal\)/);
    assert.ok(body.indexOf('!modal.isConnected') < body.indexOf('dxmGetPcEditorContext'));
});

test('forbidden repair candidate is committed only after tail cleanup succeeds', () => {
    const source = read('src/workflows/auto-publish.js');
    const start = source.indexOf('window.dxmPublishCurrentProductWithForbiddenRetry');
    const end = source.indexOf('window.dxmPublishCurrentProduct = async function', start);
    const body = source.slice(start, end);
    const candidate = body.indexOf('nextForbiddenRepair');
    const repair = body.indexOf('await window.dxmRepairForbiddenTail');
    const commit = body.indexOf("action: 'dxm_commit_state_patch'");
    assert.ok(candidate >= 0 && repair > candidate && commit > repair);
    assert.doesNotMatch(body.slice(candidate, repair), /dxm_commit_state_patch/);
});

test('image resize workflow records concrete 800 JPG failure nodes', () => {
    const source = read('src/content/main.js');

    assert.match(source, /window\.triggerImageResize/);
    assert.match(source, /trusted_mouse_move/);
    assert.match(source, /trusted_mouse_click/);
    assert.match(source, /findProductInfoCard/);
    assert.match(source, /findProductImageSection/);
    assert.match(source, /findValidatedEditImageTrigger/);
    assert.match(source, /isValidatedEditImageTrigger/);
    assert.match(source, /edit_image_text_verify/);
    assert.match(source, /hoverEditImageTrigger\(editImgTrigger,\s*productImageSection,\s*0\.58,\s*1100\)/);
    assert.match(source, /产品信息/);
    assert.match(source, /主图最多选用/);
    assert.match(source, /editImageHoverRect/);
    assert.match(source, /dispatchPointerMouseEvents/);
    assert.match(source, /clickEditImageTriggerForMenu/);
    assert.match(source, /findOpenedBatchResizeItem/);
    assert.match(source, /0\.58/);
    assert.match(source, /\[0\.5,\s*0\.66,\s*0\.42\]/);
    assert.match(source, /批量修改图片尺寸/);
    assert.match(source, /批量改图片尺寸/);
    assert.match(source, /edit_image_button/);
    assert.match(source, /batch_resize_menu/);
    assert.match(source, /resize_dialog/);
    assert.match(source, /size_inputs/);
    assert.match(source, /generate_jpg_button/);
    assert.match(source, /isGenerateJpgText/);
    assert.match(source, /findResizeSizeInputsByTextAnchor/);
    assert.match(source, /findGenerateJpgButtonByTextAnchor/);
    assert.match(source, /isBatchResizeDialog/);
    assert.match(source, /resize_dialog_text_verify/);
    assert.match(source, /removeBlockingWorkflowOverlay/);
    assert.match(source, /dxm-one-click-overlay/);
    assert.match(source, /findResizeOpeningMask/);
    assert.match(source, /waitForResizeOpeningMaskGone/);
    assert.match(source, /resize_opening_mask/);
    assert.match(source, /正在呼出图片重置面板/);
    assert.match(source, /clickGenerateJpgWithVerification/);
    assert.match(source, /element_click/);
    assert.match(source, /processing_signal_seen/);
    assert.match(source, /no_processing_signal/);
    assert.match(source, /processing_seen_but_not_finished/);
    assert.match(source, /clickTrustedThenPlain/);
    assert.match(source, /getDialogImageDimensions/);
    assert.match(source, /dimensionsConfirmGeneratedJpg/);
    assert.match(source, /弹窗内图片尺寸已变更为 800 边/);
    assert.match(source, /变化至/);
    assert.match(source, /生成JPG/);
    assert.match(source, /生成JPG图片\[\?？\]\?\$/);
    assert.match(source, /已核对“批量改图片尺寸”和“生成JPG图片”/);
    assert.match(source, /resize_done/);
    assert.match(source, /已执行：批量改图片尺寸并生成 800 JPG/);
    assert.doesNotMatch(source, /const selectAllControl/);
});

test('PC description image insertion is anchored below the English template', () => {
    const source = read('src/workflows/auto-publish.js');
    const css = read('style.css');

    assert.match(source, /dxmPlaceCaretAfterDescriptionTemplate/);
    assert.match(source, /data-dxm-image-insert-anchor/);
    assert.match(source, /insertAdjacentElement\('afterend', anchor\)/);
    assert.match(source, /dxmDescriptionTemplateImageUrl/);
    assert.match(source, /dxmStorageGet\(\['dxmDescriptionTemplate',\s*'dxmDescriptionTemplateImageUrl'\]\)/);
    assert.match(source, /const templateImageUrl = stored\.dxmDescriptionTemplateImageUrl \|\| ''/);
    assert.match(source, /data-dxm-description-template-image/);
    assert.match(source, /dxmCreateDescriptionTemplateBlock\(editor\.ownerDocument,\s*template,\s*templateImageUrl\)/);
    assert.match(source, /模板图片链接/);
    assert.match(css, /dxm-template-image-preview/);
    assert.match(source, /光标已放在模板下方/);
    assert.match(source, /PC端描述工具栏：找不到“选择图片”/);
    assert.match(source, /dxmInsertProductImagesIntoPcDescription/);
    assert.match(source, /dxmTrustedImageMenuSequence/);
    assert.match(source, /await window\.dxmTrustedImageMenuSequence\(buttonRect,\s*fromRect\)/);
    assert.match(source, /引用产品图片/);
    assert.match(source, /dxmFindDialogActionControl\('全部'/);
    assert.match(source, /dxmFindDialogActionControl\('选择'/);
    assert.doesNotMatch(source, /const manualResult = await window\.dxmWaitForManualPcImageInsert\(pcSelectImage\)/);
});

test('product image review panel is compact and does not render thumbnails', () => {
    const source = read('src/workflows/auto-publish.js');
    const css = read('style.css');

    assert.match(source, /产品图片检查/);
    assert.match(source, /核对主图和营销图/);
    assert.match(css, /#dxm-image-review-panel[\s\S]*width:\s*260px/);
    assert.match(source, /block:\s*'nearest'/);
    assert.doesNotMatch(source, /dxm-review-gallery/);
    assert.doesNotMatch(source, /dxm-review-thumb/);
    assert.doesNotMatch(source, /dxm-image-refresh/);
});

test('wireless description is automatic and only publishes after saved return', () => {
    const source = read('src/workflows/auto-publish.js');
    const css = read('style.css');

    assert.match(source, /PC 描述图片已插入，正在生成无线端描述/);
    assert.match(source, /无线端描述/);
    assert.match(source, /dxmRevealWirelessEditorActions/);
    assert.match(source, /dxmTrustedMouseMove/);
    assert.match(source, /dxmDispatchPointerMouseEvents/);
    assert.match(source, /querySelectorAll\?\.\('img'\)/);
    assert.match(source, /dxmFindVisibleFloatingNewWirelessEditorButton/);
    assert.match(source, /dxmWaitForVisibleFloatingNewWirelessEditorButton/);
    assert.match(source, /dxmScrollIntoViewOnlyIfNeeded/);
    assert.match(source, /dxmVisibleViewportRect/);
    assert.match(source, /hoverBase\.height \* 0\.5/);
    assert.match(source, /dxmClickFloatingNewWirelessEditorButton\(\)/);
    assert.doesNotMatch(source, /const radioLabel/);
    assert.match(source, /根据 PC 端描述一键生成/);
    assert.match(source, /dxmSafeElementClick\(generateButton,\s*generateButton\)/);
    assert.match(source, /dxmLooksLikeWirelessGenerateConfirmDialog/);
    assert.match(source, /dxmConfirmWirelessGenerateDialog/);
    assert.match(source, /守护器可能已经先一步点击“确定”/);
    assert.match(source, /__dxmWirelessGenerateConfirmSkippedAt/);
    assert.match(source, /一键生成已确认，正在等待无线端内容稳定/);
    assert.match(source, /dxmWaitForWirelessRenderedOrSaveClickable\(beforeGenerateSnapshot,\s*6500\)/);
    assert.match(source, /setTimeout\(resolve,\s*1500\)/);
    assert.match(source, /clickable\.click\?\.\(\)/);
    assert.match(source, /dxmTrustedMouseClick\(rect,\s*rect\)/);
    assert.match(source, /dxmFindClickableWirelessSaveButton/);
    assert.match(source, /dxmFindWirelessEditorHeaderSaveButton/);
    assert.match(source, /dxmFindBlockingWirelessLoadingDialog/);
    assert.match(source, /dxmGetWirelessRenderState/);
    assert.match(source, /save_clickable_without_blocking_dialog/);
    assert.match(source, /save_clickable_timeout_fast_path/);
    assert.match(source, /dxmSaveWirelessEditorAndReturn/);
    assert.match(source, /dxmIsInWirelessNewEditorFullscreen/);
    assert.match(source, /dxmWaitForWirelessEditorReturn/);
    assert.match(source, /dxmWaitForWirelessSaveClickSignal/);
    assert.match(source, /__dxmWirelessLastSaveClick/);
    assert.match(source, /trusted:\s*false/);
    assert.match(source, /targetCount:\s*clickTargets\.length/);
    assert.doesNotMatch(source, /dxmFindElementBlockingRectCenter\?\.\(rect,\s*saveClickable\)/);
    assert.match(source, /dxmTrustedMouseClick\(latestRect,\s*latestRect\)/);
    assert.match(source, /saveClicked/);
    assert.match(source, /saveClickSignal/);
    assert.match(source, /未能点击右上角“保存”按钮/);
    assert.match(source, /dxmWaitForWirelessSaveRefreshOrJump/);
    assert.match(source, /beforeSaveUrl/);
    assert.match(source, /页面刷新或跳回编辑页/);
    assert.match(source, /dxm_start_auto_publish_child/);
    assert.match(source, /dxmStartAutoPublishChildFromMessage/);
    assert.match(source, /dxmWaitForAutoPublishEditReady/);
    assert.match(source, /await window\.dxmWaitForAutoPublishEditReady\(\)/);
    assert.match(source, /setTimeout\(\(\) => \{\s*window\.dxmRunAutoPublishProduct\(\)/);
    assert.match(source, /_dxmRunAutoPublishProductBusy/);
    assert.match(source, /productListReady/);
    assert.match(source, /editPageReady/);
    assert.match(source, /previewReady/);
    assert.match(source, /\/web\/smt\/smtproductlist/);
    assert.match(source, /保存后未检测到页面刷新或跳回普通编辑页，暂不发布/);
    assert.match(source, /保存后未检测到页面刷新或返回/);
    assert.match(source, /saveResult\.saveNavigation\?\.previewReady/);
    assert.match(source, /saveNavigation/);
    assert.match(source, /dxmGetTemplateFirstParagraph/);
    assert.match(source, /无线端描述模板第一段文字一致/);
    assert.match(source, /dxmTemplateTextMatches\(template,\s*finalSnapshot\)/);
    assert.match(source, /无线端描述已自动保存，正在准备发布/);
    assert.match(source, /正在生成营销图片/);
    assert.match(source, /await window\.dxmRegenerateMarketingImage\(\)/);
    assert.match(source, /await window\.dxmApplyDescriptionTemplate\(\)/);
    assert.match(source, /running:\s*latest\?\.running !== false/);
    assert.match(source, /lastChildFailedAt/);
    assert.match(source, /chrome\.runtime\.sendMessage\(\{\s*action:\s*'schedule_auto_publish_tabs'\s*\}\)/);
    assert.match(css, /top:\s*50%/);
    assert.match(css, /transform:\s*translateY\(-38%\)/);
    assert.match(css, /width:\s*390px/);
    assert.match(source, /clearInterval\(window\.__dxmWirelessGenerateConfirmGuardTimer\)/);
    assert.match(source, /clearInterval\(window\.__dxmWirelessSaveGuardTimer\)/);
    assert.doesNotMatch(source, /clickedGreenNewEditor/);
    assert.doesNotMatch(source, /const wirelessResult = await window\.dxmWaitForManualWirelessDescription/);
});

test('auto-publish entry is inserted beside native quick operation without hijacking it', () => {
    const source = read('src/workflows/auto-publish.js');

    assert.match(source, /=== '快捷操作'/);
    assert.match(source, /text === '批量操作'/);
    assert.match(source, /toolbarControls\.find\(item => item\.text === '快捷操作'\)/);
    assert.match(source, /toolbarControls\.find\(item => item\.text === '批量操作'\)/);
    assert.match(source, /existing\.isConnected/);
    assert.match(source, /existing\.remove\(\)/);
    assert.match(source, /\[300,\s*900,\s*1800,\s*3600\]/);
    assert.match(source, /window\.dxmRenderListControls\(\);\s*window\.dxmRefreshStartButton/);
    assert.match(source, /dxmRefreshListControlsForCurrentPage/);
    assert.match(source, /setTimeout\(window\.dxmRefreshListControlsForCurrentPage,\s*delay\)/);
    assert.match(source, /MutationObserver/);
    assert.match(source, /_dxmPublishStorageListenerInstalled/);
    assert.match(source, /const insertionAnchor/);
    assert.match(source, /insertionAnchor\.parentNode\.insertBefore\(controls,\s*insertionAnchor\.nextSibling\)/);
    assert.match(source, /event\.stopPropagation\(\)/);
    assert.match(source, /'pointerdown'/);
    assert.match(source, /controls\.addEventListener\(type/);
    assert.doesNotMatch(source, /controls\.addEventListener\(type,\s*event => \{[\s\S]*?\},\s*true\)/);
});

test('background exposes auto-publish scheduling and trusted click capabilities', () => {
    const source = read('src/background/background.js');

    assert.match(source, /function dxmIsOfflinePublishListUrl/);
    assert.match(source, /async function scheduleAutoPublishTabs/);
    assert.match(source, /async function dxmWakeAutoPublishTab/);
    assert.match(source, /async function dxmWakeActiveAutoPublishChildren/);
    assert.match(source, /async function dxmShouldScheduleAutoPublish/);
    assert.match(source, /pendingQueue = state\.pendingQueue \|\| \[\]/);
    assert.match(source, /return activeChildren\.length < maxConcurrent/);
    assert.match(source, /chrome\.tabs\.sendMessage\(tabId,\s*\{\s*action:\s*'dxm_start_auto_publish_child'/);
    assert.match(source, /response\?\.success && response\?\.started/);
    assert.match(source, /maxConcurrent\s*=\s*Number\(state\.maxConcurrent \|\| 5\)/);
    assert.match(read('src/workflows/auto-publish.js'), /DXM_AUTO_PUBLISH_MAX_CONCURRENT\s*=\s*5/);
    assert.doesNotMatch(read('src/workflows/auto-publish.js'), /location\.reload\(\)/);
    // Now uses chrome.windows.create to open each product in its own window
    assert.match(source, /chrome\.windows\.create\(\{\s*url:\s*child\.url,\s*focused:\s*false,\s*type:\s*'normal'\s*\}\)/);
    assert.match(source, /Promise\.all\(openedTabIds\.map\(tabId =>\s*dxmWakeAutoPublishTab\(tabId\)/);
    assert.match(source, /chrome\.tabs\.onRemoved\.addListener/);
    assert.match(source, /chrome\.tabs\.onUpdated\.addListener/);
    assert.match(source, /dxmWakeActiveAutoPublishChildren\('alarm_patrol'\)/);
    assert.match(source, /reason === 'patrol'/);
    assert.match(source, /activeChildren\.length < Number\(state\.maxConcurrent \|\| 5\)/);
    assert.match(source, /标签关闭后全量补齐失败/);
    assert.match(source, /chrome\.storage\.onChanged\.addListener/);
    assert.match(source, /状态变化后顺序补开失败/);
    assert.match(source, /DXM_AUTO_PUBLISH_PATROL_ALARM/);
    assert.match(source, /chrome\.alarms\.onAlarm\.addListener/);
    assert.match(source, /request\.action === "schedule_auto_publish_tabs"/);
    assert.match(source, /request\.action === "open_auto_publish_tab"/);
    assert.doesNotMatch(source, /open_rpa_tabs/);
    assert.match(source, /request\.action === "trusted_mouse_click"/);
    assert.match(source, /request\.action === "trusted_mouse_move"/);
    assert.match(source, /request\.action === "trusted_image_menu_sequence"/);
    assert.match(source, /async function removeTabAcceptingDialogs/);
    assert.match(source, /Page\.javascriptDialogOpening/);
    assert.match(source, /Page\.handleJavaScriptDialog/);
    assert.match(source, /window\.onbeforeunload = null/);
    assert.match(source, /await removeTabAcceptingDialogs\(tabId\)/);
});

test('large publish initializes one ordered batch vision session before scheduling products', () => {
    const source = read('src/workflows/auto-publish.js');
    assert.match(source, /DXM_BATCH_VISION_PROVIDER_ORDER\s*=\s*Object\.freeze\(\[\s*'glm',\s*'glm-4v',\s*'gemini',\s*'agnes',\s*'qwen3-vl-flash',\s*'qwen'\s*\]\)/);
    assert.match(source, /const batchId\s*=\s*`batch-\$\{Date\.now\(\)\}-/);
    assert.match(source, /action:\s*'dxm_initialize_vision_session'/);
    const initialize = source.indexOf("action: 'dxm_initialize_vision_session'");
    const schedule = source.indexOf("window.dxmProcessNextPendingProduct()", initialize);
    assert.ok(initialize >= 0 && schedule > initialize, 'vision probing must finish before product scheduling');
});

test('background probes providers once in order and serializes runtime promotion', () => {
    const source = read('src/background/background.js');
    assert.match(source, /DXM_BATCH_VISION_PROVIDER_ORDER/);
    assert.match(source, /dxmVisionProbePromise/);
    assert.match(source, /\/api\/v1\/vision\/providers\/.*\/test/);
    assert.match(source, /if\s*\(result\.status\s*===\s*['"]READY['"]\)\s*\{[^}]*break;/);
    assert.match(source, /request\.action === ['"]dxm_initialize_vision_session['"]/);
    assert.match(source, /request\.action === ['"]dxm_record_vision_provider['"]/);
    assert.match(source, /DXM_GLOBAL_QUEUES\.stateWrite\.run/);
});

test('assistant windows console has a stable top model status sourced from visionSession', () => {
    assert.match(read('windows-panel.html'), /id="vision-model-status"/);
    const source = read('src/panel/windows-panel.js');
    assert.match(source, /state\.visionSession/);
    assert.match(source, /当前图片模型/);
});

test('page-world open hook suppresses automation beforeunload prompts', () => {
    const source = read('src/platform/inject-open-hook.js');

    assert.match(source, /isAutomationPage/);
    assert.match(source, /dxm_auto_publish/);
    assert.match(source, /beforeunload/);
    assert.match(source, /window\.__dxmSuppressBeforeUnload/);
    assert.match(source, /window\.onbeforeunload = null/);
    assert.match(source, /EventTarget\.prototype\.addEventListener/);
    assert.doesNotMatch(source, /rpa_auto/);
    assert.doesNotMatch(source, /rpa_running/);
});

test('content keeps publish safety helpers without collection-box RPA', () => {
    const source = read('src/content/main.js');

    assert.match(source, /DxmPublishSafety/);
    assert.match(source, /classifyImageGenerationResult/);
    assert.match(source, /shouldDeleteAttributeRow/);
    assert.doesNotMatch(source, /initRPAButton/);
    assert.doesNotMatch(source, /executeRPAChildProcess/);
    assert.doesNotMatch(source, /rpa_auto/);
    assert.doesNotMatch(source, /rpa_running/);
});

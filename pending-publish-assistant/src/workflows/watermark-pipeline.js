/**
 * ============================================================
 * 去水印能力 —— 整合进「店小秘待发布助手」自动发布流程
 * ============================================================
 * 串联完整链路：
 *
 *   遍历"产品图片"区域(.img-module.productMainImgModule)的主图
 *     -> 归档原图到 ~/Documents/速卖通自动化/{商品id}/原图/
 *     -> 本地检测水印(127.0.0.1:8765/api/v1/lite/detect，OCR+云视觉)
 *     -> 宣传文字/展会图(EXCLUDE) 整张跳过，不下载不写回
 *     -> 生成mask -> 店小秘inpaint.json直连消除(路线A，跳过UI)
 *     -> 本地合成自有水印(127.0.0.1:8765/api/v1/lite/watermark/apply)
 *     -> 归档成品到 ~/Documents/速卖通自动化/{商品id}/加水印后/
 *   清空原有主图（可信点击删除按钮）
 *   一次性把处理后的本地文件重新上传（真实"选择图片->本地图片->
 *   系统文件框"链路，由 background 用 chrome.debugger 完成注入）
 *
 * 供 auto-publish.js 在"一键优化+800×800"之后、"图片人工复核"之前
 * 调用：await window.dxmRunWatermarkForAutoPublish()，自动衔接不暂停。
 *
 * 注意：这里用到的云视觉/OCR检测模型是水印消除专用的独立体系（配置在
 * 本地IPE服务的 vision provider + vision-secrets.env），跟本插件自身
 * 标题优化/属性优化/营销图识别用的 Gemini/千问（存 chrome.storage.local
 * 的 geminiApiKey/qwenApiKey）完全是两套人马，互不共用、互不影响。
 * ============================================================
 */

const DXM_WM_IPE_BASE_URL = 'http://127.0.0.1:8765';

// ---------- 与background通信的工具函数 ----------

function dxmWmBgMessage(payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                reject(new Error(response?.msg || '后台请求失败'));
                return;
            }
            resolve(response);
        });
    });
}

async function dxmWmIpeFetchJson(path, options = {}) {
    const response = await fetch(`${DXM_WM_IPE_BASE_URL}${path}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let payload;
    try {
        payload = await response.json();
    } catch (e) {
        const bodySample = await response.text().catch(() => '').then(t => t.slice(0, 200));
        throw new Error(`本地图片服务返回非JSON (HTTP ${response.status}): ${bodySample}`);
    }
    if (!response.ok) {
        throw new Error(payload.error || `本地图片服务 HTTP ${response.status}`);
    }
    return payload;
}

function dxmWmBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function dxmWmExtensionFromMime(mime) {
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    return '.jpg';
}

// ---------- 归档：原图 / 加水印成品 各归一份到 Documents ----------
//
// Chrome 插件自己 chrome.downloads 只能写到「下载」目录下的子目录，
// 没法直接写 ~/Documents，所以归档统一交给本地IPE服务（Python，能写
// 任意路径）。归档失败不应该打断整个自动发布流程——只记警告，继续走。

async function dxmWmArchiveImage(base64, kind, filename) {
    const productId = window.dxmProductKeyFromUrl ? window.dxmProductKeyFromUrl(location.href) : 'unknown-product';
    try {
        await dxmWmIpeFetchJson('/api/v1/lite/archive', {
            method: 'POST',
            body: { product_id: productId, kind, filename, image_base64: base64 }
        });
    } catch (error) {
        console.warn(`[dxm-watermark] 归档失败(${kind}/${filename})，不影响后续流程:`, error.message);
    }
}

// ---------- 第一步：本地检测水印区域（OCR + 云视觉图形logo检测） ----------

// detectionMode: 'ocr' | 'mixed' | 'model'；mixedTrigger: 'always' | 'ocr_miss'
// （只有 mixed 模式下 mixedTrigger 才生效）。为兼容老调用，第2个参数也接受
// 布尔（true=mixed/always，false=ocr）。
async function dxmWmLiteDetect(base64, detectionMode = 'mixed', mixedTrigger = 'always') {
    if (typeof detectionMode === 'boolean') {
        detectionMode = detectionMode ? 'mixed' : 'ocr';
    }
    const stored = await new Promise(resolve => chrome.storage.local.get(['dxmPublishState'], resolve));
    const visionSession = stored.dxmPublishState?.visionSession || {};
    const detection = await dxmWmIpeFetchJson('/api/v1/lite/detect', {
        method: 'POST',
        body: {
            image_base64: base64,
            detection_mode: detectionMode,
            mixed_trigger: mixedTrigger,
            // 老字段一并带上，兼容旧服务：mixed/model 视为要用云视觉
            use_cloud_vision: detectionMode !== 'ocr',
            batch_id: visionSession.batchId,
            preferred_provider: visionSession.mainProviderId,
            provider_order: visionSession.order
        }
    });
    if (detectionMode !== 'ocr' && detection.provider_id) {
        await dxmWmBgMessage({
            action: 'dxm_record_vision_provider',
            batchId: visionSession.batchId,
            generation: visionSession.generation,
            providerId: detection.provider_id,
            modelId: detection.model_id,
            fallbackHistory: detection.fallback_history
        }).catch(error => console.warn('[dxm-watermark] 批次模型状态更新失败:', error.message));
    } else if (detectionMode !== 'ocr' && detection.cloud_vision_error) {
        await dxmWmBgMessage({
            action: 'dxm_record_vision_unavailable',
            batchId: visionSession.batchId,
            generation: visionSession.generation,
            fallbackHistory: detection.fallback_history
        }).catch(error => console.warn('[dxm-watermark] 批次模型不可用状态更新失败:', error.message));
    }
    return detection;
}

// ---------- 第二步：按店小秘编辑器同款缩放规则，生成等尺寸的原图副本 + mask PNG ----------
//
// 抓包实测发现：店小秘编辑器里真实点"消除笔"时，会先把原图缩放到
// 一个较小尺寸（长边 = sizeLimit），mask 也在这个缩放后的尺寸上画，
// 二者尺寸必须完全一致，且 inpaint.json 的 sizeLimit 字段要传这个
// 缩放后长边的字符串值（不是写死的常量、也不能是原图分辨率）。

// 单个检测框如果占了原图一大块面积，大概率是云视觉/OCR把商品本体
// 误判成了水印——实测出现过整张商品图被当成水印区域画进mask、AI
// 消除直接把商品本体换成一坨纹理色块的情况。宁可漏检留着水印，也
// 不能错删商品本体，所以超过这个面积占比的框直接丢弃不用。
const DXM_WM_MAX_BOX_AREA_RATIO = 0.35;

async function dxmWmPrepareImageAndMask(imageObjectUrl, boxes, padding = 12, expandRatio = 0.15, targetMaxDim = 1200) {
    const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('原图解码失败'));
        im.src = imageObjectUrl;
    });

    var safeBoxes;
    try {
      safeBoxes = typeof dxmValidateAndMergeBoxes === 'function'
        ? dxmValidateAndMergeBoxes(boxes, img.naturalWidth, img.naturalHeight)
        : boxes;
    } catch (e) {
      if (e.code === 'MASK_AREA_EXCEEDED') throw e;
      safeBoxes = boxes;
    }
    if (!safeBoxes || !safeBoxes.length) {
      var noBoxesErr = new Error('全部检测框都被判定为疑似误检（面积占比过大），跳过消除');
      noBoxesErr.code = 'DXM_NO_SAFE_BOXES';
      throw noBoxesErr;
    }

    const scale = Math.min(1, targetMaxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = width;
    imageCanvas.height = height;
    imageCanvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const imageBlob = await new Promise(resolve => imageCanvas.toBlob(resolve, 'image/png'));

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, width, height);
    maskCtx.fillStyle = '#FFFFFF';
    safeBoxes.forEach(b => {
        const bw = b.width * scale;
        const bh = b.height * scale;
        // mask 比检测框再放大一圈，把水印边缘/抗锯齿/半透明拖影也盖进去，
        // 避免出现"主体擦掉了但边角残留几个字"的情况。放大量 = 固定padding
        // + 按框自身较长边的比例(expandRatio)，这样大水印扩得多、小水印扩得
        // 少，比死板的固定像素更贴合不同尺寸的水印。
        const pad = padding + Math.round(Math.max(bw, bh) * expandRatio);
        const x = Math.max(0, b.x * scale - pad);
        const y = Math.max(0, b.y * scale - pad);
        const w = Math.min(width - x, bw + pad * 2);
        const h = Math.min(height - y, bh + pad * 2);
        maskCtx.fillRect(x, y, w, h);
    });
    const maskBlob = await new Promise(resolve => maskCanvas.toBlob(resolve, 'image/png'));

    return { imageBlob, maskBlob, width, height, sizeLimit: Math.max(width, height) };
}

// ---------- 第三步：店小秘 inpaint 直连（路线A） ----------

async function dxmWmGetTempUploadSlot() {
    const resp = await fetch('/api/meituv2/uploads/temp-image.json', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: 'inpaint', ext: 'png' })
    });
    if (!resp.ok) throw new Error('获取临时上传地址失败: ' + resp.status);
    const json = await resp.json();
    if (json.code !== 0) throw new Error('temp-image.json 业务报错: ' + json.msg);
    const { uploadUrl, publicUrl, headers } = json.data;
    return { uploadUrl, fileUrl: publicUrl, uploadHeaders: headers || { 'Content-Type': 'image/png' } };
}

async function dxmWmPutToCos(uploadUrl, blob, headers) {
    const resp = await fetch(uploadUrl, { method: 'PUT', body: blob, headers });
    if (!resp.ok) throw new Error('上传到COS失败: ' + resp.status);
}

async function dxmWmCallInpaint(imageUrl, maskImageUrl, sizeLimit) {
    const resp = await fetch('/api/meituv2/images/inpaint.json', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, maskImageUrl, sizeLimit: String(sizeLimit) })
    });
    if (!resp.ok) throw new Error('消除接口调用失败: ' + resp.status);
    const json = await resp.json();
    if (json.code !== 0) throw new Error('inpaint.json 业务报错: ' + json.msg);
    return json.data.imageUrl;
}

async function dxmWmRemoveWatermarkViaRouteA(imageObjectUrl, boxes, padding, expandRatio, targetMaxDim) {
    const { imageBlob, maskBlob, sizeLimit } = await dxmWmPrepareImageAndMask(imageObjectUrl, boxes, padding, expandRatio, targetMaxDim);

    const origSlot = await dxmWmGetTempUploadSlot();
    const maskSlot = await dxmWmGetTempUploadSlot();
    await dxmWmPutToCos(origSlot.uploadUrl, imageBlob, origSlot.uploadHeaders);
    await dxmWmPutToCos(maskSlot.uploadUrl, maskBlob, maskSlot.uploadHeaders);

    return dxmWmCallInpaint(origSlot.fileUrl, maskSlot.fileUrl, sizeLimit);
}

// ---------- 第四步：下载图片到本地（真实链路写回商品图需要本地文件路径） ----------

async function dxmWmDownloadToLocal(url, filenameHint) {
    const result = await dxmWmBgMessage({
        action: 'download_url_to_file',
        url,
        filenameHint,
        timeoutMs: 30000
    });
    return result.filename;
}

// ---------- 第五步：读取本地文件并调用加水印接口 ----------
//
// chrome.debugger 同一时刻只能有一个连接挂在同一个标签页上——多张图
// 并行处理时（见下面 dxmWmMapWithConcurrency），如果这一步（会用CDP
// 注入文件）并发调用，attach会互相冲突。用一个简单的 promise 链把
// "涉及 debugger 的动作"串行化，其余步骤（检测/消除/归档/下载）
// 该并行还是并行，不受影响——这一步本身很快，串行化不太影响总耗时。

// 用类封装 debugger 锁，异常不会卡死队列
var dxmWmDebuggerLock = null;
function dxmWmEnsureDebuggerLock() {
  if (dxmWmDebuggerLock) return dxmWmDebuggerLock;
  dxmWmDebuggerLock = { _queue: Promise.resolve() };
  dxmWmDebuggerLock.run = function(fn) {
    var prev = this._queue;
    var _resolve;
    this._queue = new Promise(function(r) { _resolve = r; });
    return prev.then(function() { return fn(); }, function() { return fn(); }).finally(function() { _resolve(); });
  };
  return dxmWmDebuggerLock;
}
var dxmWmWithDebuggerLock = function(fn) { return dxmWmEnsureDebuggerLock().run(fn); };

async function dxmWmReadLocalFileAsBase64ViaInput(filename) {
    // 借用一个临时的、自己创建的 file input（不是店小秘的
    // #localFileUploadInp，避免互相干扰），走同样的CDP文件注入
    // 机制把本地文件读出来转成base64
    const id = `dxm-wm-read-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = id;
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    document.documentElement.appendChild(input);
    try {
        await dxmWmWithDebuggerLock(() =>
            dxmWmBgMessage({ action: 'set_file_input_files_directly', selector: `#${id}`, filePaths: [filename] })
        );
        const file = await new Promise((resolve, reject) => {
            const started = Date.now();
            const check = () => {
                if (input.files?.[0]) return resolve(input.files[0]);
                if (Date.now() - started > 10000) return reject(new Error('读取本地文件超时'));
                setTimeout(check, 50);
            };
            check();
        });
        return await dxmWmBlobToBase64(file);
    } finally {
        input.remove();
    }
}

async function dxmWmApplyOwnWatermark(localFilename, imageIndex, imageCount) {
    const base64 = await dxmWmReadLocalFileAsBase64ViaInput(localFilename);
    const result = await dxmWmIpeFetchJson('/api/v1/lite/watermark/apply', {
        method: 'POST',
        body: { image_base64: base64, image_index: imageIndex, image_count: imageCount }
    });
    return result.data_url;
}

// ---------- 单张图片完整处理 ----------

// 返回 null 表示这张图被判定为宣传文字/展会图等非商品图内容，
// 整张跳过——不下载、不加自有水印、最后也不会被写回商品图片列表。
async function dxmWmProcessSingleImage(imageUrl, options = {}) {
    const {
        imageIndex = 0, imageCount = 1, padding = 12, expandRatio = 0.15, targetMaxDim = 1200,
        detectionMode = 'mixed', mixedTrigger = 'always', onProgress = null
    } = options;
    const tag = `[${imageIndex + 1}/${imageCount}]`;
    const report = (stage, extra = {}) => onProgress?.({ imageIndex, imageCount, stage, ...extra });
    // 每张中转文件带上商品id + 时间戳，且集中放到"下载/dxm-temp/"子目录：
    // 1) 不同商品之间不会重名混淆；2) 不会被 uniquify 无限加 (1)(2) 后缀；
    // 3) 真正要长期保存的图已经由本地服务归档到 文稿/速卖通自动化/图片数据/，
    //    下载目录这些只是写回商品图用的临时中转，集中一处方便随时清理。
    const productId = window.dxmProductKeyFromUrl ? window.dxmProductKeyFromUrl(location.href) : 'product';
    const stamp = Date.now();
    const tempName = kind => `dxm-temp/${productId}-${stamp}-${kind}-${imageIndex}`;

    report('fetching');
    let originalBlob, originalBase64, originalObjectUrl;
    try {
        const originalResp = await fetch(imageUrl);
        if (!originalResp.ok) throw new Error('原图拉取失败: ' + originalResp.status);
        originalBlob = await originalResp.blob();
        originalBase64 = await dxmWmBlobToBase64(originalBlob);
        originalObjectUrl = URL.createObjectURL(originalBlob);
    } catch (fetchError) {
        console.warn(`${tag} 图片无法下载（可能已从 CDN 删除或被 CORS 拦截），跳过:`, fetchError.message);
        report('skipped_fetch_error', { error: fetchError.message });
        return null;
    }

    try {
        await dxmWmArchiveImage(originalBase64, '原图', `image-${imageIndex}${dxmWmExtensionFromMime(originalBlob.type)}`);

        report('detecting');
        console.log(`${tag} 检测水印:`, imageUrl);
        const detection = await dxmWmLiteDetect(originalBase64, detectionMode, mixedTrigger);

        // mixed/model 明确要求云视觉参与。云模型全部失败或响应字段无效时，
        // 本地服务会返回 cloud_vision_error；此时不能把空 boxes 当成“没有
        // 水印”继续叠加自有水印，否则会再次产生“旧 logo 未去除 + 新水印”
        // 的错误成品。这里在任何消除、下载、清空或写回动作前 fail-closed。
        if (detectionMode !== 'ocr' && detection.cloud_vision_error) {
            const error = new Error('云视觉水印检测结果不可用，已保留原图并停止自动处理');
            error.code = 'DXM_VISION_DETECTION_UNKNOWN';
            report('vision_detection_unknown');
            throw error;
        }

        if (detection.recommended_action === 'EXCLUDE') {
            console.log(`${tag} 判定排除（${detection.exclude_reason || '未标注原因'}），image_type=${detection.image_type}，跳过整张图，不上传:`, detection.risk_tags);
            report('excluded', { imageType: detection.image_type, excludeReason: detection.exclude_reason || '', riskTags: detection.risk_tags });
            return null;
        }

        let currentUrl = imageUrl;
        if (detection.boxes.length) {
            report('removing_watermark', { boxCount: detection.boxes.length });
            console.log(`${tag} 检测到水印，走路线A消除:`, detection.boxes);
            try {
                currentUrl = await dxmWmRemoveWatermarkViaRouteA(originalObjectUrl, detection.boxes, padding, expandRatio, targetMaxDim);
            } catch (error) {
                if (error.code === 'DXM_NO_SAFE_BOXES') {
                    console.warn(`${tag} ${error.message}，保留原图不消除`);
                } else {
                    throw error;
                }
            }
        } else {
            console.log(`${tag} 未检测到水印，跳过消除步骤`);
        }

        report('downloading');
        console.log(`${tag} 下载到本地:`, currentUrl);
        const localFilename = await dxmWmDownloadToLocal(currentUrl, `${tempName('step1')}.jpg`);

        report('applying_watermark');
        console.log(`${tag} 本地合成自有水印`);
        const watermarkedDataUrl = await dxmWmApplyOwnWatermark(localFilename, imageIndex, imageCount);

        await dxmWmArchiveImage(watermarkedDataUrl.split(',')[1], '加水印后', `image-${imageIndex}.png`);

        const finalFilename = await dxmWmDownloadToLocal(watermarkedDataUrl, `${tempName('final')}.png`);
        console.log(`${tag} 处理完成:`, finalFilename);
        report('done');
        return finalFilename;
    } finally {
        URL.revokeObjectURL(originalObjectUrl);
    }
}

// ---------- DOM 操作：读取图片列表 / 清空 / 写回 ----------

// 只处理"产品图片"区域（真正会展示在listing上的图，如产品主图），
// 不碰"采集图片信息"里的证书/展会/宣传图等原始素材池——那些不是
// 要挂到商品listing上的图，不应该被下载/消除水印/写回。
function dxmWmGetImageCards() {
    return Array.from(document.querySelectorAll('.img-module.productMainImgModule .single-image.img-item'));
}

function dxmWmGetImageUrls() {
    return dxmWmGetImageCards()
        .map(card => card.querySelector('img.img-css')?.src)
        .filter(Boolean);
}

/**
 * 依次点掉所有图片的删除按钮。每删一张，DOM会重排，
 * 所以每轮都重新查询"当前第一张"的删除按钮坐标，不能预先算好一批坐标。
 * 点击复用 auto-publish.js 已有的 window.dxmTrustedMouseClick（真实鼠标
 * 事件，走 background 的 trusted_mouse_click），不重复造轮子。
 */
// 点完删除后不再死等固定400ms——改成轮询"卡片数量真的减少了没有"，
// 页面反应快就立刻点下一张，反应慢也有上限兜底，不会无限等。
async function dxmWmWaitForCardCountBelow(previousCount, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (dxmWmGetImageCards().length < previousCount) return true;
        await new Promise(res => setTimeout(res, 60));
    }
    return false;
}

async function dxmWmClearAllImages() {
    // 这一步全靠真实点击删除按钮、等页面自己反应，跟写回主图那步一样
    // 依赖页面处于真正渲染状态——先抢占前台焦点，避免标签页在后台时
    // 页面反应变慢（表现为"删除很慢"甚至卡住）。
    await dxmWmBgMessage({ action: 'claim_tab_focus' });
    try {
        let guard = 0;
        while (guard < 100) {
            guard += 1;
            const cards = dxmWmGetImageCards();
            if (!cards.length) break;
            const delBtn = cards[0].querySelector('.icon_delete');
            if (!delBtn) break;
            const beforeCount = cards.length;
            const r = delBtn.getBoundingClientRect();
            // 提速：先试普通点击——删除按钮就在卡片上、没有被别的元素盖住，
            // 普通点击通常直接生效，省掉可信点击那套(attach debugger + 14步
            // 模拟鼠标移动 + detach，每张都要来一遍，是"删图慢"的主因)。
            // 普通点击没让卡片数减少，再退回可信点击兜底。
            delBtn.click();
            let dropped = await dxmWmWaitForCardCountBelow(beforeCount, 900);
            if (!dropped) {
                await window.dxmTrustedMouseClick(r);
                dropped = await dxmWmWaitForCardCountBelow(beforeCount);
            }
            if (!dropped) {
                // 两种点击都没生效，跳出让下面的"还剩N张"抛错，不空转100轮。
                break;
            }
        }
    } finally {
        await dxmWmBgMessage({ action: 'release_tab_focus' }).catch(() => {});
    }
    const remaining = dxmWmGetImageCards().length;
    if (remaining > 0) {
        throw new Error(`清空图片未完全成功，还剩 ${remaining} 张`);
    }
}

// ---------- 写回：真实"选择图片->本地图片->系统文件框"链路 + 严格轮询验证 ----------
//
// 实测过两种更省事的写法都不可靠：
// 1. 直接注入 #localFileUploadInp（即使补 multiple + input/change 事件）
//    ——店小秘的上传逻辑不接收，清空原图后写回失败、图片变0张。
// 2. 只信"文件已写入"的返回值——写入成功不代表店小秘真的处理完、
//    渲染出了新图片。
// 所以改成完整模拟用户手动操作："选择图片"->"本地图片"->真实点击
// 弹出系统文件框->CDP拦截注入多文件（由background的
// uploadFilesViaRealChooser完成），且只信真实渲染出来的图片卡片状态
// （数量、解码完成、无上传中/失败标记），连续两次稳定才算成功。

function dxmWmImagesLookUploaded(expectedCount) {
    const cards = dxmWmGetImageCards();
    if (cards.length !== expectedCount) return false;
    return cards.every(card => {
        const img = card.querySelector('img.img-css');
        if (!img || !img.src) return false;
        if (img.complete === false) return false;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) return false;
        if (card.querySelector('[class*="upload"][class*="ing"], [class*="loading"], [class*="error"], [class*="fail"]')) {
            return false;
        }
        return true;
    });
}

async function dxmWmWaitForUploadedImages(expectedCount, timeoutMs = 30000) {
    const start = Date.now();
    let stableHits = 0;
    while (Date.now() - start < timeoutMs) {
        if (dxmWmImagesLookUploaded(expectedCount)) {
            stableHits += 1;
            if (stableHits >= 2) return true;
        } else {
            stableHits = 0;
        }
        await new Promise(res => setTimeout(res, 500));
    }
    return false;
}

async function dxmWmUploadAllLocalFiles(filePaths) {
    await dxmWmBgMessage({
        action: 'upload_via_real_chooser',
        filePaths,
        timeoutMs: 15000
    });
    const ok = await dxmWmWaitForUploadedImages(filePaths.length, 30000);
    if (!ok) {
        throw new Error(
            `写回图片未能在超时前确认成功：期望 ${filePaths.length} 张，` +
            `当前页面图片卡片状态未达到稳定，请检查页面确认实际结果`
        );
    }
}

// ---------- 并发控制：限并发跑多张图，而不是一张等一张 ----------
//
// 每张图的检测(云视觉/OCR)、消除(inpaint)、归档 全是独立的网络请求，
// 互不依赖，串行跑纯粹是浪费时间——大头耗时都在等云端/店小秘接口
// 响应，本地CPU几乎不用干活。改成并发池，同时跑 limit 张，跑完一张
// 立刻补下一张，直到全部完成。结果数组按原始下标写入，顺序不受
// 完成快慢影响，最终写回商品图时还是保持原来的图片顺序。
// 并发数不设太高是为了别把店小秘接口打出风控/限流。

async function dxmWmMapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const current = nextIndex;
            nextIndex += 1;
            results[current] = await mapper(items[current], current);
        }
    };
    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

// ---------- 主入口：供 auto-publish.js 调用 ----------

// 读取"水印消除AI"里配置的检测模式开关（存 chrome.storage.local）。
// 默认 mixed/always，跟改开关前的行为一致。
async function dxmWmReadRunConfig() {
    try {
        const data = await new Promise(resolve =>
            chrome.storage.local.get(['dxmWmRunConfig'], r => resolve(r || {}))
        );
        const cfg = data.dxmWmRunConfig || {};
        const detectionMode = ['ocr', 'mixed', 'model'].includes(cfg.detectionMode) ? cfg.detectionMode : 'mixed';
        const mixedTrigger = ['always', 'ocr_miss'].includes(cfg.mixedTrigger) ? cfg.mixedTrigger : 'always';
        return { detectionMode, mixedTrigger };
    } catch (error) {
        return { detectionMode: 'mixed', mixedTrigger: 'always' };
    }
}

window.dxmRunWatermarkForAutoPublish = async function (options = {}) {
    // 并发数固定 3，不从外部调高——之前调高把本地 python 打崩过(OCR/Pillow
    // 底层非线程安全)，这里锁死不让改。
    const { onProgress = null } = options;
    const concurrency = 3;
    const report = (stage, extra = {}) => onProgress?.({ stage, ...extra });

    const runConfig = await dxmWmReadRunConfig();
    const imageUrls = dxmWmGetImageUrls();
    if (!imageUrls.length) throw new Error('当前商品没有可处理的产品图片');
    console.log(`[dxm-watermark] 共 ${imageUrls.length} 张主图待处理，并发数 ${concurrency}，检测模式 ${runConfig.detectionMode}/${runConfig.mixedTrigger}`);
    report('start', { total: imageUrls.length });

    const results = await dxmWmMapWithConcurrency(imageUrls, concurrency, (imageUrl, i) =>
        dxmWmProcessSingleImage(imageUrl, {
            ...options,
            imageIndex: i,
            imageCount: imageUrls.length,
            detectionMode: runConfig.detectionMode,
            mixedTrigger: runConfig.mixedTrigger
        })
    );

    const localFiles = [];
    let excludedCount = 0;
    for (const filename of results) {
        if (filename === null) {
            excludedCount += 1;
        } else {
            localFiles.push(filename);
        }
    }

    if (excludedCount > 0) {
        console.log(`[dxm-watermark] ${excludedCount} 张图被判定为宣传文字/展会图或水印无法可靠消除，已跳过不上传`);
    }
    // 少于这个数量的可用主图，判定这个商品的数据本身有问题（比如水印
    // 是压在商品本体上的复杂居中水印、消除不了，导致大部分主图都被
    // 排除），不值得继续走完整个发布流程——在清空原图/写回之前就
    // 中止，原图完全没被动过，商品状态是安全的。抛出的错误带
    // DXM_PRODUCT_INVALID_TOO_FEW_IMAGES 这个code，auto-publish.js
    // 那边会识别这个code，走"标记无效+自动关窗口"，不是走"弹窗暂停"。
    const DXM_MIN_USABLE_MAIN_IMAGES = 2;
    if (localFiles.length < DXM_MIN_USABLE_MAIN_IMAGES) {
        const error = new Error(
            `可用主图只剩 ${localFiles.length} 张（原有 ${imageUrls.length} 张，` +
            `${excludedCount} 张因水印无法可靠消除或违规内容被排除），商品数据判定无效`
        );
        error.code = 'DXM_PRODUCT_INVALID_TOO_FEW_IMAGES';
        if (typeof globalThis !== 'undefined' && globalThis.DxmError) {
          var classified = globalThis.DxmError.CLASSIFY(error);
          error._classified = classified;
        }
        throw error;
    }

    console.log('[dxm-watermark] 全部处理完成，开始清空原图并批量写回');
    report('clearing');
    await dxmWmClearAllImages();

    console.log(`[dxm-watermark] 一次性写回 ${localFiles.length} 张（跳过 ${excludedCount} 张）:`, localFiles);
    report('uploading', { count: localFiles.length });
    await dxmWmUploadAllLocalFiles(localFiles);

    const finalCount = dxmWmGetImageCards().length;
    console.log(`[dxm-watermark] 写回完成，当前图片数: ${finalCount}（应等于 ${localFiles.length}）`);

    if (finalCount !== localFiles.length) {
        console.warn('[dxm-watermark] ⚠️ 写回数量对不上，可能是批量上传没有全部生效，建议检查页面确认');
    }

    report('finished', { processedCount: localFiles.length, excludedCount, finalCount });
    return { processedCount: localFiles.length, excludedCount, finalCount, localFiles };
};

console.log('[dxm-watermark] 去水印模块已加载（供自动发布流程调用 window.dxmRunWatermarkForAutoPublish）');

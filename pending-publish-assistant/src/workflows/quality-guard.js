/* 局部质量检查：inpaint后验证水印区域未被换成一坨色块 */

(function() {
  async function dxmVerifyInpaintQuality(originalBlob, resultBlob, boxes) {
    var origPromise = typeof createImageBitmap === 'function'
      ? createImageBitmap(originalBlob)
      : _bitmapFromBlob(originalBlob);
    var resultPromise = typeof createImageBitmap === 'function'
      ? createImageBitmap(resultBlob)
      : _bitmapFromBlob(resultBlob);

    var results = await Promise.all([origPromise, resultPromise]);
    var orig = results[0];
    var result = results[1];

    if (orig.width !== result.width || orig.height !== result.height) {
      var sizeErr = new Error('消除后尺寸异常：' + orig.width + 'x' + orig.height + ' → ' + result.width + 'x' + result.height);
      sizeErr.code = 'INPAINT_SIZE_MISMATCH';
      throw sizeErr;
    }

    var canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(result.width, result.height);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
    }
    var ctx = canvas.getContext('2d');
    ctx.drawImage(result, 0, 0);

    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var x = Math.max(0, Math.round(box.x));
      var y = Math.max(0, Math.round(box.y));
      var w = Math.max(1, Math.min(Math.round(box.width), result.width - x));
      var h = Math.max(1, Math.min(Math.round(box.height), result.height - y));
      var patch = ctx.getImageData(x, y, w, h);
      var variance = dxmPixelVariance(patch.data);
      if (variance < 5.0) {
        console.warn('[quality] 水印区域 (' + x + ',' + y + ' ' + w + 'x' + h + ') 方差 ' + variance.toFixed(1) + '，疑似消除过度');
        var err = new Error('消除后为纯色块（方差' + variance.toFixed(1) + '）');
        err.code = 'INPAINT_SOLID_BLOCK';
        throw err;
      }
    }
    return true;
  }

  function dxmPixelVariance(data) {
    var sum = 0, sumSq = 0, count = 0;
    for (var i = 0; i < data.length; i += 4) {
      var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      sum += gray;
      sumSq += gray * gray;
      count += 1;
    }
    if (count === 0) return 0;
    var mean = sum / count;
    return sumSq / count - mean * mean;
  }

  function _bitmapFromBlob(blob) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('图片解码失败')); };
      img.src = URL.createObjectURL(blob);
    });
  }

  async function dxmDegradationChain(originalBlob, boxes, error) {
    console.warn('[degradation] 进入降级链:', error?.message || error);
    var err = new Error('水印无法安全修复，排除');
    err.code = 'WATERMARK_UNREPAIRABLE';
    throw err;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.dxmVerifyInpaintQuality = dxmVerifyInpaintQuality;
    globalThis.dxmDegradationChain = dxmDegradationChain;
    globalThis.dxmPixelVariance = dxmPixelVariance;
  }
})();

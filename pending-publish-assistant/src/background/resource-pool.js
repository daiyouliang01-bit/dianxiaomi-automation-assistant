/* 全局资源队列：5个商品窗口通过 background.js 共享同一套 Worker 池 */

(function() {
  function DxmAsyncQueue(conf) {
    this.name = conf.name;
    this.workers = conf.workers;
    this.capacity = conf.capacity;
    this._active = 0;
    this._queue = [];
  }

  DxmAsyncQueue.prototype.run = function(fn, timeoutMs) {
    var self = this;
    timeoutMs = timeoutMs || 30000;

    if (self._active + self._queue.length >= self.workers + self.capacity) {
      var busyErr = new Error(self.name + ' 队列满载');
      busyErr.code = self.name.toUpperCase() + '_BUSY';
      return Promise.reject(busyErr);
    }

    var waitPromise = Promise.resolve();
    if (self._active >= self.workers) {
      waitPromise = new Promise(function(resolve) {
        self._queue.push(resolve);
      });
    }

    return waitPromise.then(function() {
      self._active += 1;
      var timer;

      function onDone() {
        self._active -= 1;
        if (self._queue.length) self._queue.shift()();
      }

      var race;
      if (timeoutMs > 0) {
        race = Promise.race([
          Promise.resolve().then(function() { return fn(); }),
          new Promise(function(_, reject) {
            timer = setTimeout(function() {
              reject(new Error(self.name + ' 执行超时 (' + timeoutMs + 'ms)'));
            }, timeoutMs);
          })
        ]);
      } else {
        race = Promise.resolve().then(function() { return fn(); });
      }

      return race.then(function(result) {
        clearTimeout(timer);
        onDone();
        return result;
      }, function(err) {
        clearTimeout(timer);
        onDone();
        throw err;
      });
    });
  };

  DxmAsyncQueue.prototype.getStatus = function() {
    return {
      name: this.name,
      active: this._active,
      queued: this._queue.length,
      workers: this.workers,
      capacity: this.capacity,
    };
  };

  var DXM_GLOBAL_QUEUES = Object.freeze({
    imageDownload: new DxmAsyncQueue({ name: 'image_download', workers: 4, capacity: 8 }),
    ocr:           new DxmAsyncQueue({ name: 'ocr', workers: 1, capacity: 4 }),
    inpaint:       new DxmAsyncQueue({ name: 'inpaint', workers: 1, capacity: 0 }),
    canvas:        new DxmAsyncQueue({ name: 'canvas', workers: 3, capacity: 6 }),
    stateWrite:    new DxmAsyncQueue({ name: 'state_write', workers: 1, capacity: 0 }),
  });

  if (typeof globalThis !== 'undefined') {
    globalThis.DxmAsyncQueue = DxmAsyncQueue;
    globalThis.DXM_GLOBAL_QUEUES = DXM_GLOBAL_QUEUES;
  }
})();

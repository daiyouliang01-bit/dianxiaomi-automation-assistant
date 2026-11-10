/* 熔断器：OCR 和云视觉各一个独立熔断器 */

(function() {
  function DxmCircuitBreaker(conf) {
    this.name = conf.name;
    this.failureThreshold = conf.failureThreshold || 3;
    this.cooldownMs = conf.cooldownMs || 60000;
    this._failures = 0;
    this._state = 'closed';
    this._openedAt = null;
  }

  DxmCircuitBreaker.prototype.isOpen = function() { return this._state === 'open'; };

  DxmCircuitBreaker.prototype.recordFailure = function() {
    this._failures += 1;
    if (this._failures >= this.failureThreshold) {
      this._state = 'open';
      this._openedAt = Date.now();
    }
  };

  DxmCircuitBreaker.prototype.recordSuccess = function() {
    this._failures = 0;
    this._state = 'closed';
  };

  DxmCircuitBreaker.prototype.attemptReset = function() {
    if (this._state !== 'open') return true;
    if (Date.now() - this._openedAt >= this.cooldownMs) {
      this._state = 'half-open';
      return true;
    }
    return false;
  };

  var DXM_CIRCUIT_BREAKERS = Object.freeze({
    ocr:         new DxmCircuitBreaker({ name: 'ocr', failureThreshold: 3, cooldownMs: 30000 }),
    cloudVision: new DxmCircuitBreaker({ name: 'cloud_vision', failureThreshold: 2, cooldownMs: 60000 }),
  });

  if (typeof globalThis !== 'undefined') {
    globalThis.DxmCircuitBreaker = DxmCircuitBreaker;
    globalThis.DXM_CIRCUIT_BREAKERS = DXM_CIRCUIT_BREAKERS;
  }
})();

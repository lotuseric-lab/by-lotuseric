/* BY LOTUSERIC Pine runtime primitives.
 * Deterministic bar context and series helpers; not a complete Pine evaluator.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByLotusericPineRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NA = null;
  function isNA(value) { return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value)); }
  function nz(value, replacement) { return isNA(value) ? (replacement === undefined ? 0 : replacement) : value; }

  class PineSeries {
    constructor(values) {
      if (!Array.isArray(values)) throw new TypeError("PineSeries values must be an array.");
      this.values = values.slice();
    }
    get length() { return this.values.length; }
    current() { return this.at(0); }
    at(offset) {
      if (!Number.isInteger(offset) || offset < 0) throw new RangeError("History offset must be a non-negative integer.");
      const index = this.values.length - 1 - offset;
      return index < 0 ? NA : this.values[index];
    }
    push(value) { this.values.push(value); return value; }
    toArray() { return this.values.slice(); }
  }

  function validateBars(bars) {
    if (!Array.isArray(bars)) throw new TypeError("Bars must be an array.");
    let previousTime = -Infinity;
    return bars.map((bar, index) => {
      if (!bar || typeof bar !== "object") throw new TypeError("Invalid bar at index " + index + ".");
      const normalized = {};
      for (const key of ["open", "high", "low", "close", "volume"]) {
        const value = Number(bar[key]);
        if (!Number.isFinite(value)) throw new TypeError("Invalid " + key + " at bar " + index + ".");
        normalized[key] = value;
      }
      const time = Number(bar.time);
      if (!Number.isFinite(time) || time < previousTime) throw new TypeError("Bar time must be finite and non-decreasing at index " + index + ".");
      previousTime = time;
      normalized.time = time;
      return Object.freeze(normalized);
    });
  }

  class PineRuntimeContext {
    constructor(bars) {
      this.bars = validateBars(bars);
      this.index = -1;
      this.series = Object.create(null);
      this.persistent = Object.create(null);
    }
    get bar_index() { return this.index; }
    get bar() { return this.index < 0 ? null : this.bars[this.index]; }
    advance() {
      if (this.index + 1 >= this.bars.length) return false;
      this.index++;
      return true;
    }
    read(name, offset) {
      if (["open", "high", "low", "close", "volume", "time"].includes(name)) {
        const barIndex = this.index - (offset || 0);
        return barIndex < 0 || barIndex >= this.bars.length ? NA : this.bars[barIndex][name];
      }
      if (name === "bar_index") return this.index < 0 ? NA : this.index - (offset || 0);
      const series = this.series[name];
      return series ? series.at(offset || 0) : NA;
    }
    write(name, value) {
      if (!this.series[name]) this.series[name] = new PineSeries([]);
      return this.series[name].push(value);
    }
    var(name, initializer) {
      if (!Object.prototype.hasOwnProperty.call(this.persistent, name)) {
        this.persistent[name] = typeof initializer === "function" ? initializer() : initializer;
      }
      return this.persistent[name];
    }
    setVar(name, value) { this.persistent[name] = value; return value; }
  }

  function sma(values, length) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError("SMA length must be a positive integer.");
    if (!Array.isArray(values) || values.length < length) return NA;
    const window = values.slice(-length);
    if (window.some(isNA)) return NA;
    return window.reduce((sum, value) => sum + Number(value), 0) / length;
  }

  function ema(values, length, previous) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError("EMA length must be a positive integer.");
    if (!Array.isArray(values) || values.length === 0 || isNA(values[values.length - 1])) return NA;
    const alpha = 2 / (length + 1);
    const current = Number(values[values.length - 1]);
    if (isNA(previous)) return sma(values, length);
    return alpha * current + (1 - alpha) * Number(previous);
  }

  function rma(values, length, previous) {
    if (!Number.isInteger(length) || length < 1) throw new RangeError("RMA length must be a positive integer.");
    if (!Array.isArray(values) || values.length === 0 || isNA(values[values.length - 1])) return NA;
    if (isNA(previous)) return sma(values, length);
    return (Number(previous) * (length - 1) + Number(values[values.length - 1])) / length;
  }

  return { NA, isNA, nz, PineSeries, PineRuntimeContext, sma, ema, rma, validateBars };
});

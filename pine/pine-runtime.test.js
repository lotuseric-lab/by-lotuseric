const assert = require("node:assert/strict");
const { NA, isNA, nz, PineSeries, PineRuntimeContext, sma, ema, rma } = require("./pine-runtime.js");

assert.equal(isNA(NA), true);
assert.equal(nz(NA), 0);
assert.equal(nz(NA, 7), 7);
const series = new PineSeries([10, 20, 30]);
assert.equal(series.current(), 30);
assert.equal(series.at(1), 20);
assert.equal(series.at(4), NA);
assert.throws(() => series.at(-1), RangeError);

const bars = [
  { time: 1000, open: 1, high: 3, low: 0, close: 2, volume: 10 },
  { time: 2000, open: 2, high: 4, low: 1, close: 3, volume: 20 }
];
const ctx = new PineRuntimeContext(bars);
assert.equal(ctx.advance(), true);
assert.equal(ctx.bar_index, 0);
assert.equal(ctx.read("close"), 2);
assert.equal(ctx.read("close", 1), NA);
ctx.write("signal", 1);
assert.equal(ctx.read("signal"), 1);
assert.equal(ctx.var("counter", 0), 0);
ctx.setVar("counter", ctx.var("counter") + 1);
assert.equal(ctx.advance(), true);
assert.equal(ctx.read("close"), 3);
assert.equal(ctx.read("close", 1), 2);
assert.equal(ctx.read("bar_index"), 1);
assert.equal(ctx.var("counter", 99), 1);
assert.equal(ctx.advance(), false);
assert.equal(sma([1, 2, 3], 3), 2);
assert.equal(sma([1, NA, 3], 3), NA);
assert.equal(ema([2, 4, 6], 3, 4), 5);
assert.equal(rma([2, 4, 6], 3, 4), 4 + 2 / 3);
assert.throws(() => new PineRuntimeContext([{ time: 1, open: 1, high: 2, low: 0, close: NaN, volume: 1 }]), /Invalid close/);
assert.throws(() => new PineRuntimeContext([
  { time: 2, open: 1, high: 2, low: 0, close: 1, volume: 1 },
  { time: 1, open: 1, high: 2, low: 0, close: 1, volume: 1 }
]), /non-decreasing/);
console.log("Pine runtime primitive tests: OK");

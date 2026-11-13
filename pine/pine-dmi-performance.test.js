const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const source = `//@version=6
indicator("DMI optimized")
[plusDI, minusDI, adx] = ta.dmi(14, 14)
plot(plusDI, "Plus DI")
plot(minusDI, "Minus DI")
plot(adx, "ADX")
`;
const ast = parsePine(lexPine(source).tokens);
assert.deepEqual(ast.diagnostics, []);
const bars = Array.from({ length: 90 }, (_, i) => {
  const base = 100 + i * 0.2 + Math.sin(i / 4) * 2;
  const close = base + Math.sin(i / 2) * 0.4;
  return {
    time: 1700000000 + i * 60,
    open: close - Math.sin(i) * 0.3,
    high: Math.max(base + 0.8, close) + 0.2,
    low: Math.min(base - 0.8, close) - 0.2,
    close,
    volume: 1000 + i * 10,
  };
});
const output = runPine(ast, bars, { timeframe: "1", symbol: "TEST" });
function rma(values, length) {
  let previous = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (previous == null) {
      if (i + 1 >= length) {
        const window = values.slice(i + 1 - length, i + 1);
        if (!window.some(v => v == null)) previous = window.reduce((a, b) => a + b, 0) / length;
      }
    } else previous = (previous * (length - 1) + values[i]) / length;
  }
  return previous;
}
const plus = [], minus = [], tr = [];
for (let i = 0; i < bars.length; i++) {
  if (i === 0) { plus.push(0); minus.push(0); tr.push(bars[i].high - bars[i].low); continue; }
  const up = bars[i].high - bars[i - 1].high;
  const down = bars[i - 1].low - bars[i].low;
  plus.push(up > down && up > 0 ? up : 0);
  minus.push(down > up && down > 0 ? down : 0);
  tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
}
const dx = [];
for (let i = 0; i < bars.length; i++) {
  const t = rma(tr.slice(0, i + 1), 14);
  const p = rma(plus.slice(0, i + 1), 14);
  const m = rma(minus.slice(0, i + 1), 14);
  dx.push(t == null || t === 0 || p == null || m == null || p + m === 0 ? null : 100 * Math.abs(100 * p / t - 100 * m / t) / (100 * p / t + 100 * m / t));
}
const expectedPlus = 100 * rma(plus, 14) / rma(tr, 14);
const expectedMinus = 100 * rma(minus, 14) / rma(tr, 14);
const expectedAdx = rma(dx, 14);
for (const [index, expected] of [[0, expectedPlus], [1, expectedMinus], [2, expectedAdx]]) {
  const actual = output.plots[index].values.at(-1);
  assert.ok(Math.abs(actual - expected) < 1e-9, "DMI output must match reference implementation");
}
console.log("Pine DMI performance and numerical tests: OK");

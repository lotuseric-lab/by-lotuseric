import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const frontend = require("../pine/pine-frontend.js");
const parser = require("../pine/pine-parser.js");
const interpreter = require("../pine/pine-interpreter.js");

const fixturePath = new URL("./fixtures/AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine", import.meta.url);
const fixture = await readFile(fixturePath, "utf8");
const audit = frontend.analyzePineSource(fixture);

assert.equal(audit.version, 6, "V14 fixture must declare Pine v6");
assert.equal(audit.diagnostics.length, 0, "V14 fixture must have no lexical/version diagnostics");
for (const call of [
  "ta.ema", "ta.rsi", "ta.dmi", "ta.atr", "ta.pivothigh", "ta.pivotlow",
  "request.security", "array.new_box", "box.new", "box.delete",
  "label.new", "table.new", "table.cell", "plotshape", "alertcondition"
]) {
  assert.ok(audit.calls[call] > 0, `V14 fixture should exercise ${call}`);
}

const source = `//@version=6
indicator("BY LOTUSERIC own-engine regression", overlay=true)
ema9 = ta.ema(close, 9)
rsi14 = ta.rsi(close, 14)
[pdi, mdi, adx] = ta.dmi(14, 14)
stochK = ta.stoch(close, high, low, 9)
pivotH = ta.pivothigh(high, 2, 2)
pivotL = ta.pivotlow(low, 2, 2)
plot(ema9, title="EMA 9")
plot(rsi14, title="RSI 14")
plot(adx, title="ADX")
plot(stochK, title="Stochastic K")
plot(pivotH, title="Pivot High")
plot(pivotL, title="Pivot Low")
`;

const lexed = frontend.lexPine(source);
assert.equal(lexed.diagnostics.length, 0, "Regression fixture must lex cleanly");
const ast = parser.parsePine(lexed.tokens);
assert.equal(ast.diagnostics.length, 0, "Regression fixture must parse cleanly");

const bars = Array.from({ length: 180 }, (_, i) => {
  const wave = Math.sin(i / 5) * 1.8 + Math.sin(i / 13) * 0.7;
  const close = 100 + i * 0.025 + wave;
  return {
    time: 1_790_000_000 + i * 300,
    open: close - Math.sin(i) * 0.2,
    high: close + 0.6 + Math.abs(Math.sin(i / 3)) * 0.25,
    low: close - 0.6 - Math.abs(Math.cos(i / 4)) * 0.25,
    close,
    volume: 1000 + (i % 11) * 23
  };
});

const output = interpreter.runPine(ast, bars, { symbol: "BTCUSDT", timeframe: "5" });
assert.equal(output.barCount, bars.length);
assert.equal(output.plots.length, 6, "All six regression plots must be produced");
for (const plot of output.plots) {
  assert.equal(plot.values.length, bars.length, `${plot.title} must align to all input bars`);
  assert.ok(plot.values.some(v => typeof v === "number" && Number.isFinite(v)),
    `${plot.title} must produce finite values after warm-up`);
}

console.log(JSON.stringify({
  status: "PASS",
  fixture: "AL_ONAY_SCALP_V14_ERKEN_SAT_GUNCEL.pine",
  pineVersion: audit.version,
  v14CallSitesChecked: Object.keys(audit.calls).length,
  ownEngineRegression: {
    bars: output.barCount,
    plots: output.plots.map(p => ({
      title: p.title,
      finiteValues: p.values.filter(v => typeof v === "number" && Number.isFinite(v)).length
    }))
  }
}, null, 2));

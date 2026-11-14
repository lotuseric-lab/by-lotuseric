const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend");
const { parsePine } = require("./pine-parser");
const { runPine } = require("./pine-interpreter");

const bars = [];
let close = 75;
for (let i = 0; i < 260; i++) {
  const open = close;
  close += Math.sin(i / 8) * 1.3 + Math.cos(i / 19) * 0.4 + (i % 29 < 15 ? 0.16 : -0.12);
  bars.push({
    time: 1700000000 + i * 300,
    open,
    high: Math.max(open, close) + 0.3 + (i % 4) * 0.04,
    low: Math.min(open, close) - 0.25 - (i % 5) * 0.025,
    close,
    volume: 500 + (i * 37) % 900
  });
}

const source = `//@version=6
indicator("TA statistics batch")
wma = ta.wma(close, 20)
vwma = ta.vwma(close, 20)
cci = ta.cci(hlc3, 20)
mfi = ta.mfi(hlc3, 14)
roc = ta.roc(close, 10)
pnr = ta.percentile_nearest_rank(close, 20, 75)
pli = ta.percentile_linear_interpolation(close, 20, 75)
corr = ta.correlation(close, volume, 20)
plot(wma, "WMA")
plot(vwma, "VWMA")
plot(cci, "CCI")
plot(mfi, "MFI")
plot(roc, "ROC")
plot(pnr, "PNR")
plot(pli, "PLI")
plot(corr, "CORR")`;
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, []);
const parsed = parsePine(lexed.tokens);
assert.deepEqual(parsed.diagnostics, []);
const result = runPine(parsed, bars);
assert.equal(result.plots.length, 8);

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const counts = Array(8).fill(0);
const maxError = Array(8).fill(0);

for (let i = 0; i < bars.length; i++) {
  const window = bars.slice(Math.max(0, i - 19), i + 1);
  const n = window.length;
  const closes = window.map(bar => bar.close);
  const volumes = window.map(bar => bar.volume);
  const typical = window.map(bar => (bar.high + bar.low + bar.close) / 3);
  const expected = [];

  expected[0] = n === 20
    ? closes.reduce((sum, value, index) => sum + value * (index + 1), 0) / 210
    : NaN;
  expected[1] = n === 20
    ? closes.reduce((sum, value, index) => sum + value * volumes[index], 0) / volumes.reduce((sum, value) => sum + value, 0)
    : NaN;

  const mean = average(typical);
  const deviation = average(typical.map(value => Math.abs(value - mean)));
  expected[2] = n === 20 && deviation ? (typical.at(-1) - mean) / (0.015 * deviation) : NaN;

  if (i >= 14) {
    let positive = 0;
    let negative = 0;
    for (let k = i - 13; k <= i; k++) {
      const flow = ((bars[k].high + bars[k].low + bars[k].close) / 3) * bars[k].volume;
      const current = bars[k].high + bars[k].low + bars[k].close;
      const previous = bars[k - 1].high + bars[k - 1].low + bars[k - 1].close;
      if (current > previous) positive += flow;
      else if (current < previous) negative += flow;
    }
    expected[3] = negative === 0 ? 100 : 100 - 100 / (1 + positive / negative);
  } else expected[3] = NaN;

  expected[4] = i >= 10 && bars[i - 10].close !== 0
    ? (bars[i].close - bars[i - 10].close) / bars[i - 10].close * 100
    : NaN;

  const sorted = closes.slice().sort((a, b) => a - b);
  expected[5] = n === 20 ? sorted[Math.ceil(0.75 * n) - 1] : NaN;
  if (n === 20) {
    const position = 0.75 * (n - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    expected[6] = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  } else expected[6] = NaN;

  if (n === 20) {
    const meanClose = average(closes);
    const meanVolume = average(volumes);
    let covariance = 0;
    let varianceClose = 0;
    let varianceVolume = 0;
    for (let j = 0; j < n; j++) {
      covariance += (closes[j] - meanClose) * (volumes[j] - meanVolume);
      varianceClose += (closes[j] - meanClose) ** 2;
      varianceVolume += (volumes[j] - meanVolume) ** 2;
    }
    expected[7] = varianceClose && varianceVolume
      ? covariance / Math.sqrt(varianceClose * varianceVolume)
      : NaN;
  } else expected[7] = NaN;

  for (let series = 0; series < 8; series++) {
    const actual = result.plots[series].values[i];
    if (!Number.isFinite(expected[series])) continue;
    assert.ok(Number.isFinite(actual), result.plots[series].title + " missing at " + i);
    const error = Math.abs(actual - expected[series]);
    maxError[series] = Math.max(maxError[series], error);
    counts[series]++;
  }
}

for (let i = 0; i < 8; i++) {
  assert.ok(maxError[i] < 1e-10, result.plots[i].title + " numerical mismatch");
}
console.log("WMA, VWMA, CCI, MFI, ROC, nearest-rank percentile, interpolated percentile and correlation: all independent reference checks passed.");
console.log(result.plots.map((plot, i) => plot.title + ": " + counts[i] + " points, max error " + maxError[i].toExponential(2)).join("\n"));

const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend");
const { parsePine } = require("./pine-parser");
const { runPine } = require("./pine-interpreter");

const bars = [];
let close = 60;
for (let i = 0; i < 220; i++) {
  const open = close;
  close += Math.sin(i / 6) * 0.9 + Math.cos(i / 17) * 0.25 + (i % 21 < 10 ? 0.11 : -0.08);
  bars.push({
    time: 1700000000 + i * 300,
    open,
    high: Math.max(open, close) + 0.2 + (i % 4) * 0.03,
    low: Math.min(open, close) - 0.18 - (i % 3) * 0.02,
    close,
    volume: 300 + (i * 29) % 700
  });
}

const source = `//@version=6
indicator("TA window functions")
rma = ta.rma(close, 14)
dev = ta.dev(close, 14)
lin = ta.linreg(close, 20, 0)
cum = ta.cum(volume)
hb = ta.highestbars(high, 20)
lb = ta.lowestbars(low, 20)
sd = ta.stdev(close, 20)
vr = ta.variance(close, 20)
plot(rma, "RMA")
plot(dev, "DEV")
plot(lin, "LINREG")
plot(cum, "CUM")
plot(hb, "HB")
plot(lb, "LB")
plot(sd, "STDEV")
plot(vr, "VAR")`;
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, []);
const parsed = parsePine(lexed.tokens);
assert.deepEqual(parsed.diagnostics, []);
const result = runPine(parsed, bars);
assert.equal(result.plots.length, 8);

const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const counts = Array(8).fill(0);
const maxError = Array(8).fill(0);
let rma = NaN;
let cumulativeVolume = 0;

for (let i = 0; i < bars.length; i++) {
  cumulativeVolume += bars[i].volume;
  if (!Number.isFinite(rma)) {
    if (i >= 13) rma = average(bars.slice(i - 13, i + 1).map(bar => bar.close));
  } else rma = (rma * 13 + bars[i].close) / 14;

  const window = bars.slice(Math.max(0, i - 19), i + 1);
  const closes = window.map(bar => bar.close);
  const highs = window.map(bar => bar.high);
  const lows = window.map(bar => bar.low);
  const expected = [];
  expected[0] = i >= 13 ? rma : NaN;

  const last14 = bars.slice(Math.max(0, i - 13), i + 1).map(bar => bar.close);
  const mean14 = average(last14);
  expected[1] = i >= 13 ? average(last14.map(value => Math.abs(value - mean14))) : NaN;

  if (window.length === 20) {
    const mean = average(closes);
    const xMean = 9.5;
    let covariance = 0;
    let varianceX = 0;
    for (let j = 0; j < 20; j++) {
      covariance += (j - xMean) * (closes[j] - mean);
      varianceX += (j - xMean) ** 2;
    }
    expected[2] = mean + covariance / varianceX * (19 - xMean);
  } else expected[2] = NaN;

  expected[3] = cumulativeVolume;
  expected[4] = window.length === 20 ? highs.lastIndexOf(Math.max(...highs)) - 19 : NaN;
  expected[5] = window.length === 20 ? lows.lastIndexOf(Math.min(...lows)) - 19 : NaN;

  if (window.length === 20) {
    const mean = average(closes);
    const variance = average(closes.map(value => (value - mean) ** 2));
    expected[6] = Math.sqrt(variance);
    expected[7] = variance;
  } else {
    expected[6] = NaN;
    expected[7] = NaN;
  }

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
console.log("RMA, DEV, LINREG, CUM, highestbars, lowestbars, STDEV and variance: independent reference checks passed.");
console.log(result.plots.map((plot, i) => plot.title + ": " + counts[i] + " points, max error " + maxError[i].toExponential(2)).join("\n"));

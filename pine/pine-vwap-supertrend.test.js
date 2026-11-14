const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend");
const { parsePine } = require("./pine-parser");
const { runPine } = require("./pine-interpreter");

function execute(source, bars) {
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, []);
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, []);
  return runPine(parsed, bars);
}

function makeBars(count = 180) {
  const bars = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const day = Math.floor(i / 48);
    const minute = (i % 48) * 30;
    const time = Date.UTC(2026, 10, 10 + day, 0, minute) / 1000;
    const open = close;
    close += Math.sin(i / 7) * 1.1 + (i % 23 < 12 ? 0.18 : -0.13);
    bars.push({
      time,
      open,
      high: Math.max(open, close) + 0.4 + (i % 4) * 0.05,
      low: Math.min(open, close) - 0.35 - (i % 3) * 0.04,
      close,
      volume: 100 + i * 3
    });
  }
  return bars;
}

function referenceDailyVwap(bars, index, anchorIndex = null) {
  const day = Math.floor(bars[index].time / 86400);
  let start = anchorIndex === null ? index : anchorIndex;
  if (anchorIndex === null) {
    while (start > 0 && Math.floor(bars[start - 1].time / 86400) === day) start--;
  }
  let pv = 0;
  let volume = 0;
  for (let i = start; i <= index; i++) {
    const price = (bars[i].high + bars[i].low + bars[i].close) / 3;
    pv += price * bars[i].volume;
    volume += bars[i].volume;
  }
  return pv / volume;
}

function referenceSupertrend(bars, factor, period) {
  const tr = bars.map((bar, i) => i === 0
    ? bar.high - bar.low
    : Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - bars[i - 1].close),
      Math.abs(bar.low - bars[i - 1].close)
    ));
  const atr = Array(bars.length).fill(NaN);
  let rma = NaN;
  for (let i = 0; i < tr.length; i++) {
    if (!Number.isFinite(rma)) {
      if (i + 1 >= period) {
        rma = tr.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period;
        atr[i] = rma;
      }
    } else {
      rma = (rma * (period - 1) + tr[i]) / period;
      atr[i] = rma;
    }
  }

  let finalUpper = NaN;
  let finalLower = NaN;
  let direction = 1;
  let trend = NaN;
  const values = [];
  const directions = [];
  for (let i = 0; i < bars.length; i++) {
    if (!Number.isFinite(atr[i])) {
      values.push(NaN);
      directions.push(NaN);
      continue;
    }
    const mid = (bars[i].high + bars[i].low) / 2;
    const upper = mid + factor * atr[i];
    const lower = mid - factor * atr[i];
    const previousClose = i ? bars[i - 1].close : NaN;
    const nextUpper = !Number.isFinite(finalUpper) || upper < finalUpper ||
      (Number.isFinite(previousClose) && previousClose > finalUpper) ? upper : finalUpper;
    const nextLower = !Number.isFinite(finalLower) || lower > finalLower ||
      (Number.isFinite(previousClose) && previousClose < finalLower) ? lower : finalLower;

    if (!Number.isFinite(trend)) {
      direction = 1;
      trend = nextUpper;
    } else if (direction === 1) {
      direction = bars[i].close > nextUpper ? -1 : 1;
      trend = direction === -1 ? nextLower : nextUpper;
    } else {
      direction = bars[i].close < nextLower ? 1 : -1;
      trend = direction === -1 ? nextLower : nextUpper;
    }
    finalUpper = nextUpper;
    finalLower = nextLower;
    values.push(trend);
    directions.push(direction);
  }
  return { values, directions };
}

const bars = makeBars();
const daily = execute(
  '//@version=6\nindicator("VWAP daily")\nv=ta.vwap(hlc3)\nplot(v,"VWAP")',
  bars
).plots[0].values;
for (let i = 0; i < bars.length; i++) {
  assert.ok(Math.abs(daily[i] - referenceDailyVwap(bars, i)) < 1e-10, "daily VWAP at " + i);
}

const anchored = execute(
  '//@version=6\nindicator("VWAP anchor")\na=bar_index==80 or bar_index==130\nv=ta.vwap(hlc3,a)\nplot(v,"Anchored VWAP")',
  bars
).plots[0].values;
for (let i = 0; i < bars.length; i++) {
  const start = i >= 130 ? 130 : i >= 80 ? 80 : 0;
  assert.ok(Math.abs(anchored[i] - referenceDailyVwap(bars, i, start)) < 1e-10, "anchored VWAP at " + i);
}

const supertrend = execute(
  '//@version=6\nindicator("Supertrend")\n[st,dir]=ta.supertrend(3.0,10)\nplot(st,"ST")\nplot(dir,"DIR")',
  bars
);
const expected = referenceSupertrend(bars, 3, 10);
let valid = 0;
for (let i = 0; i < bars.length; i++) {
  if (!Number.isFinite(expected.values[i])) continue;
  valid++;
  assert.ok(Math.abs(supertrend.plots[0].values[i] - expected.values[i]) < 1e-10, "Supertrend value at " + i);
  assert.equal(supertrend.plots[1].values[i], expected.directions[i], "Supertrend direction at " + i);
}

const alwaysReset = execute(
  '//@version=6\nindicator("VWAP constant true")\nv=ta.vwap(hlc3,true)\nplot(v,"VWAP")',
  bars
).plots[0].values;
const neverReset = execute(
  '//@version=6\nindicator("VWAP constant false")\nv=ta.vwap(hlc3,false)\nplot(v,"VWAP")',
  bars
).plots[0].values;
for (let i = 0; i < bars.length; i++) {
  const hlc3 = (bars[i].high + bars[i].low + bars[i].close) / 3;
  assert.ok(Math.abs(alwaysReset[i] - hlc3) < 1e-10, "constant true anchor at " + i);
  assert.ok(Math.abs(neverReset[i] - referenceDailyVwap(bars, i, 0)) < 1e-10, "constant false anchor at " + i);
}

console.log("VWAP daily + anchored: " + bars.length + " bars matched; Supertrend 3x10: " + valid + " bars matched.");

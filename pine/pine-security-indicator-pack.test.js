const assert = require('node:assert/strict');
const { lexPine } = require('./pine-frontend.js');
const { parsePine } = require('./pine-parser.js');
const { runPine } = require('./pine-interpreter.js');

const source = [
  '//@version=6',
  'indicator("MTF indicator pack", overlay=false)',
  'ema5 = request.security(syminfo.tickerid, "5", ta.ema(close, 3), lookahead=barmerge.lookahead_off)',
  'rsi5 = request.security(syminfo.tickerid, "5", ta.rsi(close, 3), lookahead=barmerge.lookahead_off)',
  '[macd5, signal5, hist5] = request.security(syminfo.tickerid, "5", ta.macd(close, 3, 5, 2), lookahead=barmerge.lookahead_off)',
  'ema15 = request.security(syminfo.tickerid, "15", ta.ema(close, 3), lookahead=barmerge.lookahead_off)',
  'rsi15 = request.security(syminfo.tickerid, "15", ta.rsi(close, 3), lookahead=barmerge.lookahead_off)',
  'plot(ema5, "EMA 5m")',
  'plot(rsi5, "RSI 5m")',
  'plot(macd5, "MACD 5m")',
  'plot(signal5, "Signal 5m")',
  'plot(hist5, "Histogram 5m")',
  'plot(ema15, "EMA 15m")',
  'plot(rsi15, "RSI 15m")'
].join('\n');

const bars = Array.from({ length: 180 }, (_, i) => ({
  time: 1700000100 + i * 60,
  open: 100 + i * 0.18 + Math.sin(i / 4) * 0.7,
  high: 102 + i * 0.18 + Math.sin(i / 4) * 0.7,
  low: 99 + i * 0.18 + Math.sin(i / 4) * 0.7,
  close: 100 + i * 0.18 + Math.sin(i / 3) * 1.4,
  volume: 100 + i * 2
}));

function execute(code, data, timeframe) {
  const lexed = lexPine(code);
  assert.deepEqual(lexed.diagnostics, []);
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, []);
  return runPine(parsed, data, { symbol: 'TEST', timeframe });
}

function aggregate(data, size) {
  const out = [];
  for (let i = 0; i + size <= data.length; i += size) {
    const group = data.slice(i, i + size);
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map(x => x.high)),
      low: Math.min(...group.map(x => x.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, x) => sum + x.volume, 0)
    });
  }
  return out;
}

const base = execute(source, bars, '1');
const htf5 = execute([
  '//@version=6',
  'indicator("HTF5 reference")',
  'plot(ta.ema(close, 3), "EMA")',
  'plot(ta.rsi(close, 3), "RSI")',
  '[macdLine, signalLine, histLine] = ta.macd(close, 3, 5, 2)',
  'plot(macdLine, "MACD")',
  'plot(signalLine, "Signal")',
  'plot(histLine, "Histogram")'
].join('\n'), aggregate(bars, 5), '5');
const htf15 = execute([
  '//@version=6',
  'indicator("HTF15 reference")',
  'plot(ta.ema(close, 3), "EMA")',
  'plot(ta.rsi(close, 3), "RSI")'
].join('\n'), aggregate(bars, 15), '15');

for (let i = 0; i < bars.length; i++) {
  const group5 = Math.floor((i + 1) / 5) - 1;
  const group15 = Math.floor((i + 1) / 15) - 1;
  for (let plotIndex = 0; plotIndex < 5; plotIndex++) {
    const expected = group5 < 0 ? null : htf5.plots[plotIndex].values[group5];
    assert.equal(base.plots[plotIndex].values[i], expected,
      '5m plot ' + plotIndex + ' at 1m bar ' + i);
  }
  for (let plotIndex = 0; plotIndex < 2; plotIndex++) {
    const expected = group15 < 0 ? null : htf15.plots[plotIndex].values[group15];
    assert.equal(base.plots[plotIndex + 5].values[i], expected,
      '15m plot ' + plotIndex + ' at 1m bar ' + i);
  }
}

console.log('MTF EMA/RSI/MACD: 5m and 15m values match independent aggregated-chart references; no unconfirmed HTF values leaked.');

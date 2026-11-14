const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lexPine } = require('./pine-frontend.js');
const { parsePine } = require('./pine-parser.js');
const { runPine } = require('./pine-interpreter.js');

const bars = Array.from({ length: 900 }, (_, i) => {
  const trend = 250 + i * 0.025;
  const wave = Math.sin(i / 9) * 3.2 + Math.sin(i / 31) * 1.4;
  const close = trend + wave;
  const open = trend + Math.sin((i - 1) / 9) * 3.2 + Math.sin((i - 1) / 31) * 1.4;
  return { time: 1700000100 + i * 60, open, high: Math.max(open, close) + 0.9,
    low: Math.min(open, close) - 0.9, close, volume: 1200 + (i % 23) * 93 };
});

const cases = [
  { file: 'volume-profile-regard-hodler-v6.pine', name: 'Volume Profile', marker: 'mozilla.org/MPL/2.0' },
  { file: 'mtf-checklist-eliasvictor-v6.pine', name: 'MTF Checklist Dashboard', marker: 'mozilla.org/MPL/2.0' }
];

for (const item of cases) {
  const source = fs.readFileSync(path.join(__dirname, 'community', item.file), 'utf8');
  assert.ok(source.includes(item.marker), item.name + ' must retain upstream license header');
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, [], item.name + ' lexer diagnostics');
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, [], item.name + ' parser diagnostics');
  let output;
  try {
    output = runPine(parsed, bars, { symbol: 'BTCUSDT', timeframe: '1' });
  } catch (error) {
    console.error('UNMODIFIED COMMUNITY INDICATOR FAILED:', item.name);
    console.error({ name: error.name, code: error.code, message: error.message, line: error.line, column: error.column });
    throw error;
  }
  assert.ok(output && typeof output === 'object', item.name + ' should return output');
  const visible = ['plots', 'lines', 'labels', 'boxes', 'polylines', 'tables']
    .reduce((n, key) => n + (output[key]?.length || 0), 0);
  assert.ok(visible > 0, item.name + ' should produce visible output');
  console.log('Unmodified community Pine v6 passed:', item.name,
    JSON.stringify({ bars: bars.length, plots: output.plots?.length || 0,
      lines: output.lines?.length || 0, labels: output.labels?.length || 0,
      boxes: output.boxes?.length || 0, tables: output.tables?.length || 0,
      alerts: output.alerts?.length || 0 }));

  if (item.name === 'MTF Checklist Dashboard') {
    const chartBars = [];
    for (let i = 0; i < bars.length; i += 5) {
      const chunk = bars.slice(i, i + 5);
      if (chunk.length !== 5) continue;
      chartBars.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(b => b.high)),
        low: Math.min(...chunk.map(b => b.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, b) => sum + b.volume, 0)
      });
    }
    const fiveMinuteOutput = runPine(parsed, chartBars, {
      symbol: 'BTCUSDT',
      timeframe: '5',
      lowerTimeframeData: { '1': bars }
    });
    assert.ok(fiveMinuteOutput.tables?.length > 0,
      'MTF dashboard must render on a 5m chart using supplied 1m intrabars');
    console.log('Unmodified community Pine v6 passed: MTF Dashboard on 5m chart',
      JSON.stringify({ chartBars: chartBars.length, lowerBars: bars.length,
        tables: fiveMinuteOutput.tables?.length || 0,
        alerts: fiveMinuteOutput.alerts?.length || 0 }));

    const fifteenMinuteBars = [];
    for (let i = 0; i < bars.length; i += 15) {
      const chunk = bars.slice(i, i + 15);
      if (chunk.length !== 15) continue;
      fifteenMinuteBars.push({
        time: chunk[0].time,
        open: chunk[0].open,
        high: Math.max(...chunk.map(b => b.high)),
        low: Math.min(...chunk.map(b => b.low)),
        close: chunk[chunk.length - 1].close,
        volume: chunk.reduce((sum, b) => sum + b.volume, 0)
      });
    }
    const fifteenMinuteOutput = runPine(parsed, fifteenMinuteBars, {
      symbol: 'BTCUSDT',
      timeframe: '15',
      lowerTimeframeData: { '1': bars }
    });
    assert.ok(fifteenMinuteOutput.tables?.length > 0,
      'MTF dashboard must derive its 5m request.security series from 1m intrabars on a 15m chart');
    console.log('Unmodified community Pine v6 passed: MTF Dashboard on 15m chart',
      JSON.stringify({ chartBars: fifteenMinuteBars.length, lowerBars: bars.length,
        tables: fifteenMinuteOutput.tables?.length || 0,
        alerts: fifteenMinuteOutput.alerts?.length || 0 }));
  }
}
console.log('Additional community Pine tests: ' + cases.length + ' indicators passed.');


// Independent MIT Volume Profile with POC/VAH/VAL and lower-timeframe request.
// The source fixture is retained unchanged apart from its attribution header.
{
  const file = 'volume-profile-poc-vah-val-mervinj3546-v6.pine';
  const name = 'Volume Profile POC/VAH/VAL';
  const source = fs.readFileSync(path.join(__dirname, 'community', file), 'utf8');
  assert.ok(source.includes('github.com/mervinj3546/volume-profile'), name + ' attribution');
  assert.ok(source.includes('License: MIT'), name + ' license attribution');
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, [], name + ' lexer diagnostics');
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, [], name + ' parser diagnostics');
  const lowerBars = Array.from({ length: 900 }, (_, i) => {
    const trend = 300 + i * 0.018;
    const wave = Math.sin(i / 7) * 2.1 + Math.cos(i / 19) * 0.8;
    const close = trend + wave;
    const open = trend + Math.sin((i - 1) / 7) * 2.1 + Math.cos((i - 1) / 19) * 0.8;
    return { time: 1700000100 + i * 60, open, high: Math.max(open, close) + 0.7,
      low: Math.min(open, close) - 0.7, close, volume: 800 + (i % 17) * 61 };
  });
  const chartBars = [];
  for (let i = 0; i < lowerBars.length; i += 5) {
    const chunk = lowerBars.slice(i, i + 5);
    chartBars.push({ time: chunk[0].time, open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)), low: Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, b) => sum + b.volume, 0) });
  }
  let output;
  try {
    output = runPine(parsed, chartBars, { symbol: 'BTCUSDT', timeframe: '5',
      lowerTimeframeData: { '1': lowerBars } });
  } catch (error) {
    console.error('UNMODIFIED COMMUNITY INDICATOR FAILED:', name);
    console.error({ name: error.name, code: error.code, message: error.message,
      line: error.line, column: error.column });
    throw error;
  }
  assert.ok(output.boxes?.length > 0, name + ' must draw volume profile rows');
  assert.equal(output.lines?.length, 3, name + ' must draw POC, VAH and VAL');
  console.log('Unmodified community Pine v6 passed:', name,
    JSON.stringify({ chartBars: chartBars.length, lowerBars: lowerBars.length,
      boxes: output.boxes.length, lines: output.lines.length }));
}

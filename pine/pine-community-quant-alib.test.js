const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lexPine } = require('./pine-frontend.js');
const { parsePine } = require('./pine-parser.js');
const { runPine } = require('./pine-interpreter.js');

const cases = [
  ['quant-alib-hma-v6.pine', 'HMA'],
  ['quant-alib-fisher-v6.pine', 'FISHER'],
  ['quant-alib-qqe-v6.pine', 'QQE']
];
const bars = Array.from({ length: 900 }, (_, i) => {
  const trend = 250 + i * 0.025;
  const wave = Math.sin(i / 9) * 3.2 + Math.sin(i / 31) * 1.4;
  const close = trend + wave;
  const open = trend + Math.sin((i - 1) / 9) * 3.2 + Math.sin((i - 1) / 31) * 1.4;
  return {
    time: 1700000100 + i * 300,
    open,
    high: Math.max(open, close) + 0.9,
    low: Math.min(open, close) - 0.9,
    close,
    volume: 1200 + (i % 23) * 93
  };
});

for (const [file, name] of cases) {
  const source = fs.readFileSync(path.join(__dirname, 'community', file), 'utf8');
  assert.ok(source.startsWith('// Licensed under the Apache License, Version 2.0'), name + ' must retain Apache license header');
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, [], name + ' lexer diagnostics');
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, [], name + ' parser diagnostics');
  let output;
  try {
    output = runPine(parsed, bars, { symbol: 'BTCUSDT', timeframe: '5' });
  } catch (error) {
    console.error('UNMODIFIED COMMUNITY INDICATOR FAILED:', name);
    console.error({ code: error.code, message: error.message, line: error.line, column: error.column });
    throw error;
  }
  assert.ok(output && output.plots?.length > 0, name + ' should produce plotted output');
  console.log('Unmodified QuanTAlib Pine v6 passed:', name, JSON.stringify({
    bars: bars.length,
    plots: output.plots.length,
    alerts: output.alerts?.length || 0
  }));
}
console.log('QuanTAlib community sample tests: ' + cases.length + ' indicators passed.');

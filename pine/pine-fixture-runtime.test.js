const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lexPine } = require('./pine-frontend.js');
const { parsePine } = require('./pine-parser.js');
const { runPine } = require('./pine-interpreter.js');

const fixtures = [
  'MONEY_TRADER_ADX.pine',
  'MONEY_TRADER_FIBO_TRADE_ARCHIVE.pine',
  'MONEY_TRADER_GOLDEN_ROSE.pine',
  'MONEY_TRADER_SUPPORT_RESISTANCE.pine',
  'MONEY_TRADER_WIZZARD.pine',
  'PROJEX_SCOPE_FIXED_CANDIDATE.pine',
  'sr-fib-di-integration.pine'
];

const bars = Array.from({ length: 500 }, (_, i) => ({
  time: 1700000100 + i * 300,
  open: 100 + i * 0.04 + Math.sin(i / 8),
  high: 102 + i * 0.04 + Math.sin(i / 8),
  low: 99 + i * 0.04 + Math.sin(i / 8),
  close: 100 + i * 0.04 + Math.sin(i / 5) * 1.7,
  volume: 1000 + (i % 17) * 130
}));

for (const file of fixtures) {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8');
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, [], file + ' lexer diagnostics');
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, [], file + ' parser diagnostics');
  const output = runPine(parsed, bars, { symbol: 'TEST', timeframe: '5' });
  assert.ok(output && Array.isArray(output.plots), file + ' should return plot output');
  const drawingCount = (output.lines?.length || 0)
    + (output.labels?.length || 0)
    + (output.boxes?.length || 0);
  assert.ok(output.plots.length + drawingCount > 0, file + ' should produce visible output');
  console.log('Pine fixture runtime OK:', file);
}

console.log('Pine fixture runtime smoke tests: ' + fixtures.length + ' scripts passed on 500 synthetic 5m bars.');

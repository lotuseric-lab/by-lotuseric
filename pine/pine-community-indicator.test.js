const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lexPine } = require('./pine-frontend.js');
const { parsePine } = require('./pine-parser.js');
const { runPine } = require('./pine-interpreter.js');

const file = path.join(__dirname, 'community', 'smc-quantum-algo-v6.pine');
const source = fs.readFileSync(file, 'utf8');
assert.match(source, /^\\/\\/@version=6/m, 'community source must remain Pine v6');
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, [], 'community SMC lexer diagnostics');
const parsed = parsePine(lexed.tokens);
assert.deepEqual(parsed.diagnostics, [], 'community SMC parser diagnostics');

const bars = Array.from({ length: 900 }, (_, i) => {
  const trend = 100 + i * 0.018;
  const wave = Math.sin(i / 8) * 2.4 + Math.sin(i / 23) * 1.1;
  const close = trend + wave;
  const open = trend + Math.sin((i - 1) / 8) * 2.4 + Math.sin((i - 1) / 23) * 1.1;
  return {
    time: 1700000100 + i * 300,
    open,
    high: Math.max(open, close) + 0.8 + (i % 5) * 0.07,
    low: Math.min(open, close) - 0.8 - (i % 7) * 0.05,
    close,
    volume: 900 + (i % 19) * 117 + Math.abs(wave) * 70
  };
});

let output;
try {
  output = runPine(parsed, bars, { symbol: 'BTCUSDT', timeframe: '5' });
} catch (error) {
  console.error('UNMODIFIED COMMUNITY SCRIPT EXECUTION FAILED');
  console.error({ name: error.name, code: error.code, message: error.message, line: error.line, column: error.column });
  throw error;
}
assert.ok(output && typeof output === 'object', 'community SMC should return output');
const drawings = ['lines', 'labels', 'boxes', 'polylines'].reduce((n, key) => n + (output[key]?.length || 0), 0);
const tables = output.tables?.length || 0;
const plots = output.plots?.length || 0;
assert.ok(drawings + tables + plots > 0, 'community SMC should produce visible chart output');
console.log('Unmodified community SMC v6 passed:', JSON.stringify({ bars: bars.length, plots, drawings, tables, alerts: output.alerts?.length || 0 }));

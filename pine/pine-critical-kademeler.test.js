const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const file = path.join(__dirname, "fixtures", "critical-kademeler-compatibility-smoke.pine");
const source = fs.readFileSync(file, "utf8");
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, [], "lexer must accept the compatibility fixture");
const ast = parsePine(lexed.tokens);
assert.deepEqual(ast.diagnostics, [], "parser must accept the compatibility fixture");

const bars = Array.from({ length: 320 }, (_, i) => {
  const base = 65000 + Math.sin(i / 8) * 420 + Math.sin(i / 23) * 900 + i * 0.7;
  return {
    time: 1700000000 + i * 300,
    open: base - Math.cos(i / 4) * 30,
    high: base + 90 + Math.sin(i / 3) * 35,
    low: base - 90 - Math.cos(i / 5) * 35,
    close: base + Math.sin(i / 2) * 45,
    volume: 1000 + (i % 19) * 150
  };
});
const out = runPine(ast, bars, { symbol: "BTC-USDT-SWAP", timeframe: "5" });
assert.ok(out.plots.some(p => p.title === "MACD Histogram"), "MACD plot must be emitted");
assert.ok(out.tables.length === 1, "dashboard table must be emitted");
assert.ok(out.tables[0].cells["0:0"], "dashboard cells must be populated");
assert.ok(out.lines.length > 0, "pivot resistance lines must be emitted");
assert.ok(out.labels.length > 0, "pivot labels must be emitted");
assert.ok(out.shapes.length >= 0, "shape output must be represented");
console.log("Critical Kademeler compatibility smoke test: OK (" + bars.length + " bars)");

const assert = require("node:assert/strict");
const frontend = require("./pine-frontend.js");
const parser = require("./pine-parser.js");
const interpreter = require("./pine-interpreter.js");

const source = `//@version=6
indicator("Force overlay regression", overlay=false)
plot(close, title="Oscillator")
plotshape(close > open, title="Price marker", style=shape.triangleup, force_overlay=true)
plotshape(close < open, title="Pane marker", style=shape.triangledown, force_overlay=false)
plotchar(close == open, char="•", force_overlay=true)
`;
const lexed = frontend.lexPine(source);
assert.equal(lexed.diagnostics.length, 0, "fixture must lex cleanly");
const ast = parser.parsePine(lexed.tokens);
assert.equal(ast.diagnostics.length, 0, "fixture must parse cleanly");
const bars = [
  { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 1300, open: 11, high: 13, low: 10, close: 12, volume: 110 },
  { time: 1600, open: 12, high: 13, low: 10, close: 10, volume: 120 }
];
const output = interpreter.runPine(ast, bars, { symbol: "BTCUSDT", timeframe: "5" });
assert.equal(output.metadata.overlay, false);
assert.equal(output.shapes.length, bars.length * 3);
assert.equal(output.shapes.filter(x => x.force_overlay === true).length, bars.length * 2);
assert.equal(output.shapes.filter(x => x.force_overlay === false).length, bars.length);
console.log(JSON.stringify({ status: "PASS", test: "force_overlay marker metadata", shapes: output.shapes.map(x => ({ bar: x.bar, force_overlay: x.force_overlay })) }, null, 2));

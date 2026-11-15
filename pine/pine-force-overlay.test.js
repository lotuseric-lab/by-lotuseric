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
line.new(bar_index[1], low[1], bar_index, high, force_overlay=true)
line.new(bar_index[1], low[1], bar_index, high, force_overlay=false)
label.new(bar_index, close, "Price label", force_overlay=true)
label.new(bar_index, close, "Pane label", force_overlay=false)
box.new(bar_index[1], high, bar_index, low, force_overlay=true)
box.new(bar_index[1], high, bar_index, low, force_overlay=false)
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
assert.equal(output.lines.length, bars.length * 2);
assert.equal(output.labels.length, bars.length * 2);
assert.equal(output.boxes.length, bars.length * 2);
for (const key of ["lines", "labels", "boxes"]) {
  assert.equal(output[key].filter(x => x.force_overlay === true).length, bars.length, key + " should retain force_overlay=true");
  assert.equal(output[key].filter(x => x.force_overlay === false).length, bars.length, key + " should retain force_overlay=false");
}
console.log(JSON.stringify({ status: "PASS", test: "force_overlay marker and drawing metadata", shapes: output.shapes.map(x => ({ bar: x.bar, force_overlay: x.force_overlay })) }, null, 2));

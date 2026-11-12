const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine, PineExecutionError } = require("./pine-interpreter.js");

function compile(source) {
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, []);
  const ast = parsePine(lexed.tokens);
  assert.deepEqual(ast.diagnostics, []);
  return ast;
}
const bars = Array.from({length:40}, (_,i) => ({
  time: 1700000000+i*300, open:100+i, high:102+i, low:99+i,
  close:101+i, volume:1000+i*10
}));

let result = runPine(compile(`//@version=6
indicator("EMA test", overlay=true)
fast = ta.ema(close, 3)
slow = ta.sma(close, 5)
plot(fast, "Fast", color=color.blue, linewidth=2)
plot(slow, "Slow", color=color.orange)
`), bars);
assert.equal(result.plots.length, 2);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[0].title, "Fast");
assert.equal(result.plots[0].color, "#2962ff");
assert.ok(Math.abs(result.plots[0].values.at(-1) - 139) < 1e-9);
assert.equal(result.plots[1].values.at(-1), 138);

result = runPine(compile(`//@version=6
indicator("History and conditions")
var float total = 0.0
if close > close[1]
    total := total + 1
plot(total, "Count")
`), bars);
assert.equal(result.plots[0].values.at(-1), 39);

result = runPine(compile(`//@version=6
indicator("Signals")
plotshape(ta.crossover(ta.ema(close, 3), ta.ema(close, 8)), title="Cross")
`), bars);
assert.equal(result.shapes.length, bars.length);

result = runPine(compile(`//@version=6
indicator("NA test")
plot(na(close) ? 1 : 0, "NA check")
`), bars);
assert.equal(result.plots[0].values.at(-1), 0);

assert.throws(() => runPine(compile(`//@version=6
indicator("Bad")
plot(unknownName)
`), bars), e => e instanceof PineExecutionError && e.code === "PINE_UNDEFINED_IDENTIFIER");

console.log("Pine interpreter tests: OK");

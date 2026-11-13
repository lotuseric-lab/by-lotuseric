const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const source = `//@version=6
indicator("Lower timeframe arrays")
intrabarClose = request.security_lower_tf(syminfo.tickerid, "1", close)
[intrabarHigh, intrabarLow] = request.security_lower_tf(syminfo.tickerid, "1", [high, low])
plot(array.size(intrabarClose), "Intrabar count")
plot(array.get(intrabarClose, 0), "First intrabar close")
plot(array.get(intrabarClose, array.size(intrabarClose) - 1), "Last intrabar close")
plot(array.size(intrabarHigh), "Tuple high count")
plot(array.get(intrabarLow, 0), "Tuple first low")
`;
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, []);
const ast = parsePine(lexed.tokens);
assert.deepEqual(ast.diagnostics, []);
const start = 1700000100;
const bars = [0, 1].map(i => ({
  time: start + i * 300,
  open: 100 + i * 10,
  high: 105 + i * 10,
  low: 95 + i * 10,
  close: 102 + i * 10,
  volume: 5000,
}));
const lowerBars = Array.from({ length: 10 }, (_, i) => {
  const bucket = Math.floor(i / 5), close = 101 + bucket * 10 + i % 5;
  return {time:start+i*60,open:close-1,high:close+2,low:close-2,close,volume:1000};
});
const output = runPine(ast, bars, {
  symbol: "TEST", timeframe: "5",
  lowerTimeframeData: {"1": lowerBars},
});
assert.deepEqual(output.plots[0].values, [5, 5]);
assert.deepEqual(output.plots[1].values, [101, 111]);
assert.deepEqual(output.plots[2].values, [105, 115]);
assert.deepEqual(output.plots[3].values, [5, 5]);
assert.deepEqual(output.plots[4].values, [99, 109]);

assert.throws(
  () => runPine(ast, bars, {symbol:"TEST",timeframe:"5"}),
  error => error.code === "PINE_MTF_DATA_REQUIRED",
);
console.log("Pine request.security_lower_tf tests: OK");

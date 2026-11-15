const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const source = `//@version=6
indicator("MTF tuple history", overlay=false)
f_pack() =>
    direction = close > open ? 1 : -1
    [direction[1], close[1]]
[mtfDirection, previousClose] = request.security(syminfo.tickerid, "5", f_pack(), lookahead=barmerge.lookahead_off)
plot(mtfDirection, "Previous MTF direction")
plot(previousClose, "Previous MTF close")
`;
const lexed = lexPine(source);
assert.deepEqual(lexed.diagnostics, []);
const ast = parsePine(lexed.tokens);
assert.deepEqual(ast.diagnostics, []);
const start = 1700000100;
const bars = Array.from({ length: 20 }, (_, i) => ({
  time: start + i * 60,
  open: 100 + i - 1,
  high: 101 + i,
  low: 99 + i,
  close: 100 + i,
  volume: 1000 + i,
}));
const output = runPine(ast, bars, { symbol: "TEST", timeframe: "1" });
assert.equal(output.plots[0].values[4], null, "first completed HTF candle has no previous direction");
assert.equal(output.plots[1].values[4], null, "first completed HTF candle has no previous close");
assert.equal(output.plots[0].values[9], 1, "second HTF candle must see prior function-local direction");
assert.equal(output.plots[1].values[9], 104, "second HTF candle must see prior HTF close");
assert.equal(output.plots[0].values[14], 1);
assert.equal(output.plots[1].values[14], 109);
console.log("Pine request.security tuple history tests: OK");

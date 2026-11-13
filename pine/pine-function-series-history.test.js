const assert = require("node:assert/strict");
const frontend = require("./pine-frontend.js");
const parser = require("./pine-parser.js");
const interpreter = require("./pine-interpreter.js");

const source = `//@version=6
indicator("Function local history", overlay=false)
f_history(mult) =>
    localValue = close * mult
    localValue[1]
plot(f_history(2), title="Call site A")
plot(f_history(3), title="Call site B")
`;
const lexed = frontend.lexPine(source);
assert.equal(lexed.diagnostics.length, 0, "fixture must lex cleanly");
const ast = parser.parsePine(lexed.tokens);
assert.equal(ast.diagnostics.length, 0, "fixture must parse cleanly");
const bars = [
  { time: 1000, open: 9, high: 11, low: 8, close: 10, volume: 100 },
  { time: 1300, open: 10, high: 12, low: 9, close: 11, volume: 110 },
  { time: 1600, open: 11, high: 13, low: 10, close: 12, volume: 120 },
];
const output = interpreter.runPine(ast, bars, { symbol: "BTCUSDT", timeframe: "5" });
assert.deepEqual(output.plots[0].values, [null, 20, 22]);
assert.deepEqual(output.plots[1].values, [null, 30, 33]);
console.log("Pine function local history tests: OK");

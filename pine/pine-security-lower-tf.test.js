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

const emptyTupleSource = `//@version=6
indicator("Empty lower timeframe tuple")
[emptyHigh, emptyLow] = request.security_lower_tf(syminfo.tickerid, "1", [high, low])
plot(array.size(emptyHigh), "Empty high count")
plot(array.size(emptyLow), "Empty low count")
`;
const emptyTupleAst = parsePine(lexPine(emptyTupleSource).tokens);
const emptyIntrabars = runPine(emptyTupleAst, bars, {
  symbol:"TEST", timeframe:"5",
  lowerTimeframeData: {"1": lowerBars.map(b => ({...b,time:b.time+600}))},
});
assert.deepEqual(emptyIntrabars.plots[0].values,[0,0],"tuple request must preserve empty arrays when no intrabars fall inside chart bars");
assert.deepEqual(emptyIntrabars.plots[1].values,[0,0]);

assert.throws(
  () => runPine(ast, bars, {symbol:"TEST",timeframe:"5"}),
  error => error.code === "PINE_MTF_DATA_REQUIRED",
);
const lowerSecuritySource = `//@version=6
indicator("Lower timeframe request.security")
lastIntrabarClose = request.security(syminfo.tickerid, "1", close, lookahead=barmerge.lookahead_off)
[lastClose, lastOpen] = request.security(syminfo.tickerid, "1", [close, open], lookahead=barmerge.lookahead_off)
plot(lastIntrabarClose, "Last intrabar close")
plot(lastClose, "Tuple last close")
plot(lastOpen, "Tuple last open")
`;
const lowerSecurityAst = parsePine(lexPine(lowerSecuritySource).tokens);
const lowerSecurityOutput = runPine(lowerSecurityAst, bars, {
  symbol: "TEST", timeframe: "5",
  lowerTimeframeData: { "1": lowerBars },
});
assert.deepEqual(lowerSecurityOutput.plots[0].values, [105, 115],
  "request.security on a lower timeframe must select the last intrabar in each chart bar");
assert.deepEqual(lowerSecurityOutput.plots[1].values, [105, 115],
  "lower-timeframe tuple request must select the final intrabar tuple");
assert.deepEqual(lowerSecurityOutput.plots[2].values, [104, 114],
  "lower-timeframe tuple values must stay aligned");

assert.throws(
  () => runPine(lowerSecurityAst, bars, { symbol: "TEST", timeframe: "5" }),
  error => error.code === "PINE_MTF_DATA_REQUIRED",
  "lower-timeframe request.security must require real intrabar data instead of inventing it"
);
const oneMinuteIntrabars = Array.from({ length: 45 }, (_, i) => {
  const close = 200 + Math.floor(i / 5) * 10 + (i % 5);
  return { time: start + i * 60, open: close - 1, high: close + 2,
    low: close - 2, close, volume: 1000 };
});
const fifteenMinuteBars = Array.from({ length: 3 }, (_, i) => {
  const chunk = oneMinuteIntrabars.slice(i * 15, i * 15 + 15);
  return {
    time: start + i * 900,
    open: chunk[0].open,
    high: Math.max(...chunk.map(b => b.high)),
    low: Math.min(...chunk.map(b => b.low)),
    close: chunk[chunk.length - 1].close,
    volume: chunk.reduce((sum, b) => sum + b.volume, 0)
  };
});
const aggregateLowerSource = `//@version=6
indicator("Aggregate finer intrabars for lower request.security")
lastFiveMinuteClose = request.security(syminfo.tickerid, "5", close, lookahead=barmerge.lookahead_off)
plot(lastFiveMinuteClose, "Last 5m close")
`;
const aggregateLowerAst = parsePine(lexPine(aggregateLowerSource).tokens);
const aggregateLowerOutput = runPine(aggregateLowerAst, fifteenMinuteBars, {
  symbol: "TEST", timeframe: "15",
  lowerTimeframeData: { "1": oneMinuteIntrabars }
});
assert.deepEqual(aggregateLowerOutput.plots[0].values, [224, 254, 284],
  "1m intrabars must aggregate into 5m bars and select the final 5m bar inside each 15m chart bar");

console.log("Pine request.security_lower_tf, lower request.security and derived lower-interval tests: OK");

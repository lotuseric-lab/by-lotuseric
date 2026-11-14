const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const bars = Array.from({ length: 30 }, (_, i) => ({
  time: 1700000100 + i * 60,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 100 + i
}));

function execute(source) {
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, []);
  const parsed = parsePine(lexed.tokens);
  assert.deepEqual(parsed.diagnostics, []);
  return runPine(parsed, bars, { symbol: "TEST", timeframe: "1" });
}

const lookaheadOff = execute(`//@version=6
indicator("MTF no future leak")
value = request.security(syminfo.tickerid, "5", close, lookahead=barmerge.lookahead_off)
plot(value, "Confirmed HTF close")`).plots[0].values;

const defaultLookahead = execute(`//@version=6
indicator("MTF default lookahead")
value = request.security(syminfo.tickerid, "5", close)
plot(value, "Default HTF close")`).plots[0].values;

const gapsOn = execute(`//@version=6
indicator("MTF gaps")
value = request.security(syminfo.tickerid, "5", close, gaps=barmerge.gaps_on, lookahead=barmerge.lookahead_off)
plot(value, "Gaps on")`).plots[0].values;

for (let i = 0; i < bars.length; i++) {
  const completedGroup = Math.floor((i + 1) / 5) - 1;
  const expected = completedGroup < 0 ? null : bars[(completedGroup + 1) * 5 - 1].close;
  assert.equal(lookaheadOff[i], expected, "lookahead_off at base bar " + i);
  assert.equal(defaultLookahead[i], expected, "default lookahead at base bar " + i);
  const expectedGap = (i + 1) % 5 === 0 ? bars[i].close : null;
  assert.equal(gapsOn[i], expectedGap, "gaps_on at base bar " + i);
}

assert.throws(
  () => execute(`//@version=6
indicator("Reject repaint")
value = request.security(syminfo.tickerid, "5", close, lookahead=barmerge.lookahead_on)
plot(value)`),
  error => String(error.message).includes("lookahead_on") || error.code === "PINE_MTF_LOOKAHEAD"
);

assert.throws(
  () => execute(`//@version=6
indicator("Reject lower TF request.security")
value = request.security(syminfo.tickerid, "1", close)
plot(value)`),
  error => error.code === "PINE_MTF_LOWER_TF" || String(error.message).includes("düşük zaman dilimi")
);

assert.throws(
  () => execute(`//@version=6
indicator("Reject non aligned TF")
value = request.security(syminfo.tickerid, "7", close)
plot(value)`),
  error => error.code === "PINE_MTF_ALIGNMENT" || String(error.message).includes("tam katı")
);

console.log("MTF confirmed close: 30/30; default lookahead: 30/30; gaps_on: 30/30.");
console.log("lookahead_on, lower-TF request.security and non-aligned timeframe are safely rejected.");

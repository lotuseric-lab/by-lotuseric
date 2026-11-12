const assert = require("node:assert/strict");
const { lexPine, analyzePineSource } = require("./pine-frontend.js");

const sample = `//@version=6
indicator("Test", overlay=true)
len = input.int(14, "Length")
basis = ta.sma(close, len)
plot(basis, color=color.new(color.blue, 10))
if close > basis
    label.new(bar_index, high, "UP")
`;
const lexed = lexPine(sample);
assert.equal(lexed.diagnostics.length, 0);
assert.ok(lexed.tokens.some(t => t.type === "DIRECTIVE" && t.value.includes("6")));
assert.ok(lexed.tokens.some(t => t.type === "STRING" && t.value === "Test"));
assert.ok(lexed.tokens.some(t => t.value === "=>") === false);
assert.ok(!lexed.tokens.some(t => t.type === "OPERATOR" && t.value === "and"));
assert.ok(!lexed.tokens.some(t => t.type === "NUMBER" && t.value === "1e+3"));

const exponentTokens = lexPine("a=1e+3\\nb=2.5e-2\\nc=4e\\nd=.75").tokens.filter(t => t.type === "NUMBER").map(t => t.value);
assert.deepEqual(exponentTokens, ["1e+3", "2.5e-2", "4", ".75"]);

const report = analyzePineSource(sample);
assert.equal(report.version, 6);
assert.equal(report.requirements.plots, true);
assert.equal(report.requirements.labels, true);
assert.equal(report.requirements.functions, false);
assert.equal(report.diagnostics.length, 0);

const badString = lexPine('//@version=5\nx = "oops');
assert.equal(badString.diagnostics[0].code, "PINE_LEX_UNTERMINATED_STRING");
const noVersion = analyzePineSource("indicator('No version')");
assert.equal(noVersion.diagnostics[0].code, "PINE_VERSION_UNSUPPORTED");

const hex = lexPine(`//@version=6\ncolor a = #00e676\ncolor b = #ff1744cc\n`);
assert.equal(hex.diagnostics.length, 0);
assert.ok(hex.tokens.some(t => t.type === "STRING" && t.value === "#00e676"));
assert.ok(hex.tokens.some(t => t.type === "STRING" && t.value === "#ff1744cc"));
console.log("Pine front-end tests: OK");

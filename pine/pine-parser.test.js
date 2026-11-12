const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { ExpressionParser, parsePine } = require("./pine-parser.js");

function expr(source) {
  const tokens = lexPine(source).tokens.filter(t => t.type !== "EOF" && t.type !== "NEWLINE");
  return new ExpressionParser(tokens).parse();
}
const arithmetic = expr("1 + 2 * 3");
assert.equal(arithmetic.type, "BinaryExpression");
assert.equal(arithmetic.right.operator, "*");
const history = expr("close[1]");
assert.equal(history.type, "MemberExpression");
assert.equal(history.computed, true);
const call = expr("ta.ema(close, 21)");
assert.equal(call.type, "CallExpression");
assert.equal(call.callee.object.name, "ta");
const named = expr("plot(close, color=color.blue, linewidth=2)");
assert.equal(named.arguments[1].type, "NamedArgument");
assert.equal(named.arguments[1].name, "color");
const conditional = expr("close > open ? close : open");
assert.equal(conditional.type, "ConditionalExpression");
const tuple = expr("[close, open, high]");
assert.equal(tuple.type, "ArrayExpression");
const arrow = expr("(x, y) => x + y");
assert.equal(arrow.type, "ArrowFunctionExpression");
const programTokens = lexPine(`//@version=6
indicator("Parser test", overlay=true)
length = input.int(14)
basis = ta.ema(close, length)
plot(basis)
`).tokens;
const program = parsePine(programTokens);
assert.equal(program.diagnostics.length, 0);
assert.equal(program.body.length, 4);
assert.equal(program.body[0].type, "ExpressionStatement");
assert.equal(program.body[1].type, "AssignmentStatement");
assert.equal(program.body[2].type, "AssignmentStatement");
assert.equal(program.body[3].type, "ExpressionStatement");
console.log("Pine parser tests: OK");

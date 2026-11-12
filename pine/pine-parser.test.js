const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { ExpressionParser, parsePine } = require("./pine-parser.js");
function expr(source) { return new ExpressionParser(lexPine(source).tokens.filter(t=>!["EOF","NEWLINE"].includes(t.type))).parse(); }

assert.equal(expr("1 + 2 * 3").right.operator,"*");
assert.equal(expr("close[1]").computed,true);
assert.equal(expr("ta.ema(close, 21)").type,"CallExpression");
assert.equal(expr("plot(close, color=color.blue, linewidth=2)").arguments[1].type,"NamedArgument");
assert.equal(expr("close > open ? close : open").type,"ConditionalExpression");
assert.equal(expr("[close, open, high]").type,"ArrayExpression");
assert.equal(expr("(x, y) => x + y").type,"ArrowFunctionExpression");

const source = `//@version=6
indicator("Parser test", overlay=true)
var float total = 0.0
float basis = ta.ema(close, 14)
calc(x, y) => x + y
if close > basis
    total := total + close
    if volume > 100
        label.new(bar_index, high, "volume")
else
    total := 0.0
for i = 0 to 10 by 2
    total += i
[a, b] = ta.macd(close, 12, 26, 9)
`;
const ast=parsePine(lexPine(source).tokens);
assert.deepEqual(ast.diagnostics,[]);
assert.equal(ast.body[1].type,"TypedDeclarationStatement");
assert.equal(ast.body[2].type,"TypedDeclarationStatement");
assert.equal(ast.body[3].type,"FunctionDeclaration");
assert.equal(ast.body[4].type,"IfStatement");
assert.equal(ast.body[4].body[1].type,"IfStatement");
assert.equal(ast.body[4].alternate[0].type,"AssignmentStatement");
assert.equal(ast.body[5].type,"ForRangeStatement");
assert.equal(ast.body[5].step.value,2);
assert.equal(ast.body[6].type,"DestructuringAssignment");

const multiline= parsePine(lexPine(`//@version=6
plot(
    ta.ema(close, 20),
    color=color.blue
)
`).tokens);
assert.equal(multiline.diagnostics.length,0);
assert.equal(multiline.body.length,1);
assert.equal(multiline.body[0].expression.arguments.length,2);

const bad=parsePine(lexPine("if close > open\nplot(close)").tokens);
assert.ok(bad.diagnostics.some(d=>d.code==="PINE_PARSE_EMPTY_BLOCK"));
console.log("Pine parser tests: OK");

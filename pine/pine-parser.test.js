const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { ExpressionParser, parsePine } = require("./pine-parser.js");
function expr(source) { return new ExpressionParser(lexPine(source).tokens.filter(t=>!["EOF","NEWLINE"].includes(t.type))).parse(); }

assert.equal(expr("1 + 2 * 3").right.operator,"*");
assert.equal(expr("close[1]").computed,true);
assert.equal(expr("ta.ema(close, 21)").type,"CallExpression");
assert.equal(expr("plot(close, color=color.blue, linewidth=2)").arguments[1].type,"NamedArgument");
assert.equal(expr("line.new(bar_index[2], low[2], bar_index, high, color=color.blue, width=2, style=line.style_dashed)").arguments.length,7);
assert.equal(expr('label.new(bar_index, close, "Test label", textcolor=color.white)').arguments.length,4);
assert.equal(expr("box.new(bar_index[2], high, bar_index, low, bgcolor=color.new(color.green, 80))").arguments.length,5);
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
assert.equal(parsePine(lexPine(`//@version=6\nvar upper_draw = array.new<draw>()`).tokens).body[0].type,"DeclarationStatement");
assert.equal(parsePine(lexPine(`//@version=5\nvar line[] fibLines = array.new_line()`).tokens).body[0].type,"TypedDeclarationStatement");
assert.equal(parsePine(lexPine(`//@version=5\nline[] fibLines = array.new_line()`).tokens).body[0].type,"TypedDeclarationStatement");

const labelMethod=parsePine(lexPine(`//@version=5
indicator("Label method")
label.set_text(lbSL, "Orijinal SL " + str.tostring(close, format.mintick) + " (−" + slPctUpd + ")")
`).tokens);
assert.deepEqual(labelMethod.diagnostics,[]);

console.log("Pine parser tests: OK");

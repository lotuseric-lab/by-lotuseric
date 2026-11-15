const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");

const source=`//@version=6
indicator("Syntax Coverage")
float seed = 2.0
var int total = 0
calc(x) =>
    x * 2 + seed
mode = close > open ? 1 : 0
if mode == 1
    total += 1
else if mode == 0
    total += 2
else
    total := 0
switchValue = switch mode
    1 => 3
    0 => 4
    => 5
total := total + switchValue
for i = 0 to 2 by 1
    total := total + i
items = array.from(1, 2, 3)
for item in items
    total := total + item
[a, b] = ta.macd(close, 3, 6, 3)
plot(calc(close), "Function")
plot(total, "Control flow")
plot(a + b, "Tuple")
`;
const lexed=lexPine(source);
assert.deepEqual(lexed.diagnostics,[],"lexer should accept covered Pine syntax");
const parsed=parsePine(lexed.tokens);
assert.deepEqual(parsed.diagnostics,[],"parser should accept covered Pine syntax");
const bars=Array.from({length:80},(_,i)=>({time:1700000000+i*300,open:100+i,high:103+i,low:98+i,close:101+i+(i%3),volume:1000+i*10}));
const out=runPine(parsed,bars,{timeframe:"5",symbol:"TEST"});
assert.equal(out.plots.length,3);
assert.ok(Number.isFinite(out.plots[0].values.at(-1)));
assert.ok(Number.isFinite(out.plots[1].values.at(-1)));
assert.ok(Number.isFinite(out.plots[2].values.at(-1)));
console.log("Pine syntax coverage regression: OK");

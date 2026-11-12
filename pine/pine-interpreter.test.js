const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine, PineExecutionError } = require("./pine-interpreter.js");

function compile(source) {
  const lexed = lexPine(source);
  assert.deepEqual(lexed.diagnostics, []);
  const ast = parsePine(lexed.tokens);
  assert.deepEqual(ast.diagnostics, []);
  return ast;
}
const bars = Array.from({length:40}, (_,i) => ({
  time: 1700000000+i*300, open:100+i, high:102+i, low:99+i,
  close:101+i, volume:1000+i*10
}));

let result = runPine(compile(`//@version=6
indicator("EMA test", overlay=true)
fast = ta.ema(close, 3)
slow = ta.sma(close, 5)
plot(fast, "Fast", color=color.blue, linewidth=2)
plot(slow, "Slow", color=color.orange)
`), bars);
assert.equal(result.plots.length, 2);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[0].title, "Fast");
assert.equal(result.plots[0].color, "#2962ff");
assert.ok(Math.abs(result.plots[0].values.at(-1) - 139) < 1e-9);
assert.equal(result.plots[1].values.at(-1), 138);

result = runPine(compile(`//@version=6
indicator("Input test", overlay=false)
length = input.int(3, "Length", minval=1, maxval=10)
plot(ta.sma(close, length), "Average")
`), bars);
assert.equal(result.metadata.title, "Input test");
assert.equal(result.metadata.overlay, false);
assert.equal(result.inputDefs[0].key, "Length");
assert.equal(result.inputDefs[0].def, 3);
assert.equal(result.plots[0].values.at(-1), 139);
result = runPine(compile(`//@version=6
indicator("Input test", overlay=false)
length = input.int(3, "Length", minval=1, maxval=10)
plot(ta.sma(close, length), "Average")
`), bars, {inputs:{Length:5}});
assert.equal(result.plots[0].values.at(-1), 138);

result = runPine(compile(`//@version=6
indicator("Array and tuple")
var array<float> values = array.new_float()
array.push(values, close)
[m, sig, hist] = ta.macd(close, 3, 6, 3)
plot(array.size(values), "Array size")
plot(bar_index[1], "Previous bar")
plot(hist, "MACD histogram")
`), bars);
assert.equal(result.plots[0].values.at(-1), bars.length);
assert.equal(result.plots[1].values.at(-1), bars.length-2);
assert.ok(Number.isFinite(result.plots[2].values.at(-1)));

result = runPine(compile(`//@version=6
indicator("Drawing test", overlay=true)
line.new(bar_index[2], low[2], bar_index, high, color=color.blue, width=2, style=line.style_dashed)
label.new(bar_index, close, "Test label", textcolor=color.white)
box.new(bar_index[2], high, bar_index, low, bgcolor=color.new(color.green, 80))
if barstate.islast
    t = table.new(position.top_right, 2, 1)
    table.cell(t, 0, 0, "Ready")
`), bars);
assert.equal(result.lines.length, bars.length);
assert.equal(result.labels.length, bars.length);
assert.equal(result.boxes.length, bars.length);
assert.equal(result.tables.length, 1);
assert.equal(result.tables[0].cells["0:0"].text, "Ready");

result = runPine(compile(`//@version=6
indicator("Switch test")
switch close > open
    true => plot(close, "Bull")
    false => plot(open, "Bear")
`), bars);
assert.equal(result.plots.length, 2);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[1].values.length, bars.length);
assert.equal(result.plots[0].values.at(-1), bars.at(-1).close);
assert.equal(result.plots[1].values.at(-1), null);

result = runPine(compile(`//@version=6
indicator("Conditional plot alignment")
if bar_index % 2 == 0
    plot(close, "Even bars")
else
    plot(open, "Odd bars")
`), bars);
assert.equal(result.plots.length, 2);
assert.equal(result.plots[0].values[0], bars[0].close);
assert.equal(result.plots[0].values[1], null);
assert.equal(result.plots[1].values[0], null);
assert.equal(result.plots[1].values[1], bars[1].open);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[1].values.length, bars.length);

result = runPine(compile(`//@version=6
indicator("Multiline function")
twicePlusOne(x) =>
    doubled = x * 2
    doubled + 1
plot(twicePlusOne(close), "Function")
`), bars);
assert.equal(result.plots[0].values.at(-1), bars.at(-1).close*2+1);

result = runPine(compile(`//@version=6
indicator("UDT test")
type Pivot
    float level
    int index = 0
var Pivot p = Pivot.new(10.0)
p.level := p.level + 1
plot(p.level, "Pivot level")
`), bars);
assert.equal(result.plots[0].values.at(-1), 50);



result = runPine(compile(`//@version=6
indicator("MTF test")
hourClose = request.security(syminfo.tickerid, "60", close)
plot(hourClose, "Hourly close")
`), bars.map((b,i)=>({...b,time:1700002800+i*300})), {timeframe:"5m",symbol:"TEST-USDT"});
assert.equal(result.plots[0].values[10], null);
assert.equal(result.plots[0].values[11], bars[11].close);
assert.equal(result.plots[0].values[23], bars[23].close);





result = runPine(compile(`//@version=6
indicator("History and conditions")
var float total = 0.0
if close > close[1]
    total := total + 1
plot(total, "Count")
`), bars);
assert.equal(result.plots[0].values.at(-1), 39);

result = runPine(compile(`//@version=6
indicator("Signals")
plotshape(ta.crossover(ta.ema(close, 3), ta.ema(close, 8)), title="Cross")
`), bars);
assert.equal(result.shapes.length, bars.length);

result = runPine(compile(`//@version=6
indicator("NA test")
plot(na(close) ? 1 : 0, "NA check")
`), bars);
assert.equal(result.plots[0].values.at(-1), 0);

assert.throws(() => runPine(compile(`//@version=6
indicator("Bad")
plot(unknownName)
`), bars), e => e instanceof PineExecutionError && e.code === "PINE_UNDEFINED_IDENTIFIER");

console.log("Pine interpreter tests: OK");

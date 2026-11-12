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
assert.equal(result.plots.length, 1);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[0].values.at(-1), bars.at(-1).close);

result = runPine(compile(`//@version=6
indicator("History on TA call")
plot(ta.highest(high, 5)[1], "Previous rolling high")
`), bars);
assert.equal(result.plots[0].values[5], Math.max(...bars.slice(0,5).map(b=>b.high)));

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
indicator("Persistent var series and na")
var int lastBar = na
plot(na(lastBar) ? 1 : 0, "Is NA")
plot(lastBar[1], "Previous stored bar")
if bar_index == 0
    lastBar := bar_index
`), bars);
assert.equal(result.plots[0].values[0], 1);
assert.equal(result.plots[0].values[1], 0);
assert.equal(result.plots[1].values[1], 0);
assert.equal(result.plots[1].values[2], 0);

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

result = runPine(compile(`//@version=6
indicator("True range series")
plot(ta.tr, "TR")
plot(ta.rma(ta.tr, 14), "ATR base")
`), bars);
assert.equal(result.plots[0].values[0], 3);
assert.equal(result.plots[0].values[1], 3);
assert.equal(result.plots[1].values.at(-1), 3);

result = runPine(compile(`//@version=6
indicator("OBV series")
plot(ta.sma(ta.obv, 3), "OBV average")
plot(barstate.ishistory ? 1 : 0, "History")
`), bars);
const obvSeries=[];let obv=0;bars.forEach((b,i)=>{if(i>0)obv+=(b.close>bars[i-1].close?1:b.close<bars[i-1].close?-1:0)*b.volume;obvSeries.push(obv);});
const expectedObvSma=obvSeries.slice(-3).reduce((a,b)=>a+b,0)/3;
assert.equal(result.plots[1].values.at(-1), 1);
assert.equal(result.plots[0].values.at(-1), expectedObvSma);

result = runPine(compile(`//@version=6
indicator("Fill output")
a = plot(ta.sma(close, 3), "A")
b = plot(ta.ema(close, 3), "B")
fill(a, b, color=color.new(color.green, 80), title="Band")
`), bars);
assert.equal(result.fills.length, bars.length);
assert.equal(result.fills[0].plot1, 0);
assert.equal(result.fills[0].plot2, 1);
assert.equal(result.fills[0].title, "Band");

result = runPine(compile(`//@version=6
indicator("Hline options")
hline(50, "Middle", color=color.red, linestyle=hline.style_dashed)
`), bars);
assert.equal(result.hlines[0].value, 50);
assert.equal(result.hlines[0].color, "#f23645");
assert.equal(result.hlines[0].linestyle, "dashed");

const crossCloses=[10,9,8,7,8,9,10,11,12,13,14,15,14,13,12,11,10,9,8];
const crossBars=crossCloses.map((close,i)=>({time:1700000000+i*300,open:close,high:close+1,low:close-1,close,volume:1000}));
result=runPine(compile(`//@version=6
indicator("EMA crossover regression")
fast=ta.ema(close,3)
slow=ta.ema(close,6)
plotshape(ta.crossover(fast,slow),title="Cross up")
plotshape(ta.crossunder(fast,slow),title="Cross down")
`),crossBars,{timeframe:"5m",symbol:"TEST-USDT"});
assert.ok(result.shapes.some(x=>x.title==="Cross up"&&x.value),"EMA crossover must detect scalar EMA series");
assert.ok(result.shapes.some(x=>x.title==="Cross down"&&x.value),"EMA crossunder must detect scalar EMA series");

result = runPine(compile(`//@version=6
indicator("Format namespace")
label.new(bar_index, close, str.tostring(close, format.mintick))
`), bars, {mintick:0.01});
assert.equal(result.labels.at(-1).text, "140.00");

assert.throws(() => runPine(compile(`//@version=6
indicator("Bad")
plot(unknownName)
`), bars), e => e instanceof PineExecutionError && e.code === "PINE_UNDEFINED_IDENTIFIER");

result = runPine(compile(`//@version=6
indicator("Safe object deletion")
var line missing = na
line.delete(missing)
var label missingLabel = na
label.delete(missingLabel)
var box missingBox = na
box.delete(missingBox)
var table missingTable = na
table.delete(missingTable)
plot(close)
`), bars);
assert.equal(result.plots[0].values.at(-1), bars.at(-1).close);

assert.throws(() => runPine(compile(`//@version=6
indicator("Array bounds")
a = array.new_int(1)
plot(array.get(a, 1))
`), bars), /Array index out of bounds/);

result = runPine(compile(`//@version=6
indicator("Bar color output")
barcolor(color.red)
bgcolor(color.new(color.blue, 80))
`), bars);
assert.equal(result.barColors.length, bars.length);
assert.equal(result.barColors.at(-1).color, "#f23645");
assert.equal(result.bgColors.length, bars.length);
result = runPine(compile(`//@version=6
indicator("Fill handles")
a = plot(close)
b = plot(open)
fill(a, b, color=color.new(color.blue, 70))
`), bars);
assert.equal(result.fills.length, bars.length);


const sparseMtfBars = Array.from({length:12},(_,i)=>i===3?null:{
  time:1700002800+i*300,open:100+i,high:102+i,low:99+i,close:101+i,volume:1000
}).filter(Boolean);
result=runPine(compile(`//@version=6
indicator("MTF complete bucket with missing base candle")
hourClose=request.security(syminfo.tickerid,"60",close)
plot(hourClose,"Confirmed hourly close")
`),sparseMtfBars,{timeframe:"5m",symbol:"TEST-USDT"});
assert.equal(result.plots[0].values.at(-1),sparseMtfBars.at(-1).close,
  "A fully elapsed HTF bucket must not be discarded merely because the feed has a missing base candle");

const partialMtfBars=sparseMtfBars.slice(0,-1);
result=runPine(compile(`//@version=6
indicator("MTF unfinished bucket")
hourClose=request.security(syminfo.tickerid,"60",close)
plot(hourClose,"Confirmed hourly close")
`),partialMtfBars,{timeframe:"5m",symbol:"TEST-USDT"});
assert.equal(result.plots[0].values.at(-1),null,
  "An unfinished higher-timeframe candle must not leak into confirmed lookahead-off values");

const fs = require("node:fs");
const path = require("node:path");
const adxSource = fs.readFileSync(path.join(__dirname, "fixtures", "MONEY_TRADER_ADX.pine"), "utf8");
const adxAst = compile(adxSource);
const cizgiFunction = adxAst.body.find(node => node.type === "FunctionDeclaration" && node.name === "cizgiCiz");
assert.ok(cizgiFunction);
assert.deepEqual(cizgiFunction.params.map(param => param.name), ["cArr","lArr","sinyal","fiyat","renk","onEk"]);
result = runPine(adxAst, bars, {timeframe:"5m",symbol:"TEST-USDT",mintick:0.01});
assert.equal(result.metadata.title, "MONEY TRADER - ADX DI Kesişim [MACD + RSI ONAYLI]");
assert.ok(result.plots.length >= 3);
assert.ok(result.hlines.length >= 5);
assert.ok(result.fills.length > 0);
assert.ok(result.tables.length > 0);

const roseSource = fs.readFileSync(path.join(__dirname, "fixtures", "MONEY_TRADER_GOLDEN_ROSE.pine"), "utf8");
const roseAst = compile(roseSource);
result = runPine(roseAst, bars, {timeframe:"5m",symbol:"TEST-USDT",mintick:0.01});
assert.equal(result.metadata.title, "MONEY TRADER PURPLE ROSE [CANLI TRADE - NO REPAINT]");
assert.ok(result.shapes.length > 0);
assert.equal(result.shapes[0].style, "shape.triangleup");
assert.equal(result.shapes[0].location, "belowbar");
assert.equal(result.shapes[0].color, "#089981");
assert.ok(result.tables.length > 0);



result = runPine(compile(`//@version=6
indicator("Switch expression")
isUp = switch close > open
    true => true
    false => false
plot(isUp ? 1 : 0)
`), bars);
assert.equal(result.plots[0].values[0], 1);
assert.equal(result.plots[0].values[1], 1);

console.log("Pine interpreter tests: OK");

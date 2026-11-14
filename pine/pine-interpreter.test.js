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

const fiboSource=fs.readFileSync(path.join(__dirname,"fixtures","MONEY_TRADER_FIBO_TRADE_ARCHIVE.pine"),"utf8");
const fiboAst=compile(fiboSource);
const fiboBars=Array.from({length:260},(_,i)=>({time:1700000000+i*300,open:100+i*.1,high:102+i*.1,low:99+i*.1,close:101+i*.1,volume:1000+i*5}));
result=runPine(fiboAst,fiboBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:500000});
assert.ok(result.tables.length>0,"FIBO source should render its diagnostics table");
assert.ok(result.lines.length>0,"FIBO source should create Fibonacci levels");

const wizardSource=fs.readFileSync(path.join(__dirname,"fixtures","MONEY_TRADER_WIZZARD.pine"),"utf8");
const wizardAst=compile(wizardSource);
result=runPine(wizardAst,fiboBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:500000});
assert.equal(result.metadata.title,"Money Trader — Otomatik Destek/Direnç");
assert.ok(result.inputDefs.length>=10,"Wizzard source input definitions should be exposed");

const sniperSource=fs.readFileSync(path.join(__dirname,"fixtures","MONEY_TRADER_SNIPER.pine"),"utf8");
const sniperAst=compile(sniperSource);
result=runPine(sniperAst,fiboBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:500000});
assert.equal(result.metadata.title,"SNIPER BOT SIGNALS [ALL BREAKOUTS]");


const sessionBars=[
 {time:Date.UTC(2024,0,1,9,30)/1000,open:1,high:2,low:0,close:1,volume:10},
 {time:Date.UTC(2024,0,1,10,30)/1000,open:1,high:2,low:0,close:1,volume:10}
];
result=runPine(compile(`//@version=6
indicator("Session filter")
sessionInput=input.session("0900-1000","Test Session")
inside=not na(time(timeframe.period,sessionInput,"UTC"))
plot(inside?1:0)
`),sessionBars,{timeframe:"5m",symbol:"TEST"});
assert.equal(result.plots[0].values[0],1);
assert.equal(result.plots[0].values[1],0);
assert.equal(result.inputDefs[0].type,"session");

result=runPine(compile(`//@version=6
indicator("Boolean series history")
above=close>open
plot(above[1]?1:0)
`),bars);
assert.equal(result.plots[0].values[0],0);
assert.equal(result.plots[0].values[1],1);



result=runPine(compile(`//@version=6
indicator("Color channel and chart namespace")
dark = color.r(chart.bg_color) < 128
plot(color.r(chart.bg_color),"Red")
plot(color.g(chart.bg_color),"Green")
plot(color.b(chart.bg_color),"Blue")
plot(dark?1:0,"Dark")
`),bars,{chartBgColor:"#131722"});
assert.equal(result.plots[0].values.at(-1),19);
assert.equal(result.plots[1].values.at(-1),23);
assert.equal(result.plots[2].values.at(-1),34);
assert.equal(result.plots[3].values.at(-1),1);

const supportSource=fs.readFileSync(path.join(__dirname,"fixtures","MONEY_TRADER_SUPPORT_RESISTANCE.pine"),"utf8");
const supportAst=compile(supportSource);
const supportBars=Array.from({length:600},(_,i)=>{
  const wave=Math.sin(i*0.47)*4+Math.sin(i*0.13)*2;
  const close=100+wave+i*0.015;
  return {time:1700000000+i*300,open:close-Math.sin(i)*0.6,high:close+1+(i%7)*0.12,low:close-1-(i%5)*0.1,close,volume:1000+(i%9)*180};
});
result=runPine(supportAst,supportBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:5000000});
assert.equal(result.metadata.title,"MONEY TRADER Destek/Direnç");
assert.ok(result.inputDefs.length>=15,"Support/resistance input definitions should be exposed");
assert.ok(result.lines.length>0,"Support/resistance levels should create chart lines");
assert.ok(result.linefills.length>0,"Support/resistance channel should create line fills");
assert.ok(result.labels.length>0,"Support/resistance levels should create price labels");
assert.ok(result.shapes.length>0,"Support/resistance signals should be represented as shapes");


result = runPine(compile(`//@version=5
indicator("Array sort order compatibility")
var float[] values = array.new_float()
if barstate.isfirst
    array.push(values, 3.0)
    array.push(values, 1.0)
    array.push(values, 2.0)
array.sort(values, order.ascending)
ascendingFirst = array.get(values, 0)
array.sort(values, order.descending)
descendingFirst = array.get(values, 0)
plot(ascendingFirst, "Ascending first")
plot(descendingFirst, "Descending first")
`), bars);
assert.equal(result.plots[0].values.at(-1), 1);
assert.equal(result.plots[1].values.at(-1), 3);

result = runPine(compile(`//@version=5
indicator("String split and numeric conversion")
fibLevels = "0.236, 0.382, 0.5, 0.618, 0.786"
levels = str.split(fibLevels, ", ")
first = str.tonumber(array.get(levels, 0))
last = str.tonumber(array.get(levels, 4))
plot(first, "First level")
plot(last, "Last level")
`), bars);
assert.equal(result.plots[0].values.at(-1), 0.236);
assert.equal(result.plots[1].values.at(-1), 0.786);

result = runPine(compile(`//@version=5
indicator("last_bar_index built-in")
plot(last_bar_index, "Last bar index")
plot(bar_index, "Bar index")
`), bars);
assert.equal(result.plots[0].values.length, bars.length);
assert.equal(result.plots[0].values.at(0), bars.length - 1);
assert.equal(result.plots[0].values.at(-1), bars.length - 1);
assert.equal(result.plots[1].values.at(-1), bars.length - 1);


const srFibDiSource = fs.readFileSync(path.join(__dirname, "fixtures", "sr-fib-di-integration.pine"), "utf8");
const srFibDiAst = compile(srFibDiSource);
const srFibDiBars = Array.from({length:320}, (_,i) => {
  const wave = Math.sin(i * 0.19) * 3 + Math.sin(i * 0.047) * 1.5;
  const close = 100 + wave + Math.sin(i * 0.012) * 8 + i * 0.018;
  return {time:1700000000+i*300,open:close-Math.sin(i*0.7)*0.7,high:close+0.8+(i%5)*0.1,low:close-0.9-(i%4)*0.1,close,volume:1200+(i%11)*125};
});
result = runPine(srFibDiAst, srFibDiBars, {timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:1000000});
assert.equal(result.metadata.title, "BY LOTUSERIC — S/R + Fibonacci + DI integration");
assert.ok(result.inputDefs.length === 0);
assert.ok(result.plots.length >= 3, "DI and ADX series should be emitted");
assert.ok(result.shapes.length > 0, "Signal shapes should be emitted");
assert.ok(result.lines.length >= 3, "Fibonacci guide lines should be emitted");
assert.ok(result.tables.length === 1, "Diagnostics table should be emitted");
assert.equal(result.tables[0].cells["0:0"].text, "BY LOTUSERIC");
assert.ok(result.tables[0].cells["1:1"].text.length > 0);


const projexSource=fs.readFileSync(path.join(__dirname,"fixtures","MONEY_TRADER_PROJEX.pine"),"utf8");
const projexAst=compile(projexSource);
const projexBars=Array.from({length:600},(_,i)=>{
  const wave=Math.sin(i*0.11)*2.5+Math.sin(i*0.037)*1.2;
  const close=100+wave+i*0.025;
  return {time:1700000000+i*300,open:close-Math.sin(i*0.31)*0.5,high:close+0.9+(i%6)*0.12,low:close-0.8-(i%5)*0.1,close,volume:1500+(i%13)*140};
});
assert.ok(projexAst.body.length>0,"PROJE-X source should produce a non-empty syntax tree");
// Keep the original source as a regression fixture: its out-of-block reference is invalid.
assert.throws(
  () => runPine(projexAst,projexBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:5000000}),
  error => error instanceof PineExecutionError &&
    error.code === "PINE_UNDEFINED_IDENTIFIER" &&
    /watch_text/.test(error.message),
  "Original PROJE-X source must report its block-local watch_text reference"
);

// The isolated repair candidate moves dependent drawing/alert calls into their
// declaring branch and quotes emoji prefixes; execute it over 600 synthetic bars.
const projexFixedSource=fs.readFileSync(path.join(__dirname,"fixtures","PROJEX_SCOPE_FIXED_CANDIDATE.pine"),"utf8");
const projexFixedAst=compile(projexFixedSource);
const projexFixedResult=runPine(projexFixedAst,projexBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:5000000});
assert.equal(projexFixedResult.metadata.title,"MONEY TRADER - TAVAN ADAYI + PROJE-X");
assert.ok(projexFixedResult.lines.length>0,"Repaired PROJE-X should create target lines");
assert.ok(projexFixedResult.labels.length>0,"Repaired PROJE-X should create labels");
console.log("PROJE-X candidate output:", JSON.stringify({lines:projexFixedResult.lines.length,labels:projexFixedResult.labels.length,boxes:projexFixedResult.boxes.length,shapes:projexFixedResult.shapes.length,alerts:projexFixedResult.alerts.length,targetLabels:projexFixedResult.labels.filter(x=>/HEDEF[123]/.test(x.text||"")).map(x=>x.text),alertSamples:projexFixedResult.alerts.slice(0,5)}));

// Inspect the Proje-X gate series on a deliberate selloff-to-rebound sequence.
const projexSignalBars=Array.from({length:240},(_,i)=>{
  let close;
  if(i<150) close=100;
  else if(i<180) close=100-(i-150)*0.5;
  else if(i<195) close=85+(i-180)*1.1;
  else close=101.5+Math.sin(i*0.4)*0.25;
  const open=i>=180?close-0.8:close-0.05;
  const high=Math.max(open,close)+0.45;
  const low=Math.min(open,close)-0.45;
  const volume=i>=180&&i<190?9000:1200;
  return {time:1700000000+i*300,open,high,low,close,volume};
});
const projexDebugAst=compile(projexFixedSource+`
plot(px_rsiCrossUp?1:0,"DEBUG RSI cross")
plot(px_rawRsiBuy?1:0,"DEBUG raw buy")
plot(px_isHighVol?1:0,"DEBUG volume")
plot(px_momentum>0?1:0,"DEBUG momentum")
plot(px_tmoBullish?1:0,"DEBUG TMO")
plot(px_projexComboBuy?1:0,"DEBUG combo")
plot(px_inCooldown?1:0,"DEBUG cooldown")
plot(px_isNewBuy?1:0,"DEBUG new buy")
plot(show_projex_al?1:0,"DEBUG show toggle")
`);
const projexSignalResult=runPine(projexDebugAst,projexSignalBars,{timeframe:"5m",symbol:"TEST-USDT",mintick:0.01,maxSteps:5000000});
const pxMatches=[];
(function walk(n){if(!n||typeof n!=="object")return;if(n.name==="px_isNewBuy"||n.identifier==="px_isNewBuy")pxMatches.push(n);for(const v of Object.values(n))if(v&&typeof v==="object")Array.isArray(v)?v.forEach(walk):walk(v);})(projexDebugAst);
console.log("PROJE-X AST matches:",JSON.stringify(pxMatches.slice(0,6)));
console.log("PROJE-X top-level AST near block:",JSON.stringify(projexDebugAst.body.filter(n=>n.loc&&n.loc.line>=380&&n.loc.line<=430).map(n=>({type:n.type,loc:n.loc,test:n.test,body:n.body?.map(x=>({type:x.type,loc:x.loc,name:x.name,expr:x.expression?.type}))})).slice(0,20)));
console.log("PROJE-X gate diagnostics:",JSON.stringify(projexSignalResult.plots.slice(-6).map(p=>({title:p.title,activeBars:p.values.map((v,i)=>v?i:null).filter(v=>v!==null)}))));
console.log("PROJE-X signal-path output:",JSON.stringify({lines:projexSignalResult.lines.length,labels:projexSignalResult.labels.filter(x=>/HEDEF[123]|PROJE-X AL/.test(x.text||"")).map(x=>x.text),alerts:projexSignalResult.alerts.length}));

console.log("Pine interpreter tests: OK");

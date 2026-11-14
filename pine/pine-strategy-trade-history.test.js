const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");
const source=`//@version=6
strategy("Trade history API", initial_capital=1000, default_qty_type=strategy.fixed, default_qty_value=2)
if barstate.isfirst
    strategy.entry("Long-A", strategy.long)
if bar_index == 2
    strategy.close("Long-A")
plot(strategy.opentrades.entry_price(0), title="Open entry")
plot(strategy.opentrades.size(0), title="Open size")
plot(strategy.closedtrades.entry_price(0), title="Closed entry")
plot(strategy.closedtrades.exit_price(0), title="Closed exit")
plot(strategy.closedtrades.profit(0), title="Closed profit")
plot(strategy.closedtrades.entry_bar_index(0), title="Entry bar")
plot(strategy.closedtrades.exit_bar_index(0), title="Exit bar")
plot(strategy.closedtrades.exit_id(0) == "Long-A" ? 1 : 0, title="Exit id")
plot(strategy.closedtrades.max_runup(0), title="Closed MFE")
plot(strategy.closedtrades.max_drawdown(0), title="Closed MAE")
plot(strategy.closedtrades.max_runup_percent(0), title="Closed MFE percent")
`;
const front=lexPine(source);assert.deepEqual(front.diagnostics,[]);
const ast=parsePine(front.tokens);assert.deepEqual(ast.diagnostics,[]);
const bars=[
 {time:1000,open:10,high:10.5,low:9.5,close:10,volume:100},
 {time:1060,open:11,high:11.5,low:10.5,close:11,volume:100},
 {time:1120,open:12,high:12.5,low:11.5,close:12,volume:100},
 {time:1180,open:13,high:13.5,low:12.5,close:13,volume:100}
];
const out=runPine(ast,bars,{mintick:0.01});
assert.deepEqual(out.plots[0].values,[null,11,11,null]);
assert.deepEqual(out.plots[1].values,[null,2,2,null]);
assert.deepEqual(out.plots[2].values,[null,null,null,11]);
assert.deepEqual(out.plots[3].values,[null,null,null,13]);
assert.deepEqual(out.plots[4].values,[null,null,null,4]);
assert.deepEqual(out.plots[5].values,[null,null,null,1]);
assert.deepEqual(out.plots[6].values,[null,null,null,3]);
assert.deepEqual(out.plots[7].values,[0,0,0,1]);
assert.deepEqual(out.plots[8].values,[null,null,null,3]);
assert.deepEqual(out.plots[9].values,[null,null,null,1]);
assert.ok(Math.abs(out.plots[10].values[3]-(1.5/11*100))<1e-9);
assert.equal(out.strategy.closedTrades[0].id,"Long-A");
assert.equal(out.strategy.closedTrades[0].commission,0);
console.log("Pine strategy trade history and MFE/MAE accessors: OK");

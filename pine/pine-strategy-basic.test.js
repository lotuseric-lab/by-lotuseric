const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");

const source=`//@version=6
strategy("LOTUSERIC test", initial_capital=1000, pyramiding=1, commission_type=strategy.commission.percent, commission_value=0.1, default_qty_type=strategy.fixed, default_qty_value=2)
if barstate.isfirst
    strategy.entry("Long", strategy.long)
if bar_index == 1
    strategy.close("Long")
plot(strategy.position_size, title="Position")
`;
const parsed=lexPine(source);
assert.deepEqual(parsed.diagnostics,[]);
const ast=parsePine(parsed.tokens);
assert.deepEqual(ast.diagnostics,[]);
const bars=[
  {time:1000,open:10,high:10.5,low:9.5,close:10,volume:100},
  {time:1060,open:11,high:11.5,low:10.5,close:11,volume:100},
  {time:1120,open:12,high:12.5,low:11.5,close:12,volume:100}
];
const out=runPine(ast,bars,{mintick:0.01});
assert.equal(out.metadata.scriptType,"strategy");
assert.deepEqual(out.plots[0].values,[0,2,0]);
assert.equal(out.strategy.fills.length,2);
assert.deepEqual(out.strategy.fills.map(x=>[x.bar,x.kind,x.price,x.qty]),[[1,"entry",11,2],[2,"exit",12,2]]);
assert.equal(out.strategy.closedTrades.length,1);
assert.equal(out.strategy.closedTrades[0].id,"Long");
assert.equal(out.strategy.closedTrades[0].profit,1.954);
assert.equal(out.strategy.netprofit,1.954);
assert.equal(out.strategy.positionSize,0);
assert.equal(out.strategy.closedTrades.length,1);
assert.equal(out.strategy.totalTrades,1);
assert.equal(out.strategy.percentProfitable,100);
assert.equal(out.strategy.averageTrade,1.954);
assert.equal(out.strategy.netprofitPercent,0.1954);
assert.equal(out.strategy.openProfit,0);
console.log("Pine basic strategy market entry/close and performance summary tests: OK");

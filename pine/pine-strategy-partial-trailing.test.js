const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");
function execute(source,bars){
  const front=lexPine(source);assert.deepEqual(front.diagnostics,[]);
  const ast=parsePine(front.tokens);assert.deepEqual(ast.diagnostics,[]);
  return runPine(ast,bars,{mintick:0.01});
}
const bars=[
  {time:1000,open:100,high:101,low:99,close:100,volume:100},
  {time:1060,open:100,high:102,low:99,close:101,volume:100},
  {time:1120,open:101,high:107,low:100,close:106,volume:100},
  {time:1180,open:106,high:107,low:105,close:106,volume:100}
];
const partial=execute(`//@version=6
strategy("Partial exit", default_qty_type=strategy.fixed, default_qty_value=2)
if barstate.isfirst
    strategy.entry("L", strategy.long)
if bar_index == 1
    strategy.exit("Half", "L", limit=105, qty_percent=50)
plot(strategy.position_size)
`,bars);
assert.deepEqual(partial.plots[0].values,[0,2,1,1]);
assert.deepEqual(partial.strategy.fills.map(f=>[f.bar,f.kind,f.qty,f.price]),[[1,"entry",2,100],[2,"exit",1,105]]);
assert.equal(partial.strategy.positionSize,1);
assert.equal(partial.strategy.closedTrades.length,1);
assert.equal(partial.strategy.closedTrades[0].profit,5);

const byQty=execute(`//@version=6
strategy("Absolute partial", default_qty_type=strategy.fixed, default_qty_value=3)
if barstate.isfirst
    strategy.entry("L", strategy.long)
if bar_index == 1
    strategy.exit("One", "L", stop=98, qty=1)
plot(strategy.position_size)
`,[
  bars[0],bars[1],
  {time:1120,open:100,high:102,low:97,close:99,volume:100}
]);
assert.equal(byQty.strategy.fills[1].qty,1);
assert.equal(byQty.strategy.positionSize,2);

const trailing=execute(`//@version=6
strategy("Trailing stop", default_qty_type=strategy.fixed, default_qty_value=1)
if barstate.isfirst
    strategy.entry("L", strategy.long)
if bar_index == 1
    strategy.exit("Trail", "L", trail_points=500, trail_offset=200)
plot(strategy.position_size)
`,[
  bars[0],bars[1],
  {time:1120,open:100,high:108,low:106,close:107,volume:100},
  {time:1180,open:106,high:107,low:105,close:106,volume:100}
]);
assert.equal(trailing.strategy.fills[1].kind,"exit");
assert.equal(trailing.strategy.fills[1].price,106);
assert.equal(trailing.strategy.positionSize,0);
console.log("Pine strategy partial and trailing exit tests: OK");

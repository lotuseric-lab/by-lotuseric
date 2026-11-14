const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");

const source=`//@version=6
strategy("Bracket test", initial_capital=1000, default_qty_type=strategy.fixed, default_qty_value=1)
if barstate.isfirst
    strategy.entry("Long", strategy.long)
if bar_index == 1
    strategy.exit("Bracket", "Long", stop=95, limit=108)
plot(strategy.position_size)
`;
function run(lastBar){
  const parsed=lexPine(source);assert.deepEqual(parsed.diagnostics,[]);
  const ast=parsePine(parsed.tokens);assert.deepEqual(ast.diagnostics,[]);
  return runPine(ast,[
    {time:1000,open:100,high:101,low:99,close:100,volume:100},
    {time:1060,open:100,high:102,low:98,close:101,volume:100},
    {...lastBar,time:1120,volume:100}
  ]);
}
const target=run({open:101,high:109,low:99,close:106});
assert.deepEqual(target.strategy.fills.map(f=>[f.bar,f.kind,f.price]),[[1,"entry",100],[2,"exit",108]]);
assert.equal(target.strategy.closedTrades[0].profit,8);
assert.equal(target.strategy.positionSize,0);
const stop=run({open:100,high:105,low:94,close:96});
assert.deepEqual(stop.strategy.fills.map(f=>[f.bar,f.kind,f.price]),[[1,"entry",100],[2,"exit",95]]);
assert.equal(stop.strategy.closedTrades[0].profit,-5);
console.log("Pine strategy stop/limit exit tests: OK");

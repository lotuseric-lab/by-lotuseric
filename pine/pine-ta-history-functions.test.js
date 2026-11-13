const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");

const source = `//@version=6
indicator("TA history functions")
up = close > open
plot(ta.barssince(up), "Bars since up")
plot(ta.valuewhen(up, close, 0), "Latest up close")
plot(ta.valuewhen(up, close, 1), "Previous up close")
plot(ta.highestbars(close, 3), "Highest offset")
plot(ta.lowestbars(close, 3), "Lowest offset")
`;
const lexed=lexPine(source);
assert.deepEqual(lexed.diagnostics,[]);
const ast=parsePine(lexed.tokens);
assert.deepEqual(ast.diagnostics,[]);
const closes=[2,1,4,3,5,4], opens=[1,2,3,4,4,5];
const bars=closes.map((close,i)=>({time:1700000100+i*60,open:opens[i],high:close+1,low:close-1,close,volume:100}));
const out=runPine(ast,bars,{timeframe:"1",symbol:"TEST"});
assert.deepEqual(out.plots[0].values,[0,1,0,1,0,1]);
assert.deepEqual(out.plots[1].values,[2,2,4,4,5,5]);
assert.deepEqual(out.plots[2].values,[null,null,2,2,4,4]);
assert.deepEqual(out.plots[3].values,[null,null,0,-1,0,-1]);
assert.deepEqual(out.plots[4].values,[null,null,-1,0,-1,0]);
console.log("Pine TA history helper tests: OK");

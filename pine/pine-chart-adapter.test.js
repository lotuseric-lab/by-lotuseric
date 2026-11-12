const assert = require("node:assert/strict");
const { mount, makeData } = require("./pine-chart-adapter.js");
const bars=[{time:10,close:2},{time:20,close:3},{time:30,close:4}];
assert.deepEqual(makeData([1,null,3],bars),[{time:10,value:1},{time:20},{time:30,value:3}]);
const added=[];
const chart={removeSeries(s){s.removed=true;}};
function addChartSeries(target,type,options){const series={target,type,options,data:null,setData(d){this.data=d;}};added.push(series);return series;}
const state=mount({chart,addChartSeries,bars,output:{metadata:{overlay:true,title:"Test"},plots:[{title:"P",color:"#123456",linewidth:2,values:[1,2,3]}],shapes:[{value:true,bar:1,color:"#ff0000"}],hlines:[{value:2},{value:2}],candles:[{type:"candlestick",bar:0,open:1,high:3,low:0,close:2}]}});
assert.equal(added.length,4);
assert.deepEqual(added[0].data,[{time:10,value:1},{time:20,value:2},{time:30,value:3}]);
assert.deepEqual(added[2].data,[{time:10,open:1,high:3,low:0,close:2,color:undefined,wickColor:undefined,borderColor:undefined}]);
assert.deepEqual(added[3].data,[{time:20,value:3,color:"#ff0000"}]);
state.clear();
assert.ok(added.every(x=>x.removed));
console.log("Pine chart adapter tests: OK");

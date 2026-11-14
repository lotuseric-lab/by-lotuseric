const assert = require("node:assert/strict");
const { mount, makeData } = require("./pine-chart-adapter.js");
const bars=[{time:10,close:2},{time:20,close:3},{time:30,close:4}];
assert.deepEqual(makeData([1,null,3],bars),[{time:10,value:1},{time:20},{time:30,value:3}]);
const added=[];
const chart={removeSeries(s){s.removed=true;}};
function addChartSeries(target,type,options){const series={target,type,options,data:null,setData(d){this.data=d;}};added.push(series);return series;}
const state=mount({chart,addChartSeries,bars,output:{metadata:{overlay:true,title:"Test"},plots:[{title:"P",color:"#123456",linewidth:2,values:[1,2,3]}],shapes:[{value:true,bar:1,color:"#ff0000"}],hlines:[{value:2},{value:2}],candles:[{type:"candlestick",bar:0,open:1,high:3,low:0,close:2}]}});
assert.equal(added.length,5);
assert.deepEqual(added[0].data,[{time:10,value:1},{time:20,value:2},{time:30,value:3}]);
assert.deepEqual(added[3].data,[{time:10,open:1,high:3,low:0,close:2,color:undefined,wickColor:undefined,borderColor:undefined}]);
assert.deepEqual(added[4].data,[{time:20,value:3,color:"#ff0000"}]);
state.clear();
assert.ok(added.every(x=>x.removed));
const previousLwc=global.LightweightCharts;
let markerConfig=null,detached=false;
global.LightweightCharts={createSeriesMarkers(series,markers){markerConfig={series,markers};return {detach(){detached=true;}};}};
const priceSeries={id:"price"};
const markerState=mount({chart,addChartSeries,bars,priceSeries,output:{metadata:{overlay:true},plots:[],shapes:[{value:true,bar:1,color:"#00ff00",style:"shape.triangleup",location:"belowbar",text:"AL"},{value:true,bar:2,color:"#ff0000",style:"shape.labeldown",location:"abovebar",text:"SAT"}]}});
assert.equal(markerConfig.series,priceSeries);
assert.equal(markerConfig.markers[0].shape,"arrowUp");
assert.equal(markerConfig.markers[0].position,"belowBar");
assert.equal(markerConfig.markers[0].text,"AL");
assert.equal(markerConfig.markers[1].shape,"arrowDown");
assert.equal(markerConfig.markers[1].position,"aboveBar");
assert.equal(markerConfig.markers[1].text,"SAT");
markerState.clear();
assert.equal(detached,true);
let strategyMarkerConfig=null,strategyDetached=false;
global.LightweightCharts={createSeriesMarkers(series,markers){strategyMarkerConfig={series,markers};return {detach(){strategyDetached=true;}};}};
const strategyPriceSeries={id:"strategy-price"};
const strategyState=mount({chart,addChartSeries,bars,priceSeries:strategyPriceSeries,output:{metadata:{overlay:true},plots:[],strategy:{fills:[
 {bar:0,side:"buy",kind:"entry",price:10,qty:2},
 {bar:2,side:"sell",kind:"exit",price:12,qty:2,profit:4}
]}}});
assert.equal(strategyMarkerConfig.series,strategyPriceSeries);
assert.deepEqual(strategyMarkerConfig.markers,[
 {time:10,position:"belowBar",color:"#22c58b",shape:"arrowUp",text:"LONG",size:2},
 {time:30,position:"aboveBar",color:"#ff647c",shape:"arrowDown",text:"EXIT +4.00",size:2}
]);
strategyState.clear();
assert.equal(strategyDetached,true);
if(previousLwc===undefined)delete global.LightweightCharts;else global.LightweightCharts=previousLwc;

console.log("Pine chart adapter tests: OK");

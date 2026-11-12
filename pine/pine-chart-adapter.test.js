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
if(previousLwc===undefined)delete global.LightweightCharts;else global.LightweightCharts=previousLwc;

console.log("Pine chart adapter tests: OK");

// Drawing routing: overlay=false drawings stay in the oscillator pane unless forceOverlay=true.
{
  const previousDocument=global.document;
  const previousLwc=global.LightweightCharts;
  class FakeElement {
    constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attributes={};this.parentNode=null;this.clientWidth=600;this.removed=false;}
    append(...els){for(const el of els){el.parentNode=this;this.children.push(el);}}
    appendChild(el){this.append(el);return el;}
    setAttribute(k,v){this.attributes[k]=String(v);if(k==="class")this.className=String(v);}
    addEventListener(){}
    remove(){this.removed=true;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}
    getBoundingClientRect(){return {width:600};}
  }
  global.document={
    createElement(tag){return new FakeElement(tag);},
    createElementNS(_ns,tag){return new FakeElement(tag);}
  };
  const makeChart=()=>({
    timeScale(){return {timeToCoordinate(t){return Number(t)*2;}};},
    priceScale(){return {priceToCoordinate(v){return Number(v)*10;}};},
    remove(){}
  });
  global.LightweightCharts={createChart:makeChart};
  const mainChart=makeChart(), priceHost=new FakeElement("div"), paneHost=new FakeElement("div");
  const routeState=mount({
    chart:mainChart,host:paneHost,drawingHost:priceHost,
    addChartSeries(){throw new Error("No series expected in drawing-only test");},
    bars:[{time:10,close:2},{time:20,close:3}],
    output:{
      metadata:{overlay:false,title:"Routing test"},
      lines:[
        {id:1,x1:0,y1:1,x2:1,y2:2,color:"#00ff00",forceOverlay:false},
        {id:2,x1:0,y1:2,x2:1,y2:3,color:"#ff0000",forceOverlay:true}
      ],
      boxes:[],labels:[],linefills:[]
    }
  });
  const priceSvg=priceHost.children.find(x=>x.tagName==="svg");
  const pane= paneHost.children.find(x=>x.className==="oscPane");
  const paneSvg=pane.children.find(x=>x.className==="oscPaneChart").children.find(x=>x.tagName==="svg");
  assert.ok(priceSvg,"forceOverlay drawing should be rendered on the price chart");
  assert.ok(paneSvg,"ordinary drawing should be rendered in the oscillator pane");
  assert.equal(priceSvg.children.length,1);
  assert.equal(paneSvg.children.length,1);
  routeState.clear();
  assert.equal(priceSvg.removed,true,"price drawing SVG should be cleaned up");
  assert.equal(paneSvg.removed,true,"pane drawing SVG should be cleaned up");
  if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
  if(previousLwc===undefined)delete global.LightweightCharts;else global.LightweightCharts=previousLwc;
}


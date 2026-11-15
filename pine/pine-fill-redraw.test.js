const assert = require("node:assert/strict");
const { mount } = require("./pine-chart-adapter.js");

function element(tag) {
  return {
    tag, style:{}, attrs:{}, children:[], className:"",
    append(...items){this.children.push(...items);},
    appendChild(item){this.children.push(item);return item;},
    setAttribute(key,value){this.attrs[key]=String(value);},
    replaceChildren(...items){this.children=items;},
    remove(){this.removed=true;},
  };
}
const previousDocument=global.document;
global.document={createElement:element,createElementNS(_ns,tag){return element(tag);}};
let divisor=10,logicalListener=null,priceListener=null,sizeListener=null,unsubscribed=0;
const timeScale={
  timeToCoordinate(time){return Number(time)/divisor;},
  subscribeVisibleLogicalRangeChange(fn){logicalListener=fn;},
  unsubscribeVisibleLogicalRangeChange(fn){if(logicalListener===fn){logicalListener=null;unsubscribed++;}},
};
const priceScale={
  priceToCoordinate(price){return 100-Number(price);},
  subscribeVisiblePriceRangeChange(fn){priceListener=fn;},
  unsubscribeVisiblePriceRangeChange(fn){if(priceListener===fn){priceListener=null;unsubscribed++;}},
};
const chart={
  removeSeries(){},
  timeScale(){return timeScale;},
  priceScale(){return priceScale;},
  subscribeSizeChange(fn){sizeListener=fn;},
  unsubscribeSizeChange(fn){if(sizeListener===fn){sizeListener=null;unsubscribed++;}},
};
const bars=[{time:100,close:1},{time:200,close:2}];
const drawingHost=element("host");
const output={
  metadata:{overlay:true},
  plots:[{id:1,values:[10,20]},{id:2,values:[5,15]}],
  fills:[{id:1,bar:0,plot1:1,plot2:2,color:"#ff0000"},{id:1,bar:1,plot1:1,plot2:2,color:"#ff0000"}],
};
const state=mount({chart,addChartSeries(){return {setData(){}};},bars,drawingHost,output});
const svg=drawingHost.children[0];
assert.equal(svg.children.length,1);
assert.match(svg.children[0].attrs.points,/10,/);
divisor=5;
logicalListener();
assert.equal(svg.children.length,1,"redraw must replace existing fill polygons");
assert.match(svg.children[0].attrs.points,/20,/,"fill coordinates must update after zoom/scroll");
priceListener();
sizeListener();
state.clear();
assert.equal(unsubscribed,3,"all fill viewport listeners must be detached");
if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
console.log("Pine fill overlay redraw tests: OK");

const assert = require("node:assert/strict");
const { mount } = require("./pine-chart-adapter.js");

function element(tag) {
  return {
    tag, style: {}, attrs: {}, children: [], className: "", textContent: "",
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    insertBefore(item) { this.children.unshift(item); },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    addEventListener() {},
    remove() { this.removed = true; },
  };
}
const previousDocument = global.document;
const previousLwc = global.LightweightCharts;
global.document = {
  createElement: element,
  createElementNS(_ns, tag) { return element(tag); },
};
let paneChart, xDivisor=10, logicalRangeListener=null, priceRangeListener=null, sizeListener=null, unsubscribeCount=0;
const timeScale={
  timeToCoordinate(time){return Number(time)/xDivisor;},
  subscribeVisibleLogicalRangeChange(fn){logicalRangeListener=fn;},
  unsubscribeVisibleLogicalRangeChange(fn){if(logicalRangeListener===fn){logicalRangeListener=null;unsubscribeCount++;}},
};
const priceScale={
  priceToCoordinate(price){return 100-Number(price);},
  subscribeVisiblePriceRangeChange(fn){priceRangeListener=fn;},
  unsubscribeVisiblePriceRangeChange(fn){if(priceRangeListener===fn){priceRangeListener=null;unsubscribeCount++;}},
};
global.LightweightCharts = {
  createChart() {
    paneChart = {
      remove() {},
      removeSeries() {},
      timeScale() { return timeScale; },
      priceScale() { return priceScale; },
      subscribeSizeChange(fn){sizeListener=fn;},
      unsubscribeSizeChange(fn){if(sizeListener===fn){sizeListener=null;unsubscribeCount++;}},
    };
    return paneChart;
  },
};
const chart = { removeSeries() {}, timeScale() { return { timeToCoordinate(time) { return Number(time) / 10; } }; } };
const host = element("div"), drawingHost = element("div");
const bars = [{ time: 10, close: 1 }, { time: 20, close: 2 }, { time: 30, close: 3 }];
const added = [];
function addChartSeries(target, type, options) {
  const series = {
    target, type, options, data: [],
    setData(data) { this.data = data; },
    priceToCoordinate(price) { return 100 - Number(price); },
  };
  added.push(series);
  return series;
}
const state = mount({
  chart, addChartSeries, bars, host, drawingHost,
  output: {
    metadata: { overlay: false, title: "Draw-only pane" },
    plots: [],
    lines: [{ id: 1, x1: 0, y1: -5, x2: 2, y2: 5, xloc: "bar_index", color: "#fff" }],
    labels: [{ id: 2, x: 1, y: 12, xloc: "bar_index", text: "Pane", textcolor: "#fff" }],
    boxes: [{ id: 3, left: 0, right: 2, top: 20, bottom: -10, xloc: "bar_index" }],
    linefills: [],
  },
});
assert.ok(state.paneSvg, "pane drawing SVG should be created even without plot() output");
const anchor = added.find(s => s.target === paneChart);
assert.ok(anchor, "an invisible pane scale anchor should be created");
assert.deepEqual(anchor.data, [{ time: 10, value: -10 }, { time: 30, value: 20 }]);
assert.equal(state.paneSvg.children.length, 3, "line, label and box should render in the pane");
assert.equal(state.paneSvg.children[0].attrs.x1, "1", "initial line x-coordinate should match the chart scale");
xDivisor=5;
logicalRangeListener();
assert.equal(state.paneSvg.children.length, 3, "redraw should replace rather than duplicate SVG drawings");
assert.equal(state.paneSvg.children[0].attrs.x1, "2", "drawing coordinates should update after chart zoom/scroll");
priceRangeListener();
sizeListener();
state.clear();
assert.equal(unsubscribeCount, 3, "chart listeners should be detached when the indicator is removed");
if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
if (previousLwc === undefined) delete global.LightweightCharts; else global.LightweightCharts = previousLwc;
console.log("Pine pane drawing tests: OK");

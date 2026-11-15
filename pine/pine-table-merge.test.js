const assert = require("node:assert/strict");
const { lexPine } = require("./pine-frontend.js");
const { parsePine } = require("./pine-parser.js");
const { runPine } = require("./pine-interpreter.js");
const { mount } = require("./pine-chart-adapter.js");

const source = `//@version=6
indicator("Merged table", overlay=true)
var table t = table.new(position.bottom_left, 3, 2)
if barstate.isfirst
    table.merge_cells(t, 0, 0, 2, 0)
    table.cell(t, 0, 0, "BY LOTUSERIC")
    table.cell(t, 0, 1, "A")
    table.cell(t, 1, 1, "B")
    table.cell(t, 2, 1, "C")
`;
const ast = parsePine(lexPine(source).tokens);
assert.deepEqual(ast.diagnostics, []);
const bars = [{time:1000,open:1,high:2,low:0,close:1,volume:10}];
const output = runPine(ast, bars);
assert.deepEqual(output.tables[0].mergedCells, [{start_column:0,start_row:0,end_column:2,end_row:0}]);

function element(tag) {
  return {tag,style:{},children:[],append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);return item;},setAttribute(){},remove(){},addEventListener(){}};
}
const previousDocument=global.document;
global.document={createElement:element,createElementNS(_ns,tag){return element(tag);}};
const drawingHost=element("host"),chart={removeSeries(){}};
const state=mount({chart,addChartSeries(){return {setData(){}};},bars, drawingHost,output});
const outer=drawingHost.children[0],table=outer.children[0];
assert.equal(outer.style.bottom,"8px","table.new position should anchor the overlay to the requested corner");
assert.equal(outer.style.left,"8px");
assert.equal(outer.style.right,undefined);
assert.equal(table.children[0].children.length,1,"covered cells must be omitted");
assert.equal(table.children[0].children[0].colSpan,3,"merged cell must span three columns");
assert.equal(table.children[0].children[0].textContent,"BY LOTUSERIC");
assert.equal(table.children[1].children.length,3,"unmerged row retains all cells");
state.clear();
if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
console.log("Pine table merge tests: OK");

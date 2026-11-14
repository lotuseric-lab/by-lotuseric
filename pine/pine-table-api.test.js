const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");
const {mount}=require("./pine-chart-adapter.js");

const source=`//@version=6
indicator("Table API")
var table t=table.new(position.top_right,2,2)
if barstate.isfirst
    table.cell(t,0,0,"A")
    table.cell(t,1,0,"B")
    table.cell(t,0,1,"C")
    table.cell(t,1,1,"D")
    table.cell_set_text(t,0,0,"LOTUSERIC")
    table.cell_set_text_color(t,0,0,color.yellow)
    table.cell_set_text_size(t,0,0,size.large)
    table.cell_set_text_halign(t,0,0,"left")
    table.cell_set_text_valign(t,0,0,"top")
    table.set_position(t,position.bottom_right)
    table.set_bgcolor(t,color.black)
    table.set_frame_color(t,color.red)
    table.set_frame_width(t,3)
    table.set_border_color(t,color.blue)
    table.set_border_width(t,2)
    table.clear(t,1,0,1,0)
`;
const parsed=lexPine(source);
assert.deepEqual(parsed.diagnostics,[]);
const ast=parsePine(parsed.tokens);
assert.deepEqual(ast.diagnostics,[]);
const bars=[{time:1000,open:1,high:2,low:0,close:1,volume:10}];
const out=runPine(ast,bars);
const t=out.tables[0];
assert.equal(t.position,"bottom_right");
assert.equal(t.bgcolor,"#000000");
assert.equal(t.frame_color,"#f23645");
assert.equal(t.frame_width,3);
assert.equal(t.border_color,"#0000ff");
assert.equal(t.border_width,2);
assert.equal(t.cells["0:0"].text,"LOTUSERIC");
assert.equal(t.cells["0:0"].text_color,"#fdd835");
assert.equal(t.cells["0:0"].text_size,"large");
assert.equal(t.cells["0:0"].text_halign,"left");
assert.equal(t.cells["0:0"].text_valign,"top");
assert.equal(t.cells["1:0"],undefined,"range clear only removes requested cells");
assert.equal(t.cells["0:1"].text,"C");
assert.equal(t.cells["1:1"].text,"D");

function element(tag){return {tag,style:{},children:[],append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);return item;},setAttribute(){},remove(){},addEventListener(){}};}
const previousDocument=global.document;
global.document={createElement:element,createElementNS(_ns,tag){return element(tag);}};
const host=element("host"),chart={removeSeries(){}};
const state=mount({chart,addChartSeries(){return {setData(){}};},bars,drawingHost:host,output:out});
const overlay=host.children[0];
assert.equal(overlay.style.bottom,"8px");
assert.equal(overlay.style.right,"8px");
const cell=overlay.children[0].children[0].children[0];
assert.equal(cell.textContent,"LOTUSERIC");
assert.equal(cell.style.fontSize,"16px");
state.clear();
if(previousDocument===undefined)delete global.document;else global.document=previousDocument;
console.log("Pine table styling and range clear tests: OK");

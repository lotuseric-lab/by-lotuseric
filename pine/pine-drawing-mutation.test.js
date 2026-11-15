const assert=require("node:assert/strict");
const {lexPine}=require("./pine-frontend.js");
const {parsePine}=require("./pine-parser.js");
const {runPine}=require("./pine-interpreter.js");

const source=`//@version=6
indicator("Drawing mutation API")
var line ln=line.new(0,10,1,11)
var label lb=label.new(0,10,"initial")
var box bx=box.new(0,12,2,8)
if barstate.isfirst
    line.set_xy1(ln,3,13)
    line.set_xy2(ln,8,18)
    line.set_xloc(ln,xloc.bar_time)
    line.set_color(ln,color.red)
    line.set_width(ln,4)
    line.set_style(ln,line.style_dashed)
    line.set_extend(ln,extend.right)
    label.set_xy(lb,4,14)
    label.set_text(lb,"updated")
    label.set_color(lb,color.blue)
    label.set_textcolor(lb,color.yellow)
    label.set_style(lb,label.style_label_down)
    label.set_size(lb,size.large)
    label.set_textalign(lb,"left")
    label.set_tooltip(lb,"detail")
    label.set_xloc(lb,xloc.bar_time)
    label.set_yloc(lb,yloc.price)
    box.set_lefttop(bx,5,20)
    box.set_rightbottom(bx,9,15)
    box.set_bgcolor(bx,color.green)
    box.set_border_color(bx,color.red)
    box.set_border_width(bx,3)
    box.set_border_style(bx,line.style_dotted)
    box.set_extend(bx,extend.both)
    box.set_xloc(bx,xloc.bar_time)
`;
const parsed=lexPine(source);
assert.deepEqual(parsed.diagnostics,[]);
const ast=parsePine(parsed.tokens);
assert.deepEqual(ast.diagnostics,[]);
const bars=[{time:1000,open:10,high:12,low:8,close:11,volume:100}];
const out=runPine(ast,bars);
const ln=out.lines[0],lb=out.labels[0],bx=out.boxes[0];
assert.deepEqual([ln.x1,ln.y1,ln.x2,ln.y2],[3,13,8,18]);
assert.equal(ln.xloc,"bar_time");
assert.equal(ln.color,"#f23645");
assert.equal(ln.width,4);
assert.equal(ln.style,"dashed");
assert.equal(ln.extend,"right");
assert.deepEqual([lb.x,lb.y,lb.text],[4,14,"updated"]);
assert.equal(lb.color,"#2962ff");
assert.equal(lb.textcolor,"#fdd835");
assert.equal(lb.style,"label_down");
assert.equal(lb.size,"large");
assert.equal(lb.textalign,"left");
assert.equal(lb.tooltip,"detail");
assert.equal(lb.xloc,"bar_time");
assert.equal(lb.yloc,"price");
assert.deepEqual([bx.left,bx.top,bx.right,bx.bottom],[5,20,9,15]);
assert.equal(bx.bgcolor,"#089981");
assert.equal(bx.border_color,"#f23645");
assert.equal(bx.border_width,3);
assert.equal(bx.border_style,"dotted");
assert.equal(bx.extend,"both");
assert.equal(bx.xloc,"bar_time");
console.log("Pine drawing mutation API tests: OK");

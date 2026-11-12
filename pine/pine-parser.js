/* BY LOTUSERIC Pine expression and indentation-aware statement parser.
 * Parsing only: source is never evaluated by this module.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByLotusericPineParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const PRECEDENCE = { or:1, and:2, "==":3, "!=":3, "<":3, ">":3, "<=":3, ">=":3, "+":4, "-":4, "*":5, "/":5, "%":5 };
  const ASSIGNMENTS = new Set(["=", ":=", "+=", "-=", "*=", "/=", "%="]);
  const TYPES = new Set(["int","float","bool","string","color","line","label","box","table","linefill","polyline","array","matrix","map"]);
  class PineParseError extends Error {
    constructor(message, token) {
      super(message); this.name="PineParseError"; this.code="PINE_PARSE_UNEXPECTED_TOKEN";
      this.line=token?token.line:1; this.column=token?token.column:1;
    }
  }
  function loc(t) { return {line:t.line,column:t.column}; }
  class ExpressionParser {
    constructor(tokens,start,end) { this.tokens=tokens; this.index=start||0; this.end=end==null?tokens.length:end; }
    peek(n) { return this.tokens[this.index+(n||0)]||null; }
    take() { return this.tokens[this.index++]||null; }
    match(v) { if(this.peek()&&this.peek().value===v){this.index++;return true;}return false; }
    expect(v) { if(!this.match(v))throw new PineParseError("Beklenen '"+v+"'.",this.peek()); }
    parse() { const n=this.parseExpression(0); if(this.index<this.end)throw new PineParseError("İfade sonunda beklenmeyen token: "+this.peek().value,this.peek()); return n; }
    parseExpression(min) {
      let left=this.parsePostfix(this.parsePrefix());
      while(this.index<this.end) {
        const t=this.peek(); if(!t)break;
        if(t.value==="?"&&min<=0){this.take();const yes=this.parseExpression(0);this.expect(":");const no=this.parseExpression(0);left={type:"ConditionalExpression",test:left,consequent:yes,alternate:no,loc:loc(t)};continue;}
        if(t.value==="=>"&&min<=0){this.take();const body=this.parseExpression(0);const params=left.type==="Identifier"?[left]:left.type==="TupleExpression"?left.elements:[left];left={type:"ArrowFunctionExpression",params,body,loc:loc(t)};continue;}
        const p=PRECEDENCE[t.value];if(p==null||p<min)break;this.take();const right=this.parseExpression(p+1);left={type:"BinaryExpression",operator:t.value,left,right,loc:loc(t)};
      }
      return left;
    }
    parsePrefix() {
      const t=this.take();if(!t)throw new PineParseError("İfade bekleniyordu.",null);
      if(t.type==="NUMBER")return {type:"NumericLiteral",value:Number(t.value),raw:t.value,loc:loc(t)};
      if(t.type==="STRING")return {type:"StringLiteral",value:t.value,loc:loc(t)};
      if(t.type==="LITERAL")return {type:"Literal",value:t.value==="na"?null:t.value==="true",raw:t.value,loc:loc(t)};
      if(t.type==="IDENTIFIER")return {type:"Identifier",name:t.value,loc:loc(t)};
      if(["+","-","not"].includes(t.value))return {type:"UnaryExpression",operator:t.value,argument:this.parseExpression(6),loc:loc(t)};
      if(t.value==="(") {
        if(this.match(")"))return {type:"TupleExpression",elements:[],loc:loc(t)};
        const first=this.parseExpression(0);
        if(this.match(",")){const elements=[first];do{if(this.peek()&&this.peek().value===")")break;elements.push(this.parseExpression(0));}while(this.match(","));this.expect(")");return {type:"TupleExpression",elements,loc:loc(t)};}
        this.expect(")");return {type:"GroupExpression",expression:first,loc:loc(t)};
      }
      if(t.value==="["){const elements=[];if(!this.match("]")){do{if(this.peek()&&this.peek().value==="]")break;elements.push(this.parseExpression(0));}while(this.match(","));this.expect("]");}return {type:"ArrayExpression",elements,loc:loc(t)};}
      throw new PineParseError("İfade başında beklenmeyen token: "+t.value,t);
    }
    parsePostfix(base) {
      let n=base;
      while(this.index<this.end){const t=this.peek();
        if(t.value==="."){this.take();const p=this.take();if(!p||p.type!=="IDENTIFIER")throw new PineParseError("Nokta sonrasında alan adı bekleniyor.",p||t);n={type:"MemberExpression",object:n,property:{type:"Identifier",name:p.value,loc:loc(p)},computed:false,loc:loc(t)};}
        else if(t.value==="["){this.take();const p=this.parseExpression(0);this.expect("]");n={type:"MemberExpression",object:n,property:p,computed:true,loc:loc(t)};}
        else if(t.value==="<"){let depth=0,close=-1;for(let j=this.index;j<this.end;j++){if(this.tokens[j].value==="<")depth++;else if(this.tokens[j].value===">"&&--depth===0){close=j;break;}}if(close>=0&&this.tokens[close+1]&&this.tokens[close+1].value==="("){this.index=close+1;}else break;}
        else if(t.value==="("){this.take();const args=[];if(!this.match(")")){do{if(this.peek()&&this.peek().value===")")break;const k=this.peek();if(k&&k.type==="IDENTIFIER"&&this.peek(1)&&this.peek(1).value==="="){this.take();this.take();args.push({type:"NamedArgument",name:k.value,value:this.parseExpression(0),loc:loc(k)});}else args.push(this.parseExpression(0));}while(this.match(","));this.expect(")");}n={type:"CallExpression",callee:n,arguments:args,loc:loc(t)};}
        else break;
      }return n;
    }
  }

  function logicalLines(tokens) {
    const lines=[];let current=[],depth=0,first=null,last=null;
    const flush=()=>{if(current.length){lines.push({tokens:current,indent:current[0].column,line:current[0].line});current=[];first=null;last=null;}};
    for(const t of tokens){
      if(t.type==="EOF"){flush();break;}
      if(t.type==="DIRECTIVE")continue;
      if(t.type==="NEWLINE"){
        if(depth>0)continue;
        const prev=current[current.length-1];
        if(prev&&[",","+","-","*","/","%","=",":=","?","and","or"].includes(prev.value))continue;
        flush();continue;
      }
      if(!first)first=t;
      current.push(t);last=t;
      if(["(","[","{"].includes(t.value))depth++;
      if([")","]","}"].includes(t.value))depth=Math.max(0,depth-1);
    }
    flush();return lines;
  }

  function parsePine(tokens) {
    const lines=logicalLines(tokens),diagnostics=[];let cursor=0;
    function expression(ts,start,end) { return new ExpressionParser(ts,start||0,end==null?ts.length:end).parse(); }
    function parseStatement(line) {
      const ts=line.tokens,first=ts[0],base={loc:loc(first),indent:line.indent};
      if(first.value==="else")return {type:"ElseMarker",...base};
      if(first.value==="type"&&ts[1]&&ts[1].type==="IDENTIFIER")return {type:"TypeDeclaration",name:ts[1].value,fields:[],...base};
      if(first.value==="break"||first.value==="continue")return {type:first.value==="break"?"BreakStatement":"ContinueStatement",...base};
      if(first.value==="switch")return {type:"SwitchStatement",discriminant:ts.length>1?expression(ts,1):null,cases:[],...base};
      const switchAssign=ts.findIndex(t=>ASSIGNMENTS.has(t.value));
      if(switchAssign===1&&ts[switchAssign+1]&&ts[switchAssign+1].value==="switch")return {type:"AssignmentStatement",operator:ts[switchAssign].value,target:{type:"Identifier",name:first.value,loc:loc(first)},value:{type:"SwitchExpression",discriminant:ts.length>switchAssign+2?expression(ts,switchAssign+2):null,cases:[],loc:loc(ts[switchAssign+1])},...base};
      if(first.value==="if"||first.value==="while"){
        const test=expression(ts,1);
        return {type:first.value==="if"?"IfStatement":"WhileStatement",test,body:[],alternate:[],...base};
      }
      if(first.value==="for"){
        const variable=ts[1];if(!variable||variable.type!=="IDENTIFIER")throw new PineParseError("for döngüsünde değişken adı bekleniyor.",first);
        const eq=ts.findIndex(t=>t.value==="="),to=ts.findIndex(t=>t.value==="to"),by=ts.findIndex(t=>t.value==="by"),inAt=ts.findIndex(t=>t.value==="in");
        if(inAt>1){return {type:"ForInStatement",variable:variable.value,iterable:expression(ts,inAt+1),body:[],...base};}
        if(eq===2&&to>eq){return {type:"ForRangeStatement",variable:variable.value,start:expression(ts,3,to),end:expression(ts,to+1,by>to?by:ts.length),step:by>0?expression(ts,by+1):null,body:[],...base};}
        throw new PineParseError("for döngüsü 'for i = başlangıç to bitiş [by adım]' veya 'for x in dizi' biçiminde olmalı.",first);
      }
      // User-defined function declaration: name(arg1, arg2) => expression
      if(first.type==="IDENTIFIER"&&ts[1]&&ts[1].value==="("){
        let close=-1,depth=0;
        for(let j=1;j<ts.length;j++){if(ts[j].value==="(")depth++;if(ts[j].value===")"&&--depth===0){close=j;break;}}
        if(close>0&&ts[close+1]&&ts[close+1].value==="=>"){
          const params=[];
          let segmentStart=2,depthParams=0;
          for(let j=2;j<=close;j++){
            const token=ts[j];
            if(j===close||(token.value===","&&depthParams===0)){
              const segment=ts.slice(segmentStart,j);
              const candidate=[...segment].reverse().find(t=>t.type==="IDENTIFIER");
              if(candidate)params.push({type:"Identifier",name:candidate.value,loc:loc(candidate)});
              segmentStart=j+1;
            }else if(["<","(","["].includes(token.value))depthParams++;
            else if([">",")","]"].includes(token.value))depthParams=Math.max(0,depthParams-1);
          }
          const hasInlineBody=close+2<ts.length;
          return {type:"FunctionDeclaration",name:first.value,params,body:hasInlineBody?expression(ts,close+2):null,bodyStatements:[],...base};
        }
      }
      // Tuple destructuring assignment: [a, b] = expression
      if(first.value==="["||first.value==="("){
        const eq=ts.findIndex(t=>t.value==="=");
        if(eq>0){const target=expression(ts.slice(0,eq));return {type:"DestructuringAssignment",target,value:expression(ts,eq+1),...base};}
      }
      // Typed declaration: var float x = na; float x = na; x = ...
      let assign=ts.findIndex(t=>ASSIGNMENTS.has(t.value));
      if(assign===1&&first.type==="IDENTIFIER"){
        return {type:"AssignmentStatement",operator:ts[1].value,target:{type:"Identifier",name:first.value,loc:loc(first)},value:expression(ts,2),...base};
      }
      if(assign>1&&first.type==="IDENTIFIER"&&ts[1].value==="."&&!ts.slice(0,assign).some(t=>t.value==="(")){
        return {type:"AssignmentStatement",operator:ts[assign].value,target:expression(ts,0,assign),value:expression(ts,assign+1),...base};
      }
      if(first.value==="var"&&ts[1]&&TYPES.has(ts[1].value)&&ts[2]&&ts[2].value==="<"){
        const close=ts.findIndex((t,i)=>i>2&&t.value===">");
        if(close>2&&close+1<assign&&ts[close+1].type==="IDENTIFIER")return {type:"TypedDeclarationStatement",qualifier:"var",valueType:ts.slice(1,close+1).map(t=>t.value).join(""),name:ts[close+1].value,value:expression(ts,assign+1),...base};
      }
      if(first.value==="var"&&ts[1]&&ts[1].type==="IDENTIFIER"&&ts[2]&&ts[2].value==="="){
        return {type:"DeclarationStatement",qualifier:"var",name:ts[1].value,value:expression(ts,3),...base};
      }
      if(first.value==="var"&&ts[1].type==="IDENTIFIER"&&ts[2].type==="IDENTIFIER"&&assign===3){
        return {type:"TypedDeclarationStatement",qualifier:"var",valueType:ts[1].value,name:ts[2].value,value:expression(ts,4),...base};
      }
      if(assign===2&&TYPES.has(first.value)&&ts[1].type==="IDENTIFIER"){
        return {type:"TypedDeclarationStatement",qualifier:null,valueType:first.value,name:ts[1].value,value:expression(ts,3),...base};
      }
      if(assign===2&&first.type==="IDENTIFIER"&&ts[1].type==="IDENTIFIER"&&first.value!=="var"){
        return {type:"DeclarationStatement",qualifier:first.value,name:ts[1].value,value:expression(ts,3),...base};
      }
      return {type:"ExpressionStatement",expression:expression(ts),...base};
    }
    function attachElseChain(node,indent){
      const next=lines[cursor];
      if(!next||next.indent!==indent||next.tokens[0].value!=="else")return;
      const line=lines[cursor++];
      if(line.tokens[1]&&line.tokens[1].value==="if"){
        const nested={type:"IfStatement",test:expression(line.tokens,2),body:[],alternate:[],loc:loc(line.tokens[0]),indent};
        node.alternate=[nested];
        if(lines[cursor]&&lines[cursor].indent>indent)nested.body=parseBlock(indent);
        else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"else if bloğu boş.",line:line.line,column:line.indent});
        attachElseChain(nested,indent);
      }else{
        if(lines[cursor]&&lines[cursor].indent>indent)node.alternate=parseBlock(indent);
        else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"else bloğu boş.",line:line.line,column:line.indent});
      }
    }
    function parseTypeFields(parentIndent){
      const fields=[];
      while(cursor<lines.length&&lines[cursor].indent>parentIndent){
        const line=lines[cursor++],ts=line.tokens;
        if(!ts[0]||!TYPES.has(ts[0].value)||!ts[1]||ts[1].type!=="IDENTIFIER"){
          diagnostics.push({code:"PINE_PARSE_TYPE_FIELD",message:"UDT alanı için tür ve alan adı bekleniyor.",line:line.line,column:line.indent});continue;
        }
        const eq=ts.findIndex(t=>t.value==="=");
        fields.push({name:ts[1].value,valueType:ts[0].value,defaultValue:eq>1?expression(ts,eq+1):null,loc:loc(ts[0])});
      }
      return fields;
    }
    function parseSwitchCases(parentIndent){
      const cases=[];
      while(cursor<lines.length&&lines[cursor].indent>parentIndent){
        const line=lines[cursor++],ts=line.tokens,arrow=ts.findIndex(t=>t.value==="=>");
        if(arrow<0){diagnostics.push({code:"PINE_PARSE_SWITCH_CASE",message:"switch kolunda => bekleniyor.",line:line.line,column:line.indent});continue;}
        const test=arrow===0?null:expression(ts,0,arrow);
        let body=[];
        if(arrow+1<ts.length)body=[{type:"ExpressionStatement",expression:expression(ts,arrow+1),loc:loc(ts[arrow+1]),indent:line.indent}];
        else if(lines[cursor]&&lines[cursor].indent>line.indent)body=parseBlock(line.indent);
        else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"switch case gövdesi boş.",line:line.line,column:line.indent});
        cases.push({test,body,loc:loc(ts[arrow])});
      }
      return cases;
    }
    function parseBlock(parentIndent) {
      const body=[];
      while(cursor<lines.length){
        const line=lines[cursor];
        if(line.indent<=parentIndent)break;
        cursor++;
        try{
          const node=parseStatement(line);
          if(node.type==="ElseMarker"){
            const previous=body[body.length-1];
            if(!previous||previous.type!=="IfStatement"){diagnostics.push({code:"PINE_PARSE_ORPHAN_ELSE",message:"else için eşleşen if bulunamadı.",line:line.line,column:line.indent});continue;}
            if(lines[cursor]&&lines[cursor].indent>line.indent)previous.alternate=parseBlock(line.indent);
            else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"else bloğu boş.",line:line.line,column:line.indent});
            continue;
          }
          if(node.type==="SwitchStatement"||(node.type==="AssignmentStatement"&&node.value&&node.value.type==="SwitchExpression")){node.type==="SwitchStatement"?node.cases=parseSwitchCases(line.indent):node.value.cases=parseSwitchCases(line.indent);}
          if(node.type==="TypeDeclaration")node.fields=parseTypeFields(line.indent);
          if(node.type==="FunctionDeclaration"&&lines[cursor]&&lines[cursor].indent>line.indent)node.bodyStatements=parseBlock(line.indent);
          if(["IfStatement","WhileStatement","ForRangeStatement","ForInStatement"].includes(node.type)){
            if(lines[cursor]&&lines[cursor].indent>line.indent)node.body=parseBlock(line.indent);
            else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"Kontrol bloğu için girintili gövde bekleniyor.",line:line.line,column:line.indent});
            if(node.type==="IfStatement")attachElseChain(node,line.indent);
          }
          body.push(node);
        }catch(error){diagnostics.push({code:error.code||"PINE_PARSE_ERROR",message:error.message,line:error.line||line.line,column:error.column||line.indent});}
      }
      return body;
    }
    const body=[];
    while(cursor<lines.length){
      const line=lines[cursor++];
      try{
        const node=parseStatement(line);
        if(node.type==="ElseMarker"){diagnostics.push({code:"PINE_PARSE_ORPHAN_ELSE",message:"else için eşleşen if bulunamadı.",line:line.line,column:line.indent});continue;}
        if(node.type==="SwitchStatement"){node.cases=parseSwitchCases(line.indent);}
        if(node.type==="TypeDeclaration")node.fields=parseTypeFields(line.indent);
        if(node.type==="FunctionDeclaration"&&lines[cursor]&&lines[cursor].indent>line.indent)node.bodyStatements=parseBlock(line.indent);
        if(["IfStatement","WhileStatement","ForRangeStatement","ForInStatement"].includes(node.type)){
          if(lines[cursor]&&lines[cursor].indent>line.indent)node.body=parseBlock(line.indent);
          else diagnostics.push({code:"PINE_PARSE_EMPTY_BLOCK",message:"Kontrol bloğu için girintili gövde bekleniyor.",line:line.line,column:line.indent});
          if(node.type==="IfStatement")attachElseChain(node,line.indent);
        }
        body.push(node);
      }catch(error){diagnostics.push({code:error.code||"PINE_PARSE_ERROR",message:error.message,line:error.line||line.line,column:error.column||line.indent});}
    }
    return {type:"Program",body,diagnostics};
  }
  return {PineParseError,ExpressionParser,parsePine};
});

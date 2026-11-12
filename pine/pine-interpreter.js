/* BY LOTUSERIC Pine AST evaluator — deterministic indicator execution.
 * Executes only parsed AST nodes; never uses eval/Function or dynamic code generation.
 * Strategy order APIs are intentionally unsupported.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ByLotusericPineInterpreter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NA = null;
  const isNA = v => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
  const num = v => isNA(v) ? NaN : Number(v);
  const truth = v => !isNA(v) && !!v;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  
  class PineExecutionError extends Error {
    constructor(message, node, code) {
      super(message);
      this.name = "PineExecutionError";
      this.code = code || "PINE_RUNTIME_ERROR";
      this.line = node && node.loc ? node.loc.line : 1;
      this.column = node && node.loc ? node.loc.column : 1;
    }
  }
  class SeriesRef {
    constructor(values) { this.values = values; }
    get current() { return this.values.length ? this.values[this.values.length - 1] : NA; }
    at(offset) {
      if (!Number.isInteger(offset) || offset < 0) throw new RangeError("Geçmiş indeksi negatif olmayan tam sayı olmalı.");
      const i = this.values.length - 1 - offset;
      return i < 0 ? NA : this.values[i];
    }
  }
  class Scope {
    constructor(parent) { this.parent = parent || null; this.values = Object.create(null); }
    has(name) { return Object.prototype.hasOwnProperty.call(this.values, name) || !!(this.parent && this.parent.has(name)); }
    get(name) { if (Object.prototype.hasOwnProperty.call(this.values, name)) return this.values[name]; return this.parent ? this.parent.get(name) : undefined; }
    define(name, value) { this.values[name] = value; return value; }
    set(name, value) {
      if (Object.prototype.hasOwnProperty.call(this.values, name)) { this.values[name] = value; return value; }
      if (this.parent && this.parent.has(name)) return this.parent.set(name, value);
      this.values[name] = value; return value;
    }
  }
  function value(v) { return v instanceof SeriesRef ? v.current : v; }
  function seriesValues(v) { return v instanceof SeriesRef ? v.values : [value(v)]; }
  function rolling(src, length, fn) {
    const a = seriesValues(src), n = Math.trunc(num(value(length)));
    if (!Number.isFinite(n) || n < 1) throw new RangeError("Periyot pozitif tam sayı olmalı.");
    if (a.length < n) return NA;
    const w = a.slice(-n);
    if (w.some(isNA)) return NA;
    return fn(w);
  }
  function sma(src, length) { return rolling(src, length, w => w.reduce((s,x)=>s+num(x),0)/w.length); }
  function highest(src, length) { return rolling(src, length, w => Math.max(...w.map(num))); }
  function lowest(src, length) { return rolling(src, length, w => Math.min(...w.map(num))); }
  function ema(src, length) {
    const a=seriesValues(src), n=Math.trunc(num(value(length)));
    if(!Number.isFinite(n)||n<1)throw new RangeError("EMA periyodu pozitif tam sayı olmalı.");
    const alpha=2/(n+1); let prev=NA;
    for(let i=0;i<a.length;i++){
      const x=a[i]; if(isNA(x)) continue;
      if(isNA(prev)){ if(i+1>=n){const w=a.slice(i+1-n,i+1);if(!w.some(isNA))prev=w.reduce((s,z)=>s+num(z),0)/n;} }
      else prev=alpha*num(x)+(1-alpha)*prev;
    }
    return prev;
  }
  function rma(src,length){
    const a=seriesValues(src),n=Math.trunc(num(value(length)));
    if(!Number.isFinite(n)||n<1)throw new RangeError("RMA periyodu pozitif tam sayı olmalı.");
    let prev=NA;
    for(let i=0;i<a.length;i++){
      if(isNA(a[i]))continue;
      if(isNA(prev)){if(i+1>=n){const w=a.slice(i+1-n,i+1);if(!w.some(isNA))prev=w.reduce((s,z)=>s+num(z),0)/n;}}
      else prev=(prev*(n-1)+num(a[i]))/n;
    }
    return prev;
  }
  function change(src, length) {
    const n=length===undefined?1:Math.trunc(num(value(length)));
    if(n<0||!Number.isFinite(n))throw new RangeError("change uzunluğu geçersiz.");
    const a=seriesValues(src); return a.length<=n?NA:num(a[a.length-1])-num(a[a.length-1-n]);
  }
  function trueRange(ctx) {
    const i=ctx.index,b=ctx.bars[i]; if(i===0)return b.high-b.low;
    const p=ctx.bars[i-1].close; return Math.max(b.high-b.low,Math.abs(b.high-p),Math.abs(b.low-p));
  }
  function rsi(src,length) {
    const a=seriesValues(src),n=Math.trunc(num(value(length)));
    if(n<1||!Number.isFinite(n))throw new RangeError("RSI periyodu geçersiz.");
    if(a.length<=n)return NA;
    let gains=[],losses=[];
    for(let i=1;i<a.length;i++){if(isNA(a[i])||isNA(a[i-1])){gains.push(NA);losses.push(NA);}else{const d=num(a[i])-num(a[i-1]);gains.push(Math.max(d,0));losses.push(Math.max(-d,0));}}
    const ag=rma(new SeriesRef(gains),n),al=rma(new SeriesRef(losses),n);
    if(isNA(ag)||isNA(al))return NA;if(al===0)return 100;if(ag===0)return 0;return 100-100/(1+ag/al);
  }
  function atr(ctx,length) {
    const tr=[]; for(let i=0;i<=ctx.index;i++){const b=ctx.bars[i];if(i===0)tr.push(b.high-b.low);else{const p=ctx.bars[i-1].close;tr.push(Math.max(b.high-b.low,Math.abs(b.high-p),Math.abs(b.low-p)));}}
    return rma(new SeriesRef(tr),length);
  }
  function cross(a,b,dir) {
    const av=seriesValues(a),bv=seriesValues(b),n=Math.min(av.length,bv.length);
    if(n<2)return false;
    const x=av[n-1],y=bv[n-1],px=av[n-2],py=bv[n-2];
    if([x,y,px,py].some(isNA))return false;
    return dir>0?num(x)>num(y)&&num(px)<=num(py):dir<0?num(x)<num(y)&&num(px)>=num(py):(num(x)>num(y)&&num(px)<=num(py))||(num(x)<num(y)&&num(px)>=num(py));
  }
  function createBuiltins(ctx, outputs, inputs, options) {
    const math = {
      abs:x=>Math.abs(num(value(x))), acos:x=>Math.acos(num(value(x))), asin:x=>Math.asin(num(value(x))),
      atan:x=>Math.atan(num(value(x))), ceil:x=>Math.ceil(num(value(x))), cos:x=>Math.cos(num(value(x))),
      exp:x=>Math.exp(num(value(x))), floor:x=>Math.floor(num(value(x))), log:x=>Math.log(num(value(x))),
      log10:x=>Math.log10(num(value(x))), max:(...a)=>Math.max(...a.map(x=>num(value(x)))),
      min:(...a)=>Math.min(...a.map(x=>num(value(x)))), pow:(a,b)=>Math.pow(num(value(a)),num(value(b))),
      round:(x,p)=>{const k=Math.pow(10,p===undefined?0:num(value(p)));return Math.round(num(value(x))*k)/k;},
      sign:x=>Math.sign(num(value(x))), sin:x=>Math.sin(num(value(x))), sqrt:x=>Math.sqrt(num(value(x))),
      tan:x=>Math.tan(num(value(x))), toDegrees:x=>num(value(x))*180/Math.PI,
      toRadians:x=>num(value(x))*Math.PI/180, PI:Math.PI, E:Math.E, PHI:(1+Math.sqrt(5))/2
    };
    const ta = {
      sma, ema, rma, wma:(s,l)=>rolling(s,l,w=>w.reduce((z,x,i)=>z+num(x)*(i+1),0)/(w.length*(w.length+1)/2)),
      vwma:(s,l)=>{const a=seriesValues(s),v=seriesValues(new SeriesRef(ctx.bars.slice(0,ctx.index+1).map(b=>b.volume))),n=Math.trunc(num(value(l)));if(a.length<n)return NA;const x=a.slice(-n),y=v.slice(-n);if(x.some(isNA)||y.some(isNA))return NA;const d=y.reduce((z,q)=>z+num(q),0);return d===0?NA:x.reduce((z,q,i)=>z+num(q)*num(y[i]),0)/d;},
      highest, lowest, highestbars:(s,l)=>{const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<n)return NA;const w=a.slice(-n),m=Math.max(...w.map(num));return w.lastIndexOf(m)-w.length+1;},
      lowestbars:(s,l)=>{const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<n)return NA;const w=a.slice(-n),m=Math.min(...w.map(num));return w.lastIndexOf(m)-w.length+1;},
      rsi, atr:l=>atr(ctx,l), tr:()=>trueRange(ctx), change, mom:(s,l)=>change(s,l),
      stdev:(s,l)=>rolling(s,l,w=>{const m=w.reduce((z,x)=>z+num(x),0)/w.length;return Math.sqrt(w.reduce((z,x)=>z+Math.pow(num(x)-m,2),0)/w.length);}),
      variance:(s,l)=>rolling(s,l,w=>{const m=w.reduce((z,x)=>z+num(x),0)/w.length;return w.reduce((z,x)=>z+Math.pow(num(x)-m,2),0)/w.length;}),
      crossover:(a,b)=>cross(a,b,1), crossunder:(a,b)=>cross(a,b,-1), cross:(a,b)=>cross(a,b,0),
      barssince:s=>{const a=seriesValues(s);for(let i=a.length-1;i>=0;i--)if(truth(a[i]))return a.length-1-i;return NA;},
      valuewhen:(cond,src,occ)=>{const c=seriesValues(cond),s=seriesValues(src),o=Math.max(0,Math.trunc(num(value(occ||0))));let found=0;for(let i=c.length-1;i>=0;i--)if(truth(c[i])){if(found++===o)return s[i];}return NA;},
      falling:(s,l)=>{const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<=n)return false;for(let i=a.length-n+1;i<a.length;i++)if(num(a[i])>=num(a[i-1]))return false;return true;},
      rising:(s,l)=>{const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<=n)return false;for(let i=a.length-n+1;i<a.length;i++)if(num(a[i])<=num(a[i-1]))return false;return true;},
      barssince: s=>{const a=seriesValues(s);for(let i=a.length-1;i>=0;i--)if(truth(a[i]))return a.length-1-i;return NA;}
    };
    const input = {};
    for(const kind of ["int","float","bool","string","source","color","timeframe","symbol"]){
      input[kind]=(def, ...rest)=>{
        const cfg=rest.reduce((o,x)=>{if(x&&typeof x==="object"&&!Array.isArray(x))Object.assign(o,x);return o;},{});
        const title=cfg.title||(typeof rest[0]==="string"?rest[0]:"")||cfg.tooltip||"";
        const key=String(title||("input_"+Object.keys(inputs).length));
        if(!Object.prototype.hasOwnProperty.call(inputs,key))inputs[key]=def;
        return inputs[key];
      };
    }
    const color = {new:(c,t)=>{const raw=String(value(c)||"#2962ff");const alpha=1-clamp(num(value(t)||0),0,100)/100;return /^#[0-9a-f]{6}$/i.test(raw)?raw+Math.round(alpha*255).toString(16).padStart(2,"0"):raw;},rgb:(r,g,b,t)=>"rgba("+[r,g,b].map(x=>clamp(Math.round(num(value(x))),0,255)).join(",") + ","+(1-clamp(num(value(t)||0),0,100)/100)+")",red:"#f23645",lime:"#089981",green:"#089981",blue:"#2962ff",orange:"#ff9800",yellow:"#fdd835",purple:"#9c27b0",white:"#ffffff",black:"#000000",gray:"#787b86",grey:"#787b86",teal:"#00897b",aqua:"#00bcd4",fuchsia:"#e040fb",silver:"#bdbdbd",maroon:"#880e4f",navy:"#000080",transparent:"rgba(0,0,0,0)"};
    const builtins = {
      na:()=>NA, nafn:()=>NA, nz:(x,repl)=>isNA(value(x))?(repl===undefined?0:value(repl)):value(x),
      math, ta, input, color,
      indicator:(title,...args)=>{outputs.metadata.title=value(title)||"Pine Indicator";for(const a of args)if(a&&a.__named)outputs.metadata[a.name]=value(a.value);return null;}, study:(title,...args)=>{outputs.metadata.title=value(title)||"Pine Study";for(const a of args)if(a&&a.__named)outputs.metadata[a.name]=value(a.value);return null;},
      plot:(v,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);else if(typeof x==="string"&&!o.title)o.title=x;else if(x&&typeof x==="object")Object.assign(o,x);return o;},{});const k=outputs._plotCallIndex++;let p=outputs.plots[k];if(!p){p={title:cfg.title||"Plot "+(k+1),color:cfg.color||"#2962ff",style:cfg.style||"line",linewidth:cfg.linewidth||1,values:[]};outputs.plots[k]=p;}p.values.push(value(v));return null;},
      plotshape:(v,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);return o;},{});outputs.shapes.push({value:truth(value(v)),bar:ctx.index,title:cfg.title||"",color:cfg.color||"#2962ff",style:cfg.style||"shape.triangleup",location:cfg.location||"abovebar",text:cfg.text||""});return null;},
      plotchar:(v,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);return o;},{});outputs.shapes.push({value:truth(value(v)),bar:ctx.index,title:cfg.title||"",color:cfg.color||"#2962ff",char:cfg.char||"•",location:cfg.location||"abovebar",text:cfg.text||""});return null;},
      hline:(v,...args)=>{outputs.hlines.push({value:value(v),args:args.map(value)});return null;},
      alertcondition:()=>null, alert:()=>null,
      barcolor:()=>null, bgcolor:()=>null, fill:()=>null,
      nz: (v,r)=>isNA(value(v))?(r===undefined?0:value(r)):value(v),
      minval:x=>x, maxval:x=>x, timestamp:()=>NA, time:()=>ctx.bar?ctx.bar.time:NA
    };
    return builtins;
  }
  function namedArg(name,v){return {__named:true,name,value:v};}
  function runPine(ast,bars,opts) {
    opts=opts||{};
    if(!ast||ast.type!=="Program")throw new TypeError("Geçerli Pine AST bekleniyor.");
    if(ast.diagnostics&&ast.diagnostics.length)throw new PineExecutionError("Kaynakta parse hataları var: "+ast.diagnostics[0].message,ast.diagnostics[0],"PINE_PARSE_ERROR");
    const cleanBars=bars.map((b,i)=>{const o={};for(const k of ["open","high","low","close","volume","time"]){const n=Number(b[k]);if(!Number.isFinite(n))throw new PineExecutionError("Geçersiz "+k+" verisi ("+i+").");o[k]=n;}return Object.freeze(o);});
    const outputs={plots:[],shapes:[],hlines:[],labels:[],lines:[],boxes:[],tables:[],diagnostics:[],inputs:{},metadata:{}};
    const inputValues=Object.assign(Object.create(null),opts.inputs||{});
    const global=new Scope();
    const vars=Object.create(null),persistent=Object.create(null),functions=Object.create(null);
    const builtins=createBuiltins({bars:cleanBars,get index(){return currentIndex;}},outputs,inputValues,opts);
    let currentIndex=-1,steps=0;
    const maxSteps=opts.maxSteps||100000;
    function tick(node){if(++steps>maxSteps)throw new PineExecutionError("Çalıştırma adım sınırı aşıldı.",node,"PINE_EXECUTION_LIMIT");}
    function series(name){if(!vars[name])vars[name]=[];return new SeriesRef(vars[name]);}
    function envGet(scope,name){
      if(scope.has(name))return scope.get(name);
      if(["open","high","low","close","volume","time"].includes(name))return series(name);
      if(name==="bar_index")return currentIndex;
      if(name==="true")return true;if(name==="false")return false;
      if(Object.prototype.hasOwnProperty.call(builtins,name))return builtins[name];
      if(Object.prototype.hasOwnProperty.call(functions,name))return functions[name];
      throw new PineExecutionError("Tanımsız isim: "+name,null,"PINE_UNDEFINED_IDENTIFIER");
    }
    function evalExpr(n,scope){
      tick(n);if(!n)return NA;
      switch(n.type){
        case "NumericLiteral":case "StringLiteral":return n.value;
        case "Literal":return n.value;
        case "GroupExpression":return evalExpr(n.expression,scope);
        case "Identifier":return n.name==="na"?NA:envGet(scope,n.name);
        case "ArrayExpression":return n.elements.map(x=>value(evalExpr(x,scope)));
        case "TupleExpression":return n.elements.map(x=>value(evalExpr(x,scope)));
        case "UnaryExpression":{const a=value(evalExpr(n.argument,scope));if(n.operator==="-")return -num(a);if(n.operator==="+")return num(a);if(n.operator==="not")return !truth(a);break;}
        case "BinaryExpression":{
          const l=evalExpr(n.left,scope),lv=value(l);
          if(n.operator==="and"&&!truth(lv))return false;if(n.operator==="or"&&truth(lv))return true;
          const r=evalExpr(n.right,scope),rv=value(r);
          switch(n.operator){case "+":return typeof lv==="string"||typeof rv==="string"?String(lv)+String(rv):num(lv)+num(rv);case "-":return num(lv)-num(rv);case "*":return num(lv)*num(rv);case "/":return num(rv)===0?NA:num(lv)/num(rv);case "%":return num(rv)===0?NA:num(lv)%num(rv);case "==":return lv===rv;case "!=":return lv!==rv;case "<":return num(lv)<num(rv);case ">":return num(lv)>num(rv);case "<=":return num(lv)<=num(rv);case ">=":return num(lv)>=num(rv);case "and":return truth(lv)&&truth(rv);case "or":return truth(lv)||truth(rv);}
          break;
        }
        case "ConditionalExpression":return truth(value(evalExpr(n.test,scope)))?evalExpr(n.consequent,scope):evalExpr(n.alternate,scope);
        case "MemberExpression":{
          const obj=evalExpr(n.object,scope);
          if(n.computed){const idx=Math.trunc(num(value(evalExpr(n.property,scope))));if(obj instanceof SeriesRef)return obj.at(idx);if(Array.isArray(obj))return idx>=0&&idx<obj.length?obj[idx]:NA;throw new PineExecutionError("Bu değer geçmiş/indeks erişimini desteklemiyor.",n);}
          if(obj==null)throw new PineExecutionError("Boş değer üzerinde alan erişimi.",n);
          if(typeof obj==="object"&&n.property&&Object.prototype.hasOwnProperty.call(obj,n.property.name))return obj[n.property.name];
          throw new PineExecutionError("Desteklenmeyen alan: "+(n.property&&n.property.name),n);
        }
        case "CallExpression":{
          const fn=n.callee&&n.callee.type==="Identifier"&&n.callee.name==="na"?builtins.na:evalExpr(n.callee,scope);if(typeof fn!=="function")throw new PineExecutionError("Çağrılan ifade fonksiyon değil.",n);
          const args=n.arguments.map(a=>a.type==="NamedArgument"?namedArg(a.name,evalExpr(a.value,scope)):evalExpr(a,scope));
          return fn(...args);
        }
        case "ArrowFunctionExpression":return {params:n.params.map(p=>p.name),body:n.body,scope};
      }
      throw new PineExecutionError("Desteklenmeyen ifade düğümü: "+n.type,n,"PINE_UNSUPPORTED_AST");
    }
    function assignTarget(target,v,scope,node){
      if(target.type==="Identifier"){scope.set(target.name,v);return;}
      if(target.type==="TupleExpression"||target.type==="ArrayExpression"){
        if(!Array.isArray(v))throw new PineExecutionError("Tuple atamasında dizi bekleniyor.",node);
        target.elements.forEach((t,i)=>assignTarget(t,v[i]===undefined?NA:v[i],scope,node));return;
      }
      throw new PineExecutionError("Desteklenmeyen atama hedefi.",node);
    }
    function execBlock(body,scope){
      for(const node of body){tick(node);execStatement(node,scope);}
    }
    function execStatement(n,scope){
      switch(n.type){
        case "ExpressionStatement":evalExpr(n.expression,scope);return;
        case "TypedDeclarationStatement":case "DeclarationStatement":{
          const initial=evalExpr(n.value,scope);const q=n.qualifier||"";
          if(q==="var"||q==="varip"){if(!Object.prototype.hasOwnProperty.call(persistent,n.name))persistent[n.name]=value(initial);scope.define(n.name,persistent[n.name]);}
          else scope.define(n.name,initial);
          return;
        }
        case "AssignmentStatement":{
          const old=scope.get(n.target.name),rhs=evalExpr(n.value,scope);let v=rhs;
          if(n.operator!== "="&&n.operator!==":="){const a=value(old),b=value(rhs);const op=n.operator[0];v=op==="+"?num(a)+num(b):op==="-"?num(a)-num(b):op==="*"?num(a)*num(b):num(b)===0?NA:num(a)/num(b);}
          scope.set(n.target.name,v);if(Object.prototype.hasOwnProperty.call(persistent,n.target.name))persistent[n.target.name]=value(v);return;
        }
        case "DestructuringAssignment":{const v=evalExpr(n.value,scope);assignTarget(n.target,v,scope,n);return;}
        case "FunctionDeclaration":{
          functions[n.name]=( ...args )=>{const local=new Scope(scope);n.params.forEach((p,i)=>local.define(p.name,value(args[i])));return evalExpr(n.body,local);};return;
        }
        case "IfStatement":if(truth(value(evalExpr(n.test,scope))))execBlock(n.body,new Scope(scope));else execBlock(n.alternate||[],new Scope(scope));return;
        case "WhileStatement":{let count=0;while(truth(value(evalExpr(n.test,scope)))){if(++count>10000)throw new PineExecutionError("while döngüsü sınırı aşıldı.",n);try{execBlock(n.body,new Scope(scope));}catch(e){if(e&&e.__pineBreak)break;if(e&&e.__pineContinue)continue;throw e;}}return;}
        case "ForRangeStatement":{
          const start=Math.trunc(num(value(evalExpr(n.start,scope)))),end=Math.trunc(num(value(evalExpr(n.end,scope)))),step=n.step?Math.trunc(num(value(evalExpr(n.step,scope)))):1;
          if(!step)throw new PineExecutionError("for adımı sıfır olamaz.",n);
          const local=new Scope(scope);for(let i=start,ct=0;(step>0?i<=end:i>=end);i+=step){if(++ct>10000)throw new PineExecutionError("for döngüsü sınırı aşıldı.",n);local.set(n.variable,i);try{execBlock(n.body,local);}catch(e){if(e&&e.__pineBreak)break;if(e&&e.__pineContinue)continue;throw e;}}return;
        }
        case "ForInStatement":{
          const list=value(evalExpr(n.iterable,scope));if(!Array.isArray(list))throw new PineExecutionError("for-in koleksiyon bekliyor.",n);
          const local=new Scope(scope);for(const item of list){local.set(n.variable,item);try{execBlock(n.body,local);}catch(e){if(e&&e.__pineBreak)break;if(e&&e.__pineContinue)continue;throw e;}}return;
        }
        case "BreakStatement":{const e=new Error("break");e.__pineBreak=true;throw e;}
        case "ContinueStatement":{const e=new Error("continue");e.__pineContinue=true;throw e;}
        default:throw new PineExecutionError("Desteklenmeyen statement: "+n.type,n,"PINE_UNSUPPORTED_AST");
      }
    }
    // Install OHLCV series progressively; each bar is evaluated in source order.
    const barKeys=["open","high","low","close","volume","time"];
    for(let i=0;i<cleanBars.length;i++){
      currentIndex=i;outputs._plotCallIndex=0;
      for(const k of barKeys){if(!vars[k])vars[k]=[];vars[k].push(cleanBars[i][k]);}
      const barScope=new Scope(global);
      try{execBlock(ast.body,barScope);}
      catch(error){if(error&&error.__pineBreak)throw new PineExecutionError("break yalnızca döngü içinde kullanılabilir.");if(error&&error.__pineContinue)throw new PineExecutionError("continue yalnızca döngü içinde kullanılabilir.");if(error instanceof PineExecutionError)throw error;throw new PineExecutionError(error.message,null);}
      for(const p of outputs.plots){if(p.values.length<=i)p.values.push(NA);}
    }
    delete outputs._plotCallIndex;
    outputs.inputs=inputValues;
    outputs.barCount=cleanBars.length;
    outputs.metadata=Object.assign(outputs.metadata,opts.metadata||{});
    return outputs;
  }

  return {PineExecutionError,SeriesRef,Scope,runPine,isNA,NA};
});

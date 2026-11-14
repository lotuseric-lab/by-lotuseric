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
    constructor(values,indexProvider) { this.values = values; this.indexProvider=indexProvider||null; }
    get index() { return this.indexProvider?this.indexProvider():this.values.length-1; }
    get current() { const i=this.index;return i<0||i>=this.values.length?NA:this.values[i]; }
    at(offset) {
      if (!Number.isInteger(offset) || offset < 0) throw new RangeError("Geçmiş indeksi negatif olmayan tam sayı olmalı.");
      const i = this.index - offset;
      return i < 0 || i>=this.values.length ? NA : this.values[i];
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
  function safeArrayIndex(a,i) { const n=Math.trunc(num(value(i))); if(!Number.isFinite(n)||n<0||n>=a.length) throw new RangeError("Array index out of bounds: "+n); return n; }
  function seriesValues(v) { return v instanceof SeriesRef ? v.values.slice(0,v.index+1) : [value(v)]; }
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
  function timeframeMs(tf){
    const raw=String(tf||"").trim(),x=raw.toUpperCase();
    if(/^\d+$/.test(x))return Number(x)*60000;
    if(/^\d+m$/.test(raw))return Number(raw.slice(0,-1))*60000;
    if(x==="D"||x==="1D")return 86400000;
    if(x==="W"||x==="1W")return 604800000;
    if(x==="M"||x==="1M")return 2592000000;
    const m=x.match(/^(\d+)(S|H|D|W)$/);if(!m)return NaN;
    return Number(m[1])*({S:1000,H:3600000,D:86400000,W:604800000}[m[2]]);
  }
  function aggregateBars(bars,targetMs,baseMs){
    const groups=new Map();
    for(const b of bars){
      const bucket=Math.floor(b.time*1000/targetMs);
      let g=groups.get(bucket);
      if(!g){
        g={time:bucket*targetMs/1000,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume};
        groups.set(bucket,g);
      }else{
        g.high=Math.max(g.high,b.high);
        g.low=Math.min(g.low,b.low);
        g.close=b.close;
        g.volume+=b.volume;
      }
    }
    const out=[...groups.values()];
    // A higher-timeframe candle is usable only after its time bucket has closed.
    // Do not infer completeness from candle counts: feeds can contain legitimate gaps.
    if(Number.isFinite(baseMs)&&targetMs>baseMs&&bars.length){
      const lastBaseClose=bars[bars.length-1].time*1000+baseMs;
      while(out.length&&out[out.length-1].time*1000+targetMs>lastBaseClose)out.pop();
    }
    return out;
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
      highest:(s,l)=>l===undefined?highest(new SeriesRef(ctx.bars.slice(0,ctx.index+1).map(b=>b.high),()=>ctx.index),s):highest(s,l),
      lowest:(s,l)=>l===undefined?lowest(new SeriesRef(ctx.bars.slice(0,ctx.index+1).map(b=>b.low),()=>ctx.index),s):lowest(s,l),
      highestbars:(s,l)=>{if(l===undefined){l=s;s=new SeriesRef(ctx.bars.slice(0,ctx.index+1).map(b=>b.high),()=>ctx.index);}const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<n)return NA;const w=a.slice(-n),m=Math.max(...w.map(num));return w.lastIndexOf(m)-w.length+1;},
      lowestbars:(s,l)=>{if(l===undefined){l=s;s=new SeriesRef(ctx.bars.slice(0,ctx.index+1).map(b=>b.low),()=>ctx.index);}const a=seriesValues(s),n=Math.trunc(num(value(l)));if(a.length<n)return NA;const w=a.slice(-n),m=Math.min(...w.map(num));return w.lastIndexOf(m)-w.length+1;},
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
    function fullEma(src,len){const a=seriesValues(src),out=[];let prev=NA;const n=Math.trunc(num(value(len))),alpha=2/(n+1);for(let i=0;i<a.length;i++){if(isNA(a[i])){out.push(NA);continue;}if(isNA(prev)){if(i+1>=n){const w=a.slice(i+1-n,i+1);if(!w.some(isNA))prev=w.reduce((z,x)=>z+num(x),0)/n;}}else prev=alpha*num(a[i])+(1-alpha)*prev;out.push(prev);}return out;}
    function fullRma(src,len){const a=seriesValues(src),out=[];let prev=NA;const n=Math.trunc(num(value(len)));for(let i=0;i<a.length;i++){if(isNA(a[i])){out.push(NA);continue;}if(isNA(prev)){if(i+1>=n){const w=a.slice(i+1-n,i+1);if(!w.some(isNA))prev=w.reduce((z,x)=>z+num(x),0)/n;}}else prev=(prev*(n-1)+num(a[i]))/n;out.push(prev);}return out;}
    function pivot(src,left,right,highMode){const a=seriesValues(src),l=Math.max(1,Math.trunc(num(value(left)))),r=Math.max(1,Math.trunc(num(value(right)))),i=a.length-1-r;if(i<l||i<0)return NA;const w=a.slice(i-l,i+r+1);if(w.some(isNA))return NA;const v=a[i],ext=highMode?Math.max(...w.map(num)):Math.min(...w.map(num));return num(v)===ext?v:NA;}
    const makeArray=(size,initial,fallback)=>{const n=size===undefined?0:Math.trunc(num(value(size)));if(!Number.isFinite(n)||n<0||n>100000)throw new RangeError("Dizi boyutu 0..100000 arasında olmalı.");return Array.from({length:n},()=>initial===undefined?fallback:value(initial));};
    const arrayIndex=(a,i)=>{const n=Math.trunc(num(value(i)));if(!Number.isFinite(n)||n<0||n>=a.length)throw new RangeError("Array index out of bounds: "+n);return n;};
    const array = {
      new:(size,initial)=>makeArray(size,initial,NA),
      new_float:(size,initial)=>makeArray(size,initial,NA),
      new_int:(size,initial)=>makeArray(size,initial,0),
      new_bool:(size,initial)=>makeArray(size,initial,false),
      new_string:(size,initial)=>makeArray(size,initial,""),
      new_color:(size,initial)=>makeArray(size,initial,NA),new_line:(size,initial)=>makeArray(size,initial,NA),new_label:(size,initial)=>makeArray(size,initial,NA),new_box:(size,initial)=>makeArray(size,initial,NA),
      from:(...items)=>items.map(value),size:a=>a.length,push:(a,v)=>a.push(value(v)),pop:a=>a.pop(),shift:a=>a.shift(),unshift:(a,v)=>a.unshift(value(v)),remove:(a,i)=>a.splice(Math.trunc(num(value(i))),1)[0],
      get:(a,i)=>a[arrayIndex(a,i)],set:(a,i,v)=>{a[arrayIndex(a,i)]=value(v);return a;},remove:(a,i)=>a.splice(arrayIndex(a,i),1)[0],
      clear:a=>{a.length=0;},copy:a=>a.slice(),reverse:a=>a.reverse(),sort:(a,order)=>a.sort((x,y)=>(String(value(order)||"ascending")==="descending"?-1:1)*(num(x)-num(y))),
      sum:a=>a.reduce((z,x)=>z+num(x),0),avg:a=>a.length?a.reduce((z,x)=>z+num(x),0)/a.length:NA,
      min:a=>a.length?Math.min(...a.map(num)):NA,max:a=>a.length?Math.max(...a.map(num)):NA,
      indexof:(a,v)=>a.indexOf(value(v)),includes:(a,v)=>a.includes(value(v)),slice:(a,l,r)=>a.slice(Math.trunc(num(value(l))),r===undefined?undefined:Math.trunc(num(value(r))))
    };
    const mapNS={
      new:()=>new Map(),put:(m,k,v)=>{m.set(value(k),value(v));},get:(m,k,def)=>m.has(value(k))?m.get(value(k)):(def===undefined?NA:value(def)),
      contains:(m,k)=>m.has(value(k)),remove:(m,k)=>m.delete(value(k)),keys:m=>[...m.keys()],values:m=>[...m.values()],size:m=>m.size,clear:m=>m.clear()
    };
    const matrixNS={
      new:(rows,cols,initial)=>{const r=Math.max(0,Math.trunc(num(value(rows)))),c=Math.max(0,Math.trunc(num(value(cols))));if(r*c>100000)throw new RangeError("Matrix boyutu çok büyük.");return {rows:r,cols:c,data:Array.from({length:r},()=>Array(c).fill(initial===undefined?NA:value(initial)))};},
      rows:m=>m.rows,columns:m=>m.cols,get:(m,r,c)=>m.data[Math.trunc(num(value(r)))]?.[Math.trunc(num(value(c)))],set:(m,r,c,v)=>{m.data[Math.trunc(num(value(r)))][Math.trunc(num(value(c)))]=value(v);},
      add_row:(m,row)=>{m.data.push(row?row.slice():Array(m.cols).fill(NA));m.rows++;},add_col:(m,col)=>{for(let r=0;r<m.rows;r++)m.data[r].push(col?value(col[r]):NA);m.cols++;},
      remove_row:(m,r)=>{m.data.splice(Math.trunc(num(value(r))),1);m.rows--;},remove_col:(m,c)=>{for(const row of m.data)row.splice(Math.trunc(num(value(c))),1);m.cols--;},
      fill:(m,v)=>{for(const row of m.data)row.fill(value(v));},copy:m=>({rows:m.rows,cols:m.cols,data:m.data.map(r=>r.slice())}),
      transpose:m=>({rows:m.cols,cols:m.rows,data:Array.from({length:m.cols},(_,c)=>Array.from({length:m.rows},(_,r)=>m.data[r][c]))}),
      sum:m=>m.data.flat().reduce((z,x)=>z+num(x),0)
    };
    const str = {
      tostring:(v,fmt)=>{const x=value(v),f=value(fmt);if(isNA(x))return "NaN";if(f==="mintick"&&Number.isFinite(Number(options.mintick))&&Number(options.mintick)>0){const tick=Number(options.mintick),digits=Math.max(0,Math.min(12,(-Math.floor(Math.log10(tick))+(tick/Math.pow(10,Math.floor(Math.log10(tick)))%1?1:0))));return Number(x).toFixed(digits);}if(f==="percent")return (Number(x)*100).toFixed(2)+"%";return String(x);},length:v=>String(value(v)||"").length,
      lower:v=>String(value(v)||"").toLowerCase(),upper:v=>String(value(v)||"").toUpperCase(),
      contains:(a,b)=>String(value(a)).includes(String(value(b))),startswith:(a,b)=>String(value(a)).startsWith(String(value(b))),
      endswith:(a,b)=>String(value(a)).endsWith(String(value(b))),substring:(a,start,end)=>String(value(a)).slice(Math.trunc(num(value(start))),end===undefined?undefined:Math.trunc(num(value(end)))),
      format:(fmt,...args)=>{let i=0;return String(value(fmt)).replace(/\\{(\d+)\\}/g,(m,n)=>args[Number(n)]===undefined?m:String(value(args[Number(n)])));}
    };
    ta.cci=(src,len)=>{const m=sma(src,len);return rolling(src,len,w=>{const mean=w.reduce((z,x)=>z+num(x),0)/w.length,dev=w.reduce((z,x)=>z+Math.abs(num(x)-mean),0)/w.length;return dev===0?NA:(num(value(src))-mean)/(0.015*dev);});};
    ta.dev=(src,len)=>rolling(src,len,w=>{const mean=w.reduce((z,x)=>z+num(x),0)/w.length;return w.reduce((z,x)=>z+Math.abs(num(x)-mean),0)/w.length;});
    ta.dmi=(diLen,adxSmooth)=>{
      const b=ctx.bars.slice(0,ctx.index+1),n=Math.trunc(num(value(diLen))),smooth=Math.trunc(num(value(adxSmooth)));
      if(!Number.isFinite(n)||n<1||!Number.isFinite(smooth)||smooth<1)throw new RangeError("DMI periyotları pozitif tam sayı olmalı.");
      const plus=[],minus=[],trs=[];
      for(let i=0;i<b.length;i++){
        if(i===0){plus.push(0);minus.push(0);trs.push(b[i].high-b[i].low);continue;}
        const up=b[i].high-b[i-1].high,down=b[i-1].low-b[i].low;
        plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);
        trs.push(Math.max(b[i].high-b[i].low,Math.abs(b[i].high-b[i-1].close),Math.abs(b[i].low-b[i-1].close)));
      }
      // Build the three Wilder-smoothed streams in one pass. The previous
      // implementation recalculated every prefix inside this loop, making DMI
      // cubic over a chart history and stalling multi-timeframe scripts.
      const smoothRma=(values,length)=>{
        const out=[];let previous=NA;
        for(let i=0;i<values.length;i++){
          const current=values[i];
          if(isNA(current)){out.push(previous);continue;}
          if(isNA(previous)){
            if(i+1>=length){
              let sum=0,valid=true;
              for(let j=i+1-length;j<=i;j++){if(isNA(values[j])){valid=false;break;}sum+=num(values[j]);}
              if(valid)previous=sum/length;
            }
          }else previous=(previous*(length-1)+num(current))/length;
          out.push(previous);
        }
        return out;
      };
      const trRma=smoothRma(trs,n),plusRma=smoothRma(plus,n),minusRma=smoothRma(minus,n),dxs=[];
      for(let i=0;i<b.length;i++){
        const trv=trRma[i],pv=plusRma[i],mv=minusRma[i];
        if(isNA(trv)||trv===0||isNA(pv)||isNA(mv)||pv+mv===0){dxs.push(NA);continue;}
        const pdi=100*pv/trv,mdi=100*mv/trv;
        dxs.push(100*Math.abs(pdi-mdi)/(pdi+mdi));
      }
      const last= b.length-1,tr=trRma[last],p=plusRma[last],m=minusRma[last];
      if(isNA(tr)||tr===0||isNA(p)||isNA(m))return [NA,NA,NA];
      const pdi=100*p/tr,mdi=100*m/tr;
      return [pdi,mdi,rma(new SeriesRef(dxs),smooth)];
    };
    ta.highestbars=(src,len)=>{
      const a=seriesValues(src),n=Math.trunc(num(value(len)));
      if(!Number.isFinite(n)||n<1)throw new RangeError("highestbars periyodu pozitif tam sayı olmalı.");
      if(a.length<n)return NA;
      const w=a.slice(-n);if(w.some(isNA))return NA;
      let best=0;for(let i=1;i<w.length;i++)if(num(w[i])>num(w[best]))best=i;
      return best-(n-1);
    };
    ta.lowestbars=(src,len)=>{
      const a=seriesValues(src),n=Math.trunc(num(value(len)));
      if(!Number.isFinite(n)||n<1)throw new RangeError("lowestbars periyodu pozitif tam sayı olmalı.");
      if(a.length<n)return NA;
      const w=a.slice(-n);if(w.some(isNA))return NA;
      let best=0;for(let i=1;i<w.length;i++)if(num(w[i])<num(w[best]))best=i;
      return best-(n-1);
    };
    ta.percentile_nearest_rank=(src,len,percent)=>rolling(src,len,w=>{const sorted=w.map(num).sort((a,b)=>a-b),p=clamp(num(value(percent))/100,0,1);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];});
    ta.percentile_linear_interpolation=(src,len,percent)=>rolling(src,len,w=>{const sorted=w.map(num).sort((a,b)=>a-b),pos=clamp(num(value(percent))/100,0,1)*(sorted.length-1),lo=Math.floor(pos),hi=Math.ceil(pos);return sorted[lo]+(sorted[hi]-sorted[lo])*(pos-lo);});
    ta.correlation=(a,b,len)=>{const x=seriesValues(a),y=seriesValues(b),n=Math.trunc(num(value(len)));if(x.length<n||y.length<n)return NA;const xx=x.slice(-n).map(num),yy=y.slice(-n).map(num);if(xx.some(v=>!Number.isFinite(v))||yy.some(v=>!Number.isFinite(v)))return NA;const mx=xx.reduce((z,v)=>z+v,0)/n,my=yy.reduce((z,v)=>z+v,0)/n;let cov=0,vx=0,vy=0;for(let i=0;i<n;i++){cov+=(xx[i]-mx)*(yy[i]-my);vx+=(xx[i]-mx)**2;vy+=(yy[i]-my)**2;}return vx===0||vy===0?NA:cov/Math.sqrt(vx*vy);};
    ta.macd=(src,fast,slow,signal)=>{const f=fullEma(src,fast),sl=fullEma(src,slow),m=f.map((x,i)=>isNA(x)||isNA(sl[i])?NA:x-sl[i]),sig=fullEma(new SeriesRef(m),signal),i=m.length-1;return [m[i]===undefined?NA:m[i],sig[i]===undefined?NA:sig[i],m[i]===undefined||isNA(sig[i])?NA:m[i]-sig[i]];};
    ta.bb=(src,len,mult)=>{const basis=sma(src,len),sd=rolling(src,len,w=>{const m=w.reduce((z,x)=>z+num(x),0)/w.length;return Math.sqrt(w.reduce((z,x)=>z+(num(x)-m)**2,0)/w.length);}),k=mult===undefined?2:num(value(mult));return [basis,isNA(sd)?NA:basis+k*sd,isNA(sd)?NA:basis-k*sd];};
    ta.stoch=(src,peak,valley,len)=>{const hi=highest(peak,len),lo=lowest(valley,len),x=value(src);return isNA(hi)||isNA(lo)||hi===lo?NA:100*(num(x)-lo)/(hi-lo);};
    ta.pivothigh=(src,l,r)=>pivot(src,l,r,true);ta.pivotlow=(src,l,r)=>pivot(src,l,r,false);
    ta.roc=(src,len)=>{const d=change(src,len),a=seriesValues(src),prev=a.length>Math.trunc(num(value(len)))?num(a[a.length-1-Math.trunc(num(value(len))) ]):NaN;return !Number.isFinite(prev)||prev===0?NA:d/prev*100;};
    ta.cum=src=>seriesValues(src).reduce((z,x)=>z+(isNA(x)?0:num(x)),0);
    ta.linreg=(src,len,offset)=>{const a=seriesValues(src),n=Math.trunc(num(value(len))),off=offset===undefined?0:Math.trunc(num(value(offset)));if(a.length<n||n<2)return NA;const w=a.slice(-n);if(w.some(isNA))return NA;const xm=(n-1)/2,ym=w.reduce((z,x)=>z+num(x),0)/n;let cov=0,vx=0;w.forEach((x,i)=>{cov+=(i-xm)*(num(x)-ym);vx+=(i-xm)**2;});const slope=cov/vx;return ym+slope*((n-1)-off-xm);};
    ta.mfi=(src,len)=>{const p=seriesValues(src),v=ctx.bars.slice(0,ctx.index+1).map(b=>b.volume),n=Math.trunc(num(value(len)));if(p.length<=n)return NA;let pos=0,neg=0;for(let i=p.length-n;i<p.length;i++){const flow=num(p[i])*v[i];if(num(p[i])>num(p[i-1]))pos+=flow;else if(num(p[i])<num(p[i-1]))neg+=flow;}return neg===0?100:100-100/(1+pos/neg);};
    ta.vwap=(src)=>{const p=src?seriesValues(src):ctx.bars.slice(0,ctx.index+1).map(b=>(b.high+b.low+b.close)/3);let pv=0,vol=0;ctx.bars.slice(0,ctx.index+1).forEach((b,i)=>{pv+=num(p[i])*b.volume;vol+=b.volume;});return vol?pv/vol:NA;};

    const strategyState={initialCapital:100000,commissionPercent:0,slippageTicks:0,pyramiding:1,defaultQtyType:"fixed",defaultQtyValue:1,commissionType:"percent",positionSize:0,positionAvgPrice:0,realized:0,grossProfit:0,grossLoss:0,winTrades:0,lossTrades:0,pending:[],exitOrders:[],openTrades:[],closedTrades:[],fills:[],peakEquity:100000,maxDrawdown:0};
    const strategyEquity=()=>strategyState.initialCapital+strategyState.realized+(strategyState.positionSize===0||!ctx.bars[ctx.index]?0:strategyState.positionSize*(ctx.bars[ctx.index].close-strategyState.positionAvgPrice));
    const strategyCommission=notional=>Math.abs(notional)*strategyState.commissionPercent/100;
    const closeStrategyQuantity=(price,bar,reason,requestedQty=Infinity,entryId=null)=>{
      const direction=Math.sign(strategyState.positionSize);
      if(!direction)return 0;
      let remaining=Math.min(Math.abs(strategyState.positionSize),Math.max(0,Number(requestedQty)||0));
      if(!Number.isFinite(remaining))remaining=Math.abs(strategyState.positionSize);
      if(!remaining)return 0;
      let closed=0,realized=0,feesTotal=0;
      const survivors=[];
      for(const trade of strategyState.openTrades){
        if(remaining<=1e-12||entryId!==null&&trade.id!==entryId){survivors.push(trade);continue;}
        const take=Math.min(trade.qty,remaining),gross=(price-trade.entry_price)*take*direction;
        const fees=strategyState.commissionType==="percent"?(strategyCommission(price*take)+strategyCommission(trade.entry_price*take)):0;
        const pnl=gross-fees;
        strategyState.closedTrades.push({...trade,qty:take,exit_bar:bar,exit_price:price,exit_reason:reason,profit:pnl,commission:fees});
        realized+=pnl;feesTotal+=fees;closed+=take;remaining-=take;
        if(trade.qty-take>1e-12)survivors.push({...trade,qty:trade.qty-take});
      }
      if(closed<=0)return 0;
      strategyState.openTrades=survivors;
      strategyState.realized+=realized;
      if(realized>=0){strategyState.grossProfit+=realized;strategyState.winTrades++;}else{strategyState.grossLoss+=Math.abs(realized);strategyState.lossTrades++;}
      const left=Math.max(0,Math.abs(strategyState.positionSize)-closed);
      strategyState.positionSize=left<=1e-12?0:direction*left;
      if(strategyState.positionSize===0){strategyState.positionAvgPrice=0;strategyState.exitOrders=[];}
      else {
        const remainingCost=strategyState.openTrades.reduce((sum,t)=>sum+t.entry_price*t.qty,0);
        strategyState.positionAvgPrice=left?remainingCost/left:0;
      }
      strategyState.fills.push({bar,side:direction>0?"sell":"buy",price,qty:closed,kind:"exit",reason,profit:realized,commission:feesTotal});
      return closed;
    };
    const closeStrategyPosition=(price,bar,reason,entryId=null)=>{
      const qty=entryId===null?Math.abs(strategyState.positionSize):strategyState.openTrades.filter(t=>t.id===entryId).reduce((sum,t)=>sum+t.qty,0);
      return closeStrategyQuantity(price,bar,reason,qty,entryId);
    };
    const updateTradeExcursions=barIndex=>{const bar=ctx.bars[barIndex];if(!bar)return;for(const trade of strategyState.openTrades){const favorable=trade.direction>0?bar.high-trade.entry_price:trade.entry_price-bar.low;const adverse=trade.direction>0?trade.entry_price-bar.low:bar.high-trade.entry_price;trade.maxRunupPerUnit=Math.max(trade.maxRunupPerUnit||0,Math.max(0,favorable));trade.maxDrawdownPerUnit=Math.max(trade.maxDrawdownPerUnit||0,Math.max(0,adverse));}};
    const executeStrategyOrders=barIndex=>{
      const bar=ctx.bars[barIndex],tick=Number(options.mintick)||0.00000001;
      updateTradeExcursions(barIndex);
      if(strategyState.positionSize){
        for(const order of strategyState.exitOrders.slice()){
          if(order.activeFromBar>barIndex)continue;
          const eligible=strategyState.openTrades.filter(t=>!order.fromEntry||t.id===order.fromEntry);
          const eligibleQty=eligible.reduce((sum,t)=>sum+t.qty,0);
          if(!eligibleQty){strategyState.exitOrders=strategyState.exitOrders.filter(o=>o!==order);continue;}
          const isLong=strategyState.positionSize>0;
          let trailActivatedThisBar=false;
          if(order.trailPoints!==null||order.trailOffset!==null||order.trailPrice!==null){
            if(!order.trailActive){
              if(order.trailPrice!==null)order.trailActive=isLong?bar.high>=order.trailPrice:bar.low<=order.trailPrice;
              else {
                const activation=eligible.reduce((v,t)=>isLong?Math.min(v,t.entry_price+order.trailPoints*tick):Math.max(v,t.entry_price-order.trailPoints*tick),isLong?Infinity:-Infinity);
                order.trailActive=isLong?bar.high>=activation:bar.low<=activation;
              }
              if(order.trailActive){order.trailExtreme=isLong?bar.high:bar.low;trailActivatedThisBar=true;}
            }else order.trailExtreme=isLong?Math.max(order.trailExtreme,bar.high):Math.min(order.trailExtreme,bar.low);
          }
          let stop=order.stop,limit=order.limit;
          if(order.trailActive&&order.trailOffset!==null){
            const trailStop=isLong?order.trailExtreme-order.trailOffset*tick:order.trailExtreme+order.trailOffset*tick;
            stop=stop===null?trailStop:(isLong?Math.max(stop,trailStop):Math.min(stop,trailStop));
          }
          const hitStop=stop!==null&&(isLong?bar.low<=stop:bar.high>=stop),hitLimit=limit!==null&&(isLong?bar.high>=limit:bar.low<=limit);
          if(!hitStop&&!hitLimit)continue;
          let useLimit=hitLimit&&!hitStop;
          if(hitLimit&&hitStop){const highFirst=Math.abs(bar.open-bar.high)<=Math.abs(bar.open-bar.low);useLimit=isLong?highFirst:!highFirst;}
          let fill=useLimit?limit:stop;
          if(useLimit){if(isLong&&bar.open>fill)fill=bar.open;if(!isLong&&bar.open<fill)fill=bar.open;}
          else if(!trailActivatedThisBar){if(isLong&&bar.open<fill)fill=bar.open;if(!isLong&&bar.open>fill)fill=bar.open;}
          const qty=order.qty!==null?Math.min(order.qty,eligibleQty):order.qtyPercent!==null?eligibleQty*order.qtyPercent/100:eligibleQty;
          closeStrategyQuantity(fill,barIndex,"strategy.exit:"+order.id,qty,order.fromEntry);
          strategyState.exitOrders=strategyState.exitOrders.filter(o=>o!==order);
          if(!strategyState.positionSize)break;
        }
      }
      const pending=strategyState.pending.splice(0);
      for(const order of pending){
        const side=order.direction>0?1:-1,slip=strategyState.slippageTicks*(Number(options.mintick)||0);
        const fillPrice=bar.open+(side>0?slip:-slip);
        if(order.type==="close"||order.type==="close_all"){
          if(strategyState.positionSize&&(!order.entryId||strategyState.openTrades.some(t=>t.id===order.entryId)))closeStrategyPosition(fillPrice,barIndex,order.id||"close");
          continue;
        }
        if(order.type!=="entry"||!order.direction)continue;
        if(strategyState.positionSize&&Math.sign(strategyState.positionSize)!==side)closeStrategyPosition(fillPrice,barIndex,"reverse");
        if(strategyState.positionSize&&Math.sign(strategyState.positionSize)===side&&strategyState.openTrades.length>=strategyState.pyramiding)continue;
        const qty=Number.isFinite(order.qty)&&order.qty>0?order.qty:(strategyState.defaultQtyType==="percent_of_equity"?(strategyEquity()*strategyState.defaultQtyValue/100)/fillPrice:strategyState.defaultQtyValue);
        if(!(qty>0&&Number.isFinite(qty)))continue;
        const oldQty=Math.abs(strategyState.positionSize),newQty=oldQty+qty;
        strategyState.positionAvgPrice=oldQty?(strategyState.positionAvgPrice*oldQty+fillPrice*qty)/newQty:fillPrice;
        strategyState.positionSize=side*newQty;
        strategyState.openTrades.push({id:order.id,direction:side,entry_bar:barIndex,entry_price:fillPrice,qty,maxRunupPerUnit:0,maxDrawdownPerUnit:0});
        strategyState.fills.push({bar:barIndex,side:side>0?"buy":"sell",price:fillPrice,qty,kind:"entry",id:order.id});
      }
      // Include the entry bar range for positions opened at this bar's open.
      updateTradeExcursions(barIndex);
    };
    const strategyNS=function(title,...args){
      outputs.metadata.title=value(title)||"Pine Strategy";outputs.metadata.scriptType="strategy";
      const cfg=drawCfg(args);
      if(Number.isFinite(Number(cfg.initial_capital)))strategyState.initialCapital=Number(cfg.initial_capital);
      if(Number.isFinite(Number(cfg.commission_value)))strategyState.commissionPercent=Number(cfg.commission_value);
      if(cfg.commission_type!==undefined){if(cfg.commission_type!=="percent"&&Number(cfg.commission_value||0)>0)throw new PineExecutionError("Şimdilik yalnız strategy.commission.percent destekleniyor.",null,"PINE_STRATEGY_COMMISSION");strategyState.commissionType=cfg.commission_type;}
      if(Number.isFinite(Number(cfg.slippage)))strategyState.slippageTicks=Number(cfg.slippage);
      if(Number.isFinite(Number(cfg.pyramiding)))strategyState.pyramiding=Math.max(1,Math.trunc(Number(cfg.pyramiding)));
      if(cfg.default_qty_type==="strategy.percent_of_equity")strategyState.defaultQtyType="percent_of_equity";
      if(Number.isFinite(Number(cfg.default_qty_value)))strategyState.defaultQtyValue=Number(cfg.default_qty_value);
      strategyState.peakEquity=strategyState.initialCapital;return null;
    };
    Object.assign(strategyNS,{
      long:1,short:-1,percent_of_equity:"strategy.percent_of_equity",fixed:"strategy.fixed",commission:{percent:"percent",cash_per_order:"cash_per_order",cash_per_contract:"cash_per_contract"},
      entry:(id,direction,...args)=>{
        const cfg=drawCfg(args),dir=num(value(direction));
        if(cfg.when!==undefined&&!truth(cfg.when))return null;
        if(cfg.limit!==undefined||cfg.stop!==undefined)throw new PineExecutionError("strategy.entry limit/stop emirleri henüz desteklenmiyor; şimdilik piyasa emri kullanın.",null,"PINE_STRATEGY_ORDER_TYPE");
        if(dir!==1&&dir!==-1)throw new PineExecutionError("strategy.entry direction strategy.long veya strategy.short olmalı.",null,"PINE_STRATEGY_DIRECTION");
        const qty=cfg.qty===undefined?NA:num(value(cfg.qty));
        strategyState.pending.push({type:"entry",id:String(value(id)),direction:dir,qty});return null;
      },
      close:(id,...args)=>{
        const cfg=drawCfg(args);if(cfg.when!==undefined&&!truth(cfg.when))return null;
        if(cfg.limit!==undefined)throw new PineExecutionError("strategy.close limit emri henüz desteklenmiyor.",null,"PINE_STRATEGY_ORDER_TYPE");
        strategyState.pending.push({type:"close",id:String(value(id)),entryId:String(value(id))});return null;
      },
      close_all:(...args)=>{const cfg=drawCfg(args);if(cfg.when!==undefined&&!truth(cfg.when))return null;strategyState.pending.push({type:"close_all",id:"close_all"});return null;},
      cancel:id=>{const key=String(value(id));strategyState.pending=strategyState.pending.filter(o=>o.id!==key);},
      cancel_all:()=>{strategyState.pending=[];},
      exit:(id,fromEntry,...args)=>{
        const positional=fromEntry&&fromEntry.__named?[fromEntry,...args]:args;
        const cfg=drawCfg(positional),entryId=cfg.from_entry!==undefined?String(value(cfg.from_entry)):fromEntry===undefined||fromEntry&&fromEntry.__named?null:String(value(fromEntry));
        if(cfg.when!==undefined&&!truth(cfg.when))return null;
        if(cfg.profit!==undefined||cfg.loss!==undefined)throw new PineExecutionError("strategy.exit profit/loss tick tabanlı hedefleri henüz desteklenmiyor; stop/limit fiyatı kullanın.",null,"PINE_STRATEGY_EXIT_MODE");
        const stop=cfg.stop===undefined?null:num(value(cfg.stop)),limit=cfg.limit===undefined?null:num(value(cfg.limit));
        const qty=cfg.qty===undefined?null:num(value(cfg.qty)),qtyPercent=cfg.qty_percent===undefined?null:num(value(cfg.qty_percent));
        if(qty!==null&&(!(qty>0)||!Number.isFinite(qty)))throw new PineExecutionError("strategy.exit qty pozitif olmalı.",null,"PINE_STRATEGY_EXIT_QTY");
        if(qtyPercent!==null&&(!(qtyPercent>0)||qtyPercent>100||!Number.isFinite(qtyPercent)))throw new PineExecutionError("strategy.exit qty_percent 0-100 aralığında olmalı.",null,"PINE_STRATEGY_EXIT_QTY_PERCENT");
        const trailPoints=cfg.trail_points===undefined?null:num(value(cfg.trail_points)),trailOffset=cfg.trail_offset===undefined?null:num(value(cfg.trail_offset)),trailPrice=cfg.trail_price===undefined?null:num(value(cfg.trail_price));
        if((trailPoints!==null||trailPrice!==null)&&trailOffset===null||trailOffset!==null&&trailPoints===null&&trailPrice===null)throw new PineExecutionError("Trailing stop için trail_offset ile trail_points veya trail_price birlikte gerekli.",null,"PINE_STRATEGY_TRAIL_ARGUMENT");
        if(trailOffset!==null&&!(trailOffset>0)||trailPoints!==null&&!(trailPoints>0))throw new PineExecutionError("Trailing stop değerleri pozitif olmalı.",null,"PINE_STRATEGY_TRAIL_VALUE");
        if(stop===null&&limit===null&&trailOffset===null)throw new PineExecutionError("strategy.exit için stop, limit veya geçerli trailing stop gerekli.",null,"PINE_STRATEGY_EXIT_ARGUMENT");
        const order={id:String(value(id)),fromEntry:entryId,stop,limit,qty,qtyPercent,trailPoints,trailOffset,trailPrice,trailActive:false,trailExtreme:null,activeFromBar:ctx.index+1};
        const existing=strategyState.exitOrders.findIndex(o=>o.id===order.id);
        if(existing>=0)strategyState.exitOrders[existing]=order;else strategyState.exitOrders.push(order);
        return null;
      },
      _executeBar:barIndex=>executeStrategyOrders(barIndex),
      _updateBar:()=>{const eq=strategyEquity();strategyState.peakEquity=Math.max(strategyState.peakEquity,eq);strategyState.maxDrawdown=Math.max(strategyState.maxDrawdown,strategyState.peakEquity-eq);},
      _snapshot:()=>{
        const totalTrades=strategyState.closedTrades.length,avgTrade=totalTrades?strategyState.realized/totalTrades:0;
        const profitFactor=strategyState.grossLoss>0?strategyState.grossProfit/strategyState.grossLoss:strategyState.grossProfit>0?Infinity:NA;
        const equity=strategyEquity(),openProfit=strategyState.positionSize&&ctx.bars[ctx.index]?strategyState.positionSize*(ctx.bars[ctx.index].close-strategyState.positionAvgPrice):0;
        return {fills:strategyState.fills.slice(),closedTrades:strategyState.closedTrades.slice(),openTrades:strategyState.openTrades.slice(),exitOrders:strategyState.exitOrders.slice(),
          initialCapital:strategyState.initialCapital,netprofit:strategyState.realized,netprofitPercent:strategyState.initialCapital?strategyState.realized/strategyState.initialCapital*100:NA,
          grossprofit:strategyState.grossProfit,grossloss:strategyState.grossLoss,profitFactor,winTrades:strategyState.winTrades,lossTrades:strategyState.lossTrades,
          percentProfitable:totalTrades?strategyState.winTrades/totalTrades*100:0,averageTrade:avgTrade,totalTrades,
          equity,openProfit,positionSize:strategyState.positionSize,positionAvgPrice:strategyState.positionAvgPrice,
          maxDrawdown:strategyState.maxDrawdown,maxDrawdownPercent:strategyState.peakEquity?strategyState.maxDrawdown/strategyState.peakEquity*100:0};
      }
    });
    const tradeIndex=(collection,index)=>{const i=Math.trunc(num(value(index)));return Number.isInteger(i)&&i>=0&&i<collection.length?collection[i]:null;};
    const tradeTime=index=>Number.isInteger(index)&&ctx.bars[index]?ctx.bars[index].time:NA;
    const closedTradeApi=()=>{
      const api=new Number(strategyState.closedTrades.length);
      const methods={
        entry_price:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.entry_price:NA;},
        entry_bar_index:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.entry_bar:NA;},
        entry_time:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?tradeTime(t.entry_bar):NA;},
        entry_id:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.id:NA;},
        exit_price:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.exit_price:NA;},
        exit_bar_index:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.exit_bar:NA;},
        exit_time:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?tradeTime(t.exit_bar):NA;},
        exit_id:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?(String(t.exit_reason||"").startsWith("strategy.exit:")?String(t.exit_reason).slice(15):t.exit_reason):NA;},
        profit:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.profit:NA;},
        max_runup:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?(t.maxRunupPerUnit||0)*t.qty:NA;},
        max_drawdown:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?(t.maxDrawdownPerUnit||0)*t.qty:NA;},
        max_runup_percent:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t&&t.entry_price?(t.maxRunupPerUnit||0)/t.entry_price*100:NA;},
        max_drawdown_percent:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t&&t.entry_price?(t.maxDrawdownPerUnit||0)/t.entry_price*100:NA;},
        profit_percent:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t&&t.entry_price&&t.qty?t.profit/(Math.abs(t.entry_price*t.qty))*100:NA;},
        commission:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?(t.commission||0):NA;},
        size:i=>{const t=tradeIndex(strategyState.closedTrades,i);return t?t.direction*t.qty:NA;}
      };
      Object.assign(api,methods,{first_index:strategyState.closedTrades.length?0:NA,last_index:strategyState.closedTrades.length?strategyState.closedTrades.length-1:NA});
      return api;
    };
    const openTradeApi=()=>{
      const api=new Number(strategyState.openTrades.length);
      const methods={
        entry_price:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?t.entry_price:NA;},
        entry_bar_index:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?t.entry_bar:NA;},
        entry_time:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?tradeTime(t.entry_bar):NA;},
        entry_id:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?t.id:NA;},
        profit:i=>{const t=tradeIndex(strategyState.openTrades,i);const bar=ctx.bars[ctx.index];return t&&bar?(bar.close-t.entry_price)*t.qty*t.direction:NA;},
        max_runup:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?(t.maxRunupPerUnit||0)*t.qty:NA;},
        max_drawdown:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?(t.maxDrawdownPerUnit||0)*t.qty:NA;},
        max_runup_percent:i=>{const t=tradeIndex(strategyState.openTrades,i);return t&&t.entry_price?(t.maxRunupPerUnit||0)/t.entry_price*100:NA;},
        max_drawdown_percent:i=>{const t=tradeIndex(strategyState.openTrades,i);return t&&t.entry_price?(t.maxDrawdownPerUnit||0)/t.entry_price*100:NA;},
        profit_percent:i=>{const t=tradeIndex(strategyState.openTrades,i);const bar=ctx.bars[ctx.index];return t&&bar&&t.entry_price?(bar.close-t.entry_price)*t.direction/t.entry_price*100:NA;},
        commission:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?strategyCommission(t.entry_price*t.qty):NA;},
        size:i=>{const t=tradeIndex(strategyState.openTrades,i);return t?t.direction*t.qty:NA;}
      };
      Object.assign(api,methods,{first_index:strategyState.openTrades.length?0:NA,last_index:strategyState.openTrades.length?strategyState.openTrades.length-1:NA});
      return api;
    };
    Object.defineProperties(strategyNS,{
      position_size:{get:()=>strategyState.positionSize},position_avg_price:{get:()=>strategyState.positionAvgPrice||NA},
      openprofit:{get:()=>strategyState.positionSize&&ctx.bars[ctx.index]?strategyState.positionSize*(ctx.bars[ctx.index].close-strategyState.positionAvgPrice):0},
      netprofit:{get:()=>strategyState.realized},equity:{get:()=>strategyEquity()},initial_capital:{get:()=>strategyState.initialCapital},
      grossprofit:{get:()=>strategyState.grossProfit},grossloss:{get:()=>strategyState.grossLoss},
      wintrades:{get:()=>strategyState.winTrades},losstrades:{get:()=>strategyState.lossTrades},
      opentrades:{get:()=>openTradeApi()},closedtrades:{get:()=>closedTradeApi()},
      max_drawdown:{get:()=>strategyState.maxDrawdown},
      netprofit_percent:{get:()=>strategyState.initialCapital?strategyState.realized/strategyState.initialCapital*100:NA},
      percent_profitable:{get:()=>strategyState.closedTrades.length?strategyState.winTrades/strategyState.closedTrades.length*100:0},
      profit_factor:{get:()=>strategyState.grossLoss>0?strategyState.grossProfit/strategyState.grossLoss:strategyState.grossProfit>0?Infinity:NA},
      avg_trade:{get:()=>strategyState.closedTrades.length?strategyState.realized/strategyState.closedTrades.length:0},
      fills:{get:()=>strategyState.fills.slice()},closedtrades_data:{get:()=>strategyState.closedTrades.slice()}
    });

    const barstate={isrealtime:false,isconfirmed:true,isnew:true,ishistory:true};Object.defineProperties(barstate,{isfirst:{get:()=>ctx.index===0},islast:{get:()=>ctx.index===ctx.bars.length-1},islastconfirmedhistory:{get:()=>ctx.index===ctx.bars.length-1}});
    Object.defineProperty(ta,"obv",{get:()=>{const b=ctx.bars.slice(0,ctx.index+1),out=[];let total=0;for(let i=0;i<b.length;i++){if(i>0)total+=(b[i].close>b[i-1].close?1:b[i].close<b[i-1].close?-1:0)*b[i].volume;out.push(total);}return new SeriesRef(out);}});
    const input = {};
    for(const kind of ["int","float","bool","string","source","color","timeframe","symbol","session"]){
      input[kind]=(def, ...rest)=>{
        const cfg=rest.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);else if(x&&typeof x==="object"&&!Array.isArray(x))Object.assign(o,x);return o;},{});
        const title=cfg.title||(typeof rest[0]==="string"?rest[0]:"")||cfg.tooltip||"";
        const key=String(title||("input_"+Object.keys(inputs).length));
        if(!Object.prototype.hasOwnProperty.call(inputs,key))inputs[key]=def;
        if(!outputs.inputDefs.some(x=>x.key===key))outputs.inputDefs.push({key,title:key,type:kind,def,min:cfg.minval,max:cfg.maxval,step:cfg.step,options:cfg.options});
        return inputs[key];
      };
    }
    const colorChannel=(input,index)=>{const raw=String(value(input)||"");const hex=raw.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);if(hex)return parseInt(hex[1].slice(index*2,index*2+2),16);const rgba=raw.match(/^rgba?\(([^)]+)\)$/i);if(rgba){const parts=rgba[1].split(",");return clamp(Number(parts[index])||0,0,255);}return NA;};
    const color = {new:(c,t)=>{const raw=String(value(c)||"#2962ff");const alpha=1-clamp(num(value(t)||0),0,100)/100;return /^#[0-9a-f]{6}$/i.test(raw)?raw+Math.round(alpha*255).toString(16).padStart(2,"0"):raw;},from_gradient:(v,min,max,c1,c2)=>{const lo=num(value(min)),hi=num(value(max)),x=num(value(v));if(!Number.isFinite(x)||!Number.isFinite(lo)||!Number.isFinite(hi)||hi===lo)return "rgba(0,0,0,0)";const parse=c=>{const s=String(value(c)||"rgba(0,0,0,0)");const h=s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);if(h)return [parseInt(h[1].slice(0,2),16),parseInt(h[1].slice(2,4),16),parseInt(h[1].slice(4,6),16),h[2]?parseInt(h[2],16)/255:1];const r=s.match(/rgba?\(([^)]+)\)/i);if(r){const a=r[1].split(",").map(Number);return [a[0]||0,a[1]||0,a[2]||0,a.length>3?a[3]:1];}return [0,0,0,0];};const a=parse(c1),b=parse(c2),t=clamp((x-lo)/(hi-lo),0,1),rgb=a.slice(0,3).map((z,i)=>Math.round(z+(b[i]-z)*t)),alpha=a[3]+(b[3]-a[3])*t;return "rgba("+rgb.join(",")+","+alpha+")";},rgb:(r,g,b,t)=>"rgba("+[r,g,b].map(x=>clamp(Math.round(num(value(x))),0,255)).join(",") + ","+(1-clamp(num(value(t)||0),0,100)/100)+")",r:c=>colorChannel(c,0),g:c=>colorChannel(c,1),b:c=>colorChannel(c,2),red:"#f23645",lime:"#089981",green:"#089981",blue:"#2962ff",orange:"#ff9800",yellow:"#fdd835",purple:"#9c27b0",white:"#ffffff",black:"#000000",gray:"#787b86",grey:"#787b86",teal:"#00897b",aqua:"#00bcd4",fuchsia:"#e040fb",silver:"#bdbdbd",maroon:"#880e4f",navy:"#000080",transparent:"rgba(0,0,0,0)"};
    const builtins = {
      na:x=>isNA(value(x)), nafn:x=>isNA(value(x)), nz:(x,repl)=>isNA(value(x))?(repl===undefined?0:value(repl)):value(x), float:x=>isNA(value(x))?NA:num(value(x)), int:x=>isNA(value(x))?NA:Math.trunc(num(value(x))), bool:x=>truth(value(x)), string:x=>isNA(value(x))?"NaN":String(value(x)),
      math, ta, input, color, array, map:mapNS, matrix:matrixNS, str, barstate, chart:{bg_color:String(options.chartBgColor||"#131722")}, timeframe:{period:String(options.timeframe||""),isweekly:/^(1W|1w|W|w)$/.test(String(options.timeframe||"")),isdaily:/^(1D|1d|D|d)$/.test(String(options.timeframe||"")),isintraday:/^([1-9]\d*|[1-9]\d*[m])$/.test(String(options.timeframe||"")),ismonthly:/^(1M|M)$/.test(String(options.timeframe||""))}, syminfo:{ticker:String(options.symbol||""),tickerid:String(options.symbol||""),mintick:Number(options.mintick||0.00000001),basecurrency:"",currency:""},
      format:{mintick:"mintick",price:"price",volume:"volume",percent:"percent",inherit:"inherit"}, order:{ascending:"ascending",descending:"descending"},
      indicator:(title,...args)=>{outputs.metadata.title=value(title)||"Pine Indicator";for(const a of args)if(a&&a.__named)outputs.metadata[a.name]=value(a.value);return null;}, study:(title,...args)=>{outputs.metadata.title=value(title)||"Pine Study";for(const a of args)if(a&&a.__named)outputs.metadata[a.name]=value(a.value);return null;},
      strategy:strategyNS,
      plot:(v,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);else if(typeof x==="string"&&!o.title)o.title=x;else if(x&&typeof x==="object")Object.assign(o,x);return o;},{});const k=outputs._activePlotId;if(k===undefined)throw new PineExecutionError("plot çağrı noktası belirlenemedi.",null,"PINE_PLOT_CALLSITE");let p=outputs.plots.find(x=>x._id===k);if(!p){p={_id:k,id:k,title:cfg.title||"Plot "+(outputs.plots.length+1),color:cfg.color||"#2962ff",style:cfg.style||"line",linewidth:cfg.linewidth||1,values:Array(ctx.index).fill(NA)};outputs.plots.push(p);}outputs._plotValuesThisBar.set(k,value(v));return {__pinePlotRef:true,id:k};},
      plotshape:(v,...args)=>{const cfg={},keys=["title","style","location","color","offset","text","textcolor","editable","size","show_last","display","format","precision","force_overlay"];let p=0;for(const x of args){if(x&&x.__named)cfg[x.name]=value(x.value);else{const k=keys[p++];if(k)cfg[k]=value(x);}}outputs.shapes.push({value:truth(value(v)),bar:ctx.index+num(cfg.offset||0),title:cfg.title||"",color:cfg.color||"#2962ff",style:cfg.style||"shape.triangleup",location:cfg.location||"abovebar",text:cfg.text||"",textcolor:cfg.textcolor||"#ffffff",size:cfg.size||"normal",force_overlay:!!cfg.force_overlay});return null;},
      plotchar:(v,...args)=>{const cfg={},keys=["title","char","location","color","offset","text","textcolor","editable","size","show_last","display","format","precision","force_overlay"];let p=0;for(const x of args){if(x&&x.__named)cfg[x.name]=value(x.value);else{const k=keys[p++];if(k)cfg[k]=value(x);}}outputs.shapes.push({value:truth(value(v)),bar:ctx.index+num(cfg.offset||0),title:cfg.title||"",color:cfg.color||"#2962ff",char:cfg.char||"•",location:cfg.location||"abovebar",text:cfg.text||"",textcolor:cfg.textcolor||"#ffffff",size:cfg.size||"normal",force_overlay:!!cfg.force_overlay});return null;},
      plotcandle:(o,h,l,c,...args)=>{const cfg=args.reduce((z,x)=>{if(x&&x.__named)z[x.name]=value(x.value);return z;},{});outputs.candles.push({type:"candlestick",bar:ctx.index,open:value(o),high:value(h),low:value(l),close:value(c),color:cfg.color||"#22c58b",wickcolor:cfg.wickcolor||cfg.color||"#22c58b",bordercolor:cfg.bordercolor||cfg.color||"#22c58b"});return null;},
      plotbar:(o,h,l,c,...args)=>{const cfg=args.reduce((z,x)=>{if(x&&x.__named)z[x.name]=value(x.value);return z;},{});outputs.candles.push({type:"bar",bar:ctx.index,open:value(o),high:value(h),low:value(l),close:value(c),color:cfg.color||"#22c58b"});return null;},
      hline:(v,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);else if(typeof x==="string"&&!o.title)o.title=x;return o;},{});outputs.hlines.push({value:value(v),color:cfg.color||"#8794a8",linestyle:cfg.linestyle||"solid",title:cfg.title||""});return null;},
      alertcondition:(condition,title,message)=>{if(truth(value(condition)))outputs.alerts.push({bar:ctx.index,title:value(title)||"",message:value(message)||""});return null;}, alert:(message)=>{outputs.alerts.push({bar:ctx.index,message:String(value(message)||"")});return null;},
      barcolor:(c,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);return o;},{});outputs.barColors.push({bar:ctx.index+num(cfg.offset||0),color:value(c)});return null;},
      bgcolor:(c,...args)=>{const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);return o;},{});outputs.bgColors.push({bar:ctx.index+num(cfg.offset||0),color:value(c)});return null;},
      fill:(plot1,plot2,...args)=>{
        const a=value(plot1),b=value(plot2);
        if(!a||!b||a.__pinePlotRef!==true||b.__pinePlotRef!==true)
          throw new PineExecutionError("fill() iki geçerli plot() referansı bekliyor.",null,"PINE_FILL_ARGUMENT");
        const cfg=args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);else if(x&&typeof x==="object")Object.assign(o,x);return o;},{});
        const id=outputs._activeCallId;
        if(id===undefined)throw new PineExecutionError("fill çağrı noktası belirlenemedi.",null,"PINE_FILL_CALLSITE");
        outputs.fills.push({id,bar:ctx.index,plot1:a.id,plot2:b.id,color:cfg.color||"rgba(41,98,255,0.18)",title:cfg.title||""});
        return null;
      },
      nz: (v,r)=>isNA(value(v))?(r===undefined?0:value(r)):value(v),
      minval:x=>x, maxval:x=>x, timestamp:()=>NA, time:()=>ctx.bar?ctx.bar.time:NA, request:{security:()=>{throw new PineExecutionError("request.security doğrudan çağrılamaz; Pine çağrı düğümü bekleniyordu.",null,"PINE_MTF_UNAVAILABLE");},security_lower_tf:()=>{throw new PineExecutionError("request.security_lower_tf henüz desteklenmiyor.",null,"PINE_MTF_UNAVAILABLE");}}, barmerge:{gaps_off:"gaps_off",gaps_on:"gaps_on",lookahead_off:"lookahead_off",lookahead_on:"lookahead_on"}
    };
    let drawingId=1;
    const drawCfg=args=>args.reduce((o,x)=>{if(x&&x.__named)o[x.name]=value(x.value);return o;},{});
    const lineNS={style_solid:"solid",style_dotted:"dotted",style_dashed:"dashed",
      new:(x1,y1,x2,y2,...args)=>{const c=drawCfg(args),o={id:drawingId++,x1:value(x1),y1:value(y1),x2:value(x2),y2:value(y2),color:c.color||"#2962ff",width:c.width||2,style:c.style||"solid",extend:c.extend||"none",xloc:c.xloc||"bar_index",force_overlay:!!c.force_overlay};outputs.lines.push(o);return o;},
      set_xy1:(o,x,y)=>{o=value(o);if(o){o.x1=value(x);o.y1=value(y);}},set_xy2:(o,x,y)=>{o=value(o);if(o){o.x2=value(x);o.y2=value(y);}},
      set_x1:(o,v)=>{o=value(o);if(o)o.x1=value(v);},set_y1:(o,v)=>{o=value(o);if(o)o.y1=value(v);},set_x2:(o,v)=>{o=value(o);if(o)o.x2=value(v);},set_y2:(o,v)=>{o=value(o);if(o)o.y2=value(v);},
      set_xloc:(o,loc)=>{o=value(o);if(o)o.xloc=value(loc);},set_color:(o,v)=>{o=value(o);if(o)o.color=value(v);},set_width:(o,v)=>{o=value(o);if(o)o.width=Math.max(1,Math.trunc(num(value(v))));},set_style:(o,v)=>{o=value(o);if(o)o.style=value(v);},set_extend:(o,v)=>{o=value(o);if(o)o.extend=value(v);},
      get_x1:o=>value(o)?.x1??NA,get_y1:o=>value(o)?.y1??NA,get_x2:o=>value(o)?.x2??NA,get_y2:o=>value(o)?.y2??NA,delete:o=>{o=value(o);if(o)o.deleted=true;},get_price:(o,x)=>{o=value(o);if(!o)return NA;const dx=num(o.x2)-num(o.x1);return dx===0?NA:num(o.y1)+(num(o.y2)-num(o.y1))*(num(value(x))-num(o.x1))/dx;}
    };
    const linefillNS={new:(line1,line2,color)=>{const o={id:drawingId++,line1:value(line1),line2:value(line2),color:value(color)||"rgba(41,98,255,0.18)",deleted:false};outputs.linefills.push(o);return o;},set_color:(o,c)=>{o=value(o);if(o)o.color=value(c);},delete:o=>{o=value(o);if(o)o.deleted=true;}};
    const labelNS={style_none:"none",style_label_up:"label_up",style_label_down:"label_down",style_label_left:"label_left",style_label_right:"label_right",
      new:(x,y,txt,...args)=>{const c=drawCfg(args),o={id:drawingId++,x:value(x),y:value(y),text:String(value(txt)||""),color:c.color||"#2962ff",textcolor:c.textcolor||"#ffffff",style:c.style||"label_up",size:c.size||"normal",xloc:c.xloc||"bar_index",yloc:c.yloc||"price",force_overlay:!!c.force_overlay};outputs.labels.push(o);return o;},
      set_xy:(o,x,y)=>{o=value(o);if(o){o.x=value(x);o.y=value(y);}},set_x:(o,v)=>{o=value(o);if(o)o.x=value(v);},set_y:(o,v)=>{o=value(o);if(o)o.y=value(v);},
      set_text:(o,v)=>{o=value(o);if(o)o.text=String(value(v)??"");},set_textcolor:(o,v)=>{o=value(o);if(o)o.textcolor=value(v);},set_color:(o,v)=>{o=value(o);if(o)o.color=value(v);},set_style:(o,v)=>{o=value(o);if(o)o.style=value(v);},set_size:(o,v)=>{o=value(o);if(o)o.size=value(v);},set_textalign:(o,v)=>{o=value(o);if(o)o.textalign=value(v);},set_tooltip:(o,v)=>{o=value(o);if(o)o.tooltip=String(value(v)??"");},set_xloc:(o,v)=>{o=value(o);if(o)o.xloc=value(v);},set_yloc:(o,v)=>{o=value(o);if(o)o.yloc=value(v);},delete:o=>{o=value(o);if(o)o.deleted=true;}
    };
    const boxNS={new:(left,top,right,bottom,...args)=>{const c=drawCfg(args),o={id:drawingId++,left:value(left),top:value(top),right:value(right),bottom:value(bottom),border_color:c.border_color||"#2962ff",bgcolor:c.bgcolor||"rgba(41,98,255,0.12)",border_width:c.border_width||1,xloc:c.xloc||"bar_index",force_overlay:!!c.force_overlay};outputs.boxes.push(o);return o;},
      set_lefttop:(o,left,top)=>{o=value(o);if(o){o.left=value(left);o.top=value(top);}},set_rightbottom:(o,right,bottom)=>{o=value(o);if(o){o.right=value(right);o.bottom=value(bottom);}},
      set_left:(o,v)=>{o=value(o);if(o)o.left=value(v);},set_top:(o,v)=>{o=value(o);if(o)o.top=value(v);},set_right:(o,v)=>{o=value(o);if(o)o.right=value(v);},set_bottom:(o,v)=>{o=value(o);if(o)o.bottom=value(v);},
      set_bgcolor:(o,v)=>{o=value(o);if(o)o.bgcolor=value(v);},set_border_color:(o,v)=>{o=value(o);if(o)o.border_color=value(v);},set_border_width:(o,v)=>{o=value(o);if(o)o.border_width=Math.max(0,Math.trunc(num(value(v))));},set_border_style:(o,v)=>{o=value(o);if(o)o.border_style=value(v);},set_extend:(o,v)=>{o=value(o);if(o)o.extend=value(v);},set_xloc:(o,v)=>{o=value(o);if(o)o.xloc=value(v);},delete:o=>{o=value(o);if(o)o.deleted=true;}
    };
    const tableNS={
      new:(position,columns,rows,...args)=>{
        const c=drawCfg(args),o={
          id:drawingId++,position:value(position),
          columns:Math.max(1,Math.trunc(num(value(columns)))),
          rows:Math.max(1,Math.trunc(num(value(rows)))),
          cells:{},mergedCells:[],
          bgcolor:c.bgcolor||"rgba(20,30,45,0.9)",
          frame_color:c.frame_color||"#64748b",frame_width:c.frame_width??1,
          border_color:c.border_color||"#64748b",border_width:c.border_width??1
        };
        outputs.tables.push(o);return o;
      },
      merge_cells:(t,startColumn,startRow,endColumn,endRow)=>{
        t=value(t);if(!t)return;
        const c1=Math.trunc(num(value(startColumn))),r1=Math.trunc(num(value(startRow))),
          c2=Math.trunc(num(value(endColumn))),r2=Math.trunc(num(value(endRow)));
        if(![c1,r1,c2,r2].every(Number.isInteger)||c1<0||r1<0||c2<c1||r2<r1||c2>=t.columns||r2>=t.rows)
          throw new RangeError("table.merge_cells aralığı tablo sınırlarının dışında.");
        if(!t.mergedCells)t.mergedCells=[];
        if(!t.mergedCells.some(m=>m.start_column===c1&&m.start_row===r1&&m.end_column===c2&&m.end_row===r2))
          t.mergedCells.push({start_column:c1,start_row:r1,end_column:c2,end_row:r2});
      },
      cell:(t,column,row,txt,...args)=>{
        t=value(t);const c=drawCfg(args),key=String(value(column))+":"+String(value(row));
        if(t)t.cells[key]={text:String(value(txt)||""),text_color:c.text_color||"#ffffff",bgcolor:c.bgcolor||t.bgcolor,text_size:value(c.text_size)||"small",text_halign:value(c.text_halign)||"center",text_valign:value(c.text_valign)||"middle"};
      },
      cell_set_text:(t,column,row,txt)=>{t=value(t);const k=String(value(column))+":"+String(value(row));if(t?.cells[k])t.cells[k].text=String(value(txt)||"");},
      cell_set_text_color:(t,column,row,c)=>{t=value(t);const k=String(value(column))+":"+String(value(row));if(t?.cells[k])t.cells[k].text_color=value(c);},
      cell_set_bgcolor:(t,column,row,c)=>{t=value(t);const k=String(value(column))+":"+String(value(row));if(t?.cells[k])t.cells[k].bgcolor=value(c);},
      set_position:(t,p)=>{t=value(t);if(t)t.position=value(p);},
      set_bgcolor:(t,c)=>{t=value(t);if(t)t.bgcolor=value(c);},
      set_frame_color:(t,c)=>{t=value(t);if(t)t.frame_color=value(c);},
      set_frame_width:(t,w)=>{t=value(t);if(t)t.frame_width=Math.max(0,Math.trunc(num(value(w))));},
      set_border_color:(t,c)=>{t=value(t);if(t)t.border_color=value(c);},
      set_border_width:(t,w)=>{t=value(t);if(t)t.border_width=Math.max(0,Math.trunc(num(value(w))));},
      cell_set_text_size:(t,column,row,size)=>{t=value(t);const cell=t?.cells[String(value(column))+":"+String(value(row))];if(cell)cell.text_size=value(size);},
      cell_set_text_halign:(t,column,row,align)=>{t=value(t);const cell=t?.cells[String(value(column))+":"+String(value(row))];if(cell)cell.text_halign=value(align);},
      cell_set_text_valign:(t,column,row,align)=>{t=value(t);const cell=t?.cells[String(value(column))+":"+String(value(row))];if(cell)cell.text_valign=value(align);},
      clear:(t,startColumn,startRow,endColumn,endRow)=>{
        t=value(t);if(!t)return;
        if(startColumn===undefined&&startRow===undefined&&endColumn===undefined&&endRow===undefined){t.cells={};return;}
        const c1=Math.trunc(num(value(startColumn??0))),r1=Math.trunc(num(value(startRow??0))),
          c2=Math.trunc(num(value(endColumn??(t.columns-1)))),r2=Math.trunc(num(value(endRow??(t.rows-1))));
        if(![c1,r1,c2,r2].every(Number.isInteger)||c1<0||r1<0||c2<c1||r2<r1||c2>=t.columns||r2>=t.rows)
          throw new RangeError("table.clear aralığı tablo sınırlarının dışında.");
        for(let row=r1;row<=r2;row++)for(let column=c1;column<=c2;column++)delete t.cells[column+":"+row];
      },delete:t=>{t=value(t);if(t)t.deleted=true;}
    };
    Object.assign(builtins.plot,{style_line:"line",style_stepline:"stepline",style_histogram:"histogram",style_columns:"columns",style_area:"area",style_circles:"circles",style_cross:"cross",style_linebr:"linebr"});
    builtins.shape={circle:"shape.circle",square:"shape.square",diamond:"shape.diamond",triangleup:"shape.triangleup",triangledown:"shape.triangledown",cross:"shape.cross",xcross:"shape.xcross",flag:"shape.flag",arrowup:"shape.arrowup",arrowdown:"shape.arrowdown",labelup:"shape.labelup",labeldown:"shape.labeldown",none:"shape.none"};
    builtins.location={abovebar:"abovebar",belowbar:"belowbar",top:"top",bottom:"bottom",absolute:"absolute"};
    builtins.display={all:"all",none:"none",data_window:"data_window",status_line:"status_line",pane:"pane"};
    builtins.size={tiny:"tiny",small:"small",normal:"normal",large:"large",huge:"huge",auto:"auto"};
    builtins.extend={none:"none",left:"left",right:"right",both:"both"};
    builtins.xloc={bar_index:"bar_index",bar_time:"bar_time"};
    builtins.yloc={price:"price",abovebar:"abovebar",belowbar:"belowbar"};
    builtins.position={top_left:"top_left",top_center:"top_center",top_right:"top_right",middle_left:"middle_left",middle_center:"middle_center",middle_right:"middle_right",bottom_left:"bottom_left",bottom_center:"bottom_center",bottom_right:"bottom_right"};
    builtins.line=lineNS;builtins.linefill=linefillNS;builtins.label=labelNS;builtins.box=boxNS;builtins.table=tableNS;
    Object.defineProperty(lineNS,"all",{get:()=>outputs.lines.filter(x=>!x.deleted)});Object.defineProperty(linefillNS,"all",{get:()=>outputs.linefills.filter(x=>!x.deleted)});Object.defineProperty(labelNS,"all",{get:()=>outputs.labels.filter(x=>!x.deleted)});Object.defineProperty(boxNS,"all",{get:()=>outputs.boxes.filter(x=>!x.deleted)});
    Object.assign(labelNS,{style_label_left:"label_left",style_label_right:"label_right",style_label_up:"label_up",style_label_down:"label_down",style_none:"none"});
    Object.assign(builtins.hline,{style_solid:"solid",style_dotted:"dotted",style_dashed:"dashed"});
    return builtins;
  }
  function namedArg(name,v){return {__named:true,name,value:v};}
  function runPine(ast,bars,opts) {
    opts=opts||{};
    if(!ast||ast.type!=="Program")throw new TypeError("Geçerli Pine AST bekleniyor.");
    if(ast.diagnostics&&ast.diagnostics.length)throw new PineExecutionError("Kaynakta parse hataları var: "+ast.diagnostics[0].message,ast.diagnostics[0],"PINE_PARSE_ERROR");
    const cleanBars=bars.map((b,i)=>{const o={};for(const k of ["open","high","low","close","volume","time"]){const n=Number(b[k]);if(!Number.isFinite(n))throw new PineExecutionError("Geçersiz "+k+" verisi ("+i+").");o[k]=n;}return Object.freeze(o);});
    const outputs={plots:[],shapes:[],hlines:[],candles:[],expression:[],labels:[],lines:[],boxes:[],tables:[],fills:[],linefills:[],barColors:[],bgColors:[],alerts:[],diagnostics:[],inputs:{},inputDefs:[],metadata:{}};
    const inputValues=Object.assign(Object.create(null),opts.inputs||{});
    const global=new Scope();
    const vars=Object.create(null),persistent=Object.create(null),functions=Object.create(null),seriesVarNames=new Set();
    const functionSeriesHistory=new Map();
    let activeBarScope=null,activeFunctionCallSite=null;
    const builtins=createBuiltins({bars:cleanBars,get index(){return currentIndex;}},outputs,inputValues,opts);
    let currentIndex=-1,steps=0;
    const ctxBars=cleanBars;
    const securityCache=new Map();
    const crossHistory=new WeakMap(),taCallHistory=new WeakMap();
    const plotCallIds=new WeakMap(),callSiteIds=new WeakMap(),functionCallSiteIds=new WeakMap();let nextPlotCallId=0,nextCallSiteId=0,nextFunctionCallSiteId=0;
    // Bound execution proportionally to the history window: realistic Pine
    // indicators evaluate hundreds of AST operations per bar, especially with MTF.
    // Callers can still provide a stricter explicit maxSteps budget.
    const estimatedStepsPerBar=Math.max(1000,(ast.body?.length||1)*20);
    const maxSteps=opts.maxSteps||Math.max(100000,cleanBars.length*estimatedStepsPerBar);
    function tick(node){if(++steps>maxSteps)throw new PineExecutionError("Çalıştırma adım sınırı aşıldı.",node,"PINE_EXECUTION_LIMIT");}
    function series(name){if(!vars[name])vars[name]=[];return new SeriesRef(vars[name],()=>currentIndex);}
    function getFunctionSeriesKey(scope){
      for(let current=scope;current;current=current.parent){
        if(Object.prototype.hasOwnProperty.call(current,"__pineFunctionKey"))return current.__pineFunctionKey;
      }
      return null;
    }

    function envGet(scope,name){
      if(scope.has(name))return scope.get(name);
      if(["open","high","low","close","volume","time"].includes(name))return series(name);
      if(name==="hl2")return new SeriesRef(ctxBars.map(b=>(b.high+b.low)/2),()=>currentIndex);
      if(name==="hlc3")return new SeriesRef(ctxBars.map(b=>(b.high+b.low+b.close)/3),()=>currentIndex);
      if(name==="ohlc4")return new SeriesRef(ctxBars.map(b=>(b.open+b.high+b.low+b.close)/4),()=>currentIndex);
      if(name==="bar_index")return new SeriesRef(Array.from({length:ctxBars.length},(_,i)=>i),()=>currentIndex);
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
        case "SwitchExpression":{const d=n.discriminant?value(evalExpr(n.discriminant,scope)):undefined;let chosen=null;for(const c of n.cases||[]){if(c.test===null){if(!chosen)chosen=c;continue;}const t=value(evalExpr(c.test,scope));if(n.discriminant?d===t:truth(t)){chosen=c;break;}}if(!chosen)return NA;const last=chosen.body&&chosen.body[chosen.body.length-1];return last&&last.type==="ExpressionStatement"?evalExpr(last.expression,scope):last?execStatement(last,new Scope(scope)):NA;}
        case "MemberExpression":{
          if(!n.computed&&n.object&&n.object.type==="Identifier"&&n.object.name==="ta"&&n.property&&n.property.name==="tr")return new SeriesRef(ctxBars.slice(0,currentIndex+1).map((_,i)=>trueRange({bars:ctxBars,index:i})));
          const obj=evalExpr(n.object,scope);
          if(n.computed){const idx=Math.trunc(num(value(evalExpr(n.property,scope))));if(obj instanceof SeriesRef)return obj.at(idx);if(Array.isArray(obj))return Number.isFinite(idx)&&idx>=0&&idx<obj.length?obj[idx]:NA;let historicalExpr=n.object;while(historicalExpr&&historicalExpr.type==="GroupExpression")historicalExpr=historicalExpr.expression;if(historicalExpr&&historicalExpr.type==="CallExpression"&&Number.isInteger(idx)&&idx>=0){if(idx>currentIndex)return NA;const savedIndex=currentIndex;try{currentIndex=savedIndex-idx;return value(evalExpr(historicalExpr,scope));}finally{currentIndex=savedIndex;}}throw new PineExecutionError("Bu değer geçmiş/indeks erişimini desteklemiyor.",n);}
          if(obj==null)throw new PineExecutionError("Boş değer üzerinde alan erişimi.",n);
          if(Array.isArray(obj)){
            const methods={
              size:()=>obj.length,push:v=>obj.push(value(v)),pop:()=>obj.pop(),shift:()=>obj.shift(),unshift:v=>obj.unshift(value(v)),
              get:i=>obj[safeArrayIndex(obj,i)],set:(i,v)=>{obj[safeArrayIndex(obj,i)]=value(v);return null;},
              remove:i=>obj.splice(safeArrayIndex(obj,i),1)[0],clear:()=>{obj.length=0;},reverse:()=>obj.reverse(),
              sum:()=>obj.reduce((z,x)=>z+num(x),0),avg:()=>obj.length?obj.reduce((z,x)=>z+num(x),0)/obj.length:NA,
              min:()=>obj.length?Math.min(...obj.map(num)):NA,max:()=>obj.length?Math.max(...obj.map(num)):NA,
              includes:v=>obj.includes(value(v)),indexof:v=>obj.indexOf(value(v)),copy:()=>obj.slice(),
              slice:(l,r)=>obj.slice(Math.trunc(num(value(l))),r===undefined?undefined:Math.trunc(num(value(r))))
            };
            if(n.property&&Object.prototype.hasOwnProperty.call(methods,n.property.name))return methods[n.property.name];
          }
          if((typeof obj==="object"||typeof obj==="function")&&n.property&&Object.prototype.hasOwnProperty.call(obj,n.property.name))return obj[n.property.name];
          throw new PineExecutionError("Desteklenmeyen alan: "+(n.property&&n.property.name),n);
        }
        case "CallExpression":{
          if(n.callee&&n.callee.type==="Identifier"&&n.callee.name==="color")return n.arguments.length? (isNA(value(evalExpr(n.arguments[0],scope)) )?"rgba(0,0,0,0)":String(value(evalExpr(n.arguments[0],scope)))):"rgba(0,0,0,0)";
          if(n.callee&&n.callee.type==="MemberExpression"&&n.callee.object.type==="Identifier"&&n.callee.object.name==="ta"&&n.callee.property.name==="tr")return trueRange({bars:ctxBars,index:currentIndex});
          if(n.callee&&n.callee.type==="Identifier"&&n.callee.name==="time"){
            const session=n.arguments[1]?String(value(evalExpr(n.arguments[1],scope))||""):null;
            const timezone=n.arguments[2]?String(value(evalExpr(n.arguments[2],scope))||"UTC"):"UTC";
            if(!session)return ctxBars[currentIndex].time;
            const match=session.match(/^(\d{4})-(\d{4})(?::([1-7]+))?$/);
            if(!match)throw new PineExecutionError("time() seans biçimi HHMM-HHMM[:1234567] olmalı.",n,"PINE_SESSION_FORMAT");
            const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ctxBars[currentIndex].time*1000));
            const get=k=>parts.find(p=>p.type===k)?.value;
            const day=({Sun:"1",Mon:"2",Tue:"3",Wed:"4",Thu:"5",Fri:"6",Sat:"7"})[get("weekday")];
            const hh=Number(get("hour")),mm=Number(get("minute")),now=hh*60+mm;
            const start=Number(match[1].slice(0,2))*60+Number(match[1].slice(2));
            const end=Number(match[2].slice(0,2))*60+Number(match[2].slice(2));
            const days=match[3]||"1234567";
            const active=start<=end?(now>=start&&now<end):(now>=start||now<end);
            return active&&days.includes(day)?ctxBars[currentIndex].time:NA;
          }
          if(n.callee&&n.callee.type==="MemberExpression"&&n.callee.object.type==="Identifier"&&n.callee.object.name==="request"&&n.callee.property.name==="security_lower_tf"){
            const sym=n.arguments[0]?value(evalExpr(n.arguments[0],scope)):String(opts.symbol||"");
            const tf=n.arguments[1]?value(evalExpr(n.arguments[1],scope)):String(opts.timeframe||"");
            const exprNode=n.arguments[2]&&n.arguments[2].type==="NamedArgument"?n.arguments[2].value:n.arguments[2];
            if(!exprNode)throw new PineExecutionError("request.security_lower_tf için ifade argümanı gerekli.",n);
            const cacheKey=String(sym)+"|"+String(tf)+"|"+JSON.stringify(exprNode);
            let mapped=securityCache.get("lower|"+cacheKey);
            if(!mapped){
              const targetMs=timeframeMs(tf),baseMs=timeframeMs(opts.timeframe||"5");
              if(!Number.isFinite(targetMs)||!Number.isFinite(baseMs))throw new PineExecutionError("request.security_lower_tf zaman dilimi tanınmadı: "+tf,n,"PINE_MTF_UNSUPPORTED");
              if(targetMs>=baseMs)throw new PineExecutionError("security_lower_tf zaman dilimi grafik zaman diliminden küçük olmalı.",n,"PINE_MTF_LOWER_TF");
              if(baseMs%targetMs!==0)throw new PineExecutionError("Alt zaman dilimi grafik zaman dilimini tam bölmeli.",n,"PINE_MTF_ALIGNMENT");
              if(String(sym)!==String(opts.symbol||""))throw new PineExecutionError("Harici sembol security_lower_tf henüz desteklenmiyor: "+sym,n,"PINE_MTF_SYMBOL");
              const supplied=opts.securityLowerTfData||opts.lowerTimeframeData||{};
              const lowerBars=supplied[String(tf)]||supplied[String(sym)+"|"+String(tf)];
              if(!Array.isArray(lowerBars)||!lowerBars.length)throw new PineExecutionError("security_lower_tf için opts.lowerTimeframeData['"+tf+"'] alt mum verisi gerekli.",n,"PINE_MTF_DATA_REQUIRED");
              let previousTime=-Infinity;
              for(let i=0;i<lowerBars.length;i++){
                const t=Number(lowerBars[i]?.time);
                if(!Number.isFinite(t)||t<=previousTime)throw new PineExecutionError("Alt zaman dilimi mumları artan ve benzersiz zaman damgalı olmalı.",n,"PINE_MTF_DATA_INVALID");
                previousTime=t;
              }
              const hasInputCall=(node)=>{if(!node||typeof node!=="object")return false;if(node.type==="CallExpression"&&node.callee&&node.callee.type==="MemberExpression"&&node.callee.object&&node.callee.object.type==="Identifier"&&node.callee.object.name==="input")return true;return Object.keys(node).some(k=>{const v=node[k];return Array.isArray(v)?v.some(hasInputCall):v&&typeof v==="object"?hasInputCall(v):false;});};
              const isLiteralSetup=(node)=>node&&["StringLiteral","NumericLiteral","Literal"].includes(node.type);
              const setupNodes=ast.body.filter(node=>node&&node.type==="AssignmentStatement"&&node.target&&node.target.type==="Identifier"&&(hasInputCall(node.value)||isLiteralSetup(node.value)));
              const mini={type:"Program",body:[...setupNodes,...ast.body.filter(node=>node&&node.type==="FunctionDeclaration")],diagnostics:[]};
              const res=runPine(mini,lowerBars,{...opts,timeframe:String(tf),symbol:String(sym),captureExpression:exprNode,securityLowerTfData:null,lowerTimeframeData:null});
              const intrabarValues=res.expression||[];
              mapped=cleanBars.map(bar=>{
                const start=bar.time*1000,end=start+baseMs;
                const bucket=[];
                for(let i=0;i<lowerBars.length;i++){
                  const t=Number(lowerBars[i].time)*1000;
                  if(t>=start&&t<end)bucket.push(intrabarValues[i]===undefined?NA:intrabarValues[i]);
                }
                return bucket;
              });
              securityCache.set("lower|"+cacheKey,mapped);
            }
            const tupleSample=mapped.flat().find(Array.isArray);
            let tupleNode=exprNode;while(tupleNode&&tupleNode.type==="GroupExpression")tupleNode=tupleNode.expression;
            const tupleLength=tupleSample?tupleSample.length:tupleNode&&["TupleExpression","ArrayExpression"].includes(tupleNode.type)&&Array.isArray(tupleNode.elements)?tupleNode.elements.length:0;
            if(tupleLength){
              return Array.from({length:tupleLength},(_,tupleIndex)=>mapped[currentIndex].map(entry=>Array.isArray(entry)?entry[tupleIndex]:NA));
            }
            return mapped[currentIndex].slice();
          }
          if(n.callee&&n.callee.type==="MemberExpression"&&n.callee.object.type==="Identifier"&&n.callee.object.name==="request"&&n.callee.property.name==="security"){
            const sym=n.arguments[0]?value(evalExpr(n.arguments[0],scope)):String(opts.symbol||"");
            const tf=n.arguments[1]?value(evalExpr(n.arguments[1],scope)):String(opts.timeframe||"");
            const exprNode=n.arguments[2]&&n.arguments[2].type==="NamedArgument"?n.arguments[2].value:n.arguments[2];
            if(!exprNode)throw new PineExecutionError("request.security üçün ifade argümanı gerekli.",n);
            const look=n.arguments.slice(3).find(a=>a.type==="NamedArgument"&&a.name==="lookahead");
            if(look&&value(evalExpr(look.value,scope))==="lookahead_on")throw new PineExecutionError("lookahead_on yeniden boyama riski nedeniyle bu motorda desteklenmiyor.",n,"PINE_MTF_LOOKAHEAD");
            const cacheKey=String(sym)+"|"+String(tf)+"|"+JSON.stringify(exprNode);
            let mapped=securityCache.get(cacheKey);
            if(!mapped){
              const targetMs=timeframeMs(tf),baseMs=timeframeMs(opts.timeframe||"5");
              if(!Number.isFinite(targetMs)||!Number.isFinite(baseMs))throw new PineExecutionError("request.security zaman dilimi tanınmadı: "+tf,n,"PINE_MTF_UNSUPPORTED");
              if(targetMs<baseMs)throw new PineExecutionError("Daha düşük zaman dilimi request.security henüz desteklenmiyor; security_lower_tf gerekir.",n,"PINE_MTF_LOWER_TF");
              if(targetMs%baseMs!==0)throw new PineExecutionError("İstenen zaman dilimi grafik zaman diliminin tam katı olmalı.",n,"PINE_MTF_ALIGNMENT");
              if(String(sym)!==String(opts.symbol||""))throw new PineExecutionError("Harici sembol request.security henüz desteklenmiyor: "+sym,n,"PINE_MTF_SYMBOL");
              const mtfBars=targetMs===baseMs?cleanBars:aggregateBars(cleanBars,targetMs,baseMs);
              const hasInputCall=(node)=>{if(!node||typeof node!=="object")return false;if(node.type==="CallExpression"&&node.callee&&node.callee.type==="MemberExpression"&&node.callee.object&&node.callee.object.type==="Identifier"&&node.callee.object.name==="input")return true;return Object.keys(node).some(k=>{const v=node[k];return Array.isArray(v)?v.some(hasInputCall):v&&typeof v==="object"?hasInputCall(v):false;});};
              const isLiteralSetup=(node)=>node&&["StringLiteral","NumericLiteral","Literal"].includes(node.type);
              const setupNodes=ast.body.filter(node=>node&&node.type==="AssignmentStatement"&&node.target&&node.target.type==="Identifier"&&(hasInputCall(node.value)||isLiteralSetup(node.value)));
              // captureExpression evaluates the requested expression once at the
              // end of each MTF bar. Do not also append it as a statement to mini.body:
              // that would execute stateful user functions twice per bar and corrupt
              // their local series history (e.g. direction[1]).
              const mini={type:"Program",body:[...setupNodes,...ast.body.filter(node=>node&&node.type==="FunctionDeclaration")],diagnostics:[]};
              const res=runPine(mini,mtfBars,{...opts,timeframe:String(tf),symbol:String(sym),captureExpression:exprNode,securityData:null});
              const vals=res.expression||[];
              const gaps=n.arguments.slice(3).find(a=>a.type==="NamedArgument"&&a.name==="gaps");
              const gapsOn=!!(gaps&&value(evalExpr(gaps.value,scope))==="gaps_on");
              mapped=cleanBars.map((bar)=>{
                const closeTime=(bar.time*1000)+baseMs;let j=-1;
                for(let k=0;k<mtfBars.length;k++)if((mtfBars[k].time*1000)+targetMs<=closeTime)j=k;else break;
                if(j<0)return NA;
                if(gapsOn&&(mtfBars[j].time*1000)+targetMs!==closeTime)return NA;
                return vals[j]===undefined?NA:vals[j];
              });
              securityCache.set(cacheKey,mapped);
            }
            const tupleSample=mapped.find(Array.isArray);
            if(tupleSample){
              return tupleSample.map((_,tupleIndex)=>new SeriesRef(
                mapped.slice(0,currentIndex+1).map(entry=>Array.isArray(entry)?entry[tupleIndex]:NA),
                ()=>currentIndex
              ));
            }
            return new SeriesRef(mapped.slice(0,currentIndex+1),()=>currentIndex);
          }
          const fn=n.callee&&n.callee.type==="Identifier"&&n.callee.name==="na"?builtins.na:evalExpr(n.callee,scope);if(typeof fn!=="function")throw new PineExecutionError("Çağrılan ifade fonksiyon değil.",n);
          const args=n.arguments.map(a=>a.type==="NamedArgument"?namedArg(a.name,evalExpr(a.value,scope)):evalExpr(a,scope));
          const isTaHistory=n.callee&&n.callee.type==="MemberExpression"&&n.callee.object.type==="Identifier"&&n.callee.object.name==="ta"&&["barssince","valuewhen"].includes(n.callee.property.name);
          if(isTaHistory){
            if(!taCallHistory.has(n))taCallHistory.set(n,new Map());
            const bySite=taCallHistory.get(n),site=activeFunctionCallSite===null?"direct":activeFunctionCallSite;
            if(!bySite.has(site))bySite.set(site,[]);
            const history=bySite.get(site),condition=truth(value(args[0]));
            if(n.callee.property.name==="barssince"){
              history.push({condition});
              for(let i=history.length-1;i>=0;i--)if(history[i].condition)return history.length-1-i;
              return NA;
            }
            history.push({condition,source:value(args[1])});
            const occurrence=args[2]===undefined?0:Math.trunc(num(value(args[2])));
            if(!Number.isInteger(occurrence)||occurrence<0)throw new RangeError("valuewhen occurrence negatif olmayan tam sayı olmalı.");
            let seen=0;
            for(let i=history.length-1;i>=0;i--)if(history[i].condition){if(seen++===occurrence)return history[i].source;}
            return NA;
          }
          const isTaCross=n.callee&&n.callee.type==="MemberExpression"&&n.callee.object.type==="Identifier"&&n.callee.object.name==="ta"&&["cross","crossover","crossunder"].includes(n.callee.property.name);
          if(isTaCross&&args.length>=2&&args.slice(0,2).every(x=>!(x instanceof SeriesRef))){
            const current=args.slice(0,2).map(value),previous=crossHistory.get(n);
            crossHistory.set(n,current);
            if(!previous||current.some(isNA)||previous.some(isNA))return false;
            const up=num(current[0])>num(current[1])&&num(previous[0])<=num(previous[1]);
            const down=num(current[0])<num(current[1])&&num(previous[0])>=num(previous[1]);
            return n.callee.property.name==="crossover"?up:n.callee.property.name==="crossunder"?down:up||down;
          }
          const isPlotCall=n.callee&&n.callee.type==="Identifier"&&n.callee.name==="plot";
          const isFillCall=n.callee&&n.callee.type==="Identifier"&&n.callee.name==="fill";
          if(isPlotCall){if(!plotCallIds.has(n))plotCallIds.set(n,nextPlotCallId++);outputs._activePlotId=plotCallIds.get(n);}
          if(isFillCall){if(!callSiteIds.has(n))callSiteIds.set(n,nextCallSiteId++);outputs._activeCallId=callSiteIds.get(n);}
          const previousFunctionCallSite=activeFunctionCallSite;
          if(fn&&fn.__pineUserFunction){
            if(!functionCallSiteIds.has(n))functionCallSiteIds.set(n,nextFunctionCallSiteId++);
            activeFunctionCallSite=functionCallSiteIds.get(n);
          }
          try{return fn(...args);}finally{
            activeFunctionCallSite=previousFunctionCallSite;
            if(isPlotCall)delete outputs._activePlotId;
            if(isFillCall)delete outputs._activeCallId;
          }
        }
        case "ArrowFunctionExpression":return {params:n.params.map(p=>p.name),body:n.body,scope};
      }
      throw new PineExecutionError("Desteklenmeyen ifade düğümü: "+n.type,n,"PINE_UNSUPPORTED_AST");
    }
    function assignTarget(target,v,scope,node){
      if(target.type==="Identifier"){
        const current=scope.get(target.name);
        if(current instanceof SeriesRef){
          const index=current.index;
          if(index>=0&&index<current.values.length){current.values[index]=value(v);return;}
        }
        scope.set(target.name,v);return;
      }
      if(target.type==="MemberExpression"){const obj=evalExpr(target.object,scope);if(!obj||typeof obj!=="object")throw new PineExecutionError("UDT/nesne alanına atama yapılamıyor.",node);const key=target.computed?value(evalExpr(target.property,scope)):target.property.name;obj[key]=v;return;}
      if(target.type==="TupleExpression"||target.type==="ArrayExpression"){
        if(!Array.isArray(v))throw new PineExecutionError("Tuple atamasında dizi bekleniyor.",node);
        target.elements.forEach((t,i)=>assignTarget(t,v[i]===undefined?NA:v[i],scope,node));return;
      }
      throw new PineExecutionError("Desteklenmeyen atama hedefi.",node);
    }
    function execBlock(body,scope){
      for(const node of body){tick(node);execStatement(node,scope);}
    }
    function execBlockValue(body,scope){let result=NA;for(const node of body){tick(node);result=execStatement(node,scope);}return result;}
    function execStatement(n,scope){
      switch(n.type){
        case "ExpressionStatement":return evalExpr(n.expression,scope);
        case "TypedDeclarationStatement":case "DeclarationStatement":{
          const q=n.qualifier||"";
          if(q==="var"||q==="varip"){
            if(!Object.prototype.hasOwnProperty.call(persistent,n.name))persistent[n.name]=value(evalExpr(n.value,scope));
            const stored=persistent[n.name];
            if(scope===activeBarScope&&!(stored&&typeof stored==="object")){
              const a=vars[n.name]||(vars[n.name]=[]);while(a.length<currentIndex)a.push(NA);if(a.length===currentIndex)a.push(stored);else a[currentIndex]=stored;
              seriesVarNames.add(n.name);const ref=new SeriesRef(a,()=>currentIndex);scope.define(n.name,ref);return ref;
            }
            scope.define(n.name,stored);return stored;
          }
          const initial=evalExpr(n.value,scope);
          if(scope===activeBarScope&&!(initial&&typeof initial==="object")){
            const a=vars[n.name]||(vars[n.name]=[]);while(a.length<currentIndex)a.push(NA);if(a.length===currentIndex)a.push(value(initial));else a[currentIndex]=value(initial);
            seriesVarNames.add(n.name);const ref=new SeriesRef(a,()=>currentIndex);scope.define(n.name,ref);return ref;
          }
          // Local variables declared inside a user function are series too:
          // Pine's x[1] refers to the prior invocation of this call site.
          const functionKey=getFunctionSeriesKey(scope);
          if(functionKey!==null&&(initial===null||typeof initial!=="object")){
            let byName=functionSeriesHistory.get(functionKey);
            if(!byName){byName=new Map();functionSeriesHistory.set(functionKey,byName);}
            let history=byName.get(n.name);
            if(!history){history=[];byName.set(n.name,history);}
            while(history.length<currentIndex)history.push(NA);
            if(history.length===currentIndex)history.push(value(initial));else history[currentIndex]=value(initial);
            seriesVarNames.add(n.name);
            const ref=new SeriesRef(history,()=>currentIndex);scope.define(n.name,ref);return ref;
          }
          scope.define(n.name,initial);return initial;
        }
        case "AssignmentStatement":{
          const old=n.target.type==="Identifier"?scope.get(n.target.name):evalExpr(n.target,scope),rhs=evalExpr(n.value,scope);let v=rhs;
          if(n.operator!== "="&&n.operator!==":="){const a=value(old),b=value(rhs);const op=n.operator[0];v=op==="+"?num(a)+num(b):op==="-"?num(a)-num(b):op==="*"?num(a)*num(b):num(b)===0?NA:num(a)/num(b);}
          if(n.target.type==="Identifier"&&old===undefined&&scope===activeBarScope&&!(v&&typeof v==="object")){
            const a=vars[n.target.name]||(vars[n.target.name]=[]);
            while(a.length<currentIndex)a.push(NA);
            if(a.length===currentIndex)a.push(value(v));else a[currentIndex]=value(v);
            seriesVarNames.add(n.target.name);
            const ref=new SeriesRef(a,()=>currentIndex);scope.define(n.target.name,ref);
            return ref;
          }
          const functionKey=n.target.type==="Identifier"?getFunctionSeriesKey(scope):null;
          if(n.target.type==="Identifier"&&old===undefined&&functionKey!==null&&(v===null||typeof v!=="object")){
            let byName=functionSeriesHistory.get(functionKey);
            if(!byName){byName=new Map();functionSeriesHistory.set(functionKey,byName);}
            let history=byName.get(n.target.name);
            if(!history){history=[];byName.set(n.target.name,history);}
            while(history.length<currentIndex)history.push(NA);
            if(history.length===currentIndex)history.push(value(v));else history[currentIndex]=value(v);
            seriesVarNames.add(n.target.name);
            const ref=new SeriesRef(history,()=>currentIndex);scope.define(n.target.name,ref);
            return ref;
          }
          assignTarget(n.target,v,scope,n);if(n.target.type==="Identifier"&&Object.prototype.hasOwnProperty.call(persistent,n.target.name))persistent[n.target.name]=value(v);return v;
        }
        case "TypeDeclaration":{
          const ctor={new:(...args)=>{const object={__pineType:n.name};n.fields.forEach((field,i)=>{object[field.name]=args[i]===undefined?(field.defaultValue?value(evalExpr(field.defaultValue,scope)):NA):value(args[i]);});return object;}};
          scope.define(n.name,ctor);return ctor;
        }
        case "DestructuringAssignment":{const v=evalExpr(n.value,scope);assignTarget(n.target,v,scope,n);return;}
        case "FunctionDeclaration":{
          const callable=(...args)=>{
            const local=new Scope(scope);
            const functionKey=n.name+"#"+(activeFunctionCallSite===null?"direct":activeFunctionCallSite);
            local.__pineFunctionKey=functionKey;
            let byName=functionSeriesHistory.get(functionKey);
            if(!byName){byName=new Map();functionSeriesHistory.set(functionKey,byName);}
            n.params.forEach((p,i)=>{
              const arg=args[i];
              // Pine function parameters are series-qualified when their input is
              // a scalar or a SeriesRef. Preserve each call site's argument history
              // so expressions such as source[1] work inside user functions.
              if(arg instanceof SeriesRef||arg===null||typeof arg!=="object"){
                const key="__arg__"+p.name;
                let history=byName.get(key);
                if(!history){history=[];byName.set(key,history);}
                while(history.length<currentIndex)history.push(NA);
                if(history.length===currentIndex)history.push(value(arg));else history[currentIndex]=value(arg);
                local.define(p.name,new SeriesRef(history,()=>currentIndex));
              }else local.define(p.name,arg);
            });
            return n.bodyStatements&&n.bodyStatements.length?execBlockValue(n.bodyStatements,local):evalExpr(n.body,local);
          };
          callable.__pineUserFunction=true;
          functions[n.name]=callable;return;
        }
        case "IfStatement":return truth(value(evalExpr(n.test,scope)))?execBlockValue(n.body,new Scope(scope)):execBlockValue(n.alternate||[],new Scope(scope));
        case "SwitchStatement":{const d=n.discriminant?value(evalExpr(n.discriminant,scope)):undefined;let chosen=null;for(const c of n.cases||[]){if(c.test===null){if(!chosen)chosen=c;continue;}const t=value(evalExpr(c.test,scope));if(n.discriminant?d===t:truth(t)){chosen=c;break;}}if(chosen)return execBlockValue(chosen.body,new Scope(scope));return NA;}
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
    // Pine user-defined functions are globally visible regardless of declaration order.
    // Register top-level functions before evaluating the first bar so earlier calls resolve.
    for(const node of ast.body){if(node&&node.type==="FunctionDeclaration")execStatement(node,global);}
    // Install OHLCV series progressively; each bar is evaluated in source order.
    const barKeys=["open","high","low","close","volume","time"];
    for(let i=0;i<cleanBars.length;i++){
      currentIndex=i;if(i>0)builtins.strategy._executeBar(i);outputs._plotValuesThisBar=new Map();
      for(const k of barKeys){if(!vars[k])vars[k]=[];vars[k].push(cleanBars[i][k]);}
      const barScope=new Scope(global);activeBarScope=barScope;
      try{execBlock(ast.body,barScope);if(opts.captureExpression)outputs.expression.push(value(evalExpr(opts.captureExpression,barScope)));}
      catch(error){if(error&&error.__pineBreak)throw new PineExecutionError("break yalnızca döngü içinde kullanılabilir.");if(error&&error.__pineContinue)throw new PineExecutionError("continue yalnızca döngü içinde kullanılabilir.");if(error instanceof PineExecutionError)throw error;throw new PineExecutionError(error.message,null);}
      for(const p of outputs.plots)p.values.push(outputs._plotValuesThisBar.has(p._id)?outputs._plotValuesThisBar.get(p._id):NA);
      builtins.strategy._updateBar();
    }
    for(const p of outputs.plots)delete p._id;
    delete outputs._plotValuesThisBar;
    outputs.strategy=builtins.strategy._snapshot();
    outputs.inputs=inputValues;
    outputs.barCount=cleanBars.length;
    outputs.metadata=Object.assign(outputs.metadata,opts.metadata||{});
    return outputs;
  }

  return {PineExecutionError,SeriesRef,Scope,runPine,isNA,NA};
});

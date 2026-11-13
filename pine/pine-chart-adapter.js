/* Lightweight Charts adapter for BY LOTUSERIC Pine interpreter output. */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.ByLotusericPineChartAdapter=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function makeData(values,bars){
    const out=[];
    for(let i=0;i<bars.length;i++){
      const v=values[i];
      if(v===null||v===undefined||typeof v==="number"&&!Number.isFinite(v))out.push({time:bars[i].time});
      else if(typeof v==="number")out.push({time:bars[i].time,value:v});
    }
    return out;
  }
  function remove(state){
    if(!state)return;
    for(const s of state.series||[]){try{s.chart.removeSeries(s.series)}catch{}}
    if(state.fillSvg)try{state.fillSvg.remove()}catch{}if(state.svg)try{state.svg.remove()}catch{}for(const svg of state.drawingSvgs||[])try{svg.remove()}catch{}for(const m of state.markers||[])try{m.detach()}catch{}for(const el of state.tableEls||[])try{el.remove()}catch{}for(const p of state.panes||[]){try{p.chart.remove()}catch{}try{p.wrap.remove()}catch{}}
  }
  function hostWidthSafe(host){return host?.clientWidth||host?.getBoundingClientRect?.().width||0;}
  function mount(config){
    const {chart,addChartSeries,bars,output,host,drawingHost,priceSeries}=config;
    if(!chart||typeof addChartSeries!=="function"||!Array.isArray(bars)||!output)throw new TypeError("Pine chart adapter eksik yapılandırıldı.");
    const state={series:[],panes:[],markers:[],tableEls:[],output};
    const overlay=output.metadata?.overlay!==false;
    let target=chart;
    if(!overlay&&host){
      const wrap=document.createElement("section");wrap.className="oscPane pineOscPane";
      const head=document.createElement("div");head.className="oscPaneHead";
      const name=document.createElement("b");name.textContent=output.metadata?.title||"Özel Pine göstergesi";
      const close=document.createElement("button");close.type="button";close.textContent="×";close.title="Pine göstergesini kaldır";
      head.append(name,close);
      const plot=document.createElement("div");plot.className="oscPaneChart";
      wrap.append(head,plot);host.append(wrap);
      target=LightweightCharts.createChart(plot,{autoSize:true,layout:{background:{type:"solid",color:"#101a2a"},textColor:"#9eb0c7",fontSize:10},grid:{vertLines:{color:"#1b2a3e"},horzLines:{color:"#1b2a3e"}},rightPriceScale:{borderColor:"#2a3c53",autoScale:true},timeScale:{visible:false}});
      state.panes.push({chart:target,wrap,plot});
      close.addEventListener("click",()=>remove(state));
    }
    for(const p of output.plots||[]){
      const color=typeof p.color==="string"?p.color:"#2962ff";
      const histogram=String(p.style).toLowerCase().includes("histogram");
      const series=addChartSeries.call(null,target,histogram?"HistogramSeries":"LineSeries",histogram?{color,priceLineVisible:false}:{color,lineWidth:Math.max(1,Math.min(4,Number(p.linewidth)||2)),priceLineVisible:false,lastValueVisible:true});
      series.setData(makeData(p.values,bars));
      state.series.push({chart:target,series});
    }
    if(output.fills?.length){
      const plotById=new Map((output.plots||[]).map(p=>[p.id,p]));
      const host=overlay?drawingHost:state.panes[0]?.plot;
      const priceScale=target.priceScale("right");
      if(host&&priceScale&&typeof priceScale.priceToCoordinate==="function"){
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("class","pineFillOverlay");
        Object.assign(svg.style,{position:"absolute",inset:"0",width:"100%",height:"100%",pointerEvents:"none",overflow:"visible",zIndex:"1"});
        if(!host.style.position)host.style.position="relative";
        host.append(svg);state.fillSvg=svg;
        const groups=new Map();
        for(const f of output.fills){if(!groups.has(f.id))groups.set(f.id,[]);groups.get(f.id)[f.bar]=f;}
        for(const records of groups.values()){
          const first=records.find(Boolean);if(!first)continue;
          const a=plotById.get(first.plot1),b=plotById.get(first.plot2);if(!a||!b)continue;
          for(let i=0;i<bars.length-1;i++){
            const f=records[i]||records[i+1],a1=a.values[i],a2=a.values[i+1],b1=b.values[i],b2=b.values[i+1];
            if(!f||!f.color||![a1,a2,b1,b2].every(v=>typeof v==="number"&&Number.isFinite(v)))continue;
            const x1=target.timeScale().timeToCoordinate(bars[i].time),x2=target.timeScale().timeToCoordinate(bars[i+1].time);
            const y11=priceScale.priceToCoordinate(a1),y12=priceScale.priceToCoordinate(a2),y21=priceScale.priceToCoordinate(b1),y22=priceScale.priceToCoordinate(b2);
            if([x1,x2,y11,y12,y21,y22].some(v=>v==null))continue;
            const poly=document.createElementNS("http://www.w3.org/2000/svg","polygon");
            poly.setAttribute("points",[[x1,y11],[x2,y12],[x2,y22],[x1,y21]].map(p=>p.join(",")).join(" "));
            poly.setAttribute("fill",f.color);poly.setAttribute("stroke","none");svg.append(poly);
          }
        }
      }
    }
    for(const h of output.hlines||[]){
      if(typeof h.value!=="number"||!Number.isFinite(h.value))continue;
      const style=h.linestyle==="dashed"?2:h.linestyle==="dotted"?1:0;
      const series=addChartSeries.call(null,target,"LineSeries",{color:h.color||"#8794a8",lineWidth:1,lineStyle:style,priceLineVisible:false,lastValueVisible:false});
      series.setData(bars.map(b=>({time:b.time,value:h.value})));
      state.series.push({chart:target,series});
    }
    const hasDrawings=(output.lines?.length||output.labels?.length||output.boxes?.length||output.linefills?.length);
    if(hasDrawings){
      const pane=state.panes[0];
      const routes=new Map();
      const routeFor=o=>{
        const usePrice=o?.forceOverlay===true||overlay||!pane;
        const route=usePrice?{host:drawingHost,chart,priceSeries,kind:"price"}:
          {host:pane.plot,chart:pane.chart,priceSeries:null,kind:"pane"};
        return route;
      };
      const addToRoute=(kind,o)=>{
        const route=routeFor(o);
        if(!route.host)return;
        const key=route.kind;
        if(!routes.has(key))routes.set(key,{...route,lines:[],boxes:[],labels:[],linefills:[]});
        routes.get(key)[kind].push(o);
      };
      for(const o of output.lines||[])if(!o.deleted)addToRoute("lines",o);
      for(const o of output.boxes||[])if(!o.deleted)addToRoute("boxes",o);
      for(const o of output.labels||[])if(!o.deleted)addToRoute("labels",o);
      const linesById=new Map((output.lines||[]).map(o=>[o.id,o]));
      for(const f of output.linefills||[]){
        if(f.deleted)continue;
        const a=linesById.get(f.line1?.id),b=linesById.get(f.line2?.id);
        if(!a||!b||a.deleted||b.deleted)continue;
        const route=routeFor(a);
        if(!route.host)continue;
        if(!routes.has(route.kind))routes.set(route.kind,{...route,lines:[],boxes:[],labels:[],linefills:[]});
        routes.get(route.kind).linefills.push(f);
      }
      for(const group of routes.values()){
        const {host,chart:drawChart,priceSeries:drawPriceSeries}=group;
        const priceScale=drawChart.priceScale?.("right");
        if(!host||!priceScale||typeof priceScale.priceToCoordinate!=="function")continue;
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("class",group.kind==="price"?"pineDrawingOverlay":"pineDrawingOverlay pinePaneDrawingOverlay");
        Object.assign(svg.style,{position:"absolute",inset:"0",width:"100%",height:"100%",pointerEvents:"none",overflow:"visible",zIndex:"6"});
        if(!host.style.position)host.style.position="relative";
        host.append(svg);(state.drawingSvgs||(state.drawingSvgs=[])).push(svg);
        const timeScale=drawChart.timeScale(),hostWidth=hostWidthSafe(host);
        const indexToX=index=>{
          const n=Number(index);if(!Number.isFinite(n)||!bars.length)return null;
          const i=Math.trunc(n),last=bars.length-1,t=i>=0&&i<=last?bars[i]?.time:null;
          if(t!=null){const x=timeScale.timeToCoordinate(t);if(x!=null)return x;}
          const x1=timeScale.timeToCoordinate(bars[last]?.time),x0=last>0?timeScale.timeToCoordinate(bars[last-1]?.time):null;
          const step=x1!=null&&x0!=null?x1-x0:0;
          return x1==null||!step?null:x1+(i-last)*step;
        };
        const xy=(x,y,xloc)=>{
          let px;
          if(xloc==="bar_time"){
            const time=Number(x);px=timeScale.timeToCoordinate(time);
            if(px==null&&bars.length>1){
              const last=bars[bars.length-1],prev=bars[bars.length-2],x1=timeScale.timeToCoordinate(last.time),x0=timeScale.timeToCoordinate(prev.time),dt=last.time-prev.time;
              if(x1!=null&&x0!=null&&dt)px=x1+((time-last.time)/dt)*(x1-x0);
            }
          }else px=indexToX(x);
          const py=priceScale.priceToCoordinate(Number(y));
          return px==null||py==null?null:{x:px,y:py};
        };
        const drawLine=o=>{
          const a=xy(o.x1,o.y1,o.xloc),b=xy(o.x2,o.y2,o.xloc);if(!a||!b)return;
          let x1=a.x,x2=b.x,y1=a.y,y2=b.y;const dx=b.x-a.x,dy=b.y-a.y;
          if(o.extend==="right"||o.extend==="both"){x2=hostWidth;y2=Math.abs(dx)>0.0001?a.y+(hostWidth-a.x)*(dy/dx):b.y;}
          if(o.extend==="left"||o.extend==="both"){x1=0;y1=Math.abs(dx)>0.0001?a.y+(0-a.x)*(dy/dx):a.y;}
          const el=document.createElementNS("http://www.w3.org/2000/svg","line");
          for(const [k,v] of Object.entries({x1,y1,x2,y2,stroke:o.color||"#2962ff","stroke-width":o.width||2,"stroke-dasharray":o.style==="dashed"?"7 5":o.style==="dotted"?"2 4":""}))el.setAttribute(k,String(v));
          svg.append(el);
        };
        for(const o of group.lines)drawLine(o);
        for(const o of group.boxes){
          const a=xy(o.left,o.top,o.xloc),b=xy(o.right,o.bottom,o.xloc);if(!a||!b)continue;
          const el=document.createElementNS("http://www.w3.org/2000/svg","rect");
          for(const [k,v] of Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:o.bgcolor||"none",stroke:o.border_color||"none","stroke-width":o.border_width||1}))el.setAttribute(k,String(v));
          svg.append(el);
        }
        for(const o of group.labels){
          const p=xy(o.x,o.y,o.xloc);if(!p)continue;
          const el=document.createElementNS("http://www.w3.org/2000/svg","text");
          el.setAttribute("x",String(p.x));el.setAttribute("y",String(p.y));el.setAttribute("fill",o.textcolor||"#fff");el.setAttribute("font-size","12");el.textContent=o.text;svg.append(el);
        }
        for(const f of group.linefills){
          const a=linesById.get(f.line1?.id),b=linesById.get(f.line2?.id);if(!a||!b)continue;
          const p1=xy(a.x1,a.y1,a.xloc),p2=xy(a.x2,a.y2,a.xloc),p3=xy(b.x2,b.y2,b.xloc),p4=xy(b.x1,b.y1,b.xloc);
          if(!p1||!p2||!p3||!p4)continue;
          const poly=document.createElementNS("http://www.w3.org/2000/svg","polygon");
          poly.setAttribute("points",[p1,p2,p3,p4].map(p=>p.x+","+p.y).join(" "));
          poly.setAttribute("fill",f.color||"rgba(41,98,255,0.18)");poly.setAttribute("stroke","none");svg.insertBefore(poly,svg.firstChild);
        }
      }
    }
    if(output.tables?.length&&drawingHost){
      for(const t of output.tables){if(t.deleted)continue;const el=document.createElement("div");el.className="pineTableOverlay";Object.assign(el.style,{position:"absolute",right:"8px",top:"8px",zIndex:"8",background:t.bgcolor||"#142033",color:"#fff",border:"1px solid "+(t.frame_color||"#64748b"),padding:"4px",fontSize:"11px",pointerEvents:"none"});const table=document.createElement("table");for(let r=0;r<t.rows;r++){const tr=document.createElement("tr");for(let c=0;c<t.columns;c++){const td=document.createElement("td"),cell=t.cells[c+":"+r];td.textContent=cell?.text||"";td.style.padding="3px 5px";td.style.color=cell?.text_color||"#fff";if(cell?.bgcolor)td.style.background=cell.bgcolor;tr.append(td);}table.append(tr);}el.append(table);drawingHost.append(el);state.tableEls.push(el);}
    }
    if(output.candles?.length){
      const kind=output.candles[0].type==="bar"?"BarSeries":"CandlestickSeries";
      const series=addChartSeries.call(null,target,kind,{upColor:"#22c58b",downColor:"#ff647c",borderUpColor:"#22c58b",borderDownColor:"#ff647c",wickUpColor:"#22c58b",wickDownColor:"#ff647c"});
      const data=output.candles.filter(x=>bars[x.bar]).map(x=>({time:bars[x.bar].time,open:x.open,high:x.high,low:x.low,close:x.close,color:x.color,wickColor:x.wickcolor,borderColor:x.bordercolor}));
      series.setData(data);state.series.push({chart:target,series});
    }
    if(overlay&&output.shapes?.length){
      const visible=output.shapes.filter(x=>x.value&&bars[x.bar]);
      if(priceSeries&&typeof LightweightCharts.createSeriesMarkers==="function"){
        const shapeMap={"shape.triangleup":"arrowUp","shape.arrowup":"arrowUp","shape.labelup":"arrowUp","shape.triangledown":"arrowDown","shape.arrowdown":"arrowDown","shape.labeldown":"arrowDown","shape.square":"square","shape.circle":"circle","shape.diamond":"square","shape.cross":"cross","shape.xcross":"cross"};
        const sizeMap={tiny:1,small:1,normal:2,large:3,huge:4};
        const markers=visible.map(x=>({time:bars[x.bar].time,position:x.location==="belowbar"||x.location==="bottom"?"belowBar":x.location==="abovebar"||x.location==="top"?"aboveBar":"inBar",color:x.color||"#2962ff",shape:shapeMap[x.style]||"circle",text:x.text||"",size:sizeMap[x.size]||2}));
        state.markers.push(LightweightCharts.createSeriesMarkers(priceSeries,markers));
      }else{
        const markerSeries=addChartSeries.call(null,target,"LineSeries",{color:"#ffffff",lineVisible:false,pointMarkersVisible:true,pointMarkersRadius:5,priceLineVisible:false,lastValueVisible:false});
        const points=visible.map(x=>({time:bars[x.bar].time,value:bars[x.bar].close,color:x.color||"#2962ff"}));
        markerSeries.setData(points);state.series.push({chart:target,series:markerSeries});
      }
    }
    state.clear=()=>remove(state);
    return state;
  }
  return {mount,remove,makeData};
});

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
    for(const p of state.panes||[]){try{p.chart.remove()}catch{}try{p.wrap.remove()}catch{}}
  }
  function mount(config){
    const {chart,addChartSeries,bars,output,host}=config;
    if(!chart||typeof addChartSeries!=="function"||!Array.isArray(bars)||!output)throw new TypeError("Pine chart adapter eksik yapılandırıldı.");
    const state={series:[],panes:[],markers:[],output};
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
      state.panes.push({chart:target,wrap});
      close.addEventListener("click",()=>remove(state));
    }
    for(const p of output.plots||[]){
      const color=typeof p.color==="string"?p.color:"#2962ff";
      const histogram=String(p.style).toLowerCase().includes("histogram");
      const series=addChartSeries.call(null,target,histogram?"HistogramSeries":"LineSeries",histogram?{color,priceLineVisible:false}:{color,lineWidth:Math.max(1,Math.min(4,Number(p.linewidth)||2)),priceLineVisible:false,lastValueVisible:true});
      series.setData(makeData(p.values,bars));
      state.series.push({chart:target,series});
    }
    for(const h of output.hlines||[]){
      if(typeof h.value!=="number"||!Number.isFinite(h.value))continue;
      const series=addChartSeries.call(null,target,"LineSeries",{color:"#8794a8",lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});
      series.setData(bars.map(b=>({time:b.time,value:h.value})));
      state.series.push({chart:target,series});
    }
    if(overlay&&output.shapes?.length){
      const markerSeries=addChartSeries.call(null,target,"LineSeries",{color:"#ffffff",lineVisible:false,pointMarkersVisible:true,pointMarkersRadius:5,priceLineVisible:false,lastValueVisible:false});
      const points=output.shapes.filter(x=>x.value&&bars[x.bar]).map(x=>({time:bars[x.bar].time,value:bars[x.bar].close,color:x.color||"#2962ff"}));
      markerSeries.setData(points);state.series.push({chart:target,series:markerSeries});
    }
    state.clear=()=>remove(state);
    return state;
  }
  return {mount,remove,makeData};
});

const COLORS=['#286f66','#ba5b33','#6e62a1','#a17d19','#397fb0','#ac4f7b','#547a2b','#6b6359','#137d92','#ca792d','#625fbc','#a65858'];
export function createCharts(container,onCursor,onPreview){
 let selectedTick=0,plot=null,signature='',hoverX=null,maxTick=0;
 const at=x=>plot.posToIdx(x-plot.over.getBoundingClientRect().left);
 return {render(model,run,tick){
  selectedTick=tick;maxTick=run.tick;
  const nodes=model.view.chartNodes.slice(0,12).map(id=>model.nodes.find(n=>n.id===id)).filter(Boolean);
  const next=JSON.stringify([model.stepLabel,nodes.map(n=>[n.id,n.name,n.baseline])]);
  if(signature!==next){plot?.destroy();plot=null;hoverX=null;container.replaceChildren();signature=next;}
  if(!nodes.length){container.textContent='Select chart variables in the node inspector.';return;}
  const data=[run.states.map((_,i)=>i)],series=[{label:'Tick'}];
  for(const [i,n]of nodes.entries()){
   data.push(run.states.map(s=>s[n.id]));series.push({label:n.name,stroke:COLORS[i],width:2,value:(_u,v)=>v==null?'—':v.toFixed(2)});
   data.push(run.states.map(()=>n.baseline));series.push({label:n.name+' baseline',stroke:COLORS[i],dash:[4,5],width:1,show:true,points:{show:false},value:()=>String(n.baseline)});
  }
  if(plot)plot.setData(data);else {plot=new uPlot({width:Math.max(250,container.clientWidth),height:230,series,scales:{x:{time:false,range:()=>[0,Math.max(10,maxTick)]},y:{range:()=>[0,100]}},axes:[{label:model.stepLabel,stroke:'#657069',grid:{show:false}},{label:'Abstract level',stroke:'#657069',size:45}],legend:{show:true},cursor:{drag:{x:false,y:false}}},data,container);
  // Hover and programmatic cursor updates are passive. Only an explicit chart click inspects history.
  plot.over.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'){hoverX=e.clientX;onPreview(at(hoverX));}});
  plot.over.addEventListener('pointerleave',()=>{hoverX=null;onPreview(null);plot.setCursor({left:plot.valToPos(selectedTick,"x"),top:0},false);});
  const select=e=>{hoverX=null;onCursor(at(e.clientX));};
  let down=null;
    plot.over.addEventListener('pointerdown',e=>{down=e.button===0?[e.pointerId,e.clientX,e.clientY]:null;});
    plot.over.addEventListener('pointercancel',()=>{down=null;});
    plot.over.addEventListener('pointerup',e=>{const p=down;down=null;if(p&&p[0]===e.pointerId&&Math.hypot(p[1]-e.clientX,p[2]-e.clientY)<6)select(e);});
  plot.over.addEventListener('click',e=>{if(!e.detail)select(e);});}
  if(!tick&&!run.tick)hoverX=null;
  if(hoverX!==null)queueMicrotask(()=>{if(hoverX!==null&&plot)onPreview(at(hoverX));});else plot.setCursor({left:plot.valToPos(tick,'x'),top:0},false);
 },cursor(tick){selectedTick=tick;if(plot){hoverX=null;plot.setCursor({left:plot.valToPos(tick,'x'),top:0},false);}},resize(){if(plot)plot.setSize({width:Math.max(250,container.clientWidth),height:230});}};
}

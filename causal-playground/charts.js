const COLORS=['#286f66','#ba5b33','#6e62a1','#a17d19','#397fb0','#ac4f7b','#547a2b','#6b6359','#137d92','#ca792d','#625fbc','#a65858'];
export function createCharts(container,onCursor){
 let plot=null,ignore=false;
 return {render(model,run,tick){
  ignore=true;plot?.destroy();container.replaceChildren();
  const nodes=model.view.chartNodes.slice(0,12).map(id=>model.nodes.find(n=>n.id===id)).filter(Boolean);
  if(!nodes.length){container.textContent='Select chart variables in the node inspector.';ignore=false;return;}
  const data=[run.states.map((_,i)=>i)],series=[{label:'Tick'}];
  for(const [i,n]of nodes.entries()){
   data.push(run.states.map(s=>s[n.id]));series.push({label:n.name,stroke:COLORS[i],width:2,value:(_u,v)=>v==null?'—':v.toFixed(2)});
   data.push(run.states.map(()=>n.baseline));series.push({label:n.name+' baseline',stroke:COLORS[i],dash:[4,5],width:1,show:true,points:{show:false},value:()=>String(n.baseline)});
  }
  plot=new uPlot({width:Math.max(250,container.clientWidth),height:230,series,scales:{x:{time:false,range:()=>[0,Math.max(10,run.tick)]},y:{range:()=>[0,100]}},axes:[{label:model.stepLabel,stroke:'#657069',grid:{show:false}},{label:'Abstract level',stroke:'#657069',size:45}],legend:{show:true},cursor:{drag:{x:false,y:false}}},data,container);
  // Hover and programmatic cursor updates are passive. Only an explicit chart click inspects history.
  plot.over.addEventListener('click',()=>{if(!ignore&&plot.cursor.idx!=null)onCursor(plot.cursor.idx);});
  plot.setCursor({left:plot.valToPos(tick,'x'),top:0},false);ignore=false;
 },cursor(tick){if(plot){ignore=true;plot.setCursor({left:plot.valToPos(tick,'x'),top:0},false);ignore=false;}},resize(){if(plot)plot.setSize({width:Math.max(250,container.clientWidth),height:230});}};
}

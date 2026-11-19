// Foundation: causal-playground/charts.js (52c1fa0): uPlot, passive hover,
// explicit click inspection, programmatic cursor and resize. No abstract baseline axes.
import {stockGroups} from './document.mjs';
const COLORS=['#286f66','#ba5b33','#6e62a1','#a17d19','#397fb0','#ac4f7b','#547a2b','#6b6359','#137d92','#ca792d','#625fbc','#a65858'];
export function createCharts(container,onCursor,onPreview,numericCoverage){
 let hover=null,selectedTick=0;
 const sync=(i,except)=>{for(const {plot} of plots)if(plot!==except)plot.setCursor({left:plot.valToPos(currentRun.rows[i].t,"x"),top:0},false);};
 const at=(plot,x)=>plot.posToIdx(x-plot.over.getBoundingClientRect().left);
 let plots=[],signature='',ignore=false,currentRun=null;
 const note=document.createElement('p');note.className='hint chart-coverage';
 const width=()=>Math.max(200,container.clientWidth-28);
 const api={render(model,run,tick){
  if(currentRun!==run)hover=null;
  currentRun=run;selectedTick=tick;
  const all=model.entities.filter(e=>e.type==='stock'),chosen=all.slice(0,12),ids=new Set(chosen.map(e=>e.id));
  const groups=[...stockGroups(model)].map(([unit,stocks])=>[unit,stocks.filter(e=>ids.has(e.id))]).filter(([,stocks])=>stocks.length);
  const next=JSON.stringify([model.time.unit,groups]);ignore=true;
  if(next!==signature){hover=null;plots.forEach(({plot})=>plot.destroy());plots=[];container.replaceChildren(note);signature=next;
   for(const [unit,stocks]of groups){const section=document.createElement('section');section.className='unit-chart';section.dataset.unit=unit;const heading=document.createElement('h3');heading.textContent='Stock amounts · '+unit;section.append(heading);container.append(section);
    const series=[{label:model.time.unit},...stocks.map((e,i)=>({label:e.name,stroke:COLORS[i%COLORS.length],width:2,points:{show:false},value:(_u,v)=>v==null?'—':v.toFixed(3)}))];
    const plot=new uPlot({width:width(),height:230,series,scales:{x:{time:false,range:()=>[0,Math.max(currentRun.model.time.dt,currentRun.rows.at(-1).t)]},y:{auto:true}},axes:[{label:'Time · '+model.time.unit,stroke:'#657069',grid:{show:false},size:46},{label:unit,stroke:'#657069',size:58}],legend:{show:true},cursor:{drag:{x:false,y:false}}},[[],...stocks.map(()=>[])],section);
    plot.over.setAttribute('aria-label','Stock history in '+unit+'. Click to inspect; numeric table and slider are keyboard alternatives.');plot.over.id=plots.length===0?'chart':`chart-${plots.length}`;
    plot.over.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'){hover={plot,x:e.clientX};const i=at(plot,e.clientX);sync(i,plot);onPreview(i);}});
    plot.over.addEventListener('pointerleave',()=>{if(hover?.plot===plot){hover=null;onPreview(null);sync(selectedTick);}});
    const select=e=>{if(!ignore){hover=null;onCursor(at(plot,e.clientX));}};
    let down=null;
    plot.over.addEventListener('pointerdown',e=>{down=e.button===0?[e.pointerId,e.clientX,e.clientY]:null;});
    plot.over.addEventListener('pointercancel',()=>{down=null;});
    plot.over.addEventListener('pointerup',e=>{const p=down;down=null;if(p&&p[0]===e.pointerId&&Math.hypot(p[1]-e.clientX,p[2]-e.clientY)<6)select(e);});
    plot.over.addEventListener('click',e=>{if(!e.detail)select(e);});
    plots.push({plot,stocks});
   }
   container.plots=plots.map(p=>p.plot);
  }
  // Disclosure depends on every stock, not only on the plotted-series signature.
  note.hidden=all.length<=12;
  note.textContent=`${chosen.length} of ${all.length} stocks charted; ${all.length-chosen.length} omitted from charts. All amounts remain in the numeric table. Exact unit groups, no unit conversion.${all.length>12?' Omitted: '+all.slice(12).map(e=>`${e.name} [${e.id}]`).join(', ')+'.':''}`;
  if(numericCoverage)numericCoverage.textContent=note.textContent;
  for(const {plot,stocks}of plots){plot.setData([run.rows.map(r=>r.t),...stocks.map(e=>run.rows.map(r=>r.stocks[e.id]))]);if(hover?.plot!==plot)plot.setCursor({left:plot.valToPos(run.rows[tick].t,'x'),top:0},false);}ignore=false;
  if(hover)queueMicrotask(()=>{if(hover){const i=at(hover.plot,hover.x);sync(i,hover.plot);onPreview(i);}});
 },clearPreview(){hover=null;},cursor(time){ignore=true;for(const {plot}of plots)plot.setCursor({left:plot.valToPos(time,'x'),top:0},false);ignore=false;},resize(){for(const {plot}of plots)plot.setSize({width:width(),height:230});}};
 return api;
}

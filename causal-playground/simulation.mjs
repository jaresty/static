import {assertModel,clone,LIMITS} from './model.mjs';
export function createRun(model){
 assertModel(model);const d=clone(model),state=Object.fromEntries(d.nodes.map(n=>[n.id,n.initial]));
 for(const p of d.interventions)state[p.node]=p.value;
 return {model:d,states:[state],transitions:[],tick:0};
}
export function step(run){
 if(run.tick>=LIMITS.ticks)throw new Error(`Run limit: ${LIMITS.ticks} steps. Reset to start again.`);
 const {model:d,tick:t}=run,now=run.states[t],next={},records={};
 const byId=Object.fromEntries(d.nodes.map(n=>[n.id,n]));
 const edges=[...d.relationships].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 for(const n of [...d.nodes].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
  const recovery=n.responsiveness*(n.baseline-now[n.id]);
  const incoming=edges.filter(e=>e.to===n.id).map(e=>{
   const sourceTick=t-e.delaySteps,source=byId[e.from];
   const sourceValue=sourceTick<0?source.initial:run.states[sourceTick][e.from];
   const applied=n.responsiveness*(e.polarity==='+'?1:-1)*e.gain*(sourceValue-source.baseline);
   return {relationship:e.id,source:e.from,sourceTick,sourceValue,sourceBaseline:source.baseline,applied};
  });
  const rawNext=now[n.id]+recovery+incoming.reduce((sum,e)=>sum+e.applied,0);
  const value=Math.max(0,Math.min(100,rawNext));next[n.id]=value;
  records[n.id]={node:n.id,fromTick:t,toTick:t+1,current:now[n.id],recovery,incoming,rawNext,boundaryAdjustment:value-rawNext,next:value,net:value-now[n.id]};
 }
 run.transitions.push(records);run.states.push(next);run.tick++;return records;
}
export function advance(run,count=1){for(let i=0;i<count;i++)step(run);return run;}
export function stateAt(run,tick){return run.states[Math.max(0,Math.min(run.tick,tick))];}

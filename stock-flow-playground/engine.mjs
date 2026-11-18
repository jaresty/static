import {validate,evaluate,LIMITS} from './model.mjs';
export function createRun(model){const {model:m}=validate(model);const stocks=Object.fromEntries(m.entities.filter(e=>e.type==='stock').map(e=>[e.id,e.initial]));return {model:m,rows:[{t:0,stocks,incoming:Object.fromEntries(Object.keys(stocks).map(id=>[id,0])),outgoing:Object.fromEntries(Object.keys(stocks).map(id=>[id,0])),flows:[],values:{},delayedReads:[]}]};}
export function step(run){
  const {model:m,byId,expressions,order,hasDelay}=validate(run.model),old=run.rows.at(-1);
  if(old.t>=m.time.horizon-1e-10)return false;
  if(run.rows.length>LIMITS.steps)throw Error('Transition limit reached');
  const dt=Math.min(m.time.dt,m.time.horizon-old.t),values=Object.assign(Object.create(null),old.stocks);
  for(const e of m.entities)if(e.type==='parameter')values[e.id]=e.value;
  const delayedReads=[],tick=run.rows.length-1;
  const compute=id=>evaluate(expressions.get(id),values,(stock,steps)=>{const sourceTick=tick-steps,value=sourceTick<0?byId.get(stock).initial:run.rows[sourceTick].stocks[stock];delayedReads.push({expression:id,stock,steps,sourceTick,sourceTime:sourceTick*m.time.dt,value,prehistory:sourceTick<0});return value;});
  for(const id of order)values[id]=compute(id);
  // Aggregate first. All rates see old state; no incoming material funds this step's outflows.
  const flows=m.entities.filter(e=>e.type==='flow').sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(e=>{const requested=compute(e.id);if(requested<0)throw Error(`${e.id}: negative transfer rate; model reverse flow separately`);return {id:e.id,source:e.source,target:e.target,expression:e.expression,requested,amount:requested*dt};});
  const totals=Object.create(null);for(const f of flows)if(f.source)totals[f.source]=(totals[f.source]||0)+f.amount;
  const row={t:hasDelay?run.rows.length*m.time.dt:old.t+dt,dt,delayedReads,stocks:{...old.stocks},incoming:{...old.incoming},outgoing:{...old.outgoing},flows:[],values:{...values}};
  for(const f of flows){const factor=f.source&&totals[f.source]>old.stocks[f.source]?old.stocks[f.source]/totals[f.source]:1;const amount=f.amount*factor;
    row.flows.push({...f,requestedAmount:f.amount,amount,applied:amount/dt,factor,limited:factor<1});
    if(f.source){row.stocks[f.source]-=amount;row.outgoing[f.source]+=amount;}
    if(f.target){row.stocks[f.target]+=amount;row.incoming[f.target]+=amount;}
  }
  for(const [id,value] of Object.entries(row.stocks)){
    if(!Number.isFinite(value)||value>LIMITS.magnitude||value< -1e-8)throw Error(`${byId.get(id).name}: numerical domain exceeded; reduce dt/rates`);
    // Roundoff only, not independent physical clipping. Reconstruct from the ledger.
    const ledger=byId.get(id).initial+row.incoming[id]-row.outgoing[id];
    if(Math.abs(ledger-value)>1e-5)throw Error('Accounting discrepancy');
    if(value<0)row.stocks[id]=0;
  }
  run.rows.push(row);return true;
}
export function finish(run){while(step(run));return run;}
export function stockLedger(run,index,id){const e=run.model.entities.find(e=>e.id===id&&e.type==='stock');if(!e)throw Error('Select a stock');const row=run.rows[index];return {initial:e.initial,inflow:row.incoming[id],outflow:row.outgoing[id],value:row.stocks[id],balance:e.initial+row.incoming[id]-row.outgoing[id]};}

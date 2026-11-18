import {validate,evaluate,LIMITS} from './model.mjs';
// Private numerical error budgets, not portable model/run evidence or a solver cache.
// Binary64 round-to-nearest add/sub error <= u*(|a|+|b|), u=EPSILON/2.
// EPSILON leaves a factor-two margin for calculating the bound; MIN_VALUE covers subnormals.
const roundoff=new WeakMap();
const operationError=(a,b)=>Number.EPSILON*(Math.abs(a)+Math.abs(b))+Number.MIN_VALUE;
const addError=(a,b)=>(a+b)*(1+Number.EPSILON)+Number.MIN_VALUE;
export function createRun(model){const {model:m}=validate(model);const stocks=Object.fromEntries(m.entities.filter(e=>e.type==='stock').map(e=>[e.id,e.initial]));const run={model:m,rows:[{t:0,stocks,incoming:Object.fromEntries(Object.keys(stocks).map(id=>[id,0])),outgoing:Object.fromEntries(Object.keys(stocks).map(id=>[id,0])),flows:[],values:{},delayedReads:[]}]};roundoff.set(run,Object.fromEntries(Object.keys(stocks).map(id=>[id,{stock:0,incoming:0,outgoing:0}])));return run;}
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
  const errors=structuredClone(roundoff.get(run));
  for(const f of flows){const factor=f.source&&totals[f.source]>old.stocks[f.source]?old.stocks[f.source]/totals[f.source]:1;const amount=f.amount*factor;
    row.flows.push({...f,requestedAmount:f.amount,amount,applied:amount/dt,factor,limited:factor<1});
    if(f.source){const id=f.source;errors[id].stock=addError(errors[id].stock,operationError(row.stocks[id],amount));errors[id].outgoing=addError(errors[id].outgoing,operationError(row.outgoing[id],amount));row.stocks[id]-=amount;row.outgoing[id]+=amount;}
    if(f.target){const id=f.target;errors[id].stock=addError(errors[id].stock,operationError(row.stocks[id],amount));errors[id].incoming=addError(errors[id].incoming,operationError(row.incoming[id],amount));row.stocks[id]+=amount;row.incoming[id]+=amount;}
  }
  for(const [id,value] of Object.entries(row.stocks)){
    if(!Number.isFinite(value)||value>LIMITS.magnitude||value< -1e-8)throw Error(`${byId.get(id).name}: numerical domain exceeded; reduce dt/rates`);
    // Compare two evaluations of the same applied amounts. Rate/multiplication
    // rounding is shared by both paths, so is not an additional accounting error.
    const initial=byId.get(id).initial,subtotal=initial+row.incoming[id],ledger=subtotal-row.outgoing[id],e=errors[id];
    const bound=addError(addError(e.stock,e.incoming),addError(e.outgoing,addError(operationError(initial,row.incoming[id]),operationError(subtotal,row.outgoing[id]))));
    if(!Number.isFinite(ledger)||!Number.isFinite(bound)||Math.abs(ledger-value)>bound)throw Error('Accounting discrepancy');
    // Preserve existing near-zero normalization, and account for its exact size.
    if(value<0){e.stock=addError(e.stock,-value);row.stocks[id]=0;}
  }
  run.rows.push(row);roundoff.set(run,errors);return true;
}
export function finish(run){while(step(run));return run;}
export function stockLedger(run,index,id){const e=run.model.entities.find(e=>e.id===id&&e.type==='stock');if(!e)throw Error('Select a stock');const row=run.rows[index];return {initial:e.initial,inflow:row.incoming[id],outflow:row.outgoing[id],value:row.stocks[id],balance:e.initial+row.incoming[id]-row.outgoing[id]};}

import {assertModel,canonical,clone,dynamicsKey} from './model.mjs';
export function createHistory(initial){return {past:[],current:clone(initial),future:[]};}
export function commit(history,next){assertModel(next);if(canonical(next)===canonical(history.current))return false;history.past.push(history.current);if(history.past.length>50)history.past.shift();history.current=clone(next);history.future=[];return true;}
export function undo(history){if(!history.past.length)return false;history.future.push(history.current);history.current=history.past.pop();return true;}
export function redo(history){if(!history.future.length)return false;history.past.push(history.current);history.current=history.future.pop();return true;}
export const changesDynamics=(a,b)=>dynamicsKey(a)!==dynamicsKey(b);
export function diff(a,b){
 const out=[];
 for(const [kind,key] of [['node','nodes'],['relationship','relationships']]){
  const old=new Map(a[key].map(x=>[x.id,x])),fresh=new Map(b[key].map(x=>[x.id,x]));
  for(const [id,value]of fresh){if(!old.has(id))out.push(`Added ${kind}: ${value.name} (${id})`);else if(canonical(old.get(id))!==canonical(value))out.push(`Changed ${kind}: ${value.name} (${id})`);}
  for(const [id,value]of old)if(!fresh.has(id))out.push(`Removed ${kind}: ${value.name} (${id})`);
 }
 for(const key of ['title','description','stepLabel','assumptions','interventions','view'])if(canonical(a[key])!==canonical(b[key]))out.push(`Changed ${key}`);
 out.push(changesDynamics(a,b)?'Dynamics changed — applying resets the run.':'Presentation only — run retained.');return out;
}

// Adapted from causal-playground/document.mjs (release 52c1fa0): snapshot history,
// no-op suppression, dynamics/view separation and application-computed diffs.
import {validate,canonical} from './model.mjs';
const clone=x=>structuredClone(x);
export function dynamicsKey(model){validate(model);return JSON.stringify({time:JSON.parse(canonical(model)).time,entities:JSON.parse(canonical(model)).entities.map(({name,...dynamic})=>dynamic)});}
export const changesDynamics=(a,b)=>dynamicsKey(a)!==dynamicsKey(b);
export function createHistory(initial){return {past:[],current:clone(initial),future:[]};}
export function commit(history,next){validate(next);if(canonical(next)===canonical(history.current))return false;history.past.push(history.current);if(history.past.length>50)history.past.shift();history.current=clone(next);history.future=[];return true;}
export function undo(history){if(!history.past.length)return false;history.future.push(history.current);history.current=history.past.pop();return true;}
export function redo(history){if(!history.future.length)return false;history.past.push(history.current);history.current=history.future.pop();return true;}
export function diff(a,b){const out=[],old=new Map(a.entities.map(e=>[e.id,e])),fresh=new Map(b.entities.map(e=>[e.id,e]));for(const [id,e]of fresh)if(!old.has(id))out.push(`Added ${id}`);else if(JSON.stringify(old.get(id))!==JSON.stringify(e))out.push(`Changed ${id}`);for(const id of old.keys())if(!fresh.has(id))out.push(`Removed ${id}`);if(a.title!==b.title)out.push('Title changed');if(JSON.stringify(a.time)!==JSON.stringify(b.time))out.push('Time settings changed');if(JSON.stringify(a.view||{})!==JSON.stringify(b.view||{}))out.push('View changed');out.push(changesDynamics(a,b)?'Dynamics changed — applying resets the run.':'Presentation only — run retained.');return out;}
export function stockGroups(model){const groups=new Map();for(const s of model.entities.filter(e=>e.type==='stock')){if(!groups.has(s.unit))groups.set(s.unit,[]);groups.get(s.unit).push(s);}return groups;}

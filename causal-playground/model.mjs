export const LIMITS = Object.freeze({nodes:100,relationships:500,gain:4,delay:100,ticks:2000,bytes:1048576,url:8000});
export const ENGINE = 'bounded-influence-v1';
export const RULES = `Abstract levels 0–100. For transition t→t+1, each edge contributes target.responsiveness × sign × gain × (source(t−delaySteps) − source.baseline). Baseline recovery is responsiveness × (baseline − current). Sum applied contributions and recovery, then clamp to [0,100], recording the boundary adjustment. All nodes read the same committed state, contributions are summed in relationship-ID order. Before tick zero every source holds its initial value. A tick-zero pulse replaces the observed value at tick 0, not its prehistory. Zero delay reads tick t, never t+1. Playback speed does not affect the equations. These discrete illustrative dynamics do not establish real-world causation, conserved stocks, or stability.`;
const obj = (properties,required=Object.keys(properties)) => ({type:'object',additionalProperties:false,properties,required});
const str = maxLength => ({type:'string',maxLength});
const id = {type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,63}$'};
const num = (minimum,maximum,type='number') => ({type,minimum,maximum});
const arr = (items,maxItems) => ({type:'array',items,maxItems});
export const SCHEMA = {$schema:'https://json-schema.org/draft/2020-12/schema',...obj({
 format:{const:'causal-playground'}, schemaVersion:{const:1},engine:{const:ENGINE},title:str(160),description:str(4000),stepLabel:str(30),
 nodes:arr(obj({id,name:str(120),initial:num(0,100),baseline:num(0,100),responsiveness:{...num(0,1),exclusiveMinimum:0}}),LIMITS.nodes),
 relationships:arr(obj({id,name:str(160),from:id,to:id,polarity:{enum:['+','-']},gain:num(0,4),delaySteps:num(0,100,'integer')}),LIMITS.relationships),
 interventions:arr(obj({id,kind:{const:'pulse'},node:id,tick:{const:0},value:num(0,100)}),LIMITS.nodes),
 assumptions:arr(str(1000),100),
 view:obj({positions:{type:'object',maxProperties:100,propertyNames:id,additionalProperties:obj({x:num(-10000,10000),y:num(-10000,10000)})},chartNodes:{...arr(id,100),uniqueItems:true}})
 })};
export function validateSchema(value,schema=SCHEMA,path='$',errors=[]) {
 const fail = message => errors.push(`${path}: ${message}`);
 if ('const' in schema && value!==schema.const) fail(`expected ${JSON.stringify(schema.const)}`);
 if(schema.enum&&!schema.enum.includes(value)) fail(`expected ${schema.enum.join(' or ')}`);
 if(schema.type==='object') {
  if(!value||typeof value!=='object'||Array.isArray(value)){fail('expected object');return errors;}
  for(const key of schema.required||[]) if(!Object.hasOwn(value,key)) errors.push(`${path}.${key}: required`);
  if(schema.maxProperties&&Object.keys(value).length>schema.maxProperties) fail('too many properties');
  for(const [key,v] of Object.entries(value)) {
   if(schema.propertyNames) validateSchema(key,schema.propertyNames,`${path} key`,errors);
   if(schema.properties&&Object.hasOwn(schema.properties,key)) validateSchema(v,schema.properties[key],`${path}.${key}`,errors);
   else if(schema.additionalProperties===false) errors.push(`${path}.${key}: unknown field`);
   else if(typeof schema.additionalProperties==='object') validateSchema(v,schema.additionalProperties,`${path}.${key}`,errors);
  }
 }
 if(schema.type==='array') {
  if(!Array.isArray(value)){fail('expected array');return errors;}
  if(value.length>schema.maxItems) fail(`maximum ${schema.maxItems} items`);
  if(schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length) fail('duplicate items');
  value.forEach((v,i)=>validateSchema(v,schema.items,`${path}[${i}]`,errors));
 }
 if(schema.type==='string') {
  if(typeof value!=='string') fail('expected string');
  else {if(value.length>schema.maxLength) fail(`maximum ${schema.maxLength} characters`);if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail('invalid identifier');}
 }
 if(schema.type==='number'||schema.type==='integer') {
  if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isInteger(value))) fail(`expected finite ${schema.type}`);
  else if(value<schema.minimum||value>schema.maximum||(schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum)) fail(`outside supported range`);
 }
 return errors;
}
export function validate(model) {
 const errors=validateSchema(model);
 if(errors.length)return {ok:false,errors};
 const nodes=new Set(),edges=new Set(),pairs=new Set(),pulses=new Set(),pulseIds=new Set();
 for(const n of model.nodes){if(nodes.has(n.id))errors.push(`duplicate node id: ${n.id}`);nodes.add(n.id);}
 for(const e of model.relationships){
  if(edges.has(e.id))errors.push(`duplicate relationship id: ${e.id}`);edges.add(e.id);
  if(!nodes.has(e.from)||!nodes.has(e.to))errors.push(`relationship ${e.id}: missing endpoint`);
  const pair=`${e.from}/${e.to}`;if(pairs.has(pair))errors.push(`duplicate ordered pair: ${pair}`);pairs.add(pair);
 }
 for(const p of model.interventions){if(!nodes.has(p.node))errors.push(`pulse ${p.id}: missing node`);if(pulses.has(p.node))errors.push(`conflicting pulse: ${p.node}`);pulses.add(p.node);if(pulseIds.has(p.id))errors.push(`duplicate pulse id: ${p.id}`);pulseIds.add(p.id);}
 for(const n of model.view.chartNodes)if(!nodes.has(n))errors.push(`chart: missing node ${n}`);
 for(const n of Object.keys(model.view.positions))if(!nodes.has(n))errors.push(`position: missing node ${n}`);
 return {ok:!errors.length,errors};
}
export function assertModel(model){const result=validate(model);if(!result.ok)throw new Error(result.errors.slice(0,20).join('\n'));return model;}
export function parseModel(text){if(new TextEncoder().encode(text).length>LIMITS.bytes)throw new Error('Document exceeds 1 MiB');return assertModel(JSON.parse(text));}
export const clone = value => JSON.parse(JSON.stringify(value));
export function canonical(value){if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;return JSON.stringify(value);}
export function dynamicsKey(d){return canonical({engine:d.engine,nodes:d.nodes.map(({id,initial,baseline,responsiveness})=>({id,initial,baseline,responsiveness})).sort((a,b)=>a.id.localeCompare(b.id)),relationships:d.relationships.map(({name,...e})=>e).sort((a,b)=>a.id.localeCompare(b.id)),interventions:d.interventions});}
export function blank(){return {format:'causal-playground',schemaVersion:1,engine:ENGINE,title:'Untitled system',description:'',stepLabel:'step',nodes:[],relationships:[],interventions:[],assumptions:['Values are abstract levels, not physical units.','Gains and delays are illustrative hypotheses, not calibrated predictions.'],view:{positions:{},chartNodes:[]}};}
export function example(kind='recovery'){
 const d=blank();d.title={recovery:'Room to recover',reinforcement:'Success feeds success',balancing:'A delayed correction'}[kind];
 const add=(id,name,x,y)=>{d.nodes.push({id,name,initial:50,baseline:50,responsiveness:0.15});d.view.positions[id]={x,y};d.view.chartNodes.push(id);};
 add('a',kind==='recovery'?'Pressure':kind==='reinforcement'?'Confidence':'Demand',160,190);
 if(kind==='recovery'){add('b','Strain',490,190);d.relationships.push({id:'a-b',name:'Pressure creates strain',from:'a',to:'b',polarity:'+',gain:0.6,delaySteps:2});}
 if(kind==='reinforcement'){add('b','Practice',490,190);d.relationships.push({id:'a-b',name:'Confidence encourages practice',from:'a',to:'b',polarity:'+',gain:1.25,delaySteps:0},{id:'b-a',name:'Practice builds confidence',from:'b',to:'a',polarity:'+',gain:1.25,delaySteps:0});}
 if(kind==='balancing')d.relationships.push({id:'a-a',name:'Delayed correction',from:'a',to:'a',polarity:'-',gain:2,delaySteps:6});
 d.interventions.push({id:'pulse-a',kind:'pulse',node:'a',tick:0,value:70});return d;
}

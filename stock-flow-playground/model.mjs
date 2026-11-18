// Stock-flow v1: data only. No code evaluation or graph-library state.
export const LIMITS = Object.freeze({entities:40, steps:2000, expression:512, depth:24, bytes:65536, magnitude:1e12});
const bad = new Set(['__proto__','prototype','constructor','min','max','abs','delay']);
const fail = message => { throw new Error(message); };
const finite = (x, name, lo=-LIMITS.magnitude, hi=LIMITS.magnitude) => typeof x === 'number' && Number.isFinite(x) && x>=lo && x<=hi ? x : fail(`${name}: finite number in [${lo}, ${hi}] required`);
export function parse(text) {
  if(typeof text !== 'string' || !text.trim() || text.length>LIMITS.expression) fail('Expression must contain 1–512 characters');
  const tokens = []; let i=0;
  while(i<text.length) {
    if(/\s/.test(text[i])) {i++;continue;}
    const rest=text.slice(i), n=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/), id=rest.match(/^[a-z][a-z0-9_]*/);
    if(n){tokens.push({n:finite(Number(n[0]),'Literal')});i+=n[0].length;}
    else if(id){tokens.push(id[0]);i+=id[0].length;}
    else if('+-*/(),'.includes(text[i]))tokens.push(text[i++]);
    else fail(`Expression: unexpected character at ${i+1}`);
  }
  let p=0; const refs=new Set(), delays=[];
  function expr(depth=0, min=0) {
    if(depth>LIMITS.depth)fail('Expression depth exceeds 24');
    let t=tokens[p++], node;
    if(t && typeof t==='object')node={op:'number',value:t.n};
    else if(t==='+'||t==='-')node={op:'unary',sign:t,arg:expr(depth+1,3)};
    else if(t==='('){node=expr(depth+1);if(tokens[p++]!==')')fail('Expected closing parenthesis');}
    else if(typeof t==='string' && /^[a-z]/.test(t)) {
      if(tokens[p]==='(') {
        if(t==='delay'){
          p++;const id=tokens[p++];if(typeof id!=='string'||!/^[a-z]/.test(id)||bad.has(id)||tokens[p++]!==',')fail('delay requires a stock ID and integer literal steps');
          const d=tokens[p++];if(!d||typeof d!=='object'||!Number.isInteger(d.n)||d.n<0||d.n>100||tokens[p++]!==')')fail('delay steps must be an integer literal from 0 to 100');
          refs.add(id);delays.push({id,steps:d.n});node={op:'delay',id,steps:d.n};
        } else {
        if(!['min','max','abs'].includes(t))fail(`Unknown function ${t}`);
        p++;const args=[expr(depth+1)];while(tokens[p]===','){p++;args.push(expr(depth+1));if(args.length>2)fail('Functions accept at most two arguments');}
        if(tokens[p++]!==')'||args.length!==(t==='abs'?1:2))fail(`${t}: wrong argument count`);
        node={op:t,args};
        }
      } else {if(bad.has(t))fail(`Unsafe reference ${t}`);refs.add(t);node={op:'ref',id:t};}
    } else fail('Expected number, reference, unary sign or parenthesis');
    while(p<tokens.length){const op=tokens[p],prec=op==='+'||op==='-'?1:op==='*'||op==='/'?2:0;if(!prec||prec<min)break;p++;node={op,left:node,right:expr(depth+1,prec+1)};}
    return node;
  }
  const ast=expr();if(p!==tokens.length)fail('Unexpected trailing expression input');
  // Left-associated arithmetic also counts toward the structural depth bound.
  const check=(n,d=0)=>{if(d>LIMITS.depth)fail('Expression depth exceeds 24');for(const child of [n.arg,n.left,n.right,...(n.args||[])])if(child)check(child,d+1);};check(ast);
  return {ast,refs:[...refs],delays};
}
export function evaluate(parsed, values, delayed=null) {
  function ev(n){let x;switch(n.op){case 'delay':if(!delayed)fail('Delay requires run history');x=delayed(n.id,n.steps);break;case 'number':x=n.value;break;case 'ref':if(!Object.hasOwn(values,n.id))fail(`Unknown reference ${n.id}`);x=values[n.id];break;case 'unary':x=(n.sign==='-'?-1:1)*ev(n.arg);break;case '+':x=ev(n.left)+ev(n.right);break;case '-':x=ev(n.left)-ev(n.right);break;case '*':x=ev(n.left)*ev(n.right);break;case '/':x=ev(n.left)/ev(n.right);break;default:x=Math[n.op](...n.args.map(ev));}return finite(x,'Expression result');}
  return ev(parsed.ast);
}
function object(x,keys,name,optional=[]){
  const allowed=[...keys,...optional];if(!x||Array.isArray(x)||typeof x!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(x)))fail(`${name}: object required`);for(const k of Object.keys(x))if(!allowed.includes(k)||bad.has(k))fail(`${name}: unknown/unsafe key ${k}`);for(const k of keys)if(!Object.hasOwn(x,k))fail(`${name}: missing ${k}`);}
function text(x,name,max=80){if(typeof x!=='string'||!x.trim()||x.length>max||/[\u0000-\u001f]/.test(x))fail(`${name}: nonempty text, max ${max}`);}
export function validate(input) {
  object(input,['version','title','time','entities'],'Model',['view']);if(input.version!==1)fail('Only stock-flow version 1 is accepted; no causal-model migration');text(input.title,'Title');
  object(input.time,['unit','dt','horizon'],'Time');text(input.time.unit,'Time unit',24);finite(input.time.dt,'dt',0.000001,1000000);finite(input.time.horizon,'horizon',input.time.dt,1000000);
  if(Math.ceil(input.time.horizon/input.time.dt)>LIMITS.steps)fail('Maximum 2000 transitions; increase dt or reduce horizon');
  if(!Array.isArray(input.entities)||input.entities.length>LIMITS.entities||!input.entities.length)fail('Model requires 1–40 entities');
  const byId=new Map(), expressions=new Map();
  for(const e of input.entities){
    const fields={stock:['initial'],parameter:['value'],auxiliary:['expression'],flow:['expression','source','target']}[e?.type];if(!fields)fail('Unknown entity type');
    object(e,['id','type','name','unit',...fields],'Entity');
    if(typeof e.id!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(e.id)||bad.has(e.id)||byId.has(e.id))fail(`Invalid, reserved or duplicate ID ${e.id}`);
    text(e.name,'Name');text(e.unit,'Unit',24);byId.set(e.id,e);
    if(e.type==='stock')finite(e.initial,`${e.id} initial`,0);
    if(e.type==='parameter')finite(e.value,`${e.id} value`);
    if(e.expression!==undefined)expressions.set(e.id,parse(e.expression));
  }
  if(!input.entities.some(e=>e.type==='stock'))fail('At least one stock required');
  if(input.view!==undefined){object(input.view,['positions'],'View');const positions=input.view.positions;if(!positions||Array.isArray(positions)||typeof positions!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(positions)))fail('View positions must be an object');for(const [id,pos]of Object.entries(positions)){if(!byId.has(id)||bad.has(id))fail(`Unknown view position ${id}`);object(pos,['x','y'],'Position');finite(pos.x,'Position x',-10000,10000);finite(pos.y,'Position y',-10000,10000);}}
  const hasDelay=[...expressions.values()].some(x=>x.delays.length);
  if(hasDelay&&Math.abs(input.time.horizon/input.time.dt-Math.round(input.time.horizon/input.time.dt))>1e-9)fail('Delay-capable models require horizon to be an integer multiple of dt; no shorter terminal step');
  for(const e of input.entities){
    for(const d of expressions.get(e.id)?.delays||[])if(byId.get(d.id)?.type!=='stock')fail(`${e.id}: delay source must be a stock ID`);
    for(const r of expressions.get(e.id)?.refs||[]){if(!byId.has(r))fail(`${e.id}: unknown reference ${r}`);if(byId.get(r).type==='flow')fail(`${e.id}: references to flows are forbidden`);}
    if(e.type==='flow'){
      for(const key of ['source','target'])if(e[key]!==null&&byId.get(e[key])?.type!=='stock')fail(`${e.id}: ${key} must be a stock ID or null environment`);
      if(e.source===null&&e.target===null)fail(`${e.id}: both endpoints cannot be environment`);
      if(e.source===e.target)fail(`${e.id}: source and target must differ`);
      if(e.source&&e.target&&byId.get(e.source).unit!==byId.get(e.target).unit)fail(`${e.id}: endpoint stock units must match exactly`);
      const amountUnit=byId.get(e.source||e.target).unit;
      if(e.unit!==`${amountUnit}/${input.time.unit}`)fail(`${e.id}: flow unit must be ${amountUnit}/${input.time.unit}`);
    }
  }
  const order=[],visiting=new Set(),done=new Set();
  function visit(id){if(done.has(id))return;if(visiting.has(id))fail(`Cyclic auxiliary dependency at ${id}`);visiting.add(id);for(const r of expressions.get(id)?.refs||[])if(byId.get(r).type==='auxiliary')visit(r);visiting.delete(id);done.add(id);order.push(id);}
  for(const e of input.entities)if(e.type==='auxiliary')visit(e.id);
  if(new TextEncoder().encode(JSON.stringify(input)).length>LIMITS.bytes)fail('Document exceeds 65536 bytes');
  return {model:structuredClone(input),byId,expressions,order,hasDelay};
}
export function canonical(model){validate(model);return JSON.stringify({version:1,title:model.title,time:{unit:model.time.unit,dt:model.time.dt,horizon:model.time.horizon},view:{positions:Object.fromEntries(Object.entries(model.view?.positions||{}).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,p])=>[id,{x:p.x,y:p.y}]))},entities:[...model.entities].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(e=>Object.fromEntries(Object.entries(e).sort(([a],[b])=>a<b?-1:a>b?1:0)))});}
export const example = {version:1,title:'Two tanks · drain feedback',time:{unit:'hour',dt:0.25,horizon:12},entities:[
  {id:'upper',type:'stock',name:'Upper tank',unit:'L',initial:100},
  {id:'lower',type:'stock',name:'Lower tank',unit:'L',initial:0},
  {id:'k',type:'parameter',name:'Drain fraction',unit:'1/hour',value:0.2},
  {id:'drain_rate',type:'auxiliary',name:'Gravity drain hypothesis',unit:'L/hour',expression:'k * upper'},
  {id:'drain',type:'flow',name:'Transfer to lower tank',unit:'L/hour',expression:'drain_rate',source:'upper',target:'lower'}]};

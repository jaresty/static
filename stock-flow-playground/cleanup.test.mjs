import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCharts} from './charts.mjs';
import {createRun,step,finish} from './engine.mjs';

const model=(initial=1e12,horizon=20)=>({version:1,title:'Precision probe',time:{unit:'hour',dt:1,horizon},entities:[{id:'s',type:'stock',name:'Source',unit:'L',initial},{id:'f',type:'flow',name:'Out',unit:'L/hour',source:'s',target:null,expression:'0.1'}]});
test('R2 operation-scale roundoff completes admitted small outflows',()=>{
 for(const initial of [100,1e8,1e10,1e12])for(const horizon of [20,2000]){
  const r=finish(createRun(model(initial,horizon)));
  assert.equal(r.rows.length,horizon+1);
  assert.ok(Math.abs(r.rows.at(-1).stocks.s-Math.max(0,initial-.1*horizon))<Math.max(1e-9,horizon*Number.EPSILON*initial));
 }
});
test('R2 long internal/external multi-flow runs retain equal applied debit and credit',()=>{
 const m=model(1e12,2000);m.entities.push({id:'t',type:'stock',name:'Target',unit:'L',initial:10},{id:'g',type:'flow',name:'Internal',unit:'L/hour',source:'s',target:'t',expression:'0.1'},{id:'h',type:'flow',name:'Return',unit:'L/hour',source:'t',target:'s',expression:'0.03'});
 const r=finish(createRun(m));assert.equal(r.rows.length,2001);for(const row of r.rows.slice(1)){assert.ok(row.stocks.s>=0&&row.stocks.t>=0);assert.equal(row.flows.find(f=>f.id==='g').amount,.1);assert.equal(row.flows.find(f=>f.id==='h').amount,.03);}
 assert.ok(Math.abs(r.rows.at(-1).stocks.t-150)<1e-8);
});
test('R3 corrupt cumulative ledger rejects atomically at multiple scales',()=>{
 for(const initial of [100,1e8,1e10,1e12])for(const field of ['incoming','outgoing','stocks']){
  const r=createRun(model(initial));step(r);r.rows.at(-1)[field].s+=field==='stocks'?-1:1;
  const before=structuredClone(r.rows);assert.throws(()=>step(r),/Accounting discrepancy/);assert.deepEqual(r.rows,before);
 }
});
// Minimal DOM/uPlot test double isolates lifecycle and disclosure; real uPlot is browser-tested.
class Element {constructor(){this.children=[];this.clientWidth=700;this.dataset={};this.style={setProperty(){}};}append(...xs){this.children.push(...xs);}replaceChildren(...xs){this.children=xs;}get tBodies(){return [this];}insertRow(){return this;}insertCell(){const cell=new Element();this.append(cell);return cell;}setAttribute(){}addEventListener(){} }
test('R1 current omission coverage follows 12→13→14→13 and omitted rename without plot rebuild',()=>{
 const oldDocument=globalThis.document,oldPlot=globalThis.uPlot;
 globalThis.document={createElement:()=>new Element()};let made=0;
 globalThis.uPlot=class {constructor(){made++;this.over=new Element();}destroy(){}setData(){}setCursor(){}valToPos(){return 0;}};
 try{
  const container=new Element(),charts=createCharts(container,()=>{}),m=model();m.entities=Array.from({length:12},(_,i)=>({id:'s_'+i,type:'stock',name:'Stock '+i,unit:'L',initial:0}));
  const render=()=>charts.render(m,createRun(m),0),note=()=>container.children.find(x=>x.className==='hint chart-coverage').textContent;
  render();assert.match(note(),/12 of 12 stocks charted; 0 omitted/);const initialPlots=made;
  m.entities.push({id:'s_12',type:'stock',name:'Stock 12',unit:'L',initial:0});render();assert.match(note(),/12 of 13 stocks charted; 1 omitted/);
  m.entities[12].name='Renamed omitted';render();assert.match(note(),/Renamed omitted \[s_12\]/);assert.ok(!note().includes('Stock 12 ['));
  m.entities.push({id:'s_13',type:'stock',name:'Stock 13',unit:'L',initial:0});render();assert.match(note(),/12 of 14 stocks charted; 2 omitted/);assert.match(note(),/Stock 13 \[s_13\]/);
  m.entities.pop();render();assert.match(note(),/12 of 13 stocks charted; 1 omitted/);assert.ok(!note().includes('s_13'));assert.equal(made,initialPlots);
 }finally{globalThis.document=oldDocument;globalThis.uPlot=oldPlot;}
});
test('R6 dialog references existing visible modal title',async()=>{const html=await readFile(new URL('./index.html',import.meta.url),'utf8');assert.match(html,/<dialog id="modal" aria-labelledby="modal-title">/);assert.match(html,/<h2 id="modal-title">/);});
test('R7 document render delegates its single graph render to inspect',async()=>{const app=await readFile(new URL('./app.mjs',import.meta.url),'utf8');const render=app.slice(app.indexOf('function render(){'),app.indexOf('function renderEntity()'));assert.ok(render.includes('renderEntity();inspect();'));assert.ok(!render.includes('graph();'));assert.match(app,/function inspect\(\)[\s\S]*?graph\(\);/);});

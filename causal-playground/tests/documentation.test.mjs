import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {blank,ENGINE,LIMITS} from '../model.mjs';
import {createRun,step} from '../simulation.mjs';

const read = name => readFile(new URL('../'+name,import.meta.url),'utf8');
const guide = await read('understanding.html');

test('guide discovery: dialog, footer and README retain a relative entry point',async()=>{
  const [app,index,readme]=await Promise.all(['app.js','index.html','README.md'].map(read));
  assert.match(app,/dialog\('How this model works'\)[\s\S]*?el\('a','Understanding this simulation ↗',\{href:'\.\/understanding\.html',target:'_blank',rel:'noopener'\}\)/);
  assert.match(index,/<footer>[\s\S]*?<a href="\.\/understanding\.html" target="_blank" rel="noopener">Understanding this simulation ↗<\/a>/);
  assert.match(readme,/\[Understanding this simulation\]\(\.\/understanding\.html\)/);
});

test('guide structure: semantic reading order, valid local targets and no runtime scripts',async()=>{
  assert.match(guide,/<html lang="en">/);
  assert.equal((guide.match(/<h1\b/g)||[]).length,1);
  assert.match(guide,/<main[^>]+id="understanding"/);
  assert.match(guide,/<nav aria-label="Guide contents">/);
  assert.doesNotMatch(guide,/<script\b|@import|url\(\s*["']?https?:/i);
  const ids=[...guide.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'unique fragment destinations');
  for(const [,href] of guide.matchAll(/href="([^"]+)"/g)){
    if(href.startsWith('#'))assert.ok(ids.includes(href.slice(1)),href);
    else if(!href.startsWith('https:'))await access(new URL('../'+href,import.meta.url));
  }
  for(const section of ['meaning','settings','calculation','surprises','inspect','theory'])
    assert.match(guide,new RegExp(`<section id="${section}" aria-labelledby="${section}-title">`));
  assert.ok(guide.includes(ENGINE));
  assert.ok(guide.includes(`Gain (0–${LIMITS.gain})`));
  for(const phrase of ['not canonical fuzzy cognitive map inference','not stock/flow system dynamics','Graph signs alone do not determine dynamics','real-world hypotheses','not a recommendation, commitment, or implied switch'])assert.ok(guide.includes(phrase),phrase);
});

test('guide contract: workload/stress arithmetic agrees with the actual synchronous engine',()=>{
  const d=blank();
  d.nodes=[{id:'workload',name:'Workload',initial:70,baseline:50,responsiveness:.1},{id:'stress',name:'Stress',initial:60,baseline:50,responsiveness:.1}];
  d.relationships=[{id:'workload-stress',name:'Influence',from:'workload',to:'stress',polarity:'+',gain:.5,delaySteps:0}];
  const run=createRun(d),r=step(run).stress;
  assert.equal(r.incoming[0].applied,1);
  assert.equal(r.recovery,-1);
  assert.equal(r.next,60);
  assert.equal(r.boundaryAdjustment,0);
  assert.equal(r.incoming[0].sourceTick,0);
  for(const line of ['Incoming         = 0.1 × (+1) × 0.5 × 20 = +1','Recovery         = 0.1 × (50 − 60) = −1','Next stress      = clamp(60, 0, 100) = 60','contribution(e,t) = r_i × s_e × g_e × (x_j(t − d_e) − b_j)','recovery(i,t)     = r_i × (b_i − x_i(t))','x_i(t+1)         = min(100, max(0, rawNext(i,t)))'])assert.ok(guide.includes(line),line);
});

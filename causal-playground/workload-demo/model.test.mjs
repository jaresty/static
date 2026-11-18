import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {H,END,DEFAULTS,PRESETS,simulate,rates,validate,compare,resolvedRun} from './model.mjs';
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}; tolerance=${tol}`);
const at=(r,t)=>r.samples[Math.round(t*4)];
function ledger(r){for(const s of r.samples)near(s.B,r.config.B0+s.I-s.O);}

test('P1 ledger: backlog change equals independently integrated arrivals minus completions',()=>{
  let I=0,O=0;
  const r=simulate(PRESETS.recovery,{onStep:f=>{
    near(f.nextB-f.B,f.h*f.A-f.h*f.C,1e-10);
    I+=f.h*f.A;O+=f.h*f.C;
    near(f.nextB,PRESETS.recovery.B0+I-O);
  }});
  ledger(r);assert.ok(r.maxResidual<=1e-8);
});
test('P2 old-state rates, nonnegativity, empty, drain and overload',()=>{
  for(const config of [PRESETS.empty,PRESETS.drain,PRESETS.overload,{B0:200,S0:1,K:1,A0:20,A1:0,changeDay:1}]){
    const c=validate(config);
    const r=simulate(c,{onStep:f=>{
      const expected=rates(f.B,f.S,c);
      near(f.nextS,f.S+f.h*(f.B/(c.K*2+f.B)-f.S)/2,1e-12);
      near(f.C,Math.min(c.K*(1-(c.impairment?.5:0)*f.S),f.B),1e-12);
      near(f.P,expected.P,1e-12);
      assert.ok(f.nextB>=0&&f.nextS>=0&&f.nextS<=1);
    }});
    ledger(r);
    if(c.A0===0&&!c.change){for(let i=1;i<r.samples.length;i++)assert.ok(r.samples[i].B<=r.samples[i-1].B);assert.ok(at(r,40).B<1e-8);}
    if(config===PRESETS.empty)for(const s of r.samples){assert.equal(s.B,0);assert.equal(s.C,0);}
    if(config===PRESETS.overload)for(const s of r.samples)assert.ok(s.B>=2*s.t-1e-8);
  }
});
test('P2 recovery equilibrium and alpha=0 capacity without hidden work loss',()=>{
  const r=simulate(PRESETS.recovery),s=at(r,120);
  near(s.B,4);near(s.S,1/6);near(s.P,11/12);near(s.C,4);
  const c={B0:20,S0:1,A0:12,change:false,impairment:false};
  const off=simulate(c),other=simulate({...c,S0:0});
  for(const s of off.samples){assert.equal(s.P,1);near(s.B,20+2*s.t);}
  assert.deepEqual(off.samples.map(s=>s.B),other.samples.map(s=>s.B));ledger(off);
});
test('P2 shock versus sustained forcing and right-continuous schedule boundary',()=>{
  const base=simulate({...PRESETS.shock,B0:0}),shock=simulate(PRESETS.shock),sustained=simulate(PRESETS.sustained);
  for(let i=0;i<base.samples.length;i++){near(shock.samples[i].I,base.samples[i].I);near(sustained.samples[i].I-base.samples[i].I,8*base.samples[i].t);}
  assert.equal(shock.config.B0-base.config.B0,20);
  const r=simulate();assert.equal(at(r,20).A,4);assert.equal(at(r,20).prev.A,12);near(at(r,20).I,240);near(at(r,20.25).I,241);
  assert.equal(at(r,0).prev,null);assert.equal(at(r,20.25).prev.A,4);
  assert.deepEqual(simulate(),r);
});
test('P3 finite bounded input admission and step/schedule alignment',()=>{
  for(const [key,bad]of [['B0',-1],['B0',201],['S0',1.01],['S0',NaN],['A0',21],['A1',-1],['K',0],['K',21],['changeDay',0],['changeDay',120],['changeDay',1.1],['impairment',1],['change','yes']])assert.throws(()=>simulate({[key]:bad}));
  for(const key of ['B0','S0','A0','A1','K','changeDay'])assert.throws(()=>simulate({[key]:Infinity}));
  for(const h of [0,-1,1,.03,H/8])assert.throws(()=>simulate({}, {h}));
  assert.doesNotThrow(()=>validate({B0:200,S0:1,A0:20,A1:0,K:1,changeDay:119,change:false}));
});
test('P4 predeclared selected-domain refinement at quarter-days; exact analytic cases',()=>{
  // Presets + all 32 edge combinations, supplemented by mixed interior schedule cases.
  const cases=[...Object.values(PRESETS),{B0:2,S0:.1,A0:4,change:false,K:10}];
  for(const B0 of [0,200])for(const S0 of [0,1])for(const K of [1,20])for(const A0 of [0,20])for(const impairment of [false,true])cases.push({B0,S0,K,A0,A1:20-A0,changeDay:1,impairment});
  cases.push({B0:.01,S0:.33,K:7.5,A0:6.25,A1:2.75,changeDay:119},{B0:75.5,S0:.7,K:12.5,A0:19,A1:0,changeDay:60});
  let maxB=0,maxS=0,maxFineB=0,maxFineS=0;
  const start=performance.now();
  for(const config of cases){
    const a=simulate(config),b=simulate(config,{h:H/2}),c=simulate(config,{h:H/4});
    const ab=compare(a,b),ac=compare(a,c);maxB=Math.max(maxB,ab.B);maxS=Math.max(maxS,ab.S);maxFineB=Math.max(maxFineB,ac.B);maxFineS=Math.max(maxFineS,ac.S);
    assert.ok(ab.pass,JSON.stringify({config,ab}));assert.ok(ac.pass,JSON.stringify({config,ac}));
    for(const s of a.samples){assert.ok(s.B>=0&&s.S>=0&&s.S<=1);assert.ok(Number.isFinite(s.B));}ledger(a);
  }
  const empty=simulate(PRESETS.empty),smooth=simulate({B0:2,S0:.1,A0:4,change:false});
  let exactB=0,exactS=0;
  for(const t of [.5,1,2,4,8]){const b=Math.abs(at(smooth,t).B-(4-2*Math.exp(-t))),s=Math.abs(at(empty,t).S-.8*Math.exp(-t/2));exactB=Math.max(exactB,b);exactS=Math.max(exactS,s);assert.ok(b<=.1);assert.ok(s<=.002);}
  console.log('NUMERICAL EVIDENCE',JSON.stringify({cases:cases.length,h:H,horizon:END,maxB,maxS,maxFineB,maxFineS,exactB,exactS,milliseconds:performance.now()-start}));
  const r=resolvedRun();assert.ok(r.resolution.pass);
  const wrong={samples:r.samples.map(s=>({...s,B:s.B+1}))};assert.equal(compare(r,wrong).pass,false);
});
test('P5/P6/P7 static discovery, separate local assets, numeric alternative and interpretation',async()=>{
  const read=name=>readFile(new URL(name,import.meta.url),'utf8');
  const html=await read('index.html'),app=await read('app.mjs'),css=await read('styles.css'),model=await read('model.mjs'),guide=await read('../understanding.html');
  assert.match(guide,/href="\.\/workload-demo\/"/);
  for(const source of [html,app,css,model])assert.doesNotMatch(source.replaceAll('http://www.w3.org/2000/svg','SVG_NAMESPACE'),/https?:|fetch\(|XMLHttpRequest|WebSocket|@import|eval\(/);
  for(const [,src]of html.matchAll(/(?:src|href)="([^"#]+)"/g))await access(new URL(src,import.meta.url));
  for(const phrase of ['Experimental workload model','hypothetical and uncalibrated','dimensionless','not a universal accuracy guarantee','Numerical agreement does not validate domain assumptions','B=4','preceding interval','quarter-day'])assert.ok(html.includes(phrase),phrase);
  assert.match(html,/<table>/);assert.match(html,/tabindex="0" role="region"/);assert.match(html,/aria-live="polite"/);
  assert.match(app,/Not resolved to selected criteria/);assert.match(app,/Preceding internal interval/);assert.match(css,/@media\(max-width:620px\)/);
});

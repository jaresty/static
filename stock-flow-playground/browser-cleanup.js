// Focused cleanup regression. DOM actions assert visible/non-inert ownership;
// native pointer/keyboard supplements run separately. No application internals.
(async()=>{
 const q=s=>document.querySelector(s),results=[],original=window.confirm;window.confirm=()=>true;
 const check=(name,ok)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 const wait=async p=>{for(let i=0;i<150;i++){if(p())return;await new Promise(r=>setTimeout(r,20));}throw Error('Cleanup UI timeout');};
 const visible=e=>e&&e.getClientRects().length&&!e.closest('[hidden]')&&(!q('#modal').open||q('#modal').contains(e));
 const click=s=>{const e=q(s);if(!visible(e))throw Error('Unreachable '+s);e.click();};
 const set=(s,v)=>{const e=q(s);if(!visible(e))throw Error('Unreachable '+s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));};
 const view=async name=>{if(innerWidth<=760){click(`button[data-view=${name}]`);await new Promise(requestAnimationFrame);}};
 const choose=(s,v)=>{set(s,v);q(s).dispatchEvent(new Event('change',{bubbles:true}));};
 const current=async()=>{click('#import');click('#show-json');const m=JSON.parse(q('#document').value);click('#close-modal');return m;};
 const apply=async m=>{click('#import');set('#document',JSON.stringify(m));click('#preview-import');await wait(()=>!q('#review-panel').hidden);click('#apply');await wait(()=>!q('#modal').open);};
 try{
  const base=(await import('./model.mjs')).example;await apply(base);
  await view('canvas');click('#fit');await new Promise(requestAnimationFrame);
  const cy=q('#graph').graph.cy,stockFont=parseFloat(cy.getElementById('upper').style('font-size'))*cy.zoom();
  // Matched pre-cleanup default Fit measurements at 1440/320 × 1000.
  if(innerWidth===1440||innerWidth===320)check('R8 default Fit stock labels improve on matched baseline',stockFont>(innerWidth===1440?8.39556004036327:5.5036496350364965));
  await view('inspector');q('#settings').closest('details').open=true;
  const before=await current();set('#settings [name=timeUnit]','day');q('#settings').requestSubmit();
  check('R4 rejected hour→day gives actionable complete reviewed JSON route',q('#status').textContent.includes('Import → Show current JSON')&&q('#status').textContent.includes('Apply reviewed model'));
  check('R4 rejected time edit preserves complete current document',JSON.stringify(await current())===JSON.stringify(before));
  // Reset rejected form input before independent endpoint-unit edit.
  set('#settings [name=timeUnit]','hour');choose('#selection','upper');set('#entity [name=unit]','mL');q('#entity').requestSubmit();
  check('R4 rejected L→mL gives guidance without weakening endpoint compatibility',q('#status').textContent.includes('endpoint stock units must match exactly')&&q('#status').textContent.includes('Labels do not convert numeric values'));
  check('R4 rejected stock edit preserves complete current document',JSON.stringify(await current())===JSON.stringify(before));
  const coordinated=structuredClone(before);coordinated.time.unit='day';for(const e of coordinated.entities){if(e.type==='stock')e.unit='mL';if(e.type==='flow')e.unit='mL/day';}
  click('#import');set('#document',JSON.stringify(coordinated));click('#preview-import');await wait(()=>!q('#review-panel').hidden);
  check('R5 coordinated unit proposal remains unapplied during explicit review',q('#settings [name=timeUnit]').value==='hour'&&JSON.parse(q('#review-json').textContent).time.unit==='day');
  check('R6 reachable review dialog is named by visible existing heading',q('#modal').getAttribute('aria-labelledby')==='modal-title'&&q('#modal-title').textContent==='Review proposed model');
  click('#apply');await wait(()=>!q('#modal').open);check('R5 consistent full reviewed JSON replacement succeeds',JSON.stringify(await current())===JSON.stringify(coordinated));
  const many={version:1,title:'Coverage transitions',time:{unit:'hour',dt:1,horizon:20},entities:Array.from({length:12},(_,i)=>({id:'s_'+i,type:'stock',name:'Stock '+i,unit:'L',initial:i}))};await apply(many);
  const note=()=>q('.chart-coverage').textContent,series=()=>q('#charts').plots.reduce((n,p)=>n+p.series.length-1,0);
  check('R1 real uPlot 12-stock initial coverage',note().includes('12 of 12')&&series()===12);
  await view('inspector');choose('#new-type','stock');click('#add');check('R1 12→13 coverage',note().includes('12 of 13')&&q('#stock-values').rows.length===13);
  set('#entity [name=name]','Renamed omitted');q('#entity').requestSubmit();check('R1 omitted-only rename current without trace rebuild',note().includes('Renamed omitted [stock_1]')&&series()===12);
  click('#add');check('R1 13→14 coverage',note().includes('12 of 14')&&note().includes('2 omitted')&&q('#stock-values').rows.length===14);click('#remove');check('R1 14→13 coverage',note().includes('12 of 13')&&note().includes('1 omitted')&&!note().includes('stock_2'));
  const precision={version:1,title:'Browser precision',time:{unit:'hour',dt:1,horizon:20},entities:[{id:'s',type:'stock',name:'Source',unit:'L',initial:1e12},{id:'f',type:'flow',name:'Out',unit:'L/hour',source:'s',target:null,expression:'0.1'}]};await apply(precision);await view('charts');for(let i=0;i<20;i++)click('#step');check('R2 browser-imported 1e12 / 0.1 run completes 20 transitions',q('#history').max==='20'&&!q('#status').classList.contains('error'));
  click('[data-ai=Explain]');const {reach}=(await import('./browser-test-ui.mjs')).testUI();let refused=false;try{reach('#review-ai');}catch(error){refused=error.message==='Unreachable control #review-ai';}check('R10 suite navigation refuses hidden Explain replacement controls',refused);click('#close-modal');
  check('focused cleanup has no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth);
  return {viewport:{width:innerWidth,height:innerHeight},results};
 }finally{window.confirm=original;}
})()

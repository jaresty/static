// Execute as the body of agent-browser eval in the served app. No application internals.
(async()=>{
 const nativeConfirm=window.confirm;window.confirm=()=>true;
 const q=s=>document.querySelector(s),results=[];
 try {
 const check=(name,ok)=>{results.push({name,pass:!!ok});if(!ok)throw Error(name);};
 const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for UI');};
 const choose=(s,v)=>{q(s).value=v;q(s).dispatchEvent(new Event('change',{bubbles:true}));};
 const set=(s,v)=>{q(s).value=v;q(s).dispatchEvent(new Event('input',{bubbles:true}));};
 const click=s=>q(s).click(),submit=()=>q('#entity').requestSubmit();
 check('real pinned Cytoscape and uPlot active',q('#graph').graph.cy.container()===q('#graph')&&q('#charts').plots.every(p=>p.root.classList.contains('uplot')&&p.root.contains(p.ctx.canvas)&&p.root.contains(p.over)&&typeof p.setData==='function')&&cytoscape.version==='3.30.4'&&_.VERSION==='4.17.21');
 check('shared local vendor assets loaded',performance.getEntriesByType('resource').filter(r=>/cytoscape-3.30.4|edgehandles-4.0.1|lodash-4.17.21|uPlot-1.6.31/.test(r.name)).length===5);
 check('no native SVG graph fallback',!q('#graph svg')&&q('#graph canvas'));
 click('#example');await wait(()=>!q('#review-panel').hidden);click('#apply');await wait(()=>q('#review-panel').hidden);
 choose('#new-type','parameter');click('#add');set('#entity [name=name]','Supply rate');set('#entity [name=unit]','L/hour');set('#entity [name=number]','2');submit();
 check('parameter authoring saved',q('#selection').textContent.includes('Supply rate'));
 choose('#new-type','stock');click('#add');set('#entity [name=name]','Collected water');set('#entity [name=number]','3');submit();
 check('stock authoring saved',q('#selection').textContent.includes('Collected water'));
 choose('#new-type','flow');click('#add');set('#entity [name=name]','External supply');set('#entity [name=expression]','parameter_1');choose('#entity [name=source]','');choose('#entity [name=target]','stock_1');submit();
 check('flow endpoint form saved',q('#status').textContent.includes('updated'));
 click('#step');choose('#ledger-stock','stock_1');check('step old-state accounting',q('#ledger').textContent.includes('actual stock 3.5'));check('computed flow explanation',q('#transition').textContent.includes('parameter_1=2'));check('chart rendered',q('#charts').plots[0].root.classList.contains('uplot')&&q('#charts').plots[0].data[0].length===2&&q('#charts .uplot canvas'));
 set('#history','0');check('history inspection',q('#time').textContent.includes('t = 0 hour'));
 choose('#selection','parameter_1');set('#entity [name=number]','4');submit();check('edit resets run',q('#history').max==='0');click('#undo');check('undo parameter',q('#entity [name=number]').value==='2');click('#redo');check('redo parameter',q('#entity [name=number]').value==='4');
 click('#show-json');const doc=JSON.parse(q('#document').value);check('JSON export projection',doc.entities.some(e=>e.id==='flow_1'&&e.target==='stock_1'));
 click('#preview-import');await wait(()=>!q('#review-panel').hidden);check('import preview before apply',q('#review-json').textContent.includes('External supply'));click('#cancel-review');
 click('[data-ai=Modify]');click('#generate-ai');await wait(()=>q('#prompt').value.includes('sourceFingerprint'));const candidate=structuredClone(doc);candidate.title='Reviewed tank system';set('#ai-return',JSON.stringify(candidate));click('#review-ai');await wait(()=>!q('#review-panel').hidden);check('AI diff review',q('#review-changes').textContent.includes('Title changed'));check('AI not yet applied',q('#settings [name=title]').value!==candidate.title);click('#apply');await wait(()=>q('#settings [name=title]').value===candidate.title);check('AI apply resets run',q('#history').max==='0');
 click('#review-ai');await wait(()=>q('#status').textContent.includes('Stale'));check('stale Modify blocked',q('#status').textContent.includes('Stale'));
 click('#step');click('[data-ai=Explain]');click('#generate-ai');await wait(()=>q('#prompt').value.includes('omittedEarlierRows'));const explain=JSON.parse(q('#prompt').value);check('Explain actual evidence',explain.evidence.rows.length===2);check('Explain read only',q('#settings [name=title]').value===candidate.title);click('#review-ai');await wait(()=>q('#status').textContent.includes('read-only'));check('Explain response blocked from AI apply',q('#status').textContent.includes('read-only'));
 click('#share');await wait(()=>q('#share-url').value.includes('#sf='));check('gzip share URL created',q('#share-url').value.length<16000);
 click('#reset');click('#run');await wait(()=>Number(q('#history').max)>0);click('#run');const count=q('#history').max;await new Promise(r=>setTimeout(r,150));check('pause stops run',q('#history').max===count);
 choose('#selection','parameter_1');click('#remove');check('referenced removal rejected',q('#status').textContent.includes('unknown reference'));
 choose('#selection','flow_1');click('#remove');check('flow removal saved',!q('#selection').textContent.includes('External supply'));
 choose('#selection','parameter_1');click('#remove');check('unreferenced parameter removal saved',!q('#selection').textContent.includes('Supply rate'));
 check('responsive page fits viewport',document.documentElement.scrollWidth<=innerWidth);
 return {url:location.href,viewport:{width:innerWidth,height:innerHeight},results};
 } finally {window.confirm=nativeConfirm;}
})()

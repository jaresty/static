(async()=>{
 const failures=[],passed=[];
 const check=(name,condition)=>{if(!condition){failures.push(name);throw new Error('FAIL: '+name);}passed.push(name);};
 const $=id=>document.getElementById(id);
 const click=text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===text&&!b.disabled);if(!b)throw new Error('Missing button: '+text);b.click();};
 const wait=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('UI condition timed out');};
 const fill=(selector,value)=>{const n=document.querySelector(selector);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));return n;};
 const choose=value=>{$('objects').value=value;$('objects').dispatchEvent(new Event('change',{bubbles:true}));};
 window.__confirmCount=0;window.confirm=()=>{window.__confirmCount++;return true;};
 try{
  check('nested static path initialized',location.pathname.endsWith('/static/causal-playground/')&&$('objects').options.length===4);
  check('graph canvas mounted',document.querySelectorAll('#graph canvas').length===3);
  click('+ Node');let option=[...$('objects').options].find(x=>x.textContent.includes('Variable 3'));const nodeId=option.value.slice(5);
  fill('#inspector input[type=text]','A third variable');click('Save node');check('node creation and naming through form',[...$('objects').options].some(x=>x.textContent==='Node · A third variable'));
  $('undo').click();check('undo changes displayed name',[...$('objects').options].some(x=>x.textContent==='Node · Variable 3'));$('redo').click();check('redo restores name',[...$('objects').options].some(x=>x.textContent==='Node · A third variable'));
  click('+ Relationship');let selects=$('inspector').querySelectorAll('select');selects[0].value='b';selects[1].value='a';fill('#inspector input[type=text]','Return path');click('Add relationship');check('opposing relationship created',[...$('objects').options].some(x=>x.textContent==='Arrow · Return path'));
  click('+ Relationship');selects=$('inspector').querySelectorAll('select');selects[0].value=nodeId;selects[1].value=nodeId;selects[2].value='-';fill('#inspector input[type=text]','Self correction');click('Add relationship');check('self-loop created with negative sign',[...$('objects').options].some(x=>x.textContent==='Arrow · Self correction'));
  for(let i=0;i<8;i++)$('step').click();check('computed playback reached tick 8',$('clock').textContent.includes('tick 8'));
  choose('node:b');check('actual delayed contribution shown',$('contributions').textContent.includes('source tick'));
  $('scrub').value=2;$('scrub').dispatchEvent(new Event('input',{bubbles:true}));check('historical canvas/chart inspection',$('clock').textContent.includes('Viewing tick 2')&&$('transition-title').textContent.includes('2 to 3'));
  click('Explain this node with AI');click('Generate context');await wait(()=>$('prompt-output').value.includes('causal-playground-analysis'));const prompt=$('prompt-output').value;const packet=JSON.parse(prompt.split('UNTRUSTED ANALYSIS PACKET\n')[1].split('\nEND PACKET')[0]);
  check('Explain exports actual selected evidence',packet.focus.node==='b'&&packet.exact.some(x=>x.tick===2)&&packet.transitions.length>0&&packet.coverage.includedNodes.length===1);
  check('Explain remains read-only and discloses omissions',prompt.includes('READ ONLY')&&Object.hasOwn(packet.coverage,'omittedContributions'));
  $('close-modal').click();
  document.querySelector('[data-ai=create]').click();click('Generate context');await wait(()=>$('prompt-output').value.includes('SCHEMA'));check('Build prompt embeds real schema',$('prompt-output').value.includes('bounded-influence-v1')&&$('prompt-output').value.includes('schemaVersion'));$('close-modal').click();
  document.querySelector('[data-ai=modify]').click();click('Generate context');await wait(()=>$('prompt-output').value.includes('currentModel'));const fp=$('prompt-output').value.match(/"baseFingerprint":"([a-f0-9]{64})"/)[1];$('close-modal').click();
  const model=JSON.parse(localStorage.getItem('causal-playground.v1'));const revised=structuredClone(model);revised.title='Reviewed AI model';
  document.querySelector('[data-ai=modify]').click();click('Paste AI response');const response={format:'causal-playground-ai-response',version:1,operation:'modify',baseFingerprint:fp,summary:['Changed title'],model:revised};$('modal-body').querySelector('textarea').value=JSON.stringify(response);click('Validate & review');await wait(()=>$('modal-title').textContent==='Review AI proposal'&&[...$('modal-actions').children].some(x=>x.textContent==='Apply changes'));
  check('AI change shown before apply',$('title').value!=='Reviewed AI model'&&$('modal-body').textContent.includes('Changed title'));click('Apply changes');await wait(()=>!$('modal').open);check('AI proposal applies after review',$('title').value==='Reviewed AI model');
  document.querySelector('[data-ai=modify]').click();click('Paste AI response');$('modal-body').querySelector('textarea').value=JSON.stringify(response);click('Validate & review');await wait(()=>$('modal-title').textContent==='Review AI proposal'&&[...$('modal-actions').children].some(x=>x.textContent==='Apply changes'));check('stale AI response blocks replacement',[...$('modal-actions').children].find(x=>x.textContent==='Apply changes').disabled&&$('modal-body').textContent.includes('Stale response'));click('Cancel');
  $('share').click();click('Create share link');await wait(()=>$('prompt-output').value.includes('#model='));const link=$('prompt-output').value;check('share link preserves nested path',link.includes('/static/causal-playground/#model=gz1.'));const sharing=await import('./sharing.mjs');const shared=await sharing.decode(new URL(link).hash.slice(7));check('default share includes scenario',shared.title==='Reviewed AI model'&&JSON.stringify(shared.interventions)===JSON.stringify(revised.interventions)&&$('modal-body').querySelector('input[type=checkbox]').checked);$('close-modal').click();
  $('import').click();const source=$('modal-body').querySelector('textarea');source.value='{"bad":true}';click('Validate & review');await wait(()=>$('modal-error'));check('invalid import preserves pasted text',source.value==='{"bad":true}'&&$('modal-error').textContent.includes('required'));source.value=JSON.stringify({...revised,title:'Imported after review'});click('Validate & review');await wait(()=>$('modal-title').textContent==='Review proposed model'&&[...$('modal-actions').children].some(x=>x.textContent==='Apply changes'));click('Apply changes');await wait(()=>!$('modal').open);check('valid import applied after review',$('title').value==='Imported after review');
  choose('node:a');fill('#inspector input[type=number]','45');click('Save node');check('dynamic edits require restart confirmation',window.__confirmCount>0&&$('clock').textContent.includes('tick 0'));
  click('▶ Play');await wait(()=>$('clock').textContent.includes('tick 1'));click('Ⅱ Pause');check('play pause controls update actual run',$('clock').textContent.includes('Paused'));
  $('reset').click();check('reset restores tick zero',$('clock').textContent.includes('tick 0'));
  check('no injected executable HTML',!document.querySelector('#graph img[onerror]'));
  check('runtime resources stay on the static origin',performance.getEntriesByType('resource').filter(x=>/^https?:/.test(x.name)).every(x=>new URL(x.name).origin===location.origin));
  return {passed,failures,link};
 }catch(e){return {passed,failures,error:e.message,stack:e.stack};}
})()

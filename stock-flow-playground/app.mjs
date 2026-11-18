import {example,validate,canonical,parse} from './model.mjs';
import {createRun,step,stockLedger} from './engine.mjs';
import {createHistory,commit as commitHistory,undo as undoHistory,redo as redoHistory,changesDynamics} from './document.mjs';
import {createGraph,defaultPositions} from './graph.mjs';
import {createCharts} from './charts.mjs';
import {importDocument,encodeShare,decodeShare,aiPrompt,fingerprint,reviewDraft,applyReview} from './portable.mjs';
const $=id=>document.getElementById(id), clone=x=>structuredClone(x), storageKey='stock-flow-playground.v1';
let model=clone(example),history=createHistory(model),run=createRun(model),selected='upper',index=0,timer=null,review=null,handoff=null,autosaveBlocked=false;
const workspaceGraph=createGraph($('graph'),{select:id=>{selected=id;$('selection').value=id;renderEntity();graph();showView('inspector');},move:(id,pos)=>{const next=clone(model);next.view??={positions:{}};next.view.positions[id]=pos;commit(next);},connect:(source,target)=>flowDraft(source,target)});
const charts=createCharts($('charts'),i=>inspectTime(i));
let activePanel=null,aiMode='Build';
function closeModal(){if(activePanel){activePanel.hidden=true;$('dialog-storage').append(activePanel);activePanel=null;}$('modal').close();}
function openPanel(id,title){const panel=$(id);if(activePanel&&activePanel!==panel){activePanel.hidden=true;$('dialog-storage').append(activePanel);}activePanel=panel;panel.hidden=false;$('modal-body').replaceChildren(panel);$('modal-title').textContent=title;$('modal-status').textContent='';if(!$('modal').open)$('modal').showModal();}
function showView(view){document.querySelector('.workspace').dataset.view=view;for(const b of document.querySelectorAll('button[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));requestAnimationFrame(()=>{workspaceGraph.resize();charts.resize();});}
const status=(s,error=false)=>{$('status').textContent=s;$('status').classList.toggle('error',error);$('modal-status').textContent=s;$('modal-status').className=error?'error-message':'';requestAnimationFrame(()=>workspaceGraph.resize());};
const safe=fn=>async event=>{try{await fn(event);}catch(e){pause();status(e.message,true);}};
function pause(){if(timer!==null)clearInterval(timer);timer=null;$('run').setAttribute('aria-pressed','false');$('run').textContent='▶ Play';if(run)updateClock();}
function save(){if(autosaveBlocked){$('autosave').textContent='Autosave paused — explicit replacement required';return;}try{localStorage.setItem(storageKey,canonical(model));$('autosave').textContent='Saved in this browser only';}catch{$('autosave').textContent='Autosave unavailable — Download to preserve work';}}
function confirmDynamics(next){return !changesDynamics(model,next)||run.rows.length<=1||confirm('This changes dynamics and resets the existing run/history. Continue?');}
function adopt(next,dynamic,message){model=clone(next);if(dynamic)reset();else run.model=clone(model);review=null;$('review-panel').hidden=true;if(activePanel?.id==='review-panel')closeModal();render();status(message||(dynamic?'Model updated; run reset.':'Presentation updated; run retained. Playback unchanged.'));save();}
function commit(next,message){
 validate(next);const dynamic=changesDynamics(model,next);if(!confirmDynamics(next)){status('Dynamics change cancelled; run retained.');render();return false;}
 if(!commitHistory(history,next)){status('No document change; run retained.');return true;}adopt(history.current,dynamic,message);return true;
}
function reset(){pause();run=createRun(model);index=0;}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function render(){
 if(document.activeElement!==$('title'))$('title').value=model.title;
 const settings=$('settings').elements;settings.title.value=model.title;settings.timeUnit.value=model.time.unit;settings.dt.value=model.time.dt;settings.horizon.value=model.time.horizon;
 $('selection').replaceChildren();for(const e of model.entities)option($('selection'),e.id,`${e.name} · ${e.type} [${e.id}]`);
 if(!model.entities.some(e=>e.id===selected))selected=model.entities[0].id;$('selection').value=selected;
 renderEntity();graph();inspect();$('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
}
function renderEntity(){const e=model.entities.find(e=>e.id===selected),f=$('entity').elements;f.id.value=e.id;f.name.value=e.name;f.unit.value=e.unit;
 const numeric=e.type==='stock'||e.type==='parameter';$('numeric-label').hidden=!numeric;$('numeric-label').firstChild.textContent=e.type==='stock'?'Initial amount':'Parameter value';f.number.value=e.initial??e.value??0;f.number.required=numeric;
 const pos=model.view?.positions?.[e.id]||defaultPositions(model)[e.id];f.x.value=pos.x;f.y.value=pos.y;
 $('expression-label').hidden=numeric;f.expression.value=e.expression??'';f.expression.required=!numeric;$('endpoints').hidden=e.type!=='flow';
 for(const key of ['source','target']){f[key].replaceChildren();option(f[key],'','Environment');for(const s of model.entities.filter(x=>x.type==='stock'))option(f[key],s.id,`${s.name} [${s.id}]`);f[key].value=e[key]??'';}
}
function graph(){workspaceGraph.render(model,selected,run.rows[index]);}
const fmt=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:6});
function updateClock(){const row=run.rows[index];$('time').textContent=`${timer!==null?'Running':index<run.rows.length-1?'Inspecting':'Paused'} · t = ${fmt(row.t)} ${model.time.unit} · tick ${index} / ${run.rows.length-1}`;}
function inspect(){const row=run.rows[index];$('history').max=run.rows.length-1;$('history').value=index;updateClock();
 graph();
 $('stock-values').replaceChildren();const oldLedger=$('ledger-stock').value;$('ledger-stock').replaceChildren();
 for(const e of model.entities.filter(e=>e.type==='stock')){const tr=document.createElement('tr');for(const value of [e.name,fmt(row.stocks[e.id]),e.unit]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('stock-values').append(tr);option($('ledger-stock'),e.id,e.name);}
 if([...$('ledger-stock').options].some(o=>o.value===oldLedger))$('ledger-stock').value=oldLedger;
 ledger();const values=Object.entries(row.values).filter(([id])=>model.entities.find(e=>e.id===id)?.type!=='stock').map(([id,v])=>`${id} = ${fmt(v)} ${model.entities.find(e=>e.id===id).unit}`);$('computed').textContent=values.length?values.join(' · '):'Initial row: auxiliaries/rates have not been evaluated. Parameters: '+model.entities.filter(e=>e.type==='parameter').map(e=>`${e.id} = ${e.value} ${e.unit}`).join(' · ');if(row.delayedReads?.length)$('computed').textContent+=' · DELAYED OBSERVATIONS: '+row.delayedReads.map(d=>`${d.expression}: delay(${d.stock},${d.steps}) = ${fmt(d.value)} from tick ${d.sourceTick}, time ${fmt(d.sourceTime)} ${model.time.unit}${d.prehistory?' (initial prehistory)':''}`).join(' · ');chart();
}
function ledger(){const row=run.rows[index],id=$('ledger-stock').value;if(!id)return;const l=stockLedger(run,index,id);$('ledger').textContent=`${fmt(l.initial)} initial + ${fmt(l.inflow)} cumulative inflow − ${fmt(l.outflow)} cumulative outflow = ${fmt(l.balance)}; actual stock ${fmt(l.value)}. Only floating-point roundoff may differ.`;
 $('transition').replaceChildren();if(index===0){$('transition').textContent='Initial state: no transition yet.';return;}
 const heading=document.createElement('p');heading.textContent=`Transition ${fmt(row.t-row.dt)} → ${fmt(row.t)} (${model.time.unit}), dt ${fmt(row.dt)}. Rates computed from the old state. Incoming material cannot fund outgoing transfers until next step.`;$('transition').append(heading);
 for(const f of row.flows.filter(f=>f.source===id||f.target===id)){const p=document.createElement('p');p.textContent=`${f.id}: ${f.source??'environment'} → ${f.target??'environment'}; ${f.expression} = requested ${fmt(f.requested)}, applied ${fmt(f.applied)} ${model.entities.find(e=>e.id===f.id).unit}. Amount ${fmt(f.amount)}. ${f.limited?'LIMITED: proportional source factor '+fmt(f.factor):'No source limiting.'} Current old-state references (delayed reads listed separately): `+(parse(f.expression).refs.map(r=>`${r}=${fmt(row.values[r])}`).join(', ')||'constant');$('transition').append(p);}
 for(const d of row.delayedReads||[]){const p=document.createElement('p');p.textContent=`Actual information read for ${d.expression}: delay(${d.stock}, ${d.steps}) = ${fmt(d.value)}, source tick ${d.sourceTick}, time ${fmt(d.sourceTime)} ${model.time.unit}${d.prehistory?' (initial prehistory)':''}. This is not material transit; availability is current old stock.`;$('transition').append(p);}
}
// Original charts.js interaction boundary: hover is passive; explicit click inspects.
function inspectTime(i){pause();index=Math.max(0,Math.min(run.rows.length-1,i));inspect();status('Historical inspection paused playback.');}
function chart(){charts.render(model,run,index);}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function showReview(r){review=r;$('review-changes').textContent=r.changes.join(' · ');$('review-json').textContent=JSON.stringify(r.candidate,null,2);openPanel('review-panel','Review proposed model');status('Validated candidate ready for explicit review. Current model unchanged.');}
$('settings').addEventListener('submit',safe(e=>{e.preventDefault();const f=e.target.elements,m=clone(model);m.title=f.title.value;m.time={unit:f.timeUnit.value,dt:Number(f.dt.value),horizon:Number(f.horizon.value)};commit(m);}));
$('entity').addEventListener('submit',safe(event=>{event.preventDefault();const f=event.target.elements,m=clone(model),e=m.entities.find(e=>e.id===selected);e.name=f.name.value;e.unit=f.unit.value;if(e.type==='stock')e.initial=Number(f.number.value);else if(e.type==='parameter')e.value=Number(f.number.value);else e.expression=f.expression.value;if(e.type==='flow'){e.source=f.source.value||null;e.target=f.target.value||null;}m.view??={positions:{}};m.view.positions[e.id]={x:Number(f.x.value),y:Number(f.y.value)};commit(m);}));
$('selection').addEventListener('change',()=>{selected=$('selection').value;renderEntity();graph();});
$('add').onclick=safe(()=>{const m=clone(model),type=$('new-type').value;let n=1;while(m.entities.some(e=>e.id===`${type}_${n}`))n++;const id=`${type}_${n}`,stock=m.entities.find(e=>e.type==='stock'),unit=type==='flow'?`${stock.unit}/${m.time.unit}`:type==='stock'?stock.unit:'1';const e={id,type,name:`New ${type}`,unit};if(type==='stock')e.initial=0;else if(type==='parameter')e.value=1;else e.expression='0';if(type==='flow'){e.source=null;e.target=stock.id;}m.entities.push(e);selected=id;if(commit(m)){showView('inspector');workspaceGraph.fit();}});
$('remove').onclick=safe(()=>{const m=clone(model);m.entities=m.entities.filter(e=>e.id!==selected);if(m.view)delete m.view.positions[selected];commit(m,'Entity removed; run reset. Referenced entities cannot be removed until dependencies/endpoints are changed.');});
$('reset').onclick=()=>{reset();inspect();status('Run reset; model unchanged.');};$('step').onclick=safe(()=>{pause();if(step(run)){index=run.rows.length-1;inspect();status('One transition computed.');}else status('Horizon reached.');});
$('run').onclick=()=>{if(timer!==null){pause();return;}$('run').setAttribute('aria-pressed','true');$('run').textContent='Ⅱ Pause';timer=setInterval(()=>{try{if(!step(run)){pause();status('Horizon reached.');}index=run.rows.length-1;inspect();}catch(e){pause();status(e.message,true);}},Number($('speed').value));updateClock();};
$('history').oninput=()=>inspectTime(Number($('history').value));$('ledger-stock').onchange=ledger;
for(const direction of ['undo','redo'])$(direction).onclick=()=>{const target=direction==='undo'?history.past.at(-1):history.future.at(-1);if(!target||!confirmDynamics(target))return;const dynamic=changesDynamics(model,target);(direction==='undo'?undoHistory:redoHistory)(history);adopt(history.current,dynamic,`${direction} applied; ${dynamic?'run reset':'presentation only; run retained; playback unchanged'}.`);};
$('example').onclick=safe(async()=>showReview(await reviewDraft(JSON.stringify(example),model,await fingerprint(model))));$('export').onclick=()=>download(JSON.stringify(model,null,2),'stock-flow.json');$('show-json').onclick=()=>{$('document').value=JSON.stringify(model,null,2);};
$('file').onchange=safe(async()=>{const file=$('file').files[0];if(!file)return;if(file.size>65536)throw Error('File exceeds 65536 bytes');$('document').value=await file.text();status('File loaded for preview; not applied.');});
$('preview-import').onclick=safe(async()=>{const candidate=importDocument($('document').value);showReview(await reviewDraft(JSON.stringify(candidate),model,await fingerprint(model)));});
$('share').onclick=safe(async()=>{const snapshot=clone(model),encoded=await encodeShare(snapshot);$('share-url').value=new URL(`./#sf=${encoded}`,location.href).href;openPanel('share-panel','Share a snapshot');status('URL created from this model only, not run history. Copy it from the field.');});
for(const button of document.querySelectorAll('[data-ai]'))button.onclick=()=>{aiMode=button.dataset.ai;handoff=null;$('prompt').value='';$('ai-author-response').hidden=aiMode==='Explain';$('ai-explain-note').hidden=aiMode!=='Explain';openPanel('ai-panel',`${aiMode} with AI`);};
$('generate-ai').onclick=safe(async()=>{const snapshot=clone(model),mode=aiMode;$('prompt').value='';handoff=null;const result=await aiPrompt(mode,snapshot,clone(run),$('intent').value);if(await fingerprint(model)!==result.source)throw Error('Model changed during handoff; try again');handoff={...result,mode};$('prompt').value=result.prompt;status(`${mode} handoff ready. No provider called.${mode==='Explain'?' Read-only evidence; do not apply its response as a model.':''}`);});
$('copy-prompt').onclick=safe(async()=>{if(!$('prompt').value)throw Error('Generate a handoff first');await navigator.clipboard.writeText($('prompt').value);status('Handoff copied.');});$('download-prompt').onclick=()=>download($('prompt').value,'stock-flow-handoff.txt','text/plain');
$('review-ai').onclick=safe(async()=>{if(!handoff||handoff.mode==='Explain')throw Error('Generate a fresh Build or Modify handoff first; Explain is read-only');showReview(await reviewDraft($('ai-return').value,model,handoff.source));});
$('apply').onclick=safe(async()=>{const sourceModel=model,sourceReview=review;const next=await applyReview(sourceReview,sourceModel);if(model!==sourceModel||review!==sourceReview)throw Error('Stale review: model or review changed during apply');if(commit(next)){review=null;$('review-panel').hidden=true;closeModal();}});$('cancel-review').onclick=()=>{review=null;$('review-panel').hidden=true;closeModal();status('Review cancelled.');};
async function incoming(){if(!location.hash.startsWith('#sf='))return;try{const candidate=await decodeShare(location.hash.slice(4)),source=await fingerprint(model);showReview(await reviewDraft(JSON.stringify(candidate),model,source));status('Shared model validated for review; current work unchanged until Apply.');}catch(e){status(`Shared model could not be opened: ${e.message}. Current work unchanged.`,true);}}
async function start(){try{const saved=localStorage.getItem(storageKey);if(saved)model=importDocument(saved);}catch(e){autosaveBlocked=true;status(`Could not load saved model: ${e.message}. Showing example; autosave paused until explicit replacement.`,true);}history=createHistory(model);run=createRun(model);render();if(autosaveBlocked)$('autosave').textContent='Autosave paused — invalid saved data retained';requestAnimationFrame(()=>workspaceGraph.fit());if(location.hash)await incoming();}
window.addEventListener('hashchange',incoming);
$('resume-save').onclick=()=>{autosaveBlocked=false;status('Explicitly enabled autosave replacement.');save();};
$('fit').onclick=()=>workspaceGraph.fit();$('zoom-in').onclick=()=>workspaceGraph.zoom(.8);$('zoom-out').onclick=()=>workspaceGraph.zoom(1.25);$('draw-flow').onclick=()=>{pause();$('draw-flow').setAttribute('aria-pressed',String(workspaceGraph.drawMode()));status('Draw flow: drag a stock to another stock. A rate form and review come before any model change.');};
function flowDraft(source,target){pause();const form=$('flow-draft').elements;for(const key of ['source','target']){form[key].replaceChildren();option(form[key],'','Environment');for(const s of model.entities.filter(e=>e.type==='stock'))option(form[key],s.id,`${s.name} [${s.id}]`);}form.source.value=source??model.entities.find(e=>e.type==='stock').id;form.target.value=target??(model.entities.filter(e=>e.type==='stock').at(-1).id===form.source.value?'':model.entities.filter(e=>e.type==='stock').at(-1).id);form.name.value='New transfer';form.expression.value='';openPanel('flow-draft-panel','Propose a material transfer');status('Draft transfer only. Supply a rate, validate, review, then Apply.');}
$('connect-form').onclick=()=>flowDraft();$('cancel-flow').onclick=()=>{closeModal();};
$('flow-draft').onsubmit=safe(async event=>{event.preventDefault();const f=event.target.elements,next=clone(model);let n=1;while(next.entities.some(e=>e.id===`flow_${n}`))n++;const source=f.source.value||null,target=f.target.value||null,stock=model.entities.find(e=>e.id===(source||target));if(!stock)throw Error('Choose at least one stock endpoint');const unit=stock.unit;next.entities.push({id:`flow_${n}`,type:'flow',name:f.name.value,unit:`${unit}/${model.time.unit}`,expression:f.expression.value,source,target});validate(next);showReview(await reviewDraft(JSON.stringify(next),model,await fingerprint(model)));$('flow-draft-panel').hidden=true;});
document.addEventListener('keydown',e=>{if($('modal').open||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}else if(e.code==='Space'){e.preventDefault();$('run').click();}});
$('close-modal').onclick=closeModal;$('modal').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
$('title').onchange=safe(()=>{const next=clone(model);next.title=$('title').value;commit(next);});
$('blank').onclick=safe(async()=>{const blank={version:1,title:'Untitled stock-flow system',time:{unit:'hour',dt:.25,horizon:12},entities:[{id:'stock_1',type:'stock',name:'Stock',unit:'L',initial:0}]};showReview(await reviewDraft(JSON.stringify(blank),model,await fingerprint(model)));});
$('examples').onchange=()=>{if($('examples').value)$('example').click();$('examples').value='';};
$('import').onclick=()=>openPanel('document-panel','Import a system');
$('about').onclick=() => openPanel('help-panel','How this model works');$('expression-help').onclick=$('about').onclick;
$('add-stock').onclick=()=>{$('new-type').value='stock';$('add').click();};
$('copy-share').onclick=safe(async()=>{await navigator.clipboard.writeText($('share-url').value);status('Share link copied.');});
$('speed').onchange=()=>{if(timer!==null){pause();$('run').click();}};
for(const b of document.querySelectorAll('button[data-view]'))b.onclick=()=>showView(b.dataset.view);
window.addEventListener('resize',()=>{workspaceGraph.resize();charts.resize();});
start();

// Functional-suite navigation, not an application API. Never click hidden/inert controls.
export function testUI(){
 const q=s=>document.querySelector(s);
 function reach(selector){
  let element=q(selector);if(!element)throw Error('Missing control '+selector);
  if(q('#modal').open&&!q('#modal').contains(element))q('#close-modal').click();
  if(element.closest('#document-panel')&&!q('#modal').contains(element))q('#import').click();
  const panel=element.closest('.canvas-panel,.inspector-panel,.timeline-panel');
  if(panel&&innerWidth<=760){const view=panel.classList.contains('canvas-panel')?'canvas':panel.classList.contains('inspector-panel')?'inspector':'charts';q(`button[data-view=${view}]`).click();}
  for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open)parent.querySelector('summary').click();
  if(!element.getClientRects().length||element.closest('[hidden]')||(q('#modal').open&&!q('#modal').contains(element)))throw Error('Unreachable control '+selector);
  return element;
 }
 const set=(s,v)=>{if(s==='#settings [name=title]'){const e=reach('#title');e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));return;}const e=reach(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));};
 const choose=(s,v)=>{const e=reach(s);e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const click=s=>{if(s==='#example'){choose('#examples','tank');return;}if(s==='#close-modal'&&!q('#modal').open)return;reach(s).click();};
 const submit=s=>reach(s).requestSubmit();
 const wait=async p=>{for(let i=0;i<150;i++){if(p())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for reachable UI');};
 // Hold one real hash while the user closes the dialog and edits cosmetics.
 // The old review may arrive, but its reachable Apply must reject the new identity.
 async function staleAI(edit){
  const digest=crypto.subtle.digest;let release;
  crypto.subtle.digest=function(...args){return new Promise((resolve,reject)=>{release=()=>digest.apply(this,args).then(resolve,reject);});};
  try{click('#review-ai');await wait(()=>!!release);click('#close-modal');edit();}finally{crypto.subtle.digest=digest;if(release)release();}
  await wait(()=>!q('#review-panel').hidden);click('#apply');await wait(()=>q('#status').textContent.includes('Stale'));click('#close-modal');
 }
 return {reach,set,choose,click,submit,staleAI};
}

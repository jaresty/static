// Run on an isolated copy with an active starting change. No dependency on the model's prose.
(async()=>{
 const $=s=>document.querySelector(s),wait=async f=>{for(let i=0;i<150;i++){if(f())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for share link');};
 const {decode}=await import('./sharing.mjs');const model=JSON.parse(localStorage.getItem('causal-playground.v1'));if(!model?.interventions.length)throw Error('Fixture must have starting changes');
 $('#share').click();const create=[...document.querySelectorAll('#modal-actions button')].find(b=>b.textContent==='Create share link');create.click();await wait(()=>$('#prompt-output').value);const included=await decode(new URL($('#prompt-output').value).hash.slice(7));if(JSON.stringify(included.interventions)!==JSON.stringify(model.interventions))throw Error('Default recipient lost starting changes');
 $('#modal-body input[type=checkbox]').click();if($('#prompt-output').value)throw Error('Stale share link still visible');create.click();await wait(()=>$('#prompt-output').value);const excluded=await decode(new URL($('#prompt-output').value).hash.slice(7));if(excluded.interventions.length)throw Error('Opt-out still contains starting changes');$('#close-modal').click();return 'PASS default recipient and explicit opt-out';
})()

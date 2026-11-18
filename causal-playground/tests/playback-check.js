(async()=>{
 const $=id=>document.getElementById(id),results=[];
 const record=(assertion,pass,details)=>{results.push({assertion,result:pass?'PASS':'FAIL',details});};
 const tick=()=>Number($('scrub').max),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 $('reset').click();$('speed').value='60';$('speed').dispatchEvent(new Event('change',{bubbles:true}));
 const start=tick();$('play').click();
 // Repeated passive movement plus chart reconstruction must not become an inspection action.
 for(let i=0;i<6;i++){const over=document.querySelector('.u-over');over?.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:over.getBoundingClientRect().x+20,clientY:over.getBoundingClientRect().y+20}));await sleep(80);}
 record('continuous Play survives passive chart cursor and rebuild',tick()>=start+3&&$('clock').textContent.startsWith('Running'),{tick:tick(),clock:$('clock').textContent});
 $('play').click();const paused=tick();await sleep(160);record('explicit Pause stops continuous playback',tick()===paused&&$('clock').textContent.startsWith('Paused'),{tick:tick(),clock:$('clock').textContent});
 $('step').click();record('Step advances once and remains paused',tick()===paused+1&&$('clock').textContent.startsWith('Paused'),{tick:tick()});
 $('play').click();await sleep(150);$('scrub').value='1';$('scrub').dispatchEvent(new Event('input',{bubbles:true}));const latest=tick();await sleep(150);record('explicit scrub pauses and selects requested historical tick',tick()===latest&&$('scrub').value==='1'&&$('clock').textContent.startsWith('Viewing tick 1'),{tick:tick(),cursor:$('scrub').value,clock:$('clock').textContent});
 // Moving away is another passive condition; the shell also positions the real pointer outside charts.
 $('reset').click();$('play').click();await sleep(350);record('continuous Play advances multiple ticks away from chart',tick()>=3&&$('clock').textContent.startsWith('Running'),{tick:tick(),clock:$('clock').textContent});
 $('play').click();return {procedure:'tests/playback-check.js',results,ok:results.every(r=>r.result==='PASS')};
})()

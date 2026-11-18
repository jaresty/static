import {DEFAULTS,PRESETS,H,END,SAMPLE,resolvedRun} from './model.mjs';
const $=id=>document.getElementById(id);
const number=(x,d=3)=>x.toLocaleString('en-US',{maximumFractionDigits:d});
const precise=x=>x.toExponential(3);
const notes={
  recovery:'Recovery: arrivals fall from 12 to 4 work/day at day 20. The work already waiting must still be completed.',
  empty:'Empty: no work and no arrivals. Stress decays on its own; completions stay at zero.',
  drain:'Drain: 20 initial work units, no further arrivals. Every decrease is a recorded completion.',
  overload:'Overload: 12 work/day keeps arriving, above nominal capacity 10. Even with impairment off, work accumulates.',
  shock:'One-time shock: 20 work units already waiting, plus continuing arrivals of 4 work/day. Compare with sustained arrivals.',
  sustained:'Sustained: no initial backlog, but 12 work/day keeps arriving instead of 4. Compare with the one-time shock; these are different inputs.',
};
let run=null;
function setControls(c){for(const key of Object.keys(DEFAULTS))$(key)[typeof c[key]==='boolean'?'checked':'value']=c[key];scheduleFields();}
function scheduleFields(){const enabled=$('change').checked;$('schedule-fields').hidden=!enabled;for(const key of ['changeDay','A1'])$(key).disabled=!enabled;}
function readControls(){return Object.fromEntries(Object.keys(DEFAULTS).map(key=>[key,typeof DEFAULTS[key]==='boolean'?$(key).checked:Number($(key).value)]));}
function stat(value,label){const div=document.createElement('div');div.className='stat';const strong=document.createElement('strong');strong.textContent=number(value);const span=document.createElement('span');span.textContent=label;div.append(strong,span);return div;}
function chart(title,series,maxFixed){
  const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=title;
  const max=maxFixed??Math.max(1,...run.samples.flatMap(s=>series.map(v=>s[v.key])))*1.06;
  const width=Math.max(230,Math.min(640,$('charts').clientWidth)),height=190,left=52,right=14,top=15,bottom=30;
  const x=t=>left+t/END*(width-left-right), y=v=>height-bottom-v/max*(height-top-bottom);
  const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',`${title}. Day 0 to 120. Vertical range 0 to ${number(max)}. Numeric values in the table below.`);
  function el(tag,attributes,text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attributes))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;}
  for(let i=0;i<=2;i++){const v=max*i/2;el('line',{x1:left,y1:y(v),x2:width-right,y2:y(v),stroke:'#d0d5c7'});el('text',{x:left-8,y:y(v)+4,'text-anchor':'end'},number(v,1));}
  for(const t of (width<380?[0,40,80,120]:[0,20,40,60,80,100,120]))el('text',{x:x(t),y:height-10,'text-anchor':'middle'},String(t));
  if(run.config.change)el('line',{x1:x(run.config.changeDay),y1:top,x2:x(run.config.changeDay),y2:height-bottom,stroke:'#76877b','stroke-dasharray':'2 4'});
  series.forEach((s,i)=>{
    // Arrival jumps are drawn as steps, not interpolated ramps.
    const points=run.samples.map((p,n)=>`${n? (s.key==='A'?`H${x(p.t)}V`:'L'): 'M'}${s.key==='A'&&n?'':`${x(p.t)},`}${y(p[s.key])}`).join(' ');
    el('path',{d:points,fill:'none',stroke:i?'#ad4e28':'#296b59','stroke-width':2.5,...(i?{'stroke-dasharray':'7 4'}:{})});
  });
  const legend=document.createElement('div');legend.className='legend';series.forEach((s,i)=>{const span=document.createElement('span');span.className=`key${i?' secondary':''}`;span.textContent=s.label;legend.append(span);});
  figure.append(caption,svg,legend);return figure;
}
function inspect(){
  if(!run)return;
  const t=Number($('day').value);
  if(!Number.isFinite(t)||t<0||t>END||!Number.isInteger(t/SAMPLE)){$('day').setCustomValidity('Choose a quarter-day from 0 to 120.');$('day').reportValidity();return;}
  $('day').setCustomValidity('');
  const s=run.samples[Math.round(t/SAMPLE)],c=run.config;
  const heading=document.createElement('h3');heading.textContent=`State at day ${number(t,2)}`;
  const dl=document.createElement('dl');
  for(const [label,value]of [['Unfinished B',`${number(s.B,6)} work`],['Stress S',number(s.S,6)],['Productivity P',number(s.P,6)],['Workload pressure W',number(s.W,6)],['Current arrivals A',`${number(s.A,6)} work/day`],['Current completions C',`${number(s.C,6)} work/day`]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}
  const ledger=document.createElement('p');ledger.className='ledger';
  const strong=document.createElement('strong');strong.textContent='Work accounting · B = B₀ + arrivals − completions';
  ledger.append(strong,document.createTextNode(`${number(s.B,6)} = ${number(c.B0,6)} + ${number(s.I,6)} − ${number(s.O,6)} work`),document.createElement('br'),document.createTextNode(`Residual (unrounded): ${precise(s.residual)} work. Max over all steps: ${precise(run.maxResidual)} work.`));
  const preceding=document.createElement('p');preceding.className='hint';
  preceding.textContent=s.prev?`Preceding internal interval [${number(s.prev.t,9)}, ${number(s.t,9)}) days: old-state A=${number(s.prev.A,6)} and C=${number(s.prev.C,6)} work/day, integrated for h=${H} day. Added ${precise(s.prev.dI)} work; completed ${precise(s.prev.dO)} work. The displayed B and S are the resulting end-of-step state. Current rates above are recalculated at that state; at a schedule boundary A may already have changed.`:'Initial state: no preceding interval and no accumulated flows. Current rates describe the interval beginning at day 0.';
  $('inspection').replaceChildren(heading,dl,ledger,preceding);
}
function render(){
  const last=run.samples.at(-1),r=run.resolution;
  $('totals').replaceChildren(stat(last.B,'unfinished work at day 120'),stat(last.I,'work arrived since day 0'),stat(last.O,'work completed since day 0'));
  $('resolution').classList.toggle('warning',!r.pass);
  $('resolution').textContent=`${r.pass?'Within selected resolution criteria':'Not resolved to selected criteria'} · h=1/4096 day versus h/2: max ΔB=${number(r.B,6)} work (≤0.1); max ΔS=${number(r.S,6)} (≤0.002). Estimated differences, not guaranteed errors.`;
  renderCharts();
  const fragment=document.createDocumentFragment();
  for(const s of run.samples){const row=document.createElement('tr');for(const key of ['t','B','A','C','S','P','I','O']){const cell=document.createElement('td');cell.textContent=number(s[key],key==='t'?2:6);row.append(cell);}fragment.append(row);}
  $('table-body').replaceChildren(fragment);inspect();
}
function renderCharts(){
  if(!run)return;
  $('charts').replaceChildren(chart('Unfinished work · work units',[{key:'B',label:'Backlog B'}]),chart('Arrivals & completions · work/day',[{key:'A',label:'Arrivals A'},{key:'C',label:'Completions C'}]),chart('Stress & productivity · dimensionless indices',[{key:'S',label:'Stress S'},{key:'P',label:'Productivity P'}],1));
}
let resizeFrame;
window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(renderCharts);});
function execute(preset){
  if(!$('controls').reportValidity())return;
  $('error').textContent='';$('results').setAttribute('aria-busy','true');$('run-status').textContent='Computing two resolutions locally…';
  for(const button of document.querySelectorAll('button'))button.disabled=true;
  const input=readControls();
  // Yield a frame before bounded synchronous work; no input-triggered runaway jobs.
  requestAnimationFrame(()=>setTimeout(()=>{
    try{const start=performance.now();run=resolvedRun(input);render();$('run-status').textContent=`${preset?`${preset[0].toUpperCase()+preset.slice(1)} scenario`:'Custom scenario'} applied · 120 days · computed locally in ${Math.round(performance.now()-start)} ms. Charts and table updated.`;}
    catch(error){$('error').textContent=error.message;$('run-status').textContent='Run rejected. Previous results, if present, remain unchanged.';}
    finally{$('results').setAttribute('aria-busy','false');for(const button of document.querySelectorAll('button'))button.disabled=false;}
  },0));
}
$('controls').addEventListener('submit',event=>{event.preventDefault();document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));$('scenario-note').textContent='Custom inputs. Initial work is counted once; arrivals continue at their specified rate.';execute();});
$('change').addEventListener('change',scheduleFields);
$('day').addEventListener('change',inspect);
$('day').addEventListener('input',()=> $('day').setCustomValidity(''));
for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{const key=button.dataset.preset;setControls(PRESETS[key]);document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('scenario-note').textContent=notes[key];execute(key);});
setControls(DEFAULTS);execute('recovery');

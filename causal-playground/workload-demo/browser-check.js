(async()=>{
  const $=id=>document.getElementById(id),checks=[];
  const check=(name,value)=>{checks.push({name,pass:Boolean(value)});if(!value)throw new Error(name);};
  const settle=async()=>{for(let i=0;i<200;i++){if($('results').getAttribute('aria-busy')==='false')return;await new Promise(r=>setTimeout(r,25));}throw Error('run timeout');};
  const clickPreset=async key=>{document.querySelector(`[data-preset="${key}"]`).click();await settle();};
  const totals=()=>[...$('totals').querySelectorAll('strong')].map(e=>Number(e.textContent.replaceAll(',','')));
  try{
    await settle();
    check('default recovery totals and numerical indicator',totals().join(',')==='4,640,636'&&$('resolution').textContent.includes('Within selected resolution criteria'));
    check('three separate charts and numeric alternative',document.querySelectorAll('#charts svg[role="img"]').length===3&&$('table-body').children.length===481);
    check('finite SVG path geometry',[...document.querySelectorAll('svg path')].every(p=>p.getTotalLength()>0&&!/NaN|Infinity/.test(p.getAttribute('d'))));
    check('readable responsive chart labels',[...document.querySelectorAll('#charts svg')].every(svg=>svg.getBoundingClientRect().width/svg.viewBox.baseVal.width*12>=10));
    check('arrival jump uses step geometry',document.querySelectorAll('#charts svg')[1].querySelector('path').getAttribute('d').includes('H'));
    $('day').value='20';$('day').dispatchEvent(new Event('change'));
    check('boundary distinguishes state and preceding old rate',$('inspection').textContent.includes('Current arrivals A4 work/day')&&$('inspection').textContent.includes('old-state A=12'));
    for(const key of ['empty','drain','overload','shock','sustained','recovery']){
      await clickPreset(key);
      check(`preset ${key} applies`,document.querySelector(`[data-preset="${key}"]`).getAttribute('aria-pressed')==='true'&&$('run-status').textContent.includes('applied'));
      const [B,I,O]=totals(),initial=Number($('B0').value);
      check(`preset ${key} rounded summary ledger`,Math.abs(B-initial-I+O)<.003);
      if(key==='empty')check('empty no work flows',B===0&&I===0&&O===0);
      if(key==='drain')check('drain accounts initial stock',B===0&&I===0&&O===20);
      if(key==='overload')check('overload no upper cap',B>200);
      if(key==='shock')check('shock one-time not arrivals',initial===20&&I===480);
      if(key==='sustained')check('sustained repeated arrivals',initial===0&&I===1440);
      check(`preset ${key} resolution visible`,$('resolution').textContent.includes('Estimated differences, not guaranteed errors'));
    }
    $('change').checked=false;$('change').dispatchEvent(new Event('change'));
    check('disable schedule fields',$('schedule-fields').hidden&&$('A1').disabled&&$('changeDay').disabled);
    $('B0').value='20';$('S0').value='1';$('A0').value='12';$('impairment').checked=false;$('controls').requestSubmit();await settle();
    check('custom alpha off produces 260 unfinished work',totals()[0]===260&&$('run-status').textContent.includes('Custom scenario'));
    $('day').value='0';$('day').dispatchEvent(new Event('change'));
    check('initial inspection no fictitious preceding interval',$('inspection').textContent.includes('no preceding interval'));
    $('B0').value='201';check('native upper bound validation',!$('B0').checkValidity());$('B0').value='20';
    await clickPreset('recovery');
    $('table-details').open=true;
    check('table available when expanded',document.querySelector('.table-scroll').getBoundingClientRect().height>0);
    check('no document overflow',document.documentElement.scrollWidth<=innerWidth);
    check('runtime resources stay on same origin',performance.getEntriesByType('resource').every(e=>new URL(e.name).origin===location.origin));
    return {ok:true,checks,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,status:$('run-status').textContent};
  }catch(error){return {ok:false,error:error.message,checks};}
})()

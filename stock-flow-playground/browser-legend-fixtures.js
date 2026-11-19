// Run in either playground via agent-browser eval --stdin, after the interaction suite.
(async()=>{
 const causal=location.pathname.includes('causal-playground');
 const {createCharts}=await import(new URL(causal?'charts.js':'charts.mjs',location.href));
 const host=document.createElement('div');host.style.cssText='width:min(100%,260px);position:relative';document.body.append(host);
 const chart=createCharts(host,()=>{},()=>{}),name='An exceptionally long stock or variable name without abbreviation',unit='longUnbrokenMassMeasurementUnit';
 const stocks=[{type:'stock',id:'a',name,unit,baseline:17},{type:'stock',id:'b',name:'Second stock',unit:'L',baseline:13}];
 function render(n){const selected=stocks.slice(0,n);if(causal)chart.render({nodes:selected,view:{chartNodes:selected.map(s=>s.id)},stepLabel:'week'},{states:[{a:20,b:10}],tick:0},0);else chart.render({entities:selected,time:{unit:'hour',dt:1}},{rows:[{t:0,stocks:{a:20,b:10}}],model:{time:{dt:1}}},0);}
 try{render(0);if(host.querySelector('.series-readout'))throw Error('empty legend');render(1);
 const rows=host.querySelectorAll('tbody tr'),button=rows[0]?.querySelector('button');if(rows.length!==1||button?.textContent!==name)throw Error('singleton identity');
 for(const el of [button,...rows[0].cells])if(el.scrollWidth>el.clientWidth+1)throw Error('clipped '+el.textContent);
 if(!causal&&rows[0].cells[1].textContent!=='20.000 '+unit)throw Error('exact long unit');
 button.click();if(button.getAttribute('aria-pressed')!=='false')throw Error('toggle off');button.click();if(button.getAttribute('aria-pressed')!=='true')throw Error('toggle on');
 render(2);if(host.querySelectorAll('.series-readout').length!==(causal?1:2))throw Error('mixed groups');return true;
 }finally{host.remove();}
})()

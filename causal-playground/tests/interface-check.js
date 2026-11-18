(async()=>{
 const $=id=>document.getElementById(id),cy=$('graph')._cyreg.cy,results=[];
 const record=(assertion,pass,details)=>results.push({assertion,result:pass?'PASS':'FAIL',details});
 const controls=[...document.querySelectorAll('.document-bar>.button-group>button,.document-bar .compact select')];
 const boxes=controls.map(n=>({name:n.textContent,rect:n.getBoundingClientRect()}));
 record('document controls share height and bottom edge',boxes.every(x=>Math.abs(x.rect.height-38)<1)&&boxes.every(x=>Math.abs(x.rect.bottom-boxes[0].rect.bottom)<1),boxes.map(x=>({height:x.rect.height,bottom:x.rect.bottom})));
 record('Examples retains accessible label',$('examples').closest('label')?.textContent.includes('Examples'),{});
 $('graph').scrollIntoView();
 for(const zoom of [1,2]){
  cy.zoom(zoom);cy.center();if($('draw-edge').getAttribute('aria-pressed')!=='true')$('draw-edge').click();
  cy.getElementById('b').emit({type:'tapstart',position:cy.getElementById('b').position()});cy.emit({type:'tapdrag',position:{x:300,y:300}});
  const ghost=cy.edges('.eh-ghost-edge');
  record(`draw ghost is compact at zoom ${zoom}`,ghost.length===1&&parseFloat(ghost.style('width'))===1.5&&parseFloat(ghost.style('arrow-scale'))===.7,{width:ghost.style('width'),arrowScale:ghost.style('arrow-scale'),renderedWidth:ghost.renderedStyle('width'),sourceHitWidth:cy.getElementById('b').renderedWidth()});
  $('draw-edge').click();record(`draw exit removes preview at zoom ${zoom}`,cy.elements('.eh-ghost, edge.eh-preview').length===0,{temporaryCount:cy.elements('.eh-ghost, edge.eh-preview').length});
 }
 cy.zoom(1);cy.center();$('draw-edge').click();cy.getElementById('b').emit({type:'tapstart',position:cy.getElementById('b').position()});cy.emit({type:'tapdrag',position:cy.getElementById('a').position()});cy.getElementById('a').emit({type:'tapdragover',position:cy.getElementById('a').position()});await new Promise(r=>setTimeout(r,350));
 record('target preview does not shrink target node',cy.getElementById('a').width()===166&&cy.edges('.eh-preview').length===1,{targetWidth:cy.getElementById('a').width(),previewEdges:cy.edges('.eh-preview').length});
 cy.emit({type:'tapend',position:cy.getElementById('a').position()});
 record('completed draw opens relationship editor',$('inspector').textContent.includes('Connect two variables')||$('inspector').textContent.includes('Add relationship'),{inspector:$('inspector').textContent.slice(0,80)});
 const name=$('inspector').querySelector('input[type=text]');if(name)name.value='Drawn return influence';const form=$('inspector').querySelector('form');form?.requestSubmit();
 record('drawn connection saves as a named relationship',[...$('objects').options].some(x=>x.textContent==='Arrow · Drawn return influence'),{});
 if($('draw-edge').getAttribute('aria-pressed')==='true')$('draw-edge').click();
 record('finished relationship arrow width is unchanged',cy.getElementById('edge:a-b').style('width')==='2.1px',{width:cy.getElementById('edge:a-b').style('width')});
 return {procedure:'tests/interface-check.js',results,ok:results.every(r=>r.result==='PASS')};
})()

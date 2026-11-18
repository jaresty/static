export function createGraph(container,{select,move,connect}){
 const cy=cytoscape({container,layout:{name:'preset'},minZoom:0.2,maxZoom:2,style:[
 {selector:'node',style:{shape:'round-rectangle',width:166,height:92,'background-color':'#fffdf7','border-width':2,'border-color':'#b8b4a7',label:'data(label)','text-wrap':'wrap','text-max-width':150,'font-size':13,'font-family':'system-ui','text-valign':'center','color':'#252e2b','background-fit':'contain','background-image':'data(meter)'}},
 {selector:'edge',style:{width:'data(width)','line-color':'#6a8077','target-arrow-color':'#6a8077','target-arrow-shape':'triangle','curve-style':'bezier','control-point-step-size':65,'loop-direction':'-35deg','loop-sweep':'65deg',label:'data(label)','text-wrap':'wrap','font-size':11,'text-background-color':'#f6f3e9','text-background-opacity':1,'text-background-padding':3,'text-rotation':'none','color':'#283c34','arrow-scale':1.2}},
 {selector:'edge[polarity="-"]',style:{'line-style':'dashed','line-color':'#9d5949','target-arrow-color':'#9d5949'}},
 {selector:':selected',style:{'border-color':'#c16637','border-width':3,'line-color':'#c16637','target-arrow-color':'#c16637','z-index':10}},
 {selector:'.eh-handle',style:{'background-color':'#c16637',width:18,height:18,shape:'ellipse',label:''}},
 {selector:'node.eh-ghost-node',style:{width:0.0001,height:0.0001,'background-opacity':0,'border-width':0,label:'','background-image':'none',events:'no'}},
 {selector:'edge.eh-preview, edge.eh-ghost-edge',style:{width:1.5,'arrow-scale':0.7,'line-color':'#c16637','target-arrow-color':'#c16637','line-style':'dashed',opacity:0.7,label:'','curve-style':'bezier'}},
 {selector:'.eh-ghost-edge.eh-preview-active',style:{opacity:0}}]});
 let syncing=false;
 cy.on('tap','node',e=>{if(!e.target.hasClass('eh-handle'))select('node',e.target.id());});
 cy.on('tap','edge',e=>select('relationship',e.target.id()));
 cy.on('dragfree','node',e=>{if(!syncing&&!e.target.hasClass('eh-handle'))move(e.target.id(),e.target.position());});
 const eh=cy.edgehandles({hoverDelay:250,snap:false,noEdgeEventsInDraw:true,disableBrowserGestures:true,canConnect:(s,t)=>true,edgeParams:()=>({data:{temporary:true}})});
 cy.on('ehcomplete',(event,source,target,added)=>{added.remove();connect(source.id(),target.id());});
 let draw=false;
 return {cy,render(model,state,previous,selected){
  syncing=true;const wanted=new Set([...model.nodes.map(n=>n.id),...model.relationships.map(e=>'edge:'+e.id)]);
  cy.batch(()=>{
   cy.elements().filter(e=>!e.hasClass('eh-handle')&&!wanted.has(e.id())).remove();
   for(const [index,n]of model.nodes.entries()){
    const value=state[n.id]??n.initial,old=previous?.[n.id]??value,trend=value>old+0.001?'↑':value<old-0.001?'↓':'—',bound=value===100?' · UPPER BOUND':value===0?' · LOWER BOUND':'';
    const meter='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="166" height="92"><rect x="12" y="80" width="142" height="4" rx="2" fill="#e7e5da"/><rect x="12" y="80" width="${142*value/100}" height="4" rx="2" fill="#47756a"/></svg>`);
    const data={id:n.id,label:`${n.name.length>48?n.name.slice(0,45)+'…':n.name}\n${value.toFixed(1)} / 100  ${trend}${bound}`,meter};
    let element=cy.getElementById(n.id);if(element.empty()){element=cy.add({group:'nodes',data,position:model.view.positions[n.id]||{x:140+index%4*220,y:140+Math.floor(index/4)*140}});}else{element.data(data);if(!element.grabbed())element.position(model.view.positions[n.id]||element.position());}
   }
   for(const e of model.relationships){const data={id:'edge:'+e.id,source:e.from,target:e.to,polarity:e.polarity,width:1.5+Math.min(e.gain,4),label:`${e.polarity} · ${e.delaySteps} step${e.delaySteps===1?'':'s'}${selected?.id===e.id?'\n'+(e.name.length>64?e.name.slice(0,61)+'…':e.name):''}`};const old=cy.getElementById(data.id);if(old.empty())cy.add({group:'edges',data});else if(old.data('source')!==e.from||old.data('target')!==e.to){old.remove();cy.add({group:'edges',data});}else old.data(data);}
   cy.elements().unselect();if(selected)cy.getElementById(selected.kind==='node'?selected.id:'edge:'+selected.id).select();
  });syncing=false;
 },fit(){cy.resize();cy.fit(cy.elements(),70);},resize(){cy.resize();},drawMode(){draw=!draw;if(draw)eh.enableDrawMode();else{eh.stop();eh.disableDrawMode();cy.elements('.eh-ghost, edge.eh-preview').remove();cy.elements().removeClass('eh-source eh-target eh-preview eh-preview-active');}return draw;}};
}

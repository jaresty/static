// Foundation: causal-playground/graph.js (52c1fa0), adapted at the model boundary.
// Cytoscape/edgehandles state is presentation-only; only entity drag coordinates leave here.
import {parse} from './model.mjs';
export function defaultPositions(model){const out={},groups=[['stock',140],['flow',300],['parameter',440],['auxiliary',560]];for(const [type,y]of groups){const list=model.entities.filter(e=>e.type===type).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);list.forEach((e,i)=>out[e.id]={x:140+i*240,y});}return out;}
export function createGraph(container,{select,move,connect}){
 const cy=cytoscape({container,layout:{name:'preset'},minZoom:0.2,maxZoom:2,style:[
 {selector:'node',style:{shape:'round-rectangle',width:166,height:76,'background-color':'#fffdf7','border-width':2,'border-color':'#b8b4a7',label:'data(label)','text-wrap':'wrap','text-max-width':150,'font-size':13,'font-family':'system-ui','text-valign':'center',color:'#252e2b'}},
 {selector:'node[type="stock"]',style:{shape:'rectangle','border-width':3,'border-color':'#47756a'}},
 {selector:'node[type="flow"]',style:{shape:'diamond',width:130,height:90,'font-size':11}},
 {selector:'node[type="parameter"], node[type="auxiliary"]',style:{shape:'ellipse',height:66,'font-size':11}},
 {selector:'node.environment',style:{shape:'ellipse',width:76,height:46,'border-style':'dashed','font-size':10,'background-color':'#eceee2'}},
 {selector:'edge',style:{width:2.5,'line-color':'#6a8077','target-arrow-color':'#6a8077','target-arrow-shape':'triangle','curve-style':'bezier','control-point-step-size':65,'loop-direction':'-35deg','loop-sweep':'65deg',label:'data(label)','text-wrap':'wrap','font-size':10,'text-background-color':'#f6f3e9','text-background-opacity':1,'text-background-padding':3,'text-rotation':'none',color:'#283c34','arrow-scale':1}},
 {selector:'edge.information',style:{width:1.5,'line-style':'dashed','line-color':'#85709a','target-arrow-color':'#85709a'}},
 {selector:':selected',style:{'border-color':'#c16637','border-width':3,'line-color':'#c16637','target-arrow-color':'#c16637','z-index':10}},
 {selector:'.eh-handle',style:{'background-color':'#c16637',width:18,height:18,shape:'ellipse',label:''}},
 {selector:'node.eh-ghost-node',style:{width:0.0001,height:0.0001,'background-opacity':0,'border-width':0,label:'',events:'no'}},
 {selector:'edge.eh-preview, edge.eh-ghost-edge',style:{width:1.5,'arrow-scale':0.7,'line-color':'#c16637','target-arrow-color':'#c16637','line-style':'dashed',opacity:0.7,label:'','curve-style':'bezier'}},
 {selector:'.eh-ghost-edge.eh-preview-active',style:{opacity:0}}
 ]});
 let syncing=false,draw=false;
 cy.on('tap','node.entity',e=>select(e.target.id()));
 cy.on('tap','edge.model-edge',e=>select(e.target.data('entity')));
 cy.on('dragfree','node.entity',e=>{if(!syncing){const p=e.target.position();move(e.target.id(),{x:Math.max(-10000,Math.min(10000,Math.round(p.x))),y:Math.max(-10000,Math.min(10000,Math.round(p.y)))});}});
 const eh=cy.edgehandles({hoverDelay:250,snap:false,noEdgeEventsInDraw:true,disableBrowserGestures:true,canConnect:(s,t)=>s.data('type')==='stock'&&t.data('type')==='stock'&&s.id()!==t.id(),edgeParams:()=>({data:{temporary:true}})});
 cy.on('ehcomplete',(_event,source,target,added)=>{added.remove();connect(source.id(),target.id());});
 const api={cy,render(model,selected,row=null){
  const positions={...defaultPositions(model),...model.view?.positions},nodes=[],edges=[];
  for(const e of model.entities){const value=e.type==='stock'?row?.stocks[e.id]??e.initial:e.type==='parameter'?e.value:row?.values[e.id];nodes.push({group:'nodes',classes:'entity',data:{id:e.id,type:e.type,label:`${e.name}\n${e.type} · ${value==null?e.unit:Number(value).toLocaleString(undefined,{maximumFractionDigits:3})+' '+e.unit}`},position:positions[e.id]});
   if(e.type==='flow')for(const key of ['source','target']){const endpoint=e[key]||`env:${e.id}:${key}`;if(!e[key])nodes.push({group:'nodes',classes:'environment',data:{id:endpoint,label:'Environment'},position:{x:positions[e.id].x+(key==='source'?-165:165),y:positions[e.id].y-70}});edges.push({group:'edges',classes:'model-edge material',data:{id:`material:${e.id}:${key}`,entity:e.id,source:key==='source'?endpoint:e.id,target:key==='target'?endpoint:e.id,label:''}});}
   if(e.expression){const parsed=parse(e.expression);for(const id of parsed.refs){const delays=parsed.delays.filter(d=>d.id===id);edges.push({group:'edges',classes:'model-edge information',data:{id:`info:${id}:${e.id}`,entity:e.id,source:id,target:e.id,label:delays.length?'info · '+delays.map(d=>`lag ${d.steps}`).join(', '):''}});}}
  }
  syncing=true;cy.batch(()=>{const wanted=new Set([...nodes,...edges].map(e=>e.data.id));cy.elements('.entity, .environment, .model-edge').filter(e=>!wanted.has(e.id())).remove();
   for(const spec of [...nodes,...edges]){let old=cy.getElementById(spec.data.id);if(old.nonempty()&&old.isEdge()&&(old.data('source')!==spec.data.source||old.data('target')!==spec.data.target)){old.remove();old=cy.getElementById(spec.data.id);}if(old.empty())cy.add(spec);else{old.data(spec.data);if(spec.position&&!old.grabbed())old.position(spec.position);}}
   cy.elements('.entity, .model-edge').unselect();if(selected)cy.getElementById(selected).select();
  });syncing=false;
 },fit(){cy.resize();cy.fit(cy.elements('.entity, .environment'),60);},resize(){cy.resize();},zoom(factor){cy.zoom({level:Math.max(.2,Math.min(2,cy.zoom()/factor)),renderedPosition:{x:container.clientWidth/2,y:container.clientHeight/2}});},drawMode(){draw=!draw;if(draw)eh.enableDrawMode();else{eh.stop();eh.disableDrawMode();cy.elements('.eh-ghost, edge.eh-preview').remove();cy.elements().removeClass('eh-source eh-target eh-preview eh-preview-active');}return draw;}};
 // Explicit read-only observation seam for functional library/gesture checks, never serialized.
 container.graph=api;return api;
}

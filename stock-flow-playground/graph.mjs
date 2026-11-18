// SVG adapter of causal-playground/graph.js (52c1fa0) select/move/connect boundary.
// Temporary gestures never become saved graph-library state or dynamics.
import {parse} from './model.mjs';
export function defaultPositions(model){const out={},groups=[['stock',95],['flow',235],['parameter',355],['auxiliary',425]];for(const [type,y]of groups){const list=model.entities.filter(e=>e.type===type);list.forEach((e,i)=>out[e.id]={x:70+(i+.5)*760/Math.max(1,list.length),y});}return out;}
export function createGraph(container,{select,move,connect}){
 const ns='http://www.w3.org/2000/svg';let camera={x:0,y:0,w:900,h:500},draw=false,model=null,selection=null,svg=null;
 const make=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
 const cameraUpdate=()=>{if(svg)svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);};
 const point=event=>{const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
 const api={render(m,selected){model=m;selection=selected;svg=make('svg',{viewBox:`${camera.x} ${camera.y} ${camera.w} ${camera.h}`,role:'group','aria-label':'Editable stock-flow graph. Drag entities to move; in Draw flow mode drag a stock to another stock. Forms are the keyboard alternative.'});
 const defs=make('defs',{});for(const [id,color]of [['material','#386749'],['info','#8b769f']]){const marker=make('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:color}));defs.append(marker);}svg.append(defs);
 const positions={...defaultPositions(m),...(m.view?.positions||{})};
 function link(a,b,info=false){if(!a||!b)return;svg.append(make('line',{x1:a.x,y1:a.y+9,x2:b.x,y2:b.y-12,stroke:info?'#8b769f':'#386749','stroke-width':info?1.5:3,'stroke-dasharray':info?'6 5':'none','marker-end':`url(#${info?'info':'material'})`}));}
 for(const e of m.entities){if(e.type==='flow'){const p=positions[e.id];link(e.source?positions[e.source]:{x:p.x-100,y:p.y-65},p);link(p,e.target?positions[e.target]:{x:p.x+100,y:p.y-65});}if(e.expression)for(const id of parse(e.expression).refs)link(positions[id],positions[e.id],true);}
 svg.append(make('text',{x:8,y:155,'font-size':12,fill:'#5c6b60'},'Open endpoints = environment'));
 for(const e of m.entities){const p=positions[e.id],g=make('g',{tabindex:0,role:'button','data-id':e.id,'aria-label':`Edit ${e.name}`});g.style.cursor=draw?'crosshair':'grab';g.append(make('rect',{x:p.x-64,y:p.y-22,width:128,height:44,rx:e.type==='stock'?3:20,fill:e.id===selected?'#d7e6ce':'#fffef8',stroke:e.type==='flow'?'#416749':'#95a68e','stroke-width':e.type==='stock'?3:1}));const name=e.name.length>19?e.name.slice(0,17)+'…':e.name;g.append(make('text',{x:p.x,y:p.y-2,'text-anchor':'middle','font-size':12},name),make('text',{x:p.x,y:p.y+13,'text-anchor':'middle','font-size':10,fill:'#617165'},`${e.type} · ${e.id}`));
 let gesture=null;
 g.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();const start=point(event);gesture={start,moved:false,eventId:event.pointerId};g.setPointerCapture(event.pointerId);});
 g.addEventListener('pointermove',event=>{if(!gesture)return;const at=point(event),dx=at.x-gesture.start.x,dy=at.y-gesture.start.y;if(Math.abs(dx)+Math.abs(dy)>3)gesture.moved=true;if(!draw)g.setAttribute('transform',`translate(${dx} ${dy})`);});
 g.addEventListener('pointerup',event=>{if(!gesture)return;const before=gesture;gesture=null;g.releasePointerCapture(event.pointerId);g.removeAttribute('transform');if(draw&&e.type==='stock'){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-id]')?.getAttribute('data-id');if(target&&target!==e.id&&m.entities.find(e=>e.id===target)?.type==='stock')connect(e.id,target);return;}if(before.moved){const at=point(event);move(e.id,{x:Math.max(-10000,Math.min(10000,Math.round(p.x+at.x-before.start.x))),y:Math.max(-10000,Math.min(10000,Math.round(p.y+at.y-before.start.y)))});}else select(e.id);});
 g.addEventListener('pointercancel',()=>{gesture=null;g.removeAttribute('transform');});g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(e.id);}});svg.append(g);
 }
 container.replaceChildren(svg);
 },fit(){if(!model)return;const points=Object.values({...defaultPositions(model),...(model.view?.positions||{})});const minX=Math.min(...points.map(p=>p.x))-110,maxX=Math.max(...points.map(p=>p.x))+110,minY=Math.min(...points.map(p=>p.y))-65,maxY=Math.max(...points.map(p=>p.y))+65;camera={x:minX,y:minY,w:Math.max(300,maxX-minX),h:Math.max(250,maxY-minY)};cameraUpdate();},zoom(factor){const w=Math.max(180,Math.min(20000,camera.w*factor)),h=camera.h*w/camera.w;camera={x:camera.x+(camera.w-w)/2,y:camera.y+(camera.h-h)/2,w,h};cameraUpdate();},drawMode(){draw=!draw;if(model)api.render(model,selection);return draw;}};
 return api;
}

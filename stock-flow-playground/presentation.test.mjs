import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const text=name=>readFile(new URL(name,import.meta.url),'utf8');
import {defaultPositions} from './graph.mjs';
import {example,canonical} from './model.mjs';
test('P5 default positions survive canonical entity reordering',()=>{assert.deepEqual(defaultPositions(example),defaultPositions(JSON.parse(canonical(example))));});
test('P1 original shell hierarchy and responsive tabs are active',async()=>{
 const html=await text('index.html');
 for(const cls of ['masthead','titlebar','document-bar','statusbar','ai-bar','mobile-tabs','canvas-panel','inspector-panel','timeline-panel','modal-head'])assert.ok(html.includes(`class="${cls}"`),cls);
 assert.ok(html.includes('<dialog id="modal"'));
});
test('P2 P3 pinned original local libraries are active; no custom fallback',async()=>{
 const html=await text('index.html'),graph=await text('graph.mjs'),app=await text('app.mjs');
 for(const file of ['cytoscape-3.30.4.min.js','lodash-4.17.21.min.js','edgehandles-4.0.1.js','uPlot-1.6.31.min.js','uPlot-1.6.31.min.css'])assert.ok(html.includes('../causal-playground/vendor/'+file),file);
 assert.ok(graph.includes('cytoscape('));assert.ok(graph.includes('.edgehandles('));
 assert.ok(!graph.includes('createElementNS'));assert.ok(!app.includes("getContext('2d')"));
 const charts=await text('charts.mjs');assert.ok(charts.includes('new uPlot('));
});
test('P12 bounded charts disclose omissions and preserve numeric alternative',async()=>{
 const charts=await text('charts.mjs'),html=await text('index.html');
 assert.ok(charts.includes('slice(0,12)'));assert.ok(charts.includes('omitted'));assert.ok(html.includes('id="stock-values"'));
});

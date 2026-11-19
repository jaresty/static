import test from 'node:test';
import assert from 'node:assert/strict';
import {example} from '../model.mjs';
import {createRun,advance} from '../simulation.mjs';
import {startingSituation,resultAt} from '../scenario.mjs';

test('setup distinguishes unchanged runs from delayed effects of earlier values',()=>{
 const m=example();m.interventions=[];for(const n of m.nodes)n.initial=n.baseline;
 assert.match(startingSituation(m,createRun(m).states[0]),/leave them unchanged/);
 const n=m.nodes[0];n.initial=70;m.interventions=[{id:'p',node:n.id,kind:'pulse',tick:0,value:n.baseline}];
 const r=createRun(m);assert.match(startingSituation(m,r.states[0]),/previously 70/);assert.doesNotMatch(startingSituation(m,r.states[0]),/leave them unchanged/);
});
test('result for inspected step includes charted unchanged levels, not the latest step by accident',()=>{
 const m=example();const run=advance(createRun(m),4);const r=resultAt(m,run,1);assert.match(r.rows.join(';'),/unchanged/);assert.equal(r.heading,`Result · ${m.stepLabel} 1`);assert.deepEqual(resultAt(m,run,0).rows,[]);
});

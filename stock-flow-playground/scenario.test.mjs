import test from 'node:test';
import assert from 'node:assert/strict';
import {example} from './model.mjs';
import {createRun,step} from './engine.mjs';
import {encodeShare,decodeShare} from './portable.mjs';
import {startingSituation,resultAt} from './scenario.mjs';

test('tank story follows inspected interval, including after restart and share replay',async()=>{
  const replay=await decodeShare(await encodeShare(example));
  function story(m){const r=createRun(m);step(r);step(r);return [startingSituation(m),resultAt(m,r.rows,1),resultAt(m,r.rows,0),resultAt(m,createRun(m).rows,0)];}
  const [start,first,zero,restart]=story(example);
  assert.match(start,/Upper tank starts with 100 L/);assert.match(start,/Lower tank starts with 0 L/);
  assert.match(first.heading,/0\.25 hour step/);assert.match(first.details.join(" "),/100 → 95 L/);assert.match(first.details.join(" "),/0 → 5 L/);assert.equal(first.primary,"5 L moved from Upper tank to Lower tank.");
  assert.match(zero.primary,/No transfer/);assert.deepEqual(restart,zero);assert.deepEqual(story(replay),story(example));
});
test('earlier readings, constrained transfer and unchanged stock describe only this step',()=>{
  const m=structuredClone(example);m.entities.find(e=>e.id==='upper').initial=25;m.entities.find(e=>e.type==='flow').expression='8 * delay(upper, 2)';
  const r=createRun(m);step(r);step(r);assert.match(startingSituation(m),/earlier readings of Upper tank use its initial amount of 25 L/);assert.match(resultAt(m,r.rows,1).details.join(" "),/25 L transferred of 50 L requested/);assert.match(resultAt(m,r.rows,2).details.join(" "),/0 → 0 L \(unchanged\)/);
});

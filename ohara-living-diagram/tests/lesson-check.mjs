import assert from 'node:assert/strict';
import process from 'node:process';

const property = process.argv[2];
let model;
try {
  model = await import('../lesson-model.mjs');
} catch (error) {
  console.error(`FAIL ${property}: lesson model is absent or invalid — ${error.code || error.message}`);
  process.exit(1);
}

function l11() {
  const initial = model.createSession({ diameter: 30, depth: 10, units: 'cm' });
  assert.deepEqual(initial.lengths, { subject: 40, secondary: 26.8, object: 20 });
  const changed = model.updateContainer(initial, { diameter: 36, depth: 12 });
  assert.deepEqual(changed.lengths, { subject: 48, secondary: 32.2, object: 24 });
  assert.equal(initial.lengths.subject, 40, 'updates must not mutate the prior session');
  console.log('PASS l11: container dimensions recalculate all stem lengths');
}

function l12() {
  const initial = model.createSession({ diameter: 30, depth: 10 });
  const adjusted = model.setTeacherOverride(initial, 'subject', 'length', 44);
  assert.equal(adjusted.targets.subject.length.value, 44);
  assert.equal(adjusted.targets.subject.length.status, 'teacher-adjusted');
  assert.equal(initial.targets.subject.length.status, 'default');
  const restored = model.resetOverrides(adjusted);
  assert.equal(restored.targets.subject.length.value, 40);
  assert.equal(restored.targets.subject.length.status, 'default');
  console.log('PASS l12: teacher overrides remain distinct and resettable');
}

function l13() {
  const session = model.createSession({ diameter: 30, depth: 10 });
  const stem = model.getCurrentStem(session);
  assert.equal(stem.role, 'subject');
  assert.deepEqual(Object.keys(stem.details).sort(), ['elevation', 'kenzan', 'length', 'plan']);
  assert.equal(stem.details.length.value, 40);
  assert.equal(stem.details.plan.reference, 'container front');
  assert.equal(stem.details.elevation.reference, 'horizontal plane');
  console.log('PASS l13: current stem exposes all assembly dimensions');
}

function l14() {
  const initial = model.createSession();
  const discussed = model.toggleCheckpoint(model.toggleCheckpoint(initial, 'length'), 'teacher');
  assert.deepEqual(discussed.checkpoints.sort(), ['length', 'teacher']);
  assert.equal('score' in discussed, false);
  assert.equal('correct' in discussed, false);
  const advanced = model.advanceStem(discussed);
  assert.equal(advanced.currentRole, 'secondary');
  assert.deepEqual(advanced.checkpoints, []);
  console.log('PASS l14: checkpoints coordinate discussion without grading');
}

function l15() {
  const initial = model.createSession();
  const sourceBefore = model.getCurrentStem(initial).details.plan.value;
  const mirrored = model.setOrientation(initial, 'mirrored');
  const sourceAfter = model.getCurrentStem(mirrored).details.plan.value;
  assert.equal(sourceAfter, sourceBefore);
  assert.equal(model.getDisplayStem(initial).details.plan.value, -8);
  assert.equal(model.getDisplayStem(mirrored).details.plan.value, 8);
  assert.equal(mirrored.orientation, 'mirrored');
  console.log('PASS l15: display mirrors without mutating source geometry');
}

function l16() {
  let session = model.createSession({ diameter: 34, depth: 11, units: 'cm' });
  session = model.setTeacherOverride(session, 'subject', 'length', 47);
  session = model.setOrientation(session, 'mirrored');
  session = model.toggleCheckpoint(session, 'length');
  const restored = model.restoreSession(model.serializeSession(session));
  assert.deepEqual(restored, session);
  assert.deepEqual(model.resetSession(restored), model.createSession());
  console.log('PASS l16: lesson sessions restore exactly and reset deliberately');
}

function l18() {
  const initial = model.createSession();
  assert.equal(model.getAssemblyStep(initial), 'length');
  const forward = model.moveAssemblyStep(initial, 1);
  assert.equal(model.getAssemblyStep(forward), 'kenzan');
  assert.equal(model.getAssemblyStep(model.moveAssemblyStep(forward, -1)), 'length');
  let end = initial;
  for (let index = 0; index < 8; index += 1) end = model.moveAssemblyStep(end, 1);
  assert.equal(model.getAssemblyStep(end), 'review');
  console.log('PASS l18: five-step cursor moves forward, back, and clamps');
}

function l19() {
  const roles = ['subject', 'secondary', 'object'];
  const steps = ['length', 'kenzan', 'plan', 'elevation', 'review'];
  for (let globalIndex = 1; globalIndex < roles.length * steps.length; globalIndex += 1) {
    const roleIndex = Math.floor(globalIndex / steps.length);
    const stepIndex = globalIndex % steps.length;
    let session = model.createSession();
    for (let index = 0; index < roleIndex; index += 1) session = model.advanceStem(session);
    session = { ...session, assemblyStepIndex: stepIndex };
    const previous = model.moveAssemblyStep(session, -1);
    const actual = roles.indexOf(previous.currentRole) * steps.length + previous.assemblyStepIndex;
    assert.equal(actual, globalIndex - 1, `Back from ${roles[roleIndex]}/${steps[stepIndex]} must move exactly one global step`);
  }
  console.log('PASS l19: Back moves exactly one step across every role boundary');
}

function l20() {
  const initial = model.moveAssemblyStep(model.createSession(), 2);
  const fuku = model.selectAssemblyRole(initial, 'secondary');
  assert.equal(fuku.currentRole, 'secondary');
  assert.equal(model.getAssemblyStep(fuku), 'length');
  const elevation = model.selectAssemblyStep(fuku, 'elevation');
  assert.equal(elevation.currentRole, 'secondary');
  assert.equal(model.getAssemblyStep(elevation), 'elevation');
  assert.equal(model.getAssemblyStep(initial), 'plan', 'direct navigation must not mutate the prior session');
  console.log('PASS l20: role and phase selectors produce synchronized immutable state');
}

function l21() {
  const initial = model.createSession({ diameter: -20, depth: -5, units: 'invalid' });
  assert.deepEqual(initial.container, { diameter: 1, depth: 0, units: 'cm' });
  assert.equal(initial.lengths.subject, 1);
  const changed = model.updateContainer(initial, { diameter: Number.NaN, depth: -2 });
  assert.deepEqual(changed.container, { diameter: 1, depth: 0, units: 'cm' });
  const adjusted = model.setTeacherOverride(changed, 'subject', 'length', -10);
  assert.equal(adjusted.targets.subject.length.value, 0.1);
  console.log('PASS l21: physical measurements normalize to safe nonnegative bounds');
}

function l22() {
  const shu = model.getCurrentStem(model.createSession());
  assert.equal(shu.details.elevation.value, 80);
  console.log('PASS l22: Upright Shu is provisionally ten degrees off vertical');
}

const checks = { l11, l12, l13, l14, l15, l16, l18, l19, l20, l21, l22 };
if (!checks[property]) throw new Error(`Unknown lesson property: ${property}`);
checks[property]();

import assert from 'node:assert/strict';
import test from 'node:test';

const collection = {
  app: 'quadrant',
  exerciseId: 'quadrant-test',
  setup: {
    prompt: 'Choose a launch idea',
    activityDescription: 'Use the launch brief when interpreting each option.',
    xLabel: 'Value', xLow: 'Low value', xHigh: 'High value',
    yLabel: 'Confidence', yLow: 'Low confidence', yHigh: 'High confidence',
    items: [{ id: 'item-1', text: 'Alpha', description: 'A focused pilot for existing customers.' }, { id: 'item-2', text: 'Beta', description: '' }],
  },
  responses: [
    { contributionId: 'response-a', contributor: 'Alex', payload: { positions: { 'item-1': { x: 0.2, y: 0.8 }, 'item-2': { x: 0.1, y: 0.4 } } } },
    { contributionId: 'response-b', contributor: 'Blair', payload: { positions: { 'item-1': { x: 0.8, y: 0.2 }, 'item-2': { x: 0.7, y: 0.8 } } } },
  ],
};

test('r1 resolution cards initialize at arithmetic response averages', async () => {
  const { createResolution } = await import('./resolution.mjs');
  const state = createResolution(collection);
  assert.deepEqual(state.items.map(({ baseline, resolved }) => ({ baseline, resolved })), [
    { baseline: { x: 0.5, y: 0.5 }, resolved: { x: 0.5, y: 0.5 } },
    { baseline: { x: 0.4, y: 0.6 }, resolved: { x: 0.4, y: 0.6 } },
  ]);
});

test('r2 facilitator adjustments never mutate imported responses', async () => {
  const { createResolution, adjustResolution } = await import('./resolution.mjs');
  const original = structuredClone(collection);
  const changed = adjustResolution(createResolution(collection), 'item-1', { x: 0.9, y: 0.1 });
  assert.deepEqual(changed.collection.responses, original.responses);
  assert.deepEqual(collection, original);
});

test('r3 an adjustment retains its average and records a reversible predecessor', async () => {
  const { createResolution, adjustResolution } = await import('./resolution.mjs');
  const changed = adjustResolution(createResolution(collection), 'item-1', { x: 0.9, y: 0.1 });
  const item = changed.items.find(({ id }) => id === 'item-1');
  assert.deepEqual(item.resolved, { x: 0.9, y: 0.1 });
  assert.deepEqual(item.baseline, { x: 0.5, y: 0.5 });
  assert.deepEqual(changed.history.at(-1), { itemId: 'item-1', resolved: { x: 0.5, y: 0.5 } });
});

test('r7 item reset, reset all, and undo form one correction contract', async () => {
  const { createResolution, adjustResolution, resetResolutionItem, resetAllResolutions, undoResolution } = await import('./resolution.mjs');
  let state = adjustResolution(createResolution(collection), 'item-1', { x: 0.9, y: 0.1 });
  state = adjustResolution(state, 'item-2', { x: 0.2, y: 0.2 });
  const itemReset = resetResolutionItem(state, 'item-1');
  assert.deepEqual(itemReset.items.find(({ id }) => id === 'item-1').resolved, { x: 0.5, y: 0.5 });
  const allReset = resetAllResolutions(itemReset);
  assert.ok(allReset.items.every((item) => JSON.stringify(item.resolved) === JSON.stringify(item.baseline)));
  assert.deepEqual(undoResolution(allReset).items.map(({ resolved }) => resolved), itemReset.items.map(({ resolved }) => resolved));
});

test('r8 exercise-scoped persistence round-trips resolution and immutable evidence', async () => {
  const { createResolution, adjustResolution, saveResolution, loadResolution } = await import('./resolution.mjs');
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) ?? null };
  const before = adjustResolution(createResolution(collection), 'item-1', { x: 0.85, y: 0.15 });
  saveResolution(storage, before);
  const after = loadResolution(storage, collection.exerciseId);
  assert.deepEqual(after.items.map(({ resolved }) => resolved), before.items.map(({ resolved }) => resolved));
  assert.deepEqual(after.items.map(({ baseline }) => baseline), before.items.map(({ baseline }) => baseline));
  assert.deepEqual(after.collection.responses, before.collection.responses);
});

test('r9 concealed resolution export omits adjustment provenance', async () => {
  const { createResolution, adjustResolution, exportResolution } = await import('./resolution.mjs');
  const state = adjustResolution(createResolution(collection), 'item-1', { x: 0.8, y: 0.2 });
  const exported = exportResolution(state, { includeAdjustments: false });
  assert.ok(exported.items.every((item) => !Object.hasOwn(item, 'adjustment')));
});

test('r10 disclosed export describes distance and axis-relative direction for every item', async () => {
  const { createResolution, adjustResolution, exportResolution } = await import('./resolution.mjs');
  const state = adjustResolution(createResolution(collection), 'item-1', { x: 0.8, y: 0.2 });
  const exported = exportResolution(state, { includeAdjustments: true });
  assert.deepEqual(exported.items[0].adjustment, { distancePercent: 30, direction: 'toward High value and Low confidence' });
  assert.deepEqual(exported.items[1].adjustment, { distancePercent: 0, direction: 'No facilitator adjustment' });
});

test('resolution exports preserve optional activity and item descriptions', async () => {
  const { createResolution, exportResolution, formatResolutionExport } = await import('./resolution.mjs');
  const state = createResolution(collection);
  const exported = exportResolution(state);
  assert.equal(exported.activityDescription, collection.setup.activityDescription);
  assert.equal(exported.items[0].description, collection.setup.items[0].description);
  assert.match(formatResolutionExport(state), /Use the launch brief/);
  assert.match(formatResolutionExport(state), /A focused pilot/);
});

test('r9-r10 final resolution export is readable plain text with optional provenance', async () => {
  const { createResolution, adjustResolution, formatResolutionExport } = await import('./resolution.mjs');
  const state = adjustResolution(createResolution(collection), 'item-1', { x: 0.8, y: 0.2 });
  const concealed = formatResolutionExport(state, { includeAdjustments: false });
  assert.match(concealed, /QUADRANT RESOLUTION[\s\S]*Responses collected: 2[\s\S]*1\. Alpha[\s\S]*Position: High value \/ Low confidence[\s\S]*Coordinates: 80% Value, 20% Confidence/);
  assert.doesNotMatch(concealed, /Facilitator adjustment:/);
  const disclosed = formatResolutionExport(state, { includeAdjustments: true });
  assert.match(disclosed, /Facilitator adjustment: 30% of the board toward High value and Low confidence/);
  assert.match(disclosed, /Facilitator adjustment: None — participant average retained/);
});

export { collection };

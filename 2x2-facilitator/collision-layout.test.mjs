import assert from 'node:assert/strict';
import test from 'node:test';

const items = [
  { id: 'a', resolved: { x: 0.5, y: 0.5 } },
  { id: 'b', resolved: { x: 0.5, y: 0.5 } },
  { id: 'c', resolved: { x: 0.5, y: 0.5 } },
];

test('collision layout preserves every true resolved coordinate', async () => {
  const { layoutResolutionCards } = await import('./collision-layout.mjs');
  const layout = layoutResolutionCards(items, { cardDiameter: 0.11 });
  assert.deepEqual(layout.map(({ trueResolved }) => trueResolved), items.map(({ resolved }) => resolved));
});

test('coincident cards receive pairwise-separated display centers', async () => {
  const { layoutResolutionCards } = await import('./collision-layout.mjs');
  const layout = layoutResolutionCards(items, { cardDiameter: 0.11 });
  const distances = layout.flatMap((item, index) => layout.slice(index + 1).map((other) => Math.hypot(item.displayResolved.x - other.displayResolved.x, item.displayResolved.y - other.displayResolved.y)));
  assert.ok(distances.every((distance) => distance >= 0.11 - 1e-9), `distances: ${distances.join(', ')}`);
});

test('collision groups remain inside normalized plot bounds at an edge', async () => {
  const { layoutResolutionCards } = await import('./collision-layout.mjs');
  const edgeItems = ['a', 'b', 'c', 'd'].map((id) => ({ id, resolved: { x: 0.02, y: 0.02 } }));
  const layout = layoutResolutionCards(edgeItems, { cardDiameter: 0.11 });
  assert.ok(layout.every(({ displayResolved }) => [displayResolved.x, displayResolved.y].every((value) => value >= 0 && value <= 1)));
});

export { items };

import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkshop, placeAt, repositionItem } from './core.mjs';
import { compactQuadrantStorage, persistWithRecovery } from './storage-recovery.mjs';

class MemoryStorage {
  constructor(entries = [], limit = Infinity) {
    this.values = new Map(entries);
    this.limit = limit;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) {
    const next = new Map(this.values);
    next.set(key, String(value));
    const bytes = [...next].reduce((sum, [entryKey, entryValue]) => sum + entryKey.length + entryValue.length, 0);
    if (bytes > this.limit) throw new DOMException('Storage quota reached', 'QuotaExceededError');
    this.values = next;
  }
}

function completedWorkshop() {
  let session = createWorkshop({
    prompt: 'Choose a direction',
    xLabel: 'Value', xLow: 'Lower', xHigh: 'Higher',
    yLabel: 'Confidence', yLow: 'Lower', yHigh: 'Higher',
    items: 'Alpha\nBeta\nGamma',
  });
  session = placeAt(session, { x: 0.2, y: 0.8 });
  return placeAt(session, { x: 0.7, y: 0.4 });
}

function legacySession() {
  const session = completedWorkshop();
  const nested = structuredClone(session);
  nested.history = [{ ...structuredClone(session), history: [structuredClone(session)] }];
  return nested;
}

const withoutHistory = ({ history: _history, ...state }) => state;

test('cleanup compacts only Quadrant sessions and preserves their current state', () => {
  const workshop = legacySession();
  const response = legacySession();
  const foreign = '{"history":"belongs elsewhere"}';
  const malformed = '{not json';
  const storage = new MemoryStorage([
    ['quadrant:workshop:v1', JSON.stringify(workshop)],
    ['quadrant:response:v1:exercise-1', JSON.stringify(response)],
    ['pairwise:workshop:v1', foreign],
    ['quadrant:response:v1:malformed', malformed],
  ]);

  const beforeBytes = [...storage.values.values()].reduce((sum, value) => sum + value.length, 0);
  const result = compactQuadrantStorage(storage);
  const compactWorkshop = JSON.parse(storage.getItem('quadrant:workshop:v1'));
  const compactResponse = JSON.parse(storage.getItem('quadrant:response:v1:exercise-1'));
  const afterBytes = [...storage.values.values()].reduce((sum, value) => sum + value.length, 0);

  assert.equal(result.compacted, 2);
  assert.ok(result.reclaimedBytes > 0 && afterBytes < beforeBytes);
  assert.deepEqual(withoutHistory(compactWorkshop), withoutHistory(workshop));
  assert.deepEqual(withoutHistory(compactResponse), withoutHistory(response));
  assert.ok([compactWorkshop, compactResponse].every((session) => session.history.length <= 50 && session.history.every((entry) => entry.history.length === 0)));
  assert.equal(storage.getItem('pairwise:workshop:v1'), foreign);
  assert.equal(storage.getItem('quadrant:response:v1:malformed'), malformed);
});

test('a quota-failed active save retries after reclaiming legacy Quadrant storage', () => {
  const legacy = JSON.stringify(legacySession());
  const active = completedWorkshop();
  const key = 'quadrant:response:v1:new-exercise';
  const storage = new MemoryStorage([
    ['quadrant:response:v1:old-exercise', legacy],
    ['unrelated', 'preserve me'],
  ]);
  const compactedLegacyLength = (() => {
    const probe = new MemoryStorage([['quadrant:response:v1:old-exercise', legacy]]);
    compactQuadrantStorage(probe);
    return probe.getItem('quadrant:response:v1:old-exercise').length;
  })();
  storage.limit = 'quadrant:response:v1:old-exercise'.length + compactedLegacyLength + 'unrelated'.length + 'preserve me'.length + key.length + JSON.stringify(active).length;

  const result = persistWithRecovery(storage, key, active);

  assert.equal(result.status, 'recovered');
  assert.deepEqual(JSON.parse(storage.getItem(key)), active);
  assert.equal(storage.getItem('unrelated'), 'preserve me');
});

test('existing-item repositioning uses flat bounded history', () => {
  let session = completedWorkshop();
  const itemId = session.items[0].id;
  for (let index = 0; index < 80; index += 1) {
    session = repositionItem(session, itemId, { x: index % 2 ? 0.4 : 0.6, y: 0.5 });
  }
  assert.equal(session.history.length, 50);
  assert.ok(session.history.every((entry) => entry.history.length === 0));
});

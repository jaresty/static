import assert from 'node:assert/strict';
import test from 'node:test';

const modulePath = './ranking.mjs';

async function loadRanking() {
  return import(modulePath);
}

async function completedRanking(outcome = 'left', criterion = 'expected impact') {
  const { createSession, applyChoice } = await loadRanking();
  let session = createSession(criterion, 'Alpha\nBeta\nGamma');
  while (session.phase === 'comparing') session = applyChoice(session, outcome);
  return session;
}

test('governingTests harness executes', () => {
  assert.equal(1, 1);
});

test('parseItems validates and normalizes a portable list', async () => {
  const { parseItems } = await loadRanking();
  assert.deepEqual(parseItems('Alpha\nBeta\nGamma').map(({ text }) => text), ['Alpha', 'Beta', 'Gamma']);
  assert.throws(() => parseItems('Alpha'), /at least 2/i);
  assert.throws(() => parseItems('Alpha\nAlpha'), /unique/i);
  assert.throws(() => parseItems(Array.from({ length: 31 }, (_, index) => `Item ${index}`).join('\n')), /30/);
});

test('applyChoice produces reversible ranking state for every outcome', async () => {
  const { createSession, applyChoice, undoChoice } = await loadRanking();
  const initial = createSession('expected impact', 'Alpha\nBeta\nGamma');

  for (const outcome of ['left', 'right', 'tie', 'unsure']) {
    const changed = applyChoice(initial, outcome, 'because');
    assert.deepEqual(undoChoice(changed), initial, `undoChoice(applyChoice(state, ${outcome}))`);
  }
});

test('rationalePersistence survives reload and is consumed by the completed comparison', async () => {
  const { createSession, applyChoice } = await loadRanking();
  const session = createSession('long-term usefulness', 'Improve search\nAdd keyboard navigation');
  session.rationaleDraft = 'It helps more people complete a common task.';
  const resumed = JSON.parse(JSON.stringify(session));
  const changed = applyChoice(resumed, 'left', resumed.rationaleDraft);
  assert.equal(changed.comparisons[0].rationale, 'It helps more people complete a common task.');
  assert.equal(changed.rationaleDraft, '');

  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(script, /rationale\.addEventListener\(['"]input['"]/);
  assert.match(script, /rationale\.value\s*=\s*this\.session\.rationaleDraft/);
});

test('ranking completes with ordered groups and preserves ties', async () => {
  const { createSession, applyChoice } = await loadRanking();
  let session = createSession('expected impact', 'Alpha\nBeta\nGamma');

  while (session.phase === 'comparing') {
    session = applyChoice(session, session.comparisons.length === 0 ? 'tie' : 'right');
  }

  assert.equal(session.phase, 'review');
  assert.ok(session.groups.some((group) => group.length === 2), 'tie creates a ranked group');
});

test('exportRanking emits Markdown and numbered portable output', async () => {
  const { exportRanking } = await loadRanking();
  const session = {
    criterion: 'expected impact',
    groups: [['a'], ['b', 'c']],
    items: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
      { id: 'c', text: 'Gamma' },
    ],
    comparisons: [],
    uncertainties: [],
  };

  assert.match(exportRanking(session, 'markdown'), /Ranking criterion: expected impact[\s\S]*1\. Alpha[\s\S]*2\. Beta = Gamma/);
  assert.match(exportRanking(session, 'numbered'), /1\. Alpha[\s\S]*2\. Beta = Gamma/);
  assert.doesNotMatch(exportRanking(session, 'markdown'), /Rationale/);

  session.comparisons.push({ leftId: 'a', rightId: 'b', rationale: 'Alpha helps more people.' });
  assert.match(exportRanking(session, 'markdown'), /Rationale[\s\S]*Alpha helps more people\./);
  assert.match(exportRanking(session, 'numbered'), /Rationale[\s\S]*Alpha helps more people\./);
});

test('c1 Stack Rank setup URLs round-trip only the independent setup projection', async () => {
  const { encodeSetupUrl, decodeShareUrl } = await import('./collaboration.mjs');
  const session = await completedRanking();
  const artifact = decodeShareUrl(encodeSetupUrl(session, 'https://static.test/pairwise-ranker/'));
  assert.equal(artifact.app, 'stack-rank');
  assert.equal(artifact.kind, 'setup');
  assert.equal(artifact.payload.criterion, session.criterion);
  assert.deepEqual(artifact.payload.items, session.items.map(({ id, text }) => ({ id, text })));
  for (const workingField of ['groups', 'pending', 'candidateId', 'comparisons', 'uncertainties', 'rationaleDraft', 'phase', 'history', 'reviewedOrder', 'updatedAt']) {
    assert.equal(artifact.payload[workingField], undefined, `${workingField} must remain local working state`);
  }
});

test('c3 Stack Rank response URLs preserve the participant final order', async () => {
  const { encodeResponseUrl, decodeShareUrl } = await import('./collaboration.mjs');
  const session = await completedRanking();
  const artifact = decodeShareUrl(encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/pairwise-ranker/' }));
  assert.equal(artifact.kind, 'response');
  assert.equal(artifact.contributor, 'Alex');
  assert.deepEqual(artifact.payload.groups, session.groups);
  assert.ok(artifact.exerciseId);
  assert.ok(artifact.contributionId);
});

test('c5-c9 Stack Rank Slack sharing conceals by default and warns with previews', async () => {
  const { encodeResponseUrl, decodeShareUrl, buildSlackMessage } = await import('./collaboration.mjs');
  const session = await completedRanking();
  const url = encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/pairwise-ranker/' });
  const artifact = decodeShareUrl(url);
  const concealed = buildSlackMessage(artifact, url, { preview: false });
  assert.doesNotMatch(concealed, /Ranking preview:|1\. Alpha/i);
  assert.match(concealed, /privately to the facilitator/i);
  assert.equal(concealed.match(/https:\/\/\S+/g)?.length, 1);
  const preview = buildSlackMessage(artifact, url, { preview: true });
  assert.match(preview, /Ranking preview:/i);
  assert.match(preview, /may influence teammates/i);
});

test('c10-c11 Stack Rank collection is idempotent and rejects another setup', async () => {
  const { encodeResponseUrl, decodeShareUrl, createCollection, addResponse } = await import('./collaboration.mjs');
  const session = await completedRanking();
  const response = decodeShareUrl(encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/pairwise-ranker/' }));
  let collection = createCollection(session);
  ({ collection } = addResponse(collection, response));
  const duplicate = addResponse(collection, response);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.collection.responses.length, 1);

  const other = await completedRanking('right', 'ease of delivery');
  const mismatch = addResponse(collection, decodeShareUrl(encodeResponseUrl(other, { contributor: 'Blair', baseUrl: 'https://static.test/pairwise-ranker/' })));
  assert.equal(mismatch.status, 'mismatch');
  assert.equal(mismatch.collection.responses.length, 1);
});

test('c12 Stack Rank convergence preserves rankings and exposes pairwise disagreement', async () => {
  const { encodeResponseUrl, decodeShareUrl, createCollection, addResponse, convergeResponses } = await import('./collaboration.mjs');
  const first = await completedRanking('left');
  const second = await completedRanking('right');
  let collection = createCollection(first);
  for (const [session, contributor] of [[first, 'Alex'], [second, 'Blair']]) {
    const response = decodeShareUrl(encodeResponseUrl(session, { contributor, baseUrl: 'https://static.test/pairwise-ranker/' }));
    ({ collection } = addResponse(collection, response));
  }
  const result = convergeResponses(collection);
  assert.equal(result.responseCount, 2);
  assert.equal(result.rankings.length, 2);
  assert.equal(result.order.length, 3);
  const disputed = result.pairs.find(({ disagreement }) => disagreement > 0);
  assert.ok(disputed);
  assert.equal(disputed.leftWins + disputed.ties + disputed.rightWins, 2);
});

test('genericExamples excludes organization-specific backlog language', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(`${html}\n${script}`, /evidence chain|stale command|onboarding friction|first-ticket|done language/i);
});

test('static artifact is dependency-free, private, and keyboard-addressable', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /https?:\/\//i, 'index.html has no runtime network dependency');
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i, 'app has no data-bearing network call');
  assert.match(html, /Everything stays in this browser/i);
  assert.match(html, /\.sr-only\s*\{[^}]*position:\s*absolute[^}]*clip:/is, 'sr-only content remains accessible without rendering visually');
  assert.match(script, /case ['"]a['"]/i);
  assert.match(script, /case ['"]b['"]/i);
  assert.match(script, /case ['"]t['"]/i);
  assert.match(script, /case ['"]u['"]/i);
  assert.match(script, /case ['"]z['"]/i);
  assert.doesNotMatch(html, /id=['"]include-rationale['"]/);
  assert.doesNotMatch(script, /include-rationale|rationaleAvailability|rationaleCount/);
});

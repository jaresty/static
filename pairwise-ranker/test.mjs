import assert from 'node:assert/strict';
import test from 'node:test';

const modulePath = './ranking.mjs';

async function loadRanking() {
  return import(modulePath);
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

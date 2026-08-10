import assert from 'node:assert/strict';
import test from 'node:test';

const loadCore = () => import('./core.mjs');

const frame = {
  prompt: 'Which ideas should we explore next?',
  xLabel: 'Expected value',
  xLow: 'Lower value',
  xHigh: 'Higher value',
  yLabel: 'Confidence',
  yLow: 'Lower confidence',
  yHigh: 'Higher confidence',
  items: 'Improve search\nAdd keyboard shortcuts\nClarify onboarding',
};

async function completedSession() {
  const { createWorkshop, placeAt } = await loadCore();
  let session = createWorkshop(frame);
  for (const point of [{ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.2 }, { x: 0.65, y: 0.85 }]) session = placeAt(session, point);
  return session;
}

test('facilitatorContract harness executes', () => {
  assert.equal(1, 1);
});

test('framing validation passes for a clear prompt, two axes, and 2–20 unique options', async () => {
  const { createWorkshop } = await loadCore();
  const session = createWorkshop(frame);
  assert.equal(session.prompt, frame.prompt);
  assert.equal(session.items.length, 3);
  assert.throws(() => createWorkshop({ ...frame, prompt: '' }), /prompt/i);
  assert.throws(() => createWorkshop({ ...frame, items: 'Only one' }), /at least 2/i);
  assert.throws(() => createWorkshop({ ...frame, items: 'Same\nSame' }), /unique/i);
  assert.throws(() => createWorkshop({ ...frame, items: Array.from({ length: 21 }, (_, index) => `Idea ${index}`).join('\n') }), /20/);
});

test('optional activity and option descriptions normalize into the workshop model', async () => {
  const { createWorkshop } = await loadCore();
  const session = createWorkshop({
    ...frame,
    activityDescription: 'Use this map to prepare the roadmap conversation.',
    items: [
      { text: 'Improve search', description: 'Help people recover when their first query misses.' },
      { text: 'Add keyboard shortcuts', description: '' },
      { text: 'Clarify onboarding' },
    ],
  });
  assert.equal(session.activityDescription, 'Use this map to prepare the roadmap conversation.');
  assert.deepEqual(session.items.map(({ text, description }) => ({ text, description })), [
    { text: 'Improve search', description: 'Help people recover when their first query misses.' },
    { text: 'Add keyboard shortcuts', description: '' },
    { text: 'Clarify onboarding', description: '' },
  ]);
});

test('direct grid placement passes with two-dimensional normalized coordinates', async () => {
  const { createWorkshop, placeAt, coordinates } = await loadCore();
  let session = createWorkshop(frame);
  assert.deepEqual(coordinates(session), []);
  session = placeAt(session, { x: 0.5, y: 0.5 });
  session = placeAt(session, { x: 0.8, y: 0.2 });
  session = placeAt(session, { x: 0.65, y: 0.85 });

  assert.equal(session.phase, 'review');
  assert.deepEqual(coordinates(session).map(({ x, y }) => [x, y]), [[0.5, 0.5], [0.8, 0.2], [0.65, 0.85]]);
  assert.throws(() => placeAt(createWorkshop(frame), { x: 1.2, y: 0.5 }), /inside the grid/i);
});

test('persistence behavior passes for adjustment, undo, and serialized restoration', async () => {
  const { moveItem, undo } = await loadCore();
  const session = await completedSession();
  const itemId = session.items[0].id;
  const moved = moveItem(session, itemId, 'x', 1);
  assert.ok(moved.positions[itemId].x > session.positions[itemId].x);
  assert.deepEqual(undo(moved), session);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), session);
});

test('workshop history stays flat, bounded, compact, and repeatedly undoable', async () => {
  const { moveItem, undo } = await loadCore();
  const original = await completedSession();
  const itemId = original.items[0].id;
  const states = [original];
  for (let index = 0; index < 8; index += 1) {
    states.push(moveItem(states.at(-1), itemId, 'x', index % 2 === 0 ? 1 : -1));
  }
  const current = states.at(-1);
  assert.ok(current.history.every((entry) => entry.history.length === 0), 'history snapshots must not contain nested history');
  assert.ok(JSON.stringify(current).length < 50_000, 'a short edit sequence must remain compact');

  const legacy = structuredClone(original);
  legacy.history = Array.from({ length: 60 }, () => ({ ...structuredClone(original), history: [structuredClone(original)] }));
  const normalized = moveItem(legacy, itemId, 'x', 1);
  assert.equal(normalized.history.length, 50, 'the next transition must bound legacy history');
  assert.ok(normalized.history.every((entry) => entry.history.length === 0), 'legacy history must flatten on the next transition');

  let undone = current;
  for (let index = states.length - 2; index >= 0; index -= 1) {
    undone = undo(undone);
    assert.deepEqual(undone.positions, states[index].positions);
  }
});

test('serialized session growth stays constant after the history limit', async () => {
  const { moveItem } = await loadCore();
  let session = await completedSession();
  const itemId = session.items[0].id;
  for (let index = 0; index < 60; index += 1) {
    session = moveItem(session, itemId, 'x', index % 2 === 0 ? 1 : -1);
  }
  const bytesAtLimit = JSON.stringify(session).length;
  for (let index = 60; index < 1000; index += 1) {
    session = moveItem(session, itemId, 'x', index % 2 === 0 ? 1 : -1);
  }
  const bytesAfterManyEdits = JSON.stringify(session).length;
  assert.ok(bytesAfterManyEdits <= bytesAtLimit + 1_000, `serialized history grew from ${bytesAtLimit} to ${bytesAfterManyEdits} bytes`);
});

test('regrid behavior passes by turning selected focus items into a new round', async () => {
  const { setFocus, regridFocus } = await loadCore();
  let session = await completedSession();
  session = setFocus(session, session.items.slice(0, 2).map(({ id }) => id));
  const next = regridFocus(session);
  assert.equal(next.round, 2);
  assert.equal(next.items.length, 2);
  assert.deepEqual(next.items.map(({ text }) => text), session.items.slice(0, 2).map(({ text }) => text));
});

test('export formats pass with the prompt, axes, and every current option', async () => {
  const { exportWorkshop } = await loadCore();
  const session = await completedSession();

  for (const format of ['markdown', 'json', 'svg']) {
    const output = exportWorkshop(session, format);
    assert.match(output, /Which ideas should we explore next\?/);
    assert.match(output, /Expected value/);
    assert.match(output, /Confidence/);
    for (const { text } of session.items) assert.match(output, new RegExp(text));
  }
  assert.doesNotThrow(() => JSON.parse(exportWorkshop(session, 'json')));
  assert.match(exportWorkshop(session, 'svg'), /^<svg/);
});

test('c1 Quadrant setup URLs round-trip only the independent setup projection', async () => {
  const { encodeSetupUrl, decodeShareUrl } = await import('./collaboration.mjs');
  const session = await completedSession();
  const artifact = decodeShareUrl(encodeSetupUrl(session, 'https://static.test/2x2-facilitator/'));
  assert.equal(artifact.app, 'quadrant');
  assert.equal(artifact.kind, 'setup');
  assert.equal(artifact.payload.prompt, session.prompt);
  assert.deepEqual(artifact.payload.items, session.items.map(({ id, text, description }) => ({ id, text, description })));
  for (const workingField of ['positions', 'pending', 'candidateId', 'focusIds', 'phase', 'history']) {
    assert.equal(artifact.payload[workingField], undefined, `${workingField} must remain local working state`);
  }
});

test('Quadrant setup links round-trip optional activity and option descriptions', async () => {
  const { encodeSetupUrl, decodeShareUrl } = await import('./collaboration.mjs');
  const session = await completedSession();
  session.activityDescription = 'Discuss tradeoffs before making a roadmap commitment.';
  session.items[0].description = 'A search result should explain why no exact match was found.';
  const setup = decodeShareUrl(encodeSetupUrl(session, 'https://static.test/2x2-facilitator/')).payload;
  assert.equal(setup.activityDescription, session.activityDescription);
  assert.deepEqual(setup.items, session.items.map(({ id, text, description = '' }) => ({ id, text, description })));
});

test('c3 Quadrant response URLs preserve participant placements', async () => {
  const { encodeResponseUrl, decodeShareUrl } = await import('./collaboration.mjs');
  const session = await completedSession();
  const artifact = decodeShareUrl(encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' }));
  assert.equal(artifact.kind, 'response');
  assert.equal(artifact.contributor, 'Alex');
  assert.deepEqual(artifact.payload.positions, session.positions);
  assert.ok(artifact.exerciseId);
  assert.ok(artifact.contributionId);
});

test('c5 Quadrant Slack sharing conceals results by default', async () => {
  const { encodeResponseUrl, decodeShareUrl, buildSlackMessage } = await import('./collaboration.mjs');
  const session = await completedSession();
  const url = encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' });
  const message = buildSlackMessage(decodeShareUrl(url), url, { preview: false });
  assert.doesNotMatch(message, /Placement preview:|X 0\.|Y 0\./i);
});

test('c6 Quadrant Slack sharing wraps the response URL in a labeled Markdown link', async () => {
  const { encodeResponseUrl, decodeShareUrl, buildSlackMessage } = await import('./collaboration.mjs');
  const session = await completedSession();
  const url = encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' });
  const message = buildSlackMessage(decodeShareUrl(url), url, { preview: false });
  const labeledLink = `[Quadrant response](${url})`;
  assert.deepEqual({
    labeled: message.endsWith(labeledLink),
    rawUrlElsewhere: message.replace(labeledLink, '').includes(url),
  }, { labeled: true, rawUrlElsewhere: false });
});

test('c7 Quadrant concealed Slack sharing recommends private facilitator handoff', async () => {
  const { encodeResponseUrl, decodeShareUrl, buildSlackMessage } = await import('./collaboration.mjs');
  const session = await completedSession();
  const url = encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' });
  assert.match(buildSlackMessage(decodeShareUrl(url), url, { preview: false }), /privately to the facilitator/i);
});

test('c8-c9 Quadrant preview sharing includes a result summary and influence warning', async () => {
  const { encodeResponseUrl, decodeShareUrl, buildSlackMessage } = await import('./collaboration.mjs');
  const session = await completedSession();
  const url = encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' });
  const message = buildSlackMessage(decodeShareUrl(url), url, { preview: true });
  assert.match(message, /Placement preview:/i);
  assert.match(message, /may influence teammates/i);
});

test('c10 Quadrant collection ignores duplicate contribution IDs', async () => {
  const { encodeResponseUrl, decodeShareUrl, createCollection, addResponse } = await import('./collaboration.mjs');
  const session = await completedSession();
  const response = decodeShareUrl(encodeResponseUrl(session, { contributor: 'Alex', baseUrl: 'https://static.test/2x2-facilitator/' }));
  let collection = createCollection(session);
  ({ collection } = addResponse(collection, response));
  const duplicate = addResponse(collection, response);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.collection.responses.length, 1);
});

test('c11 Quadrant collection rejects responses from another exercise', async () => {
  const { encodeResponseUrl, decodeShareUrl, createCollection, addResponse } = await import('./collaboration.mjs');
  const { createWorkshop, placeAt } = await loadCore();
  const session = await completedSession();
  let other = createWorkshop({ ...frame, prompt: 'A different decision' });
  other = placeAt(other, { x: 0.5, y: 0.5 });
  other = placeAt(other, { x: 0.2, y: 0.4 });
  other = placeAt(other, { x: 0.7, y: 0.9 });
  const response = decodeShareUrl(encodeResponseUrl(other, { contributor: 'Blair', baseUrl: 'https://static.test/2x2-facilitator/' }));
  const result = addResponse(createCollection(session), response);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.collection.responses.length, 0);
});

test('c12 Quadrant convergence preserves placements and exposes disagreement', async () => {
  const { encodeResponseUrl, decodeShareUrl, createCollection, addResponse, convergeResponses } = await import('./collaboration.mjs');
  const first = await completedSession();
  const second = structuredClone(first);
  second.positions['item-1'] = { x: 0.9, y: 0.1 };
  let collection = createCollection(first);
  for (const [session, contributor] of [[first, 'Alex'], [second, 'Blair']]) {
    const response = decodeShareUrl(encodeResponseUrl(session, { contributor, baseUrl: 'https://static.test/2x2-facilitator/' }));
    ({ collection } = addResponse(collection, response));
  }
  const result = convergeResponses(collection);
  assert.equal(result.responseCount, 2);
  assert.equal(result.items.find(({ id }) => id === 'item-1').placements.length, 2);
  assert.ok(result.items.find(({ id }) => id === 'item-1').disagreement > 0);
});

test('participant placement names the decision question', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');

  assert.ok(
    /id="placement-prompt"/.test(html) && /placement-prompt[^\n]*textContent\s*=\s*this\.session\.prompt/.test(script),
    'participant placement must render the session decision question',
  );
});

test('participant placement names the horizontal criterion', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(
    /id="placement-x-title"/.test(html) && /placement-x-title[^\n]*textContent\s*=\s*this\.session\.xLabel/.test(script),
    'participant placement must render the horizontal criterion title',
  );
});

test('participant placement names the vertical criterion', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(
    /id="placement-y-title"/.test(html) && /placement-y-title[^\n]*textContent\s*=\s*this\.session\.yLabel/.test(script),
    'participant placement must render the vertical criterion title',
  );
});

test('participant sees both complete endpoint pairs before placement controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const orientationIndex = html.indexOf('id="placement-orientation"');
  assert.ok(
    orientationIndex >= 0
      && orientationIndex < html.indexOf('class="placement-layout"')
      && /id="placement-x-summary"/.test(html)
      && /id="placement-y-summary"/.test(html)
      && /placement-x-summary[^\n]*this\.session\.xLow[^\n]*this\.session\.xHigh/.test(script)
      && /placement-y-summary[^\n]*this\.session\.yLow[^\n]*this\.session\.yHigh/.test(script),
    'participant orientation must show both endpoint pairs before placement',
  );
});

test('existing-option drag feedback names the actively dragged option', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(
    /if \(!candidate && this\.session\.phase === 'placement'\)[\s\S]*?candidate-card[^\n]*activeItem\.text/.test(script),
    'existing-option drag must name the actively dragged option',
  );
});

test('existing-option drag feedback follows the active coordinates', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(
    /if \(!candidate && this\.session\.phase === 'placement'\)[\s\S]*?placement-coordinates[^\n]*this\.describePosition\(latest\)/.test(script),
    'existing-option drag must show the actively dragged coordinates',
  );
});

test('solo setup keeps Start placing as its sole primary action', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const form = html.match(/<form class="panel" id="setup-form">[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.ok(
    /class="button button-primary" id="setup-submit"[^>]*>Start placing<\/button>/.test(form)
      && (form.match(/button-primary/g) ?? []).length === 1,
    'solo setup must have Start placing as its sole primary action',
  );
});

test('invite setup keeps Create setup link as its sole primary action', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const form = html.match(/<form class="panel" id="setup-form">[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.ok(
    /class="button button-primary" id="setup-submit"/.test(form)
      && (form.match(/button-primary/g) ?? []).length === 1
      && /enterFacilitatorSetup\(\)[\s\S]*?setup-submit[^\n]*Create setup link/.test(script),
    'invite setup must have Create setup link as its sole primary action',
  );
});

test('facilitator setup groups AI controls as alternate assistance', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const form = html.match(/<form class="panel" id="setup-form">[\s\S]*?<\/form>/)?.[0] ?? '';
  const assistance = form.match(/<details class="ai-assistance"[\s\S]*?<\/details>/)?.[0] ?? '';
  assert.ok(
    /<summary>Need help drafting\?<\/summary>/.test(assistance)
      && /data-copy-ai-prompt/.test(assistance)
      && /data-open-ai/.test(assistance)
      && form.indexOf('class="ai-assistance"') > form.indexOf('id="example-button"'),
    'AI controls must live in a labeled alternate-assistance disclosure',
  );
});

test('facilitator axis inputs give endpoint pairs two columns', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(/\.axis-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/.test(html), 'axis input grid must use two columns');
});

test('facilitator criterion input spans the endpoint columns', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.ok(/\.axis-grid\s*>\s*div:first-child\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(html), 'criterion input must span both endpoint columns');
});

test('unchanged existing-option drag restores the current candidate name', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(/else if \(this\.session\.phase === 'placement'\)[\s\S]*?candidate-card[^\n]*candidateItem\.text/.test(script), 'finished existing-option drag must restore the candidate name');
});

test('unchanged existing-option drag restores the candidate coordinates', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  assert.ok(/else if \(this\.session\.phase === 'placement'\)\s*\{[^}]*placement-coordinates[^\n]*this\.describePosition\(this\.draftPosition\)/.test(script), 'finished existing-option drag must restore the candidate coordinates');
});

test('selected and dragged board notes have explicit topmost stacking levels', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /\.board-item\.selected\s*\{[^}]*z-index:\s*[4-9]\d*/);
  assert.match(html, /\.board-item\.dragging\s*\{[^}]*z-index:\s*[5-9]\d*/);
});

test('static artifact passes without runtime dependencies and exposes keyboard-addressable controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('./app.js', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i);
  assert.match(html, /id="setup-form"/);
  assert.match(html, /id="placement-view"/);
  assert.match(html, /aria-label="2×2 priority board"/);
  assert.match(html, /id="setup-board-preview"[^>]*aria-label="2×2 setup preview"/);
  assert.match(html, /id="review-actions"/);
  assert.match(html, /\.review-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s+minmax\(280px,\s*\.65fr\)/);
  assert.match(html, /id="x-label"[^>]*value="Cost"/);
  assert.match(html, /id="x-low"[^>]*value="Lower cost"/);
  assert.match(html, /id="x-high"[^>]*value="Higher cost"/);
  assert.match(html, /id="y-label"[^>]*value="Value"/);
  assert.match(html, /id="y-low"[^>]*value="Lower value"/);
  assert.match(html, /id="y-high"[^>]*value="Higher value"/);
  assert.match(html, /id="setup-x-edit"[^>]*aria-controls="x-label"/);
  assert.match(html, /id="setup-y-edit"[^>]*aria-controls="y-label"/);
  assert.match(script, /setup-x-edit[\s\S]*?addEventListener[\s\S]*?x-label[\s\S]*?focus/);
  assert.match(script, /setup-y-edit[\s\S]*?addEventListener[\s\S]*?y-label[\s\S]*?focus/);
  assert.match(script, /\['x-label', 'x-low', 'x-high', 'y-label', 'y-low', 'y-high'\][\s\S]*?addEventListener\('click'[\s\S]*?currentTarget\.select\(\)/);
  assert.doesNotMatch(html, /id="x-position"|id="y-position"/);
  assert.doesNotMatch(html, /id="move-up"|id="move-left"|id="move-right"|id="move-down"/);
  assert.doesNotMatch(html, /Choose the focus|focus choices|focus area|id="focus-list"|id="regrid-button"/i);
  assert.doesNotMatch(script, /focus-list|regrid-button/);
  assert.match(script, /pointerdown/);
  assert.match(script, /placeAt/);
  assert.match(script, /localStorage/);
  assert.doesNotMatch(script, /scrollIntoView/);
  assert.match(script, /const scrollY = \['placement', 'review'\]\.includes\(name\) \? window\.scrollY : 0;[\s\S]*requestAnimationFrame[\s\S]*scrollTo\(\{ top: scrollY/);
  assert.match(script, /ArrowLeft|ArrowRight/);
  assert.match(script, /ArrowUp|ArrowDown/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?\.board-wrap\s*\{[^}]*min-height:\s*0[^}]*aspect-ratio:\s*\.78/is);
});

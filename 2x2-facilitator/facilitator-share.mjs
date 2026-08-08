import { createResolution } from './resolution.mjs';

const APP = 'quadrant';
const VERSION = 1;
const HASH_KEY = 'facilitator';
const MAX_ENCODED_LENGTH = 24000;

const clone = (value) => structuredClone(value);

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value);
  const extra = actual.find((key) => !keys.includes(key));
  const missing = keys.find((key) => !actual.includes(key));
  if (extra) throw new Error(`Unsupported field in ${label}: ${extra}.`);
  if (missing) throw new Error(`Missing field in ${label}: ${missing}.`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  return value;
}

function point(value, label) {
  const source = exactKeys(value, ['x', 'y'], label);
  if (![source.x, source.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)) {
    throw new Error(`${label} must be inside the grid.`);
  }
  return { x: source.x, y: source.y };
}

function setup(value) {
  const source = exactKeys(value, ['activityDescription', 'items', 'prompt', 'xHigh', 'xLabel', 'xLow', 'yHigh', 'yLabel', 'yLow'], 'facilitator setup');
  if (!Array.isArray(source.items) || source.items.length < 2 || source.items.length > 20) throw new Error('Facilitator setup needs 2–20 items.');
  return {
    prompt: text(source.prompt, 'Prompt'),
    activityDescription: text(source.activityDescription, 'Activity description'),
    xLabel: text(source.xLabel, 'X label'), xLow: text(source.xLow, 'X low'), xHigh: text(source.xHigh, 'X high'),
    yLabel: text(source.yLabel, 'Y label'), yLow: text(source.yLow, 'Y low'), yHigh: text(source.yHigh, 'Y high'),
    items: source.items.map((item) => {
      const candidate = exactKeys(item, ['description', 'id', 'text'], 'facilitator item');
      return { id: text(candidate.id, 'Item id'), text: text(candidate.text, 'Item title'), description: text(candidate.description, 'Item description') };
    }),
  };
}

function canonicalSetup(value) {
  return setup({
    ...clone(value),
    activityDescription: value.activityDescription ?? '',
    items: value.items.map((item) => ({ ...item, description: item.description ?? '' })),
  });
}

function disagreementFor(itemId, responses) {
  const points = responses.map(({ payload }) => payload.positions[itemId]);
  let disagreement = 0;
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      disagreement = Math.max(disagreement, Math.hypot(points[first].x - points[second].x, points[first].y - points[second].y));
    }
  }
  return disagreement;
}

function baseArtifact(kind, exerciseId, payload) {
  return { version: VERSION, app: APP, kind, exerciseId, payload };
}

export function createFacilitatorViewArtifact(resolution) {
  const setupValue = canonicalSetup(resolution.collection.setup);
  const responses = resolution.collection.responses;
  return baseArtifact('facilitator-view', resolution.collection.exerciseId, {
    setup: setupValue,
    responseCount: responses.length,
    items: resolution.items.map(({ id, text: title, description = '', baseline, resolved }) => ({
      id, text: title, description, baseline: point(baseline, 'Baseline'), resolved: point(resolved, 'Resolved position'), disagreement: disagreementFor(id, responses),
    })),
  });
}

export function createFacilitatorHandoffArtifact(resolution, { includeNames = false } = {}) {
  const setupValue = canonicalSetup(resolution.collection.setup);
  return baseArtifact('facilitator-handoff', resolution.collection.exerciseId, {
    setup: setupValue,
    responses: resolution.collection.responses.map((response, index) => ({
      contributionId: `handoff-response-${index + 1}`,
      contributor: includeNames ? response.contributor : `Participant ${index + 1}`,
      payload: { positions: clone(response.payload.positions) },
    })),
    resolved: Object.fromEntries(resolution.items.map(({ id, resolved }) => [id, point(resolved, 'Resolved position')])),
    includesNames: Boolean(includeNames),
  });
}

function validatePositions(value, setupValue, label) {
  const ids = new Set(setupValue.items.map(({ id }) => id));
  const entries = Object.entries(value ?? {});
  if (entries.length !== ids.size || entries.some(([id]) => !ids.has(id))) throw new Error(`${label} must contain every setup item.`);
  return Object.fromEntries(entries.map(([id, valuePoint]) => [id, point(valuePoint, `${label} ${id}`)]));
}

function validateViewPayload(value) {
  const source = exactKeys(value, ['items', 'responseCount', 'setup'], 'view-only payload');
  const setupValue = setup(source.setup);
  if (!Number.isInteger(source.responseCount) || source.responseCount < 1) throw new Error('Response count must be positive.');
  if (!Array.isArray(source.items) || source.items.length !== setupValue.items.length) throw new Error('View-only results must match setup items.');
  const items = source.items.map((item) => {
    const result = exactKeys(item, ['baseline', 'description', 'disagreement', 'id', 'resolved', 'text'], 'view-only item');
    if (!Number.isFinite(result.disagreement) || result.disagreement < 0) throw new Error('Disagreement must be non-negative.');
    return { ...result, baseline: point(result.baseline, 'Baseline'), resolved: point(result.resolved, 'Resolved position') };
  });
  return { setup: setupValue, responseCount: source.responseCount, items };
}

function validateHandoffPayload(value) {
  const source = exactKeys(value, ['includesNames', 'resolved', 'responses', 'setup'], 'handoff payload');
  const setupValue = setup(source.setup);
  if (typeof source.includesNames !== 'boolean' || !Array.isArray(source.responses) || !source.responses.length) throw new Error('Handoff responses are invalid.');
  const responses = source.responses.map((response) => {
    const entry = exactKeys(response, ['contributionId', 'contributor', 'payload'], 'handoff response');
    const payload = exactKeys(entry.payload, ['positions'], 'handoff response payload');
    return {
      contributionId: text(entry.contributionId, 'Contribution id'),
      contributor: text(entry.contributor, 'Contributor'),
      payload: { positions: validatePositions(payload.positions, setupValue, 'Response positions') },
    };
  });
  return { setup: setupValue, responses, resolved: validatePositions(source.resolved, setupValue, 'Resolved positions'), includesNames: source.includesNames };
}

function validateArtifact(value) {
  const source = exactKeys(value, ['app', 'exerciseId', 'kind', 'payload', 'version'], 'facilitator artifact');
  if (source.version !== VERSION || source.app !== APP || !['facilitator-view', 'facilitator-handoff'].includes(source.kind)) throw new Error('Unsupported facilitator artifact.');
  return baseArtifact(source.kind, text(source.exerciseId, 'Exercise id'), source.kind === 'facilitator-view' ? validateViewPayload(source.payload) : validateHandoffPayload(source.payload));
}

function encodeText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeText(value) {
  if (!value || value.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('This facilitator link is invalid or too large.');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeFacilitatorArtifactUrl(raw, baseUrl) {
  const artifact = validateArtifact(raw);
  const encoded = encodeText(JSON.stringify(artifact));
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error('This facilitator link is too large. Download the editable JSON backup instead.');
  const url = new URL(baseUrl, globalThis.location?.href);
  url.hash = `${HASH_KEY}=${encoded}`;
  return url.toString();
}

export function decodeFacilitatorArtifact(value) {
  const url = new URL(value, globalThis.location?.href);
  const encoded = new URLSearchParams(url.hash.slice(1)).get(HASH_KEY);
  if (!encoded) throw new Error('This URL does not contain a facilitator share.');
  try { return validateArtifact(JSON.parse(decodeText(encoded))); }
  catch (error) { throw new Error('This facilitator share could not be read.', { cause: error }); }
}

export function parseFacilitatorArtifactJson(raw) {
  try { return validateArtifact(JSON.parse(raw)); }
  catch (error) { throw new Error('This facilitator JSON could not be read.', { cause: error }); }
}

export function restoreFacilitatorHandoff(raw) {
  const artifact = validateArtifact(raw);
  if (artifact.kind !== 'facilitator-handoff') throw new Error('Choose an editable facilitator handoff.');
  const collection = { app: APP, exerciseId: artifact.exerciseId, setup: clone(artifact.payload.setup), responses: clone(artifact.payload.responses) };
  const resolution = createResolution(collection);
  for (const item of resolution.items) item.resolved = clone(artifact.payload.resolved[item.id]);
  return { collection, resolution };
}

export function facilitatorArtifactJson(artifact) {
  return JSON.stringify(artifact, null, 2);
}

export function formatFacilitatorViewMarkdown(raw) {
  const artifact = validateArtifact(raw);
  if (artifact.kind !== 'facilitator-view') throw new Error('Choose a view-only facilitator result.');
  const { setup, responseCount, items } = artifact.payload;
  const percent = (value) => `${Math.round(value * 100)}%`;
  const lines = [
    '# Quadrant facilitator result',
    '',
    '## Question',
    '',
    setup.prompt,
    ...(setup.activityDescription ? ['', setup.activityDescription] : []),
    '',
    `**Responses:** ${responseCount}`,
    '',
    '## Axes',
    '',
    `- **${setup.xLabel}:** ${setup.xLow} → ${setup.xHigh}`,
    `- **${setup.yLabel}:** ${setup.yLow} → ${setup.yHigh}`,
    '',
    '## Final results',
  ];
  items.forEach((item, index) => {
    lines.push(
      '',
      `### ${index + 1}. ${item.text}`,
      ...(item.description ? ['', item.description] : []),
      '',
      `- Final position: ${percent(item.resolved.x)} ${setup.xLabel}; ${percent(item.resolved.y)} ${setup.yLabel}`,
    );
    const spread = Math.round(item.disagreement / Math.SQRT2 * 100);
    if (spread > 0) lines.push(`- Disagreement: ${spread}% spread`);
    if (Math.hypot(item.resolved.x - item.baseline.x, item.resolved.y - item.baseline.y) > .000001) {
      lines.push(`- Facilitator adjustment: ${percent(item.baseline.x)} ${setup.xLabel}, ${percent(item.baseline.y)} ${setup.yLabel} → ${percent(item.resolved.x)} ${setup.xLabel}, ${percent(item.resolved.y)} ${setup.yLabel}`);
    }
  });
  lines.push(
    '',
    '## Privacy',
    '',
    'Aggregate results only. Participant names, contribution identifiers, and individual placements are excluded.',
    '',
  );
  return lines.join('\n');
}

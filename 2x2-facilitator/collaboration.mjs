const APP = 'quadrant';
const VERSION = 1;
const HASH_KEY = 'quadrant';
const MAX_ENCODED_LENGTH = 24000;

function clean(value, max = 4000) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error('Shared text is missing or too long.');
  return text;
}

function optionalText(value, max = 4000) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new Error('Shared text is too long.');
  return text;
}

function hash(value) {
  let result = 0x811c9dc5;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function encodeText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeText(value) {
  if (!value || value.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error('This shared Quadrant link is invalid or too large.');
  }
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function setupFromSession(session) {
  const items = session?.items?.map(({ id, text, description }) => {
    const item = { id: clean(id, 100), text: clean(text, 500) };
    const detail = optionalText(description, 2000);
    if (detail) item.description = detail;
    return item;
  });
  if (!items || items.length < 2 || items.length > 20 || new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error('A shared Quadrant setup needs 2–20 uniquely identified options.');
  }
  const setup = {
    prompt: clean(session.prompt),
    xLabel: clean(session.xLabel, 500),
    xLow: clean(session.xLow, 500),
    xHigh: clean(session.xHigh, 500),
    yLabel: clean(session.yLabel, 500),
    yLow: clean(session.yLow, 500),
    yHigh: clean(session.yHigh, 500),
    items,
  };
  const activityDescription = optionalText(session.activityDescription, 4000);
  if (activityDescription) setup.activityDescription = activityDescription;
  return setup;
}

function canonicalSetup(setup) {
  return {
    ...setup,
    activityDescription: optionalText(setup.activityDescription, 4000),
    items: setup.items.map((item) => ({ ...item, description: optionalText(item.description, 2000) })),
  };
}

function exerciseIdFor(payload) {
  return `quadrant-${hash(JSON.stringify(payload))}`;
}

function buildUrl(artifact, baseUrl) {
  const encoded = encodeText(JSON.stringify(artifact));
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error('This Quadrant share link is too large. Shorten the setup.');
  const url = new URL(baseUrl, globalThis.location?.href);
  url.hash = `${HASH_KEY}=${encoded}`;
  return url.toString();
}

function validateSetup(payload) {
  return canonicalSetup(setupFromSession(payload));
}

function validatePositions(positions, setup) {
  const expected = new Set(setup.items.map(({ id }) => id));
  const entries = Object.entries(positions ?? {});
  if (entries.length !== expected.size || entries.some(([id, point]) => !expected.has(id)
    || !Number.isFinite(point?.x) || point.x < 0 || point.x > 1
    || !Number.isFinite(point?.y) || point.y < 0 || point.y > 1)) {
    throw new Error('This Quadrant response does not contain one valid placement per option.');
  }
  return Object.fromEntries(entries.map(([id, point]) => [id, { x: point.x, y: point.y }]));
}

export function encodeSetupUrl(session, baseUrl) {
  const payload = setupFromSession(session);
  return buildUrl({ version: VERSION, app: APP, kind: 'setup', exerciseId: exerciseIdFor(payload), payload }, baseUrl);
}

export function encodeResponseUrl(session, { contributor = 'Anonymous', baseUrl } = {}) {
  const setup = setupFromSession(session);
  const exerciseId = exerciseIdFor(setup);
  const positions = validatePositions(session.positions, setup);
  const name = clean(contributor, 120);
  const contributionId = `quadrant-response-${hash(JSON.stringify({ exerciseId, name, positions }))}`;
  return buildUrl({
    version: VERSION,
    app: APP,
    kind: 'response',
    exerciseId,
    contributionId,
    contributor: name,
    setup,
    payload: { positions },
  }, baseUrl);
}

export function decodeShareUrl(value) {
  const url = new URL(value, globalThis.location?.href);
  const encoded = new URLSearchParams(url.hash.slice(1)).get(HASH_KEY);
  if (!encoded) throw new Error('This URL does not contain a Quadrant share.');

  let artifact;
  try {
    artifact = JSON.parse(decodeText(encoded));
  } catch (error) {
    throw new Error('This Quadrant share could not be read.', { cause: error });
  }
  if (artifact?.version !== VERSION || artifact.app !== APP || !['setup', 'response'].includes(artifact.kind)) {
    throw new Error('This is not a supported Quadrant share.');
  }

  if (artifact.kind === 'setup') {
    const payload = validateSetup(artifact.payload);
    if (artifact.exerciseId !== exerciseIdFor(artifact.payload)) throw new Error('This Quadrant setup identity does not match its contents.');
    return { ...artifact, payload };
  }

  const setup = validateSetup(artifact.setup);
  if (artifact.exerciseId !== exerciseIdFor(artifact.setup)) throw new Error('This Quadrant response belongs to an invalid setup.');
  return {
    ...artifact,
    contributor: clean(artifact.contributor, 120),
    contributionId: clean(artifact.contributionId, 200),
    setup,
    payload: { positions: validatePositions(artifact.payload?.positions, setup) },
  };
}

export function buildSlackMessage(artifact, url, { preview = false } = {}) {
  if (artifact.kind === 'setup') {
    return `Quadrant setup: ${artifact.payload.prompt}\nOpen the read-only invitation, then choose Start my response.\n${url}`;
  }
  if (artifact.kind !== 'response') throw new Error('Choose a Quadrant setup or response to share.');

  const lines = [`${artifact.contributor} completed a Quadrant response.`];
  if (preview) {
    const summary = artifact.setup.items.map(({ id, text }) => {
      const point = artifact.payload.positions[id];
      return `${text}: X ${point.x.toFixed(2)}, Y ${point.y.toFixed(2)}`;
    }).join('; ');
    lines.push(`Placement preview: ${summary}`);
    lines.push('Visible results may influence teammates who have not responded yet.');
  } else {
    lines.push('Results are concealed. Send this link privately to the facilitator.');
  }
  lines.push(`[Quadrant response](${url})`);
  return lines.join('\n');
}

export function createCollection(session) {
  const wireSetup = setupFromSession(session);
  return { app: APP, exerciseId: exerciseIdFor(wireSetup), setup: canonicalSetup(wireSetup), responses: [] };
}

export function addResponse(collection, response) {
  const next = structuredClone(collection);
  if (response?.app !== APP || response.kind !== 'response' || response.exerciseId !== next.exerciseId) {
    return { status: 'mismatch', collection: next };
  }
  if (next.responses.some(({ contributionId }) => contributionId === response.contributionId)) {
    return { status: 'duplicate', collection: next };
  }
  next.responses.push(structuredClone(response));
  return { status: 'added', collection: next };
}

export function convergeResponses(collection) {
  const responses = collection?.responses ?? [];
  const items = collection.setup.items.map(({ id, text, description = '' }) => {
    const placements = responses.map(({ contributionId, contributor, payload }) => ({
      contributionId,
      contributor,
      ...payload.positions[id],
    }));
    let disagreement = 0;
    for (let first = 0; first < placements.length; first += 1) {
      for (let second = first + 1; second < placements.length; second += 1) {
        disagreement = Math.max(disagreement, Math.hypot(
          placements[first].x - placements[second].x,
          placements[first].y - placements[second].y,
        ));
      }
    }
    return { id, text, description, placements, disagreement };
  });
  return { app: APP, exerciseId: collection.exerciseId, responseCount: responses.length, items };
}

const APP = 'stack-rank';
const VERSION = 1;
const HASH_KEY = 'stack-rank';
const MAX_ENCODED_LENGTH = 24000;

function clean(value, max = 4000) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error('Shared text is missing or too long.');
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
    throw new Error('This shared Stack Rank link is invalid or too large.');
  }
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function setupFromSession(session) {
  const items = session?.items?.map(({ id, text }) => ({ id: clean(id, 100), text: clean(text, 500) }));
  if (!items || items.length < 2 || items.length > 30 || new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error('A shared Stack Rank setup needs 2–30 uniquely identified items.');
  }
  return { criterion: clean(session.criterion), items };
}

function exerciseIdFor(payload) {
  return `stack-rank-${hash(JSON.stringify(payload))}`;
}

function buildUrl(artifact, baseUrl) {
  const encoded = encodeText(JSON.stringify(artifact));
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error('This Stack Rank share link is too large. Shorten the setup.');
  const url = new URL(baseUrl, globalThis.location?.href);
  url.hash = `${HASH_KEY}=${encoded}`;
  return url.toString();
}

function validateGroups(groups, setup) {
  const expected = new Set(setup.items.map(({ id }) => id));
  const flattened = Array.isArray(groups) ? groups.flat() : [];
  if (!groups?.length || groups.some((group) => !Array.isArray(group) || !group.length)
    || flattened.length !== expected.size || new Set(flattened).size !== expected.size
    || flattened.some((id) => !expected.has(id))) {
    throw new Error('This Stack Rank response does not contain one final rank for every item.');
  }
  return groups.map((group) => [...group]);
}

export function encodeSetupUrl(session, baseUrl) {
  const payload = setupFromSession(session);
  return buildUrl({ version: VERSION, app: APP, kind: 'setup', exerciseId: exerciseIdFor(payload), payload }, baseUrl);
}

export function encodeResponseUrl(session, { contributor = 'Anonymous', baseUrl } = {}) {
  const setup = setupFromSession(session);
  const exerciseId = exerciseIdFor(setup);
  const groups = validateGroups(session.reviewedOrder ?? session.groups, setup);
  const name = clean(contributor, 120);
  const contributionId = `stack-rank-response-${hash(JSON.stringify({ exerciseId, name, groups }))}`;
  return buildUrl({
    version: VERSION,
    app: APP,
    kind: 'response',
    exerciseId,
    contributionId,
    contributor: name,
    setup,
    payload: { groups },
  }, baseUrl);
}

export function decodeShareUrl(value) {
  const url = new URL(value, globalThis.location?.href);
  const encoded = new URLSearchParams(url.hash.slice(1)).get(HASH_KEY);
  if (!encoded) throw new Error('This URL does not contain a Stack Rank share.');

  let artifact;
  try {
    artifact = JSON.parse(decodeText(encoded));
  } catch (error) {
    throw new Error('This Stack Rank share could not be read.', { cause: error });
  }
  if (artifact?.version !== VERSION || artifact.app !== APP || !['setup', 'response'].includes(artifact.kind)) {
    throw new Error('This is not a supported Stack Rank share.');
  }

  if (artifact.kind === 'setup') {
    const payload = setupFromSession(artifact.payload);
    if (artifact.exerciseId !== exerciseIdFor(payload)) throw new Error('This Stack Rank setup identity does not match its contents.');
    return { ...artifact, payload };
  }

  const setup = setupFromSession(artifact.setup);
  if (artifact.exerciseId !== exerciseIdFor(setup)) throw new Error('This Stack Rank response belongs to an invalid setup.');
  return {
    ...artifact,
    contributor: clean(artifact.contributor, 120),
    contributionId: clean(artifact.contributionId, 200),
    setup,
    payload: { groups: validateGroups(artifact.payload?.groups, setup) },
  };
}

export function buildSlackMessage(artifact, url, { preview = false } = {}) {
  if (artifact.kind === 'setup') {
    return `Stack Rank setup: ${artifact.payload.criterion}\nOpen the read-only invitation, then choose Start my response.\n${url}`;
  }
  if (artifact.kind !== 'response') throw new Error('Choose a Stack Rank setup or response to share.');

  const lines = [`${artifact.contributor} completed a Stack Rank response.`];
  if (preview) {
    const byId = new Map(artifact.setup.items.map((item) => [item.id, item.text]));
    const summary = artifact.payload.groups.map((group, index) => `${index + 1}. ${group.map((id) => byId.get(id)).join(' = ')}`).join('; ');
    lines.push(`Ranking preview: ${summary}`);
    lines.push('Visible results may influence teammates who have not responded yet.');
  } else {
    lines.push('Results are concealed. Send this link privately to the facilitator.');
  }
  lines.push(url);
  return lines.join('\n');
}

export function createCollection(session) {
  const setup = setupFromSession(session);
  return { app: APP, exerciseId: exerciseIdFor(setup), setup, responses: [] };
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

function ranksFor(groups) {
  return new Map(groups.flatMap((group, rank) => group.map((id) => [id, rank])));
}

export function convergeResponses(collection) {
  const responses = collection?.responses ?? [];
  const rankings = responses.map(({ contributionId, contributor, payload }) => ({
    contributionId,
    contributor,
    groups: structuredClone(payload.groups),
  }));
  const rankMaps = rankings.map(({ groups }) => ranksFor(groups));
  const inputOrder = new Map(collection.setup.items.map(({ id }, index) => [id, index]));
  const order = collection.setup.items.map(({ id, text }) => ({
    id,
    text,
    averageRank: rankMaps.length ? rankMaps.reduce((sum, ranks) => sum + ranks.get(id), 0) / rankMaps.length : null,
  })).sort((first, second) => (first.averageRank ?? inputOrder.get(first.id)) - (second.averageRank ?? inputOrder.get(second.id))
    || inputOrder.get(first.id) - inputOrder.get(second.id));

  const pairs = [];
  for (let first = 0; first < collection.setup.items.length; first += 1) {
    for (let second = first + 1; second < collection.setup.items.length; second += 1) {
      const left = collection.setup.items[first];
      const right = collection.setup.items[second];
      const outcomes = rankMaps.map((ranks) => Math.sign(ranks.get(left.id) - ranks.get(right.id)));
      const counts = [-1, 0, 1].map((outcome) => outcomes.filter((value) => value === outcome).length);
      const disagreement = outcomes.length ? 1 - Math.max(...counts) / outcomes.length : 0;
      const [leftWins, ties, rightWins] = counts;
      pairs.push({ leftId: left.id, rightId: right.id, disagreement, responseCount: outcomes.length, leftWins, ties, rightWins });
    }
  }

  return { app: APP, exerciseId: collection.exerciseId, responseCount: responses.length, rankings, order, pairs };
}

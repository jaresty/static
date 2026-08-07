const ROOT_KEYS = ['kind', 'options', 'question', 'version', 'x', 'y'];
const AXIS_KEYS = ['high', 'label', 'low'];

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`Unsupported field in ${label}: ${extras[0]}.`);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length) throw new Error(`Missing field in ${label}: ${missing[0]}.`);
}

function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return normalized;
}

function axis(value, label) {
  const source = object(value, label);
  exactKeys(source, AXIS_KEYS, label);
  return {
    label: text(source.label, `${label} label`, 60),
    low: text(source.low, `${label} low endpoint`, 80),
    high: text(source.high, `${label} high endpoint`, 80),
  };
}

export function parseQuadrantDraft(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  } catch {
    throw new Error('Draft must be valid JSON.');
  }
  const source = object(parsed, 'draft');
  exactKeys(source, ROOT_KEYS, 'draft');
  if (source.version !== 1) throw new Error('Unsupported draft version.');
  if (source.kind !== 'quadrant-draft') throw new Error('This is not a Quadrant draft.');
  if (!Array.isArray(source.options) || source.options.length < 2 || source.options.length > 20) throw new Error('Options must contain 2–20 items.');
  const options = source.options.map((option, index) => text(option, `Option ${index + 1}`, 120));
  if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) throw new Error('Options must be unique.');
  return {
    version: 1,
    kind: 'quadrant-draft',
    question: text(source.question, 'Question', 180),
    x: axis(source.x, 'X axis'),
    y: axis(source.y, 'Y axis'),
    options,
  };
}

export function encodeQuadrantDraftFragment(raw, baseUrl) {
  const draft = parseQuadrantDraft(raw);
  const url = new URL(baseUrl);
  url.hash = `draft=${encodeURIComponent(JSON.stringify(draft))}`;
  return url.href;
}

export function decodeQuadrantDraftFragment(value) {
  const hash = value.includes('#') ? value.slice(value.indexOf('#')) : value;
  if (!hash.startsWith('#draft=')) throw new Error('No Quadrant draft was found in this link.');
  return parseQuadrantDraft(decodeURIComponent(hash.slice('#draft='.length)));
}

export function quadrantAiPrompt(baseUrl) {
  return `Help me prepare a local-browser 2×2 decision exercise. If the decision, axes, or options are unclear, ask up to 3 short clarifying questions, then stop and wait for my answers. If everything is clear, create one JSON object, validate the object against the schema below, and derive the link from that exact object. The decoded link and the Fallback JSON must represent exactly the same object. Return two things: (1) a clickable draft link as a Markdown link labeled Open draft, with one uninterrupted, fully materialized URL beginning ${baseUrl}#draft=. Percent-encode the JSON object in the fragment; use a code or runtime tool to generate and verify the URL when available, and never return code or an encoding expression in place of the URL; and (2) the same object under a Fallback JSON heading. Use exactly the keys shown in this schema and replace every example value with exercise-specific content: {"version":1,"kind":"quadrant-draft","question":"The decision","x":{"label":"Criterion","low":"Left endpoint","high":"Right endpoint"},"y":{"label":"Criterion","low":"Bottom endpoint","high":"Top endpoint"},"options":["Option one","Option two"]}. Keep each criterion name to 1–2 short words so it fits the board. Include 2–20 unique concise options, distinct neutral axes, and clear endpoints. Keep option names neutral; do not rank or position the options.`;
}

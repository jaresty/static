const ROOT_KEYS = ['criterion', 'items', 'kind', 'version'];

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

export function parseStackDraft(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  } catch {
    throw new Error('Draft must be valid JSON.');
  }
  const source = object(parsed, 'draft');
  exactKeys(source, ROOT_KEYS, 'draft');
  if (source.version !== 1) throw new Error('Unsupported draft version.');
  if (source.kind !== 'stack-rank-draft') throw new Error('This is not a Stack Rank draft.');
  if (!Array.isArray(source.items) || source.items.length < 2 || source.items.length > 30) throw new Error('Items must contain 2–30 entries.');
  const items = source.items.map((item, index) => text(item, `Item ${index + 1}`, 120));
  if (new Set(items.map((item) => item.toLocaleLowerCase())).size !== items.length) throw new Error('Items must be unique.');
  return {
    version: 1,
    kind: 'stack-rank-draft',
    criterion: text(source.criterion, 'Criterion', 160),
    items,
  };
}

export function encodeStackDraftFragment(raw, baseUrl) {
  const draft = parseStackDraft(raw);
  const url = new URL(baseUrl);
  url.hash = `draft=${encodeURIComponent(JSON.stringify(draft))}`;
  return url.href;
}

export function decodeStackDraftFragment(value) {
  const hash = value.includes('#') ? value.slice(value.indexOf('#')) : value;
  if (!hash.startsWith('#draft=')) throw new Error('No Stack Rank draft was found in this link.');
  return parseStackDraft(decodeURIComponent(hash.slice('#draft='.length)));
}

export function stackAiPrompt(baseUrl) {
  return `Help me prepare a local-browser stack-ranking exercise. If the decision, criterion, or items are unclear, ask up to 3 short clarifying questions, then stop and wait for my answers. If everything is clear, create one JSON object, validate the object against the schema below, and derive the link from that exact object. The decoded link and the Fallback JSON must represent exactly the same object. Return two things: (1) a clickable draft link as a Markdown link labeled Open draft, with one uninterrupted, fully materialized URL beginning ${baseUrl}#draft=. Percent-encode the JSON object in the fragment; use a code or runtime tool to generate and verify the URL when available, and never return code or an encoding expression in place of the URL; and (2) the same object under a Fallback JSON heading. Use exactly the keys shown in this schema and replace every example value with exercise-specific content: {"version":1,"kind":"stack-rank-draft","criterion":"The single rule for deciding which item matters more","items":["Item one","Item two"]}. Include 2–30 unique concise items at comparable scope and one specific neutral criterion. Do not rank the items.`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeQuadrantDraftFragment,
  encodeQuadrantDraftFragment,
  parseQuadrantDraft,
  quadrantAiPrompt,
} from '../2x2-facilitator/ai-draft.mjs';
import {
  decodeStackDraftFragment,
  encodeStackDraftFragment,
  parseStackDraft,
  stackAiPrompt,
} from '../pairwise-ranker/ai-draft.mjs';

const quadrant = {
  version: 1,
  kind: 'quadrant-draft',
  question: 'Which improvements should we prioritize?',
  x: { label: 'Effort', low: 'Lower effort', high: 'Higher effort' },
  y: { label: 'Impact', low: 'Lower impact', high: 'Higher impact' },
  options: ['Improve onboarding', 'Add keyboard shortcuts'],
};
const stack = {
  version: 1,
  kind: 'stack-rank-draft',
  criterion: 'Expected customer impact',
  items: ['Improve onboarding', 'Add keyboard shortcuts'],
};

test('Quadrant accepts only its normalized draft setup projection', () => {
  assert.deepEqual(parseQuadrantDraft(JSON.stringify(quadrant)), quadrant);
});

test('Stack Rank accepts only its normalized draft setup projection', () => {
  assert.deepEqual(parseStackDraft(JSON.stringify(stack)), stack);
});

test('Quadrant rejects identity and working-state fields', () => {
  assert.throws(() => parseQuadrantDraft(JSON.stringify({ ...quadrant, exerciseId: 'forbidden', placements: {} })), /unsupported field/i);
});

test('Stack Rank rejects identity and working-state fields', () => {
  assert.throws(() => parseStackDraft(JSON.stringify({ ...stack, contributionId: 'forbidden', comparisons: [] })), /unsupported field/i);
});

test('fragment links round-trip Unicode drafts independently', () => {
  const q = { ...quadrant, options: ['Café experience', '日本語 support'] };
  const s = { ...stack, items: ['Café experience', '日本語 support'] };
  assert.deepEqual([
    decodeQuadrantDraftFragment(encodeQuadrantDraftFragment(q, 'https://example.test/2x2-facilitator/')),
    decodeStackDraftFragment(encodeStackDraftFragment(s, 'https://example.test/pairwise-ranker/')),
  ], [q, s]);
});

test('Quadrant prompt recommends short criterion names', () => {
  assert.match(quadrantAiPrompt('https://example.test/2x2-facilitator/'), /1–2 short words/);
});

test('canned prompts make clarification a stop-and-wait branch', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => /ask (?:no more than|up to) 3[^.]*questions[^.]*then stop and wait for my answers/i.test(prompt)), true);
});

test('canned prompts require a materialized Markdown link rather than a JavaScript expression', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => /Markdown link/i.test(prompt) && /one uninterrupted, fully materialized URL/i.test(prompt) && !/encodeURIComponent\(/.test(prompt)), true);
});

test('canned prompts require the link and fallback to represent one validated object', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => /validate the object/i.test(prompt) && /derive the link from that exact object/i.test(prompt) && /decoded link and the fallback JSON must represent exactly the same object/i.test(prompt)), true);
});

test('canned prompts treat schema values as examples and require neutral setup content', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => /use exactly the keys shown/i.test(prompt) && /replace every example value/i.test(prompt) && /neutral/i.test(prompt) && /do not (?:rank|position)/i.test(prompt)), true);
});

test('canned prompts avoid privacy overclaims and redundant field blacklists', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => !/private/i.test(prompt) && !/do not include/i.test(prompt)), true);
});

test('canned prompts request a clickable fragment link and fallback JSON', () => {
  const prompts = [quadrantAiPrompt('https://example.test/2x2-facilitator/'), stackAiPrompt('https://example.test/pairwise-ranker/')];
  assert.equal(prompts.every((prompt) => /clickable draft link/i.test(prompt) && /Fallback JSON/i.test(prompt)), true);
});

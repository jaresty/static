import assert from 'node:assert/strict';
import test from 'node:test';

import { createResolution, adjustResolution } from './resolution.mjs';
import {
  createFacilitatorViewArtifact,
  createFacilitatorHandoffArtifact,
  decodeFacilitatorArtifact,
  encodeFacilitatorArtifactUrl,
  facilitatorArtifactJson,
  formatFacilitatorViewMarkdown,
  parseFacilitatorArtifactJson,
  restoreFacilitatorHandoff,
} from './facilitator-share.mjs';

const collection = {
  app: 'quadrant',
  exerciseId: 'quadrant-share-test',
  setup: {
    prompt: 'Which launch should we pursue?',
    activityDescription: 'Use the launch brief when interpreting unfamiliar options.',
    xLabel: 'Value', xLow: 'Lower value', xHigh: 'Higher value',
    yLabel: 'Confidence', yLow: 'Lower confidence', yHigh: 'Higher confidence',
    items: [
      { id: 'item-1', text: 'Pilot', description: 'A limited release to existing customers.' },
      { id: 'item-2', text: 'Launch', description: 'A broad public release.' },
    ],
  },
  responses: [
    { contributionId: 'response-alex', contributor: 'Alex', payload: { positions: { 'item-1': { x: .2, y: .8 }, 'item-2': { x: .7, y: .4 } } } },
    { contributionId: 'response-blair', contributor: 'Blair', payload: { positions: { 'item-1': { x: .8, y: .2 }, 'item-2': { x: .5, y: .9 } } } },
  ],
};

const resolution = adjustResolution(createResolution(collection), 'item-1', { x: .9, y: .7 });

test('view-only facilitator artifacts contain final results but no participant evidence', () => {
  const artifact = createFacilitatorViewArtifact(resolution);
  const serialized = JSON.stringify(artifact);
  assert.equal(artifact.kind, 'facilitator-view');
  assert.equal(artifact.payload.responseCount, 2);
  assert.deepEqual(artifact.payload.items[0].resolved, { x: .9, y: .7 });
  assert.ok(artifact.payload.items[0].disagreement > 0);
  assert.doesNotMatch(serialized, /Alex|Blair|response-alex|response-blair|contributionId|placements|positions/);
});

test('view-only Markdown exports aggregate context without participant evidence', () => {
  const artifact = createFacilitatorViewArtifact(resolution);
  const markdown = formatFacilitatorViewMarkdown(artifact);
  assert.match(markdown, /^# Quadrant facilitator result/m);
  assert.match(markdown, /## Question\n\nWhich launch should we pursue\?/);
  assert.match(markdown, /Use the launch brief when interpreting unfamiliar options\./);
  assert.match(markdown, /\*\*Responses:\*\* 2/);
  assert.match(markdown, /\*\*Value:\*\* Lower value → Higher value/);
  assert.match(markdown, /\*\*Confidence:\*\* Lower confidence → Higher confidence/);
  assert.match(markdown, /### 1\. Pilot[\s\S]*A limited release to existing customers\.[\s\S]*Final position: 90% Value; 70% Confidence/);
  assert.match(markdown, /### 2\. Launch[\s\S]*Final position: 60% Value; 65% Confidence/);
  assert.match(markdown, /Disagreement: 60% spread/);
  assert.match(markdown, /Facilitator adjustment: 50% Value, 50% Confidence → 90% Value, 70% Confidence/);
  assert.doesNotMatch(markdown, /Alex|Blair|response-alex|response-blair|contributionId|individual position/i);
});

test('view-only Markdown omits absent optional and evidence fields', () => {
  const oneResponse = structuredClone(collection);
  oneResponse.setup.activityDescription = '';
  oneResponse.setup.items.forEach((item) => { item.description = ''; });
  oneResponse.responses = [oneResponse.responses[0]];
  const markdown = formatFacilitatorViewMarkdown(createFacilitatorViewArtifact(createResolution(oneResponse)));
  assert.doesNotMatch(markdown, /Use the launch brief|A limited release|A broad public release/);
  assert.doesNotMatch(markdown, /Disagreement:|Facilitator adjustment:/);
});

test('editable handoffs preserve evidence while anonymizing names by default', () => {
  const anonymous = createFacilitatorHandoffArtifact(resolution);
  assert.deepEqual(anonymous.payload.responses.map(({ contributor }) => contributor), ['Participant 1', 'Participant 2']);
  assert.deepEqual(anonymous.payload.responses[0].payload.positions, collection.responses[0].payload.positions);
  assert.doesNotMatch(JSON.stringify(anonymous), /Alex|Blair|response-alex|response-blair/);

  const named = createFacilitatorHandoffArtifact(resolution, { includeNames: true });
  assert.deepEqual(named.payload.responses.map(({ contributor }) => contributor), ['Alex', 'Blair']);
});

test('facilitator artifacts round-trip and handoffs restore an independent editable copy', () => {
  const artifact = createFacilitatorHandoffArtifact(resolution);
  const url = encodeFacilitatorArtifactUrl(artifact, 'https://static.test/2x2-facilitator/');
  const decoded = decodeFacilitatorArtifact(url);
  const restored = restoreFacilitatorHandoff(decoded);
  assert.deepEqual(decoded, artifact);
  assert.deepEqual(restored.collection.responses[0].payload.positions, collection.responses[0].payload.positions);
  assert.deepEqual(restored.resolution.items.map(({ resolved }) => resolved), resolution.items.map(({ resolved }) => resolved));
  restored.resolution.items[0].resolved.x = 0;
  assert.equal(artifact.payload.resolved['item-1'].x, .9);
});

test('oversized handoffs reject links while retaining a downloadable JSON artifact', () => {
  const artifact = createFacilitatorHandoffArtifact(resolution);
  artifact.payload.setup.activityDescription = 'context '.repeat(5000);
  assert.throws(() => encodeFacilitatorArtifactUrl(artifact, 'https://static.test/2x2-facilitator/'), /too large/i);
  assert.deepEqual(parseFacilitatorArtifactJson(facilitatorArtifactJson(artifact)), artifact);
});

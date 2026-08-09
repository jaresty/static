'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getActivePhase, getParticipantGroup, getCountdownClass, encodeSession, decodeSession, getNoteKey, getLLMPrompt } = require('../ls-clock-core.js');

const START_MS = 1_700_000_000_000;
const SESSION = {
  id: 'test-session',
  structure: '1-2-4-All',
  invitation: 'What opportunity hides in our biggest challenge?',
  startTime: START_MS / 1000,
  participants: [
    { name: 'Alice', id: 0 }, { name: 'Bob', id: 1 },
    { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 },
  ],
  phases: [
    { index: 0, name: 'Individual',  duration: 60,  startOffset: 0,   groupSize: 1,   instructions: 'Write silently.',    inheritLocations: false },
    { index: 1, name: 'Pairs',       duration: 120, startOffset: 60,  groupSize: 2,   instructions: 'Share with partner.', inheritLocations: true  },
    { index: 2, name: 'Quartets',    duration: 300, startOffset: 180, groupSize: 4,   instructions: 'Combine ideas.',      inheritLocations: true  },
    { index: 3, name: 'Whole Group', duration: 420, startOffset: 480, groupSize: 999, instructions: 'Share insights.',     inheritLocations: false },
  ],
  groups: {
    0: [
      { phaseIndex: 0, groupIndex: 0, members: [{ name: 'Alice', id: 0 }], location: { type: 'physical', label: 'Seat A', override: false } },
      { phaseIndex: 0, groupIndex: 1, members: [{ name: 'Bob',   id: 1 }], location: { type: 'physical', label: 'Seat B', override: false } },
      { phaseIndex: 0, groupIndex: 2, members: [{ name: 'Carol', id: 2 }], location: { type: 'physical', label: 'Seat C', override: false } },
      { phaseIndex: 0, groupIndex: 3, members: [{ name: 'Dave',  id: 3 }], location: { type: 'physical', label: 'Seat D', override: false } },
    ],
    1: [
      { phaseIndex: 1, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob',   id: 1 }], location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } },
      { phaseIndex: 1, groupIndex: 1, members: [{ name: 'Carol', id: 2 }, { name: 'Dave',  id: 3 }], location: { type: 'url', label: 'Meet B', url: 'https://meet.google.com/bbb', override: false } },
    ],
    2: [
      { phaseIndex: 2, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }, { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }], location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } },
    ],
    3: [
      { phaseIndex: 3, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }, { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }], location: { type: 'url', label: 'Main Room', url: 'https://zoom.us/main', override: false } },
    ],
  },
  plenaryLocation: { type: 'url', label: 'Main Room', url: 'https://zoom.us/main', override: false },
  locationPool: { locations: [], strategy: 'round-robin' },
};

// P1: getActivePhase
test('P1: getActivePhase — returns correct phase by wall-clock time', () => {
  assert.equal(getActivePhase(SESSION, START_MS + 10_000).name, 'Individual');
  assert.equal(getActivePhase(SESSION, START_MS + 90_000).name, 'Pairs');
  assert.equal(getActivePhase(SESSION, START_MS + 250_000).name, 'Quartets');
  assert.equal(getActivePhase(SESSION, START_MS + 500_000).name, 'Whole Group');
  assert.equal(getActivePhase(SESSION, START_MS - 1000), null);
  assert.equal(getActivePhase(SESSION, START_MS + 999_000), null);
});

// P2: getParticipantGroup
test('P2: getParticipantGroup — correct group by phase and name', () => {
  const g0 = getParticipantGroup(SESSION, 0, 'Alice');
  assert.equal(g0.members.length, 1);
  assert.equal(g0.members[0].name, 'Alice');

  const g1 = getParticipantGroup(SESSION, 1, 'Alice');
  assert.ok(g1.members.some(m => m.name === 'Bob'));

  const g1c = getParticipantGroup(SESSION, 1, 'Carol');
  assert.ok(!g1c.members.some(m => m.name === 'Alice'));

  assert.equal(getParticipantGroup(SESSION, 0, 'Zara'), null);
  assert.ok(getParticipantGroup(SESSION, 0, 'alice') !== null); // case-insensitive
});

// P4: getCountdownClass
test('P4: getCountdownClass — correct thresholds', () => {
  assert.equal(getCountdownClass(120), 'normal');
  assert.equal(getCountdownClass(61),  'normal');
  assert.equal(getCountdownClass(60),  'amber');
  assert.equal(getCountdownClass(16),  'amber');
  assert.equal(getCountdownClass(15),  'red');
  assert.equal(getCountdownClass(0),   'red');
});

// P5: encode/decode round-trip
test('P5: encodeSession/decodeSession — lossless round-trip', () => {
  const encoded = encodeSession(SESSION);
  assert.equal(typeof encoded, 'string');
  const decoded = decodeSession(encoded);
  assert.equal(decoded.id, SESSION.id);
  assert.equal(decoded.invitation, SESSION.invitation);
  assert.equal(decoded.startTime, SESSION.startTime);
  assert.equal(decoded.participants.length, SESSION.participants.length);
  assert.equal(decoded.phases.length, SESSION.phases.length);
  assert.equal(decoded.groups[1][0].location.url, SESSION.groups[1][0].location.url);
});

test('P5: decodeSession — returns null on invalid input', () => {
  assert.equal(decodeSession('not-valid-base64!!!'), null);
});

// P6: getNoteKey
test('P6: getNoteKey — includes sessionId, phaseIndex, name', () => {
  const key = getNoteKey('test-session', 1, 'Alice');
  assert.ok(key.includes('test-session'));
  assert.ok(key.includes('Alice'));
  assert.ok(key.includes('1'));
  // Different phases produce different keys
  assert.notEqual(getNoteKey('s', 1, 'Alice'), getNoteKey('s', 2, 'Alice'));
});

// P8: getLLMPrompt
test('P8: getLLMPrompt — contains schema keywords', () => {
  const prompt = getLLMPrompt();
  assert.ok(prompt.length > 200);
  assert.ok(prompt.includes('startTime'));
  assert.ok(prompt.includes('participants'));
  assert.ok(prompt.includes('phases'));
  assert.ok(prompt.includes('MeetingLocation'));
  assert.ok(prompt.includes('JSON'));
});

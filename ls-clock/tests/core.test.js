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
test('P8: getLLMPrompt — contains quick-plan URL keywords', () => {
  const prompt = getLLMPrompt();
  assert.ok(prompt.length > 200);
  assert.ok(prompt.includes('startTime'));
  assert.ok(prompt.includes('participant'));
  assert.ok(prompt.includes('structure'));
  assert.ok(prompt.includes('location'));
  assert.ok(prompt.includes('APP_URL'));
});

test('P-ls-prompt-1: LLM prompt lists every canonical structure by name', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  const prompt = getLLMPrompt();
  assert.ok(Object.keys(STRUCTURES).every(key => prompt.includes(key)));
});

test('P-plan-1a: quick plan requires at least one structure', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(() => compileQuickPlan({ structures: [] }), /at least one structure/i);
});

test('P-plan-1b: quick plan accepts only registered structure keys', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(() => compileQuickPlan({ structures: [{ key: 'Unknown Structure' }] }), /unknown structure/i);
});

test('P-plan-2a: LLM prompt excludes compiled activity collections', () => {
  const prompt = getLLMPrompt();
  assert.equal(['"phases"', '"groups"', '"segments"'].some(field => prompt.includes(field)), false);
});

test('P-plan-2b: LLM prompt excludes mechanical activity fields', () => {
  const prompt = getLLMPrompt();
  assert.equal(['"startOffset"', '"groupSize"', '"instructions"', '"roles"'].some(field => prompt.includes(field)), false);
});

test('P-plan-3a: compiler expands an ordered structure sequence canonically', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({
    structures: [{ key: 'TRIZ' }, { key: '1-2-4-All' }],
    startTime: 1000,
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  assert.deepEqual(session.phases.map(({ index, name, duration, startOffset, groupSize, transitionType }) => ({ index, name, duration, startOffset, groupSize, ...(transitionType ? { transitionType } : {}) })), [
    { index: 0, name: 'Individual', duration: 120, startOffset: 0, groupSize: 1 },
    { index: 1, name: 'Small Group', duration: 900, startOffset: 120, groupSize: 4 },
    { index: 2, name: 'Whole Group', duration: 600, startOffset: 1020, groupSize: 999 },
    { index: 3, name: 'Transition', duration: 120, startOffset: 1620, groupSize: 0, transitionType: 'passing' },
    { index: 4, name: 'Introduction', duration: 60, startOffset: 1740, groupSize: 999 },
    { index: 5, name: 'Individual', duration: 60, startOffset: 1800, groupSize: 1 },
    { index: 6, name: 'Pairs', duration: 120, startOffset: 1860, groupSize: 2 },
    { index: 7, name: 'Quartets', duration: 300, startOffset: 1980, groupSize: 4 },
    { index: 8, name: 'Whole Group', duration: 420, startOffset: 2280, groupSize: 999 },
  ]);
});

test('P-plan-3d: compiler assigns canonical roles for role-based structures', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const troika = compileQuickPlan({ structures: [{ key: 'Troika Consulting' }], participants: ['Alice', 'Bob', 'Carol'] });
  const fishbowl = compileQuickPlan({ structures: [{ key: 'User Experience Fishbowl' }], participants: ['A', 'B', 'C', 'D', 'E', 'F'] });
  assert.deepEqual({
    troikaRounds: [1, 4, 7].map(index => troika.groups[index][0].members.map(member => member.role)),
    fishbowlRoles: fishbowl.groups[0].flatMap(group => group.members.map(member => member.role)),
  }, {
    troikaRounds: [
      ['Client', 'Consultant', 'Consultant'],
      ['Consultant', 'Client', 'Consultant'],
      ['Consultant', 'Consultant', 'Client'],
    ],
    fishbowlRoles: ['User', 'User', 'User', 'User', 'User', 'Observer'],
  });
});

test('P-plan-3c: compiler creates segments for structures and transitions', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({
    structures: [{ key: 'TRIZ' }, { key: '1-2-4-All' }],
    participants: ['Alice'],
  });
  assert.deepEqual(session.segments, [
    { name: 'TRIZ', structureKey: 'TRIZ', phaseIndexStart: 0, phaseIndexEnd: 2 },
    { name: 'Transition', structureKey: null, phaseIndexStart: 3, phaseIndexEnd: 3 },
    { name: '1-2-4-All', structureKey: '1-2-4-All', phaseIndexStart: 4, phaseIndexEnd: 8 },
  ]);
});

test('P-plan-3b: compiler assigns participants, groups, and locations', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({
    structures: [{ key: 'TRIZ' }],
    startTime: 1000,
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  assert.deepEqual({
    participants: session.participants,
    phaseGroupCounts: Object.values(session.groups).map(groups => groups.length),
    smallGroupMembers: session.groups[1][0].members.map(member => member.name),
    smallGroupLocation: session.groups[1][0].location.label,
    wholeGroupLocation: session.groups[2][0].location.label,
  }, {
    participants: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }, { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }],
    phaseGroupCounts: [4, 1, 1],
    smallGroupMembers: ['Alice', 'Bob', 'Carol', 'Dave'],
    smallGroupLocation: 'Room A',
    wholeGroupLocation: 'Main Hall',
  });
});

test('P-plan-4a: compiler rejects inherited object keys as unknown structures', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  Object.prototype.InjectedStructure = { phases: [] };
  try {
    assert.throws(() => compileQuickPlan({ structures: [{ key: 'InjectedStructure' }] }));
  } finally {
    delete Object.prototype.InjectedStructure;
  }
});

test('P-plan-4b: unknown structure errors have a stable code', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  let code;
  try {
    compileQuickPlan({ structures: [{ key: 'Unknown Structure' }] });
  } catch (error) {
    code = error.code;
  }
  assert.equal(code, 'UNKNOWN_STRUCTURE_KEY');
});

test('P-plan-5a: compiler rejects caller-supplied activity mechanics', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(() => compileQuickPlan({ structures: [{ key: 'TRIZ' }], phases: [] }));
});

test('P-plan-5b: activity-mechanics errors have a stable code', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  let code;
  try {
    compileQuickPlan({ structures: [{ key: 'TRIZ' }], phases: [] });
  } catch (error) {
    code = error.code;
  }
  assert.equal(code, 'ACTIVITY_MECHANICS_NOT_ALLOWED');
});

test('P-plan-url-1: quick plans round-trip through bookmarkable URLs', () => {
  const { quickPlanToURL, quickPlanFromURL } = require('../ls-clock-core.js');
  const plan = {
    structures: [{ key: 'TRIZ' }, { key: '1-2-4-All' }],
    invitation: 'How can we improve handoffs?',
    startTime: 1234567890,
    participants: ['Alice', 'Bob'],
    locations: ['https://meet.example/room-a', 'Room B'],
    plenaryLocation: 'Main Hall',
  };
  assert.deepEqual(quickPlanFromURL(quickPlanToURL(plan, 'https://example.test/ls-clock/')), plan);
});

test('P-plan-url-2: LLM prompt requests a one-click setup URL', () => {
  const prompt = getLLMPrompt('https://example.test/ls-clock/');
  assert.deepEqual({
    includesAppURL: prompt.includes('https://example.test/ls-clock/'),
    requestsSetupURL: prompt.includes('Output ONLY the complete setup URL'),
    asksForPastedJSON: prompt.includes('paste the JSON'),
    describesJSONObject: prompt.includes('JSON object'),
  }, { includesAppURL: true, requestsSetupURL: true, asksForPastedJSON: false, describesJSONObject: false });
});

// P-ls-sequence-1: authoritative 1-2-4-All sequence
test('P-ls-sequence-1: 1-2-4-All includes the 1-minute introduction and 1/2/5/7 flow', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  assert.deepEqual(
    STRUCTURES['1-2-4-All'].phases.map(({ name, duration, startOffset }) => ({ name, duration, startOffset })),
    [
      { name: 'Introduction', duration: 60, startOffset: 0 },
      { name: 'Individual', duration: 60, startOffset: 60 },
      { name: 'Pairs', duration: 120, startOffset: 120 },
      { name: 'Quartets', duration: 300, startOffset: 240 },
      { name: 'Whole Group', duration: 420, startOffset: 540 },
    ]
  );
});

// P9: new structures present + Custom absent
test('P9: STRUCTURES — TRIZ, Min Specs, Impromptu Networking present; Custom absent', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  assert.ok('TRIZ' in STRUCTURES, 'TRIZ missing');
  assert.ok('Min Specs' in STRUCTURES, 'Min Specs missing');
  assert.ok('Impromptu Networking' in STRUCTURES, 'Impromptu Networking missing');
  assert.ok(!('Custom' in STRUCTURES), 'Custom should be absent');
  const im = STRUCTURES['Impromptu Networking'];
  assert.equal(im.phases.length, 3);
  assert.ok(im.phases.every(p => p.groupSize === 2));
  const triz = STRUCTURES['TRIZ'];
  assert.equal(triz.phases.length, 3);
  assert.equal(triz.phases[0].groupSize, 1);
  assert.equal(triz.phases[2].groupSize, 999);
  const ms = STRUCTURES['Min Specs'];
  assert.equal(ms.phases.length, 3);
  assert.equal(ms.phases[0].groupSize, 1);
  assert.equal(ms.phases[2].groupSize, 999);
});

// P-loc-1: validateSession warns when location count < groups needed
test('P-loc-1: validateSession warns when locationPool has fewer locations than groups needed', () => {
  const { validateSession } = require('../ls-clock-core.js');
  // 4 participants, groupSize 2 → needs 2 locations; only 1 provided
  const session = {
    id: 'x', startTime: 1700000000,
    participants: [{ name: 'A', id: 0 }, { name: 'B', id: 1 }, { name: 'C', id: 2 }, { name: 'D', id: 3 }],
    phases: [
      { index: 0, name: 'Pairs', duration: 120, startOffset: 0, groupSize: 2, instructions: '', inheritLocations: false }
    ],
    groups: { 0: [] },
    plenaryLocation: { type: 'physical', label: 'Room', url: null, instructions: null, override: false },
    locationPool: { locations: [{ type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa' }], strategy: 'round-robin' }
  };
  const errs = validateSession(session);
  assert.ok(errs.some(e => e.includes('location')), 'should warn about insufficient locations');
});

// P-trans-3: compiler owns transitionType
test('P-trans-3: quick-plan compiler creates passing transitions', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({ structures: [{ key: 'TRIZ' }, { key: 'Min Specs' }], participants: ['A'] });
  assert.equal(session.phases.find(phase => phase.name === 'Transition').transitionType, 'passing');
});

// P-struct-1: new structures present with url fields
test('P-struct-1: Troika, 15% Solutions, Nine Whys, Wicked Questions, Appreciative Interviews, P2P, Fishbowl present with urls', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  const expected = [
    'Troika Consulting',
    '15% Solutions',
    'Nine Whys',
    'Wicked Questions',
    'Appreciative Interviews',
    'Purpose-to-Practice',
    'User Experience Fishbowl',
  ];
  for (const name of expected) {
    assert.ok(name in STRUCTURES, `Missing structure: ${name}`);
    assert.ok(typeof STRUCTURES[name].url === 'string' && STRUCTURES[name].url.startsWith('https://'), `${name} missing valid url`);
    assert.ok(Array.isArray(STRUCTURES[name].phases) && STRUCTURES[name].phases.length > 0, `${name} missing phases`);
  }
});

// P-struct-2: Troika has groupSize 3 phases
test('P-struct-2: Troika Consulting has phases with groupSize 3', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  const troika = STRUCTURES['Troika Consulting'];
  assert.ok(troika.phases.some(p => p.groupSize === 3), 'Troika should have groupSize 3 phases');
});

// P-seg-2: compiler owns segment boundaries
test('P-seg-2: quick-plan compiler calculates segment boundaries', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({ structures: [{ key: 'TRIZ' }], participants: ['A'] });
  assert.deepEqual(session.segments, [{ name: 'TRIZ', structureKey: 'TRIZ', phaseIndexStart: 0, phaseIndexEnd: 2 }]);
});

// P-url-1: all STRUCTURES entries have a url field
test('P-url-1: all STRUCTURES entries have a url field', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  for (const [key, s] of Object.entries(STRUCTURES)) {
    assert.ok(typeof s.url === 'string' && s.url.length > 0, `STRUCTURES['${key}'] missing url`);
    assert.ok(s.url.startsWith('https://'), `STRUCTURES['${key}'].url should start with https://`);
  }
});

// P-role-4: prompt delegates roles to app code
test('P-role-4: getLLMPrompt excludes caller-authored role instructions', () => {
  const prompt = getLLMPrompt();
  assert.equal(prompt.includes('roleInstructions'), false);
});

// P-role-5: validateSession accepts members with role fields
test('P-role-5: validateSession accepts members with role fields', () => {
  const { validateSession } = require('../ls-clock-core.js');
  const session = {
    id: 'x', startTime: 1700000000,
    participants: [{ name: 'A', id: 0 }],
    phases: [{ index: 0, name: 'Solo', duration: 60, startOffset: 0, groupSize: 1, instructions: '', inheritLocations: false }],
    groups: { 0: [{ phaseIndex: 0, groupIndex: 0, members: [{ name: 'A', id: 0, role: 'Client', roleInstructions: 'Lead.' }], location: { type: 'physical', label: 'Room', url: null, instructions: null, override: false } }] },
    plenaryLocation: { type: 'physical', label: 'Room', url: null, instructions: null, override: false },
    locationPool: { locations: [], strategy: 'round-robin' }
  };
  assert.equal(validateSession(session).length, 0);
});

// P10: JSON validateSession
test('P10: validateSession — returns errors for missing required fields', () => {
  const { validateSession } = require('../ls-clock-core.js');
  const errs = validateSession({});
  assert.ok(errs.length > 0, 'should return errors for empty object');
  assert.ok(errs.some(e => e.includes('startTime')), 'should flag missing startTime');
  assert.ok(errs.some(e => e.includes('participants')), 'should flag missing participants');
  assert.ok(errs.some(e => e.includes('phases')), 'should flag missing phases');
  const noErrors = validateSession({
    id: 'x', structure: '1-2-4-All', invitation: 'q',
    startTime: 1700000000,
    participants: [{ name: 'A', id: 0 }],
    phases: [{ index: 0, name: 'Solo', duration: 60, startOffset: 0, groupSize: 1, instructions: '', inheritLocations: false }],
    groups: { 0: [] }, plenaryLocation: { type: 'physical', label: 'Room', url: null, instructions: null, override: false },
    locationPool: { locations: [], strategy: 'round-robin' }
  });
  assert.equal(noErrors.length, 0, 'should return no errors for valid session');
});

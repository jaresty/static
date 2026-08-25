'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getActivePhase, getParticipantGroup, getCountdownClass, encodeSession, decodeSession, getNoteKey, getLLMPrompt, compileQuickPlan, STRUCTURES } = require('../ls-clock-core.js');

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

test('P-invite-compact: self-contained invites are URL-safe, smaller, and preserve every room', () => {
  const session = compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    invitation: 'How should we improve online collaboration?',
    startTime: 1_700_000_000,
    participants: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
    locations: ['https://meet.example/a', 'https://meet.example/b', 'https://meet.example/c'],
    plenaryLocation: 'https://meet.example/main',
  });
  const encoded = encodeSession(session);
  const legacy = Buffer.from(JSON.stringify(session), 'utf8').toString('base64');
  assert.doesNotMatch(encoded, /[+/=]/, 'invite fragment should use URL-safe characters');
  assert.ok(encoded.length < legacy.length * 0.75, `expected compact invite; got ${encoded.length} vs ${legacy.length}`);
  assert.deepEqual(decodeSession(encoded), session);
  assert.deepEqual(
    decodeSession(encoded).locationPool.locations.map(location => location.url || location.label),
    session.locationPool.locations.map(location => location.url || location.label)
  );
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
  assert.ok(prompt.includes('participant'));
  assert.ok(prompt.includes('structure'));
  assert.ok(prompt.includes('location'));
  assert.ok(prompt.includes('APP_URL'));
});

test('P8b: getLLMPrompt keeps the complete URL contract before Gemini’s observed cutoff', () => {
  const prompt = getLLMPrompt('https://jaresty.github.io/static/ls-clock/');
  const guideStart = prompt.indexOf('## Registered structures');
  const openingContract = prompt.slice(0, guideStart);
  assert.ok(prompt.length < 3000, `prompt should fit below the observed 3,092-character cutoff; got ${prompt.length}`);
  assert.ok(guideStart > 0, 'prompt should place a compact URL contract before the structure guide');
  for (const parameter of ['structure=', 'invitation=', 'participant=', 'location=', 'plenary=']) {
    assert.ok(openingContract.includes(parameter), `${parameter} must appear before the structure guide`);
  }
  assert.match(openingContract, /https:\/\/jaresty\.github\.io\/static\/ls-clock\/\?structure=.*&invitation=.*&participant=.*&participant=.*&location=.*&location=.*&plenary=/,
    'opening contract should include one complete repeated-parameter URL template');
  assert.match(openingContract, /RFC 3986/,
    'opening contract should name the strict query-value encoding standard');
  assert.match(openingContract, /\( as %28.*\) as %29/,
    'opening contract should explicitly require encoding parentheses');
});

// P-simplify-1: prompt no longer mentions startTime (site sets it manually)
test('P-simplify-1: getLLMPrompt omits startTime entirely', () => {
  const prompt = getLLMPrompt();
  assert.ok(!/startTime/i.test(prompt), 'prompt should not reference startTime');
  assert.ok(!/unix timestamp/i.test(prompt), 'prompt should not ask for a Unix timestamp');
});

// P-simplify-2: URL param names match quickPlanFromURL (singular, not plural)
test('P-simplify-2: getLLMPrompt uses singular participant= and location= params', () => {
  const prompt = getLLMPrompt();
  assert.ok(prompt.includes('participant='), 'prompt should show participant= param');
  assert.ok(prompt.includes('location='), 'prompt should show location= param');
  assert.ok(!prompt.includes('participants='), 'prompt must not use plural participants= (parser reads getAll("participant"))');
  assert.ok(!prompt.includes('locations='), 'prompt must not use plural locations= (parser reads getAll("location"))');
});

// P-simplify-3: prompt tells the LLM participant names are editable on the site
test('P-simplify-3: getLLMPrompt notes participants can be edited on the site', () => {
  const prompt = getLLMPrompt();
  assert.ok(/edit|adjust|change/i.test(prompt) && /site|app/i.test(prompt),
    'prompt should tell the LLM names can be edited on the site');
});

// P-simplify-4: interview checklist is shorter than the old 7 questions
test('P-simplify-4: getLLMPrompt interview checklist has fewer than 7 questions', () => {
  const prompt = getLLMPrompt();
  const numberedQuestions = (prompt.match(/^\s*\d+\.\s/gm) || []).length;
  assert.ok(numberedQuestions > 0 && numberedQuestions < 7,
    `expected fewer than 7 numbered questions, got ${numberedQuestions}`);
});

// P-rooms-1: interview checklist explicitly asks for breakout rooms and the plenary main room
test('P-rooms-1: getLLMPrompt interview checklist asks for rooms and the plenary main room', () => {
  const prompt = getLLMPrompt();
  // Scope to the interview checklist section (the numbered-question block), not the whole prompt
  const checklist = prompt.slice(
    prompt.indexOf('## Interview checklist'),
    prompt.indexOf('## Registered structures'));
  assert.ok(checklist.length > 0, 'checklist section should exist');
  // Breakout room list question (maps to repeated location=)
  assert.ok(/room|meeting URL|location/i.test(checklist),
    'checklist should ask for the list of available rooms');
  // Plenary / whole-group main room question (maps to plenary=)
  assert.ok(/plenary|whole-group|main/i.test(checklist),
    'checklist should ask for the plenary / main meeting room');
  assert.match(checklist, /without (?:a |the )?host/i,
    'breakout URL guidance should require hostless participant access');
});

// P-rooms-2: editable-on-the-site escape hatch covers all fields (incl. rooms/plenary)
test('P-rooms-2: getLLMPrompt says fields are editable on the site', () => {
  const prompt = getLLMPrompt();
  const editSentence = prompt.split('\n').find(line => /edit/i.test(line) && /site/i.test(line)) || '';
  // Either name rooms/plenary explicitly, or cover them via an "every field" clause
  const namesRoomsAndPlenary = /location|room/i.test(editSentence) && /plenary|main/i.test(editSentence);
  const coversEveryField = /every field|any (field|of them)|all fields/i.test(editSentence);
  assert.ok(namesRoomsAndPlenary || coversEveryField,
    'the editable-on-the-site guidance should cover rooms and plenary (explicitly or via "every field")');
});

// P-interview-1: prompt gates URL emission on having the invitation and at least one participant
test('P-interview-1: getLLMPrompt requires invitation and participants before emitting the URL', () => {
  const prompt = getLLMPrompt();
  // An explicit "do not produce/emit the URL until you have ..." gate naming invitation + participant(s)
  const hasGate = /do not (produce|emit|output|generate)[^.]*url[^.]*(until|before)/i.test(prompt);
  assert.ok(hasGate, 'prompt should forbid emitting the URL until required fields are gathered');
  assert.ok(/invitation/i.test(prompt) && /participant/i.test(prompt),
    'the gate should reference invitation and participants');
});

// P-interview-2: prompt no longer tells the LLM to skip questions it can infer
test('P-interview-2: getLLMPrompt drops the "ask only what you cannot infer" skip-license framing', () => {
  const prompt = getLLMPrompt();
  assert.ok(!/ask only what you cannot infer/i.test(prompt),
    'prompt must not tell the LLM to skip questions it can infer');
  assert.ok(!/ask only what you still need/i.test(prompt),
    'prompt must not tell the LLM to ask only what it still needs');
});

test('P-ls-prompt-1: LLM prompt lists every canonical structure by name', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  const prompt = getLLMPrompt();
  assert.ok(Object.keys(STRUCTURES).every(key => prompt.includes(key)));
});

test('P-ls-prompt-2: LLM prompt explains and justifies every structure choice', () => {
  const prompt = getLLMPrompt();
  const missingDescriptions = Object.entries(STRUCTURES)
    .filter(([, structure]) => !prompt.includes(structure.description))
    .map(([key]) => key);
  assert.deepEqual({
    missingDescriptions,
    intentBased: /justify.*(purpose|intent|outcome)/i.test(prompt),
    ownsMechanics: /app owns.*(mechanics|timing|grouping)/i.test(prompt),
  }, { missingDescriptions: [], intentBased: true, ownsMechanics: true });
});

test('P-plan-1a: quick plan requires at least one structure', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(() => compileQuickPlan({ structures: [] }), /at least one structure/i);
});

test('P-plan-1b: quick plan accepts only registered structure keys', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(() => compileQuickPlan({ structures: [{ key: 'Unknown Structure' }] }), /unknown structure/i);
});

test('P-plan-1c: quick plan rejects duplicate prepared participant names', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  assert.throws(
    () => compileQuickPlan({ structures: [{ key: '1-2-4-All' }], participants: ['Alice Smith', ' alice   smith '] }),
    error => error.code === 'DUPLICATE_PARTICIPANT_NAME' && /unique name/i.test(error.message)
  );
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
  assert.deepEqual(session.phases.filter(phase => phase.groupSize > 0).map(({ name, duration, groupSize }) => ({ name, duration, groupSize })), [
    { name: 'Individual', duration: 120, groupSize: 1 },
    { name: 'Small Group', duration: 900, groupSize: 4 },
    { name: 'Whole Group', duration: 600, groupSize: 999 },
    { name: 'Introduction', duration: 60, groupSize: 999 },
    { name: 'Individual', duration: 60, groupSize: 1 },
    { name: 'Pairs', duration: 240, groupSize: 2 },
    { name: 'Quartets', duration: 480, groupSize: 4 },
    { name: 'Whole Group', duration: 420, groupSize: 999 },
  ]);
});

test('P-plan-3d: compiler assigns canonical roles for role-based structures', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const troika = compileQuickPlan({ structures: [{ key: 'Troika Consulting' }], participants: ['Alice', 'Bob', 'Carol'] });
  const fishbowl = compileQuickPlan({ structures: [{ key: 'User Experience Fishbowl' }], participants: ['A', 'B', 'C', 'D', 'E', 'F'] });
  const troikaRounds = ['Round 1 — Client speaks', 'Round 2 — Client speaks', 'Round 3 — Client speaks']
    .map(name => troika.phases.find(phase => phase.name === name).index);
  const fishbowlPhase = fishbowl.phases.find(phase => phase.groupSize > 0);
  assert.deepEqual({
    troikaRounds: troikaRounds.map(index => troika.groups[index][0].members.map(member => member.role)),
    fishbowlRoles: fishbowl.groups[fishbowlPhase.index].flatMap(group => group.members.map(member => member.role)),
  }, {
    troikaRounds: [
      ['Client', 'Consultant', 'Consultant'],
      ['Consultant', 'Client', 'Consultant'],
      ['Consultant', 'Consultant', 'Client'],
    ],
    fishbowlRoles: ['User', 'User', 'User', 'User', 'User', 'Observer'],
  });
});

test('P-fishbowl-source: Fishbowl links to the current authoritative guidance', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  assert.equal(STRUCTURES['User Experience Fishbowl'].url, 'https://www.liberatingstructures.com/user-experience-fishbowl');
});

test('P-fishbowl-1: Fishbowl accepts three to seven intentionally selected users', () => {
  const { validateFishbowlUserIds } = require('../ls-clock-core.js');
  const outcomes = [3, 7, 2, 8].map(count => {
    try {
      validateFishbowlUserIds(Array.from({ length: count }, (_, id) => id));
      return 'accepted';
    } catch (error) {
      return error.code;
    }
  });
  assert.deepEqual(outcomes, ['accepted', 'accepted', 'FISHBOWL_USER_COUNT', 'FISHBOWL_USER_COUNT']);
});

test('P-plan-3c: compiler creates segments for structures and transitions', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({
    structures: [{ key: 'TRIZ' }, { key: '1-2-4-All' }],
    participants: ['Alice'],
  });
  assert.deepEqual(session.segments, [
    { name: 'TRIZ', structureKey: 'TRIZ', phaseIndexStart: 0, phaseIndexEnd: 4 },
    { name: '1-2-4-All', structureKey: '1-2-4-All', phaseIndexStart: 6, phaseIndexEnd: 14 },
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
  const activityPhases = session.phases.filter(phase => phase.groupSize > 0);
  const smallGroupIndex = session.phases.find(phase => phase.name === 'Small Group').index;
  const wholeGroupIndex = session.phases.find(phase => phase.name === 'Whole Group').index;
  assert.deepEqual({
    participants: session.participants,
    phaseGroupCounts: activityPhases.map(phase => session.groups[phase.index].length),
    smallGroupMembers: session.groups[smallGroupIndex][0].members.map(member => member.name),
    smallGroupLocation: session.groups[smallGroupIndex][0].location.label,
    wholeGroupLocation: session.groups[wholeGroupIndex][0].location.label,
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

test('P-fishbowl-3: quick plans reject caller-authored Fishbowl roles', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  let code;
  try {
    compileQuickPlan({ structures: [{ key: 'User Experience Fishbowl' }], participants: ['A', 'B', 'C'], roles: { User: ['A', 'B', 'C'] } });
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

// P-plan-url-1b: parser tolerates plural newline/comma-joined params from LLMs
test('P-plan-url-1b: quickPlanFromURL accepts plural participants/locations as a fallback', () => {
  const { quickPlanFromURL } = require('../ls-clock-core.js');
  const base = 'https://example.test/ls-clock/';

  // P1/P2: plural newline-joined (the real Gemini failure)
  const nl = quickPlanFromURL(`${base}?structure=1-2-4-All&participants=${encodeURIComponent('Alice\nBob')}&locations=${encodeURIComponent('https://meet.example/a\nRoom B')}`);
  assert.deepEqual(nl.participants, ['Alice', 'Bob']);
  assert.deepEqual(nl.locations, ['https://meet.example/a', 'Room B']);

  // P3: plural comma-joined
  const csv = quickPlanFromURL(`${base}?participants=${encodeURIComponent('Alice,Bob')}`);
  assert.deepEqual(csv.participants, ['Alice', 'Bob']);

  // P4: singular still canonical and wins over plural when both present
  const sing = quickPlanFromURL(`${base}?participant=Carol&participant=Dave&participants=${encodeURIComponent('Alice\nBob')}`);
  assert.deepEqual(sing.participants, ['Carol', 'Dave']);

  // P5: trims whitespace and drops empty entries
  const messy = quickPlanFromURL(`${base}?participants=${encodeURIComponent(' Alice \n\nBob ')}`);
  assert.deepEqual(messy.participants, ['Alice', 'Bob']);
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

// P-ls-sequence-1: online-friendly 1-2-4-All sequence
test('P-ls-sequence-1: 1-2-4-All gives online pairs 4 minutes and quartets 8 minutes', () => {
  const { STRUCTURES } = require('../ls-clock-core.js');
  assert.deepEqual(
    STRUCTURES['1-2-4-All'].phases.map(({ name, duration, startOffset }) => ({ name, duration, startOffset })),
    [
      { name: 'Introduction', duration: 60, startOffset: 0 },
      { name: 'Individual', duration: 60, startOffset: 60 },
      { name: 'Pairs', duration: 240, startOffset: 120 },
      { name: 'Quartets', duration: 480, startOffset: 360 },
      { name: 'Whole Group', duration: 420, startOffset: 840 },
    ]
  );
  assert.equal(STRUCTURES['1-2-4-All'].phases.find(phase => phase.name === 'Pairs').midpointCue, true);
  assert.equal(STRUCTURES['1-2-4-All'].phases.find(phase => phase.name === 'Quartets').midpointCue, true);
});

test('P-group-balance: non-solo breakout phases never strand a remainder participant', () => {
  const { assignGroups } = require('../ls-clock-core.js');
  const participants = ['A', 'B', 'C', 'D', 'E'].map((name, id) => ({ name, id }));
  const groups = assignGroups(participants, [
    { index: 0, groupSize: 2, inheritLocations: false },
    { index: 1, groupSize: 4, inheritLocations: true },
  ], { locations: [{ type: 'physical', label: 'Room A' }, { type: 'physical', label: 'Room B' }], strategy: 'round-robin' });
  assert.deepEqual(groups[0].map(group => group.members.length), [3, 2]);
  assert.deepEqual(groups[1].map(group => group.members.length), [5]);
  assert.ok(Object.values(groups).flat().every(group => group.members.length >= 2));
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

test('P-space-capacity-1: required spaces equal peak simultaneous non-solo breakout groups', () => {
  const { getRequiredMeetingSpaceCount } = require('../ls-clock-core.js');
  const phases = [
    { groupSize: 1 },
    { groupSize: 2 },
    { groupSize: 4 },
    { groupSize: 999 },
  ];
  const observed = typeof getRequiredMeetingSpaceCount === 'function'
    ? getRequiredMeetingSpaceCount(8, phases)
    : null;
  assert.equal(observed, 4);
});

test('P-space-capacity-2: solo groups do not consume meeting spaces', () => {
  const { assignGroups } = require('../ls-clock-core.js');
  const groups = assignGroups(
    [{ name: 'A', id: 0 }, { name: 'B', id: 1 }],
    [{ index: 0, groupSize: 1, inheritLocations: false }],
    { locations: [{ type: 'physical', label: 'Room A' }], strategy: 'round-robin' }
  );
  assert.deepEqual(groups[0].map(group => group.location), [
    { type: 'solo', label: 'No meeting space needed', url: null, instructions: null, override: false },
    { type: 'solo', label: 'No meeting space needed', url: null, instructions: null, override: false },
  ]);
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

test('P-trans-default: quick-plan passing time defaults to one minute', () => {
  const session = compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  const passing = session.phases.filter(phase => phase.transitionType === 'passing');
  assert.ok(passing.length > 0);
  assert.ok(passing.every(phase => phase.duration === 60));
});

// P-trans-3: compiler owns transitionType
test('P-trans-3: quick-plan compiler creates passing transitions', () => {
  const { compileQuickPlan } = require('../ls-clock-core.js');
  const session = compileQuickPlan({ structures: [{ key: 'TRIZ' }, { key: 'Min Specs' }], participants: ['A'] });
  assert.equal(session.phases.find(phase => phase.transitionType === 'passing').transitionType, 'passing');
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
  assert.deepEqual(session.segments, [{ name: 'TRIZ', structureKey: 'TRIZ', phaseIndexStart: 0, phaseIndexEnd: 4 }]);
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
test('P-passing-authority: quick plans use defaults and reject transition mechanics', () => {
  const basePlan = { structures: [{ key: '1-2-4-All' }], participants: ['Alice', 'Bob'] };
  const session = compileQuickPlan(basePlan);
  const fields = ['transitionTiming', 'passingSeconds', 'shortBreakSeconds', 'passingMinutes', 'shortBreakMinutes'];
  const rejected = fields.map(field => {
    try {
      compileQuickPlan({ ...basePlan, [field]: 5 });
      return false;
    } catch (error) {
      return error.code === 'ACTIVITY_MECHANICS_NOT_ALLOWED';
    }
  });
  assert.deepEqual({ defaults: session.transitionTiming, rejected }, {
    defaults: { passingSeconds: 60, shortBreakSeconds: 30 },
    rejected: [true, true, true, true, true],
  });
});

test('P-passing-classification: changed 1-2-4-All groups or rooms receive passing time', () => {
  const session = compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  const fingerprint = phase => JSON.stringify((session.groups[phase.index] || []).map(group => ({
    members: group.members.map(member => member.id).sort((a, b) => a - b),
    location: group.location.label,
  })));
  const passing = session.phases.filter(phase => phase.transitionType === 'passing');
  const crossStructure = compileQuickPlan({
    structures: [{ key: 'TRIZ' }, { key: 'Impromptu Networking' }],
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  const roundOnePosition = crossStructure.phases.findIndex(phase => phase.name === 'Round 1');
  assert.deepEqual({
    count: passing.length,
    allChangeGroupOrRoom: passing.every(transition => {
      const position = session.phases.indexOf(transition);
      return fingerprint(session.phases[position - 1]) !== fingerprint(session.phases[position + 1]);
    }),
    crossStructureType: crossStructure.phases[roundOnePosition - 1].transitionType,
  }, { count: 4, allChangeGroupOrRoom: true, crossStructureType: 'passing' });
});

test('P-short-break-classification: unchanged Troika groups and rooms receive short breaks', () => {
  const session = compileQuickPlan({
    structures: [{ key: 'Troika Consulting' }],
    participants: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  const fingerprint = phase => JSON.stringify((session.groups[phase.index] || []).map(group => ({
    members: group.members.map(member => member.id).sort((a, b) => a - b),
    location: group.location.label,
  })));
  const shortBreaks = session.phases.filter(phase => phase.transitionType === 'short-break');
  const crossStructure = compileQuickPlan({
    structures: [{ key: 'TRIZ' }, { key: '1-2-4-All' }],
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  const introductionPosition = crossStructure.phases.findIndex(phase => phase.name === 'Introduction');
  assert.deepEqual({
    count: shortBreaks.length,
    allPreserveGroupAndRoom: shortBreaks.every(transition => {
      const position = session.phases.indexOf(transition);
      return fingerprint(session.phases[position - 1]) === fingerprint(session.phases[position + 1]);
    }),
    crossStructureType: crossStructure.phases[introductionPosition - 1].transitionType,
  }, { count: 8, allPreserveGroupAndRoom: true, crossStructureType: 'short-break' });
});

test('P-passing-duration: compiled transitions consistently use session-wide class durations', () => {
  const session = compileQuickPlan({
    structures: [{ key: '1-2-4-All' }, { key: 'Troika Consulting' }],
    invitation: 'What should we try?',
    participants: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'],
    locations: ['Room A', 'Room B', 'Room C'],
    plenaryLocation: 'Main Hall',
  });
  const passing = session.phases.filter(phase => phase.transitionType === 'passing');
  const shortBreaks = session.phases.filter(phase => phase.transitionType === 'short-break');
  assert.deepEqual({
    transitionTiming: session.transitionTiming,
    passingDurations: [...new Set(passing.map(phase => phase.duration))],
    shortBreakDurations: [...new Set(shortBreaks.map(phase => phase.duration))],
  }, {
    transitionTiming: { passingSeconds: 60, shortBreakSeconds: 30 },
    passingDurations: [60],
    shortBreakDurations: [30],
  });
});

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

const { test, expect } = require('@playwright/test');

const SESSION = {
  id: 'test-session',
  structure: '1-2-4-All',
  invitation: 'Test invitation',
  startTime: 1_700_000_000,
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
      { phaseIndex: 1, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }],   location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } },
      { phaseIndex: 1, groupIndex: 1, members: [{ name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }],  location: { type: 'url', label: 'Meet B', url: 'https://meet.google.com/bbb', override: false } },
    ],
    2: [
      { phaseIndex: 2, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }, { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }], location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } },
    ],
    3: [
      { phaseIndex: 3, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }, { name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }], location: { type: 'url', label: 'Main', url: 'https://zoom.us/main', override: false } },
    ],
  },
  plenaryLocation: { type: 'url', label: 'Main', url: 'https://zoom.us/main', override: false },
  locationPool: { locations: [], strategy: 'round-robin' },
};

// 90s in = Pairs phase active
const NOW_PAIRS = (SESSION.startTime + 90) * 1000;

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixture.html');
});

// P3: location element is first in DOM, before group-members
test('P3: location element appears before group-members in participant view', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });

  const locationEl = page.locator('[data-role="location"]');
  const membersEl = page.locator('[data-role="group-members"]');

  await expect(locationEl).toBeVisible();
  await expect(membersEl).toBeVisible();

  // P3: location is before group-members in DOM order
  const order = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-role]'));
    const roles = all.map(el => el.getAttribute('data-role'));
    return { locationIdx: roles.indexOf('location'), membersIdx: roles.indexOf('group-members') };
  });
  expect(order.locationIdx).toBeLessThan(order.membersIdx);

  // URL location renders as a link button
  const joinBtn = page.locator('.join-btn');
  await expect(joinBtn).toBeVisible();
  await expect(joinBtn).toHaveText(/Meet A/);
});

// P2: Break phase renders data-role="break", no location, no group-members
test('P2: break phase shows break element, no location, no group-members', async ({ page }) => {
  const BREAK_SESSION = {
    id: 'break-test', structure: '1-2-4-All', invitation: 'Test', startTime: 1_700_000_000,
    participants: [{ name: 'Alice', id: 0 }],
    phases: [{ index: 0, name: 'Break', duration: 600, startOffset: 0, groupSize: 0, instructions: 'Take a break.', inheritLocations: false }],
    groups: { 0: [] },
    plenaryLocation: { type: 'physical', label: 'Main', url: null, instructions: null, override: false },
    locationPool: { locations: [], strategy: 'round-robin' },
  };
  const NOW_BREAK = (BREAK_SESSION.startTime + 10) * 1000;
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: BREAK_SESSION, nowMs: NOW_BREAK });

  const breakEl = page.locator('[data-role="break"]');
  await expect(breakEl).toBeVisible();
  await expect(page.locator('[data-role="location"]')).toHaveCount(0);
  await expect(page.locator('[data-role="group-members"]')).toHaveCount(0);
});

// P7t: overview panel present and expandable
test('P7t: overview panel is present in participant view', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });

  const overview = page.locator('[data-role="overview"]');
  await expect(overview).toHaveCount(1);
});

// P-role-2: member-role element present when role provided
const ROLE_SESSION = {
  ...SESSION,
  groups: {
    ...SESSION.groups,
    1: [
      { phaseIndex: 1, groupIndex: 0, members: [{ name: 'Alice', id: 0, role: 'Client', roleInstructions: 'Lead the conversation.' }, { name: 'Bob', id: 1 }], location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } },
      { phaseIndex: 1, groupIndex: 1, members: [{ name: 'Carol', id: 2 }, { name: 'Dave', id: 3 }], location: { type: 'url', label: 'Meet B', url: 'https://meet.google.com/bbb', override: false } },
    ],
  },
};

test('P-role-2: member-role element present when role provided', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: ROLE_SESSION, nowMs: NOW_PAIRS });
  const roleEl = page.locator('[data-role="member-role"]');
  await expect(roleEl).toHaveCount(1);
  await expect(roleEl).toContainText('Client');
});

// P-role-3: no member-role element when role absent
test('P-role-3: no member-role element when role absent', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });
  await expect(page.locator('[data-role="member-role"]')).toHaveCount(0);
});

// P-trans-1: transition phase renders data-role="transition" with next-location
const TRANSITION_SESSION = {
  id: 'trans-test', structure: '1-2-4-All', invitation: 'Test', startTime: 1_700_000_000,
  participants: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }],
  phases: [
    { index: 0, name: 'Pairs',       duration: 120, startOffset: 0,   groupSize: 2,   instructions: 'Work in pairs.', inheritLocations: false },
    { index: 1, name: 'Passing',     duration: 60,  startOffset: 120, groupSize: 0,   transitionType: 'passing', instructions: 'Move to your next room.', inheritLocations: false },
    { index: 2, name: 'Whole Group', duration: 300, startOffset: 180, groupSize: 999, instructions: 'Join the whole group.', inheritLocations: false },
  ],
  groups: {
    0: [{ phaseIndex: 0, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }], location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false } }],
    1: [],
    2: [{ phaseIndex: 2, groupIndex: 0, members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }], location: { type: 'url', label: 'Main', url: 'https://zoom.us/main', override: false } }],
  },
  plenaryLocation: { type: 'url', label: 'Main', url: 'https://zoom.us/main', override: false },
  locationPool: { locations: [], strategy: 'round-robin' },
};
const NOW_TRANSITION = (TRANSITION_SESSION.startTime + 130) * 1000;

test('P-trans-1: transition phase shows data-role="transition" and next-location', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: TRANSITION_SESSION, nowMs: NOW_TRANSITION });
  await expect(page.locator('[data-role="transition"]')).toHaveCount(1);
  await expect(page.locator('[data-role="next-location"]')).toHaveCount(1);
  await expect(page.locator('[data-role="break"]')).toHaveCount(0);
});

test('P-concept-1a: initial view names the product StructureFlow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'StructureFlow' })).toBeVisible();
});

test('P-concept-1b: initial view explains the product and its audience', async ({ page }) => {
  await page.goto('/');
  const copy = (await page.locator('[data-role="product-intro"]').textContent()).replace(/\s+/g, ' ').trim();
  expect(copy).toBe("A facilitator's live guide for Liberating Structures Plan the structure. Keep every group moving.");
});

test('P-concept-visual: product introduction has clear visual hierarchy', async ({ page }) => {
  await page.goto('/');
  const metrics = await page.evaluate(() => {
    const px = value => Number.parseFloat(value) || 0;
    const title = getComputedStyle(document.querySelector('.app-title'));
    const intro = getComputedStyle(document.querySelector('.product-intro'));
    const tagline = getComputedStyle(document.querySelector('.product-tagline'));
    return {
      documentTitle: document.title,
      titleSize: px(title.fontSize),
      introSpacing: px(intro.marginBottom),
      taglineSize: px(tagline.fontSize),
    };
  });
  expect(metrics).toEqual({ documentTitle: 'StructureFlow — Liberating Structures session runner', titleSize: 32, introSpacing: 24, taglineSize: 18 });
});

test('P-hierarchy-2a: manual setup is open and precedes optional assistance', async ({ page }) => {
  await page.goto('/');
  const hierarchy = await page.evaluate(() => {
    const manual = document.querySelector('.manual-form');
    const assistant = document.querySelector('.llm-section');
    return {
      manualOpen: manual.open,
      manualBeforeAssistant: Boolean(manual.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(hierarchy).toEqual({ manualOpen: true, manualBeforeAssistant: true });
});

test('P-hierarchy-2b: LLM assistance is an optional collapsed disclosure', async ({ page }) => {
  await page.goto('/');
  const assistant = await page.locator('.llm-section').evaluate(element => ({
    isDisclosure: element.tagName === 'DETAILS',
    open: element.open,
  }));
  expect(assistant).toEqual({ isDisclosure: true, open: false });
});

test('P-hierarchy-option: optional assistance stays visible near the start of manual setup', async ({ page }) => {
  await page.goto('/');
  const placement = await page.evaluate(() => {
    const manual = document.querySelector('.manual-form');
    const assistant = document.querySelector('.llm-section');
    const firstStep = document.querySelector('#structure-sequence').closest('.setup-section');
    return {
      insideManual: manual.contains(assistant),
      beforeFirstStep: Boolean(assistant.compareDocumentPosition(firstStep) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(placement).toEqual({ insideManual: true, beforeFirstStep: true });
});

// P-sample-1: sample setup action is visible
test('P-sample-1: manual setup offers a visible sample action', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await expect(page.getByRole('button', { name: 'Load sample setup' })).toBeVisible();
});

test('P-sample-2: sample action fills every field using the selected structure defaults', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('TRIZ');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  const startTime = await page.locator('#start-time-input').inputValue();
  expect({
    structure: await page.locator('#structure-select').inputValue(),
    invitation: await page.locator('#invitation-input').inputValue(),
    hasFutureStart: new Date(startTime).getTime() > Date.now(),
    participants: await page.locator('#participants-input').inputValue(),
    locations: await page.locator('#locations-input').inputValue(),
    plenary: await page.locator('#plenary-input').inputValue(),
  }).toEqual({
    structure: 'TRIZ',
    invitation: 'What could we do to make this problem worse? Now, how do we do the opposite?',
    hasFutureStart: true,
    participants: 'Alice\nBob\nCarol\nDave',
    locations: 'Room A\nRoom B',
    plenary: 'Main Hall',
  });
});

test('P-plan-6a: manual generation preserves its session output', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('TRIZ');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  await page.getByRole('button', { name: 'Generate session URL' }).click();
  const url = await page.locator('#session-url-output').inputValue();
  const encoded = new URL(url).hash.slice(1);
  const session = await page.evaluate(value => decodeSession(value), encoded);
  expect({
    structure: session.structure,
    participants: session.participants.map(participant => participant.name),
    phases: session.phases.map(phase => phase.name),
    plenaryLocation: session.plenaryLocation.label,
  }).toEqual({
    structure: 'TRIZ',
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    phases: ['Individual', 'Small Group', 'Whole Group'],
    plenaryLocation: 'Main Hall',
  });
});

test('P-plan-6b: manual setup preserves its functional controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  expect(await page.locator('#load-sample-btn, #structure-select, #invitation-input, #start-time-input, #participants-input, #locations-input, #plenary-input, #add-structure-btn, #generate-btn, #copy-url-btn').count()).toBe(10);
});

test('P-plan-url-3: bookmarked quick-plan URL compiles automatically on load', async ({ page }) => {
  await page.goto('/?structure=TRIZ&invitation=How%20can%20we%20improve%20handoffs%3F&startTime=2000000000&participant=Alice&participant=Bob&participant=Carol&participant=Dave&location=Room%20A&location=Room%20B&plenary=Main%20Hall');
  expect({
    previewVisible: await page.locator('#preview-section').isVisible(),
    structure: await page.locator('[data-role="preview-structure"]').textContent(),
    phaseCount: await page.locator('[data-role="preview-phases"]').textContent(),
    pasteFieldCount: await page.locator('#json-input').count(),
    manualOpen: await page.locator('details.manual-form').evaluate(element => element.open),
    manualInvitation: await page.locator('#invitation-input').inputValue(),
    manualParticipants: await page.locator('#participants-input').inputValue(),
    remainsBookmarkable: page.url().includes('structure=TRIZ'),
  }).toEqual({
    previewVisible: true,
    structure: 'TRIZ',
    phaseCount: '3 phases',
    pasteFieldCount: 0,
    manualOpen: true,
    manualInvitation: 'How can we improve handoffs?',
    manualParticipants: 'Alice\nBob\nCarol\nDave',
    remainsBookmarkable: true,
  });
});

test('P-preserve-3b: bookmarks and manual generation retain their outputs', async ({ page }) => {
  await page.goto('/?structure=TRIZ&invitation=How%20can%20we%20improve%20handoffs%3F&startTime=2000000000&participant=Alice&participant=Bob&participant=Carol&participant=Dave&location=Room%20A&location=Room%20B&plenary=Main%20Hall');
  const bookmark = {
    structure: await page.locator('[data-role="preview-structure"]').textContent(),
    participants: await page.locator('#participants-input').inputValue(),
    plenary: await page.locator('#plenary-input').inputValue(),
  };
  await page.goto('/');
  await page.locator('#structure-select').selectOption('TRIZ');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  await page.getByRole('button', { name: 'Generate session URL' }).click();
  const generatedURL = await page.locator('#session-url-output').inputValue();
  const session = await page.evaluate(value => decodeSession(value), new URL(generatedURL).hash.slice(1));
  expect({ bookmark, generated: { structure: session.structure, phases: session.phases.map(phase => phase.name) } }).toEqual({
    bookmark: { structure: 'TRIZ', participants: 'Alice\nBob\nCarol\nDave', plenary: 'Main Hall' },
    generated: { structure: 'TRIZ', phases: ['Individual', 'Small Group', 'Whole Group'] },
  });
});

test('P-setup-space-1: setup cards and control groups have breathing room', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#add-structure-btn').click();
  const metrics = await page.evaluate(() => {
    const px = value => Number.parseFloat(value) || 0;
    const manual = getComputedStyle(document.querySelector('.manual-form'));
    const quickSet = getComputedStyle(document.querySelector('.quick-set-row'));
    const structureRow = getComputedStyle(document.querySelector('.structure-row'));
    const description = getComputedStyle(document.querySelector('[data-role="structure-description"]'));
    const transition = getComputedStyle(document.querySelector('.structure-break-row'));
    const copyButton = getComputedStyle(document.querySelector('#copy-prompt-btn'));
    return {
      manualPadding: px(manual.paddingTop),
      quickSetGap: px(quickSet.gap),
      structureRowGap: px(structureRow.gap),
      descriptionMargin: px(description.marginBottom),
      transitionMargin: px(transition.marginBottom),
      buttonHeight: px(copyButton.minHeight),
    };
  });
  expect(metrics).toEqual({ manualPadding: 20, quickSetGap: 8, structureRowGap: 12, descriptionMargin: 12, transitionMargin: 12, buttonHeight: 42 });
});

// P-seq-1: add-structure button present in setup
test('P-seq-1: add-structure button present in setup page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-role="add-structure-btn"]')).toHaveCount(1);
});

// P-map-1: overview map shows all groups for active phase
test('P-map-1: overview panel contains map of all groups for active phase', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });
  const map = page.locator('[data-role="overview-map"]');
  await expect(map).toHaveCount(1);
  // Should contain both groups from Pairs phase
  await expect(map).toContainText('Alice');
  await expect(map).toContainText('Carol');
});

// P-preview-1: facilitator preview shows phase groups detail
test('P-preview-1: facilitator preview shows group details', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ session }) => {
    showSessionPreview(session);
  }, { session: SESSION });
  const preview = page.locator('[data-role="preview"]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-role="preview-groups"]')).toHaveCount(1);
});

// P-name-1: name input has datalist with participant names
test('P-name-1: name entry has datalist populated with participant names', async ({ page }) => {
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/#${encoded}`);
  const datalist = page.locator('[data-role="name-suggestions"]');
  await expect(datalist).toHaveCount(1);
  const options = datalist.locator('option');
  await expect(options).toHaveCount(SESSION.participants.length);
});

// P-copy-1: copy-notes button present in participant view
test('P-copy-1: copy-notes button present in participant view', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });
  await expect(page.locator('[data-role="copy-notes"]')).toHaveCount(1);
});

// P-seg-1: segment headers rendered in timeline when segments present
const SEGMENTED_SESSION = {
  ...SESSION,
  segments: [
    { name: '1-2-4-All', structureKey: '1-2-4-All', phaseIndexStart: 0, phaseIndexEnd: 3 },
  ],
};

test('P-seg-1: segment header rendered in phase timeline', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderPhaseTimeline(container, session, nowMs);
  }, { session: SEGMENTED_SESSION, nowMs: NOW_PAIRS });
  const headers = page.locator('[data-role="segment-header"]');
  await expect(headers).toHaveCount(1);
  await expect(headers.first()).toContainText('1-2-4-All');
});

// P-ls-desc-1: selected structure shows its authoritative purpose
test('P-ls-desc-1: selected structure shows its purpose', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.isVisible() ? await description.textContent() : '').toContain('Engage everyone simultaneously in generating questions, ideas, and suggestions');
});

test('P-ls-desc-2: selected structure shows its approximate duration', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.textContent()).toContain('About 15 minutes');
});

test('P-ls-desc-3: selected structure shows its group configuration', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.textContent()).toContain('Alone → pairs → quartets → whole group');
});

// P-url-2: learn-more link present after structure selection
test('P-url-2: learn-more link present after structure selection', async ({ page }) => {
  await page.goto('/');
  await page.locator('details.manual-form').evaluate(el => el.open = true);
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const link = page.locator('[data-role="learn-more"]');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /liberatingstructures\.com/);
});

// P-start-1: default start time is approx now+2min
test('P-start-1: default start time input is approx now+2min', async ({ page }) => {
  await page.goto('/');
  const val = await page.locator('#start-time-input').inputValue();
  const parsed = new Date(val).getTime();
  const expected = Date.now() + 2 * 60 * 1000;
  expect(Math.abs(parsed - expected)).toBeLessThan(70000);
});

// P-start-2: quick-set buttons present
test('P-start-2: quick-set buttons present', async ({ page }) => {
  await page.goto('/');
  const btns = page.locator('[data-role="start-quick-set"]');
  await expect(btns).toHaveCount(4);
  await expect(btns.nth(0)).toContainText('Start now');
  await expect(btns.nth(3)).toContainText('In 5 min');
});

// P-start-3: datetime picker present
test('P-start-3: datetime picker input present', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#start-time-input')).toBeAttached();
});

// P7: phase timeline — elapsed checked, active highlighted, upcoming plain
test('P7: phase timeline marks elapsed, active, and upcoming phases correctly', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderPhaseTimeline(container, session, nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });

  const items = page.locator('[data-phase-index]');
  await expect(items).toHaveCount(SESSION.phases.length);

  // phase 0 (Individual) elapsed at 90s
  const phase0 = page.locator('[data-phase-index="0"]');
  await expect(phase0).toHaveClass(/elapsed/);
  await expect(phase0).not.toHaveClass(/active/);

  // phase 1 (Pairs) active at 90s
  const phase1 = page.locator('[data-phase-index="1"]');
  await expect(phase1).toHaveClass(/active/);
  await expect(phase1).not.toHaveClass(/elapsed/);

  // phase 2 (Quartets) not yet started
  const phase2 = page.locator('[data-phase-index="2"]');
  await expect(phase2).not.toHaveClass(/active/);
  await expect(phase2).not.toHaveClass(/elapsed/);
});

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

test('setup warns that breakout URLs must work without the host', async ({ page }) => {
  const guidance = await page.locator('[data-role="meeting-spaces"] .hint').textContent();
  expect(guidance).toMatch(/verify in advance/i);
  expect(guidance).toMatch(/every participant/i);
  expect(guidance).toMatch(/without the host/i);
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

test('active steps preview the next activity assignment', async ({ page }) => {
  const nowMs = (SESSION.startTime + 30) * 1000;
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: SESSION, nowMs });

  const preview = page.locator('[data-role="up-next"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Up next');
  await expect(preview).toContainText('Pairs');
  await expect(preview).toContainText('Starts in 0:30');
  await expect(preview.locator('[data-role="up-next-movement"]')).toContainText('Move to Meet A');
  await expect(preview.locator('[data-role="up-next-group"]')).toContainText('Alice (you), Bob');
  await expect(preview.locator('[data-role="up-next-location"]')).toContainText('Meet A');
});

test('final activity steps omit the Up next preview', async ({ page }) => {
  const nowMs = (SESSION.startTime + 500) * 1000;
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: SESSION, nowMs });
  await expect(page.locator('[data-role="up-next"]')).toHaveCount(0);
});

test('Up next preview fits a 390px participant viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const nowMs = (SESSION.startTime + 30) * 1000;
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: SESSION, nowMs });
  const metrics = await page.locator('[data-role="up-next"]').evaluate(element => ({
    cardWidth: element.getBoundingClientRect().width,
    viewportWidth: document.documentElement.clientWidth,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  expect(metrics.cardWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.pageOverflow).toBe(false);
});

test('resilient companion keeps timing visible and exposes the next-room link', async ({ page }) => {
  const liveSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) - 30 };
  const encoded = await page.evaluate(session => encodeSession(session), liveSession);
  await page.goto(`/#${encoded}`);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();

  await expect(page.locator('[data-role="countdown"]')).toHaveCSS('position', 'sticky');
  await expect(page).toHaveTitle(/0:2\d · Individual · LS Clock/);
  const nextLink = page.locator('[data-role="up-next-location"] a');
  await expect(nextLink).toHaveAttribute('href', 'https://meet.google.com/aaa');
  await expect(nextLink).toContainText('Join Meet A');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('long meeting URL labels do not overflow the mobile participant view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const session = await page.evaluate(() => compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    invitation: 'Test',
    startTime: Math.floor(Date.now() / 1000) - 250,
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['https://meet.google.com/aaa-bbbb-cccc', 'https://meet.google.com/ddd-eeee-ffff'],
    plenaryLocation: 'https://meet.google.com/main-room',
  }));
  const encoded = await page.evaluate(value => encodeSession(value), session);
  await page.goto(`/?name=Alice#${encoded}`);
  await expect(page.locator('.join-btn')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('participant alerts arm on the first interaction without a dedicated enable action', async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioStarts = 0;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    window.__advanceClock = value => { now = value; };
    class FakeAudioContext {
      createOscillator() { return { connect() {}, start() { window.__audioStarts += 1; }, stop() {}, frequency: { value: 0 }, type: '' }; }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      resume() { return Promise.resolve(); }
      get currentTime() { return 0; }
      get destination() { return {}; }
    }
    window.AudioContext = FakeAudioContext;
  });
  await page.reload();
  await page.evaluate(session => startParticipantClock(document.getElementById('app'), session, 'Alice'), {
    ...SESSION,
    startTime: 1_700_000_001,
  });
  await expect(page.getByRole('button', { name: /enable alerts/i })).toHaveCount(0);
  await page.locator('.participant-view').click();
  await page.evaluate(() => window.__advanceClock(1_700_000_002_000));
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.__audioStarts)).toBe(1);
});

test('floating timer stays closed until explicitly opened and toggles predictably', async ({ page }) => {
  await page.addInitScript(() => {
    window.__pipRequested = 0;
    window.__pipClosed = 0;
    window.__pipPageHide = null;
    const pipDocument = document.implementation.createHTMLDocument('');
    const pipWindow = {
      document: pipDocument,
      closed: false,
      addEventListener(type, listener) { if (type === 'pagehide') window.__pipPageHide = listener; },
      close() { this.closed = true; window.__pipClosed += 1; window.__pipPageHide?.(); },
    };
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: { requestWindow: async () => { window.__pipRequested += 1; pipWindow.closed = false; return pipWindow; }, window: null },
    });
  });
  await page.reload();
  const futureSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) + 600 };
  const encoded = await page.evaluate(session => encodeSession(session), futureSession);
  await page.goto(`/?pip=explicit#${encoded}`);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();

  expect(await page.evaluate(() => window.__pipRequested)).toBe(0);
  await expect(page).toHaveTitle(/Starts in · LS Clock/);
  const toggle = page.locator('[data-role="companion-controls"] button');
  await expect(toggle).toHaveText('Open floating timer');
  await toggle.click();
  expect(await page.evaluate(() => window.__pipRequested)).toBe(1);
  await expect(toggle).toHaveText('Close floating timer');
  expect(await page.evaluate(() => documentPictureInPicture.window?.document.body.textContent || '')).toMatch(/Starts in.*Individual.*Write silently\..*Seat A.*Alice \(you\)/s);

  await toggle.click();
  expect(await page.evaluate(() => window.__pipClosed)).toBe(1);
  await expect(toggle).toHaveText('Open floating timer');

  await toggle.click();
  await page.evaluate(() => window.__pipPageHide?.());
  await expect(toggle).toHaveText('Open floating timer');
});

test('floating timer separates current guidance from the next assignment', async ({ page }) => {
  await page.addInitScript(() => {
    const pipDocument = document.implementation.createHTMLDocument('');
    const pipWindow = { document: pipDocument, closed: false, addEventListener() {}, close() { this.closed = true; } };
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: { requestWindow: async () => pipWindow, window: null },
    });
  });
  await page.reload();
  const liveSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) - 30 };
  await page.evaluate(session => startParticipantClock(document.getElementById('app'), session, 'Alice'), liveSession);
  await page.getByRole('button', { name: 'Open floating timer' }).click();
  expect(await page.evaluate(() => documentPictureInPicture.window?.document.body.textContent || '')).toMatch(/Now · Individual.*Write silently\..*Up next · Pairs.*Share with partner\..*Meet A.*Alice \(you\).*Bob/s);
});

test('floating timer control is omitted when Picture-in-Picture is unsupported', async ({ page }) => {
  await page.evaluate(() => { delete window.documentPictureInPicture; });
  await page.evaluate(session => startParticipantClock(document.getElementById('app'), session, 'Alice'), SESSION);
  await expect(page.getByRole('button', { name: /floating timer/i })).toHaveCount(0);
});

test('main-room fallback is actionable throughout session pages', async ({ page }) => {
  const encoded = await page.evaluate(session => encodeSession(session), SESSION);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#${encoded}`);
  await expect(page.getByRole('link', { name: /main room/i })).toHaveAttribute('href', 'https://zoom.us/main');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  await expect(page.getByRole('link', { name: /main room/i })).toHaveAttribute('href', 'https://zoom.us/main');
  await page.goto(`/?role=facilitator#${encoded}`);
  await expect(page.getByRole('link', { name: /main room/i })).toHaveAttribute('href', 'https://zoom.us/main');
});

test('sticky companion controls fit a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(session => startParticipantClock(document.getElementById('app'), session, 'Alice'), SESSION);
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    controlsWidth: document.querySelector('[data-role="companion-controls"]')?.getBoundingClientRect().width || 0,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.overflow).toBe(false);
  expect(metrics.controlsWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});

test('manual setup defaults passing time to one minute', async ({ page }) => {
  await expect(page.locator('#passing-time-input')).toHaveValue('1');
});

test('passing time keeps the next-room URL actionable', async ({ page }) => {
  const passingSession = {
    ...TRANSITION_SESSION,
    groups: {
      ...TRANSITION_SESSION.groups,
      2: [{
        phaseIndex: 2,
        groupIndex: 0,
        members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }],
        location: { type: 'url', label: 'Meet B', url: 'https://meet.google.com/bbb', override: false },
      }],
    },
    plenaryLocation: { type: 'url', label: 'Meet B', url: 'https://meet.google.com/bbb', override: false },
  };
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: passingSession, nowMs: NOW_TRANSITION });
  const link = page.locator('[data-role="next-location"] a');
  await expect(link).toHaveAttribute('href', 'https://meet.google.com/bbb');
  await expect(link).toContainText('Join Meet B');
});

test('same-room passing makes staying put unmistakable', async ({ page }) => {
  const sameRoom = {
    ...TRANSITION_SESSION,
    groups: {
      ...TRANSITION_SESSION.groups,
      2: [{
        phaseIndex: 2,
        groupIndex: 0,
        members: [{ name: 'Alice', id: 0 }, { name: 'Bob', id: 1 }],
        location: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false },
      }],
    },
    plenaryLocation: { type: 'url', label: 'Meet A', url: 'https://meet.google.com/aaa', override: false },
  };
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: sameRoom, nowMs: NOW_TRANSITION });
  const transition = page.locator('[data-role="transition"]');
  await expect(transition.locator('[data-role="transition-action"]')).toHaveText('Stay in this room');
  await expect(transition).not.toContainText('Move to your next room');
  await expect(transition.locator('[data-role="next-location"] a')).toHaveAttribute('href', 'https://meet.google.com/aaa');
});

test('opened session overview stays open across clock ticks', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: SESSION, nowMs: NOW_PAIRS });
  const overview = page.locator('[data-role="overview"]');
  await overview.locator('summary').click();
  await expect(overview).toHaveAttribute('open', '');
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs + 1000);
  }, { session: SESSION, nowMs: NOW_PAIRS });
  await expect(page.locator('[data-role="overview"]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-role="overview"]')).toHaveClass(/overview-panel/);
});

test('participant notes stay continuous across phase changes', async ({ page }) => {
  await page.addInitScript(() => {
    let now = (1_700_000_000 + 30) * 1000;
    Date.now = () => now;
    window.__advanceClock = value => { now = value; };
  });
  await page.reload();
  await page.evaluate(session => startParticipantClock(document.getElementById('app'), session, 'Alice'), SESSION);
  await page.locator('.notes-area').fill('One continuous set of notes');
  await page.evaluate(nextNow => window.__advanceClock(nextNow), (SESSION.startTime + 90) * 1000);
  await page.waitForTimeout(1100);
  await expect(page.locator('.notes-area')).toHaveValue('One continuous set of notes');
  expect(await page.evaluate(session => localStorage.getItem(getNoteKey(session.id, 'session', 'Alice')), SESSION)).toBe('One continuous set of notes');
});

test('P-entry-9a: joined early participants see the start countdown and first assignment', async ({ page }) => {
  const futureSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) + 600 };
  await page.evaluate(({ session, nowMs }) => {
    renderParticipantView(document.getElementById('app'), session, 'Alice', nowMs);
  }, { session: futureSession, nowMs: Date.now() });
  const guidance = page.locator('[data-role="waiting-guidance"]');
  await expect(guidance).toContainText(/starts at/i);
  await expect(guidance).toContainText(/starts in/i);
  await expect(guidance).toContainText('Individual');
  await expect(guidance).toContainText('Seat A');
  await expect(guidance).toContainText('Alice (you)');
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

test('P-role-names: every role-bearing group presentation keeps all member names visible', async ({ page }) => {
  const baseSession = await page.evaluate(() => compileQuickPlan({
    structures: [{ key: 'Troika Consulting' }],
    participants: ['Alice', 'Bob', 'Carol'],
    locations: ['Room A'],
    plenaryLocation: 'Main Hall',
  }));
  const names = ['Alice', 'Bob', 'Carol'];
  const hasAllNames = text => names.every(name => text.includes(name));
  const openSession = async (session, query) => {
    const encoded = await page.evaluate(value => encodeSession(value), session);
    await page.goto(`/?${query}#${encoded}`);
  };

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) + 300 }, 'roles=landing');
  await page.locator('[data-role="landing-session-details"] summary').click();
  const landing = await page.locator('[data-role="landing-session-details"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 450 }, 'roles=current');
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const current = await page.locator('[data-role="group-members"]').textContent();
  const overview = await page.locator('[data-role="overview"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 350 }, 'roles=passing');
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const passing = await page.locator('[data-role="next-group"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 450 }, 'role=facilitator&roles=live');
  const facilitator = await page.locator('.fac-members').allTextContents();

  await page.goto('/?roles=preview');
  await page.evaluate(session => showSessionPreview(session), { ...baseSession, startTime: Math.floor(Date.now() / 1000) + 300 });
  const preview = await page.locator('[data-role="preview-groups"]').textContent();

  expect({
    landing: hasAllNames(landing),
    current: hasAllNames(current),
    overview: hasAllNames(overview),
    passing: hasAllNames(passing),
    facilitator: facilitator.some(hasAllNames),
    preview: hasAllNames(preview),
  }).toEqual({ landing: true, current: true, overview: true, passing: true, facilitator: true, preview: true });
});

test('P-role-transparency: every group presentation shows each member role', async ({ page }) => {
  const baseSession = await page.evaluate(() => compileQuickPlan({
    structures: [{ key: 'Troika Consulting' }],
    participants: ['Alice', 'Bob', 'Carol'],
    locations: ['Room A'],
    plenaryLocation: 'Main Hall',
  }));
  const labels = ['Alice — Client', 'Bob — Consultant', 'Carol — Consultant'];
  const hasAllRoles = text => labels.every(label => text.includes(label));
  const openSession = async (session, query) => {
    const encoded = await page.evaluate(value => encodeSession(value), session);
    await page.goto(`/?${query}#${encoded}`);
  };

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) + 300 }, 'rolemap=landing');
  await page.locator('[data-role="landing-session-details"] summary').click();
  const landing = await page.locator('[data-role="landing-session-details"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 450 }, 'rolemap=current');
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const current = await page.locator('#app').textContent();
  const overview = await page.locator('[data-role="overview"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 350 }, 'rolemap=passing');
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const passing = await page.locator('[data-role="next-group"]').textContent();

  await openSession({ ...baseSession, startTime: Math.floor(Date.now() / 1000) - 450 }, 'role=facilitator&rolemap=live');
  const facilitator = await page.locator('.fac-members').allTextContents();

  await page.goto('/?rolemap=preview');
  await page.evaluate(session => showSessionPreview(session), { ...baseSession, startTime: Math.floor(Date.now() / 1000) + 300 });
  const preview = await page.locator('[data-role="preview-groups"]').textContent();

  await page.goto('/?rolemap=manual');
  await page.locator('#structure-select').selectOption('Troika Consulting');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const manualSession = await page.evaluate(value => decodeSession(new URL(value).hash.slice(1)), await page.locator('#session-url-output').inputValue());
  const manualRound = manualSession.phases.find(phase => phase.name === 'Round 1 — Client speaks');
  const manualLabels = (manualSession.groups[manualRound.index] || []).flatMap(group =>
    group.members.map(member => `${member.name} — ${member.role || ''}`)).join(', ');

  expect({
    landing: hasAllRoles(landing),
    current: hasAllRoles(current),
    overview: hasAllRoles(overview),
    passing: hasAllRoles(passing),
    facilitator: facilitator.some(hasAllRoles),
    preview: hasAllRoles(preview),
    manual: hasAllRoles(manualLabels),
  }).toEqual({ landing: true, current: true, overview: true, passing: true, facilitator: true, preview: true, manual: true });
});

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

test('P-short-break-guidance: short breaks say the group and location stay the same', async ({ page }) => {
  const session = await page.evaluate(() => compileQuickPlan({
    structures: [{ key: 'Troika Consulting' }],
    startTime: Math.floor(Date.now() / 1000) - 430,
    participants: ['Alice', 'Bob', 'Carol'],
    locations: ['Room A'],
    plenaryLocation: 'Main Hall',
  }));
  const encoded = await page.evaluate(value => encodeSession(value), session);
  await page.goto(`/#${encoded}`);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const text = await page.locator('[data-role="break"]').textContent();
  expect({ shortBreak: text.includes('Short break'), stayGuidance: text.includes('Your group and location stay the same.') }).toEqual({ shortBreak: true, stayGuidance: true });
});

test('P-passing-guidance: passing time shows the next step, room, and upcoming group', async ({ page }) => {
  const session = await page.evaluate(() => compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    startTime: Math.floor(Date.now() / 1000) - 70,
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  }));
  const encoded = await page.evaluate(value => encodeSession(value), session);
  await page.goto(`/#${encoded}`);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  const text = await page.locator('[data-role="transition"]').textContent();
  expect({ nextStep: text.includes('Individual'), destination: text.includes('No meeting space needed'), upcomingGroup: text.includes('Alice') }).toEqual({ nextStep: true, destination: true, upcomingGroup: true });
});

test('P-trans-1: transition phase shows data-role="transition" and next-location', async ({ page }) => {
  await page.evaluate(({ session, nowMs }) => {
    const container = document.getElementById('app');
    renderParticipantView(container, session, 'Alice', nowMs);
  }, { session: TRANSITION_SESSION, nowMs: NOW_TRANSITION });
  await expect(page.locator('[data-role="transition"]')).toHaveCount(1);
  await expect(page.locator('[data-role="next-location"]')).toHaveCount(1);
  await expect(page.locator('[data-role="break"]')).toHaveCount(0);
});

test('P-navigation-global: primary views expose Home and Start new session', async ({ page }) => {
  const futureSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) + 300 };
  const liveSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) - 90 };
  const encodedFuture = await page.evaluate(session => encodeSession(session), futureSession);
  const encodedLive = await page.evaluate(session => encodeSession(session), liveSession);
  const states = [];
  const observeNav = async state => {
    states.push(await page.evaluate(name => {
      const nav = document.querySelector('[data-role="global-navigation"]');
      const actions = [...(nav?.querySelectorAll('a') || [])];
      return {
        state: name,
        labels: actions.map(action => action.textContent.trim()),
        cleanTargets: actions.every(action => !new URL(action.href).search && !new URL(action.href).hash),
        accessibleSize: actions.every(action => action.getBoundingClientRect().height >= 44),
      };
    }, state));
  };

  await page.goto('/');
  await observeNav('setup');
  await page.goto(`/?view=landing#${encodedFuture}`);
  await observeNav('landing');
  await page.goto(`/?role=facilitator#${encodedLive}`);
  await observeNav('facilitator');
  await page.goto(`/#${encodedLive}`);
  await page.locator('[data-role="prepared-name"]').selectOption('Alice');
  await page.getByRole('button', { name: 'Join session' }).click();
  await observeNav('live');
  await page.goto('/');
  await page.evaluate(session => showSessionPreview(session), futureSession);
  await observeNav('preview');

  await page.goto(`/?role=facilitator#${encodedLive}`);
  const startNew = page.getByRole('link', { name: 'Start new session' });
  if (await startNew.count()) await startNew.click();
  const destination = await page.evaluate(() => ({ search: location.search, hash: location.hash, setup: Boolean(document.querySelector('#structure-select')) }));

  expect({ states, destination }).toEqual({
    states: [
      { state: 'setup', labels: ['Home', 'Start new session'], cleanTargets: true, accessibleSize: true },
      { state: 'landing', labels: ['Home', 'Start new session', 'Main room'], cleanTargets: true, accessibleSize: true },
      { state: 'facilitator', labels: ['Home', 'Start new session', 'Main room'], cleanTargets: true, accessibleSize: true },
      { state: 'live', labels: ['Home', 'Start new session', 'Main room'], cleanTargets: true, accessibleSize: true },
      { state: 'preview', labels: ['Home', 'Start new session'], cleanTargets: true, accessibleSize: true },
    ],
    destination: { search: '', hash: '', setup: true },
  });
});

test('P-brand-clock: primary entry surfaces use the LS Clock identity', async ({ page }) => {
  await page.goto('/');
  const setup = await page.evaluate(() => ({
    title: document.title,
    heading: document.querySelector('h1')?.textContent || '',
    positioning: document.querySelector('[data-role="product-intro"]')?.textContent || '',
  }));
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/?view=participant#${encoded}`);
  const participant = await page.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent || '',
    positioning: document.querySelector('[data-role="participant-landing"]')?.textContent || '',
  }));
  expect({
    setupTitle: setup.title === 'LS Clock — Liberating Structures session runner',
    setupName: setup.heading === 'LS Clock',
    setupPurpose: setup.positioning.includes('Live timing and guidance for Liberating Structures.'),
    setupPromise: setup.positioning.includes('One shared clock. Every group in sync.'),
    participantName: participant.heading === 'LS Clock',
    participantPurpose: participant.positioning.includes('Live timing and guidance for Liberating Structures.'),
    participantPromise: participant.positioning.includes('One shared clock. Every group in sync.'),
  }).toEqual({ setupTitle: true, setupName: true, setupPurpose: true, setupPromise: true, participantName: true, participantPurpose: true, participantPromise: true });
});

test('P-concept-1a: initial view names the product LS Clock', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'LS Clock' })).toBeVisible();
});

test('P-concept-1b: initial view explains the product and its clock model', async ({ page }) => {
  await page.goto('/');
  const copy = (await page.locator('[data-role="product-intro"]').textContent()).replace(/\s+/g, ' ').trim();
  expect(copy).toContain('Live timing and guidance for Liberating Structures. One shared clock. Every group in sync.');
});

test('P-clock-explanation: landing explains serverless synchronization through ordinary clocks', async ({ page }) => {
  await page.goto('/');
  const explanation = await page.evaluate(() => document.querySelector('[data-role="clock-explanation"]')?.textContent || '');
  expect({
    why: /why a clock/i.test(explanation),
    serverless: /no coordination server/i.test(explanation),
    start: /same session start time/i.test(explanation),
    device: /each device['’]?s ordinary clock/i.test(explanation),
    derivesState: /calculate the current step/i.test(explanation),
  }).toEqual({ why: true, serverless: true, start: true, device: true, derivesState: true });
});

test('P-walkthrough-focus: walkthrough limits facilitator-control callouts', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#structure-select', { label: 'User Experience Fishbowl' });
  await page.fill('#participants-input', 'A\nB\nC\nD\nE\nF\nG\nH');
  await page.getByRole('button', { name: 'Take a walkthrough' }).click();
  const shownFacilitatorControls = [];
  while (await page.locator('.driver-popover').count()) {
    const title = (await page.locator('.driver-popover-title').textContent()).trim();
    const activeTarget = page.locator('.driver-active-element');
    if (await activeTarget.locator('xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " manual-form ")]').count()) {
      shownFacilitatorControls.push(title);
    }
    const nextButton = page.locator('.driver-popover-next-btn');
    if ((await nextButton.textContent()).trim() === 'Done') break;
    await nextButton.click();
    await expect(page.locator('.driver-popover-title')).not.toHaveText(title);
  }
  await page.keyboard.press('Escape');
  expect(shownFacilitatorControls.length).toBeLessThanOrEqual(2);
  await expect(page.locator('.driver-popover')).toHaveCount(0);
});

test('P-walkthrough-participant: walkthrough demonstrates the participant journey in order', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Take a walkthrough' }).click();
  const participantStates = [];
  while (await page.locator('.driver-popover').count()) {
    const title = (await page.locator('.driver-popover-title').textContent()).trim();
    const expectedTarget = {
      'Participant landing': ['[data-role="participant-landing"]', 'landing'],
      'Join your session': ['#join-btn', 'identity'],
      'Follow the current step': ['[data-role="location"]', 'live'],
      'See the whole session': ['[data-role="overview"]', 'overview'],
    }[title];
    if (expectedTarget && await page.locator(expectedTarget[0]).evaluate(element => element.classList.contains('driver-active-element'))) {
      participantStates.push(expectedTarget[1]);
    }
    const nextButton = page.locator('.driver-popover-next-btn');
    if ((await nextButton.textContent()).trim() === 'Done') break;
    await nextButton.click();
    await expect(page.locator('.driver-popover-title')).not.toHaveText(title);
  }
  expect(participantStates).toEqual(['landing', 'identity', 'live', 'overview']);
});

test('P-walkthrough-home: completing or dismissing the tour restores clean setup', async ({ page }) => {
  const outcomes = [];
  for (const exit of ['done', 'escape', 'close']) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Take a walkthrough' }).click();
    while (await page.locator('.driver-popover').count()) {
      const title = (await page.locator('.driver-popover-title').textContent()).trim();
      if (exit !== 'done' && title === 'Participant landing') {
        if (exit === 'escape') await page.keyboard.press('Escape');
        if (exit === 'close') await page.locator('.driver-popover-close-btn').click();
        break;
      }
      const nextButton = page.locator('.driver-popover-next-btn');
      const buttonText = (await nextButton.textContent()).trim();
      await nextButton.click();
      if (buttonText === 'Done') break;
      await expect(page.locator('.driver-popover-title')).not.toHaveText(title);
    }
    await page.waitForFunction(() => Boolean(document.querySelector('.manual-form')?.offsetParent), null, { timeout: 1000 }).catch(() => {});
    outcomes.push({
      setupVisible: await page.locator('.manual-form').isVisible(),
      participantAbsent: await page.locator('[data-role="participant-landing"], .participant-view').count() === 0,
    });
  }
  expect(outcomes).toEqual([
    { setupVisible: true, participantAbsent: true },
    { setupVisible: true, participantAbsent: true },
    { setupVisible: true, participantAbsent: true },
  ]);
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
  expect(metrics).toEqual({ documentTitle: 'LS Clock — Liberating Structures session runner', titleSize: 32, introSpacing: 24, taglineSize: 18 });
});

test('P-llm-toggle: LLM planning uses an accessible button-controlled panel', async ({ page }) => {
  await page.goto('/');
  const states = await page.evaluate(() => {
    const button = document.querySelector('[data-role="llm-toggle"]');
    const panel = button?.getAttribute('aria-controls')
      ? document.getElementById(button.getAttribute('aria-controls'))
      : null;
    if (!button || !panel) return { button: false, name: null, controls: false, initial: null, opened: null, closed: null };
    const initial = { expanded: button.getAttribute('aria-expanded'), hidden: panel.hidden };
    button.click();
    const opened = { expanded: button.getAttribute('aria-expanded'), hidden: panel.hidden };
    button.click();
    const closed = { expanded: button.getAttribute('aria-expanded'), hidden: panel.hidden };
    return { button: button.tagName === 'BUTTON', name: button.textContent.trim(), controls: true, initial, opened, closed };
  });
  expect(states).toEqual({
    button: true,
    name: 'Plan with an LLM',
    controls: true,
    initial: { expanded: 'false', hidden: true },
    opened: { expanded: 'true', hidden: false },
    closed: { expanded: 'false', hidden: true },
  });
});

test('P-hierarchy-2a: manual setup is permanently open and precedes optional assistance', async ({ page }) => {
  await page.goto('/');
  const hierarchy = await page.evaluate(() => {
    const manual = document.querySelector('.manual-form');
    const assistant = document.querySelector('.llm-section');
    return {
      manualIsSection: manual.tagName === 'SECTION',
      manualVisible: Boolean(manual.offsetParent),
      manualBeforeAssistant: Boolean(manual.compareDocumentPosition(assistant) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(hierarchy).toEqual({ manualIsSection: true, manualVisible: true, manualBeforeAssistant: true });
});

test('P-hierarchy-2b: LLM assistance begins behind a normal closed button', async ({ page }) => {
  await page.goto('/');
  const assistant = await page.locator('.llm-section').evaluate(element => ({
    isSection: element.tagName === 'SECTION',
    buttonVisible: Boolean(element.querySelector('[data-role="llm-toggle"]')?.offsetParent),
    panelHidden: element.querySelector('#llm-planning-panel')?.hidden,
  }));
  expect(assistant).toEqual({ isSection: true, buttonVisible: true, panelHidden: true });
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
  await expect(page.getByRole('button', { name: 'Load sample setup' })).toBeVisible();
});

test('P-sample-2: sample action fills every field using the selected structure defaults', async ({ page }) => {
  await page.goto('/');
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

test('P-plan-6a: one Copy session URL action generates, displays, and copies the session', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiedSessionURLs = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedSessionURLs.push(value); } },
    });
  });
  await page.goto('/');
  await page.locator('#structure-select').selectOption('TRIZ');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  const copyAction = page.locator('#generate-btn');
  await expect(copyAction).toHaveAccessibleName('Copy session URL');
  await expect(page.getByRole('button', { name: /^Copy URL$/ })).toHaveCount(0);
  await copyAction.click();
  const url = await page.locator('#session-url-output').inputValue();
  await expect(copyAction).toHaveText('Copied!');
  expect(await page.evaluate(() => window.__copiedSessionURLs)).toEqual([url]);
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
    phases: ['Individual', 'Passing time', 'Small Group', 'Passing time', 'Whole Group'],
    plenaryLocation: 'Main Hall',
  });
});

test('P-short-break-manual: manual Troika sessions classify unchanged boundaries', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('Troika Consulting');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  await page.getByRole('button', { name: '+ Add another structure' }).click();
  await page.locator('.structure-select-item').nth(1).selectOption('Troika Consulting');
  await page.locator('#short-break-input').fill('1');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const session = await page.evaluate(value => decodeSession(new URL(value).hash.slice(1)), await page.locator('#session-url-output').inputValue());
  const shortBreaks = session.phases.filter(phase => phase.transitionType === 'short-break');
  expect({ count: shortBreaks.length, durations: [...new Set(shortBreaks.map(phase => phase.duration))] }).toEqual({ count: 17, durations: [60] });
});

test('P-passing-manual: manual sessions apply configured transition timing consistently', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample setup' }).click();
  await page.locator('#passing-time-input').fill('3');
  await page.locator('#short-break-input').fill('1');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const session = await page.evaluate(value => decodeSession(new URL(value).hash.slice(1)), await page.locator('#session-url-output').inputValue());
  const passing = session.phases.filter(phase => phase.transitionType === 'passing');
  expect({
    transitionTiming: session.transitionTiming,
    passingCount: passing.length,
    passingDurations: [...new Set(passing.map(phase => phase.duration))],
  }).toEqual({ transitionTiming: { passingSeconds: 180, shortBreakSeconds: 60 }, passingCount: 4, passingDurations: [180] });
});

test('P-plan-6b: invalid setup neither displays nor copies a session URL', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copiedSessionURLs = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedSessionURLs.push(value); } },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  expect({
    controls: await page.locator('#load-sample-btn, #structure-select, #invitation-input, #start-time-input, #participants-input, #locations-input, #plenary-input, #add-structure-btn, #generate-btn').count(),
    copyActions: await page.getByRole('button', { name: /copy (session )?url/i }).count(),
    output: await page.locator('#session-url-output').inputValue(),
    clipboard: await page.evaluate(() => window.__copiedSessionURLs),
  }).toEqual({ controls: 9, copyActions: 1, output: '', clipboard: [] });
});

test('P-plan-url-3: bookmarked quick-plan URL compiles automatically on load', async ({ page }) => {
  await page.goto('/?structure=TRIZ&invitation=How%20can%20we%20improve%20handoffs%3F&startTime=2000000000&participant=Alice&participant=Bob&participant=Carol&participant=Dave&location=Room%20A&location=Room%20B&plenary=Main%20Hall');
  expect({
    previewVisible: await page.locator('#preview-section').isVisible(),
    structure: await page.locator('[data-role="preview-structure"]').textContent(),
    phaseCount: await page.locator('[data-role="preview-phases"]').textContent(),
    pasteFieldCount: await page.locator('#json-input').count(),
    manualVisible: await page.locator('.manual-form').isVisible(),
    manualInvitation: await page.locator('#invitation-input').inputValue(),
    manualParticipants: await page.locator('#participants-input').inputValue(),
    remainsBookmarkable: page.url().includes('structure=TRIZ'),
  }).toEqual({
    previewVisible: true,
    structure: 'TRIZ',
    phaseCount: '5 phases',
    pasteFieldCount: 0,
    manualVisible: true,
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
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const generatedURL = await page.locator('#session-url-output').inputValue();
  const session = await page.evaluate(value => decodeSession(value), new URL(generatedURL).hash.slice(1));
  expect({ bookmark, generated: { structure: session.structure, phases: session.phases.map(phase => phase.name) } }).toEqual({
    bookmark: { structure: 'TRIZ', participants: 'Alice\nBob\nCarol\nDave', plenary: 'Main Hall' },
    generated: { structure: 'TRIZ', phases: ['Individual', 'Passing time', 'Small Group', 'Passing time', 'Whole Group'] },
  });
});

test('P-setup-space-1: setup cards and control groups have breathing room', async ({ page }) => {
  await page.goto('/');
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

test('P-sequence-descriptions: every selected activity shows its canonical description', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('1-2-4-All');
  await page.locator('#add-structure-btn').click();
  const secondSelect = page.locator('.structure-select-item').nth(1);
  await secondSelect.selectOption('TRIZ');
  const before = await page.locator('.structure-row [data-role="structure-description"]').allTextContents();
  await secondSelect.selectOption('Min Specs');
  const after = await page.locator('.structure-row [data-role="structure-description"]').allTextContents();
  const expected = await page.evaluate(() => ({
    first: STRUCTURES['1-2-4-All'].description,
    triz: STRUCTURES.TRIZ.description,
    minSpecs: STRUCTURES['Min Specs'].description,
  }));
  expect({ before, after }).toEqual({
    before: [expected.first, expected.triz],
    after: [expected.first, expected.minSpecs],
  });
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

test('P-entry-1: pre-start landing orients participants', async ({ page }) => {
  const futureSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) + 10 * 60 };
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: futureSession });
  await page.goto(`/#${encoded}`);
  const observed = await page.evaluate(() => {
    const landing = document.querySelector('[data-role="participant-landing"]');
    const start = document.querySelector('[data-role="session-start-guidance"]');
    return { landing: landing?.textContent || '', start: start?.textContent || '' };
  });
  expect({
    brand: observed.landing.includes('LS Clock'),
    structure: observed.landing.includes('1-2-4-All'),
    invitation: observed.landing.includes('Test invitation'),
    startsAt: /starts at/i.test(observed.start),
    startsIn: /starts in/i.test(observed.start),
  }).toEqual({ brand: true, structure: true, invitation: true, startsAt: true, startsIn: true });
});

test('P-entry-2: full session information is available before joining', async ({ page }) => {
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/#${encoded}`);
  const observed = await page.evaluate(() => {
    const details = document.querySelector('[data-role="landing-session-details"]');
    return {
      hasDisclosure: details?.querySelectorAll('summary').length === 1,
      phaseCount: details?.querySelectorAll('[data-role="landing-phase"]').length || 0,
      text: details?.textContent || '',
    };
  });
  expect({
    hasDisclosure: observed.hasDisclosure,
    phaseCount: observed.phaseCount,
    hasNames: SESSION.phases.every(phase => observed.text.includes(phase.name)),
    hasDurations: SESSION.phases.every(phase => observed.text.includes(`${Math.round(phase.duration / 60)} min`)),
    hasInstructions: SESSION.phases.every(phase => observed.text.includes(phase.instructions)),
    hasMembers: Object.values(SESSION.groups).flat().flatMap(group => group.members).every(member => observed.text.includes(member.name)),
    hasLocations: Object.values(SESSION.groups).flat().every(group => observed.text.includes(group.location.label)),
  }).toEqual({ hasDisclosure: true, phaseCount: SESSION.phases.length, hasNames: true, hasDurations: true, hasInstructions: true, hasMembers: true, hasLocations: true });
});

test('P-entry-3: prepared participants select their roster identity', async ({ page }) => {
  const liveSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) - 90 };
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: liveSession });
  await page.goto(`/#${encoded}`);
  const before = await page.evaluate(() => {
    const select = document.querySelector('[data-role="prepared-name"]');
    return { tag: select?.tagName || '', options: select?.querySelectorAll('option').length || 0 };
  });
  if (before.tag === 'SELECT') {
    await page.locator('[data-role="prepared-name"]').selectOption('Alice');
    await page.getByRole('button', { name: 'Join session' }).click();
  }
  const after = await page.evaluate(() => document.querySelector('[data-role="group-members"]')?.textContent || '');
  expect({ before, preparedGroup: after }).toEqual({ before: { tag: 'SELECT', options: SESSION.participants.length + 1 }, preparedGroup: 'Group: Alice (you), Bob' });
});

test('P-entry-4: late arrivals use a distinct local assignment path', async ({ page }) => {
  const liveSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) - 90 };
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: liveSession });
  await page.addInitScript(() => { Math.random = () => 0.99; });
  await page.goto(`/#${encoded}`);
  const before = await page.evaluate(() => ({
    lateDisclosure: Boolean(document.querySelector('[data-role="late-arrival"]')),
    rosterCount: decodeSession(location.hash.slice(1)).participants.length,
  }));
  if (before.lateDisclosure) {
    await page.locator('[data-role="late-arrival"] summary').click();
    await page.locator('#late-name-input').fill('Zara');
    await page.getByRole('button', { name: 'Join as late arrival' }).click();
  }
  const after = await page.evaluate(() => ({
    group: document.querySelector('[data-role="group-members"]')?.textContent || '',
    rosterCount: decodeSession(location.hash.slice(1)).participants.length,
  }));
  expect({ before, after }).toEqual({ before: { lateDisclosure: true, rosterCount: 4 }, after: { group: 'Group: Carol, Dave, Zara (you)', rosterCount: 4 } });
});

test('P-entry-6: facilitator view is discoverable from the landing page', async ({ page }) => {
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/#${encoded}`);
  const before = await page.evaluate(() => {
    const link = document.querySelector('[data-role="facilitator-link"]');
    return { text: link?.textContent || '', href: link?.getAttribute('href') || '' };
  });
  if (before.href) await page.locator('[data-role="facilitator-link"]').click();
  await expect(page.getByRole('heading', { name: 'Facilitator View' })).toBeVisible();
  const after = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
  expect({ before, after }).toEqual({ before: { text: 'Open facilitator view', href: `?role=facilitator#${encoded}` }, after: 'Facilitator View' });
});

test('P-entry-7: participant landing is polished and responsive', async ({ page }) => {
  const futureSession = { ...SESSION, startTime: Math.floor(Date.now() / 1000) + 600 };
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: futureSession });
  const observations = [];
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/#${encoded}`);
    observations.push(await page.evaluate(() => {
      const hero = getComputedStyle(document.querySelector('.session-hero'));
      const title = getComputedStyle(document.querySelector('.session-title'));
      const controls = Array.from(document.querySelectorAll('.join-screen button, .join-screen select'));
      return {
        overflow: document.documentElement.scrollWidth <= innerWidth,
        cardPadding: Number.parseFloat(hero.padding),
        cardRadius: Number.parseFloat(hero.borderRadius),
        titleSize: Number.parseFloat(title.fontSize),
        controlsTall: controls.every(control => control.getBoundingClientRect().height >= 44),
      };
    }));
  }
  expect(observations).toEqual([
    { overflow: true, cardPadding: 24, cardRadius: 20, titleSize: 28, controlsTall: true },
    { overflow: true, cardPadding: 32, cardRadius: 20, titleSize: 28, controlsTall: true },
  ]);
});

test('P-entry-8: landing controls and errors are accessible', async ({ page }) => {
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/#${encoded}`);
  await page.getByRole('button', { name: 'Join session' }).click();
  await page.locator('[data-role="late-arrival"] summary').click();
  await page.getByRole('button', { name: 'Join as late arrival' }).click();
  const observed = await page.evaluate(() => {
    const prepared = document.querySelector('[data-role="prepared-name"]');
    const late = document.querySelector('#late-name-input');
    const error = document.querySelector('[data-role="prepared-error"]');
    const lateError = document.querySelector('#late-join-error');
    return {
      preparedLabel: prepared?.labels?.[0]?.textContent || '',
      lateLabel: late?.labels?.[0]?.textContent || '',
      errorText: error?.textContent || '',
      errorRole: error?.getAttribute('role') || '',
      errorLive: error?.getAttribute('aria-live') || '',
      lateErrorText: lateError?.textContent || '',
      lateErrorRole: lateError?.getAttribute('role') || '',
      lateErrorLive: lateError?.getAttribute('aria-live') || '',
    };
  });
  expect(observed).toEqual({ preparedLabel: 'Participant name', lateLabel: 'Your name', errorText: 'Choose your name to join.', errorRole: 'status', errorLive: 'polite', lateErrorText: 'Enter your name to join.', lateErrorRole: 'status', lateErrorLive: 'polite' });
});

// P-name-1: prepared name selector contains the session roster
test('P-name-1: prepared name selector contains every participant', async ({ page }) => {
  const encoded = await page.evaluate(({ session }) => encodeSession(session), { session: SESSION });
  await page.goto(`/#${encoded}`);
  const options = page.locator('[data-role="prepared-name"] option');
  await expect(options).toHaveText(['Choose your name', ...SESSION.participants.map(participant => participant.name)]);
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
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.isVisible() ? await description.textContent() : '').toContain('Engage everyone simultaneously in generating questions, ideas, and suggestions');
});

test('P-ls-desc-2: selected structure shows its approximate duration', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.textContent()).toContain('About 15 minutes');
});

test('P-ls-desc-3: selected structure shows its group configuration', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const description = page.locator('[data-role="structure-description"]');
  expect(await description.textContent()).toContain('Alone → pairs → quartets → whole group');
});

// P-url-2: learn-more link present after structure selection
test('P-url-2: learn-more link present after structure selection', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('1-2-4-All');
  const link = page.locator('[data-role="learn-more"]');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /liberatingstructures\.com/);
});

test('P-space-capacity-3: manual generation blocks insufficient non-solo meeting spaces', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('1-2-4-All');
  await page.locator('#participants-input').fill('Alice\nBob\nCarol\nDave');
  await page.locator('#locations-input').fill('Room A');
  await page.locator('#plenary-input').fill('Main Hall');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const blocked = await page.evaluate(() => ({
    error: document.querySelector('[data-role="setup-error"]')?.textContent || '',
    generated: Boolean(document.querySelector('#session-url-output')?.value),
  }));

  await page.locator('#locations-input').fill('Room A\nRoom B');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const recovered = Boolean(await page.locator('#session-url-output').inputValue());

  expect({
    namesDemand: /needs 2 meeting spaces at the same time/i.test(blocked.error),
    explainsSolo: /solo activities do not need meeting spaces/i.test(blocked.error),
    blocked: !blocked.generated,
    recovered,
  }).toEqual({ namesDemand: true, explainsSolo: true, blocked: true, recovered: true });
});

test('P-entry-5: prepared participant names must be unique', async ({ page }) => {
  await page.goto('/');
  await page.locator('#participants-input').fill('Alice\n alice  ');
  await page.getByRole('button', { name: 'Copy session URL' }).click();
  const observed = await page.evaluate(() => ({
    error: document.querySelector('[data-role="setup-error"]')?.textContent || '',
    generated: getComputedStyle(document.querySelector('#result-section')).display !== 'none',
  }));
  expect(observed).toEqual({ error: 'Each participant needs a unique name. “alice” appears more than once.', generated: false });
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

test('P-fishbowl-2: facilitator intentionally assigns three to seven Fishbowl users', async ({ page }) => {
  await page.goto('/');
  await page.locator('#structure-select').selectOption('User Experience Fishbowl');
  await page.locator('#participants-input').fill('A\nB\nC\nD\nE\nF\nG\nH');

  const selector = page.locator('[data-role="fishbowl-role-assignment"]');
  const present = await selector.count() === 1;
  if (present) {
    for (const id of [1, 3, 5]) await selector.locator(`input[data-participant-id="${id}"]`).check();
    await page.locator('#locations-input').fill('Room A\nRoom B');
    await page.locator('#plenary-input').fill('Main Hall');
    await page.getByRole('button', { name: 'Copy session URL' }).click();
  }

  const observed = await page.evaluate(() => {
    const assignment = document.querySelector('[data-role="fishbowl-role-assignment"]');
    const output = document.querySelector('#session-url-output')?.value || '';
    const session = output ? decodeSession(new URL(output).hash.slice(1)) : null;
    const rolePhase = session?.phases.find(phase => (session.groups[phase.index] || []).some(group => group.members.some(member => member.role)));
    const roles = rolePhase
      ? session.groups[rolePhase.index].flatMap(group => group.members).sort((a, b) => a.id - b.id).map(member => `${member.name} — ${member.role}`)
      : [];
    return {
      visible: Boolean(assignment && assignment.offsetParent !== null),
      guidance: assignment?.textContent.replace(/\s+/g, ' ').trim() || '',
      selected: [...(assignment?.querySelectorAll('input:checked') || [])].map(input => Number(input.dataset.participantId)),
      roles,
      error: document.querySelector('[data-role="setup-error"]')?.textContent || '',
    };
  });

  expect(observed).toEqual({
    visible: true,
    guidance: expect.stringMatching(/select 3–7.*direct experience/i),
    selected: [1, 3, 5],
    roles: ['A — Observer', 'B — User', 'C — Observer', 'D — User', 'E — Observer', 'F — User', 'G — Observer', 'H — Observer'],
    error: '',
  });
});

// P7: phase timeline — elapsed checked, active highlighted, upcoming plain
test('P-passing-config: setup exposes one session-wide passing time and short break', async ({ page }) => {
  await page.goto('/');
  const observed = await page.evaluate(() => {
    const passing = [...document.querySelectorAll('#passing-time-input')];
    const shortBreak = [...document.querySelectorAll('#short-break-input')];
    return {
      passing: passing.map(input => input.value),
      shortBreak: shortBreak.map(input => input.value),
      labels: [...document.querySelectorAll('.timing-settings label')].map(label => label.textContent.replace(/\s+/g, ' ').trim()),
      visible: [...passing, ...shortBreak].every(input => input.offsetParent !== null),
    };
  });
  expect(observed).toEqual({ passing: ['1'], shortBreak: ['0.5'], labels: ['Passing time (minutes)', 'Short break (minutes)'], visible: true });
});

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

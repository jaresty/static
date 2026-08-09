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

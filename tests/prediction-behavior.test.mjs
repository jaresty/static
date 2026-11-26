// Behavior checks for the prediction page (prediction/index.html), run in Chromium.
// Usage: node --test tests/prediction-behavior.test.mjs
// Needs Playwright from ls-clock/: `npm ci && npx playwright install chromium` there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { chromium } = createRequire(join(ROOT, 'ls-clock/package.json'))('playwright');
const KEY = 'ledger.v1';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

let server, browser, base;
before(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/\/$/, '/index.html');
    try { res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(await readFile(join(ROOT, path))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/prediction/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

// Local calendar date offset by n days, matching the page's own date math.
const localDate = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const entry = (over = {}) => ({ id: Math.random().toString(36).slice(2), created: '2026-01-01T00:00:00.000Z', decision: 'Decide', claim: 'Claim', conf: 70, due: localDate(30), domain: 'Work', outcome: null, note: '', resolved: null, ...over });

async function open({ entries, init, permissions } = {}) {
  const context = await browser.newContext({ permissions, acceptDownloads: true });
  if (entries) await context.addInitScript(([key, value]) => { if (!sessionStorage.seeded) { localStorage.setItem(key, value); sessionStorage.seeded = 1; } }, [KEY, JSON.stringify({ entries })]);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(base);
  return page;
}
const stored = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"entries":[]}').entries, KEY);
const toast = page => page.locator('#toast');

test('confidence slider shows the chosen percentage', async () => {
  const page = await open();
  await page.locator('#fConf').fill('85');
  assert.equal(await page.locator('#confOut').textContent(), '85');
});

test('check-in date defaults to 30 days from today', async () => {
  const page = await open();
  assert.equal(await page.locator('#fDue').inputValue(), localDate(30));
});

test('locking an entry saves it, clears the form, and confirms the check-in date', async () => {
  const page = await open();
  await page.fill('#fDecision', 'Stretch the team');
  await page.fill('#fClaim', 'Ships by March');
  await page.locator('#fConf').fill('60');
  await page.fill('#fDue', '2027-03-15');
  await page.fill('#fDomain', 'Timelines');
  await page.click('button[type=submit]');
  const [saved] = await stored(page);
  assert.deepEqual({ decision: saved.decision, claim: saved.claim, conf: saved.conf, due: saved.due, domain: saved.domain, outcome: saved.outcome },
    { decision: 'Stretch the team', claim: 'Ships by March', conf: 60, due: '2027-03-15', domain: 'Timelines', outcome: null });
  assert.equal(await page.inputValue('#fDecision'), '');
  assert.equal(await page.inputValue('#fClaim'), '');
  assert.equal(await page.inputValue('#fDue'), localDate(30));
  await assert.doesNotReject(toast(page).filter({ hasText: 'Locked. Check-in 2027-03-15' }).waitFor({ timeout: 2000 }));
});

test('an incomplete entry is not saved', async () => {
  const page = await open();
  await page.fill('#fDecision', 'Stretch the team');
  await page.fill('#fDomain', 'Timelines');
  await page.click('button[type=submit]');
  assert.equal((await stored(page)).length, 0);
});

test('tabs show only the chosen section', async () => {
  const page = await open();
  await page.click('nav button[data-t=record]');
  assert.equal(await page.locator('section.on').getAttribute('id'), 'record');
  assert.equal(await page.locator('nav button.on').getAttribute('data-t'), 'record');
  assert.equal(await page.locator('#log').isVisible(), false);
});

test('due badge and list show only unresolved entries whose date has arrived', async () => {
  const page = await open({ entries: [
    entry({ claim: 'Overdue', due: localDate(-1) }),
    entry({ claim: 'Today', due: localDate(0) }),
    entry({ claim: 'Later', due: localDate(5) }),
    entry({ claim: 'Answered', due: localDate(-2), outcome: 'yes' }),
  ] });
  assert.equal(await page.locator('#dueN').textContent(), '2');
  await page.click('nav button[data-t=due]');
  assert.deepEqual(await page.locator('#dueList .claim').allTextContents(), ['Overdue', 'Today']);
});

test('due badge is hidden and the list explains when nothing is due', async () => {
  const page = await open({ entries: [entry({ due: localDate(5) })] });
  assert.equal(await page.locator('#dueN').isHidden(), true);
  await page.click('nav button[data-t=due]');
  assert.match(await page.locator('#dueList').textContent(), /Nothing due/);
});

test('resolving hides the reasoning until answered, then records the outcome and note', async () => {
  const page = await open({ entries: [entry({ id: 'e1', decision: 'Hire nobody', claim: 'Ships', due: localDate(-1) })] });
  await page.click('nav button[data-t=due]');
  assert.doesNotMatch(await page.locator('#dueList').textContent(), /Hire nobody/);
  await page.click('#dueList button[data-o=partly]');
  assert.match(await page.locator('#dueList').textContent(), /Your decision: Hire nobody/);
  await page.fill('#dueList .note', 'Vendor delay');
  await page.click('#dueList [data-done]');
  const [saved] = await stored(page);
  assert.equal(saved.outcome, 'partly');
  assert.equal(saved.note, 'Vendor delay');
  assert.ok(saved.resolved);
  await assert.doesNotReject(toast(page).filter({ hasText: 'Recorded' }).waitFor({ timeout: 2000 }));
  assert.equal(await page.locator('#dueN').isHidden(), true);
});

test('record lists newest entries first with their outcome or open check-in', async () => {
  const page = await open({ entries: [
    entry({ claim: 'First', created: '2026-01-01T00:00:00.000Z', outcome: 'no', note: 'Missed it' }),
    entry({ claim: 'Second', created: '2026-02-01T00:00:00.000Z', due: '2027-05-01' }),
  ] });
  await page.click('nav button[data-t=record]');
  const cards = page.locator('#recList .card');
  assert.match(await cards.nth(0).textContent(), /open · 2027-05-01[\s\S]*Second/);
  assert.match(await cards.nth(1).textContent(), /First[\s\S]*Note: Missed it/);
  assert.equal(await cards.nth(1).locator('.tag.no').textContent(), 'no');
});

test('entry text is shown literally, never as markup', async () => {
  const page = await open({ entries: [entry({ claim: '<img src=x id=injected>' })] });
  await page.click('nav button[data-t=record]');
  assert.match(await page.locator('#recList .claim').textContent(), /<img src=x id=injected>/);
  assert.equal(await page.locator('#injected').count(), 0);
});

test('domain suggestions list each existing domain once, sorted', async () => {
  const page = await open({ entries: [entry({ domain: 'Hiring' }), entry({ domain: 'Budget' }), entry({ domain: 'Hiring' })] });
  assert.deepEqual(await page.locator('#domains option').evaluateAll(options => options.map(o => o.value)), ['Budget', 'Hiring']);
});

test('calibration stays hidden until 20 predictions are resolved', async () => {
  const page = await open({ entries: Array.from({ length: 19 }, () => entry({ outcome: 'yes' })) });
  await page.click('nav button[data-t=cal]');
  assert.match(await page.locator('#calOut').textContent(), /Collecting data \(19\/20\)/);
  assert.equal(await page.locator('#calSel').count(), 0);
});

// 13 × 90% yes and 2 × 50% partly (Work), 6 × 20% no (Home); 21 resolved:
// avg confidence 1390/21 → 66%, came true 14/21 → 67%,
// Brier (13·0.01 + 0 + 6·0.04) / 21 = 0.0176 → 0.018; Work alone 0.13/15 → 0.009.
const scored = [
  ...Array.from({ length: 13 }, () => entry({ conf: 90, outcome: 'yes', domain: 'Work' })),
  ...Array.from({ length: 2 }, () => entry({ conf: 50, outcome: 'partly', domain: 'Work' })),
  ...Array.from({ length: 6 }, () => entry({ conf: 20, outcome: 'no', domain: 'Home' })),
];

test('calibration scores resolved predictions once there are 20', async () => {
  const page = await open({ entries: scored });
  await page.click('nav button[data-t=cal]');
  assert.deepEqual(await page.locator('#calOut .kv strong').allTextContents(), ['21', '66%', '67%']);
  assert.match(await page.locator('#calOut').textContent(), /Brier score 0\.018/);
  assert.deepEqual(await page.locator('#calOut .bar').evaluateAll(bars => bars.map(b => b.previousElementSibling.textContent.split(' · ')[0])), ['20–29%', '50–59%', '90–99%']);
});

test('calibration can be narrowed to one domain', async () => {
  const page = await open({ entries: scored });
  await page.click('nav button[data-t=cal]');
  await page.selectOption('#calSel', 'Work');
  assert.equal(await page.locator('#calOut .kv strong').first().textContent(), '15');
  assert.match(await page.locator('#calOut').textContent(), /Brier score 0\.009/);
});

test('per-domain scores wait until a domain has 15 resolved predictions', async () => {
  const page = await open({ entries: scored });
  await page.click('nav button[data-t=cal]');
  assert.deepEqual(await page.locator('#calOut tr td:first-child').allTextContents(), ['Work']);
  assert.deepEqual(await page.locator('#calSel option').allTextContents(), ['All', 'Work']);
  assert.match(await page.locator('#calOut').textContent(), /Home 6\/15/);
});

test('domain is optional and is filed under General when left blank', async () => {
  const page = await open();
  await page.fill('#fDecision', 'Stretch the team');
  await page.fill('#fClaim', 'Ships by March');
  await page.click('button[type=submit]');
  const [saved] = await stored(page);
  assert.equal(saved?.domain, 'General');
});

test('quick-pick chips offer the three most-used domains and fill the field', async () => {
  const many = (domain, n) => Array.from({ length: n }, () => entry({ domain }));
  const page = await open({ entries: [...many('General', 5), ...many('Hiring', 4), ...many('Timelines', 2), ...many('Budget', 2), ...many('Travel', 1)] });
  const chips = page.locator('#chips button');
  assert.deepEqual(await chips.allTextContents(), ['Hiring', 'Budget', 'Timelines']);
  await chips.filter({ hasText: 'Budget' }).click();
  assert.equal(await page.inputValue('#fDomain'), 'Budget');
});

test('backup downloads the whole ledger as dated JSON', async () => {
  const page = await open({ entries: [entry({ id: 'a' }), entry({ id: 'b' })] });
  await page.click('nav button[data-t=data]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exp')]);
  assert.equal(download.suggestedFilename(), `ledger-backup-${localDate(0)}.json`);
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.deepEqual(file.entries.map(x => x.id), ['a', 'b']);
});

test('copy puts the ledger JSON on the clipboard', async () => {
  const page = await open({ entries: [entry({ id: 'a' })], permissions: ['clipboard-read', 'clipboard-write'] });
  await page.click('nav button[data-t=data]');
  await page.click('#copy');
  await assert.doesNotReject(toast(page).filter({ hasText: 'Copied' }).waitFor({ timeout: 2000 }));
  assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).entries.map(x => x.id), ['a']);
});

test('restore adds only new entries, keeps existing ones, and sorts by creation', async () => {
  const page = await open({ entries: [entry({ id: 'keep', claim: 'Original', created: '2026-03-01T00:00:00.000Z' })] });
  const file = join(tmpdir(), `prediction-restore-${process.pid}.json`);
  await writeFile(file, JSON.stringify({ entries: [
    entry({ id: 'keep', claim: 'Replacement', created: '2026-03-01T00:00:00.000Z' }),
    entry({ id: 'older', created: '2026-01-01T00:00:00.000Z' }),
  ] }));
  await page.click('nav button[data-t=data]');
  await page.setInputFiles('#imp', file);
  await assert.doesNotReject(toast(page).filter({ hasText: 'Restored 1 entries' }).waitFor({ timeout: 2000 }));
  const entries = await stored(page);
  assert.deepEqual(entries.map(x => x.id), ['older', 'keep']);
  assert.equal(entries[1].claim, 'Original');
});

test('restore rejects a file that is not a backup', async () => {
  const page = await open({ entries: [entry({ id: 'keep' })] });
  const file = join(tmpdir(), `prediction-bad-${process.pid}.json`);
  await writeFile(file, 'not json');
  await page.click('nav button[data-t=data]');
  await page.setInputFiles('#imp', file);
  await assert.doesNotReject(toast(page).filter({ hasText: 'Not a valid backup file' }).waitFor({ timeout: 2000 }));
  assert.deepEqual((await stored(page)).map(x => x.id), ['keep']);
});

test('data tab counts entries and resolved predictions', async () => {
  const page = await open({ entries: [entry(), entry(), entry({ outcome: 'yes' })] });
  assert.equal(await page.locator('#stat').textContent(), '3 entries · 1 resolved');
});

test('data tab warns when browser storage is unavailable', async () => {
  const page = await open({ init: () => { Storage.prototype.getItem = () => { throw new Error('blocked'); }; } });
  assert.match(await page.locator('#stat').textContent(), /storage unavailable/);
});

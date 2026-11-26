// WebKit (Safari/iOS engine) layout check for the prediction check-in date input.
// Chromium renders date inputs like text inputs, so the regression only shows here.
// Usage: node tests/prediction-date-layout.mjs <page-url>
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(fileURLToPath(new URL('../ls-clock/package.json', import.meta.url)));
let playwright;
try { playwright = require('playwright'); } catch {
  console.error('FAIL prediction-date-layout-webkit: playwright missing — run `npm ci && npx playwright install webkit` in ls-clock/');
  process.exit(1);
}
const { webkit, devices } = playwright;
const url = process.argv[2];
const browser = await webkit.launch();
const failures = [];
try {
  for (const [name, options] of [['iphone', devices['iPhone 13']], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
    const page = await (await browser.newContext(options)).newPage();
    await page.goto(url);
    const ok = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect(), c = r('fClaim'), d = r('fDue');
      return Math.abs(d.left - c.left) <= 1 && Math.abs(d.width - c.width) <= 1 && Math.abs(d.height - c.height) <= 1 &&
        d.height >= 44 && document.documentElement.scrollWidth <= innerWidth;
    });
    if (!ok) failures.push(name);
  }
} finally { await browser.close(); }
if (failures.length) {
  console.error(`FAIL prediction-date-layout-webkit: check-in date input is misaligned with sibling fields on ${failures.join(', ')}`);
  process.exit(1);
}

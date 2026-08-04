import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const property = process.argv[2];

function fail(message) {
  console.error(`FAIL ${property}: ${message}`);
  process.exit(1);
}

async function p1() {
  try {
    await access(path.join(root, 'index.html'));
  } catch {
    fail('static entry index.html is absent');
  }
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('<main')) fail('index.html has no main application entry');
  console.log('PASS p1: static entry exists');
}

async function p2() {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const link = html.match(/<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)/i);
  if (!link) fail('manifest is not linked from index.html');
  const manifest = JSON.parse(await readFile(path.join(root, link[1]), 'utf8'));
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    if (!manifest[key] || (Array.isArray(manifest[key]) && manifest[key].length === 0)) {
      fail(`manifest is missing ${key}`);
    }
  }
  for (const icon of manifest.icons) {
    let iconSource;
    try {
      iconSource = await readFile(path.join(root, icon.src), 'utf8');
    } catch {
      fail(`manifest icon is absent: ${icon.src}`);
    }
    if (icon.type === 'image/svg+xml' && !/^<svg[^>]+viewBox=/m.test(iconSource)) {
      fail(`manifest SVG icon is invalid: ${icon.src}`);
    }
  }
  console.log('PASS p2: install manifest and declared icons resolve');
}

async function p3() {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  if (!app.includes('serviceWorker.register')) fail('service worker registration is absent');
  let sw;
  try {
    sw = await readFile(path.join(root, 'sw.js'), 'utf8');
  } catch {
    fail('sw.js is absent');
  }
  for (const asset of ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest']) {
    if (!sw.includes(`'${asset}'`)) fail(`service worker does not precache ${asset}`);
  }
  if (!sw.includes("addEventListener('fetch'")) fail('service worker has no offline fetch handler');
  console.log('PASS p3: service worker registration and core precache exist');
}

async function p4() {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!html.includes("default-src 'self'")) fail('local-only content policy is absent');
  const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'styles.css', 'app.js'];
  for (const file of files) {
    try {
      const text = await readFile(path.join(root, file), 'utf8');
      if (/https?:\/\//i.test(text)) fail(`remote URL found in ${file}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  console.log('PASS p4: runtime references are local-only');
}

async function p5() {
  let app;
  try {
    app = await readFile(path.join(root, 'app.js'), 'utf8');
  } catch {
    fail('app.js style data is absent');
  }
  for (const id of ['upright', 'slanting', 'water-reflecting']) {
    if (!app.includes(`id: '${id}'`)) fail(`style data is missing ${id}`);
  }
  for (const role of ['subject', 'secondary', 'object']) {
    if (!app.includes(`role: '${role}'`)) fail(`style data is missing ${role} stems`);
  }
  console.log('PASS p5: initial style and stem records exist');
}

async function p6() {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  for (const renderer of ['renderPlan(style)', 'renderFront(style)', 'renderSpatial(style)']) {
    if (!app.includes(renderer)) fail(`shared-model renderer is missing ${renderer}`);
  }
  for (const target of ['plan-view', 'front-view', 'spatial-view']) {
    if (!app.includes(`id=\"${target}\"`)) fail(`projection target is missing ${target}`);
  }
  if (!app.includes('const style = activeStyle();') || !app.includes('renderViews();')) {
    fail('workspace does not derive synchronized views from the active style model');
  }
  console.log('PASS p6: synchronized projection wiring exists');
}

async function p7() {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  for (const mode of ['lesson', 'reference']) {
    if (!app.includes(`data-mode=\"${mode}\"`)) fail(`mode control is missing ${mode}`);
  }
  if (!app.includes("mode: 'lesson'")) fail('lesson mode state is absent');
  if (!app.includes('renderAll();')) fail('mode changes do not update the interface');
  console.log('PASS p7: Lesson Board and Reference modes are explicit');
}

async function p8() {
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  const model = await readFile(path.join(root, 'lesson-model.mjs'), 'utf8');
  if (!app.includes('data-adaptive-canvas')) fail('adaptive assembly canvas is absent');
  if (!app.includes('id=\"step-back\"') || !app.includes('id=\"step-next\"')) fail('step navigation is absent');
  if (!model.includes('export function moveAssemblyStep')) fail('assembly-step model is absent');
  console.log('PASS p8: adaptive assembly workflow wiring exists');
}

async function p9() {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  let css;
  try {
    css = await readFile(path.join(root, 'styles.css'), 'utf8');
  } catch {
    fail('accessible focus stylesheet is absent');
  }
  if (!html.includes('class="skip-link"')) fail('skip link is absent');
  if (!html.includes('<link rel="stylesheet" href="styles.css">')) fail('accessibility stylesheet is not linked');
  if (!app.includes('aria-label="Viewing mode"')) fail('mode controls have no accessible group name');
  if (!app.includes("stem.addEventListener('keydown'")) fail('diagram stems are not keyboard operable');
  if (!css.includes('--focus: #f5b642;') || !css.includes('outline: 3px solid var(--focus);')) {
    fail('visible keyboard focus treatment is absent');
  }
  console.log('PASS p9: controls are labelled and keyboard operable');
}

async function p10() {
  const css = await readFile(path.join(root, 'styles.css'), 'utf8');
  if (!css.includes('@media (max-width: 700px)')) fail('mobile breakpoint is absent');
  if (!css.includes('grid-template-columns: 1fr;')) fail('mobile single-column layout is absent');
  if (!css.includes('overflow-x: hidden;')) fail('horizontal overflow protection is absent');
  if (!css.includes('minmax(0, 1fr)')) fail('responsive grid tracks are not shrink-safe');
  if (!css.includes('.table-wrap { overflow-x: auto; }')) fail('wide reference tables cannot scroll locally');
  console.log('PASS p10: 360px responsive layout rules exist');
}

const checks = { p1, p2, p3, p4, p5, p6, p7, p8, p9, p10 };
if (!checks[property]) fail('unknown property');
await checks[property]();

import fs from 'node:fs';

const property = process.argv[2];
const html = fs.readFileSync(new URL('../2x2-facilitator/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../2x2-facilitator/app.js', import.meta.url), 'utf8');
const sharedView = html.slice(html.indexOf('id="shared-facilitator-view"'), html.indexOf('id="facilitator-handoff-view"'));

const checks = {
  '1': [html.includes('Number · final facilitator result'), 'FAIL property 1: view-only legend does not identify final-result numbers'],
  '2': [html.includes('Halo · larger means more disagreement'), 'FAIL property 2: view-only legend does not explain disagreement halos'],
  '3': [html.includes('Purple line · participant average to facilitator result'), 'FAIL property 3: view-only legend does not explain adjustment lines'],
  '4': [html.includes('Participant dots are intentionally excluded from this link'), 'FAIL property 4: view-only result does not explain omitted participant dots'],
  '5': [app.includes("button.textContent = 'Copied!'") && app.includes("status.setAttribute('role', 'status')") && app.includes("status.textContent += ' Link copied.'"), 'FAIL property 5: successful clipboard writes lack unmistakable button and live-status feedback'],
  '6': [app.includes("status.setAttribute('role', 'alert')") && app.includes('Copy failed — select and copy the link below.'), 'FAIL property 6: rejected clipboard writes lack an actionable alert fallback'],
  '7': [sharedView.includes('data-legend-entry><i class="legend-halo"'), 'FAIL property 7: view-only halo legend has no visible matching swatch'],
  '8': [sharedView.includes('data-legend-entry><i class="legend-line legend-line-adjustment"'), 'FAIL property 8: view-only adjustment legend has no visible purple swatch'],
};

if (!checks[property]) {
  console.error(`Unknown property: ${property}`);
  process.exit(2);
}
const [passed, failure] = checks[property];
if (!passed) {
  console.error(failure);
  process.exit(1);
}
console.log(`PASS property ${property}`);

# Local verification record

This is a bounded implementation-session record, not production or cross-browser certification.

## Executed checks

- `node --test causal-playground/tests/core.test.mjs tests/ai-draft-contract.test.mjs`: 32 pass, 0 fail (19 Causal Playground tests, 13 existing shared AI-contract tests).
- `bash causal-playground/tests/browser-smoke.sh`: pass in fresh isolated Chromium sessions, served under `/static/causal-playground/` to exercise a GitHub Pages-style project prefix.
- `STATIC_LANDING_TARGET=inventory bash tests/static-landing-check.sh`: pass.
- Landing `structure`, `local-only`, `responsive`, and `ohara-first` targets: pass.
- `git diff --check`: pass.

Browser smoke exercises document authoring, non-drag forms, named reverse edges/self-loops, undo/redo, actual step values, historical inspection, Build/Modify/Explain prompt generation, computed explanation packet contents, reviewed AI replacement, stale-source rejection, invalid import recovery, valid import review, compressed sharing, dynamic-reset confirmation, play/pause/reset, origin-local runtime resources, 320px overflow and Tab focus.

## Live-preview regressions

### Continuous playback

The earlier cursor hook caused unwanted pause calls during chart updates; the smoke originally timed out waiting for continuous playback. The chart now uses explicit clicks for historical inspection. Hover and programmatic cursor updates are passive. The slider captures its requested value before pause/clock refresh, preventing the old cursor from replacing it.

`tests/playback-check.js` passes with the real pointer placed over the chart overlay and, separately, away from it. Repeated passive mousemove events and chart reconstruction leave the clock at `Running · tick 8`. Explicit Pause remains at tick 8; Step advances to 9 and stays paused; scrub pauses and selects historical tick 1; uninterrupted playback also remains Running through tick 5. The already-open preview may require a hard refresh to replace cached ES modules.

### Oversized drawing arrow

Before the correction, the edgehandles ghost edge reported a 30px stroke and the screenshot showed an oversized arrowhead. Transient edges now have explicit 1.5px strokes and arrow scale 0.7 instead of inheriting missing gain-derived width data. At 2× zoom the rendered stroke is 3px. The source-node hit region remains 166px at normal zoom / 332px at 2×. Finished model edges retain their gain-based width (2.1px in the specimen).

The interface guard checks normal/2× preview width, target node size, exit cleanup, completed gesture editor and saved named connection. A separate actual low-level mouse down/move/up drag from Strain to Pressure opened the correct source/target editor; a real save click created `Physical drag return`; exiting draw mode left zero temporary elements. This latter physical-pointer check is recorded in the session transcript, while the repeatable interface guard drives the same Cytoscape gesture-event path.

### Toolbar alignment

All five document controls measured 38px high with bottom edge 294.1875px in the 1280px Chromium specimen. Examples retains its accessible wrapping label. The responsive smoke reports document scroll width 320 at a 320px viewport and a 294px chart region.

## Capacity exercise

A local Node exercise simulated 100 nodes, 500 edges (gain 4, delay 100), and 2,000 transitions. Observed: 409ms, approximately 191 MiB retained heap, all final values finite. This establishes one local bounded run only. Mobile hardware, maximum-capacity browser responsiveness, Safari and Firefox remain unverified.

## Limits of this record

No commit, push, deployment, database or external AI call was performed. No automated stability or real-world causal claim is made. Tests are persisted and repeatable but are not wired into a repository CI workflow; this record does not claim autonomous regression re-execution or exhaustive assertion-by-assertion mutation coverage. Screen-reader audit and real-device touch testing remain future verification. Internal QA screenshots were not published as guided demo artifacts.

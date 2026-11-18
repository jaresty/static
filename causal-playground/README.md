# Causal Playground

A self-contained static causal-system editor and player. Serve the repository with any HTTP static server and open `causal-playground/`. GitHub Pages project subpaths work; no build step, database, account, telemetry, API key or runtime CDN is required. Recent Chromium, Firefox and Safari with native CompressionStream/DecompressionStream and Web Crypto are required. Open over HTTPS or localhost, not `file://`.

## Start with the reading guide

[Understanding this simulation](./understanding.html) explains the current behavior in practical order: graph meaning, settings, the exact equation and a worked example, surprising traces, contribution inspection, and related modeling traditions. It is also linked from **How this works** and the app footer; those links open a new tab to keep the current run open. The guide loads no JavaScript or network dependencies.

This is a **custom discrete-time, bounded, baseline-relative influence model**, related to but not canonical fuzzy cognitive map inference and not stock/flow system dynamics. Graph signs alone do not determine its dynamics. The design is provisional; the guide's discussion of explicit stocks, rates, units and equations is an open future direction, not a model switch. The technical rule below remains the engine contract.

## Model meaning

Every variable is an abstract level from 0 to 100, not a conserved stock or physical unit. For transition t → t+1:

```
contribution(edge,t) = target.responsiveness × sign × gain
                     × (source(t − delaySteps) − source.baseline)
recovery(node,t) = responsiveness × (baseline − current)
rawNext = current + recovery + sum(incoming contributions)
next = clamp(rawNext, 0, 100)
boundaryAdjustment = next − rawNext
```

All nodes read the same committed state. Relationship-ID ordering fixes summation order. Playback speed changes wall-clock pacing only. Zero delay reads tick t, not a partially updated t+1. Pre-zero history holds initial values. A pulse replaces the observed value at tick zero without rewriting prehistory. The first release only supports tick-zero pulses, not holds or arbitrary scheduled events.

Positive means same-direction deviation from baseline, **not** always increasing or desirable. A below-baseline source gives a negative contribution through a positive edge. Gain 1 maps one deviation point to one target point before responsiveness. Baseline recovery can dominate a reinforcing cycle. Bounds can manufacture flat traces: “At bound” is not equilibrium. Discrete-time artifacts and delays can create oscillation. This tool explores hypotheses; it does not establish real-world causation or prediction.

## Author and investigate

Add nodes, use the inspector to name variables and set initial/baseline/responsiveness, and add relationships with explicit source/target forms. “Draw arrows” also enables drag-to-connect. Opposing edges curve separately; self-loops are supported. Use the object list and forms for non-drag/keyboard editing. Node positions and names do not reset the run. Changes to dynamics ask for confirmation when a run exists and reset its history. Undo/redo retains up to 50 document snapshots.

Play, pause, step, reset and change playback speed. Select chart nodes in the inspector (up to 12 traces are displayed). Chart baselines are dashed. Scrub with the slider or click the chart to inspect historical values. Hover is passive and never pauses playback; only deliberate chart clicks or scrub changes enter historical inspection. At a historical tick t the explanation is the transition t→t+1; at the latest tick it shows the preceding computed transition. Contributions expose exact applied influences, source tick/value, recovery and clipping. Click a contribution to inspect its delayed source. Graph layout does not animate or imply material flow.

Desktop has canvas, inspector and chart regions. Narrow screens switch Canvas / Inspector / Charts. Space toggles playback when not typing or focused on a button. Ctrl/Cmd+Z and Shift+Z undo/redo document edits. Form controls and dialog actions have visible keyboard focus.

## Portable document

`model.schema.json` is the published JSON Schema, generated directly from `SCHEMA` in `model.mjs`. The runtime validator implements the exact subset used by that schema (objects, required/unknown fields, numbers, strings, arrays, constants and enums), plus semantic reference/uniqueness checks. Schema versions and engine versions are checked independently. Unknown fields are errors, never silently ignored. Imported labels are plain text. Documents cannot contain code, external dependencies or arbitrary equations.

Stable IDs carry identity; names are editable. Dynamics and `view` are separate. Positions are optional entries in `view.positions`; absent positions receive deterministic display defaults. One edge per ordered source/target pair; reversed pairs and self-loops are allowed. Files, fragment links and AI response models use the same validation path.

Examples are in `examples/recovery.json`, `reinforcement.json` and `balancing.json`. These contain hypotheses and illustrative gains, not calibrated empirical findings.

### Product limits

- 100 nodes; 500 relationships; gains 0–4; integer delays 0–100.
- Responsiveness >0 and ≤1; initial, baseline and pulse levels 0–100.
- 2,000 simulated transitions per run. No automatic stability classification.
- 1 MiB UTF-8 JSON input/output budget, 1.4 million encoded characters before decoding.
- Share links capped at 8,000 total characters; use a file above that. This is conservative, not a universal URL-length guarantee.
- Explanation packets capped at 256 KiB, up to 12 node traces, at most 11 exact ticks around focus, a labeled sampled overview, and up to 500 incoming contribution records around selected transitions. Coverage fields disclose omissions.

These are provisional product limits, not general mathematical or cross-device performance guarantees. Full retained explanation history can consume substantial memory at the maximum graph/run size.

### Sharing and local work

JSON download/import is the durable portable path. Fragment links contain a gzip-compressed base64url document (`#model=gz1.…`). Native streaming decompression stops after the decoded budget. Sharing defaults to the model without pulses; opt in to include the experiment. Links are readable snapshots, not encrypted, revocable or synchronized. Fragments are not sent in the HTTP request, but every recipient and script on the page can read them.

Import, example and AI proposals open an app-computed diff before application. Current work can be downloaded; cancel leaves it unchanged. Applying is undoable. “Open separately” opens a new tab with a shared snapshot (large models fall back to downloading a proposal). Browser local storage is origin-wide and **not** independent per tab; each tab's in-memory document remains independent, but the last edited tab wins the next-start autosave. Export files when keeping multiple systems. Invalid saved data is not silently overwritten; autosave is paused until explicit recovery/replacement. Storage failures are visible and retain the in-memory document.

## Bring your own AI

No provider is contacted. The user previews and copies prompts, then chooses to paste their data into an external provider.

**Build / Modify:** generated instructions embed the real schema, limits, exact engine rules, request, and (for modifications) the complete current document. Ask clarifying questions when meanings are unclear. AI returns one complete envelope:

```json
{
  "format": "causal-playground-ai-response",
  "version": 1,
  "operation": "modify",
  "baseFingerprint": "app-supplied SHA-256 source fingerprint",
  "summary": ["What changed"],
  "model": { "complete": "canonical model goes here, not a patch" }
}
```

For creation use `operation: "create"` and `baseFingerprint: null`. This is an envelope illustration, not an importable example model. Modify must echo the app's supplied hash, not calculate one. Fingerprints detect stale documents; they do not authenticate an LLM or establish model validity. The app validates the full response and computes its own diff. Stale modifications can open separately or download, not silently replace newer work. Applying resets dynamics if necessary and is undoable.

**Explain:** choose system, selected node, selected relationship, or run; ask a question; generate a preview. The versioned packet includes the model/run identities, exact engine semantics, actual computed trace and contributions, delayed source ticks, clipping, initial pulses and coverage/omission metadata. Download the packet or copy the explanation prompt. The LLM must separate observed engine values, mathematical consequences and real-world hypotheses; cite supplied evidence; admit missing context; and describe unrun experiments as suggestions only. Explanation is read-only; edits require the separate Modify/review flow. Follow-up conversation stays in the user's external chat, not this app.

## Libraries (locally vendored)

- Cytoscape.js 3.30.4 (MIT), graph interaction/rendering.
- cytoscape-edgehandles 4.0.1 (MIT), drag-to-connect; requires lodash memoize/throttle.
- Lodash 4.17.21 (MIT), browser dependency of edgehandles.
- uPlot 1.6.31 (MIT), time-series chart.

Distributions were retrieved from pinned npm paths on jsDelivr at implementation time. License files remain alongside bundles in `vendor/`. The unused lz-string candidate was not retained: native gzip streaming permits bounded decoding without an unchecked string expansion. Canonical saved documents do not use Cytoscape or uPlot internal formats.

## Verification

```
node --test causal-playground/tests/core.test.mjs
bash causal-playground/tests/browser-smoke.sh
```

Browser smoke needs Python 3 and the installed `agent-browser` CLI/Chromium; it uses an isolated browser session and local server under a nested `/static/causal-playground/` prefix. Unit tests cover actual values, prehistory/delay/pulse distinction, clipping reconciliation, ordering/replay, validation/security/resource limits, compression bounds, history, stale AI responses and explanation evidence coverage. Browser smoke exercises actual DOM authoring, playback/inspection, AI preview/review, import/share and a 320px layout. It does not establish Safari/Firefox compatibility, screen-reader usability or maximum-capacity performance across devices.

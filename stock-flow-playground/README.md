# Stock & Flow Playground

A separate local-first authoring experiment. Serve the repository root over HTTP and open `stock-flow-playground/`. No build, backend, accounts or AI provider requests. The original causal-playground shell and stylesheet are the presentation foundation, with locally pinned Cytoscape 3.30.4, edgehandles 4.0.1, lodash 4.17.21 and uPlot 1.6.31 shared from `../causal-playground/vendor/` (including their existing licenses). There are no runtime CDN requests or new library dependencies. The existing causal-playground and workload demo are not modified. No causal-model migration is provided.

## Try it

Select an entity in the graph or dropdown. Edit its name, unit and initial value / expression, then save. Add stocks, flows, parameters or auxiliaries. IDs are generated once and read-only in forms; names are presentation only. Flow source/target dropdowns connect stocks or the environment. Remove references/endpoints before deleting a referenced entity. The last stock cannot be deleted. Changes to equations, initial amounts, values, unit labels, time or endpoints reset the run, with explicit confirmation when computed history exists. Cancelling keeps the current run intact. Names, title and view positions preserve history, cursor and playback; run evidence uses the updated presentation labels. A separate dynamics key is used ONLY for lifecycle decisions; full-document SHA-256 still protects AI review against stale names/layout too. Undo/redo covers the last 50 document snapshots in this tab (not run controls), with the same cosmetic/dynamic distinction. The default water-tank example is editable and hypothetical: an upper stock influences its own drain through `k * upper`, demonstrating balancing feedback without psychological assumptions.

The Cytoscape graph distinguishes solid material transfers (stock → flow → stock/environment) from dashed information dependencies, derived from expression references. Drag entities to arrange them; optional `view.positions` stores coordinates separately from dynamics, with deterministic type-layered defaults for absent positions. Fit and zoom controls change only the current camera, not dynamics. View X/Y fields are keyboard alternatives to dragging. Draw flow mode lets you drag a stock to another stock: it opens an endpoint/rate draft, then validation/diff review, then explicit Apply; no immediate transfer or fake information dependency is saved. A Connect stocks form is the keyboard alternative. Information links are always derived from expressions. The uPlot charts use separate scales for each identical stock unit, labeled with that unit and the actual run-time domain. At most 12 stock traces are plotted, with omitted stock names/IDs disclosed explicitly; the complete numeric table and slider remain keyboard alternatives. Click a chart or scrub to pause and retain the inspected row; hover never pauses. With many entities labels can crowd; the bounded prototype prioritizes forms and fit/zoom over an unbounded workflow editor.

## Numerical and unit contract

For each explicit Euler transition of width h (last step may be shorter):

1. Evaluate parameters, then topologically ordered auxiliaries, then all flow rates from **old** stock values (or the explicitly requested fixed historical stock observation described below). A rate must be finite and nonnegative. Rate errors abort the entire transition without recording a partial row.
2. For each source stock s, sum requested outgoing amounts Q_s = h × sum(rates).
3. Let f_s = min(1, old_s / Q_s), with f_s = 1 when Q_s = 0. Each requested outgoing amount from s receives the SAME factor, without ID-priority allocation. ID-sorted traversal fixes floating-point summation order, so reordering a portable entity array cannot change trajectories. Environment inflows are not source-limited.
4. Subtract each applied amount from its source and add exactly that same amount to its target. Incoming material is available for outflow only on the next step. Distinct sources are allocated independently, including loops. There is no cap, baseline decay, good/bad polarity, or hidden transfer priority.
5. Inspect requested/applied rates, factors, expressions and referenced old-state values for the selected transition. For each stock the cumulative ledger is initial + inflow − outflow. Tiny floating-point roundoff may remain; negative roundoff below 1e-8 may normalize to zero, not physical independent clipping.

Stock unit labels on internal transfers must match exactly. Each flow unit must equal `stockUnit/timeUnit`. Parameters/auxiliaries carry descriptive units; **expression dimensional analysis is not implemented**. Unit labels are case-sensitive, not a conversion system. Stocks are amounts; flows are amounts/time. Negative physical rates must be represented as a separate reverse flow.

Explicit Euler is timestep-dependent and not a general accurate/stable solver. Compare smaller dt, especially with fast feedback, near empty stocks, or when allocation triggers. The tested analytic example is exponential tank draining; refinement reduces its error, which is not a universal guarantee. A limiting factor is an accounting policy, not a validated physical law. No empirical validation is implied by a trajectory.

## Expression grammar and limits

- Decimal/scientific numeric literals, lowercase stable-ID references, `+ - * /`, unary signs, parentheses, `min(a,b)`, `max(a,b)`, `abs(a)`.
- `delay(stock_id, integer_steps)` is a fixed **information delay**. Integer literal steps range 0–100; only a stock ID may be delayed. No delayed auxiliary/flow/expression, computed lag, nested delay argument, or cycle loophole. Example: `0.2 * delay(upper, 2)` requests a transfer now using an observation two dt ticks earlier.
- At transition starting tick n, `delay(s,d)` reads row n−d. Zero reads current old state. Negative ticks hold the stock's initial value. Each actual read records expression ID, stock ID, steps, source tick/time/value and whether prehistory was used; the ledger, computed-value inspector and Explain evidence show these records. A delayed rate is still allocated against **current** old source availability, and debit/receipt happen together now.
- Any document containing delay syntax (even zero lag) must have horizon/dt integral within 1e-9 numerical tolerance; the run uses fixed discrete ticks with no shorter terminal step. Delay-free models retain a shortened terminal Euler step. dt is fixed per run; editing it resets dynamics after confirmation.
- Information delay is NOT water/travel transit. For transit, explicitly author an intermediate stock (e.g. Water in transit), a flow into it and another flow out. This accumulates real in-transit material; a lagged observation does not.
- No eval/Function, imported code, implicit multiplication, exponent operator, time variable, array/property access, or references to flow entities.
- Auxiliaries form a directed acyclic graph; rates are evaluated after auxiliaries.
- 40 entities, at least one stock, 2,000 transitions, 512 expression characters, structural AST depth 24, finite absolute values <= 1e12. Stock initial values are nonnegative. dt >= 1e-6, dt/horizon <= 1e6; horizon >= dt. Intermediate arithmetic is bounded, not silently coerced. Negative rates fail at execution.
- IDs match `[a-z][a-z0-9_]{0,31}`, unique across types. Reserved/unsafe IDs and unknown object keys fail. Labels <=80 characters; units <=24, no control characters.

## Portable data / external AI

`schema.json` publishes version 1. Runtime validation adds reference integrity, auxiliary cycles, exact flow units, parser constraints, and cross-field step bounds. Canonical JSON sorts entity IDs/keys while preserving stable IDs. Import never auto-applies: validate, inspect the diff and full candidate, then apply. No automatic migration from the original playground.

Native browser gzip powers compressed URL sharing. URLs contain the model, NOT history. JSON input and decompressed content are bounded at 65,536 bytes; encoded fragments at 16,000 characters. Unsupported native gzip falls back to explicit JSON export/import. Corrupt and oversized content fails with a diagnostic. Autosave is namespaced `stock-flow-playground.v1`; blocked/quota storage is nonfatal. Autosave restores current work first; a shared document opens as an unapplied review proposal. A failed storage load shows the example and blocks autosave until the user explicitly chooses Enable autosave / replace saved. Shared documents are validated and reviewed, including on hash changes; failed shares preserve current work. Storage is origin-wide, so last edited tab wins the next-start autosave; export files for independent durable systems. Untrusted strings are inserted as text, not HTML.

Build / Modify handoffs include the exact model grammar, current model, stable source SHA-256 fingerprint, example and semantic rules. Copy/download to any external LLM; no provider is called. Paste a COMPLETE returned model, validate, inspect entity/time/title differences and full candidate, then apply. Build and Modify both reject stale source fingerprints at review and apply. Generate a fresh handoff after edits. Explain is read-only: at most the last 21 actual history rows, explicit coverage/omissions/prehistory and actual delayed reads, current run-model presentation labels and numerical/domain caveats; packets above 256 KiB fail explicitly with a smaller-model/fewer-steps suggestion rather than being silently truncated; it is not accepted through the AI replacement path. Prompt text can contain user-provided labels; an external LLM is not a trusted validator.

Deliberate omissions: schema-driven large editor, persisted camera/zoom, arbitrary delayed expressions or material-transit operator, full unit algebra, arbitrary ODE/DAE methods, provider integration, old-model conversion, live collaboration, persisted run history or undo stacks. File/URL imports and example restoration replace a model only after review. No code execution imports.

## Original implementation restoration and semantic adapters

The original causal-playground files were reviewed against release `52c1fa0`; the restoration uses their actual presentation foundation rather than an independently styled SVG/custom-canvas replacement. Original files are unchanged. The stock-flow numerical/model, document/history, portable/AI and schema modules are also unchanged by this UI restoration.

- `index.html` restores the original masthead, title/document/status/AI bars, numbered canvas–inspector–timeline workspace, compact transport, responsive Canvas/Inspector/Charts tabs and dialog hierarchy. `style.css` directly imports `../causal-playground/styles.css`; adapter rules cover typed forms, the accounting inspector, unit charts and complete numeric alternative.
- `graph.mjs` uses the original `graph.js` Cytoscape/edgehandles foundation: incremental elements, preset positions, native selection/drag/pan/zoom/fit, original restrained preview styles and `hoverDelay:250`, `snap:false`, `noEdgeEventsInDraw:true`, `disableBrowserGestures:true`. Stock/flow/parameter/auxiliary shapes, explicit environment endpoints and expression-derived information links replace signed causal gains and 0–100 meters. A stock-to-stock draw opens a rate draft, then validated review, then explicit Apply. Environment endpoints are available through the form. Only entity coordinates enter `view.positions`; library internals, previews and environment nodes are never serialized. Stable-ID-sorted defaults survive canonical entity-array reordering.
- `charts.mjs` uses the original `charts.js` uPlot lifecycle, resize, explicit inspection and passive-hover boundary. Each exact stock unit gets its own amount scale and labeled time axis; the x-domain follows actual run time, including a one-row run. The 12-trace cap names omissions and the numeric table covers every stock. Hover never pauses; clicking a plot or scrubbing pauses and holds the selected historical row.
- `app.mjs` connects those original components to accepted stock-flow APIs: valid New blank and tank proposals, document/title controls, reviewed imports/share/hash changes, inspector forms, accounting and actual delayed reads, 50-edit undo/redo, safe autosave, transport/speed, responsive tabs and discoverable help. Cosmetic edits preserve run/history/cursor/playback; dynamics edits still require confirmation when history exists. An unchanged reviewed Apply also closes its dialog without resetting the run.
- `document.mjs` retains typed snapshot history, no-op suppression, dynamics comparison and application-computed differences. Full AI fingerprints remain separate from dynamics keys, so names/layout invalidate stale AI proposals too.
- `portable.mjs` retains bounded gzip/file fallback, strict stock-flow validation, complete-candidate review and SHA-256 freshness rechecks. The original AI dialog pattern is reused, but there is no provider integration: Generate context previews a handoff for an external AI, Build/Modify return complete model JSON, and Explain remains read-only actual bounded run evidence.

Intentional differences from the causal playground: typed amounts/rates and exact units, material versus information links, explicit environment endpoints, requested/applied/source-limiting accounting, fixed-tick information delays and an expanded accounting/numeric timeline. The causal engine, signed-gain schema and abstract baseline/0–100 chart semantics are not imported. Desktop shell/column/graph dimensions were compared with the original; the stock-flow timeline is taller because it contains unit groups and the numeric alternative. Local paths and shared vendor assets require serving the repository root, not this directory alone.

## Verification

From the repository root:

```sh
node --test stock-flow-playground/core.test.mjs stock-flow-playground/corrections.test.mjs stock-flow-playground/presentation.test.mjs causal-playground/tests/core.test.mjs causal-playground/tests/documentation.test.mjs causal-playground/workload-demo/model.test.mjs tests/ai-draft-contract.test.mjs
node --check stock-flow-playground/app.mjs
node --check stock-flow-playground/graph.mjs
node --check stock-flow-playground/charts.mjs
python3 -m http.server 8767 --bind 127.0.0.1
```

In another terminal, use an isolated browser session (these scripts replace that session's local document, not repository files):

```sh
agent-browser --session stock-flow-check set viewport 1440 1000
agent-browser --session stock-flow-check open http://127.0.0.1:8767/stock-flow-playground/
agent-browser --session stock-flow-check eval -b "$(base64 < stock-flow-playground/browser-smoke.js)"
agent-browser --session stock-flow-check eval -b "$(base64 < stock-flow-playground/browser-corrections.js)"
agent-browser --session stock-flow-check eval -b "$(base64 < stock-flow-playground/browser-foundation.js)"
```

Repeat all three evals after `agent-browser --session stock-flow-check set viewport 320 800`. The smoke and correction suites retain authoring, endpoints, history/ledger, reset/undo/redo/removal, complete JSON review, AI diff/apply/staleness/Explain, share and overflow assertions. `browser-foundation.js` additionally checks actual Cytoscape/uPlot activation and local-only resources, blank/review/form flow paths, exact-unit plots and actual time domains, explicit chart omissions plus complete numeric amounts, hostile labels as literal text, cosmetic playback retention and mobile tabs. `presentation.test.mjs` checks the restored shell/local assets and stable-ID position defaults.

Native pointer and recovery checks:

```sh
bash stock-flow-playground/browser-gestures.sh stock-flow-native http://127.0.0.1:8767/stock-flow-playground/ 1440
bash stock-flow-playground/browser-gestures.sh stock-flow-native-320 http://127.0.0.1:8767/stock-flow-playground/ 320
bash stock-flow-playground/browser-recovery.sh stock-flow-recovery http://127.0.0.1:8767/stock-flow-playground/
```

The native suite uses real rendered Cytoscape coordinates and pointer actions for running drag/save/reload, restrained edgehandles draw→rate→review→Apply, selection and chart hover/click. It also opens a shared document through delayed navigation and requires explicit review. Recovery checks retain corrupt saved bytes across edits/replacements until explicit enable, reject causal-schema/invalid shares without losing work, and reload a valid explicit replacement. Functional suites deliberately accept/reject reset confirmations and restore the original handler; this is not a claim of human-reviewed native dialog styling.

Worker-handoff disposition (before parent review/publication): locally verified and unpublished. The combined Node suites, Chromium DOM checks at 1440×1000 and 320×800, native checks at 1440×1000 and 320×1000, and recovery checks passed during restoration. Internal original/restored screenshots and layout measurements were inspected; no guided public demo was produced. Safari, Firefox, exhaustive accessibility, performance, pixel equivalence and exhaustive assertion-by-assertion mutation coverage have not been established. Targeted RED/GREEN checks distinguish concrete regressions; they do not establish complete formal guard adequacy.

Core checks cover syntax/precedence/references/unsafe input/depth/finite/cycles; strict keys/IDs/endpoints/units/bounds; old-state deterministic trajectories; internal conservation; empty stocks, independent multiple-source proportional allocation, external inflow, loops and large requested outflow; ledgers; Euler refinement; JSON/gzip corruption/bounds; AI grammar/review/staleness and actual Explain coverage. Correction guards additionally cover cosmetic dynamics-key/history separation, full-identity AI staleness, unit chart groups, view admission/roundtrip, fixed-delay zero/nonzero/prehistory/bounds/cycles/fixed-grid/roundtrip/AI grammar/actual Explain records and current-availability conservation. A deliberate delayed-read off-by-one mutation must fail its expected-trajectory assertion and be restored. A deliberate destination-credit mutation must fail the independent internal-conservation test and is restored afterward. These are targeted accounting and lag-index mutations, not exhaustive assertion-by-assertion mutation coverage. Browser verification outcomes are reported separately; passing core tests is not a claim of cross-browser compatibility.

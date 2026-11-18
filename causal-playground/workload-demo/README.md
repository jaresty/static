# Experimental workload model

A separate fixed, illustrative, divisible-work template. It does not alter or accept documents from the existing bounded-influence engine. No dependencies, backend, AI, persistence, network calls or conversion grammar.

## Predeclared numerical contract (before implementation runs)

UI domain: initial backlog 0–200 work; stress 0–1; arrivals before/after 0–20 work/day; nominal capacity 1–20 work/day; impairment alpha either 0 or .5; optional rate change at whole days 1–119. Fixed horizon 120 days; Tc=1, Tw=2, tau=2 days. No backlog ceiling or correction clamps.

Old-state explicit Euler h=1/4096 day, right-continuous scheduled change using integer step indices. Nonnegative B follows C<=B/Tc and h<=Tc; stress is a convex adjustment for h<=tau. Neither fact guarantees accuracy. UI retains quarter-day samples and compares with h/2, displaying maximum absolute differences at those common times. Pass thresholds: .1 work and .002 stress. A failed case is explicitly labeled not resolved to these criteria. Differences are estimates, not guaranteed errors; unsampled times are not certified.

Tests compare selected presets, edge combinations and mixed interior cases with h/2 and h/4 at the same thresholds. Exact empty S=S0*exp(-t/2) and service-limited B=4-2*exp(-t) checked at days .5,1,2,4,8: errors <=.002 stress/.1 work. No universal coverage claim across the continuous input domain. Ledger tolerance <=1e-10 per internal step and <=1e-8 cumulative work. These thresholds must not be retuned after observing results.

Runtime bounds: 491,520 steps on the displayed grid plus 983,040 for its comparison; 481 retained samples per grid. Test h/4 uses 1,966,080 steps. The low-level solver rejects smaller steps and off-grid samples. UI runs on explicit submit/preset only. Floating-point arithmetic, rounding, first-order error and the nonsmooth capacity minimum limit precision. No Richardson extrapolation or work-discarding correction. Displayed values round; residual uses unrounded values. Very small positive backlog is not an exact job-clearance promise.

## Verification

From repository root: `node --test causal-playground/workload-demo/model.test.mjs`.
Browser smoke: `bash causal-playground/workload-demo/browser-smoke.sh` (requires installed agent-browser and Python; loopback-only temporary static server). UI smoke is not accessibility certification.

The ledger guard is independent: it evaluates old/new state differences against integrated arrivals and completions. The planned omission-of-completions mutation must fail this same assertion, then be restored. Other test groups exercise positive/boundary cases; do not infer a complete assertion-specific mutation campaign or automatic regression execution from manually runnable tests. No CI or publishing changes are included.

## Meaning

B,S are states. W,P are auxiliaries. B is homogeneous divisible unfinished work, not an integer-job count. Initial backlog is a one-time stock; sustained arrivals continue to add work. Rates A,C,K are work/day; time is days. Stress and productivity are hypothetical dimensionless indices, not psychological measurements. Stress impairment is an uncalibrated assumption, not empirical science. Numerical agreement tests implementation/resolution only.

With K=10, alpha=.5, continuing A=4: equilibrium B=4 gives W=.2, S=1/6, P=11/12 and effective capacity=55/6>4. Hence C=min(55/6,4)=4 and dB/dt=0. It need not drain to zero while arrivals continue. Existing influence v1 remains legitimate for abstract levels; this is not a curve-superiority claim.

Omitted: job indivisibility, heterogeneity, deadlines, staffing, learning, uncertainty, calibration and predictive validation. No generic stock-flow engine is implemented.

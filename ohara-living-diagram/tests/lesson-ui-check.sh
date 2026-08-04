#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/.."
for property in l11 l12 l13 l14 l15 l16 l18 l19 l20; do
  node ohara-living-diagram/tests/lesson-check.mjs "$property"
done
bash ohara-living-diagram/tests/adaptive-ui-check.sh
OHARA_OVERLAY_TARGET=all bash ohara-living-diagram/tests/overlay-ui-check.sh
OHARA_SELF_TARGET=all bash ohara-living-diagram/tests/self-directed-ui-check.sh
for target in geometry review-control review-toggle angle-range angle-convention contrast-adaptive contrast-reference contrast-review style-availability style-geometry; do
  OHARA_QUALITY_TARGET="$target" bash ohara-living-diagram/tests/diagram-quality-check.sh
done
for target in back-boundary role-navigation role-kenzan review-claims reference-role reference-mirror plan-notation container-plan container-front container-spatial mobile-navigation first-viewport kenzan-label-gap reference-names elevation-side step-navigation kenzan-placed-stems header-sync reference-plan-length length-fractions; do
  OHARA_USABILITY_TARGET="$target" bash ohara-living-diagram/tests/usability-ui-check.sh
done
echo "PASS l17: all-style assembly workflow executes with reliable navigation, coherent container projections, contextual Reference, readable contrast, persistence, mobile fit, and offline reload"

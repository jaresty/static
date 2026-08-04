#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_USABILITY_PORT:-$((7400 + RANDOM % 500))}"
SESSION="ohara-usability-check-$$"
TARGET="${OHARA_USABILITY_TARGET:-role-navigation}"
FAULT="${OHARA_USABILITY_FAULT:-none}"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-usability-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null

check_back_boundary() {
  for _ in {1..5}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const b=document.querySelector('#step-back'),enabled=!b.disabled;b.click();return enabled&&document.querySelector('.role-track [aria-current=step]')?.dataset.role==='subject'&&document.querySelector('.adaptive-stage')?.dataset.step==='review'})()")" == "true" ]] \
    || { echo "FAIL u1-back-boundary: Back is disabled or does not return Fuku Length to Subject Review" >&2; exit 1; }
}

check_role_navigation() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get attr '.role-track [aria-current="step"]' data-role)" == "object" \
    && "$(agent-browser --session "$SESSION" get attr '.adaptive-stage' data-step)" == "length" ]] \
    || { echo "FAIL u2-role-navigation: Object selector did not open the role at Length" >&2; exit 1; }
}

check_role_kenzan() {
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  copy="$(agent-browser --session "$SESSION" get text '.adaptive-copy')"
  header="$(agent-browser --session "$SESSION" get text '.adaptive-header')"
  [[ "$copy" != *"Set the whole Kenzan"* && "$copy" != *"Place the flower holder"* && "$copy" == *"Keep the whole Kenzan fixed"* \
    && "$header" != *"Place the flower holder"* && "$header" == *"Locate the stem entry area"* ]] \
    || { echo "FAIL u3-role-kenzan: Fuku instructs the learner to reposition the whole holder" >&2; exit 1; }
}

check_review_claims() {
  for _ in {1..4}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
  copy="$(agent-browser --session "$SESSION" get text '.adaptive-copy')"
  [[ "$copy" != *"entry point"* && "$copy" == *"Kenzan context"* ]] \
    || { echo "FAIL u4-review-claims: Review claims an untaught entry-point decision" >&2; exit 1; }
}

check_reference_role() {
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" reload >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "[...document.querySelectorAll('.stem.is-focused')].length===3&&[...document.querySelectorAll('.stem.is-focused')].every(e=>e.dataset.role==='secondary')")" == "true" ]] \
    || { echo "FAIL u5-reference-role: restored Fuku context resets to Subject in Reference" >&2; exit 1; }
}

check_reference_mirror() {
  agent-browser --session "$SESSION" click '[data-style-index="2"]' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#orientation-toggle' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const text=document.querySelector('#reference-rows tr td:nth-child(3)').textContent.trim(),line=document.querySelector('.shared-views svg[aria-label^=\"Bird\"] .stem[data-role=\"subject\"] line'),dx=+line.getAttribute('x2')-+line.getAttribute('x1'),dy=+line.getAttribute('y2')-+line.getAttribute('y1'),angle=Math.atan2(-dx,dy)*180/Math.PI;return text==='45° right of front'&&Math.abs(angle+45)<.2})()")" == "true" ]] \
    || { echo "FAIL u6-reference-mirror: mirrored assembly reverts to standard Reference directions" >&2; exit 1; }
}

check_plan_notation() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get text '.angle-label')" == "8° RIGHT" ]] \
    || { echo "FAIL u7-plan-notation: diagram uses raw signed notation instead of prose direction" >&2; exit 1; }
}

check_container_plan() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  lesson_round="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.focus-diagram .container-shape'),r=e?.getBoundingClientRect();return e?.tagName.toLowerCase()==='circle'&&e.dataset.geometry==='circular-rim'&&Math.abs(r.width-r.height)<1})()")"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  reference_round="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.shared-views svg[aria-label^=\"Bird\"] .container-shape'),r=e?.getBoundingClientRect();return e?.tagName.toLowerCase()==='circle'&&e.dataset.geometry==='circular-rim'&&Math.abs(r.width-r.height)<1})()")"
  [[ "$lesson_round" == "true" && "$reference_round" == "true" ]] \
    || { echo "FAIL u8-container-plan: plan does not expose one circular cylinder rim" >&2; exit 1; }
}

front_cylinder_present() {
  local root="$1"
  agent-browser --session "$SESSION" eval "(()=>{const root=document.querySelector('$root'),rim=root?.querySelector('.container-rim'),side=root?.querySelector('.container-sidewall'),base=root?.querySelector('.container-base');return !!rim&&!!side&&!!base&&rim.getBoundingClientRect().width>0&&side.getBoundingClientRect().height>0&&base.getBoundingClientRect().width>0})()"
}

check_container_front() {
  for _ in {1..3}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
  lesson_front="$(front_cylinder_present '.focus-diagram')"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  reference_front="$(front_cylinder_present '.shared-views svg[aria-label^=\"Front\"]')"
  [[ "$lesson_front" == "true" && "$reference_front" == "true" ]] \
    || { echo "FAIL u9-container-front: front view does not show rim, shallow sidewall, and base" >&2; exit 1; }
}

spatial_cylinder_present() {
  local root="$1"
  agent-browser --session "$SESSION" eval "(()=>{const root=document.querySelector('$root'),rim=root?.querySelector('ellipse.container-rim'),side=root?.querySelector('.container-sidewall'),base=root?.querySelector('ellipse.container-base');return !!rim&&!!side&&!!base&&rim.getBoundingClientRect().width>0&&side.getBoundingClientRect().height>0&&base.getBoundingClientRect().width>0})()"
}

check_container_spatial() {
  for _ in {1..4}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
  lesson_spatial="$(spatial_cylinder_present '#review-placement-diagram svg')"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  reference_spatial="$(spatial_cylinder_present '.shared-views svg[aria-label^=\"Spatial\"]')"
  [[ "$lesson_spatial" == "true" && "$reference_spatial" == "true" ]] \
    || { echo "FAIL u10-container-spatial: spatial view does not show elliptical rim, sidewall, and base" >&2; exit 1; }
}

check_mobile_navigation() {
  agent-browser --session "$SESSION" set viewport 390 844 >/dev/null
  agent-browser --session "$SESSION" scrollintoview '.adaptive-header' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const visible=e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};return visible(document.querySelector('#step-back'))&&visible(document.querySelector('#step-next'))})()")" == "true" ]] \
    || { echo "FAIL u11-mobile-navigation: Back and Next are not persistently visible" >&2; exit 1; }
}

check_first_viewport() {
  agent-browser --session "$SESSION" set viewport 1440 1000 >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.start-guide'),r=e?.getBoundingClientRect();return !!r&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&/Start with Subject length/i.test(e.textContent)})()")" == "true" ]] \
    || { echo "FAIL u12-first-viewport: initial desktop view has no visible route into the lesson" >&2; exit 1; }
}

check_kenzan_label_gap() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const container=document.querySelector('.kenzan-container')?.getBoundingClientRect(),label=document.querySelector('.kenzan-label')?.getBoundingClientRect();return !!container&&!!label&&label.top>=container.bottom+4})()")" == "true" ]] \
    || { echo "FAIL u13-kenzan-label: whole-Kenzan label touches the container boundary" >&2; exit 1; }
}

check_reference_names() {
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const names=[...document.querySelectorAll('.shared-views .stem[role=button]')].map(e=>e.getAttribute('aria-label'));return names.length===9&&new Set(names).size===9})()")" == "true" ]] \
    || { echo "FAIL u14-reference-names: Reference stem controls have duplicate accessible names" >&2; exit 1; }
}

check_elevation_side() {
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  for _ in {1..3}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
  fuku_left="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2') < +document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  object_right="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2') > +document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  agent-browser --session "$SESSION" click '#orientation-toggle' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  mirrored_fuku_right="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2') > +document.querySelector('.focus-stem').getAttribute('x1')")"
  [[ "$fuku_left" == "true" && "$object_right" == "true" && "$mirrored_fuku_right" == "true" ]] \
    || { echo "FAIL u15-elevation-side: elevation ray does not follow the stem's left/right plan side" >&2; exit 1; }
}

check_step_navigation() {
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>['review','kenzan','elevation','length','plan'].every(step=>{const control=document.querySelector('.step-track [data-step=\"'+step+'\"]');if(!control)return false;control.click();return document.querySelector('.role-track [aria-current=step]')?.dataset.role==='object'&&document.querySelector('.adaptive-stage')?.dataset.step===step}))()")" == "true" ]] \
    || { echo "FAIL u16-step-navigation: phases are not directly selectable within a stem" >&2; exit 1; }
}

check_kenzan_placed_stems() {
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  subject_ok="$(agent-browser --session "$SESSION" eval "document.querySelectorAll('.placed-stem').length===0")"
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  if [[ "$FAULT" == "placed-stems" ]]; then agent-browser --session "$SESSION" eval "document.querySelectorAll('.placed-stem').forEach(e=>e.remove())" >/dev/null; fi
  fuku_ok="$(agent-browser --session "$SESSION" eval "JSON.stringify([...document.querySelectorAll('.placed-stem')].map(e=>e.dataset.role))==='[\"subject\"]'")"
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  object_ok="$(agent-browser --session "$SESSION" eval "JSON.stringify([...document.querySelectorAll('.placed-stem')].map(e=>e.dataset.role))==='[\"subject\",\"secondary\"]'")"
  [[ "$subject_ok" == "true" && "$fuku_ok" == "true" && "$object_ok" == "true" ]] \
    || { echo "FAIL u17-kenzan-history: Kenzan view does not show exactly the already-placed stems" >&2; exit 1; }
}

check_header_sync() {
  agent-browser --session "$SESSION" click '.step-track [data-step="review"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  fuku_length="$(agent-browser --session "$SESSION" eval "document.querySelector('.adaptive-header h3').textContent.trim()==='Length'&&document.querySelector('.adaptive-stage').dataset.step==='length'&&document.querySelector('.step-track [aria-current=step]')?.dataset.step==='length'")"
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  fuku_elevation="$(agent-browser --session "$SESSION" eval "document.querySelector('.adaptive-header h3').textContent.trim()==='Elevation'&&document.querySelector('.adaptive-stage').dataset.step==='elevation'&&document.querySelector('.step-track [aria-current=step]')?.dataset.step==='elevation'")"
  [[ "$fuku_length" == "true" && "$fuku_elevation" == "true" ]] \
    || { echo "FAIL u18-header-sync: role or phase navigation leaves a stale Review header" >&2; exit 1; }
}

check_reference_plan_projection_length() {
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const ratios=[1,.67,.5],elevations=[90,45,30],lines=[...document.querySelectorAll('.shared-views svg[aria-label^=\"Bird\"] .stem line')];return lines.length===3&&lines.every((line,index)=>{const length=Math.hypot(+line.getAttribute('x2')-+line.getAttribute('x1'),+line.getAttribute('y2')-+line.getAttribute('y1')),expected=35*ratios[index]*Math.cos(elevations[index]*Math.PI/180);return Math.abs(length-expected)<.02})})()")" == "true" ]] \
    || { echo "FAIL u19-reference-plan-length: bird's-eye rays ignore elevation projection" >&2; exit 1; }
}

check_length_fractions() {
  [[ "$(agent-browser --session "$SESSION" get count '.length-ratio')" == "1" ]] \
    || { echo "FAIL u20-length-fractions: classroom fractions are missing from stem measurement" >&2; exit 1; }
  if [[ "$FAULT" == "length-fractions" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.length-ratio').textContent='WRONG'" >/dev/null; fi
  subject_fraction="$(agent-browser --session "$SESSION" get text '.length-ratio')"
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  fuku_fraction="$(agent-browser --session "$SESSION" get text '.length-ratio')"
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  object_fraction="$(agent-browser --session "$SESSION" get text '.length-ratio')"
  agent-browser --session "$SESSION" click '[data-style-index="1"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  half_fuku_fraction="$(agent-browser --session "$SESSION" get text '.length-ratio')"
  [[ "$subject_fraction" == "BASE MEASURE" && "$fuku_fraction" == "2/3 OF SUBJECT" && "$object_fraction" == "1/2 OF SUBJECT" && "$half_fuku_fraction" == "1/2 OF SUBJECT" ]] \
    || { echo "FAIL u20-length-fractions: classroom fractions are missing from stem measurement" >&2; exit 1; }
}

case "$TARGET" in
  back-boundary) check_back_boundary ;;
  role-navigation) check_role_navigation ;;
  role-kenzan) check_role_kenzan ;;
  review-claims) check_review_claims ;;
  reference-role) check_reference_role ;;
  reference-mirror) check_reference_mirror ;;
  plan-notation) check_plan_notation ;;
  container-plan) check_container_plan ;;
  container-front) check_container_front ;;
  container-spatial) check_container_spatial ;;
  mobile-navigation) check_mobile_navigation ;;
  first-viewport) check_first_viewport ;;
  kenzan-label-gap) check_kenzan_label_gap ;;
  reference-names) check_reference_names ;;
  elevation-side) check_elevation_side ;;
  step-navigation) check_step_navigation ;;
  kenzan-placed-stems) check_kenzan_placed_stems ;;
  header-sync) check_header_sync ;;
  reference-plan-length) check_reference_plan_projection_length ;;
  length-fractions) check_length_fractions ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS $TARGET: usability property holds"

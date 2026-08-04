#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_WORKSPACE_PORT:-$((7900 + RANDOM % 300))}"
SESSION="ohara-workspace-check-$$"
TARGET="${OHARA_WORKSPACE_TARGET:-viewport-top}"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-workspace-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/?workspace-check=$RANDOM" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null
agent-browser --session "$SESSION" eval "localStorage.clear();location.reload()" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null

fail() { echo "FAIL $1" >&2; exit 1; }

check_viewport_top() {
  for viewport in "390 844" "1440 900"; do
    agent-browser --session "$SESSION" set viewport $viewport >/dev/null
    agent-browser --session "$SESSION" eval "scrollTo(0,0)" >/dev/null
    top="$(agent-browser --session "$SESSION" eval "document.querySelector('[data-adaptive-canvas]')?.getBoundingClientRect().top ?? null")"
    [[ "$top" != "null" && "$(awk "BEGIN {print ($top <= 180)}")" == "1" ]] || fail "w1-viewport-top: work region begins at ${top}px for ${viewport/ /x}"
  done
}

check_stage_stability() {
  agent-browser --session "$SESSION" set viewport 1440 900 >/dev/null
  stable="$(agent-browser --session "$SESSION" eval "(()=>{const ys=[];for(const step of ['length','kenzan','plan','elevation','review']){document.querySelector('.step-track [data-step=\"'+step+'\"]').click();ys.push(document.querySelector('.adaptive-nav').getBoundingClientRect().top)}return Math.max(...ys)-Math.min(...ys)<=1})()")"
  [[ "$stable" == "true" ]] || fail "w2-stage-stability: Back and Next move between phases"
}

check_new_arrangement_control() {
  visible="$(agent-browser --session "$SESSION" eval "(()=>{const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0};const button=document.querySelector('[aria-label=\"New arrangement\"]');if(!visible(button))return false;document.querySelector('[data-mode=reference]').click();return visible(document.querySelector('[aria-label=\"New arrangement\"]'))})()")"
  agent-browser --session "$SESSION" set viewport 390 844 >/dev/null
  compact="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.new-arrangement-compact');if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0})()")"
  [[ "$visible" == "true" && "$compact" == "true" ]] || fail "w3-new-arrangement-control: New arrangement is not always visibly labelled"
}

check_new_arrangement_reset() {
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '[data-style-index="2"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  agent-browser --session "$SESSION" click '#orientation-toggle' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  agent-browser --session "$SESSION" click '[aria-label="New arrangement"]' >/dev/null
  result="$(agent-browser --session "$SESSION" eval "(()=>{const style=document.querySelector('[data-adaptive-canvas]')?.dataset.style,step=document.querySelector('.adaptive-stage')?.dataset.step,role=document.querySelector('.role-track [aria-current=step]')?.dataset.role,diameter=document.querySelector('#container-diameter')?.value,depth=document.querySelector('#container-depth')?.value,mode=document.body.dataset.mode;return style==='upright'&&step==='length'&&role==='subject'&&diameter==='30'&&depth==='10'&&mode==='lesson'})()")"
  [[ "$result" == "true" ]] || fail "w4-new-arrangement-reset: reset did not restore defaults"
}

check_mobile_nonoverlap() {
  agent-browser --session "$SESSION" set viewport 390 844 >/dev/null
  agent-browser --session "$SESSION" eval "scrollTo(0,0)" >/dev/null
  clear="$(agent-browser --session "$SESSION" eval "(()=>{const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,nav=document.querySelector('.adaptive-nav').getBoundingClientRect(),modes=[...document.querySelectorAll('button[data-mode]')];return modes.every(mode=>!intersects(mode.getBoundingClientRect(),nav))})()")"
  [[ "$clear" == "true" ]] || fail "w5-mobile-nonoverlap: fixed step navigation overlaps a mode control"
}

check_persistence() {
  agent-browser --session "$SESSION" click '[data-style-index="2"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  agent-browser --session "$SESSION" reload >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null
  persisted="$(agent-browser --session "$SESSION" eval "(()=>{const style=document.querySelector('[data-adaptive-canvas]').dataset.style,role=document.querySelector('.role-track [aria-current=step]').dataset.role,step=document.querySelector('.adaptive-stage').dataset.step;return style==='water-reflecting'&&role==='object'&&step==='elevation'})()")"
  [[ "$persisted" == "true" ]] || fail "w6-persistence: reload did not preserve complete context"
}

check_role_names() {
  truthful="$(agent-browser --session "$SESSION" eval "[...document.querySelectorAll('.role-track button')].every(button=>/Start .+ at Length/.test(button.getAttribute('aria-label')))" )"
  [[ "$truthful" == "true" ]] || fail "w7-role-names: role controls do not state that they start at Length"
}

check_base_measure() {
  agent-browser --session "$SESSION" click '.role-track [data-role="subject"]' >/dev/null
  agent-browser --session "$SESSION" fill '#lesson-length-input' 50 >/dev/null
  agent-browser --session "$SESSION" press Tab >/dev/null
  base="$(agent-browser --session "$SESSION" get text '#lesson-length-value')"
  target="$(agent-browser --session "$SESSION" get value '#lesson-length-input')"
  [[ "$base" == "40 cm" && "$target" == "50" ]] || fail "w8-base-measure: base=$base target=$target"
}

check_nonnegative_dimensions() {
  agent-browser --session "$SESSION" fill '#container-diameter' -20 >/dev/null
  agent-browser --session "$SESSION" press Tab >/dev/null
  diameter="$(agent-browser --session "$SESSION" get value '#container-diameter')"
  length="$(agent-browser --session "$SESSION" get text '#lesson-length-value')"
  [[ "$(awk "BEGIN {print ($diameter >= 1)}")" == "1" && "$length" != *-* ]] || fail "w9-dimension-validation: diameter=$diameter length=$length"
}

check_style_fit() {
  agent-browser --session "$SESSION" set viewport 390 844 >/dev/null
  fits="$(agent-browser --session "$SESSION" eval "(()=>{const rail=document.querySelector('.style-rail');return rail.scrollWidth<=rail.clientWidth})()")"
  [[ "$fits" == "true" ]] || fail "w10-style-fit: style selector overflows mobile viewport"
}

check_mobile_targets() {
  agent-browser --session "$SESSION" set viewport 390 844 >/dev/null
  large="$(agent-browser --session "$SESSION" eval "(()=>{const targets=[...document.querySelectorAll('.role-track button,.step-track button')];return targets.every(target=>{const r=target.getBoundingClientRect();return r.width>=44&&r.height>=44})})()")"
  [[ "$large" == "true" ]] || fail "w11-mobile-targets: direct navigation target is smaller than 44x44"
}

check_style_tab_stability() {
  for viewport in "390 844" "1440 900"; do
    agent-browser --session "$SESSION" set viewport $viewport >/dev/null
    stable="$(agent-browser --session "$SESSION" eval "(()=>{const heights=[];for(const button of document.querySelectorAll('.style-rail button')){button.click();heights.push(...[...document.querySelectorAll('.style-rail button')].map(tab=>tab.getBoundingClientRect().height))}return Math.max(...heights)-Math.min(...heights)<=1})()")"
    [[ "$stable" == "true" ]] || fail "w12-style-tab-stability: style tab height changes when selection changes at ${viewport/ /x}"
  done
}

check_water_plan_clear() {
  agent-browser --session "$SESSION" click '[data-style-index="2"]' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  clear="$(agent-browser --session "$SESSION" eval "(()=>{const line=role=>document.querySelector('.shared-views svg[aria-label^=\"Bird\"] .stem[data-role=\"'+role+'\"] line'),point=(e,n)=>({x:+e.getAttribute('x'+n),y:+e.getAttribute('y'+n)}),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),intersects=(a,b)=>{const p1=point(a,1),p2=point(a,2),q1=point(b,1),q2=point(b,2),d1=cross(p1,p2,q1),d2=cross(p1,p2,q2),d3=cross(q1,q2,p1),d4=cross(q1,q2,p2);return d1*d2<=0&&d3*d4<=0};return !intersects(line('subject'),line('object'))})()")"
  [[ "$clear" == "true" ]] || fail "w13-water-plan-clear: Water-reflecting Shu and Kyaku cross in bird's-eye view"
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="kenzan"]' >/dev/null
  agent-browser --session "$SESSION" click '#orientation-toggle' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  clear="$(agent-browser --session "$SESSION" eval "(()=>{const line=role=>document.querySelector('.shared-views svg[aria-label^=\"Bird\"] .stem[data-role=\"'+role+'\"] line'),point=(e,n)=>({x:+e.getAttribute('x'+n),y:+e.getAttribute('y'+n)}),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),intersects=(a,b)=>{const p1=point(a,1),p2=point(a,2),q1=point(b,1),q2=point(b,2),d1=cross(p1,p2,q1),d2=cross(p1,p2,q2),d3=cross(q1,q2,p1),d4=cross(q1,q2,p2);return d1*d2<=0&&d3*d4<=0};return !intersects(line('subject'),line('object'))})()")"
  [[ "$clear" == "true" ]] || fail "w13-water-plan-clear: mirrored Water-reflecting Shu and Kyaku cross in bird's-eye view"
}

check_finish_transition() {
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="object"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="review"]' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  finished="$(agent-browser --session "$SESSION" eval "(()=>{const counts=['#plan-view','#front-view','#spatial-view'].map(id=>document.querySelectorAll(id+' .stem').length);return document.body.dataset.mode==='reference'&&counts.every(count=>count===3)})()")"
  [[ "$finished" == "true" ]] || fail "w14-finish-transition: Finish does not open the complete Reference overview"
}

check_global_mirror_control() {
  global="$(agent-browser --session "$SESSION" eval "(()=>{const controls=[...document.querySelectorAll('#orientation-toggle')];return controls.length===1&&!controls[0].closest('.adaptive-stage')})()")"
  [[ "$global" == "true" ]] || fail "w15-global-mirror: mirror control is missing, duplicated, or phase-local in Assemble"
  agent-browser --session "$SESSION" eval "window.scrollTo(0,300)" >/dev/null
  reachable="$(agent-browser --session "$SESSION" eval "document.querySelector('#orientation-toggle').getBoundingClientRect().top>=0")"
  [[ "$reachable" == "true" ]] || fail "w15-global-mirror: mirror control scrolls out of reach while working"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  global="$(agent-browser --session "$SESSION" eval "(()=>{const controls=[...document.querySelectorAll('#orientation-toggle')];return controls.length===1&&!controls[0].closest('.adaptive-stage')&&controls[0].getBoundingClientRect().width>0})()")"
  [[ "$global" == "true" ]] || fail "w15-global-mirror: mirror control is not persistent in Reference"
}

check_mirror_synchronization() {
  agent-browser --session "$SESSION" click '[data-style-index="0"]' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="secondary"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="plan"]' >/dev/null
  normal_plan="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2')-+document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  normal_elevation="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2')-+document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.step-track [data-step="review"]' >/dev/null
  normal_review="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.review-visual .stem[data-role=secondary] line');return +e.getAttribute('x2')-+e.getAttribute('x1')})()")"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  normal_reference="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('#plan-view .stem[data-role=secondary] line');return +e.getAttribute('x2')-+e.getAttribute('x1')})()")"
  agent-browser --session "$SESSION" click '#orientation-toggle' >/dev/null
  mirrored_reference="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('#plan-view .stem[data-role=secondary] line');return +e.getAttribute('x2')-+e.getAttribute('x1')})()")"
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="plan"]' >/dev/null
  mirrored_plan="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2')-+document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  mirrored_elevation="$(agent-browser --session "$SESSION" eval "+document.querySelector('.focus-stem').getAttribute('x2')-+document.querySelector('.focus-stem').getAttribute('x1')")"
  agent-browser --session "$SESSION" click '.step-track [data-step="review"]' >/dev/null
  mirrored_review="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.review-visual .stem[data-role=secondary] line');return +e.getAttribute('x2')-+e.getAttribute('x1')})()")"
  synchronized="$(awk "BEGIN {print ($normal_plan*$mirrored_plan<0 && $normal_elevation*$mirrored_elevation<0 && $normal_review*$mirrored_review<0 && $normal_reference*$mirrored_reference<0)}")"
  [[ "$synchronized" == "1" ]] || fail "w16-mirror-sync: global mirror is not synchronized across Plan, Elevation, Review, and Reference"
}

check_vertical_insertion_markers() {
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  for spec in "1 secondary" "2 secondary"; do
    read -r style role <<<"$spec"
    agent-browser --session "$SESSION" click "[data-style-index=\"$style\"]" >/dev/null
    marked="$(agent-browser --session "$SESSION" eval "(()=>{const stem=document.querySelector('#plan-view .stem[data-role=\"$role\"]'),line=stem.querySelector('line'),markers=stem.querySelectorAll('.insertion-point'),marker=markers[0];return stem.querySelectorAll('.stem-endpoint').length===0&&markers.length===1&&+marker.getAttribute('cx')===+line.getAttribute('x1')&&+marker.getAttribute('cy')===+line.getAttribute('y1')&&stem.querySelector('.vertical-cue')?.textContent==='VERTICAL'})()")"
    [[ "$marked" == "true" ]] || fail "w17-insertion-marker: vertical $role is rendered as nested base and tip in style $style"
  done
  for style in 0 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$style\"]" >/dev/null
    distinct="$(agent-browser --session "$SESSION" eval "(()=>{const stem=document.querySelector('#plan-view .stem[data-role=subject]');return stem.querySelectorAll('.stem-endpoint').length===1&&stem.querySelectorAll('.insertion-point').length===0&&!stem.querySelector('.vertical-cue')})()")"
    [[ "$distinct" == "true" ]] || fail "w17-insertion-marker: nonvertical Subject lost its separate endpoint marker in style $style"
  done
}

check_reference_teaching_note() {
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  styled="$(agent-browser --session "$SESSION" eval "(()=>{const note=document.querySelector('.reference-teaching-note');if(!note)return false;const style=getComputedStyle(note),r=note.getBoundingClientRect();return r.width>0&&r.height>0&&note.querySelectorAll('h3').length===2&&style.backgroundColor!=='rgba(0, 0, 0, 0)'&&parseFloat(style.borderTopWidth)>0})()")"
  [[ "$styled" == "true" ]] || fail "w18-reference-note: provisional geometry guidance is not an intentionally styled teaching note"
}

check_no_return_link() {
  [[ "$(agent-browser --session "$SESSION" get count 'a.start-guide')" == "0" ]] || fail "w19-return-link: redundant Return to Subject length link remains"
}

check_upright_shu_inclination() {
  agent-browser --session "$SESSION" click '[data-style-index="0"]' >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  agent-browser --session "$SESSION" click '.role-track [data-role="subject"]' >/dev/null
  agent-browser --session "$SESSION" click '.step-track [data-step="elevation"]' >/dev/null
  label="$(agent-browser --session "$SESSION" get text '.angle-label')"
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
  table="$(agent-browser --session "$SESSION" get text '#reference-rows tr:first-child td:last-child')"
  length="$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('#plan-view .stem[data-role=subject] line');return Math.hypot(+e.getAttribute('x2')-+e.getAttribute('x1'),+e.getAttribute('y2')-+e.getAttribute('y1'))})()")"
  valid="$(awk "BEGIN {print (\"$label\"==\"80°\" && \"$table\"==\"80°\" && $length>6 && $length<6.2)}")"
  [[ "$valid" == "1" ]] || fail "w20-upright-shu: Upright Shu is not rendered at provisional 80-degree elevation"
}

case "$TARGET" in
  viewport-top) check_viewport_top ;;
  stage-stability) check_stage_stability ;;
  new-arrangement-control) check_new_arrangement_control ;;
  new-arrangement-reset) check_new_arrangement_reset ;;
  mobile-nonoverlap) check_mobile_nonoverlap ;;
  persistence) check_persistence ;;
  role-names) check_role_names ;;
  base-measure) check_base_measure ;;
  dimension-validation) check_nonnegative_dimensions ;;
  style-fit) check_style_fit ;;
  mobile-targets) check_mobile_targets ;;
  style-tab-stability) check_style_tab_stability ;;
  water-plan-clear) check_water_plan_clear ;;
  finish-transition) check_finish_transition ;;
  global-mirror-control) check_global_mirror_control ;;
  mirror-synchronization) check_mirror_synchronization ;;
  vertical-insertion-markers) check_vertical_insertion_markers ;;
  reference-teaching-note) check_reference_teaching_note ;;
  no-return-link) check_no_return_link ;;
  upright-shu-inclination) check_upright_shu_inclination ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS $TARGET: workspace property holds"

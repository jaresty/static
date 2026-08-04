#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_QUALITY_PORT:-$((6800 + RANDOM % 500))}"
SESSION="ohara-quality-check-$$"
TARGET="${OHARA_QUALITY_TARGET:-geometry}"
FAULT="${OHARA_QUALITY_FAULT:-none}"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-quality-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null

contrast_ok() {
  local selector="$1" ground="$2"
  agent-browser --session "$SESSION" eval "(()=>{const rgb=s=>{const m=s.match(/[\\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]},lum=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4},ratio=(a,b)=>{const x=.2126*lum(a[0])+.7152*lum(a[1])+.0722*lum(a[2]),y=.2126*lum(b[0])+.7152*lum(b[1])+.0722*lum(b[2]);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)},bg=rgb(getComputedStyle(document.querySelector('${ground}')).backgroundColor),els=[...document.querySelectorAll('${selector}')].filter(e=>e.getBoundingClientRect().width>0);return els.length>0&&els.every(e=>ratio(rgb(getComputedStyle(e).fill),bg)>=4.5)})()"
}

angle_matches() {
  local signed="$1"
  agent-browser --session "$SESSION" eval "(()=>{const r=document.querySelector('.reference-axis');const s=document.querySelector('.focus-stem');const label=parseFloat(document.querySelector('.angle-label').textContent);const a=e=>Math.atan2(+e.getAttribute('y2')-+e.getAttribute('y1'),+e.getAttribute('x2')-+e.getAttribute('x1'))*180/Math.PI;const delta=((a(s)-a(r)+540)%360)-180;return Math.abs(Math.abs(delta)-label)<0.2})()"
}

go_to_review() {
  for _ in {1..4}; do agent-browser --session "$SESSION" click '#step-next' >/dev/null; done
}

go_to_final_review() {
  for _ in {1..20}; do
    if [[ "$(agent-browser --session "$SESSION" get attr '.adaptive-stage' data-step)" == "review" && "$(agent-browser --session "$SESSION" get text '.adaptive-header .eyebrow')" == *"OBJECT"* ]]; then return; fi
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
  done
  echo "FAIL p4-navigation: final Object Review was not reached" >&2
  exit 1
}

check_review_control() {
  go_to_review
  [[ "$(agent-browser --session "$SESSION" get count '#annotation-toggle[type="checkbox"][aria-controls="review-placement-diagram"]')" == "1" ]] || { echo "FAIL p3-review-control: accessible annotation toggle is absent or duplicated" >&2; exit 1; }
}

open_reference() {
  agent-browser --session "$SESSION" click '[data-mode="reference"]' >/dev/null
}

check_angle_range() {
  open_reference
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "[...document.querySelectorAll('#reference-rows tr td:nth-child(3)')].every(e=>Math.abs(parseFloat(e.textContent))<=90)")" == "true" ]] || { echo "FAIL p5-range: a displayed plan angle exceeds 90 degrees" >&2; exit 1; }
  done
}

reset_to_length() {
  for _ in {1..4}; do
    [[ "$(agent-browser --session "$SESSION" get attr '.adaptive-stage' data-step)" == "length" ]] && return
    agent-browser --session "$SESSION" click '#step-back' >/dev/null
  done
}

check_style_availability() {
  local ids=(upright slanting water-reflecting)
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
    [[ "$(agent-browser --session "$SESSION" get attr '[data-adaptive-canvas]' data-style)" == "${ids[$index]}" ]] || { echo "FAIL p7-availability: selected style has no matching assembly walkthrough" >&2; exit 1; }
  done
}

check_style_geometry() {
  local readings=('8°|RIGHT OF CONTAINER FRONT' '45°|LEFT OF CONTAINER FRONT' '45°|LEFT OF CONTAINER FRONT')
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
    reset_to_length
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    reading="$(agent-browser --session "$SESSION" get text '.step-reading')"
    IFS='|' read -r degrees direction <<<"${readings[$index]}"
    [[ "$reading" == *"$degrees"* && "$reading" == *"$direction"* ]] || { echo "FAIL p7-geometry: selected walkthrough does not use its style geometry" >&2; exit 1; }
  done
}

go_to_role_step() {
  local role="$1" wanted="$2"
  for _ in {1..24}; do
    local step header
    step="$(agent-browser --session "$SESSION" get attr '.adaptive-stage' data-step)"
    header="$(agent-browser --session "$SESSION" get text '.adaptive-header .eyebrow')"
    [[ "$step" == "$wanted" && "$header" == *"$role"* ]] && return
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
  done
  echo "FAIL geometry-navigation: $role $wanted was not reached" >&2
  exit 1
}

check_kenzan_holder() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  if [[ "$FAULT" == "holder-marker" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.kenzan-target')?.remove()" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-target')" == "0" ]] || { echo "FAIL p1-kenzan-target: stem target remains on holder-placement step" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-holder[data-object="whole-kenzan"]')" == "1" ]] || { echo "FAIL p1-kenzan-holder: whole Kenzan is not the single depicted object" >&2; exit 1; }
}

check_role_track() {
  [[ "$(agent-browser --session "$SESSION" get count '.role-track li')" == "3" ]] || { echo "FAIL p17-role-track: Subject, Fuku, and Object workflow roles are absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" eval "document.querySelector('.role-track').textContent")" == *"Subject"* && "$(agent-browser --session "$SESSION" eval "document.querySelector('.role-track').textContent")" == *"Fuku"* && "$(agent-browser --session "$SESSION" eval "document.querySelector('.role-track').textContent")" == *"Object"* ]] || { echo "FAIL p17-role-track: role names are incomplete" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get attr '.role-track [aria-current="step"]' data-role)" == "subject" ]] || { echo "FAIL p17-role-track: Subject is not the initial current role" >&2; exit 1; }
}

check_kenzan_round() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.kenzan-container');if(!e)return false;const r=e.getBoundingClientRect();return e.tagName.toLowerCase()==='circle'&&Math.abs(r.width-r.height)<1})()")" == "true" ]] || { echo "FAIL p14-kenzan-round: container plan is not circular" >&2; exit 1; }
}

check_kenzan_position_label() {
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
    reset_to_length
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.kenzan-location-label');return !!e&&e.getBoundingClientRect().width>0&&/position:\s*(center|rear|front|left|right)/i.test(e.textContent)})()")" == "true" ]] || { echo "FAIL p15-kenzan-position: selected style does not state the holder location" >&2; exit 1; }
  done
}

check_kenzan_location() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const container=document.querySelector('.kenzan-container')?.getBoundingClientRect(),holder=document.querySelector('.kenzan-holder')?.getBoundingClientRect();if(!container||!holder)return false;const contained=holder.left>=container.left&&holder.right<=container.right&&holder.top>=container.top&&holder.bottom<=container.bottom;return contained&&holder.width*holder.height<container.width*container.height*.45})()")" == "true" ]] || { echo "FAIL p13-kenzan-location: whole holder has no visible placement context inside the container" >&2; exit 1; }
}

check_kenzan_vector() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-measure line,.kenzan-vector')" == "0" ]] || { echo "FAIL p2-kenzan-vector: center-to-target vector remains visible" >&2; exit 1; }
}

check_kenzan_contrast() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-label')" == "1" && "$(contrast_ok '.kenzan-label,.front-label' '.adaptive-visual')" == "true" ]] || { echo "FAIL p3-kenzan-contrast: Kenzan labels are absent or below 4.5 contrast" >&2; exit 1; }
}

check_role_reading() {
  local style="$1" role="$2" degrees="$3" direction="$4" failure="$5"
  agent-browser --session "$SESSION" click "[data-style-index=\"$style\"]" >/dev/null
  agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
  go_to_role_step "$role" plan
  local reading
  reading="$(agent-browser --session "$SESSION" get text '.step-reading')"
  [[ "$reading" == *"$degrees"* && "$reading" == *"$direction"* ]] || { echo "$failure" >&2; exit 1; }
}

check_source_boundaries() {
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    agent-browser --session "$SESSION" click '[data-mode="lesson"]' >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.source-boundary');return !!e&&e.getBoundingClientRect().width>0&&/provisional/i.test(e.textContent)})()")" == "true" ]] || { echo "FAIL p10-source-boundary: selected walkthrough hides its provisional geometry status" >&2; exit 1; }
  done
}

check_review_layout() {
  go_to_final_review
  if [[ "$FAULT" == "review-overlap" ]]; then agent-browser --session "$SESSION" eval "document.querySelectorAll('.placement-label').forEach(e=>{e.setAttribute('x','50');e.setAttribute('y','45');e.setAttribute('text-anchor','middle');e.querySelectorAll('tspan').forEach(t=>t.setAttribute('x','50'))})" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const svg=document.querySelector('#review-placement-diagram svg').getBoundingClientRect(),labels=[...document.querySelectorAll('.placement-label')].map(e=>e.getBoundingClientRect());return labels.length===3&&labels.every(r=>r.left>=svg.left&&r.right<=svg.right&&r.top>=svg.top&&r.bottom<=svg.bottom)})()")" == "true" ]] || { echo "FAIL p11-review-contained: placement labels clip outside the diagram" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const labels=[...document.querySelectorAll('.placement-label')].map(e=>e.getBoundingClientRect());return !labels.some((a,i)=>labels.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))})()")" == "true" ]] || { echo "FAIL p11-review-disjoint: placement labels overlap" >&2; exit 1; }
}

check_review_legibility() {
  go_to_final_review
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const plates=[...document.querySelectorAll('.annotation-plate')].map(e=>e.getBoundingClientRect()),labels=[...document.querySelectorAll('#review-placement-diagram .stem text')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0);return plates.length===3&&labels.length===3&&!plates.some(a=>labels.some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))})()")" == "true" ]] || { echo "FAIL p12-review-legibility: annotation cards cover stem-role labels" >&2; exit 1; }
}

check_reference_plan_labels() {
  open_reference
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const svg=document.querySelector('.shared-views svg[aria-label^=\"Bird\"]'),box=svg?.getBoundingClientRect(),labels=[...svg?.querySelectorAll('.stem text')||[]].map(e=>e.getBoundingClientRect());if(!box||labels.length!==3)return false;const inside=labels.every(r=>r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom),overlap=labels.some((a,i)=>labels.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));return inside&&!overlap})()")" == "true" ]] || { echo "FAIL p23-reference-labels: plan role labels overlap or clip" >&2; exit 1; }
  done
}

check_reference_plan_frame() {
  open_reference
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const svg=document.querySelector('.shared-views svg[aria-label^=\"Bird\"]'),container=svg?.querySelector('.container-shape'),front=svg?.querySelector('.front-label');if(!svg||!container||!front)return false;const r=container.getBoundingClientRect();return container.tagName.toLowerCase()==='circle'&&Math.abs(r.width-r.height)<1&&front.textContent.trim()==='FRONT'&&front.getBoundingClientRect().width>0})()")" == "true" ]] || { echo "FAIL p22-reference-frame: bird's-eye view lacks round container or front marker" >&2; exit 1; }
  done
}

check_reference_plan_projection() {
  open_reference
  local expected=('[-8,30,-15]' '[45,-8,-30]' '[45,-12,-30]') elevations=('[80,45,30]' '[20,90,40]' '[20,90,40]')
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const expected=${expected[$index]},elevations=${elevations[$index]},lines=[...document.querySelector('.shared-views svg[aria-label^=\"Bird\"]')?.querySelectorAll('.stem line')||[]];return lines.length===3&&lines.every((l,i)=>{const dx=+l.getAttribute('x2')-+l.getAttribute('x1'),dy=+l.getAttribute('y2')-+l.getAttribute('y1');if(elevations[i]>=89)return Math.hypot(dx,dy)<.2;const actual=Math.atan2(-dx,dy)*180/Math.PI,delta=((actual-expected[i]+540)%360)-180;return Math.abs(delta)<.2})})()")" == "true" ]] || { echo "FAIL p18-reference-plan: plan rays do not match projected signed front-axis angles" >&2; exit 1; }
  done
}

check_reference_front_side() {
  open_reference
  local plans=('[-8,30,-15]' '[45,-8,-30]' '[45,-12,-30]') elevations=('[80,45,30]' '[20,90,40]' '[20,90,40]')
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const plans=${plans[$index]},elevations=${elevations[$index]},lines=[...document.querySelector('.shared-views svg[aria-label^=\"Front\"]')?.querySelectorAll('.stem line')||[]];return lines.length===3&&lines.every((l,i)=>elevations[i]>=89||Math.sign(+l.getAttribute('x2')-+l.getAttribute('x1'))===-Math.sign(plans[i]))})()")" == "true" ]] || { echo "FAIL p19-reference-front: front projection reverses plan left and right" >&2; exit 1; }
  done
}

check_reference_elevation_projection() {
  open_reference
  local expected=('[80,45,30]' '[20,90,40]' '[20,90,40]')
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    if [[ "$FAULT" == "reference-elevation" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.shared-views svg[aria-label^=\"Front\"] .stem line').setAttribute('y2','77')" >/dev/null; fi
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const expected=${expected[$index]},lines=[...document.querySelector('.shared-views svg[aria-label^=\"Front\"]')?.querySelectorAll('.stem line')||[]];return lines.length===3&&lines.every((l,i)=>{const dx=+l.getAttribute('x2')-+l.getAttribute('x1'),dy=+l.getAttribute('y2')-+l.getAttribute('y1'),actual=Math.atan2(-dy,Math.abs(dx))*180/Math.PI;return Math.abs(actual-expected[i])<.2})})()")" == "true" ]] || { echo "FAIL p20-reference-elevation: front inclination does not match elevation value" >&2; exit 1; }
  done
}

check_reference_spatial_side() {
  open_reference
  local plans=('[-8,30,-15]' '[45,-8,-30]' '[45,-12,-30]') elevations=('[80,45,30]' '[20,90,40]' '[20,90,40]')
  for index in 0 1 2; do
    agent-browser --session "$SESSION" click "[data-style-index=\"$index\"]" >/dev/null
    [[ "$(agent-browser --session "$SESSION" eval "(()=>{const plans=${plans[$index]},elevations=${elevations[$index]},lines=[...document.querySelector('.shared-views svg[aria-label^=\"Spatial\"]')?.querySelectorAll('.stem line')||[]];return lines.length===3&&lines.every((l,i)=>elevations[i]>=89||Math.sign(+l.getAttribute('x2')-+l.getAttribute('x1'))===-Math.sign(plans[i]))})()")" == "true" ]] || { echo "FAIL p21-reference-spatial: spatial projection reverses plan left and right" >&2; exit 1; }
  done
}

check_adaptive_contrast() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(contrast_ok '.kenzan-measure text,.front-label' '.adaptive-visual')" == "true" ]] || { echo "FAIL p6-adaptive: adaptive diagram text contrast is below 4.5" >&2; exit 1; }
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(contrast_ok '.angle-label' '.adaptive-visual')" == "true" ]] || { echo "FAIL p6-adaptive: adaptive diagram text contrast is below 4.5" >&2; exit 1; }
}

check_reference_contrast() {
  open_reference
  if [[ "$FAULT" == "reference-contrast" ]]; then agent-browser --session "$SESSION" eval "document.querySelectorAll('.shared-views text').forEach(e=>e.style.fill=getComputedStyle(e.closest('.view-card')).backgroundColor)" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const rgb=s=>{const m=s.match(/[\\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]},lum=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4},ratio=(a,b)=>{const x=.2126*lum(a[0])+.7152*lum(a[1])+.0722*lum(a[2]),y=.2126*lum(b[0])+.7152*lum(b[1])+.0722*lum(b[2]);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)},els=[...document.querySelectorAll('.shared-views .stem text,.shared-views .view-caption')].filter(e=>e.getBoundingClientRect().width>0);return els.length>0&&els.every(e=>ratio(rgb(getComputedStyle(e).fill),rgb(getComputedStyle(e.closest('.view-card')).backgroundColor))>=4.5)})()")" == "true" ]] || { echo "FAIL p6-reference: reference diagram text contrast is below 4.5" >&2; exit 1; }
}

check_review_contrast() {
  go_to_final_review
  [[ "$(contrast_ok '.placement-label' '#review-placement-diagram')" == "true" ]] || { echo "FAIL p6-review: placement annotation contrast is below 4.5" >&2; exit 1; }
}

check_angle_convention() {
  open_reference
  local key
  [[ "$(agent-browser --session "$SESSION" get count '#angle-convention')" == "1" ]] || { echo "FAIL p5-convention: front/rear and left/right angle guidance is absent" >&2; exit 1; }
  key="$(agent-browser --session "$SESSION" get text '#angle-convention')"
  [[ "$key" == *"front"* && "$key" == *"rear"* && "$key" == *"left"* && "$key" == *"right"* ]] || { echo "FAIL p5-convention: front/rear and left/right angle guidance is absent" >&2; exit 1; }
}

check_review_toggle() {
  go_to_final_review
  if [[ "$FAULT" == "toggle-off" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('#review-placement-diagram').insertAdjacentHTML('beforeend','<span class=\"placement-annotation\">Subject 40 cm plan -8° elevation 90°</span><span class=\"placement-annotation\">Secondary 28 cm plan 35° elevation 50°</span><span class=\"placement-annotation\">Object 20 cm plan -35° elevation 35°</span>')" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const a=[...document.querySelectorAll('.placement-annotation')].filter(e=>e.getBoundingClientRect().width>0);return a.length===3&&a.every(e=>/cm/.test(e.textContent)&&/°/.test(e.textContent))})()")" == "true" ]] || { echo "FAIL p4-toggle-on: enabled Review annotations are missing placement values" >&2; exit 1; }
  agent-browser --session "$SESSION" uncheck '#annotation-toggle' >/dev/null
  [[ "$(agent-browser --session "$SESSION" eval "[...document.querySelectorAll('.placement-annotation')].every(e=>e.getBoundingClientRect().width===0)")" == "true" ]] || { echo "FAIL p4-toggle-off: disabled Review annotations remain visible" >&2; exit 1; }
}

check_geometry() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  if [[ "$FAULT" == "arc" || "$FAULT" == "elevation-axis" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.angle-label').textContent='-98°'" >/dev/null; fi
  [[ "$(angle_matches true)" == "true" ]] || { echo "FAIL p2-plan: labeled angle does not match the reference-to-stem turn" >&2; exit 1; }
  if [[ "$FAULT" == "arc" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.angle-arc').setAttribute('d','M 0 0 L 1 1')" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const rayPoint=(e,r)=>{const x1=+e.getAttribute('x1'),y1=+e.getAttribute('y1'),dx=+e.getAttribute('x2')-x1,dy=+e.getAttribute('y2')-y1,n=Math.hypot(dx,dy);return{x:x1+dx/n*r,y:y1+dy/n*r}};const ref=document.querySelector('.reference-axis'),stem=document.querySelector('.focus-stem'),arc=document.querySelector('.angle-arc'),start=arc.getPointAtLength(0),end=arc.getPointAtLength(arc.getTotalLength()),a=rayPoint(ref,17),b=rayPoint(stem,17),near=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<0.3;return near(start,a)&&near(end,b)})()")" == "true" ]] || { echo "FAIL p2-arc: angle arc is not bounded by the reference and stem rays" >&2; exit 1; }
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  if [[ "$FAULT" == "elevation-axis" ]]; then agent-browser --session "$SESSION" eval "const r=document.querySelector('.reference-axis');r.setAttribute('x2','50');r.setAttribute('y2','12')" >/dev/null; fi
  [[ "$(angle_matches false)" == "true" ]] || { echo "FAIL p2-elevation: labeled inclination does not match the reference-to-stem sector" >&2; exit 1; }
}

case "$TARGET" in
  geometry) check_geometry ;;
  review-control) check_review_control ;;
  review-toggle) check_review_toggle ;;
  angle-range) check_angle_range ;;
  angle-convention) check_angle_convention ;;
  contrast-adaptive) check_adaptive_contrast ;;
  contrast-reference) check_reference_contrast ;;
  contrast-review) check_review_contrast ;;
  style-availability) check_style_availability ;;
  style-geometry) check_style_geometry ;;
  kenzan-holder) check_kenzan_holder ;;
  kenzan-vector) check_kenzan_vector ;;
  kenzan-location) check_kenzan_location ;;
  kenzan-round) check_kenzan_round ;;
  kenzan-position) check_kenzan_position_label ;;
  role-track) check_role_track ;;
  reference-plan) check_reference_plan_projection ;;
  reference-plan-frame) check_reference_plan_frame ;;
  reference-plan-labels) check_reference_plan_labels ;;
  reference-front) check_reference_front_side ;;
  reference-elevation) check_reference_elevation_projection ;;
  reference-spatial) check_reference_spatial_side ;;
  kenzan-contrast) check_kenzan_contrast ;;
  upright-fuku) check_role_reading 0 SECONDARY '30°' 'LEFT OF CONTAINER FRONT' 'FAIL p4-upright-fuku: Fuku is not 30 degrees left of front' ;;
  upright-object) check_role_reading 0 OBJECT '15°' 'RIGHT OF CONTAINER FRONT' 'FAIL p5-upright-object: Object is not 15 degrees right of front' ;;
  slanting-subject) check_role_reading 1 SUBJECT '45°' 'LEFT OF CONTAINER FRONT' 'FAIL p6-slanting-subject: Subject is not 45 degrees left of front' ;;
  slanting-object) check_role_reading 1 OBJECT '30°' 'RIGHT OF CONTAINER FRONT' 'FAIL p7-slanting-object: Object is not 30 degrees right of front' ;;
  water-subject) check_role_reading 2 SUBJECT '45°' 'LEFT OF CONTAINER FRONT' 'FAIL p8-water-subject: Subject is not 45 degrees left of front' ;;
  water-object) check_role_reading 2 OBJECT '30°' 'RIGHT OF CONTAINER FRONT' 'FAIL p9-water-object: Object is not 30 degrees right of front' ;;
  source-boundary) check_source_boundaries ;;
  review-layout) check_review_layout ;;
  review-legibility) check_review_legibility ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS $TARGET: diagram quality property holds"

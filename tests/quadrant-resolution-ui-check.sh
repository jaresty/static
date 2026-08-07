#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
TARGET="${1:-all}"
PORT="${PORT:-8778}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
sleep .08
if ! kill -0 "$PID" >/dev/null 2>&1; then cat "$LOG" >&2; exit 1; fi
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done

make_response() {
  local who="$1" first="$2" second="$3"
  node --input-type=module -e "import {createWorkshop,placeAt} from './2x2-facilitator/core.mjs';import{encodeResponseUrl}from'./2x2-facilitator/collaboration.mjs';let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'});s=placeAt(s,$first);s=placeAt(s,$second);console.log(encodeResponseUrl(s,{contributor:'$who',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));"
}
first="$(make_response Alex '{x:.2,y:.7}' '{x:.8,y:.4}')"
second="$(make_response Blair '{x:.9,y:.1}' '{x:.1,y:.9}')"
coincident_first="$(make_response Alex '{x:.5,y:.5}' '{x:.5,y:.5}')"
coincident_second="$(make_response Blair '{x:.5,y:.5}' '{x:.5,y:.5}')"

run_target() {
  local target="$1"
  local session="quadrant-resolution-ui-$target-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?resolution=$target-$$" >/dev/null
  agent-browser --session "$session" click '#combine-mode' >/dev/null
  agent-browser --session "$session" fill '#response-links' "$first
$second" >/dev/null
  agent-browser --session "$session" click '#collect-responses' >/dev/null

  case "$target" in
    quiet)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const hidden=node=>node.hidden||getComputedStyle(node).display==="none"||getComputedStyle(node).opacity==="0";return document.querySelectorAll("[data-resolution-card]").length===3&&document.querySelectorAll("[data-disagreement-halo]").length===3&&Array.from(document.querySelectorAll("[data-placement-mark],[data-spread-graphic]" )).every(hidden)&&hidden(document.querySelector("#response-list"))})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant quiet resolution: default layers are noisy or incomplete'; exit 1; }
      echo 'PASS quadrant quiet resolution: midpoint cards and halos are visible while evidence details are quiet'
      ;;
    focus)
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1].dispatchEvent(new MouseEvent("click",{bubbles:true}))' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const visible=node=>!node.hidden&&getComputedStyle(node).display!=="none"&&Number(getComputedStyle(node).opacity)>0.5;const cards=Array.from(document.querySelectorAll("[data-resolution-card]"));const selected=cards.find(node=>node.dataset.itemId==="item-2");const other=cards.find(node=>node.dataset.itemId==="item-1");const marks=Array.from(document.querySelectorAll("[data-placement-mark]"));const ownMarks=marks.filter(node=>node.dataset.itemId==="item-2");const otherMarks=marks.filter(node=>node.dataset.itemId!=="item-2");const spread=Array.from(document.querySelectorAll("[data-spread-graphic]")).find(node=>node.dataset.spreadGraphic==="item-2");return selected?.classList.contains("focused")&&visible(spread)&&ownMarks.length===2&&ownMarks.every(visible)&&otherMarks.every(node=>!visible(node))&&Number(getComputedStyle(other).opacity)<Number(getComputedStyle(selected).opacity)&&document.querySelector("#resolution-inspector")?.dataset.itemId==="item-2"})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant resolution focus: selected evidence and inspector are not progressively disclosed'; exit 1; }
      echo 'PASS quadrant resolution focus: one item reveals its evidence and dims unrelated cards'
      ;;
    navigator)
      local order selected next previous
      order="$(agent-browser --session "$session" eval 'Array.from(document.querySelectorAll("[data-navigator-item]")).map(node=>node.dataset.itemId).join(",")')"
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-navigator-item]")[1]?.click()' >/dev/null
      selected="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-inspector")?.dataset.itemId')"
      agent-browser --session "$session" eval 'document.querySelector("#next-disagreement")?.click()' >/dev/null
      next="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-inspector")?.dataset.itemId')"
      agent-browser --session "$session" eval 'document.querySelector("#previous-disagreement")?.click()' >/dev/null
      previous="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-inspector")?.dataset.itemId')"
      order="${order//\"/}"; selected="${selected//\"/}"; next="${next//\"/}"; previous="${previous//\"/}"
      [[ "$order" == 'item-2,item-3,item-1' && "$selected" == 'item-3' && "$next" == 'item-1' && "$previous" == 'item-3' ]] || { echo "FAIL quadrant disagreement navigator: $order/$selected/$next/$previous"; exit 1; }
      echo 'PASS quadrant disagreement navigator: sorted selection and cyclic traversal stay synchronized'
      ;;
    interactions)
      agent-browser --session "$session" click '#clear-responses' >/dev/null
      agent-browser --session "$session" fill '#response-links' "$coincident_first
$coincident_second" >/dev/null
      agent-browser --session "$session" click '#collect-responses' >/dev/null
      local displaced keyboard undo dragged reset
      displaced="$(agent-browser --session "$session" eval '(()=>{const card=document.querySelectorAll("[data-resolution-card]")[1];return card.dataset.resolvedX!==card.dataset.displayX})()')"
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new MouseEvent("click",{bubbles:true}))' >/dev/null
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))' >/dev/null
      keyboard="$(agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dataset.resolvedX')"
      agent-browser --session "$session" eval 'document.querySelector("#undo-resolution")?.click()' >/dev/null
      undo="$(agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dataset.resolvedX')"
      agent-browser --session "$session" eval '(()=>{const card=document.querySelectorAll("[data-resolution-card]")[1];const board=document.querySelector("#convergence-board");const box=board.getBoundingClientRect();card?.dispatchEvent(new PointerEvent("pointerdown",{pointerId:1,clientX:box.left+box.width*.5,clientY:box.top+box.height*.5,bubbles:true}));board?.dispatchEvent(new PointerEvent("pointermove",{pointerId:1,clientX:box.left+box.width*.8,clientY:box.top+box.height*.25,bubbles:true}));board?.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,clientX:box.left+box.width*.8,clientY:box.top+box.height*.25,bubbles:true}))})()' >/dev/null
      dragged="$(agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dataset.resolvedX')"
      agent-browser --session "$session" eval 'document.querySelector("#reset-resolution-item")?.click()' >/dev/null
      reset="$(agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dataset.resolvedX')"
      keyboard="${keyboard//\"/}"; undo="${undo//\"/}"; dragged="${dragged//\"/}"; reset="${reset//\"/}"
      [[ "$displaced" == true && "$keyboard" == '0.52' && "$undo" == '0.5' && "$dragged" != '0.5' && "$reset" == '0.5' ]] || { echo "FAIL quadrant resolution interactions: displaced=$displaced keyboard=$keyboard undo=$undo drag=$dragged reset=$reset"; exit 1; }
      echo 'PASS quadrant resolution interactions: keyboard, drag, undo, and item reset share one model'
      ;;
    persistence)
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))' >/dev/null
      agent-browser --session "$session" reload >/dev/null
      agent-browser --session "$session" wait 500 >/dev/null
      local result
      result="$(agent-browser --session "$session" eval 'document.body.dataset.mode==="facilitator-view"&&document.querySelectorAll("[data-resolution-card]").length===3&&document.querySelectorAll("[data-resolution-card]")[1]?.dataset.resolvedX==="0.57"&&document.querySelector("#response-count")?.textContent==="2 responses"')"
      [[ "$result" == true ]] || { echo "FAIL quadrant resolution persistence: $result"; exit 1; }
      echo 'PASS quadrant resolution persistence: reload restores collection evidence and facilitator adjustments'
      ;;
    layers)
      agent-browser --session "$session" eval 'document.querySelector("#show-resolution-evidence")?.click();document.querySelector("#show-response-names")?.click()' >/dev/null
      local shown hidden
      shown="$(agent-browser --session "$session" eval '(()=>{const visible=node=>!node.hidden&&Number(getComputedStyle(node).opacity)>.5;return Array.from(document.querySelectorAll("[data-placement-mark],[data-spread-graphic]")).every(visible)&&!document.querySelector("#response-list").hidden&&document.querySelector("#response-list").textContent.includes("Alex")})()')"
      agent-browser --session "$session" eval 'document.querySelector("#show-resolution-evidence")?.click();document.querySelector("#show-response-names")?.click()' >/dev/null
      hidden="$(agent-browser --session "$session" eval 'document.querySelector("#response-list").hidden&&Array.from(document.querySelectorAll("[data-placement-mark],[data-spread-graphic]")).every(node=>Number(getComputedStyle(node).opacity)===0)')"
      [[ "$shown" == true && "$hidden" == true ]] || { echo "FAIL quadrant resolution layers: shown=$shown hidden=$hidden"; exit 1; }
      echo 'PASS quadrant resolution layers: evidence and names are explicit reversible disclosures'
      ;;
    export)
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));document.querySelector("#export-resolution")?.click()' >/dev/null
      local concealed disclosed
      concealed="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-export-output")?.value??""')"
      agent-browser --session "$session" eval 'document.querySelector("#include-resolution-adjustments")?.click();document.querySelector("#export-resolution")?.click()' >/dev/null
      disclosed="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-export-output")?.value??""')"
      [[ "$concealed" == *'QUADRANT RESOLUTION'* && "$concealed" != *'Facilitator adjustment:'* && "$disclosed" == *'Facilitator adjustment:'* && "$disclosed" == *'participant midpoint retained'* ]] || { printf 'FAIL quadrant resolution export:\nconcealed=%s\ndisclosed=%s\n' "$concealed" "$disclosed"; exit 1; }
      echo 'PASS quadrant resolution export: human-readable text discloses adjustments only when requested'
      ;;
    collision)
      agent-browser --session "$session" click '#clear-responses' >/dev/null
      agent-browser --session "$session" fill '#response-links' "$coincident_first
$coincident_second" >/dev/null
      agent-browser --session "$session" click '#collect-responses' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const cards=Array.from(document.querySelectorAll("[data-resolution-card]"));const leaders=Array.from(document.querySelectorAll("[data-collision-leader]"));const halos=Array.from(document.querySelectorAll("[data-disagreement-halo]"));const transforms=new Set(cards.map(node=>node.getAttribute("transform")));return cards.length===3&&transforms.size===3&&cards.every(node=>node.dataset.resolvedX==="0.5"&&node.dataset.resolvedY==="0.5")&&leaders.length===3&&leaders.every(line=>line.dataset.trueX==="0.5"&&line.dataset.trueY==="0.5"&&(line.dataset.displayX!==line.dataset.trueX||line.dataset.displayY!==line.dataset.trueY))&&new Set(halos.map(node=>`${node.getAttribute("cx")}:${node.getAttribute("cy")}`)).size===1})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant collision leaders: coincident true positions are not truthfully separated'; exit 1; }
      echo 'PASS quadrant collision leaders: distinct cards retain coincident true positions with leader cues'
      ;;
    mobile-width)
      agent-browser --session "$session" set viewport 390 844 >/dev/null
      local result
      result="$(agent-browser --session "$session" eval 'document.documentElement.scrollWidth<=390')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant resolution mobile width: facilitator view overflows 390px'; exit 1; }
      echo 'PASS quadrant resolution mobile width: facilitator view has no horizontal document overflow'
      ;;
    mobile-controls)
      agent-browser --session "$session" set viewport 390 844 >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const selectors=["#take-tour","#previous-disagreement","#next-disagreement","#undo-resolution","#reset-all-resolutions","#show-resolution-evidence","#show-response-names","#convergence-board","#export-resolution","#copy-resolution-export"];const nodes=selectors.map(selector=>document.querySelector(selector));return nodes.every(node=>{if(!node)return false;const rect=node.getBoundingClientRect();return rect.width>0&&rect.left>=-0.5&&rect.right<=innerWidth+0.5})})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant resolution mobile controls: a facilitator control clips at 390px'; exit 1; }
      echo 'PASS quadrant resolution mobile controls: facilitator controls fit the 390px viewport'
      ;;
    *) echo "Unknown target: $target" >&2; exit 2 ;;
  esac
  agent-browser --session "$session" close >/dev/null 2>&1 || true
}

if [[ "$TARGET" == all ]]; then
  run_target quiet
  run_target focus
  run_target navigator
  run_target interactions
  run_target persistence
  run_target layers
  run_target export
  run_target collision
  run_target mobile-width
  run_target mobile-controls
else
  run_target "$TARGET"
fi

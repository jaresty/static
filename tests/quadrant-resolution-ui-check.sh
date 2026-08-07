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
single_response="$(node --input-type=module -e "import {createWorkshop,moveItem,placeAt} from './2x2-facilitator/core.mjs';import{encodeResponseUrl}from'./2x2-facilitator/collaboration.mjs';let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'});for(let i=0;i<7;i++){s=moveItem(s,'item-1','x',-1);s=moveItem(s,'item-1','y',-1)}s=placeAt(s,{x:.5,y:.8});s=placeAt(s,{x:.85,y:.2});console.log(encodeResponseUrl(s,{contributor:'Solo',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));")"

run_target() {
  local target="$1"
  local session="quadrant-resolution-ui-$target-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?resolution=$target-$$" >/dev/null
  agent-browser --session "$session" click '#combine-mode' >/dev/null
  if [[ "$target" == single ]]; then
    agent-browser --session "$session" fill '#response-links' "$single_response" >/dev/null
  elif [[ "$target" == leader-explanation || "$target" == click-preserves || "$target" == drag-requires-selection ]]; then
    agent-browser --session "$session" fill '#response-links' "$coincident_first" >/dev/null
  else
    agent-browser --session "$session" fill '#response-links' "$first
$second" >/dev/null
  fi
  agent-browser --session "$session" click '#collect-responses' >/dev/null

  case "$target" in
    axes)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const labels=Array.from(document.querySelectorAll("[data-convergence-axis-label]"));const text=labels.map(node=>node.textContent.trim());return labels.length===6&&["Value","Low value","High value","Confidence","Low confidence","High confidence"].every(value=>text.includes(value))&&labels.every(node=>node.getClientRects().length>0)})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant combined axes: shared grid does not show both criteria and endpoints'; exit 1; }
      echo 'PASS quadrant combined axes: shared grid shows both criteria and endpoints'
      ;;
    identity)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const expected={"item-1":"1","item-2":"2","item-3":"3"};const cards=Array.from(document.querySelectorAll("[data-resolution-card]"));const rows=Array.from(document.querySelectorAll("[data-navigator-item]"));const rowsMatch=rows.every(row=>row.querySelector("[data-item-number]")?.textContent.trim()===expected[row.dataset.itemId]);document.querySelector("[data-navigator-item][data-item-id=\"item-2\"]")?.click();const inspector=document.querySelector("#resolution-inspector");return cards.every(card=>card.textContent.trim()===expected[card.dataset.itemId])&&rowsMatch&&inspector?.dataset.itemId==="item-2"&&inspector.querySelector("[data-item-number]")?.textContent.trim()==="2"})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant item identity: grid numbers are not mapped consistently to navigator and inspector'; exit 1; }
      echo 'PASS quadrant item identity: grid, navigator, and inspector share stable item numbers'
      ;;
    single)
      if [[ "${SINGLE_RESPONSE_VIOLATION:-}" == 1 ]]; then
        agent-browser --session "$session" eval 'document.querySelector("#convergence-board").append(document.createElementNS("http://www.w3.org/2000/svg","line"));document.querySelector("#convergence-board line:last-child").classList.add("collision-leader")' >/dev/null
      fi
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const expected={"item-1":["0.15","0.15"],"item-2":["0.5","0.8"],"item-3":["0.85","0.2"]};const cards=Array.from(document.querySelectorAll("[data-resolution-card]"));return document.querySelector("#response-count").textContent.trim()==="1 response"&&cards.every(card=>card.dataset.resolvedX===expected[card.dataset.itemId][0]&&card.dataset.resolvedY===expected[card.dataset.itemId][1])&&document.querySelectorAll(".spread-line,.collision-leader").length===0})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant single midpoint: one response is not rendered exactly without lines'; exit 1; }
      echo 'PASS quadrant single midpoint: one response remains exact and line-free when placements do not overlap'
      ;;
    leader-explanation)
      local result
      result="$(agent-browser --session "$session" eval 'document.querySelectorAll(".collision-leader").length>0&&/numbers may move.*solid connectors.*true resolved position.*response midpoint until adjusted/i.test(document.querySelector("#convergence-summary").textContent)')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant collision explanation: leader lines are not explained to facilitators'; exit 1; }
      echo 'PASS quadrant collision explanation: offset cards and true resolved positions are explained'
      ;;
    legend)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const legend=document.querySelector("#resolution-legend");const entries=Array.from(legend?.querySelectorAll("[data-legend-entry]")||[]);const lines=Array.from(legend?.querySelectorAll(".legend-line")||[]);return legend?.getClientRects().length>0&&entries.length===3&&/number connector/i.test(legend.textContent)&&/moved number to exact result/i.test(legend.textContent)&&/participant responses/i.test(legend.textContent)&&/submitted position to midpoint/i.test(legend.textContent)&&/disagreement halo/i.test(legend.textContent)&&lines.length===2&&getComputedStyle(lines[0]).borderTopStyle==="solid"&&getComputedStyle(lines[1]).borderTopStyle==="dashed"})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant resolution legend: ghost lines and halos have no visible key'; exit 1; }
      echo 'PASS quadrant resolution legend: offset, spread, and disagreement encodings are explained'
      ;;
    central-workspace)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const container=document.querySelector("#collection-grid")?.getBoundingClientRect();const workspace=document.querySelector("#resolution-workspace")?.getBoundingClientRect();const main=document.querySelector("#resolution-main")?.getBoundingClientRect();const side=document.querySelector("#resolution-sidebar")?.getBoundingClientRect();const importer=document.querySelector("#response-import-panel")?.getBoundingClientRect();return container&&workspace&&main&&side&&importer&&workspace.width>=container.width*.95&&main.width>side.width&&importer.height<100})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant central workspace: the 2D grid is not the primary facilitator region'; exit 1; }
      echo 'PASS quadrant central workspace: the grid dominates the full-width facilitator workspace'
      ;;
    guidance)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const guide=document.querySelector("#resolution-interaction-guide");return guide?.getClientRects().length>0&&/select a numbered item/i.test(guide.textContent)&&/select it again/i.test(guide.textContent)&&/drag.*adjust/i.test(guide.textContent)})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant interaction guidance: facilitator actions are not explained'; exit 1; }
      echo 'PASS quadrant interaction guidance: select, clear, and adjust actions are explained'
      ;;
    workspace-space)
      local collapsed reopened cleared
      collapsed="$(agent-browser --session "$session" eval '(()=>{const panel=document.querySelector("#response-import-panel");const grid=document.querySelector("#collection-grid");if(!panel||!grid)return false;const resolution=grid.querySelector("#resolution-workspace");return !panel.open&&grid.classList.contains("has-responses")&&resolution.getBoundingClientRect().width>=grid.getBoundingClientRect().width*.95&&panel.getBoundingClientRect().height<100})()')"
      reopened=false; cleared=false
      if [[ "$collapsed" == true ]]; then
        agent-browser --session "$session" click '#response-import-panel > summary' >/dev/null
        reopened="$(agent-browser --session "$session" eval 'document.querySelector("#response-import-panel").open')"
        agent-browser --session "$session" click '#clear-responses' >/dev/null
        cleared="$(agent-browser --session "$session" eval 'document.querySelector("#response-import-panel").open&&!document.querySelector("#collection-grid").classList.contains("has-responses")')"
      fi
      [[ "$collapsed" == true && "$reopened" == true && "$cleared" == true ]] || { echo "FAIL quadrant workspace space: collapsed=$collapsed reopened=$reopened cleared=$cleared"; exit 1; }
      echo 'PASS quadrant workspace space: response entry yields space and remains recoverable'
      ;;
    no-tooltip)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const board=document.querySelector("#convergence-board");return !board.querySelector("title")&&/2 Quadrant responses with every submitted placement/i.test(board.getAttribute("aria-label")||"")})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant grid tooltip: native SVG title still obscures the facilitator grid'; exit 1; }
      echo 'PASS quadrant grid tooltip: accessible context remains without a native hover banner'
      ;;
    focus-declutter)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const decorations=()=>Array.from(document.querySelectorAll("[data-disagreement-halo],[data-collision-leader],[data-collision-anchor]"));const visible=node=>Number(getComputedStyle(node).opacity)>.5;const overview=decorations().length>0&&decorations().every(visible);document.querySelector("[data-navigator-item][data-item-id=\"item-2\"]").click();const unrelated=decorations().filter(node=>(node.dataset.itemId||node.dataset.disagreementHalo||node.dataset.collisionLeader)!=="item-2");const focused=unrelated.length>0&&unrelated.every(node=>Number(getComputedStyle(node).opacity)===0);document.querySelector("[data-navigator-item][data-item-id=\"item-2\"]").click();const restored=!document.querySelector("#resolution-inspector")?.dataset.itemId&&decorations().every(visible);return overview&&focused&&restored})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant focus declutter: unrelated decoration remains or overview does not restore'; exit 1; }
      echo 'PASS quadrant focus declutter: selection isolates one item and deselection restores overview'
      ;;
    focus-toggle)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const board=document.querySelector("#convergence-board");const activate=id=>{const card=document.querySelector(`[data-resolution-card][data-item-id="${id}"]`);const box=card.getBoundingClientRect();const clientX=box.left+box.width/2;const clientY=box.top+box.height/2;card.dispatchEvent(new PointerEvent("pointerdown",{pointerId:1,clientX,clientY,bubbles:true}));board.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,clientX,clientY,bubbles:true}))};activate("item-1");const first=document.querySelector("#resolution-inspector")?.dataset.itemId;activate("item-1");const toggled=!document.querySelector("#resolution-inspector")?.dataset.itemId;activate("item-2");board.dispatchEvent(new MouseEvent("click",{bubbles:true}));const cleared=!document.querySelector("#resolution-inspector")?.dataset.itemId;return first==="item-1"&&toggled&&cleared})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant focus toggle: selected items cannot be predictably cleared'; exit 1; }
      echo 'PASS quadrant focus toggle: repeat selection and empty grid clear facilitator focus'
      ;;
    keyboard-boundary)
      agent-browser --session "$session" scrollintoview '#convergence-board' >/dev/null
      agent-browser --session "$session" focus '[data-resolution-card][data-item-id="item-1"]' >/dev/null
      local before first second
      before="$(agent-browser --session "$session" eval '(()=>{const n=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return `${n.dataset.resolvedX},${n.dataset.resolvedY}`})()')"
      agent-browser --session "$session" press ArrowRight >/dev/null
      first="$(agent-browser --session "$session" eval '(()=>{const n=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return{coordinate:`${n.dataset.resolvedX},${n.dataset.resolvedY}`,focus:document.querySelector("#resolution-inspector")?.dataset.itemId||null,active:document.activeElement?.dataset.itemId||null}})()')"
      agent-browser --session "$session" press ArrowRight >/dev/null
      second="$(agent-browser --session "$session" eval '(()=>{const n=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return{coordinate:`${n.dataset.resolvedX},${n.dataset.resolvedY}`,adjusted:n.dataset.adjusted,focus:document.querySelector("#resolution-inspector")?.dataset.itemId||null,active:document.activeElement?.dataset.itemId||null}})()')"
      result="$(node -e 'const [before,first,second]=process.argv.slice(1).map(JSON.parse);console.log(first.coordinate===before&&first.focus==="item-1"&&first.active==="item-1"&&second.coordinate!==before&&second.adjusted==="true"&&second.focus==="item-1"&&second.active==="item-1")' "$before" "$first" "$second")"
      [[ "$result" == true ]] || { echo "FAIL quadrant keyboard boundary: before=$before first=$first second=$second"; exit 1; }
      echo 'PASS quadrant keyboard boundary: select-first adjustment retains keyboard focus'
      ;;
    hit-targets)
      agent-browser --session "$session" scrollintoview '#convergence-board' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const hit=()=>Array.from(document.querySelectorAll("[data-resolution-card]")).every(card=>{const box=card.getBoundingClientRect();return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)?.closest("[data-resolution-card]")?.dataset.itemId===card.dataset.itemId});const initial=hit();document.querySelector("[data-navigator-item][data-item-id=\"item-2\"]").click();const focused=hit();document.querySelector("#show-resolution-evidence").click();const allEvidence=hit();return initial&&focused&&allEvidence})()')"
      if [[ "$result" != true ]]; then
        diagnostic="$(agent-browser --session "$session" eval 'Array.from(document.querySelectorAll("[data-resolution-card]")).map(card=>{const box=card.getBoundingClientRect();const top=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return{card:card.dataset.itemId,hit:top?.closest("[data-resolution-card]")?.dataset.itemId||null,tag:top?.tagName,cls:top?.getAttribute("class"),pointer:top&&getComputedStyle(top).pointerEvents}})')"
        echo "FAIL quadrant card hit targets: noninteractive evidence covers numbered cards $diagnostic"
        exit 1
      fi
      echo 'PASS quadrant card hit targets: evidence layers never intercept numbered cards'
      ;;
    drag-requires-selection)
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const gesture=()=>{const card=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");const board=document.querySelector("#convergence-board");const box=card.getBoundingClientRect();const startX=box.left+box.width/2;const startY=box.top+box.height/2;card.dispatchEvent(new PointerEvent("pointerdown",{pointerId:1,clientX:startX,clientY:startY,bubbles:true}));board.dispatchEvent(new PointerEvent("pointermove",{pointerId:1,clientX:startX+90,clientY:startY-70,bubbles:true}));board.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,clientX:startX+90,clientY:startY-70,bubbles:true}))};const state=()=>{const card=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return {coordinate:`${card.dataset.resolvedX},${card.dataset.resolvedY}`,adjusted:card.dataset.adjusted,focus:document.querySelector("#resolution-inspector")?.dataset.itemId||null}};const before=state();gesture();const first=state();gesture();const second=state();return first.coordinate===before.coordinate&&first.adjusted==="false"&&first.focus==="item-1"&&second.coordinate!==before.coordinate&&second.adjusted==="true"&&second.focus==="item-1"})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant drag boundary: unselected cards can adjust before explicit selection'; exit 1; }
      echo 'PASS quadrant drag boundary: selection precedes intentional facilitator adjustment'
      ;;
    click-preserves)
      local before after focused
      before="$(agent-browser --session "$session" eval '(()=>{const card=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return `${card.dataset.resolvedX},${card.dataset.resolvedY},${card.dataset.adjusted}`})()')"
      agent-browser --session "$session" eval '(()=>{const card=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");const board=document.querySelector("#convergence-board");const box=card.getBoundingClientRect();const clientX=box.left+box.width/2;const clientY=box.top+box.height/2;card.dispatchEvent(new PointerEvent("pointerdown",{pointerId:1,clientX,clientY,bubbles:true}));board.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,clientX,clientY,bubbles:true}))})()' >/dev/null
      after="$(agent-browser --session "$session" eval '(()=>{const card=document.querySelector("[data-resolution-card][data-item-id=\"item-1\"]");return `${card.dataset.resolvedX},${card.dataset.resolvedY},${card.dataset.adjusted}`})()')"
      focused="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-inspector")?.dataset.itemId')"
      before="${before//\"/}"; after="${after//\"/}"; focused="${focused//\"/}"
      [[ "$before" == "$after" && "$focused" == item-1 ]] || { echo "FAIL quadrant click selection: plain click mutated item 1 ($before -> $after, focus=$focused)"; exit 1; }
      echo 'PASS quadrant click selection: plain clicks focus cards without adjusting coordinates'
      ;;
    collision-anchors)
      agent-browser --session "$session" click '#response-import-panel > summary' >/dev/null
      agent-browser --session "$session" click '#clear-responses' >/dev/null
      agent-browser --session "$session" fill '#response-links' "$coincident_first
$coincident_second" >/dev/null
      agent-browser --session "$session" click '#collect-responses' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const leaders=Array.from(document.querySelectorAll(".collision-leader"));const anchors=Array.from(document.querySelectorAll("[data-collision-anchor]"));return leaders.length>0&&anchors.length===leaders.length&&leaders.every(line=>{const anchor=anchors.find(node=>node.dataset.itemId===line.dataset.collisionLeader);return anchor&&anchor.getClientRects().length>0&&anchor.getAttribute("cx")===line.getAttribute("x1")&&anchor.getAttribute("cy")===line.getAttribute("y1")})})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant collision anchors: offset labels do not identify their true coordinates'; exit 1; }
      echo 'PASS quadrant collision anchors: every offset label points to a visible true coordinate'
      ;;
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
      agent-browser --session "$session" click '#response-import-panel > summary' >/dev/null
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
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new MouseEvent("click",{bubbles:true}));document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}))' >/dev/null
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
      agent-browser --session "$session" eval 'document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new MouseEvent("click",{bubbles:true}));document.querySelectorAll("[data-resolution-card]")[1]?.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));document.querySelector("#export-resolution")?.click()' >/dev/null
      local concealed disclosed
      concealed="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-export-output")?.value??""')"
      agent-browser --session "$session" eval 'document.querySelector("#include-resolution-adjustments")?.click();document.querySelector("#export-resolution")?.click()' >/dev/null
      disclosed="$(agent-browser --session "$session" eval 'document.querySelector("#resolution-export-output")?.value??""')"
      [[ "$concealed" == *'QUADRANT RESOLUTION'* && "$concealed" != *'Facilitator adjustment:'* && "$disclosed" == *'Facilitator adjustment:'* && "$disclosed" == *'participant midpoint retained'* ]] || { printf 'FAIL quadrant resolution export:\nconcealed=%s\ndisclosed=%s\n' "$concealed" "$disclosed"; exit 1; }
      echo 'PASS quadrant resolution export: human-readable text discloses adjustments only when requested'
      ;;
    collision)
      agent-browser --session "$session" click '#response-import-panel > summary' >/dev/null
      agent-browser --session "$session" click '#clear-responses' >/dev/null
      agent-browser --session "$session" fill '#response-links' "$coincident_first
$coincident_second" >/dev/null
      agent-browser --session "$session" click '#collect-responses' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval '(()=>{const cards=Array.from(document.querySelectorAll("[data-resolution-card]"));const leaders=Array.from(document.querySelectorAll("[data-collision-leader]"));const halos=Array.from(document.querySelectorAll("[data-disagreement-halo]"));const transforms=new Set(cards.map(node=>node.getAttribute("transform")));return cards.length===3&&transforms.size===3&&cards.every(node=>node.dataset.resolvedX==="0.5"&&node.dataset.resolvedY==="0.5")&&leaders.length===3&&leaders.every(line=>line.dataset.trueX==="0.5"&&line.dataset.trueY==="0.5"&&(line.dataset.displayX!==line.dataset.trueX||line.dataset.displayY!==line.dataset.trueY))&&new Set(halos.map(node=>`${node.getAttribute("cx")}:${node.getAttribute("cy")}`)).size===1})()')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant collision leaders: coincident true positions are not truthfully separated'; exit 1; }
      echo 'PASS quadrant collision leaders: distinct cards retain coincident true positions with leader cues'
      ;;
    invisible-hit-targets)
      agent-browser --session "$session" set viewport 390 844 >/dev/null
      agent-browser --session "$session" scrollintoview '#convergence-board' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval 'Array.from(document.querySelectorAll(".resolution-hit-target")).every(node=>{const style=getComputedStyle(node);const card=node.closest("[data-resolution-card]").getBoundingClientRect();return Number(style.fillOpacity)===0&&Number(style.strokeOpacity)===0&&card.width>=40&&card.height>=40})')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant invisible hit targets: enlarged click areas appear as decorative rings'; exit 1; }
      echo 'PASS quadrant invisible hit targets: larger click areas remain visually transparent'
      ;;
    mobile-hit-size)
      agent-browser --session "$session" set viewport 390 844 >/dev/null
      agent-browser --session "$session" scrollintoview '#convergence-board' >/dev/null
      local result
      result="$(agent-browser --session "$session" eval 'Array.from(document.querySelectorAll("[data-resolution-card]")).every(card=>{const box=card.getBoundingClientRect();return box.width>=40&&box.height>=40&&document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)?.closest("[data-resolution-card]")?.dataset.itemId===card.dataset.itemId})')"
      [[ "$result" == true ]] || { echo 'FAIL quadrant mobile hit size: dense numbered cards are too small or overlap hit ownership'; exit 1; }
      echo 'PASS quadrant mobile hit size: numbered cards retain distinct 40px targets'
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

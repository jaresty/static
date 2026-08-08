#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPERTY="${1:?property number required}"
PORT="${PORT:-8805}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-shared-viewer-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
url="$(node --input-type=module - <<NODE
import { createCollection } from './2x2-facilitator/collaboration.mjs';
import { createResolution, adjustResolution } from './2x2-facilitator/resolution.mjs';
import { createFacilitatorViewArtifact, encodeFacilitatorArtifactUrl } from './2x2-facilitator/facilitator-share.mjs';
const setup={prompt:'Which launch should we pursue?',activityDescription:'Use the launch brief.',xLabel:'Value',xLow:'Lower value',xHigh:'Higher value',yLabel:'Confidence',yLow:'Lower confidence',yHigh:'Higher confidence',items:[{id:'one',text:'Pilot',description:'A limited release.'},{id:'two',text:'Launch',description:'A broad release.'}]};
const collection=createCollection(setup);
collection.responses=[{contributionId:'a',contributor:'Alex',payload:{positions:{one:{x:.2,y:.8},two:{x:.7,y:.4}}}},{contributionId:'b',contributor:'Blair',payload:{positions:{one:{x:.8,y:.2},two:{x:.5,y:.9}}}}];
const resolution=adjustResolution(createResolution(collection),'one',{x:.9,y:.7});
console.log(encodeFacilitatorArtifactUrl(createFacilitatorViewArtifact(resolution),'http://127.0.0.1:$PORT/2x2-facilitator/'));
NODE
)"
session="quadrant-shared-viewer-${PROPERTY}-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?prepare=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear();localStorage.setItem("sentinel","unchanged")' >/dev/null
agent-browser --session "$session" open "$url" >/dev/null
case "$PROPERTY" in
  1)
    contract="$(agent-browser --session "$session" eval '(()=>{const labels=[...document.querySelectorAll("#shared-facilitator-board .convergence-axis-label")].map(node=>node.textContent);return JSON.stringify(labels)===JSON.stringify(["Lower value","Value","Higher value","Lower confidence","Confidence","Higher confidence"])})()')"
    ;;
  2)
    agent-browser --session "$session" eval 'document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").click()' >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const selected=document.querySelector("#shared-facilitator-disagreement-list [aria-current=true]");const inspector=document.querySelector("#shared-facilitator-inspector");return Boolean(selected&&inspector&&!inspector.hidden&&inspector.dataset.itemId===selected.dataset.itemId&&/Final position/.test(inspector.innerText)&&!/Reset|Undo|drag/i.test(inspector.innerText))})()')"
    ;;
  3)
    [[ "${VIOLATE_PRIVACY:-0}" != 1 ]] || agent-browser --session "$session" eval 'localStorage.setItem("quadrant:leak","1");const button=document.createElement("button");button.dataset.editableControl="";document.querySelector("#shared-facilitator-view").append(button)' >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const view=document.querySelector("#shared-facilitator-view");return localStorage.length===1&&localStorage.getItem("sentinel")==="unchanged"&&!view.querySelector("[data-participant-position],[data-editable-control],#show-response-names,#undo-resolution,#reset-all-resolutions")&&!/Alex|Blair/.test(view.innerText)})()')"
    ;;
  4)
    agent-browser --session "$session" set viewport 390 844 >/dev/null
    [[ "${VIOLATE_MOBILE:-0}" != 1 ]] || agent-browser --session "$session" eval 'document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").style.minHeight="20px";document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").style.height="20px"' >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const targets=[...document.querySelectorAll("#shared-facilitator-disagreement-list [data-shared-navigator-item]")];return document.documentElement.scrollWidth===document.documentElement.clientWidth&&targets.length===2&&targets.every(target=>target.getBoundingClientRect().height>=42)})()')"
    ;;
  5)
    contract="$(agent-browser --session "$session" eval '(()=>{const groups=[...document.querySelectorAll("#shared-facilitator-board [data-shared-result-item]")];return groups.length===2&&groups.every(group=>{const halo=group.querySelector(".resolution-halo");const card=group.querySelector(".resolution-card");const hit=card?.querySelector(".resolution-hit-target");const point=card?.querySelector("circle:not(.resolution-hit-target)");const text=card?.querySelector("text");return /^translate\(/.test(card?.getAttribute("transform")||"")&&point?.getAttribute("r")==="4.6"&&hit?.getAttribute("r")==="6.6"&&!point.hasAttribute("cx")&&!point.hasAttribute("cy")&&!text.hasAttribute("x")&&!text.hasAttribute("y")&&getComputedStyle(text).dominantBaseline==="central"&&!point.hasAttribute("fill")&&halo.getAttribute("fill")===halo.getAttribute("stroke")})&&groups[0].querySelector(".resolution-halo").getAttribute("fill")==="#6f5ae8"&&groups[1].querySelector(".resolution-halo").getAttribute("fill")==="#f18b6d"&&Number(groups[0].querySelector(".resolution-halo").getAttribute("r"))>8&&Boolean(document.querySelector("#shared-facilitator-board .adjustment-line"))})()')"
    ;;
  6)
    agent-browser --session "$session" eval 'document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").click()' >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const groups=[...document.querySelectorAll("#shared-facilitator-board [data-shared-result-item]")];const selected=groups.find(group=>group.classList.contains("focused"));const other=groups.find(group=>group!==selected);return Boolean(selected&&getComputedStyle(selected.querySelector(".resolution-card")).opacity==="1"&&Number(getComputedStyle(selected.querySelector(".resolution-halo")).opacity)>0&&Number(getComputedStyle(other.querySelector(".resolution-card")).opacity)<1)})()')"
    ;;
  *) echo "Unknown property: $PROPERTY"; exit 2;;
esac
[[ "$contract" == true ]] || { echo "FAIL shared result viewer property $PROPERTY: contract=$contract"; exit 1; }
echo "PASS shared result viewer property $PROPERTY"

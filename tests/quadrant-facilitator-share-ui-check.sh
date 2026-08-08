#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8801}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-facilitator-share-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
base="http://127.0.0.1:$PORT/2x2-facilitator/"

source_session="quadrant-facilitator-share-source-$$"
agent-browser --session "$source_session" open "$base?source=$RANDOM" >/dev/null
agent-browser --session "$source_session" eval 'localStorage.clear()' >/dev/null
agent-browser --session "$source_session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;const {createResolution,adjustResolution}=await import("./resolution.mjs");app.collection={app:"quadrant",exerciseId:"quadrant-share-browser",setup:{prompt:"Which launch should we pursue?",activityDescription:"Use the launch brief before interpreting options.",xLabel:"Value",xLow:"Lower value",xHigh:"Higher value",yLabel:"Confidence",yLow:"Lower confidence",yHigh:"Higher confidence",items:[{id:"item-1",text:"Pilot",description:"A limited release to existing customers."},{id:"item-2",text:"Launch",description:"A broad public release."}]},responses:[{contributionId:"response-alex",contributor:"Alex",payload:{positions:{"item-1":{x:.2,y:.8},"item-2":{x:.7,y:.4}}}},{contributionId:"response-blair",contributor:"Blair",payload:{positions:{"item-1":{x:.8,y:.2},"item-2":{x:.5,y:.9}}}}]};app.resolution=adjustResolution(createResolution(app.collection),"item-1",{x:.9,y:.7});app.enterCollection()})()' >/dev/null
agent-browser --session "$source_session" click '#copy-facilitator-view' >/dev/null
view_url="$(agent-browser --session "$source_session" get value '#facilitator-share-output')"
agent-browser --session "$source_session" click '#copy-facilitator-handoff' >/dev/null
handoff_url="$(agent-browser --session "$source_session" get value '#facilitator-share-output')"
source_contract="$(agent-browser --session "$source_session" eval '(()=>!document.querySelector("#include-handoff-names").checked&&Boolean(document.querySelector("#download-facilitator-backup")))()')"

view_session="quadrant-facilitator-share-view-$$"
agent-browser --session "$view_session" open "$base?recipient=view" >/dev/null
agent-browser --session "$view_session" eval 'localStorage.clear();localStorage.setItem("sentinel","unchanged")' >/dev/null
agent-browser --session "$view_session" open "$view_url" >/dev/null
agent-browser --session "$view_session" eval 'document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").click()' >/dev/null
view_contract="$(agent-browser --session "$view_session" eval '(()=>{const root=document.querySelector("#shared-facilitator-view");const text=root.innerText;const halo=getComputedStyle(root.querySelector(".legend-halo"),"::before");const line=getComputedStyle(root.querySelector(".legend-line-adjustment"),"::before");return localStorage.length===1&&localStorage.getItem("sentinel")==="unchanged"&&/Which launch/.test(text)&&/A limited release/.test(text)&&/2 responses/.test(text)&&/Number · final facilitator result/.test(text)&&/Halo · larger means more disagreement/.test(text)&&/Purple line · participant average to facilitator result/.test(text)&&/Participant dots are intentionally excluded/.test(text)&&parseFloat(halo.width)>0&&halo.borderTopStyle==="solid"&&parseFloat(line.width)>0&&line.borderTopColor==="rgb(111, 90, 232)"&&!/Alex|Blair/.test(text)&&!document.querySelector("[data-participant-position]")})()')"

handoff_session="quadrant-facilitator-share-handoff-$$"
agent-browser --session "$handoff_session" open "$base?recipient=handoff" >/dev/null
agent-browser --session "$handoff_session" eval 'localStorage.clear();localStorage.setItem("sentinel","unchanged")' >/dev/null
agent-browser --session "$handoff_session" open "$handoff_url" >/dev/null
review_contract="$(agent-browser --session "$handoff_session" eval '(()=>localStorage.length===1&&localStorage.getItem("sentinel")==="unchanged"&&/2 responses/.test(document.querySelector("#facilitator-handoff-summary").innerText)&&/Names excluded/.test(document.querySelector("#facilitator-handoff-summary").innerText)&&!document.body.innerText.includes("Alex"))()')"
agent-browser --session "$handoff_session" click '#import-facilitator-handoff' >/dev/null
import_contract="$(agent-browser --session "$handoff_session" eval '(()=>Boolean(location.hash===""&&document.body.dataset.mode==="facilitator-view"&&localStorage.getItem("quadrant:resolution:latest")&&document.querySelector("#response-count").innerText==="2 responses"&&document.querySelector("#undo-resolution")))()')"
agent-browser --session "$handoff_session" set viewport 390 844 >/dev/null
mobile="$(agent-browser --session "$handoff_session" eval 'document.documentElement.scrollWidth===document.documentElement.clientWidth')"
errors="$(agent-browser --session "$handoff_session" errors)"

fallback_session="quadrant-facilitator-share-fallback-$$"
agent-browser --session "$fallback_session" open "$base?recipient=fallback" >/dev/null
agent-browser --session "$fallback_session" eval 'localStorage.clear();localStorage.setItem("sentinel","unchanged")' >/dev/null
agent-browser --session "$fallback_session" open "$handoff_url" >/dev/null
agent-browser --session "$fallback_session" eval '(async()=>{window.__handoff=structuredClone((await import("./app.js")).facilitatorApp.facilitatorShareArtifact)})()' >/dev/null
agent-browser --session "$fallback_session" click '#discard-facilitator-handoff' >/dev/null
discard_contract="$(agent-browser --session "$fallback_session" eval 'location.hash===""&&document.body.dataset.mode==="entry"&&localStorage.length===1&&localStorage.getItem("sentinel")==="unchanged"')"
agent-browser --session "$fallback_session" eval '(()=>{const input=document.querySelector("#facilitator-backup-input");const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(window.__handoff)],"handoff.json",{type:"application/json"}));input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}))})()' >/dev/null
sleep 0.1
fallback_contract="$(agent-browser --session "$fallback_session" eval 'document.body.dataset.mode==="facilitator-handoff"&&localStorage.length===1&&/Names excluded/.test(document.querySelector("#facilitator-handoff-summary").innerText)')"
[[ "$source_contract" == true && "$view_contract" == true && "$review_contract" == true && "$import_contract" == true && "$discard_contract" == true && "$fallback_contract" == true && "$mobile" == true && -z "$errors" ]] || { echo "FAIL facilitator share: source=$source_contract view=$view_contract review=$review_contract import=$import_contract discard=$discard_contract fallback=$fallback_contract mobile=$mobile errors=$errors"; exit 1; }
echo 'PASS facilitator share: view-only stays private and handoff imports explicitly as an editable copy'

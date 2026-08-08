#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:?expected success or failure}"
PORT="${PORT:-8803}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-facilitator-clipboard-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
session="quadrant-facilitator-clipboard-${MODE}-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?clipboard=$RANDOM" >/dev/null
agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;const {createResolution}=await import("./resolution.mjs");app.collection={app:"quadrant",exerciseId:"clipboard-feedback",setup:{prompt:"Choose",activityDescription:"",xLabel:"Value",xLow:"Low",xHigh:"High",yLabel:"Confidence",yLow:"Low",yHigh:"High",items:[{id:"one",text:"One",description:""},{id:"two",text:"Two",description:""}]},responses:[{contributionId:"response",contributor:"Participant",payload:{positions:{one:{x:.2,y:.8},two:{x:.7,y:.4}}}}]};app.resolution=createResolution(app.collection);app.enterCollection()})()' >/dev/null
if [[ "$MODE" == success ]]; then
  agent-browser --session "$session" eval 'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copied=text}}})' >/dev/null
  agent-browser --session "$session" click '#copy-facilitator-view' >/dev/null
  contract="$(agent-browser --session "$session" eval '(()=>{const button=document.querySelector("#copy-facilitator-view");const status=document.querySelector("#facilitator-share-status");return button.innerText==="Copied!"&&status.getAttribute("role")==="status"&&/Link copied/.test(status.innerText)&&window.__copied===document.querySelector("#facilitator-share-output").value})()')"
else
  agent-browser --session "$session" eval 'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw new Error("denied")}}})' >/dev/null
  agent-browser --session "$session" click '#copy-facilitator-view' >/dev/null
  contract="$(agent-browser --session "$session" eval '(()=>{const output=document.querySelector("#facilitator-share-output");const status=document.querySelector("#facilitator-share-status");return document.activeElement===output&&output.selectionStart===0&&output.selectionEnd===output.value.length&&status.getAttribute("role")==="alert"&&/Copy failed/.test(status.innerText)})()')"
fi
[[ "$contract" == true ]] || { echo "FAIL facilitator clipboard $MODE feedback: contract=$contract"; exit 1; }
echo "PASS facilitator clipboard $MODE feedback"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8797}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-storage-recovery-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false

session="quadrant-storage-recovery-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?storage-recovery=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear();document.querySelector("[data-tour-offer]")?.remove()' >/dev/null
agent-browser --session "$session" click '#solo-mode' >/dev/null
agent-browser --session "$session" click '#example-button' >/dev/null
agent-browser --session "$session" click '#setup-submit' >/dev/null
agent-browser --session "$session" eval '(()=>{const source=JSON.parse(localStorage.getItem("quadrant:workshop:v1"));let legacy=structuredClone(source);for(let i=0;i<4;i++)legacy={...structuredClone(source),history:[legacy,structuredClone(legacy)]};const raw=JSON.stringify(legacy);localStorage.setItem("quadrant:response:v1:legacy-startup",raw);localStorage.setItem("foreign:keep","unchanged");sessionStorage.setItem("legacy-before",String(raw.length))})()' >/dev/null
agent-browser --session "$session" reload >/dev/null
startup="$(agent-browser --session "$session" eval '(()=>{const raw=localStorage.getItem("quadrant:response:v1:legacy-startup");const value=JSON.parse(raw);return Number(raw.length)<Number(sessionStorage.getItem("legacy-before"))&&value.history.length<=50&&value.history.every(entry=>entry.history.length===0)&&localStorage.getItem("foreign:keep")==="unchanged"})()')"

agent-browser --session "$session" click '#resume-button' >/dev/null
before="$(agent-browser --session "$session" get text '#candidate-card')"
agent-browser --session "$session" eval '(()=>{const source=JSON.parse(localStorage.getItem("quadrant:workshop:v1"));let legacy=structuredClone(source);for(let i=0;i<3;i++)legacy={...structuredClone(source),history:[legacy,structuredClone(legacy)]};localStorage.setItem("quadrant:response:v1:legacy-retry",JSON.stringify(legacy));const native=Storage.prototype.setItem;let activeAttempt=true;Storage.prototype.setItem=function(key,value){if(activeAttempt&&key==="quadrant:workshop:v1"){activeAttempt=false;throw new DOMException("Storage quota reached","QuotaExceededError")}return native.call(this,key,value)}})()' >/dev/null
agent-browser --session "$session" click '#place-option' >/dev/null
after="$(agent-browser --session "$session" get text '#candidate-card')"
recovered="$(agent-browser --session "$session" eval '(async()=>{const status=document.querySelector("#storage-status");const saved=JSON.parse(localStorage.getItem("quadrant:workshop:v1"));const app=(await import("./app.js")).facilitatorApp;return Boolean(status&&!status.hidden&&/cleaned up old saved work/i.test(status.innerText)&&/saved your current work/i.test(status.innerText)&&saved.candidateId===app.session.candidateId)})()')"
errors="$(agent-browser --session "$session" errors)"
[[ "$startup" == true && "$before" != "$after" && "$recovered" == true && "$errors" != *QuotaExceededError* ]] || { echo 'FAIL quadrant storage recovery: legacy state is not cleaned or active persistence does not recover'; exit 1; }
echo 'PASS quadrant storage recovery: legacy sessions compact and active persistence retries safely'

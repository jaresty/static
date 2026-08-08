#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8796}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-storage-quota-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false

session="quadrant-storage-quota-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?storage-quota=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear();document.querySelector("[data-tour-offer]")?.remove()' >/dev/null
agent-browser --session "$session" click '#solo-mode' >/dev/null
agent-browser --session "$session" click '#example-button' >/dev/null
agent-browser --session "$session" click '#setup-submit' >/dev/null
agent-browser --session "$session" set viewport 390 844 >/dev/null
before="$(agent-browser --session "$session" get text '#candidate-card')"
agent-browser --session "$session" eval 'Storage.prototype.setItem=function(){throw new DOMException("Storage quota reached","QuotaExceededError")}' >/dev/null
agent-browser --session "$session" click '#place-option' >/dev/null
after="$(agent-browser --session "$session" get text '#candidate-card')"
result="$(agent-browser --session "$session" eval '(()=>{const status=document.querySelector("#storage-status");return Boolean(status&&!status.hidden&&status.getBoundingClientRect().height>0&&/storage is full/i.test(status.innerText)&&/current work/i.test(status.innerText)&&document.documentElement.scrollWidth===document.documentElement.clientWidth)})()')"
errors="$(agent-browser --session "$session" errors)"
[[ "$before" != "$after" && "$result" == true && "$errors" != *QuotaExceededError* ]] || { echo 'FAIL quadrant storage quota: placement crashes, rolls back, or hides the persistence failure'; exit 1; }
echo 'PASS quadrant storage quota: placement remains usable and visibly reports failed persistence'

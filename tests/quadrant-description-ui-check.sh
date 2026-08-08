#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8798}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-description-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false

session="quadrant-description-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?description=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear();document.querySelector("[data-tour-offer]")?.remove()' >/dev/null
agent-browser --session "$session" click '#setup-mode' >/dev/null
agent-browser --session "$session" click '#example-button' >/dev/null
agent-browser --session "$session" fill '#activity-description' 'Use this map to discuss the roadmap tradeoffs before committing.' >/dev/null
agent-browser --session "$session" fill '[data-option-description="0"]' 'Search should help people recover when their first query misses.' >/dev/null
agent-browser --session "$session" click '#setup-submit' >/dev/null
url="$(agent-browser --session "$session" get value '#setup-share-output')"

invite="quadrant-description-invite-$$"
agent-browser --session "$invite" open "$url" >/dev/null
invitation="$(agent-browser --session "$invite" eval '(()=>/roadmap tradeoffs/.test(document.querySelector("#invitation-summary").innerText)&&/Search should help/.test(document.querySelector("#invitation-summary").innerText))()')"
agent-browser --session "$invite" click '#start-response' >/dev/null
placement="$(agent-browser --session "$invite" eval '(()=>Boolean(/roadmap tradeoffs/.test(document.querySelector("#placement-activity-description").innerText)&&document.querySelector("#candidate-description")))()')"
for _ in 1 2 3 4; do agent-browser --session "$invite" click '#place-option' >/dev/null; done
agent-browser --session "$invite" eval 'document.querySelector("#board .board-item").click()' >/dev/null
review="$(agent-browser --session "$invite" eval '(()=>{const inspector=document.querySelector("#item-description-inspector");const selected=document.querySelector("#board .board-item.selected");return Boolean(inspector&&!inspector.hidden&&/Search should help/.test(inspector.innerText)&&getComputedStyle(selected).zIndex==="50")})()')"
agent-browser --session "$invite" set viewport 390 844 >/dev/null
mobile="$(agent-browser --session "$invite" eval 'document.documentElement.scrollWidth===document.documentElement.clientWidth')"
errors="$(agent-browser --session "$invite" errors)"
[[ "$invitation" == true && "$placement" == true && "$review" == true && "$mobile" == true && -z "$errors" ]] || { echo "FAIL quadrant descriptions: invitation=$invitation placement=$placement review=$review mobile=$mobile errors=$errors"; exit 1; }
echo 'PASS quadrant descriptions: optional context survives authoring, sharing, placement, and review'

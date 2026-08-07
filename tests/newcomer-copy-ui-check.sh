#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
PORT="${PORT:-8799}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
browser_test_install_cleanup
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
for app in 2x2-facilitator pairwise-ranker; do
  session="newcomer-copy-${app}-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$app/?copy-check=$RANDOM" >/dev/null
  result="$(agent-browser --session "$session" eval '(()=>{const intro=document.querySelector("[data-newcomer-intro]")?.innerText||"";const cards=Array.from(document.querySelectorAll(".mode-card")).map(card=>card.innerText);const offer=document.querySelector("[data-tour-offer]")?.innerText||"";const quadrant=location.pathname.includes("2x2-facilitator");const method=quadrant?/places each option on two axes/i:/comparing two items at a time/i;const benefit=quadrant?/see trade-offs/i:/clear priority order/i;return {introVisible:Boolean(document.querySelector("[data-newcomer-intro]")?.getBoundingClientRect().height),method:method.test(intro),benefit:benefit.test(intro),solo:/Work solo[\s\S]*(yourself|on your own)/i.test(cards[0]||""),invite:/Invite responses[\s\S]*(same|share|send)/i.test(cards[1]||""),combine:/Combine responses[\s\S]*(compare|agreement|disagreement)/i.test(cards[2]||""),practice:/Practice the complete workflow/i.test(offer)}})()')"
  grep -Eq '"introVisible":[[:space:]]*true' <<<"$result" || { echo "FAIL newcomer-copy: $app does not visibly explain the method"; exit 1; }
  for key in method benefit solo invite combine practice; do
    grep -Eq "\"$key\":[[:space:]]*true" <<<"$result" || { echo "FAIL newcomer-copy: $app is missing clear $key guidance"; exit 1; }
  done
done
echo "PASS newcomer-copy: both first views explain method, benefit, workflow choices, and practice"

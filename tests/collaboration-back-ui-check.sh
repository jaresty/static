#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
PORT="${PORT:-8796}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
browser_test_install_cleanup
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
for app in 2x2-facilitator pairwise-ranker; do
  for choice in "Work solo" "Invite responses" "Combine responses"; do
    session="back-${app}-${choice// /-}-$$"
    agent-browser --session "$session" open "http://127.0.0.1:$PORT/$app/?back-check=$RANDOM" >/dev/null
    agent-browser --session "$session" find role button click --name "$choice" >/dev/null
    agent-browser --session "$session" wait 150 >/dev/null
    has_field="$(agent-browser --session "$session" eval '(()=>{const visible=el=>{const r=el.getBoundingClientRect();return !el.hidden&&r.width>0&&r.height>0};const field=Array.from(document.querySelectorAll("input:not([type=checkbox]):not([type=radio]),textarea")).find(visible);if(!field)return false;field.value="KEEP THIS DRAFT";field.dispatchEvent(new Event("input",{bubbles:true}));return true})()')"
    if ! agent-browser --session "$session" find role button click --name "Back to choices" >/dev/null 2>&1; then
      echo "FAIL back-to-choices: $app $choice has no visible Back to choices action"
      exit 1
    fi
    agent-browser --session "$session" wait 150 >/dev/null
    entry_visible="$(agent-browser --session "$session" eval 'Array.from(document.querySelectorAll("button")).some(b=>b.innerText.startsWith("Work solo")&&!b.hidden&&b.getBoundingClientRect().width>0)')"
    [[ "$entry_visible" == true ]] || { echo "FAIL back-to-choices: $app $choice did not return to entry choices"; exit 1; }
    agent-browser --session "$session" find role button click --name "$choice" >/dev/null
    agent-browser --session "$session" wait 150 >/dev/null
    [[ "$has_field" != true ]] || {
      retained="$(agent-browser --session "$session" eval '(()=>{const visible=el=>{const r=el.getBoundingClientRect();return !el.hidden&&r.width>0&&r.height>0};return Array.from(document.querySelectorAll("input:not([type=checkbox]):not([type=radio]),textarea")).find(visible)?.value==="KEEP THIS DRAFT"})()')"
      [[ "$retained" == true ]] || { echo "FAIL back-to-choices: $app $choice discarded entered work"; exit 1; }
    }
  done
done
echo "PASS back-to-choices: both apps return from all entry modes without discarding drafts"

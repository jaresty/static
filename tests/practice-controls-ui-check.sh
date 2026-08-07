#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
PORT="${PORT:-8797}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
browser_test_install_cleanup
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
for app in 2x2-facilitator pairwise-ranker; do
  restart_session="practice-restart-${app}-$$"
  agent-browser --session "$restart_session" open "http://127.0.0.1:$PORT/$app/?walkthrough=1" >/dev/null
  agent-browser --session "$restart_session" wait '.driver-popover' >/dev/null
  agent-browser --session "$restart_session" click '.driver-popover-next-btn' >/dev/null
  agent-browser --session "$restart_session" wait 250 >/dev/null
  if ! agent-browser --session "$restart_session" find role button click --name "Restart practice" >/dev/null 2>&1; then
    echo "FAIL practice-controls: $app Restart practice is blocked while the walkthrough is active"
    exit 1
  fi
  agent-browser --session "$restart_session" wait '.driver-popover' >/dev/null
  restarted="$(agent-browser --session "$restart_session" eval 'document.querySelector(".driver-popover")?.innerText.includes("1 of 11")')"
  [[ "$restarted" == true ]] || { echo "FAIL practice-controls: $app Restart practice did not return to step 1"; exit 1; }

  exit_session="practice-exit-${app}-$$"
  agent-browser --session "$exit_session" open "http://127.0.0.1:$PORT/$app/?walkthrough=1" >/dev/null
  agent-browser --session "$exit_session" wait '.driver-popover' >/dev/null
  if ! agent-browser --session "$exit_session" find role button click --name "Exit practice" >/dev/null 2>&1; then
    echo "FAIL practice-controls: $app Exit practice is blocked while the walkthrough is active"
    exit 1
  fi
  agent-browser --session "$exit_session" wait 250 >/dev/null
  if exit_url="$(agent-browser --session "$exit_session" get url 2>/dev/null)"; then
    [[ "$exit_url" == "about:blank" || "$exit_url" == "http://127.0.0.1:$PORT/$app/" ]] || { echo "FAIL practice-controls: $app Exit practice left an active practice context"; exit 1; }
  fi
done
echo "PASS practice-controls: restart and exit remain usable throughout both walkthroughs"

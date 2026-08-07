#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8766}"
SERVER_LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$(cd "$(dirname "$0")/.." && pwd)" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
source "$(cd "$(dirname "$0")" && pwd)/browser-test-cleanup.sh"
browser_test_install_cleanup

for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

failures=()
for spec in "quadrant:2x2-facilitator" "stack-rank:pairwise-ranker"; do
  name="${spec%%:*}"
  path="${spec#*:}"
  session="collaboration-solo-$name-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?check=$$" >/dev/null
  agent-browser --session "$session" click '#solo-mode' >/dev/null
  if [[ "${SOLO_VIOLATION:-}" == "$name" ]]; then
    agent-browser --session "$session" eval 'delete document.body.dataset.mode; document.querySelector("#mode-view").hidden = false; document.querySelector("#setup-view").hidden = true' >/dev/null
  fi
  result="$(agent-browser --session "$session" eval 'document.body.dataset.mode === "solo" && document.querySelector("#mode-view").hidden && !document.querySelector("#setup-view").hidden && document.querySelector("#setup-form").getClientRects().length > 0')"
  if [[ "$result" != 'true' ]]; then
    failures+=("$name observed $result")
  fi
done

if ((${#failures[@]})); then
  printf 'FAIL solo route: %s\n' "${failures[*]}"
  exit 1
fi

printf 'PASS solo route: both apps enter their legacy local setup in solo mode\n'

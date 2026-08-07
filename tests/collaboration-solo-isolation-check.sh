#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8767}"
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
  session="collaboration-isolation-$name-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?check=$$" >/dev/null
  agent-browser --session "$session" eval 'localStorage.clear(); history.replaceState(null, "", location.pathname + location.search)' >/dev/null
  agent-browser --session "$session" click '#solo-mode' >/dev/null
  if [[ "${SOLO_ARTIFACT_VIOLATION:-}" == "$name" ]]; then
    agent-browser --session "$session" eval 'localStorage.setItem("test:collaboration:response", "created")' >/dev/null
  fi
  result="$(agent-browser --session "$session" eval '!location.hash && !document.body.dataset.setupId && !document.body.dataset.responseId && !Object.keys(localStorage).some(key => /collaboration|response|collection|setup/i.test(key))')"
  if [[ "$result" != 'true' ]]; then
    failures+=("$name created a collaboration artifact")
  fi
done

if ((${#failures[@]})); then
  printf 'FAIL solo isolation: %s\n' "${failures[*]}"
  exit 1
fi

printf 'PASS solo isolation: local solo mode creates no collaboration artifact\n'

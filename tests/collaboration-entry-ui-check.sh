#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8765}"
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
  session="collaboration-entry-$name-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?check=$$" >/dev/null
  result="$(agent-browser --session "$session" eval 'JSON.stringify(["Work solo","Invite responses","Combine responses"].filter(label => !Array.from(document.querySelectorAll("button, a")).some(node => (node.querySelector("strong")?.textContent || node.textContent).trim() === label)))')"
  if [[ "$result" != '[]' && "$result" != '"[]"' ]]; then
    failures+=("$name missing $result")
  fi
done

if ((${#failures[@]})); then
  printf 'FAIL entry choices: %s\n' "${failures[*]}"
  exit 1
fi

printf 'PASS entry choices: both apps render Work solo, Invite responses, and Combine responses\n'

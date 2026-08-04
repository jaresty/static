#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_ADAPTIVE_PORT:-$((4200 + RANDOM % 1000))}"
SESSION="ohara-adaptive-check-$$"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-adaptive-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null
agent-browser --session "$SESSION" set viewport 390 844 >/dev/null

case "${OHARA_ADAPTIVE_FAULT:-}" in
  stage) agent-browser --session "$SESSION" eval "document.querySelector('.adaptive-stage')?.remove()" >/dev/null ;;
  nav) agent-browser --session "$SESSION" eval "document.querySelector('#step-next')?.remove()" >/dev/null ;;
esac

if [[ "$(agent-browser --session "$SESSION" get count '[data-adaptive-canvas]')" != "1" ]]; then
  echo "FAIL a19: adaptive assembly canvas is absent" >&2
  exit 1
fi
[[ "$(agent-browser --session "$SESSION" get count '.adaptive-stage:not([hidden])')" == "1" ]] || { echo "FAIL a19: more than one decision surface is visible" >&2; exit 1; }
[[ "$(agent-browser --session "$SESSION" get count '#step-back')" == "1" && "$(agent-browser --session "$SESSION" get count '#step-next')" == "1" ]] || { echo "FAIL a19: persistent step navigation is incomplete" >&2; exit 1; }
echo "PASS a19: one adaptive canvas and persistent navigation render"

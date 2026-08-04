#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_OVERLAY_PORT:-$((5300 + RANDOM % 700))}"
SESSION="ohara-overlay-check-$$"
TARGET="${OHARA_OVERLAY_TARGET:-all}"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-overlay-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null

check_length() {
  [[ "$(agent-browser --session "$SESSION" get count '[data-measurement="length"]')" == "1" ]] || { echo "FAIL a20-length: dimension annotation is absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get text '[data-measurement="length"]')" == *"40 cm"* ]] || { echo "FAIL a20-length: dimension value is absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" eval "(()=>{const e=document.querySelector('.measure-stem i');const r=e.getBoundingClientRect();return getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'&&r.height>0})()")" == "true" ]] || { echo "FAIL a20-length: dimension line is not visibly rendered" >&2; exit 1; }
}
check_kenzan() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-holder[data-object="whole-kenzan"]')" == "1" ]] || { echo "FAIL a20-kenzan: whole flower holder is absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get count '.kenzan-target,.kenzan-measure line')" == "0" ]] || { echo "FAIL a20-kenzan: stem insertion target or vector remains" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get text '.kenzan-label')" == *"WHOLE KENZAN"* ]] || { echo "FAIL a20-kenzan: holder label is absent" >&2; exit 1; }
}
check_plan() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get count '.angle-arc')" == "1" ]] || { echo "FAIL a20-plan: angle arc is absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get text '.angle-label')" == "8° RIGHT" ]] || { echo "FAIL a20-plan: degree-and-direction label is absent" >&2; exit 1; }
}
check_elevation() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  [[ "$(agent-browser --session "$SESSION" get count '.angle-arc')" == "1" ]] || { echo "FAIL a20-elevation: angle arc is absent" >&2; exit 1; }
  [[ "$(agent-browser --session "$SESSION" get text '.angle-label')" == "80°" ]] || { echo "FAIL a20-elevation: degree label is absent" >&2; exit 1; }
}

case "$TARGET" in
  length) check_length ;;
  kenzan) check_kenzan ;;
  plan) check_plan ;;
  elevation) check_elevation ;;
  all)
    check_length
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    [[ "$(agent-browser --session "$SESSION" get count '.kenzan-holder[data-object="whole-kenzan"]')" == "1" && "$(agent-browser --session "$SESSION" get count '.kenzan-target,.kenzan-measure line')" == "0" ]] || { echo "FAIL a20-kenzan: whole-holder semantics are absent" >&2; exit 1; }
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    [[ "$(agent-browser --session "$SESSION" get count '.angle-arc')" == "1" && "$(agent-browser --session "$SESSION" get text '.angle-label')" == "8° RIGHT" ]] || { echo "FAIL a20-plan: angle annotation is absent" >&2; exit 1; }
    agent-browser --session "$SESSION" click '#step-next' >/dev/null
    [[ "$(agent-browser --session "$SESSION" get count '.angle-arc')" == "1" && "$(agent-browser --session "$SESSION" get text '.angle-label')" == "80°" ]] || { echo "FAIL a20-elevation: angle annotation is absent" >&2; exit 1; }
    ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS a20-$TARGET: measurements and angles are embedded in the active diagram"

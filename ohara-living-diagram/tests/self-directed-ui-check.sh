#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${OHARA_SELF_PORT:-$((6100 + RANDOM % 600))}"
SESSION="ohara-self-check-$$"
TARGET="${OHARA_SELF_TARGET:-all}"
FAULT="${OHARA_SELF_FAULT:-none}"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/ohara-self-check.log 2>&1 &
SERVER_PID=$!
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep 0.1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/" >/dev/null
agent-browser --session "$SESSION" wait --load networkidle >/dev/null
agent-browser --session "$SESSION" set viewport 390 844 >/dev/null

check_language() {
  local copy
  copy="$(agent-browser --session "$SESSION" get text body)"
  if grep -Eqi '\b(teacher mode|teacher view|for teachers|learner|student)\b' <<<"$copy"; then echo "FAIL a21-language: role-partitioned copy remains" >&2; exit 1; fi
}
check_persistence() {
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  agent-browser --session "$SESSION" click '#step-next' >/dev/null
  if [[ "$FAULT" == "persistence" ]]; then agent-browser --session "$SESSION" eval "localStorage.clear()" >/dev/null; fi
  agent-browser --session "$SESSION" reload >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null
  [[ "$(agent-browser --session "$SESSION" get attr '.adaptive-stage' data-step)" == "plan" ]] || { echo "FAIL a21-persistence: current step is not restored" >&2; exit 1; }
}
check_mobile() {
  if [[ "$FAULT" == "overflow" ]]; then agent-browser --session "$SESSION" eval "document.querySelector('.adaptive-canvas').style.width='1000px'" >/dev/null; fi
  [[ "$(agent-browser --session "$SESSION" eval "[document.querySelector('.adaptive-canvas'),document.querySelector('.adaptive-stage')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})")" == "true" ]] || { echo "FAIL a21-mobile: adaptive canvas overflows 390px" >&2; exit 1; }
}
check_offline() {
  agent-browser --session "$SESSION" eval "navigator.serviceWorker.ready.then(() => true)" >/dev/null
  if [[ "$FAULT" == "offline" ]]; then agent-browser --session "$SESSION" eval "Promise.all([caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))),navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))])" >/dev/null; fi
  kill "$SERVER_PID"; SERVER_PID=""
  agent-browser --session "$SESSION" reload >/dev/null || true
  [[ "$(agent-browser --session "$SESSION" get count '[data-adaptive-canvas]')" == "1" ]] || { echo "FAIL a21-offline: adaptive canvas does not reload without origin" >&2; exit 1; }
}

case "$TARGET" in
  language) check_language ;;
  persistence) check_persistence ;;
  mobile) check_mobile ;;
  offline) check_offline ;;
  all) check_language; check_persistence; check_mobile; check_offline ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS a21-$TARGET: workflow is self-directed, persistent, mobile, and offline"

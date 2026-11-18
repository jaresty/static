#!/usr/bin/env bash
# Bounded Chromium UI smoke, not accessibility certification. Logs retained outside repo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$(mktemp -d /tmp/workload-demo-browser.XXXXXX)"
SESSION="workload-smoke-$$"
# Keep launch-affecting options identical on every invocation (otherwise the CLI may relaunch).
agent-browser(){ command agent-browser --allowed-domains 127.0.0.1 "$@"; }
PORT=9287
SERVER_PID=""
cleanup(){ agent-browser --session "$SESSION" close >/dev/null 2>&1 || true; [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT
printf 'Evidence directory: %s\n' "$LOG"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" > "$LOG/server.log" 2>&1 &
SERVER_PID=$!
for _ in {1..50}; do if curl -fsS "http://127.0.0.1:$PORT/causal-playground/workload-demo/" > /dev/null 2>&1; then break; fi; sleep .1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/causal-playground/understanding.html"
agent-browser --session "$SESSION" snapshot -i > "$LOG/guide-snapshot.txt"
agent-browser --session "$SESSION" click 'a[href="./workload-demo/"]'
agent-browser --session "$SESSION" wait --text 'Charts and table updated.'
agent-browser --session "$SESSION" snapshot -i > "$LOG/demo-snapshot.txt"
validate(){ python3 - "$1" <<'PY'
import json,sys
r=json.load(open(sys.argv[1])); print(json.dumps(r,indent=2)); assert r.get('ok') is True,r
PY
}
agent-browser --session "$SESSION" set viewport 1440 1000
agent-browser --session "$SESSION" eval --stdin < "$ROOT/causal-playground/workload-demo/browser-check.js" > "$LOG/desktop.json"
validate "$LOG/desktop.json"
# Real keyboard input and focus navigation in addition to DOM-driven preset coverage.
agent-browser --session "$SESSION" fill '#B0' '15'
agent-browser --session "$SESSION" focus '#B0'
agent-browser --session "$SESSION" press Tab
agent-browser --session "$SESSION" eval '({ok:document.activeElement.id==="S0"})' > "$LOG/keyboard-focus.json"
validate "$LOG/keyboard-focus.json"
agent-browser --session "$SESSION" click 'button[type="submit"]'
agent-browser --session "$SESSION" wait --text 'Custom scenario applied'
agent-browser --session "$SESSION" fill '#day' '20'
agent-browser --session "$SESSION" press Tab
agent-browser --session "$SESSION" eval '({ok:document.getElementById("inspection").textContent.includes("State at day 20")})' > "$LOG/day-input.json"
validate "$LOG/day-input.json"
agent-browser --session "$SESSION" set viewport 320 850
agent-browser --session "$SESSION" click '[data-preset="recovery"]'
agent-browser --session "$SESSION" wait --text 'Recovery scenario applied'
agent-browser --session "$SESSION" eval --stdin < "$ROOT/causal-playground/workload-demo/browser-check.js" > "$LOG/narrow.json"
validate "$LOG/narrow.json"
agent-browser --session "$SESSION" focus '.table-scroll'
agent-browser --session "$SESSION" press ArrowRight
agent-browser --session "$SESSION" eval '({ok:document.activeElement.classList.contains("table-scroll")&&document.documentElement.scrollWidth<=innerWidth,tableScroll:document.activeElement.scrollLeft,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth})' > "$LOG/narrow-keyboard.json"
validate "$LOG/narrow-keyboard.json"
agent-browser --session "$SESSION" errors > "$LOG/page-errors.txt"
python3 - "$LOG/page-errors.txt" <<'PY'
import pathlib,sys
errors=pathlib.Path(sys.argv[1]).read_text().strip()
assert not errors,errors
print('PASS no browser page errors')
PY
agent-browser --session "$SESSION" network requests > "$LOG/requests.txt"
printf 'PASS workload browser smoke: discovery, presets, controls, ledger, resolution, charts/table, keyboard, 320px. Evidence: %s\n' "$LOG"

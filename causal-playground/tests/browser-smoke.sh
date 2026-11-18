#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$(mktemp -d)"
PORT="${CAUSAL_TEST_PORT:-$((9100 + RANDOM % 500))}"
SESSION="causal-smoke-$$"
SERVER_PID=""
cleanup(){ agent-browser --session "$SESSION" close >/dev/null 2>&1 || true; [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap cleanup EXIT
ln -s "$ROOT" "$BASE/static"
python3 -m http.server "$PORT" --directory "$BASE" >"$BASE/server.log" 2>&1 &
SERVER_PID=$!
for _ in {1..50}; do if curl -fsS "http://127.0.0.1:$PORT/static/causal-playground/" >/dev/null 2>&1; then break; fi; sleep .1; done
agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/static/causal-playground/"
agent-browser --session "$SESSION" wait --text 'Room to recover'
run_guard(){
  local file="$1"
  agent-browser --session "$SESSION" eval --stdin < "$ROOT/causal-playground/tests/$file" > "$BASE/result.json"
  python3 - "$BASE/result.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print(json.dumps(r,indent=2))
if r.get('error') or r.get('failures') or r.get('ok') is False: raise SystemExit(1)
PY
}
run_guard interface-check.js
# Clear this test session's own autosave so the complete authoring path starts from the specimen.
agent-browser --session "$SESSION" eval 'localStorage.removeItem("causal-playground.v1"); location.reload()'
agent-browser --session "$SESSION" wait --text 'Room to recover'
run_guard browser-check.js
agent-browser --session "$SESSION" eval 'document.getElementById("charts").scrollIntoView()'
agent-browser --session "$SESSION" hover '.u-over'
run_guard playback-check.js
agent-browser --session "$SESSION" eval 'document.getElementById("title").scrollIntoView()'
agent-browser --session "$SESSION" hover '#title'
run_guard playback-check.js
agent-browser --session "$SESSION" set viewport 320 850
agent-browser --session "$SESSION" eval 'document.querySelector("button[data-view=inspector]").click()'
agent-browser --session "$SESSION" select '#objects' 'node:a'
agent-browser --session "$SESSION" focus '#objects'
agent-browser --session "$SESSION" press Tab
agent-browser --session "$SESSION" eval '({ok:document.activeElement?.getAttribute("type")==="text"&&document.documentElement.scrollWidth<=innerWidth,keyboardFocus:document.activeElement?.outerHTML,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth})' > "$BASE/narrow.json"
python3 - "$BASE/narrow.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print(json.dumps(r,indent=2));assert r['ok']
PY
agent-browser --session "$SESSION" eval 'document.querySelector("button[data-view=charts]").click()'
agent-browser --session "$SESSION" eval '({ok:document.getElementById("charts").getBoundingClientRect().width>0&&document.documentElement.scrollWidth<=innerWidth,width:document.getElementById("charts").getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth})' > "$BASE/narrow-chart.json"
python3 - "$BASE/narrow-chart.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));print(json.dumps(r,indent=2));assert r['ok']
PY
printf 'PASS causal browser smoke: author/run/inspect/AI/import/share/draw/playback/narrow/keyboard\n'

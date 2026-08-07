#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8769}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
for _ in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

quadrant_url="$(node --input-type=module -e "import {createWorkshop} from './2x2-facilitator/core.mjs'; import {encodeSetupUrl} from './2x2-facilitator/collaboration.mjs'; console.log(encodeSetupUrl(createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'}),'http://127.0.0.1:$PORT/2x2-facilitator/'))")"
stack_url="$(node --input-type=module -e "import {createSession} from './pairwise-ranker/ranking.mjs'; import {encodeSetupUrl} from './pairwise-ranker/collaboration.mjs'; console.log(encodeSetupUrl(createSession('expected impact','Alpha\nBeta\nGamma'),'http://127.0.0.1:$PORT/pairwise-ranker/'))")"
quadrant_reopen="${quadrant_url/\#/?resume=$$#}"
stack_reopen="${stack_url/\#/?resume=$$#}"

failures=()

qsession="quadrant-response-resume-$$"
agent-browser --session "$qsession" open "$quadrant_url" >/dev/null
agent-browser --session "$qsession" eval 'localStorage.clear()' >/dev/null
agent-browser --session "$qsession" click '#start-response' >/dev/null
agent-browser --session "$qsession" click '#place-option' >/dev/null
qbefore="$(agent-browser --session "$qsession" eval 'Object.values(localStorage).map(JSON.parse).find(value => value.positions)?.positions && Object.keys(Object.values(localStorage).map(JSON.parse).find(value => value.positions).positions).length')"
agent-browser --session "$qsession" open "$quadrant_reopen" >/dev/null
qreadonly="$(agent-browser --session "$qsession" eval 'document.body.dataset.mode === "shared-setup" && Object.values(localStorage).map(JSON.parse).some(value => Object.keys(value.positions || {}).length === 2)')"
agent-browser --session "$qsession" click '#start-response' >/dev/null
qafter="$(agent-browser --session "$qsession" eval 'Object.keys(Object.values(localStorage).map(JSON.parse).find(value => value.positions).positions).length')"
[[ "$qbefore" == 2 && "$qreadonly" == true && "$qafter" == 2 ]] || failures+=("quadrant progress $qbefore/$qreadonly/$qafter")

ssession="stack-response-resume-$$"
agent-browser --session "$ssession" open "$stack_url" >/dev/null
agent-browser --session "$ssession" eval 'localStorage.clear()' >/dev/null
agent-browser --session "$ssession" click '#start-response' >/dev/null
agent-browser --session "$ssession" click '#left-button' >/dev/null
sbefore="$(agent-browser --session "$ssession" eval 'Object.values(localStorage).map(JSON.parse).find(value => value.comparisons)?.comparisons.length')"
agent-browser --session "$ssession" open "$stack_reopen" >/dev/null
sreadonly="$(agent-browser --session "$ssession" eval 'document.body.dataset.mode === "shared-setup" && Object.values(localStorage).map(JSON.parse).some(value => value.comparisons?.length === 1)')"
agent-browser --session "$ssession" click '#start-response' >/dev/null
safter="$(agent-browser --session "$ssession" eval 'Object.values(localStorage).map(JSON.parse).find(value => value.comparisons)?.comparisons.length')"
[[ "$sbefore" == 1 && "$sreadonly" == true && "$safter" == 1 ]] || failures+=("stack-rank progress $sbefore/$sreadonly/$safter")

if ((${#failures[@]})); then
  printf 'FAIL response resume: %s\n' "${failures[*]}"
  exit 1
fi
printf 'PASS response resume: shared setup remains read-only and Start my response resumes local progress\n'

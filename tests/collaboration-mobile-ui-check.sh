#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8773}"
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

failures=()
for spec in "quadrant:2x2-facilitator:$quadrant_url" "stack-rank:pairwise-ranker:$stack_url"; do
  IFS=: read -r name path protocol rest <<<"$spec"
  setup_url="$protocol:$rest"
  session="collaboration-mobile-$name-$$"
  agent-browser --session "$session" set viewport 390 844 >/dev/null

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?mobile=$$" >/dev/null
  entry_ok="$(agent-browser --session "$session" eval 'document.documentElement.scrollWidth <= innerWidth && Array.from(document.querySelectorAll(".mode-card")).every(node => node.getBoundingClientRect().height >= 48)')"
  [[ "$entry_ok" == true ]] || failures+=("$name mobile entry")

  agent-browser --session "$session" open "$setup_url" >/dev/null
  if [[ "${MOBILE_VIOLATION:-}" == "$name" ]]; then
    agent-browser --session "$session" eval 'document.body.style.minWidth="900px"' >/dev/null
  fi
  invitation_ok="$(agent-browser --session "$session" eval 'document.documentElement.scrollWidth <= innerWidth && document.querySelector("#start-response").getBoundingClientRect().height >= 48')"
  [[ "$invitation_ok" == true ]] || failures+=("$name mobile invitation")

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?collect-mobile=$$" >/dev/null
  agent-browser --session "$session" click '#combine-mode' >/dev/null
  collection_ok="$(agent-browser --session "$session" eval 'document.documentElement.scrollWidth <= innerWidth && document.querySelector("#collect-responses").getBoundingClientRect().height >= 48')"
  [[ "$collection_ok" == true ]] || failures+=("$name mobile collection")
done

if ((${#failures[@]})); then
  printf 'FAIL collaboration mobile: %s\n' "${failures[*]}"
  exit 1
fi
printf 'PASS collaboration mobile: entry, invitation, and collection fit 390px with usable actions\n'

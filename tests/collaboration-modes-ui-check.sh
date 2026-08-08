#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8768}"
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

quadrant_url="$(node --input-type=module -e "import {createWorkshop} from './2x2-facilitator/core.mjs'; import {encodeSetupUrl} from './2x2-facilitator/collaboration.mjs'; const s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'}); console.log(encodeSetupUrl(s,'http://127.0.0.1:$PORT/2x2-facilitator/'));" )"
stack_url="$(node --input-type=module -e "import {createSession} from './pairwise-ranker/ranking.mjs'; import {encodeSetupUrl} from './pairwise-ranker/collaboration.mjs'; const s=createSession('expected impact','Alpha\nBeta\nGamma'); console.log(encodeSetupUrl(s,'http://127.0.0.1:$PORT/pairwise-ranker/'));" )"

failures=()
for spec in "quadrant:2x2-facilitator:$quadrant_url:placement-view" "stack-rank:pairwise-ranker:$stack_url:compare-view"; do
  IFS=: read -r name path protocol rest <<<"$spec"
  setup_url="$protocol:$rest"
  work_view="${setup_url##*:}"
  setup_url="${setup_url%:*}"
  session="collaboration-modes-$name-$$"

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?check=$$" >/dev/null
  agent-browser --session "$session" eval 'document.querySelector("#setup-mode").click()' >/dev/null
  agent-browser --session "$session" wait --fn 'window.scrollY === 0' >/dev/null
  setup_ok="$(agent-browser --session "$session" eval 'document.body.dataset.mode === "facilitator-setup" && !document.querySelector("#setup-view")?.hidden && document.querySelector("#workspace-mode-label")?.textContent.trim() === "FACILITATOR SETUP" && document.querySelector("#workspace-mode-label").getBoundingClientRect().top >= 0 && window.scrollY === 0 && /links contain setup data/i.test(document.querySelector("#privacy-note")?.textContent || "")')"
  [[ "$setup_ok" == true ]] || failures+=("$name facilitator setup")

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?combine=$$" >/dev/null
  agent-browser --session "$session" click '#combine-mode' >/dev/null
  combine_ok="$(agent-browser --session "$session" eval 'document.body.dataset.mode === "facilitator-view" && !document.querySelector("#collection-view")?.hidden && document.querySelector("#collection-mode-label")?.textContent.trim() === "FACILITATOR VIEW"')"
  [[ "$combine_ok" == true ]] || failures+=("$name facilitator view")

  agent-browser --session "$session" eval 'localStorage.clear()' >/dev/null
  agent-browser --session "$session" open "$setup_url" >/dev/null
  invitation_ok="$(agent-browser --session "$session" eval 'document.body.dataset.mode === "shared-setup" && !document.querySelector("#invitation-view")?.hidden && document.querySelector("#invitation-mode-label")?.textContent.trim() === "SHARED SETUP" && /links contain setup data/i.test(document.querySelector("#privacy-note")?.textContent || "") && localStorage.length === 0')"
  [[ "$invitation_ok" == true ]] || failures+=("$name read-only invitation")

  if [[ "$invitation_ok" == true ]]; then
    agent-browser --session "$session" click '#start-response' >/dev/null
  fi
  response_ok="$(agent-browser --session "$session" eval "document.body.dataset.mode === 'response' && !document.querySelector('#$work_view')?.hidden && Object.keys(localStorage).some(key => key.includes('response'))")"
  [[ "$response_ok" == true ]] || failures+=("$name explicit response start")
  if [[ "$response_ok" == true ]]; then
    reset_selector='#placement-reset'
    [[ "$name" == stack-rank ]] && reset_selector='#restart-compare-button'
    agent-browser --session "$session" eval "document.querySelector('$reset_selector').click()" >/dev/null
    reset_ok="$(agent-browser --session "$session" eval "document.body.dataset.mode === 'response' && !document.querySelector('#$work_view')?.hidden && document.querySelector('#setup-view')?.hidden")"
    [[ "$reset_ok" == true ]] || failures+=("$name response restart boundary")
  fi
done

if ((${#failures[@]})); then
  printf 'FAIL collaboration modes: %s\n' "${failures[*]}"
  exit 1
fi

printf 'PASS collaboration modes: setup, invitation, response, and facilitator views are distinct in both apps\n'

#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8785}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done

quadrant_url="$(node --input-type=module -e "import {createWorkshop} from './2x2-facilitator/core.mjs';import{encodeSetupUrl}from'./2x2-facilitator/collaboration.mjs';const s=createWorkshop({prompt:'Choose an idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta'});console.log(encodeSetupUrl(s,'http://127.0.0.1:$PORT/2x2-facilitator/'));"
)"
stack_url="$(node --input-type=module -e "import {createSession} from './pairwise-ranker/ranking.mjs';import{encodeSetupUrl}from'./pairwise-ranker/collaboration.mjs';const s=createSession('Expected impact','Alpha\nBeta');console.log(encodeSetupUrl(s,'http://127.0.0.1:$PORT/pairwise-ranker/'));"
)"

for spec in "quadrant|$quadrant_url" "stack-rank|$stack_url"; do
  IFS='|' read -r name url <<<"$spec"
  session="home-navigation-$name-$$"
  agent-browser --session "$session" open "$url" >/dev/null
  home_link="$(agent-browser --session "$session" eval '(()=>{const link=document.querySelector("#home-link");return document.body.dataset.mode==="shared-setup"&&link?.tagName==="A"&&link.getClientRects().length>0&&new URL(link.href).pathname==="/"&&/back to tool choices/i.test(link.getAttribute("aria-label")||"")})()')"
  [[ "$home_link" == true ]] || { echo "FAIL home navigation: $name participant page has no accessible root link on its home mark"; exit 1; }
  agent-browser --session "$session" click '#home-link' >/dev/null
  agent-browser --session "$session" wait --url "http://127.0.0.1:$PORT/" >/dev/null
  destination="$(agent-browser --session "$session" get url)"
  [[ "$destination" == "http://127.0.0.1:$PORT/" ]] || { echo "FAIL home navigation: $name home mark does not reach the root catalogue"; exit 1; }
done

echo 'PASS home navigation: both participant pages expose a home mark that reaches the root catalogue'

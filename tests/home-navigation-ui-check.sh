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

failures=()
for spec in "quadrant|$quadrant_url|/2x2-facilitator/|Quadrant" "stack-rank|$stack_url|/pairwise-ranker/|Stack Rank"; do
  IFS='|' read -r name url app_path product_name <<<"$spec"
  session="home-navigation-$name-$$"
  agent-browser --session "$session" open "$url" >/dev/null
  agent-browser --session "$session" set viewport 390 844 >/dev/null
  contract="$(agent-browser --session "$session" eval "(()=>{const product=document.querySelector('#home-link');const tools=document.querySelector('[data-all-tools]');const privacy=document.querySelector('#privacy-note');return document.body.dataset.mode==='shared-setup'&&product?.tagName==='A'&&product.getClientRects().length>0&&new URL(product.href).pathname==='$app_path'&&product.innerText.includes('$product_name')&&new URL(tools?.href||location.href).pathname==='/'&&/all tools/i.test(tools?.innerText||'')&&getComputedStyle(privacy).display==='none'&&document.documentElement.scrollWidth===document.documentElement.clientWidth})()")"
  if [[ "$contract" != true ]]; then
    failures+=("$name link contract")
    continue
  fi
  agent-browser --session "$session" click '#home-link' >/dev/null
  agent-browser --session "$session" wait --url "http://127.0.0.1:$PORT$app_path" >/dev/null
  [[ "$(agent-browser --session "$session" get url)" == "http://127.0.0.1:$PORT$app_path" ]] || failures+=("$name product destination")
  agent-browser --session "$session" open "$url" >/dev/null
  agent-browser --session "$session" click '[data-all-tools]' >/dev/null
  agent-browser --session "$session" wait --url "http://127.0.0.1:$PORT/" >/dev/null
  [[ "$(agent-browser --session "$session" get url)" == "http://127.0.0.1:$PORT/" ]] || failures+=("$name catalogue destination")
done

((${#failures[@]} == 0)) || { printf 'FAIL home navigation: %s\n' "${failures[*]}"; exit 1; }
echo 'PASS home navigation: product marks open their apps and All tools opens the catalogue'

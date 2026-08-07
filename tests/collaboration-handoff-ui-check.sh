#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8772}"
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

quadrant_response="$(node --input-type=module -e "import {createWorkshop,placeAt} from './2x2-facilitator/core.mjs'; import {encodeResponseUrl} from './2x2-facilitator/collaboration.mjs'; let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'}); s=placeAt(s,{x:.2,y:.7}); s=placeAt(s,{x:.8,y:.4}); console.log(encodeResponseUrl(s,{contributor:'Alex',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));")"
quadrant_response_2="$(node --input-type=module -e "import {createWorkshop,placeAt} from './2x2-facilitator/core.mjs'; import {encodeResponseUrl} from './2x2-facilitator/collaboration.mjs'; let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'}); s=placeAt(s,{x:.9,y:.1}); s=placeAt(s,{x:.1,y:.9}); console.log(encodeResponseUrl(s,{contributor:'Blair',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));")"
stack_response="$(node --input-type=module -e "import {createSession,applyChoice} from './pairwise-ranker/ranking.mjs'; import {encodeResponseUrl} from './pairwise-ranker/collaboration.mjs'; let s=createSession('expected impact','Alpha\nBeta\nGamma'); while(s.phase==='comparing') s=applyChoice(s,'left'); console.log(encodeResponseUrl(s,{contributor:'Alex',baseUrl:'http://127.0.0.1:$PORT/pairwise-ranker/'}));")"
stack_response_2="$(node --input-type=module -e "import {createSession,applyChoice} from './pairwise-ranker/ranking.mjs'; import {encodeResponseUrl} from './pairwise-ranker/collaboration.mjs'; let s=createSession('expected impact','Alpha\nBeta\nGamma'); while(s.phase==='comparing') s=applyChoice(s,'right'); console.log(encodeResponseUrl(s,{contributor:'Blair',baseUrl:'http://127.0.0.1:$PORT/pairwise-ranker/'}));")"

failures=()
for spec in "quadrant|2x2-facilitator|$quadrant_response|$quadrant_response_2|#quadrant=" "stack-rank|pairwise-ranker|$stack_response|$stack_response_2|#stack-rank="; do
  IFS='|' read -r name path response_url response_url_2 expected_fragment <<<"$spec"
  session="collaboration-handoff-$name-$$"

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?setup=$$" >/dev/null
  agent-browser --session "$session" eval 'localStorage.clear()' >/dev/null
  agent-browser --session "$session" click '#setup-mode' >/dev/null
  agent-browser --session "$session" click '#example-button' >/dev/null
  agent-browser --session "$session" click '#setup-submit' >/dev/null
  if [[ "${HANDOFF_VIOLATION:-}" == "$name" ]]; then
    agent-browser --session "$session" eval 'document.querySelector("#setup-share-output").value = ""' >/dev/null
  fi
  setup_ok="$(agent-browser --session "$session" eval "document.querySelector('#setup-share-output').value.includes('$expected_fragment') && !document.querySelector('#setup-share-panel').hidden && localStorage.length === 0")"
  [[ "$setup_ok" == true ]] || failures+=("$name setup projection")
  shortcut_url_json="$(agent-browser --session "$session" eval 'document.querySelector("#answer-own-invitation")?.href||""')"
  shortcut_url="$(node -p 'JSON.parse(process.argv[1])' "$shortcut_url_json")"
  shortcut_ok="$(agent-browser --session "$session" eval '(()=>{const link=document.querySelector("#answer-own-invitation");return link?.textContent.trim()==="Answer this invitation"&&link.target==="_blank"&&link.relList.contains("noopener")&&link.href===document.querySelector("#setup-share-output").value&&link.getClientRects().length>0})()')"
  [[ "$shortcut_ok" == true ]] || { echo "FAIL facilitator self-response: $name prepared invitation has no safe answer shortcut"; exit 1; }
  agent-browser --session "$session" open "$shortcut_url" >/dev/null
  shortcut_boundary="$(agent-browser --session "$session" eval 'document.body.dataset.mode==="shared-setup"&&!document.querySelector("#invitation-view").hidden&&document.querySelector("#placement-view,#compare-view").hidden&&localStorage.length===0')"
  [[ "$shortcut_boundary" == true ]] || { echo "FAIL facilitator self-response: $name shortcut bypasses the read-only invitation boundary"; exit 1; }

  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?collect=$$" >/dev/null
  agent-browser --session "$session" click '#combine-mode' >/dev/null
  agent-browser --session "$session" fill '#response-links' "$response_url" >/dev/null
  agent-browser --session "$session" click '#collect-responses' >/dev/null
  first_ok="$(agent-browser --session "$session" eval 'document.querySelector("#response-count").textContent.trim() === "1 response" && /^1 added/.test(document.querySelector("#collection-status").textContent)')"
  if [[ "$name" == quadrant ]]; then agent-browser --session "$session" click '#response-import-panel > summary' >/dev/null; fi
  agent-browser --session "$session" click '#collect-responses' >/dev/null
  duplicate_ok="$(agent-browser --session "$session" eval 'document.querySelector("#response-count").textContent.trim() === "1 response" && /1 duplicate/.test(document.querySelector("#collection-status").textContent)')"
  [[ "$first_ok" == true && "$duplicate_ok" == true ]] || failures+=("$name local collection")

  agent-browser --session "$session" fill '#response-links' "$response_url
$response_url_2" >/dev/null
  agent-browser --session "$session" click '#collect-responses' >/dev/null
  disagreement_ok="$(agent-browser --session "$session" eval 'document.querySelector("#response-count").textContent.trim() === "2 responses" && document.querySelectorAll("#disagreement-list li").length > 0')"
  [[ "$disagreement_ok" == true ]] || failures+=("$name visible disagreement")
done

if ((${#failures[@]})); then
  printf 'FAIL collaboration handoff: %s\n' "${failures[*]}"
  exit 1
fi
printf 'PASS collaboration handoff: setup projection is stateless and response collection is local and idempotent\n'

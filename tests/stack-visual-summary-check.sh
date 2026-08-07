#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8779}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
sleep .08
if ! kill -0 "$PID" >/dev/null 2>&1; then cat "$LOG" >&2; exit 1; fi
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
make_response() { local who="$1" choice="$2"; node --input-type=module -e "import{createSession,applyChoice}from'./pairwise-ranker/ranking.mjs';import{encodeResponseUrl}from'./pairwise-ranker/collaboration.mjs';let s=createSession('expected impact','Alpha\nBeta\nGamma');while(s.phase==='comparing')s=applyChoice(s,'$choice');console.log(encodeResponseUrl(s,{contributor:'$who',baseUrl:'http://127.0.0.1:$PORT/pairwise-ranker/'}));"; }
first="$(make_response Alex left)"; second="$(make_response Blair right)"
session="stack-visual-summary-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/pairwise-ranker/?visual=$$" >/dev/null
agent-browser --session "$session" click '#combine-mode' >/dev/null
agent-browser --session "$session" fill '#response-links' "$first
$second" >/dev/null
agent-browser --session "$session" click '#collect-responses' >/dev/null
result="$(agent-browser --session "$session" eval '(()=>{const aggregate=Array.from(document.querySelectorAll("[data-aggregate-item]")).map(node=>node.dataset.itemId);const rankings=Array.from(document.querySelectorAll("[data-ranking]"));const pairs=Array.from(document.querySelectorAll("[data-pair-split]"));return aggregate.join(",")==="item-1,item-2,item-3"&&rankings.length===2&&rankings.every(row=>row.querySelectorAll("[data-ranking-item]").length===3)&&pairs.length===3&&pairs.every(row=>{const segments=Array.from(row.querySelectorAll("[data-vote-segment]"));const votes=segments.reduce((sum,node)=>sum+Number(node.dataset.votes),0);const widths=segments.reduce((sum,node)=>sum+Number.parseFloat(node.style.width),0);return segments.length===3&&votes===2&&Math.abs(widths-100)<.01&&/2 responses/.test(row.getAttribute("aria-label")||"")})&&document.querySelectorAll("#disagreement-list li").length===3})()')"
[[ "$result" == true ]] || { echo 'FAIL Stack Rank visual summary: aggregate order, rankings, or pair splits are incomplete'; exit 1; }
echo 'PASS Stack Rank visual summary: aggregate order, every ranking, and accessible pair vote splits are rendered'

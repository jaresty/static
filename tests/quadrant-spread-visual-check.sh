#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8777}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
make_response() { local who="$1" first="$2" second="$3"; node --input-type=module -e "import {createWorkshop,placeAt} from './2x2-facilitator/core.mjs';import{encodeResponseUrl}from'./2x2-facilitator/collaboration.mjs';let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'});s=placeAt(s,$first);s=placeAt(s,$second);console.log(encodeResponseUrl(s,{contributor:'$who',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));"; }
first="$(make_response Alex '{x:.2,y:.7}' '{x:.8,y:.4}')"
second="$(make_response Blair '{x:.9,y:.1}' '{x:.1,y:.9}')"
session="quadrant-spread-visual-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?spread=$$" >/dev/null
agent-browser --session "$session" click '#combine-mode' >/dev/null
agent-browser --session "$session" fill '#response-links' "$first
$second" >/dev/null
agent-browser --session "$session" click '#collect-responses' >/dev/null
result="$(agent-browser --session "$session" eval '(async()=>{const {decodeShareUrl}=await import("./collaboration.mjs");const responses=document.querySelector("#response-links").value.trim().split(/\s+/).map(decodeShareUrl);const ids=responses[0].setup.items.map(item=>item.id);if(document.querySelectorAll("[data-spread-graphic],.spread-line").length)return false;return ids.every(itemId=>{document.querySelector(`[data-navigator-item][data-item-id="${itemId}"]`).click();const points=responses.map(response=>response.payload.positions[itemId]);const represented=Array.from(document.querySelectorAll(`[data-placement-mark][data-item-id="${itemId}"]`)).map(node=>`${node.dataset.x}:${node.dataset.y}`).sort();const expected=points.map(point=>`${point.x}:${point.y}`).sort();const average={x:points.reduce((sum,point)=>sum+point.x,0)/points.length,y:points.reduce((sum,point)=>sum+point.y,0)/points.length};const card=document.querySelector(`[data-resolution-card][data-item-id="${itemId}"]`);return JSON.stringify(represented)===JSON.stringify(expected)&&Math.abs(Number(card.dataset.resolvedX)-average.x)<1e-6&&Math.abs(Number(card.dataset.resolvedY)-average.y)<1e-6})})()')"
if [[ "$result" != true ]]; then
  printf 'FAIL quadrant response evidence: selected items do not reveal every response dot at a truthful average\n'
  exit 1
fi
printf 'PASS quadrant response evidence: selected items reveal every response dot at a truthful average\n'

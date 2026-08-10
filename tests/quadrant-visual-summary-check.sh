#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
PORT="${PORT:-8776}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done

make_response() {
  local contributor="$1" first="$2" second="$3"
  node --input-type=module -e "import {createWorkshop,placeAt} from './2x2-facilitator/core.mjs'; import {encodeResponseUrl} from './2x2-facilitator/collaboration.mjs'; let s=createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta\nGamma'}); s=placeAt(s,$first); s=placeAt(s,$second); console.log(encodeResponseUrl(s,{contributor:'$contributor',baseUrl:'http://127.0.0.1:$PORT/2x2-facilitator/'}));"
}
first="$(make_response Alex '{x:.2,y:.7}' '{x:.8,y:.4}')"
second="$(make_response Blair '{x:.9,y:.1}' '{x:.1,y:.9}')"
session="quadrant-visual-summary-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?visual-summary=$$" >/dev/null
agent-browser --session "$session" click '#combine-mode' >/dev/null
agent-browser --session "$session" fill '#response-links' "$first
$second" >/dev/null
agent-browser --session "$session" click '#collect-responses' >/dev/null
response_urls_json="$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$first" "$second")"
result="$(agent-browser --session "$session" eval "(async()=>{const {decodeShareUrl}=await import('./collaboration.mjs');const expected=$response_urls_json.flatMap(url=>{const response=decodeShareUrl(url);return Object.entries(response.payload.positions).map(([itemId,point])=>\`\${response.contributionId}:\${itemId}:\${point.x}:\${point.y}\`)}).sort();const actual=Array.from(document.querySelectorAll('[data-placement-mark]')).map(mark=>\`\${mark.dataset.contributionId}:\${mark.dataset.itemId}:\${mark.dataset.x}:\${mark.dataset.y}\`).sort();return expected.length===6&&JSON.stringify(actual)===JSON.stringify(expected)})()")"
if [[ "$result" != true ]]; then
  printf 'FAIL quadrant visual marks: submitted placements do not map one-to-one to rendered marks\n'
  exit 1
fi
printf 'PASS quadrant visual marks: every submitted placement has one rendered mark\n'

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8817}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-response-pills-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
base="http://127.0.0.1:$PORT/2x2-facilitator/"
mapfile -t responses < <(PORT="$PORT" node --input-type=module <<'NODE'
import { createWorkshop, placeAt } from './2x2-facilitator/core.mjs';
import { encodeResponseUrl } from './2x2-facilitator/collaboration.mjs';
let first = createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta'});
first = placeAt(first, {x:.2,y:.8});
let second = createWorkshop({prompt:'Choose a launch idea',xLabel:'Value',xLow:'Low value',xHigh:'High value',yLabel:'Confidence',yLow:'Low confidence',yHigh:'High confidence',items:'Alpha\nBeta'});
second = placeAt(second, {x:.8,y:.2});
const base = `http://127.0.0.1:${process.env.PORT}/2x2-facilitator/`;
console.log(encodeResponseUrl(first, {contributor:'Alex', baseUrl:base}));
console.log(encodeResponseUrl(second, {contributor:'Blair', baseUrl:base}));
NODE
)
session="quadrant-response-pills-$$"
agent-browser --session "$session" open "$base?response-pills=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear()' >/dev/null
agent-browser --session "$session" click '#combine-mode' >/dev/null
payload="${responses[0]}
https://example.test/not-a-response
${responses[1]}"
payload_json="$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$payload")"
agent-browser --session "$session" eval "(()=>{const input=document.querySelector('#response-links');const transfer=new DataTransfer();transfer.setData('text/plain',$payload_json);input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}))})()" >/dev/null
before="$(agent-browser --session "$session" eval '(()=>({pills:[...document.querySelectorAll("[data-response-pill]")].map(el=>el.textContent.trim()),panelOpen:document.querySelector("#response-import-panel").open,visiblePills:[...document.querySelectorAll("[data-response-pill]")].filter(el=>el.getClientRects().length).length,raw:document.querySelector("#response-links").value,error:document.querySelector("#collection-status").textContent,count:document.querySelector("#response-count").textContent,removeLabels:[...document.querySelectorAll("[data-remove-response]")].map(el=>el.getAttribute("aria-label"))}))()')"
agent-browser --session "$session" eval 'document.querySelector("[data-remove-response]")?.click()' >/dev/null
after="$(agent-browser --session "$session" eval '(()=>({pills:document.querySelectorAll("[data-response-pill]").length,count:document.querySelector("#response-count").textContent}))()')"
mobile="$(agent-browser --session "$session" set viewport 390 844 >/dev/null && agent-browser --session "$session" eval 'document.documentElement.scrollWidth===document.documentElement.clientWidth')"
errors="$(agent-browser --session "$session" errors)"
contract="$(BEFORE="$before" AFTER="$after" MOBILE="$mobile" ERRORS="$errors" node -e 'const before=JSON.parse(process.env.BEFORE);const after=JSON.parse(process.env.AFTER);console.log(before.pills.length===2&&before.panelOpen===true&&before.visiblePills===2&&before.pills.some(x=>/Alex/.test(x))&&before.pills.some(x=>/Blair/.test(x))&&before.raw===""&&/invalid|could not|not a response/i.test(before.error)&&before.count==="2 responses"&&before.removeLabels.every(x=>/^Remove .+ response$/.test(x))&&after.pills===1&&after.count==="1 response"&&process.env.MOBILE==="true"&&process.env.ERRORS==="")')"
[[ "$contract" == true ]] || { echo "FAIL response pills: before=$before after=$after mobile=$mobile errors=$errors"; exit 1; }
echo 'PASS response pills: valid links become removable labeled pills and invalid input is reported'

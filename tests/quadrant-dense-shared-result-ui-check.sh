#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROPERTY="${1:?property number required}"
PORT="${PORT:-8807}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-dense-shared-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
url="$(node --input-type=module - <<NODE
import { encodeFacilitatorArtifactUrl } from './2x2-facilitator/facilitator-share.mjs';
const names=['DASL behaviors to preserve','Workflows open to redesign','Users the POC must support','Saved reports and variables','Data migration scope','School identity across systems','Submission and release workflow','Released-value corrections','Required system integrations','AI data access','POC success evidence','POC acceptance owner','Market View role','Required operating scale'];
const positions=[[.87,.62],[.87,.3],[.77,.84],[.34,.46],[.67,.65],[.05,.91],[.05,.58],[.65,.24],[.48,.64],[.49,.34],[1,1],[.98,.86],[.39,.21],[.63,.48]];
const items=names.map((text,index)=>({id:'item-'+(index+1),text,description:'',baseline:{x:positions[index][0],y:positions[index][1]},resolved:{x:positions[index][0],y:positions[index][1]},disagreement:0}));
const setup={prompt:'Which questions must we resolve before defining the architecture POC, and how can they be resolved?',activityDescription:'',xLabel:'Resolution',xLow:'Team evidence',xHigh:'NAIS determination',yLabel:'POC dependency',yLow:'Useful later',yHigh:'Required first',items:items.map(({id,text,description})=>({id,text,description}))};
const artifact={version:1,app:'quadrant',kind:'facilitator-view',exerciseId:'quadrant-dense-zero',payload:{setup,responseCount:1,items}};
console.log(encodeFacilitatorArtifactUrl(artifact,'http://127.0.0.1:$PORT/2x2-facilitator/'));
NODE
)"
session="quadrant-dense-shared-${PROPERTY}-$$"
agent-browser --session "$session" open "$url" >/dev/null
case "$PROPERTY" in
  1)
    contract="$(agent-browser --session "$session" eval 'document.querySelectorAll("#shared-facilitator-disagreement-list [data-shared-navigator-item]").length===14&&!document.querySelector("#shared-facilitator-results")&&!/FINAL RESULTS/.test(document.querySelector("#shared-facilitator-view").innerText)')"
    ;;
  2)
    contract="$(agent-browser --session "$session" eval '(()=>{const heading=document.querySelector("#shared-facilitator-navigator-heading")?.innerText.trim();const secondary=[...document.querySelectorAll("#shared-facilitator-disagreement-list .navigator-spread")].map(node=>node.innerText);return heading==="ITEMS · SELECT TO INSPECT"&&secondary.length===14&&secondary.every(text=>/% Resolution · \d+% POC dependency/.test(text))&&!secondary.some(text=>/spread/.test(text))})()')"
    ;;
  3)
    agent-browser --session "$session" set viewport 390 844 >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const list=document.querySelector("#shared-facilitator-disagreement-list");return document.documentElement.scrollWidth===document.documentElement.clientWidth&&list.clientHeight<=420&&list.scrollHeight>list.clientHeight})()')"
    ;;
  4)
    contract="$(agent-browser --session "$session" eval 'document.querySelector("#shared-facilitator-navigator-meta")?.innerText.trim()==="14 items · scroll to see all"')"
    ;;
  5)
    agent-browser --session "$session" eval 'document.querySelector("#shared-facilitator-disagreement-list [data-shared-navigator-item]").click()' >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>{const legend=document.querySelector("#shared-facilitator-view .resolution-legend");const inspector=document.querySelector("#shared-facilitator-inspector");return legend.querySelectorAll("[data-legend-entry]:not([hidden])").length===0&&/single response result/i.test(inspector.innerText)&&!/aggregate result|disagreement/i.test(inspector.innerText)})()')"
    ;;
  6)
    contract="$(agent-browser --session "$session" eval '(()=>[...document.querySelectorAll("#shared-facilitator-disagreement-list [data-shared-navigator-item]")].every(button=>{const visible=button.querySelector(".navigator-spread").innerText;const label=button.getAttribute("aria-label");return label.includes(visible)&&!/percent spread|responses/i.test(label)}))()')"
    ;;
  7)
    agent-browser --session "$session" set viewport 390 844 >/dev/null
    contract="$(agent-browser --session "$session" eval '(()=>[...document.querySelectorAll("#shared-facilitator-board [data-shared-result-item]")].every(group=>Math.min(group.getBoundingClientRect().width,group.getBoundingClientRect().height)>=42))()')"
    ;;
  8)
    contract="$(agent-browser --session "$session" eval 'Boolean(document.querySelector("#copy-shared-markdown")&&document.querySelector("#download-shared-markdown")&&document.querySelector("#shared-markdown-output[readonly]")&&document.querySelector("#shared-markdown-status[role=status]"))')"
    ;;
  9)
    violate=false; [[ "${VIOLATE_MARKDOWN:-0}" != 1 ]] || violate=true
    contract="$(agent-browser --session "$session" eval "(async()=>{const violate=$violate;window.__networkWrites=0;window.fetch=async()=>{window.__networkWrites+=1};navigator.sendBeacon=()=>{window.__networkWrites+=1;return true};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=violate?'wrong':text}}});URL.createObjectURL=blob=>{window.__markdownBlob=blob;return 'blob:markdown'};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){window.__markdownDownload=this.download};document.querySelector('#copy-shared-markdown').click();await new Promise(resolve=>setTimeout(resolve,0));document.querySelector('#download-shared-markdown').click();const output=document.querySelector('#shared-markdown-output').value;return window.__copied===output&&(await window.__markdownBlob.text())===output&&window.__markdownBlob.type==='text/markdown;charset=utf-8'&&/^quadrant-result-.+\\.md$/.test(window.__markdownDownload)&&document.querySelector('#copy-shared-markdown').innerText==='Copied!'&&/downloaded/i.test(document.querySelector('#shared-markdown-status').innerText)&&/Which questions must we resolve/.test(output)&&!/Alex|Blair|contributionId|response-alex|response-blair/.test(output)&&window.__networkWrites===0})()")"
    ;;
  10)
    violate=false; [[ "${VIOLATE_MARKDOWN_FALLBACK:-0}" != 1 ]] || violate=true
    contract="$(agent-browser --session "$session" eval "(async()=>{const violate=$violate;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(!violate)throw new Error('denied')}}});document.querySelector('#copy-shared-markdown').click();await new Promise(resolve=>setTimeout(resolve,0));const output=document.querySelector('#shared-markdown-output');const status=document.querySelector('#shared-markdown-status');return !output.hidden&&output.selectionStart===0&&output.selectionEnd===output.value.length&&status.getAttribute('role')==='alert'&&/select and copy/i.test(status.innerText)})()")"
    ;;
  *) echo "Unknown property: $PROPERTY"; exit 2;;
esac
[[ "$contract" == true ]] || { echo "FAIL dense shared result property $PROPERTY: contract=$contract"; exit 1; }
echo "PASS dense shared result property $PROPERTY"

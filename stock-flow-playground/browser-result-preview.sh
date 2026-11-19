#!/usr/bin/env bash
# Serve the repository root first. This isolated Chromium session tests both apps.
set -eu
base=${1:-http://127.0.0.1:8767}; session=result-preview-$$
ab(){ agent-browser --session "$session" "$@"; }; trap 'ab close >/dev/null' EXIT
check(){ local got; got=$(ab eval "$2"); [[ $got == true ]] || { printf 'FAIL %s: %s\n' "$1" "$got"; ab eval '({result:result.textContent,selected:slider.value,latest:slider.max,button:play.textContent,click:window.lastClick,error:window.lastError})'; exit 1; }; printf 'PASS %s %s %s\n' "$app" "$width" "$1"; }
for width in 1440 320; do for app in causal-playground stock-flow-playground; do
 ab open "$base/$app/"; ab set viewport "$width" 900
 if [[ $app == causal-playground && -n ${MORALE_MODEL:-} ]]; then
  node --input-type=module -e 'import fs from "node:fs";const m=JSON.parse(fs.readFileSync(process.argv[1]));console.log(`localStorage.setItem("causal-playground.v1",${JSON.stringify(JSON.stringify(m.model??m))});true`)' "$MORALE_MODEL" | ab eval --stdin >/dev/null; ab reload
 fi
 ab eval 'window.addEventListener("error",e=>window.lastError=e.message);window.q=s=>document.querySelector(s);window.slider=q("#history")||q("#scrub");window.start=q("#starting-situation")||q("#scenario-start");window.result=q("#step-result")||q("#result-heading");window.play=q("#run")||q("#play");window.original=start.textContent;document.addEventListener("click",e=>window.lastClick=[e.target.className,e.clientX,e.clientY],true);document.querySelector("dialog[open]")?.close();q("button[data-view=charts]").click();q("#step").click();q("#step").click();true'
 ab eval 'q("#step").click();q("#step").click();true'
 if [[ $app == causal-playground && -n ${MORALE_MODEL:-} ]]; then ab eval 'const o=q("#objects");o.value="node:underlyingMorale";o.dispatchEvent(new Event("change"));q("button[data-view=charts]").click();true'; fi
 ab scrollintoview '.u-over'; read -r one mid <<< "$(ab eval '(()=>{const r=q(".u-over").getBoundingClientRect();return [Math.round(r.left+r.width/(q("#history")?4:10)),Math.round(r.top+r.height/2)]})()' | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"; ab mouse move "$one" "$mid"
 if [[ $app == stock-flow-playground ]]; then
  check 'first transfer and accounting preview agree' 'q("#sf-result-primary").textContent==="5 L moved from Upper tank to Lower tank."&&q("#transition").textContent.includes("Transition 0 → 0.25")&&q("#ledger").textContent.includes("actual stock 95")&&slider.value==4';
 elif [[ -n ${MORALE_MODEL:-} ]]; then
  check 'morale week one explanation and calculation agree' 'q("#result-summary").textContent.includes("fell from 50 to 46")&&q("#result-summary").textContent.includes("stayed at 50")&&q("#transition-title").textContent==="Change from tick 0 to 1"&&slider.value==4';
 fi
 if [[ $app == stock-flow-playground ]]; then
  check 'stock legend at first transfer' '[...document.querySelectorAll(".series-readout tbody tr")].map(r=>r.cells[1].textContent).join("|")==="95.000 L|5.000 L"'
 elif [[ -n ${MORALE_MODEL:-} ]]; then
  check 'morale legend at week one' '[...document.querySelectorAll(".series-readout tbody tr")].some(r=>r.cells[1].textContent==="46.00"&&r.cells[2].textContent==="50")'
 fi
 check 'legend labels fit' '[...document.querySelectorAll(".series-readout button")].every(b=>b.scrollWidth<=b.clientWidth+1&&b.getBoundingClientRect().right<=innerWidth)'
 if [[ -n ${READOUT_SCREENSHOTS:-} ]]; then ab screenshot "$READOUT_SCREENSHOTS/$app-$width.png"; fi
 ab eval 'window.legendValues=()=>[...document.querySelectorAll(".series-readout tbody tr")].map(r=>r.cells[1].textContent).join("|");window.weekOne=legendValues();true';ab mouse move 0 0
 check 'leave restores different legend values' 'legendValues()!==weekOne'
 check 'week four calculation restored' '(q("#transition-title")||q("#transition")).textContent.match(/from tick 3 to 4|Transition 0.75 → 1/) !== null&&slider.value==4'
 ab scrollintoview '.u-over'; read -r x y <<< "$(ab eval '(()=>{const r=q(".u-over").getBoundingClientRect();return [Math.ceil(r.left)+1,Math.round(r.top+r.height/2)]})()' | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"
 ab mouse move "$x" "$y"; check 'no incoming calculation at zero' '(q("#transition-title")||q("#transition")).textContent.match(/No computed transition|no transition yet/) !== null'; check 'paused hover previews zero only' 'result.textContent.includes("Preview")&&slider.value==4&&start.textContent===original'
 check 'zero preview is exact initial result' '(q("#result-summary")||result).textContent.match(/No step taken|No transfer has occurred/) !== null'; ab mouse move 0 0;check 'leave restores selected step' '!result.textContent.includes("Preview")&&result.textContent.includes("4")&&slider.value==4'
 ab eval 'play.click();true'; ab wait --fn 'Number(slider.max)>4'; ab mouse move "$x" "$y"; ab eval 'window.before=Number(slider.max);true';ab wait --fn 'Number(slider.max)>before';check 'play advances beneath preview' 'result.textContent.includes("Preview")&&slider.value===slider.max&&start.textContent===original'
 ab eval 'window.hoverValues=legendValues();true';ab mouse down;ab mouse up;ab mouse move 0 0;check 'click holds historical zero after leave' '!result.textContent.includes("Preview")&&slider.value==0&&Number(slider.max)>2&&!play.textContent.includes("Pause")'
 check 'click pins hovered amounts' 'legendValues()===hoverValues';ab eval 'slider.focus();true'; ab press ArrowRight;check 'scrub calculation enters one' '(q("#transition-title")||q("#transition")).textContent.match(/from tick 0 to 1|Transition 0 → 0.25/) !== null';check 'keyboard scrub selects first transition' 'slider.value==1&&result.textContent.includes("1")&&!result.textContent.includes("Preview")';
 check 'scrub restores week one legend values' 'legendValues()===weekOne';ab scrollintoview '.u-over'; read -r x y <<< "$(ab eval '(()=>{const r=q(".u-over").getBoundingClientRect();return [Math.ceil(r.left)+1,Math.round(r.top+r.height/2)]})()' | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"; ab mouse move "$x" "$y";check 'hover historical selection without moving it' 'slider.value==1&&result.textContent.includes("Preview")&&start.textContent===original';ab mouse move 0 0;check 'leave returns to historical selection' 'slider.value==1&&result.textContent.includes("1")&&!result.textContent.includes("Preview")';
 ab eval 'q("#reset").click();true';check 'reset clears history and preview' 'slider.max==0&&!result.textContent.includes("Preview")&&start.textContent===original'
 if [[ $app == stock-flow-playground ]]; then
  ab eval 'q("#show-json").click();const m=JSON.parse(q("#document").value);m.entities.find(e=>e.id==="upper").initial=25;m.entities.find(e=>e.id==="drain").expression="8 * delay(upper, 2)";m.entities.push({type:"stock",id:"spare",name:"Spare",unit:"kg",initial:3});q("#document").value=JSON.stringify(m);q("#preview-import").click();true'; ab wait --fn '!q("#review-panel").hidden';ab click '#apply'; ab eval 'q("#step").click();true';
  check 'delayed constrained first step and unchanged mixed unit' 'start.textContent.includes("initial amount of 25 L")&&result.textContent.includes("25 L transferred of 50 L requested")&&result.textContent.includes("3 → 3 kg (unchanged)")&&result.textContent.includes("25 L from Upper tank at tick -2")'; expected=$(ab eval '[start.textContent,result.textContent]');
  ab eval 'q("button[data-view=charts]").click();true'; ab scrollintoview '#chart-1';read -r px py <<< "$(ab eval '(()=>{const r=q("#chart-1").getBoundingClientRect();return [Math.ceil(r.left)+2,Math.round(r.top+r.height/2)]})()' | python3 -c 'import json,sys;print(*json.load(sys.stdin))')"; ab mouse move "$px" "$py";check 'another unit plot previews independently' 'result.textContent.includes("Preview")&&slider.value==1';check 'all mixed-unit plots show initial values' 'legendValues().split("|").sort().join("|")===["0.000 L","25.000 L","3.000 kg"].sort().join("|")';ab mouse move 0 0;
  ab eval 'q("#share").click();true';ab wait --fn 'q("#share-url").value.includes("#sf=")';url=$(ab eval 'q("#share-url").value' | python3 -c 'import json,sys;print(json.load(sys.stdin))');
  recipient=$session-recipient-$width; agent-browser --session "$recipient" open "$url"; agent-browser --session "$recipient" set viewport "$width" 900;agent-browser --session "$recipient" wait --fn '!document.querySelector("#review-panel").hidden';agent-browser --session "$recipient" click '#apply';agent-browser --session "$recipient" eval 'document.querySelector("#step").click();true';actual=$(agent-browser --session "$recipient" eval '[document.querySelector("#starting-situation").textContent,document.querySelector("#step-result").textContent]');agent-browser --session "$recipient" close; [[ $actual == "$expected" ]]; printf 'PASS %s fresh recipient exact replay\n' "$width";
  ab eval 'q("#close-modal").click();localStorage.removeItem("stock-flow-playground.v1");true';
 fi
 [[ $(ab eval --stdin < "$(dirname "$0")/browser-legend-fixtures.js") == true ]]; printf 'PASS %s %s empty, single, long labels and units, groups, toggles\n' "$app" "$width"
done;done

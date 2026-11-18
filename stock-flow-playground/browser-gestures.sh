#!/usr/bin/env bash
# Native-pointer supplement: real Cytoscape coordinates, no simulated graph callbacks.
# Server must already serve the repository. Optional third argument: viewport width.
set -euo pipefail
SESSION="${1:-stock-flow-gestures}"
URL="${2:-http://127.0.0.1:8767/stock-flow-playground/}"
WIDTH="${3:-1440}"
ab(){ agent-browser --session "$SESSION" "$@"; }
assert_js(){ local result; result="$(ab eval "$2")"; [[ "$result" == true ]] || { printf 'FAIL %s: %s\n' "$1" "$result"; exit 1; }; printf 'PASS %s\n' "$1"; }
point(){ ab eval "(()=>{const g=document.querySelector('#graph'),p=g.graph.cy.getElementById('$1').renderedPosition(),r=g.getBoundingClientRect();return [r.left+p.x,r.top+p.y]})()" | python3 -c 'import json,sys; p=json.load(sys.stdin); print(*(round(v) for v in p))'; }
canvas(){ ab eval "document.querySelector('button[data-view=canvas]').click();true"; ab scrollintoview '#graph'; ab click '#fit'; }
inspector(){ ab eval "document.querySelector('button[data-view=inspector]').click();true"; }
ab open "$URL"
ab set viewport "$WIDTH" 1000
ab eval "(()=>{window.confirm=()=>true;document.querySelector('#example').click();return true})()"
ab wait --fn "!document.querySelector('#review-panel').hidden"
ab click '#apply'
ab eval "(()=>{document.querySelector('#settings [name=horizon]').value=100;document.querySelector('#settings').requestSubmit();document.querySelector('#run').click();return true})()"
ab wait --fn "Number(document.querySelector('#history').max)>=3"
canvas
read -r X Y <<< "$(point upper)"
TX="$(python3 -c "print($X+50)")"; TY="$(python3 -c "print($Y+25)")"
ab eval "window.dragBefore=structuredClone(document.querySelector('#graph').graph.cy.getElementById('upper').position());true"
ab mouse move "$X" "$Y"
ab mouse down
ab mouse move "$TX" "$TY"
ab mouse up
assert_js 'native entity drag preserves playback/history' "(document.querySelector('#run').getAttribute('aria-pressed')==='true')&&Number(document.querySelector('#history').max)>=3"
ab eval "document.querySelector('#run').click();document.querySelector('#show-json').click();true"
assert_js 'native drag saves separated view position' "(()=>{const p=JSON.parse(document.querySelector('#document').value).view.positions.upper;return p&&Math.abs(p.x-window.dragBefore.x)>1&&Math.abs(p.y-window.dragBefore.y)>1})()"
POSITION="$(ab eval "JSON.parse(document.querySelector('#document').value).view.positions.upper" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin),separators=(",",":")))')"
ab open about:blank
ab open "$URL"
assert_js 'dragged view position survives reload' "(()=>{const p=$POSITION,cy=document.querySelector('#graph').graph.cy;return cy.getElementById('upper').position().x===p.x&&cy.getElementById('upper').position().y===p.y})()"
canvas
ab click '#draw-flow'
read -r X Y <<< "$(point upper)"; read -r TX TY <<< "$(point lower)"
ab mouse move "$X" "$Y"
ab mouse down
ab mouse move "$(python3 -c "print(round(($X+$TX)/2))")" "$(python3 -c "print(round(($Y+$TY)/2))")"
ab mouse move "$TX" "$TY"
ab wait --fn "document.querySelector('#graph').graph.cy.getElementById('lower').hasClass('eh-target')"
assert_js 'original restrained edgehandles preview active' "(()=>{const edges=document.querySelector('#graph').graph.cy.edges('.eh-preview, .eh-ghost-edge');return edges.length>0&&edges.every(e=>Number(e.style('arrow-scale'))<=0.7&&parseFloat(e.style('width'))<=1.5)})()"
ab mouse up
ab wait --fn "!document.querySelector('#flow-draft-panel').hidden"
assert_js 'native draw opens endpoint/rate draft without creating flow' "document.querySelector('#flow-draft [name=source]').value==='upper'&&document.querySelector('#flow-draft [name=target]').value==='lower'&&document.querySelector('#selection').options.length===5"
ab fill '#flow-draft [name=expression]' '0.1 * upper'
ab find role button click --name 'Validate & review flow'
ab wait --fn "!document.querySelector('#review-panel').hidden"
assert_js 'drawn flow requires review before application' "document.querySelector('#selection').options.length===5&&document.querySelector('#review-changes').textContent.includes('Added flow_1')"
ab click '#apply'
ab wait --fn "document.querySelector('#selection').options.length===6"
assert_js 'reviewed drawn flow applied with explicit rate and endpoints' "(()=>{const d=JSON.parse(document.querySelector('#review-json').textContent),f=d.entities.find(e=>e.id==='flow_1');return f.source==='upper'&&f.target==='lower'&&f.expression==='0.1 * upper'})()"
ab click '#draw-flow'
inspector
ab select '#selection' drain_rate
ab fill '#entity [name=expression]' 'k * delay(upper, 2)'
ab eval "document.querySelector('#entity').requestSubmit();true"
ab click '#share'
ab wait --fn "document.querySelector('#share-url').value.includes('#sf=')"
SHARE="$(ab eval "document.querySelector('#share-url').value" | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
ab click '#close-modal'
ab eval "(()=>{document.querySelector('#settings [name=title]').value='Stored current work';document.querySelector('#settings').requestSubmit();return true})()"
ab open about:blank
ab open "$SHARE"
ab wait --fn "!document.querySelector('#review-panel').hidden"
assert_js 'fresh shared delay/view document preserves existing work until review' "document.querySelector('#settings [name=title]').value==='Stored current work'&&document.querySelector('#review-changes').textContent.includes('Title changed')"
assert_js 'share carries fixed delay and saved graph positions' "(()=>{const d=JSON.parse(document.querySelector('#review-json').textContent),p=$POSITION;return d.entities.find(e=>e.id==='drain_rate').expression==='k * delay(upper, 2)'&&d.view.positions.upper.x===p.x&&d.view.positions.upper.y===p.y})()"
ab click '#apply'
inspector
ab select '#ledger-stock' upper
ab eval "document.querySelector('#step').click();true"
assert_js 'shared delayed model computes real prehistory evidence after apply' "document.querySelector('#transition').textContent.includes('source tick -2')&&document.querySelector('#transition').textContent.includes('initial prehistory')"
assert_js 'graph library state never enters portable positions' "(()=>{const d=JSON.parse(document.querySelector('#review-json').textContent),ids=new Set(d.entities.map(e=>e.id));return Object.keys(d.view.positions).every(id=>ids.has(id))})()"
ab select '#selection' lower
canvas
read -r X Y <<< "$(point upper)"
ab mouse move "$X" "$Y"
ab mouse down
ab mouse up
assert_js 'native graph selection opens readable entity inspector' "document.querySelector('#selection').value==='upper'&&document.querySelector('.workspace').dataset.view==='inspector'&&document.querySelector('#entity [name=id]').value==='upper'"
ab eval "document.querySelector('button[data-view=charts]').click();true"
ab scrollintoview '#run'
ab click '#run'
ab wait --fn "Number(document.querySelector('#history').max)>=3"
ab scrollintoview '#chart'
ab hover '#chart'
assert_js 'native chart hover leaves playback running' "(document.querySelector('#run').getAttribute('aria-pressed')==='true')"
ab click '#chart'
assert_js 'native chart click pauses and holds inspection' "!(document.querySelector('#run').getAttribute('aria-pressed')==='true')&&document.querySelector('#status').textContent.includes('Historical inspection')"
assert_js 'historical cursor stays held after native click' "(async()=>{const count=document.querySelector('#history').max,cursor=document.querySelector('#history').value;await new Promise(r=>setTimeout(r,180));return document.querySelector('#history').max===count&&document.querySelector('#history').value===cursor})()"
assert_js 'native workspace fits viewport' "document.documentElement.scrollWidth<=innerWidth"
ab close

#!/usr/bin/env bash
# Functional native-pointer supplement; server must already be serving the repo.
set -euo pipefail
SESSION="${1:-stock-flow-gestures}"
URL="${2:-http://127.0.0.1:8766/stock-flow-playground/}"
ab(){ agent-browser --session "$SESSION" "$@"; }
assert_js(){ local result; result="$(ab eval "$2")"; [[ "$result" == true ]] || { printf 'FAIL %s: %s\n' "$1" "$result"; exit 1; }; printf 'PASS %s\n' "$1"; }
ab open "$URL"
ab eval "(()=>{window.confirm=()=>true;document.querySelector('#example').click();return true})()"
ab wait --fn "!document.querySelector('#review-panel').hidden"
ab click '#apply'
ab eval "(()=>{document.querySelector('#settings [name=horizon]').value=100;document.querySelector('#settings').requestSubmit();document.querySelector('#run').click();return true})()"
ab wait --fn "Number(document.querySelector('#history').max)>=3"
ab scrollintoview '#graph'
ab drag '#graph [data-id="upper"]' '#graph [data-id="k"]'
assert_js 'native entity drag preserves playback/history' "document.querySelector('#run').disabled&&Number(document.querySelector('#history').max)>=3"
ab click '#pause'
ab click '#show-json'
assert_js 'native drag saves separated view position' "(()=>{const p=JSON.parse(document.querySelector('#document').value).view.positions.upper;return p.x===450&&p.y===355})()"
ab open about:blank
ab open "$URL"
assert_js 'dragged view position survives reload' "document.querySelector('#entity [name=x]').value==='450'&&document.querySelector('#entity [name=y]').value==='355'"
ab click '#draw-flow'
ab drag '#graph [data-id="upper"]' '#graph [data-id="lower"]'
assert_js 'native draw opens endpoint/rate draft without creating flow' "!document.querySelector('#flow-draft-panel').hidden&&document.querySelector('#flow-draft [name=source]').value==='upper'&&document.querySelector('#flow-draft [name=target]').value==='lower'&&document.querySelector('#selection').options.length===5"
ab fill '#flow-draft [name=expression]' '0.1 * upper'
ab find role button click --name 'Validate & review flow'
ab wait --fn "!document.querySelector('#review-panel').hidden"
assert_js 'drawn flow requires review before application' "document.querySelector('#selection').options.length===5&&document.querySelector('#review-changes').textContent.includes('Added flow_1')"
ab click '#apply'
ab wait --fn "document.querySelector('#selection').options.length===6"
assert_js 'reviewed drawn flow applied with explicit rate and endpoints' "(()=>{const d=JSON.parse(document.querySelector('#review-json').textContent),f=d.entities.find(e=>e.id==='flow_1');return f.source==='upper'&&f.target==='lower'&&f.expression==='0.1 * upper'})()"
ab select '#selection' drain_rate
ab fill '#entity [name=expression]' 'k * delay(upper, 2)'
ab eval "document.querySelector('#entity').requestSubmit();true"
ab click '#share'
ab wait --fn "document.querySelector('#share-url').value.includes('#sf=')"
SHARE="$(ab eval "document.querySelector('#share-url').value" | python3 -c 'import json,sys; print(json.load(sys.stdin))')"
ab eval "(()=>{document.querySelector('#settings [name=title]').value='Stored current work';document.querySelector('#settings').requestSubmit();return true})()"
ab open about:blank
ab open "$SHARE"
ab wait --fn "!document.querySelector('#review-panel').hidden"
assert_js 'fresh shared delay/view document preserves existing work until review' "document.querySelector('#settings [name=title]').value==='Stored current work'&&document.querySelector('#review-changes').textContent.includes('Title changed')"
assert_js 'share carries fixed delay and saved graph positions' "(()=>{const d=JSON.parse(document.querySelector('#review-json').textContent);return d.entities.find(e=>e.id==='drain_rate').expression==='k * delay(upper, 2)'&&d.view.positions.upper.x===450&&d.view.positions.upper.y===355})()"
ab click '#apply'
ab select '#ledger-stock' upper
ab click '#step'
assert_js 'shared delayed model computes real prehistory evidence after apply' "document.querySelector('#transition').textContent.includes('source tick -2')&&document.querySelector('#transition').textContent.includes('initial prehistory')"
ab close

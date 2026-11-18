#!/usr/bin/env bash
# Destructive only to this named isolated browser's stock-flow localStorage.
set -euo pipefail
SESSION="${1:-stock-flow-recovery}"
URL="${2:-http://127.0.0.1:8767/stock-flow-playground/}"
ab(){ agent-browser --session "$SESSION" "$@"; }
assert_js(){ local result; result="$(ab eval "$2")"; [[ "$result" == true ]] || { printf 'FAIL %s: %s\n' "$1" "$result"; exit 1; }; printf 'PASS %s\n' "$1"; }
ab open "$URL"
ab eval "localStorage.setItem('stock-flow-playground.v1','invalid preserved original');true"
ab reload
assert_js 'invalid saved bytes are retained and autosave visibly paused' "localStorage.getItem('stock-flow-playground.v1')==='invalid preserved original'&&document.querySelector('#autosave').textContent.includes('paused')&&document.querySelector('#status').textContent.includes('Could not load saved')"
ab eval "(()=>{document.querySelector('#title').value='Recovery work';document.querySelector('#title').dispatchEvent(new Event('change',{bubbles:true}));return true})()"
assert_js 'editing recovery work does not overwrite invalid saved bytes' "localStorage.getItem('stock-flow-playground.v1')==='invalid preserved original'&&document.querySelector('#settings [name=title]').value==='Recovery work'"
ab click '#import'
ab eval "document.querySelector('#document').value=JSON.stringify({nodes:[],relationships:[]});document.querySelector('#preview-import').click();true"
ab wait --fn "document.querySelector('#status').classList.contains('error')"
assert_js 'old causal schema fails without replacing work' "document.querySelector('#settings [name=title]').value==='Recovery work'&&document.querySelector('#review-panel').hidden"
ab click '#close-modal'
ab eval "location.hash='sf=invalid-share';true"
ab wait --fn "document.querySelector('#status').textContent.includes('Shared model could not be opened')"
assert_js 'invalid shared input leaves current recovery work intact' "document.querySelector('#settings [name=title]').value==='Recovery work'&&localStorage.getItem('stock-flow-playground.v1')==='invalid preserved original'"
ab eval "history.replaceState(null,'',location.pathname);document.querySelector('#blank').click();true"
ab wait --fn "!document.querySelector('#review-panel').hidden"
ab click '#apply'
ab wait --fn "document.querySelector('#review-panel').hidden"
assert_js 'reviewed replacement still does not silently overwrite corrupt autosave' "localStorage.getItem('stock-flow-playground.v1')==='invalid preserved original'&&document.querySelector('#settings [name=title]').value==='Untitled stock-flow system'"
ab click '#import'
ab click '#resume-save'
assert_js 'explicit recovery replacement enables valid namespaced autosave' "(()=>{const d=JSON.parse(localStorage.getItem('stock-flow-playground.v1'));return d.version===1&&d.entities.length===1&&d.title==='Untitled stock-flow system'&&document.querySelector('#autosave').textContent.includes('Saved')})()"
ab click '#close-modal'
ab reload
assert_js 'explicitly recovered document reloads safely' "document.querySelector('#title').value==='Untitled stock-flow system'&&document.querySelector('#selection').options.length===1&&!document.querySelector('#status').classList.contains('error')"
ab close

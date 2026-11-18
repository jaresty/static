#!/usr/bin/env bash
# Native file-input and keyboard supplement; server already serves the repository root.
set -euo pipefail
SESSION="${1:-sf-cleanup-keyboard}"
URL="${2:-http://127.0.0.1:8783/stock-flow-playground/}"
WIDTH="${3:-1440}"
ARTIFACTS="${4:?Pass an isolated artifact directory}"
ab(){ agent-browser --session "$SESSION" "$@"; }
assert_js(){ local result; result="$(ab eval "$2")"; [[ "$result" == true ]] || { printf 'FAIL %s: %s\n' "$1" "$result"; exit 1; }; printf 'PASS %s\n' "$1"; }
trap 'ab close >/dev/null' EXIT
node --input-type=module -e 'import {example} from "./stock-flow-playground/model.mjs";const m=structuredClone(example);m.time.unit="day";for(const e of m.entities){if(e.type==="stock")e.unit="mL";if(e.type==="flow")e.unit="mL/day";}console.log(JSON.stringify(m));' > "$ARTIFACTS/keyboard-import-$WIDTH.json"
ab open "$URL"
ab set viewport "$WIDTH" 1000
ab click '#import'
ab upload '#file' "$ARTIFACTS/keyboard-import-$WIDTH.json"
ab wait --fn "document.querySelector('#document').value.includes('mL/day')"
assert_js 'file input loads complete consistent proposal without applying' "document.querySelector('#settings [name=timeUnit]').value==='hour'&&document.querySelector('#review-panel').hidden"
ab click '#preview-import'
ab wait --fn "!document.querySelector('#review-panel').hidden"
ab focus '#apply'
ab press Enter
ab wait --fn "!document.querySelector('#modal').open"
assert_js 'keyboard Apply imports complete consistent units' "document.querySelector('#settings [name=timeUnit]').value==='day'&&document.querySelector('#entity [name=unit]').value==='mL'"
if [[ "$WIDTH" -le 760 ]]; then ab click 'button[data-view=inspector]'; fi
ab select '#selection' upper
ab fill '#entity [name=name]' 'Keyboard authored tank'
ab press Enter
assert_js 'keyboard Enter authors entity through visible form' "document.querySelector('#selection').textContent.includes('Keyboard authored tank')"
ab click 'details:has(#settings) > summary'
ab fill '#settings [name=timeUnit]' hour
ab press Enter
assert_js 'native rejected connected-unit edit provides JSON recovery guidance' "document.querySelector('#status').textContent.includes('Import → Show current JSON')"
ab click '#import'
ab click '#show-json'
assert_js 'native rejection preserves applied day model and keyboard name' "(()=>{const d=JSON.parse(document.querySelector('#document').value);return d.time.unit==='day'&&d.entities.find(e=>e.id==='upper').name==='Keyboard authored tank'})()"
ab focus '#close-modal'
ab press Escape
assert_js 'native Escape closes named document dialog' "!document.querySelector('#modal').open&&document.querySelector('#modal').getAttribute('aria-labelledby')==='modal-title'"

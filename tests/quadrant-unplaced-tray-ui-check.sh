#!/usr/bin/env bash
set -euo pipefail
export AGENT_BROWSER_HEADED=false
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8810}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
session="quadrant-unplaced-tray-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?unplaced-tray=$$" >/dev/null
agent-browser --session "$session" click '#solo-mode' >/dev/null
agent-browser --session "$session" click '#example-button' >/dev/null
agent-browser --session "$session" click '#setup-submit' >/dev/null
before="$(agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;return {items:app.session.items.length,positions:Object.keys(app.session.positions).length,tray:document.querySelectorAll("[data-unplaced-note]").length,placed:document.querySelectorAll("[data-placed-note]").length}})()')"
selected_id="$(agent-browser --session "$session" eval 'document.querySelector("[data-unplaced-note]:last-child")?.dataset.itemId||""')"
selected_id="${selected_id//\"/}"
has_tray="$(agent-browser --session "$session" eval 'Boolean(document.querySelector("[data-unplaced-note]")&&document.querySelector("[data-placement-board]"))')"
if [[ "$has_tray" == true ]]; then
  agent-browser --session "$session" click '[data-unplaced-note]:last-child' >/dev/null
  agent-browser --session "$session" click '[data-placement-board]' >/dev/null
fi
after="$(agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;return {items:app.session.items.length,positions:Object.keys(app.session.positions).length,positionIds:Object.keys(app.session.positions),tray:document.querySelectorAll("[data-unplaced-note]").length,trayIds:[...document.querySelectorAll("[data-unplaced-note]")].map(el=>el.dataset.itemId),placed:document.querySelectorAll("[data-placed-note]").length}})()')"
agent-browser --session "$session" scrollintoview '[data-unplaced-note]' >/dev/null
sx="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-unplaced-note]").getBoundingClientRect();return box.left+box.width/2})()')"
sy="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-unplaced-note]").getBoundingClientRect();return box.top+box.height/2})()')"
tx="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-placement-board]").getBoundingClientRect();return box.left+box.width*.7})()')"
ty="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-placement-board]").getBoundingClientRect();return box.top+box.height*.35})()')"
sx="$(printf '%.0f' "$sx")"; sy="$(printf '%.0f' "$sy")"; tx="$(printf '%.0f' "$tx")"; ty="$(printf '%.0f' "$ty")"
agent-browser --session "$session" mouse move "$sx" "$sy" >/dev/null
agent-browser --session "$session" mouse down left >/dev/null
agent-browser --session "$session" mouse move "$tx" "$ty" >/dev/null
follows_pointer="$(agent-browser --session "$session" eval "(()=>{const visual=document.querySelector('[data-drag-ghost]');if(!visual)return false;const box=visual.getBoundingClientRect();return Math.hypot(box.left+box.width/2-$tx,box.top+box.height/2-$ty)<18})()")"
agent-browser --session "$session" mouse up left >/dev/null
after_drag="$(agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;return {positions:Object.keys(app.session.positions).length,tray:document.querySelectorAll("[data-unplaced-note]").length}})()')"
agent-browser --session "$session" focus '[data-unplaced-note]' >/dev/null
agent-browser --session "$session" press ArrowRight >/dev/null
agent-browser --session "$session" press Enter >/dev/null
after_keyboard="$(agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;return {positions:Object.keys(app.session.positions).length,tray:document.querySelectorAll("[data-unplaced-note]").length}})()')"
agent-browser --session "$session" scrollintoview '[data-unplaced-note]' >/dev/null
outside_sx="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-unplaced-note]").getBoundingClientRect();return box.left+box.width/2})()')"
outside_sy="$(agent-browser --session "$session" eval '(()=>{const box=document.querySelector("[data-unplaced-note]").getBoundingClientRect();return box.top+box.height/2})()')"
outside_sx="$(printf '%.0f' "$outside_sx")"; outside_sy="$(printf '%.0f' "$outside_sy")"
agent-browser --session "$session" mouse move "$outside_sx" "$outside_sy" >/dev/null
agent-browser --session "$session" mouse down left >/dev/null
agent-browser --session "$session" mouse move 4 4 >/dev/null
agent-browser --session "$session" mouse up left >/dev/null
after_outside="$(agent-browser --session "$session" eval '(async()=>{const app=(await import("./app.js")).facilitatorApp;return {positions:Object.keys(app.session.positions).length,tray:document.querySelectorAll("[data-unplaced-note]").length,temporaryVisuals:document.querySelectorAll("[data-drag-ghost],.unplaced-note.dragging").length}})()')"
agent-browser --session "$session" set viewport 390 844 >/dev/null
mobile="$(agent-browser --session "$session" eval 'document.documentElement.scrollWidth<=innerWidth&&Boolean(document.querySelector("[data-unplaced-tray]"))')"
errors="$(agent-browser --session "$session" errors)"
contract="$(SELECTED_ID="$selected_id" BEFORE="$before" AFTER="$after" FOLLOWS_POINTER="$follows_pointer" AFTER_DRAG="$after_drag" AFTER_KEYBOARD="$after_keyboard" AFTER_OUTSIDE="$after_outside" MOBILE="$mobile" ERRORS="$errors" node - <<'NODE'
const before=JSON.parse(process.env.BEFORE),after=JSON.parse(process.env.AFTER),afterDrag=JSON.parse(process.env.AFTER_DRAG),afterKeyboard=JSON.parse(process.env.AFTER_KEYBOARD),afterOutside=JSON.parse(process.env.AFTER_OUTSIDE)
console.log(before.items>=3&&before.positions===0&&before.tray===before.items&&before.placed===0&&after.positions===1&&after.positionIds.includes(process.env.SELECTED_ID)&&!after.trayIds.includes(process.env.SELECTED_ID)&&after.tray===after.items-1&&after.placed===1&&process.env.FOLLOWS_POINTER==='true'&&afterDrag.positions===2&&afterDrag.tray===before.items-2&&afterKeyboard.positions===3&&afterKeyboard.tray===before.items-3&&afterOutside.positions===3&&afterOutside.tray===before.items-3&&afterOutside.temporaryVisuals===0&&process.env.MOBILE==='true'&&!process.env.ERRORS.trim())
NODE
)"
if [[ "$contract" != true ]]; then
  printf 'FAIL unplaced tray: before=%s after=%s follows=%s drag=%s keyboard=%s outside=%s mobile=%s errors=%s\n' "$before" "$after" "$follows_pointer" "$after_drag" "$after_keyboard" "$after_outside" "$mobile" "$errors"
  exit 1
fi
printf 'PASS unplaced tray: options begin outside the board and move only after deliberate placement\n'

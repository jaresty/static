#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8796}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-first-use-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false

target="${1:-routes}"
session="quadrant-first-use-${target}-$$"
agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?first-use=$RANDOM" >/dev/null
agent-browser --session "$session" eval 'localStorage.clear()' >/dev/null
agent-browser --session "$session" reload >/dev/null

case "$target" in
  routes)
    result="$(agent-browser --session "$session" eval '(()=>{const text=id=>document.querySelector(id)?.innerText||"";return /Create a 2×2/i.test(text("#solo-mode"))&&/yourself/i.test(text("#solo-mode"))&&/Create a 2×2/i.test(text("#setup-mode"))&&/invite/i.test(text("#setup-mode"))&&/Combine/i.test(text("#combine-mode"))&&/completed/i.test(text("#combine-mode"))})()')"
    [[ "$result" == true ]] || { echo 'FAIL quadrant first-use routes: solo and async creation are not explicit or combine is not clearly later-stage'; exit 1; }
    echo 'PASS quadrant first-use routes: both creation paths and later response combination are explicit'
    ;;
  placement-affordance)
    agent-browser --session "$session" eval 'document.querySelector("[data-tour-offer]")?.remove()' >/dev/null
    agent-browser --session "$session" click '#solo-mode' >/dev/null
    agent-browser --session "$session" click '#example-button' >/dev/null
    agent-browser --session "$session" click '#setup-submit' >/dev/null
    result="$(agent-browser --session "$session" eval '(()=>{const gridCandidate=document.querySelector("#placement-board .candidate-preview");const name=document.querySelector("#candidate-card");const instruction=document.querySelector("#placement-drag-instruction");const sameText=gridCandidate?.innerText===name?.innerText;const soleInteractive=Array.from(document.querySelectorAll("button")).filter(node=>node.innerText.trim()===name?.innerText.trim()).length===1;return Boolean(gridCandidate&&gridCandidate.getBoundingClientRect().width>0&&getComputedStyle(gridCandidate).cursor==="grab"&&name&&name.tagName==="H3"&&sameText&&soleInteractive&&instruction&&instruction.getBoundingClientRect().height>0&&/highlighted card starts in the center/i.test(instruction.innerText)&&/Drag it to where it belongs/i.test(instruction.innerText)&&/Confirm this position/i.test(document.querySelector("#place-option")?.innerText||"")&&document.activeElement===gridCandidate)})()')"
    [[ "$result" == true ]] || { echo 'FAIL quadrant placement affordance: the highlighted grid card is not the sole, clearly explained placement control'; exit 1; }
    echo 'PASS quadrant placement affordance: one highlighted grid card owns drag, keyboard focus, and confirmation'
    ;;
  direct-drag)
    agent-browser --session "$session" eval 'document.querySelector("[data-tour-offer]")?.remove()' >/dev/null
    agent-browser --session "$session" click '#solo-mode' >/dev/null
    agent-browser --session "$session" click '#example-button' >/dev/null
    agent-browser --session "$session" click '#setup-submit' >/dev/null
    candidate="$(agent-browser --session "$session" get text '#candidate-card')"
    coords="$(agent-browser --session "$session" eval '(()=>{const source=document.querySelector("#placement-board .candidate-preview").getBoundingClientRect();const board=document.querySelector("#placement-board").getBoundingClientRect();return [source.x+source.width/2,source.y+source.height/2,board.x+board.width*.74,board.y+board.height*.24]})()')"
    read -r sx sy tx ty <<<"$(node -e 'let value=JSON.parse(process.argv[1]);if(typeof value==="string")value=JSON.parse(value);console.log(value.map(Math.round).join(" "))' "$coords")"
    if [[ -z "${DIRECT_DRAG_VIOLATION:-}" ]]; then
      agent-browser --session "$session" mouse move "$sx" "$sy" >/dev/null
      agent-browser --session "$session" mouse down >/dev/null
      for step in 1 2 3 4 5 6; do
        agent-browser --session "$session" mouse move "$((sx+(tx-sx)*step/6))" "$((sy+(ty-sy)*step/6))" >/dev/null
      done
      agent-browser --session "$session" mouse up >/dev/null
    fi
    before="$(agent-browser --session "$session" eval 'JSON.stringify(Array.from(document.querySelectorAll("#placement-board .board-item:not(.candidate-preview)")).map(node=>({text:node.innerText,left:node.style.left,bottom:node.style.bottom})))')"
    agent-browser --session "$session" reload >/dev/null
    agent-browser --session "$session" click '#resume-button' >/dev/null
    after="$(agent-browser --session "$session" eval 'JSON.stringify(Array.from(document.querySelectorAll("#placement-board .board-item:not(.candidate-preview)")).map(node=>({text:node.innerText,left:node.style.left,bottom:node.style.bottom})))')"
    result="$(node -e 'const [name,before,after]=process.argv.slice(1);const parse=value=>{let parsed=JSON.parse(value);if(typeof parsed==="string")parsed=JSON.parse(parsed);return parsed};const match=rows=>parse(rows).some(row=>row.text===name&&Math.abs(parseFloat(row.left)-74)<8&&Math.abs(parseFloat(row.bottom)-76)<8);process.stdout.write(String(match(before)&&match(after)))' "$candidate" "$before" "$after")"
    [[ "$result" == true ]] || { echo 'FAIL quadrant direct drag: dragging the current option onto the grid does not place and persist it'; exit 1; }
    echo 'PASS quadrant direct drag: the current option places directly and survives reload'
    ;;
  *)
    echo "Unknown target: $target" >&2
    exit 2
    ;;
esac

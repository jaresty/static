#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
PORT="${PORT:-8801}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
browser_test_install_cleanup
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false

for app in 2x2-facilitator pairwise-ranker; do
  if [[ "$app" == 2x2-facilitator ]]; then
    json='{"version":1,"kind":"quadrant-draft","question":"Which work should come first?","x":{"label":"Effort","low":"Lower effort","high":"Higher effort"},"y":{"label":"Impact","low":"Lower impact","high":"Higher impact"},"options":["Improve onboarding","Add keyboard shortcuts"]}'
    fragment="$(node --input-type=module -e "import {encodeQuadrantDraftFragment} from './2x2-facilitator/ai-draft.mjs'; console.log(encodeQuadrantDraftFragment(process.argv[1], 'http://127.0.0.1:$PORT/$app/'));" "$json")"
    review_field='#ai-review-question'; setup_field='#prompt'
  else
    json='{"version":1,"kind":"stack-rank-draft","criterion":"Expected customer impact","items":["Improve onboarding","Add keyboard shortcuts"]}'
    fragment="$(node --input-type=module -e "import {encodeStackDraftFragment} from './pairwise-ranker/ai-draft.mjs'; console.log(encodeStackDraftFragment(process.argv[1], 'http://127.0.0.1:$PORT/$app/'));" "$json")"
    review_field='#ai-review-criterion'; setup_field='#criterion'
  fi

  prompt_session="ai-prompt-${app}-$$"
  agent-browser --session "$prompt_session" open "http://127.0.0.1:$PORT/$app/?prompt=$RANDOM" >/dev/null
  agent-browser --session "$prompt_session" eval 'window.__copiedPrompt="";Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__copiedPrompt=text}}})' >/dev/null
  agent-browser --session "$prompt_session" find role button click --name 'Copy AI prompt' >/dev/null
  copied="$(agent-browser --session "$prompt_session" eval '/clickable draft link/i.test(window.__copiedPrompt)&&/Fallback JSON/i.test(window.__copiedPrompt)')"
  [[ "$copied" == true ]] || { echo "FAIL ai-draft-import: $app Copy AI prompt does not copy complete instructions"; exit 1; }
  copy_feedback="$(agent-browser --session "$prompt_session" eval 'document.activeElement?.textContent.trim()==="Prompt copied"')"
  [[ "$copy_feedback" == true ]] || { echo "FAIL ai-draft-feedback: $app Copy AI prompt has no visible confirmation"; exit 1; }
  copy_announcement="$(agent-browser --session "$prompt_session" eval '(()=>{const live=document.querySelector("#live-region");return live.getAttribute("aria-live")==="polite"&&/prompt copied/i.test(live.textContent)})()')"
  [[ "$copy_announcement" == true ]] || { echo "FAIL ai-draft-feedback: $app copy confirmation is not announced"; exit 1; }

  fragment_session="ai-fragment-${app}-$$"
  agent-browser --session "$fragment_session" open "$fragment" >/dev/null
  fragment_review="$(agent-browser --session "$fragment_session" eval "(()=>{const review=document.querySelector('#ai-draft-review');return document.querySelector('#ai-draft-dialog').open&&!review.hidden&&document.querySelector('$review_field').value.length>0&&document.querySelector('#setup-view').hidden})()")"
  [[ "$fragment_review" == true ]] || { echo "FAIL ai-draft-import: $app fragment link does not open an uncommitted editable review"; exit 1; }
  agent-browser --session "$fragment_session" fill "$review_field" 'Edited for solo' >/dev/null
  agent-browser --session "$fragment_session" click '#ai-use-solo' >/dev/null
  used_solo="$(agent-browser --session "$fragment_session" eval "document.body.dataset.mode==='solo'&&!document.querySelector('#setup-view').hidden&&document.querySelector('$setup_field').value==='Edited for solo'&&!location.hash")"
  [[ "$used_solo" == true ]] || { echo "FAIL ai-draft-import: $app Use solo does not populate the solo setup"; exit 1; }

  invite_session="ai-invite-${app}-$$"
  agent-browser --session "$invite_session" open "$fragment" >/dev/null
  agent-browser --session "$invite_session" fill "$review_field" 'Edited for participants' >/dev/null
  agent-browser --session "$invite_session" click '#ai-use-invite' >/dev/null
  used_invite="$(agent-browser --session "$invite_session" eval "document.body.dataset.mode==='facilitator-setup'&&!document.querySelector('#setup-view').hidden&&document.querySelector('$setup_field').value==='Edited for participants'&&!location.hash")"
  [[ "$used_invite" == true ]] || { echo "FAIL ai-draft-import: $app Invite responses does not populate facilitator setup"; exit 1; }

  manual_session="ai-manual-${app}-$$"
  agent-browser --session "$manual_session" open "http://127.0.0.1:$PORT/$app/?manual=$RANDOM" >/dev/null
  agent-browser --session "$manual_session" find role button click --name 'Draft with AI' >/dev/null
  agent-browser --session "$manual_session" find role button click --name 'Paste JSON manually' >/dev/null
  agent-browser --session "$manual_session" fill '#ai-draft-input' "$json" >/dev/null
  agent-browser --session "$manual_session" click '#ai-review-json' >/dev/null
  manual_review="$(agent-browser --session "$manual_session" eval '!document.querySelector("#ai-draft-review").hidden')"
  [[ "$manual_review" == true ]] || { echo "FAIL ai-draft-import: $app manual JSON does not open review"; exit 1; }
  manual_status="$(agent-browser --session "$manual_session" eval '(()=>{const status=document.querySelector("#ai-draft-status");return status.textContent.trim().length>0&&status.getClientRects().length>0})()')"
  [[ "$manual_status" == true ]] || { echo "FAIL ai-draft-feedback: $app manual import has no visible status"; exit 1; }
  import_announcement="$(agent-browser --session "$manual_session" eval 'document.querySelector("#ai-draft-status").getAttribute("role")==="status"')"
  [[ "$import_announcement" == true ]] || { echo "FAIL ai-draft-feedback: $app import status is not announced"; exit 1; }
  agent-browser --session "$manual_session" click '#ai-discard-draft' >/dev/null
  discarded="$(agent-browser --session "$manual_session" eval '!document.querySelector("#mode-view").hidden&&!document.querySelector("#ai-draft-dialog").open')"
  [[ "$discarded" == true ]] || { echo "FAIL ai-draft-import: $app Discard does not return to the unchanged entry"; exit 1; }

  clipboard_session="ai-clipboard-${app}-$$"
  agent-browser --session "$clipboard_session" open "http://127.0.0.1:$PORT/$app/?clipboard=$RANDOM" >/dev/null
  agent-browser --session "$clipboard_session" find role button click --name 'Draft with AI' >/dev/null
  encoded="$(printf '%s' "$json" | base64)"
  agent-browser --session "$clipboard_session" eval "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>atob('$encoded')}})" >/dev/null
  agent-browser --session "$clipboard_session" click '#ai-import-clipboard' >/dev/null
  agent-browser --session "$clipboard_session" wait 100 >/dev/null
  clipboard_review="$(agent-browser --session "$clipboard_session" eval '!document.querySelector("#ai-draft-review").hidden')"
  [[ "$clipboard_review" == true ]] || { echo "FAIL ai-draft-import: $app clipboard JSON does not open review"; exit 1; }
  clipboard_status="$(agent-browser --session "$clipboard_session" eval '(()=>{const status=document.querySelector("#ai-draft-status");return status.textContent.trim().length>0&&status.getClientRects().length>0})()')"
  [[ "$clipboard_status" == true ]] || { echo "FAIL ai-draft-feedback: $app clipboard import has no visible status"; exit 1; }
done
echo "PASS ai-draft-import: fragment, clipboard, manual, review, use, discard, and prompt flows work in both apps"

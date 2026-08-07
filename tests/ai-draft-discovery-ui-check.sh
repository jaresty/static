#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
PORT="${PORT:-8800}"
LOG="$(mktemp)"
python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 &
PID=$!
browser_test_install_cleanup
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
for app in 2x2-facilitator pairwise-ranker; do
  session="ai-discovery-${app}-$$"
  agent-browser --session "$session" open "http://127.0.0.1:$PORT/$app/?ai-discovery=$RANDOM" >/dev/null
  entry="$(agent-browser --session "$session" eval '(()=>{const visible=text=>Array.from(document.querySelectorAll("button")).some(button=>button.innerText.trim()===text&&!button.hidden&&button.getBoundingClientRect().width>0);return visible("Draft with AI")&&visible("Copy AI prompt")})()')"
  [[ "$entry" == true ]] || { echo "FAIL ai-draft-discovery: $app entry does not expose Draft with AI and Copy AI prompt"; exit 1; }
  agent-browser --session "$session" find role button click --name 'Draft with AI' >/dev/null
  panel="$(agent-browser --session "$session" eval '(()=>{const panel=document.querySelector("[data-ai-import-panel]");return Boolean(panel&&!panel.hidden&&panel.getBoundingClientRect().height>0&&/does not contact an AI/i.test(panel.innerText))})()')"
  [[ "$panel" == true ]] || { echo "FAIL ai-draft-discovery: $app Draft with AI does not open the import panel"; exit 1; }
  agent-browser --session "$session" find role button click --name 'Close AI setup' >/dev/null
  agent-browser --session "$session" find role button click --name 'Work solo' >/dev/null
  if [[ "$app" == 2x2-facilitator ]]; then
    disclosure="$(agent-browser --session "$session" eval '(()=>{const summary=document.querySelector("details.ai-assistance > summary");return Boolean(summary&&summary.innerText.trim()==="Need help drafting?"&&summary.getBoundingClientRect().width>0)})()')"
    [[ "$disclosure" == true ]] || { echo "FAIL ai-draft-discovery: $app setup does not expose alternate AI assistance"; exit 1; }
    agent-browser --session "$session" find text 'Need help drafting?' click --exact >/dev/null
  fi
  setup="$(agent-browser --session "$session" eval '(()=>{const visible=text=>Array.from(document.querySelectorAll("button")).some(button=>button.innerText.trim()===text&&!button.hidden&&button.getBoundingClientRect().width>0);return visible("Draft with AI")&&visible("Copy AI prompt")})()')"
  [[ "$setup" == true ]] || { echo "FAIL ai-draft-discovery: $app setup does not reveal Draft with AI and Copy AI prompt"; exit 1; }
done
echo "PASS ai-draft-discovery: both apps expose contextual AI setup entry points"

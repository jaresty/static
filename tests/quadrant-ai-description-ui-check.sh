#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8799}"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/quadrant-ai-description-server.log 2>&1 &
PID=$!
for _ in {1..50}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
export AGENT_BROWSER_HEADED=false
url="$(PORT="$PORT" node --input-type=module <<'EOF'
import { encodeQuadrantDraftFragment } from './2x2-facilitator/ai-draft.mjs';
const base = `http://127.0.0.1:${process.env.PORT}/2x2-facilitator/`;
console.log(encodeQuadrantDraftFragment({version:1,kind:'quadrant-draft',question:'Which ideas should we explore?',activityDescription:'Read the roadmap constraints before placing options.',x:{label:'Value',low:'Lower value',high:'Higher value'},y:{label:'Confidence',low:'Lower confidence',high:'Higher confidence'},options:[{title:'Improve search',description:'Help people recover from an unsuccessful first query.'},{title:'Clarify onboarding',description:''}]},base));
EOF
)"
session="quadrant-ai-description-$$"
agent-browser --session "$session" open "$url" >/dev/null
agent-browser --session "$session" set viewport 390 844 >/dev/null
review="$(agent-browser --session "$session" eval '(()=>document.querySelector("#ai-draft-dialog").open&&/roadmap constraints/.test(document.querySelector("#ai-review-activity-description").value)&&/unsuccessful first query/.test(document.querySelector("[data-ai-option-description=\"0\"]").value)&&document.documentElement.scrollWidth===document.documentElement.clientWidth)()')"
agent-browser --session "$session" fill '#ai-review-activity-description' 'Use the revised roadmap context.' >/dev/null
agent-browser --session "$session" fill '[data-ai-option-description="0"]' 'Explain recovery after a weak first query.' >/dev/null
agent-browser --session "$session" click '#ai-use-solo' >/dev/null
setup="$(agent-browser --session "$session" eval '(()=>/revised roadmap context/.test(document.querySelector("#activity-description").value)&&/Explain recovery/.test(document.querySelector("[data-option-description=\"0\"]").value))()')"
agent-browser --session "$session" click '#setup-submit' >/dev/null
persisted="$(agent-browser --session "$session" eval '(()=>{const saved=JSON.parse(localStorage.getItem("quadrant:workshop:v1"));return /revised roadmap context/.test(saved.activityDescription)&&/Explain recovery/.test(saved.items[0].description)})()')"
errors="$(agent-browser --session "$session" errors)"
[[ "$review" == true && "$setup" == true && "$persisted" == true && -z "$errors" ]] || { echo "FAIL quadrant AI descriptions: review=$review setup=$setup persisted=$persisted errors=$errors"; exit 1; }
echo 'PASS quadrant AI descriptions: encoded context is reviewable, editable, and committed'

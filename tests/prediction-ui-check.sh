#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${PREDICTION_TARGET:-structure}"
PORT="${PREDICTION_PORT:-$((8600 + RANDOM % 300))}"
SESSION="prediction-check-$$"
SERVER_PID=""
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
fail() { echo "FAIL prediction-$1" >&2; exit 1; }

check_structure() {
  python3 - "$ROOT/prediction/index.html" <<'PY' || fail "structure: prediction page is missing its title, entry form, or check-in date input"
from html.parser import HTMLParser
from pathlib import Path
import sys
path = Path(sys.argv[1])
if not path.is_file(): raise SystemExit(1)
class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack=[]; self.title=''; self.in_title=False; self.date_in_form=False
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='title': self.in_title=True
        if tag=='form' and a.get('id')=='form': self.stack.append('form')
        if tag=='input' and a.get('id')=='fDue' and a.get('type')=='date' and 'form' in self.stack: self.date_in_form=True
    def handle_endtag(self, tag):
        if tag=='title': self.in_title=False
        if tag=='form' and self.stack: self.stack.pop()
    def handle_data(self, data):
        if self.in_title: self.title+=data
p=P(); p.feed(path.read_text())
raise SystemExit(0 if 'Prediction' in p.title and p.date_in_form else 1)
PY
}

start_browser() {
  python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/prediction/" >/dev/null 2>&1 && break; sleep .1; done
}

# The check-in date input must line up with its sibling fields: same left edge and
# width, a thumb-sized height, and no horizontal page scroll.
check_date_layout() {
  start_browser
  for viewport in "390 844" "1440 900"; do
    agent-browser --session "$SESSION" set viewport $viewport >/dev/null
    agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/prediction/?date-layout=$RANDOM" >/dev/null
    result="$(agent-browser --session "$SESSION" eval "(()=>{const r=id=>document.getElementById(id).getBoundingClientRect(),c=r('fClaim'),d=r('fDue');return Math.abs(d.left-c.left)<=1&&Math.abs(d.width-c.width)<=1&&Math.abs(d.height-c.height)<=1&&d.height>=44&&document.documentElement.scrollWidth<=innerWidth})()")"
    [[ "$result" == "true" ]] || fail "date-layout: check-in date input is misaligned with sibling fields at ${viewport/ /x}"
  done
  node "$ROOT/tests/prediction-date-layout.mjs" "http://127.0.0.1:$PORT/prediction/?date-layout-webkit=$RANDOM" || exit 1
}

case "$TARGET" in
  structure) check_structure ;;
  date-layout) check_date_layout ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS prediction-$TARGET"

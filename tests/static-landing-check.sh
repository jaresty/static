#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${STATIC_LANDING_TARGET:-structure}"
PORT="${STATIC_LANDING_PORT:-$((8300 + RANDOM % 300))}"
SESSION="static-landing-check-$$"
SERVER_PID=""
cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  [[ -z "$SERVER_PID" ]] || kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "FAIL landing-$1" >&2; exit 1; }

check_structure() {
  python3 - "$ROOT/index.html" <<'PY' || fail "structure: root index is missing or lacks one main and one h1"
from html.parser import HTMLParser
from pathlib import Path
import sys
path = Path(sys.argv[1])
if not path.is_file(): raise SystemExit(1)
class P(HTMLParser):
    def __init__(self): super().__init__(); self.main=0; self.h1=0
    def handle_starttag(self, tag, attrs):
        self.main += tag == 'main'; self.h1 += tag == 'h1'
p=P(); p.feed(path.read_text())
raise SystemExit(0 if p.main == 1 and p.h1 == 1 else 1)
PY
}

check_inventory() {
  python3 - "$ROOT/index.html" <<'PY' || fail "inventory: landing page does not link every tracked static artifact"
from html.parser import HTMLParser
from pathlib import Path
import sys
path=Path(sys.argv[1])
if not path.is_file(): raise SystemExit(1)
class P(HTMLParser):
    def __init__(self): super().__init__(); self.hrefs=set()
    def handle_starttag(self, tag, attrs):
        if tag=='a':
            value=dict(attrs).get('href')
            if value: self.hrefs.add(value)
p=P(); p.feed(path.read_text())
required={'./ohara-living-diagram/','./2x2-facilitator/','./pairwise-ranker/','./simulators/code-review-pipeline.html','./simulators/split-pr-simulation.html'}
raise SystemExit(0 if required.issubset(p.hrefs) else 1)
PY
}

check_local_only() {
  python3 - "$ROOT" <<'PY' || fail "local-only: landing assets contain a remote runtime URL"
from pathlib import Path
import re,sys
root=Path(sys.argv[1])
paths=[root/'index.html',root/'landing.css',root/'landing.js']
if not (root/'index.html').is_file(): raise SystemExit(1)
text='\n'.join(path.read_text() for path in paths if path.is_file())
raise SystemExit(1 if re.search(r'https?://',text,re.I) else 0)
PY
}

start_browser() {
  python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/static-landing-check.log 2>&1 &
  SERVER_PID=$!
  for _ in {1..40}; do curl -fsS "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && break; sleep .1; done
  agent-browser --session "$SESSION" open "http://127.0.0.1:$PORT/?landing-check=$RANDOM" >/dev/null
  agent-browser --session "$SESSION" wait --load networkidle >/dev/null
}

check_ohara_first() {
  start_browser
  result="$(agent-browser --session "$SESSION" eval "(()=>{const card=document.querySelector('.project-card');return !!card&&card.getAttribute('href')==='./ohara-living-diagram/'&&card.textContent.includes('Ohara Living Diagram')})()")"
  [[ "$result" == "true" ]] || fail "ohara-first: Ohara Living Diagram is not the first featured project"
}

check_responsive() {
  start_browser
  for viewport in "390 844" "1440 900"; do
    agent-browser --session "$SESSION" set viewport $viewport >/dev/null
    result="$(agent-browser --session "$SESSION" eval "(()=>{const grid=document.querySelector('.project-grid'),cards=[...document.querySelectorAll('.project-card')],styled=getComputedStyle(grid).display==='grid'&&parseFloat(getComputedStyle(cards[0]).borderRadius)>=20,featured=innerWidth<800||cards[0].getBoundingClientRect().width>cards[1].getBoundingClientRect().width;return cards.length>=3&&document.documentElement.scrollWidth<=innerWidth&&cards.every(card=>card.getBoundingClientRect().width>0)&&styled&&featured})()")"
    [[ "$result" == "true" ]] || fail "responsive: project cards overflow or disappear at ${viewport/ /x}"
  done
}

case "$TARGET" in
  structure) check_structure ;;
  inventory) check_inventory ;;
  local-only) check_local_only ;;
  ohara-first) check_ohara_first ;;
  responsive) check_responsive ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

echo "PASS landing-$TARGET"

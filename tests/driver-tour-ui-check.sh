#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-assets}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/tests/browser-test-cleanup.sh"
browser_test_install_cleanup
case "$TARGET" in
  assets)
    [[ -s "$ROOT/vendor/driver.js.mjs" && -s "$ROOT/vendor/driver.css" ]] \
      && ! grep -Eqi 'https?://[^"'"'"' ]*(driver\.js|jsdelivr|unpkg)' "$ROOT/2x2-facilitator/index.html" "$ROOT/pairwise-ranker/index.html" \
      || { echo 'FAIL local Driver.js assets: walkthrough runtime is missing or remotely referenced'; exit 1; }
    echo 'PASS local Driver.js assets: walkthrough runtime is repository-owned and offline'
    ;;
  quadrant)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8780}"; LOG="$(mktemp)"
    python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    session="driver-quadrant-$$"
    agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?tour=$$" >/dev/null
    before="$(agent-browser --session "$session" eval '(()=>{const offer=document.querySelector("[data-tour-offer]");return offer&&!offer.hidden&&!document.querySelector(".driver-popover")&&!document.querySelector(".driver-overlay")&&!document.querySelector("#take-tour").hidden})()')"
    agent-browser --session "$session" eval 'document.querySelector("[data-start-tour]")?.click()' >/dev/null
    agent-browser --session "$session" wait '.driver-popover' >/dev/null
    after="$(agent-browser --session "$session" eval '(()=>{const popover=document.querySelector(".driver-popover");const active=document.querySelector(".driver-active-element");return Boolean(popover&&active&&!active.hidden&&getComputedStyle(active).display!=="none")})()')"
    [[ "$before" == true && "$after" == true ]] || { echo "FAIL Quadrant Driver.js tour: before=$before after=$after"; exit 1; }
    echo 'PASS Quadrant Driver.js tour: optional first-visit offer launches a visible local callout'
    ;;
  stack)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8781}"; LOG="$(mktemp)"
    python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    session="driver-stack-$$"
    agent-browser --session "$session" open "http://127.0.0.1:$PORT/pairwise-ranker/?tour=$$" >/dev/null
    before="$(agent-browser --session "$session" eval '(()=>{const offer=document.querySelector("[data-tour-offer]");return offer&&!offer.hidden&&!document.querySelector(".driver-popover")&&!document.querySelector(".driver-overlay")&&!document.querySelector("#take-tour").hidden})()')"
    agent-browser --session "$session" eval 'document.querySelector("[data-start-tour]")?.click()' >/dev/null
    agent-browser --session "$session" wait '.driver-popover' >/dev/null
    after="$(agent-browser --session "$session" eval 'Boolean(document.querySelector(".driver-popover")&&document.querySelector(".driver-active-element"))')"
    [[ "$before" == true && "$after" == true ]] || { echo "FAIL Stack Rank Driver.js tour: before=$before after=$after"; exit 1; }
    echo 'PASS Stack Rank Driver.js tour: optional first-visit offer launches a visible local callout'
    ;;
  launch-marker)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8783}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for path in 2x2-facilitator pairwise-ranker; do
      session="driver-launch-$path-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?real-work=$$" >/dev/null
      result="$(agent-browser --session "$session" eval '(()=>{window.__tourOpen=null;window.open=(url,target)=>{window.__tourOpen={url,target};return {}};document.querySelector("#take-tour").click();return Boolean(window.__tourOpen&&new URL(window.__tourOpen.url,location.href).searchParams.get("walkthrough")==="1"&&window.__tourOpen.target==="_blank")})()')"
      [[ "$result" == true ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL production tour launch: Take a tour does not open a marked practice context'; exit 1; }
    echo 'PASS production tour launch: both apps open marked practice contexts'
    ;;
  quadrant-rehearsal)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8785}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    session="driver-quadrant-rehearsal-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/2x2-facilitator/?walkthrough=1" >/dev/null
    agent-browser --session "$session" wait 300 >/dev/null
    ok=true
    phases=(entry setup share invitation participantStart participantComplete collection disagreement resolution export finish)
    for phase in "${phases[@]}"; do
      result="$(agent-browser --session "$session" eval "(()=>{const phase='$phase';const visible=node=>node&&!node.hidden&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().width>0;const conditions={entry:()=>visible(document.querySelector('#mode-view')),setup:()=>visible(document.querySelector('#setup-view'))&&/practice/i.test(document.querySelector('#prompt').value),share:()=>visible(document.querySelector('#setup-share-panel'))&&document.querySelector('#setup-share-output').value.includes('#quadrant='),invitation:()=>visible(document.querySelector('#invitation-view'))&&document.body.dataset.mode==='shared-setup',participantStart:()=>visible(document.querySelector('#placement-view'))&&document.body.dataset.mode==='response',participantComplete:()=>visible(document.querySelector('#review-view'))&&document.body.dataset.mode==='response',collection:()=>visible(document.querySelector('#collection-view'))&&document.querySelector('#response-count').textContent==='2 responses',disagreement:()=>Boolean(document.querySelector('#resolution-inspector')?.dataset.itemId),resolution:()=>Boolean(document.querySelector('[data-resolution-card][data-adjusted="true"]')),export:()=>document.querySelector('#resolution-export-output').value.includes('QUADRANT RESOLUTION'),finish:()=>visible(document.querySelector('[data-finish-walkthrough]'))};return document.body.dataset.walkthroughPhase===phase&&visible(document.querySelector('.driver-popover'))&&visible(document.querySelector('.driver-active-element'))&&conditions[phase]()})()")"
      if [[ "$result" != true ]]; then
        diagnostic="$(agent-browser --session "$session" eval '({phase:document.body.dataset.walkthroughPhase,mode:document.body.dataset.mode,active:document.querySelector(".driver-active-element")?.id,popover:Boolean(document.querySelector(".driver-popover")),visibleViews:Array.from(document.querySelectorAll(".view")).filter(node=>!node.hidden).map(node=>node.id),prompt:document.querySelector("#prompt")?.value,responseCount:document.querySelector("#response-count")?.textContent})')"
        ok=false; echo "Quadrant rehearsal stopped at $phase: $diagnostic"; break
      fi
      [[ "$phase" == finish ]] || { agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; }
    done
    [[ "$ok" == true ]] || { echo 'FAIL Quadrant production rehearsal: full workflow conditions are incomplete'; exit 1; }
    echo 'PASS Quadrant production rehearsal: complete real workflow is prepared step by step'
    ;;
  stack-rehearsal)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8786}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    session="driver-stack-rehearsal-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/pairwise-ranker/?walkthrough=1" >/dev/null
    agent-browser --session "$session" wait 300 >/dev/null
    ok=true
    phases=(entry setup share invitation participantStart participantComplete collection aggregate rankings pairwise finish)
    for phase in "${phases[@]}"; do
      result="$(agent-browser --session "$session" eval "(()=>{const phase='$phase';const visible=node=>node&&!node.hidden&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().width>0;const conditions={entry:()=>visible(document.querySelector('#mode-view')),setup:()=>visible(document.querySelector('#setup-view'))&&/practice/i.test(document.querySelector('#criterion').value),share:()=>visible(document.querySelector('#setup-share-panel'))&&document.querySelector('#setup-share-output').value.includes('#stack-rank='),invitation:()=>visible(document.querySelector('#invitation-view'))&&document.body.dataset.mode==='shared-setup',participantStart:()=>visible(document.querySelector('#compare-view'))&&document.body.dataset.mode==='response',participantComplete:()=>visible(document.querySelector('#review-view'))&&document.body.dataset.mode==='response',collection:()=>visible(document.querySelector('#collection-view'))&&document.querySelector('#response-count').textContent==='2 responses',aggregate:()=>document.querySelectorAll('[data-aggregate-item]').length>0,rankings:()=>document.querySelectorAll('[data-ranking]').length===2,pairwise:()=>document.querySelectorAll('[data-pair-split]').length>0,finish:()=>visible(document.querySelector('[data-finish-walkthrough]'))};return document.body.dataset.walkthroughPhase===phase&&visible(document.querySelector('.driver-popover'))&&visible(document.querySelector('.driver-active-element'))&&conditions[phase]()})()")"
      if [[ "$result" != true ]]; then
        diagnostic="$(agent-browser --session "$session" eval '({phase:document.body.dataset.walkthroughPhase,mode:document.body.dataset.mode,active:document.querySelector(".driver-active-element")?.id,visibleViews:Array.from(document.querySelectorAll(".view")).filter(node=>!node.hidden).map(node=>node.id),responseCount:document.querySelector("#response-count")?.textContent})')"
        ok=false; echo "Stack rehearsal stopped at $phase: $diagnostic"; break
      fi
      [[ "$phase" == finish ]] || { agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; }
    done
    [[ "$ok" == true ]] || { echo 'FAIL Stack Rank production rehearsal: full workflow conditions are incomplete'; exit 1; }
    echo 'PASS Stack Rank production rehearsal: complete real workflow is prepared step by step'
    ;;
  finish-return)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8787}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for spec in '2x2-facilitator:10' 'pairwise-ranker:10'; do
      path="${spec%%:*}"; steps="${spec##*:}"; session="driver-finish-$path-$$"
      agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?walkthrough=1" >/dev/null; agent-browser --session "$session" wait 300 >/dev/null
      for ((index=0; index<steps; index+=1)); do agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; done
      if [[ -z "${TOUR_FINISH_VIOLATION:-}" ]]; then agent-browser --session "$session" find role button click --name 'Exit practice' >/dev/null; fi
      agent-browser --session "$session" wait 300 >/dev/null
      result="$(agent-browser --session "$session" eval 'new URL(location.href).searchParams.has("walkthrough")===false')"
      [[ "$result" == true ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL production rehearsal exit: practice does not return to the clean app URL'; exit 1; }
    echo 'PASS production rehearsal exit: direct-open practice returns to each clean app URL'
    ;;
  storage-isolation)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8788}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for spec in '2x2-facilitator:10' 'pairwise-ranker:10'; do
      path="${spec%%:*}"; steps="${spec##*:}"; session="driver-storage-$path-$$"
      agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?normal=$$" >/dev/null
      before="$(agent-browser --session "$session" eval 'localStorage.clear();localStorage.setItem("existing-real-work","preserve-me");JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()))')"
      agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?walkthrough=1" >/dev/null; agent-browser --session "$session" wait 300 >/dev/null
      for ((index=0; index<steps; index+=1)); do agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; done
      after="$(agent-browser --session "$session" eval 'JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()))')"
      [[ "$before" == "$after" ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL production rehearsal storage: practice artifacts entered normal localStorage'; exit 1; }
    echo 'PASS production rehearsal storage: normal localStorage remains byte-equivalent'
    ;;
  runtime-origin)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8789}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for path in 2x2-facilitator pairwise-ranker; do
      session="driver-origin-$path-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?walkthrough=1" >/dev/null; agent-browser --session "$session" wait 350 >/dev/null
      if [[ -n "${TOUR_ORIGIN_VIOLATION:-}" ]]; then agent-browser --session "$session" eval 'fetch("http://127.0.0.1:9/tour-fault").catch(()=>{})' >/dev/null; agent-browser --session "$session" wait 150 >/dev/null; fi
      result="$(agent-browser --session "$session" eval 'performance.getEntriesByType("resource").every(entry=>new URL(entry.name).origin===location.origin)')"
      [[ "$result" == true ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL production rehearsal runtime: a walkthrough requested a non-static origin'; exit 1; }
    echo 'PASS production rehearsal runtime: all walkthrough resources are same-origin static assets'
    ;;
  step-accessibility)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8792}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for spec in '2x2-facilitator:11' 'pairwise-ranker:11'; do
      path="${spec%%:*}"; steps="${spec##*:}"; session="driver-a11y-$path-$$"
      agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?walkthrough=1" >/dev/null; agent-browser --session "$session" wait 350 >/dev/null
      for ((index=0; index<steps; index+=1)); do
        if [[ -n "${TOUR_A11Y_VIOLATION:-}" && "$index" -eq 0 ]]; then agent-browser --session "$session" eval 'document.querySelector(".driver-active-element").removeAttribute("tabindex")' >/dev/null; fi
        result="$(agent-browser --session "$session" eval '(()=>{const target=document.querySelector(".driver-active-element"),next=document.querySelector(".driver-popover-next-btn");target?.focus();const r=target?.getBoundingClientRect();return Boolean(target&&r.width>0&&document.activeElement===target&&next&&!next.disabled)})()')"
        [[ "$result" == true ]] || { ok=false; break; }
        [[ "$index" -eq $((steps-1)) ]] || { agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; }
      done
    done
    [[ "$ok" == true ]] || { echo 'FAIL production rehearsal accessibility: a step target is not visible and keyboard reachable'; exit 1; }
    echo 'PASS production rehearsal accessibility: every real-app step target is visible and focusable'
    ;;
  rehearsal-mobile)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8793}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for spec in '2x2-facilitator:11' 'pairwise-ranker:11'; do
      path="${spec%%:*}"; steps="${spec##*:}"; session="driver-mobile-$path-$$"
      agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?walkthrough=1" >/dev/null; agent-browser --session "$session" set viewport 390 844 >/dev/null; agent-browser --session "$session" wait 350 >/dev/null
      for ((index=0; index<steps; index+=1)); do
        if [[ -n "${TOUR_MOBILE_VIOLATION:-}" && "$index" -eq 0 ]]; then agent-browser --session "$session" eval 'document.querySelector(".driver-popover").style.transform="translateX(500px)"' >/dev/null; fi
        result="$(agent-browser --session "$session" eval '(()=>{const inside=node=>{const r=node?.getBoundingClientRect();return r&&r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1};return inside(document.querySelector(".driver-active-element"))&&inside(document.querySelector(".driver-popover"))&&document.documentElement.scrollWidth<=innerWidth})()')"
        if [[ "$result" != true ]]; then
          diagnostic="$(agent-browser --session "$session" eval '(()=>{const shape=node=>{const r=node?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null};return{phase:document.body.dataset.walkthroughPhase,target:shape(document.querySelector(".driver-active-element")),popover:shape(document.querySelector(".driver-popover")),viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth}})()')"
          echo "Mobile rehearsal clipped in $path: $diagnostic"; ok=false; break
        fi
        [[ "$index" -eq $((steps-1)) ]] || { agent-browser --session "$session" click '.driver-popover-next-btn' >/dev/null; agent-browser --session "$session" wait 450 >/dev/null; }
      done
    done
    [[ "$ok" == true ]] || { echo 'FAIL production rehearsal mobile: a target or popover clips at 390px'; exit 1; }
    echo 'PASS production rehearsal mobile: every target and popover fits at 390px'
    ;;
  state-preservation)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8784}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for path in 2x2-facilitator pairwise-ranker; do
      session="driver-preserve-$path-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?real-work=$$" >/dev/null
      agent-browser --session "$session" click '#setup-mode' >/dev/null
      field="#prompt"; [[ "$path" == pairwise-ranker ]] && field="#criterion"
      agent-browser --session "$session" fill "$field" 'KEEP THIS UNSAVED WORK' >/dev/null
      result="$(agent-browser --session "$session" eval '(()=>{const field=document.querySelector("#prompt,#criterion");const before={url:location.href,mode:document.body.dataset.mode,value:field.value,storage:JSON.stringify(localStorage)};window.open=()=>({});document.querySelector("#take-tour").click();if(window.__TOUR_STATE_VIOLATION)field.value="LOST";const after={url:location.href,mode:document.body.dataset.mode,value:field.value,storage:JSON.stringify(localStorage)};return JSON.stringify(before)===JSON.stringify(after)})()')"
      [[ -z "${TOUR_STATE_VIOLATION:-}" ]] || result="$(agent-browser --session "$session" eval 'document.querySelector("#prompt,#criterion").value="LOST";document.querySelector("#prompt,#criterion").value==="KEEP THIS UNSAVED WORK"')"
      [[ "$result" == true ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL production tour isolation: launching practice mutates the original app context'; exit 1; }
    echo 'PASS production tour isolation: original URL and unsaved app state remain untouched'
    ;;
  replay)
    export AGENT_BROWSER_HEADED=false
    PORT="${PORT:-8782}"; LOG="$(mktemp)"; python3 -m http.server "$PORT" --directory "$ROOT" >"$LOG" 2>&1 & PID=$!
    sleep .08; kill -0 "$PID" >/dev/null 2>&1 || { cat "$LOG"; exit 1; }
    ok=true
    for path in 2x2-facilitator pairwise-ranker; do
      session="driver-replay-$path-$$"; agent-browser --session "$session" open "http://127.0.0.1:$PORT/$path/?replay=$$" >/dev/null
      agent-browser --session "$session" eval 'document.querySelector("[data-dismiss-tour]")?.click()' >/dev/null
      agent-browser --session "$session" reload >/dev/null; agent-browser --session "$session" wait 250 >/dev/null
      [[ -z "${TOUR_REPLAY_VIOLATION:-}" ]] || agent-browser --session "$session" eval 'document.querySelector("#take-tour").hidden=true' >/dev/null
      before="$(agent-browser --session "$session" eval 'document.querySelector("[data-tour-offer]").hidden&&!document.querySelector("#take-tour").hidden')"
      agent-browser --session "$session" click '#take-tour' >/dev/null
      agent-browser --session "$session" wait '.driver-popover' >/dev/null
      after="$(agent-browser --session "$session" eval 'new URL(location.href).searchParams.get("walkthrough")==="1"&&Boolean(document.querySelector(".driver-popover"))')"
      [[ "$before" == true && "$after" == true ]] || ok=false
    done
    [[ "$ok" == true ]] || { echo 'FAIL Driver.js replay: replay control is not persistent and operable in both apps'; exit 1; }
    echo 'PASS Driver.js replay: both apps retain an operable tour control after dismissal'
    ;;
  *) echo "Unknown target: $TARGET" >&2; exit 2 ;;
esac

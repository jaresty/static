// Pure functions are provided by ls-clock-core.js (loaded first in index.html).
// This file contains: localStorage helpers, DOM rendering, group assignment, structures, app bootstrap.

function saveNote(sessionId, phaseIndex, participantName, text) {
  localStorage.setItem(getNoteKey(sessionId, phaseIndex, participantName), text);
}

function loadNote(sessionId, phaseIndex, participantName) {
  return localStorage.getItem(getNoteKey(sessionId, phaseIndex, participantName)) ?? '';
}
// ---------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderParticipantView(container, session, participantName, nowMs) {
  const phase = getActivePhase(session, nowMs);
  container.innerHTML = '';

  if (!phase) {
    const elapsed = nowMs / 1000 - session.startTime;
    const msg = document.createElement('div');
    msg.className = 'status-message';
    msg.textContent = elapsed < 0 ? 'Session has not started yet.' : 'Session complete. Thank you!';
    container.appendChild(msg);
    return;
  }

  // Transition or break phase — groupSize 0
  if (phase.groupSize === 0) {
    const isPassing = phase.transitionType === 'passing';
    const breakEl = document.createElement('div');
    breakEl.setAttribute('data-role', isPassing ? 'transition' : 'break');
    breakEl.className = isPassing ? 'transition-block' : 'break-block';

    if (isPassing) {
      // Show where to go next
      const nextPhase = session.phases.find(p => p.index === phase.index + 1);
      let nextLabel = null;
      if (nextPhase) {
        if (nextPhase.groupSize >= 999) {
          nextLabel = session.plenaryLocation?.label || 'Whole Group';
        } else if (nextPhase.groupSize > 0) {
          const nextGroup = getParticipantGroup(session, nextPhase.index, participantName);
          if (nextGroup?.location) nextLabel = nextGroup.location.label;
        }
      }
      if (nextLabel) {
        const nextLocEl = document.createElement('div');
        nextLocEl.setAttribute('data-role', 'next-location');
        nextLocEl.className = 'next-location';
        nextLocEl.textContent = 'Head to: ' + nextLabel;
        breakEl.appendChild(nextLocEl);
      }
    }
    const breakTitle = document.createElement('div');
    breakTitle.className = 'break-title';
    breakTitle.textContent = '☕ Break';
    const phaseEndSec = session.startTime + phase.startOffset + phase.duration;
    const remainSec = Math.max(0, Math.round(phaseEndSec - nowMs / 1000));
    const countdownEl = document.createElement('div');
    countdownEl.setAttribute('data-role', 'countdown');
    countdownEl.className = `countdown countdown-${getCountdownClass(remainSec)}`;
    countdownEl.textContent = formatTime(remainSec);
    const instrEl = document.createElement('div');
    instrEl.className = 'phase-instructions';
    instrEl.textContent = phase.instructions;
    breakEl.appendChild(breakTitle);
    breakEl.appendChild(countdownEl);
    breakEl.appendChild(instrEl);
    container.appendChild(breakEl);

    // Overview panel
    container.appendChild(buildOverviewPanel(session, phase));
    return;
  }

  const group = getParticipantGroup(session, phase.index, participantName);

  // 1. WHERE TO GO (most prominent, first in DOM)
  const locationEl = document.createElement('div');
  locationEl.setAttribute('data-role', 'location');
  locationEl.className = 'location-block';
  if (group && group.location) {
    const loc = group.location;
    if (loc.type === 'url' && loc.url) {
      const btn = document.createElement('a');
      btn.href = loc.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.className = 'join-btn';
      btn.textContent = `Join ${loc.label} →`;
      locationEl.appendChild(btn);
    } else {
      const label = document.createElement('div');
      label.className = 'location-label';
      label.textContent = loc.label;
      locationEl.appendChild(label);
      if (loc.instructions) {
        const inst = document.createElement('div');
        inst.className = 'location-instructions';
        inst.textContent = loc.instructions;
        locationEl.appendChild(inst);
      }
    }
  } else if (phase.groupSize === 999 && session.plenaryLocation) {
    const loc = session.plenaryLocation;
    if (loc.url) {
      const btn = document.createElement('a');
      btn.href = loc.url;
      btn.target = '_blank';
      btn.rel = 'noopener';
      btn.className = 'join-btn';
      btn.textContent = `Join ${loc.label} →`;
      locationEl.appendChild(btn);
    } else {
      const label = document.createElement('div');
      label.className = 'location-label';
      label.textContent = loc.label;
      locationEl.appendChild(label);
    }
  }
  container.appendChild(locationEl);

  // 2. WHO YOU'RE WITH
  const membersEl = document.createElement('div');
  membersEl.setAttribute('data-role', 'group-members');
  membersEl.className = 'group-members';
  if (group) {
    const others = group.members.filter(m => m.name.toLowerCase() !== participantName.toLowerCase());
    if (others.length === 0) {
      membersEl.textContent = 'Working individually';
    } else {
      membersEl.textContent = 'With: ' + others.map(m => m.name).join(', ');
    }
  }
  container.appendChild(membersEl);

  // 2b. YOUR ROLE (if assigned)
  if (group) {
    const self = group.members.find(m => m.name.toLowerCase() === participantName.toLowerCase());
    if (self && self.role) {
      const roleEl = document.createElement('div');
      roleEl.setAttribute('data-role', 'member-role');
      roleEl.className = 'member-role';
      roleEl.textContent = 'Your role: ' + self.role;
      if (self.roleInstructions) {
        const instrSpan = document.createElement('span');
        instrSpan.className = 'role-instructions';
        instrSpan.textContent = ' — ' + self.roleInstructions;
        roleEl.appendChild(instrSpan);
      }
      container.appendChild(roleEl);
    }
  }

  // 3. Countdown
  const phaseEndSec = session.startTime + phase.startOffset + phase.duration;
  const remainSec = Math.max(0, Math.round(phaseEndSec - nowMs / 1000));
  const countdownEl = document.createElement('div');
  countdownEl.setAttribute('data-role', 'countdown');
  countdownEl.className = `countdown countdown-${getCountdownClass(remainSec)}`;
  countdownEl.textContent = formatTime(remainSec);
  container.appendChild(countdownEl);

  // 4. Phase instructions
  const instrEl = document.createElement('div');
  instrEl.setAttribute('data-role', 'instructions');
  instrEl.className = 'phase-instructions';
  instrEl.textContent = phase.instructions;
  container.appendChild(instrEl);

  // 5. Overview panel (expandable)
  container.appendChild(buildOverviewPanel(session, phase));

  // 6. Copy notes button
  const copyBtn = document.createElement('button');
  copyBtn.setAttribute('data-role', 'copy-notes');
  copyBtn.className = 'copy-notes-btn';
  copyBtn.textContent = 'Copy my notes';
  copyBtn.addEventListener('click', () => {
    const lines = session.phases.map(p => {
      const key = getNoteKey(session.id, p.index, participantName);
      const note = localStorage.getItem(key) || '';
      return note ? `${p.name}:\n${note}` : null;
    }).filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n\n')).catch(() => {});
  });
  container.appendChild(copyBtn);
}

function buildOverviewPanel(session, activePhase) {
  const wrapper = document.createElement('details');
  wrapper.setAttribute('data-role', 'overview');
  wrapper.className = 'overview-panel';
  const summary = document.createElement('summary');
  summary.textContent = 'Session overview';
  wrapper.appendChild(summary);
  const list = document.createElement('div');
  list.setAttribute('data-role', 'overview-phases');
  list.className = 'overview-phases';
  for (const p of session.phases) {
    const row = document.createElement('div');
    row.className = 'overview-phase-row' + (p.index === activePhase.index ? ' overview-active' : '');
    const groupLabel = p.groupSize === 0 ? 'Break' : p.groupSize >= 999 ? 'Whole group' : p.groupSize === 1 ? 'Individual' : `Groups of ${p.groupSize}`;
    row.textContent = `${p.name} — ${Math.round(p.duration / 60)} min — ${groupLabel}`;
    list.appendChild(row);
  }
  wrapper.appendChild(list);

  // Full group map for active phase
  if (session.groups && session.groups[activePhase.index]) {
    const mapDiv = document.createElement('div');
    mapDiv.setAttribute('data-role', 'overview-map');
    mapDiv.className = 'overview-map';
    const mapTitle = document.createElement('div');
    mapTitle.className = 'overview-map-title';
    mapTitle.textContent = 'Where everyone is now:';
    mapDiv.appendChild(mapTitle);
    for (const group of session.groups[activePhase.index]) {
      const row = document.createElement('div');
      row.className = 'overview-map-row';
      const locLabel = group.location?.label || '?';
      const members = group.members.map(m => m.name + (m.role ? ` (${m.role})` : '')).join(', ');
      row.textContent = `${locLabel}: ${members}`;
      mapDiv.appendChild(row);
    }
    wrapper.appendChild(mapDiv);
  }

  return wrapper;
}

function renderPhaseTimeline(container, session, nowMs) {
  const active = getActivePhase(session, nowMs);
  container.innerHTML = '';
  const elapsed = nowMs / 1000 - session.startTime;

  const segments = session.segments || [];
  for (const phase of session.phases) {
    const seg = segments.find(s => s.phaseIndexStart === phase.index);
    if (seg) {
      const header = document.createElement('div');
      header.setAttribute('data-role', 'segment-header');
      header.className = 'segment-header';
      header.textContent = seg.name;
      container.appendChild(header);
    }
    const item = document.createElement('div');
    item.setAttribute('data-phase-index', phase.index);
    item.className = 'timeline-item';
    const isActive = active && active.index === phase.index;
    const isElapsed = elapsed >= phase.startOffset + phase.duration;
    if (isActive) item.classList.add('active');
    if (isElapsed) item.classList.add('elapsed');
    item.textContent = (isElapsed ? '✓ ' : '') + phase.name;
    container.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// App bootstrap — runs when loaded in the full SPA (not in test context)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && document.getElementById('app')) {
  initApp();
}

function initApp() {
  const fragment = window.location.hash.slice(1);
  if (fragment) {
    const session = decodeSession(fragment);
    if (session) {
      renderJoinOrView(session);
      return;
    }
  }
  renderSetupPage();
}

function renderJoinOrView(session) {
  const app = document.getElementById('app');
  const params = new URLSearchParams(window.location.search);
  const prefilledName = params.get('name') || '';
  const isFacilitator = params.get('role') === 'facilitator';

  if (isFacilitator) {
    renderFacilitatorView(app, session);
    return;
  }

  // Name entry screen
  app.innerHTML = `
    <div class="join-screen">
      <h1 class="app-title">LS Activity Clock</h1>
      <div class="invitation">${escHtml(session.invitation)}</div>
      <div class="join-form">
        <label>Your name</label>
        <input id="name-input" type="text" placeholder="Enter your name" value="${escHtml(prefilledName)}" autocomplete="off" list="name-suggestions">
        <datalist id="name-suggestions" data-role="name-suggestions">
          ${session.participants.map(p => `<option value="${escHtml(p.name)}">`).join('')}
        </datalist>
        <button id="join-btn">Join session</button>
      </div>
    </div>`;

  const input = document.getElementById('name-input');
  const btn = document.getElementById('join-btn');

  const tryJoin = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    const group = getParticipantGroup(session, 0, name);
    if (!group) {
      // Latecomer: inject into a random existing group for each phase
      const lateSession = JSON.parse(JSON.stringify(session));
      const lateId = session.participants.length;
      lateSession.participants = [...session.participants, { name, id: lateId }];
      for (const phase of lateSession.phases) {
        const groups = lateSession.groups[phase.index];
        if (groups && groups.length > 0) {
          const targetGroup = groups[Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % groups.length];
          targetGroup.members = [...targetGroup.members, { name, id: lateId }];
        }
      }
      startParticipantClock(app, lateSession, name);
      return;
    }
    startParticipantClock(app, session, name);
  };

  btn.addEventListener('click', tryJoin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  if (prefilledName) tryJoin();
}

function startParticipantClock(app, session, participantName) {
  const view = document.createElement('div');
  view.className = 'participant-view';

  const locationSection = document.createElement('div');
  locationSection.className = 'main-section';

  const timeline = document.createElement('div');
  timeline.className = 'timeline-strip';

  const invitationEl = document.createElement('div');
  invitationEl.className = 'invitation-footer';
  invitationEl.textContent = session.invitation;

  const notesLabel = document.createElement('label');
  notesLabel.className = 'notes-label';
  notesLabel.textContent = 'Your notes';

  const notesEl = document.createElement('textarea');
  notesEl.className = 'notes-area';
  notesEl.placeholder = 'Write your thoughts here…';

  app.innerHTML = '';
  app.appendChild(view);
  app.appendChild(timeline);
  app.appendChild(invitationEl);
  app.appendChild(notesLabel);
  app.appendChild(notesEl);

  let lastPhaseIndex = null;

  const tick = () => {
    const now = Date.now();
    const phase = getActivePhase(session, now);
    const phaseIndex = phase ? phase.index : null;

    if (phaseIndex !== lastPhaseIndex) {
      // Save note from prior phase, load note for new phase
      if (lastPhaseIndex !== null) {
        saveNote(session.id, lastPhaseIndex, participantName, notesEl.value);
      }
      notesEl.value = phaseIndex !== null ? loadNote(session.id, phaseIndex, participantName) : '';
      lastPhaseIndex = phaseIndex;

      // Flash location block on phase transition
      view.classList.remove('phase-transition');
      void view.offsetWidth;
      view.classList.add('phase-transition');
    }

    renderParticipantView(view, session, participantName, now);
    renderPhaseTimeline(timeline, session, now);
  };

  notesEl.addEventListener('input', () => {
    if (lastPhaseIndex !== null) saveNote(session.id, lastPhaseIndex, participantName, notesEl.value);
  });

  tick();
  setInterval(tick, 1000);
}

function renderFacilitatorView(app, session) {
  const tick = () => {
    const now = Date.now();
    const active = getActivePhase(session, now);
    const elapsed = now / 1000 - session.startTime;

    let html = `<h1 class="app-title">Facilitator View</h1>
    <div class="invitation">${escHtml(session.invitation)}</div>
    <div class="fac-grid">`;

    for (const phase of session.phases) {
      const isActive = active && active.index === phase.index;
      const isElapsed = elapsed >= phase.startOffset + phase.duration;
      const phaseRemain = isActive ? Math.max(0, Math.round(session.startTime + phase.startOffset + phase.duration - now / 1000)) : null;

      html += `<div class="fac-phase ${isActive ? 'fac-active' : ''} ${isElapsed ? 'fac-elapsed' : ''}">
        <div class="fac-phase-name">${escHtml(phase.name)}${phaseRemain !== null ? ` <span class="fac-countdown">${formatTime(phaseRemain)}</span>` : ''}</div>`;

      const groups = session.groups[phase.index] || [];
      for (const group of groups) {
        const loc = group.location;
        html += `<div class="fac-group">
          <div class="fac-members">${group.members.map(m => escHtml(m.name)).join(', ')}</div>
          <div class="fac-location">${loc.url ? `<a href="${escHtml(loc.url)}" target="_blank">${escHtml(loc.label)}</a>` : escHtml(loc.label)}</div>
        </div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    app.innerHTML = html;
  };

  tick();
  setInterval(tick, 1000);
}

function renderSetupPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1 class="app-title">LS Activity Clock — Setup</h1>

    <section class="setup-section llm-section">
      <h2>Quick setup with an LLM</h2>
      <p class="hint">Copy the planning prompt into any LLM, answer its questions, then open the setup link it returns. The link is bookmarkable and the app fills in all activity mechanics.</p>
      <div class="setup-actions">
        <button id="copy-prompt-btn" class="primary-btn">Copy planning prompt</button>
        <div id="copy-confirm" class="copy-confirm" style="display:none">Copied!</div>
      </div>
      <div id="plan-error" class="error-msg" style="display:none"></div>
    </section>

    <details class="setup-section manual-form">
      <summary><h2 style="display:inline">Or: Set up manually</h2></summary>
      <button type="button" id="load-sample-btn">Load sample setup</button>

      <section class="setup-section">
        <h2>1. Choose a structure</h2>
        <div id="structure-sequence">
          <div class="structure-row">
            <select id="structure-select" class="structure-select-item">
              ${Object.keys(STRUCTURES).map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
            <a id="learn-more-link" data-role="learn-more" href="#" target="_blank" rel="noopener" style="display:none">Learn more →</a>
          </div>
          <p data-role="structure-description"></p>
        </div>
        <button type="button" data-role="add-structure-btn" id="add-structure-btn">+ Add another structure</button>
      </section>

      <section class="setup-section">
        <h2>2. Invitation / central question</h2>
        <input id="invitation-input" type="text" placeholder="What opportunity is hiding in our biggest challenge?" class="wide-input">
      </section>

      <section class="setup-section">
        <h2>3. Start time</h2>
        <div class="quick-set-row">
          <button type="button" data-role="start-quick-set" data-offset-ms="0">Start now</button>
          <button type="button" data-role="start-quick-set" data-offset-ms="60000">In 1 min</button>
          <button type="button" data-role="start-quick-set" data-offset-ms="120000">In 2 min</button>
          <button type="button" data-role="start-quick-set" data-offset-ms="300000">In 5 min</button>
        </div>
        <input id="start-time-input" type="datetime-local" class="wide-input">
      </section>

      <section class="setup-section">
        <h2>4. Participants (one per line)</h2>
        <textarea id="participants-input" rows="6" placeholder="Alice&#10;Bob&#10;Carol&#10;Dave"></textarea>
      </section>

      <section class="setup-section">
        <h2>5. Meeting locations (one per line — paste URLs or room names)</h2>
        <textarea id="locations-input" rows="4" placeholder="https://meet.google.com/abc-defg&#10;https://meet.google.com/hij-klmn&#10;Conference Room A"></textarea>
      </section>

      <section class="setup-section">
        <h2>6. Plenary / whole-group location</h2>
        <input id="plenary-input" type="text" placeholder="https://zoom.us/j/main or Main Hall" class="wide-input">
      </section>

      <button id="generate-btn" class="primary-btn">Generate session URL</button>
    </details>

    <section class="setup-section" id="preview-section" style="display:none" data-role="preview">
      <h2>Confirm your session</h2>
      <div><strong>Structure:</strong> <span data-role="preview-structure"></span></div>
      <div><strong>Start time:</strong> <span data-role="preview-starttime"></span></div>
      <div><strong>Participants:</strong> <span data-role="preview-participants"></span></div>
      <div><strong>Phases:</strong> <span data-role="preview-phases"></span></div>
      <div data-role="preview-groups"></div>
      <button id="confirm-url-btn" class="primary-btn">Looks good — generate URL</button>
      <button id="cancel-preview-btn">Cancel</button>
    </section>

    <section class="setup-section" id="result-section" style="display:none">
      <h2>Session URL</h2>
      <textarea id="session-url-output" rows="3" readonly></textarea>
      <button id="copy-url-btn">Copy URL</button>
      <div class="url-hint">Share this URL with participants. They enter their name to join.</div>
      <div class="url-hint">Add <code>?role=facilitator</code> to see the full facilitator view.</div>
    </section>`;

  // Prefill start time to now + 2 min
  const setStartTime = (offsetMs) => {
    const dt = new Date(Date.now() + offsetMs);
    dt.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, '0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const startEl = document.getElementById('start-time-input');
    if (startEl) startEl.value = local;
  };
  setStartTime(2 * 60 * 1000);

  // Wire quick-set buttons
  document.querySelectorAll('[data-role="start-quick-set"]').forEach(btn => {
    btn.addEventListener('click', () => setStartTime(Number(btn.dataset.offsetMs)));
  });

  // Prefill invitation from structure; update learn-more link
  const structSelect = document.getElementById('structure-select');
  const invInput = document.getElementById('invitation-input');
  const learnMore = document.getElementById('learn-more-link');
  const structureDescription = document.querySelector('[data-role="structure-description"]');
  const updateStructureFields = () => {
    const s = STRUCTURES[structSelect.value];
    if (s) {
      if (invInput) invInput.value = s.invitation;
      if (structureDescription) structureDescription.textContent = s.description || '';
      if (learnMore) {
        learnMore.href = s.url || '#';
        learnMore.style.display = s.url ? '' : 'none';
      }
    }
  };
  if (structSelect) {
    structSelect.addEventListener('change', updateStructureFields);
    updateStructureFields();
  }

  const loadSampleBtn = document.getElementById('load-sample-btn');
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      updateStructureFields();
      setStartTime(2 * 60 * 1000);
      document.getElementById('participants-input').value = 'Alice\nBob\nCarol\nDave';
      document.getElementById('locations-input').value = 'Room A\nRoom B';
      document.getElementById('plenary-input').value = 'Main Hall';
    });
  }

  // Wire add-structure button
  document.getElementById('add-structure-btn')?.addEventListener('click', () => {
    const seq = document.getElementById('structure-sequence');
    // Insert a transition break row
    const breakRow = document.createElement('div');
    breakRow.className = 'structure-break-row';
    breakRow.innerHTML = `<label>Transition (minutes): <input type="number" class="break-duration-input" value="2" min="0" max="30" style="width:60px"></label>`;
    seq.appendChild(breakRow);
    // Insert new structure select
    const row = document.createElement('div');
    row.className = 'structure-row';
    row.innerHTML = `<select class="structure-select-item">${Object.keys(STRUCTURES).map(k => `<option value="${k}">${k}</option>`).join('')}</select> <button type="button" class="remove-structure-btn">✕</button>`;
    row.querySelector('.remove-structure-btn').addEventListener('click', () => { breakRow.remove(); row.remove(); });
    seq.appendChild(row);
  });

  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) generateBtn.addEventListener('click', generateURL);

  document.getElementById('copy-url-btn')?.addEventListener('click', () => {
    const url = document.getElementById('session-url-output').value;
    copyText(url, document.getElementById('copy-url-btn'));
  });
  document.getElementById('copy-prompt-btn').addEventListener('click', () => {
    const appURL = `${window.location.origin}${window.location.pathname}`;
    copyText(getLLMPrompt(appURL), document.getElementById('copy-prompt-btn'));
    const confirmEl = document.getElementById('copy-confirm');
    confirmEl.style.display = 'inline';
    setTimeout(() => confirmEl.style.display = 'none', 2000);
  });
  document.getElementById('cancel-preview-btn')?.addEventListener('click', () => {
    document.getElementById('preview-section').style.display = 'none';
  });

  if (new URLSearchParams(window.location.search).has('structure')) {
    try {
      const plan = quickPlanFromURL(window.location.href);
      const manualForm = document.querySelector('details.manual-form');
      manualForm.open = true;

      structSelect.value = plan.structures[0].key;
      updateStructureFields();
      for (const structure of plan.structures.slice(1)) {
        document.getElementById('add-structure-btn').click();
        const selects = document.querySelectorAll('.structure-select-item');
        selects[selects.length - 1].value = structure.key;
      }
      if (plan.invitation) invInput.value = plan.invitation;
      if (typeof plan.startTime === 'number') {
        const dt = new Date(plan.startTime * 1000);
        const pad = number => String(number).padStart(2, '0');
        document.getElementById('start-time-input').value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      }
      document.getElementById('participants-input').value = (plan.participants || []).join('\n');
      document.getElementById('locations-input').value = (plan.locations || []).join('\n');
      document.getElementById('plenary-input').value = plan.plenaryLocation || '';

      if (typeof plan.startTime === 'number' && plan.participants?.length) {
        showSessionPreview(compileQuickPlan(plan));
      }
    } catch (error) {
      const errorEl = document.getElementById('plan-error');
      errorEl.textContent = error.message;
      errorEl.style.display = '';
    }
  }
}

function generateURL() {
  const invitation = document.getElementById('invitation-input').value.trim() || 'What ideas do you recommend?';
  const startTimeVal = document.getElementById('start-time-input').value;
  const participantLines = document.getElementById('participants-input').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const locationLines = document.getElementById('locations-input').value.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const plenaryVal = document.getElementById('plenary-input').value.trim();

  if (!participantLines.length) { alert('Please enter at least one participant.'); return; }
  if (!startTimeVal) { alert('Please set a start time.'); return; }

  const startTime = Math.floor(new Date(startTimeVal).getTime() / 1000);
  const participants = participantLines.map((name, id) => ({ name, id }));

  // Build chained phases from sequencer
  const seqEl = document.getElementById('structure-sequence');
  const structPhases = [];
  const segments = [];
  let phaseOffset = 0;
  let globalPhaseIndex = 0;

  const children = Array.from(seqEl.children);
  for (let ci = 0; ci < children.length; ci++) {
    const child = children[ci];
    if (child.classList.contains('structure-row')) {
      const sel = child.querySelector('.structure-select-item');
      const structKey = sel ? sel.value : 'Unknown';
      const template = STRUCTURES[structKey] || STRUCTURES['1-2-4-All'];
      const segStart = globalPhaseIndex;
      for (const p of template.phases) {
        structPhases.push({ ...p, index: globalPhaseIndex, startOffset: phaseOffset });
        phaseOffset += p.duration;
        globalPhaseIndex++;
      }
      segments.push({ name: structKey, structureKey: structKey, phaseIndexStart: segStart, phaseIndexEnd: globalPhaseIndex - 1 });
    } else if (child.classList.contains('structure-break-row')) {
      const durInput = child.querySelector('.break-duration-input');
      const dur = Math.max(0, Number(durInput?.value || 2)) * 60;
      if (dur > 0) {
        structPhases.push({ index: globalPhaseIndex, name: 'Transition', duration: dur, startOffset: phaseOffset, groupSize: 0, transitionType: 'passing', instructions: 'Move to your next location.', inheritLocations: false });
        phaseOffset += dur;
        globalPhaseIndex++;
      }
    }
  }

  const structKey = document.getElementById('structure-select').value;
  const phases = structPhases.length > 0 ? structPhases : (STRUCTURES[structKey] || STRUCTURES['1-2-4-All']).phases.map(p => ({ ...p }));

  const locationPool = {
    locations: locationLines.map(l => {
      const isURL = l.startsWith('http');
      return { type: isURL ? 'url' : 'physical', label: isURL ? new URL(l).hostname : l, url: isURL ? l : null, instructions: null, override: false };
    }),
    strategy: 'round-robin'
  };

  const plenaryLocation = plenaryVal
    ? (plenaryVal.startsWith('http')
        ? { type: 'url', label: new URL(plenaryVal).hostname, url: plenaryVal, instructions: null, override: false }
        : { type: 'physical', label: plenaryVal, url: null, instructions: null, override: false })
    : { type: 'physical', label: 'Whole Group', url: null, instructions: null, override: false };

  const groups = assignGroups(participants, phases, locationPool);

  const session = {
    id: crypto.randomUUID().slice(0, 8),
    structure: structKey,
    invitation,
    startTime,
    participants,
    phases,
    groups,
    plenaryLocation,
    locationPool,
    ...(segments.length > 1 ? { segments } : {})
  };

  const encoded = encodeSession(session);
  const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
  document.getElementById('session-url-output').value = url;
  document.getElementById('result-section').style.display = '';
}

function showSessionPreview(session) {
  const preview = document.getElementById('preview-section');
  const startDate = new Date(session.startTime * 1000);
  preview.querySelector('[data-role="preview-structure"]').textContent = session.structure || '(custom)';
  preview.querySelector('[data-role="preview-starttime"]').textContent = startDate.toLocaleString();
  preview.querySelector('[data-role="preview-participants"]').textContent = session.participants.map(p => p.name).join(', ');
  preview.querySelector('[data-role="preview-phases"]').textContent = `${session.phases.length} phases`;

  // Full group/location detail per phase
  const groupsDiv = preview.querySelector('[data-role="preview-groups"]');
  if (groupsDiv && session.groups) {
    groupsDiv.innerHTML = session.phases.map(phase => {
      const groups = session.groups[phase.index] || [];
      const groupRows = groups.map(g =>
        `<div class="preview-group-row"><strong>${g.location?.label || '?'}</strong>: ${g.members.map(m => escHtml(m.name) + (m.role ? ` (${escHtml(m.role)})` : '')).join(', ')}</div>`
      ).join('');
      return `<div class="preview-phase-block"><div class="preview-phase-name">${escHtml(phase.name)}</div>${groupRows || '<em>No groups</em>'}</div>`;
    }).join('');
  }

  preview.style.display = '';
  document.getElementById('result-section').style.display = 'none';

  const confirmBtn = document.getElementById('confirm-url-btn');
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.addEventListener('click', () => {
    const encoded = encodeSession(session);
    const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
    document.getElementById('session-url-output').value = url;
    document.getElementById('result-section').style.display = '';
    preview.style.display = 'none';
  });
}

function copyText(text, btn) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

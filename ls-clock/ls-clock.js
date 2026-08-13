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

let participantPipWindow = null;

function getPhaseLocation(session, phase, group) {
  if (!phase) return null;
  if (phase.groupSize >= 999) return session.plenaryLocation || group?.location || null;
  return group?.location || null;
}

function getReusableSetupURL(session) {
  const structures = (session.segments?.length
    ? session.segments.map(segment => segment.structureKey)
    : String(session.structure || '').split('→').map(key => key.trim()))
    .filter(key => STRUCTURES[key])
    .map(key => ({ key }));
  const fishbowlSegment = session.segments?.find(segment => segment.structureKey === 'User Experience Fishbowl');
  const fishbowlUserNames = fishbowlSegment
    ? [...new Set(Array.from(
      { length: fishbowlSegment.phaseIndexEnd - fishbowlSegment.phaseIndexStart + 1 },
      (_, offset) => fishbowlSegment.phaseIndexStart + offset
    ).flatMap(phaseIndex => (session.groups?.[phaseIndex] || [])
      .flatMap(group => group.members.filter(member => member.role === 'User').map(member => member.name))))]
    : [];
  return quickPlanToURL({
    structures,
    invitation: session.invitation,
    participants: session.participants,
    locations: (session.locationPool?.locations || []).map(location => location.url || location.label),
    plenaryLocation: session.plenaryLocation?.url || session.plenaryLocation?.label,
    transitionTiming: session.transitionTiming,
    fishbowlUserNames,
  }, `${window.location.origin}${window.location.pathname}`);
}

function updateMainRoomLink(session = null) {
  document.querySelector('[data-role="main-room-fallback"]')?.remove();
  document.querySelector('[data-role="reuse-settings-link"]')?.remove();
  const navigation = document.querySelector('[data-role="global-navigation"]');
  const startNew = navigation?.querySelector('.start-new-session');
  if (session && startNew) {
    const reuse = document.createElement('a');
    reuse.dataset.role = 'reuse-settings-link';
    reuse.textContent = 'Reuse these settings';
    reuse.href = getReusableSetupURL(session);
    startNew.insertAdjacentElement('afterend', reuse);
  }
  if (!session?.plenaryLocation?.url) return;
  const link = document.createElement('a');
  link.dataset.role = 'main-room-fallback';
  link.href = session.plenaryLocation.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Main room';
  navigation?.appendChild(link);
}

function getParticipantAssignment(session, phase, participantName) {
  if (!phase) return { phase: null, group: null, location: null };
  const group = getParticipantGroup(session, phase.index, participantName);
  return { phase, group, location: getPhaseLocation(session, phase, group) };
}

function getCompanionState(session, participantName, nowMs) {
  const activePhase = getActivePhase(session, nowMs);
  const beforeStart = nowMs / 1000 < session.startTime;
  const currentPhase = activePhase || (beforeStart ? session.phases.find(phase => phase.groupSize > 0) : null);
  if (!currentPhase) return null;
  const phasePosition = session.phases.findIndex(phase => phase.index === currentPhase.index);
  const nextPhase = activePhase
    ? session.phases.slice(phasePosition + 1).find(phase => phase.groupSize > 0)
    : currentPhase;
  const current = getParticipantAssignment(session, currentPhase, participantName);
  const next = getParticipantAssignment(session, nextPhase, participantName);
  const remaining = beforeStart
    ? Math.max(0, Math.ceil(session.startTime - nowMs / 1000))
    : Math.max(0, Math.round(session.startTime + currentPhase.startOffset + currentPhase.duration - nowMs / 1000));
  const sameLocation = Boolean(current.location && next.location
    && (current.location.url || current.location.label) === (next.location.url || next.location.label));
  return { beforeStart, current, next, remaining, sameLocation };
}

function updateParticipantCompanion(session, participantName, nowMs) {
  const state = getCompanionState(session, participantName, nowMs);
  if (!state) {
    document.title = 'LS Clock';
    return;
  }
  const time = formatTime(state.remaining);
  const title = state.beforeStart ? 'Starts in' : state.current.phase.name;
  document.title = `${time} · ${title} · LS Clock`;
  if (participantPipWindow && !participantPipWindow.closed) {
    const { phase, group, location } = state.next;
    const members = group?.members?.map(member => formatMemberLabel(member, participantName)).join(', ') || '';
    const destination = location?.url
      ? `<a href="${escHtml(location.url)}" target="_blank" rel="noopener" style="display:block;background:#6c8ef5;color:#fff;border-radius:10px;padding:8px 10px;text-decoration:none;font-weight:700;overflow-wrap:anywhere">Open ${escHtml(location.label)}</a>`
      : `<div style="color:#dbe2ff;font-weight:700">${escHtml(location?.label || 'Location to be announced')}</div>`;
    const movementGuidance = state.beforeStart ? '' : state.next.phase.groupSize === 1
      ? '<div style="background:#283047;color:#dbe2ff;border-radius:8px;font-weight:800;margin:8px 0;padding:8px 10px">Work individually</div>'
      : state.sameLocation
        ? '<div style="background:#173c2a;color:#b7f7cb;border:1px solid #22c55e;border-radius:8px;font-weight:800;margin:8px 0;padding:8px 10px">Stay where you are</div>'
        : `<div style="background:#283047;color:#dbe2ff;border-radius:8px;font-weight:800;margin:8px 0;padding:8px 10px">Move to ${escHtml(location?.label || 'your next location')}</div>`;
    const pipDocument = participantPipWindow.document;
    pipDocument.title = 'LS Clock';
    pipDocument.body.innerHTML = `<main style="font-family:system-ui,sans-serif;background:#0f1117;color:#e8eaf6;min-height:100vh;margin:0;padding:20px;box-sizing:border-box">
      <div style="color:#aab2dc;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">LS Clock</div>
      <div style="font-size:40px;font-weight:800;font-variant-numeric:tabular-nums;margin:8px 0">${state.beforeStart ? 'Starts in ' : ''}${escHtml(time)}</div>
      ${state.beforeStart ? '' : `<section style="border-bottom:1px solid #30364d;margin-bottom:8px;padding-bottom:8px">
        <strong style="font-size:17px">Now · ${escHtml(state.current.phase.name)}</strong>
        <p style="color:#dbe2ff;line-height:1.3;margin:.3rem 0 0">${escHtml(state.current.phase.instructions || '')}</p>
      </section>`}
      ${movementGuidance}
      <strong style="font-size:18px">${state.beforeStart ? '' : 'Up next · '}${escHtml(phase.name)}</strong>
      <p style="color:#aab2dc;line-height:1.4;margin:.55rem 0">${escHtml(phase.instructions || '')}</p>
      ${destination}
      ${members ? `<p style="color:#dbe2ff;line-height:1.4"><strong>With:</strong> ${escHtml(members)}</p>` : ''}
    </main>`;
  }
}

function buildProcessOrientation(session, phase) {
  const activities = session.phases.filter(candidate => candidate.groupSize > 0);
  const target = phase?.groupSize > 0
    ? phase
    : session.phases.slice(session.phases.findIndex(candidate => candidate.index === phase?.index) + 1).find(candidate => candidate.groupSize > 0)
      || activities[0];
  const step = Math.max(1, activities.findIndex(candidate => candidate.index === target?.index) + 1);
  const orientation = document.createElement('div');
  orientation.className = 'process-orientation';
  orientation.innerHTML = `<span>Step ${step} of ${activities.length}</span><strong>${escHtml(target?.name || 'Session complete')}</strong>`;
  return orientation;
}

function appendLocationLink(container, location, prefix = '') {
  if (!location) return;
  if (location.url) {
    const link = document.createElement('a');
    link.href = location.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${prefix}${location.label}`;
    container.appendChild(link);
  } else {
    container.append(`${prefix}${location.label}`);
  }
}

function renderParticipantView(container, session, participantName, nowMs, notesSection = null) {
  const phase = getActivePhase(session, nowMs);
  const overviewWasOpen = Boolean(container.querySelector('[data-role="overview"]')?.open);
  container.innerHTML = '';

  if (!phase) {
    const elapsed = nowMs / 1000 - session.startTime;
    const msg = document.createElement('div');
    msg.className = 'status-message';
    if (elapsed < 0) {
      const start = new Date(session.startTime * 1000);
      const firstPhase = session.phases.find(candidate => candidate.groupSize > 0);
      const assignment = getParticipantAssignment(session, firstPhase, participantName);
      const members = assignment.group?.members?.map(member => formatMemberLabel(member, participantName)).join(', ') || '';
      msg.dataset.role = 'waiting-guidance';
      msg.innerHTML = `<div>You’re in the right place. Session starts at ${escHtml(start.toLocaleString())}</div>
        <div class="countdown">Starts in ${formatTime(Math.ceil(-elapsed))}</div>
        <strong>${escHtml(firstPhase?.name || 'First activity')}</strong>
        <div>${escHtml(assignment.location?.label || 'Location to be announced')}</div>
        ${members ? `<div>With: ${escHtml(members)}</div>` : ''}`;
    } else {
      msg.textContent = 'Session complete. Thank you!';
    }
    container.appendChild(msg);
    if (notesSection) container.appendChild(notesSection);
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
      const phasePosition = session.phases.findIndex(candidate => candidate.index === phase.index);
      const priorPhase = [...session.phases.slice(0, phasePosition)].reverse().find(candidate => candidate.groupSize > 0);
      const nextPhase = session.phases.slice(phasePosition + 1).find(candidate => candidate.groupSize > 0);
      const priorGroup = priorPhase ? getParticipantGroup(session, priorPhase.index, participantName) : null;
      const nextGroup = nextPhase ? getParticipantGroup(session, nextPhase.index, participantName) : null;
      const priorLocation = getPhaseLocation(session, priorPhase, priorGroup);
      const nextLocation = getPhaseLocation(session, nextPhase, nextGroup);
      const sameLocation = Boolean(priorLocation && nextLocation
        && (priorLocation.url || priorLocation.label) === (nextLocation.url || nextLocation.label));
      if (nextPhase) {
        const actionEl = document.createElement('div');
        actionEl.setAttribute('data-role', 'transition-action');
        actionEl.className = `transition-action ${sameLocation ? 'transition-stay' : 'transition-move'}`;
        actionEl.textContent = sameLocation ? 'Stay in this room' : `Move to ${nextLocation?.label || 'your next location'}`;
        breakEl.appendChild(actionEl);
        const nextStepEl = document.createElement('div');
        nextStepEl.setAttribute('data-role', 'next-step');
        nextStepEl.textContent = `Next: ${nextPhase.name}`;
        breakEl.appendChild(nextStepEl);
        if (nextGroup?.members?.length) {
          const nextGroupEl = document.createElement('div');
          nextGroupEl.setAttribute('data-role', 'next-group');
          nextGroupEl.textContent = `With: ${nextGroup.members.map(member => formatMemberLabel(member, participantName)).join(', ')}`;
          breakEl.appendChild(nextGroupEl);
        }
        if (nextLocation) {
          const nextLocEl = document.createElement('div');
          nextLocEl.setAttribute('data-role', 'next-location');
          nextLocEl.className = 'next-location';
          if (nextLocation.url) {
            const link = document.createElement('a');
            link.href = nextLocation.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = `Join ${nextLocation.label}`;
            nextLocEl.appendChild(link);
          } else {
            nextLocEl.textContent = nextLocation.label;
          }
          breakEl.appendChild(nextLocEl);
        }
      }
    }
    const breakTitle = document.createElement('div');
    breakTitle.className = 'break-title';
    breakTitle.textContent = isPassing ? 'Passing time' : 'Short break';
    const phaseEndSec = session.startTime + phase.startOffset + phase.duration;
    const remainSec = Math.max(0, Math.round(phaseEndSec - nowMs / 1000));
    const countdownEl = document.createElement('div');
    countdownEl.setAttribute('data-role', 'countdown');
    countdownEl.className = `countdown countdown-${getCountdownClass(remainSec)}`;
    countdownEl.textContent = formatTime(remainSec);
    const instrEl = document.createElement('section');
    instrEl.className = 'phase-instructions current-task';
    instrEl.setAttribute('aria-label', 'Current task');
    instrEl.innerHTML = `<span data-role="current-task-label" class="current-task-label">Current task</span><p></p>`;
    instrEl.querySelector('p').textContent = isPassing && breakEl.querySelector('.transition-stay')
      ? 'Keep this room open. Your next step will begin here.'
      : phase.instructions;
    breakEl.appendChild(breakTitle);
    breakEl.appendChild(countdownEl);
    breakEl.appendChild(instrEl);
    container.appendChild(breakEl);
    if (notesSection) container.appendChild(notesSection);

    // Overview panel
    container.appendChild(buildOverviewPanel(session, phase, overviewWasOpen));
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
    const hasRoles = group.members.some(member => member.role);
    if (group.members.length === 1 && !hasRoles) {
      membersEl.textContent = 'Working individually';
    } else {
      membersEl.textContent = 'Group: ' + group.members.map(member => {
        return formatMemberLabel(member, participantName);
      }).join(', ');
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
  const instrEl = document.createElement('section');
  instrEl.setAttribute('data-role', 'instructions');
  instrEl.className = 'phase-instructions current-task';
  instrEl.setAttribute('aria-label', 'Current task');
  instrEl.innerHTML = `<span data-role="current-task-label" class="current-task-label">Current task</span><p>${escHtml(phase.instructions)}</p>`;
  container.appendChild(instrEl);
  if (notesSection) container.appendChild(notesSection);

  // 5. Preview the next activity assignment
  const phasePosition = session.phases.findIndex(candidate => candidate.index === phase.index);
  const nextPhase = session.phases.slice(phasePosition + 1).find(candidate => candidate.groupSize > 0);
  if (nextPhase) {
    const nextGroup = getParticipantGroup(session, nextPhase.index, participantName);
    const currentLocation = group?.location;
    const nextLocation = nextGroup?.location || (nextPhase.groupSize >= 999 ? session.plenaryLocation : null);
    const sameLocation = Boolean(currentLocation && nextLocation
      && (currentLocation.url || currentLocation.label) === (nextLocation.url || nextLocation.label));
    const sameMembers = Boolean(group && nextGroup
      && group.members.map(member => member.id).sort().join(',') === nextGroup.members.map(member => member.id).sort().join(','));
    const startsIn = Math.max(0, Math.round(session.startTime + nextPhase.startOffset - nowMs / 1000));

    const preview = document.createElement('section');
    preview.setAttribute('data-role', 'up-next');
    preview.className = 'up-next';
    preview.setAttribute('aria-label', 'Up next');
    preview.innerHTML = `<div class="up-next-heading">
      <span class="up-next-kicker">Up next</span>
      <strong>${escHtml(nextPhase.name)}</strong>
      <span>Starts in ${formatTime(startsIn)}</span>
    </div>`;

    const movement = document.createElement('div');
    movement.setAttribute('data-role', 'up-next-movement');
    movement.className = 'up-next-movement';
    if (nextPhase.groupSize === 1) movement.textContent = 'Work individually';
    else if (sameLocation && sameMembers) movement.textContent = 'Stay with this group in the same place';
    else if (sameLocation) movement.textContent = 'Stay here; your group will change';
    else movement.textContent = `Move to ${nextLocation?.label || 'the next location'}`;
    preview.appendChild(movement);

    if (nextGroup?.members?.length) {
      const nextMembers = document.createElement('div');
      nextMembers.setAttribute('data-role', 'up-next-group');
      nextMembers.className = 'up-next-detail';
      nextMembers.textContent = 'With: ' + nextGroup.members.map(member => formatMemberLabel(member, participantName)).join(', ');
      preview.appendChild(nextMembers);
    }
    if (nextLocation && nextPhase.groupSize !== 1) {
      const nextLocationEl = document.createElement('div');
      nextLocationEl.setAttribute('data-role', 'up-next-location');
      nextLocationEl.className = 'up-next-detail';
      if (nextLocation.url) {
        const link = document.createElement('a');
        link.href = nextLocation.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `Join ${nextLocation.label}`;
        nextLocationEl.appendChild(link);
      } else {
        nextLocationEl.textContent = 'Location: ' + nextLocation.label;
      }
      preview.appendChild(nextLocationEl);
    }
    container.appendChild(preview);
  }

  // 6. Overview panel (expandable)
  container.appendChild(buildOverviewPanel(session, phase, overviewWasOpen));

}

function buildOverviewPanel(session, activePhase, open = false) {
  const wrapper = document.createElement('details');
  wrapper.setAttribute('data-role', 'overview');
  wrapper.className = 'overview-panel';
  wrapper.open = open;
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

  const mapDiv = document.createElement('div');
  mapDiv.setAttribute('data-role', 'overview-map');
  mapDiv.className = 'overview-map';
  const mapTitle = document.createElement('div');
  mapTitle.className = 'overview-map-title';
  mapDiv.appendChild(mapTitle);

  if (activePhase.groupSize === 0) {
    const phasePosition = session.phases.findIndex(candidate => candidate.index === activePhase.index);
    const priorPhase = [...session.phases.slice(0, phasePosition)].reverse().find(candidate => candidate.groupSize > 0);
    const nextPhase = session.phases.slice(phasePosition + 1).find(candidate => candidate.groupSize > 0);
    const priorGroups = priorPhase ? (session.groups[priorPhase.index] || []) : [];
    const nextGroups = nextPhase ? (session.groups[nextPhase.index] || []) : [];
    mapTitle.textContent = 'Assigned movement';
    for (const nextGroup of nextGroups) {
      const row = document.createElement('div');
      row.className = 'overview-map-row overview-movement-row';
      const members = nextGroup.members.map(member => formatMemberLabel(member)).join(', ');
      const priorLocations = [...new Map(nextGroup.members.map(member => {
        const priorGroup = priorGroups.find(group => group.members.some(candidate => candidate.id === member.id));
        const location = getPhaseLocation(session, priorPhase, priorGroup);
        return [location?.url || location?.label, location];
      }).filter(([key]) => key)).values()];
      const nextLocation = getPhaseLocation(session, nextPhase, nextGroup);
      const people = document.createElement('strong');
      people.textContent = members;
      row.appendChild(people);
      const route = document.createElement('div');
      route.className = 'overview-movement-route';
      if (priorLocations.length) {
        priorLocations.forEach((location, index) => {
          if (index) route.append(', ');
          appendLocationLink(route, location);
        });
      } else route.append('Previous assignment unavailable');
      route.append(' → ');
      appendLocationLink(route, nextLocation || { label: 'Next assignment pending' });
      row.appendChild(route);
      mapDiv.appendChild(row);
    }
  } else {
    mapTitle.textContent = 'Current assignments';
    for (const group of session.groups?.[activePhase.index] || []) {
      const row = document.createElement('div');
      row.className = 'overview-map-row';
      const location = getPhaseLocation(session, activePhase, group);
      appendLocationLink(row, location || { label: 'Location pending' });
      row.append(`: ${group.members.map(member => formatMemberLabel(member)).join(', ')}`);
      mapDiv.appendChild(row);
    }
  }
  wrapper.appendChild(mapDiv);

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
  updateMainRoomLink(session);
  const params = new URLSearchParams(window.location.search);
  const prefilledName = params.get('name') || '';
  const isFacilitator = params.get('role') === 'facilitator';

  if (isFacilitator) {
    renderFacilitatorView(app, session);
    return;
  }

  const sessionEnd = session.startTime + Math.max(...session.phases.map(phase => phase.startOffset + phase.duration));
  if (Date.now() / 1000 >= sessionEnd) {
    app.innerHTML = `<main class="join-screen" data-role="participant-landing">
      <div class="join-brand">
        <div class="product-eyebrow">Live timing and guidance for Liberating Structures.</div>
        <h1 class="app-title">LS Clock</h1>
        <p class="product-tagline">One shared clock. Every group in sync.</p>
      </div>
      <section class="session-hero status-message" data-role="session-complete">
        <h2>Session complete. Thank you!</h2>
        <p>This session has ended, so it can no longer be joined.</p>
      </section>
    </main>`;
    return;
  }

  // Participant landing screen
  app.innerHTML = `
    <main class="join-screen" data-role="participant-landing">
      <div class="join-brand">
        <div class="product-eyebrow">Live timing and guidance for Liberating Structures.</div>
        <h1 class="app-title">LS Clock</h1>
        <p class="product-tagline">One shared clock. Every group in sync.</p>
      </div>
      <section class="session-hero" aria-labelledby="session-title">
        <div class="session-kicker">You’re joining</div>
        <h2 id="session-title" class="session-title">${escHtml(session.structure || 'Liberating Structures session')}</h2>
        <div class="invitation-card">
          <div class="session-label">Invitation</div>
          <p>${escHtml(session.invitation)}</p>
        </div>
        <div class="session-start-guidance" data-role="session-start-guidance"></div>
        <details class="landing-session-details" data-role="landing-session-details">
          <summary>View full session</summary>
          <div class="landing-phase-list">
            ${session.phases.map(phase => `
              <div class="landing-phase" data-role="landing-phase">
                <div class="landing-phase-heading">
                  <strong>${escHtml(phase.name)}</strong>
                  <span>${Math.round(phase.duration / 60)} min</span>
                </div>
                <p>${escHtml(phase.instructions || '')}</p>
                <div class="landing-group-list">
                  ${(session.groups[phase.index] || []).map((group, groupIndex) => `
                    <div class="landing-group">
                      <strong>Group ${groupIndex + 1}</strong>
                      <span>${group.members.map(member => escHtml(formatMemberLabel(member))).join(', ')}</span>
                      <span class="landing-group-location">${escHtml(group.location?.label || 'Location to be announced')}</span>
                    </div>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </details>
      </section>
      <div class="join-form prepared-join">
        <h2>Find your name</h2>
        <p class="join-help">Choose your name to keep the group assignments your facilitator prepared.</p>
        <label for="name-input">Participant name</label>
        <select id="name-input" data-role="prepared-name" autocomplete="name">
          <option value="">Choose your name</option>
          ${session.participants.map(p => `<option value="${escHtml(p.name)}" ${p.name === prefilledName ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
        </select>
        <button id="join-btn" class="primary-btn">Join session</button>
        <div class="join-error" data-role="prepared-error" role="status" aria-live="polite"></div>
      </div>
      <details class="late-arrival" data-role="late-arrival">
        <summary>Joining late or not listed?</summary>
        <div class="late-arrival-form">
          <p class="join-help">Enter your name and LS Clock will place you in a group on this device.</p>
          <label for="late-name-input">Your name</label>
          <input id="late-name-input" type="text" autocomplete="name">
          <button id="late-join-btn">Join as late arrival</button>
          <div class="join-error" id="late-join-error" role="status" aria-live="polite"></div>
        </div>
      </details>
      <div class="facilitator-entry">
        <span>Facilitating this session?</span>
        <a data-role="facilitator-link" href="?role=facilitator#${escHtml(window.location.hash.slice(1))}">Open facilitator view</a>
      </div>
    </main>`;

  const input = document.getElementById('name-input');
  const btn = document.getElementById('join-btn');
  const preparedError = document.querySelector('[data-role="prepared-error"]');
  const lateInput = document.getElementById('late-name-input');
  const lateBtn = document.getElementById('late-join-btn');
  const lateError = document.getElementById('late-join-error');
  const startGuidance = document.querySelector('[data-role="session-start-guidance"]');

  const updateStartGuidance = () => {
    const start = new Date(session.startTime * 1000);
    const remaining = Math.ceil(session.startTime - Date.now() / 1000);
    startGuidance.textContent = remaining > 0
      ? `Starts at ${start.toLocaleString()} · Starts in ${formatTime(remaining)}`
      : 'Session in progress';
  };
  updateStartGuidance();
  if (session.startTime > Date.now() / 1000) setInterval(updateStartGuidance, 1000);

  const tryJoin = () => {
    const name = input.value.trim();
    if (!name) {
      preparedError.textContent = 'Choose your name to join.';
      input.focus();
      return;
    }
    preparedError.textContent = '';
    startParticipantClock(app, session, name);
  };

  const joinLate = () => {
    const name = lateInput.value.trim();
    if (!name) {
      lateError.textContent = 'Enter your name to join.';
      lateInput.focus();
      return;
    }
    if (session.participants.some(participant => participant.name.trim().toLowerCase() === name.toLowerCase())) {
      lateError.textContent = 'That name is on the prepared list. Choose it above.';
      return;
    }

    const lateSession = JSON.parse(JSON.stringify(session));
    const lateId = session.participants.length;
    lateSession.participants = [...session.participants, { name, id: lateId }];
    for (const phase of lateSession.phases) {
      const groups = lateSession.groups[phase.index];
      if (!groups?.length) continue;
      const smallestSize = Math.min(...groups.map(group => group.members.length));
      const smallestGroups = groups.filter(group => group.members.length === smallestSize);
      const targetGroup = smallestGroups[Math.floor(Math.random() * smallestGroups.length)];
      targetGroup.members = [...targetGroup.members, { name, id: lateId }];
    }
    startParticipantClock(app, lateSession, name);
  };

  btn.addEventListener('click', tryJoin);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') tryJoin(); });
  lateBtn.addEventListener('click', joinLate);
  lateInput.addEventListener('keydown', event => { if (event.key === 'Enter') joinLate(); });
  if (prefilledName && session.participants.some(participant => participant.name === prefilledName)) tryJoin();
}

function startParticipantClock(app, session, participantName) {
  updateMainRoomLink(session);
  const view = document.createElement('div');
  view.className = 'participant-view';

  const companionControls = document.createElement('div');
  companionControls.setAttribute('data-role', 'companion-controls');
  companionControls.className = 'companion-controls';

  if ('documentPictureInPicture' in window) {
    const pipButton = document.createElement('button');
    pipButton.type = 'button';
    pipButton.textContent = 'Open floating timer';
    const markCompanionClosed = () => {
      participantPipWindow = null;
      pipButton.textContent = 'Open floating timer';
    };
    const toggleCompanionWindow = async () => {
      if (participantPipWindow && !participantPipWindow.closed) {
        participantPipWindow.close();
        markCompanionClosed();
        return;
      }
      try {
        participantPipWindow = await window.documentPictureInPicture.requestWindow({ width: 320, height: 280 });
        participantPipWindow.addEventListener('pagehide', markCompanionClosed, { once: true });
        if (window.documentPictureInPicture && !window.documentPictureInPicture.window) {
          try { window.documentPictureInPicture.window = participantPipWindow; } catch (_) {}
        }
        pipButton.textContent = 'Close floating timer';
        updateParticipantCompanion(session, participantName, Date.now());
      } catch (_) { markCompanionClosed(); }
    };
    pipButton.addEventListener('click', toggleCompanionWindow);
    companionControls.appendChild(pipButton);
  }

  const orientation = document.createElement('section');
  orientation.dataset.role = 'process-orientation';
  orientation.className = 'process-orientation-shell';
  const orientationSummary = document.createElement('div');
  orientationSummary.className = 'process-orientation-summary';
  const timeline = document.createElement('div');
  timeline.className = 'timeline-strip';
  orientation.appendChild(orientationSummary);
  orientation.appendChild(timeline);

  const invitationEl = document.createElement('div');
  invitationEl.className = 'invitation-footer';
  invitationEl.textContent = session.invitation;

  const notesSection = document.createElement('section');
  notesSection.dataset.role = 'notes';
  notesSection.className = 'notes-section';
  const notesLabel = document.createElement('label');
  notesLabel.className = 'notes-label';
  notesLabel.textContent = 'Your notes';

  const notesEl = document.createElement('textarea');
  notesEl.className = 'notes-area';
  notesEl.placeholder = 'Write your thoughts here…';
  const sessionNoteKey = getNoteKey(session.id, 'session', participantName);
  notesEl.value = localStorage.getItem(sessionNoteKey) || '';
  const copyBtn = document.createElement('button');
  copyBtn.setAttribute('data-role', 'copy-notes');
  copyBtn.className = 'copy-notes-btn';
  copyBtn.textContent = 'Copy my notes';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(notesEl.value).catch(() => {});
  });
  notesSection.appendChild(notesLabel);
  notesSection.appendChild(notesEl);
  notesSection.appendChild(copyBtn);

  app.innerHTML = '';
  app.appendChild(companionControls);
  app.appendChild(orientation);
  app.appendChild(view);
  app.appendChild(invitationEl);

  let lastPhaseIndex = Date.now() / 1000 < session.startTime ? 'before-start' : null;
  let alertsEnabled = false;
  let audioContext = null;

  const playTransitionCue = () => {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audioContext ||= new Context();
      audioContext.resume?.().catch(() => {});
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.18, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);
    } catch (_) {}
  };

  const armAlerts = () => {
    if (alertsEnabled) return;
    alertsEnabled = true;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) audioContext ||= new Context();
      audioContext?.resume?.().catch(() => {});
    } catch (_) {}
  };
  app.addEventListener('pointerdown', armAlerts, { once: true });
  app.addEventListener('keydown', armAlerts, { once: true });

  const tick = () => {
    const now = Date.now();
    const phase = getActivePhase(session, now);
    const phaseIndex = phase ? phase.index : (now / 1000 < session.startTime ? 'before-start' : null);

    if (phaseIndex !== lastPhaseIndex) {
      if (lastPhaseIndex !== null && alertsEnabled) playTransitionCue();
      lastPhaseIndex = phaseIndex;

      // Flash location block on phase transition
      view.classList.remove('phase-transition');
      void view.offsetWidth;
      view.classList.add('phase-transition');
    }

    const orientationPhase = phase || session.phases.find(candidate => candidate.groupSize > 0);
    orientationSummary.replaceChildren(buildProcessOrientation(session, orientationPhase));
    renderParticipantView(view, session, participantName, now, notesSection);
    renderPhaseTimeline(timeline, session, now);
    updateParticipantCompanion(session, participantName, now);
  };

  notesEl.addEventListener('input', () => {
    localStorage.setItem(sessionNoteKey, notesEl.value);
  });

  tick();
  setInterval(tick, 1000);
}

function renderFacilitatorView(app, session) {
  updateMainRoomLink(session);
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
          <div class="fac-members">${group.members.map(member => escHtml(formatMemberLabel(member))).join(', ')}</div>
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

function startSetupWalkthrough() {
  const createDriver = window.driver?.js?.driver;
  if (typeof createDriver !== 'function') return;

  const demoSession = compileQuickPlan({
    structures: [{ key: '1-2-4-All' }],
    invitation: 'What ideas or actions do you recommend?',
    startTime: Math.floor(Date.now() / 1000) - 250,
    participants: ['Alice', 'Bob', 'Carol', 'Dave'],
    locations: ['Room A', 'Room B'],
    plenaryLocation: 'Main Hall',
  });
  let walkthrough;
  const steps = [
    {
      element: '[data-role="clock-explanation"]',
      popover: { title: 'One shared clock', description: 'A facilitator shares one session link. From there, the most important experience belongs to each participant.' },
    },
  ];

  const roleAssignment = document.querySelector('[data-role="fishbowl-role-assignment"]');
  if (roleAssignment && !roleAssignment.hidden) {
    steps.push({
      element: '[data-role="fishbowl-role-assignment"]',
      popover: { title: 'Assign roles intentionally', description: 'For User Experience Fishbowl, choose the 3–7 experienced participants who belong in the inner circle.' },
    });
  }

  steps.push(
    {
      element: '#generate-btn',
      popover: {
        title: 'Copy and share',
        description: 'Create and copy one bookmarkable session URL to share. Next, see exactly what a participant sees.',
        onNextClick: () => {
          renderJoinOrView(demoSession);
          requestAnimationFrame(() => walkthrough.moveNext());
        },
      },
    },
    {
      element: '[data-role="participant-landing"]',
      popover: { title: 'Participant landing', description: 'Before joining, participants see the shared start, invitation, countdown, and full session context.' },
    },
    {
      element: '#join-btn',
      popover: {
        title: 'Join your session',
        description: 'Prepared participants choose their name so the facilitator’s groups and roles stay authoritative.',
        onNextClick: () => {
          const nameInput = document.getElementById('name-input');
          if (nameInput) nameInput.value = 'Alice';
          document.getElementById('join-btn')?.click();
          requestAnimationFrame(() => walkthrough.moveNext());
        },
      },
    },
    {
      element: '[data-role="location"]',
      popover: { title: 'Follow the current step', description: 'The live view emphasizes where to go, who is in the group, assigned roles, remaining time, and the activity instructions.' },
    },
    {
      element: '[data-role="overview"]',
      popover: { title: 'See the whole session', description: 'Participants can expand the overview to understand the sequence and see where every group is now.' },
    },
    {
      element: '[data-role="global-navigation"]',
      popover: { title: 'Navigate anytime', description: 'Return Home or start a clean session from any primary view.' },
    },
  );

  walkthrough = createDriver({
    steps,
    showProgress: true,
    allowClose: true,
    allowKeyboardControl: true,
    overlayClickBehavior: 'close',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'ls-clock-tour',
    onDestroyStarted: () => {
      walkthrough.destroy();
      renderSetupPage();
    },
  });
  walkthrough.drive();
}

function renderSetupPage() {
  updateMainRoomLink();
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1 class="app-title">LS Clock</h1>
    <div class="product-intro" data-role="product-intro">
      <p class="product-eyebrow">Live timing and guidance for Liberating Structures.</p>
      <p class="product-tagline">One shared clock. Every group in sync.</p>
      <aside class="clock-explanation" data-role="clock-explanation">
        <h2>Why a clock?</h2>
        <p>LS Clock needs no coordination server. Everyone receives the same session start time, and each device’s ordinary clock uses it to calculate the current step. We already rely on clocks to meet at the same time in the real world—LS Clock simply uses what is already there.</p>
        <button type="button" id="start-walkthrough-btn" data-role="start-walkthrough">Take a walkthrough</button>
      </aside>
    </div>

    <section class="setup-section manual-form">
      <h2>Set up your session</h2>
      <button type="button" id="load-sample-btn">Load sample setup</button>

      <section class="setup-section llm-section" aria-label="AI-assisted planning">
        <div class="llm-shortcut-row">
          <strong>Want help planning?</strong>
          <button type="button" id="copy-prompt-btn">Copy AI planning prompt</button>
          <button type="button" id="llm-toggle-btn" data-role="llm-toggle" aria-expanded="false" aria-controls="llm-planning-panel">How it works</button>
        </div>
        <div id="llm-planning-panel" class="assistant-content" hidden>
          <p data-role="llm-help">Paste the copied prompt into an LLM, answer its questions, then review the setup link it creates. LS Clock sends nothing automatically.</p>
          <details class="google-troubleshooting" data-role="google-troubleshooting">
            <summary>Having trouble opening the link?</summary>
            <p data-role="google-redirect-tip">Google may say a generated URL is invalid even when it works. Copy and paste the complete URL directly into your browser’s address bar instead.</p>
          </details>
          <div id="plan-error" class="error-msg" style="display:none"></div>
        </div>
        <div id="copy-confirm" class="copy-confirm" role="status" aria-live="polite" style="display:none">Copied!</div>
      </section>

      <section class="setup-section">
        <h2>1. Choose a structure</h2>
        <div id="structure-sequence">
          <div class="structure-row">
            <select id="structure-select" class="structure-select-item">
              ${Object.keys(STRUCTURES).map(k => `<option value="${k}">${k}</option>`).join('')}
            </select>
            <a id="learn-more-link" data-role="learn-more" href="#" target="_blank" rel="noopener" style="display:none">Learn more →</a>
            <p data-role="structure-description"></p>
          </div>
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

      <section class="setup-section" data-role="participants-setup">
        <h2>4. Participants (one per line)</h2>
        <textarea id="participants-input" rows="6" placeholder="Alice&#10;Bob&#10;Carol&#10;Dave"></textarea>
      </section>

      <section class="setup-section fishbowl-role-section" data-role="fishbowl-role-assignment" hidden>
        <h2>4a. Choose the Fishbowl inner circle</h2>
        <p class="hint">Select 3–7 participants with direct experience who represent the roles and functions that must coordinate for success.</p>
        <div class="fishbowl-role-options" data-role="fishbowl-role-options"></div>
        <p class="fishbowl-selection-count" data-role="fishbowl-selection-count" aria-live="polite">0 selected</p>
      </section>

      <section class="setup-section" data-role="meeting-spaces">
        <h2>5. Meeting locations (one per line — paste URLs or room names)</h2>
        <p class="hint">Verify in advance that every participant can enter each breakout URL without the host.</p>
        <textarea id="locations-input" rows="4" placeholder="https://meet.google.com/abc-defg&#10;https://meet.google.com/hij-klmn&#10;Conference Room A"></textarea>
      </section>

      <section class="setup-section">
        <h2>6. Plenary / whole-group location</h2>
        <input id="plenary-input" type="text" placeholder="https://zoom.us/j/main or Main Hall" class="wide-input">
      </section>

      <section class="setup-section" data-role="timing-settings">
        <h2>7. Between-step timing</h2>
        <p class="hint">Use passing time when groups reorganize or move. Use the short break when everyone stays together in the same space.</p>
        <div class="timing-settings">
          <label>Passing time (minutes)
            <input id="passing-time-input" type="number" value="1" min="0" max="30" step="0.5">
          </label>
          <label>Short break (minutes)
            <input id="short-break-input" type="number" value="0.5" min="0" max="10" step="0.5">
          </label>
        </div>
      </section>

      <div class="error-msg" data-role="setup-error" role="alert" aria-live="assertive" tabindex="-1"></div>
      <button id="generate-btn" class="primary-btn">Copy session URL</button>
    </section>

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
      <div class="url-hint">Copied. Share this URL with participants. They enter their name to join.</div>
      <div class="url-hint">Add <code>?role=facilitator</code> to see the full facilitator view.</div>
    </section>`;

  document.getElementById('start-walkthrough-btn')?.addEventListener('click', startSetupWalkthrough);
  const llmToggle = document.querySelector('[data-role="llm-toggle"]');
  const llmPanel = document.getElementById('llm-planning-panel');
  llmToggle?.addEventListener('click', () => {
    const expanded = llmToggle.getAttribute('aria-expanded') === 'true';
    llmToggle.setAttribute('aria-expanded', String(!expanded));
    llmPanel.hidden = expanded;
  });

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
  const participantsInput = document.getElementById('participants-input');
  const fishbowlRoleSection = document.querySelector('[data-role="fishbowl-role-assignment"]');
  const fishbowlRoleOptions = document.querySelector('[data-role="fishbowl-role-options"]');
  const selectedFishbowlNames = new Set();
  const participantNames = () => participantsInput.value.split('\n').map(name => name.trim()).filter(Boolean);
  const includesFishbowl = () => [...document.querySelectorAll('.structure-select-item')]
    .some(select => select.value === 'User Experience Fishbowl');
  const updateFishbowlCount = () => {
    const count = fishbowlRoleOptions.querySelectorAll('input:checked').length;
    document.querySelector('[data-role="fishbowl-selection-count"]').textContent = `${count} selected`;
  };
  const renderFishbowlRoleAssignment = () => {
    const active = includesFishbowl();
    fishbowlRoleSection.hidden = !active;
    if (!active) return;

    fishbowlRoleOptions.querySelectorAll('input:checked').forEach(input => {
      const name = participantNames()[Number(input.dataset.participantId)];
      if (name) selectedFishbowlNames.add(name);
    });
    const names = participantNames();
    for (const name of [...selectedFishbowlNames]) {
      if (!names.includes(name)) selectedFishbowlNames.delete(name);
    }
    fishbowlRoleOptions.innerHTML = names.length
      ? names.map((name, id) => `<label class="fishbowl-role-option"><input type="checkbox" data-participant-id="${id}" ${selectedFishbowlNames.has(name) ? 'checked' : ''}> <span>${escHtml(name)}</span></label>`).join('')
      : '<p class="hint">Enter participants above to assign the inner circle.</p>';
    updateFishbowlCount();
  };
  fishbowlRoleOptions.addEventListener('change', event => {
    if (!event.target.matches('input[data-participant-id]')) return;
    const name = participantNames()[Number(event.target.dataset.participantId)];
    if (event.target.checked) selectedFishbowlNames.add(name);
    else selectedFishbowlNames.delete(name);
    updateFishbowlCount();
  });
  participantsInput.addEventListener('input', renderFishbowlRoleAssignment);

  if (structSelect) {
    structSelect.addEventListener('change', () => {
      updateStructureFields();
      renderFishbowlRoleAssignment();
    });
    updateStructureFields();
    renderFishbowlRoleAssignment();
  }

  const loadSampleBtn = document.getElementById('load-sample-btn');
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      updateStructureFields();
      setStartTime(2 * 60 * 1000);
      document.getElementById('participants-input').value = 'Alice\nBob\nCarol\nDave';
      document.getElementById('locations-input').value = 'Room A\nRoom B';
      document.getElementById('plenary-input').value = 'Main Hall';
      renderFishbowlRoleAssignment();
    });
  }

  // Wire add-structure button
  document.getElementById('add-structure-btn')?.addEventListener('click', () => {
    const seq = document.getElementById('structure-sequence');
    // Insert a transition break row
    const breakRow = document.createElement('div');
    breakRow.className = 'structure-break-row';
    breakRow.textContent = 'Next structure · timing assigned automatically';
    seq.appendChild(breakRow);
    // Insert new structure select
    const row = document.createElement('div');
    row.className = 'structure-row';
    row.innerHTML = `<select class="structure-select-item">${Object.keys(STRUCTURES).map(k => `<option value="${k}">${k}</option>`).join('')}</select> <button type="button" class="remove-structure-btn" aria-label="Remove structure">✕</button><p data-role="structure-description"></p>`;
    const addedSelect = row.querySelector('.structure-select-item');
    const updateAddedDescription = () => {
      row.querySelector('[data-role="structure-description"]').textContent = STRUCTURES[addedSelect.value]?.description || '';
      renderFishbowlRoleAssignment();
    };
    addedSelect.addEventListener('change', updateAddedDescription);
    row.querySelector('.remove-structure-btn').addEventListener('click', () => {
      breakRow.remove();
      row.remove();
      renderFishbowlRoleAssignment();
    });
    seq.appendChild(row);
    updateAddedDescription();
  });

  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) generateBtn.addEventListener('click', generateURL);
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

      structSelect.value = plan.structures[0].key;
      updateStructureFields();
      for (const structure of plan.structures.slice(1)) {
        document.getElementById('add-structure-btn').click();
        const selects = document.querySelectorAll('.structure-select-item');
        selects[selects.length - 1].value = structure.key;
        selects[selects.length - 1].dispatchEvent(new Event('change'));
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
      if (plan.transitionTiming) {
        document.getElementById('passing-time-input').value = String(plan.transitionTiming.passingSeconds / 60);
        document.getElementById('short-break-input').value = String(plan.transitionTiming.shortBreakSeconds / 60);
      }
      for (const name of plan.fishbowlUserNames || []) selectedFishbowlNames.add(name);
      renderFishbowlRoleAssignment();

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
  const transitionTiming = {
    passingSeconds: Math.max(0, Number(document.getElementById('passing-time-input').value || 0)) * 60,
    shortBreakSeconds: Math.max(0, Number(document.getElementById('short-break-input').value || 0)) * 60,
  };

  if (!participantLines.length) { alert('Please enter at least one participant.'); return; }
  if (!startTimeVal) { alert('Please set a start time.'); return; }

  const setupError = document.querySelector('[data-role="setup-error"]');
  setupError.textContent = '';
  const normalizedNames = new Set();
  const duplicateName = participantLines.find(name => {
    const normalized = name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedNames.has(normalized)) return true;
    normalizedNames.add(normalized);
    return false;
  });
  if (duplicateName) {
    const normalized = duplicateName.replace(/\s+/g, ' ').trim().toLowerCase();
    setupError.textContent = `Each participant needs a unique name. “${normalized}” appears more than once.`;
    setupError.focus();
    return;
  }

  const startTime = Math.floor(new Date(startTimeVal).getTime() / 1000);
  const participants = participantLines.map((name, id) => ({ name, id }));
  const fishbowlRoleOptions = {};
  const hasFishbowl = [...document.querySelectorAll('.structure-select-item')]
    .some(select => select.value === 'User Experience Fishbowl');
  if (hasFishbowl) {
    const selectedUserIds = [...document.querySelectorAll('[data-role="fishbowl-role-options"] input:checked')]
      .map(input => Number(input.dataset.participantId));
    try {
      fishbowlRoleOptions.fishbowlUserIds = validateFishbowlUserIds(selectedUserIds);
    } catch (error) {
      setupError.textContent = error.message;
      setupError.focus();
      return;
    }
  }

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
      continue;
    }
  }

  const structKey = document.getElementById('structure-select').value;
  let phases = structPhases.length > 0 ? structPhases : (STRUCTURES[structKey] || STRUCTURES['1-2-4-All']).phases.map(p => ({ ...p }));
  const requiredMeetingSpaces = getRequiredMeetingSpaceCount(participants.length, phases);
  if (locationLines.length < requiredMeetingSpaces) {
    const missingSpaces = requiredMeetingSpaces - locationLines.length;
    setupError.textContent = `This session needs ${requiredMeetingSpaces} meeting spaces at the same time, but only ${locationLines.length} ${locationLines.length === 1 ? 'was' : 'were'} provided. Add ${missingSpaces} more ${missingSpaces === 1 ? 'space' : 'spaces'}. Solo activities do not need meeting spaces.`;
    document.getElementById('session-url-output').value = '';
    document.getElementById('result-section').style.display = 'none';
    setupError.focus();
    return;
  }

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

  let groups = assignGroups(participants, phases, locationPool);
  assignCanonicalRoles(phases, groups, segments, fishbowlRoleOptions);
  ({ phases, groups } = insertConsistentTransitions(
    phases,
    groups,
    segments,
    transitionTiming,
    { includePassing: true, includeShortBreak: true }
  ));

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
    transitionTiming,
    ...(segments.length > 1 ? { segments } : {})
  };

  const encoded = encodeSession(session);
  const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
  document.getElementById('session-url-output').value = url;
  document.getElementById('result-section').style.display = '';
  copyText(url, document.getElementById('generate-btn'));
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
        `<div class="preview-group-row"><strong>${g.location?.label || '?'}</strong>: ${g.members.map(member => escHtml(formatMemberLabel(member))).join(', ')}</div>`
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

function formatMemberLabel(member, participantName = '') {
  const role = member.role ? ` — ${member.role}` : '';
  const isYou = participantName && member.name.toLowerCase() === participantName.toLowerCase();
  return `${member.name}${role}${isYou ? ' (you)' : ''}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

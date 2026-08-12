'use strict';

function getActivePhase(session, nowMs) {
  const elapsed = nowMs / 1000 - session.startTime;
  if (elapsed < 0) return null;
  for (const phase of session.phases) {
    if (elapsed >= phase.startOffset && elapsed < phase.startOffset + phase.duration) {
      return phase;
    }
  }
  return null;
}

function getParticipantGroup(session, phaseIndex, name) {
  const groups = session.groups[phaseIndex];
  if (!groups) return null;
  const lower = name.toLowerCase();
  return groups.find(g => g.members.some(m => m.name.toLowerCase() === lower)) ?? null;
}

function getCountdownClass(secondsRemaining) {
  if (secondsRemaining <= 15) return 'red';
  if (secondsRemaining <= 60) return 'amber';
  return 'normal';
}

function encodeSession(session) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(session))));
}

function decodeSession(encoded) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

function getNoteKey(sessionId, phaseIndex, participantName) {
  return `ls-clock:note:${sessionId}:${phaseIndex}:${participantName}`;
}

function getLLMPrompt(appURL = 'APP_URL') {
  const structureGuide = Object.entries(STRUCTURES)
    .map(([key, structure]) => `- ${key}: ${structure.description}`)
    .join('\n');
  return `Plan a Liberating Structures session for LS Activity Clock. Interview the facilitator, choose only registered structures, confirm, then return a setup URL representing the plan. The app owns phases, timing, groups, roles, transitions, and instructions.

## URL contract — no answered field may be omitted
Base: ${appURL}
The query MUST contain structure=, invitation=, participant= for every person, location= for every breakout room, and plenary= for the main room. Repeat structure= in order; repeat participant= and location= per value.
Template: ${appURL}?structure=KEY&invitation=QUESTION&participant=NAME1&participant=NAME2&location=ROOM1&location=ROOM2&plenary=MAIN_ROOM
RFC 3986-encode values: ( as %28 and ) as %29. Output ONLY the complete setup URL; no prose or markdown. A structure-only URL is invalid.

## Interview checklist — ask all four
1. What outcome or question becomes the invitation?
2. Who participates?
3. Which room URLs can every participant enter without the host?
4. What is the plenary/main room?
Do not produce the URL until all four are answered and confirmed. Then silently verify: chosen structure count; invitation present; participant count equals names; location count equals breakout rooms; plenary present. If a value is unknown, ask for a placeholder; never silently omit it. Every field is editable on the site. Do not ask for start time.

## Registered structures
${structureGuide}

Use keys exactly. Briefly justify choices by purpose during the interview. Do not invent structures or add compiled collections, phases, timing, grouping, mechanics, instructions, transitions, or role assignments.

Start the interview.`;
}

function getRequiredMeetingSpaceCount(participantCount, phases) {
  return (phases || []).reduce((required, phase) => {
    const groupSize = Number(phase.groupSize);
    if (groupSize <= 1 || groupSize >= 999) return required;
    return Math.max(required, Math.ceil(participantCount / groupSize));
  }, 0);
}

function assignGroups(participants, phases, locationPool) {
  const groups = {};

  for (const phase of phases) {
    groups[phase.index] = [];
    if (phase.groupSize === 0) {
      // Break phase — no groups
      continue;
    }
    if (phase.groupSize >= 999) {
      groups[phase.index].push({
        phaseIndex: phase.index,
        groupIndex: 0,
        members: [...participants],
        location: { type: 'physical', label: 'Whole Group', url: null, instructions: null, override: false }
      });
      continue;
    }

    if (phase.groupSize === 1) {
      participants.forEach((p, i) => {
        groups[phase.index].push({
          phaseIndex: phase.index,
          groupIndex: i,
          members: [p],
          location: { type: 'solo', label: 'No meeting space needed', url: null, instructions: null, override: false }
        });
      });
      continue;
    }

    const chunks = [];
    for (let i = 0; i < participants.length; i += phase.groupSize) {
      chunks.push(participants.slice(i, i + phase.groupSize));
    }

    chunks.forEach((members, gi) => {
      const locs = locationPool.locations;
      const pooledLocation = locs.length > 0
        ? { ...locs[gi % locs.length], override: false }
        : { type: 'physical', label: `Group ${gi + 1}`, url: null, instructions: null, override: false };
      let location = pooledLocation;
      if (phase.inheritLocations && phase.index > 0) {
        const priorGroups = groups[phase.index - 1] || [];
        let bestGroup = null, bestOverlap = -1;
        for (const pg of priorGroups) {
          const overlap = pg.members.filter(m => members.some(pm => pm.name === m.name)).length;
          if (overlap > bestOverlap || (overlap === bestOverlap && pg.groupIndex < (bestGroup?.groupIndex ?? Infinity))) {
            bestOverlap = overlap;
            bestGroup = pg;
          }
        }
        if (bestGroup && bestGroup.location?.type !== 'solo') {
          location = { ...bestGroup.location, override: false };
        }
      }
      groups[phase.index].push({ phaseIndex: phase.index, groupIndex: gi, members, location });
    });
  }

  return groups;
}

const STRUCTURES = {
  '1-2-4-All': {
    name: '1-2-4-All',
    url: 'https://www.liberatingstructures.com/1-1-2-4-all/',
    description: 'Engage everyone simultaneously in generating questions, ideas, and suggestions. About 15 minutes. Alone → pairs → quartets → whole group.',
    invitation: 'What ideas or actions do you recommend?',
    phases: [
      { index: 0, name: 'Introduction', duration: 60,  startOffset: 0,   groupSize: 999, instructions: 'Share the invitation and identify the shared challenge.', inheritLocations: false },
      { index: 1, name: 'Individual',   duration: 60,  startOffset: 60,  groupSize: 1,   instructions: 'Work alone. Write your ideas.',                        inheritLocations: false },
      { index: 2, name: 'Pairs',        duration: 120, startOffset: 120, groupSize: 2,   instructions: "Share and build on each other's ideas.",               inheritLocations: true  },
      { index: 3, name: 'Quartets',     duration: 300, startOffset: 240, groupSize: 4,   instructions: 'Identify the most interesting ideas.',                  inheritLocations: true  },
      { index: 4, name: 'Whole Group',  duration: 420, startOffset: 540, groupSize: 999, instructions: 'Share key insights with the whole group.',              inheritLocations: false },
    ]
  },
  'What-So-What-Now-What': {
    name: 'What-So-What-Now-What',
    url: 'https://www.liberatingstructures.com/9-what-so-what-now-what-w/',
    description: 'Reflect on experience: observations → meaning → actions.',
    invitation: 'What happened, what does it mean, and what should we do?',
    phases: [
      { index: 0, name: 'What? Solo',            duration: 60,  startOffset: 0,    groupSize: 1,   instructions: 'What did you observe? Write facts only.',     inheritLocations: false },
      { index: 1, name: 'What? Small Group',     duration: 300, startOffset: 60,   groupSize: 5,   instructions: 'Share observations. Stick to facts.',         inheritLocations: true  },
      { index: 2, name: 'What? Whole Group',     duration: 120, startOffset: 360,  groupSize: 999, instructions: 'What patterns did you notice across groups?',  inheritLocations: false },
      { index: 3, name: 'So What? Solo',         duration: 60,  startOffset: 480,  groupSize: 1,   instructions: 'What does this mean? Write interpretations.',  inheritLocations: false },
      { index: 4, name: 'So What? Small Group',  duration: 300, startOffset: 540,  groupSize: 5,   instructions: 'What patterns or hypotheses emerge?',          inheritLocations: true  },
      { index: 5, name: 'So What? Whole Group',  duration: 120, startOffset: 840,  groupSize: 999, instructions: 'Share key meanings with the whole group.',     inheritLocations: false },
      { index: 6, name: 'Now What? Solo',        duration: 60,  startOffset: 960,  groupSize: 1,   instructions: 'What actions will you take?',                 inheritLocations: false },
      { index: 7, name: 'Now What? Small Group', duration: 300, startOffset: 1020, groupSize: 5,   instructions: 'Agree on actions. Who does what by when?',    inheritLocations: true  },
      { index: 8, name: 'Now What? Whole Group', duration: 120, startOffset: 1320, groupSize: 999, instructions: 'Share commitments with the whole group.',      inheritLocations: false },
    ]
  },
  'TRIZ': {
    name: 'TRIZ',
    url: 'https://www.liberatingstructures.com/6-making-space-with-triz/',
    description: 'Generate innovative solutions by imagining what would make things worse, then inverting.',
    invitation: 'What could we do to make this problem worse? Now, how do we do the opposite?',
    phases: [
      { index: 0, name: 'Individual',  duration: 120, startOffset: 0,   groupSize: 1,   instructions: 'Write down all the ways you could make the problem worse.',           inheritLocations: false },
      { index: 1, name: 'Small Group', duration: 900, startOffset: 120, groupSize: 4,   instructions: 'Share your worst ideas. Together, invert them into actionable solutions.', inheritLocations: true  },
      { index: 2, name: 'Whole Group', duration: 600, startOffset: 1020, groupSize: 999, instructions: 'Share your top inverted solutions. What will we act on?',              inheritLocations: false },
    ]
  },
  'Min Specs': {
    name: 'Min Specs',
    url: 'https://www.liberatingstructures.com/14-min-specs/',
    description: 'Specify only the must-do and must-not-do rules for achieving a purpose.',
    invitation: 'What are the absolute minimum specifications needed to achieve our purpose?',
    phases: [
      { index: 0, name: 'Individual',  duration: 300,  startOffset: 0,    groupSize: 1,   instructions: 'Write your must-do and must-not-do rules. Aim for the minimum.',    inheritLocations: false },
      { index: 1, name: 'Small Group', duration: 900,  startOffset: 300,  groupSize: 4,   instructions: 'Compare your specs. Can you reduce the list further? Challenge each rule.', inheritLocations: true  },
      { index: 2, name: 'Whole Group', duration: 600,  startOffset: 1200, groupSize: 999, instructions: 'Share and agree on the fewest rules that will work.',                inheritLocations: false },
    ]
  },
  'Impromptu Networking': {
    name: 'Impromptu Networking',
    url: 'https://www.liberatingstructures.com/2-impromptu-networking/',
    description: 'Rapidly share challenges and expectations with new connections across three rounds.',
    invitation: 'What big challenge are you working on, and what do you hope to get from today?',
    phases: [
      { index: 0, name: 'Round 1', duration: 120, startOffset: 0,   groupSize: 2, instructions: 'Share your challenge and hopes with your partner. Listen carefully.',   inheritLocations: false },
      { index: 1, name: 'Round 2', duration: 120, startOffset: 120, groupSize: 2, instructions: 'New partner — share again. What shifts as you repeat your story?',       inheritLocations: false },
      { index: 2, name: 'Round 3', duration: 120, startOffset: 240, groupSize: 2, instructions: 'Final partner — share once more. What have you learned from telling it?', inheritLocations: false },
    ]
  },
  'Troika Consulting': {
    name: 'Troika Consulting',
    url: 'https://www.liberatingstructures.com/8-troika-consulting/',
    description: 'Groups of three take turns as client and consultants — rapid peer coaching in rotating rounds.',
    invitation: 'What is your challenge? What advice or questions do your consultants have?',
    phases: [
      { index: 0, name: 'Introduction',    duration: 300,  startOffset: 0,    groupSize: 999, instructions: 'Explain the Troika process. Each round: the client shares a challenge (1 min), then turns away while consultants confer (4 min).', inheritLocations: false },
      { index: 1, name: 'Round 1 — Client speaks',       duration: 60,   startOffset: 300,  groupSize: 3, instructions: 'Client: share your challenge or question. Consultants: listen only.', inheritLocations: false },
      { index: 2, name: 'Round 1 — Consultants confer',  duration: 240,  startOffset: 360,  groupSize: 3, instructions: 'Client turns away or mutes. Consultants: offer advice, questions, and ideas freely.', inheritLocations: true },
      { index: 3, name: 'Round 1 — Debrief',             duration: 60,   startOffset: 600,  groupSize: 3, instructions: 'Client rejoins. Share what was useful. Rotate roles.', inheritLocations: true },
      { index: 4, name: 'Round 2 — Client speaks',       duration: 60,   startOffset: 660,  groupSize: 3, instructions: 'New client: share your challenge. Consultants: listen only.', inheritLocations: true },
      { index: 5, name: 'Round 2 — Consultants confer',  duration: 240,  startOffset: 720,  groupSize: 3, instructions: 'Client turns away. Consultants confer freely.', inheritLocations: true },
      { index: 6, name: 'Round 2 — Debrief',             duration: 60,   startOffset: 960,  groupSize: 3, instructions: 'Client rejoins. Share what was useful. Rotate roles.', inheritLocations: true },
      { index: 7, name: 'Round 3 — Client speaks',       duration: 60,   startOffset: 1020, groupSize: 3, instructions: 'Third client: share your challenge.', inheritLocations: true },
      { index: 8, name: 'Round 3 — Consultants confer',  duration: 240,  startOffset: 1080, groupSize: 3, instructions: 'Client turns away. Consultants confer freely.', inheritLocations: true },
      { index: 9, name: 'Round 3 — Debrief',             duration: 60,   startOffset: 1320, groupSize: 3, instructions: 'Client rejoins. Share what was useful.', inheritLocations: true },
      { index: 10, name: 'Whole Group Share-out',        duration: 300,  startOffset: 1380, groupSize: 999, instructions: 'What patterns emerged? What will you take forward?', inheritLocations: false },
    ]
  },
  '15% Solutions': {
    name: '15% Solutions',
    url: 'https://www.liberatingstructures.com/15-15-solutions/',
    description: 'Discover and act on what you already have the freedom and resources to do right now.',
    invitation: 'What is your 15% solution — the actions within your authority that you could take today?',
    phases: [
      { index: 0, name: 'Individual',  duration: 300,  startOffset: 0,   groupSize: 1,   instructions: 'Write your 15% solution: what can you do with the resources, authority, and relationships you already have?', inheritLocations: false },
      { index: 1, name: 'Small Group', duration: 900,  startOffset: 300, groupSize: 4,   instructions: 'Share your 15% solutions. Offer advice and help. What support do you need from others?', inheritLocations: true },
      { index: 2, name: 'Whole Group', duration: 600,  startOffset: 1200, groupSize: 999, instructions: 'Share key insights and commitments. Who needs what support?', inheritLocations: false },
    ]
  },
  'Nine Whys': {
    name: 'Nine Whys',
    url: 'https://www.liberatingstructures.com/3-nine-whys/',
    description: 'Rapidly reveal the deeper purpose behind the work by asking "Why?" up to nine times.',
    invitation: 'Why is your work important? Keep asking why to find the deeper purpose.',
    phases: [
      { index: 0, name: 'Pairs — Nine Whys', duration: 600,  startOffset: 0,   groupSize: 2,   instructions: 'Partner A: explain what you do. Partner B: ask "Why is that important?" up to nine times. Then switch.', inheritLocations: false },
      { index: 1, name: 'Whole Group',       duration: 600,  startOffset: 600, groupSize: 999, instructions: 'Share the deepest purpose you uncovered. What patterns do you notice?', inheritLocations: false },
    ]
  },
  'Wicked Questions': {
    name: 'Wicked Questions',
    url: 'https://www.liberatingstructures.com/4-wicked-questions/',
    description: 'Articulate the contradictory forces at play to open space for innovation.',
    invitation: 'What bold and outrageous question, if pursued, would fundamentally change our approach?',
    phases: [
      { index: 0, name: 'Individual',  duration: 300,  startOffset: 0,    groupSize: 1,   instructions: 'Draft your wicked question: "How is it that we [x] and [opposite of x] at the same time?"', inheritLocations: false },
      { index: 1, name: 'Small Group', duration: 900,  startOffset: 300,  groupSize: 4,   instructions: 'Share your questions. Select the most provocative and important ones.', inheritLocations: true },
      { index: 2, name: 'Whole Group', duration: 600,  startOffset: 1200, groupSize: 999, instructions: 'Each group shares their top question. Discuss: which contradictions are most generative?', inheritLocations: false },
    ]
  },
  'Appreciative Interviews': {
    name: 'Appreciative Interviews',
    url: 'https://www.liberatingstructures.com/5-appreciative-interviews-ai/',
    description: 'Discover and build on what works by sharing stories of success.',
    invitation: 'Tell me about a time when you did your best work together. What made it possible?',
    phases: [
      { index: 0, name: 'Pairs — Interview',   duration: 600,  startOffset: 0,    groupSize: 2,   instructions: 'Interview your partner using the invitation. Listen for what made success possible. Then switch.', inheritLocations: false },
      { index: 1, name: 'Small Group — Themes', duration: 600,  startOffset: 600,  groupSize: 4,   instructions: 'Share your partner\'s story. Identify common themes and enabling conditions.', inheritLocations: false },
      { index: 2, name: 'Whole Group',          duration: 300,  startOffset: 1200, groupSize: 999, instructions: 'Share the most inspiring stories and recurring themes.', inheritLocations: false },
    ]
  },
  'Purpose-to-Practice': {
    name: 'Purpose-to-Practice',
    url: 'https://www.liberatingstructures.com/33-purpose-to-practice-p2p/',
    description: 'Define the five essential elements of a self-organizing initiative: purpose, principles, participants, structure, and practices.',
    invitation: 'What is the purpose, principles, participants, structure, and practices of our initiative?',
    phases: [
      { index: 0, name: 'Individual',  duration: 300,  startOffset: 0,    groupSize: 1,   instructions: 'Reflect on the initiative. Write your thoughts on: purpose, principles, participants, structure, practices.', inheritLocations: false },
      { index: 1, name: 'Small Group', duration: 1200, startOffset: 300,  groupSize: 5,   instructions: 'Share and align on each element in turn. Produce a draft for your group.', inheritLocations: true },
      { index: 2, name: 'Whole Group', duration: 600,  startOffset: 1500, groupSize: 999, instructions: 'Each group shares their draft. Identify convergence and open questions.', inheritLocations: false },
    ]
  },
  'User Experience Fishbowl': {
    name: 'User Experience Fishbowl',
    url: 'https://www.liberatingstructures.com/user-experience-fishbowl',
    description: 'Hear from a small inner circle of users while the larger group observes and learns.',
    invitation: 'What has your experience been? What matters most to you about this?',
    hasRoles: true,
    phases: [
      { index: 0, name: 'Inner Circle Discussion', duration: 1200, startOffset: 0,    groupSize: 5,   instructions: 'Inner circle (role: User): share your experience freely. Outer circle (role: Observer): listen without interrupting. Note what surprises you.', inheritLocations: false },
      { index: 1, name: 'Outer Circle Reflection',  duration: 600,  startOffset: 1200, groupSize: 999, instructions: 'Outer circle shares observations. Inner circle listens. What did you learn?', inheritLocations: false },
      { index: 2, name: 'Whole Group Synthesis',    duration: 300,  startOffset: 1800, groupSize: 999, instructions: 'Together: what insights will shape how we move forward?', inheritLocations: false },
    ]
  },
};

function quickPlanToURL(plan, baseURL) {
  const url = new URL(baseURL);
  const params = new URLSearchParams();
  for (const structure of plan.structures || []) params.append('structure', structure.key);
  if (plan.invitation) params.set('invitation', plan.invitation);
  if (typeof plan.startTime === 'number') params.set('startTime', String(plan.startTime));
  for (const participant of plan.participants || []) params.append('participant', typeof participant === 'string' ? participant : participant.name);
  for (const location of plan.locations || []) params.append('location', location);
  if (plan.plenaryLocation) params.set('plenary', plan.plenaryLocation);
  url.search = params.toString();
  url.hash = '';
  return url.toString();
}

function quickPlanFromURL(input) {
  const url = new URL(input, 'http://localhost');
  const plan = {
    structures: url.searchParams.getAll('structure').map(key => ({ key })),
  };
  if (url.searchParams.has('invitation')) plan.invitation = url.searchParams.get('invitation');
  if (url.searchParams.has('startTime')) plan.startTime = Number(url.searchParams.get('startTime'));
  // Canonical: repeated singular params. Fallback: a plural param whose value is
  // newline- or comma-joined (some LLMs emit this form). Singular wins if present.
  const splitPlural = value => (value || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  const participants = url.searchParams.getAll('participant').map(s => s.trim()).filter(Boolean);
  const participantsFallback = participants.length ? participants : splitPlural(url.searchParams.get('participants'));
  if (participantsFallback.length) plan.participants = participantsFallback;
  const locations = url.searchParams.getAll('location').map(s => s.trim()).filter(Boolean);
  const locationsFallback = locations.length ? locations : splitPlural(url.searchParams.get('locations'));
  if (locationsFallback.length) plan.locations = locationsFallback;
  if (url.searchParams.has('plenary')) plan.plenaryLocation = url.searchParams.get('plenary');
  return plan;
}

const DEFAULT_TRANSITION_TIMING = Object.freeze({ passingSeconds: 60, shortBreakSeconds: 30 });

function insertConsistentTransitions(phases, groups, segments, transitionTiming, options = {}) {
  const includePassing = options.includePassing !== false;
  const includeShortBreak = options.includeShortBreak !== false;
  const groupFingerprint = phaseIndex => JSON.stringify((groups[phaseIndex] || []).map(group => ({
    members: group.members.map(member => member.id).sort((a, b) => a - b),
    location: `${group.location?.url || ''}|${group.location?.label || ''}`,
  })));
  const reindexedPhases = [];
  const reindexedGroups = {};
  const oldToNewIndex = new Map();
  let reindexedOffset = 0;
  phases.forEach((phase, position) => {
    const reindexedPhase = { ...phase, index: reindexedPhases.length, startOffset: reindexedOffset };
    oldToNewIndex.set(phase.index, reindexedPhase.index);
    reindexedPhases.push(reindexedPhase);
    reindexedGroups[reindexedPhase.index] = (groups[phase.index] || []).map(group => ({ ...group, phaseIndex: reindexedPhase.index }));
    reindexedOffset += reindexedPhase.duration;

    const nextPhase = phases[position + 1];
    const isActivityBoundary = nextPhase && !phase.transitionType && !nextPhase.transitionType;
    const unchanged = isActivityBoundary
      && groupFingerprint(phase.index) === groupFingerprint(nextPhase.index);
    const transitionType = unchanged
      ? (includeShortBreak ? 'short-break' : null)
      : (isActivityBoundary && includePassing ? 'passing' : null);
    const transitionDuration = transitionType === 'short-break'
      ? transitionTiming.shortBreakSeconds
      : transitionTiming.passingSeconds;
    if (transitionType && transitionDuration > 0) {
      const transitionIndex = reindexedPhases.length;
      reindexedPhases.push({
        index: transitionIndex,
        name: transitionType === 'passing' ? 'Passing time' : 'Short break',
        duration: transitionDuration,
        startOffset: reindexedOffset,
        groupSize: 0,
        transitionType,
        instructions: transitionType === 'passing'
          ? 'Move to your next activity and location.'
          : 'Take a short break. Your group and location stay the same.',
        inheritLocations: transitionType === 'short-break',
      });
      reindexedGroups[transitionIndex] = [];
      reindexedOffset += transitionDuration;
    }
  });
  for (const segment of segments) {
    segment.phaseIndexStart = oldToNewIndex.get(segment.phaseIndexStart);
    segment.phaseIndexEnd = oldToNewIndex.get(segment.phaseIndexEnd);
  }
  return { phases: reindexedPhases, groups: reindexedGroups, segments };
}

function validateFishbowlUserIds(userIds) {
  const normalizedIds = [...new Set(Array.from(userIds || [], Number))];
  if (normalizedIds.length < 3 || normalizedIds.length > 7) {
    const error = new Error('Choose between 3 and 7 participants for the Fishbowl inner circle.');
    error.code = 'FISHBOWL_USER_COUNT';
    throw error;
  }
  return new Set(normalizedIds);
}

function assignCanonicalRoles(phases, groups, segments, options = {}) {
  for (const segment of segments) {
    if (segment.structureKey === 'Troika Consulting') {
      for (let phaseIndex = segment.phaseIndexStart; phaseIndex <= segment.phaseIndexEnd; phaseIndex++) {
        const round = phases[phaseIndex].name.match(/^Round (\d+)/)?.[1];
        if (!round) continue;
        for (const group of groups[phaseIndex] || []) {
          const clientIndex = (Number(round) - 1) % group.members.length;
          group.members = group.members.map((member, index) => ({
            ...member,
            role: index === clientIndex ? 'Client' : 'Consultant',
            roleInstructions: index === clientIndex
              ? 'Share your challenge, then listen while the consultants confer.'
              : 'Listen, then confer with the other consultant while the client turns away.',
          }));
        }
      }
    }
    if (segment.structureKey === 'User Experience Fishbowl') {
      const participantIds = [...new Set(
        Array.from({ length: segment.phaseIndexEnd - segment.phaseIndexStart + 1 }, (_, offset) => segment.phaseIndexStart + offset)
          .flatMap(phaseIndex => (groups[phaseIndex] || []).flatMap(group => group.members.map(member => member.id)))
      )].sort((a, b) => a - b);
      const fishbowlUserIds = options.fishbowlUserIds == null
        ? new Set(participantIds.slice(0, Math.min(5, participantIds.length)))
        : validateFishbowlUserIds(options.fishbowlUserIds);
      for (let phaseIndex = segment.phaseIndexStart; phaseIndex <= segment.phaseIndexEnd; phaseIndex++) {
        for (const group of groups[phaseIndex] || []) {
          group.members = group.members.map(member => ({
            ...member,
            role: fishbowlUserIds.has(member.id) ? 'User' : 'Observer',
            roleInstructions: fishbowlUserIds.has(member.id)
              ? 'Share your experience from the inner circle.'
              : 'Listen from the outer circle and note what surprises you.',
          }));
        }
      }
    }
  }
  return groups;
}

function compileQuickPlan(plan) {
  const transitionTiming = { ...DEFAULT_TRANSITION_TIMING };
  const mechanicalFields = [
    'phases', 'groups', 'segments', 'startOffset', 'groupSize', 'instructions', 'roles',
    'transitionTiming', 'passingSeconds', 'shortBreakSeconds', 'passingMinutes', 'shortBreakMinutes',
  ];
  const suppliedMechanicalField = plan && mechanicalFields.find(field => Object.hasOwn(plan, field));
  if (suppliedMechanicalField) {
    const error = new Error(`Activity mechanics are not allowed in a quick plan: ${suppliedMechanicalField}`);
    error.code = 'ACTIVITY_MECHANICS_NOT_ALLOWED';
    throw error;
  }
  if (!plan || !Array.isArray(plan.structures) || plan.structures.length === 0) {
    throw new Error('Quick plan requires at least one structure');
  }
  const unknownStructure = plan.structures.find(item => !item || !Object.hasOwn(STRUCTURES, item.key));
  if (unknownStructure) {
    const error = new Error(`Unknown structure: ${unknownStructure?.key || '(missing key)'}`);
    error.code = 'UNKNOWN_STRUCTURE_KEY';
    throw error;
  }

  const normalizedParticipantNames = new Set();
  for (const participant of plan.participants || []) {
    const name = typeof participant === 'string' ? participant : participant?.name || '';
    const normalized = name.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalizedParticipantNames.has(normalized)) {
      const error = new Error(`Each participant needs a unique name: ${normalized}`);
      error.code = 'DUPLICATE_PARTICIPANT_NAME';
      throw error;
    }
    normalizedParticipantNames.add(normalized);
  }

  let phases = [];
  const segments = [];
  let startOffset = 0;
  plan.structures.forEach(item => {
    const phaseIndexStart = phases.length;
    for (const templatePhase of STRUCTURES[item.key].phases) {
      phases.push({ ...templatePhase, index: phases.length, startOffset });
      startOffset += templatePhase.duration;
    }
    segments.push({ name: item.key, structureKey: item.key, phaseIndexStart, phaseIndexEnd: phases.length - 1 });
  });

  const participants = (plan.participants || []).map((participant, id) => (
    typeof participant === 'string' ? { name: participant, id } : { ...participant, id: participant.id ?? id }
  ));
  const toMeetingLocation = value => ({
    type: /^https?:\/\//i.test(value) ? 'url' : 'physical',
    label: value,
    url: /^https?:\/\//i.test(value) ? value : null,
    instructions: null,
    override: false,
  });
  const locationPool = {
    locations: (plan.locations || []).map(toMeetingLocation),
    strategy: 'round-robin',
  };
  const plenaryLocation = toMeetingLocation(plan.plenaryLocation || 'Whole Group');
  let groups = assignGroups(participants, phases, locationPool);
  for (const phase of phases) {
    if (phase.groupSize >= 999 && groups[phase.index]?.[0]) {
      groups[phase.index][0].location = { ...plenaryLocation };
    }
  }

  assignCanonicalRoles(phases, groups, segments);

  ({ phases, groups } = insertConsistentTransitions(phases, groups, segments, transitionTiming));

  return {
    id: plan.id || Math.random().toString(16).slice(2, 10).padEnd(8, '0'),
    structure: plan.structures.map(item => item.key).join(' → '),
    invitation: plan.invitation || STRUCTURES[plan.structures[0].key].invitation,
    startTime: plan.startTime,
    participants,
    phases,
    groups,
    segments,
    plenaryLocation,
    locationPool,
    transitionTiming,
  };
}

function validateSession(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['Session must be an object'];
  if (!obj.id) errors.push('Missing required field: id');
  if (typeof obj.startTime !== 'number') errors.push('Missing required field: startTime (must be a Unix timestamp)');
  if (!Array.isArray(obj.participants) || obj.participants.length === 0) errors.push('Missing required field: participants (must be a non-empty array)');
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) errors.push('Missing required field: phases (must be a non-empty array)');
  if (!obj.plenaryLocation) errors.push('Missing required field: plenaryLocation');
  if (!obj.locationPool) errors.push('Missing required field: locationPool');
  if (obj.locationPool && Array.isArray(obj.locationPool.locations) &&
      Array.isArray(obj.participants) && Array.isArray(obj.phases)) {
    const locCount = obj.locationPool.locations.length;
    const requiredMeetingSpaces = getRequiredMeetingSpaceCount(obj.participants.length, obj.phases);
    if (requiredMeetingSpaces > locCount) {
      errors.push(`Session needs ${requiredMeetingSpaces} meeting spaces at the same time but locationPool only has ${locCount}. Solo activities do not need meeting spaces.`);
    }
  }
  return errors;
}

if (typeof module !== 'undefined') {
  module.exports = { getActivePhase, getParticipantGroup, getCountdownClass, encodeSession, decodeSession, getNoteKey, getLLMPrompt, getRequiredMeetingSpaceCount, assignGroups, insertConsistentTransitions, validateFishbowlUserIds, assignCanonicalRoles, STRUCTURES, quickPlanToURL, quickPlanFromURL, compileQuickPlan, validateSession };
}

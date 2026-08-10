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

function getLLMPrompt() {
  return `You are helping a facilitator set up a Liberating Structures session using the LS Activity Clock app.

Your job: interview the facilitator to collect everything needed, then output a complete SessionPayload JSON object.

## Interview checklist (ask in order, adapt as needed)
1. Which Liberating Structure? (1-2-4-All, What-So-What-Now-What, TRIZ, Min Specs, Impromptu Networking, Troika Consulting, 15% Solutions, Nine Whys, Wicked Questions, Appreciative Interviews, Purpose-to-Practice, User Experience Fishbowl)
2. Do you want to chain multiple structures together in one session? If so, which ones, in what order?
3. Do you want breaks between structures or phases? If so, how long?
4. What is the invitation / central question for participants?
5. When does the session start? (date and time, including timezone — be precise, as this drives the clock for all participants)
6. Who are the participants? (names, one per line)
7. What meeting locations are available? (Google Meet URLs, Zoom links, physical room names, breakout room names — one per line)
8. Any custom phase durations or instructions? (or use defaults for the chosen structure)

## Output format
When you have all the information, output ONLY a JSON object matching this schema — no explanation, no markdown fences:

{
  "id": "<random 8-char hex string>",
  "structure": "<structure name>",
  "invitation": "<the central question>",
  "startTime": <Unix timestamp in seconds>,
  "participants": [
    { "name": "<name>", "id": <0-based integer> }
  ],
  "phases": [
    {
      "index": <0-based>,
      "name": "<phase name>",
      "duration": <seconds>,
      "startOffset": <sum of prior durations in seconds>,
      "groupSize": <participants per group; 0=break, 1=individual, 999=whole group>,
      "instructions": "<what participants do>",
      "inheritLocations": <true|false>
    }
  ],
  "groups": {
    "<phaseIndex>": [
      {
        "phaseIndex": <integer>,
        "groupIndex": <integer>,
        "members": [ { "name": "<name>", "id": <integer>, "role": "<optional role string — omit if not needed>", "roleInstructions": "<optional instructions for this role — omit if not needed>" } ],
        "location": {
          "type": "<url|physical|breakout>",
          "label": "<display name>",
          "url": "<URL or null>",
          "instructions": "<optional extra instructions or null>",
          "override": false
        }
      }
    ]
  },
  "plenaryLocation": {
    "type": "<url|physical|breakout>",
    "label": "<display name>",
    "url": "<URL or null>",
    "instructions": null,
    "override": false
  },
  "locationPool": {
    "locations": [],
    "strategy": "round-robin"
  },
  "segments": [
    {
      "name": "<display name for this structure/segment>",
      "structureKey": "<key from STRUCTURES, or custom label>",
      "phaseIndexStart": <0-based index of first phase in this segment>,
      "phaseIndexEnd": <0-based index of last phase in this segment (inclusive)>
    }
  ]
}

## Segments rules
- segments[] is optional; omit if the session contains only one structure
- Each segment groups a contiguous range of phases[] under a named label
- Segments are display-only — they do not change group assignment logic
- When chaining multiple structures, create one segment per structure plus one for each break

## MeetingLocation type rules
- type "url": online meeting link (Google Meet, Zoom, Teams, etc.) — set "url" to the link
- type "physical": named physical space — set "url" to null, put details in "label" and "instructions"
- type "breakout": named virtual breakout room — set "url" to null or the breakout URL

## Group assignment rules
- Phase 0 (individual): one group per participant, groupSize=1
- Phase 1 (pairs): group participants in adjacent pairs from the participant list
- Phase 2 (quartets): merge adjacent pairs, groupSize=4
- Whole-group phases: one group with all participants, groupSize=999, use plenaryLocation
- Distribute locations round-robin across groups in phase 0; subsequent phases inherit the location of the largest contributing sub-group from the prior phase

## Built-in structure defaults

### 1-2-4-All
Phases: Introduction (60s, groupSize=999), Individual (60s, groupSize=1), Pairs (120s, groupSize=2), Quartets (300s, groupSize=4), Whole Group (420s, groupSize=999)

### What-So-What-Now-What
Phases: What? Individual (60s, groupSize=1), What? Small Group (300s, groupSize=5), What? Whole Group (120s, groupSize=999), So What? Individual (60s, groupSize=1), So What? Small Group (300s, groupSize=5), So What? Whole Group (120s, groupSize=999), Now What? Individual (60s, groupSize=1), Now What? Small Group (300s, groupSize=5), Now What? Whole Group (120s, groupSize=999)

### TRIZ
Phases: Individual (120s, groupSize=1), Small Group (900s, groupSize=4), Whole Group (600s, groupSize=999)

### Min Specs
Phases: Individual (300s, groupSize=1), Small Group (900s, groupSize=4), Whole Group (600s, groupSize=999)

### Impromptu Networking
Phases: Round 1 (120s, groupSize=2), Round 2 (120s, groupSize=2), Round 3 (120s, groupSize=2) — pre-assign different pairs each round

### Troika Consulting
Phases: Introduction (300s, groupSize=999), then 3 rounds × [Client speaks (60s, groupSize=3), Consultants confer (240s, groupSize=3), Debrief (60s, groupSize=3)], Whole Group Share-out (300s, groupSize=999)
Role assignment: in each group of 3, assign role="Client" to one member and role="Consultant" to the other two; rotate the client role each round

### 15% Solutions
Phases: Individual (300s, groupSize=1), Small Group (900s, groupSize=4), Whole Group (600s, groupSize=999)

### Nine Whys
Phases: Pairs — Nine Whys (600s, groupSize=2), Whole Group (600s, groupSize=999)

### Wicked Questions
Phases: Individual (300s, groupSize=1), Small Group (900s, groupSize=4), Whole Group (600s, groupSize=999)

### Appreciative Interviews
Phases: Pairs — Interview (600s, groupSize=2), Small Group — Themes (600s, groupSize=4), Whole Group (300s, groupSize=999)

### Purpose-to-Practice
Phases: Individual (300s, groupSize=1), Small Group (1200s, groupSize=5), Whole Group (600s, groupSize=999)

### User Experience Fishbowl
Phases: Inner Circle Discussion (1200s, groupSize=5), Outer Circle Reflection (600s, groupSize=999), Whole Group Synthesis (300s, groupSize=999)
Role assignment: assign role="User" to inner circle members and role="Observer" to outer circle participants

## Break and transition phases
Both use groupSize=0. Distinguish with the optional transitionType field:
- transitionType: "passing" — room change; participant view shows the NEXT phase's location early so people can move. Use when groups physically or virtually change rooms.
- transitionType: "breath" — everyone stays in the same space; short pause to reset attention. No location shown.
- omit transitionType (or set to "break") — standard break with no location context.

Example passing transition: { "index": N, "name": "Move to breakout rooms", "duration": 120, "startOffset": ..., "groupSize": 0, "transitionType": "passing", "instructions": "Head to your next room now.", "inheritLocations": false }
Example breath: { "index": N, "name": "Take a breath", "duration": 30, "startOffset": ..., "groupSize": 0, "transitionType": "breath", "instructions": "Pause. Settle. We begin again in 30 seconds.", "inheritLocations": false }

Start the interview now.`;
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
        const loc = locationPool.locations.length > 0
          ? locationPool.locations[i % locationPool.locations.length]
          : { type: 'physical', label: `Seat ${i + 1}`, url: null, instructions: null, override: false };
        groups[phase.index].push({
          phaseIndex: phase.index,
          groupIndex: i,
          members: [p],
          location: { ...loc, override: false }
        });
      });
      continue;
    }

    const chunks = [];
    for (let i = 0; i < participants.length; i += phase.groupSize) {
      chunks.push(participants.slice(i, i + phase.groupSize));
    }

    chunks.forEach((members, gi) => {
      let location;
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
        location = bestGroup
          ? { ...bestGroup.location, override: false }
          : { type: 'physical', label: `Group ${gi + 1}`, url: null, instructions: null, override: false };
      } else {
        const locs = locationPool.locations;
        location = locs.length > 0
          ? { ...locs[gi % locs.length], override: false }
          : { type: 'physical', label: `Group ${gi + 1}`, url: null, instructions: null, override: false };
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
    url: 'https://www.liberatingstructures.com/18-users-experience-fishbowl/',
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

function validateSession(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['Session must be an object'];
  if (!obj.id) errors.push('Missing required field: id');
  if (typeof obj.startTime !== 'number') errors.push('Missing required field: startTime (must be a Unix timestamp)');
  if (!Array.isArray(obj.participants) || obj.participants.length === 0) errors.push('Missing required field: participants (must be a non-empty array)');
  if (!Array.isArray(obj.phases) || obj.phases.length === 0) errors.push('Missing required field: phases (must be a non-empty array)');
  if (!obj.plenaryLocation) errors.push('Missing required field: plenaryLocation');
  if (!obj.locationPool) errors.push('Missing required field: locationPool');
  if (obj.locationPool && Array.isArray(obj.locationPool.locations) && obj.locationPool.locations.length > 0 &&
      Array.isArray(obj.participants) && Array.isArray(obj.phases)) {
    const locCount = obj.locationPool.locations.length;
    for (const phase of obj.phases) {
      if (phase.groupSize > 0 && phase.groupSize < 999) {
        const groupsNeeded = Math.ceil(obj.participants.length / phase.groupSize);
        if (groupsNeeded > locCount) {
          errors.push(`Warning: phase "${phase.name}" needs ${groupsNeeded} locations but locationPool only has ${locCount}. Add more locations or they will be reused round-robin.`);
        }
      }
    }
  }
  return errors;
}

if (typeof module !== 'undefined') {
  module.exports = { getActivePhase, getParticipantGroup, getCountdownClass, encodeSession, decodeSession, getNoteKey, getLLMPrompt, assignGroups, STRUCTURES, validateSession };
}

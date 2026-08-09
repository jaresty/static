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
1. Which Liberating Structure? (e.g. 1-2-4-All, What-So-What-Now-What, or describe a custom one)
2. What is the invitation / central question for participants?
3. When does the session start? (date and time, including timezone)
4. Who are the participants? (names, one per line)
5. What meeting locations are available? (Google Meet URLs, Zoom links, physical room names, breakout room names — one per line)
6. Any custom phase durations or instructions? (or use defaults for the chosen structure)

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
      "groupSize": <participants per group; 1=individual, 999=whole group>,
      "instructions": "<what participants do>",
      "inheritLocations": <true|false>
    }
  ],
  "groups": {
    "<phaseIndex>": [
      {
        "phaseIndex": <integer>,
        "groupIndex": <integer>,
        "members": [ { "name": "<name>", "id": <integer> } ],
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
  }
}

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
Phases: Individual (60s, groupSize=1), Pairs (120s, groupSize=2), Quartets (300s, groupSize=4), Whole Group (420s, groupSize=999)

### What-So-What-Now-What
Phases: What? Individual (60s, groupSize=1), What? Small Group (300s, groupSize=5), What? Whole Group (120s, groupSize=999), So What? Individual (60s, groupSize=1), So What? Small Group (300s, groupSize=5), So What? Whole Group (120s, groupSize=999), Now What? Individual (60s, groupSize=1), Now What? Small Group (300s, groupSize=5), Now What? Whole Group (120s, groupSize=999)

Start the interview now.`;
}

function assignGroups(participants, phases, locationPool) {
  const groups = {};

  for (const phase of phases) {
    groups[phase.index] = [];
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
    description: 'Engage everyone simultaneously — individual → pairs → quartets → whole group.',
    invitation: 'What ideas or actions do you recommend?',
    phases: [
      { index: 0, name: 'Individual',  duration: 60,  startOffset: 0,   groupSize: 1,   instructions: 'Work alone. Write your ideas.',              inheritLocations: false },
      { index: 1, name: 'Pairs',       duration: 120, startOffset: 60,  groupSize: 2,   instructions: "Share and build on each other's ideas.",     inheritLocations: true  },
      { index: 2, name: 'Quartets',    duration: 300, startOffset: 180, groupSize: 4,   instructions: 'Identify the most interesting ideas.',        inheritLocations: true  },
      { index: 3, name: 'Whole Group', duration: 420, startOffset: 480, groupSize: 999, instructions: 'Share key insights with the whole group.',    inheritLocations: false },
    ]
  },
  'What-So-What-Now-What': {
    name: 'What-So-What-Now-What',
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
  }
};

if (typeof module !== 'undefined') {
  module.exports = { getActivePhase, getParticipantGroup, getCountdownClass, encodeSession, decodeSession, getNoteKey, getLLMPrompt, assignGroups, STRUCTURES };
}

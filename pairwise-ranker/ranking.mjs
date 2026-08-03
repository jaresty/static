export function parseItems(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('Add at least 2 items.');
  }

  if (lines.length > 30) {
    throw new Error('Keep the list to 30 items or fewer.');
  }

  const normalized = lines.map((line) => line.toLocaleLowerCase());
  if (new Set(normalized).size !== lines.length) {
    throw new Error('Every item must be unique.');
  }

  return lines.map((line, index) => ({
    id: `item-${index + 1}`,
    text: line,
    inputIndex: index,
  }));
}

export function createSession(criterion, text) {
  const cleanCriterion = String(criterion).trim();
  if (!cleanCriterion) {
    throw new Error('Name the criterion for this ranking.');
  }

  const items = parseItems(text);
  const pending = items.slice(1).map(({ id }) => id);
  const candidateId = pending.shift() ?? null;

  return {
    version: 1,
    criterion: cleanCriterion,
    items,
    phase: candidateId ? 'comparing' : 'review',
    groups: [[items[0].id]],
    pending,
    candidateId,
    low: 0,
    high: 1,
    mid: 0,
    comparisons: [],
    uncertainties: [],
    history: [],
    reviewedOrder: null,
    updatedAt: new Date().toISOString(),
  };
}

export function applyChoice(session, outcome, rationale = '') {
  if (session.phase !== 'comparing' || !session.candidateId) {
    throw new Error('There is no active comparison.');
  }

  if (!['left', 'right', 'tie', 'unsure'].includes(outcome)) {
    throw new Error('Choose left, right, tie, or unsure.');
  }

  const snapshot = structuredClone(session);
  const next = structuredClone(session);
  const comparedGroup = next.groups[next.mid];
  const comparedId = comparedGroup[0];

  next.history.push(snapshot);
  next.comparisons.push({
    id: `comparison-${next.comparisons.length + 1}`,
    leftId: next.candidateId,
    rightId: comparedId,
    outcome,
    rationale: String(rationale).trim(),
    createdAt: new Date().toISOString(),
  });

  let candidatePlaced = false;

  if (outcome === 'tie') {
    comparedGroup.push(next.candidateId);
    candidatePlaced = true;
  } else if (outcome === 'unsure') {
    next.uncertainties.push({
      leftId: next.candidateId,
      rightId: comparedId,
    });
    next.groups.splice(next.mid + 1, 0, [next.candidateId]);
    candidatePlaced = true;
  } else {
    if (outcome === 'left') {
      next.high = next.mid;
    } else {
      next.low = next.mid + 1;
    }

    if (next.low >= next.high) {
      next.groups.splice(next.low, 0, [next.candidateId]);
      candidatePlaced = true;
    } else {
      next.mid = Math.floor((next.low + next.high) / 2);
    }
  }

  if (candidatePlaced) {
    next.candidateId = next.pending.shift() ?? null;
    if (next.candidateId) {
      next.low = 0;
      next.high = next.groups.length;
      next.mid = Math.floor(next.groups.length / 2);
    } else {
      next.phase = 'review';
      next.low = 0;
      next.high = 0;
      next.mid = 0;
    }
  }

  next.rationaleDraft = '';
  next.updatedAt = new Date().toISOString();
  return next;
}

export function undoChoice(session) {
  const previous = session.history.at(-1);
  if (!previous) {
    throw new Error('There is no comparison to undo.');
  }
  return structuredClone(previous);
}

export function exportRanking(session, format = 'markdown') {
  if (!['markdown', 'numbered'].includes(format)) {
    throw new Error('Choose Markdown or numbered text.');
  }

  const itemById = new Map(session.items.map((item) => [item.id, item]));
  const groups = session.reviewedOrder ?? session.groups;
  const rankedLines = groups.map((group, index) => {
    const label = group.map((id) => itemById.get(id)?.text ?? id).join(' = ');
    return `${index + 1}. ${label}`;
  });

  const lines = format === 'markdown'
    ? [`Ranking criterion: ${session.criterion}`, '', ...rankedLines]
    : [...rankedLines];

  if (session.uncertainties?.length) {
    lines.push('', 'Uncertain comparisons remain in this ranking.');
  }

  const rationales = session.comparisons
    .filter(({ rationale }) => rationale)
    .map(({ leftId, rightId, rationale }) => {
      const left = itemById.get(leftId)?.text ?? leftId;
      const right = itemById.get(rightId)?.text ?? rightId;
      return `- ${left} vs. ${right}: ${rationale}`;
    });
  if (rationales.length) {
    lines.push('', 'Rationale', ...rationales);
  }

  return lines.join('\n');
}

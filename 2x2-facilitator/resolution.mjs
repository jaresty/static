const coordinate = (value) => Number(value.toFixed(6));

export function createResolution(collection) {
  const items = collection.setup.items.map(({ id, text }) => {
    const placements = collection.responses.map(({ payload }) => payload.positions[id]);
    const baseline = {
      x: coordinate(placements.reduce((sum, point) => sum + point.x, 0) / placements.length),
      y: coordinate(placements.reduce((sum, point) => sum + point.y, 0) / placements.length),
    };
    return { id, text, baseline, resolved: { ...baseline } };
  });
  return { version: 1, collection: structuredClone(collection), items, history: [] };
}

export function adjustResolution(state, itemId, target) {
  if (![target?.x, target?.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Place the resolved item inside the grid.');
  }
  const next = structuredClone(state);
  const item = next.items.find(({ id }) => id === itemId);
  if (!item) throw new Error('Choose an item in this resolution.');
  next.history.push({ itemId, resolved: { ...item.resolved } });
  item.resolved = { x: coordinate(target.x), y: coordinate(target.y) };
  return next;
}

export function resetResolutionItem(state, itemId) {
  const item = state.items.find(({ id }) => id === itemId);
  if (!item) throw new Error('Choose an item in this resolution.');
  return adjustResolution(state, itemId, item.baseline);
}

export function resetAllResolutions(state) {
  const next = structuredClone(state);
  next.history.push({
    itemId: null,
    positions: Object.fromEntries(next.items.map(({ id, resolved }) => [id, { ...resolved }])),
  });
  next.items.forEach((item) => { item.resolved = { ...item.baseline }; });
  return next;
}

export function undoResolution(state) {
  if (!state.history.length) return structuredClone(state);
  const next = structuredClone(state);
  const previous = next.history.pop();
  if (previous.itemId) {
    next.items.find(({ id }) => id === previous.itemId).resolved = { ...previous.resolved };
  } else {
    next.items.forEach((item) => { item.resolved = { ...previous.positions[item.id] }; });
  }
  return next;
}

const storageKey = (exerciseId) => `quadrant-resolution-v1:${exerciseId}`;

export function saveResolution(storage, state) {
  storage.setItem(storageKey(state.collection.exerciseId), JSON.stringify(state));
}

export function loadResolution(storage, exerciseId) {
  const encoded = storage.getItem(storageKey(exerciseId));
  if (!encoded) return null;
  try {
    const state = JSON.parse(encoded);
    return state?.version === 1 && state.collection?.exerciseId === exerciseId ? state : null;
  } catch {
    return null;
  }
}

export function exportResolution(state, { includeAdjustments = false } = {}) {
  const exported = {
    type: 'quadrant-resolution',
    version: 1,
    exerciseId: state.collection.exerciseId,
    prompt: state.collection.setup.prompt,
    items: state.items.map(({ id, text, resolved }) => ({ id, text, resolved: { ...resolved } })),
  };
  if (!includeAdjustments) return exported;
  const { xLow, xHigh, yLow, yHigh } = state.collection.setup;
  exported.items.forEach((item, index) => {
    const source = state.items[index];
    const dx = source.resolved.x - source.baseline.x;
    const dy = source.resolved.y - source.baseline.y;
    const distancePercent = Math.round(Math.hypot(dx, dy) / Math.SQRT2 * 100);
    const directions = [];
    if (Math.abs(dx) > 0.000001) directions.push(dx > 0 ? xHigh : xLow);
    if (Math.abs(dy) > 0.000001) directions.push(dy > 0 ? yHigh : yLow);
    item.adjustment = {
      distancePercent,
      direction: directions.length ? `toward ${directions.join(' and ')}` : 'No facilitator adjustment',
    };
  });
  return exported;
}

export function formatResolutionExport(state, { includeAdjustments = false } = {}) {
  const exported = exportResolution(state, { includeAdjustments });
  const { xLabel, xLow, xHigh, yLabel, yLow, yHigh } = state.collection.setup;
  const lines = [
    'QUADRANT RESOLUTION',
    '',
    exported.prompt,
    `Responses collected: ${state.collection.responses.length}`,
    '',
    'AXES',
    `${xLabel}: ${xLow} → ${xHigh}`,
    `${yLabel}: ${yLow} → ${yHigh}`,
    '',
    'RESOLVED POSITIONS',
  ];
  exported.items.forEach((item, index) => {
    lines.push(
      '',
      `${index + 1}. ${item.text}`,
      `   Position: ${item.resolved.x >= 0.5 ? xHigh : xLow} / ${item.resolved.y >= 0.5 ? yHigh : yLow}`,
      `   Coordinates: ${Math.round(item.resolved.x * 100)}% ${xLabel}, ${Math.round(item.resolved.y * 100)}% ${yLabel}`,
    );
    if (includeAdjustments) {
      lines.push(item.adjustment.distancePercent
        ? `   Facilitator adjustment: ${item.adjustment.distancePercent}% of the board ${item.adjustment.direction}`
        : '   Facilitator adjustment: None — participant midpoint retained');
    }
  });
  return `${lines.join('\n')}\n`;
}

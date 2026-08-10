const clone = (value) => structuredClone(value);
const HISTORY_LIMIT = 50;

function clean(value) {
  return String(value ?? '').trim();
}

function parseItems(value) {
  const sources = Array.isArray(value)
    ? value
    : String(value ?? '').split(/\r?\n/).map((text) => ({ text }));
  const items = sources
    .map((item) => (typeof item === 'string' ? { text: item } : item))
    .map((item) => ({ text: clean(item?.text), description: clean(item?.description) }))
    .filter(({ text }) => Boolean(text));
  if (items.length < 2) throw new Error('Add at least 2 options.');
  if (items.length > 20) throw new Error('Keep the workshop to 20 options or fewer.');
  if (new Set(items.map(({ text }) => text.toLocaleLowerCase())).size !== items.length) {
    throw new Error('Every option must be unique.');
  }
  return items.map((item, index) => ({ id: `item-${index + 1}`, ...item }));
}

function historyFree(session) {
  const { history: _history, ...state } = session;
  return { ...clone(state), history: [] };
}

function flatHistory(session) {
  return (Array.isArray(session.history) ? session.history : [])
    .map(historyFree)
    .slice(-HISTORY_LIMIT);
}

function snapshot(session) {
  const next = historyFree(session);
  next.history = [...flatHistory(session), historyFree(session)].slice(-HISTORY_LIMIT);
  return next;
}

export function compactWorkshop(session) {
  const next = historyFree(session);
  next.history = flatHistory(session);
  return next;
}

export function createWorkshop(input) {
  const prompt = clean(input.prompt);
  const xLabel = clean(input.xLabel);
  const yLabel = clean(input.yLabel);
  if (!prompt) throw new Error('Write a decision prompt.');
  if (!xLabel || !yLabel) throw new Error('Name both axes.');

  const items = parseItems(input.items);
  const pending = items.map(({ id }) => id);
  return {
    version: 1,
    round: Number(input.round) || 1,
    prompt,
    activityDescription: clean(input.activityDescription),
    xLabel,
    xLow: clean(input.xLow) || `Lower ${xLabel}`,
    xHigh: clean(input.xHigh) || `Higher ${xLabel}`,
    yLabel,
    yLow: clean(input.yLow) || `Lower ${yLabel}`,
    yHigh: clean(input.yHigh) || `Higher ${yLabel}`,
    items,
    positions: {},
    pending,
    candidateId: pending[0] ?? null,
    focusIds: [],
    phase: pending.length ? 'placement' : 'review',
    history: [],
  };
}

export function placeAt(session, { x, y }) {
  if (session.phase !== 'placement' || !session.candidateId) throw new Error('There is no option waiting to be placed.');
  if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Place the option inside the grid.');
  }

  const next = snapshot(session);
  next.positions[session.candidateId] = { x, y };
  next.pending = next.pending.filter((itemId) => itemId !== session.candidateId);
  next.candidateId = next.pending[0] ?? null;
  next.phase = next.candidateId ? 'placement' : 'review';
  return next;
}

export function repositionItem(session, itemId, position) {
  if (!session.positions[itemId]) return session;
  if (![position?.x, position?.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('Place the option inside the grid.');
  }
  const current = session.positions[itemId];
  if (current.x === position.x && current.y === position.y) return session;
  const next = snapshot(session);
  next.positions[itemId] = { x: position.x, y: position.y };
  return next;
}

export function moveItem(session, itemId, axis, delta) {
  if (!['x', 'y'].includes(axis) || ![-1, 1].includes(delta)) throw new Error('Choose a valid adjustment.');
  if (!session.positions[itemId]) return session;
  const current = session.positions[itemId][axis];
  const target = Math.max(0, Math.min(1, Number((current + delta * 0.05).toFixed(2))));
  if (target === current) return session;
  const next = snapshot(session);
  next.positions[itemId][axis] = target;
  return next;
}

export function undo(session) {
  const history = flatHistory(session);
  const previous = history.at(-1);
  if (!previous) throw new Error('There is nothing to undo.');
  const next = clone(previous);
  next.history = history.slice(0, -1);
  return next;
}

export function setFocus(session, ids) {
  const allowed = new Set(session.items.map(({ id }) => id));
  const focusIds = [...new Set(ids)].filter((id) => allowed.has(id));
  const next = snapshot(session);
  next.focusIds = focusIds;
  return next;
}

export function regridFocus(session) {
  if (session.focusIds.length < 2) throw new Error('Select at least 2 focus options to re-grid.');
  const selected = session.focusIds.map((id) => session.items.find((item) => item.id === id));
  return createWorkshop({
    prompt: session.prompt,
    activityDescription: session.activityDescription,
    xLabel: session.xLabel,
    xLow: session.xLow,
    xHigh: session.xHigh,
    yLabel: session.yLabel,
    yLow: session.yLow,
    yHigh: session.yHigh,
    items: selected.map(({ text, description }) => ({ text, description })),
    round: session.round + 1,
  });
}

export function coordinates(session) {
  return session.items
    .filter((item) => session.positions[item.id])
    .map((item) => ({
      ...item,
      ...session.positions[item.id],
      focused: session.focusIds.includes(item.id),
    }));
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function markdown(session) {
  const byId = new Map(session.items.map((item) => [item.id, item]));
  const lines = [
    `# 2×2: ${session.prompt}`,
    ...(session.activityDescription ? ['', session.activityDescription] : []),
    '',
    `- X axis: ${session.xLabel} (${session.xLow} → ${session.xHigh})`,
    `- Y axis: ${session.yLabel} (${session.yLow} → ${session.yHigh})`,
    `- Round: ${session.round}`,
    '',
    '## Relative placement',
  ];
  coordinates(session)
    .sort((a, b) => (b.x + b.y) - (a.x + a.y))
    .forEach((item) => lines.push(`- ${item.text}${item.description ? ` — ${item.description}` : ''} — X ${item.x.toFixed(2)}, Y ${item.y.toFixed(2)}${item.focused ? ' — focus' : ''}`));
  if (session.focusIds.length) {
    lines.push('', '## Focus choices', ...session.focusIds.map((id) => `- ${byId.get(id).text}`));
  }
  return lines.join('\n');
}

function svg(session) {
  const width = 900;
  const height = 650;
  const points = coordinates(session).map((item) => {
    const x = 110 + item.x * 680;
    const y = 540 - item.y * 400;
    const fill = item.focused ? '#c7f36b' : '#fffdf7';
    return `<g><circle cx="${x}" cy="${y}" r="28" fill="${fill}" stroke="#17211b" stroke-width="2"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-family="system-ui">${escapeXml(item.text)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(session.prompt)}"><rect width="100%" height="100%" fill="#f3f0e7"/><text x="450" y="42" text-anchor="middle" font-size="24" font-family="system-ui" font-weight="700">${escapeXml(session.prompt)}</text><line x1="110" y1="540" x2="810" y2="540" stroke="#17211b" stroke-width="3"/><line x1="110" y1="560" x2="110" y2="120" stroke="#17211b" stroke-width="3"/><text x="810" y="590" text-anchor="end" font-family="system-ui">${escapeXml(session.xLabel)} — ${escapeXml(session.xHigh)}</text><text x="110" y="590" font-family="system-ui">${escapeXml(session.xLow)}</text><text x="120" y="105" font-family="system-ui">${escapeXml(session.yLabel)} — ${escapeXml(session.yHigh)}</text><text x="120" y="530" font-family="system-ui">${escapeXml(session.yLow)}</text>${points}</svg>`;
}

export function exportWorkshop(session, format) {
  if (format === 'markdown') return markdown(session);
  if (format === 'json') return JSON.stringify(session, null, 2);
  if (format === 'svg') return svg(session);
  throw new Error('Choose Markdown, JSON, or SVG.');
}

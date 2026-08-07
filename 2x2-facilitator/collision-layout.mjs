const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

function collisionGroups(items, cardDiameter) {
  const unseen = new Set(items.map((_, index) => index));
  const groups = [];
  while (unseen.size) {
    const seed = unseen.values().next().value;
    unseen.delete(seed);
    const group = [seed];
    for (let cursor = 0; cursor < group.length; cursor += 1) {
      for (const candidate of [...unseen]) {
        if (group.some((index) => distance(items[index].resolved, items[candidate].resolved) < cardDiameter)) {
          unseen.delete(candidate);
          group.push(candidate);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export function layoutResolutionCards(items, { cardDiameter = 0.11 } = {}) {
  const layout = items.map(({ id, resolved }) => ({
    id,
    trueResolved: { ...resolved },
    displayResolved: { ...resolved },
  }));
  for (const group of collisionGroups(items, cardDiameter)) {
    if (group.length < 2) continue;
    const columns = Math.ceil(Math.sqrt(group.length));
    const rows = Math.ceil(group.length / columns);
    const center = {
      x: group.reduce((sum, index) => sum + items[index].resolved.x, 0) / group.length,
      y: group.reduce((sum, index) => sum + items[index].resolved.y, 0) / group.length,
    };
    group.forEach((itemIndex, position) => {
      const column = position % columns;
      const row = Math.floor(position / columns);
      layout[itemIndex].displayResolved = {
        x: center.x + (column - (columns - 1) / 2) * cardDiameter,
        y: center.y + (row - (rows - 1) / 2) * cardDiameter,
      };
    });
    const points = group.map((index) => layout[index].displayResolved);
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    const shiftX = Math.min(...xs) < 0 ? -Math.min(...xs) : Math.max(...xs) > 1 ? 1 - Math.max(...xs) : 0;
    const shiftY = Math.min(...ys) < 0 ? -Math.min(...ys) : Math.max(...ys) > 1 ? 1 - Math.max(...ys) : 0;
    group.forEach((index) => {
      layout[index].displayResolved.x += shiftX;
      layout[index].displayResolved.y += shiftY;
    });
  }
  return layout;
}

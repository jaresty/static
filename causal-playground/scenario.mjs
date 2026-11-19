// Describe the actual run, never the author's prose or an inferred cause.
export function startingSituation(model, start) {
  if (!model.nodes.length) return 'No variables yet. Add one to start a scenario.';
  const unusual = model.nodes.filter(n => start[n.id] !== n.baseline || n.initial !== n.baseline);
  if (!unusual.length) return 'All levels start and previously stayed at their usual values. Stepping will leave them unchanged.';
  const lines = unusual.slice(0, 4).map(n => n.initial !== start[n.id]
    ? `${n.name}: previously ${n.initial}; starts at ${start[n.id]} (usual ${n.baseline}).`
    : `${n.name}: starts at ${start[n.id]} (usual ${n.baseline}); earlier steps also use ${n.initial}.`);
  if (unusual.length > lines.length) lines.push(`${unusual.length - lines.length} more starting differences.`);
  return lines.join(' ');
}
export function resultAt(model, run, tick) {
  if (!tick) return { heading: 'Result', text: 'No step taken at this point.', rows: [] };
  const records = run.transitions[tick - 1];
  const changed = model.nodes.filter(n => records[n.id].net !== 0);
  const ids = [...new Set([...model.view.chartNodes, ...changed.map(n => n.id), ...model.nodes.map(n => n.id)])];
  const rows = ids.slice(0, 5).map(id => {
    const r = records[id], fmt = x => Number(x.toFixed(3));
    return `${model.nodes.find(n => n.id === id).name}: ${fmt(r.current)} → ${fmt(r.next)}${r.net === 0 ? ' (unchanged)' : fmt(r.current) === fmt(r.next) ? ' (small change, rounded)' : ''}`;
  });
  return { heading: `Result · ${model.stepLabel || 'step'} ${tick}`, text: `${changed.length} of ${model.nodes.length} levels changed.${ids.length > rows.length ? ` Showing ${rows.length}; inspect any variable for details.` : ''}`, rows };
}

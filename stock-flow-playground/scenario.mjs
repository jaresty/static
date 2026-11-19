import {parse} from './model.mjs';

// Keep the transport compact. Count omitted records, not just changed records.
function describe(items, noun, format) {
  const lines = [...items].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, 4).map(format);
  if (items.length > lines.length) lines.push(`${items.length - lines.length} more ${noun} not shown.`);
  return lines.join(' ');
}
export function startingSituation(model) {
  const stocks = model.entities.filter(e => e.type === 'stock');
  const delayed = new Set(model.entities.flatMap(e => e.expression ? parse(e.expression).delays.filter(d => d.steps > 0).map(d => d.id) : []));
  const initial = describe(stocks, 'starting amounts', s => `${s.name} starts with ${s.initial} ${s.unit}.`);
  const earlier = describe(stocks.filter(s => delayed.has(s.id)), 'earlier readings', s => `Before the run, earlier readings of ${s.name} use its initial amount of ${s.initial} ${s.unit}.`);
  return [initial, earlier].filter(Boolean).join(' ');
}
export function resultAt(model, rows, index) {
  if (!index) return {heading:'Step 0 · Starting amounts',primary:'No transfer has occurred at this point.',details:[]};
  const previous = rows[index-1], row = rows[index];
  const entities = new Map(model.entities.map(e => [e.id,e]));
  const fmt=x=>Number(x.toPrecision(7));
  const allStocks=model.entities.filter(e=>e.type==='stock').sort((a,b)=>a.id.localeCompare(b.id));
  const stocks = allStocks.slice(0,4).map(s => {
    const a = previous.stocks[s.id], b = row.stocks[s.id];
    return `${s.name}: ${fmt(a)} → ${fmt(b)} ${s.unit}${a === b ? ' (unchanged)' : ''}.`;
  });
  const details=[];
  const name=id=>entities.get(id)?.name??'the environment';
  function transfer(f){
    const unit=entities.get(f.source??f.target).unit;
    return `${fmt(f.amount)} ${unit} moved from ${name(f.source)} to ${name(f.target)}.`;
  }
  const flows=[...row.flows].sort((a,b)=>Number(b.limited)-Number(a.limited)||Number(b.amount!==0)-Number(a.amount!==0)||a.id.localeCompare(b.id));
  const primary=flows.length?transfer(flows[0]):'No flows in this model.';
  for(const f of flows.filter(f=>f.limited)){const unit=entities.get(f.source??f.target).unit;details.push(`${name(f.id)}: ${fmt(f.amount)} ${unit} transferred of ${fmt(f.requestedAmount)} ${unit} requested; limited by available stock.`);}
  for(const d of row.delayedReads.filter(d=>d.prehistory))details.push(`${name(d.expression)} read ${fmt(d.value)} ${entities.get(d.stock).unit} from ${name(d.stock)} at tick ${d.sourceTick}, before the run; earlier readings use its starting amount.`);
  details.push(...stocks,...flows.slice(1,4).map(transfer));
  if(allStocks.length>4||flows.length>4)details.push('Showing up to four stocks and transfers. Inspect the ledger for more.');
  return {heading:`Step ${index} · ${fmt(previous.t)} → ${fmt(row.t)} ${model.time.unit} (${fmt(row.dt)} ${model.time.unit} step)`,primary,details};
}

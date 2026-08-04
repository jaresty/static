import {
  advanceStem,
  createSession,
  getAssemblyStep,
  getCurrentStem,
  moveAssemblyStep,
  resetOverrides,
  resetSession,
  restoreSession,
  selectAssemblyRole,
  selectAssemblyStep,
  serializeSession,
  setOrientation,
  setTeacherOverride,
  toggleCheckpoint,
  updateContainer
} from './lesson-model.mjs';

const STORAGE_KEY = 'ohara-lesson-session-v1';
const APP_STORAGE_KEY = 'ohara-arrangement-state-v2';
const ROLES = ['subject', 'secondary', 'object'];
const CHECKPOINTS = [
  ['length', 'Length discussed'],
  ['kenzan', 'Kenzan position discussed'],
  ['plan', 'Direction checked'],
  ['elevation', 'Inclination checked'],
  ['teacher', 'Teacher ready to continue']
];

const ROLE_META = {
  subject: { short: 'Shu', name: 'Subject', color: '#d95f45' },
  secondary: { short: 'Fuku', name: 'Secondary', color: '#438b75' },
  object: { short: 'Kyaku', name: 'Object', color: '#d6a23d' }
};

const STYLES = [
  {
    id: 'upright', name: 'Upright', japanese: '直立型', romanized: 'Chokuritsu-kei',
    mood: 'Stable · ascending · open',
    summary: 'The Subject rises vertically while the Secondary and Object open the composition with unequal counterweights.',
    insight: 'Read stability first: the vertical Subject establishes gravity, then the side stems make that stability visible.',
    stems: [
      { role: 'subject', ratio: 1, azimuth: -8, elevation: 80, x: 42, y: 42 },
      { role: 'secondary', ratio: 0.67, azimuth: 30, elevation: 45, x: 38, y: 46 },
      { role: 'object', ratio: 0.5, azimuth: -15, elevation: 30, x: 46, y: 47 }
    ]
  },
  {
    id: 'slanting', name: 'Slanting', japanese: '傾斜型', romanized: 'Keisha-kei',
    mood: 'Directional · expansive · poised',
    summary: 'The Subject becomes the long lateral gesture; the Secondary rises and the Object balances the opposite side.',
    insight: 'Follow the Subject first. Its diagonal determines the energy of every supporting relationship.',
    stems: [
      { role: 'subject', ratio: 1, azimuth: 45, elevation: 20, x: 40, y: 45 },
      { role: 'secondary', ratio: 0.5, azimuth: -8, elevation: 90, x: 32, y: 35 },
      { role: 'object', ratio: 0.5, azimuth: -30, elevation: 40, x: 47, y: 47 }
    ]
  },
  {
    id: 'water-reflecting', name: 'Water-reflecting', japanese: '観水型', romanized: 'Kansui-kei',
    mood: 'Low · spacious · reflective',
    summary: 'The principal gesture travels close to the water surface, preserving an expressive field of open water.',
    insight: 'The empty water is active material. Low stems frame it rather than filling it.',
    stems: [
      { role: 'subject', ratio: 1, azimuth: 45, elevation: 20, x: 40, y: 45 },
      { role: 'secondary', ratio: 0.5, azimuth: -12, elevation: 90, x: 32, y: 35 },
      { role: 'object', ratio: 0.5, azimuth: -30, elevation: 40, x: 55, y: 49 }
    ]
  }
];

function loadLesson() {
  try {
    const payload = localStorage.getItem(STORAGE_KEY);
    return payload ? restoreSession(payload) : createSession();
  } catch {
    return createSession();
  }
}

function loadAppState() {
  const lesson = loadLesson();
  const defaults = {
    styleIndex: 0,
    focusedRole: lesson.currentRole,
    mode: 'lesson',
    lesson,
    reviewAnnotations: true
  };
  try {
    const payload = JSON.parse(localStorage.getItem(APP_STORAGE_KEY));
    if (payload?.version !== 2 || !payload.lesson) return defaults;
    const restoredLesson = restoreSession(payload.lesson);
    return {
      styleIndex: Number.isInteger(payload.styleIndex) && STYLES[payload.styleIndex] ? payload.styleIndex : 0,
      focusedRole: ROLES.includes(payload.focusedRole) ? payload.focusedRole : restoredLesson.currentRole,
      mode: ['lesson', 'reference'].includes(payload.mode) ? payload.mode : 'lesson',
      lesson: restoredLesson,
      reviewAnnotations: payload.reviewAnnotations !== false
    };
  } catch {
    return defaults;
  }
}

const state = loadAppState();

function saveLesson() {
  const lesson = serializeSession(state.lesson);
  localStorage.setItem(STORAGE_KEY, lesson);
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
    version: 2,
    styleIndex: state.styleIndex,
    focusedRole: state.focusedRole,
    mode: state.mode,
    reviewAnnotations: state.reviewAnnotations,
    lesson
  }));
}
const rad = degrees => (degrees * Math.PI) / 180;
const point = (cx, cy, angle, distance) => ({
  x: cx + Math.cos(rad(angle)) * distance,
  y: cy + Math.sin(rad(angle)) * distance
});

function angleArc(cx, cy, from, to, radius) {
  const start = point(cx, cy, from, radius);
  const end = point(cx, cy, to, radius);
  const delta = ((to - from + 540) % 360) - 180;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${delta >= 0 ? 1 : 0} ${end.x} ${end.y}`;
}

function planReading(angle) {
  const usesRear = Math.abs(angle) > 90;
  const amount = usesRear ? 180 - Math.abs(angle) : Math.abs(angle);
  const side = angle < 0 ? 'right' : 'left';
  const reference = usesRear ? 'rear' : 'front';
  return {
    amount,
    side,
    reference,
    referenceAngle: usesRear ? -90 : 90,
    signed: usesRear ? -Math.sign(angle) * amount : angle,
    label: `${amount}° ${side} of ${reference}`
  };
}

function lengthRatioLabel(stem) {
  const ratio = STYLES[state.styleIndex].stems.find(candidate => candidate.role === stem.role).ratio;
  if (ratio === 1) return 'Base measure';
  if (Math.abs(ratio - 0.67) < 0.01) return '2/3 of Subject';
  if (Math.abs(ratio - 0.5) < 0.01) return '1/2 of Subject';
  return `${Math.round(ratio * 100)}% of Subject`;
}

function lessonLengthFor(stem) {
  const target = state.lesson.targets[stem.role].length;
  if (target.status === 'teacher-adjusted') return target.value;
  const base = Number(state.lesson.container.diameter) + Number(state.lesson.container.depth);
  return Math.round(base * stem.ratio * 10) / 10;
}

function kenzanLocationLabel(x, y) {
  const horizontal = x < 47 ? 'left' : x > 53 ? 'right' : 'center';
  const depth = y < 47 ? 'rear' : y > 53 ? 'front' : 'center';
  if (horizontal === 'center' && depth === 'center') return 'center';
  if (horizontal === 'center') return `${depth} of center`;
  if (depth === 'center') return `${horizontal} of center`;
  return `${depth}-${horizontal} of center`;
}

function lessonStem() {
  const styleStem = STYLES[state.styleIndex].stems.find(stem => stem.role === state.lesson.currentRole);
  const mirrored = state.lesson.orientation === 'mirrored';
  const x = mirrored ? 100 - styleStem.x : styleStem.x;
  const holderStem = STYLES[state.styleIndex].stems[0];
  const holderX = mirrored ? 100 - holderStem.x : holderStem.x;
  const holderY = holderStem.y;
  const azimuth = mirrored ? -styleStem.azimuth : styleStem.azimuth;
  return {
    role: styleStem.role,
    details: {
      length: { ...state.lesson.targets[styleStem.role].length, value: lessonLengthFor(styleStem) },
      kenzan: { x, y: styleStem.y, holderX, holderY, label: kenzanLocationLabel(holderX, holderY), status: 'editorial-approximation' },
      plan: { value: azimuth, reference: 'nearest container axis', status: 'editorial-approximation' },
      elevation: { value: styleStem.elevation, reference: 'horizontal plane', status: 'editorial-approximation' }
    }
  };
}

function lessonStyle() {
  const base = STYLES[state.styleIndex];
  const subjectLength = lessonLengthFor(base.stems[0]);
  return {
    ...base,
    stems: base.stems.map(stem => ({
      ...stem,
      ratio: lessonLengthFor(stem) / subjectLength,
      azimuth: state.lesson.orientation === 'mirrored' ? -stem.azimuth : stem.azimuth,
      x: state.lesson.orientation === 'mirrored' ? 100 - stem.x : stem.x
    }))
  };
}

function activeStyle() {
  return lessonStyle();
}

function visibleStems(style) {
  if (state.mode !== 'lesson') return style.stems;
  const count = ROLES.indexOf(state.lesson.currentRole) + 1;
  return style.stems.slice(0, count);
}

function stemLine(stem, start, end, labelAt = end, view = 'diagram', insertionMarker = false) {
  const meta = ROLE_META[stem.role];
  const focused = state.focusedRole === stem.role;
  return `<g class="stem ${focused ? 'is-focused' : ''}" data-role="${stem.role}" tabindex="0" role="button" aria-label="Focus ${meta.name} stem in ${view}" style="--stem:${meta.color}">
    <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />
    ${insertionMarker
      ? `<circle class="insertion-point" cx="${start.x}" cy="${start.y}" r="3.8" /><text class="vertical-cue" x="${start.x}" y="${start.y + 8}" text-anchor="middle">VERTICAL</text>`
      : `<circle class="stem-origin" cx="${start.x}" cy="${start.y}" r="2.6" /><circle class="stem-endpoint" cx="${end.x}" cy="${end.y}" r="3.8" />`}
    <text x="${labelAt.x}" y="${labelAt.y - 7}" text-anchor="middle">${meta.short}</text>
  </g>`;
}

function renderPlan(style) {
  const stems = visibleStems(style).map(stem => {
    const start = { x: stem.x, y: stem.y };
    const projectedLength = 35 * stem.ratio * Math.cos(rad(stem.elevation));
    const end = point(start.x, start.y, 90 + stem.azimuth, projectedLength);
    const labelOffset = stem.role === 'secondary' ? { x: -7, y: -1 } : stem.role === 'object' ? { x: 7, y: 1 } : { x: 0, y: 0 };
    return stemLine(stem, start, end, { x: end.x + labelOffset.x, y: end.y + labelOffset.y }, "bird's-eye plan", projectedLength < 0.01);
  }).join('');
  const front = '<text class="front-label" x="50" y="88" text-anchor="middle">FRONT</text><path class="front-marker" d="M44 91 H56 M50 91 V96"/>';
  return `<svg viewBox="0 0 100 100" aria-label="Bird's-eye plan projection for ${style.name}">
    <circle class="container-shape" data-geometry="circular-rim" cx="50" cy="50" r="39" />
    ${stems}${front}
    ${state.mode === 'reference' ? '<text class="view-caption" x="50" y="99" text-anchor="middle">Bird\'s-eye · azimuth</text>' : ''}
  </svg>`;
}

function frontContainerGraphic() {
  return `<ellipse class="container-rim" cx="50" cy="77" rx="22" ry="4" />
    <path class="container-sidewall" d="M28 77 V84 M72 77 V84" />
    <path class="container-base" d="M28 84 Q50 90 72 84" />`;
}

function renderFront(style) {
  const base = { x: 50, y: 77 };
  const stems = visibleStems(style).map(stem => {
    const length = 47 * stem.ratio;
    const direction = stem.azimuth > 0 ? -1 : stem.azimuth < 0 ? 1 : 0;
    return stemLine(stem, base, {
      x: base.x + direction * Math.cos(rad(stem.elevation)) * length,
      y: base.y - Math.sin(rad(stem.elevation)) * length
    }, undefined, 'front elevation');
  }).join('');
  return `<svg viewBox="0 0 100 100" aria-label="Front elevation projection for ${style.name}">
    ${frontContainerGraphic()}${stems}
    <text class="view-caption" x="50" y="96" text-anchor="middle">Front · elevation</text>
  </svg>`;
}

function spatialContainerGraphic(annotations) {
  const cx = annotations ? 25 : 50;
  const rx = annotations ? 22 : 31;
  const ry = annotations ? 9 : 13;
  const topY = 70;
  const bottomY = 76;
  return `<ellipse class="container-base" cx="${cx}" cy="${bottomY}" rx="${rx}" ry="${ry}" />
    <path class="container-sidewall" d="M${cx - rx} ${topY} V${bottomY} M${cx + rx} ${topY} V${bottomY}" />
    <ellipse class="container-rim" cx="${cx}" cy="${topY}" rx="${rx}" ry="${ry}" />
    <ellipse class="water-fill" cx="${cx}" cy="${topY - 1}" rx="${rx - 4}" ry="${ry - 4}" />`;
}

function renderSpatial(style, annotations = false) {
  const origin = { x: annotations ? 25 : 50, y: 70 };
  const stems = visibleStems(style).map((stem, index) => {
    const length = (annotations ? 31 : 44) * stem.ratio;
    const horizontal = Math.cos(rad(stem.elevation)) * length;
    const end = {
      x: origin.x - Math.sin(rad(stem.azimuth)) * horizontal,
      y: origin.y - Math.sin(rad(stem.elevation)) * length + Math.cos(rad(stem.azimuth)) * horizontal * 0.28
    };
    const line = stemLine(stem, origin, end, undefined, 'spatial projection');
    if (!annotations) return line;
    const meta = ROLE_META[stem.role];
    const target = lessonLengthFor(stem);
    const plan = planReading(stem.azimuth);
    const rowY = 13 + index * 23;
    const textX = 54;
    const concisePlan = plan.label.replace('container ', '');
    return `${line}<g class="placement-annotation" style="--stem:${meta.color}">
      <line class="annotation-leader" x1="${end.x}" y1="${end.y}" x2="51" y2="${rowY}" />
      <rect class="annotation-plate" x="52" y="${rowY - 10}" width="46" height="20" rx="2" />
      <text class="placement-label" x="${textX}" y="${rowY - 5}" text-anchor="start"><tspan x="${textX}">${meta.name} · ${target} ${state.lesson.container.units}</tspan><tspan x="${textX}" dy="5">plan ${concisePlan}</tspan><tspan x="${textX}" dy="5">elevation ${stem.elevation}°</tspan></text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 100 100" aria-label="Spatial projection for ${style.name}">
    ${spatialContainerGraphic(annotations)}${stems}
    <text class="view-caption" x="${annotations ? 25 : 50}" y="96" text-anchor="middle">Spatial · combined</text>
  </svg>`;
}

function kenzanDiagram(stem) {
  const pins = Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, col) => {
    const x = (col - 3) * 4.5;
    const y = (row - 3) * 4.5;
    const inside = Math.hypot(x, y) < 14;
    return inside ? `<circle cx="${x}" cy="${y}" r="0.9" />` : '';
  }).join('')).join('');
  const { holderX, holderY } = stem.details.kenzan;
  const roleIndex = ROLES.indexOf(stem.role);
  const placedStems = lessonStyle().stems.slice(0, roleIndex).map(placed => {
    const projectedLength = 16 * placed.ratio * Math.cos(rad(placed.elevation));
    const end = point(placed.x, placed.y, 90 + placed.azimuth, projectedLength);
    const meta = ROLE_META[placed.role];
    return `<g class="placed-stem" data-role="${placed.role}" style="--stem:${meta.color}">
      <line x1="${placed.x}" y1="${placed.y}" x2="${end.x}" y2="${end.y}" />
      <circle cx="${placed.x}" cy="${placed.y}" r="2.3" />
      <text x="${end.x}" y="${end.y - 5}" text-anchor="middle">${meta.short}</text>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 100 124" aria-label="Whole Kenzan placement: ${stem.details.kenzan.label}">
    <circle class="kenzan-container" cx="50" cy="50" r="40" />
    <g class="kenzan-holder" data-object="whole-kenzan" data-x="${holderX}" data-y="${holderY}" transform="translate(${holderX} ${holderY})">
      <circle class="kenzan-disc" cx="0" cy="0" r="16" />
      <g class="kenzan-pins">${pins}</g>
    </g>
    ${placedStems}
    <text class="kenzan-label" x="50" y="98" text-anchor="middle">WHOLE KENZAN</text>
    <text class="kenzan-location-label" x="50" y="105" text-anchor="middle">POSITION: ${stem.details.kenzan.label.toUpperCase()}</text>
    <path class="front-marker" d="M40 111 H60 M50 111 V116"/><text class="front-label" x="50" y="123" text-anchor="middle">CONTAINER FRONT</text>
  </svg>`;
}

const STEP_LABELS = {
  length: ['01', 'Length', 'Measure the stem'],
  kenzan: ['02', 'Kenzan', 'Place the flower holder'],
  plan: ['03', 'Plan angle', 'Aim from above'],
  elevation: ['04', 'Elevation', 'Set the inclination'],
  review: ['05', 'Review', 'Read the whole relationship']
};

function basicPlanGraphic(stem) {
  const angle = stem.details.plan.value;
  const reading = planReading(angle);
  const stemAngle = 90 + angle;
  const end = point(50, 53, stemAngle, 34);
  const label = point(50, 53, reading.referenceAngle + reading.signed / 2, 25);
  return `<svg class="focus-diagram" viewBox="0 0 100 100" aria-label="Plan direction for ${stem.role}">
    <circle class="container-shape" data-geometry="circular-rim" cx="50" cy="53" r="39" />
    <line class="reference-axis" x1="50" y1="53" x2="${point(50, 53, reading.referenceAngle, 35).x}" y2="${point(50, 53, reading.referenceAngle, 35).y}" />
    <line class="focus-stem" x1="50" y1="53" x2="${end.x}" y2="${end.y}" />
    <path class="angle-arc" d="${angleArc(50, 53, reading.referenceAngle, stemAngle, 17)}" />
    <text class="angle-label" x="${label.x}" y="${label.y}">${reading.amount}° ${reading.side.toUpperCase()}</text>
    <circle class="focus-origin" cx="50" cy="53" r="3" />
  </svg>`;
}

function basicElevationGraphic(stem) {
  const elevation = stem.details.elevation.value;
  const direction = stem.details.plan.value > 0 ? -1 : 1;
  const end = { x: 50 + direction * Math.cos(rad(elevation)) * 35, y: 77 - Math.sin(rad(elevation)) * 35 };
  const referenceAngle = direction < 0 ? -180 : 0;
  const stemAngle = direction < 0 ? -180 + elevation : -elevation;
  const label = point(50, 77, referenceAngle + (stemAngle - referenceAngle) / 2, 25);
  return `<svg class="focus-diagram" viewBox="0 0 100 100" aria-label="Elevation for ${stem.role}">
    ${frontContainerGraphic()}
    <line class="reference-axis" x1="50" y1="77" x2="${direction < 0 ? 12 : 88}" y2="77" />
    <line class="focus-stem" x1="50" y1="77" x2="${end.x}" y2="${end.y}" />
    <path class="angle-arc" d="${angleArc(50, 77, referenceAngle, stemAngle, 17)}" />
    <text class="angle-label" x="${label.x}" y="${label.y}">${elevation}°</text>
    <circle class="focus-origin" cx="50" cy="77" r="3" />
  </svg>`;
}

function adaptiveStageContent(step, stem) {
  const length = stem.details.length;
  const calculatedLength = state.lesson.lengths[stem.role];
  const units = state.lesson.container.units;
  if (step === 'length') return `<div class="adaptive-copy"><span class="panel-label">Prepare</span><h4>Establish ${ROLE_META[stem.role].name.toLowerCase()} length</h4><p>Start with the container, then compare the calculated measure with the real branch.</p><div class="compact-fields"><label>Diameter<input id="container-diameter" type="number" min="1" step="0.5" value="${state.lesson.container.diameter}"></label><label>Depth<input id="container-depth" type="number" min="0" step="0.5" value="${state.lesson.container.depth}"></label><label>Units<select id="container-units"><option value="cm" ${units === 'cm' ? 'selected' : ''}>cm</option><option value="in" ${units === 'in' ? 'selected' : ''}>in</option></select></label></div></div><div class="adaptive-visual length-visual"><div class="measure-stem" data-measurement="length"><i></i><span class="length-ratio">${lengthRatioLabel(stem)}</span><span id="lesson-length-value" class="length-value">${calculatedLength} ${units}</span></div><label class="inline-override">Adjust target<input id="lesson-length-input" type="number" min="1" step="0.1" value="${length.value}"><span id="length-status" data-status="${length.status}">${length.status === 'teacher-adjusted' ? 'Adjusted' : 'Calculated'}</span></label></div>`;
  if (step === 'kenzan') {
    if (stem.role === 'subject') return `<div class="adaptive-copy"><span class="panel-label">Place the holder</span><h4>Set the whole Kenzan</h4><p>Place the flower holder <strong>${stem.details.kenzan.label}</strong> and align it with the front marker. Keep it fixed for the remaining stems.</p></div><div class="adaptive-visual kenzan-focus">${kenzanDiagram(stem)}</div>`;
    const roleName = stem.role === 'secondary' ? 'Fuku' : ROLE_META[stem.role].name;
    return `<div class="adaptive-copy"><span class="panel-label">Place the stem</span><h4>Find ${roleName}'s entry area</h4><p>Keep the whole Kenzan fixed. Confirm the exact ${roleName} insertion point with a current Ohara Hana-gata card or your teacher before aiming the stem.</p></div><div class="adaptive-visual kenzan-focus">${kenzanDiagram(stem)}</div>`;
  }
  if (step === 'plan') { const plan = planReading(stem.details.plan.value); return `<div class="adaptive-copy"><span class="panel-label">Aim from above</span><h4>Set the plan direction</h4><p>Use the nearest container axis so the physical turn stays easy to read.</p><div class="step-reading"><strong>${plan.amount}°</strong><span>${plan.side} of container ${plan.reference}</span></div></div><div class="adaptive-visual">${basicPlanGraphic(stem)}</div>`; }
  if (step === 'elevation') return `<div class="adaptive-copy"><span class="panel-label">Aim from the side</span><h4>Set the inclination</h4><p>Read this independently from the plan direction.</p><div class="step-reading"><strong>${stem.details.elevation.value}°</strong><span>from ${stem.details.elevation.reference}</span></div></div><div class="adaptive-visual">${basicElevationGraphic(stem)}</div>`;
  return `<div class="adaptive-copy"><span class="panel-label">Review</span><h4>Read the whole relationship</h4><p>Length, Kenzan context, plan direction, and elevation now describe one spatial decision.</p><dl class="review-values"><div><dt>Length</dt><dd>${length.value} ${units}</dd></div><div><dt>Plan</dt><dd>${planReading(stem.details.plan.value).label}</dd></div><div><dt>Elevation</dt><dd>${stem.details.elevation.value}°</dd></div></dl><label class="annotation-toggle"><input id="annotation-toggle" type="checkbox" aria-controls="review-placement-diagram" ${state.reviewAnnotations ? 'checked' : ''}><span>Show placement annotations</span></label></div><div id="review-placement-diagram" class="adaptive-visual review-visual">${renderSpatial(lessonStyle(), state.reviewAnnotations)}</div>`;
}

function renderLessonBoard() {
  const host = document.querySelector('#lesson-host');
  const stem = lessonStem();
  const step = getAssemblyStep(state.lesson);
  const stepIndex = Object.keys(STEP_LABELS).indexOf(step);
  const roleIndex = ROLES.indexOf(stem.role);
  const [number, label, defaultPrompt] = STEP_LABELS[step];
  const prompt = step === 'kenzan' && stem.role !== 'subject' ? 'Locate the stem entry area' : defaultPrompt;
  host.innerHTML = `<section class="adaptive-canvas" data-adaptive-canvas data-style="${STYLES[state.styleIndex].id}" style="--role-color:${ROLE_META[stem.role].color}" aria-labelledby="adaptive-title">
    <header class="adaptive-header"><div><p class="eyebrow">${ROLE_META[stem.role].name} · ${ROLE_META[stem.role].short}</p><h3 id="adaptive-title">${label}</h3><p>${prompt}</p><p class="source-boundary">Provisional geometry · confirm with current Ohara Hana-gata cards or your teacher</p></div><span>${number} / 05</span></header>
    <ol class="role-track" aria-label="Arrangement roles">${ROLES.map((role, index) => `<li class="${index === roleIndex ? 'is-current' : index < roleIndex ? 'is-complete' : ''}" style="--stem:${ROLE_META[role].color}"><button type="button" data-role="${role}" ${index === roleIndex ? 'aria-current="step"' : ''} aria-label="Start ${ROLE_META[role].name} at Length"><i>${index + 1}</i><span>${role === 'secondary' ? ROLE_META[role].short : ROLE_META[role].name}</span></button></li>`).join('')}</ol>
    <ol class="step-track" aria-label="Steps for ${ROLE_META[stem.role].name}">${Object.entries(STEP_LABELS).map(([id, value], index) => `<li class="${index === stepIndex ? 'is-current' : index < stepIndex ? 'is-complete' : ''}"><button type="button" data-step="${id}" ${index === stepIndex ? 'aria-current="step"' : ''} aria-label="Go to ${value[1]} for ${ROLE_META[stem.role].name}"><i>${index + 1}</i><span>${value[1]}</span></button></li>`).join('')}</ol>
    <div class="adaptive-stage" data-step="${step}">${adaptiveStageContent(step, stem)}</div>
    <nav class="adaptive-nav" aria-label="Step navigation"><button id="step-back" ${roleIndex === 0 && stepIndex === 0 ? 'disabled' : ''}>← Back</button><span>${label}</span><button id="step-next">${step === 'review' ? (stem.role === 'object' ? 'Finish' : `Next stem · ${ROLE_META[ROLES[ROLES.indexOf(stem.role) + 1]].name}`) : 'Next →'}</button></nav>
  </section>`;
  bindLessonEvents();
}

function updateContainerFromUI() {
  state.lesson = updateContainer(state.lesson, {
    diameter: Number(document.querySelector('#container-diameter').value),
    depth: Number(document.querySelector('#container-depth').value),
    units: document.querySelector('#container-units').value
  });
  saveLesson(); renderLessonBoard();
}

function bindLessonEvents() {
  const containerFields = ['#container-diameter', '#container-depth', '#container-units'];
  containerFields.forEach(selector => document.querySelector(selector)?.addEventListener('change', updateContainerFromUI));
  document.querySelector('#lesson-length-input')?.addEventListener('change', event => {
    state.lesson = setTeacherOverride(state.lesson, state.lesson.currentRole, 'length', event.target.value);
    saveLesson(); renderLessonBoard();
  });
  document.querySelector('#annotation-toggle')?.addEventListener('change', event => {
    state.reviewAnnotations = event.target.checked;
    saveLesson(); renderLessonBoard();
  });
  document.querySelectorAll('.role-track button').forEach(button => button.addEventListener('click', () => {
    state.lesson = selectAssemblyRole(state.lesson, button.dataset.role);
    state.focusedRole = state.lesson.currentRole;
    saveLesson(); renderLessonBoard();
  }));
  document.querySelectorAll('.step-track button').forEach(button => button.addEventListener('click', () => {
    state.lesson = selectAssemblyStep(state.lesson, button.dataset.step);
    saveLesson(); renderLessonBoard();
  }));
  document.querySelector('#step-back').addEventListener('click', () => {
    state.lesson = moveAssemblyStep(state.lesson, -1);
    state.focusedRole = state.lesson.currentRole;
    saveLesson(); renderLessonBoard();
  });
  document.querySelector('#step-next').addEventListener('click', () => {
    if (getAssemblyStep(state.lesson) === 'review') {
      if (state.lesson.currentRole === 'object') {
        state.lesson = advanceStem(state.lesson);
        state.focusedRole = 'object';
        state.mode = 'reference';
        saveLesson(); renderAll();
        return;
      }
      state.lesson = { ...advanceStem(state.lesson), assemblyStepIndex: 0 };
      state.focusedRole = state.lesson.currentRole;
    } else state.lesson = moveAssemblyStep(state.lesson, 1);
    saveLesson(); renderLessonBoard();
  });
}

function renderReference(style) {
  const rows = document.querySelector('#reference-rows');
  rows.innerHTML = style.stems.map(stem => {
    const meta = ROLE_META[stem.role];
    return `<tr><th><i style="--stem:${meta.color}"></i>${meta.name}</th><td>${stem.ratio === 1 ? 'Base measure' : `${Math.round(stem.ratio * 100)}% of Subject`}</td><td>${planReading(stem.azimuth).label}</td><td>${stem.elevation}°</td></tr>`;
  }).join('');
}

function bindStemFocus() {
  document.querySelectorAll('.stem').forEach(stem => {
    const focus = () => { state.focusedRole = stem.dataset.role; saveLesson(); renderViews(); };
    stem.addEventListener('click', focus);
    stem.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') focus();
    });
  });
}

function renderViews() {
  const style = activeStyle();
  document.querySelector('#plan-view').innerHTML = renderPlan(style);
  document.querySelector('#front-view').innerHTML = renderFront(style);
  document.querySelector('#spatial-view').innerHTML = renderSpatial(style);
  bindStemFocus();
}

function renderAll() {
  const style = activeStyle();
  document.body.dataset.mode = state.mode;
  document.querySelector('#style-name').textContent = style.name;
  document.querySelector('#style-japanese').textContent = `${style.japanese} · ${style.romanized}`;
  document.querySelector('#style-mood').textContent = style.mood;
  const summary = document.querySelector('#style-summary');
  const insight = document.querySelector('#style-insight');
  if (summary) summary.textContent = style.summary;
  if (insight) insight.textContent = style.insight;
  document.querySelectorAll('[data-style-index]').forEach((button, index) => button.setAttribute('aria-pressed', String(index === state.styleIndex)));
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
  const orientationButton = document.querySelector('#orientation-toggle');
  const mirrored = state.lesson.orientation === 'mirrored';
  orientationButton.setAttribute('aria-pressed', String(mirrored));
  orientationButton.setAttribute('aria-label', mirrored ? 'Use standard arrangement' : 'Mirror arrangement');
  orientationButton.querySelector('.orientation-wide').textContent = mirrored ? 'Use standard arrangement' : 'Mirror arrangement';
  orientationButton.querySelector('.orientation-compact').textContent = mirrored ? 'Standard' : 'Mirror';
  document.body.dataset.orientation = state.lesson.orientation;
  document.querySelectorAll('.lesson-only').forEach(element => { element.hidden = state.mode !== 'lesson'; });
  document.querySelectorAll('.reference-only').forEach(element => { element.hidden = state.mode !== 'reference'; });
  renderViews();
  if (state.mode === 'lesson') {
    try {
      renderLessonBoard();
    } catch (error) {
      const host = document.querySelector('#lesson-host');
      host.dataset.renderError = error.message;
      host.textContent = `Lesson render failed: ${error.message}`;
      console.error(error);
    }
  } else renderReference(style);
}

function renderShell() {
  document.querySelector('#app').innerHTML = `
    <header class="site-header" id="top"><a class="brand" href="#top"><span class="brand-mark">小</span><span><strong>Living Diagram</strong><small>Ohara spatial reference</small></span></a><span class="offline-badge"><i></i> Static · offline ready</span></header>
    <section class="workspace" aria-labelledby="style-name">
      <div class="workspace-toolbar">
        <nav class="style-rail" aria-label="Moribana styles">${STYLES.map((style, index) => `<button data-style-index="${index}" aria-pressed="${index === 0}"><span>0${index + 1}</span>${style.name}</button>`).join('')}</nav>
        <div class="workspace-context"><p id="style-japanese" class="eyebrow"></p><h2 id="style-name"></h2><p id="style-mood" class="mood"></p></div>
        <div class="workspace-actions"><div class="mode-switch" role="group" aria-label="Viewing mode"><button data-mode="lesson" aria-pressed="true">Assemble</button><button data-mode="reference" aria-pressed="false">Reference</button></div><button type="button" id="orientation-toggle" class="orientation-toggle" aria-pressed="false"><span class="orientation-wide">Mirror arrangement</span><span class="orientation-compact" aria-hidden="true">Mirror</span></button><button type="button" class="new-arrangement" aria-label="New arrangement"><span class="new-arrangement-wide">New arrangement</span><span class="new-arrangement-compact" aria-hidden="true">+ New</span></button></div>
      </div>
      <div id="lesson-host" class="lesson-only"></div>
      <div class="reference-only view-grid shared-views" hidden><article class="view-card hero-view"><header><span>01</span> Kenzan / plan</header><div id="plan-view" class="diagram"></div></article><article class="view-card"><header><span>02</span> Front</header><div id="front-view" class="diagram"></div></article><article class="view-card"><header><span>03</span> Spatial</header><div id="spatial-view" class="diagram"></div></article></div>

      <div class="reference-panel reference-only" hidden><aside class="reference-teaching-note"><span class="panel-label">Teaching note</span><section><h3>Geometry status</h3><p>Instructional approximations pending authoritative review.</p></section><section><h3>Reading plan angles</h3><p id="angle-convention">Use the nearest axis—front or rear—then read left or right as seen from above.</p></section></aside><div class="table-wrap"><table><thead><tr><th>Stem</th><th>Length</th><th>Plan</th><th>Elevation</th></tr></thead><tbody id="reference-rows"></tbody></table></div></div>
    </section>
    <section class="intro"><div><p class="eyebrow">A practical guide beside the flowers</p><h1>One stem at a time.<br><em>Build the whole form.</em></h1></div><div class="intro-copy"><p>Move through length, Kenzan placement, plan direction, and elevation at your own pace. Each step keeps one decision in focus.</p></div></section>`;

  document.querySelectorAll('[data-style-index]').forEach(button => button.addEventListener('click', () => {
    state.styleIndex = Number(button.dataset.styleIndex);
    saveLesson(); renderAll();
  }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    saveLesson(); renderAll();
  }));
  document.querySelector('#orientation-toggle').addEventListener('click', () => {
    state.lesson = setOrientation(state.lesson, state.lesson.orientation === 'normal' ? 'mirrored' : 'normal');
    saveLesson(); renderAll();
  });
  document.querySelector('.new-arrangement').addEventListener('click', () => {
    state.styleIndex = 0;
    state.focusedRole = 'subject';
    state.mode = 'lesson';
    state.lesson = resetSession();
    state.reviewAnnotations = true;
    saveLesson();
    renderAll();
  });
  renderAll();
}

document.addEventListener('DOMContentLoaded', renderShell);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));

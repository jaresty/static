const LENGTH_RATIOS = Object.freeze({
  subject: 1,
  secondary: 0.67,
  object: 0.5
});

const STEM_BLUEPRINTS = Object.freeze({
  subject: {
    kenzan: { x: 42, y: 42, label: 'rear-left of center', status: 'editorial-approximation' },
    plan: { value: -8, reference: 'container front', status: 'editorial-approximation' },
    elevation: { value: 80, reference: 'horizontal plane', status: 'editorial-approximation' }
  },
  secondary: {
    kenzan: { x: 38, y: 46, label: 'left of the Subject', status: 'editorial-approximation' },
    plan: { value: 30, reference: 'container front', status: 'source-aligned-provisional' },
    elevation: { value: 45, reference: 'horizontal plane', status: 'editorial-approximation' }
  },
  object: {
    kenzan: { x: 46, y: 47, label: 'right-front of the Subject', status: 'editorial-approximation' },
    plan: { value: -15, reference: 'container front', status: 'source-aligned-provisional' },
    elevation: { value: 30, reference: 'horizontal plane', status: 'editorial-approximation' }
  }
});

const ROLES = Object.freeze(['subject', 'secondary', 'object']);
const ASSEMBLY_STEPS = Object.freeze(['length', 'kenzan', 'plan', 'elevation', 'review']);
const CHECKPOINTS = Object.freeze(['length', 'kenzan', 'plan', 'elevation', 'teacher']);

const round = value => Math.round(value * 10) / 10;
const boundedNumber = (value, minimum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, number) : minimum;
};

function normalizeContainer(container) {
  return {
    diameter: boundedNumber(container.diameter, 1),
    depth: boundedNumber(container.depth, 0),
    units: container.units === 'in' ? 'in' : 'cm'
  };
}

function calculateLengths(container) {
  const base = Number(container.diameter) + Number(container.depth);
  return {
    subject: round(base * LENGTH_RATIOS.subject),
    secondary: round(base * LENGTH_RATIOS.secondary),
    object: round(base * LENGTH_RATIOS.object)
  };
}

function defaultTargets(lengths) {
  return Object.fromEntries(Object.entries(lengths).map(([role, length]) => [role, {
    length: { value: length, defaultValue: length, status: 'default' }
  }]));
}

function updateTargetDefaults(targets, lengths) {
  return Object.fromEntries(Object.entries(targets).map(([role, target]) => {
    const defaultValue = lengths[role];
    const length = target.length.status === 'teacher-adjusted'
      ? { ...target.length, defaultValue }
      : { value: defaultValue, defaultValue, status: 'default' };
    return [role, { ...target, length }];
  }));
}

export function createSession({ diameter = 30, depth = 10, units = 'cm' } = {}) {
  const container = normalizeContainer({ diameter, depth, units });
  const lengths = calculateLengths(container);
  return {
    container,
    lengths,
    targets: defaultTargets(lengths),
    currentRole: 'subject',
    orientation: 'normal',
    assemblyStepIndex: 0,
    checkpoints: [],
    completedRoles: []
  };
}

export function updateContainer(session, changes) {
  const container = normalizeContainer({ ...session.container, ...changes });
  const lengths = calculateLengths(container);
  return {
    ...session,
    container,
    lengths,
    targets: updateTargetDefaults(session.targets, lengths)
  };
}

export function setTeacherOverride(session, role, field, value) {
  const target = session.targets[role];
  return {
    ...session,
    targets: {
      ...session.targets,
      [role]: {
        ...target,
        [field]: { ...target[field], value: boundedNumber(value, 0.1), status: 'teacher-adjusted' }
      }
    }
  };
}

export function getAssemblyStep(session) {
  return ASSEMBLY_STEPS[session.assemblyStepIndex ?? 0];
}

export function moveAssemblyStep(session, delta) {
  const current = session.assemblyStepIndex ?? 0;
  if (delta < 0 && current === 0) {
    const roleIndex = ROLES.indexOf(session.currentRole);
    if (roleIndex > 0) {
      return {
        ...session,
        currentRole: ROLES[roleIndex - 1],
        assemblyStepIndex: ASSEMBLY_STEPS.length - 1
      };
    }
  }
  const assemblyStepIndex = Math.max(0, Math.min(ASSEMBLY_STEPS.length - 1, current + delta));
  return { ...session, assemblyStepIndex };
}

export function selectAssemblyRole(session, role) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
  return { ...session, currentRole: role, assemblyStepIndex: 0 };
}

export function selectAssemblyStep(session, step) {
  const assemblyStepIndex = ASSEMBLY_STEPS.indexOf(step);
  if (assemblyStepIndex < 0) throw new Error(`Unknown assembly step: ${step}`);
  return { ...session, assemblyStepIndex };
}

export function toggleCheckpoint(session, checkpoint) {
  if (!CHECKPOINTS.includes(checkpoint)) throw new Error(`Unknown checkpoint: ${checkpoint}`);
  const active = session.checkpoints.includes(checkpoint);
  const checkpoints = active
    ? session.checkpoints.filter(item => item !== checkpoint)
    : [...session.checkpoints, checkpoint];
  return { ...session, checkpoints };
}

export function advanceStem(session) {
  const index = ROLES.indexOf(session.currentRole);
  const completedRoles = [...new Set([...session.completedRoles, session.currentRole])];
  return {
    ...session,
    currentRole: ROLES[Math.min(index + 1, ROLES.length - 1)],
    completedRoles,
    checkpoints: [],
    lessonComplete: index === ROLES.length - 1
  };
}

export function getCurrentStem(session) {
  const role = session.currentRole;
  return {
    role,
    details: {
      length: session.targets[role].length,
      kenzan: { ...STEM_BLUEPRINTS[role].kenzan },
      plan: { ...STEM_BLUEPRINTS[role].plan },
      elevation: { ...STEM_BLUEPRINTS[role].elevation }
    }
  };
}

export function setOrientation(session, orientation) {
  if (!['normal', 'mirrored'].includes(orientation)) throw new Error(`Unknown orientation: ${orientation}`);
  return { ...session, orientation };
}

export function getDisplayStem(session) {
  const stem = getCurrentStem(session);
  if (session.orientation !== 'mirrored') return stem;
  return {
    ...stem,
    details: {
      ...stem.details,
      kenzan: { ...stem.details.kenzan, x: 100 - stem.details.kenzan.x },
      plan: { ...stem.details.plan, value: -stem.details.plan.value }
    }
  };
}

export function serializeSession(session) {
  return JSON.stringify({ version: 1, session });
}

export function restoreSession(payload) {
  const parsed = JSON.parse(payload);
  if (parsed.version !== 1 || !parsed.session) throw new Error('Unsupported lesson session');
  return parsed.session;
}

export function resetSession() {
  return createSession();
}

export function resetOverrides(session) {
  const targets = Object.fromEntries(Object.entries(session.targets).map(([role, target]) => [role, {
    ...target,
    length: {
      value: target.length.defaultValue,
      defaultValue: target.length.defaultValue,
      status: 'default'
    }
  }]));
  return { ...session, targets };
}

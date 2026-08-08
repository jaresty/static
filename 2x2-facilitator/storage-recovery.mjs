import { compactWorkshop } from './core.mjs';

const WORKSHOP_KEY = 'quadrant:workshop:v1';
const RESPONSE_PREFIX = 'quadrant:response:v1:';

const isEligibleKey = (key) => key === WORKSHOP_KEY || key.startsWith(RESPONSE_PREFIX);
const isWorkshop = (value) => Boolean(value
  && typeof value === 'object'
  && typeof value.prompt === 'string'
  && Array.isArray(value.items)
  && value.positions
  && Array.isArray(value.history));

export function compactQuadrantStorage(storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key) => key && isEligibleKey(key));
  let compacted = 0;
  let reclaimedBytes = 0;

  for (const key of keys) {
    const current = storage.getItem(key);
    try {
      const parsed = JSON.parse(current);
      if (!isWorkshop(parsed)) continue;
      const compact = JSON.stringify(compactWorkshop(parsed));
      if (compact.length >= current.length) continue;
      storage.setItem(key, compact);
      compacted += 1;
      reclaimedBytes += current.length - compact.length;
    } catch {
      // Preserve malformed or currently unwritable values byte-for-byte.
    }
  }

  return { compacted, reclaimedBytes };
}

export function persistWithRecovery(storage, key, session) {
  const serialized = JSON.stringify(session);
  try {
    storage.setItem(key, serialized);
    return { status: 'saved', compacted: 0, reclaimedBytes: 0 };
  } catch (error) {
    if (error?.name !== 'QuotaExceededError') throw error;
  }

  const recovery = compactQuadrantStorage(storage);
  if (recovery.reclaimedBytes > 0) {
    try {
      storage.setItem(key, serialized);
      return { status: 'recovered', ...recovery };
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error;
    }
  }
  return { status: 'full', ...recovery };
}

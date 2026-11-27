/**
 * College of Keys — Issues #26 (Tavern Crowd Meter) & #64 (Setlists)
 * Pure helpers for audience mood/XP multiplier calculation and setlist queue/persistence.
 */

const SETLISTS_STORAGE_KEY = 'collegeOfKeys.savedSetlists.v1';

const CROWD_MOODS = [
  { id: 'asleep', label: 'Asleep', emoji: '\uD83D\uDE34', minEnergy: 0, xpMultiplier: 0.7 },
  { id: 'warming', label: 'Warming Up', emoji: '\uD83C\uDF7A', minEnergy: 25, xpMultiplier: 1.0 },
  { id: 'rowdy', label: 'Rowdy', emoji: '\uD83C\uDF7B', minEnergy: 55, xpMultiplier: 1.25 },
  { id: 'enchanted', label: 'Enchanted', emoji: '\u2728', minEnergy: 80, xpMultiplier: 1.5 }
];

function clampCrowdEnergy(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function getCrowdMoodForEnergy(energy = 50) {
  const clamped = clampCrowdEnergy(energy);
  let matched = CROWD_MOODS[0];
  for (const mood of CROWD_MOODS) {
    if (clamped >= mood.minEnergy) matched = mood;
  }
  return {
    ...matched,
    energy: Math.round(clamped)
  };
}

function applyCrowdEnergyDelta(energy, delta) {
  return clampCrowdEnergy(clampCrowdEnergy(energy) + (Number(delta) || 0));
}

function normalizeSetlistItem(item) {
  if (!item || typeof item !== 'object') return null;
  const songId = typeof item.songId === 'string' ? item.songId.trim() : '';
  const fileName = typeof item.fileName === 'string' ? item.fileName.trim() : '';
  const filePath = typeof item.filePath === 'string' ? item.filePath.trim() : '';
  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : (fileName || 'Untitled Spell');
  if (!songId && !fileName && !filePath) return null;
  return { songId, fileName, filePath, title };
}

function createSetlistRecord(name, items = [], existingId = null) {
  const cleanName = String(name || '').trim() || 'Untitled Gig';
  const cleanItems = (Array.isArray(items) ? items : []).map(normalizeSetlistItem).filter(Boolean);
  const now = Date.now();
  return {
    id: existingId || `setlist_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    items: cleanItems,
    updatedAt: now
  };
}

function moveSetlistItem(items = [], index, delta) {
  if (!Array.isArray(items)) return [];
  const next = [...items];
  const target = index + delta;
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next;
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

function removeSetlistItem(items = [], index) {
  if (!Array.isArray(items)) return [];
  return items.filter((_, i) => i !== index);
}

function loadSavedSetlists(storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store || typeof store.getItem !== 'function') return [];
  try {
    const raw = store.getItem(SETLISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.name === 'string' && Array.isArray(s.items))
      .map((s) => ({
        id: String(s.id || `setlist_${Math.random().toString(36).slice(2, 7)}`),
        name: s.name.trim() || 'Untitled Gig',
        items: s.items.map(normalizeSetlistItem).filter(Boolean),
        updatedAt: Number(s.updatedAt) || Date.now()
      }));
  } catch {
    return [];
  }
}

function writeSavedSetlists(list, storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store || typeof store.setItem !== 'function') return;
  try {
    store.setItem(SETLISTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

function saveSetlistRecord(record, storage = null) {
  const all = loadSavedSetlists(storage);
  const nextRecord = createSetlistRecord(record?.name, record?.items, record?.id);
  const idx = all.findIndex((s) => s.id === nextRecord.id || s.name.toLowerCase() === nextRecord.name.toLowerCase());
  if (idx >= 0) {
    nextRecord.id = all[idx].id;
    all[idx] = nextRecord;
  } else {
    all.unshift(nextRecord);
  }
  writeSavedSetlists(all, storage);
  return nextRecord;
}

function deleteSetlistRecord(id, storage = null) {
  const all = loadSavedSetlists(storage).filter((s) => s.id !== id);
  writeSavedSetlists(all, storage);
  return all;
}

const CROWD_FAIL_POLICY_STORAGE_KEY = 'collegeOfKeys.crowdFailPolicy.v1';
const CROWD_RECOVERY_HIT_TARGET = 10;

function normalizeCrowdFailPolicy(value) {
  return value === 'continue' ? 'continue' : 'end';
}

function loadCrowdFailPolicy(storage = null) {
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!store || typeof store.getItem !== 'function') return 'end';
  try {
    return normalizeCrowdFailPolicy(store.getItem(CROWD_FAIL_POLICY_STORAGE_KEY));
  } catch {
    return 'end';
  }
}

function saveCrowdFailPolicy(policy, storage = null) {
  const normalized = normalizeCrowdFailPolicy(policy);
  const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (store && typeof store.setItem === 'function') {
    try {
      store.setItem(CROWD_FAIL_POLICY_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage errors
    }
  }
  return normalized;
}

function parseSpellTierIndex(tierIndexOrLevel) {
  if (typeof tierIndexOrLevel === 'number' && Number.isFinite(tierIndexOrLevel)) {
    return Math.max(0, Math.min(9, Math.floor(tierIndexOrLevel)));
  }
  const str = String(tierIndexOrLevel || '').toLowerCase();
  if (!str || str.includes('cantrip')) return 0;
  const match = str.match(/([1-9])/);
  if (match) return Number(match[1]);
  return 0;
}

/**
 * Issue #164: Miss streak thresholds scaled by auto-difficulty spell tier.
 * - Cantrip – 2nd level (0–2): 15 misses to warn, 8 more to boo off
 * - 3rd – 5th level (3–5): 10 misses to warn, 5 more to boo off
 * - 6th – 9th level (6–9): 7 misses to warn, 4 more to boo off
 */
function getCrowdWarningThreshold(tierIndexOrLevel = 0) {
  const tierIdx = parseSpellTierIndex(tierIndexOrLevel);
  if (tierIdx <= 2) {
    return { tierIndex: tierIdx, warningMisses: 15, booOffMisses: 8 };
  }
  if (tierIdx <= 5) {
    return { tierIndex: tierIdx, warningMisses: 10, booOffMisses: 5 };
  }
  return { tierIndex: tierIdx, warningMisses: 7, booOffMisses: 4 };
}

function createCrowdFailState() {
  return {
    status: 'normal', // 'normal' | 'warning' | 'booed'
    missStreak: 0,
    warningMissStreak: 0,
    recoveryHitStreak: 0,
    hasBooedOffThisRun: false
  };
}

function isCrowdFailStateActive({
  waitMode = false,
  stageViewMode = 'highway',
  tutorialActive = false,
  accompanimentMode = 'off',
  rehearsalLoopEnabled = false
} = {}) {
  if (waitMode) return false;
  if (stageViewMode === 'karaoke') return false;
  if (tutorialActive) return false;
  if (accompanimentMode === 'auto-both') return false;
  if (rehearsalLoopEnabled) return false;
  return true;
}

function advanceCrowdFailOnHit(failState, { noteCount = 1, active = true } = {}) {
  const cur = failState && typeof failState === 'object' ? failState : createCrowdFailState();
  const next = {
    ...cur,
    missStreak: 0,
    warningMissStreak: 0
  };
  if (!active || cur.status !== 'warning') {
    return { nextState: next, event: null, recoveryTarget: CROWD_RECOVERY_HIT_TARGET };
  }
  const gain = Math.max(1, Number(noteCount) || 1);
  next.recoveryHitStreak = (Number(cur.recoveryHitStreak) || 0) + gain;
  if (next.recoveryHitStreak >= CROWD_RECOVERY_HIT_TARGET) {
    next.status = 'normal';
    next.recoveryHitStreak = 0;
    return { nextState: next, event: 'recovered', recoveryTarget: CROWD_RECOVERY_HIT_TARGET };
  }
  return { nextState: next, event: 'recovering', recoveryTarget: CROWD_RECOVERY_HIT_TARGET };
}

function advanceCrowdFailOnMiss(failState, { tierIndexOrLevel = 0, active = true } = {}) {
  const cur = failState && typeof failState === 'object' ? failState : createCrowdFailState();
  if (!active || cur.hasBooedOffThisRun) {
    return { nextState: { ...cur }, event: null, thresholds: getCrowdWarningThreshold(tierIndexOrLevel) };
  }
  const thresholds = getCrowdWarningThreshold(tierIndexOrLevel);
  const next = {
    ...cur,
    recoveryHitStreak: 0
  };
  if (cur.status === 'normal') {
    next.missStreak = (Number(cur.missStreak) || 0) + 1;
    if (next.missStreak >= thresholds.warningMisses) {
      next.status = 'warning';
      next.warningMissStreak = 0;
      return { nextState: next, event: 'warning', thresholds };
    }
    return { nextState: next, event: null, thresholds };
  }
  if (cur.status === 'warning') {
    next.warningMissStreak = (Number(cur.warningMissStreak) || 0) + 1;
    if (next.warningMissStreak >= thresholds.booOffMisses) {
      next.status = 'booed';
      next.hasBooedOffThisRun = true;
      return { nextState: next, event: 'booed', thresholds };
    }
    return { nextState: next, event: null, thresholds };
  }
  return { nextState: next, event: null, thresholds };
}

module.exports = {
  SETLISTS_STORAGE_KEY,
  CROWD_MOODS,
  CROWD_FAIL_POLICY_STORAGE_KEY,
  CROWD_RECOVERY_HIT_TARGET,
  clampCrowdEnergy,
  getCrowdMoodForEnergy,
  applyCrowdEnergyDelta,
  normalizeCrowdFailPolicy,
  loadCrowdFailPolicy,
  saveCrowdFailPolicy,
  parseSpellTierIndex,
  getCrowdWarningThreshold,
  createCrowdFailState,
  isCrowdFailStateActive,
  advanceCrowdFailOnHit,
  advanceCrowdFailOnMiss,
  normalizeSetlistItem,
  createSetlistRecord,
  moveSetlistItem,
  removeSetlistItem,
  loadSavedSetlists,
  saveSetlistRecord,
  deleteSetlistRecord
};

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

module.exports = {
  SETLISTS_STORAGE_KEY,
  CROWD_MOODS,
  clampCrowdEnergy,
  getCrowdMoodForEnergy,
  applyCrowdEnergyDelta,
  normalizeSetlistItem,
  createSetlistRecord,
  moveSetlistItem,
  removeSetlistItem,
  loadSavedSetlists,
  saveSetlistRecord,
  deleteSetlistRecord
};

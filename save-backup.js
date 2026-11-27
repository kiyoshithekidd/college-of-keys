'use strict';

/**
 * Issue #185: 1-Click Bard Save Backup (Export & Import Player Progress)
 * Bundles all 4 central JSON save stores + all 17 localStorage keys into a
 * single schema-versioned .json archive with pre-import safety backup.
 */

const fs = require('fs');
const path = require('path');

const SAVE_BACKUP_SCHEMA_VERSION = 1;
const SAVE_BACKUP_APP_ID = 'college-of-keys';

const MANAGED_SAVE_FILES = [
  'bard_profile.json',
  'song_stats.json',
  'grimoire_library.json',
  'grimoire_bundles.json'
];

const MANAGED_LOCAL_STORAGE_KEYS = [
  'collegeOfKeys_bardProfile_v1',
  'collegeOfKeys_songStats_v1',
  'collegeOfKeys_hasSeenIntro_v1',
  'collegeOfKeys_grimoire_v1',
  'collegeOfKeys_grimoire_favorites_v1',
  'collegeOfKeys_grimoire_attuned_filter_v1',
  'collegeOfKeys_midiCleanup_v1',
  'collegeOfKeys_bountiesCollapsed_v1',
  'collegeOfKeys.inputLatencyOffsetMs',
  'collegeOfKeys.showChordBanner',
  'collegeOfKeys.savedSetlists.v1',
  'collegeOfKeys.crowdFailPolicy.v1',
  'collegeOfKeys.highwayScrollSpeed.v1',
  'collegeOfKeys.fallingNoteLabels.v1',
  'collegeOfKeys.sustainPedalLane.v1',
  'collegeOfKeys.metronomeCountIn.v1',
  'collegeOfKeys.metronomeClick.v1',
  'collegeOfKeys.midiOutputDeviceId.v1',
  'collegeOfKeys.midiOutputChannel.v1',
  'collegeOfKeys.midiOutputMuteLocal.v1',
  'collegeOfKeys.arcaneDrills.v1'
];

function buildSaveBackupPayload({
  repoDir,
  storage = null,
  appVersion = '1.10.0',
  fsImpl = fs
} = {}) {
  const files = {};
  for (const fileName of MANAGED_SAVE_FILES) {
    const fullPath = path.join(repoDir, fileName);
    if (fsImpl.existsSync(fullPath)) {
      try {
        const raw = fsImpl.readFileSync(fullPath, 'utf8');
        files[fileName] = JSON.parse(raw);
      } catch {
        files[fileName] = null;
      }
    } else {
      files[fileName] = null;
    }
  }

  const localStorageDump = {};
  if (storage && typeof storage.getItem === 'function') {
    for (const key of MANAGED_LOCAL_STORAGE_KEYS) {
      const val = storage.getItem(key);
      if (val !== null && val !== undefined) {
        localStorageDump[key] = String(val);
      }
    }
  }

  return {
    schemaVersion: SAVE_BACKUP_SCHEMA_VERSION,
    app: SAVE_BACKUP_APP_ID,
    appVersion: String(appVersion || '1.10.0'),
    exportedAt: new Date().toISOString(),
    files,
    localStorage: localStorageDump
  };
}

function validateAndSummarizeSaveBackup(rawInput) {
  let parsed = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch (err) {
      return { ok: false, error: `Invalid JSON file: ${err.message}` };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Backup file must contain a JSON object.' };
  }
  if (parsed.app !== SAVE_BACKUP_APP_ID) {
    return { ok: false, error: 'This file is not a College of Keys save backup.' };
  }
  if (Number(parsed.schemaVersion) !== SAVE_BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported save schema version: ${parsed.schemaVersion}.` };
  }
  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    return { ok: false, error: 'Save backup is missing the files section.' };
  }
  if (parsed.localStorage !== undefined) {
    if (typeof parsed.localStorage !== 'object' || Array.isArray(parsed.localStorage)) {
      return { ok: false, error: 'Save backup has an invalid localStorage section.' };
    }
    for (const [k, v] of Object.entries(parsed.localStorage)) {
      if (v !== null && v !== undefined && typeof v !== 'string') {
        return { ok: false, error: `Invalid localStorage value for key "${k}": expected string.` };
      }
    }
  }

  const profile = parsed.files['bard_profile.json'];
  const stats = parsed.files['song_stats.json'];
  const bundles = parsed.files['grimoire_bundles.json'];

  let setlistsCount = 0;
  try {
    const rawSetlists = parsed.localStorage && parsed.localStorage['collegeOfKeys.savedSetlists.v1'];
    if (rawSetlists) {
      const arr = JSON.parse(rawSetlists);
      if (Array.isArray(arr)) setlistsCount = arr.length;
    }
  } catch {
    // Ignore invalid setlists preview
  }

  const summary = {
    exportedAt: parsed.exportedAt || null,
    appVersion: parsed.appVersion || 'Unknown',
    bardLevel: Number(profile?.level) || 1,
    totalXp: Number(profile?.totalXp) || 0,
    songsCompleted: Number(profile?.songsCompleted) || 0,
    songsTracked: stats && typeof stats === 'object' ? Object.keys(stats).length : 0,
    bundlesCount: bundles && typeof bundles === 'object' ? Object.keys(bundles).length : 0,
    setlistsCount
  };

  return { ok: true, payload: parsed, summary };
}

function applySaveBackupPayload({
  payload,
  repoDir,
  storage = null,
  fsImpl = fs,
  backupRootDir = null
} = {}) {
  const check = validateAndSummarizeSaveBackup(payload);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const cleanPayload = check.payload;

  // Create pre-import safety backup of existing JSON files
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetBackupDir = path.join(
    backupRootDir || path.join(repoDir, 'save_backups'),
    `pre-import-${stamp}`
  );
  let backedUpCount = 0;
  for (const fileName of MANAGED_SAVE_FILES) {
    const srcPath = path.join(repoDir, fileName);
    if (fsImpl.existsSync(srcPath)) {
      if (!fsImpl.existsSync(targetBackupDir)) {
        fsImpl.mkdirSync(targetBackupDir, { recursive: true });
      }
      fsImpl.copyFileSync(srcPath, path.join(targetBackupDir, fileName));
      backedUpCount += 1;
    }
  }

  // Write (or clear) all managed JSON files
  for (const fileName of MANAGED_SAVE_FILES) {
    const destPath = path.join(repoDir, fileName);
    const val = cleanPayload.files[fileName];
    if (val !== undefined && val !== null) {
      const tmpPath = `${destPath}.tmp`;
      fsImpl.writeFileSync(tmpPath, JSON.stringify(val, null, 2), 'utf8');
      fsImpl.renameSync(tmpPath, destPath);
    } else if (fsImpl.existsSync(destPath)) {
      fsImpl.unlinkSync(destPath);
    }
  }

  // Restore all managed localStorage keys (removing keys absent in backup)
  const lsMap = cleanPayload.localStorage || {};
  if (storage && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function') {
    for (const key of MANAGED_LOCAL_STORAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(lsMap, key) && lsMap[key] !== undefined && lsMap[key] !== null) {
        storage.setItem(key, String(lsMap[key]));
      } else {
        storage.removeItem(key);
      }
    }
  }

  if (backedUpCount > 0) {
    try {
      const parentDir = path.dirname(targetBackupDir);
      const oldDirs = fsImpl.readdirSync(parentDir)
        .filter((name) => name.startsWith('pre-import-'))
        .sort();
      if (oldDirs.length > 10) {
        for (const oldName of oldDirs.slice(0, oldDirs.length - 10)) {
          fsImpl.rmSync(path.join(parentDir, oldName), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore pruning errors
    }
  }

  return {
    ok: true,
    backedUpCount,
    backupDir: backedUpCount > 0 ? targetBackupDir : null,
    summary: check.summary
  };
}

module.exports = {
  SAVE_BACKUP_SCHEMA_VERSION,
  SAVE_BACKUP_APP_ID,
  MANAGED_SAVE_FILES,
  MANAGED_LOCAL_STORAGE_KEYS,
  buildSaveBackupPayload,
  validateAndSummarizeSaveBackup,
  applySaveBackupPayload
};

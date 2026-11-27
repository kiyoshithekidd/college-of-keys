'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SAVE_BACKUP_SCHEMA_VERSION,
  MANAGED_SAVE_FILES,
  MANAGED_LOCAL_STORAGE_KEYS,
  buildSaveBackupPayload,
  validateAndSummarizeSaveBackup,
  applySaveBackupPayload
} = require('../save-backup');

function createMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map.entries())
  };
}

test('#185 buildSaveBackupPayload & validateAndSummarizeSaveBackup round-trip', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-save-export-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'bard_profile.json'),
      JSON.stringify({ level: 12, totalXp: 48500, songsCompleted: 19 }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'song_stats.json'),
      JSON.stringify({ 'builtin::demo': { bestAccuracy: 96 }, abc123: { bestAccuracy: 88 } }),
      'utf8'
    );
    const storage = createMockStorage({
      'collegeOfKeys.highwayScrollSpeed.v1': '1.5',
      'collegeOfKeys.savedSetlists.v1': JSON.stringify([{ name: 'Tavern Night', items: [] }])
    });

    const payload = buildSaveBackupPayload({ repoDir: tmpDir, storage, appVersion: '1.10.0' });
    assert.equal(payload.schemaVersion, SAVE_BACKUP_SCHEMA_VERSION);
    assert.equal(Object.keys(payload.files).length, MANAGED_SAVE_FILES.length);
    assert.equal(payload.localStorage['collegeOfKeys.highwayScrollSpeed.v1'], '1.5');

    const res = validateAndSummarizeSaveBackup(JSON.stringify(payload));
    assert.equal(res.ok, true);
    assert.equal(res.summary.bardLevel, 12);
    assert.equal(res.summary.totalXp, 48500);
    assert.equal(res.summary.songsTracked, 2);
    assert.equal(res.summary.setlistsCount, 1);

    assert.equal(validateAndSummarizeSaveBackup('{bad json').ok, false);
    assert.equal(validateAndSummarizeSaveBackup({ app: 'other-app', schemaVersion: 1, files: {} }).ok, false);
    assert.equal(validateAndSummarizeSaveBackup({ app: 'college-of-keys', schemaVersion: 99, files: {} }).ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('#185 applySaveBackupPayload creates pre-import backup, restores files, and clears stale localStorage keys', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-save-import-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'bard_profile.json'), JSON.stringify({ level: 2, totalXp: 100 }), 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'song_stats.json'), JSON.stringify({ old: {} }), 'utf8');

    const storage = createMockStorage({
      'collegeOfKeys.highwayScrollSpeed.v1': '2.2',
      'collegeOfKeys.crowdFailPolicy.v1': 'continue'
    });

    const incoming = {
      schemaVersion: 1,
      app: 'college-of-keys',
      appVersion: '1.10.0',
      exportedAt: '2026-11-26T18:00:00.000Z',
      files: {
        'bard_profile.json': { level: 9, totalXp: 22000, songsCompleted: 11 },
        'song_stats.json': null,
        'grimoire_library.json': null,
        'grimoire_bundles.json': null
      },
      localStorage: {
        'collegeOfKeys.highwayScrollSpeed.v1': '1.4'
      }
    };

    const outcome = applySaveBackupPayload({ payload: incoming, repoDir: tmpDir, storage });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.backedUpCount, 2);
    assert.ok(outcome.backupDir && fs.existsSync(path.join(outcome.backupDir, 'bard_profile.json')));

    const restoredProfile = JSON.parse(fs.readFileSync(path.join(tmpDir, 'bard_profile.json'), 'utf8'));
    assert.equal(restoredProfile.level, 9);
    assert.equal(fs.existsSync(path.join(tmpDir, 'song_stats.json')), false);
    assert.equal(storage.getItem('collegeOfKeys.highwayScrollSpeed.v1'), '1.4');
    assert.equal(storage.getItem('collegeOfKeys.crowdFailPolicy.v1'), null);
    assert.ok(MANAGED_LOCAL_STORAGE_KEYS.includes('collegeOfKeys.crowdFailPolicy.v1'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

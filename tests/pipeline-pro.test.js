'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  formatTapSyncTimestamp,
  parseEditableLyricLines,
  createTapSyncSession
} = require('../lyrics-sync-editor.js');
const {
  clampLoudnessGainDb,
  computeLoudnessGainDb,
  applyLoudnessGainToVolume,
  estimateIntegratedLufsFromPcm
} = require('../loudness-normalizer.js');
const {
  saveBundleRecord,
  resolveBundleForSong
} = require('../song-bundle.js');

test('#175 Tap-to-Sync parses UTF-8/LRC lines, stamps Space taps, undoes, nudges, re-anchors & serializes .lrc', () => {
  const input = [
    '[ar:Test Bard]',
    'Café lumière line one',
    '[00:10.00] Line two already timed',
    'Line three plain'
  ].join('\n');

  const lines = parseEditableLyricLines(input);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].text, 'Café lumière line one');
  assert.equal(lines[0].timeSec, null);
  assert.equal(lines[1].timeSec, 10.0);

  const session = createTapSyncSession(input);
  const t1 = session.tapCurrentLine(2.35);
  assert.equal(t1.stamped, true);
  assert.equal(t1.stampedTime, 2.35);
  assert.equal(session.getState().activeIndex, 1);

  assert.equal(session.undoLastTap(), true);
  assert.equal(session.getState().activeIndex, 0);
  assert.equal(session.getState().lines[0].timeSec, null);

  session.tapCurrentLine(3.0);
  session.tapCurrentLine(12.0);
  session.tapCurrentLine(18.0);
  session.nudgeLine(1, -0.5);
  assert.equal(session.getState().lines[1].timeSec, 11.5);

  // Re-anchor line 1 to 13.5 (+2.0s) -> shifts line 1 and line 2 by +2.0s
  const shifted = session.reanchorFromLine(1, 13.5);
  assert.equal(shifted, 2);
  assert.equal(session.getState().lines[1].timeSec, 13.5);
  assert.equal(session.getState().lines[2].timeSec, 20.0);

  const lrc = session.serializeToLrc();
  assert.ok(lrc.includes('[00:03.00] Café lumière line one'));
  assert.ok(lrc.includes('[00:13.50] Line two already timed'));
  assert.ok(lrc.includes('[00:20.00] Line three plain'));
  assert.equal(formatTapSyncTimestamp(65.5), '[01:05.50]');
});

test('#177 Loudness Normalizer clamps gain [-12, +6 dB], honors -1 dBTP ceiling, and keeps muted strictly 0', () => {
  assert.equal(clampLoudnessGainDb(-20), -12);
  assert.equal(clampLoudnessGainDb(15), 6);

  // Quiet track (-20 LUFS) with -8 dBTP peak -> +6 dB clamped boost (peak becomes -2 dBTP <= -1 dBTP)
  assert.equal(computeLoudnessGainDb(-20, -8), 6);
  // Quiet track (-18 LUFS) with -2.5 dBTP peak -> limited to +1.5 dB so peak stays <= -1.0 dBTP
  assert.equal(computeLoudnessGainDb(-18, -2.5), 1.5);
  // Loud mastered track (-8 LUFS) -> -6 dB reduction to reach -14 LUFS
  assert.equal(computeLoudnessGainDb(-8, -0.2), -6);

  // Muted (0) must always remain strictly 0 regardless of boost
  assert.equal(applyLoudnessGainToVolume(0, 6, true), 0);
  assert.equal(applyLoudnessGainToVolume(0.5, 6, false), 0.5);
  assert.ok(applyLoudnessGainToVolume(0.4, 6, true) > 0.75);

  const pcmEst = estimateIntegratedLufsFromPcm(new Float32Array([0.1, -0.1, 0.1, -0.1]));
  assert.ok(pcmEst && pcmEst.integratedLufs < -14);
});

test('#177 song-bundle persists and resolves loudnessGainDb cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-lufs-'));
  try {
    const storePath = path.join(tmpDir, 'grimoire_bundles.json');
    const midiPath = path.join(tmpDir, 'acoustic.mid');
    fs.writeFileSync(midiPath, 'MThd');

    saveBundleRecord({
      storePath,
      projectRoot: tmpDir,
      importsDir: tmpDir,
      writeSidecar: true,
      record: {
        notesPath: midiPath,
        title: 'Acoustic Ballad',
        loudnessGainDb: 4.5
      }
    });

    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    const resolved = resolveBundleForSong({
      filePath: midiPath,
      store,
      projectRoot: tmpDir
    });
    assert.equal(resolved.loudnessGainDb, 4.5);
    assert.equal(resolved.hasCustomBundle, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

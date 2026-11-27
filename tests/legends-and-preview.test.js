'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HALL_OF_LEGENDS_BONUS_XP,
  isQualifyingLegendRun,
  evaluatePersonalRecordUpdate,
  computeHallOfLegends,
  formatLegendDate
} = require('../hall-of-legends');

const {
  PREVIEW_DURATION_SEC,
  hasPreviewBackingAudio,
  getAvailablePreviewSources,
  slicePreviewNotes,
  createGrimoirePreviewController
} = require('../grimoire-preview');

test('#162 isQualifyingLegendRun enforces full-difficulty piano & 80% coverage', () => {
  const base = {
    stageViewMode: 'highway',
    waitMode: false,
    playbackSpeed: 1.0,
    handIsolation: 'both',
    accompanimentMode: 'off',
    rehearsalLoopEnabled: false,
    encoreDrillActive: false,
    totalAttempts: 85,
    totalNotes: 100
  };
  assert.equal(isQualifyingLegendRun(base), true);
  assert.equal(isQualifyingLegendRun({ ...base, stageViewMode: 'karaoke' }), false);
  assert.equal(isQualifyingLegendRun({ ...base, waitMode: true }), false);
  assert.equal(isQualifyingLegendRun({ ...base, playbackSpeed: 0.75 }), false);
  assert.equal(isQualifyingLegendRun({ ...base, handIsolation: 'right' }), false);
  assert.equal(isQualifyingLegendRun({ ...base, accompanimentMode: 'auto-both' }), false);
  assert.equal(isQualifyingLegendRun({ ...base, rehearsalLoopEnabled: true }), false);
  assert.equal(isQualifyingLegendRun({ ...base, encoreDrillActive: true }), false);
  assert.equal(isQualifyingLegendRun({ ...base, totalAttempts: 79, totalNotes: 100 }), false);
  assert.equal(isQualifyingLegendRun({ ...base, totalAttempts: 0, totalNotes: 100 }), false);
});

test('#162 evaluatePersonalRecordUpdate anti-farm rules: baseline, tie, strict beat, double beat', () => {
  const t1 = '2026-11-26T10:00:00.000Z';
  const t2 = '2026-11-26T11:00:00.000Z';
  const t3 = '2026-11-26T12:00:00.000Z';

  // First play establishes baseline -> 0 bonus XP
  const first = evaluatePersonalRecordUpdate(null, {
    accuracyPct: 88,
    runXp: 420,
    nowIso: t1,
    qualified: true
  });
  assert.equal(first.bonusXp, 0);
  assert.equal(first.beatAccuracy, false);
  assert.equal(first.beatXp, false);
  assert.equal(first.newBestAccuracy, 88);
  assert.equal(first.newBestRunXp, 420);

  const storedAfterFirst = {
    bestAccuracy: first.newBestAccuracy,
    bestAccuracySetAt: first.newBestAccuracySetAt,
    bestRunXp: first.newBestRunXp,
    bestRunXpSetAt: first.newBestRunXpSetAt
  };

  // Tie pays 0 bonus XP
  const tie = evaluatePersonalRecordUpdate(storedAfterFirst, {
    accuracyPct: 88,
    runXp: 420,
    nowIso: t2,
    qualified: true
  });
  assert.equal(tie.bonusXp, 0);
  assert.equal(tie.beatenRecords.length, 0);

  // Strictly beating both pays 2 * +50 = +100 XP
  const doubleBeat = evaluatePersonalRecordUpdate(storedAfterFirst, {
    accuracyPct: 94,
    runXp: 510,
    nowIso: t3,
    qualified: true
  });
  assert.equal(doubleBeat.beatAccuracy, true);
  assert.equal(doubleBeat.beatXp, true);
  assert.equal(doubleBeat.bonusXp, HALL_OF_LEGENDS_BONUS_XP * 2);
  assert.equal(doubleBeat.newBestAccuracy, 94);
  assert.equal(doubleBeat.newBestAccuracySetAt, t3);
  assert.equal(doubleBeat.newBestRunXp, 510);
  assert.equal(doubleBeat.newBestRunXpSetAt, t3);

  // Unqualified run never pays bonus XP or updates bestAccuracy / bestRunXp (#168)
  const unqualified = evaluatePersonalRecordUpdate(storedAfterFirst, {
    accuracyPct: 99,
    runXp: 999,
    nowIso: t3,
    qualified: false
  });
  assert.equal(unqualified.bonusXp, 0);
  assert.equal(unqualified.newBestAccuracy, 88);
  assert.equal(unqualified.newBestRunXp, 420);
});

test('#162 computeHallOfLegends ranks top 10, deduplicates songs, breaks ties by earliest date', () => {
  const history = {};
  for (let i = 1; i <= 12; i += 1) {
    history[`song-${i}`] = {
      songId: `song-${i}`,
      title: `Spell ${i}`,
      bestAccuracy: 80 + i,
      bestAccuracySetAt: `2026-11-${String(i).padStart(2, '0')}T12:00:00.000Z`,
      bestRunXp: i * 100,
      bestRunXpSetAt: `2026-11-${String(i).padStart(2, '0')}T12:00:00.000Z`
    };
  }
  // Tie on accuracy (92%) with an earlier date should rank above song-12
  history['song-tie'] = {
    songId: 'song-tie',
    title: 'Earlier Tie Spell',
    bestAccuracy: 92,
    bestAccuracySetAt: '2026-10-01T12:00:00.000Z',
    bestRunXp: 0
  };

  const board = computeHallOfLegends(history, 10);
  assert.equal(board.accuracy.length, 10);
  assert.equal(board.xp.length, 10);
  assert.equal(board.accuracy[0].songId, 'song-tie');
  assert.equal(board.accuracy[1].songId, 'song-12');
  assert.equal(board.xp[0].songId, 'song-12');
  assert.equal(board.xp[0].value, 1200);
  assert.ok(formatLegendDate('2026-11-26T12:00:00.000Z').includes('2026'));
  assert.equal(formatLegendDate(null), '\u2014');
});

test('#163 preview source detection and 30s note slicing do not mutate inputs', () => {
  const noAudioEntry = { id: 'a', backingAudioPath: null };
  assert.equal(hasPreviewBackingAudio(noAudioEntry), false);
  assert.deepEqual(getAvailablePreviewSources(noAudioEntry), ['midi']);

  const withAudioEntry = { id: 'b', backingAudioPath: '/fake/backing.wav' };
  assert.equal(hasPreviewBackingAudio(withAudioEntry, () => true), true);
  assert.deepEqual(getAvailablePreviewSources(withAudioEntry, () => true), ['recording', 'midi']);
  assert.deepEqual(getAvailablePreviewSources(withAudioEntry, () => false), ['midi']);

  const inputNotes = [
    { time: 35.0, duration: 1.0, name: 'C4', velocity: 0.7 },
    { time: 29.5, duration: 4.0, name: 'E4', velocity: 0.8 },
    { time: 0.5, duration: 0.4, foldedName: 'G4', velocity: 0.6 },
    { time: -1.0, duration: 0.4, name: 'A4', velocity: 0.5 }
  ];
  const snapshot = JSON.stringify(inputNotes);
  const sliced = slicePreviewNotes(inputNotes, PREVIEW_DURATION_SEC);
  assert.equal(JSON.stringify(inputNotes), snapshot);
  assert.equal(sliced.length, 2);
  assert.equal(sliced[0].name, 'G4');
  assert.equal(sliced[1].name, 'E4');
  assert.ok(sliced[1].duration <= 0.7);
});

test('#163 preview controller cancels stale async loads and releases synth on stop', async () => {
  let releaseCalls = 0;
  const triggered = [];
  const states = [];
  const fakeInst = {
    triggerAttackRelease: (name, dur, time, vel) => triggered.push({ name, dur, vel }),
    releaseAll: () => { releaseCalls += 1; }
  };

  const ctrl = createGrimoirePreviewController({
    Tone: { now: () => 10 },
    ensureAudioReady: async () => {},
    getPianoInstrument: () => fakeInst,
    extractNotesForEntry: async () => [
      { time: 0, duration: 0.25, name: 'C4', velocity: 0.7 },
      { time: 0.5, duration: 0.25, name: 'E4', velocity: 0.7 }
    ],
    onStateChange: (s) => states.push(s)
  });

  const ok = await ctrl.startPreview({ id: 'demo-1', title: 'Demo' }, 'midi');
  assert.equal(ok, true);
  assert.equal(ctrl.isPreviewingEntry('demo-1'), true);
  assert.ok(triggered.length >= 1);

  ctrl.stopPreview();
  assert.equal(ctrl.isPreviewingEntry('demo-1'), false);
  assert.equal(ctrl.getState().isPlaying, false);
  assert.equal(releaseCalls, 1);
  assert.ok(states.length >= 2);
});

test('#168 preview controller emits stopped state on failed switch and honors 0 muted volume', async () => {
  const states = [];
  const fakeInst = {
    triggerAttackRelease: () => {},
    releaseAll: () => {}
  };
  const ctrl = createGrimoirePreviewController({
    Tone: { now: () => 0 },
    ensureAudioReady: async () => {},
    getPianoInstrument: () => fakeInst,
    extractNotesForEntry: async (entry) => (entry.id === 'good'
      ? [{ time: 0, duration: 0.2, name: 'C4', velocity: 0.7 }]
      : []),
    onStateChange: (s) => states.push(s)
  });

  assert.equal(await ctrl.startPreview({ id: 'good' }, 'midi'), true);
  assert.equal(ctrl.getState().isPlaying, true);
  // Switching to an entry with no playable notes must emit a stopped state (#168 Finding #3)
  assert.equal(await ctrl.startPreview({ id: 'empty' }, 'midi'), false);
  assert.equal(ctrl.getState().isPlaying, false);
  assert.equal(states[states.length - 1].isPlaying, false);

  // Recording preview with getBackingVolume() === 0 must keep el.volume === 0 (#168 Finding #4)
  let createdVolume = null;
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.readyState = 1;
      this.duration = 45;
      this.currentTime = 0;
      this._vol = 1;
    }
    set volume(v) { this._vol = v; createdVolume = v; }
    get volume() { return this._vol; }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  const recCtrl = createGrimoirePreviewController({
    AudioCtor: FakeAudio,
    pathToFileURL: (p) => new URL(`file://${p}`),
    getBackingVolume: () => 0,
    existsSyncFn: () => true
  });
  await recCtrl.startPreview({ id: 'rec1', backingAudioPath: '/tmp/test.wav' }, 'recording');
  assert.equal(createdVolume, 0);
  recCtrl.stopPreview();
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DRILL_KEYS,
  DRILL_CATALOG,
  getNextCircleOfFifthsKey,
  generateDrill,
  computeWarmupXp,
  createDrillSession
} = require('../arcane-drills.js');

test('DRILL_KEYS covers all 12 pitch classes and Circle of Fifths advances cleanly', () => {
  assert.equal(DRILL_KEYS.length, 12);
  assert.equal(getNextCircleOfFifthsKey('C'), 'G');
  assert.equal(getNextCircleOfFifthsKey('F'), 'C');
});

test('generateDrill builds ascending + descending scale steps for RH, LH, and Both', () => {
  const rh = generateDrill({ key: 'C', drillId: 'scale_major', hand: 'rh' });
  assert.equal(rh.steps.length, 15); // 8 up + 7 down
  assert.deepEqual(rh.steps[0].targetMidis, [60]);
  assert.deepEqual(rh.steps[7].targetMidis, [72]);
  assert.deepEqual(rh.steps[14].targetMidis, [60]);

  const lh = generateDrill({ key: 'G', drillId: 'scale_major', hand: 'lh' });
  assert.deepEqual(lh.steps[0].targetMidis, [55]); // G3
  assert.deepEqual(lh.steps[6].targetMidis, [66]); // F#4

  const both = generateDrill({ key: 'Bb', drillId: 'scale_dorian', hand: 'both' });
  assert.deepEqual(both.steps[0].targetMidis, [58, 70]); // Bb3 + Bb4
  assert.equal(both.steps[0].lhMidis[0], 58);
  assert.equal(both.steps[0].rhMidis[0], 70);
});

test('generateDrill builds chord inversions and progressions accurately', () => {
  const majTriad = generateDrill({ key: 'C', drillId: 'chord_major', hand: 'rh' });
  assert.equal(majTriad.steps.length, 4);
  assert.deepEqual(majTriad.steps[0].targetMidis, [60, 64, 67]); // Root
  assert.deepEqual(majTriad.steps[1].targetMidis, [64, 67, 72]); // 1st inv
  assert.deepEqual(majTriad.steps[2].targetMidis, [67, 72, 76]); // 2nd inv
  assert.deepEqual(majTriad.steps[3].targetMidis, [72, 76, 79]); // Root octave

  const iiVI = generateDrill({ key: 'C', drillId: 'prog_ii_v_i', hand: 'both' });
  assert.equal(iiVI.steps.length, 4);
  assert.deepEqual(iiVI.steps[0].lhMidis, [50]); // D3 bass
  assert.deepEqual(iiVI.steps[0].rhMidis, [62, 65, 69, 72]); // Dm7
  assert.deepEqual(iiVI.steps[1].rhMidis, [67, 71, 74, 77]); // G7
  assert.deepEqual(iiVI.steps[2].rhMidis, [60, 64, 67, 71]); // Cmaj7
});

test('createDrillSession scores scale hits, penalizes wrong keys without advancing, and awards XP on completion', () => {
  let clock = 1000;
  const drill = generateDrill({ key: 'C', drillId: 'scale_major_pentatonic', hand: 'rh' });
  // C major pentatonic: C4(60) D4(62) E4(64) G4(67) A4(69) C5(72) A4(69) G4(67) E4(64) D4(62) C4(60) = 11 steps
  assert.equal(drill.steps.length, 11);

  const session = createDrillSession(drill, { nowFn: () => clock });
  const wrong = session.handleNoteOn(61, clock);
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.wrongKey, true);
  assert.equal(wrong.progress.stepIndex, 0);
  assert.equal(wrong.progress.mistakes, 1);

  for (const step of drill.steps) {
    clock += 150;
    const res = session.handleNoteOn(step.targetMidis[0], clock);
    assert.equal(res.accepted, true);
    assert.equal(res.stepAdvanced, true);
  }

  const finalProgress = session.getProgress(clock);
  assert.equal(finalProgress.completed, true);
  assert.equal(finalProgress.correctHits, 11);
  assert.equal(finalProgress.mistakes, 1);
  assert.equal(finalProgress.accuracyPct, 92);
  assert.equal(finalProgress.xpEarned, computeWarmupXp({ category: 'scales', hand: 'rh', accuracyPct: 92 }));
  assert.ok(finalProgress.xpEarned >= 25 && finalProgress.xpEarned <= 60);
});

test('createDrillSession supports multi-note chord window and expires stale partial chords', () => {
  let clock = 5000;
  const drill = generateDrill({ key: 'C', drillId: 'chord_major', hand: 'rh' });
  const session = createDrillSession(drill, { chordWindowMs: 450, nowFn: () => clock });

  // Strike C4, wait 600ms (expired), then strike E4+G4 -> should NOT complete until C4 is re-struck
  session.handleNoteOn(60, clock);
  clock += 600;
  session.handleNoteOn(64, clock);
  const partial = session.handleNoteOn(67, clock + 40);
  assert.equal(partial.stepAdvanced, false);
  assert.equal(partial.progress.stepIndex, 0);

  // Re-strike C4 within window -> advances to 1st inversion
  const done = session.handleNoteOn(60, clock + 80);
  assert.equal(done.stepAdvanced, true);
  assert.equal(done.progress.stepIndex, 1);
});

test('every drill in DRILL_CATALOG generates valid non-empty steps', () => {
  for (const spec of DRILL_CATALOG) {
    const d = generateDrill({ key: 'F#', drillId: spec.id, hand: 'both' });
    assert.ok(d.steps.length >= 4, `${spec.id} should have at least 4 steps`);
    assert.ok(d.contextPitchClasses.length >= 3, `${spec.id} should have context pitch classes`);
  }
});

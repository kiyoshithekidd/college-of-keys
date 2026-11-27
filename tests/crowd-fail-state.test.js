'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CROWD_RECOVERY_HIT_TARGET,
  getCrowdWarningThreshold,
  createCrowdFailState,
  isCrowdFailStateActive,
  advanceCrowdFailOnHit,
  advanceCrowdFailOnMiss,
  normalizeCrowdFailPolicy
} = require('../tavern-setlists');

test('#164 getCrowdWarningThreshold scales with spell difficulty tier (15 / 10 / 7)', () => {
  assert.deepEqual(getCrowdWarningThreshold('Cantrip'), { tierIndex: 0, warningMisses: 15, booOffMisses: 8 });
  assert.deepEqual(getCrowdWarningThreshold('2nd-Level Spell'), { tierIndex: 2, warningMisses: 15, booOffMisses: 8 });
  assert.deepEqual(getCrowdWarningThreshold('3rd-Level Spell'), { tierIndex: 3, warningMisses: 10, booOffMisses: 5 });
  assert.deepEqual(getCrowdWarningThreshold('5th-Level Spell'), { tierIndex: 5, warningMisses: 10, booOffMisses: 5 });
  assert.deepEqual(getCrowdWarningThreshold('6th-Level Spell'), { tierIndex: 6, warningMisses: 7, booOffMisses: 4 });
  assert.deepEqual(getCrowdWarningThreshold('9th-Level Spell'), { tierIndex: 9, warningMisses: 7, booOffMisses: 4 });
});

test('#164 isCrowdFailStateActive exempts Wait Mode, Karaoke, Tutorial, Listen-Only, and Rehearsal Loop', () => {
  const arcade = {
    waitMode: false,
    stageViewMode: 'highway',
    tutorialActive: false,
    accompanimentMode: 'off',
    rehearsalLoopEnabled: false
  };
  assert.equal(isCrowdFailStateActive(arcade), true);
  assert.equal(isCrowdFailStateActive({ ...arcade, waitMode: true }), false);
  assert.equal(isCrowdFailStateActive({ ...arcade, stageViewMode: 'karaoke' }), false);
  assert.equal(isCrowdFailStateActive({ ...arcade, tutorialActive: true }), false);
  assert.equal(isCrowdFailStateActive({ ...arcade, accompanimentMode: 'auto-both' }), false);
  assert.equal(isCrowdFailStateActive({ ...arcade, rehearsalLoopEnabled: true }), false);
  assert.equal(normalizeCrowdFailPolicy('continue'), 'continue');
  assert.equal(normalizeCrowdFailPolicy('end'), 'end');
  assert.equal(normalizeCrowdFailPolicy('invalid'), 'end');
});

test('#164 warning fires on miss streak, recovers after 10 hits, and boos off on continued misses without re-firing', () => {
  // 6th-level tier: 7 misses to warn, 4 more to boo off
  let state = createCrowdFailState();
  let lastEvent = null;
  for (let i = 0; i < 6; i += 1) {
    const r = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: '6th-Level Spell', active: true });
    state = r.nextState;
    lastEvent = r.event;
    assert.equal(lastEvent, null);
  }
  const warnRes = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: '6th-Level Spell', active: true });
  state = warnRes.nextState;
  assert.equal(warnRes.event, 'warning');
  assert.equal(state.status, 'warning');

  // Recover with 10 consecutive hits
  for (let i = 0; i < CROWD_RECOVERY_HIT_TARGET - 1; i += 1) {
    const h = advanceCrowdFailOnHit(state, { noteCount: 1, active: true });
    state = h.nextState;
    assert.equal(h.event, 'recovering');
  }
  const rec = advanceCrowdFailOnHit(state, { noteCount: 1, active: true });
  state = rec.nextState;
  assert.equal(rec.event, 'recovered');
  assert.equal(state.status, 'normal');

  // Re-enter warning, then miss 4 more to trigger boo-off
  for (let i = 0; i < 7; i += 1) {
    state = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: 6, active: true }).nextState;
  }
  assert.equal(state.status, 'warning');
  for (let i = 0; i < 3; i += 1) {
    const r = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: 6, active: true });
    state = r.nextState;
    assert.equal(r.event, null);
  }
  const boo = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: 6, active: true });
  state = boo.nextState;
  assert.equal(boo.event, 'booed');
  assert.equal(state.hasBooedOffThisRun, true);

  // Under Continue policy, further misses must never re-fire warning or boo-off
  for (let i = 0; i < 20; i += 1) {
    const r = advanceCrowdFailOnMiss(state, { tierIndexOrLevel: 6, active: true });
    state = r.nextState;
    assert.equal(r.event, null);
  }
});

'use strict';

/**
 * College of Keys — Issue #178: Arcane Drills (Interactive Scales, Chords & Progression Warmup Dojo)
 * Pure, testable music theory generator and step-scoring engine for 61-key (C2=36..C7=96) warmup drills.
 */

const ARCANE_DRILLS_STORAGE_KEY = 'collegeOfKeys.arcaneDrills.v1';

const DRILL_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CIRCLE_OF_FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

const KEY_TO_PITCH_CLASS = {
  C: 0,
  Db: 1, 'C#': 1,
  D: 2,
  Eb: 3, 'D#': 3,
  E: 4,
  F: 5,
  'F#': 6, Gb: 6,
  G: 7,
  Ab: 8, 'G#': 8,
  A: 9,
  Bb: 10, 'A#': 10,
  B: 11
};

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

const DRILL_CATALOG = [
  // Scales
  {
    id: 'scale_major',
    category: 'scales',
    name: 'Major Scale',
    intervals: [0, 2, 4, 5, 7, 9, 11, 12],
    degrees: ['1', '2', '3', '4', '5', '6', '7', '8']
  },
  {
    id: 'scale_natural_minor',
    category: 'scales',
    name: 'Natural Minor Scale',
    intervals: [0, 2, 3, 5, 7, 8, 10, 12],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7', '8']
  },
  {
    id: 'scale_harmonic_minor',
    category: 'scales',
    name: 'Harmonic Minor Scale',
    intervals: [0, 2, 3, 5, 7, 8, 11, 12],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7', '8']
  },
  {
    id: 'scale_major_pentatonic',
    category: 'scales',
    name: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9, 12],
    degrees: ['1', '2', '3', '5', '6', '8']
  },
  {
    id: 'scale_minor_pentatonic',
    category: 'scales',
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10, 12],
    degrees: ['1', 'b3', '4', '5', 'b7', '8']
  },
  {
    id: 'scale_blues',
    category: 'scales',
    name: 'Blues Scale',
    intervals: [0, 3, 5, 6, 7, 10, 12],
    degrees: ['1', 'b3', '4', 'b5', '5', 'b7', '8']
  },
  {
    id: 'scale_dorian',
    category: 'scales',
    name: 'Dorian Mode',
    intervals: [0, 2, 3, 5, 7, 9, 10, 12],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7', '8']
  },
  // Chords (Root -> 1st Inv -> 2nd Inv -> Root Octave)
  {
    id: 'chord_major',
    category: 'chords',
    name: 'Major Triad Inversions',
    intervals: [0, 4, 7],
    suffix: ''
  },
  {
    id: 'chord_minor',
    category: 'chords',
    name: 'Minor Triad Inversions',
    intervals: [0, 3, 7],
    suffix: 'm'
  },
  {
    id: 'chord_dom7',
    category: 'chords',
    name: 'Dominant 7th Inversions',
    intervals: [0, 4, 7, 10],
    suffix: '7'
  },
  {
    id: 'chord_maj7',
    category: 'chords',
    name: 'Major 7th Inversions',
    intervals: [0, 4, 7, 11],
    suffix: 'maj7'
  },
  {
    id: 'chord_min7',
    category: 'chords',
    name: 'Minor 7th Inversions',
    intervals: [0, 3, 7, 10],
    suffix: 'm7'
  },
  // Progressions
  {
    id: 'prog_ii_v_i',
    category: 'progressions',
    name: 'ii–V–I Jazz Turnaround',
    chords: [
      { roman: 'ii7', rootOffset: 2, intervals: [0, 3, 7, 10], suffix: 'm7' },
      { roman: 'V7', rootOffset: 7, intervals: [0, 4, 7, 10], suffix: '7' },
      { roman: 'Imaj7', rootOffset: 0, intervals: [0, 4, 7, 11], suffix: 'maj7' },
      { roman: 'Imaj7', rootOffset: 0, intervals: [0, 4, 7, 11], suffix: 'maj7' }
    ]
  },
  {
    id: 'prog_i_v_vi_iv',
    category: 'progressions',
    name: 'I–V–vi–IV Tavern Anthem',
    chords: [
      { roman: 'I', rootOffset: 0, intervals: [0, 4, 7], suffix: '' },
      { roman: 'V', rootOffset: 7, intervals: [0, 4, 7], suffix: '' },
      { roman: 'vi', rootOffset: 9, intervals: [0, 3, 7], suffix: 'm' },
      { roman: 'IV', rootOffset: 5, intervals: [0, 4, 7], suffix: '' }
    ]
  },
  {
    id: 'prog_i_iv_v_i',
    category: 'progressions',
    name: 'I–IV–V–I Classic Cadence',
    chords: [
      { roman: 'I', rootOffset: 0, intervals: [0, 4, 7], suffix: '' },
      { roman: 'IV', rootOffset: 5, intervals: [0, 4, 7], suffix: '' },
      { roman: 'V', rootOffset: 7, intervals: [0, 4, 7], suffix: '' },
      { roman: 'I', rootOffset: 0, intervals: [0, 4, 7], suffix: '' }
    ]
  }
];

function formatPitchName(midi, preferFlats = false) {
  const m = Math.max(0, Math.min(127, Math.round(Number(midi) || 60)));
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const octave = Math.floor(m / 12) - 1;
  return `${names[m % 12]}${octave}`;
}

function formatPitchClass(pc, preferFlats = false) {
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[((pc % 12) + 12) % 12];
}

function getNextCircleOfFifthsKey(currentKey) {
  const idx = CIRCLE_OF_FIFTHS.indexOf(currentKey);
  if (idx < 0) return 'G';
  return CIRCLE_OF_FIFTHS[(idx + 1) % CIRCLE_OF_FIFTHS.length];
}

function normalizeHandMode(hand) {
  if (hand === 'lh' || hand === 'both' || hand === 'rh') return hand;
  return 'rh';
}

function invertChordIntervals(intervals, inversionIndex) {
  const len = intervals.length;
  const inv = ((inversionIndex % len) + len) % len;
  const shifted = [];
  for (let i = 0; i < len; i++) {
    const srcIdx = (i + inv) % len;
    let val = intervals[srcIdx];
    if (i + inv >= len) {
      val += 12;
    }
    shifted.push(val);
  }
  return shifted;
}

function generateDrill({ key = 'C', drillId = 'scale_major', hand = 'rh' } = {}) {
  const safeKey = Object.prototype.hasOwnProperty.call(KEY_TO_PITCH_CLASS, key) ? key : 'C';
  const tonicPc = KEY_TO_PITCH_CLASS[safeKey];
  const preferFlats = FLAT_KEYS.has(safeKey);
  const spec = DRILL_CATALOG.find((d) => d.id === drillId) || DRILL_CATALOG[0];
  const cleanHand = normalizeHandMode(hand);

  const rhBaseMidi = 60 + tonicPc; // C4..B4
  const lhBaseMidi = 48 + tonicPc; // C3..B3

  const steps = [];
  const contextSet = new Set();

  if (spec.category === 'scales') {
    const asc = spec.intervals.map((off, idx) => ({
      offset: off,
      degree: spec.degrees[idx],
      direction: 'Asc'
    }));
    const desc = spec.intervals
      .slice(0, -1)
      .reverse()
      .map((off, idx) => ({
        offset: off,
        degree: spec.degrees[spec.degrees.length - 2 - idx],
        direction: 'Desc'
      }));
    const sequence = [...asc, ...desc];

    sequence.forEach((item, index) => {
      const rhMidis = cleanHand !== 'lh' ? [rhBaseMidi + item.offset] : [];
      const lhMidis = cleanHand !== 'rh' ? [lhBaseMidi + item.offset] : [];
      const targetMidis = [...lhMidis, ...rhMidis];
      for (const m of targetMidis) contextSet.add(m % 12);
      const refMidi = rhMidis[0] ?? lhMidis[0];
      steps.push({
        stepIndex: index,
        label: `${formatPitchName(refMidi, preferFlats)}`,
        degreeLabel: `${item.direction} • Degree ${item.degree}`,
        rhMidis,
        lhMidis,
        targetMidis
      });
    });
  } else if (spec.category === 'chords') {
    const inversionNames = ['Root Position', '1st Inversion', '2nd Inversion', '3rd Inversion'];
    const totalInversions = spec.intervals.length === 3 ? 4 : 5;
    for (let inv = 0; inv < totalInversions; inv++) {
      const isOctaveRoot = inv === totalInversions - 1;
      const voicedIntervals = isOctaveRoot
        ? spec.intervals.map((x) => x + 12)
        : invertChordIntervals(spec.intervals, inv);
      const invLabel = isOctaveRoot ? 'Root (Octave)' : (inversionNames[inv] || `Inv ${inv}`);

      const rhMidis = cleanHand !== 'lh' ? voicedIntervals.map((off) => rhBaseMidi + off) : [];
      const lhMidis = cleanHand === 'lh'
        ? voicedIntervals.map((off) => lhBaseMidi + off)
        : cleanHand === 'both'
          ? [lhBaseMidi]
          : [];
      const targetMidis = [...lhMidis, ...rhMidis];
      for (const m of targetMidis) contextSet.add(m % 12);

      const chordName = `${safeKey}${spec.suffix}`;
      const noteNames = (rhMidis.length ? rhMidis : lhMidis).map((m) => formatPitchClass(m % 12, preferFlats));
      steps.push({
        stepIndex: inv,
        label: `${chordName} (${invLabel})`,
        degreeLabel: noteNames.join(' • '),
        rhMidis,
        lhMidis,
        targetMidis
      });
    }
  } else if (spec.category === 'progressions') {
    spec.chords.forEach((ch, idx) => {
      const chordRootPc = (tonicPc + ch.rootOffset) % 12;
      const chordName = `${formatPitchClass(chordRootPc, preferFlats)}${ch.suffix}`;
      const rhRoot = 60 + chordRootPc;
      const lhRoot = 48 + chordRootPc;

      const rhMidis = cleanHand !== 'lh' ? ch.intervals.map((off) => rhRoot + off) : [];
      const lhMidis = cleanHand === 'lh'
        ? ch.intervals.map((off) => lhRoot + off)
        : cleanHand === 'both'
          ? [lhRoot]
          : [];
      const targetMidis = [...lhMidis, ...rhMidis];
      for (const m of targetMidis) contextSet.add(m % 12);

      const noteNames = (rhMidis.length ? rhMidis : lhMidis).map((m) => formatPitchClass(m % 12, preferFlats));
      steps.push({
        stepIndex: idx,
        label: `${ch.roman} — ${chordName}`,
        degreeLabel: noteNames.join(' • '),
        rhMidis,
        lhMidis,
        targetMidis
      });
    });
  }

  return {
    key: safeKey,
    tonicPc,
    preferFlats,
    drillId: spec.id,
    category: spec.category,
    name: `${safeKey} ${spec.name}`,
    hand: cleanHand,
    steps,
    contextPitchClasses: Array.from(contextSet)
  };
}

function computeWarmupXp({ category = 'scales', hand = 'rh', accuracyPct = 100 } = {}) {
  let base = 25;
  if (category === 'chords') base = 35;
  else if (category === 'progressions') base = 45;

  const handBonus = hand === 'both' ? 10 : 0;
  const accuracyBonus = accuracyPct >= 90 ? 5 : 0;
  return base + handBonus + accuracyBonus;
}

function createDrillSession(drill, { chordWindowMs = 450, nowFn = () => Date.now() } = {}) {
  const steps = Array.isArray(drill?.steps) ? drill.steps : [];
  let stepIndex = 0;
  let completed = steps.length === 0;
  let correctHits = 0;
  let mistakes = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let startTimeMs = null;
  let endTimeMs = null;

  // Multi-note chord buffer for current step
  let hitTargets = new Set();
  let windowStartMs = 0;
  let lastWrongMidi = null;
  let lastWrongAtMs = 0;

  function getProgress(now = nowFn()) {
    const totalAttempts = correctHits + mistakes;
    const accuracyPct = totalAttempts > 0 ? Math.round((correctHits / totalAttempts) * 100) : 100;
    const elapsedMs = startTimeMs === null
      ? 0
      : ((endTimeMs !== null ? endTimeMs : now) - startTimeMs);
    return {
      stepIndex,
      totalSteps: steps.length,
      currentStep: steps[stepIndex] || null,
      hitTargets: Array.from(hitTargets),
      completed,
      correctHits,
      mistakes,
      currentStreak,
      bestStreak,
      accuracyPct,
      elapsedMs,
      lastWrongMidi,
      lastWrongAtMs,
      xpEarned: completed
        ? computeWarmupXp({ category: drill.category, hand: drill.hand, accuracyPct })
        : 0
    };
  }

  function handleNoteOn(midi, now = nowFn()) {
    if (completed || !steps[stepIndex]) {
      return { accepted: false, stepAdvanced: false, completed, wrongKey: false, progress: getProgress(now) };
    }
    if (startTimeMs === null) {
      startTimeMs = now;
    }

    const step = steps[stepIndex];
    const targetSet = new Set(step.targetMidis);

    // Expire partial chord window if too much time passed between notes
    if (targetSet.size > 1 && hitTargets.size > 0 && now - windowStartMs > chordWindowMs) {
      hitTargets.clear();
    }

    if (!targetSet.has(midi)) {
      mistakes += 1;
      currentStreak = 0;
      lastWrongMidi = midi;
      lastWrongAtMs = now;
      return {
        accepted: false,
        stepAdvanced: false,
        completed: false,
        wrongKey: true,
        expectedMidis: step.targetMidis,
        progress: getProgress(now)
      };
    }

    if (hitTargets.size === 0) {
      windowStartMs = now;
    }

    if (!hitTargets.has(midi)) {
      hitTargets.add(midi);
      correctHits += 1;
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    }

    const stepComplete = hitTargets.size >= targetSet.size;
    if (stepComplete) {
      hitTargets.clear();
      stepIndex += 1;
      if (stepIndex >= steps.length) {
        completed = true;
        endTimeMs = now;
      }
    }

    return {
      accepted: true,
      stepAdvanced: stepComplete,
      completed,
      wrongKey: false,
      expectedMidis: step.targetMidis,
      progress: getProgress(now)
    };
  }

  return {
    drill,
    handleNoteOn,
    getProgress
  };
}

const api = {
  ARCANE_DRILLS_STORAGE_KEY,
  DRILL_KEYS,
  CIRCLE_OF_FIFTHS,
  DRILL_CATALOG,
  formatPitchName,
  formatPitchClass,
  getNextCircleOfFifthsKey,
  normalizeHandMode,
  generateDrill,
  computeWarmupXp,
  createDrillSession
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeArcaneDrills = api;
}

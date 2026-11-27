'use strict';

/**
 * College of Keys — Milestone v1.9.0: Rhythm & Sight-Reading Polish
 * Pure, testable helpers for:
 *  - #182: Independent, resolution-normalized Highway Scroll Speed (0.5x–2.5x)
 *  - #179: Falling Note Labels (Off / Note Names / Scale Degrees) & Sustain Pedal (CC 64) Spans
 *  - #181: Live Early/Late Hit-Error Classification & Timing Summary
 *  - #183: Audible Count-In Metronome Beat Scheduler & Timeline Section/Measure Jump Markers
 */

const HIGHWAY_SCROLL_SPEED_STORAGE_KEY = 'collegeOfKeys.highwayScrollSpeed.v1';
const FALLING_LABEL_MODE_STORAGE_KEY = 'collegeOfKeys.fallingNoteLabels.v1';
const SUSTAIN_LANE_STORAGE_KEY = 'collegeOfKeys.sustainPedalLane.v1';
const METRONOME_COUNTIN_STORAGE_KEY = 'collegeOfKeys.metronomeCountIn.v1';
const METRONOME_CLICK_STORAGE_KEY = 'collegeOfKeys.metronomeClick.v1';

const BASE_HIGHWAY_LOOKAHEAD_SEC = 2.0;
const HIT_ERROR_MAX_MS = 160;

// ============================================================================
// #182: Independent Highway Note Scroll Speed (0.5x – 2.5x)
// ============================================================================
function clampHighwayScrollSpeed(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0.5, Math.min(2.5, Math.round(n * 10) / 10));
}

function computeHighwayLookaheadSec(scrollSpeedMult = 1.0) {
  const mult = clampHighwayScrollSpeed(scrollSpeedMult);
  return BASE_HIGHWAY_LOOKAHEAD_SEC / mult;
}

function computeHighwayPxPerSec(highwayHeight, scrollSpeedMult = 1.0) {
  const h = Math.max(120, Number(highwayHeight) || 480);
  const lookaheadSec = computeHighwayLookaheadSec(scrollSpeedMult);
  return Math.max(40, h / lookaheadSec);
}

// ============================================================================
// #179: Falling Note Labels (Note Names / Scale Degrees) & CC 64 Sustain Spans
// ============================================================================
const MAJOR_SCALE_OFFSETS = new Map([
  [0, '1'], [1, 'b2'], [2, '2'], [3, 'b3'], [4, '3'], [5, '4'],
  [6, '#4'], [7, '5'], [8, 'b6'], [9, '6'], [10, 'b7'], [11, '7']
]);

const MINOR_SCALE_OFFSETS = new Map([
  [0, '1'], [1, 'b2'], [2, '2'], [3, '3'], [4, '#3'], [5, '4'],
  [6, '#4'], [7, '5'], [8, '6'], [9, '#6'], [10, '7'], [11, '#7']
]);

const KEY_NAME_TO_PC = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11
};

function parseKeySpecForDegrees(keyLabel) {
  if (!keyLabel || typeof keyLabel !== 'string') {
    return { tonicPc: 0, isMinor: false };
  }
  const trimmed = keyLabel.trim();
  const isMinor = /m(in|inor)?$/i.test(trimmed) && !/maj/i.test(trimmed);
  const rootMatch = trimmed.match(/^([A-Ga-g][#b]?)/);
  if (!rootMatch) return { tonicPc: 0, isMinor };
  const normalizedRoot = rootMatch[1][0].toUpperCase() + (rootMatch[1][1] || '');
  const tonicPc = Object.prototype.hasOwnProperty.call(KEY_NAME_TO_PC, normalizedRoot)
    ? KEY_NAME_TO_PC[normalizedRoot]
    : 0;
  return { tonicPc, isMinor };
}

function normalizeFallingLabelMode(mode) {
  if (mode === 'off' || mode === 'degrees' || mode === 'notes') return mode;
  return 'notes';
}

function formatFallingNoteLabel(note, mode = 'notes', tonicPitchClass = 0, isMinor = false) {
  const cleanMode = normalizeFallingLabelMode(mode);
  if (cleanMode === 'off' || !note) return '';
  if (cleanMode === 'notes') {
    return String(note.foldedName || note.name || '');
  }
  const midiVal = Number.isFinite(note.foldedMidi) ? note.foldedMidi : Number(note.midi);
  if (!Number.isFinite(midiVal)) return String(note.foldedName || '');
  const pc = ((Math.round(midiVal) % 12) + 12) % 12;
  const tonic = ((Math.round(Number(tonicPitchClass) || 0) % 12) + 12) % 12;
  const interval = (pc - tonic + 12) % 12;
  const table = isMinor ? MINOR_SCALE_OFFSETS : MAJOR_SCALE_OFFSETS;
  return table.get(interval) || '';
}

function extractSustainPedalSpans(tracks, songDurationSec = 0) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const events = [];
  for (const track of tracks) {
    if (!track || track.channel === 9) continue;
    const cc64 = track.controlChanges && (track.controlChanges[64] || track.controlChanges['64']);
    if (!Array.isArray(cc64) || cc64.length === 0) continue;
    for (const ev of cc64) {
      if (!ev || !Number.isFinite(ev.time)) continue;
      const val = Number(ev.value);
      if (!Number.isFinite(val)) continue;
      events.push({
        time: Math.max(0, ev.time),
        down: val >= 0.5
      });
    }
  }
  if (events.length === 0) return [];

  events.sort((a, b) => a.time - b.time);

  const spans = [];
  let activeStart = null;
  for (const ev of events) {
    if (ev.down) {
      if (activeStart === null) activeStart = ev.time;
    } else if (activeStart !== null) {
      if (ev.time - activeStart >= 0.04) {
        spans.push({ startTime: activeStart, endTime: ev.time });
      }
      activeStart = null;
    }
  }
  if (activeStart !== null) {
    const endCap = Math.max(activeStart, Number(songDurationSec) || activeStart);
    if (endCap - activeStart >= 0.04) {
      spans.push({ startTime: activeStart, endTime: endCap });
    }
  }
  return spans;
}

// ============================================================================
// #181: Early/Late Hit-Error Bar & Timing Scatter Summary
// ============================================================================
function classifyTimingErrorMs(signedMs) {
  const abs = Math.abs(Number(signedMs) || 0);
  if (abs <= 45) return 'perfect';
  if (abs <= 90) return 'great';
  if (abs <= HIT_ERROR_MAX_MS) return 'good';
  return 'miss';
}

function computeTimingSummary(errorsMs, bucketCount = 21) {
  const list = Array.isArray(errorsMs)
    ? errorsMs.filter((v) => typeof v === 'number' && Number.isFinite(v))
    : [];
  const count = list.length;
  const buckets = new Array(Math.max(5, bucketCount)).fill(0);
  if (count === 0) {
    return {
      count: 0,
      meanMs: 0,
      earlyCount: 0,
      onTimeCount: 0,
      lateCount: 0,
      within45Pct: 0,
      buckets
    };
  }
  let sum = 0;
  let earlyCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let within45 = 0;
  for (const v of list) {
    sum += v;
    if (Math.abs(v) <= 45) within45 += 1;
    if (v < -35) earlyCount += 1;
    else if (v > 35) lateCount += 1;
    else onTimeCount += 1;

    const clamped = Math.max(-HIT_ERROR_MAX_MS, Math.min(HIT_ERROR_MAX_MS, v));
    const norm = (clamped + HIT_ERROR_MAX_MS) / (HIT_ERROR_MAX_MS * 2);
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor(norm * buckets.length)));
    buckets[idx] += 1;
  }
  return {
    count,
    meanMs: Math.round(sum / count),
    earlyCount,
    onTimeCount,
    lateCount,
    within45Pct: Math.round((within45 / count) * 100),
    buckets
  };
}

// ============================================================================
// #183: Audible Count-In Metronome & Timeline Section/Measure Jump Markers
// ============================================================================
function computeCountInDurationSec(bpm = 120, beatsPerMeasure = 4) {
  const safeBpm = Math.max(30, Math.min(260, Number(bpm) || 120));
  const beats = Math.max(2, Math.min(8, Math.round(Number(beatsPerMeasure) || 4)));
  const dur = (60 / safeBpm) * beats;
  return Math.max(1.2, Math.min(8.0, Math.round(dur * 1000) / 1000));
}

function findMetronomeClicksInWindow(prevTime, curTime, {
  bpm = 120,
  beatsPerMeasure = 4,
  countInEnabled = false,
  clickEnabled = false,
  leadInSec = 1.5
} = {}) {
  if (!Number.isFinite(prevTime) || !Number.isFinite(curTime) || curTime <= prevTime) {
    return [];
  }
  const safeBpm = Math.max(30, Math.min(260, Number(bpm) || 120));
  const beats = Math.max(2, Math.min(8, Math.round(Number(beatsPerMeasure) || 4)));
  const beatDur = 60 / safeBpm;
  const clicks = [];

  if (countInEnabled && prevTime < 0) {
    const startIdx = -beats;
    for (let i = startIdx; i < 0; i += 1) {
      const clickTime = i * beatDur;
      if (clickTime >= -leadInSec - 0.02 && clickTime > prevTime && clickTime <= curTime) {
        const beatInBar = ((i % beats) + beats) % beats;
        clicks.push({
          beatIndex: i,
          beatNumber: beatInBar + 1,
          isAccent: beatInBar === 0,
          isCountIn: true
        });
      }
    }
  }

  if (clickEnabled && curTime >= 0) {
    const firstBeat = Math.max(0, Math.floor(Math.max(0, prevTime) / beatDur));
    const lastBeat = Math.floor(curTime / beatDur);
    for (let b = firstBeat; b <= lastBeat; b += 1) {
      const clickTime = b * beatDur;
      if (clickTime > prevTime && clickTime <= curTime) {
        const beatInBar = b % beats;
        clicks.push({
          beatIndex: b,
          beatNumber: beatInBar + 1,
          isAccent: beatInBar === 0,
          isCountIn: false
        });
      }
    }
  }

  return clicks;
}

function extractTimelineSectionMarkers({
  headerMeta = [],
  ticksToSeconds = null,
  measures = [],
  durationSec = 0
} = {}) {
  const dur = Math.max(0, Number(durationSec) || 0);
  if (dur <= 0) return [];

  const markers = [];
  if (Array.isArray(headerMeta) && typeof ticksToSeconds === 'function') {
    for (const m of headerMeta) {
      if (!m || (m.type !== 'marker' && m.type !== 'cuePoint')) continue;
      const text = String(m.text || '').trim();
      if (!text) continue;
      const t = ticksToSeconds(Number(m.ticks) || 0);
      if (!Number.isFinite(t) || t < 0 || t >= dur - 0.25) continue;
      if (markers.some((existing) => Math.abs(existing.time - t) < 0.5)) continue;
      markers.push({ time: t, label: text.slice(0, 28), source: 'midi' });
    }
  }

  if (markers.length > 0) {
    markers.sort((a, b) => a.time - b.time);
    return markers;
  }

  // Fallback: evenly spaced measure landmarks from notationScore.measures
  if (Array.isArray(measures) && measures.length >= 8) {
    const step = measures.length <= 48 ? 8 : 16;
    for (let i = step; i < measures.length; i += step) {
      const m = measures[i];
      if (!m || !Number.isFinite(m.startTime) || m.startTime >= dur - 0.5) continue;
      markers.push({
        time: m.startTime,
        label: `Bar ${i + 1}`,
        source: 'measure'
      });
    }
  }

  return markers;
}

const HighwayPracticeTools = {
  HIGHWAY_SCROLL_SPEED_STORAGE_KEY,
  FALLING_LABEL_MODE_STORAGE_KEY,
  SUSTAIN_LANE_STORAGE_KEY,
  METRONOME_COUNTIN_STORAGE_KEY,
  METRONOME_CLICK_STORAGE_KEY,
  BASE_HIGHWAY_LOOKAHEAD_SEC,
  HIT_ERROR_MAX_MS,
  clampHighwayScrollSpeed,
  computeHighwayLookaheadSec,
  computeHighwayPxPerSec,
  parseKeySpecForDegrees,
  normalizeFallingLabelMode,
  formatFallingNoteLabel,
  extractSustainPedalSpans,
  classifyTimingErrorMs,
  computeTimingSummary,
  computeCountInDurationSec,
  findMetronomeClicksInWindow,
  extractTimelineSectionMarkers
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HighwayPracticeTools;
}
if (typeof window !== 'undefined') {
  window.HighwayPracticeTools = HighwayPracticeTools;
}

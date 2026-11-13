/**
 * College of Keys — Scrolling Grand-Staff Sheet Music Engine (Issue #39)
 *
 * Transforms multi-track MIDI & MusicXML song data into an adaptive, beat-synchronized
 * VexFlow 5 Grand Staff score with:
 * - Multi-tempo & multi-meter tick <-> time mapping
 * - Smart MIDI Hygiene tick reconciliation
 * - Key signature normalization & Krumhansl tonal estimation fallback
 * - Binary (16th) + Triplet (8th Tuplet) rhythmic solver per beat & cross-bar ties
 * - Messy transcription quality analyzer
 * - LRU offscreen tile cache (Bravura music font + Warm Grimoire Parchment surface)
 * - Exact notehead-center anchor interpolation & Wait Mode / Rehearsal Loop overlays
 */

const VF_MAJOR_KEYS_BY_FIFTHS = {
  [-7]: 'Cb',
  [-6]: 'Gb',
  [-5]: 'Db',
  [-4]: 'Ab',
  [-3]: 'Eb',
  [-2]: 'Bb',
  [-1]: 'F',
  0: 'C',
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
  5: 'B',
  6: 'F#',
  7: 'C#'
};

const VF_MINOR_KEYS_BY_FIFTHS = {
  [-7]: 'Abm',
  [-6]: 'Ebm',
  [-5]: 'Bbm',
  [-4]: 'Fm',
  [-3]: 'Cm',
  [-2]: 'Gm',
  [-1]: 'Dm',
  0: 'Am',
  1: 'Em',
  2: 'Bm',
  3: 'F#m',
  4: 'C#m',
  5: 'G#m',
  6: 'D#m',
  7: 'A#m'
};

const MAJOR_KEY_TO_FIFTHS = Object.fromEntries(
  Object.entries(VF_MAJOR_KEYS_BY_FIFTHS).map(([f, k]) => [k, Number(f)])
);

const VALID_VF_KEYS = new Set([
  ...Object.values(VF_MAJOR_KEYS_BY_FIFTHS),
  ...Object.values(VF_MINOR_KEYS_BY_FIFTHS)
]);

const FLAT_KEY_SPECS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'
]);

const KEY_ALIASES = {
  'C#m': 'C#m',
  'Dbm': 'C#m',
  'G#m': 'G#m',
  'Abm': 'Abm',
  'D#m': 'D#m',
  'Ebm': 'Ebm',
  'A#m': 'Bbm',
  'Gbm': 'F#m',
  'A#': 'Bb',
  'D#': 'Eb',
  'G#': 'Ab',
  'Db': 'Db',
  'C#': 'C#',
  'B#': 'C',
  'E#': 'F',
  'Fb': 'E'
};

const MAJOR_KEY_DISPLAY = {
  C: 'C Major', G: 'G Major', D: 'D Major', A: 'A Major', E: 'E Major', B: 'B Major',
  'F#': 'F# Major', 'C#': 'C# Major', F: 'F Major', Bb: 'Bb Major', Eb: 'Eb Major',
  Ab: 'Ab Major', Db: 'Db Major', Gb: 'Gb Major', Cb: 'Cb Major'
};

const MINOR_KEY_DISPLAY = {
  Am: 'A Minor', Em: 'E Minor', Bm: 'B Minor', 'F#m': 'F# Minor', 'C#m': 'C# Minor',
  'G#m': 'G# Minor', 'D#m': 'D# Minor', 'A#m': 'A# Minor', Dm: 'D Minor', Gm: 'G Minor',
  Cm: 'C Minor', Fm: 'F Minor', Bbm: 'Bb Minor', Ebm: 'Eb Minor', Abm: 'Ab Minor'
};

const SHARP_PC_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const FLAT_PC_NAMES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

// Krumhansl-Schmuckler tonal hierarchy weights (pitch class 0 = Tonic .. 11)
const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const TILE_LOGICAL_H = 244;
const TREBLE_STAVE_Y = 24;
const BASS_STAVE_Y = 128;
const STAVE_CONFIG = {
  spaceAboveStaffLn: 2.5,
  spaceBelowStaffLn: 2.5,
  spacingBetweenLinesPx: 10
};

/**
 * Normalize raw key specs/fifths/mode into a guaranteed valid VexFlow KeySignature string.
 */
function normalizeVfKeySpec(rawKey = null, fifths = null, mode = null) {
  if (typeof rawKey === 'string' && rawKey.trim()) {
    let cleaned = rawKey.trim();
    cleaned = cleaned.replace(/\s+(major|maj)$/i, '').replace(/\s+(minor|min)$/i, 'm');
    if (cleaned.length > 0) {
      cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    }
    if (KEY_ALIASES[cleaned] && VALID_VF_KEYS.has(KEY_ALIASES[cleaned])) {
      return KEY_ALIASES[cleaned];
    }
    if (VALID_VF_KEYS.has(cleaned)) {
      return cleaned;
    }
  }
  if (typeof fifths === 'number' && Number.isFinite(fifths)) {
    const clamped = Math.max(-7, Math.min(7, Math.round(fifths)));
    const isMinor = String(mode || '').toLowerCase() === 'minor';
    return isMinor
      ? (VF_MINOR_KEYS_BY_FIFTHS[clamped] || 'Am')
      : (VF_MAJOR_KEYS_BY_FIFTHS[clamped] || 'C');
  }
  return 'C';
}

function formatKeyDisplayName(vfKeySpec) {
  if (!vfKeySpec) return 'C Major';
  return MAJOR_KEY_DISPLAY[vfKeySpec] || MINOR_KEY_DISPLAY[vfKeySpec] || vfKeySpec;
}

/**
 * Build piecewise tempo map supporting multi-tempo MIDI/MusicXML headers and negative lead-in time.
 */
function buildTempoMap(temposInput = [], ppq = 480) {
  const safePpq = Math.max(1, Number(ppq) || 480);
  const cleaned = [];

  if (Array.isArray(temposInput)) {
    for (const t of temposInput) {
      if (!t || !Number.isFinite(Number(t.bpm)) || Number(t.bpm) <= 0) continue;
      cleaned.push({
        ticks: Math.max(0, Math.round(Number(t.ticks) || 0)),
        bpm: Math.max(15, Math.min(400, Number(t.bpm)))
      });
    }
  }

  cleaned.sort((a, b) => a.ticks - b.ticks);

  // Deduplicate identical tick entries (keep last)
  const deduped = [];
  for (const item of cleaned) {
    if (deduped.length > 0 && deduped[deduped.length - 1].ticks === item.ticks) {
      deduped[deduped.length - 1] = item;
    } else {
      deduped.push(item);
    }
  }

  if (deduped.length === 0) {
    deduped.push({ ticks: 0, bpm: 120 });
  } else if (deduped[0].ticks > 0) {
    deduped.unshift({ ticks: 0, bpm: deduped[0].bpm });
  }

  const segments = [];
  let accumSec = 0;
  for (let i = 0; i < deduped.length; i++) {
    const cur = deduped[i];
    if (i > 0) {
      const prev = segments[i - 1];
      accumSec = prev.startSec + (cur.ticks - prev.ticks) * prev.secPerTick;
    }
    const secPerTick = 60 / (cur.bpm * safePpq);
    segments.push({
      ticks: cur.ticks,
      bpm: cur.bpm,
      secPerTick,
      startSec: accumSec
    });
  }

  function ticksToSec(ticks) {
    const t = Number(ticks) || 0;
    if (t <= segments[0].ticks) {
      return segments[0].startSec + (t - segments[0].ticks) * segments[0].secPerTick;
    }
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].ticks <= t) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const seg = segments[lo];
    return seg.startSec + (t - seg.ticks) * seg.secPerTick;
  }

  function secToTicks(sec) {
    const s = Number(sec) || 0;
    if (s <= segments[0].startSec) {
      return segments[0].ticks + (s - segments[0].startSec) / segments[0].secPerTick;
    }
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].startSec <= s) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const seg = segments[lo];
    return seg.ticks + (s - seg.startSec) / seg.secPerTick;
  }

  function getBpmAtTick(ticks) {
    const t = Number(ticks) || 0;
    let chosen = segments[0];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].ticks <= t) chosen = segments[i];
      else break;
    }
    return chosen.bpm;
  }

  return {
    ppq: safePpq,
    segments,
    ticksToSec,
    secToTicks,
    getBpmAtTick
  };
}

/**
 * Build sorted time-signature map with tick lengths per bar.
 */
function buildTimeSigMap(timeSigsInput = [], ppq = 480) {
  const safePpq = Math.max(1, Number(ppq) || 480);
  const cleaned = [];

  if (Array.isArray(timeSigsInput)) {
    for (const ts of timeSigsInput) {
      if (!ts) continue;
      let num = 4;
      let den = 4;
      if (Array.isArray(ts.timeSignature) && ts.timeSignature.length >= 2) {
        num = Number(ts.timeSignature[0]) || 4;
        den = Number(ts.timeSignature[1]) || 4;
      } else if (ts.numerator || ts.denominator) {
        num = Number(ts.numerator) || 4;
        den = Number(ts.denominator) || 4;
      }
      num = Math.max(1, Math.min(32, Math.round(num)));
      den = Math.max(1, Math.min(32, Math.round(den)));
      cleaned.push({
        ticks: Math.max(0, Math.round(Number(ts.ticks) || 0)),
        numerator: num,
        denominator: den,
        label: `${num}/${den}`,
        measureTicks: Math.max(1, Math.round((4 * safePpq * num) / den))
      });
    }
  }

  cleaned.sort((a, b) => a.ticks - b.ticks);
  const deduped = [];
  for (const item of cleaned) {
    if (deduped.length > 0 && deduped[deduped.length - 1].ticks === item.ticks) {
      deduped[deduped.length - 1] = item;
    } else {
      deduped.push(item);
    }
  }

  if (deduped.length === 0) {
    deduped.push({
      ticks: 0,
      numerator: 4,
      denominator: 4,
      label: '4/4',
      measureTicks: safePpq * 4
    });
  } else if (deduped[0].ticks > 0) {
    deduped.unshift({ ...deduped[0], ticks: 0 });
  }

  function getAtTick(ticks) {
    const t = Number(ticks) || 0;
    let active = deduped[0];
    for (let i = 1; i < deduped.length; i++) {
      if (deduped[i].ticks <= t) active = deduped[i];
      else break;
    }
    return active;
  }

  return { entries: deduped, getAtTick };
}

/**
 * Build sanitized key-signature map (filtering out undefined/@tonejs/midi encoder artifacts).
 */
function buildKeySigMap(keySigsInput = [], fallbackVfKey = 'C') {
  const safeFallback = normalizeVfKeySpec(fallbackVfKey);
  const cleaned = [];

  if (Array.isArray(keySigsInput)) {
    for (const ks of keySigsInput) {
      if (!ks) continue;
      const hasRawKey = typeof ks.key === 'string' && ks.key.trim().length > 0;
      const hasVfKey = typeof ks.vfKeySpec === 'string' && ks.vfKeySpec.trim().length > 0;
      const hasFifths = typeof ks.fifths === 'number' && Number.isFinite(ks.fifths);
      if (!hasRawKey && !hasVfKey && !hasFifths) continue;

      const scaleIsMinor = String(ks.scale || ks.mode || '').toLowerCase() === 'minor';
      let rawKeyStr = ks.vfKeySpec || ks.key || null;
      let resolvedFifths = hasFifths ? ks.fifths : null;
      if (ks.fromMidiMeta && scaleIsMinor && rawKeyStr && MAJOR_KEY_TO_FIFTHS[rawKeyStr] !== undefined) {
        // @tonejs/midi maps SMF 0xFF 0x59 key byte using major keySignatureKeys[sf + 7] even when scale === 'minor'
        resolvedFifths = MAJOR_KEY_TO_FIFTHS[rawKeyStr];
        rawKeyStr = VF_MINOR_KEYS_BY_FIFTHS[resolvedFifths] || rawKeyStr;
      } else if (rawKeyStr && scaleIsMinor && !rawKeyStr.endsWith('m')) {
        rawKeyStr = `${rawKeyStr}m`;
      }
      const vfKeySpec = normalizeVfKeySpec(rawKeyStr, resolvedFifths, ks.scale || ks.mode);
      cleaned.push({
        ticks: Math.max(0, Math.round(Number(ks.ticks) || 0)),
        vfKeySpec,
        displayName: formatKeyDisplayName(vfKeySpec)
      });
    }
  }

  cleaned.sort((a, b) => a.ticks - b.ticks);
  const deduped = [];
  for (const item of cleaned) {
    if (deduped.length > 0 && deduped[deduped.length - 1].ticks === item.ticks) {
      deduped[deduped.length - 1] = item;
    } else {
      deduped.push(item);
    }
  }

  if (deduped.length === 0) {
    deduped.push({
      ticks: 0,
      vfKeySpec: safeFallback,
      displayName: formatKeyDisplayName(safeFallback)
    });
  } else if (deduped[0].ticks > 0) {
    deduped.unshift({ ...deduped[0], ticks: 0 });
  }

  function getAtTick(ticks) {
    const t = Number(ticks) || 0;
    let active = deduped[0];
    for (let i = 1; i < deduped.length; i++) {
      if (deduped[i].ticks <= t) active = deduped[i];
      else break;
    }
    return active;
  }

  return { entries: deduped, getAtTick };
}

/**
 * Estimate tonal center via Krumhansl-Schmuckler pitch-class profile when MIDI has no key meta.
 */
function estimateKeySignature(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return { vfKeySpec: 'C', displayName: 'C Major', confidence: 0 };
  }

  const histogram = new Array(12).fill(0);
  for (const n of notes) {
    const pitch = Number.isFinite(n.midi) ? n.midi : n.originalMidi;
    if (!Number.isFinite(pitch)) continue;
    const pc = ((Math.round(pitch) % 12) + 12) % 12;
    const durWeight = Math.max(0.1, Math.min(2.0, Number(n.duration) || 0.25));
    const velWeight = Math.max(0.2, Math.min(1.2, (Number(n.velocity) || 80) / 100));
    histogram[pc] += durWeight * velWeight;
  }

  const totalWeight = histogram.reduce((s, v) => s + v, 0);
  if (totalWeight <= 0) {
    return { vfKeySpec: 'C', displayName: 'C Major', confidence: 0 };
  }

  const meanH = totalWeight / 12;
  const pearson = (profile, root) => {
    const meanP = profile.reduce((s, v) => s + v, 0) / 12;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let i = 0; i < 12; i++) {
      const a = histogram[(root + i) % 12] - meanH;
      const b = profile[i] - meanP;
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    if (denA <= 0 || denB <= 0) return -1;
    return num / Math.sqrt(denA * denB);
  };

  const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_ROOTS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

  let bestScore = -Infinity;
  let bestKey = 'C';
  for (let root = 0; root < 12; root++) {
    const maj = pearson(KRUMHANSL_MAJOR, root);
    if (maj > bestScore) {
      bestScore = maj;
      bestKey = MAJOR_ROOTS[root];
    }
    const min = pearson(KRUMHANSL_MINOR, root);
    if (min > bestScore) {
      bestScore = min;
      bestKey = MINOR_ROOTS[root];
    }
  }

  const norm = normalizeVfKeySpec(bestKey);
  return {
    vfKeySpec: norm,
    displayName: formatKeyDisplayName(norm),
    confidence: Math.max(0, Math.min(1, bestScore))
  };
}

/**
 * Convert a MIDI note number into a VexFlow key string ('c#/4', 'bb/3', 'b#/3')
 * spelled idiomatically for the active key signature.
 */
function midiToVexKey(midi, vfKeySpec = 'C', vfRef = null) {
  const safeMidi = Math.max(0, Math.min(127, Math.round(Number(midi) || 60)));
  const pc = safeMidi % 12;
  let octave = Math.floor(safeMidi / 12) - 1;
  const safeKey = normalizeVfKeySpec(vfKeySpec);
  const useFlats = FLAT_KEY_SPECS.has(safeKey);
  const candidateName = (useFlats ? FLAT_PC_NAMES : SHARP_PC_NAMES)[pc];

  if (vfRef && vfRef.KeyManager) {
    try {
      const km = new vfRef.KeyManager(safeKey);
      km.reset();
      const selected = km.selectNote(candidateName);
      if (selected && typeof selected.note === 'string') {
        const spelled = selected.note.toLowerCase();
        // Enharmonic octave boundary adjustment: C -> B# (octave down), B -> Cb (octave up)
        if (pc === 0 && spelled.startsWith('b#')) octave -= 1;
        else if (pc === 11 && spelled.startsWith('cb')) octave += 1;
        return `${spelled}/${octave}`;
      }
    } catch {
      // Fallback to direct table below
    }
  }

  return `${candidateName}/${octave}`;
}

/**
 * Decompose an arbitrary positive quarter-beat span into standard VexFlow duration tokens.
 * Supports rest powers & tied note values without ever exceeding bar totals.
 */
function decomposeQuarterSpan(spanQ, { isRest = false } = {}) {
  const tokens = isRest
    ? [
        { q: 4.0, dur: 'wr', dots: 0 },
        { q: 2.0, dur: 'hr', dots: 0 },
        { q: 1.0, dur: 'qr', dots: 0 },
        { q: 0.5, dur: '8r', dots: 0 },
        { q: 0.25, dur: '16r', dots: 0 }
      ]
    : [
        { q: 4.0, dur: 'w', dots: 0 },
        { q: 3.0, dur: 'hd', dots: 1 },
        { q: 2.0, dur: 'h', dots: 0 },
        { q: 1.5, dur: 'qd', dots: 1 },
        { q: 1.0, dur: 'q', dots: 0 },
        { q: 0.75, dur: '8d', dots: 1 },
        { q: 0.5, dur: '8', dots: 0 },
        { q: 0.375, dur: '16d', dots: 1 },
        { q: 0.25, dur: '16', dots: 0 }
      ];

  const out = [];
  let rem = Math.round(Math.max(0, spanQ) * 16) / 16;
  let guard = 0;
  while (rem >= 0.24 && guard < 16) {
    guard++;
    const match = tokens.find((t) => t.q <= rem + 0.001);
    if (!match) break;
    out.push({ duration: match.dur, dots: match.dots, qDur: match.q, isRest });
    rem = Math.round((rem - match.q) * 16) / 16;
  }
  return out;
}

/**
 * Emit beat-aligned rests across `[startQ, endQ)` so rests never awkwardly straddle bar halves.
 */
function buildAlignedRests(startQ, endQ, beatsPerBeatQ = 1.0) {
  const events = [];
  let cursor = Math.round(startQ * 16) / 16;
  const target = Math.round(endQ * 16) / 16;
  const beatStep = beatsPerBeatQ > 0 ? beatsPerBeatQ : 1.0;

  while (target - cursor >= 0.24) {
    const nextBoundary = Math.ceil((cursor + 0.001) / beatStep) * beatStep;
    const isWholeBeatAligned = Math.abs(cursor - Math.round(cursor)) < 0.01;
    const fullGap = target - cursor;

    let chunkEnd = Math.min(target, nextBoundary);
    if (isWholeBeatAligned && fullGap >= 2.0 && Math.abs(cursor - Math.round(cursor / 2) * 2) < 0.01) {
      chunkEnd = Math.min(target, cursor + (fullGap >= 4.0 ? 4.0 : 2.0));
    } else if (isWholeBeatAligned && fullGap >= 1.0) {
      chunkEnd = Math.min(target, cursor + 1.0);
    }

    const parts = decomposeQuarterSpan(chunkEnd - cursor, { isRest: true });
    if (parts.length === 0) break;
    for (const p of parts) {
      events.push({
        isRest: true,
        startQ: cursor,
        qDur: p.qDur,
        duration: p.duration,
        dots: p.dots,
        midis: [],
        noteRefs: [],
        tieFromPrev: false,
        tieToNext: false,
        tripletId: null
      });
      cursor = Math.round((cursor + p.qDur) * 16) / 16;
    }
  }
  return events;
}

function quantizeDurationBeats(durationQ) {
  const parts = decomposeQuarterSpan(Math.max(0.25, Number(durationQ) || 0.5), { isRest: false });
  return parts[0] || { duration: 'q', dots: 0, qDur: 1.0 };
}

/**
 * Solve one measure for one hand into VexFlow-ready notation events (notes, chords, rests, tuplets, ties).
 */
function solveMeasureHandEvents(segments, measure, clef, tempoMap, vfRef) {
  const { startTicks, endTicks, vfKeySpec, numerator, denominator } = measure;
  const ppq = tempoMap.ppq;
  const totalQuarters = Math.max(0.25, (endTicks - startTicks) / ppq);
  const quantErrsMs = [];

  if (!segments || segments.length === 0) {
    // Whole bar rest centered cleanly in soft voice mode
    return {
      clef,
      isEmptyBar: true,
      events: [{
        isRest: true,
        isWholeBarRest: true,
        startQ: 0,
        qDur: totalQuarters,
        duration: 'wr',
        dots: 0,
        startTick: startTicks,
        endTick: endTicks,
        startTime: measure.startTime,
        endTime: measure.endTime,
        midis: [],
        noteRefs: [],
        wasFolded: false,
        isTiedContinuation: false,
        tieFromPrev: false,
        tieToNext: false,
        tripletGroupId: null
      }],
      quantErrsMs
    };
  }

  // Group overlapping/adjacent raw segments into onset clusters using beat-adaptive binary (16th) vs triplet (3/beat) snapping
  const beatCountCeil = Math.ceil(totalQuarters - 0.001);
  const beatUseTriplet = new Array(Math.max(1, beatCountCeil)).fill(false);

  // Detect triplet beats when notes land closer to thirds of a beat than 16th subdivisions
  const beatSegmentsMap = new Map();
  for (const seg of segments) {
    const rawRelQ = Math.max(0, Math.min(totalQuarters - 0.05, (seg.segStartTick - startTicks) / ppq));
    const beatIdx = Math.min(beatCountCeil - 1, Math.floor(rawRelQ + 0.0001));
    if (!beatSegmentsMap.has(beatIdx)) beatSegmentsMap.set(beatIdx, []);
    beatSegmentsMap.get(beatIdx).push({ seg, rawRelQ });
  }

  for (const [beatIdx, list] of beatSegmentsMap.entries()) {
    if (list.length < 2) continue;
    let errBin = 0;
    let errTrip = 0;
    let hasOffThird = false;
    for (const item of list) {
      const frac = item.rawRelQ - Math.floor(item.rawRelQ);
      const nearestBin = Math.round(frac * 4) / 4;
      const nearestTrip = Math.round(frac * 3) / 3;
      const dBin = Math.abs(frac - nearestBin);
      const dTrip = Math.abs(frac - nearestTrip);
      errBin += dBin;
      errTrip += dTrip;
      if ((Math.abs(frac - 1 / 3) < 0.095 || Math.abs(frac - 2 / 3) < 0.095) && dTrip < dBin) {
        hasOffThird = true;
      }
    }
    if (hasOffThird && errTrip + 0.03 < errBin && beatIdx + 1 <= totalQuarters + 0.01) {
      beatUseTriplet[beatIdx] = true;
    }
  }

  // Snap each segment onto its beat's chosen grid and track timing residual
  const bpmAtStart = tempoMap.getBpmAtTick(startTicks);
  const secPerQuarter = 60 / Math.max(30, bpmAtStart);
  const rawClusters = new Map();

  for (const seg of segments) {
    const rawStartQ = Math.max(0, (seg.segStartTick - startTicks) / ppq);
    const rawEndQ = Math.max(rawStartQ + 0.06, Math.min(totalQuarters, (seg.segEndTick - startTicks) / ppq));
    let beatIdx = Math.min(beatCountCeil - 1, Math.floor(rawStartQ));
    if (beatIdx < 0) beatIdx = 0;

    let snapStartQ;
    let gridKey;
    if (beatUseTriplet[beatIdx]) {
      const slot = Math.min(2, Math.max(0, Math.round((rawStartQ - beatIdx) * 3)));
      if (Math.round((rawStartQ - beatIdx) * 3) >= 3 && beatIdx + 1 < totalQuarters - 0.01) {
        snapStartQ = beatIdx + 1;
        gridKey = Math.round(snapStartQ * 12);
      } else {
        snapStartQ = beatIdx + slot / 3;
        gridKey = beatIdx * 12 + slot * 4;
      }
    } else {
      const clampedStep16 = Math.min(Math.max(0, Math.round(rawStartQ * 4)), Math.max(0, Math.round(totalQuarters * 4) - 1));
      snapStartQ = clampedStep16 / 4;
      gridKey = Math.round(snapStartQ * 12);
    }

    const qDiff = Math.abs(rawStartQ - snapStartQ);
    if (!seg.isTiedFromPrev) {
      quantErrsMs.push(qDiff * secPerQuarter * 1000);
    }

    if (!rawClusters.has(gridKey)) {
      rawClusters.set(gridKey, {
        gridKey,
        startQ: snapStartQ,
        beatIdx: Math.floor(snapStartQ + 0.0001),
        isTripletSlot: beatUseTriplet[Math.floor(snapStartQ + 0.0001)] && Math.abs(snapStartQ - Math.round(snapStartQ)) > 0.05,
        segs: []
      });
    }
    rawClusters.get(gridKey).segs.push({ ...seg, rawStartQ, rawEndQ });
  }

  const clusters = Array.from(rawClusters.values()).sort((a, b) => a.gridKey - b.gridKey);

  // Determine notated durations and assemble sequential events within each beat/measure
  const events = [];
  const beatUnitQ = denominator === 8 && numerator % 3 === 0 ? 1.5 : 1.0;
  let cursorGrid12 = 0;
  const totalGrid12 = Math.max(3, Math.round(totalQuarters * 12));
  let nextTripletGroupId = 1;

  // Group contiguous triplet clusters per triplet beat when applicable
  let ci = 0;
  while (ci < clusters.length) {
    const cl = clusters[ci];
    const bIdx = Math.floor(cl.gridKey / 12);

    // Emit any rest gap before this cluster
    if (cl.gridKey > cursorGrid12 + 1) {
      const gapStartQ = cursorGrid12 / 12;
      const gapEndQ = (beatUseTriplet[bIdx] && cl.gridKey > bIdx * 12) ? bIdx : cl.gridKey / 12;
      if (gapEndQ - gapStartQ >= 0.24) {
        events.push(...buildAlignedRests(gapStartQ, gapEndQ, beatUnitQ));
        cursorGrid12 = Math.round(gapEndQ * 12);
      }
    }

    // Check if the current beat is a triplet beat with >=1 clusters inside [bIdx*12 .. (bIdx+1)*12)
    if (beatUseTriplet[bIdx] && cl.gridKey >= bIdx * 12 && cl.gridKey < (bIdx + 1) * 12 && (bIdx + 1) * 12 <= totalGrid12 + 0.5) {
      // Collect all clusters within this single beat
      const beatClusters = [];
      let cj = ci;
      while (cj < clusters.length && clusters[cj].gridKey >= bIdx * 12 && clusters[cj].gridKey < (bIdx + 1) * 12) {
        beatClusters.push(clusters[cj]);
        cj++;
      }

      // Build 3 triplet-eighth slots [0, 4, 8] (relative to bIdx*12)
      const slotMap = [null, null, null];
      for (const bc of beatClusters) {
        const sIdx = Math.min(2, Math.max(0, Math.round((bc.gridKey - bIdx * 12) / 4)));
        if (!slotMap[sIdx]) {
          slotMap[sIdx] = bc;
        } else {
          slotMap[sIdx].segs.push(...bc.segs);
        }
      }

      const groupId = `${measure.index}-${clef}-t${nextTripletGroupId++}`;
      const tripletEvents = [];
      let sIdx = 0;
      while (sIdx < 3) {
        const bc = slotMap[sIdx];
        if (!bc) {
          tripletEvents.push({
            isRest: true,
            startQ: bIdx + sIdx / 3,
            qDur: 1 / 3,
            duration: '8r',
            dots: 0,
            midis: [],
            noteRefs: [],
            wasFolded: false,
            isTiedContinuation: false,
            tieFromPrev: false,
            tieToNext: false,
            tripletGroupId: groupId
          });
          sIdx++;
          continue;
        }

        // Deduplicate pitches within chord cluster (preferring non-continuation if same MIDI)
        const pitchMap = new Map();
        let maxRawEndQ = bc.startQ + 1 / 3;
        let continuesToNext = false;
        let tiedFromPrevAny = false;
        let foldedAny = false;

        for (const s of bc.segs) {
          maxRawEndQ = Math.max(maxRawEndQ, s.rawEndQ);
          if (s.continuesToNextBar) continuesToNext = true;
          if (s.isTiedFromPrev) tiedFromPrevAny = true;
          if (s.wasFolded) foldedAny = true;
          const prev = pitchMap.get(s.midi);
          if (!prev || (!s.isTiedFromPrev && prev.isTiedFromPrev)) {
            pitchMap.set(s.midi, s);
          }
        }

        // Check if note spans 2 eighth-triplet slots cleanly (quarter inside triplet)
        const canHoldTwoSlots =
          sIdx === 0 &&
          !slotMap[1] &&
          slotMap[2] &&
          maxRawEndQ >= bIdx + 0.56;

        const durSlots = canHoldTwoSlots ? 2 : 1;
        const sortedMidis = Array.from(pitchMap.keys()).sort((a, b) => a - b);
        const noteRefs = sortedMidis.map((m) => {
          const refSeg = pitchMap.get(m);
          return {
            noteId: refSeg.noteId,
            midi: m,
            time: refSeg.time,
            duration: refSeg.duration,
            endTime: refSeg.time + refSeg.duration,
            handTrack: refSeg.handTrack,
            wasFolded: Boolean(refSeg.wasFolded),
            semitoneShift: Number(refSeg.semitoneShift) || 0,
            isTiedContinuation: Boolean(refSeg.isTiedFromPrev)
          };
        });

        tripletEvents.push({
          isRest: false,
          startQ: bIdx + sIdx / 3,
          qDur: durSlots / 3,
          duration: durSlots === 2 ? 'q' : '8',
          dots: 0,
          midis: sortedMidis,
          keys: sortedMidis.map((m) => midiToVexKey(m, vfKeySpec, vfRef)),
          noteRefs,
          wasFolded: foldedAny,
          isTiedContinuation: tiedFromPrevAny && noteRefs.every((r) => r.isTiedContinuation),
          tieFromPrev: tiedFromPrevAny,
          tieToNext: continuesToNext && (bIdx + 1 >= totalQuarters - 0.01) && (sIdx + durSlots >= 3),
          tripletGroupId: groupId
        });
        sIdx += durSlots;
      }

      // If all 3 slots collapsed cleanly? (Never collapses to 1 since durSlots<=2, so always 2 or 3 items summing cleanly to 3 eighth units = 1 quarter beat)
      events.push(...tripletEvents);
      cursorGrid12 = (bIdx + 1) * 12;
      ci = cj;
      continue;
    }

    // Standard binary 16th-grid cluster
    const nextCl = ci + 1 < clusters.length ? clusters[ci + 1] : null;
    const nextBoundaryGrid12 = nextCl
      ? (beatUseTriplet[Math.floor(nextCl.gridKey / 12)]
          ? Math.floor(nextCl.gridKey / 12) * 12
          : nextCl.gridKey)
      : totalGrid12;

    const maxSpan16 = Math.max(1, Math.round(((nextBoundaryGrid12 - cl.gridKey) / 12) * 4));
    const maxSpanQ = maxSpan16 / 4;

    const pitchMap = new Map();
    let maxRawEndQ = cl.startQ + 0.25;
    let anyContinuesToNextBar = false;
    let allTiedFromPrev = true;
    let anyTiedFromPrev = false;
    let anyFolded = false;

    for (const s of cl.segs) {
      maxRawEndQ = Math.max(maxRawEndQ, s.rawEndQ);
      if (s.continuesToNextBar) anyContinuesToNextBar = true;
      if (s.isTiedFromPrev) anyTiedFromPrev = true;
      else allTiedFromPrev = false;
      if (s.wasFolded) anyFolded = true;
      const existing = pitchMap.get(s.midi);
      if (!existing || (!s.isTiedFromPrev && existing.isTiedFromPrev)) {
        pitchMap.set(s.midi, s);
      }
    }

    const rawDurQ = Math.max(0.25, maxRawEndQ - cl.startQ);
    let quantDurQ = Math.max(0.25, Math.min(maxSpanQ, Math.round(rawDurQ * 4) / 4));

    // Articulation gap absorption: human/MIDI notes released slightly early (e.g. 0.45s at 120 BPM) fill their rhythmic beat cleanly
    if (
      quantDurQ < maxSpanQ &&
      rawDurQ / maxSpanQ >= 0.72 &&
      maxSpanQ - rawDurQ <= 0.30
    ) {
      quantDurQ = maxSpanQ;
    }
    if (anyContinuesToNextBar && cl.startQ + quantDurQ < totalQuarters - 0.01 && !nextCl) {
      quantDurQ = Math.max(0.25, totalQuarters - cl.startQ);
    }

    // Split spanning notes nicely at imaginary half-bar in 4/4 if crossing from beat 1..3 cleanly
    const decomposed = [];
    const endPosQ = Math.round((cl.startQ + quantDurQ) * 16) / 16;
    if (
      numerator === 4 &&
      denominator === 4 &&
      cl.startQ > 0.01 &&
      cl.startQ < 2.0 &&
      endPosQ > 2.05
    ) {
      const firstHalfQ = Math.round((2.0 - cl.startQ) * 16) / 16;
      const secondHalfQ = Math.round((endPosQ - 2.0) * 16) / 16;
      decomposed.push(...decomposeQuarterSpan(firstHalfQ, { isRest: false }));
      decomposed.push(...decomposeQuarterSpan(secondHalfQ, { isRest: false }));
    } else {
      decomposed.push(...decomposeQuarterSpan(quantDurQ, { isRest: false }));
    }
    if (decomposed.length === 0) {
      decomposed.push({ duration: '16', dots: 0, qDur: 0.25, isRest: false });
    }

    const sortedMidis = Array.from(pitchMap.keys()).sort((a, b) => a - b);
    const baseRefs = sortedMidis.map((m) => {
      const refSeg = pitchMap.get(m);
      return {
        noteId: refSeg.noteId,
        midi: m,
        time: refSeg.time,
        duration: refSeg.duration,
        endTime: refSeg.time + refSeg.duration,
        handTrack: refSeg.handTrack,
        wasFolded: Boolean(refSeg.wasFolded),
        semitoneShift: Number(refSeg.semitoneShift) || 0,
        isTiedContinuation: Boolean(refSeg.isTiedFromPrev)
      };
    });
    const keys = sortedMidis.map((m) => midiToVexKey(m, vfKeySpec, vfRef));

    let curPartQ = cl.startQ;
    decomposed.forEach((part, pIdx) => {
      const isContinuationSubPart = pIdx > 0;
      const isLastSubPart = pIdx === decomposed.length - 1;
      const refsForPart = isContinuationSubPart
        ? baseRefs.map((r) => ({ ...r, isTiedContinuation: true }))
        : baseRefs;

      events.push({
        isRest: false,
        startQ: curPartQ,
        qDur: part.qDur,
        duration: part.duration,
        dots: part.dots,
        midis: sortedMidis,
        keys,
        noteRefs: refsForPart,
        wasFolded: anyFolded,
        isTiedContinuation: isContinuationSubPart || allTiedFromPrev,
        tieFromPrev: isContinuationSubPart || (pIdx === 0 && anyTiedFromPrev),
        tieToNext: !isLastSubPart || (anyContinuesToNextBar && isLastSubPart && Math.abs(curPartQ + part.qDur - totalQuarters) < 0.05),
        tripletGroupId: null
      });
      curPartQ = Math.round((curPartQ + part.qDur) * 16) / 16;
    });

    cursorGrid12 = Math.min(totalGrid12, Math.round(curPartQ * 12));
    ci++;
  }

  // Fill any trailing rests to reach end of measure
  if (totalGrid12 - cursorGrid12 >= 2) {
    const trailingStartQ = cursorGrid12 / 12;
    events.push(...buildAlignedRests(trailingStartQ, totalQuarters, beatUnitQ));
  }

  // Stamp exact tick and second timestamps on every event
  for (const ev of events) {
    const evStartTick = Math.round(startTicks + ev.startQ * ppq);
    const evEndTick = Math.min(endTicks, Math.round(startTicks + (ev.startQ + ev.qDur) * ppq));
    ev.startTick = evStartTick;
    ev.endTick = Math.max(evStartTick + 1, evEndTick);
    ev.startTime = tempoMap.ticksToSec(evStartTick);
    ev.endTime = tempoMap.ticksToSec(ev.endTick);
  }

  return {
    clef,
    isEmptyBar: false,
    events,
    quantErrsMs
  };
}

/**
 * Estimate dynamic logical width for a single measure so dense 16th-note passages breathe naturally.
 */
function calcMeasureWidth(measure) {
  const rhCount = measure.rh.isEmptyBar ? 1 : measure.rh.events.length;
  const lhCount = measure.lh.isEmptyBar ? 1 : measure.lh.events.length;
  const maxEvents = Math.max(rhCount, lhCount);

  let accidentalPenalty = 0;
  let chordPenalty = 0;
  for (const ev of [...measure.rh.events, ...measure.lh.events]) {
    if (ev.isRest) continue;
    if (ev.keys && ev.keys.length > 2) chordPenalty += 8;
    for (const k of ev.keys || []) {
      if (k.includes('#') || k.includes('b')) accidentalPenalty += 3;
    }
  }

  const timeKeyPrefix = (measure.showKeySigChange ? 38 : 0) + (measure.showTimeSigChange ? 26 : 0);
  const raw = 112 + maxEvents * 28 + Math.min(72, accidentalPenalty) + Math.min(48, chordPenalty) + timeKeyPrefix;
  return Math.max(150, Math.min(440, raw));
}

/**
 * Reconcile effective start/end ticks for notes, honoring Smart MIDI Hygiene onset snaps.
 */
function prepareHandNoteSegments(notes = [], handTrack, tempoMap) {
  return notes
    .filter((n) => n && Number.isFinite(n.midi) && Number.isFinite(n.time))
    .map((n) => {
      const midi = Math.max(36, Math.min(96, Math.round(n.midi)));
      const rawDuration = Math.max(0.05, Number(n.duration) || 0.25);
      const rawTicks = Number(n.ticks);
      const needsRecompute =
        !Number.isFinite(rawTicks) ||
        Math.abs(tempoMap.ticksToSec(rawTicks) - n.time) > 0.003;

      const startTicks = needsRecompute
        ? Math.max(0, Math.round(tempoMap.secToTicks(n.time)))
        : Math.max(0, Math.round(rawTicks));

      const rawDurTicks = Number(n.durationTicks);
      const endTicks = (!needsRecompute && Number.isFinite(rawDurTicks) && rawDurTicks > 0 && Math.abs(tempoMap.ticksToSec(startTicks + rawDurTicks) - (n.time + rawDuration)) <= 0.015)
        ? Math.max(startTicks + 1, Math.round(startTicks + rawDurTicks))
        : Math.max(startTicks + 1, Math.round(tempoMap.secToTicks(n.time + rawDuration)));

      return {
        noteId: n.id,
        midi,
        time: n.time,
        duration: rawDuration,
        velocity: Number(n.velocity) || 85,
        wasFolded: Boolean(n.wasFolded),
        semitoneShift: Number(n.semitoneShift) || 0,
        handTrack,
        startTicks,
        endTicks
      };
    })
    .sort((a, b) => a.startTicks - b.startTicks || a.midi - b.midi);
}

/**
 * Build complete Grand-Staff Score Model from parsed/assigned song data.
 */
function buildScoreData(song, options = {}) {
  const vfRef = options.vf || null;
  if (!song) return null;

  const ppq = Math.max(1, Number(song.ppq) || 480);
  const xmlMeta = song.musicXmlMeta || null;

  const temposInput = xmlMeta?.tempoChanges?.length
    ? xmlMeta.tempoChanges
    : (song.headerTempos?.length ? song.headerTempos : [{ ticks: 0, bpm: song.bpm || 120 }]);
  const tempoMap = buildTempoMap(temposInput, ppq);

  const timeSigsInput = xmlMeta?.timeSignatures?.length
    ? xmlMeta.timeSignatures
    : (song.headerTimeSignatures?.length
        ? song.headerTimeSignatures
        : [{ ticks: 0, numerator: song.timeSigNumerator || 4, denominator: song.timeSigDenominator || 4 }]);
  const timeSigMap = buildTimeSigMap(timeSigsInput, ppq);

  const rhPrepared = prepareHandNoteSegments(song.track1Notes || [], 1, tempoMap);
  const lhPrepared = prepareHandNoteSegments(song.track2Notes || [], 2, tempoMap);
  const allPrepared = [...rhPrepared, ...lhPrepared];

  // Key Signature: MusicXML -> valid MIDI header -> Krumhansl tonal estimation fallback
  const explicitKeySigs = [];
  if (xmlMeta?.keySignatures?.length) {
    explicitKeySigs.push(...xmlMeta.keySignatures);
  } else if (Array.isArray(song.headerKeySignatures)) {
    for (const ks of song.headerKeySignatures) {
      if (ks && typeof ks.key === 'string' && ks.key.trim()) {
        explicitKeySigs.push(ks);
      }
    }
  } else if (song.keySignature) {
    explicitKeySigs.push({ ticks: 0, key: song.keySignature });
  }

  let estimatedKey = null;
  let keyIsEstimated = false;
  let fallbackKey = 'C';
  if (explicitKeySigs.length === 0) {
    estimatedKey = estimateKeySignature(allPrepared);
    fallbackKey = estimatedKey.vfKeySpec;
    keyIsEstimated = true;
  }
  const keySigMap = buildKeySigMap(explicitKeySigs, fallbackKey);

  // Measure Grid Construction: prefer explicit MusicXML measure boundaries (captures pickups/repeats cleanly)
  const rawMaxTickNotes = allPrepared.reduce((mx, n) => Math.max(mx, n.endTicks), 0);
  const rawMaxTickDur = Math.round(tempoMap.secToTicks(Math.max(1, song.duration || 4)));
  const maxEndTicks = Math.max(rawMaxTickNotes, rawMaxTickDur, timeSigMap.entries[0].measureTicks);

  const measures = [];
  if (xmlMeta?.measures?.length > 0) {
    let prevTsLabel = null;
    let prevKeySpec = null;
    for (let i = 0; i < xmlMeta.measures.length; i++) {
      const m = xmlMeta.measures[i];
      const mStart = Math.max(0, Math.round(Number(m.startTicks) || 0));
      const mEnd = Math.max(mStart + 1, Math.round(Number(m.endTicks) || (mStart + ppq * 4)));
      const num = Math.max(1, Number(m.numerator) || 4);
      const den = Math.max(1, Number(m.denominator) || 4);
      const tsLabel = `${num}/${den}`;
      const vfKeySpec = normalizeVfKeySpec(m.vfKeySpec || keySigMap.getAtTick(mStart).vfKeySpec, m.fifths, m.mode);

      measures.push({
        index: i,
        number: m.number || (i + 1),
        startTicks: mStart,
        endTicks: mEnd,
        startTime: Number.isFinite(m.startTime) ? m.startTime : tempoMap.ticksToSec(mStart),
        endTime: Number.isFinite(m.endTime) ? m.endTime : tempoMap.ticksToSec(mEnd),
        numerator: num,
        denominator: den,
        timeSigLabel: tsLabel,
        vfKeySpec,
        keyDisplayName: formatKeyDisplayName(vfKeySpec),
        isPickup: Boolean(m.isPickup),
        showTimeSigChange: i > 0 && tsLabel !== prevTsLabel,
        showKeySigChange: i > 0 && vfKeySpec !== prevKeySpec,
        prevVfKeySpec: i > 0 ? prevKeySpec : null,
        chords: []
      });
      prevTsLabel = tsLabel;
      prevKeySpec = vfKeySpec;
    }
  } else {
    let tick = 0;
    let barIdx = 0;
    let prevTsLabel = null;
    let prevKeySpec = null;
    const sortedTimeSigs = timeSigMap.entries;

    while (tick < maxEndTicks && barIdx < 2000) {
      const ts = timeSigMap.getAtTick(tick);
      let nextTick = tick + ts.measureTicks;
      // Snap prematurely to an explicit time signature change occurring mid-cycle
      for (const entry of sortedTimeSigs) {
        if (entry.ticks > tick && entry.ticks < nextTick) {
          nextTick = entry.ticks;
          break;
        }
      }
      if (nextTick <= tick) nextTick = tick + ts.measureTicks;

      const ks = keySigMap.getAtTick(tick);
      measures.push({
        index: barIdx,
        number: barIdx + 1,
        startTicks: tick,
        endTicks: nextTick,
        startTime: tempoMap.ticksToSec(tick),
        endTime: tempoMap.ticksToSec(nextTick),
        numerator: ts.numerator,
        denominator: ts.denominator,
        timeSigLabel: ts.label,
        vfKeySpec: ks.vfKeySpec,
        keyDisplayName: ks.displayName,
        isPickup: false,
        showTimeSigChange: barIdx > 0 && ts.label !== prevTsLabel,
        showKeySigChange: barIdx > 0 && ks.vfKeySpec !== prevKeySpec,
        prevVfKeySpec: barIdx > 0 ? prevKeySpec : null,
        chords: []
      });
      prevTsLabel = ts.label;
      prevKeySpec = ks.vfKeySpec;
      tick = nextTick;
      barIdx++;
    }
  }

  // Attach chord symbols (if present from MusicXML) onto their respective measure
  const chordMarkers = song.chordMarkers || xmlMeta?.chordMarkers || [];
  if (Array.isArray(chordMarkers) && chordMarkers.length > 0 && measures.length > 0) {
    let mCursor = 0;
    const sortedChords = chordMarkers.slice().sort((a, b) => (Number(a.ticks) || 0) - (Number(b.ticks) || 0));
    for (const cm of sortedChords) {
      const t = Math.round(Number(cm.ticks) || 0);
      while (mCursor + 1 < measures.length && t >= measures[mCursor].endTicks) {
        mCursor++;
      }
      const targetBar = measures[mCursor];
      if (t >= targetBar.startTicks && t < targetBar.endTicks) {
        const beatOffsetQ = (t - targetBar.startTicks) / ppq;
        targetBar.chords.push({
          symbol: String(cm.symbol || '').trim(),
          ticks: t,
          beatOffsetQ
        });
      }
    }
  }

  // Partition hand notes across overlapping measures & solve notation events
  const collectBarSegments = (handNotes, mStart, mEnd) => {
    const segs = [];
    for (const n of handNotes) {
      if (n.startTicks >= mEnd) break;
      if (n.endTicks <= mStart) continue;
      segs.push({
        ...n,
        segStartTick: Math.max(mStart, n.startTicks),
        segEndTick: Math.min(mEnd, n.endTicks),
        isTiedFromPrev: n.startTicks < mStart,
        continuesToNextBar: n.endTicks > mEnd
      });
    }
    return segs;
  };

  let curX = 0;
  const allQuantErrsMs = [];
  for (const m of measures) {
    const rhSegs = collectBarSegments(rhPrepared, m.startTicks, m.endTicks);
    const lhSegs = collectBarSegments(lhPrepared, m.startTicks, m.endTicks);

    m.rh = solveMeasureHandEvents(rhSegs, m, 'treble', tempoMap, vfRef);
    m.lh = solveMeasureHandEvents(lhSegs, m, 'bass', tempoMap, vfRef);

    allQuantErrsMs.push(...m.rh.quantErrsMs, ...m.lh.quantErrsMs);

    m.width = calcMeasureWidth(m);
    m.startX = curX;
    m.endX = curX + m.width;
    m.renderedTickAnchors = [
      { tick: m.startTicks, x: m.startX },
      { tick: m.endTicks, x: m.endX }
    ];
    curX = m.endX;
  }

  const avgQuantErrMs = allQuantErrsMs.length > 0
    ? allQuantErrsMs.reduce((s, v) => s + v, 0) / allQuantErrsMs.length
    : 0;

  return {
    scoreId: `${song.songId || 'song'}:${song.selectedTrackMode || 'auto'}:${song.midiCleanStats?.enabled ? 'clean' : 'raw'}:${song.track1Notes?.length || 0}:${song.track2Notes?.length || 0}`,
    ppq,
    tempoMap,
    timeSigMap,
    keySigMap,
    primaryKeySpec: keySigMap.entries[0].vfKeySpec,
    primaryKeyDisplay: keySigMap.entries[0].displayName,
    keyIsEstimated,
    estimatedKeyConfidence: estimatedKey ? estimatedKey.confidence : 1.0,
    measures,
    totalScoreWidth: curX,
    avgQuantErrMs,
    quantErrSamples: allQuantErrsMs
  };
}

/**
 * Evaluate notation legibility/messiness (e.g., raw YouTube/basic-pitch audio transcriptions)
 * so the user receives a non-blocking banner with one-click cleanup or Highway switch.
 */
function assessNotationQuality(song, scoreData) {
  if (!song || !scoreData) {
    return {
      isMessy: false,
      messyScore: 0,
      offGridPct: 0,
      tinyGhostPct: 0,
      avgErrMs: 0,
      denseSlabPct: 0,
      summaryReason: null
    };
  }

  // MusicXML files are authored engraving scores and shouldn't trip transcription jitter warnings
  if (song.musicXmlMeta) {
    return {
      isMessy: false,
      messyScore: 0,
      offGridPct: 0,
      tinyGhostPct: 0,
      avgErrMs: Math.round(scoreData.avgQuantErrMs || 0),
      denseSlabPct: 0,
      summaryReason: null
    };
  }

  const allNotes = [...(song.track1Notes || []), ...(song.track2Notes || [])];
  if (allNotes.length < 8) {
    return {
      isMessy: false,
      messyScore: 0,
      offGridPct: 0,
      tinyGhostPct: 0,
      avgErrMs: Math.round(scoreData.avgQuantErrMs || 0),
      denseSlabPct: 0,
      summaryReason: null
    };
  }

  const tinyCount = allNotes.filter((n) => (Number(n.duration) || 0) < 0.08).length;
  const tinyGhostPct = (tinyCount / allNotes.length) * 100;

  const errs = scoreData.quantErrSamples || [];
  const offGridCount = errs.filter((e) => e > 42).length;
  const offGridPct = errs.length > 0 ? (offGridCount / errs.length) * 100 : 0;
  const avgErrMs = scoreData.avgQuantErrMs || 0;

  // Detect >4-voice chord slabs in raw clusters
  const checkSlab = (arr) => {
    let slabs = 0;
    let totalClusters = 0;
    let i = 0;
    while (i < arr.length) {
      totalClusters++;
      const t0 = arr[i].time;
      let j = i + 1;
      while (j < arr.length && arr[j].time - t0 <= 0.03) j++;
      if (j - i > 4) slabs++;
      i = j;
    }
    return { slabs, totalClusters };
  };
  const s1 = checkSlab(song.track1Notes || []);
  const s2 = checkSlab(song.track2Notes || []);
  const totalCl = Math.max(1, s1.totalClusters + s2.totalClusters);
  const denseSlabPct = ((s1.slabs + s2.slabs) / totalCl) * 100;

  const messyScore =
    Math.min(45, offGridPct * 0.95) +
    Math.min(35, tinyGhostPct * 1.4) +
    Math.min(20, Math.max(0, avgErrMs - 24) * 0.6) +
    Math.min(20, denseSlabPct * 1.5);

  const isMessy =
    tinyGhostPct >= 14 ||
    offGridPct >= 34 ||
    (avgErrMs >= 42 && offGridPct >= 22) ||
    denseSlabPct >= 15 ||
    messyScore >= 46;

  let summaryReason = null;
  if (isMessy) {
    const reasons = [];
    if (tinyGhostPct >= 12) reasons.push(`${Math.round(tinyGhostPct)}% sub-80ms micro-notes`);
    if (offGridPct >= 25 || avgErrMs >= 38) reasons.push(`${Math.round(offGridPct)}% off-beat timing`);
    if (denseSlabPct >= 12) reasons.push('over-dense chord clusters');
    summaryReason = reasons.length > 0
      ? `Rough audio transcription (${reasons.join(', ')}) — notation may be crowded.`
      : 'Unquantized timing detected — notation may appear dense.';
  }

  return {
    isMessy,
    messyScore: Math.round(messyScore),
    offGridPct: Math.round(offGridPct),
    tinyGhostPct: Math.round(tinyGhostPct),
    avgErrMs: Math.round(avgErrMs),
    denseSlabPct: Math.round(denseSlabPct),
    summaryReason
  };
}

/**
 * Piecewise linear tick -> score X coordinate interpolation using rendered VexFlow notehead centers.
 */
function tickToScoreX(scoreData, tick) {
  if (!scoreData || !scoreData.measures || scoreData.measures.length === 0) return 0;
  const measures = scoreData.measures;
  const t = Number(tick) || 0;

  const getBarFirstAnchor = (barIdx) => {
    const m = measures[barIdx];
    if (!m) return null;
    if (m.renderedTickAnchors && m.renderedTickAnchors.length > 0) {
      return m.renderedTickAnchors[0];
    }
    return {
      tick: m.startTicks,
      x: m.downbeatX ?? (m.startX + (barIdx === 0 ? 52 : 14))
    };
  };

  // Before bar 0 (lead-in countdown region): extrapolate cleanly backward from Beat 1 notehead anchor
  const firstBar = measures[0];
  if (t < firstBar.startTicks) {
    const a0 = getBarFirstAnchor(0);
    const anchors = firstBar.renderedTickAnchors;
    const lastA = anchors && anchors.length > 1 ? anchors[anchors.length - 1] : null;
    const nextBarFirst = measures.length > 1 ? getBarFirstAnchor(1) : null;
    const refEndTick = lastA ? lastA.tick : (nextBarFirst ? nextBarFirst.tick : firstBar.endTicks);
    const refEndX = lastA ? lastA.x : (nextBarFirst ? nextBarFirst.x : firstBar.endX);
    const spanTicks = Math.max(1, refEndTick - a0.tick);
    const pxPerTick = Math.max(0.03, (refEndX - a0.x) / spanTicks);
    return a0.x + (t - a0.tick) * pxPerTick;
  }

  const lastBar = measures[measures.length - 1];
  if (t >= lastBar.endTicks) {
    const a0 = getBarFirstAnchor(measures.length - 1);
    const spanTicks = Math.max(1, lastBar.endTicks - a0.tick);
    const pxPerTick = Math.max(0.03, (lastBar.endX - a0.x) / spanTicks);
    return lastBar.endX + (t - lastBar.endTicks) * pxPerTick;
  }

  // Binary search active measure
  let lo = 0;
  let hi = measures.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < measures[mid].endTicks) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const bar = measures[lo];
  const anchors = bar.renderedTickAnchors;
  if (!anchors || anchors.length === 0) {
    const ratio = Math.max(0, Math.min(1, (t - bar.startTicks) / Math.max(1, bar.endTicks - bar.startTicks)));
    return bar.startX + ratio * (bar.endX - bar.startX);
  }

  // Build effective segment target cleanly up to nextBar's Beat 1 anchor (zero barline jump)
  const nextBarFirst = lo + 1 < measures.length ? getBarFirstAnchor(lo + 1) : null;
  const endTargetTick = bar.endTicks;
  const endTargetX = Math.max(
    anchors[anchors.length - 1].x + 1,
    nextBarFirst ? nextBarFirst.x : bar.endX
  );

  if (t <= anchors[0].tick) return anchors[0].x;

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (t <= b.tick) {
      const span = Math.max(1e-6, b.tick - a.tick);
      const u = Math.max(0, Math.min(1, (t - a.tick) / span));
      return a.x + u * (b.x - a.x);
    }
  }

  const lastAnchor = anchors[anchors.length - 1];
  const tailSpan = Math.max(1, endTargetTick - lastAnchor.tick);
  const u = Math.max(0, Math.min(1, (t - lastAnchor.tick) / tailSpan));
  return lastAnchor.x + u * (endTargetX - lastAnchor.x);
}

/**
 * Create the canvas-backed VexFlow 5 notation tile renderer with LRU cache & viewport overlay painter.
 */
function createNotationRenderer({ vf, parchmentImage = null, createCanvas = null } = {}) {
  const MAX_TILES = 120;
  const tileCache = new Map(); // cacheKey -> tileObject
  const gutterCache = new Map(); // `${vfKeySpec}:${timeSigLabel}:${dpr}` -> { canvas, width, height }
  let parchmentPattern = null;
  let bgCache = null; // { canvas, width, height, rulerH, dpr, hasImage }
  let prewarmHandle = null;
  let activeScoreId = null;
  let txtCanvasInitialized = false;

  const makeCanvas = (w, h) => {
    if (typeof createCanvas === 'function') return createCanvas(w, h);
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    throw new Error('No canvas factory available for NotationRenderer');
  };

  const ensureTextCanvas = () => {
    if (txtCanvasInitialized || !vf?.Element?.setTextMeasurementCanvas) return;
    try {
      const tiny = makeCanvas(64, 64);
      vf.Element.setTextMeasurementCanvas(tiny);
      txtCanvasInitialized = true;
    } catch {
      // Ignore if VexFlow txtCanvas init already ran or mocked out
    }
  };

  const cancelPrewarm = () => {
    if (prewarmHandle === null) return;
    if (typeof cancelIdleCallback === 'function' && prewarmHandle.type === 'idle') {
      cancelIdleCallback(prewarmHandle.id);
    } else if (typeof clearTimeout === 'function' && prewarmHandle.type === 'timeout') {
      clearTimeout(prewarmHandle.id);
    }
    prewarmHandle = null;
  };

  const clearCache = () => {
    cancelPrewarm();
    activeScoreId = null;
    tileCache.clear();
    gutterCache.clear();
    parchmentPattern = null;
    bgCache = null;
  };

  const dispose = () => {
    clearCache();
  };

  const invalidateMeasure = (measureIndex) => {
    for (const key of Array.from(tileCache.keys())) {
      if (key.endsWith(`:${measureIndex}`)) {
        tileCache.delete(key);
      }
    }
  };

  const touchLru = (key, value) => {
    if (tileCache.has(key)) {
      tileCache.delete(key);
    }
    tileCache.set(key, value);
    while (tileCache.size > MAX_TILES) {
      const oldestKey = tileCache.keys().next().value;
      tileCache.delete(oldestKey);
    }
  };

  const getNoteHeadCenterX = (staveNote) => {
    try {
      if (typeof staveNote.getNoteHeadBeginX === 'function' && typeof staveNote.getNoteHeadEndX === 'function') {
        const bx = staveNote.getNoteHeadBeginX();
        const ex = staveNote.getNoteHeadEndX();
        if (Number.isFinite(bx) && Number.isFinite(ex) && ex > bx) {
          return (bx + ex) / 2;
        }
      }
      if (staveNote.noteHeads?.[0] && typeof staveNote.noteHeads[0].getAbsoluteX === 'function') {
        const w = typeof staveNote.noteHeads[0].getWidth === 'function' ? staveNote.noteHeads[0].getWidth() : 10;
        return staveNote.noteHeads[0].getAbsoluteX() + w / 2;
      }
      return staveNote.getAbsoluteX() + 5;
    } catch {
      return staveNote.getAbsoluteX();
    }
  };

  /**
   * Pre-render fixed left sticky Grand Staff gutter (Brace + Treble/Bass Clef + Active Key Signature).
   */
  const getOrRenderStickyGutter = (vfKeySpec, dpr) => {
    const safeKey = normalizeVfKeySpec(vfKeySpec);
    const cacheKey = `${safeKey}:${dpr}`;
    if (gutterCache.has(cacheKey)) return gutterCache.get(cacheKey);

    ensureTextCanvas();
    const probeStave = new vf.Stave(0, TREBLE_STAVE_Y, 190, STAVE_CONFIG);
    probeStave.addClef('treble');
    if (safeKey !== 'C' && safeKey !== 'Am') {
      probeStave.addKeySignature(safeKey);
    }
    probeStave.format();
    const logicalWidth = Math.max(66, Math.ceil(probeStave.getNoteStartX() + 18));

    const canvasEl = makeCanvas(Math.ceil(logicalWidth * dpr), Math.ceil(TILE_LOGICAL_H * dpr));
    const gctx = canvasEl.getContext('2d');
    if (typeof gctx.setTransform === 'function') {
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Horizontal warm parchment fill + subtle feather edge so scrolling noteheads slide softly behind
    const bgGrad = gctx.createLinearGradient(logicalWidth - 18, 0, logicalWidth, 0);
    bgGrad.addColorStop(0, '#f4ebd9');
    bgGrad.addColorStop(0.55, 'rgba(244, 235, 217, 0.94)');
    bgGrad.addColorStop(1, 'rgba(244, 235, 217, 0)');
    gctx.fillStyle = '#f4ebd9';
    gctx.fillRect(0, 0, Math.max(0, logicalWidth - 18), TILE_LOGICAL_H);
    gctx.fillStyle = bgGrad;
    gctx.fillRect(Math.max(0, logicalWidth - 18), 0, 18, TILE_LOGICAL_H);

    // Subtle right boundary sepia rule
    gctx.strokeStyle = 'rgba(110, 86, 58, 0.25)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(logicalWidth - 12, TREBLE_STAVE_Y + 25);
    gctx.lineTo(logicalWidth - 12, BASS_STAVE_Y + 65);
    gctx.stroke();

    const renderer = new vf.Renderer(canvasEl, vf.Renderer.Backends.CANVAS);
    const vfCtx = renderer.getContext();
    const gStaveT = new vf.Stave(14, TREBLE_STAVE_Y, logicalWidth - 20, STAVE_CONFIG);
    gStaveT.setStyle({ strokeStyle: '#6e563a', fillStyle: '#1a0a00' });
    gStaveT.setEndBarType(vf.BarlineType.NONE);
    gStaveT.addClef('treble');
    if (safeKey !== 'C' && safeKey !== 'Am') {
      gStaveT.addKeySignature(safeKey);
    }
    gStaveT.setContext(vfCtx).draw();

    const gStaveB = new vf.Stave(14, BASS_STAVE_Y, logicalWidth - 20, STAVE_CONFIG);
    gStaveB.setStyle({ strokeStyle: '#6e563a', fillStyle: '#1a0a00' });
    gStaveB.setEndBarType(vf.BarlineType.NONE);
    gStaveB.addClef('bass');
    if (safeKey !== 'C' && safeKey !== 'Am') {
      gStaveB.addKeySignature(safeKey);
    }
    gStaveB.setContext(vfCtx).draw();

    const brace = new vf.StaveConnector(gStaveT, gStaveB);
    brace.setType(vf.StaveConnector.type.BRACE);
    brace.setStyle({ strokeStyle: '#1a0a00', fillStyle: '#1a0a00' });
    brace.setContext(vfCtx).draw();

    const leftLine = new vf.StaveConnector(gStaveT, gStaveB);
    leftLine.setType(vf.StaveConnector.type.SINGLE_LEFT);
    leftLine.setStyle({ strokeStyle: '#6e563a', fillStyle: '#6e563a' });
    leftLine.setContext(vfCtx).draw();

    const entry = { canvas: canvasEl, width: logicalWidth, height: TILE_LOGICAL_H };
    gutterCache.set(cacheKey, entry);
    return entry;
  };

  /**
   * Build and draw a single measure onto an offscreen transparent canvas tile,
   * recording exact rendered notehead coordinates and monotonic tick anchors.
   */
  const renderMeasureTile = (scoreData, measureIndex, dpr = 1) => {
    const measure = scoreData.measures[measureIndex];
    if (!measure) return null;

    const cacheKey = `${scoreData.scoreId}:${dpr}:${measureIndex}`;
    if (tileCache.has(cacheKey)) {
      const hit = tileCache.get(cacheKey);
      touchLru(cacheKey, hit);
      return hit;
    }

    ensureTextCanvas();
    const PAD_X = 28; // Side bleed for overhanging cross-bar ties, accidentals & barline dots
    const tileW = Math.ceil(measure.width + PAD_X * 2);
    const tileH = TILE_LOGICAL_H;

    const tileCanvas = makeCanvas(Math.ceil(tileW * dpr), Math.ceil(tileH * dpr));
    const rawCtx = tileCanvas.getContext('2d');
    if (typeof rawCtx.setTransform === 'function') {
      rawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const renderer = new vf.Renderer(tileCanvas, vf.Renderer.Backends.CANVAS);
    const vfCtx = renderer.getContext();

    const staveTreble = new vf.Stave(PAD_X, TREBLE_STAVE_Y, measure.width, STAVE_CONFIG);
    staveTreble.setStyle({ strokeStyle: '#6e563a', fillStyle: '#1a0a00' });
    staveTreble.setBegBarType(vf.BarlineType.NONE);
    staveTreble.setEndBarType(
      measureIndex === scoreData.measures.length - 1
        ? vf.BarlineType.END
        : vf.BarlineType.SINGLE
    );

    const staveBass = new vf.Stave(PAD_X, BASS_STAVE_Y, measure.width, STAVE_CONFIG);
    staveBass.setStyle({ strokeStyle: '#6e563a', fillStyle: '#1a0a00' });
    staveBass.setBegBarType(vf.BarlineType.NONE);
    staveBass.setEndBarType(
      measureIndex === scoreData.measures.length - 1
        ? vf.BarlineType.END
        : vf.BarlineType.SINGLE
    );

    const showBarTimeSig = measureIndex === 0 || measure.showTimeSigChange;
    if (measure.showKeySigChange && measure.vfKeySpec) {
      staveTreble.addKeySignature(measure.vfKeySpec);
      staveBass.addKeySignature(measure.vfKeySpec);
    }
    if (showBarTimeSig && measure.timeSigLabel) {
      staveTreble.addTimeSignature(measure.timeSigLabel);
      staveBass.addTimeSignature(measure.timeSigLabel);
    }

    staveTreble.setContext(vfCtx).draw();
    staveBass.setContext(vfCtx).draw();

    // Right barline connector across Grand Staff
    const barConn = new vf.StaveConnector(staveTreble, staveBass);
    barConn.setType(vf.StaveConnector.type.SINGLE_RIGHT);
    barConn.setStyle({ strokeStyle: '#8c7456', fillStyle: '#8c7456' });
    barConn.setContext(vfCtx).draw();

    const buildHandVex = (handData, clef, stave, handTrack) => {
      const staveNotes = [];
      const tupletsMap = new Map();

      for (const ev of handData.events) {
        const sn = new vf.StaveNote({
          keys: ev.isRest ? [clef === 'treble' ? 'b/4' : 'd/3'] : ev.keys,
          duration: ev.duration,
          clef,
          autoStem: true
        });

        sn.setStyle({
          fillStyle: handTrack === 1 ? '#1a0a00' : '#1b2638',
          strokeStyle: handTrack === 1 ? '#1a0a00' : '#1b2638'
        });

        if (ev.dots > 0 && vf.Dot && typeof vf.Dot.buildAndAttach === 'function') {
          vf.Dot.buildAndAttach([sn], { all: true });
        }

        if (ev.tripletGroupId) {
          if (!tupletsMap.has(ev.tripletGroupId)) tupletsMap.set(ev.tripletGroupId, []);
          tupletsMap.get(ev.tripletGroupId).push(sn);
        }
        staveNotes.push({ ev, sn });
      }

      const tickables = staveNotes.map((x) => x.sn);
      const voice = new vf.Voice({ numBeats: measure.numerator, beatValue: measure.denominator });
      voice.setMode(vf.Voice.Mode.SOFT);
      voice.addTickables(tickables);

      if (vf.Accidental && typeof vf.Accidental.applyAccidentals === 'function') {
        try {
          vf.Accidental.applyAccidentals([voice], measure.vfKeySpec || 'C');
        } catch {
          // Safe fallback if a rare edge pitch fails accidental application
        }
      }

      let beams = [];
      try {
        const beamGroups = vf.Beam.getDefaultBeamGroups(`${measure.numerator}/${measure.denominator}`);
        beams = vf.Beam.generateBeams(tickables, {
          groups: beamGroups,
          beamRests: false,
          maintainStemDirections: true
        });
      } catch {
        beams = [];
      }

      const tuplets = [];
      for (const tNotes of tupletsMap.values()) {
        if (tNotes.length >= 2) {
          try {
            tuplets.push(new vf.Tuplet(tNotes, { numNotes: 3, notesOccupied: 2 }));
          } catch {
            // Skip malformed tuplet
          }
        }
      }

      return { handData, stave, staveNotes, tickables, voice, beams, tuplets, handTrack };
    };

    const rhBuilt = buildHandVex(measure.rh, 'treble', staveTreble, 1);
    const lhBuilt = buildHandVex(measure.lh, 'bass', staveBass, 2);

    const noteStartX = Math.max(staveTreble.getNoteStartX(), staveBass.getNoteStartX());
    const noteEndX = Math.min(staveTreble.getNoteEndX(), staveBass.getNoteEndX());
    const formatWidth = Math.max(48, noteEndX - noteStartX - 18);

    try {
      new vf.Formatter()
        .joinVoices([rhBuilt.voice, lhBuilt.voice])
        .format([rhBuilt.voice, lhBuilt.voice], formatWidth);
    } catch {
      // Format independently if voice join hits fractional rounding discrepancy
      try {
        new vf.Formatter().joinVoices([rhBuilt.voice]).format([rhBuilt.voice], formatWidth);
        new vf.Formatter().joinVoices([lhBuilt.voice]).format([lhBuilt.voice], formatWidth);
      } catch {
        // Leave fallback spacing
      }
    }

    const drawBuiltHand = (built) => {
      try {
        built.voice.draw(vfCtx, built.stave);
        for (const b of built.beams) {
          b.setStyle({ fillStyle: built.handTrack === 1 ? '#1a0a00' : '#1b2638', strokeStyle: built.handTrack === 1 ? '#1a0a00' : '#1b2638' });
          b.setContext(vfCtx).draw();
        }
        for (const t of built.tuplets) {
          t.setContext(vfCtx).draw();
        }
      } catch {
        // Ignore single-bar VexFlow draw edge errors rather than stalling 60 FPS loop
      }

      // Draw ties within this measure & partial ties crossing into/out of adjacent measures
      const list = built.staveNotes;
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (cur.ev.isRest) continue;

        if (cur.ev.tieToNext) {
          const next = list[i + 1];
          const isInternalChain = next && !next.ev.isRest && next.ev.tieFromPrev;
          try {
            if (isInternalChain) {
              const idxs = cur.ev.keys.map((_, kIdx) => kIdx).filter((kIdx) => kIdx < next.ev.keys.length);
              const tie = new vf.StaveTie({
                firstNote: cur.sn,
                lastNote: next.sn,
                firstIndexes: idxs,
                lastIndexes: idxs
              });
              tie.setContext(vfCtx).draw();
            } else {
              const idxs = cur.ev.keys.map((_, kIdx) => kIdx);
              const outTie = new vf.StaveTie({
                firstNote: cur.sn,
                lastNote: null,
                firstIndexes: idxs,
                lastIndexes: idxs
              });
              outTie.setContext(vfCtx).draw();
            }
          } catch {
            // Safe tie fallback
          }
        }

        if (cur.ev.tieFromPrev && (i === 0 || list[i - 1].ev.isRest || !list[i - 1].ev.tieToNext)) {
          try {
            const idxs = cur.ev.keys.map((_, kIdx) => kIdx);
            const inTie = new vf.StaveTie({
              firstNote: null,
              lastNote: cur.sn,
              firstIndexes: idxs,
              lastIndexes: idxs
            });
            inTie.setContext(vfCtx).draw();
          } catch {
            // Safe tie fallback
          }
        }
      }
    };

    drawBuiltHand(rhBuilt);
    drawBuiltHand(lhBuilt);

    // Draw measure number & chord symbols along top parchment margin
    rawCtx.save();
    rawCtx.fillStyle = '#7c6548';
    rawCtx.font = 'bold 10px "Consolas", monospace';
    rawCtx.textAlign = 'left';
    rawCtx.fillText(String(measure.number), PAD_X + 3, 16);

    if (measure.chords && measure.chords.length > 0) {
      rawCtx.fillStyle = '#5c2d0c';
      rawCtx.font = 'bold 12px Georgia, serif';
      const measureTotalQ = Math.max(0.25, (measure.endTicks - measure.startTicks) / scoreData.ppq);
      for (const ch of measure.chords) {
        if (!ch.symbol) continue;
        const rel = Math.max(0, Math.min(0.95, ch.beatOffsetQ / measureTotalQ));
        const chX = (noteStartX - PAD_X) + rel * Math.max(40, (noteEndX - noteStartX) - 16) + PAD_X;
        rawCtx.fillText(ch.symbol, chX, 28);
      }
    }
    rawCtx.restore();

    // Collect pixel-exact note overlays and build monotonic renderedTickAnchors
    const noteOverlays = [];
    const tickToXs = new Map();
    const recordBuiltOverlays = (built) => {
      for (const { ev, sn } of built.staveNotes) {
        if (ev.isRest) {
          if (!ev.isWholeBarRest && Number.isFinite(ev.startTick)) {
            const restTileX = typeof sn.getAbsoluteX === 'function' ? sn.getAbsoluteX() + 5 : noteStartX + 4;
            const scoreX = measure.startX + (restTileX - PAD_X);
            if (!tickToXs.has(ev.startTick)) tickToXs.set(ev.startTick, []);
            tickToXs.get(ev.startTick).push(scoreX);
          }
          continue;
        }
        const centerTileX = getNoteHeadCenterX(sn);
        const scoreX = measure.startX + (centerTileX - PAD_X);
        const ys = typeof sn.getYs === 'function' ? sn.getYs() : [built.handTrack === 1 ? TREBLE_STAVE_Y + 45 : BASS_STAVE_Y + 45];

        const foldedRef = (ev.noteRefs || []).find((r) => r.wasFolded && Number(r.semitoneShift) !== 0);
        let minY = Infinity;
        let maxY = -Infinity;
        for (let yi = 0; yi < ys.length; yi++) {
          if (ys[yi] < minY) minY = ys[yi];
          if (ys[yi] > maxY) maxY = ys[yi];
        }
        noteOverlays.push({
          scoreX,
          ys,
          minY: Number.isFinite(minY) ? minY : 0,
          maxY: Number.isFinite(maxY) ? maxY : 0,
          startTick: ev.startTick,
          endTick: ev.endTick,
          startTime: ev.startTime,
          endTime: ev.endTime,
          handTrack: built.handTrack,
          isTiedContinuation: Boolean(ev.isTiedContinuation),
          wasFolded: Boolean(ev.wasFolded),
          foldShift: foldedRef ? Number(foldedRef.semitoneShift) : 0,
          noteRefs: ev.noteRefs
        });

        const tKey = ev.startTick;
        if (!tickToXs.has(tKey)) tickToXs.set(tKey, []);
        tickToXs.get(tKey).push(scoreX);
      }
    };
    recordBuiltOverlays(rhBuilt);
    recordBuiltOverlays(lhBuilt);

    const sortedTicks = Array.from(tickToXs.keys()).sort((a, b) => a - b);
    const downbeatXs = tickToXs.get(measure.startTicks);
    const defaultDownbeatX = measure.startX + Math.max(10, (noteStartX - PAD_X) + 8);
    const downbeatX = downbeatXs && downbeatXs.length > 0
      ? downbeatXs.reduce((s, v) => s + v, 0) / downbeatXs.length
      : defaultDownbeatX;

    measure.downbeatX = downbeatX;
    const anchors = [{ tick: measure.startTicks, x: downbeatX }];
    for (const tk of sortedTicks) {
      if (tk <= measure.startTicks || tk >= measure.endTicks) continue;
      const xs = tickToXs.get(tk);
      const avgX = xs.reduce((s, v) => s + v, 0) / xs.length;
      const prevX = anchors[anchors.length - 1].x;
      const safeX = Math.max(prevX + 1, Math.min(measure.endX - 4, avgX));
      anchors.push({ tick: tk, x: safeX });
    }
    measure.renderedTickAnchors = anchors;

    const tileObj = {
      canvas: tileCanvas,
      width: tileW,
      height: tileH,
      padX: PAD_X,
      measureIndex,
      startX: measure.startX,
      endX: measure.endX,
      noteOverlays
    };
    touchLru(cacheKey, tileObj);
    return tileObj;
  };

  const drawViewportBezelAndDivider = (ctx, rect, showSplitDivider) => {
    ctx.save();
    ctx.strokeStyle = '#5c462e';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);

    if (showSplitDivider) {
      const divY = rect.y + rect.height - 5;
      ctx.fillStyle = '#221a14';
      ctx.fillRect(rect.x, divY, rect.width, 5);
      ctx.strokeStyle = '#8a6d2f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rect.x, divY + 1);
      ctx.lineTo(rect.x + rect.width, divY + 1);
      ctx.stroke();
    }
    ctx.restore();
  };

  const getOrBakeBackground = (width, height, rulerH, dpr) => {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const hasImage = Boolean(parchmentImage && parchmentImage.complete && parchmentImage.naturalWidth > 0);
    if (
      bgCache &&
      bgCache.width === w &&
      bgCache.height === h &&
      bgCache.rulerH === rulerH &&
      bgCache.dpr === dpr &&
      bgCache.hasImage === hasImage
    ) {
      return bgCache;
    }

    const bgCanvas = makeCanvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
    const bctx = bgCanvas.getContext('2d');
    if (typeof bctx.setTransform === 'function') {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Warm Grimoire Parchment background fill
    bctx.fillStyle = '#f4ebd9';
    bctx.fillRect(0, 0, w, h);
    if (hasImage) {
      if (!parchmentPattern) {
        try {
          parchmentPattern = bctx.createPattern(parchmentImage, 'repeat');
        } catch {
          parchmentPattern = null;
        }
      }
      if (parchmentPattern) {
        bctx.save();
        bctx.globalAlpha = 0.62;
        bctx.fillStyle = parchmentPattern;
        bctx.fillRect(0, 0, w, h);
        bctx.restore();
      }
    }

    // Top walnut/sepia bar-ruler header strip
    bctx.fillStyle = '#eadcc2';
    bctx.fillRect(0, 0, w, rulerH);
    bctx.strokeStyle = 'rgba(110, 86, 58, 0.35)';
    bctx.lineWidth = 1;
    bctx.beginPath();
    bctx.moveTo(0, rulerH);
    bctx.lineTo(w, rulerH);
    bctx.stroke();

    bgCache = { canvas: bgCanvas, width: w, height: h, rulerH, dpr, hasImage };
    return bgCache;
  };

  const findMeasureIndexByTick = (measures, tick) => {
    let lo = 0;
    let hi = measures.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tick < measures[mid].endTicks) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return lo;
  };

  const findFirstMeasureEndAfterX = (measures, targetX) => {
    let lo = 0;
    let hi = measures.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (measures[mid].endX >= targetX) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  };

  const findFirstMeasureStartAfterX = (measures, targetX) => {
    let lo = 0;
    let hi = measures.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (measures[mid].startX > targetX) {
        ans = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return ans;
  };

  const scheduleLookaheadPrewarm = (scoreData, startIdx, endIdx, dpr) => {
    if (!scoreData || !scoreData.measures || startIdx > endIdx || prewarmHandle !== null) return;
    if (scoreData.scoreId !== activeScoreId) return;
    // Find first uncached measure in lookahead range
    let targetIdx = -1;
    for (let i = startIdx; i <= endIdx; i++) {
      const key = `${scoreData.scoreId}:${dpr}:${i}`;
      if (!tileCache.has(key)) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) return;

    const runStep = () => {
      prewarmHandle = null;
      if (scoreData.scoreId !== activeScoreId || !scoreData.measures[targetIdx]) return;
      renderMeasureTile(scoreData, targetIdx, dpr);
      if (targetIdx + 1 <= endIdx) {
        scheduleLookaheadPrewarm(scoreData, targetIdx + 1, endIdx, dpr);
      }
    };

    if (typeof requestIdleCallback === 'function') {
      prewarmHandle = {
        type: 'idle',
        id: requestIdleCallback(runStep, { timeout: 60 })
      };
    } else if (typeof setTimeout === 'function') {
      prewarmHandle = {
        type: 'timeout',
        id: setTimeout(runStep, 16)
      };
    }
  };

  /**
   * Draw Warm Grimoire Parchment surface, visible Grand-Staff tiles, Rehearsal Loop ribbon,
   * active/Wait-locked/overdue/folded overlays, fixed Crimson playhead & dynamic left clef gutter.
   */
  const renderNotationViewport = (ctx, rect, state) => {
    if (!ctx || !rect || rect.width <= 10 || rect.height <= 40) return;

    const {
      scoreData,
      currentTime = 0,
      isWaitingForStrike = false,
      waitDurationSec = 0,
      waitMode = true,
      rehearsalLoop = null,
      rhOpacity = 1.0,
      lhOpacity = 1.0,
      noteLookup = null,
      activeWaitNoteIds = null,
      dpr = 1,
      showSplitDivider = false
    } = state || {};

    const rulerH = 24;
    const staffAvailH = Math.max(60, rect.height - rulerH - (showSplitDivider ? 6 : 0));
    const renderScale = Math.max(0.55, Math.min(1.45, staffAvailH / TILE_LOGICAL_H));
    const drawYOffset = rect.y + rulerH + Math.max(0, (staffAvailH - TILE_LOGICAL_H * renderScale) / 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    // 1. Pre-baked Warm Grimoire Parchment background + ruler strip (single blit per frame)
    const bg = getOrBakeBackground(rect.width, rect.height, rulerH, dpr);
    ctx.drawImage(bg.canvas, rect.x, rect.y, rect.width, rect.height);

    if (!scoreData || !scoreData.measures || scoreData.measures.length === 0) {
      // Empty parchment prompt
      ctx.fillStyle = '#5c462e';
      ctx.font = 'bold 16px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Load a MIDI, MusicXML, or Demo Spell to view Grand Staff Notation', rect.x + rect.width / 2, rect.y + rect.height / 2);
      drawViewportBezelAndDivider(ctx, rect, showSplitDivider);
      ctx.restore();
      return;
    }

    if (scoreData.scoreId !== activeScoreId) {
      cancelPrewarm();
      activeScoreId = scoreData.scoreId;
    }

    const curTick = scoreData.tempoMap.secToTicks(currentTime);
    const activeMeasureIdx = findMeasureIndexByTick(scoreData.measures, curTick);
    const activeMeasure = scoreData.measures[activeMeasureIdx];

    const gutter = getOrRenderStickyGutter(activeMeasure.vfKeySpec || scoreData.primaryKeySpec, dpr);
    const gutterWidthPx = Math.min(rect.width * 0.25, gutter.width * renderScale);

    // Fixed playhead sits at a balanced readable lead-ahead point right of the sticky clef gutter
    const playheadX = Math.round(rect.x + gutterWidthPx + (rect.width - gutterWidthPx) * 0.34);

    // Determine visible measure window centered around estimated playhead x, rendering visible tiles FIRST
    // so `renderedTickAnchors` are populated before `tickToScoreX(curTick)` locks the camera.
    let approxScoreX = tickToScoreX(scoreData, curTick);
    const roughLeftScoreX = approxScoreX - (playheadX - rect.x) / renderScale - 160;
    const roughRightScoreX = approxScoreX + (rect.x + rect.width - playheadX) / renderScale + 180;

    let firstIdx = findFirstMeasureEndAfterX(scoreData.measures, roughLeftScoreX);
    if (firstIdx < 0) firstIdx = scoreData.measures.length - 1;
    let lastIdx = findFirstMeasureStartAfterX(scoreData.measures, roughRightScoreX);
    if (lastIdx < 0) lastIdx = scoreData.measures.length - 1;
    else lastIdx = Math.min(scoreData.measures.length - 1, lastIdx + 1);
    firstIdx = Math.max(0, firstIdx - 1);

    const visibleTiles = [];
    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const tile = renderMeasureTile(scoreData, idx, dpr);
      if (tile) visibleTiles.push(tile);
    }

    // Incrementally pre-warm upcoming measures ahead of the viewport during idle time
    scheduleLookaheadPrewarm(
      scoreData,
      lastIdx + 1,
      Math.min(scoreData.measures.length - 1, lastIdx + 6),
      dpr
    );

    // Recompute exact score X now that visible measures have populated `renderedTickAnchors`
    const exactScoreX = tickToScoreX(scoreData, curTick);
    const viewOriginX = playheadX - exactScoreX * renderScale;

    // 2. Rehearsal Loop A–B Highlight Ribbon
    if (rehearsalLoop && rehearsalLoop.enabled && Number.isFinite(rehearsalLoop.startTime) && Number.isFinite(rehearsalLoop.endTime)) {
      const tA = Math.min(rehearsalLoop.startTime, rehearsalLoop.endTime);
      const tB = Math.max(rehearsalLoop.startTime, rehearsalLoop.endTime);
      const xA = viewOriginX + tickToScoreX(scoreData, scoreData.tempoMap.secToTicks(tA)) * renderScale;
      const xB = viewOriginX + tickToScoreX(scoreData, scoreData.tempoMap.secToTicks(tB)) * renderScale;
      const clLeft = Math.max(rect.x + gutterWidthPx - 10, xA);
      const clRight = Math.min(rect.x + rect.width, xB);
      if (clRight > clLeft) {
        ctx.fillStyle = 'rgba(217, 119, 6, 0.14)';
        ctx.fillRect(clLeft, rect.y + rulerH, clRight - clLeft, rect.height - rulerH);
      }
      for (const marker of [{ x: xA, lbl: 'A' }, { x: xB, lbl: 'B' }]) {
        if (marker.x >= rect.x + gutterWidthPx - 8 && marker.x <= rect.x + rect.width) {
          ctx.save();
          ctx.strokeStyle = 'rgba(180, 83, 9, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(marker.x, rect.y + rulerH);
          ctx.lineTo(marker.x, rect.y + rect.height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#92400e';
          ctx.font = 'bold 10px "Consolas", monospace';
          ctx.fillText(`LOOP ${marker.lbl}`, marker.x + 3, rect.y + 16);
          ctx.restore();
        }
      }
    }

    // 3. Draw visible pre-rendered VexFlow Grand Staff tiles + Beat ruler ticks
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y + rulerH, rect.width, rect.height - rulerH);
    ctx.clip();

    for (const tile of visibleTiles) {
      const drawX = viewOriginX + (tile.startX - tile.padX) * renderScale;
      const drawW = tile.width * renderScale;
      const drawH = tile.height * renderScale;
      if (drawX + drawW < rect.x - 10 || drawX > rect.x + rect.width + 10) continue;

      if (rhOpacity >= 0.95 && lhOpacity >= 0.95) {
        ctx.drawImage(tile.canvas, drawX, drawYOffset, drawW, drawH);
      } else {
        // Clip Treble vs Bass halves at exact geometric midpoint between E4 (89) & A3 (153)
        const midLogicalY = 121;
        const splitMidY = drawYOffset + midLogicalY * renderScale;
        ctx.save();
        ctx.globalAlpha = Math.max(0.28, rhOpacity);
        ctx.drawImage(
          tile.canvas,
          0, 0, tile.canvas.width, Math.floor((midLogicalY / tile.height) * tile.canvas.height),
          drawX, drawYOffset, drawW, midLogicalY * renderScale
        );
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = Math.max(0.28, lhOpacity);
        ctx.drawImage(
          tile.canvas,
          0, Math.floor((midLogicalY / tile.height) * tile.canvas.height), tile.canvas.width, Math.ceil(((tile.height - midLogicalY) / tile.height) * tile.canvas.height),
          drawX, splitMidY, drawW, (tile.height - midLogicalY) * renderScale
        );
        ctx.restore();
      }
    }

    // 4. Live Notehead Highlight Ellipses, Wait-Lock Emerald, Crimson Overdue Rings & 8va Folded Tags
    for (const tile of visibleTiles) {
      for (const ov of tile.noteOverlays) {
        const cx = viewOriginX + ov.scoreX * renderScale;
        if (cx < rect.x + gutterWidthPx - 12 || cx > rect.x + rect.width + 12) continue;

        const isActiveTime = currentTime >= ov.startTime - 0.04 && currentTime <= Math.max(ov.startTime + 0.14, ov.endTime);
        let anyLockedInWait = false;
        let allSatisfied = true;

        if (noteLookup && ov.noteRefs && ov.noteRefs.length > 0) {
          for (const ref of ov.noteRefs) {
            const live = noteLookup.get(ref.noteId);
            if (live?.lockedInWait) anyLockedInWait = true;
            if (!live?.satisfied) allSatisfied = false;
          }
        } else {
          allSatisfied = false;
        }

        const hasActiveWaitRef = Boolean(
          activeWaitNoteIds &&
          ov.noteRefs &&
          ov.noteRefs.some((ref) => activeWaitNoteIds.has(ref.noteId))
        );

        const isWaitingOnThis =
          !ov.isTiedContinuation &&
          isWaitingForStrike &&
          waitMode &&
          !allSatisfied &&
          (hasActiveWaitRef || Math.abs(ov.startTime - currentTime) <= 0.06);

        if (isWaitingOnThis || anyLockedInWait || isActiveTime) {
          const rx = 8.5 * renderScale;
          const ry = 6.2 * renderScale;
          const ys = ov.ys || [];
          const refs = ov.noteRefs || [];
          const pulseRatio = 0.55 + 0.45 * Math.sin(performance.now() * 0.01);

          ctx.save();
          for (let yIdx = 0; yIdx < ys.length; yIdx++) {
            const ny = ys[yIdx];
            const ref = refs[yIdx];
            const liveRef = ref && noteLookup ? noteLookup.get(ref.noteId) : null;
            const thisLocked = Boolean(liveRef?.lockedInWait);
            const refWaitMatch = !activeWaitNoteIds || (ref && activeWaitNoteIds.has(ref.noteId));
            const thisOverdue = isWaitingOnThis && waitDurationSec > 2.0 && !thisLocked && !liveRef?.satisfied && refWaitMatch;

            let fillCol;
            let strokeCol;
            if (thisLocked) {
              fillCol = 'rgba(16, 185, 129, 0.40)';
              strokeCol = '#065f46';
            } else if (thisOverdue) {
              fillCol = 'rgba(220, 38, 38, 0.25)';
              strokeCol = '#b91c1c';
            } else if (ov.handTrack === 1) {
              fillCol = 'rgba(253, 230, 138, 0.62)';
              strokeCol = '#b45309';
            } else {
              fillCol = 'rgba(165, 243, 252, 0.58)';
              strokeCol = '#0e7490';
            }

            const cy = drawYOffset + ny * renderScale;
            ctx.fillStyle = fillCol;
            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = (isWaitingOnThis || thisLocked) ? 2.2 : 1.5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, -0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (thisOverdue) {
              ctx.beginPath();
              ctx.strokeStyle = `rgba(185, 28, 28, ${(0.35 + 0.5 * pulseRatio).toFixed(2)})`;
              ctx.lineWidth = 1.8;
              ctx.ellipse(cx, cy, rx + 2.5 + 2.2 * pulseRatio, ry + 2.0 + 1.8 * pulseRatio, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          ctx.restore();
        }

        // Subtle folded-octave indicator above treble / below bass notehead
        if (ov.wasFolded && ov.ys && ov.ys.length > 0 && cx > rect.x + gutterWidthPx + 4) {
          const foldLabel = ov.foldShift < 0
            ? '8↑'
            : (ov.foldShift > 0 ? '8↓' : (ov.handTrack === 1 ? '8↑' : '8↓'));
          const tagY = foldLabel === '8↑'
            ? drawYOffset + (ov.minY - 11) * renderScale
            : drawYOffset + (ov.maxY + 16) * renderScale;
          ctx.save();
          ctx.fillStyle = '#92400e';
          ctx.font = `bold ${Math.max(8, Math.round(9 * renderScale))}px "Consolas", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(foldLabel, cx, tagY);
          ctx.restore();
        }
      }
    }
    ctx.restore();

    // 5. Top Bar/Beat Ruler Labels inside Header Strip
    ctx.save();
    for (let idx = firstIdx; idx <= lastIdx; idx++) {
      const m = scoreData.measures[idx];
      const barPx = viewOriginX + m.startX * renderScale;
      if (barPx >= rect.x + gutterWidthPx - 6 && barPx <= rect.x + rect.width - 20) {
        ctx.strokeStyle = 'rgba(110, 86, 58, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barPx, rect.y + 4);
        ctx.lineTo(barPx, rect.y + rulerH);
        ctx.stroke();

        ctx.fillStyle = '#5c462e';
        ctx.font = 'bold 11px "Consolas", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Bar ${m.number}`, barPx + 4, rect.y + 16);
      }
    }
    // Display Key & Time Signature metadata cleanly inside top-right corner of ruler
    const keyLabel = `${activeMeasure.keyDisplayName || scoreData.primaryKeyDisplay}${scoreData.keyIsEstimated ? ' (Est.)' : ''} • ${activeMeasure.timeSigLabel}`;
    ctx.fillStyle = '#5c462e';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(keyLabel, rect.x + rect.width - 12, rect.y + 16);
    ctx.restore();

    // 6. Sticky Left Clef & Key Signature Gutter (stays pinned cleanly at left margin)
    ctx.drawImage(gutter.canvas, rect.x, drawYOffset, gutter.width * renderScale, gutter.height * renderScale);

    // 7. Fixed Center Wax-Seal Crimson Playhead Needle (two-pass halo avoids per-frame shadowBlur)
    ctx.save();
    const headCol = isWaitingForStrike && waitDurationSec > 2.0 ? '#b91c1c' : '#9f1239';
    const haloCol = isWaitingForStrike && waitDurationSec > 2.0 ? 'rgba(185, 28, 28, 0.22)' : 'rgba(159, 18, 57, 0.20)';
    const lineBottom = rect.y + rect.height - (showSplitDivider ? 6 : 0);

    ctx.strokeStyle = haloCol;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(playheadX, rect.y + rulerH - 2);
    ctx.lineTo(playheadX, lineBottom);
    ctx.stroke();

    ctx.strokeStyle = headCol;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(playheadX, rect.y + rulerH - 2);
    ctx.lineTo(playheadX, lineBottom);
    ctx.stroke();

    // Diamond wax-seal pip at top of playhead inside ruler strip
    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.moveTo(playheadX, rect.y + rulerH + 4);
    ctx.lineTo(playheadX - 5, rect.y + rulerH - 3);
    ctx.lineTo(playheadX, rect.y + rulerH - 10);
    ctx.lineTo(playheadX + 5, rect.y + rulerH - 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 8. Aged Walnut & Burnished Brass Border & Split Pane Divider
    drawViewportBezelAndDivider(ctx, rect, showSplitDivider);

    ctx.restore();
  };

  return {
    renderMeasureTile,
    renderNotationViewport,
    clearCache,
    dispose,
    invalidateMeasure,
    getCacheSize: () => tileCache.size
  };
}

module.exports = {
  VF_MAJOR_KEYS_BY_FIFTHS,
  VF_MINOR_KEYS_BY_FIFTHS,
  normalizeVfKeySpec,
  formatKeyDisplayName,
  buildTempoMap,
  buildTimeSigMap,
  buildKeySigMap,
  estimateKeySignature,
  midiToVexKey,
  quantizeDurationBeats,
  buildScoreData,
  assessNotationQuality,
  tickToScoreX,
  createNotationRenderer
};

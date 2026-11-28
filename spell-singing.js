/**
 * Epic #43 (Phases #125, #126, #127) + Issues #159 & #160:
 * Spell-Singing (Vocals / Karaoke / Let's Sing & Xbox Lips Mode)
 *
 * - #159: Enhanced word-level LRC (`<mm:ss.xx> word`) & line-level LRC parsing, per-song
 *   `lyricsOffsetSec` shifting, Auto-Align Lyrics to First Vocal Note, zero Solfège clutter
 *   when real lyrics exist, and Apple Music Sing word-sweep phrase model.
 * - #160: `simplifyVocalNotesForSinging()` vibrato/micro-gap smoothing, cubic Bezier
 *   pitch-slide ("portamento") connector ribbons, interpolated slide pitch scoring, and
 *   Warm Tavern Obsidian / Eldritch Blue / Radiant Gold visual cohesion.
 */

const fs = require('fs');
const path = require('path');
const { parseEnhancedLrcText } = require('./lyrics-fetcher');

const SINGING_BREAK_TOLERANCE_SEC = 0.1;
const SOLFEGE_NAMES = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function vocalMidiToNoteName(midi) {
  if (!Number.isFinite(midi)) return '—';
  const r = Math.round(midi);
  return `${PITCH_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

/**
 * Parse standard `.lrc` (`[mm:ss.xx] Line`) OR enhanced word-synced `.lrc`
 * (`[mm:ss.xx] <mm:ss.xx> word ...`), with optional `offsetSec` shift.
 */
function parseLrcText(rawText, offsetSec = 0) {
  return parseEnhancedLrcText(rawText, offsetSec);
}

/**
 * Look for a sibling `.lrc` file next to a song's `.mid` / `.musicxml` file.
 */
function findSiblingLrcPath(songFilePath) {
  if (!songFilePath || typeof songFilePath !== 'string' || songFilePath === 'BUILTIN_DEMO') {
    return null;
  }
  try {
    const parsed = path.parse(songFilePath);
    const candidate = path.join(parsed.dir, `${parsed.name}.lrc`);
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    return null;
  }
  return null;
}

/**
 * Issue #159: Compute suggested `lyricsOffsetSec` to snap the first timed lyric line
 * onto the first vocal melody note (fixes YouTube Music Video intro skits/silence).
 */
function computeAutoAlignLyricsOffset(vocalNotes = [], rawLrcLines = []) {
  if (!Array.isArray(vocalNotes) || vocalNotes.length === 0) return 0;
  if (!Array.isArray(rawLrcLines) || rawLrcLines.length === 0) return 0;

  const sortedNotes = vocalNotes
    .filter((n) => n && Number.isFinite(Number(n.time)))
    .sort((a, b) => Number(a.time) - Number(b.time));
  const firstTimedLyric = rawLrcLines.find((l) => l && Number.isFinite(Number(l.time)));
  if (sortedNotes.length === 0 || !firstTimedLyric) return 0;

  const delta = Number(sortedNotes[0].time) - Number(firstTimedLyric.time);
  const clamped = Math.max(-30, Math.min(30, delta));
  return Math.round(clamped * 100) / 100;
}

/**
 * Issue #160: Simplify raw transcribed vocal notes into smooth Let's Sing / Lips capsules:
 * - Clamp isolated harmonic octave spikes (e.g. +12/-12 brief overtones)
 * - Absorb ±1 semitone vibrato flickers (< 140ms) into the sustained parent note
 * - Merge adjacent same-pitch capsules separated by < 95ms consonant/breath gaps
 * - Prune tiny isolated unvoiced blips (< 90ms)
 * - Flag smooth legato pitch slides (`slideToNext: true`) for Bezier glide ribbons
 */
function simplifyVocalNotesForSinging(monoNotes = []) {
  if (!Array.isArray(monoNotes) || monoNotes.length <= 1) {
    return Array.isArray(monoNotes)
      ? monoNotes.map((n) => {
          const dur = Math.max(0.08, Number(n.duration) || 0.25);
          const endTime = Number.isFinite(Number(n.endTime)) ? Number(n.endTime) : Number(n.time) + dur;
          return { ...n, duration: dur, endTime, slideToNext: false };
        })
      : [];
  }

  const working = monoNotes.map((n) => {
    const dur = Math.max(0.08, Number(n.duration) || 0.25);
    const endTime = Number.isFinite(Number(n.endTime)) ? Number(n.endTime) : Number(n.time) + dur;
    return { ...n, duration: dur, endTime, slideToNext: false };
  });

  // 1. Clamp brief isolated octave harmonic jumps (e.g., 12-semitone overtone blips)
  for (let i = 1; i < working.length - 1; i++) {
    const prev = working[i - 1];
    const cur = working[i];
    const next = working[i + 1];
    const diffPrev = cur.midi - prev.midi;
    if (Math.abs(diffPrev) >= 10 && cur.duration < 0.24 && Math.abs(next.midi - prev.midi) <= 5) {
      const shifted = diffPrev > 0 ? cur.midi - 12 : cur.midi + 12;
      if (Math.abs(shifted - prev.midi) < Math.abs(diffPrev)) {
        cur.midi = shifted;
      }
    }
  }

  // 2. Absorb ±1 semitone vibrato wobbles and merge tiny same-pitch gaps
  const merged = [];
  for (let i = 0; i < working.length; i++) {
    const cur = working[i];
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(cur);
      continue;
    }

    const gap = cur.time - prev.endTime;
    const pitchDiff = Math.abs(cur.midi - prev.midi);

    // Same pitch with tiny consonant/breath gap <= 95ms -> merge into one smooth capsule
    if (pitchDiff === 0 && gap <= 0.095) {
      prev.endTime = Math.max(prev.endTime, cur.endTime);
      prev.duration = prev.endTime - prev.time;
      continue;
    }

    // ±1 semitone brief vibrato bounce (< 140ms) returning to parent or trailing a long note
    const next = working[i + 1];
    const returnsToPrev = next && Math.abs(next.midi - prev.midi) === 0 && (next.time - cur.endTime) <= 0.1;
    if (pitchDiff === 1 && gap <= 0.07 && cur.duration < 0.14 && (returnsToPrev || prev.duration >= 0.28)) {
      prev.endTime = Math.max(prev.endTime, cur.endTime);
      prev.duration = prev.endTime - prev.time;
      continue;
    }

    merged.push(cur);
  }

  // 3. Drop isolated sub-90ms noise blips (only if plenty of notes remain)
  let cleaned = merged;
  if (merged.length > 6) {
    cleaned = merged.filter((n, idx) => {
      if (n.duration >= 0.09) return true;
      const prev = idx > 0 ? merged[idx - 1] : null;
      const next = idx < merged.length - 1 ? merged[idx + 1] : null;
      const closeToPrev = prev && (n.time - prev.endTime) <= 0.14;
      const closeToNext = next && (next.time - n.endTime) <= 0.14;
      return Boolean(closeToPrev || closeToNext);
    });
    if (cleaned.length === 0) cleaned = merged;
  }

  // 4. Re-index and mark smooth legato pitch slides (`slideToNext`)
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i];
    cur.index = i;
    cur.isGolden = i > 0 && i % 11 === 0;
    const next = i < cleaned.length - 1 ? cleaned[i + 1] : null;
    if (next) {
      if (cur.endTime > next.time) {
        cur.endTime = Math.max(cur.time + 0.08, next.time - 0.01);
        cur.duration = cur.endTime - cur.time;
      }
      const gap = next.time - cur.endTime;
      const deltaMidi = Math.abs(next.midi - cur.midi);
      cur.slideToNext = gap >= -0.02 && gap <= 0.14 && deltaMidi >= 1 && deltaMidi <= 7;
    } else {
      cur.slideToNext = false;
    }
  }

  return cleaned;
}

/**
 * Format a sequence of vocal notes with syllabic flags into a readable lyric line string.
 */
function formatPhraseText(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return '';
  let out = '';
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const txt = String(n.lyric || '').trim();
    if (!txt) continue;
    const prev = i > 0 ? notes[i - 1] : null;
    const prevContinues = prev && (prev.syllabic === 'begin' || prev.syllabic === 'middle');
    if (out.length > 0 && !prevContinues) {
      out += ' ';
    }
    out += txt;
  }
  return out.trim();
}

/**
 * Build timed word tokens for a phrase line (using native word-sync when present, or
 * smooth character-weighted linear interpolation across the phrase duration for Apple Music Sing sweep).
 */
function buildWordsForLrcLine(line, nextLineTime) {
  if (Array.isArray(line.words) && line.words.length > 0) {
    return line.words.map((w) => ({
      text: w.text,
      startTime: w.startTime,
      endTime: Math.max(w.startTime + 0.08, w.endTime)
    }));
  }
  const rawWords = String(line.text || '').split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];
  const start = Number.isFinite(line.time) ? line.time : 0;
  const rawEnd = Number.isFinite(line.endTime)
    ? line.endTime
    : Number.isFinite(nextLineTime)
      ? nextLineTime
      : start + Math.max(1.5, rawWords.length * 0.42);
  const span = Math.max(0.4, Math.min(8.0, rawEnd - start));
  const totalChars = rawWords.reduce((acc, w) => acc + Math.max(2, w.length), 0);

  let cursor = start;
  return rawWords.map((word) => {
    const weight = Math.max(2, word.length) / Math.max(1, totalChars);
    const dur = Math.max(0.1, span * weight);
    const out = { text: word, startTime: cursor, endTime: cursor + dur };
    cursor += dur;
    return out;
  });
}

/**
 * Build a complete Vocal Chart (notes + phrases) for Spell-Singing Karaoke Mode.
 * Priority for lyrics:
 *  1. Custom pasted lyrics / LRC text (`customLyricsText`)
 *  2. MusicXML `<lyric>` tokens (`musicXmlLyrics`)
 *  3. Sibling `.lrc` lines (`lrcLines`)
 *  4. Melodic Syllable Guide fallback (`solfege` / `note-name` / `la`) — ONLY when no real lyrics exist
 */
function buildVocalChart({
  vocalNotes = [],
  musicXmlLyrics = [],
  lrcLines = [],
  customLyricsText = '',
  lyricsOffsetSec = 0,
  fallbackMode = 'solfege',
  simplifyVocalTrack = true
} = {}) {
  const sortedNotes = (Array.isArray(vocalNotes) ? vocalNotes : [])
    .filter((n) => n && Number.isFinite(n.time) && Number.isFinite(n.midi))
    .map((n, idx) => ({
      id: n.id || `vocal_${idx}`,
      index: idx,
      time: Math.max(0, Number(n.time)),
      duration: Math.max(0.08, Number(n.duration) || 0.25),
      endTime: Math.max(0, Number(n.time)) + Math.max(0.08, Number(n.duration) || 0.25),
      midi: Math.round(Number(n.midi)),
      lyric: '',
      syllabic: 'single',
      slideToNext: false,
      hitFrames: 0,
      totalFrames: 0,
      fillRatio: 0,
      isGolden: idx > 0 && idx % 11 === 0
    }))
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Deduplicate simultaneous vocal harmony notes (keep top melody pitch per onset)
  let monoNotes = [];
  for (const n of sortedNotes) {
    const prev = monoNotes[monoNotes.length - 1];
    if (prev && Math.abs(n.time - prev.time) < 0.04) {
      if (n.midi > prev.midi) {
        monoNotes[monoNotes.length - 1] = n;
      }
      continue;
    }
    if (prev && prev.endTime > n.time) {
      prev.endTime = Math.max(prev.time + 0.08, n.time - 0.01);
      prev.duration = prev.endTime - prev.time;
    }
    monoNotes.push(n);
  }

  if (simplifyVocalTrack && monoNotes.length > 1) {
    monoNotes = simplifyVocalNotesForSinging(monoNotes);
  } else {
    monoNotes.forEach((n, idx) => {
      n.index = idx;
    });
  }

  const shiftSec = Number.isFinite(Number(lyricsOffsetSec)) ? Number(lyricsOffsetSec) : 0;
  let lyricSource = 'fallback';
  let hasWordSync = false;

  const customParsed = customLyricsText ? parseLrcText(customLyricsText, shiftSec) : [];
  const shiftedLrcLines = Array.isArray(lrcLines)
    ? lrcLines.map((l) => {
        if (!l) return l;
        if (!Number.isFinite(l.time)) return { ...l };
        const shiftedWords = Array.isArray(l.words)
          ? l.words.map((w) => ({
              ...w,
              startTime: Math.max(0, w.startTime + shiftSec),
              endTime: Math.max(0.08, w.endTime + shiftSec)
            }))
          : null;
        return {
          ...l,
          time: Math.max(0, l.time + shiftSec),
          endTime: Number.isFinite(l.endTime) ? Math.max(0.3, l.endTime + shiftSec) : undefined,
          words: shiftedWords
        };
      })
    : [];

  let timedLrcSourceLines = null;

  if (customParsed.length > 0) {
    lyricSource = 'custom-lyrics';
    hasWordSync = customParsed.some((l) => Array.isArray(l.words) && l.words.length > 0);
    applyLrcOrLinesToNotes(monoNotes, customParsed);
    if (customParsed.some((l) => Number.isFinite(l.time))) {
      timedLrcSourceLines = customParsed;
    }
  } else if (Array.isArray(musicXmlLyrics) && musicXmlLyrics.length > 0) {
    lyricSource = 'musicxml';
    hasWordSync = true;
    const sortedXml = musicXmlLyrics.slice().sort((a, b) => a.time - b.time);
    for (const ev of sortedXml) {
      let bestNote = null;
      let bestDist = 0.24;
      for (const n of monoNotes) {
        const d = Math.abs(n.time - ev.time);
        if (d < bestDist && !n.lyric) {
          bestDist = d;
          bestNote = n;
        }
      }
      if (bestNote) {
        bestNote.lyric = ev.text;
        bestNote.syllabic = ev.syllabic || 'single';
      }
    }
  } else if (shiftedLrcLines.length > 0) {
    hasWordSync = shiftedLrcLines.some((l) => Array.isArray(l.words) && l.words.length > 0);
    lyricSource = hasWordSync ? 'lrclib-word' : 'lrc';
    applyLrcOrLinesToNotes(monoNotes, shiftedLrcLines);
    if (shiftedLrcLines.some((l) => Number.isFinite(l.time))) {
      timedLrcSourceLines = shiftedLrcLines;
    }
  }

  // Issue #159: ONLY fill Solfège fallback when NO real lyrics exist!
  // When real lyrics exist, leave melisma/passing notes blank so "Sol/Fi/Ri" never clutters real songs.
  if (lyricSource === 'fallback') {
    for (const n of monoNotes) {
      if (!n.lyric) {
        if (fallbackMode === 'note-name') {
          n.lyric = vocalMidiToNoteName(n.midi);
        } else if (fallbackMode === 'la') {
          n.lyric = 'La';
        } else {
          n.lyric = SOLFEGE_NAMES[((n.midi % 12) + 12) % 12];
        }
        n.syllabic = 'single';
      }
    }
  }

  // Build Karaoke Phrases:
  // When timed LRC lines exist, drive phrases directly from the timed lyric lines (Apple Music / Spotify style)
  // so every real lyric line is complete and smoothly word-swept even across vocal rests/melismas.
  const phrases = [];
  if (timedLrcSourceLines && timedLrcSourceLines.length > 0) {
    for (let i = 0; i < timedLrcSourceLines.length; i++) {
      const line = timedLrcSourceLines[i];
      const next = timedLrcSourceLines[i + 1];
      const startTime = Number.isFinite(line.time) ? line.time : 0;
      const endTime = Number.isFinite(line.endTime)
        ? line.endTime
        : next && Number.isFinite(next.time)
          ? Math.max(startTime + 0.4, next.time - 0.05)
          : startTime + 4.0;
      const phraseNotes = monoNotes.filter((n) => n.time >= startTime - 0.15 && n.time < endTime);
      let minMidi = Infinity;
      let maxMidi = -Infinity;
      for (const n of phraseNotes) {
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
      }
      if (!Number.isFinite(minMidi)) {
        minMidi = 58;
        maxMidi = 72;
      }
      const words = buildWordsForLrcLine(line, next ? next.time : undefined);
      phrases.push({
        index: phrases.length,
        startTime,
        endTime,
        notes: phraseNotes,
        words,
        text: line.text,
        minMidi,
        maxMidi
      });
    }
  } else {
    // Group note-driven phrases (MusicXML or Solfège fallback)
    let currentPhraseNotes = [];
    const flushPhrase = () => {
      if (currentPhraseNotes.length === 0) return;
      let minMidi = Infinity;
      let maxMidi = -Infinity;
      for (const n of currentPhraseNotes) {
        if (n.midi < minMidi) minMidi = n.midi;
        if (n.midi > maxMidi) maxMidi = n.midi;
      }
      const words = currentPhraseNotes
        .filter((n) => n.lyric)
        .map((n, idx, arr) => {
          const prev = idx > 0 ? arr[idx - 1] : null;
          const prevContinues = prev && (prev.syllabic === 'begin' || prev.syllabic === 'middle');
          return {
            text: n.lyric,
            startTime: n.time,
            endTime: n.endTime,
            noLeadingSpace: Boolean(prevContinues)
          };
        });
      phrases.push({
        index: phrases.length,
        startTime: currentPhraseNotes[0].time,
        endTime: currentPhraseNotes[currentPhraseNotes.length - 1].endTime,
        notes: currentPhraseNotes,
        words,
        text: formatPhraseText(currentPhraseNotes),
        minMidi,
        maxMidi
      });
      currentPhraseNotes = [];
    };

    for (let i = 0; i < monoNotes.length; i++) {
      const n = monoNotes[i];
      const prev = currentPhraseNotes[currentPhraseNotes.length - 1];
      const gap = prev ? n.time - prev.endTime : 0;
      const prevEndedSentence = prev && /[.!?]$/.test(prev.lyric || '');
      const forceBreak =
        prev &&
        (gap >= 1.15 ||
          (prevEndedSentence && currentPhraseNotes.length >= 3) ||
          (currentPhraseNotes.length >= 10 && prev.syllabic !== 'begin' && prev.syllabic !== 'middle'));

      if (forceBreak) {
        flushPhrase();
      }
      currentPhraseNotes.push(n);
    }
    flushPhrase();
  }

  return {
    notes: monoNotes,
    phrases,
    lyricSource,
    hasWordSync,
    lyricsOffsetSec: shiftSec,
    totalDuration: monoNotes.length > 0 ? monoNotes[monoNotes.length - 1].endTime : 0
  };
}

function applyLrcOrLinesToNotes(monoNotes, lines) {
  if (!monoNotes.length || !lines.length) return;
  const hasTimestamps = lines.some((l) => Number.isFinite(l.time));

  if (hasTimestamps) {
    // Track assigned notes by object reference so index-less or non-contiguous notes can't be double-assigned (#233)
    const assignedNotes = new Set();
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const nextLine = lines[li + 1];
      const startSec = line.time;
      const endSec = nextLine ? nextLine.time : Infinity;
      const startMargin = li === 0 ? 0.15 : 0.05;

      // If word-level timestamps exist, map each word to its closest note onset
      if (Array.isArray(line.words) && line.words.length > 0) {
        for (const w of line.words) {
          let bestNote = null;
          let bestDist = 0.28;
          for (const n of monoNotes) {
            const d = Math.abs(n.time - w.startTime);
            if (d < bestDist && !n.lyric && !assignedNotes.has(n)) {
              bestDist = d;
              bestNote = n;
            }
          }
          if (bestNote) {
            bestNote.lyric = w.text;
            bestNote.syllabic = 'single';
            assignedNotes.add(bestNote);
          }
        }
        continue;
      }

      const words = line.text.split(/\s+/).filter(Boolean);
      const matchingNotes = monoNotes.filter(
        (n) => !assignedNotes.has(n) && n.time >= startSec - startMargin && n.time < endSec - 0.05
      );
      if (matchingNotes.length === 0 || words.length === 0) continue;

      for (let wi = 0; wi < words.length; wi++) {
        const noteIdx = Math.min(
          matchingNotes.length - 1,
          Math.floor((wi / words.length) * matchingNotes.length)
        );
        const target = matchingNotes[noteIdx];
        target.lyric = target.lyric ? `${target.lyric} ${words[wi]}` : words[wi];
        target.syllabic = 'single';
      }
      for (const mn of matchingNotes) {
        assignedNotes.add(mn);
      }
    }
  } else {
    // Plain-text lyrics without timestamps: distribute words sequentially across all vocal notes
    const allWords = lines.flatMap((l) => l.text.split(/\s+/).filter(Boolean));
    for (let i = 0; i < monoNotes.length && i < allWords.length; i++) {
      monoNotes[i].lyric = allWords[i];
      monoNotes[i].syllabic = 'single';
    }
  }
}

/**
 * Issue #127: Octave-agnostic (mod 12) vocal pitch distance calculator (AllKaraoke / Performous style).
 */
function calcVocalPitchDistance(sungMidiFloat, targetMidi, { octaveAgnostic = true, toleranceSemitones = 1 } = {}) {
  if (!Number.isFinite(sungMidiFloat) || !Number.isFinite(targetMidi)) {
    return {
      semitoneDelta: null,
      absSemitones: Infinity,
      centsDelta: null,
      inTune: false,
      tier: 'off',
      preciseNorm: 0
    };
  }

  let diffSemitones;
  if (octaveAgnostic) {
    diffSemitones = ((((sungMidiFloat - targetMidi) % 12) + 18) % 12) - 6;
  } else {
    diffSemitones = sungMidiFloat - targetMidi;
  }

  const absSemitones = Math.abs(diffSemitones);
  const centsDelta = Math.round(diffSemitones * 100);
  const tol = Math.max(0.35, Number(toleranceSemitones) || 1);
  const inTune = absSemitones <= tol;

  let tier = 'off';
  if (inTune) {
    const perfectCut = Math.min(0.45, tol * 0.5);
    const greatCut = Math.min(tol, Math.max(perfectCut, tol * 0.85));
    if (absSemitones <= perfectCut) {
      tier = 'perfect';
    } else if (absSemitones <= greatCut) {
      tier = 'great';
    } else {
      tier = 'good';
    }
  }

  const preciseNorm = Math.max(-1.5, Math.min(1.5, diffSemitones / Math.max(1, tol)));
  return {
    semitoneDelta: Math.round(diffSemitones * 100) / 100,
    absSemitones: Math.round(absSemitones * 100) / 100,
    centsDelta,
    inTune,
    tier,
    preciseNorm
  };
}

/**
 * Detect vocal vibrato from recent in-tune pitch samples (4.5–8.5 Hz oscillation >= 25 cents).
 */
function detectVocalVibrato(samples = []) {
  if (!Array.isArray(samples) || samples.length < 10) return false;
  const recent = samples.slice(-16);
  const spanSec = recent[recent.length - 1].time - recent[0].time;
  if (spanSec < 0.22 || spanSec > 1.2) return false;

  let minC = Infinity;
  let maxC = -Infinity;
  let directionChanges = 0;
  let lastDir = 0;

  for (let i = 0; i < recent.length; i++) {
    const c = recent[i].centsDelta ?? 0;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (i > 0) {
      const delta = c - (recent[i - 1].centsDelta ?? 0);
      const dir = delta > 6 ? 1 : delta < -6 ? -1 : 0;
      if (dir !== 0 && lastDir !== 0 && dir !== lastDir) {
        directionChanges++;
      }
      if (dir !== 0) lastDir = dir;
    }
  }

  const depthCents = maxC - minC;
  return depthCents >= 30 && depthCents <= 220 && directionChanges >= 3;
}

/**
 * Stateful Vocal Performance Scorer & Pitch Trail Recorder (#126, #127, #160).
 */
function createVocalSessionScorer(vocalChart, options = {}) {
  const chart = vocalChart || { notes: [], phrases: [] };
  const state = {
    octaveAgnostic: options.octaveAgnostic !== false,
    toleranceSemitones: Number(options.toleranceSemitones) || 1.0,
    keyShiftSemitones: Math.max(-6, Math.min(6, Math.round(Number(options.keyShiftSemitones) || 0))),
    rapEnergyGate: Number(options.rapEnergyGate) || 0.015,
    pitchTrail: [],
    activePitch: null,
    lastInTuneTime: -999,
    totalScoredFrames: 0,
    inTuneFrames: 0,
    perfectFrames: 0,
    vibratoFrames: 0,
    vocalCombo: 0,
    maxVocalCombo: 0,
    vocalScorePoints: 0,
    phraseBonusXp: 0,
    ratedPhraseIndices: new Set(),
    lastPhraseRating: null,
    recentInTuneSamples: []
  };

  function reset() {
    state.pitchTrail = [];
    state.activePitch = null;
    state.lastInTuneTime = -999;
    state.totalScoredFrames = 0;
    state.inTuneFrames = 0;
    state.perfectFrames = 0;
    state.vibratoFrames = 0;
    state.vocalCombo = 0;
    state.maxVocalCombo = 0;
    state.vocalScorePoints = 0;
    state.phraseBonusXp = 0;
    state.ratedPhraseIndices.clear();
    state.lastPhraseRating = null;
    state.recentInTuneSamples = [];
    for (const n of chart.notes || []) {
      n.hitFrames = 0;
      n.totalFrames = 0;
      n.fillRatio = 0;
    }
  }
  reset();

  function setKeyShiftSemitones(semitones) {
    state.keyShiftSemitones = Math.max(-6, Math.min(6, Math.round(Number(semitones) || 0)));
    return state.keyShiftSemitones;
  }

  function findTargetNoteAtTime(songTime) {
    const notes = chart.notes || [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const endMargin = n.slideToNext ? 0 : 0.06;
      const startMargin = i > 0 && notes[i - 1].slideToNext ? 0 : 0.06;
      if (songTime >= n.time - startMargin && songTime <= n.endTime + endMargin) {
        return n;
      }
      // Issue #160: Smoothly interpolate pitch target across legato slide ribbons
      if (n.slideToNext && i + 1 < notes.length) {
        const next = notes[i + 1];
        if (songTime > n.endTime && songTime < next.time) {
          const frac = Math.max(0, Math.min(1, (songTime - n.endTime) / Math.max(0.01, next.time - n.endTime)));
          return {
            ...next,
            midi: n.midi + (next.midi - n.midi) * frac,
            isGlideBridge: true
          };
        }
      }
    }
    return null;
  }

  function getActivePhraseIndices(songTime) {
    const phrases = chart.phrases || [];
    if (phrases.length === 0) return { currentIdx: -1, nextIdx: -1 };
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i];
      if (songTime <= p.endTime + 0.35) {
        return {
          currentIdx: i,
          nextIdx: i + 1 < phrases.length ? i + 1 : -1
        };
      }
    }
    return { currentIdx: phrases.length - 1, nextIdx: -1 };
  }

  function evaluatePhraseRatings(songTime) {
    const phrases = chart.phrases || [];
    let emitted = null;
    for (const p of phrases) {
      if (state.ratedPhraseIndices.has(p.index)) continue;
      if (songTime < p.endTime + 0.12) continue;
      const pNotes = (p.notes || []).filter((n) => (n.totalFrames || 0) > 0 || (n.duration || 0) > 0);
      if (pNotes.length === 0) {
        state.ratedPhraseIndices.add(p.index);
        continue;
      }
      let totalWeight = 0;
      let hitWeight = 0;
      for (const n of pNotes) {
        const w = Math.max(0.1, Number(n.duration) || 0.25);
        totalWeight += w;
        hitWeight += w * Math.min(1, Number(n.fillRatio) || 0);
      }
      const coveragePct = totalWeight > 0 ? Math.round((hitWeight / totalWeight) * 100) : 0;
      state.ratedPhraseIndices.add(p.index);

      let label = null;
      let xpBonus = 0;
      if (coveragePct >= 92) {
        label = 'Perfect!';
        xpBonus = 20;
      } else if (coveragePct >= 78) {
        label = 'Awesome!';
        xpBonus = 14;
      } else if (coveragePct >= 60) {
        label = 'Great!';
        xpBonus = 8;
      } else if (coveragePct >= 40) {
        label = 'Cool!';
        xpBonus = 4;
      }

      if (label) {
        state.phraseBonusXp += xpBonus;
        emitted = {
          phraseIndex: p.index,
          label,
          xpBonus,
          coveragePct,
          id: `${p.index}-${coveragePct}`
        };
        state.lastPhraseRating = emitted;
      }
    }
    return emitted;
  }

  function recordFrame(songTime, detectedPitch, { scoringActive = true } = {}) {
    while (state.pitchTrail.length > 0 && state.pitchTrail[state.pitchTrail.length - 1].time > songTime) {
      state.pitchTrail.pop();
    }
    if (state.lastInTuneTime > songTime) {
      state.lastInTuneTime = -999;
    }
    while (
      state.recentInTuneSamples.length > 0 &&
      state.recentInTuneSamples[state.recentInTuneSamples.length - 1].time > songTime
    ) {
      state.recentInTuneSamples.pop();
    }

    const targetNote = findTargetNoteAtTime(songTime);
    const scoreableRealNote = targetNote && !targetNote.isGlideBridge ? targetNote : null;
    if (scoringActive && scoreableRealNote) {
      scoreableRealNote.totalFrames += 1;
      state.totalScoredFrames += 1;
    }

    const phraseRating = scoringActive ? evaluatePhraseRatings(songTime) : null;

    // Issue #173: Rap / Spoken Freestyle Bars score on microphone voice activity (RMS) without requiring pitch
    const isRapTarget = Boolean(targetNote && targetNote.isRap);
    const hasVoiceActivity = Boolean(
      detectedPitch && (
        Number.isFinite(detectedPitch.midiFloat) ||
        (Number.isFinite(detectedPitch.rms) && detectedPitch.rms >= state.rapEnergyGate)
      )
    );

    if (isRapTarget && hasVoiceActivity) {
      const shiftedTargetMidi = targetNote.midi + state.keyShiftSemitones;
      if (scoringActive && scoreableRealNote) {
        state.lastInTuneTime = songTime;
        state.inTuneFrames += 1;
        state.perfectFrames += 1;
        scoreableRealNote.hitFrames += 1;
        scoreableRealNote.fillRatio = Math.min(1, scoreableRealNote.hitFrames / Math.max(1, scoreableRealNote.totalFrames));
        state.vocalCombo += 1;
        if (state.vocalCombo > state.maxVocalCombo) state.maxVocalCombo = state.vocalCombo;
        const rapMult = scoreableRealNote.isGolden ? 2 : 1;
        state.vocalScorePoints += 10 * rapMult;
      }
      const point = {
        time: songTime,
        midiFloat: Number.isFinite(detectedPitch.midiFloat) ? detectedPitch.midiFloat : shiftedTargetMidi,
        displayMidi: shiftedTargetMidi,
        inTune: true,
        tier: 'perfect',
        centsDelta: 0,
        vibrato: false
      };
      state.activePitch = point;
      if (scoringActive) {
        state.pitchTrail.push(point);
        const cutoff = songTime - 8.0;
        while (state.pitchTrail.length > 0 && state.pitchTrail[0].time < cutoff) {
          state.pitchTrail.shift();
        }
      }
      return {
        targetNote,
        inTune: true,
        tier: 'perfect',
        vibrato: false,
        displayMidi: shiftedTargetMidi,
        phraseRating
      };
    }

    if (!detectedPitch || !Number.isFinite(detectedPitch.midiFloat)) {
      state.activePitch = null;
      const sinceInTune = songTime - state.lastInTuneTime;
      if (scoringActive && scoreableRealNote && sinceInTune >= 0 && sinceInTune <= SINGING_BREAK_TOLERANCE_SEC) {
        scoreableRealNote.hitFrames += 0.5;
        scoreableRealNote.fillRatio = Math.min(1, scoreableRealNote.hitFrames / Math.max(1, scoreableRealNote.totalFrames));
      }
      return { targetNote, inTune: false, tier: 'off', vibrato: false, phraseRating };
    }

    let dist = { semitoneDelta: 0, absSemitones: 0, centsDelta: 0, inTune: false, tier: 'off', preciseNorm: 0 };
    let displayMidi = detectedPitch.midiFloat;

    if (targetNote) {
      const shiftedTargetMidi = targetNote.midi + state.keyShiftSemitones;
      dist = calcVocalPitchDistance(detectedPitch.midiFloat, shiftedTargetMidi, {
        octaveAgnostic: state.octaveAgnostic,
        toleranceSemitones: state.toleranceSemitones
      });
      displayMidi = state.octaveAgnostic
        ? shiftedTargetMidi + dist.semitoneDelta
        : detectedPitch.midiFloat;
    }

    let vibrato = false;
    if (scoringActive && targetNote && dist.inTune) {
      state.lastInTuneTime = songTime;
      if (scoreableRealNote) {
        state.inTuneFrames += 1;
        if (dist.tier === 'perfect') state.perfectFrames += 1;
        scoreableRealNote.hitFrames += 1;
        scoreableRealNote.fillRatio = Math.min(1, scoreableRealNote.hitFrames / Math.max(1, scoreableRealNote.totalFrames));
      }

      state.recentInTuneSamples.push({ time: songTime, centsDelta: dist.centsDelta });
      if (state.recentInTuneSamples.length > 24) state.recentInTuneSamples.shift();
      vibrato = detectVocalVibrato(state.recentInTuneSamples);
      if (vibrato && scoreableRealNote) state.vibratoFrames += 1;

      state.vocalCombo += 1;
      if (state.vocalCombo > state.maxVocalCombo) state.maxVocalCombo = state.vocalCombo;
      if (scoreableRealNote) {
        const tierPts = dist.tier === 'perfect' ? 12 : dist.tier === 'great' ? 9 : 6;
        const radiantMult = scoreableRealNote.isGolden ? 2 : 1;
        state.vocalScorePoints += (tierPts + (vibrato ? 4 : 0)) * radiantMult;
      }
    } else if (scoringActive && scoreableRealNote) {
      state.vocalCombo = 0;
    }

    const point = {
      time: songTime,
      midiFloat: detectedPitch.midiFloat,
      displayMidi,
      inTune: dist.inTune,
      tier: dist.tier,
      centsDelta: dist.centsDelta,
      vibrato
    };
    state.activePitch = point;
    if (scoringActive) {
      state.pitchTrail.push(point);
      const cutoff = songTime - 8.0;
      while (state.pitchTrail.length > 0 && state.pitchTrail[0].time < cutoff) {
        state.pitchTrail.shift();
      }
    }

    return { targetNote, ...dist, vibrato, displayMidi, phraseRating };
  }

  function getSummary() {
    const accuracyPct = state.totalScoredFrames > 0
      ? Math.round((state.inTuneFrames / state.totalScoredFrames) * 100)
      : 0;
    const perfectPct = state.totalScoredFrames > 0
      ? Math.round((state.perfectFrames / state.totalScoredFrames) * 100)
      : 0;
    const allNotes = chart.notes || [];
    let completedNotes = 0;
    let radiantCompletedNotes = 0;
    for (let i = 0; i < allNotes.length; i++) {
      if (allNotes[i].fillRatio >= 0.45) {
        completedNotes++;
        if (allNotes[i].isGolden) radiantCompletedNotes++;
      }
    }
    const baseNoteXp = (completedNotes - radiantCompletedNotes) * 14 + radiantCompletedNotes * 28;
    const vocalXpEarned = Math.max(
      0,
      Math.round(
        baseNoteXp +
        state.phraseBonusXp +
        (accuracyPct >= 85 ? 80 : accuracyPct >= 65 ? 40 : 0) +
        state.vibratoFrames * 0.5
      )
    );

    return {
      accuracyPct,
      perfectPct,
      completedNotes,
      radiantCompletedNotes,
      totalNotes: (chart.notes || []).length,
      vocalScorePoints: state.vocalScorePoints,
      phraseBonusXp: state.phraseBonusXp,
      maxVocalCombo: state.vocalCombo > state.maxVocalCombo ? state.vocalCombo : state.maxVocalCombo,
      vibratoFrames: state.vibratoFrames,
      vocalXpEarned
    };
  }

  return {
    chart,
    state,
    reset,
    setKeyShiftSemitones,
    findTargetNoteAtTime,
    getActivePhraseIndices,
    evaluatePhraseRatings,
    recordFrame,
    getSummary
  };
}

/**
 * Issue #126 & #160: Render the Horizontal Scrolling Vocal Pitch Highway
 * (Let's Sing / Xbox Lips style with Warm Tavern Obsidian backdrop & Bezier slide ribbons).
 */
function renderSpellSingingStage(ctx, width, height, {
  vocalChart,
  scorerState,
  currentTime = 0,
  pxPerSec = 190
} = {}) {
  if (!ctx || width <= 0 || height <= 0) return;

  // 1. Warm Tavern Obsidian & Deep Velvet Stage Backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#120d0a');
  bgGrad.addColorStop(0.5, '#1a1216');
  bgGrad.addColorStop(1, '#0c0907');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const notes = vocalChart?.notes || [];
  const phrases = vocalChart?.phrases || [];
  const keyShift = Math.max(-6, Math.min(6, Math.round(Number(scorerState?.keyShiftSemitones) || 0)));
  const playheadX = Math.round(width * 0.28);

  // 2. Dynamic Phrase Auto-Zoom (frame active/upcoming phrase pitch range)
  const activePhrase = phrases.find((p) => currentTime <= p.endTime + 0.5) || phrases[phrases.length - 1] || null;
  let minMidi = (activePhrase ? activePhrase.minMidi : 58) + keyShift - 3;
  let maxMidi = (activePhrase ? activePhrase.maxMidi : 72) + keyShift + 3;
  if (maxMidi - minMidi < 14) {
    const mid = Math.round((minMidi + maxMidi) / 2);
    minMidi = mid - 7;
    maxMidi = mid + 7;
  }

  const topPad = 26;
  const bottomPad = 38;
  const usableH = Math.max(80, height - topPad - bottomPad);
  const midiToY = (midiVal) => {
    const norm = (midiVal - minMidi) / Math.max(1, maxMidi - minMidi);
    return topPad + usableH * (1 - norm);
  };
  const semitoneH = usableH / Math.max(1, maxMidi - minMidi);
  const barHeight = Math.max(14, Math.min(26, semitoneH * 0.86));

  // 3. Subtle horizontal pitch guide lanes
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  for (let m = Math.ceil(minMidi); m <= Math.floor(maxMidi); m++) {
    const y = midiToY(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    ctx.strokeStyle = isC ? 'rgba(212, 175, 55, 0.24)' : 'rgba(244, 235, 217, 0.06)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    if (isC || m % 4 === 0) {
      ctx.fillStyle = isC ? 'rgba(255, 215, 0, 0.68)' : 'rgba(186, 171, 147, 0.42)';
      ctx.fillText(vocalMidiToNoteName(m), 8, y + 4);
    }
  }

  const minVisibleTime = currentTime - (playheadX / pxPerSec) - 0.5;
  const maxVisibleTime = currentTime + ((width - playheadX) / pxPerSec) + 0.5;

  // 4a. Issue #160: Draw smooth cubic Bezier Pitch-Slide ("Portamento") Connector Ribbons
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < notes.length - 1; i++) {
    const n = notes[i];
    if (!n.slideToNext || n.isRap) continue;
    const next = notes[i + 1];
    if (next.isRap) continue;
    if (n.time > maxVisibleTime) break;
    if (next.endTime < minVisibleTime) continue;

    const x1 = playheadX + (n.endTime - currentTime) * pxPerSec;
    const x2 = playheadX + (next.time - currentTime) * pxPerSec;
    const y1 = midiToY(n.midi + keyShift);
    const y2 = midiToY(next.midi + keyShift);
    const cx = (x1 + x2) * 0.5;

    ctx.beginPath();
    ctx.moveTo(x1 - 2, y1);
    ctx.bezierCurveTo(cx, y1, cx, y2, x2 + 2, y2);
    ctx.lineWidth = Math.max(6, barHeight * 0.52);
    ctx.strokeStyle = n.isGolden || next.isGolden
      ? 'rgba(255, 215, 0, 0.20)'
      : 'rgba(0, 229, 255, 0.18)';
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = n.isGolden || next.isGolden
      ? 'rgba(255, 215, 0, 0.55)'
      : 'rgba(0, 229, 255, 0.45)';
    ctx.stroke();
  }
  ctx.restore();

  // 4b. Target Vocal Melody Capsules scrolling right-to-left
  let lastLabelRightX = -Infinity;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.time > maxVisibleTime) break;
    if (n.endTime < minVisibleTime) continue;
    const x = playheadX + (n.time - currentTime) * pxPerSec;
    const w = Math.max(18, n.duration * pxPerSec);
    const yCenter = midiToY(n.midi + keyShift);
    const yTop = yCenter - barHeight / 2;
    const radius = Math.min(barHeight / 2, w / 2, 11);

    ctx.save();
    if (n.isGolden) {
      ctx.shadowColor = 'rgba(255, 215, 0, 0.65)';
      ctx.shadowBlur = 10;
    }
    drawRoundedRectPath(ctx, x, yTop, w, barHeight, radius);
    if (n.isRap) {
      ctx.fillStyle = n.isGolden ? 'rgba(245, 158, 11, 0.28)' : 'rgba(168, 85, 247, 0.24)';
    } else {
      ctx.fillStyle = n.isGolden ? 'rgba(255, 215, 0, 0.26)' : 'rgba(0, 229, 255, 0.20)';
    }
    ctx.fill();
    ctx.lineWidth = n.isGolden ? 2 : 1.5;
    if (n.isRap) {
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = n.isGolden ? '#fbbf24' : '#c084fc';
    } else {
      ctx.strokeStyle = n.isGolden ? '#ffd700' : '#00e5ff';
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (n.fillRatio > 0.02) {
      ctx.clip();
      const fillW = w * Math.min(1, n.fillRatio);
      const fillGrad = ctx.createLinearGradient(x, yTop, x + fillW, yTop);
      if (n.isGolden) {
        fillGrad.addColorStop(0, 'rgba(255, 215, 0, 0.85)');
        fillGrad.addColorStop(1, 'rgba(254, 240, 138, 0.96)');
      } else if (n.isRap) {
        fillGrad.addColorStop(0, 'rgba(192, 132, 252, 0.82)');
        fillGrad.addColorStop(1, 'rgba(245, 158, 11, 0.92)');
      } else {
        fillGrad.addColorStop(0, 'rgba(54, 211, 153, 0.82)');
        fillGrad.addColorStop(1, 'rgba(0, 229, 255, 0.94)');
      }
      ctx.fillStyle = fillGrad;
      ctx.fillRect(x, yTop, fillW, barHeight);
    }
    ctx.restore();

    // Non-overlapping lyric cue printed beneath vocal capsule
    if (n.lyric && x > lastLabelRightX + 6) {
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      const cueText = n.isRap ? `🎤 ${n.lyric}` : n.lyric;
      const labelW = ctx.measureText(cueText).width;
      ctx.fillStyle = currentTime >= n.time && currentTime <= n.endTime ? '#ffd700' : '#f4ebd9';
      ctx.fillText(cueText, x + 3, yTop + barHeight + 15);
      lastLabelRightX = x + 3 + labelW;
    }
  }

  // 5. Real-time Sung Pitch Ribbon Trail
  const trail = scorerState?.pitchTrail || [];
  if (trail.length > 1) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let activeColor = null;
    let pathOpen = false;
    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      if (p1.time - p0.time > 0.22) {
        if (pathOpen) {
          ctx.stroke();
          pathOpen = false;
        }
        continue;
      }
      const segColor = p1.inTune
        ? (p1.vibrato ? '#ffd700' : '#36d399')
        : 'rgba(248, 113, 113, 0.82)';
      const x0 = playheadX + (p0.time - currentTime) * pxPerSec;
      const x1 = playheadX + (p1.time - currentTime) * pxPerSec;
      const y0 = midiToY(p0.displayMidi);
      const y1 = midiToY(p1.displayMidi);
      if (!pathOpen || segColor !== activeColor) {
        if (pathOpen) ctx.stroke();
        ctx.strokeStyle = segColor;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        activeColor = segColor;
        pathOpen = true;
      }
      ctx.lineTo(x1, y1);
    }
    if (pathOpen) ctx.stroke();
    ctx.restore();
  }

  // 6. Glowing Vertical Sing Playhead Line
  const headGrad = ctx.createLinearGradient(0, 0, 0, height);
  headGrad.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
  headGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.95)');
  headGrad.addColorStop(1, 'rgba(255, 215, 0, 0.15)');
  ctx.strokeStyle = headGrad;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();

  // 7. Live Singer Pitch Orb on the Playhead
  const activePitch = scorerState?.activePitch;
  if (activePitch && Number.isFinite(activePitch.displayMidi)) {
    const orbY = Math.max(topPad, Math.min(height - bottomPad, midiToY(activePitch.displayMidi)));
    ctx.beginPath();
    ctx.arc(playheadX, orbY, 13, 0, Math.PI * 2);
    ctx.fillStyle = activePitch.inTune ? 'rgba(54, 211, 153, 0.28)' : 'rgba(248, 113, 113, 0.28)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(playheadX, orbY, 8, 0, Math.PI * 2);
    ctx.fillStyle = activePitch.inTune ? '#36d399' : '#f87171';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // 8. Phrase Entry Countdown Dots
  if (activePhrase && currentTime < activePhrase.startTime) {
    const leadSec = activePhrase.startTime - currentTime;
    if (leadSec > 0.15 && leadSec <= 3.0) {
      const dotsRemaining = Math.ceil(leadSec);
      ctx.save();
      ctx.font = '700 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`Sing in ${dotsRemaining}...`, playheadX, 20);
      ctx.restore();
    }
  }
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = {
  SINGING_BREAK_TOLERANCE_SEC,
  vocalMidiToNoteName,
  parseLrcText,
  findSiblingLrcPath,
  computeAutoAlignLyricsOffset,
  simplifyVocalNotesForSinging,
  buildVocalChart,
  calcVocalPitchDistance,
  detectVocalVibrato,
  createVocalSessionScorer,
  renderSpellSingingStage
};

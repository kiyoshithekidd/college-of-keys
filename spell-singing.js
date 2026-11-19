/**
 * Epic #43 (Phases #125, #126, #127): Spell-Singing (Vocals / Karaoke / Let's Sing Mode)
 *
 * Inspired by open-source karaoke architectures (AllKaraoke, Performous, TunePerfect, UltraStar):
 * - Phase 2 (#125): Timed MusicXML <lyric> alignment, sibling .lrc parsing, custom lyric paste,
 *   and melodic syllable fallback (solfege / note names / phonetic guide) grouped into phrases.
 * - Phase 3 (#126): Horizontal scrolling Vocal Pitch Highway canvas renderer with dynamic phrase
 *   auto-zoom, target melody capsules, progressive gold fill, live sung pitch cents ribbon,
 *   and 2-line karaoke lyric teleprompter view model.
 * - Phase 4 (#127): Octave-agnostic (mod 12) vocal pitch distance & cents scoring, 100ms singing
 *   break forgiveness, vibrato detection, and separate Vocal XP calculation.
 */

const fs = require('fs');
const path = require('path');

const SINGING_BREAK_TOLERANCE_SEC = 0.1;
const SOLFEGE_NAMES = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function vocalMidiToNoteName(midi) {
  if (!Number.isFinite(midi)) return '—';
  const r = Math.round(midi);
  return `${PITCH_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

/**
 * Parse standard .lrc timestamped lyrics (`[mm:ss.xx] Line text`) into sorted lines.
 * Also supports plain-text pasted lyrics (one phrase per line) by returning `time: null`.
 */
function parseLrcText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/);
  const parsed = [];
  const tagRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Skip LRC metadata tags like [ar:Artist], [ti:Title], [al:Album]
    if (/^\[(ar|ti|al|by|offset|re|ve):/i.test(trimmed)) continue;

    const times = [];
    let match;
    tagRe.lastIndex = 0;
    while ((match = tagRe.exec(trimmed)) !== null) {
      const mins = parseInt(match[1], 10) || 0;
      const secs = parseInt(match[2], 10) || 0;
      const fracStr = match[3] || '0';
      const frac = fracStr.length === 3
        ? parseInt(fracStr, 10) / 1000
        : fracStr.length === 2
          ? parseInt(fracStr, 10) / 100
          : parseInt(fracStr, 10) / 10;
      times.push(mins * 60 + secs + frac);
    }

    const cleanText = trimmed.replace(tagRe, '').trim();
    if (!cleanText) continue;

    if (times.length > 0) {
      for (const t of times) {
        parsed.push({ time: t, text: cleanText });
      }
    } else {
      parsed.push({ time: null, text: cleanText });
    }
  }

  const hasTimestamps = parsed.some((p) => Number.isFinite(p.time));
  if (hasTimestamps) {
    return parsed.filter((p) => Number.isFinite(p.time)).sort((a, b) => a.time - b.time);
  }
  return parsed;
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
 * Build a complete Vocal Chart (notes + phrases) for Spell-Singing Karaoke Mode.
 * Priority for lyrics:
 *  1. Custom pasted lyrics / LRC text (`customLyricsText`)
 *  2. MusicXML `<lyric>` tokens (`musicXmlLyrics`)
 *  3. Sibling `.lrc` lines (`lrcLines`)
 *  4. Melodic Syllable Guide fallback (`solfege` / `note-name` / `la`)
 */
function buildVocalChart({
  vocalNotes = [],
  musicXmlLyrics = [],
  lrcLines = [],
  customLyricsText = '',
  fallbackMode = 'solfege'
} = {}) {
  const sortedNotes = (Array.isArray(vocalNotes) ? vocalNotes : [])
    .filter((n) => n && Number.isFinite(n.time) && Number.isFinite(n.midi))
    .map((n, idx) => ({
      id: n.id || `vocal_${idx}`,
      index: idx,
      time: Math.max(0, Number(n.time)),
      duration: Math.max(0.1, Number(n.duration) || 0.25),
      endTime: Math.max(0, Number(n.time)) + Math.max(0.1, Number(n.duration) || 0.25),
      midi: Math.round(Number(n.midi)),
      lyric: '',
      syllabic: 'single',
      hitFrames: 0,
      totalFrames: 0,
      fillRatio: 0,
      isGolden: idx > 0 && idx % 11 === 0
    }))
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Deduplicate simultaneous vocal harmony notes (keep top melody pitch per onset)
  const monoNotes = [];
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
  monoNotes.forEach((n, idx) => {
    n.index = idx;
  });

  let lyricSource = 'fallback';
  const customParsed = customLyricsText ? parseLrcText(customLyricsText) : [];
  const activeLrc = customParsed.length > 0 ? customParsed : (Array.isArray(lrcLines) ? lrcLines : []);

  if (customParsed.length > 0) {
    lyricSource = 'custom-lyrics';
    applyLrcOrLinesToNotes(monoNotes, customParsed);
  } else if (Array.isArray(musicXmlLyrics) && musicXmlLyrics.length > 0) {
    lyricSource = 'musicxml';
    const sortedXml = musicXmlLyrics.slice().sort((a, b) => a.time - b.time);
    for (const ev of sortedXml) {
      let bestNote = null;
      let bestDist = 0.22;
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
  } else if (activeLrc.length > 0) {
    lyricSource = 'lrc';
    applyLrcOrLinesToNotes(monoNotes, activeLrc);
  }

  // Fill any unlabelled notes with melodic syllable guide so every capsule has a clear cue
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

  // Group into singable Karaoke Phrases (split on gaps > 1.1s, sentence endings, or 10 notes)
  const phrases = [];
  let currentPhraseNotes = [];

  const flushPhrase = () => {
    if (currentPhraseNotes.length === 0) return;
    let minMidi = Infinity;
    let maxMidi = -Infinity;
    for (const n of currentPhraseNotes) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    }
    phrases.push({
      index: phrases.length,
      startTime: currentPhraseNotes[0].time,
      endTime: currentPhraseNotes[currentPhraseNotes.length - 1].endTime,
      notes: currentPhraseNotes,
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

  return {
    notes: monoNotes,
    phrases,
    lyricSource,
    totalDuration: monoNotes.length > 0 ? monoNotes[monoNotes.length - 1].endTime : 0
  };
}

function applyLrcOrLinesToNotes(monoNotes, lines) {
  if (!monoNotes.length || !lines.length) return;
  const hasTimestamps = lines.some((l) => Number.isFinite(l.time));

  if (hasTimestamps) {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const nextLine = lines[li + 1];
      const startSec = line.time;
      const endSec = nextLine ? nextLine.time : Infinity;
      const words = line.text.split(/\s+/).filter(Boolean);
      const matchingNotes = monoNotes.filter((n) => n.time >= startSec - 0.15 && n.time < endSec - 0.05);
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
    // Wrap difference smoothly into [-6, +6) semitones regardless of octave
    diffSemitones = ((((sungMidiFloat - targetMidi) % 12) + 18) % 12) - 6;
  } else {
    diffSemitones = sungMidiFloat - targetMidi;
  }

  const absSemitones = Math.abs(diffSemitones);
  const centsDelta = Math.round(diffSemitones * 100);
  const tol = Math.max(0.35, Number(toleranceSemitones) || 1);
  const inTune = absSemitones <= tol;

  let tier = 'off';
  if (absSemitones <= 0.45) {
    tier = 'perfect';
  } else if (absSemitones <= Math.max(0.85, tol * 0.85)) {
    tier = 'great';
  } else if (absSemitones <= tol) {
    tier = 'good';
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
 * Stateful Vocal Performance Scorer & Pitch Trail Recorder (#126 & #127).
 */
function createVocalSessionScorer(vocalChart, options = {}) {
  const chart = vocalChart || { notes: [], phrases: [] };
  const state = {
    octaveAgnostic: options.octaveAgnostic !== false,
    toleranceSemitones: Number(options.toleranceSemitones) || 1.0,
    pitchTrail: [], // { time, midiFloat, displayMidi, inTune, tier, centsDelta }
    activePitch: null,
    lastInTuneTime: -999,
    totalScoredFrames: 0,
    inTuneFrames: 0,
    perfectFrames: 0,
    vibratoFrames: 0,
    vocalCombo: 0,
    maxVocalCombo: 0,
    vocalScorePoints: 0,
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
    state.recentInTuneSamples = [];
    for (const n of chart.notes || []) {
      n.hitFrames = 0;
      n.totalFrames = 0;
      n.fillRatio = 0;
    }
  }

  function findTargetNoteAtTime(songTime) {
    for (const n of chart.notes || []) {
      if (songTime >= n.time - 0.06 && songTime <= n.endTime + 0.06) {
        return n;
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

  function recordFrame(songTime, detectedPitch) {
    const targetNote = findTargetNoteAtTime(songTime);
    if (targetNote) {
      targetNote.totalFrames += 1;
      state.totalScoredFrames += 1;
    }

    if (!detectedPitch || !Number.isFinite(detectedPitch.midiFloat)) {
      state.activePitch = null;
      // Forgive tiny breathing gaps <= 100ms
      if (targetNote && songTime - state.lastInTuneTime <= SINGING_BREAK_TOLERANCE_SEC) {
        targetNote.hitFrames += 0.5;
        targetNote.fillRatio = Math.min(1, targetNote.hitFrames / Math.max(1, targetNote.totalFrames));
      }
      return { targetNote, inTune: false, tier: 'off', vibrato: false };
    }

    let dist = { semitoneDelta: 0, absSemitones: 0, centsDelta: 0, inTune: false, tier: 'off', preciseNorm: 0 };
    let displayMidi = detectedPitch.midiFloat;

    if (targetNote) {
      dist = calcVocalPitchDistance(detectedPitch.midiFloat, targetNote.midi, {
        octaveAgnostic: state.octaveAgnostic,
        toleranceSemitones: state.toleranceSemitones
      });
      // Display singer's pitch shifted into the target note's octave when octaveAgnostic is on
      displayMidi = state.octaveAgnostic
        ? targetNote.midi + dist.semitoneDelta
        : detectedPitch.midiFloat;
    }

    let vibrato = false;
    if (targetNote && dist.inTune) {
      state.lastInTuneTime = songTime;
      state.inTuneFrames += 1;
      if (dist.tier === 'perfect') state.perfectFrames += 1;
      targetNote.hitFrames += 1;
      targetNote.fillRatio = Math.min(1, targetNote.hitFrames / Math.max(1, targetNote.totalFrames));

      state.recentInTuneSamples.push({ time: songTime, centsDelta: dist.centsDelta });
      if (state.recentInTuneSamples.length > 24) state.recentInTuneSamples.shift();
      vibrato = detectVocalVibrato(state.recentInTuneSamples);
      if (vibrato) state.vibratoFrames += 1;

      state.vocalCombo += 1;
      if (state.vocalCombo > state.maxVocalCombo) state.maxVocalCombo = state.vocalCombo;
      const tierPts = dist.tier === 'perfect' ? 12 : dist.tier === 'great' ? 9 : 6;
      state.vocalScorePoints += tierPts + (targetNote.isGolden ? 6 : 0) + (vibrato ? 4 : 0);
    } else if (targetNote) {
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
    state.pitchTrail.push(point);
    // Keep last 8 seconds of pitch trail
    const cutoff = songTime - 8.0;
    while (state.pitchTrail.length > 0 && state.pitchTrail[0].time < cutoff) {
      state.pitchTrail.shift();
    }

    return { targetNote, ...dist, vibrato, displayMidi };
  }

  function getSummary() {
    const accuracyPct = state.totalScoredFrames > 0
      ? Math.round((state.inTuneFrames / state.totalScoredFrames) * 100)
      : 0;
    const perfectPct = state.totalScoredFrames > 0
      ? Math.round((state.perfectFrames / state.totalScoredFrames) * 100)
      : 0;
    const completedNotes = (chart.notes || []).filter((n) => n.fillRatio >= 0.45).length;
    const vocalXpEarned = Math.max(
      0,
      Math.round(completedNotes * 14 + (accuracyPct >= 85 ? 80 : accuracyPct >= 65 ? 40 : 0) + state.vibratoFrames * 0.5)
    );

    return {
      accuracyPct,
      perfectPct,
      completedNotes,
      totalNotes: (chart.notes || []).length,
      vocalScorePoints: state.vocalScorePoints,
      maxVocalCombo: state.maxVocalCombo,
      vibratoFrames: state.vibratoFrames,
      vocalXpEarned
    };
  }

  return {
    chart,
    state,
    reset,
    findTargetNoteAtTime,
    getActivePhraseIndices,
    recordFrame,
    getSummary
  };
}

/**
 * Issue #126: Render the Horizontal Scrolling Vocal Pitch Highway (AllKaraoke / Performous style).
 */
function renderSpellSingingStage(ctx, width, height, {
  vocalChart,
  scorerState,
  currentTime = 0,
  pxPerSec = 190
} = {}) {
  if (!ctx || width <= 0 || height <= 0) return;

  // 1. Atmospheric Arcane Karaoke Backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#0a0f1f');
  bgGrad.addColorStop(0.5, '#121833');
  bgGrad.addColorStop(1, '#0b1022');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const notes = vocalChart?.notes || [];
  const phrases = vocalChart?.phrases || [];
  const playheadX = Math.round(width * 0.28);

  // 2. Dynamic Phrase Auto-Zoom (frame active/upcoming phrase pitch range)
  let activePhrase = phrases.find((p) => currentTime <= p.endTime + 0.5) || phrases[phrases.length - 1] || null;
  let minMidi = activePhrase ? activePhrase.minMidi - 3 : 55;
  let maxMidi = activePhrase ? activePhrase.maxMidi + 3 : 75;
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
  const barHeight = Math.max(14, Math.min(26, semitoneH * 0.85));

  // 3. Subtle horizontal staff / pitch guide lanes
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  for (let m = Math.ceil(minMidi); m <= Math.floor(maxMidi); m++) {
    const y = midiToY(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    ctx.strokeStyle = isC ? 'rgba(212, 175, 55, 0.22)' : 'rgba(148, 163, 184, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    if (isC || m % 4 === 0) {
      ctx.fillStyle = isC ? 'rgba(250, 204, 21, 0.65)' : 'rgba(148, 163, 184, 0.42)';
      ctx.fillText(vocalMidiToNoteName(m), 8, y + 4);
    }
  }

  // 4. Target Vocal Melody Capsules scrolling right-to-left
  const minVisibleTime = currentTime - (playheadX / pxPerSec) - 0.5;
  const maxVisibleTime = currentTime + ((width - playheadX) / pxPerSec) + 0.5;

  for (const n of notes) {
    if (n.endTime < minVisibleTime || n.time > maxVisibleTime) continue;
    const x = playheadX + (n.time - currentTime) * pxPerSec;
    const w = Math.max(18, n.duration * pxPerSec);
    const yCenter = midiToY(n.midi);
    const yTop = yCenter - barHeight / 2;
    const radius = Math.min(barHeight / 2, w / 2, 10);

    // Base capsule
    ctx.save();
    drawRoundedRectPath(ctx, x, yTop, w, barHeight, radius);
    ctx.fillStyle = n.isGolden ? 'rgba(234, 179, 8, 0.26)' : 'rgba(56, 189, 248, 0.24)';
    ctx.fill();
    ctx.lineWidth = n.isGolden ? 2 : 1.5;
    ctx.strokeStyle = n.isGolden ? '#facc15' : '#38bdf8';
    ctx.stroke();

    // Progressive sung fill inside capsule
    if (n.fillRatio > 0.02) {
      ctx.clip();
      const fillW = w * Math.min(1, n.fillRatio);
      const fillGrad = ctx.createLinearGradient(x, yTop, x + fillW, yTop);
      if (n.isGolden) {
        fillGrad.addColorStop(0, 'rgba(250, 204, 21, 0.85)');
        fillGrad.addColorStop(1, 'rgba(253, 224, 71, 0.95)');
      } else {
        fillGrad.addColorStop(0, 'rgba(34, 197, 94, 0.78)');
        fillGrad.addColorStop(1, 'rgba(56, 189, 248, 0.92)');
      }
      ctx.fillStyle = fillGrad;
      ctx.fillRect(x, yTop, fillW, barHeight);
    }
    ctx.restore();

    // Syllable cue printed beneath each vocal capsule
    if (n.lyric) {
      ctx.font = '600 12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = currentTime >= n.time && currentTime <= n.endTime ? '#fde047' : '#e2e8f0';
      ctx.fillText(n.lyric, x + 3, yTop + barHeight + 15);
    }
  }

  // 5. Real-time Sung Pitch Ribbon Trail (AllKaraoke cents trace style)
  const trail = scorerState?.pitchTrail || [];
  if (trail.length > 1) {
    ctx.save();
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1];
      const p1 = trail[i];
      if (p1.time - p0.time > 0.22) continue;
      const x0 = playheadX + (p0.time - currentTime) * pxPerSec;
      const x1 = playheadX + (p1.time - currentTime) * pxPerSec;
      const y0 = midiToY(p0.displayMidi);
      const y1 = midiToY(p1.displayMidi);
      ctx.strokeStyle = p1.inTune
        ? (p1.vibrato ? '#fde047' : '#4ade80')
        : 'rgba(248, 113, 113, 0.78)';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Glowing Vertical Sing Playhead Line
  const headGrad = ctx.createLinearGradient(0, 0, 0, height);
  headGrad.addColorStop(0, 'rgba(250, 204, 21, 0.15)');
  headGrad.addColorStop(0.5, 'rgba(250, 204, 21, 0.95)');
  headGrad.addColorStop(1, 'rgba(250, 204, 21, 0.15)');
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
    ctx.save();
    ctx.beginPath();
    ctx.arc(playheadX, orbY, 8, 0, Math.PI * 2);
    ctx.fillStyle = activePitch.inTune ? '#4ade80' : '#f87171';
    ctx.shadowColor = activePitch.inTune ? '#4ade80' : '#f87171';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  // 8. Phrase Entry Countdown Dots when approaching next phrase (> 0.2s and <= 3.0s away)
  if (activePhrase && currentTime < activePhrase.startTime) {
    const leadSec = activePhrase.startTime - currentTime;
    if (leadSec > 0.15 && leadSec <= 3.0) {
      const dotsRemaining = Math.ceil(leadSec);
      ctx.save();
      ctx.font = '700 13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#facc15';
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
  buildVocalChart,
  calcVocalPitchDistance,
  detectVocalVibrato,
  createVocalSessionScorer,
  renderSpellSingingStage
};

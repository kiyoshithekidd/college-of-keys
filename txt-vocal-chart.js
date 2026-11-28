'use strict';

/**
 * College of Keys — Issue #172: Community .txt Syllable-Timed Vocal Chart Importer
 * Pure, testable parser for syllable-timed .txt vocal charts (#TITLE, #ARTIST, #BPM, #GAP,
 * #MP3/#AUDIO, #RELATIVE, #ENCODING, P1/P2 duet blocks, :, *, F, G, -, E).
 * Supports UTF-8 and Windows-1252 decoding without mutating source files.
 */

function decodeTxtChartBuffer(input) {
  if (typeof input === 'string') return input;
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (buf.length === 0) return '';

  // Strip UTF-8 BOM if present
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3;
  }
  const slice = start > 0 ? buf.subarray(start) : buf;

  // Quick header sniff for explicit CP1252 / ANSI / ISO-8859-1 encoding
  let asciiPreview = '';
  const limit = Math.min(slice.length, 1024);
  for (let i = 0; i < limit; i++) {
    asciiPreview += String.fromCharCode(slice[i]);
  }
  const encMatch = asciiPreview.match(/^#ENCODING\s*:\s*([^\r\n]+)/im);
  const declaredEnc = encMatch ? encMatch[1].trim().toUpperCase() : '';
  const forceCp1252 = declaredEnc === 'CP1252' || declaredEnc === 'ANSI' || declaredEnc === 'WINDOWS-1252';

  if (!forceCp1252 && typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(slice);
    } catch {
      // Fall back to Windows-1252 for legacy European accented charts
    }
  }

  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('windows-1252').decode(slice);
    } catch {
      // Fall back to latin1
    }
  }

  let out = '';
  for (let i = 0; i < slice.length; i++) {
    out += String.fromCharCode(slice[i]);
  }
  return out;
}

function normalizeTxtPitchToMidi(rawPitch) {
  // Community .txt charts store relative pitch integers (typically -12..+24 around C4=0 or C3=0)
  // or occasional MIDI-range integers (36..84). Fold safely into singing register C3 (48) .. C6 (84).
  let p = Math.round(Number(rawPitch) || 0);
  if (p < 36) {
    p += 60;
  }
  while (p < 48) p += 12;
  while (p > 84) p -= 12;
  return p;
}

function parseTxtVocalChart(input, fallbackTitle = 'Untitled Vocal Chart') {
  const rawText = decodeTxtChartBuffer(input);
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const headers = {};
  const voices = { P1: [], P2: [] };
  const phraseBreaks = { P1: [], P2: [] };
  let activeVoice = 'P1';
  let hasP2 = false;
  const relativeOffsets = { P1: 0, P2: 0 };
  let lastBeatEnd = 0;

  let hasRap = false;
  let hasRadiant = false;
  let sawEnd = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 1) {
        const key = line.slice(1, colonIdx).trim().toUpperCase();
        const val = line.slice(colonIdx + 1).trim();
        headers[key] = val;
      }
      continue;
    }

    if (line === 'P1' || line === 'P 1') {
      activeVoice = 'P1';
      continue;
    }
    if (line === 'P2' || line === 'P 2') {
      activeVoice = 'P2';
      hasP2 = true;
      continue;
    }

    if (line === 'E' || line.startsWith('E ')) {
      sawEnd = true;
      break;
    }

    const type = line[0];
    if (type === '-') {
      const rest = line.slice(1).trim();
      const parts = rest.split(/\s+/);
      const b1 = Number(parts[0]);
      if (Number.isFinite(b1)) {
        const absBeat = (headers.RELATIVE || '').toUpperCase() === 'YES'
          ? relativeOffsets[activeVoice] + b1
          : b1;
        phraseBreaks[activeVoice].push(absBeat);
        if ((headers.RELATIVE || '').toUpperCase() === 'YES') {
          const b2 = Number(parts[1]);
          relativeOffsets[activeVoice] += Number.isFinite(b2) ? b2 : b1;
        }
      }
      continue;
    }

    if (type === ':' || type === '*' || type === 'F' || type === 'G') {
      // Format: "<type> <beat> <length> <pitch> <lyric...>"
      const match = line.match(/^([:*FG])\s+(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/);
      if (!match) continue;
      const noteType = match[1];
      const rawBeat = Number(match[2]);
      const lengthBeats = Math.max(1, Number(match[3]));
      const rawPitch = Number(match[4]);
      const lyricText = match[5] || '';

      const isRelative = (headers.RELATIVE || '').toUpperCase() === 'YES';
      const absBeat = isRelative ? relativeOffsets[activeVoice] + rawBeat : rawBeat;
      const endBeat = absBeat + lengthBeats;
      if (endBeat > lastBeatEnd) lastBeatEnd = endBeat;

      const isGolden = noteType === '*' || noteType === 'G';
      const isRap = noteType === 'F' || noteType === 'G';
      if (isGolden) hasRadiant = true;
      if (isRap) hasRap = true;

      voices[activeVoice].push({
        type: noteType,
        beat: absBeat,
        lengthBeats,
        rawPitch,
        midi: normalizeTxtPitchToMidi(rawPitch),
        text: lyricText,
        isGolden,
        isRap
      });
    }
  }

  const bpmRaw = String(headers.BPM || '120').replace(',', '.');
  const bpm = Math.max(30, Math.min(360, Number(bpmRaw) || 120));
  const gapMs = Number(String(headers.GAP || '0').replace(',', '.')) || 0;
  const gapSec = gapMs / 1000;
  const secPerQuarterBeat = 15 / bpm; // Standard community chart beat = 1/4 of a BPM beat

  const convertVoiceNotes = (rawList) => rawList.map((n, idx) => {
    const startSec = Math.max(0, gapSec + n.beat * secPerQuarterBeat);
    const durationSec = Math.max(0.08, n.lengthBeats * secPerQuarterBeat);
    return {
      index: idx,
      beat: n.beat,
      time: startSec,
      duration: durationSec,
      endTime: startSec + durationSec,
      midi: n.midi,
      name: midiToSimpleName(n.midi),
      lyric: n.text,
      isGolden: n.isGolden,
      isRap: n.isRap,
      slideToNext: false
    };
  });

  const p1Notes = convertVoiceNotes(voices.P1);
  const p2Notes = convertVoiceNotes(voices.P2);
  const primaryNotes = p1Notes.length > 0 ? p1Notes : p2Notes;
  const durationSec = primaryNotes.length > 0
    ? primaryNotes.reduce((m, n) => (n.endTime > m ? n.endTime : m), 0) + 1.0
    : Math.max(0, gapSec + lastBeatEnd * secPerQuarterBeat);

  const audioFileName = (headers.MP3 || headers.AUDIO || '').trim() || null;
  const coverFileName = (headers.COVER || '').trim() || null;
  const isTxtVocalChart = Boolean(primaryNotes.length > 0 && (headers.BPM || headers.TITLE || sawEnd));

  return {
    isTxtVocalChart,
    title: (headers.TITLE || fallbackTitle || 'Untitled Vocal Chart').trim(),
    artist: (headers.ARTIST || 'Unknown Bard').trim(),
    bpm,
    gapMs,
    audioFileName,
    coverFileName,
    isDuet: hasP2 && p1Notes.length > 0 && p2Notes.length > 0,
    hasRap,
    hasRadiant,
    durationSec,
    voices: {
      P1: p1Notes,
      P2: p2Notes
    },
    phraseBreaks: {
      P1: phraseBreaks.P1.map((b) => Math.max(0, gapSec + b * secPerQuarterBeat)),
      P2: phraseBreaks.P2.map((b) => Math.max(0, gapSec + b * secPerQuarterBeat))
    }
  };
}

function midiToSimpleName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = Math.max(0, Math.min(127, Math.round(Number(midi) || 60)));
  return `${names[m % 12]}${Math.floor(m / 12) - 1}`;
}

function computeTxtChartDifficulty(notes, durationSec) {
  const count = Array.isArray(notes) ? notes.length : 0;
  const activeSpan = Math.max(1, Number(durationSec) || 1);
  const nps = count / activeSpan;
  const tiers = [
    { spellLevel: 0, label: 'Cantrip', minNps: 0 },
    { spellLevel: 1, label: '1st-Level', minNps: 1.2 },
    { spellLevel: 2, label: '2nd-Level', minNps: 2.0 },
    { spellLevel: 3, label: '3rd-Level', minNps: 2.8 },
    { spellLevel: 4, label: '4th-Level', minNps: 3.6 },
    { spellLevel: 5, label: '5th-Level', minNps: 4.5 },
    { spellLevel: 6, label: '6th-Level', minNps: 5.5 },
    { spellLevel: 7, label: '7th-Level', minNps: 6.5 },
    { spellLevel: 8, label: '8th-Level', minNps: 7.5 },
    { spellLevel: 9, label: '9th-Level', minNps: 8.8 }
  ];
  let chosen = tiers[0];
  for (const t of tiers) {
    if (nps >= t.minNps) chosen = t;
  }
  return {
    ...chosen,
    nps: Math.round(nps * 100) / 100
  };
}

function inspectTxtVocalChartBuffer(input, fileName = '') {
  const parsed = parseTxtVocalChart(input, fileName.replace(/\.txt$/i, ''));
  const notes = parsed.voices.P1.length > 0 ? parsed.voices.P1 : parsed.voices.P2;
  const diff = computeTxtChartDifficulty(notes, parsed.durationSec);
  return {
    isTxtVocalChart: parsed.isTxtVocalChart,
    title: parsed.title,
    artist: parsed.artist,
    bpm: parsed.bpm,
    durationSec: parsed.durationSec,
    audioFileName: parsed.audioFileName,
    coverFileName: parsed.coverFileName,
    hasRap: parsed.hasRap,
    hasRadiant: parsed.hasRadiant,
    isDuet: parsed.isDuet,
    noteCount: notes.length,
    nps: diff.nps,
    difficulty: diff
  };
}

function buildVocalChartFromTxt(parsed, { voice = 'P1', offsetSec = 0 } = {}) {
  const chosenVoice = voice === 'P2' && parsed.voices.P2.length > 0 ? 'P2' : 'P1';
  const baseNotes = parsed.voices[chosenVoice].length > 0
    ? parsed.voices[chosenVoice]
    : (parsed.voices.P1.length > 0 ? parsed.voices.P1 : parsed.voices.P2);
  // Lyric Timing Sync offset shifts every note and phrase break (#232)
  const shift = Number.isFinite(Number(offsetSec)) ? Number(offsetSec) : 0;
  const rawNotes = shift === 0
    ? baseNotes
    : baseNotes.map((n) => ({ ...n, time: n.time + shift, endTime: n.endTime + shift }));
  const breaks = (parsed.phraseBreaks[chosenVoice] || []).map((b) => b + shift).sort((a, b) => a - b);

  // Flag legato slides on consecutive pitched non-rap notes
  const notes = rawNotes.map((n, idx) => {
    const next = rawNotes[idx + 1];
    let slideToNext = false;
    if (next && !n.isRap && !next.isRap) {
      const gap = next.time - n.endTime;
      const semitoneStep = Math.abs(next.midi - n.midi);
      if (semitoneStep >= 1 && semitoneStep <= 7 && gap >= -0.02 && gap <= 0.14) {
        slideToNext = true;
      }
    }
    return { ...n, slideToNext };
  });

  // Group notes into phrases using explicit '-' break timestamps (or >1.2s gap fallback)
  const phrases = [];
  let currentNotes = [];
  let breakIdx = 0;

  const flushPhrase = () => {
    if (currentNotes.length === 0) return;
    // Join syllable tokens: spaces inside `.txt` tokens mark word boundaries
    let text = '';
    const words = [];
    let currentWordText = '';
    let wordStart = currentNotes[0].time;
    let wordEnd = currentNotes[0].endTime;

    for (const n of currentNotes) {
      const raw = n.lyric || '';
      const startsWithSpace = /^\s/.test(raw);
      const endsWithSpace = /\s$/.test(raw);
      const clean = raw.trim();

      if (startsWithSpace && currentWordText) {
        words.push({ text: currentWordText, startTime: wordStart, endTime: wordEnd });
        currentWordText = '';
      }
      if (!currentWordText) {
        wordStart = n.time;
      }
      currentWordText += clean;
      wordEnd = n.endTime;
      if (endsWithSpace && currentWordText) {
        words.push({ text: currentWordText, startTime: wordStart, endTime: wordEnd });
        currentWordText = '';
      }
      text += raw;
    }
    if (currentWordText) {
      words.push({ text: currentWordText, startTime: wordStart, endTime: wordEnd });
    }

    const midis = currentNotes.map((n) => n.midi);
    phrases.push({
      index: phrases.length,
      startTime: currentNotes[0].time,
      endTime: currentNotes[currentNotes.length - 1].endTime,
      notes: currentNotes,
      words,
      text: text.replace(/\s+/g, ' ').trim(),
      minMidi: midis.reduce((a, b) => (b < a ? b : a), Infinity),
      maxMidi: midis.reduce((a, b) => (b > a ? b : a), -Infinity)
    });
    currentNotes = [];
  };

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    while (breakIdx < breaks.length && n.time >= breaks[breakIdx] - 0.02) {
      flushPhrase();
      breakIdx += 1;
    }
    if (currentNotes.length > 0) {
      const prev = currentNotes[currentNotes.length - 1];
      if (n.time - prev.endTime >= 1.35 || currentNotes.length >= 16) {
        flushPhrase();
      }
    }
    currentNotes.push(n);
  }
  flushPhrase();

  let minMidi = 55;
  let maxMidi = 76;
  if (notes.length > 0) {
    minMidi = Infinity;
    maxMidi = -Infinity;
    for (const n of notes) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    }
  }
  return {
    notes,
    phrases,
    lyricSource: 'txt-chart',
    hasRap: parsed.hasRap,
    hasRadiant: parsed.hasRadiant,
    isDuet: parsed.isDuet,
    activeVoice: chosenVoice,
    minMidi,
    maxMidi,
    offsetSec: shift,
    durationSec: Math.max(0, parsed.durationSec + shift)
  };
}

const api = {
  decodeTxtChartBuffer,
  normalizeTxtPitchToMidi,
  parseTxtVocalChart,
  computeTxtChartDifficulty,
  inspectTxtVocalChartBuffer,
  buildVocalChartFromTxt
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeTxtVocalChart = api;
}

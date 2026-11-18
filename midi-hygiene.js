/**
 * College of Keys — Smart MIDI Track Selection & Playable Note Hygiene (Issue #76)
 *
 * Keeps direct multi-track GM MIDIs and YouTube/audio-to-MIDI transcriptions clean and learnable:
 * - Filters out DAW helper tracks ("Chords", "Markers", "Click", SFX) from Piano auto-selection.
 * - Detects when a GM MIDI only has a sparse late-song piano fill and elevates the primary vocal/lead melody.
 * - Snaps micro-jittered chord onsets (<= 26ms) and removes overtone ghosts / 5-note GM octave slams.
 */

function isUtilityTrack(track) {
  const name = (track.name || '').toLowerCase().trim();
  const inst = (track.instrumentName || track.instrument?.name || '').toLowerCase();
  if (/^(chords?|markers?|tempo|click|metronome|lyrics?|cue|count[\s-]?in|guide|setup|sysex)$/.test(name)) {
    return true;
  }
  if (/chord\s*(guide|track|analysis|chart|symbols?)|chord\s*progression/.test(name)) {
    return true;
  }
  if (/(reverse cymbal|gunshot|telephone|seashore|bird tweet|helicopter|applause|sound effect)/.test(inst)) {
    return true;
  }
  return false;
}

function isLeadMelodyTrack(track) {
  if (track.isPercussion || track.instrument?.percussion || track.channel === 9) return false;
  if (isUtilityTrack(track)) return false;
  const comb = `${track.name || ''} ${track.instrumentName || track.instrument?.name || ''} ${track.instrumentFamily || track.instrument?.family || ''}`.toLowerCase();
  const prog = track.programNumber ?? track.instrument?.number ?? -1;
  if (/(synth voice|choir|voice|vocal|melody|lead|oboe|flute|clarinet|sax|violin|trumpet)/.test(comb)) {
    return true;
  }
  if ((prog >= 80 && prog <= 87) || (prog >= 52 && prog <= 54) || (prog >= 64 && prog <= 75)) {
    return true;
  }
  return false;
}

function isPianoCandidateTrackSmart(track) {
  if (track.isPercussion || track.instrument?.percussion || track.channel === 9) return false;
  if (isUtilityTrack(track)) return false;

  const family = (track.instrumentFamily || track.instrument?.family || '').toLowerCase();
  const instName = (track.instrumentName || track.instrument?.name || '').toLowerCase();
  const trackName = (track.name || '').toLowerCase();
  const prog = track.programNumber ?? track.instrument?.number ?? -1;

  if (family === 'piano' || (prog >= 0 && prog <= 7)) return true;
  if (/piano|keys|keyboard|clav|harpsichord|\brh\b|\blh\b|right hand|left hand/.test(`${trackName} ${instName}`)) {
    return true;
  }
  return false;
}

function computeTrackCoverageScore(track, songDurationSec) {
  if (!track.notes || track.notes.length === 0) {
    return { minT: Infinity, maxT: -Infinity, spanRatio: 0, score: 0 };
  }
  let minT = Infinity;
  let maxT = -Infinity;
  for (const n of track.notes) {
    if (n.time < minT) minT = n.time;
    if (n.time > maxT) maxT = n.time;
  }
  const spanRatio = Math.min(1, Math.max(0, maxT - minT) / Math.max(1, songDurationSec || 1));
  return {
    minT,
    maxT,
    spanRatio,
    score: track.notes.length * (0.35 + 0.65 * spanRatio)
  };
}

/**
 * Select best RH (Track 1) and LH (Track 2) source tracks in `auto-piano` mode.
 * Returns `{ chosenPlayableIndices, track1Raw, track2Raw, selectionNote }`.
 */
function selectAutoPianoTracks(rawTracks, songDurationSec = 1) {
  const chosenPlayableIndices = new Set();
  if (!rawTracks || rawTracks.length === 0 || !rawTracks.some((t) => t?.notes && t.notes.length > 0)) {
    return { chosenPlayableIndices, track1Raw: [], track2Raw: [], selectionNote: null };
  }

  let pianoTracks = rawTracks
    .map((t, idx) => ({ t, idx, cov: computeTrackCoverageScore(t, songDurationSec) }))
    .filter((item) => item.t.notes && item.t.notes.length > 0 && isPianoCandidateTrackSmart(item.t) && !item.t.isPercussion && !item.t.isDuplicate);

  // Drop tiny fill-only piano tracks (< 35 notes & < 25% of song) when richer piano tracks exist
  const richPianoTracks = pianoTracks.filter(
    (item) => item.t.notes.length >= 35 || item.cov.spanRatio >= 0.35
  );
  if (richPianoTracks.length > 0 && richPianoTracks.length < pianoTracks.length) {
    pianoTracks = richPianoTracks;
  }

  let selectionNote = null;

  // Check if the only piano track is just a sparse late-song fill in a GM band MIDI
  // (e.g. Backstreet Boys piano starts 54s in with only 170 treble fill notes vs a 406-note Vocal Lead)
  if (pianoTracks.length === 1) {
    const onlyPiano = pianoTracks[0];
    const isSparseFill =
      onlyPiano.t.notes.length < 240 &&
      (onlyPiano.cov.minT > 20 || onlyPiano.cov.spanRatio < 0.72);
    if (isSparseFill) {
      const leadCands = rawTracks
        .map((t, idx) => ({ t, idx, cov: computeTrackCoverageScore(t, songDurationSec) }))
        .filter((item) => item.t.notes && item.t.notes.length >= 60 && isLeadMelodyTrack(item.t) && !item.t.isDuplicate)
        .sort((a, b) => b.cov.score - a.cov.score);
      if (leadCands.length > 0 && leadCands[0].cov.score > onlyPiano.cov.score * 1.25) {
        const lead = leadCands[0];
        chosenPlayableIndices.add(lead.idx);
        rawTracks.forEach((t, idx) => {
          if (t.isDuplicate && t.duplicateOfIndex === lead.idx) {
            chosenPlayableIndices.add(idx);
          }
        });

        // If the sparse piano track sits in Left-Hand register (< 62), use it on LH;
        // otherwise pick a clean warm bass/chord accompaniment track (avgPitch 40..62, moderate density)
        // so high-treble shimmer fills stay in Backing Band instead of landing on Left Hand Blue.
        let lhCandidate = null;
        if (onlyPiano.t.avgPitch < 62) {
          lhCandidate = onlyPiano;
        } else {
          const bassCompanion = rawTracks
            .map((t, idx) => ({ t, idx, cov: computeTrackCoverageScore(t, songDurationSec) }))
            .filter((item) => {
              if (item.idx === lead.idx || item.t.isPercussion || item.t.isDuplicate || isUtilityTrack(item.t)) return false;
              const n = item.t.notes ? item.t.notes.length : 0;
              return item.t.avgPitch >= 28 && item.t.avgPitch < 62 && n >= 20 && n <= 900;
            })
            .sort((a, b) => b.cov.spanRatio - a.cov.spanRatio || a.t.notes.length - b.t.notes.length);
          lhCandidate = bassCompanion[0] || null;
        }

        if (lhCandidate) {
          chosenPlayableIndices.add(lhCandidate.idx);
          rawTracks.forEach((t, idx) => {
            if (t.isDuplicate && t.duplicateOfIndex === lhCandidate.idx) {
              chosenPlayableIndices.add(idx);
            }
          });
          selectionNote = `Sparse piano elevated with "${lead.t.name}" + "${lhCandidate.t.name}"`;
          return {
            chosenPlayableIndices,
            track1Raw: lead.t.notes,
            track2Raw: lhCandidate.t.notes,
            selectionNote
          };
        }

        // Fall back to keeping both lead + sparse piano if no suitable lower accompaniment exists
        chosenPlayableIndices.add(onlyPiano.idx);
        rawTracks.forEach((t, idx) => {
          if (t.isDuplicate && t.duplicateOfIndex === onlyPiano.idx) {
            chosenPlayableIndices.add(idx);
          }
        });
        const leadHi = lead.t.avgPitch >= onlyPiano.t.avgPitch;
        const topChoice = leadHi ? lead : onlyPiano;
        const botChoice = leadHi ? onlyPiano : lead;
        selectionNote = `Sparse piano elevated with "${lead.t.name}"`;
        return {
          chosenPlayableIndices,
          track1Raw: topChoice.t.notes,
          track2Raw: botChoice.t.notes,
          selectionNote
        };
      }
    }
  }

  if (pianoTracks.length === 0) {
    // Fallback to melodic lead + non-utility pitched tracks
    const leadCands = rawTracks
      .map((t, idx) => ({ t, idx, cov: computeTrackCoverageScore(t, songDurationSec) }))
      .filter((item) => item.t.notes && item.t.notes.length > 0 && isLeadMelodyTrack(item.t) && !item.t.isDuplicate)
      .sort((a, b) => b.cov.score - a.cov.score);
    const nonUtil = rawTracks
      .map((t, idx) => ({ t, idx, cov: computeTrackCoverageScore(t, songDurationSec) }))
      .filter((item) => item.t.notes && item.t.notes.length > 0 && !item.t.isPercussion && !item.t.isDuplicate && !isUtilityTrack(item.t));

    if (leadCands.length > 0) {
      pianoTracks = [leadCands[0], ...nonUtil.filter((x) => x.idx !== leadCands[0].idx).slice(0, 1)];
      selectionNote = `No piano track found — using "${leadCands[0].t.name}"`;
    } else {
      pianoTracks = nonUtil;
    }
  }

  if (pianoTracks.length === 0) {
    const firstNonEmptyNonPercIdx = rawTracks.findIndex((t) => t.notes && t.notes.length > 0 && !t.isPercussion && !t.isDuplicate);
    const fallbackIdx = firstNonEmptyNonPercIdx >= 0
      ? firstNonEmptyNonPercIdx
      : rawTracks.findIndex((t) => t.notes && t.notes.length > 0);
    if (fallbackIdx < 0) {
      return { chosenPlayableIndices, track1Raw: [], track2Raw: [], selectionNote: null };
    }
    pianoTracks = [{ t: rawTracks[fallbackIdx], idx: fallbackIdx, cov: computeTrackCoverageScore(rawTracks[fallbackIdx], songDurationSec) }];
  }

  let track1Raw = [];
  let track2Raw = [];

  if (pianoTracks.length >= 2) {
    const explicitRh = pianoTracks.find((item) => /Right Hand \(Staff 1\)/i.test(item.t.name));
    const explicitLh = pianoTracks.find((item) => /Left Hand \(Staff 2\)/i.test(item.t.name));
    const trebleCandidates = pianoTracks
      .filter((item) => item.t.avgPitch >= 62)
      .sort((a, b) => b.t.notes.length - a.t.notes.length);
    const bassCandidates = pianoTracks
      .filter((item) => item.t.avgPitch < 62)
      .sort((a, b) => b.t.notes.length - a.t.notes.length);

    let rhChoice = null;
    let lhChoice = null;

    if (explicitRh && explicitLh) {
      rhChoice = explicitRh;
      lhChoice = explicitLh;
    } else if (trebleCandidates.length > 0 && bassCandidates.length > 0) {
      rhChoice = trebleCandidates[0];
      lhChoice = bassCandidates[0];
    } else {
      const topTwo = pianoTracks
        .slice()
        .sort((a, b) => b.t.notes.length - a.t.notes.length)
        .slice(0, 2)
        .sort((a, b) => b.t.avgPitch - a.t.avgPitch);
      rhChoice = topTwo[0];
      lhChoice = topTwo[1];
    }

    chosenPlayableIndices.add(rhChoice.idx);
    chosenPlayableIndices.add(lhChoice.idx);
    track1Raw = rhChoice.t.notes;
    track2Raw = lhChoice.t.notes;

    rawTracks.forEach((t, idx) => {
      if (t.isDuplicate && (t.duplicateOfIndex === rhChoice.idx || t.duplicateOfIndex === lhChoice.idx)) {
        chosenPlayableIndices.add(idx);
      }
    });
  } else {
    const singleIdx = pianoTracks[0].idx;
    chosenPlayableIndices.add(singleIdx);
    rawTracks.forEach((t, idx) => {
      if (t.isDuplicate && t.duplicateOfIndex === singleIdx) {
        chosenPlayableIndices.add(idx);
      }
    });
    for (const n of pianoTracks[0].t.notes) {
      // Split at Middle C (folded when processed)
      let p = n.originalMidi;
      while (p < 36) p += 12;
      while (p > 96) p -= 12;
      if (p >= 60) {
        track1Raw.push(n);
      } else {
        track2Raw.push(n);
      }
    }
  }

  return { chosenPlayableIndices, track1Raw, track2Raw, selectionNote };
}

/**
 * Clean unquantized chord jitter, tiny transient ghost notes, over-dense >4-note GM chord slabs,
 * and runaway pedal sustains for a single hand's note array.
 * Preserves authentic up-to-4-note piano triads & 7th chords. Non-destructive (clones note objects).
 */
function cleanPlayableHandNotes(noteArr, handTrack, { maxChordVoices = 4 } = {}) {
  if (!noteArr || noteArr.length === 0) {
    return { notes: [], snappedCount: 0, removedCount: 0, trimmedSustainCount: 0 };
  }

  const voiceCap = Math.max(1, Number(maxChordVoices) || 4);
  const sorted = noteArr
    .map((n) => ({ ...n }))
    .sort((a, b) => a.time - b.time || (a.midi ?? a.originalMidi) - (b.midi ?? b.originalMidi));

  let snappedCount = 0;
  let removedCount = 0;
  let trimmedSustainCount = 0;
  const cleaned = [];

  let i = 0;
  while (i < sorted.length) {
    const anchorTime = sorted[i].time;
    const group = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && (sorted[j].time - anchorTime) <= 0.026) {
      const nextNote = sorted[j];
      if (Math.abs(nextNote.time - anchorTime) > 0.002) {
        snappedCount += 1;
        nextNote.time = anchorTime;
      }
      group.push(nextNote);
      j += 1;
    }

    // Drop tiny sub-45ms transient ghost glitches (< 45ms and velocity < 45) when accompanied by a solid note in the cluster
    const hasSolidNote = group.some((g) => g.duration >= 0.12 && (g.velocity ?? 90) >= 60);
    const nonGhost = [];
    for (const g of group) {
      if (hasSolidNote && g.duration < 0.045 && (g.velocity ?? 90) < 45) {
        removedCount += 1;
      } else {
        nonGhost.push(g);
      }
    }

    // Thin over-dense GM slabs (> 4 notes per hand) while preserving top melody (RH) / root bass (LH)
    // and unique pitch classes first (dropping octave-doubles before harmonic intervals)
    if (nonGhost.length > voiceCap) {
      nonGhost.sort((a, b) => (a.midi ?? a.originalMidi) - (b.midi ?? b.originalMidi));
      const keep = [];
      if (handTrack === 1) {
        keep.push(nonGhost[nonGhost.length - 1]); // Top melody voice
      } else {
        keep.push(nonGhost[0]); // Root bass voice
      }
      const rest = nonGhost.filter((n) => n !== keep[0]);
      rest.sort((a, b) => {
        const aPitch = a.midi ?? a.originalMidi;
        const bPitch = b.midi ?? b.originalMidi;
        const aDup = keep.some((k) => ((k.midi ?? k.originalMidi) % 12) === (aPitch % 12)) ? 1 : 0;
        const bDup = keep.some((k) => ((k.midi ?? k.originalMidi) % 12) === (bPitch % 12)) ? 1 : 0;
        if (aDup !== bDup) return aDup - bDup;
        return (b.velocity ?? 90) - (a.velocity ?? 90);
      });
      for (const r of rest) {
        if (keep.length < voiceCap) {
          keep.push(r);
        } else {
          removedCount += 1;
        }
      }
      keep.sort((a, b) => (a.midi ?? a.originalMidi) - (b.midi ?? b.originalMidi));
      cleaned.push(...keep);
    } else {
      cleaned.push(...nonGhost);
    }

    i = j;
  }

  for (const n of cleaned) {
    if (n.duration > 6.0) {
      n.duration = 6.0;
      trimmedSustainCount += 1;
    }
  }

  return { notes: cleaned, snappedCount, removedCount, trimmedSustainCount };
}

/**
 * Issue #123: Build a playable two-hand piano arrangement from a full-mix polyphonic note list.
 * - Right Hand (`rhNotes`, MIDI >= 60): Extracts the primary lead/vocal melody contour (1 note per onset slice,
 *   smoothed for voice-leading proximity and trimmed so melody notes don't overlap muddily).
 * - Left Hand (`lhNotes`, MIDI < 60): Replaces raw low-frequency drum/guitar/bass clutter with clean 2-beat
 *   harmonic bass + fifth/third chord intervals derived from the active pitch-class histogram.
 */
function buildFullSongArrangement(rawNotes = [], bpm = 120) {
  if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
    return { rhNotes: [], lhNotes: [], allNotes: [] };
  }

  const normalized = rawNotes
    .map((n) => ({
      ...n,
      midi: Number(n.midi ?? n.originalMidi ?? 60),
      time: Number(n.time ?? n.start ?? 0),
      duration: Math.max(0.08, Number(n.duration ?? 0.25)),
      velocity: Math.max(40, Math.min(120, Number(n.velocity ?? 88)))
    }))
    .filter((n) => n.duration >= 0.095 && n.velocity >= 42)
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  if (normalized.length === 0) {
    return { rhNotes: [], lhNotes: [], allNotes: [] };
  }

  const beatSec = 60 / Math.max(45, Math.min(220, Number(bpm) || 120));
  const barWindowSec = Math.max(0.65, Math.min(2.4, beatSec * 2));

  // 1. Group into 65ms onset slices for Right-Hand melody extraction
  const slices = [];
  let curSlice = [];
  let curAnchor = null;
  for (const n of normalized) {
    if (curAnchor === null || (n.time - curAnchor) <= 0.065) {
      if (curAnchor === null) curAnchor = n.time;
      curSlice.push(n);
    } else {
      slices.push({ anchor: curAnchor, notes: curSlice });
      curSlice = [n];
      curAnchor = n.time;
    }
  }
  if (curSlice.length > 0) {
    slices.push({ anchor: curAnchor, notes: curSlice });
  }

  const rhNotes = [];
  let prevMelodyPitch = 67;

  for (const slice of slices) {
    const hasMidHigh = slice.notes.some((x) => x.midi >= 55);
    const cands = [];
    for (const n of slice.notes) {
      if (n.midi < 50 && hasMidHigh) continue;
      let foldedP = n.midi;
      while (foldedP < 60) foldedP += 12;
      while (foldedP > 84) foldedP -= 12;
      const proxBonus = Math.max(0, 14 - Math.abs(foldedP - prevMelodyPitch)) * 2.2;
      const regBonus = (n.midi >= 58 && n.midi <= 84) ? 18 : 0;
      const score = n.velocity * 1.1 + Math.min(0.8, n.duration) * 28 + proxBonus + regBonus + (n.midi * 0.35);
      cands.push({ score, foldedP, n });
    }
    if (cands.length === 0) continue;
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];

    if (rhNotes.length > 0 && (slice.anchor - rhNotes[rhNotes.length - 1].time) < 0.095) {
      const prev = rhNotes[rhNotes.length - 1];
      if (best.n.velocity > prev.velocity + 8) {
        prev.midi = best.foldedP;
        prev.originalMidi = best.foldedP;
        prev.duration = Number(Math.max(0.14, Math.min(1.8, best.n.duration)).toFixed(3));
        prev.velocity = Math.max(68, Math.min(118, best.n.velocity));
        prevMelodyPitch = best.foldedP;
      }
      continue;
    }

    if (rhNotes.length > 0) {
      const prev = rhNotes[rhNotes.length - 1];
      const maxPrevDur = Number(Math.max(0.09, slice.anchor - prev.time - 0.015).toFixed(3));
      if (prev.duration > maxPrevDur) {
        prev.duration = maxPrevDur;
      }
    }

    const startT = Number(slice.anchor.toFixed(3));
    rhNotes.push({
      ...best.n,
      midi: best.foldedP,
      originalMidi: best.foldedP,
      time: startT,
      start: startT,
      duration: Number(Math.max(0.14, Math.min(2.2, best.n.duration)).toFixed(3)),
      velocity: Math.max(70, Math.min(118, best.n.velocity)),
      handTrack: 1
    });
    prevMelodyPitch = best.foldedP;
  }

  // 2. Left-Hand harmonic root + fifth/third accompaniment per 2-beat window
  const minT = Math.min(...normalized.map((n) => n.time));
  const maxT = Math.max(...normalized.map((n) => n.time + n.duration));
  const lhNotes = [];

  for (let wStart = minT; wStart < maxT - 0.05; wStart = Number((wStart + barWindowSec).toFixed(3))) {
    const wEnd = wStart + barWindowSec;
    const winNotes = normalized.filter((n) => n.time < wEnd && (n.time + n.duration) > wStart);
    if (winNotes.length === 0) continue;

    const pcWeights = new Array(12).fill(0);
    const lowPcWeights = new Array(12).fill(0);
    const onsetsInWin = winNotes.filter((n) => n.time >= wStart - 0.04).map((n) => n.time);
    const anchorOnset = Number(Math.max(wStart, onsetsInWin.length > 0 ? Math.min(...onsetsInWin) : wStart).toFixed(3));

    for (const n of winNotes) {
      const pc = ((n.midi % 12) + 12) % 12;
      const overlap = Math.max(0.05, Math.min(wEnd, n.time + n.duration) - Math.max(wStart, n.time));
      const weight = overlap * (n.velocity / 90);
      pcWeights[pc] += weight;
      if (n.midi < 60) {
        lowPcWeights[pc] += weight * 1.8;
      }
    }

    let bestRootPc = 0;
    let bestScore = -1;
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const fifthPc = (rootPc + 7) % 12;
      const maj3Pc = (rootPc + 4) % 12;
      const min3Pc = (rootPc + 3) % 12;
      const score =
        lowPcWeights[rootPc] * 1.6 +
        pcWeights[rootPc] * 1.3 +
        pcWeights[fifthPc] * 0.85 +
        Math.max(pcWeights[maj3Pc], pcWeights[min3Pc]) * 0.75;
      if (score > bestScore) {
        bestScore = score;
        bestRootPc = rootPc;
      }
    }

    const rootMidi = 36 + bestRootPc;
    const fifthMidi = rootMidi + 7;
    const maj3Pc = (bestRootPc + 4) % 12;
    const min3Pc = (bestRootPc + 3) % 12;
    const thirdInterval = pcWeights[maj3Pc] >= pcWeights[min3Pc] ? 4 : 3;
    let upperLhMidi = fifthMidi < 59 ? fifthMidi : (rootMidi + thirdInterval);
    if (upperLhMidi >= 60) upperLhMidi -= 12;

    const chordDur = Number(Math.max(0.28, Math.min(barWindowSec * 0.88, maxT - anchorOnset)).toFixed(3));
    lhNotes.push({
      midi: rootMidi,
      originalMidi: rootMidi,
      time: anchorOnset,
      start: anchorOnset,
      duration: chordDur,
      velocity: 80,
      handTrack: 2
    });
    if (upperLhMidi !== rootMidi && upperLhMidi >= 36 && upperLhMidi < 60) {
      lhNotes.push({
        midi: upperLhMidi,
        originalMidi: upperLhMidi,
        time: anchorOnset,
        start: anchorOnset,
        duration: chordDur,
        velocity: 72,
        handTrack: 2
      });
    }
  }

  const allNotes = [...rhNotes, ...lhNotes].sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { rhNotes, lhNotes, allNotes };
}

module.exports = {
  isUtilityTrack,
  isLeadMelodyTrack,
  isPianoCandidateTrackSmart,
  selectAutoPianoTracks,
  cleanPlayableHandNotes,
  buildFullSongArrangement
};

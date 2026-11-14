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

module.exports = {
  isUtilityTrack,
  isLeadMelodyTrack,
  isPianoCandidateTrackSmart,
  selectAutoPianoTracks,
  cleanPlayableHandNotes
};

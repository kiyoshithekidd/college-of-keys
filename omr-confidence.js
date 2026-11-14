/**
 * College of Keys — Issue #78: OMR Confidence Analyzer & Review Overrides
 * Flags low-confidence / messy measures in OMR-generated MusicXML before import.
 */

const OMR_SHEET_EXT_REGEX = /\.(pdf|png|jpe?g|webp|bmp|tiff?)$/i;

function isOmrSheetFileName(fileName = '') {
  return OMR_SHEET_EXT_REGEX.test(String(fileName || '').trim());
}

/**
 * Analyze parsed MusicXML metadata + MIDI tracks to flag low-confidence OMR measures.
 */
function analyzeOmrConfidence(metadata = {}, midi = null, extraWarnings = []) {
  const warnings = Array.isArray(extraWarnings) ? [...extraWarnings] : [];
  const measures = Array.isArray(metadata?.measures) ? metadata.measures : [];
  const timeSigs = Array.isArray(metadata?.timeSignatures) ? metadata.timeSignatures : [];
  const keySigs = Array.isArray(metadata?.keySignatures) ? metadata.keySignatures : [];
  const tracks = Array.isArray(midi?.tracks) ? midi.tracks : [];
  const allNotes = tracks.flatMap((t) => Array.isArray(t?.notes) ? t.notes : []);

  const flaggedMap = new Map();
  const flagMeasure = (index, number, reason, severity = 'warn') => {
    if (!flaggedMap.has(index)) {
      flaggedMap.set(index, {
        measureIndex: index,
        number: number || index + 1,
        severity,
        reasons: []
      });
    }
    const entry = flaggedMap.get(index);
    if (!entry.reasons.includes(reason)) {
      entry.reasons.push(reason);
    }
    if (severity === 'low') {
      entry.severity = 'low';
    }
  };

  if (measures.length === 0 || allNotes.length === 0) {
    warnings.push('No playable measures or notes were recognized.');
    return {
      overallConfidence: 'low',
      totalMeasures: measures.length,
      flaggedCount: measures.length,
      flaggedMeasures: [],
      warnings
    };
  }

  // 1. Flag unexpected mid-score time-signature changes (common OMR barline/meter misread)
  if (timeSigs.length > 1) {
    for (let i = 1; i < timeSigs.length; i++) {
      const ts = timeSigs[i];
      const barIdx = measures.findIndex((m) => ts.ticks >= m.startTicks && ts.ticks < m.endTicks);
      if (barIdx > 0) {
        const label = Array.isArray(ts.timeSignature) ? ts.timeSignature.join('/') : '?';
        flagMeasure(barIdx, measures[barIdx].number, `Unexpected meter change to ${label}`, 'warn');
      }
    }
  }

  // 2. Flag unexpected mid-score key-signature changes
  if (keySigs.length > 1) {
    for (let i = 1; i < keySigs.length; i++) {
      const ks = keySigs[i];
      const barIdx = measures.findIndex((m) => ks.ticks >= m.startTicks && ks.ticks < m.endTicks);
      if (barIdx > 0) {
        flagMeasure(barIdx, measures[barIdx].number, `Key signature shift (${ks.key || '?'})`, 'warn');
      }
    }
  }

  // 3. Per-measure note density, tiny ghost glitches, pitch outliers, and empty-bar gaps
  const measureNoteCounts = measures.map((m) => {
    const startT = Number(m.startTime) || 0;
    const endT = Number(m.endTime) || startT + 2;
    return allNotes.filter((n) => n.time >= startT - 0.02 && n.time < endT - 0.02);
  });

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const mNotes = measureNoteCounts[i];

    if (mNotes.length === 0 && i > 0 && i < measures.length - 1) {
      const hasPrev = measureNoteCounts[i - 1].length > 0;
      const hasNext = measureNoteCounts[i + 1].length > 0;
      if (hasPrev && hasNext) {
        flagMeasure(i, m.number, 'Empty measure between active bars (possible missed notes)', 'warn');
      }
      continue;
    }

    if (mNotes.length > 24) {
      flagMeasure(i, m.number, `Very dense bar (${mNotes.length} notes — check rhythm/chords)`, 'low');
    }

    const tinyCount = mNotes.filter((n) => (Number(n.duration) || 0) < 0.035).length;
    if (mNotes.length >= 3 && tinyCount / mNotes.length > 0.35) {
      flagMeasure(i, m.number, 'Multiple tiny <35ms notes (possible stem/beam misread)', 'low');
    }

    const hasOutlierPitch = mNotes.some((n) => n.midi < 24 || n.midi > 105);
    if (hasOutlierPitch) {
      flagMeasure(i, m.number, 'Extreme ledger-line pitch outlier (<C1 or >A7)', 'warn');
    }
  }

  const flaggedMeasures = Array.from(flaggedMap.values()).sort((a, b) => a.measureIndex - b.measureIndex);
  const flaggedRatio = measures.length > 0 ? flaggedMeasures.length / measures.length : 1;
  const lowCount = flaggedMeasures.filter((m) => m.severity === 'low').length;

  let overallConfidence = 'high';
  if (lowCount >= 3 || flaggedRatio > 0.25) {
    overallConfidence = 'low';
  } else if (flaggedMeasures.length > 0 || warnings.length > 0) {
    overallConfidence = 'medium';
  }

  return {
    overallConfidence,
    totalMeasures: measures.length,
    flaggedCount: flaggedMeasures.length,
    flaggedMeasures,
    warnings
  };
}

/**
 * Apply user review overrides (Title, BPM) to MusicXML text before saving to Grimoire.
 */
function applyOmrOverridesToMusicXml(xmlText, { title = '', bpm = 0 } = {}) {
  let updated = String(xmlText || '');
  const cleanTitle = String(title || '').trim();
  if (cleanTitle) {
    const escaped = cleanTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (/<work-title>[\s\S]*?<\/work-title>/i.test(updated)) {
      updated = updated.replace(/<work-title>[\s\S]*?<\/work-title>/i, `<work-title>${escaped}</work-title>`);
    } else if (/<movement-title>[\s\S]*?<\/movement-title>/i.test(updated)) {
      updated = updated.replace(/<movement-title>[\s\S]*?<\/movement-title>/i, `<movement-title>${escaped}</movement-title>`);
    } else {
      updated = updated.replace(/(<score-partwise[^>]*>)/i, `$1\n  <work><work-title>${escaped}</work-title></work>`);
    }
  }

  const cleanBpm = Math.round(Number(bpm) || 0);
  if (cleanBpm >= 30 && cleanBpm <= 300) {
    if (/<sound\b[^>]*\btempo="[^"]*"/i.test(updated)) {
      updated = updated.replace(/(<sound\b[^>]*\btempo=")[^"]*(")/i, `$1${cleanBpm}$2`);
    } else {
      updated = updated.replace(/(<measure\b[^>]*>)/i, `$1\n      <direction placement="above"><sound tempo="${cleanBpm}"/></direction>`);
    }
  }

  return updated;
}

module.exports = {
  OMR_SHEET_EXT_REGEX,
  isOmrSheetFileName,
  analyzeOmrConfidence,
  applyOmrOverridesToMusicXml
};

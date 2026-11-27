'use strict';

/**
 * College of Keys — Issue #177: Automatic Loudness Normalization (EBU R128 / LUFS)
 * Computes non-destructive per-song gain offsets (-12 dB .. +6 dB) with a -1.0 dBTP
 * peak ceiling, preserving stem-to-stem balance and keeping muted (0) strictly 0.
 */

const LOUDNESS_NORM_ENABLED_STORAGE_KEY = 'collegeOfKeys.loudnessNormEnabled.v1';
const TARGET_LUFS = -14.0;
const MIN_LOUDNESS_GAIN_DB = -12.0;
const MAX_LOUDNESS_GAIN_DB = 6.0;
const TRUE_PEAK_CEILING_DB = -1.0;

function clampLoudnessGainDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(MIN_LOUDNESS_GAIN_DB, Math.min(MAX_LOUDNESS_GAIN_DB, n));
  return Math.round(clamped * 10) / 10;
}

function computeLoudnessGainDb(integratedLufs, truePeakDb = -1.0, targetLufs = TARGET_LUFS) {
  const lufs = Number(integratedLufs);
  if (!Number.isFinite(lufs) || lufs < -70 || lufs > 0) {
    return 0;
  }
  let desiredGain = Number(targetLufs) - lufs;
  const peak = Number(truePeakDb);
  if (Number.isFinite(peak)) {
    const maxSafeBoost = TRUE_PEAK_CEILING_DB - peak;
    if (desiredGain > maxSafeBoost) {
      desiredGain = maxSafeBoost;
    }
  }
  return clampLoudnessGainDb(desiredGain);
}

function applyLoudnessGainToVolume(baseLinearVol, loudnessGainDb = 0, enabled = true) {
  const base = Number(baseLinearVol);
  if (!Number.isFinite(base) || base <= 0.0001) {
    return 0;
  }
  if (!enabled) {
    return Math.max(0, Math.min(1, base));
  }
  const gainDb = clampLoudnessGainDb(loudnessGainDb);
  const mult = Math.pow(10, gainDb / 20);
  return Math.max(0, Math.min(1, base * mult));
}

function estimateIntegratedLufsFromPcm(samples) {
  if (!samples || samples.length === 0) return null;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Number(samples[i]) || 0;
    sumSq += v * v;
    const av = Math.abs(v);
    if (av > peak) peak = av;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  if (rms <= 1e-7) return null;
  const integratedLufs = -0.691 + 20 * Math.log10(rms);
  const truePeakDb = peak > 1e-7 ? 20 * Math.log10(peak) : -60;
  return {
    integratedLufs: Math.round(integratedLufs * 10) / 10,
    truePeakDb: Math.round(truePeakDb * 10) / 10
  };
}

const api = {
  LOUDNESS_NORM_ENABLED_STORAGE_KEY,
  TARGET_LUFS,
  MIN_LOUDNESS_GAIN_DB,
  MAX_LOUDNESS_GAIN_DB,
  TRUE_PEAK_CEILING_DB,
  clampLoudnessGainDb,
  computeLoudnessGainDb,
  applyLoudnessGainToVolume,
  estimateIntegratedLufsFromPcm
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeLoudnessNormalizer = api;
}

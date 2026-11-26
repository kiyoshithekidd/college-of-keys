/**
 * Issue #161: Apple Music Sing-Style Vocal & Harmony Control DSP
 *
 * Provides:
 * - Normalized per-song `vocalMix` state (`leadVolume: 0..1` defaulting to 0.25 Guide Vocal,
 *   `harmoniesEnabled: boolean` defaulting to true)
 * - Per-song `lyricsOffsetSec` clamping (`-30..+30s`)
 * - Gain calculation for both discrete AI-split stems (`vocals_lead` + `vocals_backing`)
 *   and real-time Web Audio Stereo Mid/Side Matrix processing on stereo `vocals.wav` stems.
 */

const DEFAULT_LEAD_VOCAL_VOLUME = 0.25;
const MIN_LYRICS_OFFSET_SEC = -30.0;
const MAX_LYRICS_OFFSET_SEC = 30.0;

function createDefaultVocalMix() {
  return {
    leadVolume: DEFAULT_LEAD_VOCAL_VOLUME,
    harmoniesEnabled: true
  };
}

function clampLeadVocalVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_LEAD_VOCAL_VOLUME;
  const clamped = Math.max(0, Math.min(1, num));
  return Math.round(clamped * 100) / 100;
}

function normalizeVocalMix(rawMix) {
  const defaults = createDefaultVocalMix();
  if (!rawMix || typeof rawMix !== 'object') return defaults;
  return {
    leadVolume: rawMix.leadVolume !== undefined
      ? clampLeadVocalVolume(rawMix.leadVolume)
      : defaults.leadVolume,
    harmoniesEnabled: typeof rawMix.harmoniesEnabled === 'boolean'
      ? rawMix.harmoniesEnabled
      : defaults.harmoniesEnabled
  };
}

function clampLyricsOffsetSec(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const clamped = Math.max(MIN_LYRICS_OFFSET_SEC, Math.min(MAX_LYRICS_OFFSET_SEC, num));
  return Math.round(clamped * 100) / 100;
}

/**
 * Compute output gains for both discrete lead/backing vocal stems and Stereo Mid/Side DSP.
 *
 * Math verification for Mid/Side reconstruction:
 *   Mid  = (L + R) * 0.5   (center-panned Lead Vocal)
 *   Side = (L - R) * 0.5   (stereo-panned Backing Harmonies)
 *   L_out = midGain * Mid + sideGain * Side
 *   R_out = midGain * Mid - sideGain * Side
 * When midGain === 1 && sideGain === 1: L_out === L, R_out === R (exact original stereo).
 * When midGain === 0.25 && sideGain === 1: Lead drops to 25% Guide Vocal, Harmonies remain 100%.
 * When midGain === 0 && sideGain === 0: Entire vocal track is silenced.
 */
function computeVocalMixMatrixGains({
  leadVolume = DEFAULT_LEAD_VOCAL_VOLUME,
  harmoniesEnabled = true,
  masterVolume = 1.0,
  backingBandEnabled = true,
  vocalStemAudible = true
} = {}) {
  if (!backingBandEnabled || !vocalStemAudible) {
    return {
      midGain: 0,
      sideGain: 0,
      discreteLeadGain: 0,
      discreteBackingGain: 0
    };
  }
  const master = Math.max(0, Math.min(1, Number.isFinite(Number(masterVolume)) ? Number(masterVolume) : 1));
  const lead = clampLeadVocalVolume(leadVolume);
  const harm = harmoniesEnabled ? 1.0 : 0.0;

  return {
    midGain: Math.round(lead * master * 10000) / 10000,
    sideGain: Math.round(harm * master * 10000) / 10000,
    discreteLeadGain: Math.round(lead * master * 10000) / 10000,
    discreteBackingGain: Math.round(harm * master * 10000) / 10000
  };
}

/**
 * Attach a real-time Web Audio Stereo Mid/Side matrix to an HTMLAudioElement (`vocals.wav`).
 * Note: An HTMLAudioElement can only be bound to one MediaElementAudioSourceNode per AudioContext,
 * so callers should reuse the returned controller for the lifetime of that element.
 */
function createMidSideVocalProcessor(audioContext, mediaElement) {
  if (!audioContext || !mediaElement || typeof audioContext.createMediaElementSource !== 'function') {
    return null;
  }
  try {
    const source = audioContext.createMediaElementSource(mediaElement);

    // Explicit 2-channel speakers upmix node ensures legacy 1-channel mono vocals.wav stems
    // become L=M, R=M (Side=0) rather than discrete ch0=M, ch1=0 before splitting.
    const stereoInput = audioContext.createGain();
    stereoInput.gain.value = 1.0;
    stereoInput.channelCount = 2;
    stereoInput.channelCountMode = 'explicit';
    stereoInput.channelInterpretation = 'speakers';

    const splitter = audioContext.createChannelSplitter(2);
    const merger = audioContext.createChannelMerger(2);

    // Mid = (L + R) * 0.5
    const midL = audioContext.createGain();
    const midR = audioContext.createGain();
    midL.gain.value = 0.5;
    midR.gain.value = 0.5;
    const midGainNode = audioContext.createGain();
    midGainNode.gain.value = 1.0;

    // Side = (L - R) * 0.5
    const sideL = audioContext.createGain();
    const sideR = audioContext.createGain();
    sideL.gain.value = 0.5;
    sideR.gain.value = -0.5;
    const sideGainNode = audioContext.createGain();
    sideGainNode.gain.value = 1.0;

    // Invert side for Right channel reconstruction: R_out = Mid - Side
    const sideInvR = audioContext.createGain();
    sideInvR.gain.value = -1.0;

    source.connect(stereoInput);
    stereoInput.connect(splitter);

    splitter.connect(midL, 0);
    splitter.connect(midR, 1);
    midL.connect(midGainNode);
    midR.connect(midGainNode);

    splitter.connect(sideL, 0);
    splitter.connect(sideR, 1);
    sideL.connect(sideGainNode);
    sideR.connect(sideGainNode);

    // L_out = Mid + Side
    midGainNode.connect(merger, 0, 0);
    sideGainNode.connect(merger, 0, 0);

    // R_out = Mid - Side
    midGainNode.connect(merger, 0, 1);
    sideGainNode.connect(sideInvR);
    sideInvR.connect(merger, 0, 1);

    merger.connect(audioContext.destination);

    const resumeIfNeeded = () => {
      try {
        if (audioContext.state === 'suspended' && typeof audioContext.resume === 'function') {
          const p = audioContext.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch {
        // Ignore AudioContext resume errors prior to user gesture
      }
    };

    return {
      resumeContext: resumeIfNeeded,
      updateGains(midGain, sideGain) {
        const now = audioContext.currentTime || 0;
        const mg = Math.max(0, Math.min(1.5, Number(midGain) || 0));
        const sg = Math.max(0, Math.min(1.5, Number(sideGain) || 0));
        if (mg > 0.001 || sg > 0.001) {
          resumeIfNeeded();
        }
        if (midGainNode.gain.setTargetAtTime) {
          midGainNode.gain.setTargetAtTime(mg, now, 0.015);
          sideGainNode.gain.setTargetAtTime(sg, now, 0.015);
        } else {
          midGainNode.gain.value = mg;
          sideGainNode.gain.value = sg;
        }
      },
      disconnect() {
        try {
          source.disconnect();
          stereoInput.disconnect();
          splitter.disconnect();
          midL.disconnect();
          midR.disconnect();
          midGainNode.disconnect();
          sideL.disconnect();
          sideR.disconnect();
          sideGainNode.disconnect();
          sideInvR.disconnect();
          merger.disconnect();
        } catch {
          // Ignore teardown errors
        }
      }
    };
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_LEAD_VOCAL_VOLUME,
  MIN_LYRICS_OFFSET_SEC,
  MAX_LYRICS_OFFSET_SEC,
  createDefaultVocalMix,
  clampLeadVocalVolume,
  normalizeVocalMix,
  clampLyricsOffsetSec,
  computeVocalMixMatrixGains,
  createMidSideVocalProcessor
};

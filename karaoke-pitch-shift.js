'use strict';

/**
 * College of Keys — Issue #174: Real-Time Karaoke Key / Pitch Shifting
 * Clamps shift to ±6 semitones and manages a shared Tone.PitchShift Web Audio bus
 * across backing audio and melodic stems (bypassing drums to preserve transient punch),
 * with clean disposal on song switch.
 */

const MIN_KEY_SHIFT_SEMITONES = -6;
const MAX_KEY_SHIFT_SEMITONES = 6;

function clampKaraokeKeyShift(semitones) {
  const n = Math.round(Number(semitones) || 0);
  return Math.max(MIN_KEY_SHIFT_SEMITONES, Math.min(MAX_KEY_SHIFT_SEMITONES, n));
}

function formatKeyShiftLabel(semitones) {
  const s = clampKaraokeKeyShift(semitones);
  if (s === 0) return '0 st (Orig)';
  return s > 0 ? `+${s} st` : `${s} st`;
}

function createKaraokePitchShiftBus({ Tone = null, audioContext = null } = {}) {
  let currentSemitones = 0;
  let pitchShiftNode = null;
  let disposed = false;

  // Map<HTMLMediaElement, { sourceNode: AudioNode, connectedTarget: AudioNode | null }>
  const attachedElements = new Map();

  function ensurePitchNode() {
    if (disposed || !Tone || typeof Tone.PitchShift !== 'function') return null;
    if (!pitchShiftNode) {
      pitchShiftNode = new Tone.PitchShift({
        pitch: currentSemitones,
        windowSize: 0.08,
        delayTime: 0,
        feedback: 0
      });
      if (typeof pitchShiftNode.toDestination === 'function') {
        pitchShiftNode.toDestination();
      }
    }
    return pitchShiftNode;
  }

  function routeEntry(entry) {
    if (!entry || !entry.sourceNode) return;
    try {
      entry.sourceNode.disconnect();
    } catch {
      // Ignore disconnect errors on unattached nodes
    }
    const ctx = audioContext || (Tone && Tone.context && Tone.context.rawContext);
    if (currentSemitones !== 0) {
      const node = ensurePitchNode();
      if (node && typeof Tone.connect === 'function') {
        try {
          Tone.connect(entry.sourceNode, node);
          entry.connectedTarget = node;
          return;
        } catch {
          // Fall through to direct destination if Tone.connect fails
        }
      }
    }
    if (ctx && ctx.destination) {
      try {
        entry.sourceNode.connect(ctx.destination);
        entry.connectedTarget = ctx.destination;
      } catch {
        // Ignore connection errors
      }
    }
  }

  function attachMediaElement(mediaEl, { customSourceNode = null } = {}) {
    if (disposed || !mediaEl) return false;
    const existing = attachedElements.get(mediaEl);
    if (existing) {
      if (customSourceNode && existing.sourceNode !== customSourceNode) {
        try {
          existing.sourceNode.disconnect();
        } catch {
          // ignore
        }
        existing.sourceNode = customSourceNode;
      }
      routeEntry(existing);
      return true;
    }

    const ctx = audioContext || (Tone && Tone.context && Tone.context.rawContext);
    if (!ctx) return false;

    let srcNode = customSourceNode;
    if (!srcNode) {
      if (typeof ctx.createMediaElementSource !== 'function') return false;
      try {
        srcNode = ctx.createMediaElementSource(mediaEl);
      } catch {
        // MediaElement already has an active MediaElementAudioSourceNode
        return false;
      }
    }

    const entry = { sourceNode: srcNode, connectedTarget: null };
    attachedElements.set(mediaEl, entry);
    routeEntry(entry);
    return true;
  }

  function setSemitones(semitones) {
    const next = clampKaraokeKeyShift(semitones);
    if (next === currentSemitones && (!pitchShiftNode || pitchShiftNode.pitch === next)) {
      return currentSemitones;
    }
    currentSemitones = next;
    if (pitchShiftNode) {
      pitchShiftNode.pitch = currentSemitones;
    }
    for (const entry of attachedElements.values()) {
      routeEntry(entry);
    }
    return currentSemitones;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of attachedElements.values()) {
      try {
        entry.sourceNode.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    attachedElements.clear();
    if (pitchShiftNode) {
      try {
        pitchShiftNode.dispose();
      } catch {
        // Ignore dispose errors
      }
      pitchShiftNode = null;
    }
  }

  return {
    getSemitones: () => currentSemitones,
    setSemitones,
    attachMediaElement,
    dispose
  };
}

const api = {
  MIN_KEY_SHIFT_SEMITONES,
  MAX_KEY_SHIFT_SEMITONES,
  clampKaraokeKeyShift,
  formatKeyShiftLabel,
  createKaraokePitchShiftBus
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeKaraokePitchShift = api;
}

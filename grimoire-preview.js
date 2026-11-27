'use strict';

/**
 * Issue #163: Grimoire Audio Preview — 30-Second Listen Before You Load
 * Pure helpers + isolated preview controller supporting Recording (backing audio)
 * and Piano MIDI excerpt playback without mutating highway state or awarding XP.
 */

const fs = require('fs');

const PREVIEW_DURATION_SEC = 30;
const PREVIEW_LOOKAHEAD_SEC = 0.14;
const PREVIEW_TICK_MS = 50;

function hasPreviewBackingAudio(entry, existsSyncFn = fs.existsSync) {
  if (!entry || typeof entry.backingAudioPath !== 'string' || !entry.backingAudioPath.trim()) {
    return false;
  }
  try {
    return Boolean(existsSyncFn(entry.backingAudioPath));
  } catch {
    return false;
  }
}

function getAvailablePreviewSources(entry, existsSyncFn = fs.existsSync) {
  const sources = [];
  if (hasPreviewBackingAudio(entry, existsSyncFn)) {
    sources.push('recording');
  }
  sources.push('midi');
  return sources;
}

/**
 * Extract and normalize the first `durationSec` seconds of playable MIDI notes.
 * Returns a fresh sorted array; never mutates input note objects.
 */
function slicePreviewNotes(notes, durationSec = PREVIEW_DURATION_SEC) {
  if (!Array.isArray(notes) || notes.length === 0) return [];
  const limit = Math.max(1, Number(durationSec) || PREVIEW_DURATION_SEC);
  const sliced = [];
  for (const n of notes) {
    if (!n || typeof n !== 'object') continue;
    const time = Number(n.time);
    if (!Number.isFinite(time) || time < 0 || time >= limit) continue;
    const name = n.foldedName || n.name;
    if (!name || typeof name !== 'string') continue;
    const rawDur = Number(n.duration);
    const maxDur = Math.max(0.08, Math.min(2.5, limit - time + 0.15));
    const duration = Number.isFinite(rawDur) && rawDur > 0
      ? Math.max(0.06, Math.min(rawDur, maxDur))
      : Math.min(0.35, maxDur);
    const rawVel = Number(n.velocity);
    const velocity = Number.isFinite(rawVel)
      ? Math.max(0.15, Math.min(0.9, rawVel))
      : 0.65;
    sliced.push({ time, duration, name, velocity });
  }
  sliced.sort((a, b) => a.time - b.time);
  return sliced;
}

function createGrimoirePreviewController({
  Tone = null,
  AudioCtor = typeof Audio !== 'undefined' ? Audio : null,
  pathToFileURL = null,
  getBackingVolume = () => 0.8,
  ensureAudioReady = async () => {},
  getPianoInstrument = () => null,
  extractNotesForEntry = async () => [],
  existsSyncFn = fs.existsSync,
  onStateChange = () => {},
  onError = () => {}
} = {}) {
  let requestSeq = 0;
  let activeEntryId = null;
  let activeSource = null;
  let isPlaying = false;
  let elapsedSec = 0;
  let targetDurationSec = PREVIEW_DURATION_SEC;

  let audioEl = null;
  let audioDisposed = false;
  let midiTimer = null;
  let progressTimer = null;
  let activeMidiInstrument = null;

  function getState() {
    const duration = Math.max(1, targetDurationSec);
    return {
      isPlaying,
      entryId: activeEntryId,
      source: activeSource,
      elapsedSec,
      durationSec: duration,
      progress: isPlaying ? Math.max(0, Math.min(1, elapsedSec / duration)) : 0
    };
  }

  function emitState() {
    try {
      onStateChange(getState());
    } catch {
      // Ignore UI listener errors
    }
  }

  function clearTimers() {
    if (midiTimer) {
      clearInterval(midiTimer);
      midiTimer = null;
    }
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function disposeAudioElement() {
    audioDisposed = true;
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
      } catch {
        // Ignore teardown errors
      }
      audioEl = null;
    }
  }

  function releaseMidiInstrument() {
    if (activeMidiInstrument && typeof activeMidiInstrument.releaseAll === 'function') {
      try {
        activeMidiInstrument.releaseAll();
      } catch {
        // Ignore synth release errors
      }
    }
    activeMidiInstrument = null;
  }

  function stopPreview({ silent = false } = {}) {
    requestSeq += 1;
    const wasActive = isPlaying || activeEntryId !== null || audioEl !== null || midiTimer !== null;
    clearTimers();
    disposeAudioElement();
    releaseMidiInstrument();
    activeEntryId = null;
    activeSource = null;
    isPlaying = false;
    elapsedSec = 0;
    targetDurationSec = PREVIEW_DURATION_SEC;
    if (wasActive && !silent) {
      emitState();
    }
  }

  async function startRecordingPreview(entry, mySeq) {
    if (!hasPreviewBackingAudio(entry, existsSyncFn)) {
      onError('No backing audio file available for this spell.');
      return false;
    }
    if (!AudioCtor || !pathToFileURL) {
      onError('Audio playback is unavailable in this environment.');
      return false;
    }

    const startOffset = Math.max(0, Number(entry.audioOffsetSec) || 0);
    let effectiveOffset = startOffset;
    const rawUrl = pathToFileURL(entry.backingAudioPath);
    const audioSrc = typeof rawUrl === 'string' ? rawUrl : (rawUrl && rawUrl.href ? rawUrl.href : String(rawUrl));
    const el = new AudioCtor(audioSrc);
    el.preload = 'auto';
    const rawVol = Number(getBackingVolume());
    el.volume = Math.max(0, Math.min(1, Number.isFinite(rawVol) ? rawVol : 0.8));

    audioEl = el;
    audioDisposed = false;
    activeEntryId = entry.id;
    activeSource = 'recording';
    isPlaying = true;
    elapsedSec = 0;
    targetDurationSec = PREVIEW_DURATION_SEC;
    emitState();

    const seekAndPlay = async () => {
      if (mySeq !== requestSeq || audioDisposed || audioEl !== el) return;
      try {
        if (Number.isFinite(el.duration) && el.duration > 0) {
          if (startOffset > 0 && startOffset < el.duration) {
            effectiveOffset = startOffset;
            el.currentTime = effectiveOffset;
          } else {
            effectiveOffset = 0;
          }
        }
        const remaining = Number.isFinite(el.duration) && el.duration > 0
          ? Math.max(1, el.duration - effectiveOffset)
          : PREVIEW_DURATION_SEC;
        targetDurationSec = Math.min(PREVIEW_DURATION_SEC, remaining);
        await el.play();
      } catch (err) {
        if (mySeq !== requestSeq || audioDisposed) return;
        stopPreview();
        onError(`Could not play recording preview: ${err?.message || err}`);
      }
    };

    el.addEventListener('ended', () => {
      if (mySeq !== requestSeq || audioDisposed) return;
      stopPreview();
    });

    el.addEventListener('error', () => {
      if (mySeq !== requestSeq || audioDisposed) return;
      stopPreview();
      onError('Could not play recording preview audio.');
    });

    if (el.readyState >= 1) {
      await seekAndPlay();
    } else {
      el.addEventListener('loadedmetadata', () => {
        void seekAndPlay();
      }, { once: true });
      try {
        el.load();
      } catch {
        // Ignore
      }
    }

    if (mySeq !== requestSeq || audioDisposed) return false;

    progressTimer = setInterval(() => {
      if (mySeq !== requestSeq || audioDisposed || !audioEl) {
        clearTimers();
        return;
      }
      const cur = Math.max(0, (Number(audioEl.currentTime) || 0) - effectiveOffset);
      elapsedSec = cur;
      if (cur >= targetDurationSec) {
        stopPreview();
        return;
      }
      emitState();
    }, 100);

    return true;
  }

  async function startMidiPreview(entry, mySeq) {
    try {
      await ensureAudioReady();
      if (mySeq !== requestSeq) return false;

      const rawNotes = await extractNotesForEntry(entry);
      if (mySeq !== requestSeq) return false;

      const notes = slicePreviewNotes(rawNotes, PREVIEW_DURATION_SEC);
      if (notes.length === 0) {
        onError('This spell has no playable piano notes to preview.');
        return false;
      }

      const inst = getPianoInstrument();
      if (!inst || typeof inst.triggerAttackRelease !== 'function') {
        onError('Piano synth is not ready yet.');
        return false;
      }

      const lastEnd = notes.reduce((mx, n) => Math.max(mx, n.time + n.duration), 1);
      targetDurationSec = Math.min(PREVIEW_DURATION_SEC, Math.max(1, lastEnd + 0.25));
      activeMidiInstrument = inst;
      activeEntryId = entry.id;
      activeSource = 'midi';
      isPlaying = true;
      elapsedSec = 0;
      emitState();

      const startWallMs = Date.now();
      let cursor = 0;

      const tick = () => {
        if (mySeq !== requestSeq || !isPlaying) {
          clearTimers();
          return;
        }
        const nowSec = (Date.now() - startWallMs) / 1000;
        elapsedSec = Math.min(targetDurationSec, nowSec);
        const horizonSec = nowSec + PREVIEW_LOOKAHEAD_SEC;
        const toneNow = Tone && typeof Tone.now === 'function' ? Tone.now() : 0;

        while (cursor < notes.length && notes[cursor].time <= horizonSec) {
          const n = notes[cursor];
          cursor += 1;
          const delaySec = Math.max(0, n.time - nowSec);
          try {
            inst.triggerAttackRelease(n.name, n.duration, toneNow + delaySec, n.velocity);
          } catch {
            // Ignore individual voice errors
          }
        }

        if (nowSec >= targetDurationSec) {
          stopPreview();
          return;
        }
        emitState();
      };

      tick();
      midiTimer = setInterval(tick, PREVIEW_TICK_MS);
      return true;
    } catch (err) {
      if (mySeq !== requestSeq) return false;
      stopPreview();
      onError(`Could not preview piano MIDI: ${err?.message || err}`);
      return false;
    }
  }

  async function startPreview(entry, source) {
    if (!entry || !entry.id) return false;
    const chosenSource = source === 'recording' ? 'recording' : 'midi';
    const wasActive = isPlaying || activeEntryId !== null;
    stopPreview({ silent: true });
    const mySeq = ++requestSeq;
    const started = chosenSource === 'recording'
      ? await startRecordingPreview(entry, mySeq)
      : await startMidiPreview(entry, mySeq);
    if (!started && wasActive && mySeq === requestSeq) {
      emitState();
    }
    return started;
  }

  return {
    startPreview,
    stopPreview,
    getState,
    isPreviewingEntry: (entryId) => isPlaying && activeEntryId === entryId
  };
}

const GrimoirePreview = {
  PREVIEW_DURATION_SEC,
  PREVIEW_LOOKAHEAD_SEC,
  PREVIEW_TICK_MS,
  hasPreviewBackingAudio,
  getAvailablePreviewSources,
  slicePreviewNotes,
  createGrimoirePreviewController
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GrimoirePreview;
}
if (typeof window !== 'undefined') {
  window.GrimoirePreview = GrimoirePreview;
}

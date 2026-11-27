'use strict';

/**
 * College of Keys — Issue #180: Web MIDI Output Pass-Through to Hardware Digital Piano
 * Pure, testable controller for enumerating MIDI outputs, formatting Note On/Off & CC 64
 * Sustain messages, muting the local software synth when desired, and guaranteeing
 * All Notes Off (CC 123 / CC 120 / CC 64) on stop, seek, song switch, or unload.
 */

const MIDI_OUTPUT_DEVICE_STORAGE_KEY = 'collegeOfKeys.midiOutputDeviceId.v1';
const MIDI_OUTPUT_CHANNEL_STORAGE_KEY = 'collegeOfKeys.midiOutputChannel.v1';
const MIDI_OUTPUT_MUTE_LOCAL_STORAGE_KEY = 'collegeOfKeys.midiOutputMuteLocal.v1';

function clampMidiByte(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(127, Math.round(n)));
}

function normalizeMidiChannel(channel) {
  const n = Number(channel);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(15, Math.floor(n)));
}

function normalizeMidiVelocity(velocity = 100) {
  const n = Number(velocity);
  if (!Number.isFinite(n)) return 100;
  if (n > 0 && n <= 1) {
    return Math.max(1, Math.min(127, Math.round(n * 127)));
  }
  return Math.max(0, Math.min(127, Math.round(n)));
}

function enumerateMidiOutputs(midiAccess) {
  if (!midiAccess || !midiAccess.outputs || typeof midiAccess.outputs.values !== 'function') {
    return [];
  }
  const list = [];
  for (const output of midiAccess.outputs.values()) {
    if (!output) continue;
    if (output.state === 'disconnected') continue;
    list.push({
      id: String(output.id || ''),
      name: output.name || output.manufacturer || 'MIDI Output Port',
      manufacturer: output.manufacturer || '',
      state: output.state || 'connected',
      port: output
    });
  }
  return list;
}

function shouldMuteLocalPianoSynth(config, hasActiveOutput) {
  if (!hasActiveOutput) return false;
  if (!config || typeof config !== 'object') return true;
  return config.muteLocalSynth !== false;
}

function createMidiOutputController({
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id)
} = {}) {
  let selectedOutputId = 'none';
  let activeOutput = null;
  let channel = 0;
  let muteLocalSynth = true;
  let sustainDown = false;

  // Map<midiNote, { count: number, timers: Set<any> }>
  const activeNotes = new Map();

  function safeSend(output, bytes) {
    if (!output || typeof output.send !== 'function') return false;
    if (output.state === 'disconnected') return false;
    try {
      output.send(bytes);
      return true;
    } catch {
      return false;
    }
  }

  function clearTimersForEntry(entry) {
    if (!entry || !entry.timers) return;
    for (const timerId of entry.timers) {
      clearTimer(timerId);
    }
    entry.timers.clear();
  }

  function sendNoteOn(midi, velocity = 100, targetChannel = channel) {
    const note = clampMidiByte(midi, -1);
    if (note < 0 || !activeOutput) return false;
    const ch = normalizeMidiChannel(targetChannel);
    const vel = Math.max(1, normalizeMidiVelocity(velocity));
    const sent = safeSend(activeOutput, [0x90 | ch, note, vel]);
    if (sent) {
      let entry = activeNotes.get(note);
      if (!entry) {
        entry = { count: 0, timers: new Set() };
        activeNotes.set(note, entry);
      }
      entry.count += 1;
    }
    return sent;
  }

  function sendNoteOff(midi, targetChannel = channel) {
    const note = clampMidiByte(midi, -1);
    if (note < 0) return false;
    const ch = normalizeMidiChannel(targetChannel);
    const entry = activeNotes.get(note);
    if (entry) {
      entry.count = Math.max(0, entry.count - 1);
      if (entry.count === 0) {
        clearTimersForEntry(entry);
        activeNotes.delete(note);
      }
    }
    if (!activeOutput) return false;
    return safeSend(activeOutput, [0x80 | ch, note, 0]);
  }

  function sendNoteWithDuration(midi, durationSec = 0.25, velocity = 100, targetChannel = channel) {
    const note = clampMidiByte(midi, -1);
    if (note < 0 || !activeOutput) return false;
    const ch = normalizeMidiChannel(targetChannel);
    const ok = sendNoteOn(note, velocity, ch);
    if (!ok) return false;

    const durationMs = Math.max(40, Math.round((Number(durationSec) || 0.25) * 1000));
    const entry = activeNotes.get(note);
    const timerId = setTimer(() => {
      if (entry && entry.timers) {
        entry.timers.delete(timerId);
      }
      sendNoteOff(note, ch);
    }, durationMs);

    if (entry && entry.timers) {
      entry.timers.add(timerId);
    }
    return true;
  }

  function sendSustainPedal(isDown, targetChannel = channel) {
    sustainDown = Boolean(isDown);
    if (!activeOutput) return false;
    const ch = normalizeMidiChannel(targetChannel);
    return safeSend(activeOutput, [0xb0 | ch, 64, sustainDown ? 127 : 0]);
  }

  function sendAllNotesOff(targetOutput = activeOutput, targetChannel = channel) {
    const ch = normalizeMidiChannel(targetChannel);
    for (const [note, entry] of activeNotes.entries()) {
      clearTimersForEntry(entry);
      if (targetOutput) {
        safeSend(targetOutput, [0x80 | ch, note, 0]);
      }
    }
    activeNotes.clear();
    sustainDown = false;

    if (!targetOutput) return false;
    const s1 = safeSend(targetOutput, [0xb0 | ch, 64, 0]);
    const s2 = safeSend(targetOutput, [0xb0 | ch, 123, 0]);
    const s3 = safeSend(targetOutput, [0xb0 | ch, 120, 0]);
    return s1 || s2 || s3;
  }

  function setOutputPort(port, outputId = null) {
    const nextId = outputId !== null ? String(outputId) : (port && port.id ? String(port.id) : 'none');
    if (activeOutput && activeOutput !== port) {
      sendAllNotesOff(activeOutput, channel);
    }
    activeOutput = port || null;
    selectedOutputId = activeOutput ? nextId : 'none';
    return getStatus();
  }

  function setChannel(nextChannel) {
    const normalized = normalizeMidiChannel(nextChannel);
    if (normalized !== channel && activeOutput) {
      sendAllNotesOff(activeOutput, channel);
    }
    channel = normalized;
    return channel;
  }

  function setMuteLocalSynth(shouldMute) {
    muteLocalSynth = Boolean(shouldMute);
    return muteLocalSynth;
  }

  function isOutputActive() {
    return Boolean(activeOutput && activeOutput.state !== 'disconnected');
  }

  function shouldMuteLocal() {
    return shouldMuteLocalPianoSynth({ muteLocalSynth }, isOutputActive());
  }

  function getStatus() {
    return {
      active: isOutputActive(),
      outputId: selectedOutputId,
      outputName: activeOutput ? (activeOutput.name || 'MIDI Output') : 'Internal Synth (Default)',
      channel,
      muteLocalSynth,
      sustainDown,
      activeNoteCount: activeNotes.size
    };
  }

  return {
    setOutputPort,
    setChannel,
    setMuteLocalSynth,
    sendNoteOn,
    sendNoteOff,
    sendNoteWithDuration,
    sendSustainPedal,
    sendAllNotesOff,
    isOutputActive,
    shouldMuteLocal,
    getStatus
  };
}

const api = {
  MIDI_OUTPUT_DEVICE_STORAGE_KEY,
  MIDI_OUTPUT_CHANNEL_STORAGE_KEY,
  MIDI_OUTPUT_MUTE_LOCAL_STORAGE_KEY,
  clampMidiByte,
  normalizeMidiChannel,
  normalizeMidiVelocity,
  enumerateMidiOutputs,
  shouldMuteLocalPianoSynth,
  createMidiOutputController
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeMidiOutput = api;
}

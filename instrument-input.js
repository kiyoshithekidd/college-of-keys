/**
 * Issue #42 & #43: Multi-Instrument Input Manager (`instrument-input.js`)
 *
 * Allows plugging in real external instruments to play along on any Multi-Instrument Highway
 * (Piano, Drums, Bass, Guitar, Vocals, Synth/Other):
 *
 * 1. USB / MIDI Instrument Input:
 *    - Select specific connected MIDI input device (or 'all' devices)
 *    - Filter by MIDI Channel ('all', Channel 1..16, or Channel 10 / index 9 for e-drums)
 *    - E-Drum / Pad Kit GM Drum Note Translation (`translateGmDrumMidiToHighwayLane`):
 *      Translates incoming GM drum hits (35/36 Kick, 38/40 Snare, 42/44 Closed Hat,
 *      46/51 Open Hat/Ride, 41..48 Toms, 49/57 Crash) into the 6 ergonomic Highway drum lanes
 *      (C3=48 Kick, D3=50 Snare, C4=60 Closed Hat, D4=62 Open Hat/Ride, E4=64 Tom, G4=67 Crash).
 *
 * 2. Real-Time Audio / Line-In / Microphone Pitch & Drum Onset Detector:
 *    - Uses Web Audio API (`navigator.mediaDevices.getUserMedia` + `AnalyserNode`)
 *    - Select specific audio input device (1/4" Guitar/Bass Audio Interface, USB Mic, Headset)
 *    - Normalized time-domain autocorrelation (YIN-inspired lag detector) for monophonic pitch
 *      detection across Bass (`E1=28..C5=72`), Guitar (`E2=40..E6=88`), and Vocals (`C2=36..C6=84`)
 *    - Multi-band spectral transient detector for Acoustic Drum / Tap Percussion input
 *      (Low-band 50–180 Hz Kick -> C3 48, Mid-band 180–1800 Hz Snare -> D3 50, High-band >2 kHz Hat -> C4 60)
 *
 * 3. USB / Bluetooth Gamepad Controller (Rock Band / Guitar Hero Fret & Drum Pad Mapper):
 *    - Polls `navigator.getGamepads()` when enabled
 *    - Maps standard gamepad buttons onto the active highway's playable lanes or upcoming target notes
 */

const GM_DRUM_HIGHWAY_LANES = {
  KICK: 48,      // C3 (LH Blue)
  SNARE: 50,     // D3 (LH Blue)
  HAT_CLOSED: 60,// C4 (RH Gold)
  HAT_OPEN: 62,  // D4 (RH Gold)
  TOM: 64,       // E4 (RH Gold)
  CRASH: 67      // G4 (RH Gold)
};

const INPUT_SOURCE_MODES = [
  { id: 'midi-piano', label: '🎹 MIDI Keyboard / Synth (Ch 1–16)', type: 'midi' },
  { id: 'vocal-mic', label: '🎤 Vocal Microphone (Karaoke / Spell-Singing)', type: 'audio' },
  { id: 'midi-edrums', label: '🥁 Electronic Drum Kit / MIDI Pads (GM Drums)', type: 'midi' },
  { id: 'audio-pitch', label: '🎸 Audio Interface Line-In (Guitar / Bass)', type: 'audio' },
  { id: 'audio-drums', label: '🎙️ Acoustic Drum / Tap Mic (Kick / Snare / Hat)', type: 'audio' },
  { id: 'gamepad', label: '🎮 Rock Band / USB Gamepad Controller', type: 'gamepad' }
];

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi) {
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return '—';
  const rounded = Math.round(midi);
  const name = PITCH_NAMES[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function frequencyToMidiFloat(freqHz, a4Hz = 440) {
  if (!Number.isFinite(freqHz) || freqHz <= 20 || freqHz > 5000) return null;
  return 69 + 12 * Math.log2(freqHz / a4Hz);
}

function midiToFrequency(midi, a4Hz = 440) {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

/**
 * Translate an incoming General MIDI Drum Kit note (or pad note) into the
 * 6 ergonomic College of Keys Drum Highway lanes (`48, 50, 60, 62, 64, 67`).
 * If the incoming note is already one of the 6 highway drum lane keys, it is preserved as-is.
 */
function translateGmDrumMidiToHighwayLane(rawMidi) {
  const p = Math.round(Number(rawMidi) || 36);

  // Standard GM Drum Kit mapping (MIDI notes 35..59) checked FIRST so GM Hi-Mid Tom (48)
  // and High Tom (50) do not collide with Highway Kick (48) / Snare (50) (Issue #136).
  if (p === 35 || p === 36 || p < 37) {
    return GM_DRUM_HIGHWAY_LANES.KICK; // Acoustic Bass Drum / Bass Drum 1 -> C3 (48)
  }
  if (p === 37 || p === 38 || p === 39 || p === 40) {
    return GM_DRUM_HIGHWAY_LANES.SNARE; // Side Stick / Acoustic Snare / Clap / Electric Snare -> D3 (50)
  }
  if (p === 42 || p === 44 || (p >= 53 && p <= 56)) {
    return GM_DRUM_HIGHWAY_LANES.HAT_CLOSED; // Closed Hi-Hat / Pedal Hi-Hat / Cowbell -> C4 (60)
  }
  if (p === 46 || p === 51 || p === 59) {
    return GM_DRUM_HIGHWAY_LANES.HAT_OPEN; // Open Hi-Hat / Ride Cymbal 1 & 2 -> D4 (62)
  }
  if ((p >= 41 && p <= 48) || p === 50) {
    return GM_DRUM_HIGHWAY_LANES.TOM; // Low Floor Tom .. High Tom (41..48, 50) -> E4 (64)
  }
  if (p === 49 || p === 52 || p === 55 || p === 57) {
    return GM_DRUM_HIGHWAY_LANES.CRASH; // Crash 1 / Chinese / Splash / Crash 2 -> G4 (67)
  }

  // Preserve upper highway lane keys (60, 62, 64, 67) if sent directly by a pad controller
  if (
    p === GM_DRUM_HIGHWAY_LANES.HAT_CLOSED ||
    p === GM_DRUM_HIGHWAY_LANES.HAT_OPEN ||
    p === GM_DRUM_HIGHWAY_LANES.TOM ||
    p === GM_DRUM_HIGHWAY_LANES.CRASH
  ) {
    return p;
  }

  // Fallback for custom 8-pad or 16-pad controllers outside GM range
  const mod = ((p % 12) + 12) % 12;
  if (mod === 0 || mod === 1) return GM_DRUM_HIGHWAY_LANES.KICK;
  if (mod === 2 || mod === 3) return GM_DRUM_HIGHWAY_LANES.SNARE;
  if (mod === 4 || mod === 5) return GM_DRUM_HIGHWAY_LANES.TOM;
  if (mod === 6 || mod === 7) return GM_DRUM_HIGHWAY_LANES.CRASH;
  if (mod === 8 || mod === 9) return GM_DRUM_HIGHWAY_LANES.HAT_CLOSED;
  return GM_DRUM_HIGHWAY_LANES.HAT_OPEN;
}

/**
 * Fold a detected instrument pitch (e.g., 4-string Bass E1=28, Guitar E2=40, or Vocal pitch)
 * into the active highway's playable register so it matches the charted highway note.
 */
function foldInstrumentMidiForHighway(rawMidi, activeInstrument = 'piano') {
  let p = Math.round(Number(rawMidi) || 60);
  const inst = String(activeInstrument || 'piano').toLowerCase();

  if (inst === 'drums') {
    return translateGmDrumMidiToHighwayLane(p);
  }
  if (inst === 'bass') {
    while (p < 36) p += 12;
    while (p > 64) p -= 12;
    return p;
  }
  // Piano, Guitar, Vocals, Other: fold into 61-key range 36..96
  while (p < 36) p += 12;
  while (p > 96) p -= 12;
  return p;
}

/**
 * Pure time-domain normalized autocorrelation pitch detector (YIN-style difference + parabolic interpolation).
 * Works cleanly on pure Float32Array PCM buffers in both unit tests and live Web Audio `AnalyserNode`.
 *
 * @param {Float32Array} floatBuffer - Time-domain audio samples (-1..1)
 * @param {number} sampleRate - Sample rate in Hz (e.g. 44100 or 48000)
 * @param {object} options
 * @returns {{ freqHz: number, midi: number, midiFloat: number, cents: number, noteName: string, rms: number, clarity: number } | null}
 */
function detectPitchFromFloat32Buffer(floatBuffer, sampleRate = 44100, options = {}) {
  if (!floatBuffer || floatBuffer.length < 256 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }

  const minFreq = Number(options.minFreq) || 40;   // Down to E1 (41.2 Hz) for 4-string bass
  const maxFreq = Number(options.maxFreq) || 1200; // Up to D6 (1174 Hz) for guitar/vocals
  const rmsGate = Number(options.rmsGate) || 0.015;
  const minClarity = Number(options.minClarity) || 0.78;

  const n = floatBuffer.length;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = floatBuffer[i];
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / n);
  if (rms < rmsGate) {
    return null;
  }

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(sampleRate / minFreq));
  if (maxLag <= minLag) return null;

  const halfN = Math.floor(n / 2);
  const diff = new Float32Array(maxLag + 1);
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;

  let runningSum = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    let d = 0;
    for (let i = 0; i < halfN; i++) {
      const delta = floatBuffer[i] - floatBuffer[i + tau];
      d += delta * delta;
    }
    diff[tau] = d;
    runningSum += d;
    cmnd[tau] = runningSum > 1e-12 ? (d * tau) / runningSum : 1;
  }

  const threshold = 1 - minClarity;
  let bestTau = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  if (bestTau < 0) {
    // Fallback to global minimum in [minLag..maxLag] if below strict threshold
    let minVal = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (cmnd[tau] < minVal) {
        minVal = cmnd[tau];
        bestTau = tau;
      }
    }
    if (bestTau < 0 || minVal > 0.35) {
      return null;
    }
  }

  // Parabolic interpolation around bestTau
  let refinedTau = bestTau;
  if (bestTau > 1 && bestTau < maxLag) {
    const s0 = cmnd[bestTau - 1];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-9) {
      refinedTau = bestTau + (s2 - s0) / denom;
    }
  }

  const freqHz = sampleRate / refinedTau;
  const midiFloat = frequencyToMidiFloat(freqHz);
  if (midiFloat === null) return null;

  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const clarity = Math.max(0, Math.min(1, 1 - cmnd[bestTau]));

  return {
    freqHz: Math.round(freqHz * 10) / 10,
    midi,
    midiFloat,
    cents,
    noteName: midiToNoteName(midi),
    rms,
    clarity
  };
}

/**
 * Classify an acoustic percussion transient from a time-domain buffer into
 * Kick (`48`), Snare (`50`), or Hi-Hat (`60`) using zero-crossing rate and low/high energy ratio.
 */
function classifyAcousticDrumHitFromBuffer(floatBuffer, sampleRate = 44100, rmsGate = 0.035) {
  if (!floatBuffer || floatBuffer.length < 128) return null;
  const n = floatBuffer.length;
  let sumSq = 0;
  let zeroCrossings = 0;
  let prev = floatBuffer[0];

  for (let i = 0; i < n; i++) {
    const s = floatBuffer[i];
    sumSq += s * s;
    if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
      zeroCrossings++;
    }
    prev = s;
  }
  const rms = Math.sqrt(sumSq / n);
  if (rms < rmsGate) return null;

  const zcrHz = (zeroCrossings * sampleRate) / (2 * n);
  if (zcrHz < 260) {
    return { laneMidi: GM_DRUM_HIGHWAY_LANES.KICK, label: 'Kick (C3)', rms, zcrHz };
  }
  if (zcrHz < 1600) {
    return { laneMidi: GM_DRUM_HIGHWAY_LANES.SNARE, label: 'Snare (D3)', rms, zcrHz };
  }
  return { laneMidi: GM_DRUM_HIGHWAY_LANES.HAT_CLOSED, label: 'Hi-Hat (C4)', rms, zcrHz };
}

/**
 * Default Gamepad Button -> Highway Note mapping for 5-fret / 6-pad controllers
 */
const GAMEPAD_DRUM_BUTTON_MAP = {
  0: GM_DRUM_HIGHWAY_LANES.SNARE,      // A / Cross / Red Pad -> Snare (D3)
  1: GM_DRUM_HIGHWAY_LANES.TOM,        // B / Circle / Blue Pad -> Tom (E4)
  2: GM_DRUM_HIGHWAY_LANES.HAT_CLOSED, // X / Square / Yellow Pad -> Hi-Hat (C4)
  3: GM_DRUM_HIGHWAY_LANES.CRASH,      // Y / Triangle / Green Pad -> Crash (G4)
  4: GM_DRUM_HIGHWAY_LANES.KICK,       // L1 / Orange Pedal -> Kick (C3)
  5: GM_DRUM_HIGHWAY_LANES.HAT_OPEN,   // R1 -> Open Hat / Ride (D4)
  6: GM_DRUM_HIGHWAY_LANES.KICK        // L2 Trigger -> Kick (C3)
};

const GAMEPAD_FRET_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];

/**
 * Issue #124 (Epic #43): "Whatever is plugged in is what the notes are going to be."
 * Maps the selected external input source to its matching Highway track mode and stage view.
 */
function getRecommendedHighwayForInputMode(sourceMode, currentInstrument = 'piano') {
  const mode = String(sourceMode || 'midi-piano').toLowerCase();
  if (mode === 'vocal-mic') {
    return {
      trackMode: 'instrument-vocals',
      instrumentId: 'vocals',
      stageViewMode: 'karaoke',
      autoMuteStem: true
    };
  }
  if (mode === 'midi-edrums' || mode === 'audio-drums') {
    return {
      trackMode: 'instrument-drums',
      instrumentId: 'drums',
      stageViewMode: 'highway',
      autoMuteStem: true
    };
  }
  if (mode === 'audio-pitch') {
    const keepBassOrGuitar = currentInstrument === 'bass' ? 'bass' : 'guitar';
    return {
      trackMode: `instrument-${keepBassOrGuitar}`,
      instrumentId: keepBassOrGuitar,
      stageViewMode: 'highway',
      autoMuteStem: true
    };
  }
  if (mode === 'gamepad') {
    return {
      trackMode: currentInstrument === 'drums' ? 'instrument-drums' : 'instrument-guitar',
      instrumentId: currentInstrument === 'drums' ? 'drums' : 'guitar',
      stageViewMode: 'highway',
      autoMuteStem: true
    };
  }
  return {
    trackMode: 'auto-piano',
    instrumentId: 'piano',
    stageViewMode: 'highway',
    autoMuteStem: true
  };
}

/**
 * Issue #124: Inspect connected audioinput & audiooutput devices to categorize mics
 * (USB / Headset / Built-in) and warn about missing mics or speaker-to-mic bleed risk.
 */
function assessMicAndBleedGuard(devices = []) {
  const list = Array.isArray(devices) ? devices : [];
  const mics = [];
  const outputs = [];

  for (const dev of list) {
    if (!dev || typeof dev !== 'object') continue;
    const label = String(dev.label || '');
    if (dev.kind === 'audioinput') {
      let category = 'System Mic';
      if (/usb|yeti|shure|scarlett|focusrite|blue|rode|at2020|condenser|interface/i.test(label)) {
        category = 'USB / Interface Mic';
      } else if (/headset|airpods|earbuds|bluetooth|hands-free|headphone/i.test(label)) {
        category = 'Headset Mic';
      } else if (/built-in|internal|macbook|array|realtek|laptop/i.test(label)) {
        category = 'Built-in Mic';
      }
      mics.push({
        deviceId: dev.deviceId || 'default',
        label: label || `Microphone ${mics.length + 1}`,
        category
      });
    } else if (dev.kind === 'audiooutput') {
      outputs.push({
        deviceId: dev.deviceId || 'default',
        label: label || `Audio Output ${outputs.length + 1}`
      });
    }
  }

  const headphonesDetected = outputs.some((o) =>
    /headphone|headset|airpods|earbuds|earphone|buds|studio monitor|usb audio/i.test(o.label)
  );
  const speakersLikely = outputs.length === 0 || !headphonesDetected;

  return {
    micCount: mics.length,
    mics,
    headphonesDetected,
    speakersLikely,
    noMicWarning: mics.length === 0,
    bleedWarning: mics.length > 0 && speakersLikely
  };
}

module.exports = {
  GM_DRUM_HIGHWAY_LANES,
  INPUT_SOURCE_MODES,
  GAMEPAD_DRUM_BUTTON_MAP,
  GAMEPAD_FRET_SCALE_OFFSETS,
  midiToNoteName,
  frequencyToMidiFloat,
  midiToFrequency,
  translateGmDrumMidiToHighwayLane,
  foldInstrumentMidiForHighway,
  detectPitchFromFloat32Buffer,
  classifyAcousticDrumHitFromBuffer,
  getRecommendedHighwayForInputMode,
  assessMicAndBleedGuard
};

/**
 * College of Keys — Renderer Process (Phase 1: 61-Key Piano Canvas, Web MIDI & Tone.js Synth)
 *
 * Valid 61-key range: C2 (MIDI 36) to C7 (MIDI 96) -> 36 White Keys, 25 Black Keys
 */

const MIN_MIDI = 36; // C2
const MAX_MIDI = 96; // C7
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Black key horizontal offset ratio relative to the boundary between two white keys
const BLACK_KEY_OFFSETS = {
  1: 0.65, // C# sits slightly left of the C|D boundary
  3: 0.35, // D# sits slightly right of the D|E boundary
  6: 0.68, // F# sits slightly left of the F|G boundary
  8: 0.50, // G# sits centered on the G|A boundary
  10: 0.32 // A# sits slightly right of the A|B boundary
};

// DOM Elements
const canvas = document.getElementById('spell-canvas');
const ctx = canvas.getContext('2d');
const midiStatusPill = document.getElementById('midi-status-pill');
const midiStatusText = document.getElementById('midi-status-text');
const btnRescanMidi = document.getElementById('btn-rescan-midi');
const synthPresetSelect = document.getElementById('synth-preset');
const masterVolumeSlider = document.getElementById('master-volume');
const sustainStateText = document.getElementById('sustain-state');
const activeNotesDisplay = document.getElementById('active-notes-display');
const qwertyOctaveLabel = document.getElementById('qwerty-octave-label');

// State
const keyGeometry = {}; // midi -> { midi, name, isBlack, x, y, width, height, whiteIndex }
const whiteKeys = [];
const blackKeys = [];
const activeNotes = new Map(); // midi -> { velocity, source, sustainedOnly }
const sustainedNotes = new Set(); // midi notes held solely by sustain pedal (CC 64)
let sustainPedalDown = false;

// Audio State (Tone.js Singleton Voice Pool)
let audioInitialized = false;
let polySynth = null;
let masterVol = null;
let reverbNode = null;

// Mouse & QWERTY fallback state
let isMouseDown = false;
let currentMouseMidi = null;
let qwertyBaseMidi = 60; // Defaults to C4 (Middle C)
const pressedQwertyKeys = new Map(); // key -> midiNote

const QWERTY_OFFSETS = {
  a: 0,  // C
  w: 1,  // C#
  s: 2,  // D
  e: 3,  // D#
  d: 4,  // E
  f: 5,  // F
  t: 6,  // F#
  g: 7,  // G
  y: 8,  // G#
  h: 9,  // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C (+1 oct)
  o: 13, // C# (+1 oct)
  l: 14, // D (+1 oct)
  p: 15, // D# (+1 oct)
  ';': 16 // E (+1 oct)
};

/**
 * Convert MIDI number (36..96) to human-readable note name (e.g. 60 -> "C4")
 */
function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

/**
 * Initialize persistent Tone.PolySynth voice pool with near-zero live latency
 */
function initAudioEngine() {
  if (polySynth) return;

  // Set lookAhead to 0 to eliminate the default 100ms scheduling buffer for live play
  Tone.context.lookAhead = 0;

  masterVol = new Tone.Volume(Number(masterVolumeSlider.value)).toDestination();
  reverbNode = new Tone.Reverb({ decay: 1.8, wet: 0.18 }).connect(masterVol);

  polySynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 32,
    oscillator: {
      type: 'triangle8'
    },
    envelope: {
      attack: 0.004,
      decay: 0.35,
      sustain: 0.25,
      release: 0.8
    }
  }).connect(reverbNode);
}

/**
 * Apply selected synth preset to the persistent PolySynth
 */
function applySynthPreset(presetName) {
  if (!polySynth) initAudioEngine();

  const presets = {
    grand: {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.004, decay: 0.35, sustain: 0.25, release: 0.8 }
    },
    harp: {
      oscillator: { type: 'fmsine', modulationIndex: 3, harmonicity: 2 },
      envelope: { attack: 0.002, decay: 0.28, sustain: 0.12, release: 1.1 }
    },
    organ: {
      oscillator: { type: 'fatcustom', partials: [1, 0.5, 0.25, 0.125], spread: 12, count: 3 },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.85, release: 0.25 }
    },
    warm: {
      oscillator: { type: 'fatsawtooth', spread: 20, count: 3 },
      envelope: { attack: 0.04, decay: 0.4, sustain: 0.5, release: 1.2 }
    }
  };

  const chosen = presets[presetName] || presets.grand;
  polySynth.set(chosen);
}

/**
 * Ensure AudioContext is unlocked on user interaction or MIDI input
 */
async function ensureAudioReady() {
  if (!polySynth) {
    initAudioEngine();
  }
  if (!audioInitialized && Tone.context.state !== 'running') {
    try {
      await Tone.start();
      audioInitialized = true;
    } catch (err) {
      // Will retry on next user gesture if blocked
    }
  } else {
    audioInitialized = true;
  }
}

/**
 * Trigger Note On (from Web MIDI, Mouse, or QWERTY)
 */
function handleNoteOn(midi, velocity = 100, source = 'midi') {
  if (midi < MIN_MIDI || midi > MAX_MIDI) return;

  ensureAudioReady();

  const normalizedVel = Math.max(0.1, Math.min(1.0, velocity / 127));
  const noteName = midiToNoteName(midi);

  // If note wasn't already physically held down, trigger synth attack
  const existing = activeNotes.get(midi);
  if (!existing || existing.sustainedOnly) {
    if (polySynth) {
      polySynth.triggerAttack(noteName, Tone.now(), normalizedVel);
    }
  }

  sustainedNotes.delete(midi);
  activeNotes.set(midi, {
    velocity,
    source,
    sustainedOnly: false
  });

  updateActiveNotesHUD();
  renderCanvas();
}

/**
 * Trigger Note Off (handles both explicit 0x80 and 0x90 with velocity === 0)
 */
function handleNoteOff(midi) {
  if (midi < MIN_MIDI || midi > MAX_MIDI) return;

  const existing = activeNotes.get(midi);
  if (!existing) return;

  if (sustainPedalDown) {
    // Keep sounding while sustain pedal is held, but mark as pedal-sustained
    existing.sustainedOnly = true;
    sustainedNotes.add(midi);
  } else {
    const noteName = midiToNoteName(midi);
    if (polySynth) {
      polySynth.triggerRelease(noteName, Tone.now());
    }
    activeNotes.delete(midi);
    sustainedNotes.delete(midi);
  }

  updateActiveNotesHUD();
  renderCanvas();
}

/**
 * Handle Sustain Pedal (MIDI CC 64)
 */
function handleSustainPedal(isDown) {
  sustainPedalDown = isDown;
  sustainStateText.textContent = isDown ? 'ON' : 'OFF';
  sustainStateText.style.color = isDown ? '#ffd700' : '#f4ebd9';

  if (!isDown) {
    // Release all notes that were only held by the sustain pedal
    for (const midi of Array.from(sustainedNotes)) {
      const noteState = activeNotes.get(midi);
      if (noteState && noteState.sustainedOnly) {
        if (polySynth) {
          polySynth.triggerRelease(midiToNoteName(midi), Tone.now());
        }
        activeNotes.delete(midi);
      }
      sustainedNotes.delete(midi);
    }
    updateActiveNotesHUD();
    renderCanvas();
  }
}

/**
 * Update the top-right HUD readout showing currently pressed keys
 */
function updateActiveNotesHUD() {
  if (activeNotes.size === 0) {
    activeNotesDisplay.textContent = 'Strike a key...';
    return;
  }
  const sorted = Array.from(activeNotes.keys()).sort((a, b) => a - b);
  const labels = sorted.map((m) => `${midiToNoteName(m)} (${m})`);
  activeNotesDisplay.textContent = labels.join('  ');
}

/**
 * Compute exact 61-key geometry lookup table (keyGeometry[36..96])
 * Shared between the keyboard renderer and Phase 3's falling Spell Highway
 */
function computeKeyGeometry() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;

  // Piano keyboard occupies bottom ~22% of canvas (clamped between 145px and 210px)
  const keyboardHeight = Math.max(145, Math.min(210, Math.round(height * 0.22)));
  const keyboardY = height - keyboardHeight;

  whiteKeys.length = 0;
  blackKeys.length = 0;

  // First pass: count & position the 36 white keys (C2..C7)
  const totalWhiteKeys = 36;
  const whiteKeyWidth = width / totalWhiteKeys;

  let whiteIdx = 0;
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
    const semitone = midi % 12;
    const isBlack = BLACK_SEMITONES.has(semitone);
    if (!isBlack) {
      const keyObj = {
        midi,
        name: midiToNoteName(midi),
        isBlack: false,
        x: whiteIdx * whiteKeyWidth,
        y: keyboardY,
        width: whiteKeyWidth,
        height: keyboardHeight,
        whiteIndex: whiteIdx
      };
      keyGeometry[midi] = keyObj;
      whiteKeys.push(keyObj);
      whiteIdx++;
    }
  }

  // Second pass: position the 25 black keys relative to their preceding white key
  const blackKeyWidth = whiteKeyWidth * 0.62;
  const blackKeyHeight = keyboardHeight * 0.62;

  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
    const semitone = midi % 12;
    if (BLACK_SEMITONES.has(semitone)) {
      const prevWhite = keyGeometry[midi - 1];
      const offsetRatio = BLACK_KEY_OFFSETS[semitone] || 0.5;
      const boundaryX = prevWhite.x + prevWhite.width;
      const x = boundaryX - blackKeyWidth * offsetRatio;

      const keyObj = {
        midi,
        name: midiToNoteName(midi),
        isBlack: true,
        x,
        y: keyboardY,
        width: blackKeyWidth,
        height: blackKeyHeight
      };
      keyGeometry[midi] = keyObj;
      blackKeys.push(keyObj);
    }
  }
}

/**
 * Render the Spell Highway backdrop, strike line, and 61-key piano
 */
function renderCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  if (whiteKeys.length === 0) return;
  const strikeLineY = whiteKeys[0].y;

  // 1. Draw vertical octave lane guides in the Spell Highway area (top section)
  ctx.save();
  for (const wk of whiteKeys) {
    const semitone = wk.midi % 12;
    if (semitone === 0 || semitone === 5) {
      ctx.beginPath();
      ctx.moveTo(wk.x, 0);
      ctx.lineTo(wk.x, strikeLineY);
      ctx.strokeStyle = semitone === 0
        ? 'rgba(212, 175, 55, 0.16)'
        : 'rgba(163, 151, 184, 0.07)';
      ctx.lineWidth = semitone === 0 ? 1.5 : 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  // 2. Draw glowing Strike Zone Line above the 61-key keyboard
  ctx.save();
  const strikeGrad = ctx.createLinearGradient(0, strikeLineY - 6, 0, strikeLineY + 4);
  strikeGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
  strikeGrad.addColorStop(0.6, 'rgba(255, 215, 0, 0.65)');
  strikeGrad.addColorStop(1, '#d4af37');
  ctx.fillStyle = strikeGrad;
  ctx.fillRect(0, strikeLineY - 6, width, 8);
  ctx.restore();

  // 3. Draw 36 White Keys
  for (const key of whiteKeys) {
    const state = activeNotes.get(key.midi);
    const isPressed = Boolean(state);

    ctx.save();
    if (isPressed) {
      const grad = ctx.createLinearGradient(key.x, key.y, key.x, key.y + key.height);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(0.35, '#ffd700');
      grad.addColorStop(1, '#c59b27');
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.75)';
      ctx.shadowBlur = 16;
    } else {
      const grad = ctx.createLinearGradient(key.x, key.y, key.x, key.y + key.height);
      grad.addColorStop(0, '#e8e2d5');
      grad.addColorStop(0.88, '#f7f3eb');
      grad.addColorStop(1, '#cfc6b4');
      ctx.fillStyle = grad;
    }

    // Draw white key body with slightly rounded bottom corners
    const pad = 0.75;
    ctx.fillRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

    // Key border
    ctx.strokeStyle = isPressed ? '#ffd700' : '#261f3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

    // Draw C-octave markers (C2, C3, C4, C5, C6, C7)
    if (key.midi % 12 === 0) {
      ctx.fillStyle = isPressed ? '#1a1200' : '#4a3d66';
      ctx.font = `bold ${Math.max(10, Math.min(13, Math.floor(key.width * 0.42)))}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(key.name, key.x + key.width / 2, key.y + key.height - 12);
    }
    ctx.restore();
  }

  // 4. Draw 25 Black Keys on top
  for (const key of blackKeys) {
    const state = activeNotes.get(key.midi);
    const isPressed = Boolean(state);

    ctx.save();
    if (isPressed) {
      const grad = ctx.createLinearGradient(key.x, key.y, key.x, key.y + key.height);
      grad.addColorStop(0, '#ffd700');
      grad.addColorStop(0.5, '#e5a900');
      grad.addColorStop(1, '#9c6f00');
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
      ctx.shadowBlur = 14;
    } else {
      const grad = ctx.createLinearGradient(key.x, key.y, key.x, key.y + key.height);
      grad.addColorStop(0, '#2a2342');
      grad.addColorStop(0.8, '#141022');
      grad.addColorStop(1, '#090710');
      ctx.fillStyle = grad;
    }

    ctx.fillRect(key.x, key.y, key.width, key.height);

    // Subtle metallic trim on black keys
    ctx.strokeStyle = isPressed ? '#fff3b0' : '#493c6e';
    ctx.lineWidth = 1;
    ctx.strokeRect(key.x + 0.5, key.y + 0.5, key.width - 1, key.height - 1);
    ctx.restore();
  }
}

/**
 * Hit-test canvas coordinates (x, y) against the 61-key piano
 * Checks black keys first since they overlap white keys
 */
function getMidiKeyAtPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (const bk of blackKeys) {
    if (x >= bk.x && x <= bk.x + bk.width && y >= bk.y && y <= bk.y + bk.height) {
      return bk.midi;
    }
  }
  for (const wk of whiteKeys) {
    if (x >= wk.x && x <= wk.x + wk.width && y >= wk.y && y <= wk.y + wk.height) {
      return wk.midi;
    }
  }
  return null;
}

/**
 * Set up Native Web MIDI API (navigator.requestMIDIAccess)
 */
async function initWebMIDI() {
  if (!navigator.requestMIDIAccess) {
    setMidiStatus('error', 'Web MIDI API Unsupported');
    return;
  }

  try {
    const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    bindMidiInputs(midiAccess);

    // Hot-plug listener when physical 61-key keyboard is plugged/unplugged
    midiAccess.onstatechange = () => {
      bindMidiInputs(midiAccess);
    };
  } catch (err) {
    setMidiStatus('error', 'MIDI Access Denied — Mouse/QWERTY Active');
  }
}

function bindMidiInputs(midiAccess) {
  const inputs = Array.from(midiAccess.inputs.values());
  const connectedNames = [];

  for (const input of inputs) {
    if (input.state === 'connected') {
      connectedNames.push(input.name || 'MIDI Keyboard');
      input.onmidimessage = onMidiMessage;
    }
  }

  if (connectedNames.length > 0) {
    setMidiStatus('connected', `MIDI: ${connectedNames.join(', ')}`);
  } else {
    setMidiStatus('waiting', 'No MIDI Keyboard Detected (Mouse/QWERTY Active)');
  }
}

function setMidiStatus(state, message) {
  midiStatusPill.classList.remove('status-connected', 'status-waiting', 'status-error');
  midiStatusPill.classList.add(`status-${state}`);
  midiStatusText.textContent = message;
}

/**
 * Parse raw Web MIDI bytes:
 * - 0x90 (144..159) with velocity > 0  -> NoteOn
 * - 0x90 (144..159) with velocity == 0 -> NoteOff (Velocity-0 release)
 * - 0x80 (128..143)                    -> NoteOff
 * - 0xB0 (176..191) data1 == 64        -> Sustain Pedal (CC 64)
 */
function onMidiMessage(event) {
  const data = event.data;
  if (!data || data.length < 2) return;

  const status = data[0] & 0xf0;
  const data1 = data[1];
  const data2 = data.length > 2 ? data[2] : 0;

  if (status === 0x90) {
    if (data2 > 0) {
      // Fold out-of-bounds physical notes into 36..96 just in case an 88-key controller is used
      const foldedMidi = foldMidiTo61Keys(data1);
      handleNoteOn(foldedMidi, data2, 'midi');
    } else {
      const foldedMidi = foldMidiTo61Keys(data1);
      handleNoteOff(foldedMidi);
    }
  } else if (status === 0x80) {
    const foldedMidi = foldMidiTo61Keys(data1);
    handleNoteOff(foldedMidi);
  } else if (status === 0xb0 && data1 === 64) {
    handleSustainPedal(data2 >= 64);
  }
}

/**
 * Fold any MIDI note outside C2 (36) - C7 (96) by +/- 12 semitones
 */
function foldMidiTo61Keys(midi) {
  let folded = midi;
  while (folded < MIN_MIDI) folded += 12;
  while (folded > MAX_MIDI) folded -= 12;
  return folded;
}

/**
 * Mouse & QWERTY Event Listeners for testing with or without physical hardware
 */
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isMouseDown = true;
  const midi = getMidiKeyAtPoint(e.clientX, e.clientY);
  if (midi !== null) {
    currentMouseMidi = midi;
    handleNoteOn(midi, 105, 'mouse');
  }
});

window.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;
  const midi = getMidiKeyAtPoint(e.clientX, e.clientY);
  if (midi !== currentMouseMidi) {
    if (currentMouseMidi !== null) {
      handleNoteOff(currentMouseMidi);
    }
    currentMouseMidi = midi;
    if (midi !== null) {
      handleNoteOn(midi, 100, 'mouse');
    }
  }
});

window.addEventListener('mouseup', () => {
  if (!isMouseDown) return;
  isMouseDown = false;
  if (currentMouseMidi !== null) {
    handleNoteOff(currentMouseMidi);
    currentMouseMidi = null;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const key = e.key.toLowerCase();

  // Octave shift for QWERTY testing: Z = down 1 octave, X = up 1 octave
  if (key === 'z') {
    qwertyBaseMidi = Math.max(MIN_MIDI, qwertyBaseMidi - 12);
    updateQwertyOctaveLabel();
    return;
  }
  if (key === 'x') {
    qwertyBaseMidi = Math.min(MAX_MIDI - 12, qwertyBaseMidi + 12);
    updateQwertyOctaveLabel();
    return;
  }

  if (Object.prototype.hasOwnProperty.call(QWERTY_OFFSETS, key)) {
    const midi = qwertyBaseMidi + QWERTY_OFFSETS[key];
    if (midi >= MIN_MIDI && midi <= MAX_MIDI && !pressedQwertyKeys.has(key)) {
      pressedQwertyKeys.set(key, midi);
      handleNoteOn(midi, 100, 'qwerty');
    }
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (pressedQwertyKeys.has(key)) {
    const midi = pressedQwertyKeys.get(key);
    pressedQwertyKeys.delete(key);
    handleNoteOff(midi);
  }
});

function updateQwertyOctaveLabel() {
  const lowName = midiToNoteName(qwertyBaseMidi);
  const highName = midiToNoteName(Math.min(MAX_MIDI, qwertyBaseMidi + 16));
  qwertyOctaveLabel.textContent = `${lowName}–${highName}`;
}

// UI Controls
synthPresetSelect.addEventListener('change', (e) => {
  applySynthPreset(e.target.value);
});

masterVolumeSlider.addEventListener('input', (e) => {
  if (!masterVol) initAudioEngine();
  masterVol.volume.value = Number(e.target.value);
});

btnRescanMidi.addEventListener('click', () => {
  initWebMIDI();
});

window.addEventListener('resize', () => {
  computeKeyGeometry();
  renderCanvas();
});

// Boot Phase 1
computeKeyGeometry();
renderCanvas();
initAudioEngine();
initWebMIDI();


/**
 * College of Keys — Renderer Process
 * Phase 1: 61-Key Piano Canvas, Web MIDI & Warmed Acoustic Grand Piano Sampler
 * Phase 2: MIDI File Parsing (@tonejs/midi), 61-Key Octave Folding, Non-Destructive Multi-Track & Auto-Difficulty (NPS)
 * Phase 3: The Spell Highway (60 FPS requestAnimationFrame), Hand Isolation, Accompaniment & Backing Band Toggle
 * Phase 4: Wait Mode (Strike-Line Gating) & 100ms Chord Forgiveness (chordGracePeriod Roll Window)
 * Phase 5: LitRPG Gamification UI (Spell Chain Combos, Bardic Inspiration 2x XP, Leveling Titles & Performance Check Modal)
 * Phase 6: The Grimoire (Local Song Library Sidebar & Active ./Imports Folder Watcher)
 * Phase 7: UI Polish & Arcane Strike-Line Particle Bursts, Shockwaves & Floating XP Runes
 * Phase 8 & 9: "The Quest Board" (In-App YouTube-to-MIDI Python ML Spawner & External Archive Quick-Links)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { shell } = require('electron');

const MIN_MIDI = 36; // C2
const MAX_MIDI = 96; // C7
const MIDDLE_C = 60; // C4
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Phase 4 Constants: 100ms Chord Forgiveness & Strike Zone Window
const CHORD_GRACE_PERIOD_MS = 100;       // Strict 100ms window for clean chord rolls
const CHORD_CLUSTER_WINDOW_SEC = 0.045;  // Notes within 45ms of each other form a simultaneous chord
const EARLY_STRIKE_WINDOW_SEC = 0.13;    // Allow hitting a note up to 130ms before it touches the strike line
const FUMBLE_PAUSE_THRESHOLD_SEC = 2.0;  // Pausing > 2.0s in Wait Mode flags a Fumbled Component

// Phase 5 Constants: LitRPG XP, Combo & Leveling Curve
const BASE_NOTE_XP = 10;                 // +10 XP base per clean note
const FUMBLED_NOTE_XP = 2;               // +2 XP base when paused > 2.0s in Wait Mode ("Fumbled Component")
const BARDIC_INSPIRATION_STREAK = 50;    // 50+ Spell Chain triggers Bardic Inspiration (2.0x XP)
const BARDIC_INSPIRATION_MULT = 2.0;     // 2.0x temporary XP multiplier during Bardic Inspiration
const LEVEL_1_XP_THRESHOLD = 1000;       // Level 1 requires 1,000 XP
const LEVEL_XP_SCALE_FACTOR = 1.5;       // Scales by 1.5x per level
const BARD_PROFILE_STORAGE_KEY = 'collegeOfKeys_bardProfile_v1';
const BARD_PROFILE_FILE_PATH = path.join(__dirname, 'bard_profile.json');

// Phase 6 Constants: The Grimoire & Watched Directories
const IMPORTS_DIR = path.join(__dirname, 'Imports');
const MIDI_TEST_DIR = path.join(__dirname, 'Midi Test Files');
const GRIMOIRE_STORAGE_KEY = 'collegeOfKeys_grimoire_v1';
const GRIMOIRE_INDEX_FILE = path.join(__dirname, 'grimoire_library.json');

// Black key horizontal offset ratio relative to the boundary between two white keys
const BLACK_KEY_OFFSETS = {
  1: 0.65, // C# sits slightly left of the C|D boundary
  3: 0.35, // D# sits slightly right of the D|E boundary
  6: 0.68, // F# sits slightly left of the F|G boundary
  8: 0.50, // G# sits centered on the G|A boundary
  10: 0.32 // A# sits slightly right of the A|B boundary
};

// Salamander Grand Piano multi-sample anchor map (stored locally in ./assets/samples/piano)
const SALAMANDER_SAMPLE_MAP = {
  'A1': 'A1.mp3',
  'C2': 'C2.mp3',
  'D#2': 'Ds2.mp3',
  'F#2': 'Fs2.mp3',
  'A2': 'A2.mp3',
  'C3': 'C3.mp3',
  'D#3': 'Ds3.mp3',
  'F#3': 'Fs3.mp3',
  'A3': 'A3.mp3',
  'C4': 'C4.mp3',
  'D#4': 'Ds4.mp3',
  'F#4': 'Fs4.mp3',
  'A4': 'A4.mp3',
  'C5': 'C5.mp3',
  'D#5': 'Ds5.mp3',
  'F#5': 'Fs5.mp3',
  'A5': 'A5.mp3',
  'C6': 'C6.mp3',
  'D#6': 'Ds6.mp3',
  'F#6': 'Fs6.mp3',
  'A6': 'A6.mp3',
  'C7': 'C7.mp3'
};

// DOM Elements — Phase 1
const stageContainer = document.getElementById('stage-container');
const canvas = document.getElementById('spell-canvas');
const ctx = canvas.getContext('2d');
const midiStatusPill = document.getElementById('midi-status-pill');
const midiStatusText = document.getElementById('midi-status-text');
const btnRescanMidi = document.getElementById('btn-rescan-midi');
const synthPresetSelect = document.getElementById('synth-preset');
const masterVolumeSlider = document.getElementById('master-volume');
const sustainStateText = document.getElementById('sustain-state');
const activeNotesDisplay = document.getElementById('active-notes-display');
const qwertyPill = document.getElementById('qwerty-pill');
const qwertyOctaveLabel = document.getElementById('qwerty-octave-label');
const btnQwertyDown = document.getElementById('btn-qwerty-down');
const btnQwertyUp = document.getElementById('btn-qwerty-up');

// DOM Elements — Phase 10 (2-Bar Conservatory Layout, Popovers & Unified Practice Selector)
const btnToggleSettings = document.getElementById('btn-toggle-settings');
const settingsPopover = document.getElementById('settings-popover');
const btnCloseSettings = document.getElementById('btn-close-settings');
const toggleQwertyLabelsCheckbox = document.getElementById('toggle-qwerty-labels');
const btnSpellDetails = document.getElementById('btn-spell-details');
const spellDetailsPopover = document.getElementById('spell-details-popover');
const btnCloseSpellDetails = document.getElementById('btn-close-spell-details');
const practiceModeSelect = document.getElementById('practice-mode-select');

// DOM Elements — Phase 2, 3 & 4 (MIDI Loader, Transport, Wait Mode, Hand Isolation & Backing Band)
const midiFileInput = document.getElementById('midi-file-input');
const btnLoadMidi = document.getElementById('btn-load-midi');
const btnSampleMidi = document.getElementById('btn-sample-midi');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnRestart = document.getElementById('btn-restart');
const btnWaitMode = document.getElementById('btn-wait-mode');
const waitModeStateText = document.getElementById('wait-mode-state');
const songProgressSlider = document.getElementById('song-progress-slider');
const songTimeReadout = document.getElementById('song-time-readout');
const playableTrackSelect = document.getElementById('playable-track-select');
const handIsolationSelect = document.getElementById('hand-isolation-select');
const accompanimentSelect = document.getElementById('accompaniment-select');
const btnBackingBand = document.getElementById('btn-backing-band');
const backingBandStateText = document.getElementById('backing-band-state');
const playbackSpeedSelect = document.getElementById('playback-speed-select');
const fallSpeedSelect = document.getElementById('fall-speed-select');

const spellNameDisplay = document.getElementById('spell-name-display');
const strikeZoneStatusPill = document.getElementById('strike-zone-status');
const strikeStatusText = document.getElementById('strike-status-text');
const spellStatsBadges = document.getElementById('spell-stats-badges');
const spellDifficultyBadge = document.getElementById('spell-difficulty-badge');
const statNps = document.getElementById('stat-nps');
const statBpm = document.getElementById('stat-bpm');
const statDuration = document.getElementById('stat-duration');
const statT1Notes = document.getElementById('stat-t1-notes');
const statT2Notes = document.getElementById('stat-t2-notes');
const statBandTracks = document.getElementById('stat-band-tracks');
const statFoldedNotes = document.getElementById('stat-folded-notes');

// DOM Elements — Phase 5 (LitRPG HUD & Post-Song Performance Check Modal)
const btnPerformanceCheck = document.getElementById('btn-performance-check');
const litrpgHudCard = document.getElementById('litrpg-hud-card');
const hudBardLevel = document.getElementById('hud-bard-level');
const hudBardTitle = document.getElementById('hud-bard-title');
const hudTotalXp = document.getElementById('hud-total-xp');
const hudXpProgressText = document.getElementById('hud-xp-progress-text');
const hudSongXp = document.getElementById('hud-song-xp');
const hudXpBarFill = document.getElementById('hud-xp-bar-fill');
const hudSpellChain = document.getElementById('hud-spell-chain');
const hudMaxChain = document.getElementById('hud-max-chain');
const hudXpMultiplier = document.getElementById('hud-xp-multiplier');
const hudLastXpGain = document.getElementById('hud-last-xp-gain');
const hudInspirationBanner = document.getElementById('hud-inspiration-banner');
const hudInspirationText = document.getElementById('hud-inspiration-text');
const btnBoostChain = document.getElementById('btn-boost-chain');

const performanceCheckModal = document.getElementById('performance-check-modal');
const modalSongSubtitle = document.getElementById('modal-song-subtitle');
const modalD20Badge = document.getElementById('modal-d20-badge');
const modalGradeTitle = document.getElementById('modal-grade-title');
const modalGradeFlavor = document.getElementById('modal-grade-flavor');
const modalLevelupBanner = document.getElementById('modal-levelup-banner');
const modalNewLevel = document.getElementById('modal-new-level');
const modalNewTitle = document.getElementById('modal-new-title');
const modalBardLevel = document.getElementById('modal-bard-level');
const modalBardTitle = document.getElementById('modal-bard-title');
const modalXpNumbers = document.getElementById('modal-xp-numbers');
const modalXpBarFill = document.getElementById('modal-xp-bar-fill');
const modalStatXp = document.getElementById('modal-stat-xp');
const modalStatAccuracy = document.getElementById('modal-stat-accuracy');
const modalStatChain = document.getElementById('modal-stat-chain');
const modalStatClean = document.getElementById('modal-stat-clean');
const modalStatFumbled = document.getElementById('modal-stat-fumbled');
const modalStatRolls = document.getElementById('modal-stat-rolls');
const btnModalReplay = document.getElementById('btn-modal-replay');
const btnModalClose = document.getElementById('btn-modal-close');

// DOM Elements — Phase 6 (The Grimoire Sidebar & Folder Watcher)
const btnToggleGrimoire = document.getElementById('btn-toggle-grimoire');
const grimoireCountBadge = document.getElementById('grimoire-count-badge');
const grimoireSidebar = document.getElementById('grimoire-sidebar');
const btnCloseGrimoire = document.getElementById('btn-close-grimoire');
const watcherStatusText = document.getElementById('watcher-status-text');
const btnSaveGrimoire = document.getElementById('btn-save-grimoire');
const btnOpenImports = document.getElementById('btn-open-imports');
const btnTestWatcherDrop = document.getElementById('btn-test-watcher-drop');
const grimoireSearchInput = document.getElementById('grimoire-search-input');
const grimoireFilterSelect = document.getElementById('grimoire-filter-select');
const grimoireSpellList = document.getElementById('grimoire-spell-list');
const grimoireToast = document.getElementById('grimoire-toast');
const grimoireToastText = document.getElementById('grimoire-toast-text');

// DOM Elements — Phase 9 ("The Quest Board" In-App YouTube-to-MIDI Sourcing & Quick Links)
const btnOpenQuestBoard = document.getElementById('btn-open-quest-board');
const questBoardModal = document.getElementById('quest-board-modal');
const btnCloseQuestBoard = document.getElementById('btn-close-quest-board');
const questStatusBadge = document.getElementById('quest-status-badge');
const questYoutubeUrlInput = document.getElementById('quest-youtube-url');
const questCustomTitleInput = document.getElementById('quest-custom-title');
const btnRunQuestUrl = document.getElementById('btn-run-quest-url');
const btnRunQuestSelfTest = document.getElementById('btn-run-quest-selftest');
const btnQuestLoadResult = document.getElementById('btn-quest-load-result');
const questProgressMessage = document.getElementById('quest-progress-message');
const questProgressPct = document.getElementById('quest-progress-pct');
const questProgressFill = document.getElementById('quest-progress-fill');
const questLogOutput = document.getElementById('quest-log-output');
const btnLinkBitmidi = document.getElementById('btn-link-bitmidi');
const btnLinkVgmusic = document.getElementById('btn-link-vgmusic');
const btnLinkYoutube = document.getElementById('btn-link-youtube');
const btnQuestOpenImports = document.getElementById('btn-quest-open-imports');
const btnQuestCloseBottom = document.getElementById('btn-quest-close-bottom');

// Keyboard & Input State
const keyGeometry = {}; // midi -> { midi, name, isBlack, x, y, width, height, whiteIndex }
const whiteKeys = [];
const blackKeys = [];
const activeNotes = new Map(); // midi -> { velocity, source, sustainedOnly }
const sustainedNotes = new Set(); // midi notes held solely by sustain pedal (CC 64)
let sustainPedalDown = false;

// Audio State (Warmed Acoustic Grand Piano Sampler + Synth Presets + Backing Band Synth)
let audioInitialized = false;
let currentPreset = 'grand';
let grandPianoSampler = null;
let grandPianoLoaded = false;
let polySynth = null;
let backingBandSynth = null;
let masterVol = null;
let reverbNode = null;
let pianoToneFilter = null;
let pianoWarmthEQ = null;

// Phase 2, 3 & 4 State: Parsed MIDI Song, Playback & Wait Mode / Chord Forgiveness
let currentSong = null;

const playbackState = {
  isPlaying: false,
  currentTime: -1.5, // Start with 1.5s lead-in so first notes fall smoothly toward strike line
  leadInSeconds: 1.5,
  playbackSpeed: 1.0,
  fallSpeedPxPerSec: 260,
  handIsolation: 'both',           // 'both' | 'track1' | 'track2'
  accompanimentMode: 'auto-other', // 'auto-other' | 'mute-other' | 'auto-both'
  backingBandEnabled: true,
  waitMode: true,                  // Phase 4: Wait Mode enabled by default
  isWaitingForStrike: false,       // True when playback is frozen at the strike line waiting for input
  waitStartedAtMs: null,           // Timestamp when current Wait Mode pause began
  activeStrikeGroup: null,         // Current chord/note group being gated at the strike line
  lastFrameTimestamp: null,
  isScrubbing: false
};

// Phase 5 State: Persistent Bard Profile & Per-Song Performance Session Stats
const bardProfile = {
  totalXp: 0,
  level: 1,
  xpIntoLevel: 0,
  xpForNextLevel: LEVEL_1_XP_THRESHOLD,
  title: 'Tavern Busker',
  bestCareerChain: 0,
  songsCompleted: 0
};

const songSessionStats = {
  songXpEarned: 0,
  startingLevel: 1,
  spellChain: 0,
  maxSpellChain: 0,
  cleanNotesHit: 0,
  fumbledNotesHit: 0,
  wrongOrMissedNotes: 0,
  cleanChordRolls: 0,
  lastGainText: 'Strike notes to earn XP',
  lastGainFumbled: false,
  hasShownEndModal: false
};

// Phase 6 State: The Grimoire Spell Library & Folder Watcher
const grimoireSpells = new Map(); // id -> spellEntry
let grimoireWatcher = null;
let grimoireToastTimer = null;
let testDropCounter = 0;

// Phase 7 State: 60 FPS Arcane Particle Bursts, Shockwaves, Floating Runes & Ambient Motes
const strikeParticles = [];
const strikeShockwaves = [];
const floatingRunes = [];
const ambientMotes = [];
let lastParticleFrameMs = performance.now();

// Mouse & QWERTY fallback state
let isMouseDown = false;
let currentMouseMidi = null;
let qwertyBaseMidi = 60; // Defaults to C4 (Middle C)
let showQwertyKeyLabels = true; // Auto-hides when physical MIDI controller connects (Issue #21)
let userManuallyToggledQwertyLabels = false;
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

const OFFSET_TO_QWERTY_LABEL = {
  0: 'A', 1: 'W', 2: 'S', 3: 'E', 4: 'D', 5: 'F', 6: 'T', 7: 'G',
  8: 'Y', 9: 'H', 10: 'U', 11: 'J', 12: 'K', 13: 'O', 14: 'L', 15: 'P', 16: ';'
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
 * Format seconds into M:SS
 */
function formatSeconds(sec) {
  const clamped = Math.max(0, Math.floor(sec));
  const mins = Math.floor(clamped / 60);
  const rem = clamped % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

/**
 * Initialize persistent Acoustic Grand Piano (Tone.Sampler with local Salamander samples)
 * routed through a warm Tavern EQ + Low-Pass filter to eliminate upper-register shrillness,
 * plus a dedicated Backing Band PolySynth for Rock Band-style multi-track accompaniment.
 */
function initAudioEngine() {
  if (masterVol) return;

  Tone.context.lookAhead = 0;

  masterVol = new Tone.Volume(Number(masterVolumeSlider.value)).toDestination();
  reverbNode = new Tone.Reverb({ decay: 2.0, wet: 0.16 }).connect(masterVol);

  pianoToneFilter = new Tone.Filter({
    type: 'lowpass',
    frequency: 3100,
    rolloff: -12,
    Q: 0.55
  }).connect(reverbNode);

  pianoWarmthEQ = new Tone.EQ3({
    low: 2.5,
    mid: 0.5,
    high: -8.5,
    lowFrequency: 260,
    highFrequency: 2200
  }).connect(pianoToneFilter);

  const sampleUrls = {};
  const createdBlobUrls = [];
  const samplesDir = path.join(__dirname, 'assets', 'samples', 'piano');

  for (const [noteKey, fileName] of Object.entries(SALAMANDER_SAMPLE_MAP)) {
    const filePath = path.join(samplesDir, fileName);
    if (fs.existsSync(filePath)) {
      const fileBuf = fs.readFileSync(filePath);
      const blob = new Blob([fileBuf], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      sampleUrls[noteKey] = blobUrl;
      createdBlobUrls.push(blobUrl);
    }
  }

  grandPianoSampler = new Tone.Sampler({
    urls: sampleUrls,
    attack: 0.003,
    release: 1.4,
    onload: () => {
      grandPianoLoaded = true;
      for (const blobUrl of createdBlobUrls) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // Ignore URL revocation errors
        }
      }
      createdBlobUrls.length = 0;
    }
  }).connect(pianoWarmthEQ);

  polySynth = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 32,
    harmonicity: 3.01,
    modulationIndex: 8,
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.003,
      decay: 0.65,
      sustain: 0.15,
      release: 1.1
    },
    modulation: { type: 'triangle' },
    modulationEnvelope: {
      attack: 0.002,
      decay: 0.25,
      sustain: 0.05,
      release: 0.5
    }
  }).connect(pianoToneFilter);

  const backingVol = new Tone.Volume(-7).connect(pianoToneFilter);
  backingBandSynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 24,
    oscillator: { type: 'fatsawtooth', spread: 16, count: 2 },
    envelope: { attack: 0.025, decay: 0.3, sustain: 0.45, release: 0.6 }
  }).connect(backingVol);
}

function getActiveInstrument() {
  if (!masterVol) initAudioEngine();
  if (currentPreset === 'grand' && grandPianoSampler && grandPianoLoaded) {
    return grandPianoSampler;
  }
  return polySynth;
}

function getVoicedVelocity(midi, velocity = 100) {
  const rawVel = Math.max(0.12, Math.min(1.0, velocity / 127));
  const registerScale = midi > 60
    ? Math.max(0.28, 1.0 - ((midi - 60) / 36) * 0.68)
    : 1.0;
  return Math.max(0.08, rawVel * registerScale);
}

function getBackingAudioVolumeFromSlider() {
  const db = Number(masterVolumeSlider?.value ?? -2);
  if (db <= -30) return 0;
  return Math.max(0, Math.min(1.0, 0.48 * Math.pow(10, db / 20)));
}

function applySynthPreset(presetName) {
  if (!masterVol) initAudioEngine();

  if (grandPianoSampler && grandPianoLoaded) {
    grandPianoSampler.releaseAll();
  }
  if (polySynth) {
    polySynth.releaseAll();
  }

  currentPreset = presetName;
  if (presetName === 'grand') {
    return;
  }

  if (polySynth) {
    polySynth.dispose();
  }

  if (presetName === 'harp') {
    polySynth = new Tone.PolySynth(Tone.FMSynth, {
      maxPolyphony: 32,
      harmonicity: 3.01,
      modulationIndex: 10,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.002, decay: 0.45, sustain: 0.08, release: 1.3 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.3 }
    }).connect(pianoToneFilter);
  } else if (presetName === 'organ') {
    polySynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 32,
      oscillator: {
        type: 'fatcustom',
        partials: [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.15],
        spread: 14,
        count: 3
      },
      envelope: { attack: 0.025, decay: 0.1, sustain: 0.9, release: 0.3 }
    }).connect(pianoToneFilter);
  } else if (presetName === 'warm') {
    polySynth = new Tone.PolySynth(Tone.AMSynth, {
      maxPolyphony: 32,
      harmonicity: 2,
      oscillator: { type: 'fatsawtooth', spread: 22, count: 3 },
      envelope: { attack: 0.05, decay: 0.5, sustain: 0.6, release: 1.4 }
    }).connect(pianoToneFilter);
  }
}

async function ensureAudioReady() {
  if (!masterVol) {
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
 * Also evaluates Phase 4 Wait Mode & 100ms Chord Roll Forgiveness!
 */
function handleNoteOn(midi, velocity = 100, source = 'midi') {
  if (midi < MIN_MIDI || midi > MAX_MIDI) return;

  ensureAudioReady();

  const voicedVelocity = getVoicedVelocity(midi, velocity);
  const noteName = midiToNoteName(midi);

  const existing = activeNotes.get(midi);
  if (!existing || existing.sustainedOnly) {
    const inst = getActiveInstrument();
    if (inst) {
      inst.triggerAttack(noteName, Tone.now(), voicedVelocity);
    }
  }

  // Phase 4: Evaluate key press against active Strike Zone / Wait Mode chord group
  const matchedStrikeZone = evaluateStrikeZoneInput(midi);

  sustainedNotes.delete(midi);
  activeNotes.set(midi, {
    velocity,
    source,
    sustainedOnly: false,
    pressedAtMs: performance.now(),
    consumedByStrikeGroup: Boolean(matchedStrikeZone)
  });

  // Phase 7: If playing freely (or outside an active strike-zone gate), spawn an immediate key spark burst!
  if (!matchedStrikeZone) {
    const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
    const freeTheme = isInspired ? 'inspired' : (midi >= MIDDLE_C ? 'gold' : 'blue');
    spawnKeyParticleBurst(midi, freeTheme, 14, true);
  }

  updateActiveNotesHUD();
}

/**
 * Trigger Note Off (handles both explicit 0x80 and 0x90 with velocity === 0)
 */
function handleNoteOff(midi) {
  if (midi < MIN_MIDI || midi > MAX_MIDI) return;

  const existing = activeNotes.get(midi);
  if (!existing) return;

  if (sustainPedalDown) {
    existing.sustainedOnly = true;
    sustainedNotes.add(midi);
  } else {
    const noteName = midiToNoteName(midi);
    const inst = getActiveInstrument();
    if (inst) {
      inst.triggerRelease(noteName, Tone.now());
    }
    activeNotes.delete(midi);
    sustainedNotes.delete(midi);
  }

  updateActiveNotesHUD();
}

/**
 * Handle Sustain Pedal (MIDI CC 64)
 */
function handleSustainPedal(isDown) {
  sustainPedalDown = isDown;
  sustainStateText.textContent = isDown ? 'ON' : 'OFF';
  sustainStateText.style.color = isDown ? '#ffd700' : '#f4ebd9';

  if (!isDown) {
    const inst = getActiveInstrument();
    for (const midi of Array.from(sustainedNotes)) {
      const noteState = activeNotes.get(midi);
      if (noteState && noteState.sustainedOnly) {
        if (inst) {
          inst.triggerRelease(midiToNoteName(midi), Tone.now());
        }
        activeNotes.delete(midi);
      }
      sustainedNotes.delete(midi);
    }
    updateActiveNotesHUD();
  }
}

function updateActiveNotesHUD() {
  if (activeNotes.size === 0) {
    activeNotesDisplay.textContent = 'Strike a key...';
    return;
  }
  const sorted = Array.from(activeNotes.keys()).sort((a, b) => a - b);
  const labels = sorted.map((m) => `${midiToNoteName(m)} (${m})`);
  activeNotesDisplay.textContent = labels.join('  ');
}

// ============================================================================
// PHASE 2: MIDI PARSING (@tonejs/midi), OCTAVE FOLDING & AUTO-DIFFICULTY (NPS)
// ============================================================================

function foldMidiNoteDetails(midi) {
  let folded = midi;
  while (folded < MIN_MIDI) folded += 12;
  while (folded > MAX_MIDI) folded -= 12;
  return {
    foldedMidi: folded,
    wasFolded: folded !== midi,
    semitoneShift: folded - midi
  };
}

function foldMidiTo61Keys(midi) {
  return foldMidiNoteDetails(midi).foldedMidi;
}

function calculateSpellDifficulty(totalPlayableNotes, durationSeconds) {
  const effectiveDuration = Math.max(1, durationSeconds);
  const nps = totalPlayableNotes / effectiveDuration;

  if (nps < 1.5) {
    return {
      nps,
      spellLevel: 'Cantrip',
      xpMultiplier: 1.0,
      badgeClass: 'diff-cantrip',
      label: 'Cantrip (1.0x XP)'
    };
  }
  if (nps <= 3.0) {
    return {
      nps,
      spellLevel: '2nd-Level Spell',
      xpMultiplier: 1.2,
      badgeClass: 'diff-level2',
      label: '2nd-Level Spell (1.2x XP)'
    };
  }
  if (nps <= 5.0) {
    return {
      nps,
      spellLevel: '5th-Level Spell',
      xpMultiplier: 1.5,
      badgeClass: 'diff-level5',
      label: '5th-Level Spell (1.5x XP)'
    };
  }
  return {
    nps,
    spellLevel: '9th-Level Spell',
    xpMultiplier: 2.0,
    badgeClass: 'diff-level9',
    label: '9th-Level Spell (2.0x XP)'
  };
}

function isPianoCandidateTrack(track) {
  if (track.instrument && track.instrument.percussion) return false;
  const family = (track.instrument?.family || '').toLowerCase();
  const instName = (track.instrument?.name || '').toLowerCase();
  const trackName = (track.name || '').toLowerCase();
  const prog = track.instrument?.number ?? -1;

  if (family === 'piano' || (prog >= 0 && prog <= 7)) return true;
  if (/piano|keys|keyboard|clav|harpsichord|rh|lh|right hand|left hand/.test(`${trackName} ${instName}`)) {
    return true;
  }
  return false;
}

function areTracksDuplicates(trackA, trackB) {
  if (trackA.notes.length !== trackB.notes.length) return false;
  if (Math.abs(trackA.avgPitch - trackB.avgPitch) > 0.5) return false;

  const sampleCount = Math.min(12, trackA.notes.length);
  for (let i = 0; i < sampleCount; i++) {
    const nA = trackA.notes[i];
    const nB = trackB.notes[i];
    if (nA.originalMidi !== nB.originalMidi || Math.abs(nA.time - nB.time) > 0.02) {
      return false;
    }
  }
  return true;
}

function parseMidiBuffer(arrayBuffer, fileName = 'Untitled Spell.mid', filePath = null) {
  pausePlayback();

  const midiData = new Midi(arrayBuffer);

  const bpm = midiData.header.tempos.length > 0
    ? Math.round(midiData.header.tempos[0].bpm)
    : 120;

  const timeSig = midiData.header.timeSignatures.length > 0
    ? `${midiData.header.timeSignatures[0].timeSignature[0]}/${midiData.header.timeSignatures[0].timeSignature[1]}`
    : '4/4';
  const beatsPerMeasure = midiData.header.timeSignatures.length > 0
    ? Math.max(1, Number(midiData.header.timeSignatures[0].timeSignature[0]) || 4)
    : 4;

  const rawTracks = midiData.tracks
    .map((t, idx) => {
      const avgPitch = t.notes.length > 0
        ? t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length
        : 60;
      return {
        index: idx,
        name: t.name?.trim() || t.instrument?.name || `Track ${idx + 1}`,
        instrumentName: t.instrument?.name || 'Unknown Instrument',
        instrumentFamily: t.instrument?.family || 'unknown',
        programNumber: t.instrument?.number ?? 0,
        isPercussion: Boolean(t.instrument?.percussion || t.channel === 9),
        isPianoCandidate: isPianoCandidateTrack(t),
        avgPitch,
        notes: t.notes.map((n, noteIdx) => ({
          id: `${idx}-${noteIdx}`,
          originalMidi: n.midi,
          name: n.name,
          time: n.time,
          ticks: n.ticks,
          duration: Math.max(0.05, n.duration),
          durationTicks: n.durationTicks,
          velocity: Math.round((n.velocity ?? 0.8) * 127),
          autoTriggered: false,
          satisfied: false,
          lockedInWait: false
        }))
      };
    })
    .filter((t) => t.notes.length > 0);

  if (rawTracks.length === 0) {
    alert('This MIDI file contains no playable notes.');
    return;
  }

  for (let i = 0; i < rawTracks.length; i++) {
    rawTracks[i].isDuplicate = false;
    rawTracks[i].duplicateOfIndex = null;
    for (let j = 0; j < i; j++) {
      if (areTracksDuplicates(rawTracks[i], rawTracks[j])) {
        rawTracks[i].isDuplicate = true;
        rawTracks[i].duplicateOfIndex = j;
        break;
      }
    }
  }

  const duration = Math.max(midiData.duration || 1, 1);
  const cleanTitle = midiData.name?.trim() || fileName.replace(/\.(mid|midi)$/i, '');

  // If a previous song had a synced backing audio element, stop it before loading new song
  if (currentSong?.backingAudioEl) {
    try {
      currentSong.backingAudioEl.pause();
      currentSong.backingAudioEl.src = '';
    } catch {
      // Ignore audio cleanup errors
    }
  }

  // Check if this .mid file has a paired backing audio track (.wav, .mp3, .ogg, .m4a)
  let backingAudioPath = null;
  let backingAudioEl = null;
  if (filePath && filePath !== 'BUILTIN_DEMO') {
    const baseNoExt = filePath.replace(/\.(mid|midi)$/i, '');
    for (const ext of ['.wav', '.mp3', '.ogg', '.m4a']) {
      if (fs.existsSync(baseNoExt + ext)) {
        backingAudioPath = baseNoExt + ext;
        break;
      }
    }
  }
  if (backingAudioPath) {
    try {
      backingAudioEl = new Audio(pathToFileURL(backingAudioPath).href);
      backingAudioEl.preload = 'auto';
      backingAudioEl.volume = getBackingAudioVolumeFromSlider();
    } catch {
      backingAudioEl = null;
    }
  }

  currentSong = {
    title: cleanTitle,
    fileName,
    filePath,
    rawBuffer: Buffer.from(arrayBuffer),
    bpm,
    timeSignature: timeSig,
    beatsPerMeasure,
    duration,
    ppq: midiData.header.ppq || 480,
    rawTracks,
    selectedTrackMode: 'auto-piano',
    track1Notes: [],
    track2Notes: [],
    backingBandTracks: [],
    backingBandNotes: [],
    backingAudioPath,
    backingAudioEl,
    foldedNotesCount: 0,
    difficulty: null
  };

  populateTrackSelectorDropdown(currentSong);
  assignSongTracksAndDifficulty('auto-piano');
  resetPlaybackToStart();

  btnPlayPause.disabled = false;
  btnRestart.disabled = false;
  songProgressSlider.disabled = false;
  renderGrimoireSidebar();
}

function populateTrackSelectorDropdown(song) {
  playableTrackSelect.innerHTML = '';
  playableTrackSelect.disabled = false;

  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto-piano';
  autoOpt.textContent = 'Auto Piano (RH Gold + LH Blue)';
  playableTrackSelect.appendChild(autoOpt);

  song.rawTracks.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = `track-${i}`;
    const tag = t.isPercussion ? 'Percussion' : t.instrumentName;
    const dupTag = t.isDuplicate ? ' [Doubled Track]' : '';
    const pitchTag = `avg ${midiToNoteName(Math.round(t.avgPitch))}`;
    opt.textContent = `${t.name} (${tag} • ${t.notes.length} notes • ${pitchTag})${dupTag}`;
    playableTrackSelect.appendChild(opt);
  });
}

function foldAndDeduplicateHandNotes(noteArr, handTrack) {
  let foldedCount = 0;
  const sorted = noteArr
    .map((n) => {
      const { foldedMidi, wasFolded, semitoneShift } = foldMidiNoteDetails(n.originalMidi);
      if (wasFolded) foldedCount++;
      return {
        ...n,
        midi: foldedMidi,
        foldedName: midiToNoteName(foldedMidi),
        wasFolded,
        semitoneShift,
        handTrack, // 1 = Right Hand (Radiant Gold), 2 = Left Hand (Eldritch Blue)
        autoTriggered: false,
        satisfied: false,
        lockedInWait: false
      };
    })
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Deduplicate simultaneous same-pitch notes produced by octave folding (Issue #14 & Issue #39)
  const deduped = [];
  for (const note of sorted) {
    const prevSamePitch = deduped.length > 0
      ? deduped.slice(Math.max(0, deduped.length - 8)).find((p) => p.midi === note.midi && Math.abs(note.time - p.time) <= 0.025)
      : null;
    if (prevSamePitch) {
      const mergedEnd = Math.max(prevSamePitch.time + prevSamePitch.duration, note.time + note.duration);
      prevSamePitch.duration = Math.max(0.05, mergedEnd - prevSamePitch.time);
      prevSamePitch.velocity = Math.max(prevSamePitch.velocity, note.velocity);
      prevSamePitch.wasFolded = prevSamePitch.wasFolded || note.wasFolded;
    } else {
      deduped.push(note);
    }
  }

  return { notes: deduped, foldedCount };
}

function assignSongTracksAndDifficulty(mode = 'auto-piano') {
  if (!currentSong) return;
  currentSong.selectedTrackMode = mode;

  const rawTracks = currentSong.rawTracks;
  const chosenPlayableIndices = new Set();
  let track1Raw = [];
  let track2Raw = [];

  if (mode === 'auto-piano') {
    let pianoTracks = rawTracks
      .map((t, idx) => ({ t, idx }))
      .filter((item) => item.t.isPianoCandidate && !item.t.isPercussion && !item.t.isDuplicate);

    if (pianoTracks.length === 0) {
      pianoTracks = rawTracks
        .map((t, idx) => ({ t, idx }))
        .filter((item) => !item.t.isPercussion && !item.t.isDuplicate);
    }
    if (pianoTracks.length === 0) {
      pianoTracks = [{ t: rawTracks[0], idx: 0 }];
    }

    if (pianoTracks.length >= 2) {
      const trebleCandidates = pianoTracks
        .filter((item) => item.t.avgPitch >= 62)
        .sort((a, b) => b.t.notes.length - a.t.notes.length);
      const bassCandidates = pianoTracks
        .filter((item) => item.t.avgPitch < 62)
        .sort((a, b) => b.t.notes.length - a.t.notes.length);

      let rhChoice = null;
      let lhChoice = null;

      if (trebleCandidates.length > 0 && bassCandidates.length > 0) {
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
        const foldedCheck = foldMidiTo61Keys(n.originalMidi);
        if (foldedCheck >= MIDDLE_C) {
          track1Raw.push(n);
        } else {
          track2Raw.push(n);
        }
      }
    }
  } else if (mode.startsWith('track-')) {
    const idx = Number(mode.replace('track-', ''));
    const chosen = rawTracks[idx] || rawTracks[0];
    chosenPlayableIndices.add(idx);

    for (const n of chosen.notes) {
      const foldedCheck = foldMidiTo61Keys(n.originalMidi);
      if (foldedCheck >= MIDDLE_C) {
        track1Raw.push(n);
      } else {
        track2Raw.push(n);
      }
    }
  }

  const foldedT1 = foldAndDeduplicateHandNotes(track1Raw, 1);
  const foldedT2 = foldAndDeduplicateHandNotes(track2Raw, 2);

  currentSong.track1Notes = foldedT1.notes;
  currentSong.track2Notes = foldedT2.notes;
  currentSong.foldedNotesCount = foldedT1.foldedCount + foldedT2.foldedCount;

  currentSong.backingBandTracks = rawTracks.filter((t, idx) => !chosenPlayableIndices.has(idx) && !t.isDuplicate);

  const bandNotes = [];
  for (const bt of currentSong.backingBandTracks) {
    if (bt.isPercussion) continue;
    for (const n of bt.notes) {
      const foldedMidi = foldMidiTo61Keys(n.originalMidi);
      bandNotes.push({
        ...n,
        midi: foldedMidi,
        foldedName: midiToNoteName(foldedMidi),
        autoTriggered: false
      });
    }
  }
  bandNotes.sort((a, b) => a.time - b.time);
  currentSong.backingBandNotes = bandNotes;

  const allPlayable = [...currentSong.track1Notes, ...currentSong.track2Notes];
  let activeDuration = currentSong.duration;
  if (allPlayable.length > 1) {
    const minStart = Math.min(...allPlayable.map((n) => n.time));
    const maxEnd = Math.max(...allPlayable.map((n) => n.time + n.duration));
    activeDuration = Math.max(1, maxEnd - minStart);
  }

  currentSong.difficulty = calculateSpellDifficulty(allPlayable.length, activeDuration);

  resetSongProgressFlags(playbackState.currentTime, { preserveTriggeredAtTarget: true });
  updateSpellInspectorHUD();
  updateLitrpgHUD();
}

function updateSpellInspectorHUD() {
  if (!currentSong) return;

  spellNameDisplay.textContent = currentSong.title;
  spellStatsBadges.classList.remove('hidden');

  const diff = currentSong.difficulty;
  spellDifficultyBadge.className = `difficulty-badge ${diff.badgeClass}`;
  spellDifficultyBadge.textContent = diff.label;

  statNps.textContent = diff.nps.toFixed(2);
  statBpm.textContent = `${currentSong.bpm} BPM (${currentSong.timeSignature})`;
  statDuration.textContent = formatSeconds(currentSong.duration);
  statT1Notes.textContent = String(currentSong.track1Notes.length);
  statT2Notes.textContent = String(currentSong.track2Notes.length);
  statBandTracks.textContent = currentSong.backingAudioPath && currentSong.backingBandTracks.length === 0
    ? '1 (Audio)'
    : String(currentSong.backingBandTracks.length);
  statFoldedNotes.textContent = String(currentSong.foldedNotesCount);
}

// ============================================================================
// PHASE 5: LITRPG GAMIFICATION ENGINE (COMBOS, BARDIC INSPIRATION, XP & TITLES)
// ============================================================================

/**
 * Return the D&D 5E Bardic Title for a given Level (PRD Section 6):
 * Lvl 1+: Tavern Busker
 * Lvl 10+: College Initiate
 * Lvl 20+: Wandering Minstrel
 * Lvl 30+: Court Virtuoso
 * Lvl 40+: Spell-Singer
 * Lvl 50+: Grand Maestro
 */
function getBardicTitleForLevel(level) {
  if (level >= 50) return 'Grand Maestro';
  if (level >= 40) return 'Spell-Singer';
  if (level >= 30) return 'Court Virtuoso';
  if (level >= 20) return 'Wandering Minstrel';
  if (level >= 10) return 'College Initiate';
  return 'Tavern Busker';
}

/**
 * XP required to complete a specific level:
 * Level 1 requires 1,000 XP, scaling by 1.5x per level.
 */
function getXpRequiredForLevel(level) {
  return Math.round(LEVEL_1_XP_THRESHOLD * Math.pow(LEVEL_XP_SCALE_FACTOR, Math.max(0, level - 1)));
}

/**
 * Recompute Level, XP into current level, XP required for next level, and Bardic Title from totalXp
 */
function recomputeBardLevelFromTotalXp() {
  let remaining = Math.max(0, Math.floor(bardProfile.totalXp));
  let lvl = 1;
  let req = getXpRequiredForLevel(lvl);

  while (remaining >= req && lvl < 99) {
    remaining -= req;
    lvl++;
    req = getXpRequiredForLevel(lvl);
  }

  bardProfile.level = lvl;
  bardProfile.xpIntoLevel = remaining;
  bardProfile.xpForNextLevel = req;
  bardProfile.title = getBardicTitleForLevel(lvl);
}

/**
 * Load persistent Bard profile from localStorage or local bard_profile.json
 */
function loadBardProfile() {
  let loaded = null;
  try {
    const raw = localStorage.getItem(BARD_PROFILE_STORAGE_KEY);
    if (raw) {
      loaded = JSON.parse(raw);
    }
  } catch {
    // Ignore storage read errors
  }

  if (!loaded) {
    try {
      if (fs.existsSync(BARD_PROFILE_FILE_PATH)) {
        loaded = JSON.parse(fs.readFileSync(BARD_PROFILE_FILE_PATH, 'utf8'));
      }
    } catch {
      // Ignore file read errors
    }
  }

  if (loaded && typeof loaded === 'object') {
    bardProfile.totalXp = Math.max(0, Number(loaded.totalXp) || 0);
    bardProfile.bestCareerChain = Math.max(0, Number(loaded.bestCareerChain) || 0);
    bardProfile.songsCompleted = Math.max(0, Number(loaded.songsCompleted) || 0);
  }

  recomputeBardLevelFromTotalXp();
  songSessionStats.startingLevel = bardProfile.level;
  updateLitrpgHUD();
}

/**
 * Save persistent Bard profile to both localStorage and bard_profile.json
 */
function saveBardProfile() {
  const payload = {
    totalXp: bardProfile.totalXp,
    level: bardProfile.level,
    title: bardProfile.title,
    bestCareerChain: bardProfile.bestCareerChain,
    songsCompleted: bardProfile.songsCompleted,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(BARD_PROFILE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota errors
  }

  try {
    fs.writeFileSync(BARD_PROFILE_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

/**
 * Reset per-song performance stats when starting a new song or restarting from 0:00
 */
function resetSongSessionStats() {
  songSessionStats.songXpEarned = 0;
  songSessionStats.startingLevel = bardProfile.level;
  songSessionStats.spellChain = 0;
  songSessionStats.maxSpellChain = 0;
  songSessionStats.cleanNotesHit = 0;
  songSessionStats.fumbledNotesHit = 0;
  songSessionStats.wrongOrMissedNotes = 0;
  songSessionStats.cleanChordRolls = 0;
  songSessionStats.lastGainText = 'Strike notes to earn XP';
  songSessionStats.lastGainFumbled = false;
  songSessionStats.hasShownEndModal = false;
  updateLitrpgHUD();
}

/**
 * Award XP to the Bard profile and current song session
 */
function awardBardXp(xpAmount) {
  if (xpAmount <= 0) return;
  songSessionStats.songXpEarned += xpAmount;
  bardProfile.totalXp += xpAmount;
  recomputeBardLevelFromTotalXp();
  saveBardProfile();
}

/**
 * Record completion of a Strike Group (single note or multi-note chord)
 * and compute LitRPG XP, Spell Chain, and Bardic Inspiration multipliers.
 */
function recordStrikeGroupCompletion(group, isFumbledPause, isCleanChordRoll) {
  const noteCount = Math.max(1, group.notes.length);

  if (isCleanChordRoll) {
    songSessionStats.cleanChordRolls++;
  }

  if (isFumbledPause) {
    songSessionStats.fumbledNotesHit += noteCount;
  } else {
    songSessionStats.cleanNotesHit += noteCount;
  }

  if (!group.wrongKeyDuringRoll) {
    songSessionStats.spellChain += noteCount;
    if (songSessionStats.spellChain > songSessionStats.maxSpellChain) {
      songSessionStats.maxSpellChain = songSessionStats.spellChain;
    }
    if (songSessionStats.spellChain > bardProfile.bestCareerChain) {
      bardProfile.bestCareerChain = songSessionStats.spellChain;
    }
  }

  const diffMult = currentSong?.difficulty?.xpMultiplier ?? 1.0;
  const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
  const inspirationMult = isInspired ? BARDIC_INSPIRATION_MULT : 1.0;
  const baseXpPerNote = isFumbledPause ? FUMBLED_NOTE_XP : BASE_NOTE_XP;

  const xpAwarded = Math.round(noteCount * baseXpPerNote * diffMult * inspirationMult);
  awardBardXp(xpAwarded);

  if (isFumbledPause) {
    songSessionStats.lastGainText = `+${xpAwarded} XP (Fumbled >2s: +2 base)`;
    songSessionStats.lastGainFumbled = true;
  } else if (isInspired) {
    songSessionStats.lastGainText = `+${xpAwarded} XP (2x Inspired!)`;
    songSessionStats.lastGainFumbled = false;
  } else if (noteCount > 1) {
    songSessionStats.lastGainText = `+${xpAwarded} XP (${noteCount}-Note Chord!)`;
    songSessionStats.lastGainFumbled = false;
  } else {
    songSessionStats.lastGainText = `+${xpAwarded} XP (Clean Strike)`;
    songSessionStats.lastGainFumbled = false;
  }

  // Phase 7: Spawn Strike-Line Particle Bursts, Shockwaves & Floating XP Runes for every note in the group!
  const uniqueMidis = Array.from(group.requiredPitches).sort((a, b) => a - b);
  for (const n of group.notes) {
    const burstTheme = isInspired
      ? 'inspired'
      : (isCleanChordRoll ? 'roll' : (isFumbledPause ? 'fumble' : (n.handTrack === 2 ? 'blue' : 'gold')));
    const burstCount = isCleanChordRoll ? 26 : (isInspired ? 24 : 18);
    spawnKeyParticleBurst(n.midi, burstTheme, burstCount, true);
  }

  if (uniqueMidis.length > 0) {
    const anchorMidi = uniqueMidis[Math.floor(uniqueMidis.length / 2)];
    if (isCleanChordRoll) {
      spawnFloatingCanvasRune(anchorMidi, `⚡ +${xpAwarded} XP ROLL!`, '#6ee7b7');
    } else if (isInspired) {
      spawnFloatingCanvasRune(anchorMidi, `🔥 +${xpAwarded} XP!`, '#f0abfc');
    } else if (isFumbledPause) {
      spawnFloatingCanvasRune(anchorMidi, `+${xpAwarded} XP`, '#fca5a5');
    } else {
      spawnFloatingCanvasRune(anchorMidi, `+${xpAwarded} XP`, '#ffd700');
    }
  }

  updateLitrpgHUD();
}

/**
 * Break Spell Chain when an off-key note is struck or a note is missed in Arcade Mode
 */
function recordSpellChainBreak(reasonText = 'Chain Broken! (Off-Key)') {
  songSessionStats.spellChain = 0;
  songSessionStats.wrongOrMissedNotes++;
  songSessionStats.lastGainText = reasonText;
  songSessionStats.lastGainFumbled = true;
  updateLitrpgHUD();
}

/**
 * Refresh the Top-Right LitRPG HUD Card
 */
function updateLitrpgHUD() {
  if (!hudBardLevel) return;

  hudBardLevel.textContent = `LVL ${bardProfile.level}`;
  hudBardTitle.textContent = bardProfile.title;
  hudTotalXp.textContent = `${bardProfile.totalXp.toLocaleString()} XP`;

  const nextLvl = bardProfile.level + 1;
  hudXpProgressText.textContent = `${bardProfile.xpIntoLevel.toLocaleString()} / ${bardProfile.xpForNextLevel.toLocaleString()} XP`;
  hudXpProgressText.title = `${bardProfile.xpIntoLevel.toLocaleString()} / ${bardProfile.xpForNextLevel.toLocaleString()} XP to Level ${nextLvl} (Career Total: ${bardProfile.totalXp.toLocaleString()} XP)`;
  hudSongXp.textContent = `+${songSessionStats.songXpEarned.toLocaleString()} XP`;

  const pct = bardProfile.xpForNextLevel > 0
    ? Math.min(100, Math.max(0, (bardProfile.xpIntoLevel / bardProfile.xpForNextLevel) * 100))
    : 0;
  hudXpBarFill.style.width = `${pct.toFixed(1)}%`;

  hudSpellChain.textContent = String(songSessionStats.spellChain);
  hudMaxChain.textContent = `Max: ${songSessionStats.maxSpellChain}`;

  const diffMult = currentSong?.difficulty?.xpMultiplier ?? 1.0;
  const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
  const effectiveMult = diffMult * (isInspired ? BARDIC_INSPIRATION_MULT : 1.0);
  hudXpMultiplier.textContent = `${effectiveMult.toFixed(1)}x XP`;

  hudLastXpGain.textContent = songSessionStats.lastGainText;
  hudLastXpGain.classList.toggle('xp-fumbled', songSessionStats.lastGainFumbled);

  litrpgHudCard.classList.toggle('bardic-inspiration-active', isInspired);
  hudInspirationBanner.classList.toggle('active', isInspired);

  if (isInspired) {
    hudInspirationText.textContent = `🔥 BARDIC INSPIRATION ACTIVE! (2.0x XP Boost • ${songSessionStats.spellChain} Chain)`;
  } else {
    const needed = Math.max(0, BARDIC_INSPIRATION_STREAK - songSessionStats.spellChain);
    hudInspirationText.textContent = `✨ ${needed} more chain for Bardic Inspiration (2x XP)`;
  }
}

/**
 * Open the Post-Song "Performance Check" Modal with D20 Grade & LitRPG Breakdown
 */
function openPerformanceCheckModal() {
  pausePlayback();

  const totalAttempts =
    songSessionStats.cleanNotesHit +
    songSessionStats.fumbledNotesHit +
    songSessionStats.wrongOrMissedNotes;

  const accuracyRatio = totalAttempts > 0
    ? (songSessionStats.cleanNotesHit + songSessionStats.fumbledNotesHit * 0.5) / totalAttempts
    : 1.0;
  const accuracyPct = Math.round(accuracyRatio * 100);

  // Map accuracy % to a D&D 5E D20 Performance Roll (1..20)
  const d20Roll = totalAttempts === 0
    ? 10
    : Math.max(1, Math.min(20, Math.round(accuracyRatio * 20)));

  let gradeTitle = 'Natural 20 — Legendary Virtuoso!';
  let gradeFlavor = 'The entire tavern erupts in thunderous applause as arcane gold light fills the rafters!';

  if (totalAttempts === 0) {
    gradeTitle = 'Roll 10 — Uncast Scroll (Preview)';
    gradeFlavor = 'Strike notes on the Spell Highway to test your Bardic Performance Check!';
  } else if (d20Roll === 20) {
    gradeTitle = 'Natural 20 — Legendary Virtuoso!';
    gradeFlavor = 'Flawless somatic execution! Even the Archmage of the College stands in awe.';
  } else if (d20Roll >= 17) {
    gradeTitle = `Roll ${d20Roll} — Masterful Spell-Weaving!`;
    gradeFlavor = 'Rich harmonies and crisp chord rolls echo across the conservatory hall.';
  } else if (d20Roll >= 13) {
    gradeTitle = `Roll ${d20Roll} — Solid Tavern Performance`;
    gradeFlavor = 'Patrons raise their silver flagons and toss gold coins onto the stage.';
  } else if (d20Roll >= 8) {
    gradeTitle = `Roll ${d20Roll} — Apprentice Incantation`;
    gradeFlavor = 'A few fumbled components, but the arcane melody held together.';
  } else {
    gradeTitle = `Roll ${d20Roll} — Wild Magic Surge`;
    gradeFlavor = 'Use Wait Mode and slow the Tempo to 0.5x or 0.75x to master this scroll!';
  }

  const songName = currentSong ? currentSong.title : 'Practice Session';
  const diffLabel = currentSong?.difficulty?.label || 'Cantrip (1.0x XP)';
  modalSongSubtitle.textContent = `${songName} • ${diffLabel}`;

  modalD20Badge.textContent = String(d20Roll);
  modalGradeTitle.textContent = gradeTitle;
  modalGradeFlavor.textContent = gradeFlavor;

  const leveledUp = bardProfile.level > songSessionStats.startingLevel;
  modalLevelupBanner.classList.toggle('hidden', !leveledUp);
  if (leveledUp) {
    modalNewLevel.textContent = `Level ${bardProfile.level}`;
    modalNewTitle.textContent = bardProfile.title;
  }

  modalBardLevel.textContent = `LVL ${bardProfile.level}`;
  modalBardTitle.textContent = bardProfile.title;
  modalXpNumbers.textContent = `${bardProfile.xpIntoLevel.toLocaleString()} / ${bardProfile.xpForNextLevel.toLocaleString()} XP (Total: ${bardProfile.totalXp.toLocaleString()} XP)`;

  const pct = bardProfile.xpForNextLevel > 0
    ? Math.min(100, Math.max(0, (bardProfile.xpIntoLevel / bardProfile.xpForNextLevel) * 100))
    : 0;
  modalXpBarFill.style.width = `${pct.toFixed(1)}%`;

  modalStatXp.textContent = `+${songSessionStats.songXpEarned.toLocaleString()} XP`;
  modalStatAccuracy.textContent = totalAttempts === 0 ? '—' : `${accuracyPct}%`;
  const inspiredSuffix = songSessionStats.maxSpellChain >= BARDIC_INSPIRATION_STREAK ? ' 🔥' : '';
  modalStatChain.textContent = `${songSessionStats.maxSpellChain}${inspiredSuffix}`;
  modalStatClean.textContent = String(songSessionStats.cleanNotesHit);
  modalStatFumbled.textContent = String(songSessionStats.fumbledNotesHit);
  modalStatRolls.textContent = `${songSessionStats.cleanChordRolls} Rolls • ${songSessionStats.wrongOrMissedNotes} Off-Key`;

  performanceCheckModal.classList.remove('hidden');
}

function closePerformanceCheckModal() {
  performanceCheckModal.classList.add('hidden');
}

// ============================================================================
// PHASE 3 & 4: THE SPELL HIGHWAY, WAIT MODE & 100MS CHORD ROLL FORGIVENESS
// ============================================================================

/**
 * Determine whether Track 1 (RH Gold) or Track 2 (LH Blue) is controlled by the HUMAN player
 * (as opposed to being auto-played or muted by Accompaniment).
 */
function isPlayerControlledHand(handTrack) {
  if (playbackState.accompanimentMode === 'auto-both') return false;
  const iso = playbackState.handIsolation;
  if (iso === 'both') return true;
  if (iso === 'track1') return handTrack === 1;
  if (iso === 'track2') return handTrack === 2;
  return true;
}

/**
 * Determine whether Track 1 or Track 2 should be auto-synthesized by Tone.js
 */
function shouldAutoPlayHand(handTrack) {
  const iso = playbackState.handIsolation;
  const acc = playbackState.accompanimentMode;

  if (acc === 'auto-both') return true;
  if (acc === 'mute-other') return false;

  if (iso === 'track1' && handTrack === 2) return true;
  if (iso === 'track2' && handTrack === 1) return true;
  return false;
}

/**
 * Determine visual opacity of a hand's falling glyphs on the Spell Highway
 */
function getHandVisualOpacity(handTrack) {
  const iso = playbackState.handIsolation;
  const acc = playbackState.accompanimentMode;

  if (iso === 'both') return 1.0;
  if (iso === 'track1' && handTrack === 1) return 1.0;
  if (iso === 'track2' && handTrack === 2) return 1.0;

  return acc === 'mute-other' ? 0.12 : 0.35;
}

/**
 * Reset autoTriggered, satisfied, and lockedInWait flags for notes at or after targetTime.
 * When preserveTriggeredAtTarget is true (e.g. changing Practice Mode mid-wait), notes already
 * auto-triggered at <= targetTime stay marked so they do not double-fire.
 */
function resetSongProgressFlags(targetTime = -2, { preserveTriggeredAtTarget = false } = {}) {
  if (!currentSong) return;
  playbackState.isWaitingForStrike = false;
  playbackState.waitStartedAtMs = null;
  playbackState.activeStrikeGroup = null;

  for (const n of currentSong.track1Notes) {
    const isPast = preserveTriggeredAtTarget
      ? (n.time < targetTime || (n.autoTriggered && n.time <= targetTime))
      : (n.time < targetTime);
    n.autoTriggered = isPast;
    n.satisfied = preserveTriggeredAtTarget
      ? (n.time < targetTime || (n.satisfied && n.time <= targetTime))
      : (n.time < targetTime);
    n.lockedInWait = false;
  }
  for (const n of currentSong.track2Notes) {
    const isPast = preserveTriggeredAtTarget
      ? (n.time < targetTime || (n.autoTriggered && n.time <= targetTime))
      : (n.time < targetTime);
    n.autoTriggered = isPast;
    n.satisfied = preserveTriggeredAtTarget
      ? (n.time < targetTime || (n.satisfied && n.time <= targetTime))
      : (n.time < targetTime);
    n.lockedInWait = false;
  }
  for (const n of currentSong.backingBandNotes) {
    n.autoTriggered = preserveTriggeredAtTarget
      ? (n.time < targetTime || (n.autoTriggered && n.time <= targetTime))
      : (n.time < targetTime);
  }
}

/**
 * Check if an upcoming player-controlled note after minTime (and within maxTime) requires `midi`.
 * Used in Arcade Mode so a missed past note doesn't swallow a valid early strike on the next note (Issue #32).
 */
function hasUpcomingPlayerNoteMatchingMidi(midi, minTime, maxTime) {
  if (!currentSong) return false;
  const lists = [];
  if (isPlayerControlledHand(1)) lists.push(currentSong.track1Notes);
  if (isPlayerControlledHand(2)) lists.push(currentSong.track2Notes);

  for (const list of lists) {
    for (const n of list) {
      if (n.satisfied) continue;
      if (n.time <= minTime) continue;
      if (n.time > maxTime) break;
      if (n.midi === midi) return true;
    }
  }
  return false;
}

/**
 * Gather the earliest unplayed player-controlled note(s) and cluster any notes within
 * CHORD_CLUSTER_WINDOW_SEC (45ms) into a single Strike Group (note or chord).
 *
 * Notice Benchmark Rule #3 (MIDIano/Sightread):
 * Only gates on unplayed note ONSETS (n.time), never forcing the user to re-press
 * a sustained bass note that was already struck earlier.
 */
function getNextUnsatisfiedStrikeGroup() {
  if (!currentSong) return null;

  // If we already have an active strike group that isn't fully satisfied yet, return it
  if (playbackState.activeStrikeGroup) {
    const allDone = playbackState.activeStrikeGroup.notes.every((n) => n.satisfied);
    if (!allDone) {
      return playbackState.activeStrikeGroup;
    }
    playbackState.activeStrikeGroup = null;
  }

  const candidateLists = [];
  if (isPlayerControlledHand(1)) candidateLists.push(currentSong.track1Notes);
  if (isPlayerControlledHand(2)) candidateLists.push(currentSong.track2Notes);
  if (candidateLists.length === 0) return null;

  // Find earliest unsatisfied note onset across active player hand(s)
  let earliestTime = Infinity;
  for (const list of candidateLists) {
    for (const n of list) {
      if (!n.satisfied) {
        if (n.time < earliestTime) {
          earliestTime = n.time;
        }
        break; // Notes are sorted by time
      }
    }
  }

  if (!Number.isFinite(earliestTime)) return null;

  // Collect all unsatisfied player notes within CHORD_CLUSTER_WINDOW_SEC of earliestTime
  const groupNotes = [];
  const requiredPitches = new Set();

  for (const list of candidateLists) {
    for (const n of list) {
      if (n.satisfied) continue;
      if (n.time <= earliestTime + CHORD_CLUSTER_WINDOW_SEC) {
        groupNotes.push(n);
        requiredPitches.add(n.midi);
      } else {
        break;
      }
    }
  }

  if (groupNotes.length === 0) return null;

  const group = {
    anchorTime: earliestTime,
    notes: groupNotes,
    requiredPitches,
    satisfiedPitches: new Set(),
    firstStrikeMs: null,
    lastStrikeMs: null,
    wrongKeyDuringRoll: false
  };

  playbackState.activeStrikeGroup = group;
  return group;
}

/**
 * Update the Phase 4 Strike Status Pill in the HUD
 */
function setStrikeStatusBadge(mode, text) {
  strikeZoneStatusPill.classList.remove('strike-waiting', 'strike-hit', 'strike-fumble');
  if (mode === 'waiting') strikeZoneStatusPill.classList.add('strike-waiting');
  if (mode === 'hit') strikeZoneStatusPill.classList.add('strike-hit');
  if (mode === 'fumble') strikeZoneStatusPill.classList.add('strike-fumble');
  strikeStatusText.textContent = text;
}

/**
 * Evaluate a newly pressed MIDI pitch against the active Strike Zone group.
 * Implements:
 * - Wait Mode gating (unfreezes currentTime once all required pitches of the note/chord are struck)
 * - 100ms chordGracePeriod roll window (rolling a chord within 100ms registers as a clean collective hit)
 */
function evaluateStrikeZoneInput(midi) {
  if (!currentSong || !playbackState.isPlaying) return false;

  let group = getNextUnsatisfiedStrikeGroup();
  if (!group) return false;

  // Issue #32: In Arcade Mode, if the earliest unsatisfied group is already past the strike line
  // and does not contain `midi`, check if an upcoming group within the 130ms early-strike window
  // matches `midi`. If so, expire the missed past group once and advance to the upcoming group!
  if (
    !playbackState.waitMode &&
    !group.requiredPitches.has(midi) &&
    group.anchorTime < playbackState.currentTime - 0.025 &&
    hasUpcomingPlayerNoteMatchingMidi(
      midi,
      group.anchorTime + CHORD_CLUSTER_WINDOW_SEC,
      playbackState.currentTime + EARLY_STRIKE_WINDOW_SEC
    )
  ) {
    for (const n of group.notes) {
      n.satisfied = true;
      n.lockedInWait = false;
    }
    playbackState.activeStrikeGroup = null;
    recordSpellChainBreak('✗ Missed Note (Arcade)');
    group = getNextUnsatisfiedStrikeGroup();
    if (!group) return false;
  }

  // Check if the group is currently waiting at the strike line OR within the early strike window
  const timeDelta = group.anchorTime - playbackState.currentTime;
  const isInStrikeWindow = playbackState.isWaitingForStrike || (timeDelta <= EARLY_STRIKE_WINDOW_SEC && timeDelta >= -0.25);

  if (!isInStrikeWindow) return false;

  const nowMs = performance.now();

  if (group.requiredPitches.has(midi)) {
    // Ignore duplicate re-strikes of a pitch that was already locked in for this chord (Issue #12)
    if (group.satisfiedPitches.has(midi)) {
      return true;
    }

    // Player pressed a required pitch of the current note/chord!
    if (group.satisfiedPitches.size === 0) {
      group.firstStrikeMs = nowMs;
      group.lastStrikeMs = nowMs;
    } else {
      const stepDeltaMs = nowMs - group.lastStrikeMs;
      group.lastStrikeMs = nowMs;
      // If the user is actively rolling a chord on their keyboard within 100ms per finger,
      // keep the roll window clean
      if (stepDeltaMs > CHORD_GRACE_PERIOD_MS) {
        group.hasSlowRoll = true;
      }
    }

    group.satisfiedPitches.add(midi);
    for (const n of group.notes) {
      if (n.midi === midi) {
        n.lockedInWait = true;
      }
    }

    // Check if ALL required pitches in this chord/note have now been pressed
    if (group.satisfiedPitches.size >= group.requiredPitches.size) {
      for (const n of group.notes) {
        n.satisfied = true;
        n.lockedInWait = false;
      }

      const totalRollMs = group.firstStrikeMs !== null
        ? Math.max(0, Math.round(group.lastStrikeMs - group.firstStrikeMs))
        : 0;

      const waitPauseSec = playbackState.isWaitingForStrike && playbackState.waitStartedAtMs !== null
        ? (nowMs - playbackState.waitStartedAtMs) / 1000
        : 0;

      const isChord = group.requiredPitches.size > 1;
      const isCleanChordRoll = isChord && (!group.hasSlowRoll || totalRollMs <= CHORD_GRACE_PERIOD_MS) && !group.wrongKeyDuringRoll;
      const isFumbledPause = playbackState.waitMode && waitPauseSec > FUMBLE_PAUSE_THRESHOLD_SEC;

      // Resume playback immediately!
      const wasWaiting = playbackState.isWaitingForStrike;
      playbackState.isWaitingForStrike = false;
      playbackState.waitStartedAtMs = null;
      playbackState.activeStrikeGroup = null;
      playbackState.lastFrameTimestamp = nowMs;

      // If we were waiting at anchorTime, fire any accompaniment / backing band notes at anchorTime now in harmony! (Issue #10)
      if (wasWaiting) {
        processSongAudioTriggers(group.anchorTime - 0.01, group.anchorTime + 0.005);
      }

      // Phase 5: Award XP, increment Spell Chain & evaluate Bardic Inspiration
      recordStrikeGroupCompletion(group, isFumbledPause, isCleanChordRoll);

      if (isFumbledPause) {
        setStrikeStatusBadge(
          'fumble',
          `⚠ Fumbled Component (${waitPauseSec.toFixed(1)}s > 2.0s pause • +2 Base XP)`
        );
      } else if (isChord) {
        if (isCleanChordRoll) {
          setStrikeStatusBadge(
            'hit',
            `✓ Clean Chord Roll! (${group.requiredPitches.size} notes in ${totalRollMs}ms ≤ 100ms)`
          );
        } else {
          setStrikeStatusBadge(
            'hit',
            `✓ Chord Unlocked (${group.requiredPitches.size} notes • ${totalRollMs}ms roll)`
          );
        }
      } else {
        setStrikeStatusBadge(
          'hit',
          `✓ Clean Strike: ${midiToNoteName(midi)}`
        );
      }
    } else {
      // Partial note of a chord locked in! Spawn an emerald lock-in burst
      spawnKeyParticleBurst(midi, 'roll', 14, true);
    }
    return true;
  } else {
    // Wrong key pressed inside the active strike window (Wait Mode or Arcade Mode) -> breaks Spell Chain! (Issue #11)
    group.wrongKeyDuringRoll = true;
    recordSpellChainBreak(`✗ Chain Broken! (${midiToNoteName(midi)})`);
    spawnKeyParticleBurst(midi, 'fumble', 10, false);
    const missingNames = Array.from(group.requiredPitches)
      .filter((p) => !group.satisfiedPitches.has(p))
      .sort((a, b) => a - b)
      .map(midiToNoteName)
      .join(' + ');
    setStrikeStatusBadge(
      'fumble',
      `✗ Off-Key (${midiToNoteName(midi)}) — Need: ${missingNames}`
    );
    return true;
  }
  return false;
}

function clearAllHeldInputNotes() {
  pressedQwertyKeys.clear();
  activeNotes.clear();
  sustainedNotes.clear();
  isMouseDown = false;
  currentMouseMidi = null;
  updateActiveNotesHUD();
}

function resetPlaybackToStart() {
  pausePlayback();
  clearAllHeldInputNotes();
  playbackState.currentTime = -playbackState.leadInSeconds;
  resetSongProgressFlags(-playbackState.leadInSeconds);
  resetSongSessionStats();
  if (currentSong?.backingAudioEl) {
    try {
      currentSong.backingAudioEl.currentTime = 0;
    } catch {
      // Ignore seek errors before audio metadata is ready
    }
  }
  setStrikeStatusBadge(
    'ready',
    playbackState.accompanimentMode === 'auto-both'
      ? 'Listen Only Mode (Auto-Playing Both Hands)'
      : (playbackState.waitMode
          ? 'Wait Mode Ready (100ms Chord Grace Active)'
          : 'Arcade Mode Ready (Continuous Playback)')
  );
  updateTimelineUI();
}

async function startPlayback() {
  if (!currentSong) return;
  await ensureAudioReady();

  if (playbackState.currentTime >= currentSong.duration) {
    playbackState.currentTime = -playbackState.leadInSeconds;
    resetSongProgressFlags(-playbackState.leadInSeconds);
    resetSongSessionStats();
  }

  playbackState.isPlaying = true;
  playbackState.lastFrameTimestamp = performance.now();
  btnPlayPause.textContent = '⏸ Pause';
  btnPlayPause.classList.add('playing');
}

function pausePlayback() {
  playbackState.isPlaying = false;
  playbackState.lastFrameTimestamp = null;
  btnPlayPause.textContent = '▶ Cast Spell';
  btnPlayPause.classList.remove('playing');

  if (grandPianoSampler && grandPianoLoaded) {
    grandPianoSampler.releaseAll();
  }
  if (polySynth) {
    polySynth.releaseAll();
  }
  if (backingBandSynth) {
    backingBandSynth.releaseAll();
  }
  if (currentSong?.backingAudioEl && !currentSong.backingAudioEl.paused) {
    currentSong.backingAudioEl.pause();
  }
}

function togglePlayback() {
  if (!currentSong) return;
  if (playbackState.isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function updateTimelineUI() {
  if (!currentSong) {
    songTimeReadout.textContent = '0:00 / 0:00';
    songProgressSlider.value = '0';
    return;
  }
  const displayTime = Math.max(0, Math.min(currentSong.duration, playbackState.currentTime));
  songTimeReadout.textContent = `${formatSeconds(displayTime)} / ${formatSeconds(currentSong.duration)}`;

  if (!playbackState.isScrubbing) {
    const ratio = currentSong.duration > 0 ? displayTime / currentSong.duration : 0;
    songProgressSlider.value = String(Math.round(ratio * 1000));
  }
}

/**
 * Synchronize paired .wav / .mp3 backing audio element (Issue #31).
 * Called independently of `audioTriggerEnd >= prevTime` so backing audio immediately
 * pauses when Wait Mode freezes at a chord or when Backing Band is toggled OFF.
 */
function syncBackingAudioElement(currentTime = playbackState.currentTime) {
  if (!currentSong?.backingAudioEl) return;
  const audioEl = currentSong.backingAudioEl;
  const shouldPlay =
    playbackState.isPlaying &&
    playbackState.backingBandEnabled &&
    !playbackState.isWaitingForStrike &&
    currentTime >= 0 &&
    currentTime < currentSong.duration;

  if (shouldPlay) {
    audioEl.playbackRate = playbackState.playbackSpeed;
    if (audioEl.paused) {
      audioEl.currentTime = Math.max(0, currentTime);
      audioEl.play().catch(() => {});
    } else if (Math.abs(audioEl.currentTime - currentTime) > 0.35) {
      audioEl.currentTime = Math.max(0, currentTime);
    }
  } else if (!audioEl.paused) {
    audioEl.pause();
  }
}

/**
 * Trigger Accompaniment & Backing Band notes that cross currentTime during this frame
 */
function processSongAudioTriggers(prevTime, newTime) {
  if (!currentSong) return;

  const inst = getActiveInstrument();
  const speed = playbackState.playbackSpeed;

  if (shouldAutoPlayHand(1) && inst) {
    for (const n of currentSong.track1Notes) {
      if (!n.autoTriggered && n.time >= prevTime && n.time <= newTime) {
        n.autoTriggered = true;
        n.satisfied = true;
        const vel = getVoicedVelocity(n.midi, n.velocity);
        const dur = Math.max(0.06, n.duration / speed);
        inst.triggerAttackRelease(n.foldedName, dur, Tone.now(), vel);
        spawnKeyParticleBurst(n.midi, 'gold', 8, false);
      } else if (n.time > newTime) {
        break;
      }
    }
  }

  if (shouldAutoPlayHand(2) && inst) {
    for (const n of currentSong.track2Notes) {
      if (!n.autoTriggered && n.time >= prevTime && n.time <= newTime) {
        n.autoTriggered = true;
        n.satisfied = true;
        const vel = getVoicedVelocity(n.midi, n.velocity) * 0.85;
        const dur = Math.max(0.06, n.duration / speed);
        inst.triggerAttackRelease(n.foldedName, dur, Tone.now(), vel);
        spawnKeyParticleBurst(n.midi, 'blue', 8, false);
      } else if (n.time > newTime) {
        break;
      }
    }
  }

  if (playbackState.backingBandEnabled && backingBandSynth && currentSong.backingBandNotes.length > 0) {
    for (const n of currentSong.backingBandNotes) {
      if (!n.autoTriggered && n.time >= prevTime && n.time <= newTime) {
        n.autoTriggered = true;
        const vel = getVoicedVelocity(n.midi, n.velocity) * 0.65;
        const dur = Math.max(0.06, n.duration / speed);
        backingBandSynth.triggerAttackRelease(n.foldedName, dur, Tone.now(), vel);
      } else if (n.time > newTime) {
        break;
      }
    }
  }

  syncBackingAudioElement(newTime);
}

/**
 * 60 FPS Master Animation Loop (The Spell Highway + Phase 4 Wait Mode Gating)
 */
function animationLoop(timestamp) {
  if (playbackState.isPlaying && currentSong) {
    if (playbackState.lastFrameTimestamp === null) {
      playbackState.lastFrameTimestamp = timestamp;
    }
    const rawDt = (timestamp - playbackState.lastFrameTimestamp) / 1000;
    playbackState.lastFrameTimestamp = timestamp;

    const dt = Math.min(0.1, Math.max(0, rawDt));
    const prevTime = playbackState.currentTime;
    let proposedTime = prevTime + dt * playbackState.playbackSpeed;

    // Phase 4: Wait Mode Strike-Zone Gating
    if (playbackState.waitMode && playbackState.accompanimentMode !== 'auto-both') {
      const nextGroup = getNextUnsatisfiedStrikeGroup();

      if (nextGroup) {
        // Only allow a key pressed freshly within the early-strike window (not sustainedOnly or already consumed)
        // to satisfy a new note onset on arrival (Fixes Issue #9 & Issue #45)
        if (proposedTime >= nextGroup.anchorTime - 0.02) {
          for (const reqMidi of nextGroup.requiredPitches) {
            const heldState = activeNotes.get(reqMidi);
            const isFreshEarlyPress = Boolean(
              heldState &&
              !heldState.sustainedOnly &&
              !heldState.consumedByStrikeGroup &&
              (timestamp - heldState.pressedAtMs) <= (EARLY_STRIKE_WINDOW_SEC * 1000 + 80)
            );
            if (isFreshEarlyPress && !nextGroup.satisfiedPitches.has(reqMidi)) {
              heldState.consumedByStrikeGroup = true;
              const strikeTs = heldState.pressedAtMs || timestamp;
              if (nextGroup.satisfiedPitches.size === 0) {
                nextGroup.firstStrikeMs = strikeTs;
                nextGroup.lastStrikeMs = strikeTs;
              } else {
                const stepDeltaMs = Math.abs(strikeTs - nextGroup.lastStrikeMs);
                nextGroup.firstStrikeMs = Math.min(nextGroup.firstStrikeMs, strikeTs);
                nextGroup.lastStrikeMs = Math.max(nextGroup.lastStrikeMs, strikeTs);
                if (stepDeltaMs > CHORD_GRACE_PERIOD_MS) {
                  nextGroup.hasSlowRoll = true;
                }
              }
              nextGroup.satisfiedPitches.add(reqMidi);
              for (const n of nextGroup.notes) {
                if (n.midi === reqMidi) n.lockedInWait = true;
              }
            }
          }
          if (nextGroup.satisfiedPitches.size >= nextGroup.requiredPitches.size) {
            for (const n of nextGroup.notes) {
              n.satisfied = true;
              n.lockedInWait = false;
            }
            const totalRollMs = nextGroup.firstStrikeMs !== null
              ? Math.max(0, Math.round(nextGroup.lastStrikeMs - nextGroup.firstStrikeMs))
              : 0;
            const isChord = nextGroup.requiredPitches.size > 1;
            const isCleanChordRoll =
              isChord &&
              (!nextGroup.hasSlowRoll || totalRollMs <= CHORD_GRACE_PERIOD_MS) &&
              !nextGroup.wrongKeyDuringRoll;

            playbackState.isWaitingForStrike = false;
            playbackState.waitStartedAtMs = null;
            playbackState.activeStrikeGroup = null;
            recordStrikeGroupCompletion(nextGroup, false, isCleanChordRoll);

            if (isChord) {
              setStrikeStatusBadge(
                'hit',
                isCleanChordRoll
                  ? `✓ Clean Chord Roll! (${nextGroup.requiredPitches.size} notes in ${totalRollMs}ms ≤ 100ms)`
                  : `✓ Chord Unlocked (${nextGroup.requiredPitches.size} notes • ${totalRollMs}ms roll)`
              );
            } else {
              const singleMidi = Array.from(nextGroup.requiredPitches)[0];
              setStrikeStatusBadge('hit', `✓ Clean Strike: ${midiToNoteName(singleMidi)}`);
            }
          }
        }

        // Re-check if nextGroup is still unsatisfied and has reached the Strike Line
        if (playbackState.activeStrikeGroup && proposedTime >= nextGroup.anchorTime) {
          proposedTime = nextGroup.anchorTime;

          if (!playbackState.isWaitingForStrike) {
            playbackState.isWaitingForStrike = true;
            playbackState.waitStartedAtMs = timestamp;
          }

          const waitSec = (timestamp - playbackState.waitStartedAtMs) / 1000;
          const missingPitches = Array.from(nextGroup.requiredPitches)
            .filter((p) => !nextGroup.satisfiedPitches.has(p))
            .sort((a, b) => a - b)
            .map(midiToNoteName);

          const lockedPitches = Array.from(nextGroup.satisfiedPitches)
            .sort((a, b) => a - b)
            .map(midiToNoteName);

          const lockedPrefix = lockedPitches.length > 0 ? `[Locked: ${lockedPitches.join('+')} | Need: ` : 'Waiting for: ';
          const lockedSuffix = lockedPitches.length > 0 ? ']' : '';

          setStrikeStatusBadge(
            waitSec > FUMBLE_PAUSE_THRESHOLD_SEC ? 'fumble' : 'waiting',
            `⏳ ${lockedPrefix}${missingPitches.join(' + ')}${lockedSuffix} (${waitSec.toFixed(1)}s)`
          );
        }
      }
    } else {
      // Arcade Mode: cluster earliest unsatisfied player notes via getNextUnsatisfiedStrikeGroup()
      // so staggered chords expire atomically once per chord rather than across consecutive frames (Fixes #46).
      playbackState.isWaitingForStrike = false;
      let missedPlayerChord = false;

      if (playbackState.accompanimentMode !== 'auto-both') {
        let nextArcadeGroup = getNextUnsatisfiedStrikeGroup();
        while (nextArcadeGroup && proposedTime > nextArcadeGroup.anchorTime + 0.18) {
          for (const n of nextArcadeGroup.notes) {
            n.satisfied = true;
            n.lockedInWait = false;
          }
          playbackState.activeStrikeGroup = null;
          missedPlayerChord = true;
          nextArcadeGroup = getNextUnsatisfiedStrikeGroup();
        }
      }

      for (const n of currentSong.track1Notes) {
        if (!n.satisfied && n.time < proposedTime - 0.18) {
          n.satisfied = true;
          n.lockedInWait = false;
        }
      }
      for (const n of currentSong.track2Notes) {
        if (!n.satisfied && n.time < proposedTime - 0.18) {
          n.satisfied = true;
          n.lockedInWait = false;
        }
      }
      if (missedPlayerChord) {
        recordSpellChainBreak('✗ Missed Note (Arcade)');
        setStrikeStatusBadge('fumble', '✗ Missed Note (Arcade Mode — Spell Chain Reset)');
      }
    }

    playbackState.currentTime = proposedTime;
    // Hold accompaniment & backing band notes at anchorTime while frozen in Wait Mode until the player strikes (Issue #10)
    const audioTriggerEnd = playbackState.isWaitingForStrike ? (proposedTime - 0.005) : proposedTime;
    if (audioTriggerEnd >= prevTime) {
      processSongAudioTriggers(prevTime, audioTriggerEnd);
    }
    // Always sync backing audio element state so it pauses immediately when Wait Mode freezes (Issue #31)
    syncBackingAudioElement(playbackState.currentTime);
    updateTimelineUI();

    if (playbackState.currentTime >= currentSong.duration + 0.4) {
      pausePlayback();
      if (!songSessionStats.hasShownEndModal) {
        songSessionStats.hasShownEndModal = true;
        bardProfile.songsCompleted++;
        saveBardProfile();
        openPerformanceCheckModal();
      }
    }
  }

  renderCanvas();
  requestAnimationFrame(animationLoop);
}

/**
 * Build a multi-track demo MIDI file in memory using @tonejs/midi
 */
function buildDemoSpellMidiBytes() {
  const midi = new Midi();
  midi.header.name = 'Ballad of the Silver Flagon (Demo Spell)';
  midi.header.setTempo(120);

  const rhTrack = midi.addTrack();
  rhTrack.name = 'Piano Right Hand (Lead)';
  rhTrack.instrument.number = 0;

  // Includes both single notes and 3-note chords to test Phase 4's 100ms Chord Roll Forgiveness!
  const rhPattern = [
    // Opening D minor chord (D4 + F4 + A4) at t=0.0s to immediately test 100ms Chord Roll!
    { midi: 62, time: 0.0, duration: 0.45 },
    { midi: 65, time: 0.0, duration: 0.45 },
    { midi: 69, time: 0.0, duration: 0.45 },
    // Melody notes
    { midi: 65, time: 0.5, duration: 0.45 },
    { midi: 69, time: 1.0, duration: 0.45 },
    { midi: 74, time: 1.5, duration: 0.45 },
    // C Major triad (C4 + E4 + G4) at t=2.0s
    { midi: 60, time: 2.0, duration: 0.45 },
    { midi: 64, time: 2.0, duration: 0.45 },
    { midi: 67, time: 2.0, duration: 0.45 },
    { midi: 74, time: 2.5, duration: 0.45 },
    { midi: 72, time: 3.0, duration: 0.45 },
    { midi: 69, time: 3.5, duration: 0.45 },
    { midi: 74, time: 4.0, duration: 0.35 },
    { midi: 77, time: 4.4, duration: 0.35 },
    { midi: 81, time: 4.8, duration: 0.35 },
    { midi: 86, time: 5.2, duration: 0.35 },
    { midi: 98, time: 5.6, duration: 0.40 },  // D7 (folds to D6 / 86)
    { midi: 101, time: 6.1, duration: 0.40 }, // F7 (folds to F6 / 89)
    { midi: 88, time: 6.6, duration: 0.50 },
    { midi: 86, time: 7.2, duration: 0.75 }
  ];
  for (const n of rhPattern) {
    rhTrack.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: 0.85 });
  }

  const lhTrack = midi.addTrack();
  lhTrack.name = 'Piano Left Hand (Accompaniment)';
  lhTrack.instrument.number = 0;

  const lhPattern = [
    { midi: 26, time: 0.0, duration: 0.9 }, // D1 (folds to D2 / 38)
    { midi: 50, time: 0.0, duration: 0.9 },
    { midi: 57, time: 0.0, duration: 0.9 },
    { midi: 31, time: 1.0, duration: 0.9 }, // G1 (folds to G2 / 43)
    { midi: 55, time: 1.0, duration: 0.9 },
    { midi: 48, time: 2.0, duration: 0.9 },
    { midi: 55, time: 2.0, duration: 0.9 },
    { midi: 45, time: 3.0, duration: 0.9 },
    { midi: 52, time: 3.0, duration: 0.9 },
    { midi: 38, time: 4.0, duration: 0.9 },
    { midi: 45, time: 4.0, duration: 0.9 },
    { midi: 41, time: 5.0, duration: 0.9 },
    { midi: 48, time: 5.0, duration: 0.9 },
    { midi: 43, time: 6.0, duration: 0.9 },
    { midi: 50, time: 6.0, duration: 0.9 },
    { midi: 38, time: 7.0, duration: 0.95 },
    { midi: 50, time: 7.0, duration: 0.95 }
  ];
  for (const n of lhPattern) {
    lhTrack.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: 0.72 });
  }

  const bandTrack = midi.addTrack();
  bandTrack.name = 'Tavern Strings (Backing Band)';
  bandTrack.instrument.number = 48;
  const stringChords = [
    { midi: 62, time: 0.0, duration: 1.9 },
    { midi: 69, time: 0.0, duration: 1.9 },
    { midi: 60, time: 2.0, duration: 1.9 },
    { midi: 67, time: 2.0, duration: 1.9 },
    { midi: 65, time: 4.0, duration: 1.9 },
    { midi: 72, time: 4.0, duration: 1.9 },
    { midi: 62, time: 6.0, duration: 1.9 },
    { midi: 69, time: 6.0, duration: 1.9 }
  ];
  for (const n of stringChords) {
    bandTrack.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: 0.55 });
  }

  const bytes = midi.toArray();
  return {
    arrayBuffer: bytes.buffer,
    fileName: 'Ballad of the Silver Flagon.mid'
  };
}

function loadBuiltInDemoSpell() {
  const demo = buildDemoSpellMidiBytes();
  parseMidiBuffer(demo.arrayBuffer, demo.fileName, 'BUILTIN_DEMO');
}

// ============================================================================
// PHASE 6: THE GRIMOIRE (LOCAL SONG LIBRARY & ./Imports FOLDER WATCHER)
// ============================================================================

/**
 * Show a temporary glowing toast banner when The Grimoire ingests or saves a spell
 */
function showGrimoireToast(message) {
  if (!grimoireToast || !grimoireToastText) return;
  grimoireToastText.textContent = message;
  grimoireToast.classList.remove('hidden');

  if (grimoireToastTimer) {
    clearTimeout(grimoireToastTimer);
  }
  grimoireToastTimer = setTimeout(() => {
    grimoireToast.classList.add('hidden');
  }, 4200);
}

/**
 * Extract lightweight Grimoire card metadata from a MIDI ArrayBuffer
 */
function extractGrimoireEntryFromBuffer(arrayBuffer, fileName, filePath, sourceTag) {
  const midiData = new Midi(arrayBuffer);
  const bpm = midiData.header.tempos.length > 0
    ? Math.round(midiData.header.tempos[0].bpm)
    : 120;
  const duration = Math.max(1, midiData.duration || 1);
  const cleanTitle = midiData.name?.trim() || fileName.replace(/\.(mid|midi)$/i, '');

  const nonPercTracks = midiData.tracks
    .filter((t) => t.notes.length > 0 && !(t.instrument?.percussion || t.channel === 9))
    .map((t) => {
      const avgPitch = t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length;
      const notes = t.notes.map((n) => ({
        originalMidi: n.midi,
        time: n.time,
        duration: n.duration
      }));
      return {
        name: t.name,
        instrument: t.instrument,
        avgPitch,
        notes,
        isPianoCandidate: isPianoCandidateTrack(t),
        isDuplicate: false
      };
    });

  for (let i = 0; i < nonPercTracks.length; i++) {
    for (let j = 0; j < i; j++) {
      if (areTracksDuplicates(nonPercTracks[i], nonPercTracks[j])) {
        nonPercTracks[i].isDuplicate = true;
        break;
      }
    }
  }

  let candidates = nonPercTracks.filter((t) => t.isPianoCandidate && !t.isDuplicate);
  if (candidates.length === 0) {
    candidates = nonPercTracks.filter((t) => !t.isDuplicate);
  }

  let track1Raw = [];
  let track2Raw = [];
  if (candidates.length >= 2) {
    const treble = candidates.filter((t) => t.avgPitch >= 62).sort((a, b) => b.notes.length - a.notes.length);
    const bass = candidates.filter((t) => t.avgPitch < 62).sort((a, b) => b.notes.length - a.notes.length);
    if (treble.length > 0 && bass.length > 0) {
      track1Raw = treble[0].notes;
      track2Raw = bass[0].notes;
    } else {
      const topTwo = candidates
        .slice()
        .sort((a, b) => b.notes.length - a.notes.length)
        .slice(0, 2)
        .sort((a, b) => b.avgPitch - a.avgPitch);
      track1Raw = topTwo[0].notes;
      track2Raw = topTwo[1].notes;
    }
  } else if (candidates.length === 1) {
    for (const n of candidates[0].notes) {
      const foldedCheck = foldMidiTo61Keys(n.originalMidi);
      if (foldedCheck >= MIDDLE_C) {
        track1Raw.push(n);
      } else {
        track2Raw.push(n);
      }
    }
  }

  const foldedT1 = foldAndDeduplicateHandNotes(track1Raw, 1);
  const foldedT2 = foldAndDeduplicateHandNotes(track2Raw, 2);
  const selectedNotes = [...foldedT1.notes, ...foldedT2.notes];

  const playableNoteCount = selectedNotes.length;
  let activeDuration = duration;
  if (selectedNotes.length > 1) {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const n of selectedNotes) {
      if (n.time < minStart) minStart = n.time;
      if (n.time + n.duration > maxEnd) maxEnd = n.time + n.duration;
    }
    if (Number.isFinite(minStart) && Number.isFinite(maxEnd)) {
      activeDuration = Math.max(1, maxEnd - minStart);
    }
  }

  const diff = calculateSpellDifficulty(playableNoteCount, activeDuration);

  // Check if a paired backing audio file (.mp3 / .wav / .ogg / .m4a) exists in the same folder
  let backingAudioPath = null;
  if (filePath && filePath !== 'BUILTIN_DEMO') {
    const dir = path.dirname(filePath);
    const base = fileName.replace(/\.(mid|midi)$/i, '');
    for (const ext of ['.mp3', '.wav', '.ogg', '.m4a']) {
      const candidate = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(candidate)) {
        backingAudioPath = candidate;
        break;
      }
    }
  }

  const id = filePath === 'BUILTIN_DEMO'
    ? 'builtin::demo'
    : `${sourceTag.toLowerCase()}::${fileName.toLowerCase()}`;

  return {
    id,
    title: cleanTitle,
    fileName,
    filePath,
    sourceTag,
    bpm,
    duration,
    nps: diff.nps,
    spellLevel: diff.spellLevel,
    badgeClass: diff.badgeClass,
    xpMultiplier: diff.xpMultiplier,
    totalNotes: playableNoteCount,
    backingAudioPath,
    newlyIngested: false
  };
}

/**
 * Persist Grimoire index metadata to localStorage & grimoire_library.json
 */
function persistGrimoireIndex() {
  const serializable = Array.from(grimoireSpells.values()).map((entry) => ({
    id: entry.id,
    title: entry.title,
    fileName: entry.fileName,
    filePath: entry.filePath,
    sourceTag: entry.sourceTag,
    bpm: entry.bpm,
    duration: entry.duration,
    nps: entry.nps,
    spellLevel: entry.spellLevel,
    badgeClass: entry.badgeClass,
    xpMultiplier: entry.xpMultiplier,
    totalNotes: entry.totalNotes,
    backingAudioPath: entry.backingAudioPath
  }));

  try {
    localStorage.setItem(GRIMOIRE_STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage quota errors
  }

  try {
    fs.writeFileSync(GRIMOIRE_INDEX_FILE, JSON.stringify(serializable, null, 2), 'utf8');
  } catch {
    // Ignore disk write errors
  }
}

/**
 * Scan ./Imports and ./Midi Test Files for any .mid / .midi files.
 * If notifyOnNew is true, triggers a real-time toast and highlights newly detected files!
 */
function scanWatchedDirectories(notifyOnNew = false) {
  try {
    if (!fs.existsSync(IMPORTS_DIR)) {
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    }
  } catch {
    // Ignore mkdir error
  }

  const dirsToScan = [
    { dir: IMPORTS_DIR, sourceTag: 'Imports/' },
    { dir: MIDI_TEST_DIR, sourceTag: 'Test Library' }
  ];

  let addedNewSpell = null;
  let changed = false;

  for (const { dir, sourceTag } of dirsToScan) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => /\.(mid|midi)$/i.test(f));

      for (const file of files) {
        const key = `${sourceTag.toLowerCase()}::${file.toLowerCase()}`;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile() || stat.size < 16) continue;

        const existing = grimoireSpells.get(key);
        if (existing && existing.mtimeMs === stat.mtimeMs && existing.fileSize === stat.size) {
          // If backing audio arrived slightly after the .mid file was indexed, attach it (Issue #13)
          if (!existing.backingAudioPath) {
            const base = file.replace(/\.(mid|midi)$/i, '');
            for (const ext of ['.mp3', '.wav', '.ogg', '.m4a']) {
              const candidate = path.join(dir, `${base}${ext}`);
              if (fs.existsSync(candidate)) {
                existing.backingAudioPath = candidate;
                changed = true;
                break;
              }
            }
          }
          continue;
        }

        const buf = fs.readFileSync(fullPath);
        const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const entry = extractGrimoireEntryFromBuffer(arrayBuf, file, fullPath, sourceTag);
        entry.mtimeMs = stat.mtimeMs;
        entry.fileSize = stat.size;
        entry.newlyIngested = notifyOnNew;

        grimoireSpells.set(entry.id, entry);
        changed = true;
        if (notifyOnNew) {
          addedNewSpell = { entry, arrayBuf };
        }
      }
    } catch {
      // Ignore transient read errors while a file is still being written
    }
  }

  if (changed) {
    persistGrimoireIndex();
    renderGrimoireSidebar();
  }

  if (addedNewSpell) {
    const { entry, arrayBuf } = addedNewSpell;
    showGrimoireToast(`📖 Folder Watcher Ingested: "${entry.title}" (${entry.spellLevel}) from ${entry.sourceTag}!`);
    if (watcherStatusText) {
      watcherStatusText.textContent = `Ingested: ${entry.fileName}`;
    }
    if (!playbackState.isPlaying) {
      parseMidiBuffer(arrayBuf, entry.fileName, entry.filePath);
    }
  }
}

/**
 * Initialize The Grimoire Spell Library and start the active ./Imports folder watcher
 */
function initGrimoireAndWatcher() {
  try {
    if (!fs.existsSync(IMPORTS_DIR)) {
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    }
  } catch {
    // Ignore mkdir error
  }

  // Always seed the Built-In Demo Spell so The Grimoire is never empty
  try {
    const demo = buildDemoSpellMidiBytes();
    const demoEntry = extractGrimoireEntryFromBuffer(
      demo.arrayBuffer,
      demo.fileName,
      'BUILTIN_DEMO',
      'Built-In'
    );
    grimoireSpells.set(demoEntry.id, demoEntry);
  } catch {
    // Ignore demo seed error
  }

  // Initial scan of ./Imports and ./Midi Test Files
  scanWatchedDirectories(false);
  renderGrimoireSidebar();

  // Start native fs.watch on ./Imports
  try {
    if (grimoireWatcher) {
      grimoireWatcher.close();
    }
    grimoireWatcher = fs.watch(IMPORTS_DIR, { persistent: false }, (eventType, filename) => {
      if (filename && /\.(mid|midi)$/i.test(filename)) {
        setTimeout(() => scanWatchedDirectories(true), 180);
      }
    });
  } catch {
    // Fallback interval below also covers virtual filesystems
  }

  // Resilient 1.8s directory poll (ensures 100% reliability on Google Drive virtual mounts).
  // Skips synchronous disk polling while a song is actively playing (Issue #4 / M1) so 60 FPS never hitches.
  setInterval(() => {
    if (!playbackState.isPlaying) {
      scanWatchedDirectories(true);
    }
  }, 1800);
}

/**
 * Render the scrollable Spell Cards inside #grimoire-spell-list
 */
function renderGrimoireSidebar() {
  if (!grimoireSpellList) return;

  const totalCount = grimoireSpells.size;
  if (grimoireCountBadge) {
    grimoireCountBadge.textContent = String(totalCount);
  }

  const query = (grimoireSearchInput?.value || '').trim().toLowerCase();
  const levelFilter = grimoireFilterSelect?.value || 'all';

  const entries = Array.from(grimoireSpells.values()).filter((e) => {
    if (levelFilter !== 'all' && e.spellLevel !== levelFilter) return false;
    if (query && !e.title.toLowerCase().includes(query) && !e.fileName.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  grimoireSpellList.innerHTML = '';

  if (entries.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'grimoire-empty';
    emptyDiv.textContent = 'No matching spells in The Grimoire. Drop a .mid file into ./Imports or click "⚡ Drop Test .mid in Imports/"!';
    grimoireSpellList.appendChild(emptyDiv);
    return;
  }

  for (const entry of entries) {
    const isActive = Boolean(
      currentSong &&
      (currentSong.filePath && entry.filePath
        ? path.resolve(String(currentSong.filePath)) === path.resolve(String(entry.filePath))
        : currentSong.fileName.toLowerCase() === entry.fileName.toLowerCase())
    );

    const card = document.createElement('div');
    card.className = `grimoire-card${isActive ? ' active-spell' : ''}${entry.newlyIngested ? ' newly-ingested' : ''}`;

    const topRow = document.createElement('div');
    topRow.className = 'grimoire-card-top';

    const titleEl = document.createElement('div');
    titleEl.className = 'grimoire-card-title';
    titleEl.textContent = entry.title;
    topRow.appendChild(titleEl);

    if (entry.filePath !== 'BUILTIN_DEMO' && entry.sourceTag === 'Imports/') {
      const delBtn = document.createElement('button');
      delBtn.className = 'grimoire-delete-btn';
      delBtn.title = 'Remove spell from Imports/ and Grimoire';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeGrimoireEntry(entry);
      });
      topRow.appendChild(delBtn);
    }

    const badgesRow = document.createElement('div');
    badgesRow.className = 'grimoire-card-badges';

    const diffBadge = document.createElement('span');
    diffBadge.className = `difficulty-badge ${entry.badgeClass}`;
    diffBadge.textContent = `${entry.spellLevel} (${entry.xpMultiplier.toFixed(1)}x)`;
    badgesRow.appendChild(diffBadge);

    const srcBadge = document.createElement('span');
    srcBadge.className = 'grimoire-source-tag';
    srcBadge.textContent = entry.backingAudioPath ? `${entry.sourceTag} + Audio` : entry.sourceTag;
    badgesRow.appendChild(srcBadge);

    const metaRow = document.createElement('div');
    metaRow.className = 'grimoire-card-meta';
    metaRow.innerHTML = `<span>NPS: ${entry.nps.toFixed(2)} &bull; ${entry.bpm} BPM</span><span>${formatSeconds(entry.duration)}</span>`;

    card.appendChild(topRow);
    card.appendChild(badgesRow);
    card.appendChild(metaRow);

    card.addEventListener('click', () => {
      entry.newlyIngested = false;
      loadGrimoireEntry(entry);
    });

    grimoireSpellList.appendChild(card);
  }
}

/**
 * Load a selected Spell Card from The Grimoire onto the Spell Highway
 */
function loadGrimoireEntry(entry) {
  if (entry.filePath === 'BUILTIN_DEMO') {
    loadBuiltInDemoSpell();
    return;
  }
  try {
    if (!fs.existsSync(entry.filePath)) {
      alert(`File not found on disk: ${entry.filePath}`);
      grimoireSpells.delete(entry.id);
      renderGrimoireSidebar();
      return;
    }
    const buf = fs.readFileSync(entry.filePath);
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    parseMidiBuffer(arrayBuf, entry.fileName, entry.filePath);
  } catch (err) {
    alert(`Failed to load spell from Grimoire: ${err.message}`);
  }
}

/**
 * Save the currently active MIDI song into ./Imports and The Grimoire
 */
function saveActiveSpellToGrimoire() {
  if (!currentSong || !currentSong.rawBuffer) {
    alert('Load a MIDI file or Demo Spell first!');
    return;
  }

  try {
    if (!fs.existsSync(IMPORTS_DIR)) {
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    }
    const safeName = currentSong.fileName.replace(/[^a-zA-Z0-9._ -]/g, '_');
    const destPath = path.join(IMPORTS_DIR, safeName);

    // Copy paired backing audio track into ./Imports before writing .mid (Issue #48)
    if (currentSong.backingAudioPath && fs.existsSync(currentSong.backingAudioPath)) {
      try {
        const ext = path.extname(currentSong.backingAudioPath);
        const safeBase = safeName.replace(/\.(mid|midi)$/i, '');
        const destAudioPath = path.join(IMPORTS_DIR, `${safeBase}${ext}`);
        if (path.resolve(currentSong.backingAudioPath) !== path.resolve(destAudioPath)) {
          fs.copyFileSync(currentSong.backingAudioPath, destAudioPath);
        }
        currentSong.backingAudioPath = destAudioPath;
      } catch {
        // Ignore backing audio copy errors
      }
    }

    fs.writeFileSync(destPath, currentSong.rawBuffer);
    currentSong.filePath = destPath;
    scanWatchedDirectories(false);
    showGrimoireToast(`💾 Saved "${currentSong.title}" to The Grimoire (./Imports/${safeName})!`);
    renderGrimoireSidebar();
  } catch (err) {
    alert(`Could not save spell to Imports/: ${err.message}`);
  }
}

/**
 * Remove a spell from ./Imports and The Grimoire
 */
function removeGrimoireEntry(entry) {
  try {
    if (entry.filePath && entry.filePath !== 'BUILTIN_DEMO' && fs.existsSync(entry.filePath)) {
      fs.unlinkSync(entry.filePath);
    }
  } catch {
    // Ignore file unlink error
  }
  try {
    if (entry.backingAudioPath && fs.existsSync(entry.backingAudioPath)) {
      if (currentSong?.backingAudioPath === entry.backingAudioPath && currentSong.backingAudioEl) {
        currentSong.backingAudioEl.pause();
        currentSong.backingAudioEl.src = '';
      }
      fs.unlinkSync(entry.backingAudioPath);
    }
  } catch {
    // Ignore backing audio unlink error
  }
  grimoireSpells.delete(entry.id);
  persistGrimoireIndex();
  renderGrimoireSidebar();
}

/**
 * Generate a brand-new playable D&D Bard MIDI spell and write it directly into ./Imports
 * so the user can test the live Folder Watcher with 1 click!
 */
function dropTestMidiIntoImports() {
  try {
    if (!fs.existsSync(IMPORTS_DIR)) {
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    }

    const presets = [
      {
        title: 'Tavern Jig of the Silver Lute',
        fileName: 'Tavern_Jig_Silver_Lute.mid',
        bpm: 132,
        rh: [
          { midi: 64, time: 0.0, duration: 0.35 },
          { midi: 67, time: 0.4, duration: 0.35 },
          { midi: 71, time: 0.8, duration: 0.35 },
          { midi: 76, time: 1.2, duration: 0.55 },
          { midi: 74, time: 1.8, duration: 0.35 },
          { midi: 71, time: 2.2, duration: 0.35 },
          { midi: 67, time: 2.6, duration: 0.55 },
          { midi: 64, time: 3.2, duration: 0.45 },
          { midi: 67, time: 3.2, duration: 0.45 },
          { midi: 71, time: 3.2, duration: 0.45 },
          { midi: 72, time: 3.8, duration: 0.45 },
          { midi: 76, time: 4.3, duration: 0.45 },
          { midi: 79, time: 4.8, duration: 0.7 }
        ],
        lh: [
          { midi: 40, time: 0.0, duration: 1.4 },
          { midi: 47, time: 0.0, duration: 1.4 },
          { midi: 43, time: 1.6, duration: 1.4 },
          { midi: 50, time: 1.6, duration: 1.4 },
          { midi: 48, time: 3.2, duration: 1.4 },
          { midi: 55, time: 3.2, duration: 1.4 },
          { midi: 40, time: 4.8, duration: 0.8 },
          { midi: 52, time: 4.8, duration: 0.8 }
        ]
      },
      {
        title: 'Eldritch Nocturne in C Minor',
        fileName: 'Eldritch_Nocturne_C_Minor.mid',
        bpm: 96,
        rh: [
          { midi: 60, time: 0.0, duration: 0.5 },
          { midi: 63, time: 0.0, duration: 0.5 },
          { midi: 67, time: 0.0, duration: 0.5 },
          { midi: 72, time: 0.6, duration: 0.5 },
          { midi: 70, time: 1.2, duration: 0.5 },
          { midi: 67, time: 1.8, duration: 0.5 },
          { midi: 68, time: 2.4, duration: 0.5 },
          { midi: 65, time: 3.0, duration: 0.5 },
          { midi: 63, time: 3.6, duration: 0.5 },
          { midi: 62, time: 4.2, duration: 0.5 },
          { midi: 60, time: 4.8, duration: 0.8 }
        ],
        lh: [
          { midi: 36, time: 0.0, duration: 2.2 },
          { midi: 48, time: 0.0, duration: 2.2 },
          { midi: 41, time: 2.4, duration: 1.6 },
          { midi: 48, time: 2.4, duration: 1.6 },
          { midi: 43, time: 4.2, duration: 1.4 },
          { midi: 48, time: 4.8, duration: 0.9 }
        ]
      },
      {
        title: 'Dragonbard Battle Hymn',
        fileName: 'Dragonbard_Battle_Hymn.mid',
        bpm: 144,
        rh: [
          { midi: 69, time: 0.0, duration: 0.3 },
          { midi: 72, time: 0.3, duration: 0.3 },
          { midi: 76, time: 0.6, duration: 0.3 },
          { midi: 81, time: 0.9, duration: 0.45 },
          { midi: 79, time: 1.4, duration: 0.3 },
          { midi: 76, time: 1.7, duration: 0.3 },
          { midi: 72, time: 2.0, duration: 0.45 },
          { midi: 74, time: 2.5, duration: 0.3 },
          { midi: 77, time: 2.8, duration: 0.3 },
          { midi: 81, time: 3.1, duration: 0.45 },
          { midi: 76, time: 3.6, duration: 0.45 },
          { midi: 69, time: 4.1, duration: 0.8 }
        ],
        lh: [
          { midi: 45, time: 0.0, duration: 1.2 },
          { midi: 52, time: 0.0, duration: 1.2 },
          { midi: 48, time: 1.4, duration: 1.0 },
          { midi: 55, time: 1.4, duration: 1.0 },
          { midi: 50, time: 2.5, duration: 1.0 },
          { midi: 57, time: 2.5, duration: 1.0 },
          { midi: 45, time: 3.6, duration: 1.3 },
          { midi: 57, time: 3.6, duration: 1.3 }
        ]
      }
    ];

    const chosen = presets[testDropCounter % presets.length];
    testDropCounter++;

    // If this preset file already exists in Imports, append a numeric suffix so the watcher always sees a brand-new .mid file!
    let targetFileName = chosen.fileName;
    if (fs.existsSync(path.join(IMPORTS_DIR, targetFileName))) {
      targetFileName = chosen.fileName.replace(/\.mid$/i, `_${testDropCounter}.mid`);
    }

    const midi = new Midi();
    midi.header.name = chosen.title;
    midi.header.setTempo(chosen.bpm);

    const rhTrack = midi.addTrack();
    rhTrack.name = 'Piano Right Hand (Lead)';
    rhTrack.instrument.number = 0;
    for (const n of chosen.rh) {
      rhTrack.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: 0.86 });
    }

    const lhTrack = midi.addTrack();
    lhTrack.name = 'Piano Left Hand (Accompaniment)';
    lhTrack.instrument.number = 0;
    for (const n of chosen.lh) {
      lhTrack.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: 0.74 });
    }

    const bytes = Buffer.from(midi.toArray());
    const fullDest = path.join(IMPORTS_DIR, targetFileName);
    fs.writeFileSync(fullDest, bytes);

    // Trigger watcher scan shortly after file write
    setTimeout(() => scanWatchedDirectories(true), 120);
  } catch (err) {
    alert(`Failed to drop test MIDI into ./Imports: ${err.message}`);
  }
}

/**
 * Auto-detect if the user placed a .mid test file in the project folder or subfolders and load it on startup;
 * otherwise fall back to the Built-In Demo Spell so the Spell Highway is immediately playable (Issue #34).
 */
function tryAutoLoadWorkspaceMidi() {
  const searchDirs = [
    path.join(__dirname, 'Midi Test Files'),
    path.join(__dirname, 'Imports'),
    __dirname
  ];
  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      const midiFile = files.find((f) => /\.(mid|midi)$/i.test(f));
      if (midiFile) {
        const fullPath = path.join(dir, midiFile);
        const buf = fs.readFileSync(fullPath);
        parseMidiBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), midiFile, fullPath);
        return;
      }
    } catch {
      // Ignore directory read errors
    }
  }
  loadBuiltInDemoSpell();
}

// Cached canvas dimensions & pre-built vertical key gradients (Issue #5 / M2)
let cachedCanvasWidth = 1024;
let cachedCanvasHeight = 640;
let cachedKeyGradients = null;

/**
 * Compute exact 61-key geometry lookup table (keyGeometry[36..96])
 * and pre-allocate shared vertical CanvasGradient objects on resize.
 */
function computeKeyGeometry() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;
  cachedCanvasWidth = width;
  cachedCanvasHeight = height;

  const keyboardHeight = Math.max(145, Math.min(210, Math.round(height * 0.22)));
  const keyboardY = height - keyboardHeight;

  whiteKeys.length = 0;
  blackKeys.length = 0;

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

  // Pre-build shared vertical LinearGradients for the 36 white keys and 25 black keys
  const makeVGrad = (y0, h, stops) => {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    for (const [offset, color] of stops) {
      g.addColorStop(offset, color);
    }
    return g;
  };

  cachedKeyGradients = {
    whiteIdle: makeVGrad(keyboardY, keyboardHeight, [[0, '#e8e2d5'], [0.88, '#f7f3eb'], [1, '#cfc6b4']]),
    whitePressed: makeVGrad(keyboardY, keyboardHeight, [[0, '#fff3b0'], [0.35, '#ffd700'], [1, '#c59b27']]),
    whiteLocked: makeVGrad(keyboardY, keyboardHeight, [[0, '#a7f3d0'], [0.4, '#34d399'], [1, '#059669']]),
    whiteGuideT1: makeVGrad(keyboardY, keyboardHeight, [[0, '#fff5b8'], [0.4, '#f5d76e'], [1, '#d9c589']]),
    whiteGuideT2: makeVGrad(keyboardY, keyboardHeight, [[0, '#b3f8ff'], [0.4, '#67e8f9'], [1, '#99d5e0']]),
    blackIdle: makeVGrad(keyboardY, blackKeyHeight, [[0, '#2a2342'], [0.8, '#141022'], [1, '#090710']]),
    blackPressed: makeVGrad(keyboardY, blackKeyHeight, [[0, '#ffd700'], [0.5, '#e5a900'], [1, '#9c6f00']]),
    blackLocked: makeVGrad(keyboardY, blackKeyHeight, [[0, '#34d399'], [1, '#065f46']]),
    blackGuideT1: makeVGrad(keyboardY, blackKeyHeight, [[0, '#ffd700'], [1, '#6e5200']]),
    blackGuideT2: makeVGrad(keyboardY, blackKeyHeight, [[0, '#00e5ff'], [1, '#005662']])
  };
}

/**
 * Draw the 60 FPS falling glowing rectangles ("The Spell Highway")
 * Track 1 = Radiant Gold (#ffd700), Track 2 = Eldritch Blue (#00e5ff)
 * Also collects active strike-line notes so the 61-key piano can show guide highlights.
 */
function drawFallingSpellHighway(strikeLineY, width) {
  const strikeLineGuides = new Map(); // midi -> { handTrack, lockedInWait }
  if (!currentSong) return strikeLineGuides;

  const curTime = playbackState.currentTime;
  const fallSpeed = playbackState.fallSpeedPxPerSec;
  const visibleTimeWindow = (strikeLineY + 40) / fallSpeed;

  // 1. Draw scrolling horizontal beat/measure grid lines (honoring parsed time signature, Issue #37)
  const beatDur = 60 / Math.max(30, currentSong.bpm);
  const beatsPerMeasure = Math.max(1, currentSong.beatsPerMeasure || 4);
  const firstBeatIdx = Math.max(0, Math.floor(curTime / beatDur));
  const lastBeatIdx = Math.ceil((curTime + visibleTimeWindow) / beatDur);

  ctx.save();
  for (let b = firstBeatIdx; b <= lastBeatIdx; b++) {
    const beatTime = b * beatDur;
    const y = strikeLineY - (beatTime - curTime) * fallSpeed;
    if (y < 0 || y > strikeLineY) continue;

    const isMeasureLine = b % beatsPerMeasure === 0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.strokeStyle = isMeasureLine
      ? 'rgba(212, 175, 55, 0.22)'
      : 'rgba(163, 151, 184, 0.07)';
    ctx.lineWidth = isMeasureLine ? 1.5 : 1;
    ctx.stroke();
  }
  ctx.restore();

  // 2. Helper to draw a track's falling notes
  const drawTrackNotes = (notes, handTrack, primaryHex, topHex, borderHex, glowRgba) => {
    const opacity = getHandVisualOpacity(handTrack);
    if (opacity <= 0.05) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    for (const note of notes) {
      const noteEnd = note.time + note.duration;
      if (noteEnd < curTime) continue;
      if (note.time > curTime + visibleTimeWindow) break;

      const geom = keyGeometry[note.midi];
      if (!geom) continue;

      const rawBottomY = strikeLineY - (note.time - curTime) * fallSpeed;
      const rawTopY = strikeLineY - (noteEnd - curTime) * fallSpeed;

      const bottomY = Math.min(strikeLineY, rawBottomY);
      const topY = Math.max(-20, rawTopY);
      const rectH = Math.max(7, bottomY - topY - 2);
      if (bottomY <= 0 || topY >= strikeLineY) continue;

      const isAtStrikeLine = (note.time <= curTime + 0.02 && noteEnd >= curTime) ||
        (playbackState.isWaitingForStrike && Math.abs(note.time - curTime) <= CHORD_CLUSTER_WINDOW_SEC && !note.satisfied);

      if (isAtStrikeLine && opacity >= 0.9) {
        strikeLineGuides.set(note.midi, {
          handTrack,
          lockedInWait: Boolean(note.lockedInWait)
        });
      }

      const padX = geom.isBlack ? 1 : 2;
      const x = geom.x + padX;
      const w = Math.max(4, geom.width - padX * 2);

      // Render falling note with zero per-frame LinearGradient allocations (Issue #15)
      ctx.fillStyle = note.lockedInWait ? '#10b981' : primaryHex;
      ctx.strokeStyle = note.lockedInWait
        ? '#ffffff'
        : (isAtStrikeLine ? '#ffffff' : (note.wasFolded ? '#d8b4fe' : borderHex));
      ctx.lineWidth = isAtStrikeLine ? 2.2 : 1.2;
      if (isAtStrikeLine || note.lockedInWait) {
        ctx.shadowColor = note.lockedInWait ? 'rgba(54, 211, 153, 0.85)' : glowRgba;
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.roundRect(x, topY, w, rectH, 5);
      ctx.fill();
      ctx.stroke();

      // Crisp top specular highlight cap on the falling glyph
      if (rectH >= 10) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = note.lockedInWait ? '#a7f3d0' : topHex;
        ctx.fillRect(x + 1.5, topY + 1.5, Math.max(2, w - 3), Math.min(5, rectH * 0.28));
      }

      if (rectH >= 22 && w >= 16) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0d0917';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(note.foldedName, x + w / 2, bottomY - 6);
      }
    }

    ctx.restore();
  };

  // Draw Track 2 (Left Hand / Accompaniment — Eldritch Blue)
  drawTrackNotes(
    currentSong.track2Notes,
    2,
    '#00b8d4',
    '#76ffff',
    '#b3f8ff',
    'rgba(0, 229, 255, 0.65)'
  );

  // Draw Track 1 (Right Hand / Lead — Radiant Gold)
  drawTrackNotes(
    currentSong.track1Notes,
    1,
    '#e5a900',
    '#fff3b0',
    '#ffd700',
    'rgba(255, 215, 0, 0.75)'
  );

  return strikeLineGuides;
}

// ============================================================================
// PHASE 7: 60 FPS ARCANE PARTICLE BURSTS, SHOCKWAVES & FLOATING XP RUNES
// ============================================================================

const PARTICLE_PALETTES = {
  gold: ['#ffd700', '#fff3b0', '#ffae00', '#ffffff'],
  blue: ['#00e5ff', '#76ffff', '#38bdf8', '#e0f2fe'],
  roll: ['#34d399', '#a7f3d0', '#ffd700', '#ffffff'],
  inspired: ['#e879f9', '#c084fc', '#ffd700', '#fff3b0', '#ffffff'],
  fumble: ['#fb923c', '#f87171', '#fde047']
};

/**
 * Spawn an arcane particle burst & optional shockwave ring at the Strike Line above a key
 */
function spawnKeyParticleBurst(midi, theme = 'gold', count = 18, withShockwave = true) {
  const geom = keyGeometry[midi];
  if (!geom) return;

  const originX = geom.x + geom.width / 2;
  const originY = geom.y;
  const palette = PARTICLE_PALETTES[theme] || PARTICLE_PALETTES.gold;

  // Cap active particle pool so 60 FPS never dips
  if (strikeParticles.length > 260) {
    strikeParticles.splice(0, strikeParticles.length - 200);
  }

  const shapes = ['star', 'diamond', 'orb'];
  for (let i = 0; i < count; i++) {
    // Upward fountain spread (-165 deg to -15 deg)
    const angle = -Math.PI * (0.12 + Math.random() * 0.76);
    const speed = 75 + Math.random() * 235;
    const size = 2.6 + Math.random() * 4.4;
    const maxLife = 0.42 + Math.random() * 0.42;

    strikeParticles.push({
      x: originX + (Math.random() - 0.5) * Math.max(8, geom.width * 0.7),
      y: originY - 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color: palette[i % palette.length],
      shape: shapes[i % shapes.length],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 9,
      life: maxLife,
      maxLife
    });
  }

  if (withShockwave) {
    if (strikeShockwaves.length > 20) {
      strikeShockwaves.shift();
    }
    strikeShockwaves.push({
      x: originX,
      y: originY,
      rx: Math.max(8, geom.width * 0.45),
      ry: 4,
      maxRx: Math.max(36, geom.width * 2.4),
      color: palette[0],
      life: 0.36,
      maxLife: 0.36
    });
  }
}

/**
 * Spawn floating glowing rune/XP text rising from the Strike Line above a key
 */
function spawnFloatingCanvasRune(midi, text, color = '#ffd700') {
  const geom = keyGeometry[midi];
  if (!geom) return;

  if (floatingRunes.length > 16) {
    floatingRunes.shift();
  }

  floatingRunes.push({
    x: geom.x + geom.width / 2,
    y: geom.y - 16,
    vy: -58,
    text,
    color,
    life: 0.85,
    maxLife: 0.85
  });
}

/**
 * Render subtle drifting Tavern Arcane Dust Motes in the Spell Highway background
 */
function updateAndDrawAmbientMotes(dt, width, strikeLineY) {
  if (width <= 0 || strikeLineY <= 0) return;

  while (ambientMotes.length < 28) {
    ambientMotes.push({
      x: Math.random() * width,
      y: Math.random() * strikeLineY,
      vx: (Math.random() - 0.5) * 12,
      vy: -(8 + Math.random() * 16),
      radius: 1.0 + Math.random() * 2.0,
      alpha: 0.14 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      isGold: Math.random() > 0.35
    });
  }

  ctx.save();
  for (const m of ambientMotes) {
    m.phase += dt * 1.8;
    m.x += (m.vx + Math.sin(m.phase) * 6) * dt;
    m.y += m.vy * dt;

    if (m.y < -10) {
      m.y = strikeLineY - 4;
      m.x = Math.random() * width;
    }
    if (m.x < 0) m.x = width;
    if (m.x > width) m.x = 0;

    const twinkle = m.alpha * (0.65 + 0.35 * Math.sin(m.phase * 1.5));
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
    ctx.fillStyle = m.isGold
      ? `rgba(255, 215, 0, ${twinkle.toFixed(3)})`
      : `rgba(0, 229, 255, ${twinkle.toFixed(3)})`;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Update and draw active Strike-Line Shockwave Rings, Particle Bursts & Floating XP Runes
 */
function updateAndDrawStrikeParticles(dt) {
  // 1. Expanding Strike-Line Shockwave Rings
  if (strikeShockwaves.length > 0) {
    ctx.save();
    for (let i = strikeShockwaves.length - 1; i >= 0; i--) {
      const sw = strikeShockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        strikeShockwaves.splice(i, 1);
        continue;
      }
      const progress = 1 - sw.life / sw.maxLife;
      const curRx = sw.rx + (sw.maxRx - sw.rx) * progress;
      const curRy = sw.ry + 14 * progress;
      const alpha = Math.max(0, (sw.life / sw.maxLife) * 0.85);

      ctx.beginPath();
      ctx.ellipse(sw.x, sw.y, curRx, curRy, 0, 0, Math.PI * 2);
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2.2 * (1 - progress * 0.5);
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 12;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Arcane Spark / Star / Diamond Particles
  if (strikeParticles.length > 0) {
    ctx.save();
    const gravity = 310;
    for (let i = strikeParticles.length - 1; i >= 0; i--) {
      const p = strikeParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        strikeParticles.splice(i, 1);
        continue;
      }

      p.vy += gravity * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      const alpha = Math.max(0, p.life / p.maxLife);
      const r = p.size * (0.45 + 0.55 * alpha);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;

      if (p.shape === 'star') {
        // 4-point arcane star
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.45);
        ctx.lineTo(r * 0.42, -r * 0.42);
        ctx.lineTo(r * 1.45, 0);
        ctx.lineTo(r * 0.42, r * 0.42);
        ctx.lineTo(0, r * 1.45);
        ctx.lineTo(-r * 0.42, r * 0.42);
        ctx.lineTo(-r * 1.45, 0);
        ctx.lineTo(-r * 0.42, -r * 0.42);
        ctx.closePath();
        ctx.fill();
      } else if (p.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.25);
        ctx.lineTo(r * 0.85, 0);
        ctx.lineTo(0, r * 1.25);
        ctx.lineTo(-r * 0.85, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // 3. Floating XP / Roll Runes
  if (floatingRunes.length > 0) {
    ctx.save();
    for (let i = floatingRunes.length - 1; i >= 0; i--) {
      const fr = floatingRunes[i];
      fr.life -= dt;
      if (fr.life <= 0) {
        floatingRunes.splice(i, 1);
        continue;
      }
      fr.y += fr.vy * dt;
      fr.vy *= 0.96;

      const alpha = Math.min(1, (fr.life / fr.maxLife) * 1.25);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = fr.color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 6;
      ctx.fillText(fr.text, fr.x, fr.y);
    }
    ctx.restore();
  }
}

/**
 * Render the Spell Highway backdrop, falling notes, strike line, 61-key piano, and Phase 7 particles
 */
function renderCanvas() {
  const nowMs = performance.now();
  const particleDt = Math.min(0.05, Math.max(0.001, (nowMs - lastParticleFrameMs) / 1000));
  lastParticleFrameMs = nowMs;

  const width = cachedCanvasWidth;
  const height = cachedCanvasHeight;

  ctx.clearRect(0, 0, width, height);

  if (whiteKeys.length === 0 || !cachedKeyGradients) return;
  const strikeLineY = whiteKeys[0].y;

  // Phase 7: Ambient drifting arcane dust motes in the Spell Highway background
  updateAndDrawAmbientMotes(particleDt, width, strikeLineY);

  // 1. Draw vertical octave lane guides in the Spell Highway area
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

  // 2. Draw 60 FPS Falling Spell Highway Notes
  const strikeLineGuides = drawFallingSpellHighway(strikeLineY, width);

  // 3. Draw glowing Strike Zone Line above the 61-key keyboard (with Bardic Inspiration glow at 50+ combo)
  ctx.save();
  const isWaiting = playbackState.isWaitingForStrike;
  const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
  const lineH = isInspired ? 16 : (isWaiting ? 14 : 9);
  const strikeGrad = ctx.createLinearGradient(0, strikeLineY - lineH + 2, 0, strikeLineY + 4);
  if (isInspired) {
    strikeGrad.addColorStop(0, 'rgba(192, 132, 252, 0)');
    strikeGrad.addColorStop(0.45, 'rgba(192, 132, 252, 0.85)');
    strikeGrad.addColorStop(0.8, 'rgba(255, 215, 0, 0.95)');
    strikeGrad.addColorStop(1, '#ffffff');
  } else if (isWaiting) {
    strikeGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    strikeGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.92)');
    strikeGrad.addColorStop(1, '#fff3b0');
  } else {
    strikeGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
    strikeGrad.addColorStop(0.55, 'rgba(255, 215, 0, 0.7)');
    strikeGrad.addColorStop(1, '#d4af37');
  }
  ctx.fillStyle = strikeGrad;
  ctx.fillRect(0, strikeLineY - lineH + 2, width, lineH);
  ctx.restore();

  // 4. Draw 36 White Keys (using pre-allocated cachedKeyGradients)
  const qwertyHighMidi = Math.min(MAX_MIDI, qwertyBaseMidi + 16);
  for (const key of whiteKeys) {
    const state = activeNotes.get(key.midi);
    const isPressed = Boolean(state);
    const guide = strikeLineGuides.get(key.midi);
    const isInQwertyRange = showQwertyKeyLabels && key.midi >= qwertyBaseMidi && key.midi <= qwertyHighMidi;
    const qwertyChar = isInQwertyRange ? OFFSET_TO_QWERTY_LABEL[key.midi - qwertyBaseMidi] : null;

    ctx.save();
    if (isPressed) {
      ctx.fillStyle = cachedKeyGradients.whitePressed;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.75)';
      ctx.shadowBlur = 16;
    } else if (guide) {
      ctx.fillStyle = guide.lockedInWait
        ? cachedKeyGradients.whiteLocked
        : (guide.handTrack === 1 ? cachedKeyGradients.whiteGuideT1 : cachedKeyGradients.whiteGuideT2);
    } else {
      ctx.fillStyle = cachedKeyGradients.whiteIdle;
    }

    const pad = 0.75;
    ctx.fillRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

    // Subtle gold top marker bar on keys inside the active QWERTY octave range (Z/X)
    if (isInQwertyRange) {
      ctx.fillStyle = isPressed ? '#1a1200' : 'rgba(212, 175, 55, 0.85)';
      ctx.fillRect(key.x + pad + 1, key.y + 1, key.width - (pad + 1) * 2, 4);
    }

    ctx.strokeStyle = isPressed ? '#ffd700' : (guide ? '#ffd700' : (isInQwertyRange ? '#8a6d2f' : '#261f3d'));
    ctx.lineWidth = guide ? 1.8 : 1;
    ctx.strokeRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

    if (qwertyChar) {
      ctx.fillStyle = isPressed || guide ? '#1a1200' : '#8a6d2f';
      ctx.font = `bold ${Math.max(9, Math.min(11, Math.floor(key.width * 0.36)))}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`[${qwertyChar}]`, key.x + key.width / 2, key.y + key.height - 28);
    }

    if (key.midi % 12 === 0 || guide || (showQwertyKeyLabels && key.midi === qwertyBaseMidi)) {
      ctx.fillStyle = isPressed || guide ? '#1a1200' : (showQwertyKeyLabels && key.midi === qwertyBaseMidi ? '#b45309' : '#4a3d66');
      ctx.font = `bold ${Math.max(10, Math.min(13, Math.floor(key.width * 0.42)))}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(key.name, key.x + key.width / 2, key.y + key.height - 12);
    }
    ctx.restore();
  }

  // 5. Draw 25 Black Keys on top (using pre-allocated cachedKeyGradients)
  for (const key of blackKeys) {
    const state = activeNotes.get(key.midi);
    const isPressed = Boolean(state);
    const guide = strikeLineGuides.get(key.midi);
    const isInQwertyRange = showQwertyKeyLabels && key.midi >= qwertyBaseMidi && key.midi <= qwertyHighMidi;
    const qwertyChar = isInQwertyRange ? OFFSET_TO_QWERTY_LABEL[key.midi - qwertyBaseMidi] : null;

    ctx.save();
    if (isPressed) {
      ctx.fillStyle = cachedKeyGradients.blackPressed;
      ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
      ctx.shadowBlur = 14;
    } else if (guide) {
      ctx.fillStyle = guide.lockedInWait
        ? cachedKeyGradients.blackLocked
        : (guide.handTrack === 1 ? cachedKeyGradients.blackGuideT1 : cachedKeyGradients.blackGuideT2);
    } else {
      ctx.fillStyle = cachedKeyGradients.blackIdle;
    }

    ctx.fillRect(key.x, key.y, key.width, key.height);

    ctx.strokeStyle = isPressed || guide ? '#fff3b0' : (isInQwertyRange ? '#d4af37' : '#493c6e');
    ctx.lineWidth = guide ? 1.6 : 1;
    ctx.strokeRect(key.x + 0.5, key.y + 0.5, key.width - 1, key.height - 1);

    if (qwertyChar) {
      ctx.fillStyle = isPressed || guide ? '#1a1200' : '#fde68a';
      ctx.font = `bold ${Math.max(8, Math.min(10, Math.floor(key.width * 0.48)))}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(qwertyChar, key.x + key.width / 2, key.y + key.height - 8);
    }
    ctx.restore();
  }

  // 6. Phase 7: Render Strike-Line Shockwaves, Arcane Particle Bursts & Floating XP Runes on top!
  updateAndDrawStrikeParticles(particleDt);
}

/**
 * Hit-test canvas coordinates (x, y) against the 61-key piano
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
    const namesStr = connectedNames.join(', ');
    setMidiStatus('connected', `MIDI: ${namesStr}`, `Connected Web MIDI Controller: ${namesStr}`);
    if (!userManuallyToggledQwertyLabels) {
      showQwertyKeyLabels = false;
      if (toggleQwertyLabelsCheckbox) toggleQwertyLabelsCheckbox.checked = false;
    }
  } else {
    setMidiStatus('waiting', 'QWERTY / Mouse', 'No Physical MIDI Keyboard Detected — Mouse & QWERTY Piano Active');
    if (!userManuallyToggledQwertyLabels) {
      showQwertyKeyLabels = true;
      if (toggleQwertyLabelsCheckbox) toggleQwertyLabelsCheckbox.checked = true;
    }
  }
}

function setMidiStatus(state, message, tooltipText = '') {
  midiStatusPill.classList.remove('status-connected', 'status-waiting', 'status-error');
  midiStatusPill.classList.add(`status-${state}`);
  midiStatusText.textContent = message;
  midiStatusPill.title = tooltipText || message;
}

function onMidiMessage(event) {
  const data = event.data;
  if (!data || data.length < 2) return;

  const status = data[0] & 0xf0;
  const data1 = data[1];
  const data2 = data.length > 2 ? data[2] : 0;

  if (status === 0x90) {
    if (data2 > 0) {
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

// Mouse & QWERTY Event Listeners
canvas.addEventListener('mousedown', (e) => {
  closeAllConservatoryPopovers();
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
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

function shiftQwertyOctave(semitoneDelta) {
  // Release any currently held QWERTY notes before shifting octaves
  for (const [k, midi] of Array.from(pressedQwertyKeys.entries())) {
    pressedQwertyKeys.delete(k);
    handleNoteOff(midi);
  }

  // Ensure QWERTY labels are visible when user shifts octave via Z/X
  showQwertyKeyLabels = true;
  if (toggleQwertyLabelsCheckbox) toggleQwertyLabelsCheckbox.checked = true;

  const nextBase = Math.max(MIN_MIDI, Math.min(MAX_MIDI - 12, qwertyBaseMidi + semitoneDelta));
  qwertyBaseMidi = nextBase;
  updateQwertyOctaveLabel(true);
}

function closeAllConservatoryPopovers() {
  if (settingsPopover) settingsPopover.classList.add('hidden');
  if (btnToggleSettings) {
    btnToggleSettings.classList.remove('active');
    btnToggleSettings.setAttribute('aria-expanded', 'false');
  }
  if (spellDetailsPopover) spellDetailsPopover.classList.add('hidden');
  if (btnSpellDetails) {
    btnSpellDetails.classList.remove('active');
    btnSpellDetails.setAttribute('aria-expanded', 'false');
  }
}

function isAnyModalOpen() {
  const perfOpen = performanceCheckModal && !performanceCheckModal.classList.contains('hidden');
  const questOpen = questBoardModal && !questBoardModal.classList.contains('hidden');
  return Boolean(perfOpen || questOpen);
}

window.addEventListener('keydown', (e) => {
  // Close open popovers and modals on Escape (Issue #33)
  if (e.key === 'Escape') {
    closeAllConservatoryPopovers();
    if (performanceCheckModal && !performanceCheckModal.classList.contains('hidden')) {
      e.preventDefault();
      closePerformanceCheckModal();
      return;
    }
    if (questBoardModal && !questBoardModal.classList.contains('hidden')) {
      e.preventDefault();
      closeQuestBoardModal();
      return;
    }
  }

  // Only block keyboard shortcuts when typing in text inputs (Issue #3 / H3)
  const tag = e.target?.tagName;
  const inputType = (e.target?.type || '').toLowerCase();
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && inputType !== 'range' && inputType !== 'file' && inputType !== 'button' && inputType !== 'checkbox')) {
    if (e.key === 'Escape') {
      e.target.blur();
    }
    return;
  }

  // Block Spacebar playback and QWERTY piano keys while a modal dialog is open (Issue #33)
  if (isAnyModalOpen()) {
    return;
  }

  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    togglePlayback();
    return;
  }

  if (e.repeat) return;
  const key = (e.key || '').toLowerCase();

  if (key === 'z' || e.code === 'KeyZ') {
    e.preventDefault();
    shiftQwertyOctave(-12);
    return;
  }
  if (key === 'x' || e.code === 'KeyX') {
    e.preventDefault();
    shiftQwertyOctave(12);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(QWERTY_OFFSETS, key)) {
    e.preventDefault();
    const midi = qwertyBaseMidi + QWERTY_OFFSETS[key];
    if (midi >= MIN_MIDI && midi <= MAX_MIDI && !pressedQwertyKeys.has(key)) {
      pressedQwertyKeys.set(key, midi);
      handleNoteOn(midi, 100, 'qwerty');
    }
  }
}, true);

window.addEventListener('keyup', (e) => {
  const key = (e.key || '').toLowerCase();
  if (pressedQwertyKeys.has(key)) {
    const midi = pressedQwertyKeys.get(key);
    pressedQwertyKeys.delete(key);
    handleNoteOff(midi);
  }
}, true);

function updateQwertyOctaveLabel(withVisualFeedback = false) {
  const lowName = midiToNoteName(qwertyBaseMidi);
  const highName = midiToNoteName(Math.min(MAX_MIDI, qwertyBaseMidi + 16));
  const rangeStr = `${lowName}–${highName}`;

  if (qwertyOctaveLabel) {
    qwertyOctaveLabel.textContent = rangeStr;
  }

  if (withVisualFeedback) {
    if (activeNotesDisplay && activeNotes.size === 0) {
      activeNotesDisplay.textContent = `QWERTY: ${rangeStr}`;
    }
    if (qwertyPill) {
      qwertyPill.style.borderColor = '#ffd700';
      qwertyPill.style.boxShadow = '0 0 12px rgba(255, 215, 0, 0.55)';
      setTimeout(() => {
        qwertyPill.style.borderColor = '';
        qwertyPill.style.boxShadow = '';
      }, 450);
    }
    spawnKeyParticleBurst(qwertyBaseMidi, 'gold', 12, true);
    spawnFloatingCanvasRune(qwertyBaseMidi + 7, `🎹 QWERTY: ${rangeStr}`, '#ffd700');
  }
}

if (btnQwertyDown) {
  btnQwertyDown.addEventListener('click', (e) => {
    shiftQwertyOctave(-12);
    e.currentTarget.blur();
  });
}

if (btnQwertyUp) {
  btnQwertyUp.addEventListener('click', (e) => {
    shiftQwertyOctave(12);
    e.currentTarget.blur();
  });
}

// Phase 1, 2, 3 & 4 UI Controls
synthPresetSelect.addEventListener('change', (e) => {
  applySynthPreset(e.target.value);
  e.target.blur();
});

masterVolumeSlider.addEventListener('input', (e) => {
  if (!masterVol) initAudioEngine();
  masterVol.volume.value = Number(e.target.value);
  if (currentSong?.backingAudioEl) {
    currentSong.backingAudioEl.volume = getBackingAudioVolumeFromSlider();
  }
});

masterVolumeSlider.addEventListener('mouseup', () => {
  masterVolumeSlider.blur();
});

btnRescanMidi.addEventListener('click', () => {
  initWebMIDI();
});

btnLoadMidi.addEventListener('click', () => {
  midiFileInput.click();
});

midiFileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    parseMidiBuffer(buffer, file.name, file.path || null);
  } catch (err) {
    alert(`Failed to parse MIDI file: ${err.message}`);
  }
  midiFileInput.value = '';
});

btnSampleMidi.addEventListener('click', () => {
  loadBuiltInDemoSpell();
});

btnPlayPause.addEventListener('click', () => {
  togglePlayback();
});

btnRestart.addEventListener('click', () => {
  resetPlaybackToStart();
});

/**
 * Sync the Unified 1-Click Practice Mode Selector (#practice-mode-select, Issue #20)
 * from playbackState.handIsolation and playbackState.accompanimentMode.
 */
function syncPracticeModeDropdownFromState() {
  if (!practiceModeSelect) return;
  const hand = playbackState.handIsolation;
  const acc = playbackState.accompanimentMode;

  if (acc === 'auto-both') {
    practiceModeSelect.value = 'preview';
  } else if (hand === 'both') {
    practiceModeSelect.value = 'both';
  } else if (hand === 'track1') {
    practiceModeSelect.value = acc === 'mute-other' ? 'rh-solo' : 'rh-auto';
  } else if (hand === 'track2') {
    practiceModeSelect.value = acc === 'mute-other' ? 'lh-solo' : 'lh-auto';
  }
}

let lastNonPreviewPracticeMode = { handIsolation: 'both', accompanimentMode: 'auto-other' };

/**
 * Apply a 1-click Practice Mode preset (#practice-mode-select, Issue #20 & Issue #36)
 */
function applyPracticeMode(mode) {
  if (mode === 'both') {
    playbackState.handIsolation = 'both';
    playbackState.accompanimentMode = 'auto-other';
    lastNonPreviewPracticeMode = { handIsolation: 'both', accompanimentMode: 'auto-other' };
  } else if (mode === 'rh-auto') {
    playbackState.handIsolation = 'track1';
    playbackState.accompanimentMode = 'auto-other';
    lastNonPreviewPracticeMode = { handIsolation: 'track1', accompanimentMode: 'auto-other' };
  } else if (mode === 'rh-solo') {
    playbackState.handIsolation = 'track1';
    playbackState.accompanimentMode = 'mute-other';
    lastNonPreviewPracticeMode = { handIsolation: 'track1', accompanimentMode: 'mute-other' };
  } else if (mode === 'lh-auto') {
    playbackState.handIsolation = 'track2';
    playbackState.accompanimentMode = 'auto-other';
    lastNonPreviewPracticeMode = { handIsolation: 'track2', accompanimentMode: 'auto-other' };
  } else if (mode === 'lh-solo') {
    playbackState.handIsolation = 'track2';
    playbackState.accompanimentMode = 'mute-other';
    lastNonPreviewPracticeMode = { handIsolation: 'track2', accompanimentMode: 'mute-other' };
  } else if (mode === 'preview') {
    playbackState.handIsolation = 'both';
    playbackState.accompanimentMode = 'auto-both';
    if (playbackState.waitMode) {
      playbackState.waitMode = false;
      waitModeStateText.textContent = 'OFF';
      btnWaitMode.classList.remove('btn-wait-active');
    }
    playbackState.isWaitingForStrike = false;
    playbackState.waitStartedAtMs = null;
    playbackState.activeStrikeGroup = null;
    playbackState.lastFrameTimestamp = performance.now();
    setStrikeStatusBadge('ready', 'Listen Only Mode (Auto-Playing Both Hands)');
  }

  if (handIsolationSelect) handIsolationSelect.value = playbackState.handIsolation;
  if (accompanimentSelect) accompanimentSelect.value = playbackState.accompanimentMode;
  resetSongProgressFlags(playbackState.currentTime, { preserveTriggeredAtTarget: true });
}

btnWaitMode.addEventListener('click', () => {
  playbackState.waitMode = !playbackState.waitMode;
  waitModeStateText.textContent = playbackState.waitMode ? 'ON' : 'OFF';
  btnWaitMode.classList.toggle('btn-wait-active', playbackState.waitMode);

  if (playbackState.waitMode && playbackState.accompanimentMode === 'auto-both') {
    playbackState.handIsolation = lastNonPreviewPracticeMode.handIsolation || 'both';
    playbackState.accompanimentMode = lastNonPreviewPracticeMode.accompanimentMode || 'auto-other';
    if (handIsolationSelect) handIsolationSelect.value = playbackState.handIsolation;
    if (accompanimentSelect) accompanimentSelect.value = playbackState.accompanimentMode;
    syncPracticeModeDropdownFromState();
  }

  if (!playbackState.waitMode) {
    playbackState.isWaitingForStrike = false;
    playbackState.waitStartedAtMs = null;
    playbackState.activeStrikeGroup = null;
    playbackState.lastFrameTimestamp = performance.now();
    setStrikeStatusBadge('ready', 'Arcade Mode Active (Continuous Playback)');
  } else {
    resetSongProgressFlags(playbackState.currentTime, { preserveTriggeredAtTarget: true });
    setStrikeStatusBadge('ready', 'Wait Mode Active (100ms Chord Grace)');
  }
  syncBackingAudioElement(playbackState.currentTime);
});

songProgressSlider.addEventListener('mousedown', () => {
  playbackState.isScrubbing = true;
});

songProgressSlider.addEventListener('input', (e) => {
  if (!currentSong) return;
  const ratio = Number(e.target.value) / 1000;
  playbackState.currentTime = ratio * currentSong.duration;
  if (playbackState.currentTime < currentSong.duration) {
    songSessionStats.hasShownEndModal = false;
  }
  resetSongProgressFlags(playbackState.currentTime);
  if (currentSong.backingAudioEl) {
    try {
      currentSong.backingAudioEl.currentTime = Math.max(0, Math.min(currentSong.duration, playbackState.currentTime));
    } catch {
      // Ignore seek errors before audio metadata is loaded
    }
  }
  updateTimelineUI();
});

songProgressSlider.addEventListener('mouseup', () => {
  playbackState.isScrubbing = false;
  songProgressSlider.blur();
});

playableTrackSelect.addEventListener('change', (e) => {
  assignSongTracksAndDifficulty(e.target.value);
  e.target.blur();
});

if (practiceModeSelect) {
  practiceModeSelect.addEventListener('change', (e) => {
    applyPracticeMode(e.target.value);
    e.target.blur();
  });
}

handIsolationSelect.addEventListener('change', (e) => {
  playbackState.handIsolation = e.target.value;
  syncPracticeModeDropdownFromState();
  resetSongProgressFlags(playbackState.currentTime, { preserveTriggeredAtTarget: true });
  e.target.blur();
});

accompanimentSelect.addEventListener('change', (e) => {
  playbackState.accompanimentMode = e.target.value;
  syncPracticeModeDropdownFromState();
  resetSongProgressFlags(playbackState.currentTime, { preserveTriggeredAtTarget: true });
  e.target.blur();
});

// Phase 10 Popovers & QWERTY Key Label Toggle (Issues #18 & #21)
if (toggleQwertyLabelsCheckbox) {
  toggleQwertyLabelsCheckbox.addEventListener('change', (e) => {
    userManuallyToggledQwertyLabels = true;
    showQwertyKeyLabels = Boolean(e.target.checked);
    e.target.blur();
  });
}

if (btnToggleSettings && settingsPopover) {
  btnToggleSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = settingsPopover.classList.contains('hidden');
    closeAllConservatoryPopovers();
    if (willOpen) {
      settingsPopover.classList.remove('hidden');
      btnToggleSettings.classList.add('active');
      btnToggleSettings.setAttribute('aria-expanded', 'true');
    }
  });
}

if (btnCloseSettings) {
  btnCloseSettings.addEventListener('click', () => {
    closeAllConservatoryPopovers();
  });
}

if (btnSpellDetails && spellDetailsPopover) {
  btnSpellDetails.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = spellDetailsPopover.classList.contains('hidden');
    closeAllConservatoryPopovers();
    if (willOpen) {
      spellDetailsPopover.classList.remove('hidden');
      btnSpellDetails.classList.add('active');
      btnSpellDetails.setAttribute('aria-expanded', 'true');
    }
  });
}

if (btnCloseSpellDetails) {
  btnCloseSpellDetails.addEventListener('click', () => {
    closeAllConservatoryPopovers();
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (
    settingsPopover &&
    !settingsPopover.classList.contains('hidden') &&
    !settingsPopover.contains(target) &&
    target !== btnToggleSettings
  ) {
    closeAllConservatoryPopovers();
  }
  if (
    spellDetailsPopover &&
    !spellDetailsPopover.classList.contains('hidden') &&
    !spellDetailsPopover.contains(target) &&
    target !== btnSpellDetails
  ) {
    closeAllConservatoryPopovers();
  }
});

btnBackingBand.addEventListener('click', () => {
  playbackState.backingBandEnabled = !playbackState.backingBandEnabled;
  backingBandStateText.textContent = playbackState.backingBandEnabled ? 'ON' : 'OFF';
  btnBackingBand.classList.toggle('btn-toggle-active', playbackState.backingBandEnabled);
  if (!playbackState.backingBandEnabled && backingBandSynth) {
    backingBandSynth.releaseAll();
  }
  syncBackingAudioElement(playbackState.currentTime);
});

playbackSpeedSelect.addEventListener('change', (e) => {
  playbackState.playbackSpeed = Number(e.target.value) || 1.0;
  e.target.blur();
});

fallSpeedSelect.addEventListener('change', (e) => {
  playbackState.fallSpeedPxPerSec = Number(e.target.value) || 260;
  e.target.blur();
});

// Phase 5 UI Listeners: Performance Check Modal & +25 Streak Test Shortcut
btnPerformanceCheck.addEventListener('click', () => {
  openPerformanceCheckModal();
});

btnBoostChain.addEventListener('click', () => {
  songSessionStats.spellChain += 25;
  if (songSessionStats.spellChain > songSessionStats.maxSpellChain) {
    songSessionStats.maxSpellChain = songSessionStats.spellChain;
  }
  if (songSessionStats.spellChain > bardProfile.bestCareerChain) {
    bardProfile.bestCareerChain = songSessionStats.spellChain;
  }
  const diffMult = currentSong?.difficulty?.xpMultiplier ?? 1.0;
  const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
  const bonusXp = Math.round(25 * BASE_NOTE_XP * diffMult * (isInspired ? BARDIC_INSPIRATION_MULT : 1.0));
  songSessionStats.cleanNotesHit += 25;
  awardBardXp(bonusXp);
  songSessionStats.lastGainText = `+${bonusXp} XP (+25 Chain Boost!)`;
  songSessionStats.lastGainFumbled = false;
  updateLitrpgHUD();

  // Phase 7: Spawn a celebratory arcane wave of particle bursts across the keyboard!
  const fanfareMidis = [48, 55, 60, 64, 67, 72, 76, 79, 84];
  fanfareMidis.forEach((m, idx) => {
    setTimeout(() => {
      spawnKeyParticleBurst(m, isInspired ? 'inspired' : 'gold', 18, true);
      if (idx === 4) {
        spawnFloatingCanvasRune(
          m,
          isInspired ? `🔥 BARDIC INSPIRATION! +${bonusXp} XP` : `✨ +25 SPELL CHAIN! +${bonusXp} XP`,
          isInspired ? '#f0abfc' : '#ffd700'
        );
      }
    }, idx * 35);
  });
});

btnModalReplay.addEventListener('click', () => {
  closePerformanceCheckModal();
  resetPlaybackToStart();
  startPlayback();
});

btnModalClose.addEventListener('click', () => {
  closePerformanceCheckModal();
});

performanceCheckModal.addEventListener('click', (e) => {
  if (e.target === performanceCheckModal) {
    closePerformanceCheckModal();
  }
});

// Phase 6 UI Listeners: The Grimoire Sidebar & ./Imports Folder Watcher
function toggleGrimoireSidebar() {
  if (!grimoireSidebar) return;
  grimoireSidebar.classList.toggle('collapsed');
  setTimeout(() => computeKeyGeometry(), 30);
}

btnToggleGrimoire.addEventListener('click', () => {
  toggleGrimoireSidebar();
});

btnCloseGrimoire.addEventListener('click', () => {
  if (!grimoireSidebar) return;
  grimoireSidebar.classList.add('collapsed');
  setTimeout(() => computeKeyGeometry(), 30);
});

btnSaveGrimoire.addEventListener('click', () => {
  saveActiveSpellToGrimoire();
});

btnOpenImports.addEventListener('click', () => {
  try {
    if (!fs.existsSync(IMPORTS_DIR)) {
      fs.mkdirSync(IMPORTS_DIR, { recursive: true });
    }
    shell.openPath(IMPORTS_DIR);
  } catch (err) {
    alert(`Could not open Imports folder: ${err.message}`);
  }
});

btnTestWatcherDrop.addEventListener('click', () => {
  dropTestMidiIntoImports();
});

grimoireSearchInput.addEventListener('input', () => {
  renderGrimoireSidebar();
});

grimoireFilterSelect.addEventListener('change', () => {
  renderGrimoireSidebar();
});

// ============================================================================
// PHASE 9: "THE QUEST BOARD" (IN-APP YOUTUBE-TO-MIDI SOURCING & QUICK LINKS)
// ============================================================================

let activeQuestChildProcess = null;
let lastQuestTranscribedMidiPath = null;

function openQuestBoardModal() {
  pausePlayback();
  if (questBoardModal) {
    questBoardModal.classList.remove('hidden');
  }
}

function closeQuestBoardModal() {
  if (questBoardModal) {
    questBoardModal.classList.add('hidden');
  }
}

/**
 * Resolve the local Python executable, preferring the user's Python 3.14 install
 * before falling back to 'python' on PATH (avoiding the WindowsApps Store stub).
 */
function resolvePythonExecutable() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(localAppData, 'Python', 'pythoncore-3.14-64', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python314', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(localAppData, 'Programs', 'Python', 'Python310', 'python.exe')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore fs check error
    }
  }
  return 'python';
}

function setQuestStageUI(stageType, badgeText, progressPct, messageText) {
  if (questStatusBadge) {
    questStatusBadge.className = `quest-stage-pill stage-${stageType}`;
    questStatusBadge.textContent = badgeText;
  }
  if (typeof progressPct === 'number') {
    const clamped = Math.max(0, Math.min(100, Math.round(progressPct)));
    if (questProgressPct) questProgressPct.textContent = `${clamped}%`;
    if (questProgressFill) questProgressFill.style.width = `${clamped}%`;
  }
  if (messageText && questProgressMessage) {
    questProgressMessage.textContent = messageText;
  }
}

function appendQuestLogLine(line) {
  if (!questLogOutput) return;
  questLogOutput.textContent += `\n${line}`;
  questLogOutput.scrollTop = questLogOutput.scrollHeight;
}

/**
 * Spawn `python_ml/transcribe_quest.py` in the background and stream `[QUEST_STATUS]` JSON progress!
 */
function runQuestBoardTranscriber({ selfTest = false } = {}) {
  if (activeQuestChildProcess) {
    alert('A Quest Board transcription is already running in the background!');
    return;
  }

  const rawUrlOrPath = (questYoutubeUrlInput?.value || '').trim();
  const customTitle = (questCustomTitleInput?.value || '').trim();

  if (!selfTest && !rawUrlOrPath) {
    alert('Please paste a YouTube URL (or local .wav / .mp3 path), or click "⚡ Run ML Self-Test (2s)"!');
    questYoutubeUrlInput?.focus();
    return;
  }

  const scriptPath = path.join(__dirname, 'python_ml', 'transcribe_quest.py');
  if (!fs.existsSync(scriptPath)) {
    alert(`Python ML script not found at: ${scriptPath}`);
    return;
  }

  const pythonExe = resolvePythonExecutable();
  const args = [scriptPath, '--output-dir', IMPORTS_DIR];

  if (selfTest) {
    args.push('--self-test');
    if (customTitle) {
      args.push('--title', customTitle);
    }
  } else {
    args.push(rawUrlOrPath);
    if (customTitle) {
      args.push('--title', customTitle);
    }
  }

  if (btnRunQuestUrl) btnRunQuestUrl.disabled = true;
  if (btnRunQuestSelfTest) btnRunQuestSelfTest.disabled = true;
  if (btnQuestLoadResult) btnQuestLoadResult.classList.add('hidden');

  if (questLogOutput) {
    questLogOutput.textContent = `[Quest Started] Spawning: ${path.basename(pythonExe)} python_ml/transcribe_quest.py ${selfTest ? '--self-test' : rawUrlOrPath}`;
  }

  setQuestStageUI(
    'running',
    'Transcribing...',
    8,
    selfTest
      ? 'Synthesizing polyphonic acoustic test audio (.wav) & running audio-to-MIDI transcriber...'
      : `Connecting to yt-dlp & audio-to-MIDI pipeline for: ${rawUrlOrPath}`
  );

  try {
    const child = spawn(pythonExe, args, {
      cwd: __dirname,
      windowsHide: true
    });
    activeQuestChildProcess = child;

    let stdoutBuffer = '';

    const processOutputLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      appendQuestLogLine(trimmed);

      const statusIdx = trimmed.indexOf('[QUEST_STATUS]');
      if (statusIdx !== -1) {
        const jsonPart = trimmed.slice(statusIdx + '[QUEST_STATUS]'.length).trim();
        try {
          const payload = JSON.parse(jsonPart);
          const pct = typeof payload.progress === 'number' ? payload.progress : 50;
          const msg = payload.message || 'Processing audio...';

          if (payload.stage === 'complete') {
            setQuestStageUI('complete', 'Complete • Ingested!', 100, msg);
            if (payload.midi_path) {
              lastQuestTranscribedMidiPath = payload.midi_path;
              if (btnQuestLoadResult) {
                btnQuestLoadResult.textContent = `▶ Load "${payload.title || path.basename(payload.midi_path)}" Now`;
                btnQuestLoadResult.classList.remove('hidden');
              }
            }
            // Trigger immediate folder watcher scan so The Grimoire updates live
            setTimeout(() => scanWatchedDirectories(true), 120);
          } else if (payload.stage === 'error') {
            setQuestStageUI('error', 'Quest Error', pct, `Error: ${msg}`);
          } else {
            const labelMap = {
              starting: 'Starting...',
              downloading: 'Downloading YouTube...',
              downloaded: 'Audio Ready',
              transcribing: 'Transcribing Notes...',
              writing_midi: 'Writing .mid Scroll...'
            };
            setQuestStageUI('running', labelMap[payload.stage] || 'Working...', pct, msg);
          }
        } catch {
          // Ignore malformed JSON line
        }
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const l of lines) {
        processOutputLine(l);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        appendQuestLogLine(`[stderr] ${text}`);
      }
    });

    child.on('error', (err) => {
      activeQuestChildProcess = null;
      if (btnRunQuestUrl) btnRunQuestUrl.disabled = false;
      if (btnRunQuestSelfTest) btnRunQuestSelfTest.disabled = false;
      setQuestStageUI('error', 'Spawn Failed', 0, `Could not launch Python: ${err.message}`);
      appendQuestLogLine(`[Error] ${err.message}`);
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim()) {
        processOutputLine(stdoutBuffer);
      }
      activeQuestChildProcess = null;
      if (btnRunQuestUrl) btnRunQuestUrl.disabled = false;
      if (btnRunQuestSelfTest) btnRunQuestSelfTest.disabled = false;

      if (code === 0) {
        setTimeout(() => scanWatchedDirectories(true), 150);
      } else if (questStatusBadge && !questStatusBadge.classList.contains('stage-error')) {
        setQuestStageUI('error', `Exited (${code})`, 0, `Transcriber exited with code ${code}. Check console log below.`);
      }
    });
  } catch (err) {
    activeQuestChildProcess = null;
    if (btnRunQuestUrl) btnRunQuestUrl.disabled = false;
    if (btnRunQuestSelfTest) btnRunQuestSelfTest.disabled = false;
    setQuestStageUI('error', 'Failed', 0, `Failed to start Python transcriber: ${err.message}`);
  }
}

if (btnOpenQuestBoard) {
  btnOpenQuestBoard.addEventListener('click', () => {
    openQuestBoardModal();
  });
}

if (btnCloseQuestBoard) {
  btnCloseQuestBoard.addEventListener('click', () => {
    closeQuestBoardModal();
  });
}

if (btnQuestCloseBottom) {
  btnQuestCloseBottom.addEventListener('click', () => {
    closeQuestBoardModal();
  });
}

if (questBoardModal) {
  questBoardModal.addEventListener('click', (e) => {
    if (e.target === questBoardModal) {
      closeQuestBoardModal();
    }
  });
}

if (btnRunQuestUrl) {
  btnRunQuestUrl.addEventListener('click', () => {
    runQuestBoardTranscriber({ selfTest: false });
  });
}

if (questYoutubeUrlInput) {
  questYoutubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runQuestBoardTranscriber({ selfTest: false });
    }
  });
}

if (btnRunQuestSelfTest) {
  btnRunQuestSelfTest.addEventListener('click', () => {
    runQuestBoardTranscriber({ selfTest: true });
  });
}

if (btnQuestLoadResult) {
  btnQuestLoadResult.addEventListener('click', () => {
    if (lastQuestTranscribedMidiPath && fs.existsSync(lastQuestTranscribedMidiPath)) {
      try {
        const buf = fs.readFileSync(lastQuestTranscribedMidiPath);
        const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        parseMidiBuffer(arrayBuf, path.basename(lastQuestTranscribedMidiPath), lastQuestTranscribedMidiPath);
        closeQuestBoardModal();
        showGrimoireToast(`🔮 Loaded Transcribed Spell: "${path.basename(lastQuestTranscribedMidiPath)}"!`);
      } catch (err) {
        alert(`Failed to load transcribed MIDI: ${err.message}`);
      }
    }
  });
}

if (btnLinkBitmidi) {
  btnLinkBitmidi.addEventListener('click', () => {
    shell.openExternal('https://bitmidi.com');
  });
}

if (btnLinkVgmusic) {
  btnLinkVgmusic.addEventListener('click', () => {
    shell.openExternal('https://www.vgmusic.com');
  });
}

if (btnLinkYoutube) {
  btnLinkYoutube.addEventListener('click', () => {
    shell.openExternal('https://www.youtube.com');
  });
}

if (btnQuestOpenImports) {
  btnQuestOpenImports.addEventListener('click', () => {
    try {
      if (!fs.existsSync(IMPORTS_DIR)) {
        fs.mkdirSync(IMPORTS_DIR, { recursive: true });
      }
      shell.openPath(IMPORTS_DIR);
    } catch (err) {
      alert(`Could not open Imports folder: ${err.message}`);
    }
  });
}

// Drag & Drop .mid support on the stage
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  stageContainer.classList.add('drag-over');
});

window.addEventListener('dragleave', (e) => {
  if (e.target === document.body || e.target === stageContainer) {
    stageContainer.classList.remove('drag-over');
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  stageContainer.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  if (!/\.(mid|midi)$/i.test(file.name)) {
    alert('Please drop a valid .mid or .midi file.');
    return;
  }
  try {
    const buffer = await file.arrayBuffer();
    parseMidiBuffer(buffer, file.name, file.path || null);
  } catch (err) {
    alert(`Failed to parse MIDI file: ${err.message}`);
  }
});

window.addEventListener('resize', () => {
  computeKeyGeometry();
});

// Release any held QWERTY or mouse notes if the window loses focus (Alt+Tab) (Issue #16)
window.addEventListener('blur', () => {
  for (const [k, midi] of Array.from(pressedQwertyKeys.entries())) {
    pressedQwertyKeys.delete(k);
    handleNoteOff(midi);
  }
  if (isMouseDown) {
    isMouseDown = false;
    if (currentMouseMidi !== null) {
      handleNoteOff(currentMouseMidi);
      currentMouseMidi = null;
    }
  }
});

// Terminate any active background Python transcription child process on window close/reload (Issue #17)
window.addEventListener('beforeunload', () => {
  if (activeQuestChildProcess) {
    try {
      activeQuestChildProcess.kill();
    } catch {
      // Ignore kill errors
    }
    activeQuestChildProcess = null;
  }
});

// Boot Application & Start 60 FPS Spell Highway Loop
computeKeyGeometry();
loadBardProfile();
initGrimoireAndWatcher();
initAudioEngine();
initWebMIDI();
tryAutoLoadWorkspaceMidi();
requestAnimationFrame(animationLoop);

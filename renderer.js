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
const crypto = require('crypto');
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
const SONG_STATS_STORAGE_KEY = 'collegeOfKeys_songStats_v1';
const SONG_STATS_FILE_PATH = path.join(__dirname, 'song_stats.json');
const FIRST_RUN_STORAGE_KEY = 'collegeOfKeys_hasSeenIntro_v1';

// Phase 6 Constants: The Grimoire & Watched Directories
const IMPORTS_DIR = path.join(__dirname, 'Imports');
const MIDI_TEST_DIR = path.join(__dirname, 'Midi Test Files');
const ARCHIVE_DIR = path.join(__dirname, 'Archive');
const GRIMOIRE_STORAGE_KEY = 'collegeOfKeys_grimoire_v1';
const GRIMOIRE_FAVORITES_STORAGE_KEY = 'collegeOfKeys_grimoire_favorites_v1';
const GRIMOIRE_FAV_FILTER_STORAGE_KEY = 'collegeOfKeys_grimoire_attuned_filter_v1';
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
const loopRangeFill = document.getElementById('loop-range-fill');
const loopMarkerA = document.getElementById('loop-marker-a');
const loopMarkerB = document.getElementById('loop-marker-b');
const btnLoopA = document.getElementById('btn-loop-a');
const btnLoopB = document.getElementById('btn-loop-b');
const btnRehearsalToggle = document.getElementById('btn-rehearsal-toggle');
const btnRehearsalPopover = document.getElementById('btn-rehearsal-popover');
const rehearsalPopover = document.getElementById('rehearsal-popover');
const btnCloseRehearsalPopover = document.getElementById('btn-close-rehearsal-popover');
const rehearsalATime = document.getElementById('rehearsal-a-time');
const rehearsalBTime = document.getElementById('rehearsal-b-time');
const btnLoopClear = document.getElementById('btn-loop-clear');
const chkRehearsalAutoramp = document.getElementById('chk-rehearsal-autoramp');
const rehearsalTargetSpeedSelect = document.getElementById('rehearsal-target-speed');
const rehearsalPassStatus = document.getElementById('rehearsal-pass-status');
const playableTrackSelect = document.getElementById('playable-track-select');
const handIsolationSelect = document.getElementById('hand-isolation-select');
const accompanimentSelect = document.getElementById('accompaniment-select');
const btnBackingBand = document.getElementById('btn-backing-band');
const backingBandStateText = document.getElementById('backing-band-state');
const tempoControlGroup = document.getElementById('tempo-control-group');
const btnTempoDown = document.getElementById('btn-tempo-down');
const btnTempoUp = document.getElementById('btn-tempo-up');
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
const modalBreakdownSection = document.getElementById('modal-breakdown-section');
const modalBreakdownSummary = document.getElementById('modal-breakdown-summary');
const modalSectionBars = document.getElementById('modal-section-bars');
const modalWeakMeasures = document.getElementById('modal-weak-measures');
const btnModalReplay = document.getElementById('btn-modal-replay');
const btnModalClose = document.getElementById('btn-modal-close');

// DOM Elements — Phase 6 & Issue #69 (The Flippable Grimoire Spellbook Pop-Up Module & Folder Watcher)
const btnToggleGrimoire = document.getElementById('btn-toggle-grimoire');
const grimoireCountBadge = document.getElementById('grimoire-count-badge');
const grimoireToast = document.getElementById('grimoire-toast');
const grimoireToastText = document.getElementById('grimoire-toast-text');

// Issue #69: The Flippable Spellbook Pop-Up Module Elements
const grimoireSpellbookModal = document.getElementById('grimoire-spellbook-modal');
const btnCloseSpellbook = document.getElementById('btn-close-spellbook');
const btnSpellbookSaveCurrent = document.getElementById('btn-spellbook-save-current');
const btnSpellbookOpenImports = document.getElementById('btn-spellbook-open-imports');
const btnSpellbookDropTest = document.getElementById('btn-spellbook-drop-test');
const spellbookSpread = document.getElementById('spellbook-spread');
const spellbookTierBadge = document.getElementById('spellbook-tier-badge');
const spellbookTierXp = document.getElementById('spellbook-tier-xp');
const spellbookTierName = document.getElementById('spellbook-tier-name');
const spellbookTierDesc = document.getElementById('spellbook-tier-desc');
const spellbookSearchInput = document.getElementById('spellbook-search-input');
const btnSpellbookFavoritesFilter = document.getElementById('btn-spellbook-favorites-filter');
const spellbookFavCount = document.getElementById('spellbook-fav-count');
const spellbookSongList = document.getElementById('spellbook-song-list');
const spellbookEmptyState = document.getElementById('spellbook-empty-state');
const btnSpellbookQuestPointer = document.getElementById('btn-spellbook-quest-pointer');
const spellbookPageNumLeft = document.getElementById('spellbook-page-num-left');
const spellbookPageNumRight = document.getElementById('spellbook-page-num-right');

// Right Page Details Elements
const spellbookDetailTierChip = document.getElementById('spellbook-detail-tier-chip');
const spellbookDetailSource = document.getElementById('spellbook-detail-source');
const spellbookDetailTitle = document.getElementById('spellbook-detail-title');
const spellbookDetailFile = document.getElementById('spellbook-detail-file');
const spellbookDetailBpm = document.getElementById('spellbook-detail-bpm');
const spellbookDetailDuration = document.getElementById('spellbook-detail-duration');
const spellbookDetailNps = document.getElementById('spellbook-detail-nps');
const spellbookDetailNotes = document.getElementById('spellbook-detail-notes');
const spellbookDetailPlays = document.getElementById('spellbook-detail-plays');
const spellbookDetailBestAcc = document.getElementById('spellbook-detail-best-acc');
const spellbookDetailLastAcc = document.getElementById('spellbook-detail-last-acc');
const spellbookDetailTotalXp = document.getElementById('spellbook-detail-total-xp');
const spellbookDetailLastPlayed = document.getElementById('spellbook-detail-last-played');
const spellbookDetailAudioBadge = document.getElementById('spellbook-detail-audio-badge');
const btnSpellbookLoadSong = document.getElementById('btn-spellbook-load-song');
const btnSpellbookFavoriteSong = document.getElementById('btn-spellbook-favorite-song');
const btnSpellbookDeleteSong = document.getElementById('btn-spellbook-delete-song');

// Navigation Bar Elements
const btnSpellbookPrevPage = document.getElementById('btn-spellbook-prev-page');
const btnSpellbookNextPage = document.getElementById('btn-spellbook-next-page');
const spellbookTierPips = document.getElementById('spellbook-tier-pips');

// Issue #77: In-App Delete Spell Confirmation Modal Elements
const deleteSpellConfirmModal = document.getElementById('delete-spell-confirm-modal');
const deleteConfirmSongTitle = document.getElementById('delete-confirm-song-title');
const deleteConfirmActiveWarning = document.getElementById('delete-confirm-active-warning');
const deleteConfirmFileList = document.getElementById('delete-confirm-file-list');
const btnCloseDeleteConfirm = document.getElementById('btn-close-delete-confirm');
const btnDeleteConfirmCancel = document.getElementById('btn-delete-confirm-cancel');
const btnDeleteConfirmAccept = document.getElementById('btn-delete-confirm-accept');

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

// DOM Elements — Issue #52 (The Tavern Title Screen & Main Menu, Bardic Annals & Orientation)
const tavernMainMenu = document.getElementById('tavern-main-menu');
const tavernTitleSplash = document.getElementById('tavern-title-splash');
const btnEnterTavern = document.getElementById('btn-enter-tavern');
let hasEnteredTavernSession = false;


const btnReturnTavern = document.getElementById('btn-return-tavern');
const tavernBardCard = document.getElementById('tavern-bard-card');
const menuBardLevel = document.getElementById('menu-bard-level');
const menuBardTitle = document.getElementById('menu-bard-title');
const menuTotalXp = document.getElementById('menu-total-xp');
const menuXpProgressText = document.getElementById('menu-xp-progress-text');
const menuNextLevelText = document.getElementById('menu-next-level-text');
const menuXpBarFill = document.getElementById('menu-xp-bar-fill');
const btnMenuContinue = document.getElementById('btn-menu-continue');
const menuLastSongLabel = document.getElementById('menu-last-song-label');
const btnMenuGrimoire = document.getElementById('btn-menu-grimoire');
const menuGrimoireSummary = document.getElementById('menu-grimoire-summary');
const btnMenuQuestBoard = document.getElementById('btn-menu-quest-board');
const btnMenuHowToPlay = document.getElementById('btn-menu-how-to-play');
const btnMenuSettings = document.getElementById('btn-menu-settings');

// Issue #66: Hearthfire Practice Streak Pill & Month Calendar Popover
const btnTavernStreakPill = document.getElementById('btn-tavern-streak-pill');
const tavernStreakPopover = document.getElementById('tavern-streak-popover');
const btnCloseStreakPopover = document.getElementById('btn-close-streak-popover');
const menuStreakCount = document.getElementById('menu-streak-count');
const menuStreakStatus = document.getElementById('menu-streak-status');
const streakPopoverCount = document.getElementById('streak-popover-count');
const btnStreakPrevMonth = document.getElementById('btn-streak-prev-month');
const streakMonthLabel = document.getElementById('streak-month-label');
const btnStreakNextMonth = document.getElementById('btn-streak-next-month');
const streakCalendarGrid = document.getElementById('streak-calendar-grid');
const streakTodayStatus = document.getElementById('streak-today-status');
const streakBestLabel = document.getElementById('streak-best-label');

// Issue #53: Daily Quest System (Tavern Bounties & Performance Check Banner)
const menuDailyBountySummary = document.getElementById('menu-daily-bounty-summary');
const dailyBountiesList = document.getElementById('daily-bounties-list');
const dailyBountiesProgressPill = document.getElementById('daily-bounties-progress-pill');
const btnRerollDailyBounty = document.getElementById('btn-reroll-daily-bounty');
const modalQuestsBanner = document.getElementById('modal-quests-banner');
const modalQuestsXpPill = document.getElementById('modal-quests-xp-pill');
const modalQuestsList = document.getElementById('modal-quests-list');

const bardAnnalsModal = document.getElementById('bard-annals-modal');
const btnCloseAnnals = document.getElementById('btn-close-annals');
const btnAnnalsCloseBottom = document.getElementById('btn-annals-close-bottom');
const annalsBardLevel = document.getElementById('annals-bard-level');
const annalsBardTitle = document.getElementById('annals-bard-title');
const annalsTotalXp = document.getElementById('annals-total-xp');
const annalsSongsCompleted = document.getElementById('annals-songs-completed');
const annalsBestChain = document.getElementById('annals-best-chain');
const annalsCareerAccuracy = document.getElementById('annals-career-accuracy');
const annalsFavSong = document.getElementById('annals-fav-song');
const annalsFavPlays = document.getElementById('annals-fav-plays');
const annalsBestSong = document.getElementById('annals-best-song');
const annalsBestAccuracy = document.getElementById('annals-best-accuracy');
const annalsWorstSong = document.getElementById('annals-worst-song');
const annalsWorstAccuracy = document.getElementById('annals-worst-accuracy');
const annalsHistoryList = document.getElementById('annals-history-list');

const howToPlayModal = document.getElementById('how-to-play-modal');
const btnCloseHowToPlay = document.getElementById('btn-close-how-to-play');
const btnHowToPlayReady = document.getElementById('btn-how-to-play-ready');

// Issue #52 State: Main Menu Visibility & Persistent Song Play History
let isTavernMenuVisible = true;
const songPlayHistory = {};

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

// Issue #30: Loop Practice Mode (Rehearsal) State
const REHEARSAL_SPEED_PRESETS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0, 1.25];
const REHEARSAL_PREROLL_SEC = 0.8;
const MIN_REHEARSAL_LOOP_SPAN_SEC = 0.5;

const rehearsalLoopState = {
  enabled: false,
  startTime: null,
  endTime: null,
  autoRamp: false,
  targetSpeed: 1.0,
  cleanPasses: 0,
  totalPasses: 0,
  passMistakes: 0
};

// Phase 5 State: Persistent Bard Profile & Per-Song Performance Session Stats
const bardProfile = {
  totalXp: 0,
  level: 1,
  xpIntoLevel: 0,
  xpForNextLevel: LEVEL_1_XP_THRESHOLD,
  title: 'Tavern Busker',
  bestCareerChain: 0,
  songsCompleted: 0,
  practiceDays: {},
  dailyQuests: null
};

// Issue #66: Current month/year displayed in the Hearthfire Streak Calendar popover
let streakViewYear = new Date().getFullYear();
let streakViewMonth = new Date().getMonth();

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
  hasShownEndModal: false,
  measureStats: {}
};

// Phase 6 State: The Grimoire Spell Library & Folder Watcher
const grimoireSpells = new Map(); // id -> spellEntry
const grimoireFavorites = new Set(); // Set of favorited entry.id strings (Issue #79)
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

const SPELLBOOK_TIERS = [
  { index: 0, levelName: 'Cantrip', title: 'Cantrip Spells', subtitle: 'Novice Cantrips', desc: 'Fundamentals & melodies (< 1.5 NPS)', maxNpsExclusive: 1.5, xpMultiplier: 1.0, xp: '1.0x XP', badgeClass: 'diff-cantrip', roman: 'I', pipLabel: 'CAN' },
  { index: 1, levelName: '1st-Level Spell', title: '1st-Level Spells', subtitle: 'Apprentice Invocations', desc: 'Simple leads & arpeggios (1.5 to <2.0 NPS)', maxNpsExclusive: 2.0, xpMultiplier: 1.1, xp: '1.1x XP', badgeClass: 'diff-level1', roman: 'II', pipLabel: '1ST' },
  { index: 2, levelName: '2nd-Level Spell', title: '2nd-Level Spells', subtitle: 'Journeyman Incantations', desc: 'Moderate melodies & rolls (2.0 to <2.6 NPS)', maxNpsExclusive: 2.6, xpMultiplier: 1.2, xp: '1.2x XP', badgeClass: 'diff-level2', roman: 'III', pipLabel: '2ND' },
  { index: 3, levelName: '3rd-Level Spell', title: '3rd-Level Spells', subtitle: 'Adept Harmonies', desc: 'Chords & rhythmic variety (2.6 to <3.3 NPS)', maxNpsExclusive: 3.3, xpMultiplier: 1.3, xp: '1.3x XP', badgeClass: 'diff-level3', roman: 'IV', pipLabel: '3RD' },
  { index: 4, levelName: '4th-Level Spell', title: '4th-Level Spells', subtitle: 'Virtuoso Sonatas', desc: 'Two-hand coordination (3.3 to <4.0 NPS)', maxNpsExclusive: 4.0, xpMultiplier: 1.4, xp: '1.4x XP', badgeClass: 'diff-level4', roman: 'V', pipLabel: '4TH' },
  { index: 5, levelName: '5th-Level Spell', title: '5th-Level Spells', subtitle: 'Master Cantos', desc: 'Polyphony & full voicings (4.0 to <4.8 NPS)', maxNpsExclusive: 4.8, xpMultiplier: 1.5, xp: '1.5x XP', badgeClass: 'diff-level5', roman: 'VI', pipLabel: '5TH' },
  { index: 6, levelName: '6th-Level Spell', title: '6th-Level Spells', subtitle: 'Grand Rhapsodies', desc: 'Complex counterpoint (4.8 to <5.8 NPS)', maxNpsExclusive: 5.8, xpMultiplier: 1.6, xp: '1.6x XP', badgeClass: 'diff-level6', roman: 'VII', pipLabel: '6TH' },
  { index: 7, levelName: '7th-Level Spell', title: '7th-Level Spells', subtitle: 'Arcane Symphonies', desc: 'Virtuosic runs & shifts (5.8 to <6.9 NPS)', maxNpsExclusive: 6.9, xpMultiplier: 1.7, xp: '1.7x XP', badgeClass: 'diff-level7', roman: 'VIII', pipLabel: '7TH' },
  { index: 8, levelName: '8th-Level Spell', title: '8th-Level Spells', subtitle: 'Mythic Concertos', desc: 'Rapid octave arpeggios (6.9 to <8.0 NPS)', maxNpsExclusive: 8.0, xpMultiplier: 1.8, xp: '1.8x XP', badgeClass: 'diff-level8', roman: 'IX', pipLabel: '8TH' },
  { index: 9, levelName: '9th-Level Spell', title: '9th-Level Spells', subtitle: 'Archmage Masterpieces', desc: 'Legendary grand works (8.0+ NPS)', maxNpsExclusive: Infinity, xpMultiplier: 2.0, xp: '2.0x XP', badgeClass: 'diff-level9', roman: 'X', pipLabel: '9TH' }
];

function calculateSpellDifficulty(totalPlayableNotes, durationSeconds) {
  const effectiveDuration = Math.max(1, durationSeconds);
  const nps = totalPlayableNotes / effectiveDuration;

  const matchedTier = SPELLBOOK_TIERS.find((tier) => nps < tier.maxNpsExclusive)
    || SPELLBOOK_TIERS[SPELLBOOK_TIERS.length - 1];

  return {
    nps,
    spellLevel: matchedTier.levelName,
    xpMultiplier: matchedTier.xpMultiplier,
    badgeClass: matchedTier.badgeClass,
    label: `${matchedTier.levelName} (${matchedTier.xp})`
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

  const timeSigHeader = midiData.header.timeSignatures.length > 0
    ? midiData.header.timeSignatures[0].timeSignature
    : [4, 4];
  const timeSigNumerator = Math.max(1, Number(timeSigHeader[0]) || 4);
  const timeSigDenominator = Math.max(1, Number(timeSigHeader[1]) || 4);
  const timeSig = `${timeSigNumerator}/${timeSigDenominator}`;
  const beatsPerMeasure = timeSigNumerator;

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
      backingAudioEl.preservesPitch = true;
      backingAudioEl.webkitPreservesPitch = true;
      backingAudioEl.volume = getBackingAudioVolumeFromSlider();
    } catch {
      backingAudioEl = null;
    }
  }

  const rawBuf = Buffer.from(arrayBuffer);
  const isDemo = fileName === 'Demo Spell (The Tavern Busker)' || cleanTitle.toLowerCase().includes('demo spell');
  const songId = isDemo
    ? 'builtin::demo'
    : crypto.createHash('sha1').update(rawBuf).digest('hex');

  currentSong = {
    songId,
    title: cleanTitle,
    fileName,
    filePath,
    rawBuffer: rawBuf,
    bpm,
    timeSignature: timeSig,
    timeSigNumerator,
    timeSigDenominator,
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
  clearRehearsalLoop();

  const savedHistory = getSongHistoryRecord({ id: songId, filePath, title: cleanTitle });
  const restoredTempo = typeof savedHistory?.preferredTempo === 'number'
    ? savedHistory.preferredTempo
    : 1.0;
  setPracticeTempo(restoredTempo, { persist: false, toast: false });

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
    bardProfile.lastSongTitle = loaded.lastSongTitle || null;
    bardProfile.lastSongPath = loaded.lastSongPath || null;
    if (loaded.practiceDays && typeof loaded.practiceDays === 'object' && !Array.isArray(loaded.practiceDays)) {
      const sanitizedDays = {};
      for (const [dateKey, entry] of Object.entries(loaded.practiceDays)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && entry) {
          sanitizedDays[dateKey] = entry;
        }
      }
      bardProfile.practiceDays = sanitizedDays;
    }
    if (loaded.dailyQuests && typeof loaded.dailyQuests === 'object' && Array.isArray(loaded.dailyQuests.quests)) {
      bardProfile.dailyQuests = loaded.dailyQuests;
    }
  }

  // Load per-song play history stats store (Issue #52 & #68)
  let loadedHistory = null;
  try {
    if (fs.existsSync(SONG_STATS_FILE_PATH)) {
      const rawFile = fs.readFileSync(SONG_STATS_FILE_PATH, 'utf8');
      loadedHistory = JSON.parse(rawFile);
    }
  } catch {
    // Ignore file read error
  }
  if (!loadedHistory) {
    try {
      const rawHist = localStorage.getItem(SONG_STATS_STORAGE_KEY);
      if (rawHist) {
        loadedHistory = JSON.parse(rawHist);
      }
    } catch {
      // Ignore storage read error
    }
  }
  if (!loadedHistory && loaded && loaded.songHistory) {
    loadedHistory = loaded.songHistory;
  }

  // Issue #68: Migrate legacy path-based keys to stable SHA1 content IDs and merge duplicates
  if (loadedHistory && typeof loadedHistory === 'object') {
    const migratedHistory = {};
    for (const [key, rawEntry] of Object.entries(loadedHistory)) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      let targetKey = key;
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'builtin::demo' || lowerKey.includes('demo spell')) {
        targetKey = 'builtin::demo';
      } else if (!/^[0-9a-f]{40}$/i.test(key)) {
        if (rawEntry.filePath && fs.existsSync(rawEntry.filePath)) {
          try {
            const buf = fs.readFileSync(rawEntry.filePath);
            targetKey = crypto.createHash('sha1').update(buf).digest('hex');
          } catch {
            targetKey = lowerKey;
          }
        } else {
          targetKey = lowerKey;
        }
      }

      const plays = Number(rawEntry.plays) || 0;
      const bestAcc = Number(rawEntry.bestAccuracy) || 0;
      const lastAcc = Number(rawEntry.lastAccuracy) || bestAcc;
      const bestChain = Number(rawEntry.bestChain) || 0;
      const totalXp = Number(rawEntry.totalXpEarned) || 0;

      if (!migratedHistory[targetKey]) {
        migratedHistory[targetKey] = {
          songId: targetKey,
          title: rawEntry.title || 'Untitled Scroll',
          filePath: rawEntry.filePath || null,
          plays,
          bestAccuracy: bestAcc,
          lastAccuracy: lastAcc,
          bestChain,
          totalXpEarned: totalXp,
          lastPlayed: rawEntry.lastPlayed || null,
          firstPlayed: rawEntry.firstPlayed || new Date().toISOString()
        };
      } else {
        // Merge duplicates (e.g. before and after saving to Grimoire)
        const existing = migratedHistory[targetKey];
        existing.plays = (existing.plays || 0) + plays;
        existing.bestAccuracy = Math.max(existing.bestAccuracy || 0, bestAcc);
        existing.bestChain = Math.max(existing.bestChain || 0, bestChain);
        existing.totalXpEarned = (existing.totalXpEarned || 0) + totalXp;
        if (rawEntry.lastPlayed && (!existing.lastPlayed || new Date(rawEntry.lastPlayed) > new Date(existing.lastPlayed))) {
          existing.lastPlayed = rawEntry.lastPlayed;
          existing.lastAccuracy = lastAcc;
        }
        if (rawEntry.filePath && !existing.filePath) {
          existing.filePath = rawEntry.filePath;
        }
      }
    }

    Object.keys(songPlayHistory).forEach(k => delete songPlayHistory[k]);
    Object.assign(songPlayHistory, migratedHistory);
    saveSongStats();
  }

  recomputeBardLevelFromTotalXp();
  songSessionStats.startingLevel = bardProfile.level;
  updateLitrpgHUD();
  updateTavernMenuStats();
}

/**
 * Save persistent Bard profile to localStorage and bard_profile.json (songHistory stored separately in song_stats.json)
 */
function saveBardProfile() {
  const payload = {
    totalXp: bardProfile.totalXp,
    level: bardProfile.level,
    title: bardProfile.title,
    bestCareerChain: bardProfile.bestCareerChain,
    songsCompleted: bardProfile.songsCompleted,
    // Last song is only updated by recordSongPerformance so boot auto-load never overwrites it (Issue #67)
    lastSongTitle: bardProfile.lastSongTitle || null,
    lastSongPath: bardProfile.lastSongPath || null,
    practiceDays: bardProfile.practiceDays || {},
    dailyQuests: bardProfile.dailyQuests || null,
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
 * Save per-song play history stats store (Issue #68 single source of truth)
 */
function saveSongStats() {
  try {
    localStorage.setItem(SONG_STATS_STORAGE_KEY, JSON.stringify(songPlayHistory));
  } catch {
    // Ignore localStorage quota errors
  }

  try {
    fs.writeFileSync(SONG_STATS_FILE_PATH, JSON.stringify(songPlayHistory, null, 2), 'utf8');
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
  songSessionStats.measureStats = {};
  updateLitrpgHUD();
}

/**
 * Compute duration of 1 measure (bar) in seconds using the active song's BPM & time signature (Issue #62).
 */
function getSongBarDurationSec() {
  if (!currentSong) return 2.0;
  const denominator = Math.max(1, currentSong.timeSigDenominator || 4);
  const beatDur = (60 / Math.max(30, currentSong.bpm || 120)) * (4 / denominator);
  const beatsPerMeasure = Math.max(1, currentSong.beatsPerMeasure || currentSong.timeSigNumerator || 4);
  return Math.max(0.25, beatDur * beatsPerMeasure);
}

function getMeasureNumberForTime(timeSec) {
  const barDur = getSongBarDurationSec();
  return Math.max(1, Math.floor(Math.max(0, timeSec) / barDur) + 1);
}

function recordMeasureOutcome(timeSec, { clean = 0, fumbled = 0, missed = 0 } = {}) {
  if (!currentSong) return;
  const measureNum = getMeasureNumberForTime(timeSec);
  if (!songSessionStats.measureStats[measureNum]) {
    songSessionStats.measureStats[measureNum] = { clean: 0, fumbled: 0, missed: 0 };
  }
  const bucket = songSessionStats.measureStats[measureNum];
  bucket.clean += clean;
  bucket.fumbled += fumbled;
  bucket.missed += missed;
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
    recordMeasureOutcome(group.anchorTime, { fumbled: noteCount });
  } else {
    songSessionStats.cleanNotesHit += noteCount;
    recordMeasureOutcome(group.anchorTime, { clean: noteCount });
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
      spawnFloatingCanvasRune(anchorMidi, `🔥 +${xpAwarded} XP!`, '#fbbf24');
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
  if (rehearsalLoopState.enabled) {
    rehearsalLoopState.passMistakes++;
  }
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
 * Issue #62: Build 4-section phrase accuracy & top 3 weakest measures from songSessionStats.measureStats
 */
function buildPostSongBreakdown() {
  if (!currentSong || !currentSong.duration) {
    return { sections: [], weakMeasures: [], totalMeasures: 0 };
  }

  const barDur = getSongBarDurationSec();
  const totalMeasures = Math.max(1, Math.ceil(currentSong.duration / barDur));
  const sectionCount = Math.min(4, totalMeasures);
  const sections = [];

  for (let i = 0; i < sectionCount; i++) {
    const startBar = Math.floor((i * totalMeasures) / sectionCount) + 1;
    const endBar = Math.max(startBar, Math.floor(((i + 1) * totalMeasures) / sectionCount));
    let clean = 0;
    let fumbled = 0;
    let missed = 0;
    for (let b = startBar; b <= endBar; b++) {
      const st = songSessionStats.measureStats[b];
      if (st) {
        clean += st.clean;
        fumbled += st.fumbled;
        missed += st.missed;
      }
    }
    const attempts = clean + fumbled + missed;
    const accuracyPct = attempts > 0
      ? Math.round(((clean + fumbled * 0.5) / attempts) * 100)
      : null;
    const startSec = (startBar - 1) * barDur;
    const endSec = Math.min(currentSong.duration, endBar * barDur);
    const label = startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar}–${endBar}`;
    sections.push({
      label,
      startBar,
      endBar,
      startSec,
      endSec,
      attempts,
      mistakes: fumbled + missed,
      accuracyPct
    });
  }

  const weakMeasures = [];
  for (const [mStr, st] of Object.entries(songSessionStats.measureStats)) {
    const measure = Number(mStr);
    const mistakes = st.fumbled + st.missed;
    if (mistakes <= 0) continue;
    const attempts = st.clean + st.fumbled + st.missed;
    const accuracyPct = attempts > 0
      ? Math.round(((st.clean + st.fumbled * 0.5) / attempts) * 100)
      : 0;
    const startSec = (measure - 1) * barDur;
    const endSec = Math.min(currentSong.duration, measure * barDur);
    weakMeasures.push({
      measure,
      startSec,
      endSec,
      clean: st.clean,
      fumbled: st.fumbled,
      missed: st.missed,
      mistakes,
      attempts,
      accuracyPct
    });
  }

  weakMeasures.sort((a, b) => a.accuracyPct - b.accuracyPct || b.mistakes - a.mistakes || a.measure - b.measure);

  return {
    sections,
    weakMeasures: weakMeasures.slice(0, 3),
    totalMeasures
  };
}

/**
 * Issue #62: 1-tap jump from Post-Song Breakdown into Rehearsal Loop Mode (Issue #30).
 * Pads single short bars to at least 2.0s, arms A->B loop, jumps to A - 0.8s pre-roll, and pauses.
 */
function practiceWeakRegion(startSec, endSec, label = 'Weak Measure') {
  if (!currentSong || !currentSong.duration) return;

  let a = Math.max(0, Math.min(currentSong.duration, startSec));
  let b = Math.max(a, Math.min(currentSong.duration, endSec));

  if ((b - a) < 2.0) {
    b = Math.min(currentSong.duration, a + 2.0);
  }
  if ((b - a) < 2.0) {
    a = Math.max(0, b - 2.0);
  }

  closePerformanceCheckModal();
  pausePlayback();

  rehearsalLoopState.startTime = a;
  rehearsalLoopState.endTime = b;
  rehearsalLoopState.enabled = (b - a) >= MIN_REHEARSAL_LOOP_SPAN_SEC;
  rehearsalLoopState.passMistakes = 0;
  rehearsalLoopState.cleanPasses = 0;
  rehearsalLoopState.totalPasses = 0;

  const jumpTime = Math.max(0, a - REHEARSAL_PREROLL_SEC);
  playbackState.currentTime = jumpTime;
  playbackState.isWaitingForStrike = false;
  playbackState.waitStartedAtMs = null;
  playbackState.activeStrikeGroup = null;
  resetSongProgressFlags(jumpTime);

  if (currentSong.backingAudioEl) {
    try {
      currentSong.backingAudioEl.currentTime = jumpTime;
    } catch {
      // Ignore seek errors
    }
  }
  syncBackingAudioElement(jumpTime);
  updateTimelineUI();
  updateRehearsalUI();
  showGrimoireToast(`\uD83D\uDD01 Loop armed for ${label} (${formatSeconds(a)} \u2192 ${formatSeconds(b)}) \u2014 Press Space when ready`);
}

function renderPostSongBreakdown(totalAttempts) {
  if (!modalBreakdownSection || !modalBreakdownSummary || !modalSectionBars || !modalWeakMeasures) return;

  if (!currentSong || totalAttempts === 0) {
    modalBreakdownSection.classList.add('hidden');
    return;
  }

  const { sections, weakMeasures } = buildPostSongBreakdown();
  if (sections.length === 0) {
    modalBreakdownSection.classList.add('hidden');
    return;
  }

  modalBreakdownSection.classList.remove('hidden');

  const totalMistakes = songSessionStats.fumbledNotesHit + songSessionStats.wrongOrMissedNotes;
  modalBreakdownSummary.textContent = totalMistakes === 0
    ? 'Flawless Run!'
    : `${totalMistakes} trip${totalMistakes === 1 ? '' : 's'} across ${weakMeasures.length} key bar${weakMeasures.length === 1 ? '' : 's'}`;

  while (modalSectionBars.firstChild) {
    modalSectionBars.removeChild(modalSectionBars.firstChild);
  }
  for (const sec of sections) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'breakdown-section-pill';
    if (sec.accuracyPct !== null) {
      if (sec.accuracyPct < 70) pill.classList.add('tier-weak');
      else if (sec.accuracyPct < 90) pill.classList.add('tier-warn');
    }
    pill.title = sec.attempts > 0
      ? `Click to practice ${sec.label} (${sec.accuracyPct}% accuracy)`
      : `${sec.label} (No player notes)`;

    const lblEl = document.createElement('span');
    lblEl.className = 'breakdown-section-label';
    lblEl.textContent = sec.label;

    const pctEl = document.createElement('span');
    pctEl.className = 'breakdown-section-pct';
    pctEl.textContent = sec.accuracyPct === null ? '—' : `${sec.accuracyPct}%`;

    const barEl = document.createElement('div');
    barEl.className = 'breakdown-section-bar';
    barEl.style.width = `${sec.accuracyPct === null ? 0 : Math.max(8, sec.accuracyPct)}%`;

    pill.appendChild(lblEl);
    pill.appendChild(pctEl);
    pill.appendChild(barEl);

    if (sec.attempts > 0) {
      pill.addEventListener('click', () => {
        practiceWeakRegion(sec.startSec, sec.endSec, sec.label);
      });
    } else {
      pill.disabled = true;
      pill.style.opacity = '0.55';
      pill.style.cursor = 'default';
    }

    modalSectionBars.appendChild(pill);
  }

  while (modalWeakMeasures.firstChild) {
    modalWeakMeasures.removeChild(modalWeakMeasures.firstChild);
  }

  if (weakMeasures.length === 0) {
    const flawless = document.createElement('div');
    flawless.className = 'breakdown-flawless';
    flawless.textContent = '✨ No weak bars detected — every measure was clean!';
    modalWeakMeasures.appendChild(flawless);
    return;
  }

  for (const wm of weakMeasures) {
    const row = document.createElement('div');
    row.className = 'breakdown-weak-row';

    const info = document.createElement('div');
    info.className = 'breakdown-weak-info';

    const badge = document.createElement('span');
    badge.className = 'breakdown-bar-badge';
    badge.textContent = `Bar ${wm.measure}`;

    const parts = [];
    if (wm.missed > 0) parts.push(`${wm.missed} miss${wm.missed === 1 ? '' : 'es'}`);
    if (wm.fumbled > 0) parts.push(`${wm.fumbled} fumbled`);
    const detail = document.createElement('span');
    detail.className = 'breakdown-weak-detail';
    detail.textContent = `${wm.accuracyPct}% • ${parts.join(', ')}`;

    info.appendChild(badge);
    info.appendChild(detail);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-practice-measure';
    btn.textContent = '🔁 Practice This';
    btn.title = `Loop Bar ${wm.measure} (${formatSeconds(wm.startSec)}–${formatSeconds(wm.endSec)})`;
    btn.addEventListener('click', () => {
      practiceWeakRegion(wm.startSec, wm.endSec, `Bar ${wm.measure}`);
    });

    row.appendChild(info);
    row.appendChild(btn);
    modalWeakMeasures.appendChild(row);
  }
}

/**
 * Open the Post-Song "Performance Check" Modal with D20 Grade & LitRPG Breakdown
 */
function openPerformanceCheckModal({ recordPlay = false } = {}) {
  pausePlayback();
  closeAllConservatoryPopovers();

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

  // Record song play history & Daily Quests BEFORE rendering XP/Level-Up banner (Issue #52, #53, #67)
  // Only the natural end-of-song path records play history; the manual button does not (Issue #67)
  let questOutcome = { newlyCompletedQuests: [], totalBonusXp: 0 };
  if (recordPlay && currentSong && totalAttempts > 0) {
    questOutcome = recordSongPerformance(
      currentSong,
      accuracyPct,
      songSessionStats.maxSpellChain,
      songSessionStats.songXpEarned,
      {
        waitMode: Boolean(playbackState.waitMode),
        cleanNotesHit: songSessionStats.cleanNotesHit,
        cleanChordRolls: songSessionStats.cleanChordRolls
      }
    ) || questOutcome;
  }

  if (modalQuestsBanner && modalQuestsList && modalQuestsXpPill) {
    const completedList = questOutcome.newlyCompletedQuests || [];
    modalQuestsBanner.classList.toggle('hidden', completedList.length === 0);
    while (modalQuestsList.firstChild) {
      modalQuestsList.removeChild(modalQuestsList.firstChild);
    }
    if (completedList.length > 0) {
      modalQuestsXpPill.textContent = `+${questOutcome.totalBonusXp.toLocaleString()} Bonus XP`;
      for (const q of completedList) {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `✓ ${q.title} — ${q.desc}`;
        const xpStrong = document.createElement('strong');
        xpStrong.textContent = `+${q.xpReward} XP`;
        li.appendChild(nameSpan);
        li.appendChild(xpStrong);
        modalQuestsList.appendChild(li);
      }
    }
  }

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

  renderPostSongBreakdown(totalAttempts);

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
    recordMeasureOutcome(group.anchorTime, { missed: Math.max(1, group.notes.length) });
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
            totalRollMs <= CHORD_GRACE_PERIOD_MS
              ? `✓ Clean Chord Roll! (${group.requiredPitches.size} notes in ${totalRollMs}ms ≤ 100ms)`
              : `✓ Clean Chord Roll! (${group.requiredPitches.size} notes • ${totalRollMs}ms total, fingers ≤ 100ms)`
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
    recordMeasureOutcome(group.anchorTime, { missed: 1 });
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
  const inst = getActiveInstrument();
  if (inst) {
    for (const midi of activeNotes.keys()) {
      try {
        inst.triggerRelease(midiToNoteName(midi), Tone.now());
      } catch {
        // Ignore audio release errors
      }
    }
  }
  pressedQwertyKeys.clear();
  activeNotes.clear();
  sustainedNotes.clear();
  isMouseDown = false;
  currentMouseMidi = null;
  handleSustainPedal(false);
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
  if (!currentSong) {
    setStrikeStatusBadge('idle', 'Highway Clear — Open Grimoire to Choose a Spell');
  } else {
    setStrikeStatusBadge(
      'ready',
      playbackState.accompanimentMode === 'auto-both'
        ? 'Listen Only Mode (Auto-Playing Both Hands)'
        : (playbackState.waitMode
            ? 'Wait Mode Ready (100ms Chord Grace Active)'
            : 'Arcade Mode Ready (Continuous Playback)')
    );
  }
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
 * Issue #63: Centralized Practice Tempo setter — syncs highway, MIDI accompaniment,
 * pitch-preserved backing audio, UI stepper state, and per-song persistence.
 */
function setPracticeTempo(rawSpeed, { persist = true, toast = false } = {}) {
  const num = Number(rawSpeed);
  const clamped = Number.isFinite(num) ? Math.max(0.5, Math.min(1.25, num)) : 1.0;
  // Snap to nearest preset in REHEARSAL_SPEED_PRESETS so the dropdown always reflects the active speed
  let speed = REHEARSAL_SPEED_PRESETS[0];
  let bestDiff = Infinity;
  for (const preset of REHEARSAL_SPEED_PRESETS) {
    const diff = Math.abs(preset - clamped);
    if (diff < bestDiff) {
      bestDiff = diff;
      speed = preset;
    }
  }

  playbackState.playbackSpeed = speed;

  if (playbackSpeedSelect) {
    playbackSpeedSelect.value = String(speed);
  }
  if (tempoControlGroup) {
    tempoControlGroup.classList.toggle('tempo-modified', Math.abs(speed - 1.0) > 0.001);
  }
  if (btnTempoDown) {
    btnTempoDown.disabled = speed <= REHEARSAL_SPEED_PRESETS[0] + 0.001;
  }
  if (btnTempoUp) {
    btnTempoUp.disabled = speed >= REHEARSAL_SPEED_PRESETS[REHEARSAL_SPEED_PRESETS.length - 1] - 0.001;
  }

  if (currentSong?.backingAudioEl) {
    currentSong.backingAudioEl.preservesPitch = true;
    currentSong.backingAudioEl.webkitPreservesPitch = true;
    currentSong.backingAudioEl.playbackRate = speed;
  }

  if (persist && currentSong) {
    const key = currentSong.songId || (currentSong.filePath || currentSong.title || 'Demo Spell').toLowerCase();
    const existing = songPlayHistory[key] || {
      songId: currentSong.songId || key,
      title: currentSong.title || 'Untitled Scroll',
      filePath: currentSong.filePath || null,
      plays: 0,
      bestAccuracy: 0,
      lastAccuracy: 0,
      bestChain: 0,
      totalXpEarned: 0,
      lastPlayed: null,
      firstPlayed: new Date().toISOString()
    };
    existing.preferredTempo = speed;
    songPlayHistory[key] = existing;
    saveSongStats();
  }

  if (toast) {
    showGrimoireToast(`\u23F1\uFE0F Practice Tempo: ${speed}x`);
  }
}

function stepPracticeTempo(delta) {
  const cur = playbackState.playbackSpeed || 1.0;
  let idx = REHEARSAL_SPEED_PRESETS.findIndex((s) => Math.abs(s - cur) < 0.001);
  if (idx === -1) {
    idx = REHEARSAL_SPEED_PRESETS.findIndex((s) => s >= cur);
    if (idx === -1) idx = REHEARSAL_SPEED_PRESETS.length - 1;
  }
  const nextIdx = Math.max(0, Math.min(REHEARSAL_SPEED_PRESETS.length - 1, idx + delta));
  const nextSpeed = REHEARSAL_SPEED_PRESETS[nextIdx];
  if (Math.abs(nextSpeed - cur) > 0.001) {
    setPracticeTempo(nextSpeed, { persist: true, toast: true });
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
    audioEl.preservesPitch = true;
    audioEl.webkitPreservesPitch = true;
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
 * Issue #30: Loop Practice Mode (Rehearsal) Helpers
 */
function hasValidRehearsalLoop() {
  return Boolean(
    currentSong &&
    rehearsalLoopState.startTime !== null &&
    rehearsalLoopState.endTime !== null &&
    (rehearsalLoopState.endTime - rehearsalLoopState.startTime) >= MIN_REHEARSAL_LOOP_SPAN_SEC
  );
}

function updateRehearsalUI() {
  const hasSong = Boolean(currentSong && currentSong.duration > 0);
  const valid = hasValidRehearsalLoop();
  const active = Boolean(valid && rehearsalLoopState.enabled);

  if (btnLoopA) {
    btnLoopA.disabled = !hasSong;
    btnLoopA.classList.toggle('marker-set', hasSong && rehearsalLoopState.startTime !== null);
  }
  if (btnLoopB) {
    btnLoopB.disabled = !hasSong;
    btnLoopB.classList.toggle('marker-set', hasSong && rehearsalLoopState.endTime !== null);
  }
  if (btnRehearsalToggle) {
    btnRehearsalToggle.disabled = !hasSong;
    btnRehearsalToggle.classList.toggle('loop-active', active);
    btnRehearsalToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (btnRehearsalPopover) {
    btnRehearsalPopover.disabled = !hasSong;
  }
  if (btnLoopClear) {
    btnLoopClear.disabled = !hasSong || (rehearsalLoopState.startTime === null && rehearsalLoopState.endTime === null);
  }

  if (rehearsalATime) {
    rehearsalATime.textContent = hasSong && rehearsalLoopState.startTime !== null
      ? formatSeconds(rehearsalLoopState.startTime)
      : '\u2014';
  }
  if (rehearsalBTime) {
    rehearsalBTime.textContent = hasSong && rehearsalLoopState.endTime !== null
      ? formatSeconds(rehearsalLoopState.endTime)
      : '\u2014';
  }

  if (rehearsalPassStatus) {
    if (!hasSong) {
      rehearsalPassStatus.textContent = 'Load a spell to use Rehearsal Loop';
    } else if (!valid) {
      rehearsalPassStatus.textContent = 'Set A ([) and B (]) to loop a passage';
    } else if (!active) {
      rehearsalPassStatus.textContent = `Loop paused (${formatSeconds(rehearsalLoopState.startTime)} \u2192 ${formatSeconds(rehearsalLoopState.endTime)})`;
    } else if (rehearsalLoopState.autoRamp) {
      rehearsalPassStatus.textContent = `Active \u2022 ${playbackState.playbackSpeed}x \u2192 ${rehearsalLoopState.targetSpeed}x (${rehearsalLoopState.cleanPasses} clean)`;
    } else {
      rehearsalPassStatus.textContent = `Active \u2022 ${rehearsalLoopState.cleanPasses} clean / ${rehearsalLoopState.totalPasses} passes`;
    }
  }

  // Update Timeline Scrubber Overlays
  const dur = hasSong ? currentSong.duration : 1;
  if (loopMarkerA) {
    if (hasSong && rehearsalLoopState.startTime !== null) {
      const pctA = Math.max(0, Math.min(100, (rehearsalLoopState.startTime / dur) * 100));
      loopMarkerA.style.left = `${pctA}%`;
      loopMarkerA.title = `Loop Start (A): ${formatSeconds(rehearsalLoopState.startTime)}`;
      loopMarkerA.classList.remove('hidden');
    } else {
      loopMarkerA.classList.add('hidden');
    }
  }

  if (loopMarkerB) {
    if (hasSong && rehearsalLoopState.endTime !== null) {
      const pctB = Math.max(0, Math.min(100, (rehearsalLoopState.endTime / dur) * 100));
      loopMarkerB.style.left = `${pctB}%`;
      loopMarkerB.title = `Loop End (B): ${formatSeconds(rehearsalLoopState.endTime)}`;
      loopMarkerB.classList.remove('hidden');
    } else {
      loopMarkerB.classList.add('hidden');
    }
  }

  if (loopRangeFill) {
    if (valid) {
      const leftPct = Math.max(0, Math.min(100, (rehearsalLoopState.startTime / dur) * 100));
      const rightPct = Math.max(0, Math.min(100, (rehearsalLoopState.endTime / dur) * 100));
      loopRangeFill.style.left = `${leftPct}%`;
      loopRangeFill.style.width = `${Math.max(0.5, rightPct - leftPct)}%`;
      loopRangeFill.classList.toggle('inactive', !active);
      loopRangeFill.classList.remove('hidden');
    } else {
      loopRangeFill.classList.add('hidden');
    }
  }
}

function setRehearsalMarkerA(rawTime = playbackState.currentTime) {
  if (!currentSong || !currentSong.duration) return;
  const clamped = Math.max(0, Math.min(currentSong.duration, rawTime));
  rehearsalLoopState.startTime = clamped;

  if (rehearsalLoopState.endTime !== null) {
    if (rehearsalLoopState.startTime > rehearsalLoopState.endTime) {
      const tmp = rehearsalLoopState.endTime;
      rehearsalLoopState.endTime = rehearsalLoopState.startTime;
      rehearsalLoopState.startTime = tmp;
    }
    if ((rehearsalLoopState.endTime - rehearsalLoopState.startTime) >= MIN_REHEARSAL_LOOP_SPAN_SEC) {
      rehearsalLoopState.enabled = true;
      rehearsalLoopState.passMistakes = 0;
    }
  }

  updateRehearsalUI();
  showGrimoireToast(`\uD83D\uDD01 Loop Start [A] set to ${formatSeconds(rehearsalLoopState.startTime)}`);
}

function setRehearsalMarkerB(rawTime = playbackState.currentTime) {
  if (!currentSong || !currentSong.duration) return;
  const clamped = Math.max(0, Math.min(currentSong.duration, rawTime));
  rehearsalLoopState.endTime = clamped;

  if (rehearsalLoopState.startTime === null) {
    rehearsalLoopState.startTime = 0;
  }
  if (rehearsalLoopState.endTime < rehearsalLoopState.startTime) {
    const tmp = rehearsalLoopState.startTime;
    rehearsalLoopState.startTime = rehearsalLoopState.endTime;
    rehearsalLoopState.endTime = tmp;
  }

  if ((rehearsalLoopState.endTime - rehearsalLoopState.startTime) >= MIN_REHEARSAL_LOOP_SPAN_SEC) {
    rehearsalLoopState.enabled = true;
    rehearsalLoopState.passMistakes = 0;

    if (playbackState.isPlaying || playbackState.currentTime >= rehearsalLoopState.endTime - 0.05) {
      const jumpTime = Math.max(0, rehearsalLoopState.startTime - REHEARSAL_PREROLL_SEC);
      playbackState.currentTime = jumpTime;
      playbackState.isWaitingForStrike = false;
      playbackState.waitStartedAtMs = null;
      playbackState.activeStrikeGroup = null;
      resetSongProgressFlags(jumpTime);
      if (currentSong.backingAudioEl) {
        try {
          currentSong.backingAudioEl.currentTime = jumpTime;
        } catch {
          // Ignore seek errors
        }
      }
      syncBackingAudioElement(jumpTime);
      updateTimelineUI();
    }

    showGrimoireToast(
      `\uD83D\uDD01 Rehearsal Loop Active: ${formatSeconds(rehearsalLoopState.startTime)} \u2192 ${formatSeconds(rehearsalLoopState.endTime)}`
    );
  } else {
    showGrimoireToast(`\uD83D\uDD01 Loop End [B] must be at least ${MIN_REHEARSAL_LOOP_SPAN_SEC}s after [A]`);
  }

  updateRehearsalUI();
}

function toggleRehearsalLoop() {
  if (!currentSong) return;
  if (!hasValidRehearsalLoop()) {
    showGrimoireToast('\uD83D\uDD01 Set Loop Start [A] and End [B] first (shortcuts: [ and ])');
    return;
  }

  rehearsalLoopState.enabled = !rehearsalLoopState.enabled;
  rehearsalLoopState.passMistakes = 0;

  if (rehearsalLoopState.enabled && playbackState.currentTime >= rehearsalLoopState.endTime) {
    const jumpTime = Math.max(0, rehearsalLoopState.startTime - REHEARSAL_PREROLL_SEC);
    playbackState.currentTime = jumpTime;
    resetSongProgressFlags(jumpTime);
    if (currentSong.backingAudioEl) {
      try {
        currentSong.backingAudioEl.currentTime = jumpTime;
      } catch {
        // Ignore seek errors
      }
    }
    updateTimelineUI();
  }

  updateRehearsalUI();
  showGrimoireToast(
    rehearsalLoopState.enabled
      ? `\uD83D\uDD01 Rehearsal Loop ON (${formatSeconds(rehearsalLoopState.startTime)} \u2192 ${formatSeconds(rehearsalLoopState.endTime)})`
      : '\uD83D\uDD01 Rehearsal Loop OFF'
  );
}

function clearRehearsalLoop() {
  rehearsalLoopState.enabled = false;
  rehearsalLoopState.startTime = null;
  rehearsalLoopState.endTime = null;
  rehearsalLoopState.cleanPasses = 0;
  rehearsalLoopState.totalPasses = 0;
  rehearsalLoopState.passMistakes = 0;
  updateRehearsalUI();
}

function handleRehearsalLoopWrap() {
  if (!currentSong || !hasValidRehearsalLoop()) return;

  rehearsalLoopState.totalPasses++;
  const isClean = rehearsalLoopState.passMistakes === 0;
  if (isClean) {
    rehearsalLoopState.cleanPasses++;
  }

  if (rehearsalLoopState.autoRamp && isClean && playbackState.playbackSpeed < rehearsalLoopState.targetSpeed) {
    const nextPreset = REHEARSAL_SPEED_PRESETS.find(
      (s) => s > playbackState.playbackSpeed + 0.001 && s <= rehearsalLoopState.targetSpeed + 0.001
    );
    if (nextPreset) {
      setPracticeTempo(nextPreset, { persist: true, toast: false });
      showGrimoireToast(`\u2728 Clean Pass! Tempo ramped to ${nextPreset}x`);
    } else {
      showGrimoireToast(`\uD83C\uDFC6 Clean Pass #${rehearsalLoopState.cleanPasses} at target ${playbackState.playbackSpeed}x!`);
    }
  } else if (isClean) {
    showGrimoireToast(`\uD83D\uDD01 Clean Pass #${rehearsalLoopState.cleanPasses} (${playbackState.playbackSpeed}x)`);
  } else {
    const m = rehearsalLoopState.passMistakes;
    showGrimoireToast(`\uD83D\uDD01 Repeat at ${playbackState.playbackSpeed}x (${m} miss${m === 1 ? '' : 'es'})`);
  }

  rehearsalLoopState.passMistakes = 0;

  const jumpTime = Math.max(0, rehearsalLoopState.startTime - REHEARSAL_PREROLL_SEC);
  playbackState.currentTime = jumpTime;
  playbackState.isWaitingForStrike = false;
  playbackState.waitStartedAtMs = null;
  playbackState.activeStrikeGroup = null;
  resetSongProgressFlags(jumpTime);

  if (currentSong.backingAudioEl) {
    try {
      currentSong.backingAudioEl.currentTime = jumpTime;
    } catch {
      // Ignore seek errors
    }
  }
  syncBackingAudioElement(jumpTime);
  updateTimelineUI();
  updateRehearsalUI();
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

            const wasWaitingEarly = playbackState.isWaitingForStrike;
            playbackState.isWaitingForStrike = false;
            playbackState.waitStartedAtMs = null;
            playbackState.activeStrikeGroup = null;
            if (wasWaitingEarly) {
              processSongAudioTriggers(nextGroup.anchorTime - 0.01, nextGroup.anchorTime + 0.005);
            }
            recordStrikeGroupCompletion(nextGroup, false, isCleanChordRoll);

            if (isChord) {
              setStrikeStatusBadge(
                'hit',
                isCleanChordRoll
                  ? totalRollMs <= CHORD_GRACE_PERIOD_MS
                    ? `✓ Clean Chord Roll! (${nextGroup.requiredPitches.size} notes in ${totalRollMs}ms ≤ 100ms)`
                    : `✓ Clean Chord Roll! (${nextGroup.requiredPitches.size} notes • ${totalRollMs}ms total, fingers ≤ 100ms)`
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
          recordMeasureOutcome(nextArcadeGroup.anchorTime, { missed: Math.max(1, nextArcadeGroup.notes.length) });
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

    // Issue #30: Loop Practice Mode (Rehearsal) — wrap cleanly from B back to A - preRoll
    if (
      rehearsalLoopState.enabled &&
      hasValidRehearsalLoop() &&
      !playbackState.isWaitingForStrike &&
      playbackState.currentTime >= rehearsalLoopState.endTime
    ) {
      handleRehearsalLoopWrap();
      renderCanvas();
      requestAnimationFrame(animationLoop);
      return;
    }

    // Hold accompaniment & backing band notes at anchorTime while frozen in Wait Mode until the player strikes (Issue #10, Fixes #56)
    const audioTriggerEnd = playbackState.isWaitingForStrike ? (proposedTime - 0.001) : proposedTime;
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
        openPerformanceCheckModal({ recordPlay: true });
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
    isFavorite: grimoireFavorites.has(id),
    newlyIngested: false
  };
}

/**
 * Load persisted Grimoire Favorites from localStorage and grimoire_library.json (Issue #79)
 */
function loadGrimoireFavorites() {
  grimoireFavorites.clear();

  try {
    const rawFavs = localStorage.getItem(GRIMOIRE_FAVORITES_STORAGE_KEY);
    if (rawFavs) {
      const parsed = JSON.parse(rawFavs);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id) {
            grimoireFavorites.add(id);
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    const rawIndex = localStorage.getItem(GRIMOIRE_STORAGE_KEY);
    if (rawIndex) {
      const parsed = JSON.parse(rawIndex);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.isFavorite && typeof item.id === 'string' && item.id) {
            grimoireFavorites.add(item.id);
          }
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }

  try {
    if (fs.existsSync(GRIMOIRE_INDEX_FILE)) {
      const rawFile = fs.readFileSync(GRIMOIRE_INDEX_FILE, 'utf8');
      const parsed = JSON.parse(rawFile);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.isFavorite && typeof item.id === 'string' && item.id) {
            grimoireFavorites.add(item.id);
          }
        }
      }
    }
  } catch {
    // Ignore disk read errors
  }

  try {
    spellbookFavoritesOnly = localStorage.getItem(GRIMOIRE_FAV_FILTER_STORAGE_KEY) === 'true';
  } catch {
    // Ignore storage read errors
  }
}

function saveSpellbookFavoritesFilter() {
  try {
    localStorage.setItem(GRIMOIRE_FAV_FILTER_STORAGE_KEY, spellbookFavoritesOnly ? 'true' : 'false');
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Save Grimoire Favorites to localStorage and sync grimoire_library.json (Issue #79)
 */
function saveGrimoireFavorites() {
  try {
    localStorage.setItem(GRIMOIRE_FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(grimoireFavorites)));
  } catch {
    // Ignore storage quota errors
  }
  persistGrimoireIndex();
}

/**
 * Toggle favorite status for a Grimoire spell without deleting or moving any files (Issue #79)
 */
function toggleGrimoireFavorite(entryId) {
  if (!entryId) return;
  const entry = grimoireSpells.get(entryId);
  if (!entry) return;

  const nextState = !Boolean(entry.isFavorite);
  entry.isFavorite = nextState;

  if (nextState) {
    grimoireFavorites.add(entry.id);
  } else {
    grimoireFavorites.delete(entry.id);
  }

  saveGrimoireFavorites();

  if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
    renderSpellbookSpread();
  }
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
    backingAudioPath: entry.backingAudioPath,
    isFavorite: Boolean(entry.isFavorite)
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

  // Prune deleted files from The Grimoire (Fixes #57)
  for (const [key, entry] of grimoireSpells.entries()) {
    if (entry.filePath && entry.filePath !== 'BUILTIN_DEMO' && (entry.sourceTag === 'Imports/' || entry.sourceTag === 'Test Library')) {
      if (!fs.existsSync(entry.filePath)) {
        grimoireSpells.delete(key);
        changed = true;
      }
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
    if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
      spellbookFavoritesOnly = false;
      saveSpellbookFavoritesFilter();
      currentSpellbookTierIndex = getSpellbookTierIndexForLevel(entry.spellLevel);
      selectedSpellbookEntryId = entry.id;
      renderSpellbookSpread();
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
  loadGrimoireFavorites();

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

// ============================================================================
// ISSUE #69: THE FLIPPABLE GRIMOIRE SPELLBOOK ENGINE (SORTED BY DIFFICULTY)
// ============================================================================

// Uses canonical SPELLBOOK_TIERS defined above calculateSpellDifficulty() so calculator and spellbook share one source of truth (Issue #80)
let currentSpellbookTierIndex = 0;
let selectedSpellbookEntryId = null;
let previousSpellbookOrigin = 'highway'; // 'tavern' or 'highway'
let isSpellbookFlipping = false;
let spellbookFavoritesOnly = false; // Issue #79: Favorites filter toggle

function getSpellbookTierIndexForLevel(spellLevel) {
  if (!spellLevel) return 0;
  const lower = String(spellLevel).toLowerCase();
  if (lower.includes('cantrip')) return 0;
  if (lower.includes('1st')) return 1;
  if (lower.includes('2nd')) return 2;
  if (lower.includes('3rd')) return 3;
  if (lower.includes('4th')) return 4;
  if (lower.includes('5th')) return 5;
  if (lower.includes('6th')) return 6;
  if (lower.includes('7th')) return 7;
  if (lower.includes('8th')) return 8;
  if (lower.includes('9th')) return 9;
  return 0;
}

function formatAnnalsDate(isoString) {
  if (!isoString) return 'Never performed on stage';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function getSongHistoryRecord(entry) {
  if (!entry) return null;
  if (entry.filePath === 'BUILTIN_DEMO') {
    return songPlayHistory['builtin::demo'] || null;
  }
  if (entry.id && songPlayHistory[entry.id]) {
    return songPlayHistory[entry.id];
  }
  const allHistory = Object.values(songPlayHistory);
  if (entry.filePath) {
    try {
      const resolved = path.resolve(entry.filePath);
      const match = allHistory.find((h) => h.filePath && path.resolve(h.filePath) === resolved);
      if (match) return match;
    } catch {
      // Ignore path resolution error
    }
  }
  const normTitle = (entry.title || '').trim().toLowerCase();
  return allHistory.find((h) => (h.title || '').trim().toLowerCase() === normTitle) || null;
}

function playSpellbookPageTurnSound() {
  if (grandPianoSampler && grandPianoLoaded) {
    try {
      grandPianoSampler.triggerAttackRelease('C6', 0.12, undefined, 0.18);
    } catch {
      // Ignore audio glitch
    }
  }
}

function openGrimoireSpellbook(origin = 'highway') {
  pausePlayback();
  closeAllConservatoryPopovers();
  previousSpellbookOrigin = origin;

  // Default to the currently loaded song's tier if active (and not in Attuned filter)
  if (currentSong && currentSong.difficulty) {
    if (!spellbookFavoritesOnly) {
      currentSpellbookTierIndex = getSpellbookTierIndexForLevel(currentSong.difficulty.spellLevel);
    }
    selectedSpellbookEntryId = currentSong.songId || null;
  }

  if (grimoireCountBadge) {
    grimoireCountBadge.textContent = String(grimoireSpells.size);
  }

  if (grimoireSpellbookModal) {
    grimoireSpellbookModal.classList.remove('hidden');
  }

  if (spellbookSearchInput) {
    spellbookSearchInput.value = '';
  }

  renderSpellbookSpread();

  if (btnCloseSpellbook) {
    btnCloseSpellbook.focus();
  }
}

function closeGrimoireSpellbook() {
  if (grimoireSpellbookModal) {
    grimoireSpellbookModal.classList.add('hidden');
  }
  if (previousSpellbookOrigin === 'tavern') {
    showTavernMenu();
  } else {
    hideTavernMenu();
    if (btnPlayPause) {
      btnPlayPause.focus();
    }
    setTimeout(() => {
      computeKeyGeometry();
    }, 40);
  }
}

function flipSpellbookPage(direction) {
  if (isSpellbookFlipping || spellbookFavoritesOnly) return;
  const targetIndex = currentSpellbookTierIndex + direction;
  if (targetIndex < 0 || targetIndex >= SPELLBOOK_TIERS.length) return;
  navigateToSpellbookTier(targetIndex, direction > 0 ? 'forward' : 'backward');
}

function navigateToSpellbookTier(targetIndex, animDirection = 'forward') {
  if (isSpellbookFlipping) return;
  if (targetIndex < 0 || targetIndex >= SPELLBOOK_TIERS.length) return;
  if (targetIndex === currentSpellbookTierIndex && !spellbookFavoritesOnly) return;

  if (spellbookFavoritesOnly) {
    spellbookFavoritesOnly = false;
    saveSpellbookFavoritesFilter();
  }
  isSpellbookFlipping = true;
  playSpellbookPageTurnSound();

  const animClass = animDirection === 'forward' ? 'flipping-forward' : 'flipping-backward';
  if (spellbookSpread) {
    spellbookSpread.classList.remove('flipping-forward', 'flipping-backward');
    void spellbookSpread.offsetWidth; // Force reflow
    spellbookSpread.classList.add(animClass);
  }

  setTimeout(() => {
    currentSpellbookTierIndex = targetIndex;
    renderSpellbookSpread();
    if (spellbookSpread) {
      spellbookSpread.classList.remove(animClass);
    }
    isSpellbookFlipping = false;
  }, 240);
}

function renderSpellbookTierPips() {
  if (!spellbookTierPips) return;
  spellbookTierPips.innerHTML = '';
  SPELLBOOK_TIERS.forEach((tier, idx) => {
    const isActive = !spellbookFavoritesOnly && idx === currentSpellbookTierIndex;
    const pip = document.createElement('button');
    pip.type = 'button';
    pip.className = `tier-pip${isActive ? ' active' : ''}`;
    pip.textContent = tier.pipLabel;
    pip.title = `${tier.title} (${tier.xp}) \u2014 Click to view`;
    pip.setAttribute('role', 'tab');
    pip.setAttribute('aria-selected', isActive ? 'true' : 'false');
    pip.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToSpellbookTier(idx, idx > currentSpellbookTierIndex ? 'forward' : 'backward');
    });
    spellbookTierPips.appendChild(pip);
  });
}

function renderSpellbookSpread() {
  if (!grimoireSpellbookModal) return;

  const tier = SPELLBOOK_TIERS[currentSpellbookTierIndex] || SPELLBOOK_TIERS[0];
  const allEntries = Array.from(grimoireSpells.values());
  const favoriteEntries = allEntries.filter((e) => Boolean(e.isFavorite));

  // Update Favorites filter toggle button & count badge
  if (btnSpellbookFavoritesFilter) {
    btnSpellbookFavoritesFilter.classList.toggle('active', spellbookFavoritesOnly);
    btnSpellbookFavoritesFilter.setAttribute('aria-pressed', spellbookFavoritesOnly ? 'true' : 'false');
    const starEl = btnSpellbookFavoritesFilter.querySelector('.fav-filter-star');
    if (starEl) {
      starEl.textContent = spellbookFavoritesOnly ? '\u2605' : '\u2606';
    }
  }
  if (spellbookFavCount) {
    spellbookFavCount.textContent = String(favoriteEntries.length);
  }
  if (spellbookSearchInput) {
    spellbookSearchInput.placeholder = spellbookFavoritesOnly
      ? '\uD83D\uDD0D Search attuned...'
      : '\uD83D\uDD0D Search tier...';
  }

  // Left Page: Header (Attuned view vs Tier view)
  if (spellbookFavoritesOnly) {
    if (spellbookTierBadge) {
      spellbookTierBadge.textContent = '\u2605 Attuned';
      spellbookTierBadge.className = 'tier-ribbon-badge tier-favorites';
    }
    if (spellbookTierXp) {
      spellbookTierXp.textContent = `${favoriteEntries.length} Attuned`;
    }
    if (spellbookTierName) spellbookTierName.textContent = 'Attuned Spells';
    if (spellbookTierDesc) spellbookTierDesc.textContent = 'Spells bound to your bard across all tiers';
    if (spellbookPageNumLeft) spellbookPageNumLeft.textContent = 'Attuned \u2022 All Tiers';
    if (spellbookPageNumRight) spellbookPageNumRight.textContent = 'Attuned \u2022 Details';
  } else {
    if (spellbookTierBadge) {
      spellbookTierBadge.textContent = tier.title;
      spellbookTierBadge.className = `tier-ribbon-badge ${tier.badgeClass}`;
    }
    if (spellbookTierXp) spellbookTierXp.textContent = tier.xp;
    if (spellbookTierName) spellbookTierName.textContent = tier.subtitle;
    if (spellbookTierDesc) spellbookTierDesc.textContent = tier.desc;
    if (spellbookPageNumLeft) spellbookPageNumLeft.textContent = `Page ${tier.roman} \u2022 ${tier.title}`;
    if (spellbookPageNumRight) spellbookPageNumRight.textContent = `Page ${tier.roman}b \u2022 Details`;
  }

  // Filter songs for Attuned or current tier
  const query = (spellbookSearchInput?.value || '').trim().toLowerCase();
  const basePool = spellbookFavoritesOnly
    ? favoriteEntries
    : allEntries.filter((e) => getSpellbookTierIndexForLevel(e.spellLevel) === currentSpellbookTierIndex);

  const matchingSongs = basePool.filter((e) => {
    if (!query) return true;
    return e.title.toLowerCase().includes(query) || e.fileName.toLowerCase().includes(query);
  });

  // Alphabetical sort by title
  matchingSongs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  // Capture focused star button entry ID so keyboard focus survives re-render
  const activeStarEntryId = document.activeElement?.classList?.contains('spellbook-card-star-btn')
    ? document.activeElement.dataset.entryId || null
    : null;

  // Render Left Page Song List or Empty State
  if (spellbookSongList) {
    spellbookSongList.innerHTML = '';
  }

  if (matchingSongs.length === 0) {
    selectedSpellbookEntryId = null;
    if (spellbookEmptyState) {
      spellbookEmptyState.classList.remove('hidden');
      const emptyHeading = spellbookEmptyState.querySelector('.empty-tier-heading');
      if (emptyHeading) {
        if (spellbookFavoritesOnly) {
          emptyHeading.textContent = query ? 'No Matching Attuned Spells' : 'No Attuned Spells Yet';
        } else {
          emptyHeading.textContent = query ? 'No Matching Spells in this Tier' : `No ${tier.title} Yet`;
        }
      }
      const emptyText = spellbookEmptyState.querySelector('.empty-tier-text');
      if (emptyText) {
        if (spellbookFavoritesOnly) {
          emptyText.textContent = query
            ? `No attuned spells matched "${query}". Clear the search box to see all attuned spells.`
            : 'Tap the \u2606 star on any spell card or detail panel to attune your focus songs here.';
        } else {
          emptyText.textContent = query
            ? `No songs matched "${query}". Clear the search box or check other tiers.`
            : `No ${tier.title.toLowerCase()} cataloged in your grimoire yet. Visit the Quest Board to forge new spells!`;
        }
      }
    }
    renderSpellbookDetails(null);
  } else {
    if (spellbookEmptyState) {
      spellbookEmptyState.classList.add('hidden');
    }

    // Determine currently selected entry
    let selectedEntry = matchingSongs.find((e) => e.id === selectedSpellbookEntryId);
    if (!selectedEntry && currentSong) {
      selectedEntry = matchingSongs.find((e) => {
        return (
          (currentSong.filePath && e.filePath && path.resolve(String(currentSong.filePath)) === path.resolve(String(e.filePath))) ||
          currentSong.fileName.toLowerCase() === e.fileName.toLowerCase()
        );
      });
    }
    if (!selectedEntry) {
      selectedEntry = matchingSongs[0];
    }
    selectedSpellbookEntryId = selectedEntry.id;

    let starBtnToRefocus = null;

    for (const entry of matchingSongs) {
      const isSelected = entry.id === selectedSpellbookEntryId;
      const isActiveHighway = Boolean(
        currentSong &&
        ((currentSong.filePath && entry.filePath && path.resolve(String(currentSong.filePath)) === path.resolve(String(entry.filePath))) ||
         currentSong.fileName.toLowerCase() === entry.fileName.toLowerCase())
      );

      const item = document.createElement('div');
      item.className = `spellbook-song-item${isSelected ? ' selected' : ''}${entry.newlyIngested ? ' newly-ingested' : ''}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      item.tabIndex = 0;

      const titleWrap = document.createElement('div');
      titleWrap.className = 'spellbook-song-item-title';
      titleWrap.title = entry.title;

      if (isActiveHighway) {
        const activeIndicator = document.createElement('span');
        activeIndicator.className = 'song-active-indicator';
        activeIndicator.title = 'Currently Loaded on Spell Highway';
        activeIndicator.textContent = '\u25B6 ';
        titleWrap.appendChild(activeIndicator);
      }

      const titleText = document.createElement('span');
      titleText.textContent = entry.title;
      titleWrap.appendChild(titleText);

      const metaSpan = document.createElement('span');
      metaSpan.className = 'spellbook-song-item-meta';
      metaSpan.title = `${entry.spellLevel} \u2022 ${entry.bpm} BPM \u2022 ${formatSeconds(entry.duration)}`;
      metaSpan.textContent = spellbookFavoritesOnly
        ? `${entry.spellLevel} \u2022 ${formatSeconds(entry.duration)}`
        : `${entry.bpm} \u2022 ${formatSeconds(entry.duration)}`;

      const cardStarBtn = document.createElement('button');
      cardStarBtn.type = 'button';
      cardStarBtn.className = `spellbook-card-star-btn${entry.isFavorite ? ' is-favorite' : ''}`;
      cardStarBtn.dataset.entryId = entry.id;
      cardStarBtn.textContent = entry.isFavorite ? '\u2605' : '\u2606';
      cardStarBtn.title = entry.isFavorite ? `Unattune "${entry.title}"` : `Attune "${entry.title}"`;
      cardStarBtn.setAttribute('aria-label', entry.isFavorite ? `Unattune ${entry.title}` : `Attune ${entry.title}`);
      cardStarBtn.setAttribute('aria-pressed', entry.isFavorite ? 'true' : 'false');
      cardStarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGrimoireFavorite(entry.id);
      });

      if (activeStarEntryId && activeStarEntryId === entry.id) {
        starBtnToRefocus = cardStarBtn;
      }

      item.appendChild(titleWrap);
      item.appendChild(metaSpan);
      item.appendChild(cardStarBtn);

      if (isGrimoireEntryDeletable(entry)) {
        const cardDeleteBtn = document.createElement('button');
        cardDeleteBtn.type = 'button';
        cardDeleteBtn.className = 'spellbook-card-delete-btn';
        cardDeleteBtn.textContent = '\uD83D\uDDD1';
        cardDeleteBtn.title = `Remove "${entry.title}" and move to ./Archive`;
        cardDeleteBtn.setAttribute('aria-label', `Archive ${entry.title}`);
        cardDeleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteSpellConfirmModal(entry);
        });
        item.appendChild(cardDeleteBtn);
      }

      item.addEventListener('click', () => {
        entry.newlyIngested = false;
        selectedSpellbookEntryId = entry.id;
        // Update selection UI & aria-selected
        spellbookSongList.querySelectorAll('.spellbook-song-item').forEach((el) => {
          el.classList.remove('selected');
          el.setAttribute('aria-selected', 'false');
        });
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        renderSpellbookDetails(entry);
      });

      item.addEventListener('dblclick', () => {
        entry.newlyIngested = false;
        selectedSpellbookEntryId = entry.id;
        loadSelectedSpellbookSong();
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          entry.newlyIngested = false;
          selectedSpellbookEntryId = entry.id;
          loadSelectedSpellbookSong();
        }
      });

      spellbookSongList.appendChild(item);
    }

    if (starBtnToRefocus) {
      starBtnToRefocus.focus();
    }

    renderSpellbookDetails(selectedEntry);
  }

  // Navigation button states & 10 Bookmark Tabs / Tier Pips
  if (btnSpellbookPrevPage) {
    btnSpellbookPrevPage.disabled = spellbookFavoritesOnly || currentSpellbookTierIndex <= 0;
  }
  if (btnSpellbookNextPage) {
    btnSpellbookNextPage.disabled = spellbookFavoritesOnly || currentSpellbookTierIndex >= SPELLBOOK_TIERS.length - 1;
  }

  renderSpellbookTierPips();
}

function renderSpellbookDetails(entry) {
  const tier = SPELLBOOK_TIERS[currentSpellbookTierIndex] || SPELLBOOK_TIERS[0];

  if (!entry) {
    if (spellbookDetailTierChip) spellbookDetailTierChip.textContent = spellbookFavoritesOnly ? 'Attuned' : tier.levelName;
    if (spellbookDetailSource) spellbookDetailSource.textContent = '\u2014';
    if (spellbookDetailTitle) spellbookDetailTitle.textContent = 'No Spell Selected';
    if (spellbookDetailFile) spellbookDetailFile.textContent = '\u2014';
    if (spellbookDetailBpm) spellbookDetailBpm.textContent = '\u2014 BPM';
    if (spellbookDetailDuration) spellbookDetailDuration.textContent = '\u2014';
    if (spellbookDetailNps) spellbookDetailNps.textContent = '\u2014 NPS';
    if (spellbookDetailNotes) spellbookDetailNotes.textContent = '\u2014';
    if (spellbookDetailPlays) spellbookDetailPlays.textContent = '0';
    if (spellbookDetailBestAcc) spellbookDetailBestAcc.textContent = '\u2014';
    if (spellbookDetailLastAcc) spellbookDetailLastAcc.textContent = '\u2014';
    if (spellbookDetailTotalXp) spellbookDetailTotalXp.textContent = '0 XP';
    if (spellbookDetailLastPlayed) spellbookDetailLastPlayed.textContent = 'Never performed on stage';
    if (spellbookDetailAudioBadge) spellbookDetailAudioBadge.classList.add('hidden');
    if (btnSpellbookLoadSong) btnSpellbookLoadSong.disabled = true;
    if (btnSpellbookFavoriteSong) {
      btnSpellbookFavoriteSong.disabled = true;
      btnSpellbookFavoriteSong.classList.remove('is-favorite');
      btnSpellbookFavoriteSong.textContent = '\u2606';
      btnSpellbookFavoriteSong.setAttribute('aria-pressed', 'false');
      btnSpellbookFavoriteSong.title = 'Attune this spell';
    }
    if (btnSpellbookDeleteSong) btnSpellbookDeleteSong.classList.add('hidden');
    return;
  }

  if (spellbookDetailTierChip) {
    spellbookDetailTierChip.textContent = `${entry.spellLevel} (${entry.xpMultiplier.toFixed(1)}x XP)`;
  }
  if (spellbookDetailSource) {
    spellbookDetailSource.textContent = entry.filePath === 'BUILTIN_DEMO' ? 'Built-In Conservatory Spell' : entry.sourceTag;
  }
  if (spellbookDetailTitle) {
    spellbookDetailTitle.textContent = entry.title;
  }
  if (spellbookDetailFile) {
    spellbookDetailFile.textContent = entry.fileName;
  }
  if (spellbookDetailBpm) {
    spellbookDetailBpm.textContent = `${entry.bpm} BPM`;
  }
  if (spellbookDetailDuration) {
    spellbookDetailDuration.textContent = formatSeconds(entry.duration);
  }
  if (spellbookDetailNps) {
    spellbookDetailNps.textContent = `${entry.nps.toFixed(2)} NPS`;
  }
  if (spellbookDetailNotes) {
    spellbookDetailNotes.textContent = String(entry.totalNotes || '\u2014');
  }

  // Load rehearsal history from songPlayHistory store
  const hist = getSongHistoryRecord(entry);
  if (spellbookDetailPlays) {
    const plays = hist ? Number(hist.plays) || 0 : 0;
    spellbookDetailPlays.textContent = `${plays}`;
  }
  if (spellbookDetailBestAcc) {
    const bestAcc = hist && typeof hist.bestAccuracy === 'number' && hist.bestAccuracy > 0 ? hist.bestAccuracy : null;
    spellbookDetailBestAcc.textContent = bestAcc !== null ? `${bestAcc}%` : '\u2014';
  }
  if (spellbookDetailLastAcc) {
    const lastAcc = hist && typeof hist.lastAccuracy === 'number' && hist.lastAccuracy > 0 ? hist.lastAccuracy : null;
    spellbookDetailLastAcc.textContent = lastAcc !== null ? `${lastAcc}%` : '\u2014';
  }
  if (spellbookDetailTotalXp) {
    const xp = hist ? Number(hist.totalXpEarned) || 0 : 0;
    spellbookDetailTotalXp.textContent = `${xp.toLocaleString()} XP`;
  }
  if (spellbookDetailLastPlayed) {
    spellbookDetailLastPlayed.textContent = hist && hist.lastPlayed
      ? `Last played: ${formatAnnalsDate(hist.lastPlayed)}`
      : 'Never performed on stage';
  }

  // Backing audio badge
  if (spellbookDetailAudioBadge) {
    if (entry.backingAudioPath) {
      spellbookDetailAudioBadge.classList.remove('hidden');
      spellbookDetailAudioBadge.textContent = '\uD83C\uDFB5 Backing Audio Synced';
    } else {
      spellbookDetailAudioBadge.classList.add('hidden');
    }
  }

  if (btnSpellbookLoadSong) {
    btnSpellbookLoadSong.disabled = false;
  }

  if (btnSpellbookFavoriteSong) {
    btnSpellbookFavoriteSong.disabled = false;
    const isFav = Boolean(entry.isFavorite);
    btnSpellbookFavoriteSong.classList.toggle('is-favorite', isFav);
    btnSpellbookFavoriteSong.textContent = isFav ? '\u2605' : '\u2606';
    btnSpellbookFavoriteSong.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btnSpellbookFavoriteSong.title = isFav ? `Unattune "${entry.title}"` : `Attune "${entry.title}"`;
    btnSpellbookFavoriteSong.setAttribute('aria-label', isFav ? `Unattune ${entry.title}` : `Attune ${entry.title}`);
  }

  // Delete button available for all file-backed Grimoire entries (Imports/ & Test Library)
  if (btnSpellbookDeleteSong) {
    if (isGrimoireEntryDeletable(entry)) {
      btnSpellbookDeleteSong.classList.remove('hidden');
      btnSpellbookDeleteSong.title = `Remove "${entry.title}" and move files to ./Archive`;
      btnSpellbookDeleteSong.setAttribute('aria-label', `Archive ${entry.title}`);
    } else {
      btnSpellbookDeleteSong.classList.add('hidden');
    }
  }
}

function loadSelectedSpellbookSong() {
  const entry = (selectedSpellbookEntryId && grimoireSpells.get(selectedSpellbookEntryId)) || null;
  if (!entry) return;

  loadGrimoireEntry(entry);
  closeGrimoireSpellbook();
  hideTavernMenu();
  resetPlaybackToStart();
  showGrimoireToast(`\uD83D\uDCD6 Inscribed "${entry.title}" (${entry.spellLevel}) on Spell Highway!`);
}

function deleteSelectedSpellbookSong() {
  const entry = (selectedSpellbookEntryId && grimoireSpells.get(selectedSpellbookEntryId)) || null;
  if (!entry || !isGrimoireEntryDeletable(entry)) return;
  openDeleteSpellConfirmModal(entry);
}

/**
 * Backward-compatible helper called across the codebase to update Grimoire stats
 * and refresh the open spellbook spread
 */
function renderGrimoireSidebar() {
  if (grimoireCountBadge) {
    grimoireCountBadge.textContent = String(grimoireSpells.size);
  }
  updateTavernMenuStats();
  if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
    renderSpellbookSpread();
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

let pendingDeleteEntry = null;
let isDeleteInProgress = false;
let previousDeleteModalFocus = null;

function isSameFilePath(pathA, pathB) {
  if (!pathA || !pathB || pathA === 'BUILTIN_DEMO' || pathB === 'BUILTIN_DEMO') return false;
  try {
    const resolvedA = path.resolve(String(pathA));
    const resolvedB = path.resolve(String(pathB));
    return process.platform === 'win32'
      ? resolvedA.toLowerCase() === resolvedB.toLowerCase()
      : resolvedA === resolvedB;
  } catch {
    return false;
  }
}

function isGrimoireEntryDeletable(entry) {
  return Boolean(entry && entry.filePath && entry.filePath !== 'BUILTIN_DEMO');
}

/**
 * Collect all source files associated with a Grimoire entry (MIDI, paired audio,
 * sheet music, and any future #76 bundle parts) so they trash together safely.
 */
function collectGrimoireEntryFiles(entry) {
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (filePath) => {
    if (!filePath || typeof filePath !== 'string' || filePath === 'BUILTIN_DEMO') return;
    try {
      const resolved = path.resolve(filePath);
      const dedupeKey = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      if (seen.has(dedupeKey)) return;
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        seen.add(dedupeKey);
        candidates.push(resolved);
      }
    } catch {
      // Ignore invalid or inaccessible paths
    }
  };

  if (entry) {
    pushCandidate(entry.filePath);
    pushCandidate(entry.backingAudioPath);
    pushCandidate(entry.sheetMusicPath);
    pushCandidate(entry.musicXmlPath);

    if (Array.isArray(entry.bundleFiles)) {
      entry.bundleFiles.forEach(pushCandidate);
    }
    if (Array.isArray(entry.stems)) {
      entry.stems.forEach(pushCandidate);
    } else if (entry.stems && typeof entry.stems === 'object') {
      Object.values(entry.stems).forEach(pushCandidate);
    }

    // Sibling paired files sharing the same basename in the entry's directory
    if (entry.filePath && entry.filePath !== 'BUILTIN_DEMO') {
      try {
        const dir = path.dirname(entry.filePath);
        const base = path.basename(entry.filePath).replace(/\.(mid|midi)$/i, '');
        const pairedExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.musicxml', '.mxl', '.xml', '.pdf'];
        for (const ext of pairedExts) {
          pushCandidate(path.join(dir, `${base}${ext}`));
        }
      } catch {
        // Ignore sibling resolution error
      }
    }
  }

  return candidates;
}

function isGrimoireEntryLoadedOnHighway(entry, associatedFiles = []) {
  if (!currentSong || !entry) return false;
  if (isSameFilePath(currentSong.filePath, entry.filePath)) return true;
  if (
    currentSong.backingAudioPath &&
    associatedFiles.some((f) => isSameFilePath(currentSong.backingAudioPath, f))
  ) {
    return true;
  }
  if (
    (!currentSong.filePath || !entry.filePath) &&
    currentSong.fileName &&
    entry.fileName &&
    currentSong.fileName.toLowerCase() === entry.fileName.toLowerCase()
  ) {
    return true;
  }
  return false;
}

/**
 * Unload the currently active song from the Spell Highway back to a clean empty state (Issue #77)
 */
function unloadCurrentSongToEmptyState() {
  pausePlayback();
  clearAllHeldInputNotes();

  if (currentSong?.backingAudioEl) {
    try {
      currentSong.backingAudioEl.pause();
      currentSong.backingAudioEl.removeAttribute('src');
      currentSong.backingAudioEl.load();
    } catch {
      // Ignore audio cleanup errors
    }
  }

  currentSong = null;
  playbackState.isPlaying = false;
  playbackState.currentTime = 0;
  playbackState.lastFrameTimestamp = null;
  playbackState.isWaitingForStrike = false;
  playbackState.waitStartedAtMs = null;
  playbackState.activeStrikeGroup = null;
  playbackState.isScrubbing = false;

  resetSongSessionStats();

  if (spellNameDisplay) {
    spellNameDisplay.textContent = 'None \u2014 Load a .mid or Demo Spell';
  }
  if (spellDifficultyBadge) {
    spellDifficultyBadge.className = 'difficulty-badge diff-cantrip';
    spellDifficultyBadge.textContent = 'No Spell Loaded';
  }
  if (statNps) statNps.textContent = '0.00';
  if (statBpm) statBpm.textContent = '120 BPM';
  if (statDuration) statDuration.textContent = '0:00';
  if (statT1Notes) statT1Notes.textContent = '0';
  if (statT2Notes) statT2Notes.textContent = '0';
  if (statBandTracks) statBandTracks.textContent = '0';
  if (statFoldedNotes) statFoldedNotes.textContent = '0';

  if (playableTrackSelect) {
    playableTrackSelect.innerHTML = '<option value="auto-piano">No Spell Loaded</option>';
    playableTrackSelect.disabled = true;
  }
  if (btnPlayPause) {
    btnPlayPause.disabled = true;
    btnPlayPause.textContent = '\u25B6 Cast Spell';
    btnPlayPause.classList.remove('playing');
  }
  if (btnRestart) btnRestart.disabled = true;
  if (songProgressSlider) {
    songProgressSlider.value = '0';
    songProgressSlider.disabled = true;
  }
  if (songTimeReadout) songTimeReadout.textContent = '0:00 / 0:00';
  clearRehearsalLoop();

  setStrikeStatusBadge('idle', 'Highway Clear \u2014 Open Grimoire to Choose a Spell');
  updateLitrpgHUD();
}

function openDeleteSpellConfirmModal(entry) {
  if (!isGrimoireEntryDeletable(entry) || !deleteSpellConfirmModal) return;

  pendingDeleteEntry = entry;
  previousDeleteModalFocus = document.activeElement;
  const files = collectGrimoireEntryFiles(entry);
  const isActive = isGrimoireEntryLoadedOnHighway(entry, files);

  if (deleteConfirmSongTitle) {
    deleteConfirmSongTitle.textContent = `"${entry.title}"`;
  }
  if (deleteConfirmActiveWarning) {
    if (isActive) {
      deleteConfirmActiveWarning.classList.remove('hidden');
    } else {
      deleteConfirmActiveWarning.classList.add('hidden');
    }
  }
  if (deleteConfirmFileList) {
    deleteConfirmFileList.innerHTML = '';
    if (files.length === 0) {
      const li = document.createElement('li');
      li.textContent = entry.fileName || entry.title || 'Grimoire index entry';
      deleteConfirmFileList.appendChild(li);
    } else {
      for (const filePath of files) {
        const li = document.createElement('li');
        const folderLabel = path.basename(path.dirname(filePath));
        li.textContent = `${folderLabel}/${path.basename(filePath)}`;
        li.title = filePath;
        deleteConfirmFileList.appendChild(li);
      }
    }
  }

  if (btnDeleteConfirmCancel) btnDeleteConfirmCancel.disabled = false;
  if (btnDeleteConfirmAccept) {
    btnDeleteConfirmAccept.disabled = false;
    btnDeleteConfirmAccept.innerHTML = '&#128230; Move to Archive';
  }

  deleteSpellConfirmModal.classList.remove('hidden');
  if (btnDeleteConfirmCancel) {
    btnDeleteConfirmCancel.focus();
  }
}

function closeDeleteSpellConfirmModal() {
  if (isDeleteInProgress) return;
  pendingDeleteEntry = null;
  if (deleteSpellConfirmModal) {
    deleteSpellConfirmModal.classList.add('hidden');
  }
  if (previousDeleteModalFocus && typeof previousDeleteModalFocus.focus === 'function' && document.body.contains(previousDeleteModalFocus)) {
    previousDeleteModalFocus.focus();
  } else if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden') && btnCloseSpellbook) {
    btnCloseSpellbook.focus();
  }
  previousDeleteModalFocus = null;
}

function ensureArchiveDirectory() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
  } catch {
    // Ignore mkdir error
  }
}

/**
 * Move a file into the local ./Archive directory.
 * If a file with the same name already exists in ./Archive, appends a timestamp to prevent overwriting.
 */
function moveFileToArchive(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string' || sourcePath === 'BUILTIN_DEMO') return null;
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) return null;

  ensureArchiveDirectory();

  const fileName = path.basename(resolved);
  let destPath = path.join(ARCHIVE_DIR, fileName);

  // If a file with this name already exists in ./Archive, append a timestamp so we never overwrite
  if (fs.existsSync(destPath)) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    destPath = path.join(ARCHIVE_DIR, `${base}_archived_${Date.now()}${ext}`);
  }

  try {
    fs.renameSync(resolved, destPath);
  } catch {
    // If rename fails (e.g. across drives or transient lock), copy then remove source
    fs.copyFileSync(resolved, destPath);
    try {
      fs.unlinkSync(resolved);
    } catch {
      // Ignore source unlink error if locked
    }
  }

  return destPath;
}

/**
 * Remove a spell from The Grimoire and move its source files to ./Archive (Issue #77)
 */
function removeGrimoireEntry(entry) {
  if (!isGrimoireEntryDeletable(entry)) return { removed: false, archived: [], failed: [] };

  const filesToArchive = collectGrimoireEntryFiles(entry);
  const wasActiveOnHighway = isGrimoireEntryLoadedOnHighway(entry, filesToArchive);
  const matchedLastSong = Boolean(
    isSameFilePath(bardProfile.lastSongPath, entry.filePath) ||
    filesToArchive.some((f) => isSameFilePath(bardProfile.lastSongPath, f))
  );

  // Release open media file handles BEFORE moving files (prevents Windows file lock errors)
  if (wasActiveOnHighway) {
    unloadCurrentSongToEmptyState();
  } else if (
    currentSong?.backingAudioPath &&
    filesToArchive.some((f) => isSameFilePath(currentSong.backingAudioPath, f))
  ) {
    if (currentSong.backingAudioEl) {
      try {
        currentSong.backingAudioEl.pause();
        currentSong.backingAudioEl.removeAttribute('src');
        currentSong.backingAudioEl.load();
      } catch {
        // Ignore cleanup errors
      }
      currentSong.backingAudioEl = null;
    }
    currentSong.backingAudioPath = null;
  }

  const archived = [];
  const failed = [];

  for (const file of filesToArchive) {
    try {
      const dest = moveFileToArchive(file);
      if (dest) {
        archived.push({ from: file, to: dest });
      }
    } catch (err) {
      failed.push({ file, error: err?.message || String(err) });
    }
  }

  // Only keep entry removed if primary MIDI file has left its original location
  const midiStillInOrigin = Boolean(entry.filePath && fs.existsSync(entry.filePath));
  if (midiStillInOrigin) {
    const errReason = failed[0]?.error || 'File could not be moved to the ./Archive folder.';
    throw new Error(errReason);
  }

  if (matchedLastSong) {
    bardProfile.lastSongPath = null;
    bardProfile.lastSongTitle = null;
    saveBardProfile();
  }

  grimoireSpells.delete(entry.id);
  if (selectedSpellbookEntryId === entry.id) {
    selectedSpellbookEntryId = null;
  }
  persistGrimoireIndex();
  renderGrimoireSidebar();

  return {
    removed: true,
    archivedCount: archived.length,
    failed
  };
}

function confirmPendingSpellDeletion() {
  if (!pendingDeleteEntry || isDeleteInProgress) return;
  const targetEntry = pendingDeleteEntry;

  isDeleteInProgress = true;
  if (btnDeleteConfirmCancel) btnDeleteConfirmCancel.disabled = true;
  if (btnDeleteConfirmAccept) {
    btnDeleteConfirmAccept.disabled = true;
    btnDeleteConfirmAccept.textContent = 'Moving to Archive...';
  }

  try {
    const result = removeGrimoireEntry(targetEntry);
    isDeleteInProgress = false;
    closeDeleteSpellConfirmModal();

    if (result.removed) {
      if (result.failed && result.failed.length > 0) {
        showGrimoireToast(`\uD83D\uDCE6 Archived "${targetEntry.title}" (some paired files could not be moved).`);
      } else {
        showGrimoireToast(`\uD83D\uDCE6 Moved "${targetEntry.title}" to ./Archive.`);
      }
    }
  } catch (err) {
    isDeleteInProgress = false;
    if (btnDeleteConfirmCancel) btnDeleteConfirmCancel.disabled = false;
    if (btnDeleteConfirmAccept) {
      btnDeleteConfirmAccept.disabled = false;
      btnDeleteConfirmAccept.innerHTML = '&#128230; Move to Archive';
    }
    alert(`Could not move "${targetEntry.title}" to ./Archive: ${err.message}`);
  }
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
    blackIdle: makeVGrad(keyboardY, blackKeyHeight, [[0, '#332920'], [0.8, '#18130e'], [1, '#0c0907']]),
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

  // 1. Draw scrolling horizontal beat/measure grid lines (honoring compound time signatures, Issue #37, Fixes #59)
  const denominator = Math.max(1, currentSong.timeSigDenominator || 4);
  const beatDur = (60 / Math.max(30, currentSong.bpm)) * (4 / denominator);
  const beatsPerMeasure = Math.max(1, currentSong.beatsPerMeasure || currentSong.timeSigNumerator || 4);
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
      : 'rgba(186, 171, 147, 0.07)';
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
        : (isAtStrikeLine ? '#ffffff' : (note.wasFolded ? '#fde68a' : borderHex));
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
        ctx.fillStyle = '#0c0907';
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
  inspired: ['#ffae00', '#f59e0b', '#ffd700', '#fff3b0', '#ffffff'],
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
        : 'rgba(186, 171, 147, 0.07)';
      ctx.lineWidth = semitone === 0 ? 1.5 : 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  // 2. Draw 60 FPS Falling Spell Highway Notes
  const strikeLineGuides = drawFallingSpellHighway(strikeLineY, width);

  // 2b. Issue #30: Draw Rehearsal Loop A/B boundary lines on the Spell Highway
  if (currentSong && rehearsalLoopState.enabled && hasValidRehearsalLoop()) {
    const pxPerSec = playbackState.fallSpeedPxPerSec;
    const markers = [
      { t: rehearsalLoopState.startTime, label: 'LOOP A', color: 'rgba(255, 215, 0, 0.78)' },
      { t: rehearsalLoopState.endTime, label: 'LOOP B', color: 'rgba(245, 158, 11, 0.88)' }
    ];
    for (const m of markers) {
      const y = strikeLineY - (m.t - playbackState.currentTime) * pxPerSec;
      if (y >= 4 && y <= strikeLineY) {
        ctx.save();
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        ctx.font = 'bold 10px "Consolas", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(m.label, width - 8, Math.max(12, y - 4));
        ctx.restore();
      }
    }
  }

  // 3. Draw glowing Strike Zone Line above the 61-key keyboard (with Bardic Inspiration glow at 50+ combo)
  ctx.save();
  const isWaiting = playbackState.isWaitingForStrike;
  const isInspired = songSessionStats.spellChain >= BARDIC_INSPIRATION_STREAK;
  const lineH = isInspired ? 16 : (isWaiting ? 14 : 9);
  const strikeGrad = ctx.createLinearGradient(0, strikeLineY - lineH + 2, 0, strikeLineY + 4);
  if (isInspired) {
    strikeGrad.addColorStop(0, 'rgba(255, 170, 0, 0)');
    strikeGrad.addColorStop(0.45, 'rgba(255, 170, 0, 0.85)');
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

    ctx.strokeStyle = isPressed ? '#ffd700' : (guide ? '#ffd700' : (isInQwertyRange ? '#8a6d2f' : '#2e241b'));
    ctx.lineWidth = guide ? 1.8 : 1;
    ctx.strokeRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

    if (qwertyChar) {
      ctx.fillStyle = isPressed || guide ? '#1a1200' : '#8a6d2f';
      ctx.font = `bold ${Math.max(9, Math.min(11, Math.floor(key.width * 0.36)))}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`[${qwertyChar}]`, key.x + key.width / 2, key.y + key.height - 28);
    }

    if (key.midi % 12 === 0 || guide || (showQwertyKeyLabels && key.midi === qwertyBaseMidi)) {
      ctx.fillStyle = isPressed || guide ? '#1a1200' : (showQwertyKeyLabels && key.midi === qwertyBaseMidi ? '#b45309' : '#5e4d3b');
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

    ctx.strokeStyle = isPressed || guide ? '#fff3b0' : (isInQwertyRange ? '#d4af37' : '#4a3b2c');
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
    clearAllHeldInputNotes();
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

  // Ignore MIDI input while modal dialogs are open or if event originates on Channel 10 (drums/percussion) (Issue #58)
  // Strike any piano key on the Title Splash to enter the Tavern (Issue #71)
  if (isTavernMenuVisible || isAnyModalOpen()) {
    if (isTavernMenuVisible && !hasEnteredTavernSession) {
      const status = data[0] & 0xf0;
      const data2 = data.length > 2 ? data[2] : 0;
      if (status === 0x90 && data2 > 0) {
        enterTavernFromSplash();
      }
    }
    return;
  }
  const channel = data[0] & 0x0f;
  if (channel === 9) return;

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
  if (rehearsalPopover) rehearsalPopover.classList.add('hidden');
  if (btnRehearsalPopover) {
    btnRehearsalPopover.classList.remove('active');
    btnRehearsalPopover.setAttribute('aria-expanded', 'false');
  }
}

function isAnyModalOpen() {
  const perfOpen = performanceCheckModal && !performanceCheckModal.classList.contains('hidden');
  const questOpen = questBoardModal && !questBoardModal.classList.contains('hidden');
  const annalsOpen = bardAnnalsModal && !bardAnnalsModal.classList.contains('hidden');
  const howToOpen = howToPlayModal && !howToPlayModal.classList.contains('hidden');
  const spellbookOpen = grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden');
  const deleteConfirmOpen = deleteSpellConfirmModal && !deleteSpellConfirmModal.classList.contains('hidden');
  return Boolean(perfOpen || questOpen || annalsOpen || howToOpen || spellbookOpen || deleteConfirmOpen);
}

window.addEventListener('keydown', (e) => {
  // Close open popovers and modals on Escape (Issue #33)
  if (e.key === 'Escape') {
    closeAllConservatoryPopovers();
    if (tavernStreakPopover && !tavernStreakPopover.classList.contains('hidden')) {
      e.preventDefault();
      closeStreakPopover({ returnFocus: true });
      return;
    }
    if (deleteSpellConfirmModal && !deleteSpellConfirmModal.classList.contains('hidden')) {
      e.preventDefault();
      closeDeleteSpellConfirmModal();
      return;
    }
    if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
      e.preventDefault();
      closeGrimoireSpellbook();
      return;
    }
    if (bardAnnalsModal && !bardAnnalsModal.classList.contains('hidden')) {
      e.preventDefault();
      closeBardAnnalsModal();
      return;
    }
    if (howToPlayModal && !howToPlayModal.classList.contains('hidden')) {
      e.preventDefault();
      closeHowToPlayModal();
      return;
    }
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

  // Keyboard navigation for open Grimoire Spellbook (ArrowLeft/A, ArrowRight/D) (Issue #69)
  const deleteConfirmVisible = deleteSpellConfirmModal && !deleteSpellConfirmModal.classList.contains('hidden');
  if (!deleteConfirmVisible && grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
    if (e.target !== spellbookSearchInput) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        flipSpellbookPage(-1);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        flipSpellbookPage(1);
        return;
      }
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

  // Block Spacebar playback and QWERTY piano keys while the Tavern Main Menu or any modal dialog is open (Issue #33, Issue #52, Issue #71)
  if (isTavernMenuVisible || isAnyModalOpen()) {
    if (isTavernMenuVisible && !hasEnteredTavernSession) {
      enterTavernFromSplash();
      e.preventDefault();
    }
    return;
  }

  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    togglePlayback();
    return;
  }

  if (e.repeat) return;
  const key = (e.key || '').toLowerCase();

  if (key === '[') {
    e.preventDefault();
    setRehearsalMarkerA();
    return;
  }
  if (key === ']') {
    e.preventDefault();
    setRehearsalMarkerB();
    return;
  }
  if (key === '\\') {
    e.preventDefault();
    toggleRehearsalLoop();
    return;
  }
  if (key === '-' || key === '_') {
    e.preventDefault();
    stepPracticeTempo(-1);
    return;
  }
  if (key === '=' || key === '+') {
    e.preventDefault();
    stepPracticeTempo(1);
    return;
  }

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
    const wasWaiting = playbackState.isWaitingForStrike;
    playbackState.isWaitingForStrike = false;
    playbackState.waitStartedAtMs = null;
    playbackState.activeStrikeGroup = null;
    playbackState.lastFrameTimestamp = performance.now();
    if (wasWaiting) {
      processSongAudioTriggers(playbackState.currentTime - 0.01, playbackState.currentTime + 0.005);
    }
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
    const wasWaiting = playbackState.isWaitingForStrike;
    playbackState.isWaitingForStrike = false;
    playbackState.waitStartedAtMs = null;
    playbackState.activeStrikeGroup = null;
    playbackState.lastFrameTimestamp = performance.now();
    if (wasWaiting) {
      processSongAudioTriggers(playbackState.currentTime - 0.01, playbackState.currentTime + 0.005);
    }
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

// Issue #30: Rehearsal Loop Event Listeners
if (btnLoopA) {
  btnLoopA.addEventListener('click', () => {
    setRehearsalMarkerA();
    btnLoopA.blur();
  });
}

if (btnLoopB) {
  btnLoopB.addEventListener('click', () => {
    setRehearsalMarkerB();
    btnLoopB.blur();
  });
}

if (btnRehearsalToggle) {
  btnRehearsalToggle.addEventListener('click', () => {
    toggleRehearsalLoop();
    btnRehearsalToggle.blur();
  });
}

if (btnRehearsalPopover && rehearsalPopover) {
  btnRehearsalPopover.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = rehearsalPopover.classList.contains('hidden');
    closeAllConservatoryPopovers();
    if (willOpen) {
      updateRehearsalUI();
      rehearsalPopover.classList.remove('hidden');
      btnRehearsalPopover.classList.add('active');
      btnRehearsalPopover.setAttribute('aria-expanded', 'true');
    }
  });
}

if (btnCloseRehearsalPopover) {
  btnCloseRehearsalPopover.addEventListener('click', () => {
    closeAllConservatoryPopovers();
  });
}

if (btnLoopClear) {
  btnLoopClear.addEventListener('click', () => {
    clearRehearsalLoop();
    showGrimoireToast('\uD83D\uDD01 Rehearsal Loop cleared');
  });
}

if (chkRehearsalAutoramp) {
  chkRehearsalAutoramp.addEventListener('change', (e) => {
    rehearsalLoopState.autoRamp = Boolean(e.target.checked);
    updateRehearsalUI();
    e.target.blur();
  });
}

if (rehearsalTargetSpeedSelect) {
  rehearsalTargetSpeedSelect.addEventListener('change', (e) => {
    rehearsalLoopState.targetSpeed = Number(e.target.value) || 1.0;
    updateRehearsalUI();
    e.target.blur();
  });
}

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
  if (
    rehearsalPopover &&
    !rehearsalPopover.classList.contains('hidden') &&
    !rehearsalPopover.contains(target) &&
    target !== btnRehearsalPopover
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
  setPracticeTempo(Number(e.target.value) || 1.0, { persist: true, toast: false });
  e.target.blur();
});

if (btnTempoDown) {
  btnTempoDown.addEventListener('click', (e) => {
    stepPracticeTempo(-1);
    e.currentTarget.blur();
  });
}

if (btnTempoUp) {
  btnTempoUp.addEventListener('click', (e) => {
    stepPracticeTempo(1);
    e.currentTarget.blur();
  });
}

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
          isInspired ? '#fbbf24' : '#ffd700'
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

// ============================================================================
// ISSUE #69 UI LISTENERS: THE FLIPPABLE GRIMOIRE SPELLBOOK POP-UP MODULE
// ============================================================================

if (btnToggleGrimoire) {
  btnToggleGrimoire.addEventListener('click', () => {
    if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
      closeGrimoireSpellbook();
    } else {
      openGrimoireSpellbook('highway');
    }
  });
}

if (btnCloseSpellbook) {
  btnCloseSpellbook.addEventListener('click', () => {
    closeGrimoireSpellbook();
  });
}

if (grimoireSpellbookModal) {
  grimoireSpellbookModal.addEventListener('click', (e) => {
    if (e.target === grimoireSpellbookModal) {
      closeGrimoireSpellbook();
    }
  });
}

if (btnSpellbookSaveCurrent) {
  btnSpellbookSaveCurrent.addEventListener('click', () => {
    saveActiveSpellToGrimoire();
  });
}

if (btnSpellbookOpenImports) {
  btnSpellbookOpenImports.addEventListener('click', () => {
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

if (btnSpellbookDropTest) {
  btnSpellbookDropTest.addEventListener('click', () => {
    dropTestMidiIntoImports();
  });
}

if (btnSpellbookQuestPointer) {
  btnSpellbookQuestPointer.addEventListener('click', () => {
    closeGrimoireSpellbook();
    openQuestBoardModal();
  });
}

if (btnSpellbookPrevPage) {
  btnSpellbookPrevPage.addEventListener('click', () => {
    flipSpellbookPage(-1);
  });
}

if (btnSpellbookNextPage) {
  btnSpellbookNextPage.addEventListener('click', () => {
    flipSpellbookPage(1);
  });
}

if (btnSpellbookLoadSong) {
  btnSpellbookLoadSong.addEventListener('click', () => {
    loadSelectedSpellbookSong();
  });
}

if (btnSpellbookFavoriteSong) {
  btnSpellbookFavoriteSong.addEventListener('click', () => {
    if (selectedSpellbookEntryId) {
      toggleGrimoireFavorite(selectedSpellbookEntryId);
    }
  });
}

if (btnSpellbookFavoritesFilter) {
  btnSpellbookFavoritesFilter.addEventListener('click', () => {
    spellbookFavoritesOnly = !spellbookFavoritesOnly;
    saveSpellbookFavoritesFilter();
    renderSpellbookSpread();
  });
}

if (btnSpellbookDeleteSong) {
  btnSpellbookDeleteSong.addEventListener('click', () => {
    deleteSelectedSpellbookSong();
  });
}

if (btnCloseDeleteConfirm) {
  btnCloseDeleteConfirm.addEventListener('click', () => {
    closeDeleteSpellConfirmModal();
  });
}

if (btnDeleteConfirmCancel) {
  btnDeleteConfirmCancel.addEventListener('click', () => {
    closeDeleteSpellConfirmModal();
  });
}

if (btnDeleteConfirmAccept) {
  btnDeleteConfirmAccept.addEventListener('click', () => {
    confirmPendingSpellDeletion();
  });
}

if (deleteSpellConfirmModal) {
  deleteSpellConfirmModal.addEventListener('click', (e) => {
    if (e.target === deleteSpellConfirmModal) {
      closeDeleteSpellConfirmModal();
    }
  });
}

if (spellbookSearchInput) {
  spellbookSearchInput.addEventListener('input', () => {
    renderSpellbookSpread();
  });
}

// ============================================================================
// PHASE 9: "THE QUEST BOARD" (IN-APP YOUTUBE-TO-MIDI SOURCING & QUICK LINKS)
// ============================================================================

let activeQuestChildProcess = null;
let lastQuestTranscribedMidiPath = null;

function openQuestBoardModal() {
  pausePlayback();
  closeAllConservatoryPopovers();
  renderDailyBountiesBoard();
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
    path.join(localAppData, 'Programs', 'Python', 'Python313', 'python.exe'),
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

// ============================================================================
// ISSUE #52: THE TAVERN TITLE SCREEN, BARDIC ANNALS & ORIENTATION
// ============================================================================

/**
 * Reload the last performed song (bardProfile.lastSongPath) onto the Spell Highway.
 * Returns true if the song was restored, false if unavailable (Issue #67).
 */
function restoreLastSong() {
  const lastPath = bardProfile.lastSongPath;
  if (!lastPath) return false;
  try {
    if (lastPath === 'BUILTIN_DEMO') {
      loadBuiltInDemoSpell();
      return true;
    }
    if (!fs.existsSync(lastPath)) return false;
    const buf = fs.readFileSync(lastPath);
    parseMidiBuffer(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      path.basename(lastPath),
      lastPath
    );
    return true;
  } catch {
    return false;
  }
}

let previousMenuFocusElement = null;
let previousModalFocusElement = null;

function recordSongPerformance(song, accuracyPct, maxChain, xpEarned, meta = {}) {
  if (!song) return { newlyCompletedQuests: [], totalBonusXp: 0 };
  const key = song.songId || (song.filePath || song.title || 'Demo Spell').toLowerCase();
  const title = song.title || 'Untitled Scroll';
  const existing = songPlayHistory[key] || {
    songId: song.songId || key,
    title,
    filePath: song.filePath || null,
    plays: 0,
    bestAccuracy: 0,
    lastAccuracy: 0,
    bestChain: 0,
    totalXpEarned: 0,
    lastPlayed: null,
    firstPlayed: new Date().toISOString()
  };

  existing.plays = (Number(existing.plays) || 0) + 1;
  existing.lastAccuracy = accuracyPct;
  existing.bestAccuracy = Math.max(Number(existing.bestAccuracy) || 0, accuracyPct);
  existing.bestChain = Math.max(Number(existing.bestChain) || 0, maxChain);
  existing.totalXpEarned = (Number(existing.totalXpEarned) || 0) + xpEarned;
  existing.lastPlayed = new Date().toISOString();
  existing.title = title;
  if (song.filePath) {
    existing.filePath = song.filePath;
  }

  songPlayHistory[key] = existing;
  bardProfile.lastSongTitle = title;
  bardProfile.lastSongPath = song.filePath;
  recordPracticeDayActivity({ type: 'song', xpEarned });
  const questOutcome = updateDailyQuestsOnSongComplete({
    waitMode: Boolean(meta.waitMode),
    accuracyPct,
    maxChain,
    cleanNotesHit: Number(meta.cleanNotesHit) || 0,
    cleanChordRolls: Number(meta.cleanChordRolls) || 0,
    xpEarned
  });

  saveBardProfile();
  saveSongStats();
  updateTavernMenuStats();
  if (typeof updateLitrpgHUD === 'function') updateLitrpgHUD();
  return questOutcome;
}

function computeTavernSongStats() {
  const historyEntries = Object.values(songPlayHistory);
  if (historyEntries.length === 0) {
    return {
      favorite: null,
      best: null,
      worst: null,
      careerAccuracy: null
    };
  }

  let fav = null;
  let best = null;
  let worst = null;
  let totalAcc = 0;
  let countWithAcc = 0;

  for (const entry of historyEntries) {
    // Favorite = most rehearsals; ties broken by most recently played (Issue #67)
    if (
      !fav ||
      entry.plays > fav.plays ||
      (entry.plays === fav.plays && (entry.lastPlayed || '') > (fav.lastPlayed || ''))
    ) {
      fav = entry;
    }
    if (typeof entry.bestAccuracy === 'number' && (!best || entry.bestAccuracy > best.bestAccuracy)) {
      best = entry;
    }
    // Worst song & career accuracy use current (last) accuracy, not best-ever (Issue #67)
    if (typeof entry.lastAccuracy === 'number') {
      if (!worst || entry.lastAccuracy < worst.lastAccuracy) {
        worst = entry;
      }
      totalAcc += entry.lastAccuracy;
      countWithAcc++;
    }
  }

  const careerAccuracy = countWithAcc > 0 ? Math.round(totalAcc / countWithAcc) : null;
  return { favorite: fav, best, worst, careerAccuracy };
}

function updateTavernMenuStats() {
  if (!tavernMainMenu) return;

  if (menuBardLevel) menuBardLevel.textContent = `LVL ${bardProfile.level}`;
  if (menuBardTitle) menuBardTitle.textContent = bardProfile.title;
  if (menuTotalXp) menuTotalXp.textContent = `${bardProfile.totalXp.toLocaleString()} XP`;

  const nextLvl = bardProfile.level + 1;
  if (menuXpProgressText) {
    menuXpProgressText.textContent = `${bardProfile.xpIntoLevel.toLocaleString()} / ${bardProfile.xpForNextLevel.toLocaleString()} XP`;
  }
  if (menuNextLevelText) {
    menuNextLevelText.textContent = `To Lvl ${nextLvl}`;
  }
  const pct = bardProfile.xpForNextLevel > 0
    ? Math.min(100, Math.max(0, (bardProfile.xpIntoLevel / bardProfile.xpForNextLevel) * 100))
    : 0;
  if (menuXpBarFill) {
    menuXpBarFill.style.width = `${pct.toFixed(1)}%`;
  }

  // Update The Hearth Stage button with the last performed song (falls back to the loaded song) (Issue #67, #77)
  const activeTitle = bardProfile.lastSongTitle || currentSong?.title;
  if (menuLastSongLabel) {
    menuLastSongLabel.textContent = activeTitle
      ? `Play: "${activeTitle}"`
      : 'Take the Stage (Empty Highway)';
  }

  // Update The Bookshelf summary with total spells in Grimoire
  const totalSpells = grimoireSpells.size;
  if (menuGrimoireSummary) {
    menuGrimoireSummary.textContent = `${totalSpells} spell scroll${totalSpells === 1 ? '' : 's'} cataloged`;
  }

  renderPracticeStreakCalendar();
  renderDailyBountyStationSummary();
}

function playTavernWelcomeChord() {
  if (!grandPianoSampler || !grandPianoLoaded) return;
  try {
    const now = Tone.now();
    const arpeggio = [
      { note: 'C3', delay: 0 },
      { note: 'G3', delay: 0.05 },
      { note: 'C4', delay: 0.10 },
      { note: 'E4', delay: 0.15 },
      { note: 'G4', delay: 0.20 },
      { note: 'C5', delay: 0.25 }
    ];
    arpeggio.forEach(({ note, delay }) => {
      grandPianoSampler.triggerAttackRelease(note, 2.5, now + delay, 0.75);
    });
  } catch {
    // Ignore audio initialization edge cases
  }
}

function enterTavernFromSplash() {
  if (hasEnteredTavernSession) return;
  hasEnteredTavernSession = true;

  try {
    if (window.Tone && Tone.context && Tone.context.state !== 'running') {
      Tone.context.resume().catch(() => {});
    }
    playTavernWelcomeChord();
  } catch (err) {
    console.warn('Audio welcome chord bypassed:', err);
  }

  if (tavernTitleSplash) {
    tavernTitleSplash.classList.add('dismissed');
    setTimeout(() => {
      tavernTitleSplash.style.display = 'none';
    }, 520);
  }

  let hasSeenIntro = false;
  try {
    hasSeenIntro = Boolean(localStorage.getItem(FIRST_RUN_STORAGE_KEY));
  } catch {
    // Ignore storage read error
  }

  if (!hasSeenIntro) {
    setTimeout(() => {
      openHowToPlayModal();
    }, 350);
  } else {
    setTimeout(() => {
      if (btnMenuContinue) {
        btnMenuContinue.focus();
      }
    }, 120);
  }
}

function showTavernMenu() {
  pausePlayback();
  clearAllHeldInputNotes();
  closeAllConservatoryPopovers();
  isTavernMenuVisible = true;
  previousMenuFocusElement = document.activeElement;

  // Set inert on background layers while Tavern Main Menu is active (Issue #68)
  const header = document.getElementById('tavern-header');
  const scrollBar = document.getElementById('spell-scroll-bar');
  const stage = document.getElementById('stage-container');
  if (header) header.setAttribute('inert', '');
  if (scrollBar) scrollBar.setAttribute('inert', '');
  if (stage) stage.setAttribute('inert', '');

  if (tavernMainMenu) {
    tavernMainMenu.classList.remove('hidden');
  }

  // If already entered in this session, keep the title splash dismissed (Issue #71)
  if (hasEnteredTavernSession && tavernTitleSplash) {
    tavernTitleSplash.classList.add('dismissed');
    tavernTitleSplash.style.display = 'none';
  } else if (!hasEnteredTavernSession && tavernTitleSplash) {
    tavernTitleSplash.classList.remove('dismissed');
    tavernTitleSplash.style.display = 'flex';
  }

  updateTavernMenuStats();

  // Focus primary action button (Issue #68, #71)
  const continueBtn = document.getElementById('btn-menu-continue');
  if (continueBtn && hasEnteredTavernSession) {
    continueBtn.focus();
  } else if (btnEnterTavern && !hasEnteredTavernSession) {
    btnEnterTavern.focus();
  }
}

function hideTavernMenu() {
  closeStreakPopover();
  isTavernMenuVisible = false;
  if (tavernMainMenu) {
    tavernMainMenu.classList.add('hidden');
  }

  // Remove inert from background layers
  const header = document.getElementById('tavern-header');
  const scrollBar = document.getElementById('spell-scroll-bar');
  const stage = document.getElementById('stage-container');
  if (header) header.removeAttribute('inert');
  if (scrollBar) scrollBar.removeAttribute('inert');
  if (stage) stage.removeAttribute('inert');

  // Return focus to triggering control or primary play button
  if (previousMenuFocusElement && typeof previousMenuFocusElement.focus === 'function' && previousMenuFocusElement !== document.body) {
    previousMenuFocusElement.focus();
  } else if (btnPlayPause) {
    btnPlayPause.focus();
  }

  setTimeout(() => {
    computeKeyGeometry();
  }, 40);
}

function openBardAnnalsModal() {
  pausePlayback();
  closeAllConservatoryPopovers();
  if (!bardAnnalsModal) return;

  previousModalFocusElement = document.activeElement;
  const stats = computeTavernSongStats();

  if (annalsBardLevel) annalsBardLevel.textContent = `LVL ${bardProfile.level}`;
  if (annalsBardTitle) annalsBardTitle.textContent = bardProfile.title;
  if (annalsTotalXp) annalsTotalXp.textContent = `${bardProfile.totalXp.toLocaleString()} XP`;
  if (annalsSongsCompleted) annalsSongsCompleted.textContent = String(bardProfile.songsCompleted);
  if (annalsBestChain) annalsBestChain.textContent = String(bardProfile.bestCareerChain);
  if (annalsCareerAccuracy) {
    annalsCareerAccuracy.textContent = stats.careerAccuracy !== null ? `${stats.careerAccuracy}%` : '—';
  }

  // Highlights
  if (annalsFavSong) {
    annalsFavSong.textContent = stats.favorite ? stats.favorite.title : 'None yet';
  }
  if (annalsFavPlays) {
    annalsFavPlays.textContent = stats.favorite ? `${stats.favorite.plays} rehearsal${stats.favorite.plays === 1 ? '' : 's'}` : '0 rehearsals';
  }

  if (annalsBestSong) {
    annalsBestSong.textContent = stats.best ? stats.best.title : 'None yet';
  }
  if (annalsBestAccuracy) {
    annalsBestAccuracy.textContent = stats.best ? `${stats.best.bestAccuracy}% mastery` : '— accuracy';
  }

  if (annalsWorstSong) {
    annalsWorstSong.textContent = stats.worst ? stats.worst.title : 'None yet';
  }
  if (annalsWorstAccuracy) {
    annalsWorstAccuracy.textContent = stats.worst ? `${stats.worst.lastAccuracy}% latest trial` : '— accuracy';
  }

  // Issue #68: Build rehearsal ledger safely with createElement / textContent without innerHTML
  if (annalsHistoryList) {
    while (annalsHistoryList.firstChild) {
      annalsHistoryList.removeChild(annalsHistoryList.firstChild);
    }
    const entries = Object.values(songPlayHistory).sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0));
    if (entries.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'annals-empty-history';
      emptyDiv.textContent = 'No spells rehearsed yet. Take the stage to begin your chronicle!';
      annalsHistoryList.appendChild(emptyDiv);
    } else {
      for (const e of entries) {
        const row = document.createElement('div');
        row.className = 'annals-history-row';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'annals-row-title';
        titleSpan.textContent = String(e.title || 'Untitled Scroll');

        const statsDiv = document.createElement('div');
        statsDiv.className = 'annals-row-stats';

        const playsNum = Number(e.plays) || 0;
        const playsSpan = document.createElement('span');
        playsSpan.textContent = `${playsNum} rehearsal${playsNum === 1 ? '' : 's'}`;

        const dotSpan = document.createElement('span');
        dotSpan.textContent = ' • ';
        dotSpan.setAttribute('aria-hidden', 'true');

        const accStrong = document.createElement('strong');
        accStrong.className = 'annals-row-accuracy';
        accStrong.textContent = `${Number(e.bestAccuracy) || 0}%`;

        statsDiv.appendChild(playsSpan);
        statsDiv.appendChild(dotSpan);
        statsDiv.appendChild(accStrong);

        row.appendChild(titleSpan);
        row.appendChild(statsDiv);
        annalsHistoryList.appendChild(row);
      }
    }
  }

  bardAnnalsModal.classList.remove('hidden');
  const closeBtn = document.getElementById('btn-close-annals');
  if (closeBtn) closeBtn.focus();
}

function closeBardAnnalsModal() {
  if (bardAnnalsModal) {
    bardAnnalsModal.classList.add('hidden');
  }
  if (previousModalFocusElement && typeof previousModalFocusElement.focus === 'function') {
    previousModalFocusElement.focus();
  }
}

function openHowToPlayModal() {
  pausePlayback();
  closeAllConservatoryPopovers();
  previousModalFocusElement = document.activeElement;
  if (howToPlayModal) {
    howToPlayModal.classList.remove('hidden');
    const closeBtn = document.getElementById('btn-close-how-to-play');
    if (closeBtn) closeBtn.focus();
  }
}

function closeHowToPlayModal() {
  try {
    localStorage.setItem(FIRST_RUN_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage quota error
  }
  if (howToPlayModal) {
    howToPlayModal.classList.add('hidden');
  }
  if (previousModalFocusElement && typeof previousModalFocusElement.focus === 'function') {
    previousModalFocusElement.focus();
  }
}

// Modal Focus Trap Helper (Issue #68, #77 stacked modal support)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const activeModals = Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden)'));
  const activeModal = activeModals[activeModals.length - 1];
  if (!activeModal) return;

  const focusables = Array.from(activeModal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled])'));
  if (focusables.length === 0) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// Event Listeners for Issue #52
if (btnReturnTavern) {
  btnReturnTavern.addEventListener('click', () => {
    showTavernMenu();
  });
}

if (tavernBardCard) {
  tavernBardCard.addEventListener('click', () => {
    openBardAnnalsModal();
  });
  tavernBardCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBardAnnalsModal();
    }
  });
}

if (btnMenuContinue) {
  btnMenuContinue.addEventListener('click', () => {
    hideTavernMenu();
    if (bardProfile.lastSongPath && currentSong?.filePath !== bardProfile.lastSongPath) {
      restoreLastSong();
    }
    resetPlaybackToStart();
  });
}

if (btnMenuGrimoire) {
  btnMenuGrimoire.addEventListener('click', () => {
    hideTavernMenu();
    openGrimoireSpellbook('tavern');
  });
}

if (btnMenuQuestBoard) {
  btnMenuQuestBoard.addEventListener('click', () => {
    hideTavernMenu();
    openQuestBoardModal();
  });
}

if (btnMenuHowToPlay) {
  btnMenuHowToPlay.addEventListener('click', () => {
    openHowToPlayModal();
  });
}

if (btnMenuSettings) {
  btnMenuSettings.addEventListener('click', (e) => {
    // Prevent the global document outside-click handler from instantly closing the popover (Issue #67)
    e.stopPropagation();
    hideTavernMenu();
    if (settingsPopover) {
      settingsPopover.classList.remove('hidden');
      if (btnToggleSettings) {
        btnToggleSettings.classList.add('active');
        btnToggleSettings.setAttribute('aria-expanded', 'true');
      }
    }
  });
}

if (btnCloseAnnals) {
  btnCloseAnnals.addEventListener('click', () => {
    closeBardAnnalsModal();
  });
}

if (btnAnnalsCloseBottom) {
  btnAnnalsCloseBottom.addEventListener('click', () => {
    closeBardAnnalsModal();
  });
}

if (bardAnnalsModal) {
  bardAnnalsModal.addEventListener('click', (e) => {
    if (e.target === bardAnnalsModal) {
      closeBardAnnalsModal();
    }
  });
}

if (btnCloseHowToPlay) {
  btnCloseHowToPlay.addEventListener('click', () => {
    closeHowToPlayModal();
  });
}

if (btnHowToPlayReady) {
  btnHowToPlayReady.addEventListener('click', () => {
    closeHowToPlayModal();
  });
}

if (howToPlayModal) {
  howToPlayModal.addEventListener('click', (e) => {
    if (e.target === howToPlayModal) {
      closeHowToPlayModal();
    }
  });
}

// Event Listeners for Issue #71 (Title Splash Opener)
if (btnEnterTavern) {
  btnEnterTavern.addEventListener('click', (e) => {
    e.stopPropagation();
    enterTavernFromSplash();
  });
}

if (tavernTitleSplash) {
  tavernTitleSplash.addEventListener('click', () => {
    enterTavernFromSplash();
  });
}

// ============================================================================
// ISSUE #66: HEARTHFIRE PRACTICE STREAK CALENDAR & STREAK MATH
// ============================================================================

const STREAK_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats a Date into a local calendar YYYY-MM-DD key without UTC drift.
 * @param {Date} [dateObj]
 * @returns {string}
 */
function getLocalDateKey(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Steps a local calendar date by deltaDays using local noon to avoid DST jumps.
 * @param {Date} dateObj
 * @param {number} deltaDays
 * @returns {Date}
 */
function addLocalCalendarDays(dateObj, deltaDays) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + deltaDays, 12, 0, 0);
}

/**
 * Returns true when a stored practiceDays entry counts as an active practice day.
 * @param {unknown} entry
 * @returns {boolean}
 */
function isPracticeDayActive(entry) {
  if (!entry) return false;
  if (entry === true) return true;
  if (typeof entry !== 'object') return false;
  return Boolean(
    entry.practiced === true ||
    Number(entry.songsCompleted) > 0 ||
    Number(entry.questsCompleted) > 0 ||
    Number(entry.xpEarned) > 0
  );
}

/**
 * Computes current streak (with yesterday at-risk grace), longest streak, and today's status.
 * @param {Record<string, unknown>} practiceDays
 * @param {Date} [referenceDate]
 * @returns {{ currentStreak: number, longestStreak: number, practicedToday: boolean, totalDays: number }}
 */
function computePracticeStreak(practiceDays = {}, referenceDate = new Date()) {
  const map = practiceDays && typeof practiceDays === 'object' ? practiceDays : {};
  const todayNoon = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0);
  const todayKey = getLocalDateKey(todayNoon);
  const practicedToday = isPracticeDayActive(map[todayKey]);

  let currentStreak = 0;
  let cursor = practicedToday ? todayNoon : addLocalCalendarDays(todayNoon, -1);
  while (isPracticeDayActive(map[getLocalDateKey(cursor)])) {
    currentStreak++;
    cursor = addLocalCalendarDays(cursor, -1);
  }

  const activeKeys = Object.keys(map)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && isPracticeDayActive(map[k]))
    .sort();

  let longestStreak = 0;
  let run = 0;
  let prevDate = null;
  for (const key of activeKeys) {
    const [y, m, d] = key.split('-').map(Number);
    const curDate = new Date(y, m - 1, d, 12, 0, 0);
    if (prevDate && getLocalDateKey(addLocalCalendarDays(prevDate, 1)) === key) {
      run++;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prevDate = curDate;
  }

  return {
    currentStreak,
    longestStreak,
    practicedToday,
    totalDays: activeKeys.length
  };
}

/**
 * Records interactive practice activity for a local calendar day (songs or future Issue #53 quests).
 * @param {{ type?: 'song' | 'quest', xpEarned?: number, date?: Date }} [options]
 */
function recordPracticeDayActivity({ type = 'song', xpEarned = 0, date = new Date() } = {}) {
  if (!bardProfile.practiceDays || typeof bardProfile.practiceDays !== 'object') {
    bardProfile.practiceDays = {};
  }
  const key = getLocalDateKey(date);
  const prev = bardProfile.practiceDays[key] && typeof bardProfile.practiceDays[key] === 'object'
    ? bardProfile.practiceDays[key]
    : {};
  const songs = Math.max(0, Number(prev.songsCompleted) || 0) + (type === 'song' ? 1 : 0);
  const quests = Math.max(0, Number(prev.questsCompleted) || 0) + (type === 'quest' ? 1 : 0);
  const xp = Math.max(0, Number(prev.xpEarned) || 0) + Math.max(0, Number(xpEarned) || 0);

  bardProfile.practiceDays[key] = {
    practiced: true,
    songsCompleted: songs,
    questsCompleted: quests,
    xpEarned: xp,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Renders the Hearthfire streak pill and the Sunday-start month calendar grid.
 * @param {Date} [referenceDate]
 */
function renderPracticeStreakCalendar(referenceDate = new Date()) {
  const stats = computePracticeStreak(bardProfile.practiceDays, referenceDate);
  const streakLabel = `${stats.currentStreak}-Day Streak`;

  if (menuStreakCount) menuStreakCount.textContent = streakLabel;
  if (streakPopoverCount) streakPopoverCount.textContent = streakLabel;

  if (btnTavernStreakPill) {
    btnTavernStreakPill.classList.toggle('active-streak', stats.currentStreak > 0);
    btnTavernStreakPill.classList.toggle('practiced-today', stats.practicedToday);
  }
  if (tavernStreakPopover) {
    tavernStreakPopover.classList.toggle('active-streak', stats.currentStreak > 0);
  }

  if (menuStreakStatus) {
    if (stats.practicedToday) {
      menuStreakStatus.textContent = 'Hearth lit today';
    } else if (stats.currentStreak > 0) {
      menuStreakStatus.textContent = 'Play today to keep streak!';
    } else {
      menuStreakStatus.textContent = 'Light the hearth today';
    }
  }

  if (streakTodayStatus) {
    streakTodayStatus.classList.toggle('done', stats.practicedToday);
    if (stats.practicedToday) {
      streakTodayStatus.textContent = 'Hearth lit today!';
    } else if (stats.currentStreak > 0) {
      streakTodayStatus.textContent = 'Play 1 song today to keep your flame!';
    } else {
      streakTodayStatus.textContent = 'Complete 1 song today to light the hearth!';
    }
  }

  if (streakBestLabel) {
    streakBestLabel.textContent = `Best: ${stats.longestStreak}d`;
  }

  const curYear = referenceDate.getFullYear();
  const curMonth = referenceDate.getMonth();
  if (streakMonthLabel) {
    streakMonthLabel.textContent = `${STREAK_MONTH_NAMES[streakViewMonth]} ${streakViewYear}`;
  }
  if (btnStreakNextMonth) {
    const isCurrentOrFuture = streakViewYear > curYear || (streakViewYear === curYear && streakViewMonth >= curMonth);
    btnStreakNextMonth.disabled = isCurrentOrFuture;
  }

  if (!streakCalendarGrid) return;
  while (streakCalendarGrid.firstChild) {
    streakCalendarGrid.removeChild(streakCalendarGrid.firstChild);
  }

  const firstDayOfWeek = new Date(streakViewYear, streakViewMonth, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(streakViewYear, streakViewMonth + 1, 0).getDate();
  const todayKey = getLocalDateKey(referenceDate);
  const map = bardProfile.practiceDays || {};

  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'streak-day-cell empty';
    emptyCell.setAttribute('aria-hidden', 'true');
    streakCalendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(streakViewYear, streakViewMonth, day, 12, 0, 0);
    const cellKey = getLocalDateKey(cellDate);
    const practiced = isPracticeDayActive(map[cellKey]);
    const isToday = cellKey === todayKey;
    const isFuture = cellKey > todayKey;

    const cell = document.createElement('div');
    cell.className = 'streak-day-cell';
    cell.setAttribute('role', 'gridcell');
    if (practiced) cell.classList.add('practiced');
    if (isToday) cell.classList.add('today');
    if (isFuture) cell.classList.add('future');
    cell.textContent = String(day);
    cell.setAttribute('aria-label', `${STREAK_MONTH_NAMES[streakViewMonth]} ${day}, ${streakViewYear}: ${practiced ? 'Practiced' : isFuture ? 'Upcoming' : 'Not practiced'}`);
    streakCalendarGrid.appendChild(cell);
  }
}

function openStreakPopover() {
  if (!tavernStreakPopover) return;
  const now = new Date();
  streakViewYear = now.getFullYear();
  streakViewMonth = now.getMonth();
  renderPracticeStreakCalendar(now);
  tavernStreakPopover.classList.remove('hidden');
  if (btnTavernStreakPill) btnTavernStreakPill.setAttribute('aria-expanded', 'true');
}

function closeStreakPopover({ returnFocus = false } = {}) {
  if (!tavernStreakPopover || tavernStreakPopover.classList.contains('hidden')) return;
  tavernStreakPopover.classList.add('hidden');
  if (btnTavernStreakPill) {
    btnTavernStreakPill.setAttribute('aria-expanded', 'false');
    if (returnFocus) btnTavernStreakPill.focus();
  }
}

function toggleStreakPopover() {
  if (!tavernStreakPopover) return;
  if (tavernStreakPopover.classList.contains('hidden')) {
    openStreakPopover();
  } else {
    closeStreakPopover();
  }
}

if (btnTavernStreakPill) {
  btnTavernStreakPill.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleStreakPopover();
  });
  btnTavernStreakPill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  });
}

if (btnCloseStreakPopover) {
  btnCloseStreakPopover.addEventListener('click', (e) => {
    e.stopPropagation();
    closeStreakPopover({ returnFocus: true });
  });
}

if (btnStreakPrevMonth) {
  btnStreakPrevMonth.addEventListener('click', (e) => {
    e.stopPropagation();
    streakViewMonth--;
    if (streakViewMonth < 0) {
      streakViewMonth = 11;
      streakViewYear--;
    }
    renderPracticeStreakCalendar();
  });
}

if (btnStreakNextMonth) {
  btnStreakNextMonth.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    if (streakViewYear > curYear || (streakViewYear === curYear && streakViewMonth >= curMonth)) {
      return;
    }
    streakViewMonth++;
    if (streakViewMonth > 11) {
      streakViewMonth = 0;
      streakViewYear++;
    }
    renderPracticeStreakCalendar(now);
  });
}

if (tavernMainMenu) {
  tavernMainMenu.addEventListener('click', (e) => {
    if (
      tavernStreakPopover &&
      !tavernStreakPopover.classList.contains('hidden') &&
      !tavernStreakPopover.contains(e.target) &&
      !(btnTavernStreakPill && btnTavernStreakPill.contains(e.target))
    ) {
      closeStreakPopover();
    }
  });
}

// ============================================================================
// ISSUE #53: DAILY QUEST SYSTEM (TAVERN BOUNTIES)
// ============================================================================

const DAILY_BOUNTY_SLOTS = [
  // Slot 0: Song Completion / Mode
  [
    { id: 'play_any_1', title: 'Tavern Encore', desc: 'Complete 1 song in any interactive mode', metric: 'songs', target: 1, xpReward: 100 },
    { id: 'play_arcade_1', title: 'Arcade Troubadour', desc: 'Finish 1 song in Arcade Mode', metric: 'arcade_songs', target: 1, xpReward: 125 },
    { id: 'play_wait_1', title: 'Methodical Maestro', desc: 'Finish 1 song in Wait Mode', metric: 'wait_songs', target: 1, xpReward: 125 }
  ],
  // Slot 1: Precision / Combo
  [
    { id: 'chain_20', title: 'Unbroken Cadence', desc: 'Reach a 20+ Spell Chain in a song', metric: 'max_chain', target: 20, xpReward: 120 },
    { id: 'accuracy_80', title: 'Silver-Tongued Bard', desc: 'Finish a song with 80%+ accuracy', metric: 'accuracy_80', target: 1, xpReward: 130 },
    { id: 'chord_rolls_3', title: 'Smooth Voicings', desc: 'Land 3+ clean 100ms Chord Rolls', metric: 'chord_rolls', target: 3, xpReward: 120 }
  ],
  // Slot 2: Volume / Endurance
  [
    { id: 'clean_notes_60', title: 'Nimble Fingers', desc: 'Hit 60 clean notes across today\'s runs', metric: 'clean_notes', target: 60, xpReward: 140 },
    { id: 'play_any_2', title: 'Double Bill', desc: 'Complete 2 songs in interactive modes today', metric: 'songs', target: 2, xpReward: 160 },
    { id: 'xp_earn_200', title: 'Apprentice\'s Tithe', desc: 'Earn 200+ Song XP across today\'s runs', metric: 'xp_earned', target: 200, xpReward: 150 }
  ]
];

function hashDateKeyForBounty(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h * 31) + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Ensures bardProfile.dailyQuests holds 3 valid quests for the current local calendar day.
 * @param {Date} [referenceDate]
 */
function ensureDailyQuestsForToday(referenceDate = new Date()) {
  const todayKey = getLocalDateKey(referenceDate);
  const existing = bardProfile.dailyQuests;
  if (
    existing &&
    existing.dateKey === todayKey &&
    Array.isArray(existing.quests) &&
    existing.quests.length === 3
  ) {
    return existing;
  }

  const seed = hashDateKeyForBounty(todayKey);
  const quests = DAILY_BOUNTY_SLOTS.map((slotPool, slotIdx) => {
    const template = slotPool[(seed + slotIdx) % slotPool.length];
    return {
      slot: slotIdx,
      id: template.id,
      title: template.title,
      desc: template.desc,
      metric: template.metric,
      target: template.target,
      xpReward: template.xpReward,
      progress: 0,
      completed: false,
      claimed: false
    };
  });

  bardProfile.dailyQuests = {
    dateKey: todayKey,
    rerollsRemaining: 1,
    quests
  };
  return bardProfile.dailyQuests;
}

/**
 * Updates today's Daily Bounties after an interactive song completion and auto-claims XP.
 */
function updateDailyQuestsOnSongComplete({
  waitMode = false,
  accuracyPct = 0,
  maxChain = 0,
  cleanNotesHit = 0,
  cleanChordRolls = 0,
  xpEarned = 0,
  date = new Date()
} = {}) {
  const daily = ensureDailyQuestsForToday(date);
  const newlyCompletedQuests = [];
  let totalBonusXp = 0;

  for (const q of daily.quests) {
    if (q.completed) continue;

    switch (q.metric) {
      case 'songs':
        q.progress = Math.min(q.target, (Number(q.progress) || 0) + 1);
        break;
      case 'arcade_songs':
        if (!waitMode) q.progress = Math.min(q.target, (Number(q.progress) || 0) + 1);
        break;
      case 'wait_songs':
        if (waitMode) q.progress = Math.min(q.target, (Number(q.progress) || 0) + 1);
        break;
      case 'max_chain':
        q.progress = Math.min(q.target, Math.max(Number(q.progress) || 0, maxChain));
        break;
      case 'accuracy_80':
        if (accuracyPct >= 80) q.progress = 1;
        break;
      case 'chord_rolls':
        q.progress = Math.min(q.target, (Number(q.progress) || 0) + cleanChordRolls);
        break;
      case 'clean_notes':
        q.progress = Math.min(q.target, (Number(q.progress) || 0) + cleanNotesHit);
        break;
      case 'xp_earned':
        q.progress = Math.min(q.target, (Number(q.progress) || 0) + xpEarned);
        break;
      default:
        break;
    }

    if (q.progress >= q.target) {
      q.completed = true;
      if (!q.claimed) {
        q.claimed = true;
        totalBonusXp += q.xpReward;
        newlyCompletedQuests.push({ ...q });
      }
    }
  }

  if (totalBonusXp > 0) {
    bardProfile.totalXp += totalBonusXp;
    recomputeBardLevelFromTotalXp();
    recordPracticeDayActivity({ type: 'quest', xpEarned: totalBonusXp, date });
  }

  return { newlyCompletedQuests, totalBonusXp };
}

/**
 * Swaps one incomplete Daily Bounty using the 1/day free reroll.
 * @param {Date} [referenceDate]
 * @returns {boolean}
 */
function rerollDailyBounty(referenceDate = new Date()) {
  const daily = ensureDailyQuestsForToday(referenceDate);
  if ((Number(daily.rerollsRemaining) || 0) <= 0) return false;

  const targetIdx = daily.quests.findIndex((q) => !q.completed);
  if (targetIdx === -1) return false;

  const current = daily.quests[targetIdx];
  const slotIdx = typeof current.slot === 'number' ? current.slot : targetIdx;
  const pool = DAILY_BOUNTY_SLOTS[slotIdx] || DAILY_BOUNTY_SLOTS[0];
  const candidates = pool.filter((t) => t.id !== current.id);
  if (candidates.length === 0) return false;

  const next = candidates[0];
  daily.quests[targetIdx] = {
    slot: slotIdx,
    id: next.id,
    title: next.title,
    desc: next.desc,
    metric: next.metric,
    target: next.target,
    xpReward: next.xpReward,
    progress: 0,
    completed: false,
    claimed: false
  };
  daily.rerollsRemaining = Math.max(0, (Number(daily.rerollsRemaining) || 0) - 1);

  saveBardProfile();
  renderDailyBountiesBoard(referenceDate);
  renderDailyBountyStationSummary(referenceDate);
  return true;
}

function renderDailyBountyStationSummary(referenceDate = new Date()) {
  const daily = ensureDailyQuestsForToday(referenceDate);
  const doneCount = daily.quests.filter((q) => q.completed).length;
  const totalCount = daily.quests.length;
  const remainingXp = daily.quests
    .filter((q) => !q.completed)
    .reduce((sum, q) => sum + (Number(q.xpReward) || 0), 0);

  if (menuDailyBountySummary) {
    if (doneCount === totalCount) {
      menuDailyBountySummary.textContent = `${doneCount}/${totalCount} Bounties Complete! • Transcriber`;
    } else {
      menuDailyBountySummary.textContent = `${doneCount}/${totalCount} Bounties • +${remainingXp} XP left`;
    }
  }
  if (btnMenuQuestBoard) {
    btnMenuQuestBoard.classList.toggle('bounties-all-done', doneCount === totalCount);
  }
}

function renderDailyBountiesBoard(referenceDate = new Date()) {
  const daily = ensureDailyQuestsForToday(referenceDate);
  const doneCount = daily.quests.filter((q) => q.completed).length;
  const totalCount = daily.quests.length;

  if (dailyBountiesProgressPill) {
    dailyBountiesProgressPill.textContent = `${doneCount} / ${totalCount} Complete`;
    dailyBountiesProgressPill.className = `quest-stage-pill ${doneCount === totalCount ? 'stage-done' : 'stage-idle'}`;
  }

  if (btnRerollDailyBounty) {
    const left = Math.max(0, Number(daily.rerollsRemaining) || 0);
    const hasIncomplete = doneCount < totalCount;
    btnRerollDailyBounty.disabled = left <= 0 || !hasIncomplete;
    btnRerollDailyBounty.textContent = left > 0
      ? `🎲 Reroll (${left} left)`
      : '🎲 Reroll Used';
  }

  if (!dailyBountiesList) return;
  while (dailyBountiesList.firstChild) {
    dailyBountiesList.removeChild(dailyBountiesList.firstChild);
  }

  for (const q of daily.quests) {
    const card = document.createElement('div');
    card.className = `daily-bounty-card${q.completed ? ' completed' : ''}`;

    const top = document.createElement('div');
    top.className = 'bounty-card-top';

    const titleEl = document.createElement('strong');
    titleEl.className = 'bounty-title';
    titleEl.textContent = q.title;

    const xpEl = document.createElement('span');
    xpEl.className = 'bounty-xp-badge';
    xpEl.textContent = q.completed ? `✓ +${q.xpReward} XP` : `+${q.xpReward} XP`;

    top.appendChild(titleEl);
    top.appendChild(xpEl);

    const descEl = document.createElement('div');
    descEl.className = 'bounty-desc';
    descEl.textContent = q.desc;

    const progWrap = document.createElement('div');
    progWrap.className = 'bounty-progress-row';

    const meta = document.createElement('div');
    meta.className = 'bounty-progress-meta';
    const pct = q.target > 0 ? Math.min(100, Math.round(((Number(q.progress) || 0) / q.target) * 100)) : 0;

    const countSpan = document.createElement('span');
    countSpan.textContent = `${Math.min(q.target, Number(q.progress) || 0)} / ${q.target}`;
    const stateSpan = document.createElement('span');
    stateSpan.textContent = q.completed ? 'Claimed' : `${pct}%`;

    meta.appendChild(countSpan);
    meta.appendChild(stateSpan);

    const track = document.createElement('div');
    track.className = 'bounty-progress-track';
    const fill = document.createElement('div');
    fill.className = 'bounty-progress-fill';
    fill.style.width = `${q.completed ? 100 : pct}%`;
    track.appendChild(fill);

    progWrap.appendChild(meta);
    progWrap.appendChild(track);

    card.appendChild(top);
    card.appendChild(descEl);
    card.appendChild(progWrap);
    dailyBountiesList.appendChild(card);
  }
}

if (btnRerollDailyBounty) {
  btnRerollDailyBounty.addEventListener('click', () => {
    rerollDailyBounty();
  });
}

// Boot Application & Start 60 FPS Spell Highway Loop
const tavernVersionTag = document.getElementById('tavern-version-tag');
if (tavernVersionTag) {
  try {
    const pkg = require('./package.json');
    tavernVersionTag.textContent = `College of Keys v${pkg.version}`;
  } catch {
    tavernVersionTag.textContent = 'College of Keys';
  }
}

computeKeyGeometry();
loadBardProfile();
initGrimoireAndWatcher();
initAudioEngine();
initWebMIDI();
// Restore the last performed song first; fall back to workspace auto-load / demo (Issue #67)
if (!restoreLastSong()) {
  tryAutoLoadWorkspaceMidi();
}
showTavernMenu();
requestAnimationFrame(animationLoop);

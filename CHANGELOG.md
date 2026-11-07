# Changelog

All notable changes, phase completions, and architectural updates to **College of Keys** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]
- Future Expansion Backlog ("The Full Adventuring Party": Vocals / Spell-Singing, 4-Stem Demucs Separation, and Grand-Staff Sheet Music Split View).

---

## [1.0.0] - 2026-11-07 — First Official Release (Complete 9-Phase MVP + Code Review Remediation)

### Added & Changed
- **First Official Release (`v1.0.0`):** Packaged standalone Windows x64 desktop build (`College of Keys.exe`) combining all 9 verified MVP phases and post-MVP code review polish.
- **Unobstructed Spell Highway & Live On-Key QWERTY Octave Indicator (`index.html`, `styles.css`, `renderer.js`):**
  - Removed the floating `#phase1-helper-banner` instruction overlay so the 60 FPS Spell Highway canvas is 100% unobstructed.
  - Added a top-header **`QWERTY: C4–E5`** status pill (`#qwerty-pill`) with `Z ◀` and `▶ X` octave buttons, capture-phase `KeyZ`/`KeyX` handling, and on-key `[A]`–`[;]` labels + gold range bar on the 61-key piano that visibly slide across octaves (`C2–E3` $\leftrightarrow$ `C6–C7`) with floating canvas runes when shifting.

### Fixed (`Fixes #1–#8`)
- **Issue #1 (`H1`):** Preserved `playbackState.activeStrikeGroup` across frames in Arcade Mode (`Wait Mode: OFF`) until `proposedTime > anchorTime + 0.18s` so 100ms chord roll forgiveness works in Arcade Mode as well as Wait Mode.
- **Issue #2 (`H2`):** Added live `#qwerty-octave-label` HUD pill + on-key QWERTY range indicator and floating canvas rune feedback when pressing `Z`/`X` to shift octaves.
- **Issue #3 (`H3`):** Updated global `keydown` handler (capture phase) and control `.blur()` handlers so `Spacebar` (Play/Pause), `Z`/`X`, and QWERTY keys continue working immediately after adjusting sliders or dropdowns.
- **Issue #4 (`M1`):** Paused synchronous `1.8s` background directory polling (`scanWatchedDirectories`) while `playbackState.isPlaying === true` to prevent Google Drive metadata sync hitches during 60 FPS gameplay.
- **Issue #5 (`M2`):** Cached canvas dimensions (`cachedCanvasWidth`, `cachedCanvasHeight`) and pre-allocated shared vertical `CanvasGradient` objects (`cachedKeyGradients`) in `computeKeyGeometry()`, eliminating `3,660` per-second `CanvasGradient` allocations and per-frame `getBoundingClientRect()` layout reads in `renderCanvas()`.
- **Issue #6 (`M3`):** Unified `extractGrimoireEntryFromBuffer()` with `assignSongTracksAndDifficulty('auto-piano')` (`isPianoCandidateTrack`, `areTracksDuplicates`, Treble+Bass pairing, and `activeDuration`) so Grimoire cards and the Spell Inspector HUD report identical note counts and NPS.
- **Issue #7 (`M4`):** Connected `backingAudioEl.volume` dynamically to the `#master-volume` dB slider (`getBackingAudioVolumeFromSlider()`) and updated `removeGrimoireEntry()` to unlink paired `.wav`/`.mp3` backing audio files when deleting an imported spell.
- **Issue #8 (`L2` & `L3`):** Restricted Electron `setPermissionRequestHandler` / `setPermissionCheckHandler` in `main.js` to `['midi', 'midiSysex', 'media']` and bumped `package.json` version to `1.0.0`.

---

## [0.9.0] - 2026-11-06 — Phase 9: "The Quest Board" (In-App YouTube-to-MIDI Sourcing & External Archive Quick-Links)

### Added
- **In-App Quest Board Modal & Toolbar Trigger (`index.html`, `styles.css`, `renderer.js`):**
  - Added `🔮 Quest Board` button (`#btn-open-quest-board`) in the top Spell Scroll Bar and built the `#quest-board-modal` dialog.
  - Added YouTube URL / local audio path input (`#quest-youtube-url`), optional custom spell title (`#quest-custom-title`), `🔮 Transcribe YouTube Spell` button, and a 1-click `⚡ Run ML Self-Test (2s)` button.
  - Added `runQuestBoardTranscriber()` using `child_process.spawn` to run `python_ml/transcribe_quest.py` in the background, parsing `[QUEST_STATUS]` JSON lines into an animated progress bar (`#quest-progress-fill`), live stage badge (`#quest-status-badge`), console log (`#quest-log-output`), automatic `./Imports/` Grimoire ingestion, and a 1-click `▶ Load "<Title>" Now` button (`#btn-quest-load-result`).
- **Synced Backing Audio Playback (`renderer.js`):**
  - Paired `.wav`/`.mp3`/`.ogg`/`.m4a` backing tracks in `./Imports/` now synchronize and play automatically when **`🎸 Backing Band: ON`** is enabled.
- **External Bardic Archive Quick-Links (`renderer.js`):**
  - Added 1-click cards in The Quest Board that open the system's default browser (`electron.shell.openExternal`) to **BitMIDI** (`https://bitmidi.com`), **VGMusic** (`https://www.vgmusic.com`), and **YouTube** (`https://www.youtube.com`).

---

## [0.8.0] - 2026-11-06 — Phase 8: Decoupled Python ML Pipeline (`yt-dlp` + `basic-pitch` / Polyphonic Audio-to-MIDI CLI)

### Added
- **Standalone Python ML Extraction Pipeline (`python_ml/transcribe_quest.py`, `python_ml/requirements.txt`):**
  - Added decoupled CLI supporting YouTube URLs (`yt-dlp`), local audio files (`.wav`/`.mp3`/`.flac`), and `--self-test` mode, outputting both `.mid` spell scrolls and synced `.wav` backing audio directly into `./Imports/`.
  - Implemented 2-tier polyphonic audio-to-MIDI transcription: uses Spotify `basic-pitch` (`basic_pitch.inference.predict_and_save`) when available, and seamlessly falls back to a built-in polyphonic spectral harmonic transcriber (`transcribe_wav_polyphonic`) + pure-Python SMF Format 1 `.mid` writer (`write_multi_track_midi`) for native Python 3.14 support.
  - Emits structured `[QUEST_STATUS] {...}` JSON progress updates on `stdout` for Phase 9's in-app Quest Board.
- **Windows Batch Launchers & Documentation (`python_ml/setup_ml_env.bat`, `python_ml/run_transcriber.bat`, `python_ml/README.md`):**
  - Added 1-click setup (`setup_ml_env.bat`) and CLI runner (`run_transcriber.bat`) that auto-detect the local Python 3.14 installation (`%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe`).

---

## [0.7.0] - 2026-11-06 — Phase 7: UI Polish & Arcane Strike-Line Particle Bursts

### Added
- **60 FPS Strike-Line Particle Bursts, Shockwaves & Floating XP Runes (`renderer.js`):**
  - Added `spawnKeyParticleBurst()`, `spawnFloatingCanvasRune()`, and `updateAndDrawStrikeParticles()` rendering 4-point arcane star runes, diamonds, glowing orbs, expanding elliptical shockwave rings, and rising `+XP` / `⚡ ROLL!` text at the strike line on every note hit and free-play key press.
  - Added dynamic particle color palettes for **Track 1 (Radiant Gold)**, **Track 2 (Eldritch Blue)**, **100ms Clean Chord Rolls (Emerald-Gold Nova)**, and **50+ Bardic Inspiration (Astral Magenta & Gold)**, plus subtle shimmer bursts on auto-played accompaniment notes.
  - Added `updateAndDrawAmbientMotes()` rendering 28 gently drifting golden and cyan arcane dust motes across the Spell Highway backdrop.
- **Tavern Dark Mode Visual Polish (`styles.css`, `index.html`):**
  - Added `@keyframes arcaneCrestPulse` and `@keyframes inspirationAuraPulse`, stage vignette depth shadowing, and illuminated brass/gold header and button treatments.

---

## [0.6.0] - 2026-11-06 — Phase 6: The Grimoire (Local Song Library & `Imports/` Folder Watcher)

### Added
- **The Grimoire Spellbook Sidebar (`index.html`, `styles.css`, `renderer.js`):**
  - Added collapsible left-hand `#grimoire-sidebar` (`📖 The Grimoire`) with dynamic 61-key canvas resizing (`computeKeyGeometry`), title search (`#grimoire-search-input`), and D&D Spell Level filter (`#grimoire-filter-select`).
  - Renders interactive Spell Cards showing Title, Spell Level badge, XP multiplier, NPS, BPM, Duration, and Source tag (`Imports/`, `Test Library`, `Built-In`), with 1-click loading onto the Spell Highway.
- **Active `./Imports` Folder Watcher & Local Persistence (`renderer.js`):**
  - Automatically creates and watches `./Imports/` using `fs.watch` paired with a `1.8s` directory scanner (`scanWatchedDirectories`) for 100% reliability on virtual/cloud drives, plus auto-detects paired backing audio files (`.mp3`/`.wav`/`.ogg`/`.m4a`).
  - Added `💾 Save Active Spell to Grimoire`, `📂 Open Imports/` (opens folder in Windows Explorer via `electron.shell.openPath`), and a 1-click **`⚡ Drop Test .mid in Imports/`** helper (`dropTestMidiIntoImports`) that writes fresh playable D&D Bard `.mid` scrolls directly into `./Imports/` to verify real-time watcher ingestion and `#grimoire-toast` notifications.

---

## [0.5.0] - 2026-11-06 — Phase 5: LitRPG Gamification UI (Combos, Bardic Inspiration, XP & Titles)

### Added
- **LitRPG Bardic Progression & Spell Chain HUD (`index.html`, `styles.css`, `renderer.js`):**
  - Added floating top-right `#litrpg-hud-card` displaying **Bardic Level (`LVL 1+`)**, **Bardic Title** (*Tavern Busker* $\rightarrow$ *College Initiate* $\rightarrow$ *Wandering Minstrel* $\rightarrow$ *Court Virtuoso* $\rightarrow$ *Spell-Singer* $\rightarrow$ *Grand Maestro*), **Total Career XP**, animated **Level XP Bar** (`1,000 XP` at Level 1 scaling `1.5x` per level), **Spell Chain** combo counter, and **Effective XP Multiplier**.
- **LitRPG XP & Bardic Inspiration Engine (`renderer.js`):**
  - Implemented exact PRD XP formula: `+10 XP` base per clean note, or `+2 XP` base ("Fumbled Component") when paused `> 2.0s` in Wait Mode, multiplied by the Spell Level difficulty multiplier (`1.0x`–`2.0x`) and **Bardic Inspiration (`2.0x` at `50+` Spell Chain)**.
  - Added **Bardic Inspiration (`50+` Streak)** visual glow on both the HUD card and the canvas Strike Zone line, plus a `+25 Chain` mini testing button on the HUD card.
  - Added dual persistence (`localStorage` + local `bard_profile.json`) so XP, Level, Title, and Career Best Chain persist across sessions.
- **Post-Song "Performance Check" Modal (`#performance-check-modal`):**
  - Automatically opens when a song finishes (or anytime via the `🏆 Performance Check` toolbar button), presenting a D&D 5E D20 Performance Roll (`1–20`), Level-Up celebration banner, XP bar, and 6-stat breakdown (Song XP, Accuracy %, Max Spell Chain, Clean Notes, Fumbled Notes, and 100ms Chord Rolls).

---

## [0.4.0] - 2026-11-06 — Phase 4: Wait Mode & 100ms Chord Forgiveness ("The Roll")

### Added
- **Wait Mode Engine & Strike-Zone Collision Gating (`renderer.js`, `index.html`, `styles.css`):**
  - Added `⏳ Wait Mode: ON / OFF` toggle button in the transport bar (`ON` by default for practice).
  - Implemented onset-based chord clustering (`CHORD_CLUSTER_WINDOW_SEC = 0.045s`) so `currentSongTime` freezes strictly at the next unplayed note or chord onset (`getNextPlayerChordGate`) without forcing the player to re-strike already-sustained notes.
  - Added auto-switching from `Auto-Play Both (Preview)` to `Auto-Play Other Hand` when Wait Mode is toggled ON so the player actively controls their chosen hand(s).
- **100ms Chord Roll Forgiveness (`CHORD_GRACE_PERIOD_MS = 100ms`):**
  - Tracks `firstHitPerfMs` and `lastRollDeltaMs` across multi-note chords (`processWaitModeNoteInput`), rewarding chords rolled within the `100ms` human grace window (`⚡ Clean 100ms Roll!`) while locking already-struck notes (`satisfiedPitches`) in **Emerald Green (`#4ade80`)** on both the falling glyphs and the 61-key strike line.
  - Tracks Wait Mode pause duration (`> 2.0s` `Fumbled Component` threshold) and displays real-time chord prompts (`⏳ Waiting: ...`) in the `#strike-zone-status` HUD pill.

---

## [0.3.0] - 2026-11-06 — Phase 3: The Spell Highway (60 FPS), Accompaniment & Backing Band

### Added
- **60 FPS Falling Spell Highway (`renderer.js`):**
  - Implemented `requestAnimationFrame(animationLoop)` driving continuous falling note interpolation ($y = \text{strikeLineY} - (\text{noteTime} - \text{currentTime}) \times \text{fallSpeed}$).
  - Rendered **Track 1 (Right Hand / Lead)** in glowing **Radiant Gold (`#ffd700`)** and **Track 2 (Left Hand / Accompaniment)** in glowing **Eldritch Blue (`#00e5ff`)**, with scrolling measure/beat grid lines, note-name labels inside glyphs, and live strike-line key guide highlights on the 61-key piano.
- **Transport, Tempo & Timeline Scrubber (`index.html`, `styles.css`, `renderer.js`):**
  - Added `▶ Cast Spell` / `⏸ Pause` button (with `Spacebar` shortcut), `⏮ Restart`, interactive timeline scrubber (`#song-progress-slider`), practice tempo selector (`0.5x`, `0.75x`, `1.0x`, `1.25x`), and note fall speed selector (`Slow`, `Normal`, `Fast`).
  - Added automatic detection and loading of any `.mid` test file in the project root on startup.
- **Hand Isolation & Accompaniment Routing (`renderer.js`):**
  - Added `Hands` selector (`Both (T1 Gold + T2 Blue)`, `Track 1 Only (RH Gold)`, `Track 2 Only (LH Blue)`).
  - Added `Accompaniment` selector (`Auto-Play Other Hand`, `Mute Other Hand`, `Auto-Play Both (Preview)`) so `Tone.Sampler` automatically plays the unselected hand (or both hands in preview mode) as notes cross the strike line.
- **Rock Band-Style Backing Band Toggle (`renderer.js`):**
  - Added `🎸 Backing Band: ON / OFF` button and a dedicated 24-voice `backingBandSynth` (`Tone.PolySynth`) that synthesizes non-piano MIDI backing tracks in sync with the highway or mutes them for solo piano practice.

### Fixed
- **Duplicate MIDI Track Deduplication & Treble/Bass Hand Pairing (`renderer.js`):**
  - Many GM/karaoke `.mid` files (such as `John_Legend_All_Of_Me.mid`) duplicate the Right Hand (`856` notes) and Left Hand (`222` notes) onto a second MIDI channel for volume, which previously caused both `T1 (RH)` and `T2 (LH)` to select the two identical `856`-note Right Hand tracks and draw Gold directly over Blue.
  - Added `areTracksDuplicates()` detection and register-aware Treble (`avgPitch >= 62`) + Bass (`avgPitch < 62`) piano track pairing so `T1 (RH Gold)` loads the `856`-note Right Hand and `T2 (LH Blue)` loads the `222`-note Left Hand.

---

## [0.2.0] - 2026-11-06 — Phase 2: MIDI Parsing, 61-Key Octave Folding & Auto-Difficulty

### Added
- **Local `.mid` File Upload, Drag-and-Drop & Built-in Demo Spell (`index.html`, `renderer.js`, `styles.css`):**
  - Added the **Spell Scroll Bar** with `Load MIDI Spell (.mid)`, full-window drag-and-drop `.mid` support, and a 1-click `Load Demo Spell` button (*Ballad of the Silver Flagon.mid*).
- **Non-Destructive Multi-Track MIDI Parser (`renderer.js`):**
  - Integrated `@tonejs/midi` (`parseMidiBuffer`) to extract tempo (BPM), time signature, duration, and all active tracks.
  - Added automatic Piano Track candidate detection (pairing Right Hand `Track 1` in Radiant Gold and Left Hand `Track 2` in Eldritch Blue, or splitting single-track files at Middle C `MIDI 60`).
  - Added a **Highway Track Selector Dropdown** allowing any track in a multi-track MIDI file to be played on the 61-key highway while preserving all remaining tracks as `backingBandTracks` for Phase 3's Rock Band play-along mode.
- **61-Key Octave Folding Engine (`foldMidiNoteDetails`):**
  - Automatically transposes any note `< C2` (`MIDI 36`) up by `+12` semitones and any note `> C7` (`MIDI 96`) down by `-12` semitones until all playable notes fit `[36, 96]`, tracking total folded note count in the HUD.
- **D&D 5E Spell Level Auto-Difficulty (`calculateSpellDifficulty`):**
  - Computes Notes Per Second (`NPS`) across playable tracks and assigns D&D 5E Spell Level badges and XP multipliers (`Cantrip 1.0x`, `2nd-Level Spell 1.2x`, `5th-Level Spell 1.5x`, `9th-Level Spell 2.0x`).
- **Static Canvas Spell Preview (`drawStaticParsedNotesPreview`):**
  - Renders a color-coded preview of the parsed and octave-folded notes above the 61-key piano (`Track 1` = Radiant Gold, `Track 2` = Eldritch Blue, purple trim on octave-folded notes).

### Fixed
- **Upper-Register Grand Piano Warmth (`renderer.js`):**
  - Added a 3-band EQ (`Tone.EQ3`: `+2.5 dB` warm low-body below `260 Hz`, `-8.5 dB` high-shelf cut above `2.2 kHz`), a `3.1 kHz` `-12 dB/oct` low-pass filter (`Tone.Filter`), and progressive upper-register hammer velocity scaling above `C4` (`MIDI 60`) to eliminate shrillness on `C5`–`C7` keys.

---

## [0.1.0] - 2026-11-06 — Phase 1: Electron Skeleton & Audio

### Added
- **Electron Application Shell (`main.js`, `package.json`, `start.bat`):**
  - Configured the `1440x900` Tavern Dark Mode desktop window.
  - Added automatic Chromium permission handlers (`setPermissionRequestHandler` & `setPermissionCheckHandler`) for `midi` and `midiSysex` so Web MIDI controllers connect without browser prompts.
  - Added `start.bat` launcher that clears `ELECTRON_RUN_AS_NODE` for reliable launching from any terminal or IDE.
- **61-Key Arcane Piano Canvas (`renderer.js`):**
  - Built pixel-accurate 61-key layout (`C2` / MIDI 36 through `C7` / MIDI 96: 36 white keys and 25 black keys) on a responsive HTML5 Canvas (`#spell-canvas`).
  - Created shared `keyGeometry[36..96]` lookup table for both keyboard rendering and upcoming Phase 3 falling notes.
  - Added Radiant Gold key-press glow, octave labels (`C2`–`C7`), strike-line glow separator, and vertical octave lane guides.
- **Native Web MIDI + Mouse/QWERTY Input (`renderer.js`):**
  - Integrated `navigator.requestMIDIAccess()` with real-time hot-plug detection (`onstatechange`) and a manual Rescan MIDI button (`↻`).
  - Added explicit handling for both `0x80` (`NoteOff`) and `0x90` (`NoteOn`) with `velocity === 0` to prevent stuck keys on physical 61-key controllers.
  - Added physical Sustain Pedal (`CC 64` / `0xB0`) support.
  - Added Mouse click/drag key playing and QWERTY keyboard fallback (`A`–`;` white keys, `W`–`P` black keys, `Z`/`X` octave shift).
- **Zero-Latency Sampled Grand Piano & Polyphonic Audio Engine (`renderer.js`, `vendor/Tone.js`, `assets/samples/piano/`):**
  - Integrated `Tone.Sampler` backed by 22 local Yamaha C5 Salamander Grand Piano multi-samples (`A1`–`C7`) for an authentic acoustic **Tavern Grand Piano** tone, with `Tone.context.lookAhead = 0` for `<10ms` live response.
  - Added 3 additional FM/AM/Additive synth presets (*Arcane Lute-Harp*, *Cathedral Pipe Organ*, *Eldritch Warm Pad*) and Master Volume control.
- **Project Documentation & Tracking (`README.md`, `CHANGELOG.md`, `Gemini.md`, `context.md`, `progress.md`, `.gitignore`):**
  - Documented the 9-phase MVP roadmap, Rock Band-style Backing Band play-along architecture, open-source piano trainer benchmarks (`MIDIano`, `Sightread`, `Tone.js`, `basic-pitch`), and Post-Phase 9 Backlog.

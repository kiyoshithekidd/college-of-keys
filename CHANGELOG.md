# Changelog

All notable changes, phase completions, and architectural updates to **College of Keys** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Issue #39: Epic C — Scrolling Grand-Staff Sheet Music Split View:**
  - Added `notation-engine.js` powered by `vexflow` (`^5.0.0`) and `@vexflow-fonts/bravura` (`^1.0.2`, bundled locally via `@font-face` in `styles.css`): renders Warm Grimoire Parchment (`#f4ebd9` + `./assets/images/notation/parchment-scroll-tile.png`), sticky left clef/key signature gutter (`getOrRenderStickyGutter()`), 30-tile LRU offscreen canvas cache, monotonic `tickToScoreX()` playhead tracking, Wax-Seal Crimson `#9f1239` playhead, multi-tempo/time-signature maps, key-signature normalization (`fromMidiMeta` minor key fix + Krumhansl fallback) with courtesy cancellation naturals on modulation, binary (16th) + triplet (8th tuplet) beat solving, cross-bar `StaveTie` arcs, `8↑`/`8↓` octave-fold tags, Rehearsal Loop `A–B` ribbon, and RH/LH/Wait-locked (`#065f46`)/overdue (`>2.0s` `#b91c1c` pulsing ring) highlights.
  - Added Bar 2 `#view-mode-segmented` ARIA `radiogroup` (`Highway | Split | Score`) with `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` navigation, unmodified `1`/`2`/`3` hotkeys (guarded when modals, text inputs, `<select>`, or the Tavern Menu are open), and strict `'highway'` boot default (`setStageViewMode('highway')`).
  - Integrated Score mode `collectOnly` strike-line key guides in `drawFallingSpellHighway()`, `#notation-wait-pill` overlay (`syncNotationWaitOverlayPill()`), non-blocking `#notation-quality-banner` (`assessNotationQuality()`, suppressed on MusicXML) with 1-click Smart MIDI Hygiene cleanup or Highway switch, and single-row Bar 2 responsive breakpoints down to `1024px`.

- **Issue #76: Grimoire Song Bundle (Sheet Music + MIDI + Backing Audio Sync) & Smart MIDI Hygiene:**
  - Added `midi-hygiene.js` (`isUtilityTrack()`, `isLeadMelodyTrack()`, `isPianoCandidateTrackSmart()`, `selectAutoPianoTracks()`, `cleanPlayableHandNotes()`): excludes DAW utility/SFX tracks (`Chords`, `Markers`, `Click`), elevates Lead Melody + warm accompaniment over sparse late-song piano fills in GM band MIDIs, safely skips empty/percussion fallback tracks, and non-destructively snaps micro-jittered chord onsets (`<= 26ms`), strips transient ghost glitches (`< 80ms`, `velocity < 48`), caps `> 4`-note GM octave slabs (preserving top melody on RH, root bass on LH, and unique pitch classes), and trims runaway pedal sustains (`> 6.0s`).
  - Added global and per-song Smart MIDI Hygiene toggling via `#toggle-midi-cleanup` and `#stat-cleaned-chip` without writing extraneous sidecars when unbundled songs follow the global preference.
  - Added `song-bundle.js` and dual persistence (`grimoire_bundles.json` + portable `<Base>.bundle.json` sidecars) linking Playable Notes (`.mid`/`.musicxml`/`.mxl`), Sheet Music Reference (`.musicxml`/`.pdf` in `./Imports/Sheets`), Backing Audio (`.wav`/`.mp3`/`.m4a`/`.ogg`/`.flac`), YouTube/Spotify bookmark URLs, explicit `audioUnlinked`/`sheetUnlinked` suppression flags, and per-song sync/hygiene calibration with strict path-first & `BUILTIN_DEMO` isolation.
  - Extended `python_ml/transcribe_quest.py` with `--audio-only` (`yt-dlp` clean stereo backing audio extraction without Basic Pitch ML synthesis), virtualenv-aware `resolvePythonExecutable()`, and Windows `taskkill /t /f` child-tree termination on unload.
  - Added 2-tab **The Quest Board** (`#btn-quest-tab-bundle` / `#btn-quest-tab-transcribe`) with collapsible Today's Tavern Bounties (`#btn-toggle-quest-bounties`), a Clean Song Bundle Builder (pre-validating notes files prior to YouTube downloads, preventing cross-song asset collisions, and supporting direct Spellbook edit prefill via `#btn-spellbook-bundle`), and WAI-ARIA `ArrowLeft`/`ArrowRight`/`Home`/`End` tab navigation.
  - Added contextual **Backing Audio Sync Calibrator** (`#btn-audio-sync`, `#audio-sync-popover`, `#btn-settings-open-sync`) in Bar 2 with Start Offset steppers (`-50ms`/`-10ms`/`+10ms`/`+50ms`), 1-tap **Audition 0:00** & **Mark Beat 1**, Web Audio RMS **Auto-Align** onset detection, and **Audio Drift Match** (`95.0%`–`105.0%`) synced cleanly in `animationLoop()`.

### Changed
- **Issue #76: Bar 2 Responsiveness, Quest Board 2-Tab Layout & Accessibility Polish:**
  - Refined `#spell-scroll-bar` responsive breakpoints (`@media (max-width: 1460px)` and `1120px` in `styles.css`) so `#audio-sync-anchor` and `.spell-title-group` remain readable alongside transport and Rehearsal Loop controls.
  - Updated `#grimoire-spellbook-modal` details panel with bundle indicators, Sheet Reference quick-open (`#btn-spellbook-open-sheet`), YouTube/Spotify external reference links, and 1-click `#btn-spellbook-bundle` editing.
  - Added missing `aria-label` attributes to icon close/clear buttons, `returnFocus` restoration on Conservatory popover dismissal, `closeStreakPopover()` coordination across modals, and visible-only `Tab` focus trapping.

### Added
- **Issue #40: MusicXML Import to MIDI (`.musicxml`, `.xml`, `.mxl`):**
  - Added pure-JS `musicxml-converter.js` (0 external runtime deps, using `@tonejs/midi` + Node `zlib.inflateRawSync` for compressed `.mxl` ZIP archives via `META-INF/container.xml`).
  - Supports `<score-partwise>` and `<score-timewise>`, Grand Staff `<staff>1` (Right Hand Gold) & `<staff>2` (Left Hand Blue) mapping, extra pitched parts routed to Backing Band (`#playable-track-select`), score-synchronized `<repeat>` / 1st-2nd `<ending>` unrolling, `<tie>`/`<tied>` merging, `<chord/>`, `<backup>`/`<forward>`, `<sound tempo>`/`<metronome>` tempo changes, and `<key>`/`<time>` signatures.
  - Captures `<harmony>` chord symbols and `<lyric>` counts on `currentSong` metadata for future `#39`/`#43`, and surfaces non-blocking amber warning / crimson error toasts (`#grimoire-toast`) for skipped `<grace/>` notes, simplified `<ornaments>`, or malformed files.
  - Integrated `.musicxml`, `.xml`, and `.mxl` into `#midi-file-input` (`📜 Import Spell`), Spellbook `📜 Import File`, full-window drag-and-drop (`#global-drop-overlay`), `./Imports` & `./Midi Test Files` folder watcher (`fs.watch` + polling), Key Signature badges (`#stat-key-sig-chip`, `#spellbook-detail-keysig`), and paired backing audio lookup.

- **Issue #24: Bardic Inspiration Meter (Star Power & Combo Shield):**
  - Upgraded `#hud-inspiration-banner` into a clickable pill-gauge (`#hud-inspiration-fill`) showing live charge progress (`+4%` per clean note = 25 clean notes for 100%, `+1%` per fumbled note), ready state, and active burst countdown.
  - Added **Manual 2x XP Surge** (`activateBardicInspirationBurst()` via HUD pill click or `Enter` key): spends a 100% charge for a 10-second `2.0x XP` boost with a draining meter, golden strike-line glow, and pulsing golden Star Power canvas border aura.
  - Added **Auto Combo Shield** in `recordSpellChainBreak()`: holding a 100% charge automatically absorbs 1 off-key/missed combo break to save your active Spell Chain (`🛡️ COMBO SAVED!`).

- **Issue #25: d20 Performance Check at Song End (3D Physics Dice Roller):**
  - Added `d20-roller.js` powered by `three` + `cannon-es`: mounts a dark green tavern felt & walnut wood dice tray overlay (`#d20-tray-overlay`) inside `#performance-check-modal`, tosses a numbered gold 20-sided icosahedron (`ConvexPolyhedron`), detects bounce impacts for Tone.js clatter sounds, reads the actual top face (`1..20`) on settle, and disposes cleanly on modal close.
  - Added D&D 5E `d20 + Bardic Accuracy Mod vs Song DC` scoring (`buildD20Outcome`, `computeBardicAccuracyMod`, `getSongPerformanceDC`) with reward XP tiers: Nat 20 (`+150 Bonus XP` + celebratory arpeggio), Critical Success (`+75 XP`), Success (`+35 XP`), Missed DC (`+10 Consolation XP`), and Nat 1 (`+5 Consolation XP` + tomato flavor + sad interval).
  - Enforced one roll per song (`songSessionStats.d20Outcome`), ghosted 0-attempt preview mode, `prefers-reduced-motion` instant physics settle, and click / `Space` / `Enter` fast-settle.

- **Issue #63: Practice Tempo Control (Slow the Song Down):**
  - Expanded `#playback-speed-select` and `REHEARSAL_SPEED_PRESETS` (`#30`) to granular practice steps (`0.5x`, `0.6x`, `0.7x`, `0.75x`, `0.8x`, `0.85x`, `0.9x`, `1.0x`, `1.25x`).
  - Added clickable on-screen **`−`** / **`+`** stepper buttons (`#btn-tempo-down`, `#btn-tempo-up`) flanking `#playback-speed-select` (plus `-` and `=` keyboard shortcuts) with `.tempo-modified` gold highlight when practicing off `1.0x` and responsive shrinking on `1024px–1280px` viewports.
  - Added centralized `setPracticeTempo()` / `stepPracticeTempo()` syncing the Spell Highway, MIDI accompaniment, and `backingAudioEl.playbackRate` with `preservesPitch = true` live mid-playback, and persisted `preferredTempo` per song in `songPlayHistory`.

- **Issue #62: Post-Song Breakdown (What Tripped Me Up):**
  - Added per-measure accuracy tracking (`songSessionStats.measureStats`, `getSongBarDurationSec()`, `getMeasureNumberForTime()`, `recordMeasureOutcome()`) for player-controlled hands across Wait Mode and Arcade Mode.
  - Added `#modal-breakdown-section` inside `#performance-check-modal` showing 4 clickable phrase-section accuracy pills (`Bars X–Y` with color-coded tier bars) and the top 2–3 weakest measures (or a flawless banner when 0 mistakes occurred), hidden on 0-attempt previews.
  - Wired 1-tap **`🔁 Practice This`** buttons (`practiceWeakRegion()`) to pad single short bars to at least `2.0s`, close the modal, arm `rehearsalLoopState` (`#30`), jump to `A - 0.8s` pre-roll, sync backing audio, and pause playback so the player can place their hands on the keys before pressing Space.

- **Issue #30: Loop Practice Mode (Rehearsal):**
  - Added inline Rehearsal Loop controls (`[A]`, `[B]`, `🔁 Loop`, and `▾` options popover) to `#spell-scroll-bar` with keyboard shortcuts (`[` Set A, `]` Set B, `\` Toggle Loop) that never collide with QWERTY piano keys.
  - Added visual A–B loop range fill and bracket markers (`#loop-range-fill`, `#loop-marker-a`, `#loop-marker-b`) on the timeline scrubber, plus golden `LOOP A` / `LOOP B` boundary lines on `#spell-canvas`.
  - Implemented seamless A–B loop wrapping with a `0.8s` pre-roll (`REHEARSAL_PREROLL_SEC`) in both Wait Mode and Arcade Mode, syncing MIDI triggers and `backingAudioEl` without triggering the end-of-song Performance Check modal.
  - Added optional **Auto-Ramp Tempo** inside `#rehearsal-popover` that steps up through `#playback-speed-select` presets (`0.5x → 0.75x → 1.0x → 1.25x`) after each 0-miss clean pass.

- **Issue #79: Grimoire Favorites (Attuned Spells):**
  - Added a clickable Star/Attune button (`.spellbook-card-star-btn`) to every Grimoire song card and a matching Star/Attune button (`#btn-spellbook-favorite-song`) to the Spell Details action bar.
  - Added an **Attuned** filter toggle (`#btn-spellbook-favorites-filter`) with live attuned count badge (`#spellbook-fav-count`) next to the Spellbook search input, showing all starred songs across all difficulty tiers in one view and remembering the filter state across modal opens and restarts.
  - Persisted attuned favorites per song in `localStorage` (`collegeOfKeys_grimoire_favorites_v1` & `collegeOfKeys_grimoire_v1`) and `grimoire_library.json` (`isFavorite`) via `loadGrimoireFavorites()` and `saveGrimoireFavorites()`, surviving restarts and folder rescans without ever deleting unstarred songs.

- **Issue #53: Daily Quest System (Tavern Bounties):**
  - Added 3 rotating daily bounties per local calendar day (`DAILY_BOUNTY_SLOTS`: Song/Mode, Precision/Combo, and Volume/Endurance) persisted in `bardProfile.dailyQuests` with zero UTC drift.
  - Integrated a live Daily Bounty status summary onto the Tavern Notice Board (`#menu-daily-bounty-summary` on `station-quest`) with a custom transparent Wax-Sealed Bounty Scroll icon (`assets/images/icons/bounty-seal-transparent.png`), plus a **Today's Tavern Bounties** section at the top of `#quest-board-modal` with progress bars and 1 free daily reroll (`#btn-reroll-daily-bounty`).
  - Wired `updateDailyQuestsOnSongComplete()` into `recordSongPerformance()` so interactive runs automatically progress bounties, auto-claim bonus Bardic XP (including level-ups), light the Hearthfire Streak via `recordPracticeDayActivity({ type: 'quest', xpEarned })`, and display completed bounties in `#modal-quests-banner` inside the Performance Check modal.

- **Issue #66: Hearthfire Practice Streak Calendar:**
  - Added a compact Hearthfire Streak Pill (`#btn-tavern-streak-pill`) docked inside `#tavern-bard-card` on the Tavern Main Menu, featuring a custom transparent Arcane Hearth Flame icon (`assets/images/icons/streak-flame-transparent.png`), live streak count, and today's hearth status.
  - Added an expandable floating Month Calendar Popover (`#tavern-streak-popover`) with Sunday-start weekdays (`S M T W T F S`), previous/next month navigation (disabling future months), highlighted practiced days, today indicator, best streak readout, and `Escape` / outside-click / close-button dismissal.
  - Added local-timezone-safe calendar keying (`getLocalDateKey`, `addLocalCalendarDays`) and `computePracticeStreak()` with yesterday at-risk grace and longest-streak calculation, persisted in `bardProfile.practiceDays`.
  - Wired `recordPracticeDayActivity({ type: 'song', xpEarned })` into `recordSongPerformance()` so any interactive mode (`totalAttempts > 0`, excluding passive Listen Only previews) lights the hearth for the day, while keeping the helper extensible for future `#53` Daily Quests.

- **Issue #77: Delete / Archive Songs from the Grimoire In-App:**
  - Added a visible delete/archive control (`.spellbook-card-delete-btn`) directly on every file-backed Grimoire song card in the spellbook list alongside the spell details archive button (`#btn-spellbook-delete-song`), while keeping the in-memory Built-In Demo Spell protected.
  - Added an in-app Tavern Dark Mode confirmation dialog (`#delete-spell-confirm-modal`) displaying the song title, an active-highway warning when applicable, and the exact list of files moving to `./Archive` (`Escape`, backdrop click, and stacked `Tab` focus-trap support).
  - Implemented `moveFileToArchive()` in `renderer.js` to move MIDI files, paired backing audio, sibling sheet music, and future `#76` bundle parts directly into a local `./Archive` directory (with automatic timestamped deduplication on collision), so songs are safely preserved locally without entering the OS Recycle Bin or requiring main-process IPC round-trips.
  - Implemented `unloadCurrentSongToEmptyState()` in `renderer.js` to release active backing audio handles, stop playback, reset transport controls/progress/difficulty UI, clear matching `lastSongPath`/`lastSongTitle`, and prevent stuck highway states or folder-watcher re-ingestion when archiving the active song.

- **Issue #69: Flippable Grimoire Spellbook Sorted by Difficulty (`#grimoire-spellbook-modal`):**
  - Retired the narrow left `<aside id="grimoire-sidebar">`, allowing the 61-key canvas and Spell Highway to maintain full stage width without horizontal squishing.
  - Implemented full-screen pop-up spellbook module overlaying the 16:9 open book art (`assets/images/grimoire/grimoire-open-book.png`).
  - Organized songs into 10 D&D difficulty spreads in order: Cantrip, 1st-Level through 9th-Level spells.
  - Left Page: Displays tier ribbon badge, XP multiplier, tier description, real-time search field, and alphabetical list of spells with BPM and duration.
  - Right Page: Displays comprehensive spell details (tier chip, origin source, tempo, duration, NPS, playable note count, paired backing audio status) and Bardic Annals history (rehearsal count, best mastery, latest trial accuracy, career XP, last played date).
  - Primary CTA `▶ Inscribe on Highway (Load Spell)` loads the spell and closes the tome, returning to the stage ready to play.
  - Empty tier state displays an arcane parchment illustration, "No Spells of this Level Yet", and a 1-click CTA button pointing directly to The Quest Board.
  - Navigation: 3D perspective page flip animations, Previous/Next tier buttons, 10 bookmark tabs/pips, and keyboard shortcut support (`ArrowLeft`/`A`, `ArrowRight`/`D`, and `Escape`).
  - Folder Watcher Integration: Newly ingested `.mid` files live-update the open spellbook and jump directly to the incoming spell's difficulty tier without reopening the book.
  - Contextual Origin Return: Closing the Grimoire seamlessly returns the player to their triggering origin (Tavern Main Menu or Practice Highway).
  - UI/UX Readability & Page Overflow Remediation: Replaced cramped 4-column metric and annals layouts with clean 2x2 grids, giving labels ("Playable Notes", "Career XP") generous horizontal width to eliminate truncation. Tightened `.spellbook-stage` inside the clean ruled parchment (`top: 24.2%; bottom: 27.2%; left: 28.8%; right: 29.2%`) clear of all gold corner filigree and outer borders, locked `.spellbook-container` strictly to 16:9 with `container-type: inline-size` and proportional `cqw` typography/card scaling, shortened tier descriptions and song-row metadata to show fuller song titles, upgraded text to high-contrast iron-gall ink (`#1a0a00`) on illuminated vellum cards, and styled the close button in dark walnut and burnished brass.

- **Issue #71: Theatrical Title Splash Opener ("Press Any Key or Piano Note to Enter"):**
  - Added full-screen atmospheric Title Splash overlay (`#tavern-title-splash`) with crest logo, serif title, subtitle, and pulsing golden entry prompt button.
  - Interactive entry via mouse click, any QWERTY keypress, or physical MIDI `noteon` key strike.
  - Triggers warm C-Major sampler arpeggio (`C3`–`C5`) and primes `Tone.context` / Web Audio immediately with a user gesture to eliminate first-note latency.
  - Automatically bypasses splash when returning to the Tavern mid-session from the Spell Highway.

### Changed
- **Issue #71: Tavern Station Swap, Palette Overhaul & Visual Hierarchy:**
  - Swapped **The Hearth Stage (Continue Practice)** to the upper stage archway framing the lute, reinforcing it as the Hero CTA.
  - Moved **Trainer's Guild (How to Play)** down to the lower floor corner as an unobtrusive onboarding reference.
  - Replaced generic synthwave purple gradients across all station cards, panels, and modals with **Aged Walnut & Smoked Oak** (`rgba(26, 19, 14, 0.94)` / `#221a14`), **Burnished Brass** (`#8a6d2f` / `#d4af37`), **Forest Velvet** (`rgba(22, 38, 28, 0.96)` for The Hearth Stage), and **Toasted Parchment** (`#baab93` / `#f4ebd9`).
  - Established a 3-tier button hierarchy: Tier 1 Hero CTA (The Hearth Stage), Tier 2 Content Hubs (Grimoire & Quest Board), and Tier 3 Utilities (How to Play & Tuning Corner).
  - Added subtle hover glow and `📜` icon hint to the Bard Character Spotlight card to indicate it opens the Bardic Annals.

### Added
- **Issue #52: The Tavern Title Screen & Main Menu Front Door (`#tavern-main-menu`):**
  - Added full-screen Tavern landing hub featuring the 16:9 painterly fantasy backdrop (`tavern-menu-scene.png`), title crest logo (`title-logo-crest-transparent.png`), and interactive stations for Continue Practice, The Grimoire, The Quest Board, Trainer's Guild Orientation, and Audio & Keys settings.
  - Added the Bard Character Spotlight card backed by `bard-profile-banner.png`, displaying live career XP, Level, and Title over the tavern hearth rug.
  - Added the **Bardic Annals modal (`#bard-annals-modal`)** showcasing career highlights (Most Rehearsed Ballad, Masterpiece Incantation, Wild Magic Trial) and the Rehearsal Ledger chronicle.
  - Added the **Trainer's Guild Orientation modal (`#how-to-play-modal`)** for first-run onboarding.
  - Added painterly practice stage backdrop (`practice-stage-backdrop.png`) framing the Spell Highway.
  - Added high-resolution transparent toolbar icons (`assets/images/icons/`).
  - Added responsive percentage-based hotspot positioning on 16:9 canvas with automated card-grid fallback below 950px width.

### Fixed
- **Issue #80: Map Auto-Difficulty to All 10 Spell Levels (`Cantrip` through `9th-Level Spell`):**
  - Unified `calculateSpellDifficulty()` and `SPELLBOOK_TIERS` onto a single canonical 10-tier definition in `renderer.js`, making all 10 D&D difficulty tiers and their XP multipliers (`1.0x`, `1.1x`, `1.2x`, `1.3x`, `1.4x`, `1.5x`, `1.6x`, `1.7x`, `1.8x`, `2.0x`) reachable across contiguous half-open NPS intervals (`< 1.5`, `1.5 to <2.0`, `2.0 to <2.6`, `2.6 to <3.3`, `3.3 to <4.0`, `4.0 to <4.8`, `4.8 to <5.8`, `5.8 to <6.9`, `6.9 to <8.0`, `8.0+ NPS`).
  - Added `.diff-level1`, `.diff-level3`, `.diff-level4`, `.diff-level6`, `.diff-level7`, and `.diff-level8` difficulty badge styles in `styles.css` (using the warm Tavern palette) so all 10 tiers render cleanly in Bar 2.
- **Issue #81: Complete Removal of Remaining Legacy Purple Colors After #71 Palette Overhaul:**
  - Replaced remaining purple gradients, fills, and shadows in `styles.css` across `#tavern-header`, `#spell-scroll-bar`, `.tavern-btn`, `.tavern-select`, `.conservatory-popover`, `.stat-chip`, `.chip-folded`, `.xp-bar-track`, `.center-combo-pill`, `.modal-backdrop`, `.d20-grade-banner`, `.modal-xp-card`, `.modal-stat-box`, `#stage-container`, `.btn-quest-board` (re-themed to warm Notice Board amber-wax `#4f2b11`–`#2e1708` / `#f59e0b`), `.quest-board-card`, `.quest-section-box`, `.quest-text-input`, `.quest-progress-fill`, `.quest-archive-card`, `@keyframes inspirationAuraPulse`, and `.tavern-scene-backdrop` with Obsidian / Smoked Walnut / Burnished Brass / Amber tokens.
  - Replaced legacy purple colors in `renderer.js` canvas-drawn keyboard idle gradients/strokes/labels, non-measure lane guides, folded-note borders, strike-line Inspiration gradient, particle palettes, and inspired XP floating runes with warm ebony/brass/amber-gold equivalents.
  - Updated `main.js` `BrowserWindow` `backgroundColor` from `#0b0914` to Obsidian `#0c0907`.
- **Issue #67: Tavern Main Menu Modal Stacking, Settings Auto-Close & Continue Restore:**
  - Raised modal z-index to 1100 to layer over `.tavern-scene-overlay`.
  - Stopped Settings station click from bubbling to outside-click handler.
  - Restored `lastSongPath` on boot and Continue; auto-load no longer overwrites it.
  - Worst song and career accuracy use `lastAccuracy`; favorite song tie-breaks by recency.
  - Gated MIDI input while Tavern menu is visible.
- **Issue #68: History Storage Keying, XSS Prevention, Focus Management & Scene Hotspots:**
  - Made `song_stats.json` and `SONG_STATS_STORAGE_KEY` the single source of truth for song history, eliminating unbounded profile growth in `bard_profile.json`.
  - Keyed song history on stable content SHA1 hashes (`crypto.createHash('sha1')`) so saving to the Grimoire never splits or duplicates play counts.
  - Added automatic migration and duplicate entry merging on load.
  - Rebuilt Annals Rehearsal Ledger DOM using `createElement` and `textContent` without `innerHTML`.
  - Added dynamic version tag in Tavern footer reading from `package.json`.
  - Added focus management: remember and restore focus, focus first interactive station on open, and added `inert` attribute to background layers during main menu.
  - Added keyboard focus trap cycling `Tab` / `Shift-Tab` inside active modals.
  - Unified wording to "rehearsal(s)" across the app.
  - Added breathing room padding on Bar 1 & Bar 2 to eliminate right-edge window control clipping.

---

## [1.1.2] - 2026-11-07 — Deep-Dive Code Review Remediation (`Fixes #44–#51`)

### Fixed
- **Issue #44 (`High`):** Extracted shared `foldAndDeduplicateHandNotes()` helper used by both `assignSongTracksAndDifficulty()` and `extractGrimoireEntryFromBuffer()` so Grimoire cards and the Active Spell HUD always report identical octave-folded note counts, NPS, and Spell Level tiers.
- **Issue #45 (`High`):** Updated the held-key arrival check (`isFreshEarlyPress`) in `animationLoop()` to track `firstStrikeMs`, `lastStrikeMs`, and `hasSlowRoll`, validate `100ms` chord rolls (`isCleanChordRoll`) using the same rules as `evaluateStrikeZoneInput()`, and update `setStrikeStatusBadge()`.
- **Issue #46 (`High`):** Updated Arcade Mode (`Wait Mode: OFF`) in `animationLoop()` to cluster earliest unsatisfied player notes via `getNextUnsatisfiedStrikeGroup()` so unstruck staggered chords expire atomically once per chord rather than firing multiple Spell Chain breaks across consecutive frames, and updated `setStrikeStatusBadge('fumble', ...)`.
- **Issue #47 (`Medium`):** Reset `songSessionStats` (`resetSongSessionStats()`) when `startPlayback()` rewinds a finished song to the start, and reset `songSessionStats.hasShownEndModal = false` when scrubbing `#song-progress-slider` backwards so the Post-Song Performance Check Modal opens reliably on subsequent playthroughs.
- **Issue #48 (`Medium`):** Updated `saveActiveSpellToGrimoire()` to copy any paired backing audio track (`currentSong.backingAudioPath`) into `./Imports/` alongside the saved `.mid` file, and passed `{ preserveTriggeredAtTarget: true }` in `assignSongTracksAndDifficulty()`.
- **Issue #49 (`Medium`):** Updated `python_ml/transcribe_quest.py` to support 8-bit, 16-bit, 24-bit, and 32-bit PCM `.wav` files in `read_wav_mono_float()` and `convert_audio_to_pcm_wav()`, and ensured `write_standard_midi_file()` always writes a valid non-empty primary track with tempo metadata.
- **Issue #50 (`Medium`):** Added `clearAllHeldInputNotes()` and invoked it inside `resetPlaybackToStart()` to clear `pressedQwertyKeys`, `activeNotes`, `sustainedNotes`, and mouse state when loading a new song or restarting playback.
- **Issue #51 (`Low`):** Dismissed open Conservatory popovers on `canvas` `mousedown` and refined `renderGrimoireSidebar()` `.active-spell` matching to compare resolved `filePath` values when available.

---

## [1.1.1] - 2026-11-07 — Post-Overhaul Code Review Remediation (`Fixes #31–#38`)

### Fixed
- **Issue #31 (`High`):** Added `syncBackingAudioElement(currentTime)` and invoked it in `animationLoop`, `btnBackingBand`, `btnWaitMode`, `songProgressSlider`, and `resetPlaybackToStart()` so synced `.wav`/`.mp3` backing audio (`backingAudioEl`) automatically pauses while frozen in Wait Mode (`isWaitingForStrike`) or when `🎸 Band: OFF` is toggled mid-song, and resumes seamlessly in sync when unlocked.
- **Issue #32 (`High`):** Updated `evaluateStrikeZoneInput()` with `hasUpcomingPlayerNoteMatchingMidi()` so that in Arcade Mode (`Wait Mode: OFF`), striking the next note inside its `130ms` early-strike window while an unhit note sits in the `25ms` late-grace tail (`[currentTime - 0.025, currentTime)`) expires the missed note once and cleanly locks the upcoming note instead of double-penalizing the player.
- **Issue #33 (`High`):** Added `isAnyModalOpen()` to the global capture-phase `keydown` handler in `renderer.js` so `Escape` closes `#performance-check-modal` and `#quest-board-modal`, and `Spacebar` / `Z` / `X` / `A`–`;` keyboard inputs are blocked from triggering background transport or piano notes while a modal dialog is open.
- **Issue #34 (`Medium`):** Updated `tryAutoLoadWorkspaceMidi()` to automatically invoke `loadBuiltInDemoSpell()` when no workspace or `./Imports/` `.mid` file is found on startup so a fresh clone always boots with *Cantrip of the Dawn* ready to play.
- **Issue #35 (`Medium`):** Enforced `min-width: 175px` on `#spell-metadata-panel`, `min-width: 90px` on `.spell-title-group`, and responsive `@media (max-width: 1280px)` rules in `styles.css` so `#spell-name-display` never collapses to `0px` at `1024px–1200px` window widths.
- **Issue #36 (`Medium`):** Preserved `autoTriggered` state for notes up to `currentTime` in `resetSongProgressFlags(targetTime, { preserveTriggeredAtTarget: true })` during mid-song practice mode switches, restored `lastNonPreviewPracticeMode` when re-enabling `Wait: ON` from `Listen Only`, and displayed `'Listen Only Mode (Auto-Playing Both Hands)'` on restart when in `preview` mode.
- **Issue #37 (`Medium`):** Parsed `beatsPerMeasure` from `midiData.header.timeSignatures` onto `currentSong` for dynamic measure-line rendering (`b % beatsPerMeasure === 0`) in `drawFallingSpellHighway()`, and passed `file.path || null` to `parseMidiBuffer()` in both file-picker and drag-and-drop handlers so paired backing audio is discovered.
- **Issue #38 (`Low`):** Updated `start.bat` to check local `node_modules` and `%LOCALAPPDATA%` before falling back to hardcoded paths or `npx electron`, displayed `'—'` instead of `100.0%` accuracy in `#performance-check-modal` when `totalAttempts === 0`, and revoked temporary `Blob` URLs inside `grandPianoSampler`'s `onload` callback.

---

## [1.1.0] - 2026-11-07 — Phase 10: 2-Bar Conservatory UI/UX Overhaul (`Fixes #18–#22`)

### Added & Changed
- **Epic #22 & Issue #18 — 2-Bar Conservatory Layout & `⚙ Audio & Keys` Popover (`index.html`, `styles.css`, `renderer.js`):**
  - Collapsed the 7-row top chrome into two sleek, non-wrapping bars (`#tavern-header` + `#spell-scroll-bar`), reclaiming vertical screen height so the 60 FPS Spell Highway and 61-key piano occupy **~82% of the viewport**.
  - Added the **`⚙ Audio & Keys` popover (`#settings-popover`)** housing `Instrument Tone`, `Master Volume`, `Note Fall Speed`, `Highway MIDI Track`, `QWERTY Range (Z/X)`, `Show [A]–[;] Key Labels`, `Sustain Pedal`, and `Active Glyphs`, closing on outside click or `Escape`.
- **Issue #19 — Zero Note-Lane Occlusion (Inline Bardic Character Banner + Translucent Center Highway HUD):**
  - Moved the opaque 345px `#litrpg-hud-card` out of the upper-right Spell Highway (`F5–C7`) and embedded it into Bar 1 as a *Baldur's Gate 3*-style inline **Bardic Character Banner** (`LVL`, `Bardic Rank`, inline `XP Progress Bar`, `Total XP`, and `🏆 Rank & Stats`).
  - Added a translucent, `pointer-events: none` **Top-Center Highway HUD Pill (`#highway-center-hud`)** displaying live `Spell Chain`, `Effective XP Multiplier`, `Wait Mode / Strike Zone Target` (`⏳ Waiting: ...`), and `Bardic Inspiration` right where the player's eyes focus on the highway without blocking a single note lane across `C2–C7`.
- **Issue #20 — Unified 1-Click Practice Hand Selector (`#practice-mode-select`):**
  - Replaced the separate `Hands` + `Accompaniment` dropdowns on Bar 2 with a single 1-click **`Practice` selector (`#practice-mode-select`)**:
    - `🙌 Both Hands (RH Gold + LH Blue)`
    - `🤚 Right Hand + Auto Left Hand`
    - `🤚 Right Hand Solo (Mute Left)`
    - `左手 Left Hand + Auto Right Hand`
    - `左手 Left Hand Solo (Mute Right)`
    - `🎧 Listen Only (Auto-Play Both)`
- **Issue #21 — Spell Scroll Inspector (`ⓘ Details`) Popover & Smart QWERTY Key Label Toggle:**
  - Moved diagnostic MIDI stats (`NPS`, `BPM`, `T1 (RH Gold)`, `T2 (LH Blue)`, `Band Tracks`, `Octave Folded`) and the `+25 Spell Chain Boost` testing shortcut into the **`ⓘ Details` popover (`#spell-details-popover`)** next to the Active Spell title and difficulty badge.
  - Added `#toggle-qwerty-labels` (`Show [A]–[;] Key Labels`), which automatically hides `[A]–[;]` key labels when a physical Web MIDI keyboard is connected and shows them when using Mouse/QWERTY or pressing `Z`/`X`.

---

## [1.0.1] - 2026-11-07 — Rhythm-Game & Piano-Pedagogy QA Remediation (`Fixes #9–#17`)

### Fixed
- **Issue #9 (`High`):** Prevented held keys (`consumedByStrikeGroup`) and Sustain Pedal (`sustainedOnly: true`) notes from auto-clearing subsequent notes of the same pitch in Wait Mode, requiring genuine re-articulation on repeated notes while preserving the `130ms` early-strike window.
- **Issue #10 (`High`):** Held auto-played Accompaniment (`Track 2`) and Backing Band triggers at `anchorTime` while frozen in Wait Mode until the player unlocks the gated chord so both hands sound together on strike.
- **Issue #11 (`High`):** Enabled off-key strike penalties inside the strike window in Arcade Mode (`Wait Mode: OFF`) and prevented staggered missed chords from firing multiple Spell Chain breaks across consecutive frames.
- **Issue #12 (`High`):** Ignored duplicate re-strikes of already-locked chord pitches during a roll and wired `!group.hasSlowRoll` into `isCleanChordRoll` so 3- and 4-note rolled chords within `100ms` per finger register reliably.
- **Issue #13 (`Medium`):** Moved backing audio copy before `.mid` creation in `python_ml/transcribe_quest.py` and added late backing-audio detection in `scanWatchedDirectories()` so The Grimoire never misses paired `.wav`/`.mp3` files.
- **Issue #14 (`Medium`):** Deduplicated simultaneous same-pitch notes (within `25ms` on the same hand) produced by 61-key Octave Folding (`foldAndFormat`) to prevent `2x` XP inflation and `Tone.Sampler` phasing.
- **Issue #15 (`Medium`):** Replaced per-note `ctx.createLinearGradient()` and unconditional `shadowBlur` inside `drawFallingSpellHighway()` with a two-tone body + top specular cap and strike-line-only glow (`0` gradient allocations per frame).
- **Issue #16 (`Medium`):** Added a `window.addEventListener('blur')` handler to release held QWERTY and mouse keys when switching windows (`Alt+Tab`).
- **Issue #17 (`Low`):** Added a `window.addEventListener('beforeunload')` handler to terminate `activeQuestChildProcess` if the window closes or reloads mid-transcription.

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

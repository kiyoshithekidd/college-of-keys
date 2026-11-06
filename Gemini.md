# College of Keys — Build Log, Plan & Decisions

> **Critical Execution Rule:** Never execute multiple phases at once. At the end of every single phase, STOP, provide testing instructions for the current state, and wait for explicit user confirmation (`"Testing successful"`) before writing any code for the next phase.

---

## 1. Project Goal & Vision
Build **College of Keys**, a local Electron PC application that transforms piano practice into a D&D 5E Bard LitRPG progression loop, designed with a Rock Band-style play-along architecture:
- **Repository:** https://github.com/kiyoshithekidd/college-of-keys
- **Core Loop:** Parse `.mid` files, display falling arcane glyphs ("The Spell Highway") on a 60 FPS HTML5 Canvas, and interact with a physical 61-key MIDI keyboard (`C2` / MIDI 36 to `C7` / MIDI 96).
- **Thematic UI:** "Tavern Dark Mode" aesthetic with Radiant Gold (Track 1 / Lead) and Eldritch Blue (Track 2 / Accompaniment) visuals.
- **Practice & Play-Along Mechanics:**
  - Toggleable **Wait Mode** (pauses at strike line until required pitches are played) vs. **Arcade Mode** (continuous playback).
  - **100ms Chord Forgiveness** (`chordGracePeriod`) window for rolled chords.
  - **Accompaniment & Backing Band Toggles:** Play solo piano, auto-play Left Hand (Track 2), or toggle the **Full Backing Band / Track** (Rock Band style—playing along with the rest of the MIDI instruments or synced backing audio, or muting them for pure solo piano).
- **LitRPG Progression:** Auto-calculated difficulty from Notes Per Second (NPS: Cantrip to 9th-Level Spell), Spell Chain combos, Bardic Inspiration (2x XP at 50 combo), Fumbled Component penalty (>2s pause in Wait Mode = +2 XP instead of +10 XP), and XP leveling (Lvl 1 = 1,000 XP, 1.5x scaling) with Bardic titles stored locally.
- **Sourcing & ML Pipeline:** Local "Grimoire" library with folder watching on an `Imports/` directory, paired with a decoupled Python CLI (`yt-dlp` + `basic-pitch`, with stem/backing audio support) and an in-app "Quest Board" to convert YouTube audio into playable MIDI spells.

---

## 2. Architectural & Design Decisions Log

| Date | Decision | Rationale ("Why") | Status |
| :--- | :--- | :--- | :--- |
| 2026-11-06 | **Maintain `Gemini.md` alongside `context.md`, `progress.md`, `README.md`, and `CHANGELOG.md`** | User confirmed maintaining `Gemini.md` as the detailed build log, plan, and decision record while also keeping `context.md`, `progress.md`, `README.md`, and `CHANGELOG.md` continuously updated in the workspace and on GitHub. | Approved |
| 2026-11-06 | **Exclusive Branding: "College of Keys"** | User confirmed using "College of Keys" exclusively across the app title, UI headers, and documentation (retiring "FlowState"). | Approved |
| 2026-11-06 | **Include Mouse-Click & QWERTY Fallback alongside Web MIDI** | User confirmed adding mouse/QWERTY input on the 61-key canvas so every phase can be tested reliably even if the physical 61-key MIDI controller is unplugged. | Approved |
| 2026-11-06 | **Non-Destructive Multi-Track Architecture + "Backing Band" Toggle** | Instead of deleting non-piano tracks, default the playable Spell Highway to Piano (Track 1 = RH, Track 2 = LH, or Middle-C split on single-track files), allow switching which track you play via dropdown, and preserve remaining tracks/audio as a toggleable "Backing Band" (Rock Band style play-along vs. solo piano). | Approved |
| 2026-11-06 | **Save Vocals ("Let's Sing") & Multi-Instrument Controllers for Backlog, Design Data Model to Support Them Now** | Keep Phases 1–9 focused on the 61-key Piano MVP while structuring the song/track data model so microphone pitch detection (Vocals) and other instrument highways can plug in cleanly later. | Approved |
| 2026-11-06 | **Strict Single-Phase Execution Gate** | Prevents compounding bugs across audio, MIDI hardware, canvas rendering, and game logic; ensures each layer is verified by the user before building on top of it. | Active |
| 2026-11-06 | **Single HTML5 Canvas (60 FPS) with Primitive Shapes for MVP** | Avoids DOM layout thrashing for falling notes; modular rendering design allows seamless PNG sprite swapping and top-50% sheet music split in future iterations. | Implemented (Phase 1) |
| 2026-11-06 | **Real Multi-Sampled Acoustic Grand Piano (`Tone.Sampler` + Local Salamander Samples) + `Tone.context.lookAhead = 0`** | Initial `Tone.Synth` (`triangle8` oscillator) sounded like an electronic synth rather than a real piano. Upgraded "Tavern Grand Piano" to `Tone.Sampler` backed by 22 local Yamaha C5 Salamander Grand Piano recordings (`./assets/samples/piano/A1..C7.mp3`) loaded into memory, with `lookAhead = 0` for `<10ms` live latency. | Implemented (Phase 1) |
| 2026-11-06 | **Native Web MIDI API (`navigator.requestMIDIAccess`) + Velocity-0 NoteOff Handling** | Eliminates third-party wrapper latency; handles both explicit `0x80` NoteOff and `0x90` NoteOn with `velocity === 0` (used by many 61-key controllers on key release), plus Sustain Pedal (`CC 64`). | Implemented (Phase 1) |
| 2026-11-06 | **61-Key Octave Folding (MIDI 36–96)** | Physical hardware is a 61-key controller (`C2`–`C7`). Out-of-bounds MIDI notes are transposed by $\pm 12$ semitones until they fall within `[36, 96]` so every note in any song is playable. | Implemented (Phase 1) |
| 2026-11-06 | **Decoupled Python CLI for `yt-dlp` + `basic-pitch` (+ Backing Audio / Stems)** | Keeps heavy ML/audio dependencies out of the Electron binary; outputs both `.mid` and optional synced backing audio into `Imports/` for Rock Band-style play-along. | Planned |

---

## 3. Benchmarks & Lessons from Similar Open-Source Piano Apps

In addition to the libraries in the PRD (`Tone.js`, `@tonejs/midi`, `atosystem/midi2Tiles`, `schollz/pianoai`, `spotify/basic-pitch`, `alacrity-ai/sequenzia`), we reviewed how leading open-source WebMIDI + Canvas piano trainers (**`Bewelge/MIDIano`**, **`Sightread`**, and **Synthesia / Rock Band 3 Pro Keys**) solve common pitfalls:

1. **The "Stuck Key" Web MIDI Trap (`NoteOn` with `Velocity = 0`):**
   - Many physical 61-key MIDI keyboards send status `0x90` (`NoteOn`) with `velocity = 0` when you release a key instead of status `0x80` (`NoteOff`). Our Web MIDI parser explicitly routes `(status & 0xF0) === 0x90 && velocity === 0` to `handleNoteOff(pitch)`.
2. **Zero-Latency Live Monitoring (`Tone.context.lookAhead = 0`):**
   - By default, `Tone.js` uses a `100ms` scheduling lookahead buffer (`Tone.context.lookAhead = 0.1`), which feels noticeably delayed when pressing physical piano keys. Setting `Tone.context.lookAhead = 0` drops audio latency to `<10ms`.
3. **Wait Mode "Sustained Bass vs. New Onset" Rule (from `MIDIano` / `Sightread`):**
   - If the Left Hand holds a long whole-note chord while the Right Hand plays 4 quarter notes, Wait Mode must only gate on **note onsets (`note.time`)** arriving at the strike line—never forcing the player to re-press a sustained note they already struck earlier in the measure.
4. **Shared Key-Geometry Lookup Table (`keyGeometry[midiNote]`):**
   - On a 61-key keyboard (`36` white keys, `25` black keys), black keys are ~62% the width of white keys and offset between white-key boundaries. Computing a single `keyGeometry[36..96]` lookup table `{ x, width, height, isBlack }` on canvas resize guarantees falling glyphs in Phase 3 align pixel-perfectly with the physical keys drawn in Phase 1.
5. **Sustain Pedal Support (`CC 64`):**
   - Listening for MIDI Control Change `0xB0` with controller `64` (`value >= 64` pedal down, `< 64` pedal up) lets players use a physical sustain pedal naturally.

---

## 4. Core Mechanics & Math Reference

### 4.1 61-Key Mapping & Octave Folding
- **Valid Range:** MIDI `36` (`C2`) to `96` (`C7`) — 61 keys total (36 white keys, 25 black keys).
- **Folding Logic:**
  - While `midiNote < 36`: `midiNote += 12`
  - While `midiNote > 96`: `midiNote -= 12`

### 4.2 Falling Notes, Track Assignment & Backing Band ("Rock Band" Mode)
- **Interpolation:** $y = \text{strikeZoneY} - \text{speed} \times (\text{targetTimeOrTick} - \text{currentTimeOrTick})$
- **Playable Tracks on the Spell Highway:**
  - Auto-selects Piano tracks by default (or lets the user pick any track from the MIDI via dropdown).
  - If 1 piano track is selected (e.g., Basic Pitch output), splits at Middle C (`C4` / MIDI 60) into **Track 1 (Right Hand / Lead — Radiant Gold)** and **Track 2 (Left Hand / Accompaniment — Eldritch Blue)**.
  - If 2 piano tracks exist, assigns higher average pitch to **Track 1 (Radiant Gold)** and lower average pitch to **Track 2 (Eldritch Blue)**.
- **Audio & Play-Along Toggles:**
  1. **Hand Isolation (`Track 1`, `Track 2`, `Both`) + Left-Hand Accompaniment Toggle (`Mute` vs. `Auto-Play`):** Practice Right Hand while Tone.js either mutes or auto-plays Left Hand.
  2. **Backing Band / Full Song Toggle (`Mute` vs. `Play Along`):**
     - On multi-track MIDIs, synthesizes the non-selected band tracks (bass, strings, synth, etc.) in the background via `Tone.Transport` when enabled, or mutes them for solo piano.
     - On YouTube imports (Phase 8/9), plays the synced backing audio track in Arcade Mode when enabled, or mutes it so you hear only your piano.

### 4.3 Wait Mode & 100ms Chord Forgiveness
- **Wait Mode:** When enabled, playback time freezes when an active unplayed note/chord onset reaches the strike zone until the user presses the required MIDI pitch(es).
- **Chord Grace Period (`100ms`):** Rolling a chord within a 100ms window registers as a clean collective hit without penalizing slight human finger offsets, provided no wrong keys are pressed.

### 4.4 LitRPG Gamification Math
- **Auto-Difficulty (NPS = Total Active Notes / Song Duration in Seconds):**
  - `< 1.5 NPS`: **Cantrip** (`1.0x` XP)
  - `1.5 – 3.0 NPS`: **2nd-Level Spell** (`1.2x` XP)
  - `3.1 – 5.0 NPS`: **5th-Level Spell** (`1.5x` XP)
  - `5.1+ NPS`: **9th-Level Spell** (`2.0x` XP)
- **XP & Combo Formula:**
  - Base Note Hit: `+10 XP` (or `+2 XP` "Fumbled Component" if paused `> 2.0s` in Wait Mode).
  - **Spell Chain:** `+1` per clean note, resets to `0` on wrong note.
  - **Bardic Inspiration:** Triggered at `50+` Spell Chain (`2.0x` temporary XP multiplier + arcane visual glow).
  - **Effective Note XP:** $\text{BaseXP} \times \text{DifficultyMultiplier} \times \text{InspirationMultiplier}$
- **Leveling Curve & Titles:**
  - Level 1 threshold: `1,000 XP` (scales by `1.5x` per level).
  - Titles:
    - Lvl 1+: *Tavern Busker*
    - Lvl 10+: *College Initiate*
    - Lvl 20+: *Wandering Minstrel*
    - Lvl 30+: *Court Virtuoso*
    - Lvl 40+: *Spell-Singer*
    - Lvl 50+: *Grand Maestro*

---

## 5. Phased Build Plan & Checklist (MVP: Phases 1–9)

- [x] **Phase 1: Electron Skeleton & Audio (Completed & Verified)**
  - Initialize [package.json](file:///g:/My%20Drive/Projects/College%20of%20Keys/package.json), [main.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/main.js), [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html), [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js), and [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css).
  - Render static 61-key piano (`C2`–`C7`) on HTML5 Canvas.
  - Connect physical MIDI keyboard via `navigator.requestMIDIAccess()` with `onstatechange` support + mouse/QWERTY fallback.
  - Integrate `Tone.Sampler` (local Yamaha C5 Salamander Grand Piano samples + warm EQ/low-pass filtering + upper-register key-scaling) and highlight/play keys on input.
  - *Gate 1: Passed (`"Testing successful"`).*

- [x] **Phase 2: MIDI Parsing & Auto-Difficulty (Completed & Verified)**
  - Implement local `.mid` file upload (file picker, drag-and-drop, and 1-click Built-In Demo Spell) and parsing via `@tonejs/midi`.
  - Preserve all tracks: auto-select Piano track(s) for Track 1 (RH) & Track 2 (LH) (with Middle-C split for single-track files and a UI dropdown to switch active tracks) while keeping remaining tracks as Backing Band data.
  - Apply Octave Folding into `36–96` for playable keyboard tracks.
  - Calculate Notes Per Second (NPS) and assign the D&D Spell Level difficulty tag.
  - *Gate 2: Passed (`"Testing successful"`).*

- [x] **Phase 3: The Spell Highway, Accompaniment & Backing Band (Completed & Verified)**
  - Build the 60 FPS `requestAnimationFrame` render loop.
  - Draw falling glowing notes (Track 1 = Radiant Gold, Track 2 = Eldritch Blue) aligned to the 61-key layout.
  - Add Track Isolation selector (`Track 1`, `Track 2`, `Both`), Left-Hand Accompaniment Toggle (`Mute` vs. `Auto-play`), and **Backing Band Toggle** (`Solo Piano` vs. `Full Band Play-Along`).
  - *Gate 3: Passed (`"Testing successful"`).*

- [x] **Phase 4: Wait Mode & Chord Forgiveness (100ms Roll) (Completed & Verified)**
  - Define the strike zone collision boundary and Wait Mode UI toggle.
  - Implement the 100ms `chordGracePeriod` window for rolled chords.
  - Gate playback progression on matching MIDI `noteon` events when Wait Mode is active.
  - *Gate 4: Passed (`"Testing successful"`).*

- [x] **Phase 5: LitRPG Gamification UI (Combos, XP, Titles) (Completed & Verified)**
  - Build HUD for Spell Chain counter, Bardic Inspiration state, XP bar, Level, and Bardic Title.
  - Implement XP calculation (difficulty multiplier, 50-streak 2x multiplier, >2s Wait Mode fumble penalty) and local persistence.
  - Build the post-song "Performance Check" summary modal.
  - *Gate 5: Passed (`"Testing successful"`).*

- [x] **Phase 6: The Grimoire (Folder Watcher & Local Storage) (Completed & Verified)**
  - Build "The Grimoire" sidebar to save, browse, and load parsed songs (along with any paired backing audio) locally.
  - Add Electron folder watcher on local `Imports/` folder to auto-ingest new `.mid` (and paired backing audio) files into The Grimoire.
  - *Gate 6: Passed (`"Testing successful"`).*

- [/] **Phase 7: UI Polish & Particle Effects (Implemented — Awaiting `"Testing successful"`)**
  - Add HTML5 canvas particle bursts on note hits at the strike line.
  - Polish the Tavern Dark Mode aesthetic (arcane glow, typography, parchment/obsidian styling).
  - *Gate 7: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 8: Python ML Extraction (`yt-dlp` + `basic-pitch` + Backing Track CLI)**
  - Create decoupled Python directory/CLI outside the Electron bundle.
  - Build pipeline to download YouTube audio via `yt-dlp`, optionally split stems (via `demucs` if installed) or preserve synced backing audio (`.mp3`/`.wav`), transcribe piano/melody to `.mid` via `basic-pitch`, and drop into `Imports/`.
  - *Gate 8: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 9: "The Quest Board" (In-App Sourcing)**
  - Add in-app "Paste YouTube URL" input that spawns the Phase 8 Python CLI in the background with status feedback.
  - Add quick-link buttons opening external browser tabs for BitMIDI, VGMusic, and YouTube.
  - *Gate 9: Stop, provide test steps, wait for `"Testing successful"`.*

---

## 6. Future Expansion Backlog (Post-Phase 9: "The Full Adventuring Party")

- **Backlog Epic A — "Spell-Singing" (Vocals / Let's Sing Mode):**
  - Capture microphone input via Web Audio API (`AnalyserNode` + autocorrelation / YIN pitch detection).
  - Render a horizontal scrolling vocal pitch highway (like *Let's Sing* / *Rock Band* vocals) at the top of the screen with lyric display and pitch-matching XP.
- **Backlog Epic B — Multi-Instrument Highways & Stem Separation (`Demucs`):**
  - Automatic 4-stem AI separation (`vocals`, `drums`, `bass`, `piano/other`) in the Python pipeline so the user can mute ONLY the piano in an actual MP3/YouTube song while hearing the real original vocals, drums, and bass—and later switch to playing Bass, Guitar, or Drums.
- **Backlog Epic C — Scrolling Sheet Music Split View:**
  - Dedicate the top 50% of the viewport to synchronized scrolling grand-staff notation alongside the falling Spell Highway.

---

## 7. Build Log

### 2026-11-06 — Session 1: PRD Review, Competitor Research, Tracking Files & Environment Check
- **What we did:**
  - Read [music_app_prd_and_handoff.md](file:///g:/My%20Drive/Projects/College%20of%20Keys/music_app_prd_and_handoff.md).
  - Created [Gemini.md](file:///g:/My%20Drive/Projects/College%20of%20Keys/Gemini.md), [context.md](file:///g:/My%20Drive/Projects/College%20of%20Keys/context.md), and [progress.md](file:///g:/My%20Drive/Projects/College%20of%20Keys/progress.md).
  - Researched open-source WebMIDI piano trainers (`Bewelge/MIDIano`, `Sightread`, `schollz/pianoai`, `atosystem/midi2Tiles`, `Tone.js`, `spotify/basic-pitch`) and documented key technical safeguards (Velocity-0 `NoteOff` handling, `Tone.context.lookAhead = 0` for <10ms latency, Wait Mode onset-only gating so sustained chords don't re-block, and shared `keyGeometry` table).

### 2026-11-06 — Session 2: GitHub Repo Setup, Node.js LTS & Phase 1 Implementation
- **What we did:**
  - Installed Node.js LTS (`v26.13.0` / `npm 11.20.0`) via `winget`.
  - Authenticated GitHub CLI (`kiyoshithekidd`), initialized local Git repo on `main`, and created/pushed the public remote repository https://github.com/kiyoshithekidd/college-of-keys.
  - Built **Phase 1: Electron Skeleton & Audio**:
    - [package.json](file:///g:/My%20Drive/Projects/College%20of%20Keys/package.json): Configured Electron, `tone`, and `@tonejs/midi`.
    - [main.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/main.js): Created the Electron window with automatic Chromium Web MIDI (`midi` & `midiSysex`) permissions.
    - [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html) & [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css): Built the Tavern Dark Mode HUD (MIDI device status pill, Instrument Tone selector, Volume slider, Sustain indicator, Active Glyphs readout) and responsive canvas stage.
    - [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js): Implemented the 61-key piano layout (`C2`–`C7`, 36 white keys, 25 black keys) on HTML5 Canvas, `navigator.requestMIDIAccess()` with hot-plug (`onstatechange`), velocity-0 `NoteOff`, Sustain Pedal (`CC 64`), persistent `Tone.PolySynth` (`lookAhead = 0`), and Mouse/QWERTY fallback.
### 2026-11-06 — Session 3: Upper-Register Piano Warmth Fix & Phase 2 Implementation
- **What we did:**
  - **Fixed Upper-Register (`C5`–`C7`) Piano Sharpness:** The raw Salamander Grand Piano V3 samples hosted by Tone.js are close-mic'd fortissimo (`v16`) hammer strikes, which sound warm around `C3` but overly bright/metallic above `C5`–`C6`. Added a warm Tavern EQ (`Tone.EQ3`: `+2.5 dB` low body `< 260 Hz`, `-8.5 dB` high-shelf cut `> 2.2 kHz`), a `3.1 kHz` `-12 dB/oct` low-pass filter (`Tone.Filter`), and pitch-dependent hammer velocity tapering above `C4` (`MIDI 60`).
  - **Built Phase 2 (MIDI Parsing, Octave Folding, Non-Destructive Multi-Track & Auto-Difficulty):**
    - Added the **Spell Scroll Bar** in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html) and [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css) with `.mid` file upload, full-window drag-and-drop `.mid` support, and a 1-click **Load Demo Spell** button (*Ballad of the Silver Flagon.mid*).
    - Implemented `@tonejs/midi` parsing (`parseMidiBuffer`) in [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js) with non-destructive multi-track categorization (`Track 1` RH Radiant Gold, `Track 2` LH Eldritch Blue, Middle-C split on single-track files, a **Highway Track Selector Dropdown** to play any track in the MIDI, and `backingBandTracks` preservation).
    - Implemented 61-key Octave Folding (`36–96`) with folded-note tracking (`Octave Folded` HUD chip) and static canvas preview of parsed glyphs (`drawStaticParsedNotesPreview`).
    - Implemented Notes Per Second (`NPS`) calculation and D&D 5E Spell Level difficulty badge assignment (`Cantrip`, `2nd-Level Spell`, `5th-Level Spell`, `9th-Level Spell`).
- **Current status:** Phase 2 verified (`"Testing successful"`).

### 2026-11-06 — Session 4: Phase 3 Implementation (The Spell Highway, Accompaniment & Backing Band)
- **What we did:**
  - Built the **60 FPS `requestAnimationFrame` Spell Highway** (`animationLoop` and `drawFallingSpellHighway`) in [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js), interpolating falling notes ($y = \text{strikeLineY} - (\text{noteTime} - \text{currentTime}) \times \text{fallSpeed}$) with scrolling beat/measure grid lines, **Radiant Gold** (Track 1 / RH) and **Eldritch Blue** (Track 2 / LH) glowing glyphs, and strike-line guide highlights on the 61-key piano.
  - Added **Transport & Timeline Controls** (`▶ Cast Spell` / `⏸ Pause`, `Spacebar` shortcut, `⏮ Restart`, timeline scrubber slider, `Tempo` `0.5x`–`1.25x`, and `Note Speed` `Slow`/`Normal`/`Fast`) in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html) and [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css).
  - Implemented **Hand Isolation (`Both`, `Track 1 Only`, `Track 2 Only`)**, **Accompaniment Routing (`Auto-Play Other Hand`, `Mute Other Hand`, `Auto-Play Both (Preview)`)**, and the **Rock Band-style Backing Band Toggle (`🎸 Backing Band: ON / OFF`)** synthesizing remaining MIDI tracks via a dedicated 24-voice `backingBandSynth`.
  - **Fixed Doubled/Duplicate MIDI Track Trap (`John_Legend_All_Of_Me.mid`):** Inspected `Midi Test Files/John_Legend_All_Of_Me.mid` and found that the MIDI arranger duplicated the Right Hand (`856` notes on Track 4 & Track 12) and Left Hand (`222` notes on Track 6 & Track 13) across two MIDI channels for volume. Previously, sorting by note count picked the two identical `856`-note RH tracks as `T1` and `T2` (drawing Gold directly over Blue and ignoring the `222`-note LH track). Added `areTracksDuplicates()` deduplication and Treble (`avgPitch >= 62`) + Bass (`avgPitch < 62`) piano track pairing so `T1 (RH Gold)` gets the `856`-note Right Hand and `T2 (LH Blue)` gets the `222`-note Left Hand.
  - Added startup auto-discovery for `.mid` files in `Midi Test Files/`, `Imports/`, and project root (`tryAutoLoadWorkspaceMidi`).
- **Current status:** Phase 3 verified (`"Testing successful"`).

### 2026-11-06 — Session 5: Phase 4 Implementation (Wait Mode & 100ms Chord Forgiveness)
- **What we did:**
  - Built **Wait Mode (`⏳ Wait Mode: ON / OFF`)** in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html), [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css), and [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js):
    - Implemented onset-only chord clustering (`CHORD_CLUSTER_WINDOW_SEC = 0.045`) across the player's active hand(s) so sustained bass notes never re-block playback while new note/chord onsets freeze `currentSongTime` cleanly at the strike line (`getNextPlayerChordGate`).
    - Implemented **100ms Chord Roll Forgiveness (`CHORD_GRACE_PERIOD_MS = 100`)**: pressing the notes of a multi-note chord within `100ms` registers as a clean rolled chord (`⚡ Clean 100ms Roll!`), while slower partial presses still lock in individual chord notes (`satisfiedPitches` highlighted in Emerald Green `#4ade80`) without losing progress.
    - Added live `#strike-zone-status` HUD indicator displaying required pitches (`⏳ Waiting: C4 + E4 + G4`), clean roll confirmation, or `> 2.0s` Wait Mode hesitation (`Fumbled Component` detection ready for Phase 5 XP math).
    - Automatically defaults Accompaniment to `Auto-Play Other Hand` when enabling Wait Mode so the player controls their selected hand(s) while Tone.js plays the accompanying hand.
- **Current status:** Phase 4 verified (`"Testing successful"`).

### 2026-11-06 — Session 6: Phase 5 Implementation (LitRPG Gamification UI: Combos, Bardic Inspiration, XP & Titles)
- **What we did:**
  - Built the **Top-Right LitRPG Bardic Progression & Spell Chain HUD (`#litrpg-hud-card`)** in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html), [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css), and [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js):
    - Displays live **Level (`LVL 1+`)**, **Bardic Title** (*Tavern Busker* at Lvl 1, *College Initiate* at Lvl 10, *Wandering Minstrel* at Lvl 20, *Court Virtuoso* at Lvl 30, *Spell-Singer* at Lvl 40, *Grand Maestro* at Lvl 50), **Total Career XP**, animated **Level XP Bar** (`1,000 XP` for Lvl 1 scaling by `1.5x` per level), **Spell Chain** combo counter, and **Effective XP Multiplier**.
    - Implemented **XP & Fumbled Component Math**: Clean note strikes grant `+10 XP` base (`\times` Spell Level multiplier `\times` Bardic Inspiration multiplier); pausing `> 2.0s` in Wait Mode flags a **Fumbled Component** (`+2 XP` base).
    - Implemented **Bardic Inspiration (`50+` Spell Chain)**: Reaching a `50` note streak activates a `2.0x` temporary XP multiplier, illuminates `#litrpg-hud-card` with an arcane gold/magenta aura, and adds a magenta-gold glow to the canvas Strike Zone line. Includes a `+25 Chain` testing shortcut button on the HUD card.
    - Persists the Bard profile to both `localStorage` and local `bard_profile.json`.
    - Built the **Post-Song "Performance Check" Modal (`#performance-check-modal`)** with a D&D 5E D20 Performance Roll (`1–20`), Level-Up banner, XP bar, and 6-stat performance breakdown, opening automatically at song completion or anytime via the **`🏆 Performance Check`** toolbar button.
- **Current status:** Phase 5 verified (`"Testing successful"`).

### 2026-11-06 — Session 7: Phase 6 Implementation (The Grimoire Sidebar & `Imports/` Folder Watcher)
- **What we did:**
  - Built **The Grimoire (`#grimoire-sidebar`)** on the left side of `#workspace-row` in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html), [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css), and [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js):
    - Displays all saved and discovered MIDI spells (with Title, D&D Spell Level Difficulty badge, XP multiplier, NPS, BPM, Duration, Source tag, and delete button for imported spells).
    - Added collapsible sidebar toggle (`📖 The Grimoire (Count)`) that dynamically recalculates the 61-key canvas geometry (`computeKeyGeometry()`), plus live search (`#grimoire-search-input`) and Spell Level filter (`#grimoire-filter-select`).
  - Implemented the **Active `Imports/` Folder Watcher (`initGrimoireAndWatcher` & `scanWatchedDirectories`)**:
    - Automatically creates `./Imports/` if missing and watches it via both `fs.watch` and a resilient `1.8s` directory poll (ensuring instant detection on Google Drive virtual mounts).
    - Auto-ingests new `.mid` files dropped into `./Imports/` (as well as indexing `./Midi Test Files/` and the Built-In Demo Spell), persists the library index to `localStorage` and `grimoire_library.json`, and displays a glowing toast notification (`#grimoire-toast`).
    - Added `💾 Save Active Spell to Grimoire`, `📂 Open Imports/`, and a 1-click **`⚡ Drop Test .mid in Imports/`** button (`dropTestMidiIntoImports`) that generates new multi-track D&D Bard `.mid` files directly inside `./Imports/` to test live folder-watcher ingestion.
- **Current status:** Phase 6 verified (`"Testing successful"`).

### 2026-11-06 — Session 8: Phase 7 Implementation (Arcane Particle Bursts, Shockwaves, Floating Runes & Tavern Dark Mode Polish)
- **What we did:**
  - Built the **60 FPS HTML5 Canvas Arcane Particle System (`spawnKeyParticleBurst`, `spawnFloatingCanvasRune`, `updateAndDrawAmbientMotes`, `updateAndDrawStrikeParticles`)** in [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js):
    - Spawns upward fountains of 4-point Arcane Stars, Diamonds, and Glowing Orbs with gravity/drag physics, expanding elliptical **Strike-Line Shockwave Rings**, and rising **Floating XP / Roll Runes** (`+20 XP`, `⚡ +60 XP ROLL!`, `🔥 +40 XP!`) directly above the struck keys.
    - Color-themes bursts automatically: **Radiant Gold** (`#ffd700` for Right Hand / treble keys), **Eldritch Blue** (`#00e5ff` for Left Hand / bass keys), **Emerald-Gold Nova** (`#34d399` for 100ms Chord Rolls), and **Astral Magenta & Gold** (`#e879f9` during `50+` Bardic Inspiration).
    - Added 28 drifting **Ambient Tavern Arcane Dust Motes** across the Spell Highway background and a celebratory 9-key particle wave when triggering `+25 Chain` / Bardic Inspiration.
  - Polished the **Tavern Dark Mode CSS** in [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css) with `@keyframes arcaneCrestPulse`, `@keyframes inspirationAuraPulse`, stage inner vignette, and illuminated brass/gold borders.
- **Current status:** Phase 7 implemented. Waiting for user verification (`"Testing successful"`).

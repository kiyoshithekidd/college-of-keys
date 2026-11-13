# College of Keys — Build Log, Plan & Decisions

> **Critical Execution Rule:** Never execute multiple phases at once. At the end of every single phase, STOP, provide testing instructions for the current state, and wait for explicit user confirmation (`"Testing successful"`) before writing any code for the next phase.
>
> **Mandatory Pre-Build Engineering & UI/UX Gate (Senior Rhythm/Learning Game Standard):**
> 1. **Plan First, Code Second:** Act as a senior developer specializing in rhythm games and music-learning games. Before writing any code for a work item, present the implementation plan and ask any clarifying questions.
> 2. **UI/UX Subagent Pass:** Before building any work item, dispatch a separate subagent to perform a UI/UX review (checking layout, visual hierarchy, Tavern Dark Mode cohesion, persona fit, responsive behavior, accessibility, and whether new visual assets are needed).
> 3. **Asset Prompts:** If the UI/UX pass identifies any needed visual assets, provide a ready-to-use Gemini image generation prompt for the user.
> 4. **Decision Check Before Build:** Surface all unclear UX/product decisions from both the engineering plan and UI/UX review and wait for the user's go-ahead before coding.
>
> **Mandatory Post-Build Peer Review & QA Gate:**
> 5. **Peer Review & QA Subagent Pass:** After building a work item and before passing it to the user for UAT (`"Testing successful"`), dispatch a separate Peer Review & QA subagent to audit the diff, edge cases, UI/UX alignment, and automated verification checks. Fix any findings before opening/finalizing the PR for UAT.

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
| 2026-11-06 | **Decoupled Python CLI for `yt-dlp` + `basic-pitch` (+ Backing Audio / Stems)** | Keeps heavy ML/audio dependencies out of the Electron binary; outputs both `.mid` and optional synced backing audio into `Imports/` for Rock Band-style play-along. | Implemented (Phase 8) |
| 2026-11-07 | **2-Bar Conservatory Layout & Popovers (`v1.1.0`)** | Replaced 7 stacked rows of top chrome with a slim 2-bar layout, reclaiming ~82% stage height. Secondary setup moved into `⚙ Audio & Keys` and `ⓘ Details` popovers; live HUD moved to a translucent top-center highway pill with zero note-lane occlusion. | Implemented (Phase 10) |
| 2026-11-07 | **Persona-Driven Roadmap & Prioritization Engine (`PERSONAS.md` & `context.md`)** | Established 6 user personas as the foundational engine used to prioritize enhancements, sequence next build phases, and classify/log all bugs and enhancements on GitHub. High persona convergence dictates immediate sprint priorities. | Approved |
| 2026-11-07 | **Strict Single-Issue Execution & Bug Classification Standard (`context.md`)** | Codified mandatory bug vs. enhancement classification, persona tagging, and micro-targeted one-at-a-time bug execution protocol. | Active |

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
  - `1.5 to <2.0 NPS`: **1st-Level Spell** (`1.1x` XP)
  - `2.0 to <2.6 NPS`: **2nd-Level Spell** (`1.2x` XP)
  - `2.6 to <3.3 NPS`: **3rd-Level Spell** (`1.3x` XP)
  - `3.3 to <4.0 NPS`: **4th-Level Spell** (`1.4x` XP)
  - `4.0 to <4.8 NPS`: **5th-Level Spell** (`1.5x` XP)
  - `4.8 to <5.8 NPS`: **6th-Level Spell** (`1.6x` XP)
  - `5.8 to <6.9 NPS`: **7th-Level Spell** (`1.7x` XP)
  - `6.9 to <8.0 NPS`: **8th-Level Spell** (`1.8x` XP)
  - `8.0+ NPS`: **9th-Level Spell** (`2.0x` XP)
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

- [x] **Phase 7: UI Polish & Particle Effects (Completed & Verified)**
  - Add HTML5 canvas particle bursts on note hits at the strike line.
  - Polish the Tavern Dark Mode aesthetic (arcane glow, typography, parchment/obsidian styling).
  - *Gate 7: Passed (`"Testing successful"`).*

- [x] **Phase 8: Python ML Extraction (`yt-dlp` + `basic-pitch` + Backing Track CLI) (Completed & Verified)**
  - Create decoupled Python directory/CLI outside the Electron bundle.
  - Build pipeline to download YouTube audio via `yt-dlp`, optionally split stems (via `demucs` if installed) or preserve synced backing audio (`.mp3`/`.wav`), transcribe piano/melody to `.mid` via `basic-pitch` (with built-in polyphonic spectral audio-to-MIDI fallback for Python 3.14), and drop into `Imports/`.
  - *Gate 8: Passed (`"Testing successful"`).*

- [x] **Phase 9: "The Quest Board" (In-App Sourcing) (Completed & Verified)**
  - Add in-app "Paste YouTube URL" input that spawns the Phase 8 Python CLI in the background with status feedback.
  - Add quick-link buttons opening external browser tabs for BitMIDI, VGMusic, and YouTube.
  - *Gate 9: Passed (`"Testing successful"`).*

- [x] **Phase 10: 2-Bar Conservatory UI/UX Overhaul & Quality Remediation (Completed & Verified in v1.1.0–v1.1.2)**
  - Replaced 7-row top chrome with a streamlined 2-bar layout (`#tavern-header` + `#spell-scroll-bar`), reclaiming ~82% stage height.
  - Added inline *Baldur's Gate 3*-style Bardic Character Banner, translucent top-center Highway HUD pill (`#highway-center-hud`), and popovers (`⚙ Audio & Keys`, `ⓘ Details`).
  - Implemented Unified 1-Click Practice Mode Selector (`#practice-mode-select`).
  - Resolved post-overhaul and rhythm-game/audio quality findings (Issues #31–#38, #44–#51, and #55–#60).
  - *Gate 10: Passed (`"Testing successful"`).*

---

## 6. Persona Mapping, Prioritization & The Living Roadmap

> **Core Product Principle:** Persona mapping ([`PERSONAS.md`](./PERSONAS.md)) is the primary engine used to prioritize enhancements, schedule upcoming build phases, and log all bugs and enhancements on GitHub. The GitHub Issue Tracker serves as the living, persona-mapped roadmap.

### 6.1 Purpose of the Persona Framework
Persona mapping is not a decorative design exercise—it is the operational filter for all product decisions, architectural trade-offs, and sprint planning:
1. **Prioritizing Next Phases & Enhancements:** Every new feature, gameplay mode, or UI screen must be justified by the persona(s) it unblocks. When deciding what phase to build next, candidates are ranked by their persona impact and convergence.
2. **GitHub Issue Authoring & Triage:** Every defect and feature request logged on [GitHub Issues](https://github.com/kiyoshithekidd/college-of-keys/issues) MUST be classified as either `bug` or `enhancement` and tagged with its target persona label(s).
3. **Roadmap Architecture:** The roadmap is dynamic and issue-driven rather than a static list. High-convergence issues that satisfy multiple core personas simultaneously form the immediate roadmap queue.
4. **Anti-Persona Guardrails:** The *Conservatory Purist* anti-persona explicitly protects the app from feature bloat that alienates the core audience (e.g., no forced classical curriculum, no mandatory music theory gates, and no stripping of the tavern/bard skin).

### 6.2 Persona Priority Hierarchy
- **Rank 1 — Main Personas (Core Priority):**
  - **The Returning Adult (`persona: returning-adult`):** Busy adult beginner (Kiyoshi's direct profile). Needs favorite songs (pop, pop-punk, musicals), short 10–15 min practice bursts, a visible difficulty ladder for a single song, and Duolingo-style daily streak mechanics so practice becomes a daily habit.
  - **The Gamer Bard (`persona: gamer-bard`):** Here for the RPG loop first, keyboard as the controller. Needs character growth (levels, titles, XP), rotating quests/bounties, d20 performance checks, and consistent tavern immersion.
  - **The Rock Band Player (`persona: rock-band`):** Rhythm game veteran. Demands arcade polish, fair timing, 100ms chord roll forgiveness, zero-latency audio, and score/accuracy chasing.
- **Rank 2 — Close Second:**
  - **The Casual Song Player (`persona: casual-player`):** Shortest possible path from a YouTube/MIDI link to playing keys with zero friction and no mandatory lessons.
- **Rank 3 — Tentative:**
  - **The Young Learner (`persona: young-learner`):** Musical teens who play D&D and game. Needs clean visual difficulty steps without being patronized with childish interfaces.
- **Rank 4 — Anti-Persona:**
  - **The Conservatory Purist (`persona: conservatory-purist`):** Demands dry, classical-only pedagogy. Serves as a negative test: if a feature only serves the purist, it is rejected.

### 6.3 Persona Convergence: The Next Phase Prioritization Filter
When selecting upcoming enhancements from the GitHub backlog, items that exhibit **Persona Convergence** (simultaneously unblocking multiple core personas) take highest priority:

| Backlog Issue | Target Personas | Why It Ranks High on the Roadmap |
| :--- | :--- | :--- |
| **[#52 Main Menu / Title Screen (The Tavern)](https://github.com/kiyoshithekidd/college-of-keys/issues/52)** | `persona: returning-adult`<br>`persona: gamer-bard` | Replaces cluttered in-game toggles with an immersive tavern landing hub; gives the Returning Adult a clean start and the Gamer Bard a tangible world. |
| **[#66 Practice Streak Calendar](https://github.com/kiyoshithekidd/college-of-keys/issues/66)** | `persona: returning-adult`<br>`persona: gamer-bard` | Implements Duolingo-style daily habit tracking, streak freezes, and daily XP goals for busy adults. |
| **[#53 Daily Quest System](https://github.com/kiyoshithekidd/college-of-keys/issues/53)** | `persona: returning-adult`<br>`persona: gamer-bard` | Provides bite-sized 10-minute practice objectives (bounties) with bonus XP and d20 inspiration dice. |
| **[#30 Loop Practice Mode (Rehearsal)](https://github.com/kiyoshithekidd/college-of-keys/issues/30)** | `persona: returning-adult`<br>`persona: rock-band` | Adds A-B phrase looping on the timeline scrubber so players can rehearse difficult measures at customizable tempo. |
| **[#63 Practice Tempo Control](https://github.com/kiyoshithekidd/college-of-keys/issues/63)** | `persona: returning-adult`<br>`persona: young-learner` | Allows stepping tempo down to 50% or 75% without pitch shift to build finger muscle memory gradually. |
| **[#43 Epic A: Spell-Singing (Vocals)](https://github.com/kiyoshithekidd/college-of-keys/issues/43)** | `persona: rock-band`<br>`persona: casual-player` | Unlocks microphone pitch detection and horizontal vocal highway (*Let's Sing* / *Lips* style) for group and duo tavern play. |
| **[#41 Epic B: AI Stem Separation (`Demucs`)](https://github.com/kiyoshithekidd/college-of-keys/issues/41)** | `persona: rock-band`<br>`persona: casual-player` | Separates YouTube/MP3 audio into vocals, drums, bass, and piano so players can mute *only* the piano while playing along with real stems. |
| **[#39 Epic C: Scrolling Sheet Music Split View](https://github.com/kiyoshithekidd/college-of-keys/issues/39)** | `persona: returning-adult`<br>`persona: young-learner` | Synchronized grand-staff notation above the highway so visual learners transfer highway muscle memory into real sight-reading skills. |

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
- **Current status:** Phase 7 verified (`"Testing successful"`), committed and pushed to GitHub (`b076cbc`).

### 2026-11-06 — Session 9: Phase 8 Implementation (Decoupled Python ML Extraction CLI: `yt-dlp` + `basic-pitch` / Polyphonic Audio-to-MIDI)
- **What we did:**
  - Created the decoupled `./python_ml` directory ([python_ml/transcribe_quest.py](file:///g:/My%20Drive/Projects/College%20of%20Keys/python_ml/transcribe_quest.py), [python_ml/requirements.txt](file:///g:/My%20Drive/Projects/College%20of%20Keys/python_ml/requirements.txt), [python_ml/setup_ml_env.bat](file:///g:/My%20Drive/Projects/College%20of%20Keys/python_ml/setup_ml_env.bat), [python_ml/run_transcriber.bat](file:///g:/My%20Drive/Projects/College%20of%20Keys/python_ml/run_transcriber.bat), and [python_ml/README.md](file:///g:/My%20Drive/Projects/College%20of%20Keys/python_ml/README.md)):
    - **YouTube & Local Audio Ingestion (`download_youtube_audio` & `ensure_wav_44k`):** Downloads YouTube audio via `yt-dlp` (`python -m yt_dlp` or CLI) or accepts local `.wav`/`.mp3`/`.flac` files, normalizes audio to 16-bit 44.1kHz PCM `.wav`, and preserves the synced backing audio in `./Imports/` alongside the transcribed `.mid` scroll.
    - **Dual-Engine Polyphonic Audio-to-MIDI Transcriber:**
      1. **Tier 1 (`try_basic_pitch_transcription`):** Uses Spotify's `basic-pitch` (`basic_pitch.inference.predict_and_save`) when installed on Python 3.10–3.12.
      2. **Tier 2 (`transcribe_wav_polyphonic` + `write_multi_track_midi`):** Built-in polyphonic spectral peak-tracking transcriber across MIDI pitches `36..96` (`C2`–`C7`) with overtone suppression, onset/duration tracking, and pure-Python Standard MIDI File (Format 1) generation split into Track 1 (RH) and Track 2 (LH)—ensuring 100% native compatibility on **Python 3.14** without requiring C++ compiler chains.
    - **Zero-Config `--self-test` Mode:** Synthesizes a stereo polyphonic audio recording (*The Bard's Arcane Prelude*, `.wav`), runs the polyphonic audio-to-MIDI transcriber on that `.wav` file, and drops both `<Title>.mid` and `<Title>.wav` into `./Imports/` so the running Electron app's Phase 6 Grimoire folder watcher auto-ingests it live.
    - **Structured JSON Progress Output (`[QUEST_STATUS]`):** Emits real-time JSON progress updates on `stdout` ready for Phase 9's in-app **Quest Board**.
- **Current status:** Phase 8 verified (`"testing was successful"`).

### 2026-11-06 — Session 10: Phase 9 Implementation ("The Quest Board": In-App YouTube-to-MIDI Sourcing & External Archive Quick-Links)
- **What we did:**
  - Built **The Quest Board (`#quest-board-modal` & `#btn-open-quest-board`)** in [index.html](file:///g:/My%20Drive/Projects/College%20of%20Keys/index.html), [styles.css](file:///g:/My%20Drive/Projects/College%20of%20Keys/styles.css), and [renderer.js](file:///g:/My%20Drive/Projects/College%20of%20Keys/renderer.js):
    - **In-App YouTube-to-MIDI Spawner (`runQuestBoardTranscriber`):** Lets the user paste any YouTube URL (or local `.wav`/`.mp3` path) and optional custom spell title, or click **`⚡ Run ML Self-Test (2s)`**, spawning `python_ml/transcribe_quest.py` in the background (`child_process.spawn`).
    - **Live Progress Bar & Console Stream:** Parses `[QUEST_STATUS]` JSON lines on `stdout` in real time to animate `#quest-progress-fill` (`0%` $\rightarrow$ `100%`), update `#quest-status-badge`, stream logs to `#quest-log-output`, trigger immediate `./Imports/` folder-watcher ingestion into **The Grimoire**, and reveal a 1-click **`▶ Load "<Title>" Now`** button (`#btn-quest-load-result`).
    - **Synced Backing Audio Playback (`backingAudioEl`):** When a song in `./Imports/` has a paired `.wav`/`.mp3`/`.m4a`/`.ogg` backing track and **`🎸 Backing Band: ON`** is enabled, synchronizes and plays the audio alongside the falling notes!
    - **External Bardic Archives (`shell.openExternal`):** Added 1-click cards in The Quest Board that open the default web browser to **BitMIDI** (`https://bitmidi.com`), **VGMusic** (`https://www.vgmusic.com`), and **YouTube** (`https://www.youtube.com`), plus a **`📂 Open ./Imports Folder`** shortcut.
- **Current status:** All 9 MVP phases (`Phase 1` through `Phase 9`) completed and verified!

### 2026-11-07 — Session 11: Full Codebase Review, GitHub Issue Logging (`#1`–`#8`) & `v0.9.1` Remediation Pass
- **What we did:**
  - Conducted a full architectural, performance, gameplay, and security code review across `main.js`, `index.html`, `styles.css`, `renderer.js`, `python_ml/transcribe_quest.py`, and `package.json`.
  - Logged 8 tracked GitHub Issues (`#1` through `#8`) on https://github.com/kiyoshithekidd/college-of-keys/issues.
  - Implemented and verified fixes for all 8 issues (`v0.9.1`):
    1. **Issue #1 (`H1`):** Fixed Arcade Mode (`Wait Mode: OFF`) resetting `playbackState.activeStrikeGroup` every frame so `100ms` Chord Roll Forgiveness works in Arcade Mode.
    2. **Issue #2 (`H2`):** Restored `#qwerty-octave-label` in `index.html` and added null-safety in `updateQwertyOctaveLabel()`.
    3. **Issue #3 (`H3`):** Fixed `Spacebar` and QWERTY keys being blocked after interacting with `<input type="range">` sliders.
    4. **Issue #4 (`M1`):** Paused synchronous `1.8s` folder-watcher polling during active playback (`playbackState.isPlaying`) to prevent cloud-drive metadata hitches.
    5. **Issue #5 (`M2`):** Cached canvas dimensions and pre-allocated shared 61-key `LinearGradient` objects (`cachedKeyGradients`) in `computeKeyGeometry()`, eliminating `3,660` gradient allocations/sec and per-frame `getBoundingClientRect()` layout reads.
    6. **Issue #6 (`M3`):** Unified `extractGrimoireEntryFromBuffer()` and `assignSongTracksAndDifficulty()` so Grimoire cards and the Spell Inspector HUD report identical note counts and NPS.
    7. **Issue #7 (`M4`):** Linked `backingAudioEl.volume` to the `#master-volume` slider and unlinked paired `.wav`/`.mp3` files when deleting a Grimoire entry.
    8. **Issue #8 (`L2` & `L3`):** Restricted Electron permission auto-grants in `main.js` to `['midi', 'midiSysex', 'media']` and synced `package.json` version.
  - **UI & Input Polish (`v1.0.0` First Official Release):**
    - Removed `#phase1-helper-banner` from the Spell Highway canvas so the falling note view is completely unobstructed.
    - Added `#qwerty-pill` (`QWERTY: C4–E5` with `Z ◀` / `▶ X` buttons) in the top header, capture-phase `KeyZ`/`KeyX` handling, and on-key `[A]`–`[;]` labels + gold range bar on the 61-key piano that slide across octaves (`C2–E3` to `C6–C7`) with floating runes.
    - Packaged standalone Windows x64 release (`College-of-Keys-v1.0.0-win32-x64.zip`) and published GitHub Release `v1.0.0`.
- **Current status:** `v1.0.0` verified, packaged, and released on GitHub (`"Testing successful"`).

### 2026-11-07 — Session 12: Rhythm-Game & Piano-Pedagogy QA Review (`Issues #9`–`#17`) & `v1.0.1` Patch
- **What we did:**
  - Conducted a specialized Rhythm-Game & Piano-Pedagogy QA code review and logged 9 GitHub Issues (`#9` through `#17`) on https://github.com/kiyoshithekidd/college-of-keys/issues.
  - Implemented fixes for all 9 issues in `v1.0.1`:
    1. **Issue #9 (`High`):** Prevented held keys (`consumedByStrikeGroup`) and Sustain Pedal (`sustainedOnly`) from auto-clearing repeated notes in Wait Mode.
    2. **Issue #10 (`High`):** Synchronized Wait Mode accompaniment & backing band triggers at `anchorTime` so they sound when the player unlocks the gated chord rather than firing early while frozen.
    3. **Issue #11 (`High`):** Added off-key strike penalties in Arcade Mode (`Wait Mode: OFF`) and atomic missed-chord expiration.
    4. **Issue #12 (`High`):** Ignored duplicate re-strikes of already-locked chord notes and honored `!group.hasSlowRoll` for `100ms` chord roll forgiveness.
    5. **Issue #13 (`Medium`):** Ordered backing audio copy before `.mid` creation in `python_ml/transcribe_quest.py` and added late backing-audio detection in `scanWatchedDirectories()`.
    6. **Issue #14 (`Medium`):** Deduplicated simultaneous same-pitch notes created by 61-key Octave Folding (`foldAndFormat`).
    7. **Issue #15 (`Medium`):** Eliminated per-note `createLinearGradient` allocations inside `drawFallingSpellHighway()`.
    8. **Issue #16 (`Medium`):** Added `window` `blur` cleanup for held QWERTY and mouse keys.
    9. **Issue #17 (`Low`):** Added `window` `beforeunload` cleanup for `activeQuestChildProcess`.

### 2026-11-07 — Session 13: Phase 10 (2-Bar Conservatory UI/UX Overhaul `v1.1.0`) & Code Review Remediation (`Issues #31`–`#38`, `v1.1.1`)
- **What we did:**
  - Completed the **Phase 10 2-Bar Conservatory UI/UX Overhaul (`v1.1.0`, `Fixes #18–#22`)** consolidating the top interface into `#tavern-header` (Bar 1) and `#spell-scroll-bar` (Bar 2) with `#settings-popover`, `#spell-details-popover`, and `#highway-center-hud`.
  - Conducted a full post-overhaul code review across `renderer.js`, `index.html`, `styles.css`, `main.js`, `python_ml/transcribe_quest.py`, and `start.bat`, logging 8 GitHub Issues (`#31` through `#38`) on https://github.com/kiyoshithekidd/college-of-keys/issues and implementing all fixes in **`v1.1.1`**:
    1. **Issue #31 (`High`):** Added `syncBackingAudioElement(currentTime)` so `backingAudioEl` pauses during Wait Mode freezes (`isWaitingForStrike`) and when `🎸 Band: OFF` is toggled, and seeks accurately on slider input or restart.
    2. **Issue #32 (`High`):** Added `hasUpcomingPlayerNoteMatchingMidi()` in `evaluateStrikeZoneInput()` so an unhit note in the `25ms` late-grace tail in Arcade Mode expires cleanly instead of blocking the `130ms` early-strike window of the next note and double-penalizing the player.
    3. **Issue #33 (`High`):** Added `isAnyModalOpen()` to the capture-phase `keydown` listener so `Escape` closes `#performance-check-modal` and `#quest-board-modal` and `Spacebar` / `Z` / `X` / `A`–`;` are blocked while any modal is open.
    4. **Issue #34 (`Medium`):** Updated `tryAutoLoadWorkspaceMidi()` to fall back to `loadBuiltInDemoSpell()` when no `.mid` file is present in the workspace or `./Imports/`.
    5. **Issue #35 (`Medium`):** Enforced `min-width: 175px` on `#spell-metadata-panel` and responsive `@media (max-width: 1280px)` rules in `styles.css` so `#spell-name-display` never collapses to `0px` at `1024px–1200px` window widths.
    6. **Issue #36 (`Medium`):** Preserved `autoTriggered` state at `currentTime` when switching `#practice-mode-select` mid-wait, restored `lastNonPreviewPracticeMode` when toggling `Wait: ON` out of `Listen Only`, and displayed `'Listen Only Mode (Auto-Playing Both Hands)'` on restart in `preview` mode.
    7. **Issue #37 (`Medium`):** Dynamic time-signature measure lines (`beatsPerMeasure` from `midiData.header.timeSignatures`) in `drawFallingSpellHighway()` and `file.path` forwarding for File Picker / Drag-and-Drop backing audio discovery.
    8. **Issue #38 (`Low`):** Portable `start.bat` Electron path resolution, `'—'` accuracy display when `0` notes are attempted in `#performance-check-modal`, and `URL.revokeObjectURL()` cleanup inside `grandPianoSampler`'s `onload` callback.

### 2026-11-07 — Session 14: Deep-Dive Code Review & `v1.1.2` Remediation (`Issues #44`–`#51`)
- **What we did:**
  - Conducted a follow-up deep-dive code review across `renderer.js`, `index.html`, `styles.css`, `main.js`, and `python_ml/transcribe_quest.py`, logging 8 GitHub Issues (`#44` through `#51`) on https://github.com/kiyoshithekidd/college-of-keys/issues and implementing all fixes in **`v1.1.2`**:
    1. **Issue #44 (`High`):** Extracted shared `foldAndDeduplicateHandNotes()` helper used by both `assignSongTracksAndDifficulty()` and `extractGrimoireEntryFromBuffer()` so Grimoire cards and the Active Spell HUD always report identical octave-folded note counts, NPS, and Spell Level tiers.
    2. **Issue #45 (`High`):** Updated the held-key arrival check (`isFreshEarlyPress`) in `animationLoop()` to track `firstStrikeMs`, `lastStrikeMs`, and `hasSlowRoll`, validate `100ms` chord rolls (`isCleanChordRoll`), and update `setStrikeStatusBadge()`.
    3. **Issue #46 (`High`):** Updated Arcade Mode (`Wait Mode: OFF`) in `animationLoop()` to cluster earliest unsatisfied player notes via `getNextUnsatisfiedStrikeGroup()` so unstruck staggered chords expire atomically once per chord.
    4. **Issue #47 (`Medium`):** Reset `songSessionStats` when `startPlayback()` rewinds a finished song and cleared `songSessionStats.hasShownEndModal = false` when scrubbing `#song-progress-slider` backwards.
    5. **Issue #48 (`Medium`):** Copied paired backing audio (`currentSong.backingAudioPath`) into `./Imports/` inside `saveActiveSpellToGrimoire()` and preserved triggered note state at `currentTime` in `assignSongTracksAndDifficulty()`.
    6. **Issue #49 (`Medium`):** Added 8/16/24/32-bit PCM `.wav` decoding in `python_ml/transcribe_quest.py` (`read_wav_mono_float()` & `convert_audio_to_pcm_wav()`) and guarded `write_standard_midi_file()` against empty tracks or 0-note MIDI output.
    7. **Issue #50 (`Medium`):** Added `clearAllHeldInputNotes()` in `resetPlaybackToStart()` so held keys and sustain state are cleared when loading a new song or restarting playback.
    8. **Issue #51 (`Low`):** Dismissed open popovers on `canvas` `mousedown` and refined `.active-spell` path matching in `renderGrimoireSidebar()`.

### 2026-11-07 — Session 15: Personas Specification, Classification Policies & Remediation Pass (Issues #55–#60, v1.1.2)
- **What we did:**
  - Codified the core user personas in [`PERSONAS.md`](./PERSONAS.md) (*The Returning Adult*, *The Gamer Bard*, *The Rock Band Player*, *Casual Song Player*, *Young Learner*, *Conservatory Purist*) and established the mandatory persona tagging & bug/enhancement classification policy in [`context.md`](./context.md).
  - Codified the mandatory one-at-a-time bug fix execution protocol in [`context.md`](./context.md) with minimal-diff micro-targeted changes.
  - Addressed and resolved rhythm-game, layout, and stability issues (`Issues #55` through `#60`) in **`v1.1.2`**:
    1. **Issue #55 (`UI`):** Built responsive layout rules for Bar 1 (`#tavern-header`) and Bar 2 (`#spell-scroll-bar`) down to 1024px, preventing button wrapping, XP bar collisions, and right-edge clipping.
    2. **Issue #56 (`Audio`):** Eliminated the Wait Mode audio dead-zone by ensuring pending note triggers fire cleanly upon unfreezing.
    3. **Issue #57 (`Grimoire`):** Pruned deleted disk files from the local Grimoire index during folder scans and nullified orphaned active backing audio elements.
    4. **Issue #58 (`MIDI`):** Cleared all held active input notes upon physical MIDI controller disconnect and filtered out modal dialog and channel 10 MIDI events.
    5. **Issue #59 (`Highway`):** Calculated measure and beat line durations (`beatDur`) using the time signature denominator for compound and asymmetric meters (e.g. 6/8, 12/8).
    6. **Issue #60 (`UI/Gameplay`):** Fixed chord roll badge text, elevated modal z-index stacking above popovers, and normalized Windows path separators in Python batch scripts.
- **Current status:** Release `v1.1.2` is published on GitHub. Active development is consolidated on isolated feature branch `feature/issue-52-tavern-main-menu` with PR #70 open for review.

### 2026-11-09 — Session 16: Consolidation, Painterly Fantasy Art & Tavern Main Menu Polish (Issues #52, #67, #68)
- **What we did:**
  - **Branch & Assets Consolidation:** Switched to `feature/issue-52-tavern-main-menu`, fast-forward pulled remote fixes from commit `5de5f06` (fixing Issue #67), and committed all AI-generated painterly fantasy 16:9 art backdrops and transparent toolbar icons:
    - `assets/images/menu/tavern-menu-scene.png`
    - `assets/images/practice/practice-stage-backdrop.png`
    - `assets/images/quest-board/quest-board-closeup.png`
    - `assets/images/grimoire/grimoire-open-book.png`
    - `assets/images/logo/title-logo-crest-transparent.png`
    - `assets/images/profile/bard-profile-banner.png`
    - `assets/images/icons/*.png`
  - **Issue #68 Follow-Up Remediation:**
    1. **Storage Single Source of Truth:** Stored song performance history exclusively in `song_stats.json` and `SONG_STATS_STORAGE_KEY` via `saveSongStats()`, removing redundant nested `songHistory` in `bard_profile.json`.
    2. **Content-Hash Keying:** Keyed song history on stable content SHA1 hashes (`crypto.createHash('sha1').update(rawBuffer).digest('hex')`) so saving active spells to the Grimoire never splits or duplicates play history. Added automatic migration and duplicate merging on boot.
    3. **DOM Security (No `innerHTML`):** Rebuilt the Rehearsal Ledger in `openBardAnnalsModal()` using `createElement` and `textContent`, strictly coercing stored numeric values.
    4. **Dynamic Version Tag:** Populated the Tavern footer version tag dynamically from `package.json` on boot.
    5. **Focus & A11y Management:** Set `inert` on `#tavern-header`, `#spell-scroll-bar`, and `#stage-container` while `#tavern-main-menu` is active. Added focus tracking and automatic return on modal close, plus keyboard `Tab` / `Shift-Tab` focus cycling within open dialogs.
    6. **Painterly Scene Hotspot Layout:** Replaced the plain grid with a 16:9 scene viewport overlaying `tavern-menu-scene.png`, positioning interactive stations over scene landmarks (Stage, Bookshelf, Notice Board, Tuning Corner, Trainer's Guild, and Hearth Rug Bard Card) with automated card-grid fallback below 950px width.
    7. **Window Edge Breathing Room:** Added padding and flex compression to Bar 1 and Bar 2 to eliminate right-edge window control clipping.
  - **Pull Request Created:** Opened PR [#70](https://github.com/kiyoshithekidd/college-of-keys/pull/70) from `feature/issue-52-tavern-main-menu` to `main` referencing #52, #67, and #68. User tested and confirmed (`"testing succesful"`), PR #70 merged into `main` (`76bd9e4`), closing Issues #52, #67, and #68.

### 2026-11-09 — Session 17: Title Splash Opener, Palette Overhaul & Station UX (Issue #71)
- **What we did:**
  - Created and tracked [Issue #71](https://github.com/kiyoshithekidd/college-of-keys/issues/71) on GitHub based on UI/UX game design review and user feedback.
  - Created isolated feature branch `feature/issue-71-title-splash-and-station-ux` from `main` (`76bd9e4`).
  - **Theatrical Title Splash Opener (`#tavern-title-splash`):**
    - Added full-screen atmospheric opener overlay displaying the painterly tavern scene, glowing fireplace and lanterns, title crest logo, and a pulsing golden button prompt: `★ Press Any Key, Click, or Strike a Piano Key to Enter ★`.
    - Handled interaction via mouse click, any keyboard keypress (`keydown`), or physical 61-key MIDI key strike (`status === 0x90 && velocity > 0`).
    - Integrated `playTavernWelcomeChord()`: arpeggiates a warm C-Major sampler chord (`C3`, `G3`, `C4`, `E4`, `G4`, `C5`) and resumes `Tone.context`, priming Web Audio immediately with a user gesture so first-note highway latency is eliminated.
    - Added `hasEnteredTavernSession` flag: returning to the Tavern mid-session (via the `🏰 Tavern` header button) bypasses the splash and returns directly to the interactive stations.
  - **Station Swap & F-Pattern UX:**
    - Swapped **The Hearth Stage (Continue Practice)** to the upper stage archway (`top: 20%; left: 3%`), framing the lute as the primary Hero CTA.
    - Moved **Trainer's Guild (How to Play)** down to the lower floor corner nook (`bottom: 5.5%; left: 3%`) with utility styling for unobtrusive onboarding.
  - **Tavern Palette Overhaul (Aged Walnut & Burnished Brass):**
    - Replaced all generic synthwave purple gradients across root variables, station cards, panels, and modals (`--bg-obsidian: #0c0907`, `--bg-tavern-panel: #18130e`, `--bg-tavern-card: #221a14`, `--text-muted: #baab93`).
    - Clothed The Hearth Stage card in warm **Forest Velvet** (`rgba(22, 38, 28, 0.96)`) to diegetically harmonize with the stage's emerald velvet curtains.
    - Grounded cards in **Aged Walnut & Smoked Oak** (`rgba(26, 19, 14, 0.94)`) and framed them with **Burnished Brass** and **Toasted Parchment**.
  - **Visual Hierarchy & Micro-Cues:**
    - Built 3 distinct visual button tiers: Tier 1 Hero CTA (The Hearth Stage with radiant gold border and prominent play glyph), Tier 2 Content Discovery (The Grimoire with Arcane Cyan accent and The Quest Board with Amber Wax Notice accent), Tier 3 Utilities (How to Play & Tuning Corner with subtle bronze borders).
    - Added subtle hover glow and `📜` scroll icon cue to the Bard Character Spotlight card to indicate it opens the Bardic Annals.
- **Current status:** Merged into `main` in PR #72 (`cf71cf4`) and hotfixed in PR #73 (`96c50b7`). Issue #71 closed.

### 2026-11-09 — Session 18: Flippable Grimoire Spellbook Sorted by Difficulty (Issue #69)
- **What we did:**
  - Reviewed user feedback: *"The Grimoire should really be its own pop up menu/module"*, corresponding to backlog [Issue #69](https://github.com/kiyoshithekidd/college-of-keys/issues/69).
  - Created isolated feature branch `feature/issue-69-grimoire-spellbook` from latest `main` (`96c50b7`).
  - **Retired Sidebar for Full-Screen Tome:**
    - Removed legacy `<aside id="grimoire-sidebar">`, permanently restoring the 61-key canvas and Spell Highway to 100% stage width.
    - Added full-screen `#grimoire-spellbook-modal` with `.spellbook-backdrop-frame` displaying the front-on open book art (`assets/images/grimoire/grimoire-open-book.png` at 16:9 aspect ratio).
  - **10-Tier Difficulty Sorter & Navigation:**
    - Built `SPELLBOOK_TIERS` supporting all 10 D&D spell levels in order (Cantrip, 1st through 9th level) with accurate level titles, descriptions, roman numerals, and XP multipliers.
    - Organized every cataloged spell onto the spread matching its auto-calculated difficulty tier.
    - Added 3D perspective flip animations (`.flipping-forward`, `.flipping-backward`) and acoustic grace-note paper chime (`playSpellbookPageTurnSound()`) on turn.
    - Added Previous / Next tier navigation buttons, 10 bookmark tabs/pips (`CAN`, `1ST`, ..., `9TH`), and keyboard shortcuts (`ArrowLeft`/`A`, `ArrowRight`/`D`, `Escape`).
  - **Left Page Spread (Song Index & Search):**
    - Displays active tier ribbon badge, XP multiplier, tier description, real-time search field, and alphabetical song list with title, BPM, and duration.
    - Indicates currently loaded song with a golden star (`★`).
    - Handled empty tier state with arcane parchment illustration, "No Spells of this Level Yet", and a 1-click CTA button pointing to The Quest Board.
  - **Right Page Spread (Spell Details & Bardic History):**
    - Displays selected song's musical metadata: tempo, duration, NPS, playable note count, and synced backing audio status badge.
    - Integrates Bardic Annals rehearsal history for the selected song from `songPlayHistory` store: rehearsals played, best mastery accuracy, latest trial accuracy, career XP earned, and formatted last played date.
    - Added primary action CTA `▶ Inscribe on Highway (Load Spell)` to load onto the highway and close the tome.
    - Added delete button for user-imported spells in `./Imports`.
  - **Live Folder Watcher & Seamless Return:**
    - Folder watcher live-updates the open spellbook and immediately flips to the incoming spell's difficulty spread.
    - Contextual origin return: closing the tome returns to the Tavern Main Menu if opened from the tavern bookshelf, or the Spell Highway if opened from the header toolbar.
  - **UI/UX Readability, Scale & Filigree Clearance Remediation:**
    - Verified clean inner parchment coordinates against `assets/images/grimoire/grimoire-open-book.png` and tightened `.spellbook-stage` to `top: 24.2%; bottom: 27.2%; left: 28.8%; right: 29.2%`, clearing all 4 gold corner filigree brackets, outer decorative borders, book clasps, and corner stains.
    - Locked `.spellbook-container` strictly to 16:9 (`width: min(1240px, calc((100vh - 44px) * 16 / 9), calc(100vw - 32px)); container-type: inline-size;`) and scaled all inside-book typography, badges, inputs, cards, and buttons proportionally via `clamp(..., cqw, ...)` so the tome scales harmoniously at every window resolution/DPI without overflowing.
    - Replaced cramped 4-column metric and annals layouts with clean 2x2 grids, compacted song-row BPM metadata and single-line tier descriptions so fuller titles fit cleanly, upgraded typography to high-contrast iron-gall ink (`#1a0a00`) on illuminated vellum cards, and styled the close button in dark walnut and burnished brass.
- **Current status:** Verified (`"testing successful"`) and merged into `main` in PR #74 (`4ae53a9`) and UI/UX remediation PR #75 (`ad6d4d7`). Issue #69 closed.

### 2026-11-10 — Session 19: Complete Legacy Purple Color Cleanup (Bug #81)
- **Root Cause:** The `#71` palette overhaul updated root palette variables and the Tavern Main Menu stations, but left hardcoded indigo/violet/magenta hex and RGBA values across the 2-bar practice chrome, Quest Board button/modal, Performance Check modal subcards, `main.js` window backdrop, and Canvas 2D keyboard/particle drawing routines.
- **What we did:**
  - Created isolated bugfix branch `fix/issue-81-remove-old-purple-colors` from `main`.
  - Audited every color token across `styles.css`, `renderer.js`, `main.js`, and `index.html`.
  - Updated `styles.css`: replaced all remaining dark indigo/purple backgrounds, gradients, borders, and glow keyframes across `#tavern-header`, `#spell-scroll-bar`, `.tavern-btn`, `.tavern-select`, `.conservatory-popover`, `.stat-chip`, `.chip-folded`, `.xp-bar-track`, `.center-combo-pill`, `.modal-backdrop`, `.d20-grade-banner`, `.modal-xp-card`, `.modal-stat-box`, `#stage-container`, `.btn-quest-board` (amber-wax Notice Board palette `#4f2b11`–`#2e1708` / `#f59e0b`), `.quest-board-card`, `.quest-section-box`, `.quest-text-input`, `.quest-progress-fill`, `.quest-archive-card`, `@keyframes inspirationAuraPulse`, and `.tavern-scene-backdrop`.
  - Updated `renderer.js`: swapped `cachedKeyGradients.blackIdle` (`#332920`–`#0c0907`), idle key strokes (`#2e241b`, `#4a3b2c`), white key C-note labels (`#5e4d3b`), lane guides (`rgba(186, 171, 147, 0.07)`), folded note highlight border (`#fde68a`), note text fill (`#0c0907`), inspired strike-line gradient (`rgba(255, 170, 0, ...)`), `PARTICLE_PALETTES.inspired`, and floating XP runes (`#fbbf24`), preserving Track 2 Eldritch Blue (`#00e5ff`).
  - Updated `main.js`: swapped `BrowserWindow` `backgroundColor` to `#0c0907`.
  - Verified zero remaining purple color tokens via automated script scan and `node --check` on `main.js` and `renderer.js`.
- **Current status:** Verified (`"testing successsful"`) and merged into `main` in PR #82 (`a52c43c`). Issue #81 closed.

### 2026-11-11 — Session 20: Map Auto-Difficulty to All 10 Spell Levels (Bug #80)
- **Root Cause:** `calculateSpellDifficulty()` in `renderer.js` only assigned 4 of the 10 tiers (`Cantrip`, `2nd-Level Spell`, `5th-Level Spell`, `9th-Level Spell`), making the remaining 6 spellbook spreads (`1st`, `3rd`, `4th`, `6th`, `7th`, `8th`) and their XP multipliers (`1.1x`, `1.3x`, `1.4x`, `1.6x`, `1.7x`, `1.8x`) unreachable, while `styles.css` lacked `.diff-level*` badge definitions for those 6 levels.
- **What we did:**
  - Created isolated bugfix branch `fix/issue-80-10-tier-difficulty-mapping` from `main`.
  - Moved `SPELLBOOK_TIERS` above `calculateSpellDifficulty()` in `renderer.js` as a single shared source of truth and added `maxNpsExclusive` + `xpMultiplier` metadata across all 10 tiers (`< 1.5`, `1.5 to <2.0`, `2.0 to <2.6`, `2.6 to <3.3`, `3.3 to <4.0`, `4.0 to <4.8`, `4.8 to <5.8`, `5.8 to <6.9`, `6.9 to <8.0`, `8.0+ NPS`).
  - Refactored `calculateSpellDifficulty()` to resolve the matched tier directly from `SPELLBOOK_TIERS`, guaranteeing 1:1 alignment between assigned tier, XP multiplier, badge class, and spellbook spread description.
  - Added warm Tavern-harmonized `.diff-level1`, `.diff-level3`, `.diff-level4`, `.diff-level6`, `.diff-level7`, and `.diff-level8` badge classes in `styles.css`.
  - Verified all 13 NPS boundary test cases across all 10 tiers, syntax-checked `renderer.js`, and re-ran the purple-color scan after final edits.
- **Current status:** Verified (`"testing successful"`) and merged into `main` in PR #83 (`1407ce2`). Issue #80 closed.

### 2026-11-12 — Session 21: Delete / Archive Songs from the Grimoire In-App (Issue #77)
- **What we did:**
  - Created isolated feature branch `feature/issue-77-delete-songs-in-app` from `main` (`c9d19e7`).
  - Implemented `moveFileToArchive()` in `renderer.js` to move a song's MIDI file, paired backing audio, sibling sheet music, and future `#76` bundle parts directly into a local `./Archive` directory (with automatic timestamped collision prevention), fulfilling user preference to archive rather than sending files to the OS Recycle Bin, and eliminating IPC dependencies.
  - Added visible card-level archive controls (`.spellbook-card-delete-btn`) on every file-backed Grimoire card in `renderSpellbookSpread()`, expanded `#btn-spellbook-delete-song` in spell details to support all file-backed entries (`Imports/` & `Test Library`) while keeping `BUILTIN_DEMO` protected, and replaced native `confirm()` with an in-app Tavern Dark Mode dialog (`#delete-spell-confirm-modal`, `z-index: 1400`) showing the song name, active-highway warning, and exact files moving to `./Archive`.
  - Added `unloadCurrentSongToEmptyState()` to pause playback, close active backing audio handles cleanly before moving files, reset `currentSong`, timeline controls, and highway badges to a clean empty state, and clear stale `bardProfile.lastSongPath` / `lastSongTitle`.
  - Updated stacked modal `Tab` focus cycling and `Escape` dismissal priority so cancelling `#delete-spell-confirm-modal` leaves the Grimoire Spellbook open.
- **Current status:** Verified (`"Testing Successful"`) and merged into `main` in PR #84. Issue #77 closed.

### 2026-11-12 — Session 22: Hearthfire Practice Streak Calendar (Issue #66)
- **What we did:**
  - Codified the Mandatory Pre-Build Engineering & UI/UX Gate and Post-Build Peer Review & QA Gate in `GEMINI.md`.
  - Created isolated feature branch `feature/issue-66-practice-streak-calendar` from `main` (`42479eb`).
  - Completed UI/UX Design Reviewer subagent pass and resolved all 4 design decisions with the user (Option B1 pill + popover, any interactive mode counts, custom Arcane Hearth Flame icon, Sunday week start).
  - Generated `assets/images/icons/streak-flame-transparent.png` (128x128 transparent PNG).
  - Implemented `#btn-tavern-streak-pill`, `#tavern-streak-popover`, local-calendar streak math (`getLocalDateKey`, `addLocalCalendarDays`, `computePracticeStreak`, `recordPracticeDayActivity`), `bardProfile.practiceDays` persistence, and `renderPracticeStreakCalendar()` across `index.html`, `styles.css`, and `renderer.js`.
- **Current status:** Verified (`"testing successful"`) and merged into `main` in PR #85. Issue #66 closed.

### 2026-11-12 — Session 23: Daily Quest System (Issue #53)
- **What we did:**
  - Created isolated feature branch `feature/issue-53-daily-quest-system` from `main`.
  - Completed UI/UX Design Reviewer subagent pass (Option B Notice Board integration, 3 rotating daily bounties, auto-claim + Performance Check callout, 1 free daily reroll, custom Wax-Sealed Bounty Scroll icon).
  - Generated `assets/images/icons/bounty-seal-transparent.png` (128x128 transparent PNG).
  - Implemented `DAILY_BOUNTY_SLOTS`, `ensureDailyQuestsForToday()`, `updateDailyQuestsOnSongComplete()`, `rerollDailyBounty()`, `renderDailyBountiesBoard()`, `renderDailyBountyStationSummary()`, and `#modal-quests-banner` across `index.html`, `styles.css`, and `renderer.js`.
- **Current status:** Verified (`"testing successful"`) and merged into `main` in PR #86. Issue #53 closed.

### 2026-11-12 — Session 24: Grimoire Favorites: Star Songs and a Favorites Filter (Issue #79)
- **What we did:**
  - Created isolated feature branch `feature/issue-79-grimoire-favorites` from `main`.
  - Added `GRIMOIRE_FAVORITES_STORAGE_KEY` (`collegeOfKeys_grimoire_favorites_v1`), `grimoireFavorites` Set, `loadGrimoireFavorites()`, `saveGrimoireFavorites()`, and `toggleGrimoireFavorite()` in `renderer.js`, and included `isFavorite` in `extractGrimoireEntryFromBuffer()` and `persistGrimoireIndex()` (`grimoire_library.json` + `localStorage`).
  - Added `.spellbook-card-star-btn` on every Grimoire song card, `#btn-spellbook-favorite-song` in the right-page Spell Details action row, and `#btn-spellbook-favorites-filter` with `#spellbook-fav-count` next to `#spellbook-search-input` in `index.html`, `styles.css`, and `renderer.js`.
  - Updated `renderSpellbookSpread()`, `navigateToSpellbookTier()`, `loadSelectedSpellbookSong()`, and `deleteSelectedSpellbookSong()` so the Favorites filter displays starred songs across all difficulty tiers and supports searching, loading, and archiving seamlessly.
- **Current status:** Verified (`"Testing successful"`). Renamed filter/view to **Attuned** (`☆ Attuned`, `Attuned Spells`) and persisted filter state across opens/restarts.

### 2026-11-12 — Session 25: Loop Practice Mode (Rehearsal) (Issue #30)
- **What we did:**
  - Completed Pre-Build Engineering Plan, UI/UX Design Reviewer subagent pass, and 4-point Decision Check before coding.
  - Created isolated feature branch `feature/issue-30-loop-practice-mode` from `main`.
  - Implemented `rehearsalLoopState`, timeline range/bracket overlays, inline `[A]` / `[B]` / `[🔁 Loop]` controls, `#rehearsal-popover` (Clear A–B, Auto-Ramp Tempo, Target Speed, Pass Status), `0.8s` pre-roll loop wrapping in `animationLoop`, `[` / `]` / `\` keyboard shortcuts, and `LOOP A` / `LOOP B` canvas boundary lines.
  - Completed Post-Build Peer Review & QA Audit subagent pass and fixed outside-click popover dismissal, immediate Set-B wrap edge case, and `.btn-rehearsal-caret.active` styling.
- **Current status:** Verified (`"Testing successful"`) and merged into `main` in PR #88. Issue #30 closed.

### 2026-11-12 — Session 26: Post-Song Breakdown — What Tripped Me Up (Issue #62)
- **What we did:**
  - Completed Pre-Build Engineering Plan, UI/UX Design Reviewer subagent pass, and 3-point Decision Check before coding (pad short bars to `>= 2.0s`, jump & pause, player-controlled hands only).
  - Created isolated feature branch `feature/issue-62-post-song-breakdown` from `main`.
  - Added `#modal-breakdown-section` in `index.html`, responsive modal scrolling + breakdown styles in `styles.css`, and `measureStats` tracking, `buildPostSongBreakdown()`, `renderPostSongBreakdown()`, and `practiceWeakRegion()` in `renderer.js`.
  - Completed Post-Build Peer Review & QA Audit subagent pass (`No blocking issues found`) and verified syntax with `node --check`.
- **Current status:** Verified (`"Testing successful"`) and merged into `main` in PR #89. Issue #62 closed.

### 2026-11-12 — Session 27: Practice Tempo Control — Slow the Song Down (Issue #63)
- **What we did:**
  - Completed Pre-Build Engineering Plan, UI/UX Design Reviewer subagent pass, and 4-point Decision Check before coding (granular steps for both dropdown & Auto-Ramp, clickable `[−]`/`[+]` buttons + `-`/`=` shortcuts, per-song `preferredTempo` persistence, full XP at any tempo).
  - Created isolated feature branch `feature/issue-63-practice-tempo-control` from `main`.
  - Updated `index.html`, `styles.css`, and `renderer.js` with `#tempo-control-group`, `#btn-tempo-down`, `#btn-tempo-up`, granular `REHEARSAL_SPEED_PRESETS`, `setPracticeTempo()`, `stepPracticeTempo()`, `preservesPitch = true` on `backingAudioEl`, and per-song `preferredTempo` restore on song load.
  - Completed Post-Build Peer Review & QA Audit subagent pass and fixed `saveSongPlayHistory()` -> `saveSongStats()` in `setPracticeTempo()`.
- **Current status:** Verified (`"Testing successful"`) and merged into `main` in PR #90. Issue #63 closed.

### 2026-11-12 — Session 28: d20 Performance Check at Song End (Issue #25)
- **What we did:**
  - Completed Pre-Build Engineering Plan, UI/UX Design Reviewer subagent pass, and 4-point Decision Check before coding (`three` + `cannon-es` 3D physics roll, full-card translucent tray overlay, one roll per song, click/Space fast-settle).
  - Created isolated feature branch `feature/issue-25-d20-performance-check` from `main` and installed `three` + `cannon-es`.
  - Created `d20-roller.js` (numbered 5×4 gold icosahedron atlas, opposite faces summing to 21, `CANNON.ConvexPolyhedron` physics, top-face `worldN.y` detection, bounce clatter callbacks, and full WebGL/RAF disposal).
  - Updated `index.html`, `styles.css`, and `renderer.js` with `#d20-tray-overlay`, `#modal-d20-math`, Tone.js bounce/Nat-20/Nat-1 audio, D&D 5E modifier/DC XP tiers, one-roll-per-song persistence, and `prefers-reduced-motion` support.
  - Completed Post-Build Peer Review & QA Audit subagent pass and fixed a stray `/**` comment and `d20DisposeTimer` cleanup race in `renderer.js`.
- **Current status:** Verified (`"Testing successful"`). Ready to merge into `main` and close Issue #25.






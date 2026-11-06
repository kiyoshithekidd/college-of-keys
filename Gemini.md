# College of Keys — Build Log, Plan & Decisions

> **Critical Execution Rule:** Never execute multiple phases at once. At the end of every single phase, STOP, provide testing instructions for the current state, and wait for explicit user confirmation (`"Testing successful"`) before writing any code for the next phase.

---

## 1. Project Goal & Vision
Build **College of Keys**, a local Electron PC application that transforms piano practice into a D&D 5E Bard LitRPG progression loop, designed with a Rock Band-style play-along architecture:
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
| 2026-11-06 | **Maintain `Gemini.md` alongside `context.md` and `progress.md`** | User confirmed maintaining `Gemini.md` as the detailed build log, plan, and decision record while also keeping `context.md` and `progress.md` per Section 7 of the PRD. | Approved |
| 2026-11-06 | **Exclusive Branding: "College of Keys"** | User confirmed using "College of Keys" exclusively across the app title, UI headers, and documentation (retiring "FlowState"). | Approved |
| 2026-11-06 | **Include Mouse-Click & QWERTY Fallback alongside Web MIDI** | User confirmed adding mouse/QWERTY input on the 61-key canvas so every phase can be tested reliably even if the physical 61-key MIDI controller is unplugged. | Approved |
| 2026-11-06 | **Non-Destructive Multi-Track Architecture + "Backing Band" Toggle** | Instead of deleting non-piano tracks, default the playable Spell Highway to Piano (Track 1 = RH, Track 2 = LH, or Middle-C split on single-track files), allow switching which track you play via dropdown, and preserve remaining tracks/audio as a toggleable "Backing Band" (Rock Band style play-along vs. solo piano). | Approved |
| 2026-11-06 | **Save Vocals ("Let's Sing") & Multi-Instrument Controllers for Backlog, Design Data Model to Support Them Now** | Keep Phases 1–9 focused on the 61-key Piano MVP while structuring the song/track data model so microphone pitch detection (Vocals) and other instrument highways can plug in cleanly later. | Approved |
| 2026-11-06 | **Strict Single-Phase Execution Gate** | Prevents compounding bugs across audio, MIDI hardware, canvas rendering, and game logic; ensures each layer is verified by the user before building on top of it. | Active |
| 2026-11-06 | **Single HTML5 Canvas (60 FPS) with Primitive Shapes for MVP** | Avoids DOM layout thrashing for falling notes; modular rendering design allows seamless PNG sprite swapping and top-50% sheet music split in future iterations. | Planned |
| 2026-11-06 | **Persistent `Tone.PolySynth` Voice Pool + `Tone.context.lookAhead = 0`** | Pre-warmed singleton polyphonic synth avoids garbage collection clicks/stutters on `noteon` events; setting `lookAhead = 0` eliminates Tone.js's default 100ms buffer lag for live MIDI play. | Planned |
| 2026-11-06 | **Native Web MIDI API (`navigator.requestMIDIAccess`) + Velocity-0 NoteOff Handling** | Eliminates third-party wrapper latency; handles both explicit `0x80` NoteOff and `0x90` NoteOn with `velocity === 0` (used by many 61-key controllers on key release), plus Sustain Pedal (`CC 64`). | Planned |
| 2026-11-06 | **61-Key Octave Folding (MIDI 36–96)** | Physical hardware is a 61-key controller (`C2`–`C7`). Out-of-bounds MIDI notes are transposed by $\pm 12$ semitones until they fall within `[36, 96]` so every note in any song is playable. | Planned |
| 2026-11-06 | **Decoupled Python CLI for `yt-dlp` + `basic-pitch` (+ Backing Audio / Stems)** | Keeps heavy ML/audio dependencies out of the Electron binary; outputs both `.mid` and optional synced backing audio into `Imports/` for Rock Band-style play-along. | Planned |

---

## 3. Benchmarks & Lessons from Similar Open-Source Piano Apps

In addition to the libraries in the PRD (`Tone.js`, `@tonejs/midi`, `atosystem/midi2Tiles`, `schollz/pianoai`, `spotify/basic-pitch`, `alacrity-ai/sequenzia`), we reviewed how leading open-source WebMIDI + Canvas piano trainers (**`Bewelge/MIDIano`**, **`Sightread`**, and **Synthesia / Rock Band 3 Pro Keys**) solve common pitfalls:

1. **The "Stuck Key" Web MIDI Trap (`NoteOn` with `Velocity = 0`):**
   - Many physical 61-key MIDI keyboards send status `0x90` (`NoteOn`) with `velocity = 0` when you release a key instead of status `0x80` (`NoteOff`). Our Web MIDI parser will explicitly route `(status & 0xF0) === 0x90 && velocity === 0` to `noteOff(pitch)`.
2. **Zero-Latency Live Monitoring (`Tone.context.lookAhead = 0`):**
   - By default, `Tone.js` uses a `100ms` scheduling lookahead buffer (`Tone.context.lookAhead = 0.1`), which feels noticeably delayed when pressing physical piano keys. Setting `Tone.context.lookAhead = 0` drops audio latency to `<10ms`.
3. **Wait Mode "Sustained Bass vs. New Onset" Rule (from `MIDIano` / `Sightread`):**
   - If the Left Hand holds a long whole-note chord while the Right Hand plays 4 quarter notes, Wait Mode must only gate on **note onsets (`note.time`)** arriving at the strike line—never forcing the player to re-press a sustained note they already struck earlier in the measure.
4. **Shared Key-Geometry Lookup Table (`keyGeometry[midiNote]`):**
   - On a 61-key keyboard (`36` white keys, `25` black keys), black keys are ~60% the width of white keys and offset between white-key boundaries. Computing a single `keyGeometry[36..96]` lookup table `{ x, width, height, isBlack }` on canvas resize guarantees falling glyphs in Phase 3 align pixel-perfectly with the physical keys drawn in Phase 1.
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

- [ ] **Phase 1: Electron Skeleton & Audio**
  - Initialize `package.json`, `main.js`, `index.html`, `renderer.js` (and `styles.css`).
  - Render static 61-key piano (`C2`–`C7`) on HTML5 Canvas.
  - Connect physical MIDI keyboard via `navigator.requestMIDIAccess()` with `onstatechange` support + mouse/QWERTY fallback.
  - Integrate `Tone.js` persistent `PolySynth` (`lookAhead = 0`) and highlight/play keys on input.
  - *Gate 1: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 2: MIDI Parsing & Auto-Difficulty (Octave Folding + Non-Destructive Track Categorization)**
  - Implement local `.mid` file upload and parsing via `@tonejs/midi`.
  - Preserve all tracks: auto-select Piano track(s) for Track 1 (RH) & Track 2 (LH) (with Middle-C split for single-track files and a UI dropdown to switch active tracks) while keeping remaining tracks as Backing Band data.
  - Apply Octave Folding into `36–96` for playable keyboard tracks.
  - Calculate Notes Per Second (NPS) and assign the D&D Spell Level difficulty tag.
  - *Gate 2: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 3: The Spell Highway, Accompaniment & Backing Band**
  - Build the 60 FPS `requestAnimationFrame` render loop.
  - Draw falling glowing notes (Track 1 = Radiant Gold, Track 2 = Eldritch Blue) aligned to the 61-key layout.
  - Add Track Isolation selector (`Track 1`, `Track 2`, `Both`), Left-Hand Accompaniment Toggle (`Mute` vs. `Auto-play`), and **Backing Band Toggle** (`Solo Piano` vs. `Full Band Play-Along`).
  - *Gate 3: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 4: Wait Mode & Chord Forgiveness (100ms Roll)**
  - Define the strike zone collision boundary and Wait Mode UI toggle.
  - Implement the 100ms `chordGracePeriod` window for rolled chords.
  - Gate playback progression on matching MIDI `noteon` events when Wait Mode is active.
  - *Gate 4: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 5: LitRPG Gamification UI (Combos, XP, Titles)**
  - Build HUD for Spell Chain counter, Bardic Inspiration state, XP bar, Level, and Bardic Title.
  - Implement XP calculation (difficulty multiplier, 50-streak 2x multiplier, >2s Wait Mode fumble penalty) and local persistence.
  - Build the post-song "Performance Check" summary modal.
  - *Gate 5: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 6: The Grimoire (Folder Watcher & Local Storage)**
  - Build "The Grimoire" sidebar to save, browse, and load parsed songs (along with any paired backing audio) locally.
  - Add Electron folder watcher on local `Imports/` folder to auto-ingest new `.mid` (and paired backing audio) files into The Grimoire.
  - *Gate 6: Stop, provide test steps, wait for `"Testing successful"`.*

- [ ] **Phase 7: UI Polish & Particle Effects**
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
  - Checked local Git, GitHub CLI (`gh`), and Node.js environment before starting Phase 1.
- **Current status:** Ready to set up Git/GitHub repository and Node.js environment, then execute **Phase 1: Electron Skeleton & Audio**.

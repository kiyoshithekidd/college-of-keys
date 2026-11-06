# College of Keys

> **A D&D 5E Bard LitRPG Piano Practice & Rock Band-Style Play-Along Desktop Application**

**College of Keys** replaces clinical piano drills with an Arcane Bard progression loop. Connect a physical **61-key MIDI keyboard (`C2`–`C7`)**—or test with your mouse and QWERTY keyboard—to cast musical spells on a 60 FPS HTML5 Canvas ("The Spell Highway"), practice with intelligent **Wait Mode** and **100ms Chord Forgiveness**, toggle between **Solo Piano** and **Full Backing Band Play-Along**, and level up from *Tavern Busker* to *Grand Maestro*.

---

## Current Build Status

| Phase | Milestone | Status |
| :--- | :--- | :--- |
| **Phase 1** | **Electron Skeleton, 61-Key Canvas Piano, Web MIDI & Sampled Grand Piano** | **Completed** |
| **Phase 2** | **MIDI Parsing (`@tonejs/midi`), Octave Folding (`C2`–`C7`) & Auto-Difficulty (NPS)** | **Completed** |
| **Phase 3** | **The Spell Highway (60 FPS), Hand Isolation & Backing Band Toggle** | **Completed** |
| **Phase 4** | **Wait Mode & 100ms Chord Forgiveness ("The Roll")** | **Completed** |
| **Phase 5** | **LitRPG Gamification UI (Spell Chain, Bardic Inspiration, XP & Titles)** | **Completed** |
| **Phase 6** | **The Grimoire (Local Song Library & `Imports/` Folder Watcher)** | **Completed** |
| **Phase 7** | **Tavern Dark Mode UI Polish & Strike-Line Particle Bursts** | **Implemented (Testing Gate 7)** |
| **Phase 8** | Decoupled Python ML Pipeline (`yt-dlp` + Spotify `basic-pitch` + Backing Track) | Planned |
| **Phase 9** | "The Quest Board" (In-App YouTube-to-MIDI Sourcing & Quick Links) | Planned |

---

## Key Features & Architecture

### 1. 61-Key Arcane Keyboard & Octave Folding (`C2` to `C7`)
- Renders all **61 keys** (`36` white keys, `25` black keys, MIDI notes `36` to `96`) on a single 60 FPS HTML5 Canvas.
- **Octave Folding:** Any MIDI note below `C2` (`< 36`) or above `C7` (`> 96`) is automatically transposed by $\pm 12$ semitones until it fits within the 61-key range so every song is 100% playable on a 61-key controller.
- **Zero-Latency Audio (`<10ms`):** Powered by a persistent `Tone.PolySynth` voice pool with `Tone.context.lookAhead = 0`, 4 selectable instrument presets (*Tavern Grand Piano*, *Arcane Lute-Harp*, *Cathedral Pipe Organ*, *Eldritch Warm Pad*), and physical **Sustain Pedal (`CC 64`)** support.

### 2. Rock Band-Style Play-Along & Hand Isolation
- **Non-Destructive Multi-Track Engine:** Preserves all tracks in a `.mid` file rather than discarding non-piano instruments.
  - **Track 1 (Right Hand / Lead):** Rendered in **Radiant Gold (`#ffd700`)**.
  - **Track 2 (Left Hand / Accompaniment):** Rendered in **Eldritch Blue (`#00e5ff`)**.
  - **Single-Track Auto-Split:** Automatically splits single-track piano files (such as Spotify `basic-pitch` transcriptions) at Middle C (`C4` / MIDI 60).
- **Play-Along Toggles:**
  - Isolate Right Hand, Left Hand, or Both, and toggle Left-Hand Accompaniment between **Mute** and **Auto-Play**.
  - Toggle the **Backing Band (`Solo Piano` vs. `Full Band Play-Along`)** to hear the rest of the MIDI arrangement (or synced YouTube backing audio) while you play keys.

### 3. Practice Mechanics: Wait Mode & 100ms Chord Forgiveness
- **Wait Mode vs. Arcade Mode:** Freeze playback when expected note onsets reach the strike line until you play the required pitches, or play in continuous real-time Arcade Mode.
- **100ms Chord Roll Forgiveness (`chordGracePeriod`):** Humanized chord detection allows rolling notes of a chord within a 100ms window without penalty.

### 4. D&D 5E Bard LitRPG Progression
- **Auto-Calculated Spell Level (Notes Per Second / NPS):**
  - `< 1.5 NPS`: **Cantrip** (`1.0x` XP)
  - `1.5 – 3.0 NPS`: **2nd-Level Spell** (`1.2x` XP)
  - `3.1 – 5.0 NPS`: **5th-Level Spell** (`1.5x` XP)
  - `5.1+ NPS`: **9th-Level Spell** (`2.0x` XP)
- **Spell Chain & Bardic Inspiration:** Build a `50+` note streak to trigger **Bardic Inspiration** (`2.0x` temporary XP multiplier and arcane visual glow).
- **XP & Bardic Titles:** Earn `+10 XP` per clean note (`+2 XP` "Fumbled Component" if paused `> 2s` in Wait Mode). Level up from **Level 1 (*Tavern Busker*)** to **Level 50 (*Grand Maestro*)**.

---

## Controls & Input Modes

| Input Method | How to Use |
| :--- | :--- |
| **Physical 61-Key MIDI Keyboard** | Plug in via USB. Auto-detected via Web MIDI (`navigator.requestMIDIAccess`) with hot-plug support (`onstatechange`), velocity-0 `NoteOff` handling, and Sustain Pedal (`CC 64`). |
| **Mouse Fallback** | Click or drag across any white or black key on the canvas. |
| **QWERTY Keyboard Fallback** | **White keys:** `A S D F G H J K L ;` &bull; **Black keys (sharps):** `W E T Y U O P` &bull; **Octave Shift:** `Z` (down) / `X` (up). |

---

## Getting Started

### Prerequisites
- **Node.js LTS** (`v20+` / `v26+`)
- Windows / macOS / Linux desktop environment

### Running the App
Double-click [`start.bat`](./start.bat) or run from the project root:
```powershell
.\start.bat
# or
npm start
```

---

## Repository Structure & Documentation

- [`main.js`](./main.js) — Electron main process & automatic Web MIDI permission handlers.
- [`index.html`](./index.html) & [`styles.css`](./styles.css) — Tavern Dark Mode HUD and responsive canvas stage.
- [`renderer.js`](./renderer.js) — 61-key canvas geometry (`C2`–`C7`), Web MIDI listener, Mouse/QWERTY input, and `Tone.PolySynth` audio engine.
- [`Gemini.md`](./Gemini.md) — Detailed architectural plan, engineering decisions & rationale log, open-source benchmark notes, and build log.
- [`CHANGELOG.md`](./CHANGELOG.md) — Versioned phase-by-phase changelog.
- [`context.md`](./context.md) & [`progress.md`](./progress.md) — Stateful architecture summary and phase gate checklist.
- [`music_app_prd_and_handoff.md`](./music_app_prd_and_handoff.md) — Original Product Requirements Document & Technical Specification.

---

## Future Expansion Backlog (Post-Phase 9: "The Full Adventuring Party")
- **Epic A — "Spell-Singing" (Vocals / *Let's Sing* Mode):** Web Audio API microphone pitch detection with a scrolling vocal pitch highway and lyrics.
- **Epic B — AI Stem Separation (`Demucs`) & Multi-Instrument Highways:** 4-stem splitting (`vocals`, `drums`, `bass`, `piano/other`) to mute only the piano in real audio tracks or play other instruments.
- **Epic C — Scrolling Grand-Staff Sheet Music Split View:** Synchronized sheet music notation in the top 50% of the screen.


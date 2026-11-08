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
| **Phase 7** | **Tavern Dark Mode UI Polish & Strike-Line Particle Bursts** | **Completed** |
| **Phase 8** | **Decoupled Python ML Pipeline (`yt-dlp` + Spotify `basic-pitch` + Backing Track)** | **Completed** |
| **Phase 9** | **"The Quest Board" (In-App YouTube-to-MIDI Sourcing & Quick Links)** | **Completed** |
| **Phase 10** | **2-Bar Conservatory UI/UX Overhaul (`v1.1.0` — Inline Bard Banner, Popovers & 1-Click Practice Selector)** | **Completed** |
| **Maintenance** | **Rhythm-Game & Audio Quality Remediation (`v1.1.1`–`v1.1.2`, Fixes #31–#38, #44–#51, #55–#60)** | **Completed** |

---

## Key Features & Architecture

### 1. 61-Key Arcane Keyboard & Octave Folding (`C2` to `C7`)
- Renders all **61 keys** (`36` white keys, `25` black keys, MIDI notes `36` to `96`) on a single 60 FPS HTML5 Canvas.
- **Octave Folding:** Any MIDI note below `C2` (`< 36`) or above `C7` (`> 96`) is automatically transposed by $\pm 12$ semitones until it fits within the 61-key range so every song is 100% playable on a 61-key controller.
- **Zero-Latency Audio (`<10ms`):** Powered by a persistent `Tone.PolySynth` voice pool with `Tone.context.lookAhead = 0`, 4 selectable instrument presets (*Tavern Grand Piano*, *Arcane Lute-Harp*, *Cathedral Pipe Organ*, *Eldritch Warm Pad*), and physical **Sustain Pedal (`CC 64`)** support.

### 2. 2-Bar Conservatory UI/UX Layout (~82% Stage Height)
- **Bar 1 (`#tavern-header`):** Branding & Sourcing (`The Grimoire`, `Quest Board`, `Load .mid`, `Demo`), inline *Baldur's Gate 3*-style **Bardic Character Banner** (`LVL`, `Bardic Rank`, inline `XP Progress Bar`, `Total XP`, `🏆 Stats`), and compact `MIDI Status` + **`⚙ Audio & Keys`** popover.
- **Bar 2 (`#spell-scroll-bar`):** Active Spell Title, Difficulty Badge, **`ⓘ Details`** inspector popover (`NPS`, `BPM`, track breakdowns, and testing shortcuts), Primary Transport (`▶ Cast Spell`, `⏮`, scrubber), and Practice Deck.
- **Zero Note-Lane Occlusion:** Translucent, `pointer-events: none` **Top-Center Highway HUD Pill** keeps live `Spell Chain`, `Multiplier`, and `Wait Mode Target` at eye level without obscuring any keys across `C2–C7`.

### 3. Rock Band-Style Play-Along & Unified Practice Selector
- **Non-Destructive Multi-Track Engine:** Preserves all tracks in a `.mid` file rather than discarding non-piano instruments.
  - **Track 1 (Right Hand / Lead):** Rendered in **Radiant Gold (`#ffd700`)**.
  - **Track 2 (Left Hand / Accompaniment):** Rendered in **Eldritch Blue (`#00e5ff`)**.
  - **Single-Track Auto-Split:** Automatically splits single-track piano files (such as Spotify `basic-pitch` transcriptions) at Middle C (`C4` / MIDI 60).
- **Unified 1-Click Practice Mode Selector:**
  - `🙌 Both Hands (RH Gold + LH Blue)`
  - `🤚 Right Hand + Auto Left Hand`
  - `🤚 Right Hand Solo (Mute Left)`
  - `左手 Left Hand + Auto Right Hand`
  - `左手 Left Hand Solo (Mute Right)`
  - `🎧 Listen Only (Auto-Play Both)`
- **Backing Band Toggle:** Switch between **`Solo Piano`** and **`🎸 Backing Band: ON`** to synthesize non-piano MIDI tracks (or stream synced YouTube/audio stems) while you play.

### 4. Practice Mechanics: Wait Mode & 100ms Chord Forgiveness
- **Wait Mode vs. Arcade Mode:** Freeze playback when expected note onsets reach the strike line until you play the required pitches, or play in continuous real-time Arcade Mode.
- **100ms Chord Roll Forgiveness (`chordGracePeriod`):** Humanized chord detection allows rolling notes of a multi-note chord within a 100ms window without penalty.

### 5. D&D 5E Bard LitRPG Progression
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
| **QWERTY Keyboard Fallback** | **White keys:** `A S D F G H J K L ;` &bull; **Black keys (sharps):** `W E T Y U O P` &bull; **Octave Shift:** `Z` (down) / `X` (up). Key labels auto-hide when physical MIDI is connected and can be toggled in `⚙ Audio & Keys`. |

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
- [`index.html`](./index.html) & [`styles.css`](./styles.css) — 2-Bar Conservatory HUD and responsive 60 FPS canvas stage.
- [`renderer.js`](./renderer.js) — 61-key canvas geometry (`C2`–`C7`), Web MIDI listener, Mouse/QWERTY input, and `Tone.PolySynth` audio engine.
- [`PERSONAS.md`](./PERSONAS.md) — Core user personas (The Returning Adult, The Gamer Bard, The Rock Band Player, Casual Song Player, Young Learner, Conservatory Purist) guiding all feature decisions.
- [`Gemini.md`](./Gemini.md) — Detailed architectural plan, engineering decisions & rationale log, open-source benchmark notes, and build log.
- [`CHANGELOG.md`](./CHANGELOG.md) — Versioned phase-by-phase changelog.
- [`context.md`](./context.md) & [`progress.md`](./progress.md) — Stateful architecture summary, issue classification policies, and bug execution protocols.
- [`music_app_prd_and_handoff.md`](./music_app_prd_and_handoff.md) — Original Product Requirements Document & Technical Specification.

---

## Issues & Roadmap

All upcoming features, enhancements, and bug fixes are tracked openly on GitHub Issues and categorized by persona:
- **Issue Tracker:** https://github.com/kiyoshithekidd/college-of-keys/issues
- **Personas:** Consult [`PERSONAS.md`](./PERSONAS.md) for design criteria and persona checks.


# Product Requirements Document & Technical Specification
## Project Name: College of Keys
**Role:** Expert Software Engineer and Game Developer  
**Objective:** Build a local Electron PC application that parses MIDI files, displays them as falling notes, and interacts with a physical 61-key MIDI keyboard for a gamified learning experience using D&D 5E Bard mechanics.

---

## 1. AI-Assisted Architecture & Token Optimization Directives
Operating within an AI-assisted development workflow via Google Antigravity (Google AI Pro Plan). To maximize efficiency, prevent context bloat, and tightly manage token usage, adhere strictly to these execution constraints:

*   **Micro-Targeted Operations**: Never issue broad, repository-wide searches or multi-file scans unless explicitly requested. Ask for exact file paths if they are unknown.
*   **File-First Instruction**: Prioritize editing or reading explicit files passed directly in the prompt. Limit analysis strictly to the requested scope.
*   **Explicit Approvals**: Generate an architectural plan using Fast Mode/Flash before escalating to heavy reasoning loops. Wait for manual user sign-off before modifying structural dependencies.
*   **Stateful Markdown Tracking**: Rely on the root `context.md` and `progress.md` files as your ultimate source of truth for project state and architecture. Do not attempt to reverse-engineer the entire codebase to understand the project roadmap.
*   **MCP Constraint**: Keep Model Context Protocol (MCP) server calls minimal and targeted to the immediate terminal execution or file edit at hand.

---

## 2. Open-Source Repository Research & Technical Inspiration
A targeted review of open-source projects on GitHub providing direct implementation blueprints for FlowState's core mechanics:

| Repository & Benchmark | Relevant FlowState Domain | Architectural Pattern to Adopt | Caveats & Traps to Avoid |
| :--- | :--- | :--- | :--- |
| **[Tonejs/Tone.js](https://github.com/Tonejs/Tone.js)** *(14k+ stars)* | Sound generation & Polyphony | • Use `Tone.PolySynth` with pre-warmed voices to eliminate initial click/stutter.<br>• Leverage `Tone.Transport` for rock-solid timing during accompaniment playback. | Avoid creating new synth instances on each note-on; reuse a persistent singleton voice pool. |
| **[Tonejs/midi](https://github.com/Tonejs/midi)** *(2k+ stars)* | `.mid` file parsing in JavaScript | • Parses standard MIDI byte arrays directly into track arrays, note durations, and ticks in pure JS.<br>• Clean metadata extraction (BPM, time signature, track names). | Large MIDI files with hundreds of tracks can spike memory; filter to active musical tracks immediately upon parse. |
| **[atosystem/midi2Tiles](https://github.com/atosystem/midi2Tiles)** & Piano Roll engines | Falling notes ("Spell Highway") | • Linear interpolation ($y = \text{speed} \times (\text{targetTick} - \text{currentTick})$) mapping MIDI ticks directly to canvas pixels.<br>• Strike zone bounding box calculation for immediate hit collision. | Avoid DOM element rendering for falling notes; keep all 60 FPS drawing confined to a single HTML5 Canvas context. |
| **[schollz/pianoai](https://github.com/schollz/pianoai)** | Web MIDI latency & hardware input | • Native Web MIDI API (`navigator.requestMIDIAccess`) event dispatch without third-party wrapper overhead.<br>• Direct pitch number extraction (status byte & 0xF0 == 0x90). | Must handle MIDI device connect/disconnect events gracefully (`onstatechange`). |
| **[spotify/basic-pitch](https://github.com/spotify/basic-pitch)** *(Spotify's Open Source ML Audio-to-MIDI)* | YouTube / Audio to MIDI transcription | • Standalone CLI pipeline converting monophonic and polyphonic raw audio (.wav/.mp3) to clean `.mid` files.<br>• High accuracy on acoustic piano tracks. | Heavy PyTorch/TensorFlow dependencies. Keep decoupled in a separate Python CLI outside Electron. |
| **[alacrity-ai/sequenzia](https://github.com/alacrity-ai/sequenzia)** | Track separation & Accompaniment | • Clean visual separation between Track 1 (Right Hand / Lead) and Track 2 (Left Hand / Accompaniment).<br>• Mute vs. auto-play routing on separate audio channels. | Avoid full multi-track DAW overhead; restrict to 2-track isolation. |

---

## 3. Product Overview & Thematic Vision
FlowState replaces clinical piano practice with an RPG progression loop. The user acts as a "Bard" casting spells via a physical 61-key MIDI keyboard. The UI follows a "Tavern Dark Mode" aesthetic. Notes are glowing arcane glyphs. Progression is tracked via Experience Points (XP), levels, and combo chains.

---

## 4. Technical Architecture
*   **Environment:** Local PC Application via Electron.
*   **Frontend Core:** Vanilla JavaScript (ES6+), HTML5 Canvas (modular primitive shapes ready for PNG sprite swapping in Phase 2), CSS3 (Tavern UI).
*   **Hardware Input:** Native Web MIDI API (`navigator.requestMIDIAccess`).
*   **Audio Synthesis:** Tone.js.
*   **File Parsing:** `@tonejs/midi`.
*   **Local Database:** `IndexedDB` or local file system.
*   **ML Pipeline (Decoupled MVP):** Python (`yt-dlp` and `basic-pitch`) running as a standalone command-line tool. The Electron app will simply watch a local "Imports" folder for the generated `.mid` files to avoid bundling heavy AI libraries into the main app binary.

---

## 5. Core Mechanics & Logic Definitions
*   **61-Key Mapping & Octave Folding:** The engine restricts rendering to MIDI notes 36 (C2) through 96 (C7). Any notes in a parsed MIDI file falling below C2 must automatically be pitched up by 12 semitones (one octave) until they fit, and notes above C7 pitched down.
*   **Wait Mode (Playback Modifier):** "Wait Mode" is a toggleable playback modifier available on any song or difficulty. When active, `currentTick` halts when expected notes hit the strike zone, pausing the engine until the correct MIDI `noteon` events are received. When disabled, the song plays in continuous "Arcade" time.
*   **Chord Forgiveness (The "Roll"):** Implement a strict `chordGracePeriod` (100ms window). As long as the correct keys of a chord are struck within this tight window and no egregiously wrong keys are pressed, it counts as a success without swallowing adjacent notes.
*   **Accompaniment Toggle:** When isolating Track 1 (Right Hand), provide a UI toggle to either mute Track 2 or auto-play Track 2 via Tone.js as a backing track.
*   **Screen Layout:** MVP is 100% falling glyphs ("Spell Highway"). Structure the canvas responsively so Phase 2 can dedicate the top 50% of the screen to scrolling sheet music.

---

## 6. Gamification Data Model (LitRPG System)
*   **Auto-Difficulty (Spell Levels):** Engine calculates Notes Per Second (NPS).
    *   `< 1.5 NPS` = Cantrip (1.0x XP)
    *   `1.5 - 3.0 NPS` = 2nd-Level Spell (1.2x XP)
    *   `3.1 - 5.0 NPS` = 5th-Level Spell (1.5x XP)
    *   `5.1+ NPS` = 9th-Level Spell (2.0x XP)
*   **Spell Chain (Combo):** Increments by 1 per correct note. Breaks on wrong notes. Reaching 50 triggers "Bardic Inspiration" (visual glow, 2x temporary XP multiplier).
*   **XP Math:** Base +10 XP per note. Wait Mode Penalty: Pausing > 2 seconds flags the note as a "Fumbled Component" (+2 XP only).
*   **Leveling:** Level 1 requires 1,000 XP (scales 1.5x per level). Assign titles:
    *   Lvl 1: Tavern Busker
    *   Lvl 10: College Initiate
    *   Lvl 20: Wandering Minstrel
    *   Lvl 30: Court Virtuoso
    *   Lvl 40: Spell-Singer
    *   Lvl 50: Grand Maestro
    *(Saved locally in IndexedDB / local file storage).*

---

## 7. Stateful Antigravity Tracking Files

### 7.1 Root `context.md`
```markdown
# FlowState (Arcane Bard Edition) — Context

## Architecture
- Platform: Electron (Node.js + Chromium)
- UI: Vanilla JS (ES6+), HTML5 Canvas (60 FPS), CSS3 (Tavern Dark Mode)
- Audio: Tone.js polyphonic synthesis
- MIDI: Native Web MIDI API (61-key, C2=36 to C7=96)
- File Parser: @tonejs/midi
- ML Transcriber: Standalone Python CLI (yt-dlp + basic-pitch) outputting to /Imports

## Core State Machine
- Modes: Wait Mode (pauses at strike line) vs. Arcade Mode (continuous)
- Chord Forgiveness: 100ms grace window
- Difficulty: Notes Per Second (NPS) -> Cantrip to 9th-Level Spell
- Progression: Spell Chain combo, Bardic Inspiration (50 combo), Leveling XP & Titles

## Directives
- Follow Micro-Targeted Operations: edit only requested files.
- Consult progress.md before starting any phase.
- Wait for explicit user confirmation ("Testing successful") before advancing phases.
```

### 7.2 Root `progress.md`
```markdown
# FlowState — Implementation Progress

## Critical Rule
NEVER execute multiple phases at once. Stop at the end of each phase, provide testing instructions, and wait for "Testing successful".

## Phase Checklist
- [ ] Phase 1: Electron Skeleton & Audio
- [ ] Phase 2: MIDI Parsing & Auto-Difficulty (Octave Folding)
- [ ] Phase 3: The Spell Highway & Accompaniment
- [ ] Phase 4: Wait Mode & Chord Forgiveness (100ms Roll)
- [ ] Phase 5: LitRPG Gamification UI (Combos, XP, Titles)
- [ ] Phase 6: The Grimoire (Folder Watcher & Local Storage)
- [ ] Phase 7: UI Polish & Particle Effects
- [ ] Phase 8: Python ML Extraction (yt-dlp + basic-pitch CLI)
- [ ] Phase 9: "The Quest Board" (In-App Sourcing)
```

---

## 8. Execution Roadmap & Strict Phased Gates

> **CRITICAL EXECUTION RULE:** You must NEVER execute multiple phases at once. At the end of every single phase, you must STOP, provide instructions on how to test the app in its current state, and wait for explicit confirmation ("Testing successful") before writing any code for the next phase.

### Phase 1: Electron Skeleton & Audio
1. Initialize the Electron project structure (`main.js`, `index.html`, `renderer.js`, `package.json`).
2. Draw a static 61-key piano interface on an HTML5 canvas.
3. Implement `navigator.requestMIDIAccess()` and connect to the physical keyboard.
4. Integrate Tone.js and trigger polyphonic audio on key presses.

### Phase 2: MIDI Parsing & Auto-Difficulty
1. Implement local file upload for `.mid` files using `@tonejs/midi`.
2. Parse the MIDI into an array of note objects, applying the "Octave Folding" logic for notes outside C2-C7.
3. Write the algorithm to calculate NPS and automatically assign the "Spell Level" difficulty tag.

### Phase 3: The Spell Highway & Accompaniment
1. Implement the `requestAnimationFrame` loop.
2. Render falling glowing rectangles (Track 1 = Radiant Gold, Track 2 = Eldritch Blue).
3. Implement Track Isolation (Track 1, Track 2, Both) with the Accompaniment Toggle (Mute vs. Auto-play).

### Phase 4: Wait Mode & Chord Forgiveness
1. Define the canvas strike zone. Build the toggle to turn Wait Mode on/off.
2. Implement the tight 100ms `chordGracePeriod` logic for chord rolling.
3. Compare Web MIDI input to required pitches to resume `currentTime` when Wait Mode is active.

### Phase 5: LitRPG Gamification UI
1. Build the Spell Chain UI, XP bar, Level tracker, and Bardic Title display.
2. Implement the XP math (Wait Mode penalty, Bardic Inspiration multiplier).
3. Create the post-song "Performance Check" modal.

### Phase 6: The Grimoire (Local Database & Folder Watcher)
1. Build a CSS sidebar titled "The Grimoire" to save and load parsed MIDI files locally.
2. Configure the Electron app to actively watch a designated local "Imports" folder for new `.mid` files, automatically adding them to The Grimoire when detected.

### Phase 7: UI Polish & Particle Effects
1. Add a canvas particle burst when notes are struck perfectly.
2. Refine the Tavern Dark Mode CSS (text shadows, magical aesthetic).

### Phase 8: Python ML Extraction (Standalone Script)
1. Create a separate directory outside the Electron app for the Python backend.
2. Write a standalone CLI script using `yt-dlp` and `basic-pitch` that takes a YouTube URL, converts it to MIDI, and outputs the file directly into the Electron app's "Imports" folder.

### Phase 9: "The Quest Board" (In-App Sourcing)
1. Add a simple UI section with a text input field ("Paste YouTube URL").
2. When a URL is submitted, the Electron app executes the standalone Phase 8 Python CLI script in the background to seamlessly download and convert the song.
3. Add UI quick-link buttons that open the user's default browser to BitMIDI, VGMusic, and YouTube.

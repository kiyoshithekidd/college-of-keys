# College of Keys — Context

## Architecture
- Platform: Electron (Node.js + Chromium)
- UI: Vanilla JS (ES6+), HTML5 Canvas (60 FPS), CSS3 (Tavern Dark Mode)
- Audio: Tone.js polyphonic synthesis (persistent `Tone.PolySynth` voice pool + `Tone.Transport` + optional synced backing audio/tracks)
- MIDI: Native Web MIDI API (61-key, C2=36 to C7=96) + Mouse/QWERTY fallback for testing
- File Parser: `@tonejs/midi` (Non-destructive: preserves all tracks so Piano is mapped to Track 1/Track 2 by default, any track can be selected, and remaining tracks act as a toggleable "Backing Band")
- ML Transcriber: Standalone Python CLI (`yt-dlp` + `basic-pitch` + backing audio/stems) outputting to `/Imports`

## Core State Machine
- Modes: Wait Mode (pauses at strike line) vs. Arcade Mode (continuous)
- Play-Along Routing:
  - Hand Isolation (`Track 1`, `Track 2`, `Both`) + Left-Hand Accompaniment Toggle (`Mute` vs. `Auto-Play`)
  - Backing Band Toggle (`Solo Piano` vs. `Full Band / Song Play-Along` like Rock Band)
- Chord Forgiveness: 100ms grace window
- Difficulty: Notes Per Second (NPS) -> Cantrip to 9th-Level Spell
- Progression: Spell Chain combo, Bardic Inspiration (50 combo), Leveling XP & Titles

## Directives
- Follow Micro-Targeted Operations: edit only requested files.
- Consult and update `Gemini.md`, `progress.md`, `context.md`, `README.md`, and `CHANGELOG.md` at every phase.
- Wait for explicit user confirmation ("Testing successful") before advancing phases.

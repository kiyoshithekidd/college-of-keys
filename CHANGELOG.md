# Changelog

All notable changes, phase completions, and architectural updates to **College of Keys** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]
- **Phase 2:** MIDI file parsing (`@tonejs/midi`), 61-key Octave Folding (`C2`–`C7`), non-destructive multi-track categorization, and auto-difficulty (NPS) calculation.

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
- **Zero-Latency Polyphonic Audio Engine (`renderer.js`, `vendor/Tone.js`):**
  - Configured singleton `Tone.PolySynth` (32 voices) with `Tone.context.lookAhead = 0` for `<10ms` live response.
  - Added 4 selectable instrument presets (*Tavern Grand Piano*, *Arcane Lute-Harp*, *Cathedral Pipe Organ*, *Eldritch Warm Pad*) and Master Volume control.
- **Project Documentation & Tracking (`README.md`, `CHANGELOG.md`, `Gemini.md`, `context.md`, `progress.md`, `.gitignore`):**
  - Documented the 9-phase MVP roadmap, Rock Band-style Backing Band play-along architecture, open-source piano trainer benchmarks (`MIDIano`, `Sightread`, `Tone.js`, `basic-pitch`), and Post-Phase 9 Backlog.

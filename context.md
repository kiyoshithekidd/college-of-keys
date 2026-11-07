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
  - Unified 1-Click Practice Mode Selector (`#practice-mode-select`: Both Hands, Right Hand + Auto Left, Right Hand Solo, Left Hand + Auto Right, Left Hand Solo, Listen Only)
  - Backing Band Toggle (`Solo Piano` vs. `Full Band / Song Play-Along` like Rock Band)
- Chord Forgiveness: 100ms grace window
- Difficulty: Notes Per Second (NPS) -> Cantrip to 9th-Level Spell
- Progression: Spell Chain combo, Bardic Inspiration (50 combo), Leveling XP & Titles

## Directives
- Follow Micro-Targeted Operations: edit only requested files.
- Consult and update `Gemini.md`, `progress.md`, `context.md`, `README.md`, and `CHANGELOG.md` at every phase.
- Wait for explicit user confirmation ("Testing successful") before advancing phases.

## Issue Tagging & Classification Policy
- Consult `PERSONAS.md` as the primary source of truth for all feature and architecture decisions.
- **Type Classification**:
  - Every defect, QA finding, audio/timing glitch, or regression discovered during code reviews MUST be tagged with `bug`.
  - Every new feature, gameplay mode, or roadmap item MUST be tagged with `enhancement`.
- **Persona Classification**: Every issue MUST be tagged with its target persona(s):
  - `persona: returning-adult` (Main — busy adult beginner, song ladder, short sessions, Duolingo-style habit)
  - `persona: gamer-bard` (Main — RPG progression, level titles, quests, d20 performance check)
  - `persona: rock-band` (Main — rhythm game feel, timing fairness, 100ms chord roll, scoring)
  - `persona: casual-player` (Close second — shortest path from song to play, zero friction)
  - `persona: young-learner` (Tentative — musical teens, clear steps, clean visuals)
- Stories that do not serve a persona must be challenged before being built.


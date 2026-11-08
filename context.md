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

## Persona Mapping, Prioritization & Roadmap Engine
Persona mapping ([`PERSONAS.md`](./PERSONAS.md)) is the foundational product, prioritization, and roadmapping engine for College of Keys. Every decision, next phase, GitHub issue, and bug triage must be justified through this lens:

1. **How the Roadmap is Prioritized**:
   - The roadmap is not built on arbitrary ideas or technical whim; it is built on user personas.
   - Enhancements and next build phases are chosen and ordered by which core personas they unblock or elevate.
   - **Persona Convergence**: Backlog items that simultaneously serve multiple main personas (e.g., `#52 Main Menu / Tavern` or `#66 Practice Streak Calendar` serving both *The Returning Adult* and *The Gamer Bard*) receive the highest sprint priority.
   - Any proposed enhancement or phase that serves zero personas is immediately challenged and eliminated.

2. **How Issues Are Logged and Triaged in GitHub**:
   - Consult [`PERSONAS.md`](./PERSONAS.md) as the primary source of truth for all issue authoring.
   - **Type Classification**:
     - Defects, timing/audio glitches, visual hitches, or regressions MUST be labeled `bug`.
     - New features, modes, UI expansions, or backlog roadmap items MUST be labeled `enhancement`.
   - **Mandatory Persona Tagging**: Every GitHub issue MUST carry at least one persona label:
     - `persona: returning-adult` (Main — busy adult beginner, song ladder, short sessions, Duolingo-style daily habit)
     - `persona: gamer-bard` (Main — RPG progression, level titles, quests, d20 performance check, tavern world)
     - `persona: rock-band` (Main — rhythm game feel, timing fairness, 100ms chord roll, scoring, audio quality)
     - `persona: casual-player` (Close second — shortest path from song/YouTube to play, zero friction)
     - `persona: young-learner` (Tentative — musical teens, clear difficulty steps, clean visuals)
     - `persona: conservatory-purist` (Anti-persona — strict pedagogy without gamification; defines what **never** to build)
   - **Priority Hierarchy**: Main personas outrank the close second; the close second outranks the tentative persona. Features must never break a shared rule (e.g., song choice, bard skin, chosen difficulty).

3. **How Bugs Are Evaluated**:
   - Bugs are prioritized by how severely they break a core persona promise:
     - Timing/audio latency/chord registration bugs break *The Rock Band Player* (game feel).
     - UI friction, menu clutter, or crash bugs break *The Casual Player* and *The Returning Adult* (short session limits).
     - Lost XP, combo glitches, or missing bard feedback break *The Gamer Bard* (character progression).

## Bug Fix Execution Protocol
Always follow this strict micro-targeted execution standard when resolving bugs:
1. Work bugs **ONE at a time**.
2. **Scan**: Read the issue description for the target issue and locate the specific files in the workspace related to the failure.
3. **Isolate**: Do NOT read or modify files outside the direct execution path of the bug.
4. **Fix**: Apply the exact, minimal code change required to resolve the issue. Do NOT refactor surrounding code, change architecture, or optimize unrelated functions.
5. **Output**: Always provide a one-sentence explanation of the root cause, followed by the exact code blocks needed to patch it.
6. Commit with `(Fixes #X)` and verify the issue is closed on GitHub.



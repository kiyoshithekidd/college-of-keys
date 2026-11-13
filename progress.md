# College of Keys — Implementation Progress

## Critical Rule
NEVER execute multiple phases at once. Stop at the end of each phase, provide testing instructions, and wait for "Testing successful".

## Phase Checklist
- [x] Phase 1: Electron Skeleton & Audio
- [x] Phase 2: MIDI Parsing & Auto-Difficulty (Octave Folding)
- [x] Phase 3: The Spell Highway & Accompaniment
- [x] Phase 4: Wait Mode & Chord Forgiveness (100ms Roll)
- [x] Phase 5: LitRPG Gamification UI (Combos, XP, Titles)
- [x] Phase 6: The Grimoire (Folder Watcher & Local Storage)
- [x] Phase 7: UI Polish & Particle Effects
- [x] Phase 8: Python ML Extraction (yt-dlp + basic-pitch CLI)
- [x] Phase 9: "The Quest Board" (In-App Sourcing)
- [x] Phase 10: 2-Bar Conservatory UI/UX Overhaul (v1.1.0 — Issues #18–#22) (Completed & Verified)
- [x] Phase 11: The Tavern Title Screen & Main Menu Front Door (Issues #52, #67, #68) (Merged in PR #70)
- [x] Phase 12: Tavern Title Splash, Palette Overhaul & Station UX (Issue #71) (Completed & Merged in PR #72 & PR #73)
- [x] Phase 13: Flippable Grimoire Spellbook Sorted by Difficulty (Issue #69) (Completed & Merged in PR #74 & PR #75)
- [x] Phase 14: Delete / Archive Songs from the Grimoire In-App (Issue #77) (Completed & Merged in PR #84)
- [x] Phase 15: Practice Streak Calendar (Issue #66) (Completed & Merged in PR #85)
- [x] Phase 16: Daily Quest System (Issue #53) (Completed & Merged in PR #86)
- [x] Phase 17: Grimoire Favorites — Attuned Spells Filter (Issue #79) (Completed & Verified)
- [x] Phase 18: Loop Practice Mode (Rehearsal) (Issue #30) (Completed & Verified)
- [x] Phase 19: Post-Song Breakdown — What Tripped Me Up (Issue #62) (Completed & Verified)
- [x] Phase 20: Practice Tempo Control — Slow the Song Down (Issue #63) (Completed & Verified)

---

## Prioritized Product Backlog (Persona-Driven Roadmap)

> **Prioritization Filter (`PERSONAS.md`):**
> 1. **Main Personas (Rank 1):** *The Returning Adult*, *The Gamer Bard*, *The Rock Band Player*
> 2. **Close Second (Rank 2):** *The Casual Song Player*
> 3. **Tentative (Rank 3):** *The Young Learner*
> 4. **Anti-Persona Guardrail:** *The Conservatory Purist* (reject dry classical-only pedagogy)

### P0 — Next Up (Daily Habit, Retention & Zero-Friction Practice)
1. **#66 — Practice Streak Calendar** (`returning-adult`, `gamer-bard`)
   - *Why next:* Gives busy adult learners a Duolingo-style daily habit loop (streak count, daily XP/minutes goal, streak freeze) so there is a tangible reason to open the app tomorrow. Creates the daily-session tracker that Daily Quests build upon.
2. **#53 — Daily Quest System** (`returning-adult`, `gamer-bard`)
   - *Why now:* Turns short 10–15 minute sessions into purposeful tavern bounties (e.g., *"Cast 2 spells at 85%+ mastery"*, *"Hold a 30-note Spell Chain"*) with bonus XP and d20 rewards.
3. **#79 — Grimoire Favorites: Star Songs and a Favorites Filter** (`returning-adult`, `gamer-bard`)
   - *Why now:* Quick win inside the new Grimoire Spellbook (#69). Lets players pin their 2–3 current focus songs instead of flipping tiers every session.

### P1 — Practice Mastery & Rhythm-Game Polish
4. **#30 — Loop Practice Mode (Rehearsal)** (`returning-adult`, `rock-band`)
   - *Why:* Essential for learning real songs—set A-B phrase markers on the timeline to drill a tricky chorus or bridge without restarting the whole track.
5. **#62 — Post-Song Breakdown (What Tripped Me Up)** (`returning-adult`, `rock-band`)
   - *Why:* Shows which measures/chords caused breaks or fumbles at song end, pairing naturally with `#30` ("jump straight to rehearsing that section").
6. **#63 — Practice Tempo Control (Slow the Song Down)** (`returning-adult`, `young-learner`)
   - *Why:* Polish & extend existing speed presets (`0.5x`–`1.25x`) with finer increments and pitch-preserved backing audio sync so players can build muscle memory cleanly.
7. **#25 — d20 Performance Check at Song End** (`gamer-bard`)
   - *Why:* Deepens the D&D Performance Check modal with an animated d20 roll + Bardic modifier + narrative tavern outcome.
8. **#24 — Bardic Inspiration Meter** (`gamer-bard`, `rock-band`)
   - *Why:* Upgrades the 50-combo trigger into a visible charging Inspiration meter / expendable burst or aura on the highway.

### P2 — Clean Song Sourcing, Arrangement Ladder & Sight-Reading
9. **#40 — MusicXML Import to MIDI** (`returning-adult`)
   - *Why:* Prerequisite for clean sheet-music-backed songs and `#76` / `#39` (far cleaner notes than raw YouTube audio transcription).
10. **#76 — Grimoire Song Bundle: Sheet Music + MIDI + Backing Audio** (`returning-adult`, `gamer-bard`)
    - *Why:* Combines clean MIDI/MusicXML notes with real YouTube full-band backing audio (requires tempo/offset sync spike).
11. **#61 — Song Difficulty Ladder: Simplified to Full Arrangement** (`casual-player`, `young-learner`, `returning-adult`)
    - *Why:* Lets a player start a favorite song on an approachable arrangement and voluntarily step up when ready.
12. **#39 — Epic C: Scrolling Grand-Staff Sheet Music Split View** (`returning-adult`, `young-learner`)
    - *Why:* Transfers highway muscle memory into real note-reading skill without leaving the tavern vibe.

### P3 — RPG Depth, Flow & Content Modes
13. **#26 — Tavern Crowd Meter** (`gamer-bard`, `rock-band`) — Live crowd hype/heckle reactions on the stage.
14. **#65 — Achievements (Milestones Beyond Titles)** (`returning-adult`, `gamer-bard`) — Unlockable bardic feats and trophy ledger.
15. **#64 — Setlists (Play Songs Back to Back)** (`returning-adult`, `rock-band`) — Queue 2–4 songs for uninterrupted practice/gig runs.
16. **#28 — Rhythm Practice Mode** (`returning-adult`, `rock-band`) — Focused timing & groove drills with metronome/subdivision feedback.
17. **#27 — Bard Colleges as Learning Tracks** (`returning-adult`, `gamer-bard`) — D&D-themed skill paths (Lore, Valor, Eloquence, Glamour) with curated milestones.
18. **#29 — Campaign Mode: Gigs at Venues** (`returning-adult`, `gamer-bard`) — Multi-song tavern/venue progression arc.
19. **#54 — Interactive Tutorial Scenario** (`returning-adult`, `young-learner`) — Playable "First Tavern Audition" onboarding song instead of static text.

### P4 — Major v2 Epics & Platform Expansion
20. **#41 — Epic B: AI Stem Separation (Demucs) and Play Along with Real Audio** (`rock-band`, `casual-player`) — Strip piano out of real tracks while keeping vocals/drums/bass.
21. **#43 — Epic A: Spell-Singing (Vocals / Let's Sing Mode)** (`rock-band`, `young-learner`) — Microphone pitch highway for duo/party play.
22. **#78 — Sheet Music Import via OMR (PDF / Scan to MusicXML)** (`returning-adult`, `gamer-bard`) — Optical music recognition pipeline into `#40` / `#76`.
23. **#42 — Multi-Instrument Highways (v2)** (`rock-band`) — Guitar/bass/drums highway expansion.
24. **#23 — Mobile iOS Port (iPad Mini)** (`returning-adult`) — Portable foldable-piano companion build.

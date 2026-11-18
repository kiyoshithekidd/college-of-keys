# College of Keys — Progress & Roadmap

Last Updated: 2026-11-18

## Completed & Merged to `main`
- **Bug Backlog & Maintenance:** `#98`–`#105`, `#107`, `#110`, `#121` (Electron `v45.3.4` runtime upgrade), `#122`
- **Bundle 1 (Practice & Progression):** `#111`, `#28`, `#108`
- **Bundle 2 (Notation & Polish):** `#106`, `#109`
- **OMR Confidence & Review:** `#78`
- **Tavern Crowd Meter:** `#26` (`tavern-setlists.js`, HUD mood meter, XP multiplier)
- **Setlists:** `#64` (multi-song gig queue, Setlist Builder modal, performance modal progression)
- **Achievements (Milestones Beyond Titles):** `#65` (`bard-achievements.js`, `icon-achievement-seal.png`, unlock banner, Bardic Annals grid)
- **Interactive Tutorial Scenario:** `#54` (`guild-tutorial.js`, `icon-guild-mentor.png`, 4-step Trainer's Guild coach HUD)
- **Bard Colleges as Learning Tracks:** `#27` (`bard-colleges.js`, `icon-college-lore.png`, `icon-college-cadence.png`, `icon-college-revelry.png`, College Select modal, 9 drills, per-college repertoire)
- **Campaign Mode: Gigs at Venues:** `#29` (`bard-campaign.js`, `icon-campaign-map.png`, 3 new venue stage backdrops, 4-act story progression with DC unlocks)
- **Quest Board Arrangement Mode:** `#123` (`python_ml/transcribe_quest.py --mode piano-cover|full-song`, `buildFullSongArrangement` in `midi-hygiene.js`, Quest Board mode selector cards, and in-app `Full-Song Piano Arrangement` track mode)
- **AI Stem Separation & Real Audio Play-Along:** `#41` (`--split-stems` 6-stem separation in `python_ml/transcribe_quest.py` via `htdemucs_6s` + spectral/transient fallback, `<safe_base>.bundle.json` sidecar, 6-Stem Play-Along Mixer with Mute/Solo and Piano muted by default, local audio file picker, and FIFO background job queue with HUD pill)
- **Multi-Instrument Highways (v2):** `#42` (`HIGHWAY_INSTRUMENTS`, `detectAvailableInstrumentHighways`, and `mapInstrumentHighwayNotes` in `midi-hygiene.js`, `#highway-instrument-select` HUD switcher for Piano, Bass, Drums, Guitar, Vocals, and Synth/Other, and automatic stem muting for the active highway instrument)

---

## Remaining Open Backlog (2 Major Epics & Ports)

1. **#43 — `[Backlog] Epic A: Spell-Singing (Vocals / Let's Sing Mode)`** (`persona: rock-band`, `persona: young-learner`)
2. **#23 — `[Backlog] Mobile iOS Port (iPad Mini)`** (`persona: returning-adult`)



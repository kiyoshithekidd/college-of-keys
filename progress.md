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
- **Multi-Instrument Highways (v2) & Plug-In External Instrument Rig:** `#42` (`HIGHWAY_INSTRUMENTS`, `detectAvailableInstrumentHighways`, and `mapInstrumentHighwayNotes` in `midi-hygiene.js`, `instrument-input.js` for MIDI devices/channels, GM E-Drums, Line-In/Mic pitch & acoustic drum onset detection, and USB/Bluetooth gamepads)
- **Spell-Singing (Vocals / Let's Sing / Karaoke Mode):** `#43` (`#124` Plug-In Instrument Auto-Routing & Mic/Headphone Bleed Guard; `#125` MusicXML `<lyric>` extraction, `.lrc` sidecar parser, Paste Lyrics modal & Solfège fallback; `#126` standalone Karaoke Stage with horizontal Vocal Pitch Highway, dynamic phrase auto-zoom, live cents ribbon & 2-line teleprompter; `#127` octave-agnostic `mod 12` scoring, 100ms singing-break forgiveness, separate Vocal XP/Level pool & Level 40 Piano title renamed to `Grand Skald`)
- **Codebase Audit Fixes & Polish:** `#128` (Karaoke paused-mic scoring guard, backward-scrub pitch trail pruning & restart teleprompter reset), `#129` (OMR & Setlist modal keyboard guards + Escape key for Colleges & Campaign), `#130` (`beforeunload` mic stream cleanup & persistent custom Karaoke lyrics), `#131` (live `devicechange` USB mic/headphone hot-plug detection), `#132` (Vocal Level/XP/Songs in Bardic Annals), `#133` (committed `npm test` regression suite in `tests/`)
- **Full-Codebase Bug Hunt — Bundle A (Live Gameplay, Input & UI Stability):** `#135`, `#136`, `#137`, `#142`, `#143`
- **Full-Codebase Bug Hunt — Bundle B (Sheet Music, Notation & Song Data):** `#134` (VexFlow 5 dotted rests, transposed MusicXML per-measure key specs, `scoreId` transpose key, `invalidateMeasure` matching & lookahead alpha cache), `#140` (volta pass reset, multi-`direction-type` metronome, durationless whole-measure rests & multi-part sync, first-part concert key signature & staff `>= 3` preservation), `#141` (leading-`..` portable paths, cleared bundle field preservation, case-insensitive/songId key migration, finite MIDI folding, loop-based `minT`/`maxT` & accurate `chosenPlayableIndices`)
- **Full-Codebase Bug Hunt — Bundle C (Python ML Pipelines — Transcription & OMR):** `#138` (Demucs `Popen` UTF-8 decoding & `finally` process cleanup, removal of 180s/240s audio truncation caps, full-mix fallback when isolated piano stem yields 0 notes, and strict `--no-backing` guard), `#139` (OMR top-level error reporting, resilient multi-page `ET.parse` stitching, `pypdfium2` resource cleanup, UTF-8 `subprocess.run`, `$1`/`$&`-safe XML title overrides, and renderer OMR playback pause, `error`/stale-`close` guards, Tavern hide & `beforeunload` child cleanup)
- **Multi-Engine AI Transcription & Demucs + CREPE Full-Song Pipeline (`v1.5.0`–`v1.5.2`):** `#144`, `#145`, `#146`, `#150`–`#156`, responsive 2-row Bar 2 layout, and `#158` (`.btn-audio-sync` & text pill `.btn-icon` width/nowrap fix)
- **Karaoke Suite Upgrade (Synced Lyrics, Sliding Vocal Highway & Vocal/Harmony Mix):** `#159` (`lyrics-fetcher.js` LRCLIB word/line sync, 3-tier Python `.lrc` cascade with LRCLIB + `.json3`/`.vtt` YouTube captions + optional `faster-whisper`, 1-click `🔍 Fetch Lyrics`, Lyric Timing Sync / Auto-Align & Apple Music word sweep), `#160` (`CREPE`/`pYIN` 170ms vibrato median smoothing in true vocal register, `simplifyVocalNotesForSinging()`, cubic Bezier glide ribbons & Warm Tavern stage palette), and `#161` (`vocal-harmony-dsp.js` Lead Vocal fader defaulting to 25% Guide, Keep Harmonies toggle, Web Audio Stereo Mid/Side matrix & optional UVR AI `vocals_lead`/`vocals_backing` split)

---

## Remaining Open Backlog

1. **#162 — `[Backlog] Grimoire Hall of Legends: Personal Records Board (Best Accuracy & Biggest XP)`** (`persona: gamer-bard`)
2. **#163 — `[Backlog] Grimoire Audio Preview: 30-Second Listen Before You Load`** (`persona: returning-adult`, `persona: casual-player`)
3. **#164 — `[Backlog] Fail State: Crowd Warning and Boo-Off (Tavern Crowd Meter Refinement)`** (`persona: rock-band`)
4. **#23 — `[Backlog] Mobile iOS Port (iPad Mini)`** (`persona: returning-adult`)



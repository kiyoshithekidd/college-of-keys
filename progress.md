# College of Keys — Progress & Roadmap

Last Updated: 2026-11-27 (v1.13.2)

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

- **Shipped v1.6.0–v1.13.0 (see `CHANGELOG.md` for details):** `v1.6.0` Synced Lyrics Cascade, CREPE smoothing & Vocal Harmony Mix (`#158`–`#161`, `#166`); `v1.7.0` Hall of Legends & 30s Grimoire Preview (`#162`, `#163`, `#167`, `#168`); `v1.8.0` Crowd Fail State / Boo-Off (`#164`, `#170`); `v1.9.0` Rhythm & Sight-Reading Polish (`#179`, `#181`–`#183`, `#186`); `v1.10.0` Save Backup & `modules/` refactor (`#184`, `#185`, `#188`); `v1.11.0` MIDI Output & Arcane Drills (`#178`, `#180`, `#190`); `v1.12.0` `.txt` Vocal Charts, Radiant notes & Karaoke Key Shift (`#172`–`#174`, `#192`); `v1.13.0` Forced Alignment, RoFormer/De-Reverb & `-14 LUFS` Loudness (`#175`–`#177`, `#194`)

---

## Remaining Open Backlog

1. **#23 — `[Backlog] Mobile iOS Port (iPad Mini)`** (`persona: returning-adult`)

## Codebase Sweep (2026-11-27)

56 verified findings (`#196`–`#251`) are bundled into milestones `v1.13.1`–`v1.13.5` and `v1.14.0`; see `docs/codebase-sweep-findings.md`. `v1.13.1` (`#196`, `#197`, `#209`–`#211`, `#219`, `#220`, `#238`, `#239`) and `v1.13.2` (`#201`–`#203`, `#224`, `#231`–`#233`, `#244`, `#250`) are shipped.

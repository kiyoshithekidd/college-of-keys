# College of Keys

> **A D&D 5E Bard LitRPG Piano, Multi-Instrument & Spell-Singing Karaoke Desktop Application**

**College of Keys** replaces clinical music drills with an Arcane Bard progression loop. Connect a physical **61-key MIDI keyboard (`C2`–`C7`)**, **GM E-Drums**, **USB/Line-In guitar or bass**, **USB/Bluetooth gamepad**, or **vocal microphone**—or test with your mouse and QWERTY keyboard—to cast musical spells on a 60 FPS HTML5 Canvas ("The Spell Highway") or sing along in standalone **Spell-Singing Karaoke Mode**. Practice with intelligent **Wait Mode**, **100ms Chord Forgiveness**, **6-Stem AI Play-Along Mixing**, and **Grand-Staff Sheet Music**, and level up from *Tavern Busker* to *Grand Maestro*.

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
| **v1.2.0** | **Grand-Staff Sheet Music Split View (`#39`), MusicXML (`#40`), Song Bundles (`#76`), 3D d20 Dice Tray (`#25`), Inspiration Meter (`#24`), Practice Suite (`#30`, `#62`, `#63`) & Smooth 60 FPS Notation (`#96`, `#97`)** | **Completed** |
| **v1.3.0** | **OMR Sheet Import (`#78`), Tavern Crowd Meter (`#26`), Setlists (`#64`), Achievements (`#65`), Interactive Tutorial (`#54`), Bard Colleges (`#27`) & 4-Act Story Campaign (`#29`)** | **Completed** |
| **v1.3.1** | **Tavern Modal Z-Index, Consolidated Career Menu, Slim Playboard HUD & Imports Auto-Catalog (`#122`)** | **Completed** |
| **v1.4.0** | **Electron `v45.3.4` (`#121`), Full-Song Piano Arrangement (`#123`), 6-Stem AI Play-Along Mixer (`#41`), Multi-Instrument Highways & Plug-In Rig (`#42`), Spell-Singing Karaoke Mode (`#43`, `#124`–`#127`), `npm test` Regression Suite (`#133`) & Full-Codebase Audit Fixes (`#128`–`#143`)** | **Completed** |
| **v1.5.0** | **Optional Transkun V2 Solo-Piano Engine (`#144`, `#145`), Quest Board Engine & Pipeline Selectors, Demucs 4-Stem + CREPE Vocal Melody & Chroma Harmony Full-Song Pipeline (`#146`) & Clean Piano-Cover Stem Routing** | **Completed** |
| **v1.5.1** | **Performance & QA Hardening (`#150`–`#156`): Debounced Profile Saves, Idle Tavern Canvas Guard, `O(visible)` Highway Scans, Zero-Alloc YIN DSP, `O(M+N)` VexFlow Partitioning, Single-Pass `readdirSync` Bundles, `O(log T)` MusicXML, Vectorized Python WAV Writer & CSS/GPU Compositor Cleanup** | **Completed** |
| **v1.5.2** | **Responsive Top-Bar Layout & Overflow Fix: Isolated `.spell-meta-main` Truncation, 2-Row Responsive Wrap on `#spell-scroll-bar` (`<=1820px`), and `1024px` Bar 1 Protection** | **Completed** |
| **v1.6.0** | **3-Tier Synced Lyrics Cascade (`LRCLIB` Word/Line Sync + YouTube `.json3`/`.vtt` + `faster-whisper`) & 1-Click `🔍 Fetch Lyrics` (`#159`), CREPE 170ms Vibrato Smoothing & Bezier Portamento Glide Ribbons (`#160`), Apple Music Sing Lead Vocal Fader & Mid/Side + UVR AI Harmony Control (`#161`), `.btn-audio-sync` Pill Overflow Fix (`#158`), and Peer Review & QA Hardening (`#166`)** | **Completed** |
| **v1.7.0** | **Grimoire Hall of Legends Personal Records Board & `+50 XP` Record Bonus (`#162`), Grimoire 30-Second Audio Preview (`🎙 Recording` & `🎹 Piano MIDI`) (`#163`), Song-Stats Migration Persistence Fix (`#167`), and Peer Review & QA Hardening (`#168`)** | **Completed** |

---

## Key Features & Architecture

### 1. 61-Key Arcane Keyboard & Octave Folding (`C2` to `C7`)
- Renders all **61 keys** (`36` white keys, `25` black keys, MIDI notes `36` to `96`) on a single 60 FPS HTML5 Canvas.
- **Octave Folding:** Any MIDI note below `C2` (`< 36`) or above `C7` (`> 96`) is automatically transposed by $\pm 12$ semitones until it fits within the 61-key range so every song is 100% playable on a 61-key controller.
- **Zero-Latency Audio (`<10ms`):** Powered by a persistent `Tone.PolySynth` voice pool with `Tone.context.lookAhead = 0`, 4 selectable instrument presets (*Tavern Grand Piano*, *Arcane Lute-Harp*, *Cathedral Pipe Organ*, *Eldritch Warm Pad*), and physical **Sustain Pedal (`CC 64`)** support.

### 2. 2-Bar Conservatory UI/UX Layout (~82% Stage Height)
- **Bar 1 (`#tavern-header`):** Branding & Sourcing (`The Grimoire`, `Quest Board`, `Import`, `Demo`), consolidated **`🎭 Career ▾`** menu (`Setlists`, `Colleges`, `Campaign`), inline *Baldur's Gate 3*-style **Bardic Character Banner** (`LVL`, `Bardic Rank`, inline `XP Progress Bar`, `Total XP`, `🏆 Stats`), and compact `MIDI Status` + **`⚙ Audio & Keys`** popover.
- **Bar 2 (`#spell-scroll-bar`):** Active Spell Title, Difficulty Badge, **`ⓘ Details`** inspector popover (`NPS`, `BPM`, track breakdowns, and testing shortcuts), **`🎧 Sync`** calibrator, Primary Transport (`▶ Cast Spell`, `⏮`, scrubber, `A`/`B`/`Loop`), View Switch (`Highway | Split | Score | Karaoke`), and Practice Deck (`Wait`, `Rhythm`, `Highway`, `Practice`, `Band`, `Tempo`) with automatic 2-row responsive wrapping below `1820px` so no controls overlap or clip down to `1024px`.
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
- **Auto-Calculated Spell Level (Notes Per Second / NPS — 10 Spellbook Tiers):**
  - `< 1.5 NPS`: **Cantrip** (`1.0x` XP)
  - `1.5 – <2.0 NPS`: **1st-Level Spell** (`1.1x` XP)
  - `2.0 – <2.6 NPS`: **2nd-Level Spell** (`1.2x` XP)
  - `2.6 – <3.3 NPS`: **3rd-Level Spell** (`1.3x` XP)
  - `3.3 – <4.0 NPS`: **4th-Level Spell** (`1.4x` XP)
  - `4.0 – <4.8 NPS`: **5th-Level Spell** (`1.5x` XP)
  - `4.8 – <5.8 NPS`: **6th-Level Spell** (`1.6x` XP)
  - `5.8 – <6.9 NPS`: **7th-Level Spell** (`1.7x` XP)
  - `6.9 – <8.0 NPS`: **8th-Level Spell** (`1.8x` XP)
  - `8.0+ NPS`: **9th-Level Spell** (`2.0x` XP)
- **Bardic Inspiration Meter & Combo Shield (`#24`):** Build charge on clean hits to trigger a **10s `2.0x XP` Surge** (`Enter` or HUD click) or automatically absorb 1 off-key combo break with **Auto Combo Shield**.
- **3D d20 Performance Check (`#25`):** At song completion, toss a 3D physics gold d20 (`three` + `cannon-es`) inside the tavern felt tray for `d20 + Accuracy Mod vs Song DC` bonus XP.
- **XP & Bardic Titles:** Earn `+10 XP` per clean note (`+2 XP` "Fumbled Component" if paused `> 2s` in Wait Mode). Level up from **Level 1 (*Tavern Busker*)** through **Level 40 (*Grand Skald*)** to **Level 50 (*Grand Maestro*)**, with a separate **Vocal Level & Vocal XP** pool tracked in **The Bardic Annals**.

### 6. Scrolling Grand-Staff Sheet Music, MusicXML & Practice Suite (`v1.2.0`)
- **Highway | Split | Score Views (`1` / `2` / `3`):** View falling notes, a **52% Grand-Staff Sheet Music + Spell Highway Split View**, or full **Scrolling Grand-Staff Score View** powered by VexFlow 5 + Bravura (`notation-engine.js`) with smooth 60 FPS camera panning and a notehead-tracking Crimson playhead.
- **MusicXML Import (`#40`):** Load `.musicxml`, `.xml`, and compressed `.mxl` scores directly via file picker, drag-and-drop, or `./Imports`.
- **Rehearsal Loop (`#30`), Practice Tempo (`#63`) & Post-Song Breakdown (`#62`):** Set `[A]`/`[B]` phrase loops (`[` / `]` / `\`), slow tempo from `0.5x` to `1.25x` with pitch preservation (`-` / `=`), and jump straight into weak measures from the post-song breakdown.
- **Grimoire Song Bundles & Sync Calibrator (`#76`):** Pair playable notes, sheet music references, and backing audio with Beat 1 alignment, RMS Auto-Align, and non-destructive **Smart MIDI Hygiene**.

### 7. Bardic Career, Colleges, Setlists & Sheet-Music OMR (`v1.3.0`–`v1.3.1`)
- **4-Act Story Campaign (`#29` — *The Ballad of the Silver Keys*):** Progress from **Act I: Cobblestone Street Corner** (`DC 10`) → **The Silver Flagon Tavern** (`DC 12`) → **Grand Conservatory Hall** (`DC 15`) → **The Royal Court** (`DC 18`) with custom venue stage backdrops, story intros/epilogues, and DC-gated unlocks.
- **Bard Colleges as Learning Tracks (`#27`):** Enroll in **College of Lore** (sight-reading & theory), **College of Cadence** (speed & accuracy), or **College of Revelry** (performance & showmanship), each with 3 curated drills and recommended Grimoire repertoire.
- **Tavern Crowd Meter (`#26`) & Setlists (`#64`):** Keep the crowd energized from *Restless* (`0.85x` XP) up to *Enchanted* (`1.5x` XP), and build/save multi-song **Setlists** with back-to-back stage transitions.
- **Achievements (`#65`) & Interactive Tutorial (`#54`):** Unlock 7 persistent Bardic milestones with in-moment celebration banners and view them in **The Bardic Annals**; launch the 4-step **Trainer's Guild Guided Tutorial** directly from the Tavern Menu.
- **OMR Sheet-Music Import (`#78`):** Import PDF/image sheet music via `homr` + `pypdfium2` with confidence review (`omr-confidence.js`).

### 8. Multi-Instrument Highways, 6-Stem AI Play-Along & Spell-Singing Karaoke (`v1.4.0`)
- **Quest Board Full-Song Piano Arrangement (`#123`):** Choose between **Piano Cover** and **Full-Song Piano Arrangement** (`--mode piano-cover|full-song` + in-app `buildFullSongArrangement()` in `midi-hygiene.js`) to extract playable RH melody + LH chords from any full-band song.
- **6-Stem AI Separation & Play-Along Mixer (`#41`):** Split songs into 6 stems (`Piano`, `Drums`, `Bass`, `Vocals`, `Guitar`, `Other`) via Demucs `htdemucs_6s` (with spectral/transient fallback), auto-linked via `<Base>.bundle.json` sidecars and controlled in-app with per-stem **Mute / Solo** and volume sliders.
- **Multi-Instrument Highways & Plug-In External Instrument Rig (`#42`):** Chart any instrument stem or GM track (`Piano`, `Bass`, `Drums`, `Guitar`, `Vocals`, `Synth / Other`) onto the highway, and plug in external **MIDI keyboards**, **GM E-Drums**, **Line-In/Mic pitch & acoustic drum onset**, or **USB/Bluetooth gamepads** (`instrument-input.js`) with automatic source routing.
- **Spell-Singing — Standalone Karaoke / Let's Sing & Apple Music Sing Mode (`#43`, `#124`–`#127`, `#159`–`#161`):**
  - Select **Vocal Microphone** to auto-switch into the standalone **Karaoke Stage** (no piano required) with **Mic/Headphone Bleed Guard** and live USB mic/headphone hot-plug detection (`devicechange`).
  - **Synced Lyrics Pipeline (`#159`):** 3-tier automatic import cascade (**LRCLIB** word/line sync → **YouTube `.json3`/`.vtt`** captions → optional **`faster-whisper`** word-timestamped ASR on `vocals.wav`), plus in-app 1-click **`🔍 Fetch Lyrics`**, **Lyric Timing Sync** (`⚡ Align to First Vocal`), zero Solfège clutter on melisma notes, screen-reader-safe phrase announcements, and smooth intra-word Radiant Gold gradient fill sweep (`lyrics-fetcher.js`).
  - **Simplified & Sliding Vocal Pitch Highway (`#160`):** `CREPE` / `pYIN` vocal stem contour tracking with 170 ms vibrato median smoothing in true vocal register, client-side `simplifyVocalNotesForSinging()` for existing songs, cubic Bezier S-curve portamento glide ribbons with interpolated slide pitch scoring, and Warm Tavern Obsidian / Eldritch Blue / Radiant Gold styling (`spell-singing.js`).
  - **Apple Music Sing Vocal & Harmony Control (`#161`):** Granular **Lead Vocal Fader** (`0–100%`, defaulting to `25% Guide Vocal`) and **Keep Harmonies Toggle** (`✨ Harm`) across the Karaoke Stage, Bar 2 Vocal Highway pill, and Stem Mixer—powered by a real-time Web Audio **Stereo Mid/Side Matrix** on stereo `vocals.wav` stems plus optional **UVR Karaoke AI** discrete `vocals_lead.wav` + `vocals_backing.wav` separation (`vocal-harmony-dsp.js`).

### 9. Multi-Engine AI Transcription & Demucs + CREPE Full-Song Pipeline (`v1.5.0`)
- **Quest Board Piano Engine Selector (`#144`, `#145`):** Choose per song in **Piano Cover Mode** between:
  - **Fast (`basic-pitch`, default):** Lightweight ONNX model (~1 s/min on CPU), works on any instrument with zero PyTorch dependency.
  - **High-Accuracy Piano (`Transkun V2`, optional):** State-of-the-art solo-piano Transformer + Semi-CRF engine (MIT license, 44.1 kHz input + CC 64 sustain-pedal extension + BPM estimation), automatically falling back to `basic-pitch` if not installed.
- **Clean Piano-Cover Stem Routing (`#144`, `#145`):** When 6-stem separation is enabled alongside Piano Cover mode, `htdemucs_6s` powers the play-along mixer and Multi-Instrument Highways while piano transcription reads the clean audio directly (avoiding the weak 6-stem piano stem).
- **Demucs 4-Stem + CREPE Full-Song Pipeline (`#146`):** Under **Full-Song Arrangement** mode, choose **Auto (`Demucs + CREPE`)** or **Fast (`basic-pitch`)**:
  - Separates `vocals`, `other`, and `bass` via Demucs 4-stem (`htdemucs`, or reuses already-separated stems).
  - Extracts a clean monophonic Right-Hand lead melody from `vocals.wav` using **CREPE (`torchcrepe`)** with Viterbi decoding and 40 ms hysteresis segmentation to suppress vibrato flicker (falling back to `librosa.pyin`).
  - Derives 2-beat Left-Hand root + fifth/third chord voicings from `other.wav` + `bass.wav` via CQT chroma histograms.

### 10. Karaoke Suite: Synced Lyrics, Sliding Vocal Highway & Vocal/Harmony Mix (`v1.6.0`)
- **Synced Lyrics (`#159`):** 1-click `🔍 Fetch Lyrics` pulls LRCLIB word/line sync; the Python importer falls back to YouTube `.json3`/`.vtt` captions, then optional `faster-whisper`. Lyric Timing Sync popover (`⚡ Align to First Vocal`) and intra-word Radiant Gold sweep.
- **Let's Sing Vocal Highway (`#160`):** CREPE 170 ms vibrato smoothing in true vocal register, simplified notes, and Bezier portamento glide ribbons with combo-preserving glide scoring.
- **Vocal & Harmony Control (`#161`):** Lead Vocal fader (`0% Mute` / `25% Guide` / `100% Full`) and `✨ Harm` toggle using a Web Audio Stereo Mid/Side matrix, plus optional UVR Lead/Backing split. Settings persist per song.
- **Fixes (`#158`, `#166`):** Sync pill overflow fixed; 13 peer-review/QA findings resolved, including a multi-stem `ReferenceError`.

### 11. Grimoire Hall of Legends & 30-Second Audio Preview (`v1.7.0`)
- **Hall of Legends (`#162`):** Final 11th spread in The Grimoire (`🏆` bookmark tab) displaying your **Top 10 Best Accuracy** and **Top 10 Biggest Single-Run XP** piano performances side by side. Strictly beating a prior personal record on a qualifying full-difficulty piano run (`≥80%` note coverage) awards a flat **`+50 XP`** bonus per record beaten (never on first play or ties). Tap any entry to load that spell.
- **30-Second Audio Preview (`#163`):** Every Grimoire song row and the Spell Details bar includes a **`▶` / `🎧 Preview`** control playing a 30-second excerpt — choose **`🎙 Recording`** (backing audio, shown only when present on disk) or **`🎹 Piano MIDI`** (rendered through the piano synth). Runs in an isolated audio path that stops on Stop, Load, Close, Page Flip, Filter Toggle, Delete, or Playback Start without touching highway state or XP.
- **Persistence & QA Fixes (`#167`, `#168`):** Fixed startup `song_stats.json` migration dropping extended per-song fields (`weakBarHistory`, `preferredTempo`, personal record dates), added `song_stats.json` to `.gitignore`, and resolved all 8 peer-review/QA findings.

---

## Controls & Input Modes

| Input Method | How to Use |
| :--- | :--- |
| **Physical 61-Key MIDI Keyboard** | Plug in via USB. Auto-detected via Web MIDI (`navigator.requestMIDIAccess`) with hot-plug support (`onstatechange`), velocity-0 `NoteOff` handling, and Sustain Pedal (`CC 64`). |
| **Plug-In External Instruments (`#42`, `#43`)** | Select **GM E-Drums**, **Line-In Guitar/Bass**, **Vocal Microphone (Karaoke)**, or **USB/Bluetooth Gamepad** in `⚙ Audio & Keys` — the app auto-routes to the matching highway or Karaoke Stage. |
| **Mouse Fallback** | Click or drag across any white or black key on the canvas. |
| **QWERTY Keyboard Fallback** | **White keys:** `A S D F G H J K L ;` &bull; **Black keys (sharps):** `W E T Y U O P` &bull; **Octave Shift:** `Z` (down) / `X` (up). Key labels auto-hide when physical MIDI is connected and can be toggled in `⚙ Audio & Keys`. |

---

## Getting Started

### Prerequisites
- **Node.js LTS** (`v20+` / `v24+`)
- Windows / macOS / Linux desktop environment

### Running the App
Double-click [`start.bat`](./start.bat) or run from the project root:
```powershell
.\start.bat
# or
npm start
```

### Optional Python ML Pipelines (`python_ml/`)
- **Core Quest Board & OMR (`basic-pitch` + `yt-dlp` + `homr`):**
  ```powershell
  .\python_ml\setup_ml_env.bat
  ```
- **Optional High-Accuracy Solo Piano (`Transkun V2`, requires PyTorch):**
  ```powershell
  pip install -r python_ml/requirements-transkun.txt
  ```
- **Optional Full-Song Vocal + Harmony (`Demucs` + `torchcrepe`, requires PyTorch):**
  ```powershell
  pip install -r python_ml/requirements-full-song.txt
  ```

### Running the Regression Test Suite
Verify all core modules, Electron `v45.3.4` DOM checks, Karaoke/Plug-In Rig routing, Notation, MusicXML, Song Bundles, and OMR helpers:
```bash
npm test
```

---

## Repository Structure & Documentation

- [`main.js`](./main.js) — Electron main process, automatic Web MIDI/media permission handlers, and folder IPC.
- [`index.html`](./index.html) & [`styles.css`](./styles.css) — 2-Bar Conservatory HUD, Karaoke Stage, and responsive 60 FPS canvas stage.
- [`renderer.js`](./renderer.js) — 61-key canvas geometry (`C2`–`C7`), Web MIDI & Plug-In Rig listener, 6-Stem Mixer, Karaoke renderer, and `Tone.Sampler` / `Tone.PolySynth` audio engine.
- [`notation-engine.js`](./notation-engine.js) — VexFlow 5 + Bravura Grand-Staff sheet music engine, LRU tile cache, and smooth tracking playhead.
- [`instrument-input.js`](./instrument-input.js), [`spell-singing.js`](./spell-singing.js), [`lyrics-fetcher.js`](./lyrics-fetcher.js) & [`vocal-harmony-dsp.js`](./vocal-harmony-dsp.js) — External instrument input routing, Let's Sing vocal contour simplifier & Bezier glide highway, LRCLIB word/line synced lyrics fetcher, and Apple Music Sing Stereo Mid/Side + AI Lead/Harmony vocal mixer DSP.
- [`d20-roller.js`](./d20-roller.js) — Three.js + `cannon-es` 3D physics d20 Performance Check dice tray.
- [`musicxml-converter.js`](./musicxml-converter.js), [`midi-hygiene.js`](./midi-hygiene.js), [`song-bundle.js`](./song-bundle.js) & [`omr-confidence.js`](./omr-confidence.js) — Pure-JS MusicXML-to-MIDI converter, Smart MIDI Hygiene & Multi-Instrument Highways, Grimoire Song Bundle sync (including per-song `vocalMix` and `lyricsOffsetSec`), and OMR confidence review.
- [`tavern-setlists.js`](./tavern-setlists.js), [`bard-achievements.js`](./bard-achievements.js), [`guild-tutorial.js`](./guild-tutorial.js), [`bard-colleges.js`](./bard-colleges.js), [`bard-campaign.js`](./bard-campaign.js), [`hall-of-legends.js`](./hall-of-legends.js) & [`grimoire-preview.js`](./grimoire-preview.js) — Tavern Crowd Meter, Setlists, Achievements, Interactive Tutorial, Bard Colleges, 4-Act Story Campaign, Grimoire Hall of Legends personal records, and isolated 30-second Audio Preview modules.
- [`python_ml/transcribe_quest.py`](./python_ml/transcribe_quest.py) & [`python_ml/omr_import.py`](./python_ml/omr_import.py) — Python ML pipelines for YouTube/audio transcription (`basic-pitch` default + optional **Transkun V2** solo-piano engine + optional **Demucs 4-stem + CREPE** vocal melody & harmony arrangement + stereo Demucs 6-stem separation + optional UVR Lead/Backing vocal split + 3-tier synced `.lrc` lyrics cascade) and PDF/image sheet-music OMR (`homr` + `pypdfium2`).
- [`docs/transkun-spike-findings.md`](./docs/transkun-spike-findings.md) — Issue #144 transcription engine benchmark and architectural decision record (`basic-pitch` vs Transkun V2 vs ByteDance).
- [`tests/run-tests.js`](./tests/run-tests.js), [`tests/karaoke-and-lyrics.test.js`](./tests/karaoke-and-lyrics.test.js), [`tests/legends-and-preview.test.js`](./tests/legends-and-preview.test.js) & [`tests/regression.test.js`](./tests/regression.test.js) — Automated Node unit + headless Electron DOM regression suite (`npm test`).
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


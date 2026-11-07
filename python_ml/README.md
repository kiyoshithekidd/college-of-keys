# College of Keys — Decoupled Python ML Pipeline (`Phase 8`)

This directory contains the standalone Python CLI that powers **The Quest Board** and automated audio-to-MIDI spell transcription for **College of Keys**.

Keeping this pipeline decoupled from the Electron binary prevents bundling multi-gigabyte ML/audio libraries into the desktop app while allowing seamless integration via the watched `../Imports/` folder.

---

## Features

1. **YouTube Audio Extraction (`yt-dlp`)**:
   - Downloads audio from any YouTube URL (or converts local `.wav`/`.mp3`/`.flac` files).
   - Preserves a synced `.wav` backing track alongside the generated `.mid` file in `../Imports/`.
2. **Dual-Engine Polyphonic Audio-to-MIDI Transcription**:
   - **Tier 1 (`spotify/basic-pitch`)**: Uses Spotify's neural audio-to-MIDI model when running in a Python 3.10–3.12 environment with `basic-pitch` installed.
   - **Tier 2 (Built-in Polyphonic Harmonic Spectral Transcriber + Pure-Python SMF `.mid` Writer)**: Automatically runs out-of-the-box on **Python 3.13 / 3.14+** (or offline environments) using windowed spectral analysis across MIDI pitches `36..96` (`C2`–`C7`), harmonic overtone suppression, onset/duration tracking, and Standard MIDI File (Format 1) generation split into Right Hand (`Track 1`) and Left Hand (`Track 2`).
3. **Zero-Config `--self-test` Mode**:
   - Synthesizes a multi-voice stereo polyphonic audio recording (*The Bard's Arcane Prelude*, 16-bit 44.1kHz `.wav`), transcribes the audio waveform into a two-hand `.mid` file, and drops both files into `../Imports/` so the running Electron app's Phase 6 Grimoire folder watcher ingests it immediately.
4. **Structured JSON Progress Stream (`[QUEST_STATUS]`)**:
   - Emits real-time `[QUEST_STATUS] {"stage": "...", "progress": 0..100, "message": "..."}` lines on `stdout` for Phase 9's in-app **Quest Board** progress bar.

---

## Quick Start

### 1. First-Time Setup & Self-Test (Windows)
Double-click or run from terminal:
```powershell
.\python_ml\setup_ml_env.bat
```

### 2. Run the Polyphonic Audio-to-MIDI Self-Test
```powershell
.\python_ml\run_transcriber.bat --self-test
```

### 3. Transcribe a YouTube URL into `Imports/`
```powershell
.\python_ml\run_transcriber.bat "https://www.youtube.com/watch?v=YOUR_VIDEO_ID"
```

### 4. Transcribe a Local Audio File (`.wav` / `.mp3`)
```powershell
.\python_ml\run_transcriber.bat "path\to\song.wav" --title "Custom Tavern Song"
```


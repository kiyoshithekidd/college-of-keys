# College of Keys — Decoupled Python ML Pipeline (`Phase 8`)

This directory contains the standalone Python CLI that powers **The Quest Board** and automated audio-to-MIDI spell transcription for **College of Keys**.

Keeping this pipeline decoupled from the Electron binary prevents bundling multi-gigabyte ML/audio libraries into the desktop app while allowing seamless integration via the watched `../Imports/` folder.

---

## Features

1. **YouTube Audio Extraction (`yt-dlp`)**:
   - Downloads audio from any YouTube URL (or converts local `.wav`/`.mp3`/`.flac` files).
   - Preserves a synced `.wav` backing track alongside the generated `.mid` file in `../Imports/`.
2. **Multi-Engine Polyphonic Audio-to-MIDI Transcription (`--engine basic-pitch|transkun|auto`, `--full-song-pipeline auto|demucs-crepe|basic-pitch`)**:
   - **Tier 1 (`spotify/basic-pitch`, default)**: Fast, lightweight ONNX neural audio-to-MIDI model (~1 s/min on CPU). Works across all instruments and powers fast `#123` Full-Song Arrangement mode.
   - **Tier 1B (`transkun` V2, optional)**: High-accuracy solo-piano transcription engine (MIT license, 44.1 kHz + CC 64 sustain-pedal extension). Install optionally with `pip install -r python_ml/requirements-transkun.txt` (requires PyTorch). Falls back automatically to `basic-pitch` if not installed.
   - **Full-Song Vocal + Harmony Pipeline (`demucs` + `torchcrepe`, optional, Issue #146)**: Separates `vocals` + `other` + `bass` via Demucs 4-stem (`htdemucs`, avoiding the weak 6-stem piano stem), tracks the Right-Hand lead melody with CREPE (Viterbi + 40 ms hysteresis segmentation, falling back to `librosa.pyin`), and extracts Left-Hand chords from `other` + `bass` stems via CQT chroma histograms. Install optionally with `pip install -r python_ml/requirements-full-song.txt`.
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


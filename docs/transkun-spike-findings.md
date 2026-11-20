# Transkun Transcription Engine Spike — Findings Report (Issue #144)

**Date:** 2026-11-19  
**Issue:** [kiyoshithekidd/college-of-keys#144](https://github.com/kiyoshithekidd/college-of-keys/issues/144)  
**Scope:** Research, benchmarking, and planning only. No application code or dependencies were modified.

---

## Executive Summary & Recommendation

**Recommendation: Offer both engines as a Quest Board choice — keep Spotify `basic-pitch` as the default engine (and mandatory for `full-song` mode / lightweight installs), and offer Transkun V2 as an opt-in "High-Accuracy Piano" engine for `piano-cover` mode when PyTorch is installed.**

### Why not a full swap to Transkun?
1. **Regresses `full-song` / no-piano tracks (`#123`):** Transkun V2 is a solo-piano specialist trained on MAESTRO. On tracks with no piano (*Olivia Rodrigo — expectations* and a controlled zero-piano *Linkin Park — Numb* band mix), Transkun drops most vocal/guitar content, producing **57 notes** (after `#123` arrangement) vs **226** for `basic-pitch` on *expectations*, and **63 cleaned notes** vs **185** on *Numb*.
2. **~45–55× slower on CPU:** On our 2-vCPU test environment, `basic-pitch` (ONNXRuntime) transcribed 60 seconds of audio in **0.72–0.99 s**, whereas Transkun V2 took **38.4–44.0 s** per 60-second clip (~2.5 minutes for a typical 3.5-minute song on CPU).
3. **Heavier dependencies & Windows/Python packaging friction:** Transkun requires PyTorch (~200 MB CPU wheel; ~2.5 GB CUDA), `ncls` (Cython extension with limited Windows wheels), `sox`/`soxr`, `pydub` (requires `audioop-lts` on Python 3.13+), `tensorboard`/`matplotlib`/`seaborn`, and `setuptools<81` (because `transkun/transcribe.py` imports `pkg_resources`). `basic-pitch` runs on lightweight `onnxruntime` (~27 MB) with zero PyTorch dependency.
4. **Sustain-pedal duration mismatch with existing post-processing:** Transkun V2's bundled checkpoint is trained *without* pedal extension (`No Pedal Ext`). Without applying CC 64 pedal extension before `clean_and_quantize_neural_notes()`, its short key-release durations cause **17.5%–91.2%** of raw notes to be dropped by the existing `< 95 ms` filter.

### Why not stay on `basic-pitch` alone?
1. **Substantially higher accuracy on solo piano:** On MAESTRO benchmarks, Transkun V2 achieves **98.4% onset F1 / 93.1% onset+offset F1** vs `basic-pitch`'s **70.9% onset F1 / 10.5% onset+offset F1**. It captures clean chord voicings, dynamics (velocity), and sustain pedal events without `basic-pitch`'s fragmented notes and overtone ghosts.
2. **Low incremental footprint if Demucs is already installed:** Users who enable `#41` Demucs stem separation already have PyTorch installed; adding `transkun==2.0.1` adds only a **50.8 MB** wheel with bundled weights (MIT license, zero runtime model downloads).

---

## 1. What Transkun Is

- **Repository:** [Yujia-Yan/Transkun](https://github.com/Yujia-Yan/Transkun) (PyPI: [`transkun` 2.0.1](https://pypi.org/project/transkun/), uploaded Sep 28, 2024).
- **Papers:**
  - **V1 (NeurIPS 2021):** Yujia Yan, Frank Cwitkowitz, Zhiyao Duan, *"Skipping the Frame-Level: Event-Based Piano Transcription With Neural Semi-CRFs"* ([OpenReview](https://openreview.net/forum?id=AzB2Pq7UFsA)).
  - **V2 (ISMIR 2024):** Yujia Yan & Zhiyao Duan, *"Scoring Time Intervals Using Non-Hierarchical Transformer for Automatic Piano Transcription"* ([arXiv:2404.09466](https://arxiv.org/pdf/2404.09466)).
- **Architecture:** Non-hierarchical Transformer (~14.1M parameters) that computes an interval score tensor over audio frames and decodes note intervals directly via a Neural Semi-Markov CRF (Viterbi dynamic programming), then predicts refined onset/offset times, velocity, and pedal events (CC 64/66/67).
- **License:** **MIT License** (verified in `Yujia-Yan/Transkun` GitHub metadata and PyPI classifiers).
- **Bundled Weights:** The `transkun-2.0.1-py3-none-any.whl` package (**50.8 MB**) bundles `transkun/pretrained/2.0.pt` (56.4 MB uncompressed) and `transkun/pretrained/2.0.conf`. Per the README, this shipped checkpoint is **Transkun V2 No Pedal Ext** (fine-tuned from `Transkun V2 Aug`, trained with data augmentation and *without* sustain-pedal extension of note durations).

### Installation, Dependencies & Runtime Requirements
- **Install command:** `pip install transkun` (requires `setuptools<81` for `pkg_resources`; on Python 3.13+, also requires `audioop-lts` for `pydub`).
- **Declared `install_requires` in `setup.py`:** `torch`, `torchaudio`, `ncls`, `pretty_midi`, `scipy`, `mir_eval`, `pydub`, `seaborn`, `matplotlib`, `tensorboard`, `tqdm`, `torch_optimizer`, `sox`, `soxr`, `moduleconf`. Also requires `ffmpeg` on `PATH` for `pydub` audio decoding.
- **Python version:** `setup.py` declares `>=3.6`, but in practice `torchaudio` and `ncls` constrain upper versions (confirmed working on **Python 3.11.2** in our test venv; upstream issues report failures on Python 3.13/3.14 without workarounds).
- **Running on a WAV file:**
  - CLI: `transkun input.wav output.mid --device cpu` (or `--device cuda`; optional `--segmentHopSize` / `--segmentSize`, trained defaults 10 s / 20 s).
  - Note: `transkun/transcribe.py`'s `readAudio()` calls `pydub.AudioSegment.from_mp3(path)` (which invokes `ffmpeg` to decode WAV/MP3) and resamples via `soxr` to `model.fs` (**44,100 Hz**).
- **Output:** A single-track Standard MIDI File (`pretty_midi`) containing 88-key piano notes (pitch, start, end, velocity) plus sustain/sostenuto/una corda pedal control changes (`CC 64`, `CC 66`, `CC 67`). No tempo estimation is performed (fixed default tempo grid).
- **CPU / GPU needs:** Runs on CPU by default (`--device cpu`) or NVIDIA CUDA (`--device cuda`). Minimum ~4 GB RAM recommended; GPU inference is ~3.5× faster on an RTX 4070 (8 GB VRAM) per spArtitI measurements.

---

## 2. The spArtitI Reference Implementation & Verification of the "2–8× Fewer Notes" Claim

- **Source:** Stefano Berrettini, *"From video or PDF to a score with fingering"* ([blog.solvei.it/en/blog/spartiti-trascrizione-pianoforte.html](https://blog.solvei.it/en/blog/spartiti-trascrizione-pianoforte.html), published Oct 20, 2026, updated Oct 25, 2026).
- **Source availability note:** The blog post was fetched and read in full. The spArtitI source repository is **not publicly available on GitHub** (verified via `gh repo list sberrettini` and GitHub code search), so all spArtitI details come from the blog post itself. The post does not publish raw per-song note counts or ground-truth F1 tables.
- **spArtitI pipeline:** Local Python/FastAPI + Next.js web app (`127.0.0.1`):
  1. `yt-dlp` + FFmpeg → MP3
  2. Optional Demucs `htdemucs_6s` → isolated piano stem (auto-skipped if piano energy > 90%)
  3. **Transkun** (MIT, default; ByteDance optional) → MIDI, with **explicit sustain-pedal extension** (median note duration on solo piano went from 0.23 s raw to 0.83 s after pedal extension)
  4. `music21` → MusicXML (hand split at Middle C, PLL adaptive tempo, Viterbi fingering)
  5. MuseScore 4 CLI → PDF + OpenSheetMusicDisplay browser player (+ `homr` OMR for PDFs)
- **What spArtitI actually compared:** An A/B comparison on **three real full-mix songs** — *La cura* (Franco Battiato), *In The Air Tonight* (Phil Collins), and *Una lunga storia d'amore* (Gino Paoli) — specifically comparing Transkun vs ByteDance **on the piano stem isolated by Demucs `htdemucs_6s`**. The author explicitly warns in Part 7 that *"On mixes the piano isolated by Demucs is 'dirty': the transcriber may invent or miss notes, especially if another instrument plays in the same range."*

### Does the "2 to 8 times fewer notes" claim hold up?
**Nuanced: No on raw solo piano / full mixes, Yes after short-note filtering or on sparse/noisy stems.**

1. **On raw note counts (solo piano & full mixes), the ratio is ~1.0×, not 2–8×:**
   - In our 5-song benchmark (Section 3), ByteDance-to-Transkun raw note ratios were **0.96× to 1.27×** (`1.00×` on *Sam Smith* solo piano, `1.03×` on *A Thousand Miles*, `1.00×` on *Dead Mom*, `0.96×` on *Olivia Rodrigo*, `1.27×` on *Numb* no-piano mix).
   - An independent public comparison ([hibikiwtnb/piano-midi-cleanup](https://github.com/hibikiwtnb/piano-midi-cleanup/blob/main/docs/lala-bytedance-transkun-comparison.md)) on *La la 勇気のうた* (HiRes audio separated with lalal.ai v6) found **2,872 notes** for ByteDance vs **2,733 notes** for Transkun (**1.05×**, onset agreement F1 = 0.921).
2. **Where a 2–8× difference *does* appear:**
   - **After duration filtering:** Because Transkun V2's default checkpoint outputs unextended key-release durations, on noisy/non-piano audio it emits mostly `< 95 ms` micro-notes (75.5% on *Dead Mom*, 91.2% on *Olivia Rodrigo*). After College of Keys' `clean_and_quantize_neural_notes()` (`< 95 ms` filter), ByteDance had **3.38×** more notes than Transkun on *Dead Mom* (561 vs 166) and **2.95×** more on *Olivia Rodrigo* (62 vs 21).
   - **On sparse Demucs `htdemucs_6s` piano stems** (e.g., *In The Air Tonight*, where piano is absent for long stretches): ByteDance's permissive default thresholds (`onset_threshold=0.3`, `frame_threshold=0.1`) hallucinate notes from Demucs bleed, whereas Transkun's semi-CRF Viterbi decoder suppresses more false positives.
3. **Stability across repeated runs:** In our repeated-run check on *Sam Smith*, **all three engines were 100% deterministic** on CPU (exact note-for-note equality across runs). spArtitI's "more stable" remark reflects lower false-positive burstiness on dirty audio rather than stochastic non-determinism.

---

## 3. Head-to-Head Benchmark (Same 5 Songs, 3 Engines)

### Test Environment & Audio Corpus
- **Hardware:** Remote Linux VM, 2× Intel Xeon 6985P-C vCPUs, CPU-only (no GPU).
- **Software:** Isolated temp venv (`/tmp/spike_venv`), Python 3.11.2, `basic-pitch==0.4.0` (`onnxruntime==1.32.0`, exact `transcribe_quest.py` thresholds), `transkun==2.0.1` (`torch==2.15.0+cpu`, bundled `2.0.pt`), `piano-transcription-inference==0.0.6` (`CRNN_note_F1=0.9677_pedal_F1=0.9186.pth` via Hugging Face mirror `Genius-Society/piano_trans`).
- **Audio corpus (first 60.0 s of each, 22,050 Hz mono 16-bit PCM WAV):**
  1. **Solo Piano Cover / Tutorial:** `Sam_Smith_-_I'm_Not_The_Only_One_(Easy_Piano_Tutorial).wav` (from project Drive `Imports/`).
  2. **Piano-Driven Pop Cover:** `A_Thousand_Miles.wav` (from project Drive `Imports/`).
  3. **Full-Band Broadway Rock with Vocals:** `Dead_Mom.wav` (from project Drive `Imports/`).
  4. **No-Piano Indie/Guitar Pop with Vocals:** `Olivia_Rodrigo_-_expectations_(feat._Chappell_Roan).wav` (from project Drive `Imports/`).
  5. **Controlled Zero-Piano Rock Mix:** Synthesized from project Drive `Archive/linkin_park-numb.mid` with Track 7 (Acoustic Grand Piano) explicitly **removed**, keeping distorted guitars, bass, vocals, strings, and drums.

### Side-by-Side Results (60-Second Clips, CPU)

| Song (60 s clip) | Category | Engine | Runtime (s) | Raw Notes | Median Dur (ms) | Notes `< 95 ms` | `piano-cover` Cleaned (RH / LH) | `full-song` #123 Arranged (RH / LH) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Sam Smith — I'm Not The Only One** | Solo Piano Tutorial | `basic-pitch` | **0.99** | 119 | 708.0 | 0 (0.0%) | 96 (48 / 48) | 162 (70 / 92) |
| | | **Transkun V2** | 43.99 | 112 | 876.0 *(1135 ext)* | 0 (0.0%) | **109** (56 / 53) | 176 (82 / 94) |
| | | ByteDance | 40.04 | 112 | 1133.5 | 0 (0.0%) | 87 (44 / 43) | 159 (65 / 94) |
| **Vanessa Carlton — A Thousand Miles** | Piano Pop Cover | `basic-pitch` | **0.78** | 399 | 325.0 | 0 (0.0%) | 251 (147 / 104) | 340 (162 / 178) |
| | | **Transkun V2** | 38.39 | 383 | 182.0 *(450 ext)* | 67 (17.5%) | **271** (171 / 100) | 358 (180 / 178) |
| | | ByteDance | 36.41 | 395 | 453.0 | 13 (3.3%) | 231 (137 / 94) | 346 (168 / 178) |
| **Beetlejuice — Dead Mom** | Full-Band + Vocals | `basic-pitch` | **0.87** | 691 | 232.0 | 0 (0.0%) | 251 (153 / 98) | **247** (133 / 114) |
| | | **Transkun V2** | 39.55 | 793 | 85.0 *(85 ext)* | 599 (75.5%) | 166 (143 / 23) | 221 (113 / 108) |
| | | ByteDance | 37.97 | 793 | 103.0 | 171 (21.6%) | 561 (298 / 263) | 324 (210 / 114) |
| **Olivia Rodrigo — expectations** | No-Piano Pop + Vocals | `basic-pitch` | **0.73** | 128 | 164.0 | 0 (0.0%) | **109** (15 / 94) | **226** (96 / 130) |
| | | **Transkun V2** | 40.87 | 239 | 66.0 *(67 ext)* | 218 (91.2%) | 21 (2 / 19) | 57 (21 / 36) |
| | | ByteDance | 37.46 | 230 | 53.5 | 168 (73.0%) | 62 (30 / 32) | 103 (39 / 64) |
| **Linkin Park — Numb (No Piano)** | Controlled 0-Piano Rock | `basic-pitch` | **0.72** | 267 | 348.0 | 0 (0.0%) | **185** (89 / 96) | **289** (115 / 174) |
| | | **Transkun V2** | 38.92 | 97 | 527.0 *(527 ext)* | 9 (9.3%) | 63 (44 / 19) | 198 (52 / 146) |
| | | ByteDance | 40.17 | 123 | 256.0 | 23 (18.7%) | 83 (51 / 32) | 211 (67 / 144) |

*Model load times (cold start, CPU): `basic-pitch` 0.81 s, Transkun V2 1.43 s, ByteDance 3.45 s. Stability on repeated run (*Sam Smith*): 100% identical outputs for all three engines.*  
*Transkun pedal-extension check (`parseEventAll(..., extendSustainPedal=True)`): On solo/piano-driven tracks, pedal extension restored realistic note lengths (*Sam Smith*: 876 → 1135 ms; *A Thousand Miles*: 182 → 450 ms, matching ByteDance's 453 ms). On non-piano tracks, Transkun emitted almost no CC 64 events (2–14 events), so pedal extension did not rescue the sparse output.*

### Engine Feature & Footprint Comparison

| Dimension | Spotify `basic-pitch` (current) | Transkun V2 (`2.0.1`) | ByteDance (`piano_transcription_inference`) |
|---|---|---|---|
| **Target domain** | Instrument-agnostic (vocals, guitar, bass, piano, synth) | Solo piano only | Solo piano only |
| **MAESTRO Onset F1 / On+Off F1** (published) | 70.9% / 10.5% ([arXiv:2203.09893](https://arxiv.org/abs/2203.09893)) | **98.4% / 93.1%** ([Yujia-Yan/Transkun](https://github.com/Yujia-Yan/Transkun)) | 96.72% / 82.47% ([arXiv:2010.01815](https://arxiv.org/abs/2010.01815)) |
| **Parameters** | ~16.8K | ~14.1M | ~20M (CRNN) |
| **CPU speed (60 s audio, 2 vCPU)** | **0.72–0.99 s** (~60–83× real time) | 38.4–44.0 s (~1.4× real time) | 36.4–40.2 s (~1.5× real time) |
| **GPU support** | ONNX / CoreML / TFLite | PyTorch CUDA (`--device cuda`) | PyTorch CUDA |
| **Install size (CPU)** | ~30 MB (`onnxruntime` + tiny wheel) | ~260 MB (`torch` CPU + 50.8 MB wheel + deps) | ~370 MB (`torch` CPU + 165 MB Zenodo ckpt) |
| **Weights delivery** | Bundled in package | Bundled in wheel (`2.0.pt`, 56 MB) | Downloaded from Zenodo on first run (~165 MB, often throttled) |
| **License** | Apache-2.0 | **MIT** | MIT (package) / Apache-2.0 (repo) |
| **Maintenance status** | `0.4.0` (Aug 2024), officially Python ≤ 3.11 (runs via `--no-deps`) | `2.0.1` (Sep 2024), active | **Repo archived Dec 2025** (`0.0.6`, Jan 2025) |
| **Playability as 2-hand arrangement** | Best on full-band & no-piano songs; noisier on solo piano | **Best on solo piano** (with CC 64 pedal extension); poor on no-piano songs | Strong on solo piano, but archived & noisier on mixes |

---

## 4. The Demucs `htdemucs_6s` Piano Stem & Working Recipe

- **Authors' note confirmed:** The official [`facebookresearch/demucs` README](https://github.com/facebookresearch/demucs) explicitly states:
  > `htdemucs_6s`: 6 sources version of `htdemucs`, with piano and guitar being added as sources. **Note that the piano source is not working great at the moment.**
- **Independent evidence confirmed:**
  - `lab.gcube.ai` (Oct 2026) measured `htdemucs_6s` reconstruction SNR as **7–12 dB lower** than 4-stem models on a piano ballad, with heavy bleed and artifacts.
  - `spArtitI` (Oct 2026) similarly notes that the Demucs isolated piano track remains "dirty" and causes invented or missed notes when other instruments share the midrange.
- **Important finding in current repo code:** In [`python_ml/transcribe_quest.py`](file:///home/antigravity/kiyoshithekidd/college-of-keys/python_ml/transcribe_quest.py#L1401-L1403), when `--split-stems` is checked in `piano-cover` mode, the pipeline currently *does* set `inference_audio_path = Path(stems_map["piano"])` and transcribes the weak `htdemucs_6s` piano stem (only falling back to the full mix if 0 notes are returned). That behavior should be revisited in a future issue so `piano-cover` mode does not degrade solo piano tracks or rely on the weak piano stem.
- **Confirmed working recipe for full-band / no-piano arrangements:**
  1. Use Demucs (`htdemucs` / `htdemucs_ft` 4-stem, or ignore the `piano` stem when 6-stem is used for play-along muting) to separate `vocals`, `bass`, `drums`, and `other`.
  2. Run a monophonic pitch tracker (**CREPE / `torchcrepe`** with Viterbi decoding + hysteresis note segmentation to suppress vibrato flicker) on `vocals.wav` for the Right-Hand lead melody.
  3. Derive Left-Hand chords and bass from `other.wav` + `bass.wav` (via harmonic chroma/chord estimation or instrument-agnostic `basic-pitch`).
  4. Do **not** build transcription quality on the `htdemucs_6s` piano stem.

---

## 5. Repo Check: What `#123` Consumes & Outline of Changes to Support Transkun

### What `#123` Arrangement Mode Consumes Today
- **Python CLI ([`python_ml/transcribe_quest.py`](file:///home/antigravity/kiyoshithekidd/college-of-keys/python_ml/transcribe_quest.py#L280-L463)):** `build_full_song_arrangement(raw_notes, bpm=120)` consumes a plain `list[dict]` where each note has `{"midi": int, "start": float, "duration": float, "velocity": int}`, plus an integer `bpm`. It runs `clean_and_quantize_neural_notes(raw_notes)` (dropping notes `< 95 ms` or `velocity < 42`, merging gaps `<= 45 ms`, snapping onsets `<= 38 ms`, capping polyphony to 3 RH + 2 LH), then builds a monophonic RH lead (`60..84`) and 2-beat harmonic LH root+fifth/third accompaniment (`36..59`).
- **In-app JS ([`midi-hygiene.js`](file:///home/antigravity/kiyoshithekidd/college-of-keys/midi-hygiene.js#L368-L548)):** `buildFullSongArrangement(rawNotes, bpm)` mirrors the same logic on parsed MIDI note objects (`{ midi, time, duration, velocity }`).
- **Quest Board Spawner ([`renderer.js`](file:///home/antigravity/kiyoshithekidd/college-of-keys/renderer.js#L11843-L12020)):** `runQuestBoardTranscriber()` spawns `python_ml/transcribe_quest.py --output-dir <IMPORTS_DIR> --mode <piano-cover|full-song> [--split-stems] <source>` and parses `[QUEST_STATUS]` JSON lines.
- **Dependencies ([`python_ml/requirements.txt`](file:///home/antigravity/kiyoshithekidd/college-of-keys/python_ml/requirements.txt)):** Currently lists `yt-dlp`, `numpy`, `imageio-ffmpeg`, `onnxruntime`, `librosa`, `scipy`, `resampy`, `pretty_midi`, `mir-eval`, `homr`, `pypdfium2`, `Pillow` (plus `basic-pitch` installed via `--no-deps`). Neither `torch` nor `transkun` is listed in `requirements.txt`.

### Outline of Changes Needed in `transcribe_quest.py` (No Code)
To add Transkun V2 as an optional engine alongside `basic-pitch`:

1. **CLI flag (`main`):** Add `--engine` with choices `["basic-pitch", "transkun", "auto"]` (default `"basic-pitch"`). Guard `full-song` mode so `"auto"` always picks `basic-pitch` for full-band arrangements and only uses `transkun` for `piano-cover` mode (or warn if a user explicitly forces `transkun` on `full-song`).
2. **Sample-rate preservation for Transkun:** Currently `convert_audio_to_pcm_wav()` downsamples to 22,050 Hz mono for `basic-pitch`. When `transkun` is selected, pass the original audio (or a 44,100 Hz PCM WAV) so Transkun's 44.1 kHz model does not lose upper-harmonic content before `soxr` resampling.
3. **New `try_transkun_transcription()` helper:**
   - Lazy-import `torch`, `moduleconf`, `soxr`, and `transkun` (handling `pkg_resources` / `setuptools<81` gracefully and returning `False` to fall back to `basic-pitch` if unavailable).
   - Auto-select `cuda` if `torch.cuda.is_available()`, else `cpu`, and log `[QUEST_STATUS]` progress (including a CPU runtime expectation note).
   - Run `model.transcribe(...)` and convert the output via `transkun.Data.writeMidi(...)`.
   - **Apply sustain-pedal extension (`CC 64`)** (e.g., via `transkun.Data.parseEventAll(..., extendSustainPedal=True)`) before converting to the `[{"midi", "start", "duration", "velocity"}]` schema so `clean_and_quantize_neural_notes()`'s `< 95 ms` filter does not discard valid staccato/pedaled piano notes.
   - Estimate BPM via `pretty_midi.PrettyMIDI.estimate_tempo()` (clamped to 55–200 BPM, fallback 120) since Transkun does not estimate tempo.
   - Pass the normalized note list into `clean_and_quantize_neural_notes()` (or `build_full_song_arrangement()`) and `write_standard_midi_file()`, reusing the exact downstream MIDI/stem writer.
4. **Engine dispatch & fallback chain:** If `--engine transkun` fails or is not installed, emit a `[QUEST_STATUS]` warning and fall back cleanly to `try_basic_pitch_transcription()`, then to the built-in DSP transcriber. Report `"engine": "transkun-v2"` in the final `complete` JSON payload.
5. **Packaging & UI (follow-up issue, outside `transcribe_quest.py`):** Keep `transkun` (and `torch` + `setuptools<81`) as an optional install extra (e.g., `requirements-transkun.txt` or optional step in `setup_ml_env.bat`) so lightweight CPU installs remain fast, and expose a compact engine selector in the Quest Board modal (shown or recommended under **Piano Cover** mode).

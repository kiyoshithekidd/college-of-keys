#!/usr/bin/env python3
"""
College of Keys — Phase 8: Standalone YouTube & Audio-to-MIDI ML CLI
=====================================================================
Decoupled Python CLI pipeline that:
1. Downloads audio from a YouTube URL using `yt-dlp` (or accepts a local .wav/.mp3 file).
2. Preserves the synced backing audio track (.wav/.mp3) in `../Imports/` for Rock Band play-along.
3. Transcribes polyphonic piano/melody notes into a playable `.mid` file inside `../Imports/`:
   - Primary Engine: Spotify `basic-pitch` (`basic_pitch.inference.predict_and_save`) when installed.
   - Fallback Engine: Built-in Polyphonic Harmonic DSP Audio-to-MIDI Transcriber (works on Python 3.14+
     even without TensorFlow/ONNX wheels, using `numpy` or pure Python stdlib `wave` + `struct`).
4. Outputs structured progress lines (`[QUEST_STATUS] ...`) so Phase 9's in-app "Quest Board"
   can monitor progress in real time, and triggers Phase 6's `./Imports` folder watcher automatically!

Usage Examples:
  python python_ml/transcribe_quest.py "https://www.youtube.com/watch?v=..."
  python python_ml/transcribe_quest.py --self-test
  python python_ml/transcribe_quest.py "path/to/song.wav" --title "Tavern Ballad"
"""

import argparse
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

# Resolve default ../Imports directory relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_IMPORTS_DIR = PROJECT_ROOT / "Imports"


def log_status(stage: str, message: str, progress: int = 0, extra: dict = None):
    """Print human-readable and machine-parseable status updates for CLI & Phase 9 Quest Board."""
    payload = {
        "stage": stage,
        "message": message,
        "progress": progress,
    }
    if extra:
        payload.update(extra)
    print(f"[QUEST_STATUS] {json.dumps(payload)}", flush=True)


def sanitize_filename(name: str) -> str:
    """Clean a video or song title into a safe filesystem basename."""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    cleaned = re.sub(r"\s+", "_", cleaned.strip())
    return cleaned[:90] or "Arcane_YouTube_Spell"


# ============================================================================
# PURE-PYTHON STANDARD MIDI FILE (.mid) WRITER (Zero External Dependencies)
# ============================================================================

def _encode_vlq(value: int) -> bytes:
    """Encode an integer as a Standard MIDI Variable-Length Quantity (VLQ)."""
    value = max(0, int(value))
    buffer = [value & 0x7F]
    value >>= 7
    while value > 0:
        buffer.append((value & 0x7F) | 0x80)
        value >>= 7
    buffer.reverse()
    return bytes(buffer)


def _build_midi_track_chunk(
    events: list,
    track_name: str = "Piano",
    program: int = 0,
    bpm: int = None,
    channel: int = 0,
) -> bytes:
    """
    Build a complete MTrk chunk from a list of (tick, status_byte, data1, data2) events.
    """
    body = bytearray()
    ch = max(0, min(15, int(channel)))

    # Meta Event: Track Name (FF 03)
    name_bytes = track_name.encode("utf-8", errors="ignore")[:64]
    body.extend(_encode_vlq(0))
    body.extend(b"\xFF\x03")
    body.extend(_encode_vlq(len(name_bytes)))
    body.extend(name_bytes)

    # Optional Meta Event: Set Tempo (FF 51 03 tt tt tt)
    if bpm is not None and bpm > 0:
        mpqn = int(round(60_000_000 / bpm))
        body.extend(_encode_vlq(0))
        body.extend(b"\xFF\x51\x03")
        body.extend(struct.pack(">I", mpqn)[1:])

    # Program Change (Cn program)
    body.extend(_encode_vlq(0))
    body.extend(bytes([0xC0 | ch, program & 0x7F]))

    # Sort events by (tick, priority: NoteOff before NoteOn at same tick)
    events_sorted = sorted(events, key=lambda e: (e[0], 0 if (e[1] & 0xF0) == 0x80 else 1, e[2]))

    last_tick = 0
    for tick, status, d1, d2 in events_sorted:
        delta = max(0, int(tick) - last_tick)
        last_tick = max(last_tick, int(tick))
        body.extend(_encode_vlq(delta))
        status_with_ch = (int(status) & 0xF0) | ch
        body.extend(bytes([status_with_ch & 0xFF, max(0, min(127, int(d1))), max(0, min(127, int(d2)))]))

    # Meta Event: End of Track (FF 2F 00)
    body.extend(_encode_vlq(48))
    body.extend(b"\xFF\x2F\x00")

    return b"MTrk" + struct.pack(">I", len(body)) + bytes(body)


def write_standard_midi_file(
    output_midi_path: Path,
    notes: list,
    song_title: str = "Transcribed Spell",
    bpm: int = 120,
    ppq: int = 480,
    stem_tracks: dict = None,
):
    """
    Write a multi-track Standard MIDI File (Format 1) splitting notes into:
    - Track 1: Piano Right Hand (Lead — MIDI >= 60)
    - Track 2: Piano Left Hand (Accompaniment — MIDI < 60)
    - Optional Tracks 3+: Named per-stem tracks (`Stem: Bass`, `Stem: Drums`, `Stem: Guitar`, `Stem: Vocals`, `Stem: Other`)
      for Issue #42 Multi-Instrument Highways.
    Each note in `notes` is a dict: {"midi": int, "start": float, "duration": float, "velocity": int}
    """
    ticks_per_sec = (bpm / 60.0) * ppq

    if not notes:
        raise ValueError("Cannot write Standard MIDI File: no playable notes were extracted.")
    safe_notes = list(notes)

    rh_events = []
    lh_events = []

    for n in safe_notes:
        pitch = int(n["midi"])
        # Fold into 61-key range (36..96)
        while pitch < 36:
            pitch += 12
        while pitch > 96:
            pitch -= 12

        start_tick = max(0, int(round(float(n["start"]) * ticks_per_sec)))
        dur_tick = max(40, int(round(max(0.06, float(n["duration"])) * ticks_per_sec)))
        end_tick = start_tick + dur_tick
        vel = max(35, min(120, int(n.get("velocity", 92))))

        target = rh_events if pitch >= 60 else lh_events
        target.append((start_tick, 0x90, pitch, vel))
        target.append((end_tick, 0x80, pitch, 0))

    tracks = []
    if rh_events:
        tracks.append(_build_midi_track_chunk(rh_events, f"{song_title}", program=0, bpm=bpm, channel=0))
        if lh_events:
            tracks.append(_build_midi_track_chunk(lh_events, f"{song_title} - Piano LH", program=0, bpm=None, channel=0))
    else:
        tracks.append(_build_midi_track_chunk(lh_events, f"{song_title} - Piano LH", program=0, bpm=bpm, channel=0))

    # Issue #42: Append dedicated instrument stem tracks when 6-stem separation is active
    if stem_tracks and isinstance(stem_tracks, dict):
        stem_meta = [
            ("bass", "Stem: Bass", 33, 1),
            ("drums", "Stem: Drums", 0, 9),
            ("guitar", "Stem: Guitar", 27, 2),
            ("vocals", "Stem: Vocals", 52, 3),
            ("other", "Stem: Other", 81, 4),
        ]
        for stem_key, track_label, prog, ch in stem_meta:
            stem_note_list = stem_tracks.get(stem_key) or []
            if not stem_note_list:
                continue
            stem_events = []
            for sn in stem_note_list:
                sp = max(24, min(108, int(sn["midi"])))
                st = max(0, int(round(float(sn["start"]) * ticks_per_sec)))
                dt = max(36, int(round(max(0.06, float(sn["duration"])) * ticks_per_sec)))
                sv = max(40, min(122, int(sn.get("velocity", 90))))
                stem_events.append((st, 0x90, sp, sv))
                stem_events.append((st + dt, 0x80, sp, 0))
            if stem_events:
                tracks.append(
                    _build_midi_track_chunk(
                        stem_events,
                        track_name=track_label,
                        program=prog,
                        bpm=None,
                        channel=ch,
                    )
                )

    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), ppq)
    with open(output_midi_path, "wb") as f:
        f.write(header)
        for trk in tracks:
            f.write(trk)


# ============================================================================
# TIER 1: SPOTIFY BASIC-PITCH NEURAL NETWORK TRANSCRIBER (ONNX / TF)
# ============================================================================

def clean_and_quantize_neural_notes(raw_notes: list) -> list:
    """
    Post-process neural note events for 61-key human playability:
    1. Filter out low-confidence ghost notes and ultra-short (<95ms) glitches.
    2. Merge same-pitch notes separated by tiny gaps (<45ms) caused by vibrato/pedal.
    3. Snap micro-jittered onset clusters (<= 35ms) to a clean shared anchor time,
       limit simultaneous polyphony to at most 3 RH + 2 LH notes, and cap >5.5s smears.
    """
    if not raw_notes:
        return []

    # Sort by pitch then start time for gap merging
    by_pitch = sorted(raw_notes, key=lambda n: (n["midi"], n["start"]))
    merged = []
    for note in by_pitch:
        if note["duration"] < 0.095 or note["velocity"] < 42:
            continue
        clipped = dict(note)
        if clipped["duration"] > 5.5:
            clipped["duration"] = 5.5
        if merged and merged[-1]["midi"] == clipped["midi"]:
            prev = merged[-1]
            gap = clipped["start"] - (prev["start"] + prev["duration"])
            if gap <= 0.045:
                new_end = min(prev["start"] + 5.5, max(prev["start"] + prev["duration"], clipped["start"] + clipped["duration"]))
                prev["duration"] = round(new_end - prev["start"], 3)
                prev["velocity"] = max(prev["velocity"], clipped["velocity"])
                continue
        merged.append(clipped)

    # Sort chronologically and cap polyphony within 45ms onset windows, snapping onsets together
    merged.sort(key=lambda n: (n["start"], -n["velocity"]))
    cleaned = []
    cluster = []
    cluster_anchor = None

    def flush_cluster(c_list, anchor):
        if not c_list:
            return
        snapped = round(float(anchor), 3)
        for n in c_list:
            if abs(n["start"] - snapped) <= 0.038:
                n["start"] = snapped
        rh = sorted([n for n in c_list if n["midi"] >= 60], key=lambda x: -x["velocity"])[:3]
        lh = sorted([n for n in c_list if n["midi"] < 60], key=lambda x: -x["velocity"])[:2]
        cleaned.extend(rh + lh)

    for note in merged:
        if cluster_anchor is None or (note["start"] - cluster_anchor) <= 0.045:
            if cluster_anchor is None:
                cluster_anchor = note["start"]
            cluster.append(note)
        else:
            flush_cluster(cluster, cluster_anchor)
            cluster = [note]
            cluster_anchor = note["start"]

    flush_cluster(cluster, cluster_anchor)
    cleaned.sort(key=lambda n: (n["start"], n["midi"]))
    return cleaned


def build_full_song_arrangement(raw_notes: list, bpm: int = 120) -> list:
    """
    Issue #123: Full-Song Piano Arrangement Builder ("Anything Piano" / "Musigana" style).
    Transforms a raw full-mix transcription (vocals, drums, guitar, bass, etc.) into a
    clean, playable two-hand piano arrangement:
      - Right Hand (Melody, MIDI >= 60): Extracts the primary monophonic/lead vocal or melody contour
        by selecting the most prominent high-register note in each onset window, smoothing octave jumps,
        and trimming overlapping melody tails so the right hand plays a singable lead line.
      - Left Hand (Chords & Bass, MIDI < 60): Instead of dumping every low-frequency drum/guitar/bass
        artifact onto the left hand, segments the song into harmonic beats (~2 beats per window),
        estimates the root pitch class & triad quality from the harmonic pitch-class histogram,
        and emits a clean 2-note Left-Hand accompaniment (Root Bass + Fifth/Third) anchored to
        actual song activity.
    """
    cleaned = clean_and_quantize_neural_notes(raw_notes)
    if not cleaned:
        return []

    beat_sec = 60.0 / max(45.0, min(220.0, float(bpm or 120)))
    bar_window_sec = max(0.65, min(2.4, beat_sec * 2.0))  # Half-bar (2-beat) harmonic windows

    # 1. RIGHT HAND: Extract primary lead melody contour
    # Group notes into 65ms onset slices and pick the most salient melody candidate per slice
    sorted_notes = sorted(cleaned, key=lambda n: (n["start"], n["midi"]))
    slices = []
    cur_slice = []
    cur_anchor = None

    for n in sorted_notes:
        if cur_anchor is None or (n["start"] - cur_anchor) <= 0.065:
            if cur_anchor is None:
                cur_anchor = n["start"]
            cur_slice.append(n)
        else:
            slices.append((cur_anchor, cur_slice))
            cur_slice = [n]
            cur_anchor = n["start"]
    if cur_slice:
        slices.append((cur_anchor, cur_slice))

    rh_melody = []
    prev_melody_pitch = 67  # Default anchor near G4

    for anchor_t, group in slices:
        # Prefer notes in the vocal/melody register (55..88); fold into 60..84 for RH playability
        melody_cands = []
        for n in group:
            p = int(n["midi"])
            dur = float(n["duration"])
            vel = int(n.get("velocity", 85))
            # Skip ultra-low bass rumbles when looking for lead melody unless nothing else exists
            if p < 50 and any(x["midi"] >= 55 for x in group):
                continue
            folded_p = p
            while folded_p < 60:
                folded_p += 12
            while folded_p > 84:
                folded_p -= 12
            # Score by register prominence + velocity + duration + proximity to previous melody pitch
            proximity_bonus = max(0.0, 14.0 - abs(folded_p - prev_melody_pitch)) * 2.2
            register_bonus = 18.0 if 58 <= p <= 84 else 0.0
            score = vel * 1.1 + min(0.8, dur) * 28.0 + proximity_bonus + register_bonus + (p * 0.35)
            melody_cands.append((score, folded_p, n))

        if not melody_cands:
            continue

        melody_cands.sort(key=lambda item: item[0], reverse=True)
        _, chosen_pitch, best_note = melody_cands[0]

        # Enforce minimum 90ms inter-onset spacing on RH melody so rapid drum/hi-hat transients don't machine-gun
        if rh_melody and (anchor_t - rh_melody[-1]["start"]) < 0.095:
            if best_note.get("velocity", 85) > rh_melody[-1].get("velocity", 85) + 8:
                rh_melody[-1] = {
                    "midi": chosen_pitch,
                    "start": rh_melody[-1]["start"],
                    "duration": round(max(0.14, min(1.8, float(best_note["duration"]))), 3),
                    "velocity": max(68, min(118, int(best_note.get("velocity", 92)))),
                    "hand": "rh",
                }
                prev_melody_pitch = chosen_pitch
            continue

        # Trim previous melody note so RH stays cleanly monophonic (legato without muddy overlaps)
        if rh_melody:
            prev_n = rh_melody[-1]
            max_prev_dur = round(max(0.09, anchor_t - prev_n["start"] - 0.015), 3)
            if prev_n["duration"] > max_prev_dur:
                prev_n["duration"] = max_prev_dur

        rh_melody.append({
            "midi": chosen_pitch,
            "start": round(float(anchor_t), 3),
            "duration": round(max(0.14, min(2.2, float(best_note["duration"]))), 3),
            "velocity": max(70, min(118, int(best_note.get("velocity", 92)))),
            "hand": "rh",
        })
        prev_melody_pitch = chosen_pitch

    # 2. LEFT HAND: Derive clean harmonic bass + chord intervals per window
    min_t = min(n["start"] for n in cleaned)
    max_t = max(n["start"] + n["duration"] for n in cleaned)
    lh_accompaniment = []

    w_start = min_t
    win_start_idx = 0
    num_cleaned = len(cleaned)
    while w_start < max_t - 0.05:
        w_end = w_start + bar_window_sec
        while win_start_idx < num_cleaned and (cleaned[win_start_idx]["start"] + cleaned[win_start_idx]["duration"]) <= w_start:
            win_start_idx += 1
        win_notes = []
        for idx in range(win_start_idx, num_cleaned):
            n = cleaned[idx]
            if n["start"] >= w_end:
                break
            if (n["start"] + n["duration"]) > w_start:
                win_notes.append(n)
        if win_notes:
            # Weight pitch classes (0..11) by duration & lower-register emphasis
            pc_weights = [0.0] * 12
            low_pc_weights = [0.0] * 12
            first_onset_in_win = min(
                (n["start"] for n in win_notes if n["start"] >= w_start - 0.04),
                default=w_start,
            )
            anchor_onset = round(max(w_start, first_onset_in_win), 3)

            for n in win_notes:
                pc = int(n["midi"]) % 12
                overlap = max(0.05, min(w_end, n["start"] + n["duration"]) - max(w_start, n["start"]))
                weight = overlap * (float(n.get("velocity", 80)) / 90.0)
                pc_weights[pc] += weight
                if int(n["midi"]) < 60:
                    low_pc_weights[pc] += weight * 1.8

            # Score all 12 possible roots by root + fifth + major/minor third presence
            best_root_pc = 0
            best_root_score = -1.0
            for root_pc in range(12):
                fifth_pc = (root_pc + 7) % 12
                maj3_pc = (root_pc + 4) % 12
                min3_pc = (root_pc + 3) % 12
                score = (
                    low_pc_weights[root_pc] * 1.6
                    + pc_weights[root_pc] * 1.3
                    + pc_weights[fifth_pc] * 0.85
                    + max(pc_weights[maj3_pc], pc_weights[min3_pc]) * 0.75
                )
                if score > best_root_score:
                    best_root_score = score
                    best_root_pc = root_pc

            # Place root bass note in comfortable Left Hand register: C2 (36) .. B2 (47)
            root_midi = 36 + best_root_pc
            if root_midi < 40:
                # Keep very low C2..D#2 either at 48..51 or with open fifth above so it's warm, not muddy
                fifth_midi = root_midi + 7
            else:
                fifth_midi = root_midi + 7

            # Choose fifth (open power/voicing) or tenth/octave-fifth within LH range (< 60)
            maj3_pc = (best_root_pc + 4) % 12
            min3_pc = (best_root_pc + 3) % 12
            third_interval = 4 if pc_weights[maj3_pc] >= pc_weights[min3_pc] else 3
            upper_lh_midi = fifth_midi if fifth_midi < 59 else (root_midi + third_interval)
            if upper_lh_midi >= 60:
                upper_lh_midi -= 12

            chord_dur = round(max(0.28, min(bar_window_sec * 0.88, max_t - anchor_onset)), 3)
            lh_accompaniment.append({
                "midi": int(root_midi),
                "start": anchor_onset,
                "duration": chord_dur,
                "velocity": 80,
                "hand": "lh",
            })
            if upper_lh_midi != root_midi and 36 <= upper_lh_midi < 60:
                lh_accompaniment.append({
                    "midi": int(upper_lh_midi),
                    "start": anchor_onset,
                    "duration": chord_dur,
                    "velocity": 72,
                    "hand": "lh",
                })

        w_start = round(w_start + bar_window_sec, 3)

    combined = rh_melody + lh_accompaniment
    combined.sort(key=lambda n: (n["start"], n["midi"]))
    return combined if combined else cleaned


def try_basic_pitch_transcription(
    wav_path: Path,
    output_midi_path: Path,
    song_title: str = "Transcribed Spell",
    arrangement_mode: str = "piano-cover",
    stem_tracks: dict = None,
) -> bool:
    """
    Run Spotify's `basic-pitch` neural network (`nmp.onnx` via ONNXRuntime) on a decoded .wav file,
    clean or arrange the extracted polyphonic note events for 61-key piano playability, and write a 2-track
    Standard MIDI File (Track 1 = RH Gold, Track 2 = LH Blue) plus optional stem tracks.
    """
    try:
        from basic_pitch.inference import predict, Model
        from basic_pitch import ICASSP_2022_MODEL_PATH
    except Exception:
        return False

    mode_label = "Full-Song Piano Arrangement" if arrangement_mode == "full-song" else "Piano Cover"
    log_status("transcribing", f"Running Spotify basic-pitch neural network ({mode_label} mode)...", 55)
    try:
        model = Model(ICASSP_2022_MODEL_PATH)
        _, midi_data, note_events = predict(
            audio_path=str(wav_path),
            model_or_model_path=model,
            onset_threshold=0.58,
            frame_threshold=0.38,
            minimum_note_length=110.0,
            minimum_frequency=65.0,    # C2 (MIDI 36)
            maximum_frequency=2093.0,  # C7 (MIDI 96)
            multiple_pitch_bends=False,
            melodia_trick=True,
        )

        # Estimate tempo from neural MIDI data if available
        detected_bpm = 120
        try:
            est = float(midi_data.estimate_tempo())
            if 55.0 <= est <= 200.0:
                detected_bpm = int(round(est))
        except Exception:
            detected_bpm = 120

        raw_notes = []
        for start_s, end_s, pitch, amp, _ in note_events:
            dur = max(0.08, float(end_s) - float(start_s))
            vel = max(40, min(120, int(round(float(amp) * 127.0))))
            raw_notes.append({
                "midi": int(pitch),
                "start": round(float(start_s), 3),
                "duration": round(dur, 3),
                "velocity": vel,
            })

        if arrangement_mode == "full-song":
            final_notes = build_full_song_arrangement(raw_notes, bpm=detected_bpm)
        else:
            final_notes = clean_and_quantize_neural_notes(raw_notes)

        if not final_notes and raw_notes:
            final_notes = raw_notes

        log_status(
            "writing_midi",
            f"Spotify basic-pitch ({mode_label}) produced {len(final_notes)} playable piano notes ({detected_bpm} BPM). Writing MIDI...",
            88,
        )
        write_standard_midi_file(
            output_midi_path,
            final_notes,
            song_title=song_title,
            bpm=detected_bpm,
            stem_tracks=stem_tracks,
        )
        return output_midi_path.exists()
    except Exception as exc:
        log_status("warning", f"basic-pitch inference fallback triggered: {exc}", 58)
    return False


# ============================================================================
# TIER 1B (OPTIONAL): TRANSKUN V2 PIANO TRANSCRIPTION ENGINE (ISMIR 2024, MIT)
# ============================================================================

def _read_wav_for_transkun(wav_path: Path):
    """
    Read a WAV/audio file into `(sample_rate, float32 array shaped (frames, channels))`
    without relying on `pydub`/`audioop` (safe on Python 3.13+).
    """
    try:
        import soundfile as sf
        import numpy as np
        data, sr = sf.read(str(wav_path), dtype="float32", always_2d=True)
        return int(sr), data
    except Exception:
        import numpy as np
        samples, sr = read_wav_mono_float(wav_path)
        arr = np.asarray(samples, dtype=np.float32).reshape(-1, 1)
        return int(sr), arr


def try_transkun_transcription(
    audio_path: Path,
    output_midi_path: Path,
    song_title: str = "Transcribed Spell",
    arrangement_mode: str = "piano-cover",
    stem_tracks: dict = None,
) -> bool:
    """
    Issue #144/#145: Optional high-accuracy solo-piano transcription using Transkun V2
    (Yujia-Yan/Transkun, MIT license).
    - Loads bundled `pretrained/2.0.pt` & `2.0.conf` via `transkun.__file__` (no `pkg_resources`).
    - Reads 44.1 kHz audio directly (no `pydub`/`audioop`), resampling with `soxr` if needed.
    - Applies CC 64 sustain-pedal extension (`parseEventAll(..., extendSustainPedal=True)`)
      before `clean_and_quantize_neural_notes()` so valid key-release notes are not discarded
      by the `< 95 ms` filter.
    """
    try:
        import torch
        import moduleconf
        import soxr
        import transkun
        from transkun import Data as tk_data
    except Exception:
        return False

    pretrained_dir = Path(transkun.__file__).resolve().parent / "pretrained"
    weight_path = pretrained_dir / "2.0.pt"
    conf_path = pretrained_dir / "2.0.conf"
    if not weight_path.exists() or not conf_path.exists():
        log_status("warning", "Transkun pretrained checkpoint not found; falling back to basic-pitch.", 56)
        return False

    device = "cuda" if torch.cuda.is_available() else "cpu"
    mode_label = "Full-Song Piano Arrangement" if arrangement_mode == "full-song" else "Piano Cover"
    speed_hint = "GPU CUDA" if device == "cuda" else "CPU (~40s per min of audio)"
    log_status(
        "transcribing",
        f"Running Transkun V2 high-accuracy piano engine ({mode_label} mode, {speed_hint})...",
        55,
    )

    try:
        conf_manager = moduleconf.parseFromFile(str(conf_path))
        transkun_cls = conf_manager["Model"].module.TransKun
        conf = conf_manager["Model"].config

        checkpoint = torch.load(str(weight_path), map_location=device)
        model = transkun_cls(conf=conf).to(device)
        state_dict = checkpoint.get("best_state_dict") or checkpoint.get("state_dict")
        model.load_state_dict(state_dict, strict=False)
        model.eval()

        fs, audio = _read_wav_for_transkun(audio_path)
        if fs != model.fs:
            audio = soxr.resample(audio, fs, model.fs)

        with torch.no_grad():
            x = torch.from_numpy(audio).to(device)
            notes_est = model.transcribe(
                x,
                stepInSecond=None,
                segmentSizeInSecond=None,
                discardSecondHalf=False,
            )

        midi_data = tk_data.writeMidi(notes_est)

        # Estimate tempo from transcribed MIDI if available
        detected_bpm = 120
        try:
            est = float(midi_data.estimate_tempo())
            if 55.0 <= est <= 200.0:
                detected_bpm = int(round(est))
        except Exception:
            detected_bpm = 120

        # Apply CC 64 sustain-pedal extension so Transkun's No-Pedal-Ext key-release notes
        # preserve natural musical duration before <95ms hygiene filtering.
        raw_notes = []
        for inst in midi_data.instruments:
            if not inst.notes:
                continue
            tk_notes = [tk_data.Note(n.start, n.end, n.pitch, n.velocity) for n in inst.notes]
            try:
                extended = tk_data.parseEventAll(
                    tk_notes,
                    inst.control_changes,
                    extendSustainPedal=True,
                )
                iterable_notes = [ev for ev in extended if getattr(ev, "pitch", -1) >= 0]
            except Exception:
                iterable_notes = tk_notes

            for n in iterable_notes:
                dur = max(0.08, float(n.end) - float(n.start))
                vel = max(40, min(120, int(round(float(n.velocity)))))
                raw_notes.append({
                    "midi": int(n.pitch),
                    "start": round(float(n.start), 3),
                    "duration": round(dur, 3),
                    "velocity": vel,
                })

        raw_notes.sort(key=lambda item: (item["start"], item["midi"]))

        if arrangement_mode == "full-song":
            final_notes = build_full_song_arrangement(raw_notes, bpm=detected_bpm)
        else:
            final_notes = clean_and_quantize_neural_notes(raw_notes)

        if not final_notes and raw_notes:
            final_notes = raw_notes

        if not final_notes:
            log_status("warning", "Transkun V2 produced 0 notes; falling back to basic-pitch.", 60)
            return False

        log_status(
            "writing_midi",
            f"Transkun V2 ({mode_label}) produced {len(final_notes)} playable piano notes ({detected_bpm} BPM). Writing MIDI...",
            88,
        )
        write_standard_midi_file(
            output_midi_path,
            final_notes,
            song_title=song_title,
            bpm=detected_bpm,
            stem_tracks=stem_tracks,
        )
        return output_midi_path.exists()
    except Exception as exc:
        log_status("warning", f"Transkun V2 fallback triggered: {exc}", 58)
    return False


# ============================================================================
# ISSUE #146: FULL-SONG DEMUCS + CREPE VOCAL MELODY + HARMONY PIPELINE
# ============================================================================

def separate_audio_into_4_stems_demucs(source_wav: Path, tmp_dir: Path):
    """
    Issue #146: Run Demucs 4-stem (`htdemucs`) to isolate `vocals`, `other`, `bass`, and `drums`
    for Full-Song Arrangement mode. Faster and cleaner than 6-stem, and never relies on the weak
    `htdemucs_6s` piano stem. Returns dict mapping stem_name -> Path, or None if unavailable.
    """
    try:
        import importlib.util
        if importlib.util.find_spec("demucs") is None:
            return None
    except Exception:
        return None

    demucs_out = tmp_dir / "demucs_4s_out"
    log_status("splitting_stems", "Running Demucs htdemucs (4-stem) for vocal melody & harmony separation...", 32)
    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "-n",
        "htdemucs",
        "-o",
        str(demucs_out),
        str(source_wav),
    ]
    proc = None
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        if proc.stdout is not None:
            for line in proc.stdout:
                m = re.search(r"(\d{1,3})%\|", line)
                if m:
                    pct = max(0, min(100, int(m.group(1))))
                    scaled = 32 + int(pct * 0.22)
                    log_status("splitting_stems", f"Demucs 4-stem separating vocals & harmony ({pct}%)...", scaled)
        proc.wait()
        if proc.returncode == 0:
            model_dir = demucs_out / "htdemucs" / source_wav.stem
            if model_dir.exists():
                resolved = {}
                for stem_name in ("vocals", "other", "bass", "drums"):
                    cand = model_dir / f"{stem_name}.wav"
                    if cand.exists():
                        resolved[stem_name] = cand
                if "vocals" in resolved and "other" in resolved:
                    log_status("splitting_stems", "Demucs 4-stem vocal & harmony separation complete!", 54)
                    return resolved
    except Exception as exc:
        log_status("warning", f"Demucs 4-stem separation fallback triggered: {exc}", 35)
    finally:
        if proc is not None:
            try:
                if proc.poll() is None:
                    proc.terminate()
                    proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
            if proc.stdout is not None:
                try:
                    proc.stdout.close()
                except Exception:
                    pass
    return None


def _median_smooth_voiced_midi(midi_floats, voiced_mask, window_frames: int = 17):
    """
    Issue #160: Apply a vocal-specific sliding median filter (default 17 frames = 170ms at 10ms hop)
    over voiced F0 frames so natural 5–7 Hz vocal vibrato smooths into steady Let's Sing pitch bars
    without blurring across unvoiced breath gaps.
    """
    n = min(len(midi_floats), len(voiced_mask))
    if n == 0 or window_frames <= 1:
        return list(midi_floats[:n])
    half = max(1, window_frames // 2)
    out = [float("nan")] * n
    for i in range(n):
        if not bool(voiced_mask[i]):
            continue
        vals = []
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        for j in range(lo, hi):
            if bool(voiced_mask[j]):
                v = float(midi_floats[j])
                if math.isfinite(v):
                    vals.append(v)
        if vals:
            vals.sort()
            mid = len(vals) // 2
            out[i] = vals[mid] if len(vals) % 2 == 1 else 0.5 * (vals[mid - 1] + vals[mid])
    return out


def _postprocess_vocal_highway_notes(notes: list, fold_to_rh_piano: bool = False) -> list:
    """
    Issue #160: Clamp brief harmonic octave spikes, absorb ±1-semitone vibrato flickers,
    and merge <95ms consonant/breath micro-gaps on matching pitches.
    """
    if not notes:
        return []
    low_bound = 60 if fold_to_rh_piano else 40   # E2=40..C6=84 true vocal range vs C4=60..C6=84 RH piano
    high_bound = 84

    working = []
    prev_pitch = 67 if fold_to_rh_piano else None
    for raw in notes:
        p = int(raw["midi"])
        while p < low_bound:
            p += 12
        while p > high_bound:
            p -= 12
        if prev_pitch is not None and abs(p - prev_pitch) >= 10:
            if p - 12 >= low_bound and abs((p - 12) - prev_pitch) < abs(p - prev_pitch):
                p -= 12
            elif p + 12 <= high_bound and abs((p + 12) - prev_pitch) < abs(p - prev_pitch):
                p += 12
        seg = dict(raw)
        seg["midi"] = p
        seg["start"] = round(float(seg["start"]), 3)
        seg["duration"] = round(max(0.08, float(seg["duration"])), 3)
        working.append(seg)
        prev_pitch = p

    # Clamp isolated 1-note octave harmonic blips (<240ms) surrounded by stable neighbors
    for i in range(1, len(working) - 1):
        prv = working[i - 1]
        cur = working[i]
        nxt = working[i + 1]
        diff = cur["midi"] - prv["midi"]
        if abs(diff) >= 10 and cur["duration"] < 0.24 and abs(nxt["midi"] - prv["midi"]) <= 5:
            shifted = cur["midi"] - 12 if diff > 0 else cur["midi"] + 12
            if low_bound <= shifted <= high_bound and abs(shifted - prv["midi"]) < abs(diff):
                cur["midi"] = shifted

    # Merge tiny same-pitch gaps (<=95ms) and brief ±1-semitone vibrato wobbles (<140ms)
    merged = []
    for i, cur in enumerate(working):
        if not merged:
            merged.append(cur)
            continue
        prv = merged[-1]
        prv_end = prv["start"] + prv["duration"]
        gap = cur["start"] - prv_end
        p_diff = abs(cur["midi"] - prv["midi"])

        if p_diff == 0 and gap <= 0.095:
            new_end = max(prv_end, cur["start"] + cur["duration"])
            prv["duration"] = round(min(3.6, new_end - prv["start"]), 3)
            continue

        nxt = working[i + 1] if i + 1 < len(working) else None
        returns_to_prv = (
            nxt is not None
            and nxt["midi"] == prv["midi"]
            and (nxt["start"] - (cur["start"] + cur["duration"])) <= 0.10
        )
        if p_diff == 1 and gap <= 0.07 and cur["duration"] < 0.14 and (returns_to_prv or prv["duration"] >= 0.28):
            new_end = max(prv_end, cur["start"] + cur["duration"])
            prv["duration"] = round(min(3.6, new_end - prv["start"]), 3)
            continue

        if prv["start"] + prv["duration"] > cur["start"] - 0.015:
            prv["duration"] = round(max(0.08, cur["start"] - prv["start"] - 0.015), 3)
        merged.append(cur)

    return merged


def _segment_f0_track_to_melody_notes(
    times,
    midi_floats,
    voiced_mask,
    rms_values,
    min_hold_frames: int = 4,
    min_dur_sec: float = 0.10,
    fold_to_rh_piano: bool = True,
    median_smooth_frames: int = 17,
) -> list:
    """
    Convert a frame-wise pitch contour (10ms hop) into clean monophonic melody notes using:
    - Vocal vibrato median smoothing (`median_smooth_frames=17` -> 170ms window, Issue #160)
    - Hysteresis note segmentation (`min_hold_frames` consecutive frames before switching)
    - Either comfortable RH piano range folding (`60..84` when `fold_to_rh_piano=True`, Issue #146)
      or true vocal register preservation (`40..84` when `fold_to_rh_piano=False`, Issue #160).
    """
    n_frames = min(len(times), len(midi_floats), len(voiced_mask), len(rms_values))
    if n_frames == 0:
        return []

    smoothed_midi = (
        _median_smooth_voiced_midi(midi_floats, voiced_mask, median_smooth_frames)
        if median_smooth_frames > 1
        else midi_floats
    )

    raw_segments = []
    cur_pitch = None
    cur_start = 0.0
    cur_rms_sum = 0.0
    cur_count = 0

    cand_pitch = None
    cand_count = 0
    cand_start = 0.0

    max_note_dur = 2.4 if fold_to_rh_piano else 3.6

    def flush_current(end_t):
        nonlocal cur_pitch, cur_start, cur_rms_sum, cur_count
        if cur_pitch is not None and cur_count > 0:
            dur = float(end_t) - float(cur_start)
            if dur >= min_dur_sec:
                avg_rms = cur_rms_sum / max(1, cur_count)
                vel = max(68, min(118, int(round(74 + min(1.0, avg_rms * 8.0) * 40))))
                raw_segments.append({
                    "midi": int(cur_pitch),
                    "start": round(float(cur_start), 3),
                    "duration": round(min(max_note_dur, dur), 3),
                    "velocity": vel,
                    "hand": "rh",
                })
        cur_pitch = None
        cur_start = 0.0
        cur_rms_sum = 0.0
        cur_count = 0

    for i in range(n_frames):
        t = float(times[i])
        voiced = bool(voiced_mask[i])
        mf = float(smoothed_midi[i]) if voiced and math.isfinite(float(smoothed_midi[i])) else None
        rms = float(rms_values[i])

        if not voiced or mf is None:
            flush_current(t)
            cand_pitch = None
            cand_count = 0
            continue

        semitone = int(round(mf))
        if cur_pitch is None:
            if cand_pitch == semitone:
                cand_count += 1
            else:
                cand_pitch = semitone
                cand_count = 1
                cand_start = t
            if cand_count >= min_hold_frames:
                cur_pitch = cand_pitch
                cur_start = cand_start
                cur_rms_sum = rms * cand_count
                cur_count = cand_count
                cand_pitch = None
                cand_count = 0
        elif semitone == cur_pitch:
            cur_rms_sum += rms
            cur_count += 1
            cand_pitch = None
            cand_count = 0
        else:
            if cand_pitch == semitone:
                cand_count += 1
            else:
                cand_pitch = semitone
                cand_count = 1
                cand_start = t
            if cand_count >= min_hold_frames:
                flush_current(cand_start)
                cur_pitch = cand_pitch
                cur_start = cand_start
                cur_rms_sum = rms * cand_count
                cur_count = cand_count
                cand_pitch = None
                cand_count = 0
            else:
                cur_rms_sum += rms
                cur_count += 1

    if n_frames > 0:
        hop = (float(times[-1]) - float(times[0])) / max(1, n_frames - 1) if n_frames > 1 else 0.01
        flush_current(float(times[n_frames - 1]) + hop)

    return _postprocess_vocal_highway_notes(raw_segments, fold_to_rh_piano=fold_to_rh_piano)


def extract_vocal_melody_crepe(vocals_wav: Path, fold_to_rh_piano: bool = True, median_smooth_ms: int = 170):
    """
    Issue #146 & #160: Extract a clean monophonic vocal contour from an isolated `vocals.wav` stem.
    1. Prefers `torchcrepe` (CREPE pitch tracker with Viterbi decoding + periodicity gating + 170ms median filter).
    2. Falls back to `librosa.pyin` when `torchcrepe` is not installed.
    3. Falls back to smoothed monophonic DSP contour extraction when `librosa` is unavailable.
    Returns `(vocal_notes, tracker_name)` or `([], None)`.
    """
    smooth_frames = max(1, int(round(max(0, int(median_smooth_ms)) / 10.0)) | 1) if median_smooth_ms > 10 else 1

    try:
        import numpy as np
        import librosa
        has_librosa = True
    except Exception:
        has_librosa = False

    if has_librosa:
        sr_target = 16000
        hop_length = 160  # 10ms hop at 16 kHz
        try:
            y, _ = librosa.load(str(vocals_wav), sr=sr_target, mono=True)
        except Exception:
            y = []

        if len(y) >= hop_length * 4:
            rms_frames = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop_length)[0]
            peak_rms = float(np.max(rms_frames)) if len(rms_frames) > 0 else 0.0
            if peak_rms >= 1e-4:
                rms_gate = max(0.008, peak_rms * 0.10)

                # 1. Primary: torchcrepe (CREPE + Viterbi + vocal median smoothing)
                try:
                    import torch
                    import torchcrepe

                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    model_size = "full" if device == "cuda" else "tiny"
                    log_status(
                        "transcribing",
                        f"Tracking vocal lead melody with CREPE ({model_size}, {device.upper()})...",
                        62,
                    )
                    audio_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(0)
                    pitch, periodicity = torchcrepe.predict(
                        audio_tensor,
                        sr_target,
                        hop_length=hop_length,
                        fmin=80.0,
                        fmax=1000.0,
                        model=model_size,
                        batch_size=512 if device == "cuda" else 256,
                        device=device,
                        decoder=torchcrepe.decode.viterbi,
                        return_periodicity=True,
                    )
                    periodicity = torchcrepe.filter.median(periodicity, 5)
                    pitch = torchcrepe.filter.median(pitch, min(19, max(3, smooth_frames)))

                    f0_np = pitch.squeeze(0).detach().cpu().numpy()
                    per_np = periodicity.squeeze(0).detach().cpu().numpy()
                    n = min(len(f0_np), len(per_np), len(rms_frames))
                    times = np.arange(n, dtype=np.float32) * (hop_length / float(sr_target))
                    voiced = (per_np[:n] >= 0.25) & (rms_frames[:n] >= rms_gate) & (f0_np[:n] > 0)
                    midi_floats = np.where(voiced, 69.0 + 12.0 * np.log2(np.maximum(1.0, f0_np[:n]) / 440.0), np.nan)

                    rh_notes = _segment_f0_track_to_melody_notes(
                        times,
                        midi_floats,
                        voiced,
                        rms_frames[:n],
                        min_hold_frames=5,
                        min_dur_sec=0.10,
                        fold_to_rh_piano=fold_to_rh_piano,
                        median_smooth_frames=smooth_frames,
                    )
                    if rh_notes:
                        return rh_notes, "crepe"
                except Exception:
                    pass

                # 2. Secondary: librosa.pyin on the isolated vocal stem
                try:
                    log_status("transcribing", "Tracking vocal lead melody with pYIN on isolated vocals stem...", 62)
                    f0, voiced_flag, voiced_prob = librosa.pyin(
                        y,
                        fmin=80.0,
                        fmax=1000.0,
                        sr=sr_target,
                        frame_length=1024,
                        hop_length=hop_length,
                    )
                    n = min(len(f0), len(voiced_flag), len(rms_frames))
                    times = np.arange(n, dtype=np.float32) * (hop_length / float(sr_target))
                    voiced = (
                        np.asarray(voiced_flag[:n], dtype=bool)
                        & (~np.isnan(f0[:n]))
                        & (rms_frames[:n] >= rms_gate)
                        & (np.nan_to_num(voiced_prob[:n], nan=0.0) >= 0.25)
                    )
                    midi_floats = np.where(
                        voiced,
                        69.0 + 12.0 * np.log2(np.maximum(1.0, np.nan_to_num(f0[:n], nan=440.0)) / 440.0),
                        np.nan,
                    )
                    rh_notes = _segment_f0_track_to_melody_notes(
                        times,
                        midi_floats,
                        voiced,
                        rms_frames[:n],
                        min_hold_frames=5,
                        min_dur_sec=0.10,
                        fold_to_rh_piano=fold_to_rh_piano,
                        median_smooth_frames=smooth_frames,
                    )
                    if rh_notes:
                        return rh_notes, "pyin"
                except Exception:
                    pass

    # 3. Smoothed monophonic DSP fallback when torchcrepe/librosa are unavailable
    try:
        dsp_notes, _ = extract_notes_from_wav_dsp(
            Path(vocals_wav),
            pitch_min=60 if fold_to_rh_piano else 43,
            pitch_max=84,
            max_polyphony=1,
        )
        if dsp_notes:
            smoothed_dsp = _postprocess_vocal_highway_notes(dsp_notes, fold_to_rh_piano=fold_to_rh_piano)
            if smoothed_dsp:
                return smoothed_dsp, "smoothed-dsp"
    except Exception:
        pass

    return [], None


def extract_harmony_chords_from_stems(other_wav: Path, bass_wav: Path = None):
    """
    Issue #146: Derive clean 2-beat Left-Hand root + fifth/third chord accompaniment
    from separated `other.wav` (and optional `bass.wav`) stems using CQT chroma histograms.
    Returns `(lh_notes, detected_bpm)`.
    """
    try:
        import numpy as np
        import librosa
    except Exception:
        return [], 120

    sr = 22050
    hop_length = 512
    try:
        y_other, _ = librosa.load(str(other_wav), sr=sr, mono=True)
    except Exception:
        return [], 120

    if len(y_other) < hop_length * 4:
        return [], 120

    y_bass = None
    if bass_wav and Path(bass_wav).exists():
        try:
            y_bass, _ = librosa.load(str(bass_wav), sr=sr, mono=True)
            min_len = min(len(y_other), len(y_bass))
            y_other = y_other[:min_len]
            y_bass = y_bass[:min_len]
        except Exception:
            y_bass = None

    # Estimate tempo from harmonic stems
    detected_bpm = 120
    try:
        tempo_mix = y_other + (y_bass * 0.8 if y_bass is not None else 0.0)
        tempo_est, _ = librosa.beat.beat_track(y=tempo_mix, sr=sr)
        if hasattr(tempo_est, "__len__"):
            tempo_est = float(tempo_est[0]) if len(tempo_est) > 0 else 120.0
        else:
            tempo_est = float(tempo_est)
        if 55.0 <= tempo_est <= 200.0:
            detected_bpm = int(round(tempo_est))
    except Exception:
        detected_bpm = 120

    chroma_other = librosa.feature.chroma_cqt(y=y_other, sr=sr, hop_length=hop_length)
    rms_other = librosa.feature.rms(y=y_other, hop_length=hop_length)[0]
    if y_bass is not None:
        chroma_bass = librosa.feature.chroma_cqt(y=y_bass, sr=sr, hop_length=hop_length)
        rms_bass = librosa.feature.rms(y=y_bass, hop_length=hop_length)[0]
    else:
        chroma_bass = np.zeros_like(chroma_other)
        rms_bass = np.zeros_like(rms_other)

    n_frames = chroma_other.shape[1]
    frame_sec = hop_length / float(sr)
    total_sec = n_frames * frame_sec

    beat_sec = 60.0 / max(45.0, min(220.0, float(detected_bpm)))
    bar_window_sec = max(0.65, min(2.4, beat_sec * 2.0))

    combined_rms = rms_other + rms_bass
    peak_rms = float(np.max(combined_rms)) if len(combined_rms) > 0 else 0.0
    activity_gate = max(0.008, peak_rms * 0.12)

    lh_notes = []
    w_start = 0.0
    while w_start < total_sec - 0.1:
        w_end = min(total_sec, w_start + bar_window_sec)
        f0 = int(w_start / frame_sec)
        f1 = min(n_frames, max(f0 + 1, int(w_end / frame_sec)))
        if f0 >= n_frames:
            break

        win_rms = float(np.mean(combined_rms[f0:f1]))
        if win_rms >= activity_gate:
            other_pc = np.mean(chroma_other[:, f0:f1], axis=1)
            bass_pc = np.mean(chroma_bass[:, f0:f1], axis=1)

            best_root_pc = 0
            best_score = -1.0
            for root_pc in range(12):
                fifth_pc = (root_pc + 7) % 12
                maj3_pc = (root_pc + 4) % 12
                min3_pc = (root_pc + 3) % 12
                score = (
                    float(bass_pc[root_pc]) * 1.8
                    + float(other_pc[root_pc]) * 1.3
                    + float(other_pc[fifth_pc]) * 0.85
                    + max(float(other_pc[maj3_pc]), float(other_pc[min3_pc])) * 0.75
                )
                if score > best_score:
                    best_score = score
                    best_root_pc = root_pc

            root_midi = 36 + best_root_pc
            fifth_midi = root_midi + 7
            maj3_pc = (best_root_pc + 4) % 12
            min3_pc = (best_root_pc + 3) % 12
            third_interval = 4 if other_pc[maj3_pc] >= other_pc[min3_pc] else 3
            upper_lh_midi = fifth_midi if fifth_midi < 59 else (root_midi + third_interval)
            if upper_lh_midi >= 60:
                upper_lh_midi -= 12

            chord_dur = round(max(0.28, min(bar_window_sec * 0.88, total_sec - w_start)), 3)
            anchor_t = round(w_start, 3)
            lh_notes.append({
                "midi": int(root_midi),
                "start": anchor_t,
                "duration": chord_dur,
                "velocity": 80,
                "hand": "lh",
            })
            if upper_lh_midi != root_midi and 36 <= upper_lh_midi < 60:
                lh_notes.append({
                    "midi": int(upper_lh_midi),
                    "start": anchor_t,
                    "duration": chord_dur,
                    "velocity": 72,
                    "hand": "lh",
                })

        w_start = round(w_start + bar_window_sec, 3)

    return lh_notes, detected_bpm


def try_full_song_demucs_crepe_arrangement(
    source_wav: Path,
    output_midi_path: Path,
    tmp_dir: Path,
    song_title: str = "Transcribed Spell",
    existing_stems_map: dict = None,
    stem_tracks: dict = None,
):
    """
    Issue #146: Full-Song Arrangement pipeline using:
    1. Demucs (`htdemucs` 4-stem, or reusing already-separated `vocals`/`other`/`bass` stems — never `piano.wav`)
    2. Vocal stem + CREPE (or pYIN fallback) for the Right-Hand lead melody
    3. `other` + `bass` stems + CQT chroma chord estimation for the Left-Hand accompaniment
    Returns the engine label string (e.g. `"demucs-crepe-harmony"`) on success, or `None` to fall back.
    """
    stems = None
    if existing_stems_map and existing_stems_map.get("vocals") and existing_stems_map.get("other"):
        stems = existing_stems_map
    else:
        stems = separate_audio_into_4_stems_demucs(source_wav, tmp_dir)

    if not stems or not Path(stems["vocals"]).exists() or not Path(stems["other"]).exists():
        return None

    rh_notes, tracker_name = extract_vocal_melody_crepe(Path(stems["vocals"]))
    log_status("transcribing", "Extracting Left-Hand chords & bass from separated harmony stems...", 76)
    lh_notes, detected_bpm = extract_harmony_chords_from_stems(
        Path(stems["other"]),
        Path(stems["bass"]) if stems.get("bass") else None,
    )

    combined = sorted(rh_notes + lh_notes, key=lambda n: (n["start"], n["midi"]))
    if not combined:
        log_status("warning", "Demucs + CREPE pipeline produced 0 notes; falling back to basic-pitch arrangement.", 78)
        return None

    engine_tag = f"demucs-{tracker_name or 'melody'}-harmony"
    log_status(
        "writing_midi",
        f"Demucs + {(tracker_name or 'melody').upper()} produced {len(rh_notes)} RH melody + {len(lh_notes)} LH chord notes ({detected_bpm} BPM). Writing MIDI...",
        88,
    )
    write_standard_midi_file(
        output_midi_path,
        combined,
        song_title=song_title,
        bpm=detected_bpm,
        stem_tracks=stem_tracks,
    )
    return engine_tag if output_midi_path.exists() else None




# ============================================================================
# TIER 2: BUILT-IN POLYPHONIC HARMONIC AUDIO-TO-MIDI TRANSCRIBER (Python 3.14 Ready)
# ============================================================================

def read_wav_mono_float(wav_path: Path, max_seconds=None):
    """
    Read an 8-bit, 16-bit, 24-bit, or 32-bit PCM .wav file into mono float samples [-1.0, 1.0] and sample_rate.
    Uses `wave` + `struct`/`array` from the Python standard library.
    """
    import array

    with wave.open(str(wav_path), "rb") as wf:
        channels = max(1, wf.getnchannels())
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        total_frames = wf.getnframes()
        if max_seconds is not None and max_seconds > 0:
            nframes = min(total_frames, int(framerate * max_seconds))
        else:
            nframes = total_frames
        raw_bytes = wf.readframes(nframes)

    if sampwidth == 2:
        pcm = array.array("h")
        pcm.frombytes(raw_bytes[: (len(raw_bytes) // 2) * 2])
        scale = 1.0 / (32768.0 * channels)
        if channels == 1:
            samples = [s / 32768.0 for s in pcm]
        else:
            samples = [
                sum(pcm[i + ch] for ch in range(channels)) * scale
                for i in range(0, len(pcm) - channels + 1, channels)
            ]
    elif sampwidth == 3:
        # 24-bit signed little-endian PCM
        frame_stride = 3 * channels
        scale = 1.0 / (8388608.0 * channels)
        samples = [
            sum(
                int.from_bytes(raw_bytes[i + ch * 3 : i + (ch + 1) * 3], byteorder="little", signed=True)
                for ch in range(channels)
            ) * scale
            for i in range(0, len(raw_bytes) - frame_stride + 1, frame_stride)
        ]
    elif sampwidth == 4:
        # 32-bit signed little-endian PCM
        pcm = array.array("i")
        pcm.frombytes(raw_bytes[: (len(raw_bytes) // 4) * 4])
        scale = 1.0 / (2147483648.0 * channels)
        if channels == 1:
            samples = [s / 2147483648.0 for s in pcm]
        else:
            samples = [
                sum(pcm[i + ch] for ch in range(channels)) * scale
                for i in range(0, len(pcm) - channels + 1, channels)
            ]
    else:
        # 8-bit unsigned PCM
        frame_stride = max(1, channels * sampwidth)
        scale = 1.0 / (128.0 * channels)
        samples = [
            sum(raw_bytes[i + ch * sampwidth] - 128 for ch in range(channels)) * scale
            for i in range(0, len(raw_bytes) - frame_stride + 1, frame_stride)
        ]

    return samples, framerate


def extract_notes_from_wav_dsp(
    wav_path: Path,
    pitch_min: int = 36,
    pitch_max: int = 96,
    max_polyphony: int = 4,
):
    """
    Extract note events `[{"midi", "start", "duration", "velocity"}]` and estimated BPM
    from a mono PCM WAV file across `[pitch_min..pitch_max]`.
    """
    samples, sr = read_wav_mono_float(wav_path)
    total_duration = len(samples) / float(max(1, sr))

    hop_sec = 0.08  # 80ms analysis frames
    win_size = int(sr * hop_sec)
    if win_size < 256:
        win_size = 256

    num_frames = max(1, len(samples) // win_size)

    midi_pitches = list(range(pitch_min, pitch_max + 1))
    midi_freqs = {m: 440.0 * (2.0 ** ((m - 69) / 12.0)) for m in midi_pitches}

    try:
        import numpy as np
        has_numpy = True
    except ImportError:
        has_numpy = False

    active_tracks = {}
    extracted_notes = []

    for frame_idx in range(num_frames):
        t_sec = frame_idx * hop_sec
        start_i = frame_idx * win_size
        chunk = samples[start_i : start_i + win_size]
        if len(chunk) < win_size // 2:
            break

        frame_pitches = []

        if has_numpy:
            arr = np.asarray(chunk, dtype=np.float32)
            rms = float(np.sqrt(np.mean(arr * arr)))
            if rms > 0.012:
                windowed = arr * np.hanning(len(arr))
                spec = np.abs(np.fft.rfft(windowed))
                freqs = np.fft.rfftfreq(len(arr), d=1.0 / sr)

                pitch_scores = []
                for m in midi_pitches:
                    f0 = midi_freqs[m]
                    idx = int(np.argmin(np.abs(freqs - f0)))
                    mag = float(spec[idx])
                    pitch_scores.append((mag, m))

                pitch_scores.sort(reverse=True)
                top_mag = pitch_scores[0][0] if pitch_scores else 0.0
                if top_mag > 0.35:
                    for mag, m in pitch_scores[:max_polyphony]:
                        if mag >= top_mag * 0.42:
                            frame_pitches.append((m, min(115, max(50, int(60 + rms * 180)))))
        else:
            rms = math.sqrt(sum(x * x for x in chunk) / len(chunk))
            if rms > 0.015:
                if sr > 16000 and len(chunk) >= 4:
                    sub = [(chunk[i] + chunk[i + 1]) * 0.5 for i in range(0, len(chunk) - 1, 2)]
                    sub_sr = sr / 2.0
                else:
                    sub = chunk
                    sub_sr = float(sr)
                N = len(sub)
                if N > 1:
                    windowed_sub = [
                        sub[idx] * (0.5 * (1.0 - math.cos((2.0 * math.pi * idx) / (N - 1))))
                        for idx in range(N)
                    ]
                else:
                    windowed_sub = sub
                pitch_scores = []
                for m in midi_pitches:
                    f0 = midi_freqs[m]
                    if f0 >= sub_sr * 0.45:
                        continue
                    w = (2.0 * math.pi * f0) / sub_sr
                    cosine = math.cos(w)
                    coeff = 2.0 * cosine
                    q1 = 0.0
                    q2 = 0.0
                    for x in windowed_sub:
                        q0 = coeff * q1 - q2 + x
                        q2 = q1
                        q1 = q0
                    power = q1 * q1 + q2 * q2 - q1 * q2 * coeff
                    pitch_scores.append((power, m))

                pitch_scores.sort(reverse=True)
                top_pow = pitch_scores[0][0] if pitch_scores else 0.0
                if top_pow > 0.03:
                    for pwr, m in pitch_scores[: max(1, min(3, max_polyphony))]:
                        if pwr >= top_pow * 0.45:
                            frame_pitches.append((m, min(115, max(55, int(65 + rms * 160)))))

        current_midi_set = {m for m, _ in frame_pitches}

        for m in list(active_tracks.keys()):
            if m not in current_midi_set:
                info = active_tracks.pop(m)
                dur = max(hop_sec, t_sec - info["start"])
                if dur >= 0.075:
                    extracted_notes.append({
                        "midi": m,
                        "start": round(info["start"], 3),
                        "duration": round(dur, 3),
                        "velocity": info["velocity"],
                    })

        for m, vel in frame_pitches:
            if m not in active_tracks:
                active_tracks[m] = {
                    "start": t_sec,
                    "last_seen": t_sec,
                    "velocity": vel,
                }
            else:
                active_tracks[m]["last_seen"] = t_sec

    for m, info in active_tracks.items():
        dur = max(hop_sec, total_duration - info["start"])
        extracted_notes.append({
            "midi": m,
            "start": round(info["start"], 3),
            "duration": round(dur, 3),
            "velocity": info["velocity"],
        })

    extracted_notes.sort(key=lambda x: (x["start"], x["midi"]))
    estimated_bpm = 120
    onsets = sorted({round(n["start"], 3) for n in extracted_notes})
    if len(onsets) >= 3:
        iois = [onsets[i + 1] - onsets[i] for i in range(len(onsets) - 1) if 0.2 <= (onsets[i + 1] - onsets[i]) <= 1.2]
        if iois:
            iois.sort()
            median_ioi = iois[len(iois) // 2]
            raw_bpm = 60.0 / median_ioi
            while raw_bpm < 70.0:
                raw_bpm *= 2.0
            while raw_bpm > 170.0:
                raw_bpm /= 2.0
            estimated_bpm = max(55, min(200, int(round(raw_bpm))))

    return extracted_notes, estimated_bpm


def transcribe_wav_polyphonic_dsp(
    wav_path: Path,
    output_midi_path: Path,
    song_title: str,
    arrangement_mode: str = "piano-cover",
    stem_tracks: dict = None,
):
    """
    Polyphonic spectral peak-tracking audio-to-MIDI transcriber across the 61-key range (MIDI 36..96).
    Uses `numpy` real FFT when available, or pure-Python Goertzel spectral energy detection if numpy is absent.
    """
    mode_label = "Full-Song Piano Arrangement" if arrangement_mode == "full-song" else "Piano Cover"
    log_status("transcribing", f"Analyzing polyphonic harmonic spectrum ({mode_label} mode, C2–C7)...", 65)
    extracted_notes, estimated_bpm = extract_notes_from_wav_dsp(wav_path, 36, 96, 4)

    if arrangement_mode == "full-song":
        final_notes = build_full_song_arrangement(extracted_notes, bpm=estimated_bpm)
    else:
        final_notes = extracted_notes

    log_status(
        "writing_midi",
        f"Extracted {len(final_notes)} playable notes in {mode_label} mode ({estimated_bpm} BPM). Writing Standard MIDI File...",
        85,
    )
    write_standard_midi_file(
        output_midi_path,
        final_notes,
        song_title=song_title,
        bpm=estimated_bpm,
        stem_tracks=stem_tracks,
    )


# ============================================================================
# ISSUE #41 & #42: 6-STEM SEPARATION (HTDEMUCS_6S + SPECTRAL DSP FALLBACK)
# ============================================================================

CANONICAL_STEMS = ("piano", "drums", "bass", "vocals", "guitar", "other")


def _write_mono_float_wav(wav_path: Path, samples, sr: int):
    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sr))
        try:
            import numpy as np
            arr16 = (np.clip(np.asarray(samples, dtype=np.float32), -0.98, 0.98) * 32767.0).astype("<i2")
            wf.writeframes(arr16.tobytes())
        except ImportError:
            import array
            pcm = array.array("h", (int(max(-0.98, min(0.98, float(x))) * 32767) for x in samples))
            if sys.byteorder != "little":
                pcm.byteswap()
            wf.writeframes(pcm.tobytes())


def separate_audio_into_6_stems(source_wav: Path, stems_dir: Path, tmp_dir: Path) -> dict:
    """
    Issue #41: Separate input audio into 6 synced stems (`piano`, `drums`, `bass`, `vocals`, `guitar`, `other`)
    inside `stems_dir`.
    1. Tries `demucs -n htdemucs_6s` when Demucs is installed in the Python environment, streaming real-time
       progress (`stage="splitting_stems"`).
    2. Falls back to a deterministic spectral/transient 6-band separator (`numpy` FFT or pure-Python band filters)
       so CPU-only setups and `--self-test` always produce a complete 6-stem directory.
    Returns dict mapping stem_name -> Path.
    """
    stems_dir.mkdir(parents=True, exist_ok=True)
    log_status("splitting_stems", "Starting 6-stem separation (drums, bass, vocals, guitar, piano, other)...", 28)

    # 1. Try Demucs (`htdemucs_6s`) subprocess if installed
    demucs_out = tmp_dir / "demucs_out"
    try:
        import importlib.util
        has_demucs = importlib.util.find_spec("demucs") is not None
    except Exception:
        has_demucs = False

    if has_demucs:
        log_status("splitting_stems", "Running Demucs htdemucs_6s neural stem separation...", 32)
        cmd = [
            sys.executable,
            "-m",
            "demucs.separate",
            "-n",
            "htdemucs_6s",
            "-o",
            str(demucs_out),
            str(source_wav),
        ]
        proc = None
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            if proc.stdout is not None:
                for line in proc.stdout:
                    m = re.search(r"(\d{1,3})%\|", line)
                    if m:
                        pct = max(0, min(100, int(m.group(1))))
                        scaled = 32 + int(pct * 0.22)
                        log_status("splitting_stems", f"Demucs htdemucs_6s separating stems ({pct}%)...", scaled)
            proc.wait()
            if proc.returncode == 0:
                model_dir = demucs_out / "htdemucs_6s" / source_wav.stem
                if model_dir.exists():
                    resolved = {}
                    for stem_name in CANONICAL_STEMS:
                        cand = model_dir / f"{stem_name}.wav"
                        if cand.exists():
                            dest = stems_dir / f"{stem_name}.wav"
                            shutil.copy2(cand, dest)
                            resolved[stem_name] = dest
                    if len(resolved) == len(CANONICAL_STEMS):
                        log_status("splitting_stems", "Demucs 6-stem separation complete!", 54)
                        return resolved
        except Exception as exc:
            log_status("warning", f"Demucs htdemucs_6s fallback triggered: {exc}", 35)
        finally:
            if proc is not None:
                try:
                    if proc.poll() is None:
                        proc.terminate()
                        proc.wait(timeout=5)
                except Exception:
                    try:
                        proc.kill()
                        proc.wait(timeout=2)
                    except Exception:
                        pass
                if proc.stdout is not None:
                    try:
                        proc.stdout.close()
                    except Exception:
                        pass

    # 2. Built-in Spectral / Transient 6-Stem Separator Fallback
    samples, sr = read_wav_mono_float(source_wav)
    n_samples = len(samples)
    if n_samples == 0:
        raise RuntimeError("Source WAV is empty; cannot separate stems.")

    try:
        import numpy as np
        arr = np.asarray(samples, dtype=np.float32)
        spec = np.fft.rfft(arr)
        freqs = np.fft.rfftfreq(n_samples, d=1.0 / sr)

        # Band definitions + percussive envelope for drums
        bass_mask = (freqs >= 28.0) & (freqs < 210.0)
        guitar_mask = (freqs >= 190.0) & (freqs < 950.0)
        piano_mask = (freqs >= 130.0) & (freqs <= 2200.0)
        vocals_mask = (freqs >= 260.0) & (freqs <= 3400.0)
        other_mask = (freqs >= 900.0) | (freqs < 60.0)

        stem_specs = {
            "bass": spec * bass_mask,
            "piano": spec * piano_mask * 0.85,
            "guitar": spec * guitar_mask * 0.75,
            "vocals": spec * vocals_mask * 0.80,
            "other": spec * other_mask * 0.65,
        }
        resolved = {}
        for idx, (stem_name, s_spec) in enumerate(stem_specs.items()):
            pct = 35 + int(((idx + 1) / 6.0) * 18)
            log_status("splitting_stems", f"Separating {stem_name} stem ({idx + 1}/6)...", pct)
            y = np.fft.irfft(s_spec, n=n_samples)
            dest = stems_dir / f"{stem_name}.wav"
            _write_mono_float_wav(dest, y, sr)
            resolved[stem_name] = dest

        # Drums stem: high-frequency transient derivative emphasis
        log_status("splitting_stems", "Separating drums percussive stem (6/6)...", 53)
        diff = np.diff(arr, prepend=arr[0]) * 2.2
        drums_y = np.clip(diff, -0.95, 0.95)
        drums_dest = stems_dir / "drums.wav"
        _write_mono_float_wav(drums_dest, drums_y, sr)
        resolved["drums"] = drums_dest
        return resolved
    except ImportError:
        # Pure-Python moving-average band splitter when numpy is not installed
        resolved = {}
        # Low-pass via short window for bass, mid for piano/vocals/guitar, diff for drums
        bass_buf = [0.0] * n_samples
        drums_buf = [0.0] * n_samples
        piano_buf = [0.0] * n_samples
        guitar_buf = [0.0] * n_samples
        vocals_buf = [0.0] * n_samples
        other_buf = [0.0] * n_samples

        lp_prev = 0.0
        mid_prev = 0.0
        alpha_bass = min(0.25, max(0.01, (2.0 * math.pi * 180.0) / max(1.0, float(sr))))
        alpha_mid = min(0.65, max(0.05, (2.0 * math.pi * 1200.0) / max(1.0, float(sr))))

        for i, x in enumerate(samples):
            lp_prev = lp_prev + alpha_bass * (x - lp_prev)
            mid_prev = mid_prev + alpha_mid * (x - mid_prev)
            hp = x - mid_prev
            mid_band = mid_prev - lp_prev
            prev_x = samples[i - 1] if i > 0 else x
            transient = max(-0.95, min(0.95, (x - prev_x) * 2.2))

            bass_buf[i] = lp_prev * 1.15
            drums_buf[i] = transient * 0.85 + hp * 0.35
            piano_buf[i] = mid_band * 0.95 + lp_prev * 0.35
            vocals_buf[i] = mid_band * 0.85
            guitar_buf[i] = mid_band * 0.75 + hp * 0.25
            other_buf[i] = hp * 0.75 + mid_band * 0.25

        stem_arrays = {
            "piano": piano_buf,
            "drums": drums_buf,
            "bass": bass_buf,
            "vocals": vocals_buf,
            "guitar": guitar_buf,
            "other": other_buf,
        }
        for idx, (stem_name, buf) in enumerate(stem_arrays.items()):
            pct = 35 + int(((idx + 1) / 6.0) * 18)
            log_status("splitting_stems", f"Separating {stem_name} stem ({idx + 1}/6)...", pct)
            dest = stems_dir / f"{stem_name}.wav"
            _write_mono_float_wav(dest, buf, sr)
            resolved[stem_name] = dest

        return resolved


def transcribe_separated_stems_for_highways(stems_map: dict) -> dict:
    """
    Issue #42: Extract per-instrument note tracks (`bass`, `drums`, `guitar`, `vocals`, `other`)
    from separated stem WAV files so Multi-Instrument Highways can chart any stem!
    """
    stem_tracks = {}
    if not stems_map:
        return stem_tracks

    # Register ranges tailored to each instrument
    stem_ranges = {
        "bass": (36, 59, 1),
        "drums": (36, 67, 2),
        "guitar": (48, 84, 3),
        "vocals": (55, 84, 1),
        "other": (48, 88, 3),
    }
    for stem_name, (p_min, p_max, poly) in stem_ranges.items():
        wav_p = stems_map.get(stem_name)
        if not wav_p or not Path(wav_p).exists():
            continue
        try:
            # Issue #160: Use CREPE / pYIN vocal contour tracker (170ms median vibrato smooth, true vocal register)
            if stem_name == "vocals":
                lead_or_vocals = stems_map.get("vocals_lead") or wav_p
                vocal_crepe_notes, _ = extract_vocal_melody_crepe(
                    Path(lead_or_vocals),
                    fold_to_rh_piano=False,
                    median_smooth_ms=170,
                )
                if vocal_crepe_notes:
                    stem_tracks["vocals"] = vocal_crepe_notes
                    continue

            notes, _ = extract_notes_from_wav_dsp(Path(wav_p), pitch_min=p_min, pitch_max=p_max, max_polyphony=poly)
            if stem_name == "drums" and notes:
                # Quantize drum stem transients onto GM-friendly drum kit pitches (36 Kick, 38 Snare, 42 Hat, 45 Tom)
                mapped_drums = []
                for idx, n in enumerate(notes):
                    p = int(n["midi"])
                    if p < 44:
                        dp = 36  # Kick
                    elif p < 52:
                        dp = 38  # Snare
                    elif p < 60:
                        dp = 42  # Closed Hi-Hat
                    else:
                        dp = 45  # Tom / Cymbal
                    mapped_drums.append({
                        "midi": dp,
                        "start": n["start"],
                        "duration": min(0.22, max(0.10, float(n["duration"]))),
                        "velocity": max(75, min(120, int(n.get("velocity", 96)))),
                    })
                stem_tracks[stem_name] = mapped_drums
            elif notes:
                stem_tracks[stem_name] = notes
        except Exception:
            pass

    return stem_tracks


# ============================================================================
# ISSUE #161: OPTIONAL AI LEAD VOCAL VS. BACKING HARMONY SPLIT (audio-separator)
# ============================================================================

def try_split_lead_and_backing_vocals(vocals_wav: Path, stems_dir: Path, tmp_dir: Path) -> dict:
    """
    Issue #161: If `audio-separator` is installed, split isolated `vocals.wav` into
    `vocals_lead.wav` and `vocals_backing.wav` using UVR Karaoke separation.
    Returns `{"vocals_lead": Path, "vocals_backing": Path}` or `{}` if unavailable.
    """
    if not vocals_wav or not Path(vocals_wav).exists():
        return {}
    try:
        import importlib.util
        if importlib.util.find_spec("audio_separator") is None:
            return {}
        from audio_separator.separator import Separator
    except Exception:
        return {}

    karaoke_out = tmp_dir / "karaoke_vocal_split"
    karaoke_out.mkdir(parents=True, exist_ok=True)
    try:
        log_status("splitting_stems", "Splitting Lead Vocals vs. Backing Harmonies (UVR Karaoke AI)...", 56)
        sep = Separator(output_dir=str(karaoke_out), output_format="WAV")
        sep.load_model(model_filename="UVR-MDX-NET-Karaoke_2.onnx")
        outputs = sep.separate(str(vocals_wav)) or []
        lead_src = None
        backing_src = None
        for out_f in outputs:
            p = Path(out_f)
            if not p.is_absolute():
                p = karaoke_out / p
            if not p.exists():
                continue
            low = p.name.lower()
            if "vocal" in low and "no_vocal" not in low and "instrumental" not in low:
                lead_src = p
            elif "instrumental" in low or "no_vocal" in low or "backing" in low:
                backing_src = p
        if lead_src and backing_src:
            lead_dest = stems_dir / "vocals_lead.wav"
            backing_dest = stems_dir / "vocals_backing.wav"
            shutil.copy2(lead_src, lead_dest)
            shutil.copy2(backing_src, backing_dest)
            log_status("splitting_stems", "Lead Vocal & Backing Harmony stems ready!", 58)
            return {"vocals_lead": lead_dest, "vocals_backing": backing_dest}
    except Exception as exc:
        log_status("warning", f"Optional Lead/Harmony AI split skipped (using Stereo Mid/Side): {exc}", 57)
    return {}


# ============================================================================
# ISSUE #159: 3-TIER SYNCED LYRICS PIPELINE (LRCLIB -> YT CAPTIONS -> WHISPER)
# ============================================================================

def _format_lrc_ts(sec: float) -> str:
    total_centis = max(0, int(round(max(0.0, float(sec)) * 100)))
    mins = total_centis // 6000
    whole = (total_centis % 6000) // 100
    centis = total_centis % 100
    return f"{mins:02d}:{whole:02d}.{centis:02d}"


def _clean_lyrics_query(raw_title: str) -> tuple:
    s = re.sub(r"\.(mid|midi|musicxml|xml|mxl|wav|mp3|m4a|ogg|flac)$", "", str(raw_title or ""), flags=re.I)
    s = re.sub(r"_+", " ", s)
    s = re.sub(r"^(?:youtube|yt)\s*[:\-–—]?\s+", "", s, flags=re.I)
    s = re.sub(
        r"[\(\[]\s*(?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrics?|audio|hd|hq|4k|remastered|live|acoustic|karaoke|instrumental|visualizer|full\s*song|explicit|clean)[^\)\]]*[\)\]]",
        " ",
        s,
        flags=re.I,
    )
    s = re.sub(r"\s*\|\s*.*$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+)$", s)
    if m:
        artist = m.group(1).strip()
        track = m.group(2).strip()
        return artist, track, f"{artist} {track}".strip()
    return "", s, s


def _convert_lrclib_yaml_to_lrc(yaml_text: str):
    """Convert LRCLIB `lyricsfile` word-synced YAML into enhanced `[mm:ss.xx] <mm:ss.xx> word` LRC."""
    if not yaml_text or not isinstance(yaml_text, str):
        return None
    parsed_lines = []
    cur_line = None
    cur_word = None
    in_words = False

    def _unquote(val: str) -> str:
        t = str(val or "").strip()
        if len(t) >= 2 and ((t[0] == '"' and t[-1] == '"') or (t[0] == "'" and t[-1] == "'")):
            return t[1:-1].replace('\\"', '"').replace("\\'", "'")
        return t

    def _parse_num(val: str):
        try:
            v = float(re.sub(r"#.*$", "", str(val or "")).strip())
            return v if math.isfinite(v) else None
        except Exception:
            return None

    def _commit_word():
        nonlocal cur_word
        if cur_line is not None and cur_word is not None and cur_word.get("text") is not None:
            cur_line["words"].append(cur_word)
        cur_word = None

    def _commit_line():
        nonlocal cur_line, in_words
        _commit_word()
        if cur_line is not None and (cur_line["words"] or cur_line.get("text")):
            parsed_lines.append(cur_line)
        cur_line = None
        in_words = False

    for raw in yaml_text.splitlines():
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        trimmed = raw.strip()
        if re.match(r"^-\s+startTime\s*:", trimmed, re.I) and indent <= 4:
            _commit_line()
            cur_line = {"startTime": _parse_num(trimmed.split(":", 1)[1]), "words": [], "text": ""}
            in_words = False
            continue
        if cur_line is None:
            continue
        if re.match(r"^words\s*:", trimmed, re.I):
            in_words = True
            continue
        if not in_words:
            if re.match(r"^startTime\s*:", trimmed, re.I):
                cur_line["startTime"] = _parse_num(trimmed.split(":", 1)[1])
            elif re.match(r"^text\s*:", trimmed, re.I):
                cur_line["text"] = _unquote(trimmed.split(":", 1)[1])
            continue
        if re.match(r"^-\s+text\s*:", trimmed, re.I):
            _commit_word()
            cur_word = {"text": _unquote(re.sub(r"^-\s+text\s*:", "", trimmed, flags=re.I)), "startTime": None}
        elif re.match(r"^-\s+startTime\s*:", trimmed, re.I):
            _commit_word()
            cur_word = {"text": "", "startTime": _parse_num(re.sub(r"^-\s+startTime\s*:", "", trimmed, flags=re.I))}
        elif cur_word is not None:
            if re.match(r"^text\s*:", trimmed, re.I):
                cur_word["text"] = _unquote(trimmed.split(":", 1)[1])
            elif re.match(r"^startTime\s*:", trimmed, re.I):
                cur_word["startTime"] = _parse_num(trimmed.split(":", 1)[1])
    _commit_line()

    word_lines = [l for l in parsed_lines if l["words"] and l["startTime"] is not None]
    if not word_lines:
        return None
    max_val = max(
        [l["startTime"] for l in word_lines]
        + [w["startTime"] for l in word_lines for w in l["words"] if w["startTime"] is not None]
    )
    scale = 0.001 if max_val > 1000.0 else 1.0
    out = []
    for l in word_lines:
        ls = l["startTime"] * scale
        tokens = []
        for w in l["words"]:
            wt = str(w.get("text") or "").strip()
            if not wt:
                continue
            ws = (w["startTime"] * scale) if w["startTime"] is not None else ls
            tokens.append(f"<{_format_lrc_ts(ws)}> {wt}")
        if tokens:
            out.append(f"[{_format_lrc_ts(ls)}] {' '.join(tokens)}")
    return "\n".join(out) if out else None


def _fetch_lrclib_lrc_text(title: str, duration_sec: float = 0.0):
    """Tier 1: Query LRCLIB (lrclib.net) for word-synced or line-synced `.lrc` lyrics (±5s match)."""
    import urllib.parse
    import urllib.request

    artist, track, query = _clean_lyrics_query(title)
    if not query:
        return None

    headers = {
        "User-Agent": "CollegeOfKeys/1.5.2 (https://github.com/kiyoshithekidd/college-of-keys)",
        "Accept": "application/json",
    }

    def _get_json(url: str):
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status >= 400:
                return None
            return json.loads(resp.read().decode("utf-8", errors="replace"))

    candidates = []
    try:
        if artist and track:
            dur_q = f"&duration={int(round(duration_sec))}" if duration_sec > 10 else ""
            exact = _get_json(
                f"https://lrclib.net/api/get?track_name={urllib.parse.quote(track)}&artist_name={urllib.parse.quote(artist)}{dur_q}"
            )
            if isinstance(exact, dict):
                candidates.append(exact)
    except Exception:
        pass

    if not candidates or not candidates[0].get("hasWordSync"):
        try:
            res = _get_json(f"https://lrclib.net/api/search?q={urllib.parse.quote(query)}")
            if isinstance(res, list):
                candidates.extend(res)
        except Exception:
            pass

    best = None
    best_score = -1e9
    norm_track = track.lower()
    norm_artist = artist.lower()
    for item in candidates:
        if not isinstance(item, dict):
            continue
        has_word = bool(item.get("hasWordSync") and item.get("lyricsfile"))
        has_synced = bool(item.get("syncedLyrics") and str(item["syncedLyrics"]).strip())
        has_plain = bool(item.get("plainLyrics") and str(item["plainLyrics"]).strip())
        if not (has_word or has_synced or has_plain):
            continue
        score = 120.0 if has_word else (90.0 if has_synced else 20.0)
        it_track = str(item.get("trackName") or item.get("name") or "").lower()
        it_artist = str(item.get("artistName") or "").lower()
        if norm_track and norm_track in it_track:
            score += 30.0
        if norm_artist and norm_artist in it_artist:
            score += 25.0
        if duration_sec > 10 and item.get("duration") is not None:
            try:
                diff = abs(float(item["duration"]) - float(duration_sec))
                if diff <= 5.0:
                    score += 45.0
                elif diff <= 10.0:
                    score += 20.0
                elif diff <= 20.0:
                    score += 5.0
                else:
                    score -= min(40.0, diff * 0.5)
            except Exception:
                pass
        if score > best_score:
            best_score = score
            best = item

    if not best:
        return None
    if best.get("hasWordSync") and best.get("lyricsfile"):
        enhanced = _convert_lrclib_yaml_to_lrc(str(best["lyricsfile"]))
        if enhanced:
            return enhanced
    if best.get("syncedLyrics") and str(best["syncedLyrics"]).strip():
        return str(best["syncedLyrics"]).strip()
    if best.get("plainLyrics") and str(best["plainLyrics"]).strip():
        return str(best["plainLyrics"]).strip()
    return None


def _parse_vtt_ts_sec(ts_str: str) -> float:
    parts = ts_str.strip().replace(",", ".").split(":")
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
    except Exception:
        pass
    return 0.0


def _convert_vtt_text_to_lrc(vtt_text: str):
    """Convert WebVTT (`.vtt`) human/auto captions (including inline `<00:00:10.500>` tags) into `.lrc`."""
    if not vtt_text or not isinstance(vtt_text, str):
        return None
    cue_re = re.compile(r"^((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})")
    inline_ts_re = re.compile(r"<((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})>")
    tag_strip_re = re.compile(r"</?[^>]+>")

    lines_out = []
    last_plain = None
    blocks = re.split(r"\r?\n\r?\n+", vtt_text)
    for block in blocks:
        b_lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not b_lines or b_lines[0].upper().startswith("WEBVTT") or b_lines[0].startswith("NOTE"):
            continue
        cue_idx = next((idx for idx, ln in enumerate(b_lines) if cue_re.match(ln)), -1)
        if cue_idx < 0:
            continue
        m = cue_re.match(b_lines[cue_idx])
        start_sec = _parse_vtt_ts_sec(m.group(1))
        payload = " ".join(b_lines[cue_idx + 1 :]).strip()
        if not payload:
            continue

        # Convert inline VTT word timestamps `<00:00:12.340>` when present
        inline_matches = list(inline_ts_re.finditer(payload))
        if inline_matches:
            tokens = []
            first_chunk = tag_strip_re.sub("", payload[: inline_matches[0].start()]).strip()
            if first_chunk and not (first_chunk.startswith("[") and first_chunk.endswith("]")):
                tokens.append(f"<{_format_lrc_ts(start_sec)}> {first_chunk}")
            for idx, im in enumerate(inline_matches):
                w_sec = _parse_vtt_ts_sec(im.group(1))
                end_pos = inline_matches[idx + 1].start() if idx + 1 < len(inline_matches) else len(payload)
                chunk = tag_strip_re.sub("", payload[im.end() : end_pos]).strip()
                if chunk and not (chunk.startswith("[") and chunk.endswith("]")):
                    tokens.append(f"<{_format_lrc_ts(w_sec)}> {chunk}")
            if tokens:
                plain_check = " ".join(re.sub(r"^<[^>]+>\s*", "", tk) for tk in tokens)
                if plain_check != last_plain:
                    lines_out.append(f"[{_format_lrc_ts(start_sec)}] {' '.join(tokens)}")
                    last_plain = plain_check
            continue

        clean = re.sub(r"\s+", " ", tag_strip_re.sub("", payload)).strip()
        if not clean or (clean.startswith("[") and clean.endswith("]")) or clean == last_plain:
            continue
        lines_out.append(f"[{_format_lrc_ts(start_sec)}] {clean}")
        last_plain = clean

    return "\n".join(lines_out) if lines_out else None


def _extract_youtube_subtitles_lrc(yt_url: str, tmp_dir: Path):
    """Tier 2: Extract English JSON3 or WebVTT subtitles via yt-dlp into `.lrc` format."""
    if not yt_url or not tmp_dir:
        return None
    try:
        import yt_dlp
    except ImportError:
        return None

    sub_dir = tmp_dir / "yt_subs"
    sub_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "json3/vtt/best",
        "outtmpl": str(sub_dir / "subs.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(yt_url, download=True)
        json3_files = sorted(sub_dir.glob("*.json3"))
        if json3_files:
            payload = json.loads(json3_files[0].read_text(encoding="utf-8", errors="replace"))
            lines_out = []
            for ev in payload.get("events", []):
                segs = ev.get("segs") or []
                t_start_ms = ev.get("tStartMs")
                if t_start_ms is None or not segs:
                    continue
                tokens = []
                for seg in segs:
                    txt = str(seg.get("utf8", "")).replace("\n", " ").strip()
                    if not txt or (txt.startswith("[") and txt.endswith("]")):
                        continue
                    off_ms = seg.get("tOffsetMs", 0) or 0
                    tokens.append(f"<{_format_lrc_ts((t_start_ms + off_ms) / 1000.0)}> {txt}")
                if tokens:
                    lines_out.append(f"[{_format_lrc_ts(t_start_ms / 1000.0)}] {' '.join(tokens)}")
            if lines_out:
                return "\n".join(lines_out)

        vtt_files = sorted(sub_dir.glob("*.vtt"))
        if vtt_files:
            vtt_lrc = _convert_vtt_text_to_lrc(vtt_files[0].read_text(encoding="utf-8", errors="replace"))
            if vtt_lrc:
                return vtt_lrc
    except Exception:
        return None
    return None


def _transcribe_whisper_lrc(vocals_wav: Path):
    """Tier 3: Optional local `faster-whisper` word-timestamped transcription on `vocals.wav`."""
    if not vocals_wav or not Path(vocals_wav).exists():
        return None
    try:
        import importlib.util
        if importlib.util.find_spec("faster_whisper") is None:
            return None
        from faster_whisper import WhisperModel
    except Exception:
        return None

    try:
        log_status("transcribing", "Transcribing word-synced lyrics locally via faster-whisper...", 92)
        model = WhisperModel("base", device="auto", compute_type="int8")
        segments, _ = model.transcribe(str(vocals_wav), word_timestamps=True, vad_filter=True)
        lines_out = []
        for seg in segments:
            words = getattr(seg, "words", None) or []
            if words:
                tokens = [f"<{_format_lrc_ts(w.start)}> {str(w.word).strip()}" for w in words if str(w.word).strip()]
                if tokens:
                    lines_out.append(f"[{_format_lrc_ts(seg.start)}] {' '.join(tokens)}")
            elif str(seg.text or "").strip():
                lines_out.append(f"[{_format_lrc_ts(seg.start)}] {str(seg.text).strip()}")
        return "\n".join(lines_out) if lines_out else None
    except Exception:
        return None


def _estimate_wav_duration_sec(wav_path: Path) -> float:
    if not wav_path or not Path(wav_path).exists():
        return 0.0
    try:
        with wave.open(str(wav_path), "rb") as wf:
            fr = wf.getframerate()
            return (wf.getnframes() / float(fr)) if fr > 0 else 0.0
    except Exception:
        return 0.0


def fetch_synced_lyrics_for_import(
    title: str,
    output_lrc_path: Path,
    yt_url: str = None,
    vocals_wav: Path = None,
    tmp_dir: Path = None,
    duration_sec: float = 0.0,
):
    """Run the 3-tier synced lyrics cascade and persist `<safe_base>.lrc` if found."""
    if output_lrc_path.exists():
        return output_lrc_path
    lrc_text = _fetch_lrclib_lrc_text(title, duration_sec=duration_sec)
    if not lrc_text and yt_url:
        lrc_text = _extract_youtube_subtitles_lrc(yt_url, tmp_dir)
    if not lrc_text and vocals_wav:
        lrc_text = _transcribe_whisper_lrc(vocals_wav)
    if lrc_text:
        try:
            output_lrc_path.write_text(lrc_text, encoding="utf-8")
            log_status("lyrics", f"Saved synced karaoke lyrics: {output_lrc_path.name}", 94)
            return output_lrc_path
        except Exception:
            return None
    return None


# ============================================================================
# YOUTUBE AUDIO DOWNLOAD VIA YT-DLP
# ============================================================================

def download_youtube_audio(url: str, work_dir: Path, custom_title: str = None):
    """
    Download audio from a YouTube URL using `yt-dlp`.
    Returns (audio_file_path, video_title).
    """
    log_status("downloading", f"Connecting to YouTube via yt-dlp: {url}", 15)

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError(
            "yt-dlp is not installed yet. Run `python_ml\\setup_ml_env.bat` or `pip install yt-dlp`."
        ) from exc

    out_tmpl = str(work_dir / "quest_audio.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_title = custom_title or info.get("title") or "YouTube_Arcane_Spell"
        downloaded_path = Path(ydl.prepare_filename(info))

    if not downloaded_path.exists():
        candidates = list(work_dir.glob("quest_audio.*"))
        if not candidates:
            raise RuntimeError("yt-dlp finished but no audio file was found.")
        downloaded_path = candidates[0]

    log_status("downloaded", f"Downloaded audio: {video_title}", 45, {"title": video_title})
    return downloaded_path, video_title


def _find_ffmpeg_bin():
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        try:
            import imageio_ffmpeg
            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_bin = None
    return ffmpeg_bin


def convert_audio_to_pcm_wav(input_audio: Path, target_wav: Path) -> bool:
    """
    If `input_audio` is already a standard 16-bit PCM `.wav` file, copy it; otherwise use `ffmpeg`
    (from PATH or `imageio-ffmpeg`) to decode `.webm`/`.m4a`/`.mp3`/`.opus` (or 24/32-bit float WAV)
    to 22050Hz mono 16-bit PCM WAV.
    """
    is_valid_pcm_wav = False
    if input_audio.suffix.lower() == ".wav":
        try:
            with wave.open(str(input_audio), "rb") as wf:
                if wf.getcomptype() == "NONE" and wf.getsampwidth() in (1, 2, 3, 4):
                    is_valid_pcm_wav = True
                    if wf.getsampwidth() == 2 and wf.getnchannels() == 1:
                        if input_audio.resolve() != target_wav.resolve():
                            shutil.copy2(input_audio, target_wav)
                        return True
        except Exception:
            is_valid_pcm_wav = False

    ffmpeg_bin = _find_ffmpeg_bin()
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(input_audio),
            "-ac",
            "1",
            "-ar",
            "22050",
            "-sample_fmt",
            "s16",
            str(target_wav),
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            if res.returncode == 0 and target_wav.exists():
                return True
        except subprocess.TimeoutExpired:
            pass

    if is_valid_pcm_wav:
        if input_audio.resolve() != target_wav.resolve():
            shutil.copy2(input_audio, target_wav)
        return True

    return False


def convert_audio_to_stereo_backing_wav(input_audio: Path, target_wav: Path) -> bool:
    """
    Decode `.webm`/`.opus`/stream audio to 44.1kHz stereo 16-bit PCM WAV for Chromium `<audio>` playback.
    """
    ffmpeg_bin = _find_ffmpeg_bin()
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(input_audio),
            "-ac",
            "2",
            "-ar",
            "44100",
            "-sample_fmt",
            "s16",
            str(target_wav),
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=300)
            if res.returncode == 0 and target_wav.exists():
                return True
        except subprocess.TimeoutExpired:
            pass
    return convert_audio_to_pcm_wav(input_audio, target_wav)


def save_playable_backing_audio(source_audio_path: Path, output_dir: Path, safe_base: str, tmp_dir: Path, mono_pcm_wav: Path = None) -> Path:
    """
    Copy Chromium-playable audio directly or transcode `.webm`/`.opus` streams into high-quality WAV.
    """
    ext_lower = source_audio_path.suffix.lower()
    if ext_lower in (".wav", ".mp3", ".m4a", ".ogg", ".flac") and source_audio_path.exists():
        dest_path = output_dir / f"{safe_base}{ext_lower}"
        if source_audio_path.resolve() != dest_path.resolve():
            shutil.copy2(source_audio_path, dest_path)
        return dest_path

    dest_wav = output_dir / f"{safe_base}.wav"
    log_status("converting_audio", "Converting stream to high-quality backing WAV...", 75)
    if convert_audio_to_stereo_backing_wav(source_audio_path, dest_wav):
        return dest_wav

    if mono_pcm_wav and mono_pcm_wav.exists():
        shutil.copy2(mono_pcm_wav, dest_wav)
        return dest_wav

    if source_audio_path.exists():
        fallback_dest = output_dir / f"{safe_base}{ext_lower or '.audio'}"
        if source_audio_path.resolve() != fallback_dest.resolve():
            shutil.copy2(source_audio_path, fallback_dest)
        return fallback_dest

    raise RuntimeError("Could not produce a playable backing audio file.")


# ============================================================================
# SELF-TEST AUDIO SYNTHESIZER (Generates a Real Polyphonic Piano WAV + Transcribes It)
# ============================================================================

def generate_self_test_wav(wav_path: Path):
    """
    Synthesize a real 16-bit PCM .wav recording of a polyphonic D&D Bard melody + bass accompaniment
    so the entire Audio -> DSP/ML Transcriber -> .mid + Backing Audio pipeline can be tested in 2 seconds!
    """
    sr = 22050
    events = [
        # (start_sec, duration_sec, midi_pitch, amplitude)
        # Measure 1: A minor chord & melody
        (0.0, 0.80, 45, 0.30),  # A2 (LH)
        (0.0, 0.80, 52, 0.25),  # E3 (LH)
        (0.0, 0.35, 69, 0.42),  # A4 (RH)
        (0.4, 0.35, 72, 0.42),  # C5 (RH)
        (0.8, 0.80, 41, 0.30),  # F2 (LH)
        (0.8, 0.35, 76, 0.44),  # E5 (RH)
        (1.2, 0.35, 74, 0.42),  # D5 (RH)
        # Measure 2: C major / G major cadence
        (1.6, 0.80, 48, 0.30),  # C3 (LH)
        (1.6, 0.35, 72, 0.44),  # C5 (RH)
        (2.0, 0.35, 71, 0.40),  # B4 (RH)
        (2.4, 0.80, 43, 0.30),  # G2 (LH)
        (2.4, 0.35, 67, 0.40),  # G4 (RH)
        (2.8, 0.70, 69, 0.46),  # A4 (RH)
        (2.8, 0.70, 45, 0.32),  # A2 (LH)
    ]
    total_sec = 3.8
    total_samples = int(sr * total_sec)
    buf = [0.0] * total_samples

    for start_s, dur_s, midi_p, amp in events:
        f0 = 440.0 * (2.0 ** ((midi_p - 69) / 12.0))
        s_idx = int(start_s * sr)
        e_idx = min(total_samples, int((start_s + dur_s) * sr))
        n_len = max(1, e_idx - s_idx)
        for i in range(n_len):
            t = i / float(sr)
            env = min(1.0, i / (0.01 * sr)) * math.exp(-3.2 * (i / float(n_len)))
            # Fundamental + warm 2nd harmonic
            val = (math.sin(2.0 * math.pi * f0 * t) + 0.25 * math.sin(4.0 * math.pi * f0 * t)) * amp * env
            buf[s_idx + i] += val

    with wave.open(str(wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for x in buf:
            clamped = max(-0.98, min(0.98, x))
            frames.extend(struct.pack("<h", int(clamped * 32767)))
        wf.writeframes(bytes(frames))


# ============================================================================
# MAIN CLI ENTRYPOINT
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="College of Keys — Phase 8 YouTube/Audio-to-MIDI ML Pipeline & Issue #76 Clean Audio Fetcher"
    )
    parser.add_argument(
        "source",
        nargs="?",
        help="YouTube URL or path to a local audio file (.wav, .mp3, .m4a)",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_IMPORTS_DIR),
        help="Destination folder for generated .mid and backing audio (defaults to ../Imports)",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Optional custom spell title",
    )
    parser.add_argument(
        "--stem",
        default=None,
        help="Optional safe filename stem (without extension) for the saved output files",
    )
    parser.add_argument(
        "--mode",
        choices=["piano-cover", "full-song"],
        default="piano-cover",
        help="Transcription mode (Issue #123): 'piano-cover' (exact piano transcription) or 'full-song' (RH vocal/lead melody + LH chord/bass arrangement)",
    )
    parser.add_argument(
        "--engine",
        choices=["basic-pitch", "transkun", "auto"],
        default="basic-pitch",
        help="Transcription engine (Issue #144/#145): 'basic-pitch' (fast default, works on any instrument), 'transkun' (high-accuracy solo piano, requires optional PyTorch/Transkun install), or 'auto' (uses Transkun for piano-cover when installed, else basic-pitch)",
    )
    parser.add_argument(
        "--full-song-pipeline",
        choices=["auto", "demucs-crepe", "basic-pitch"],
        default="auto",
        help="Full-Song Arrangement pipeline (Issue #146): 'auto' (uses Demucs 4-stem + CREPE vocal melody + other/bass chords when Demucs is installed, else basic-pitch), 'demucs-crepe', or 'basic-pitch'",
    )
    parser.add_argument(
        "--split-stems",
        action="store_true",
        help="Issue #41 & #42: Separate audio into 6 stems (piano, drums, bass, vocals, guitar, other) for real-audio play-along and multi-instrument highways",
    )
    parser.add_argument(
        "--audio-only",
        action="store_true",
        help="Download/convert clean backing audio only without running AI MIDI transcription (Song Bundle mode)",
    )
    parser.add_argument(
        "--no-backing",
        action="store_true",
        help="Do not copy the synced backing audio track into Imports/",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Synthesize a polyphonic test audio file, transcribe it to .mid, and output both to ../Imports",
    )

    args = parser.parse_args()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    arrangement_mode = args.mode or "piano-cover"
    requested_engine = args.engine or "basic-pitch"
    full_song_pipeline = args.full_song_pipeline or "auto"

    try:
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_dir = Path(tmp_dir_str)

            if args.self_test:
                title = args.title or f"Arcane_ML_Transcription_{int(time.time()) % 1000}"
                safe_base = sanitize_filename(args.stem or title)
                test_wav = tmp_dir / f"{safe_base}.wav"

                log_status("starting", "Generating polyphonic acoustic test audio (.wav)...", 15)
                generate_self_test_wav(test_wav)
                source_audio_path = test_wav
            else:
                if not args.source:
                    parser.error("Please provide a YouTube URL, a local audio path, or --self-test.")

                src_str = args.source.strip()
                if re.match(r"^https?://", src_str, re.I):
                    source_audio_path, dl_title = download_youtube_audio(src_str, tmp_dir, args.title)
                    title = args.title or dl_title
                else:
                    local_path = Path(src_str).resolve()
                    if not local_path.exists():
                        raise FileNotFoundError(f"Audio file not found: {local_path}")
                    source_audio_path = local_path
                    title = args.title or local_path.stem

                safe_base = sanitize_filename(args.stem or title)

            if args.audio_only:
                dest_backing_path = save_playable_backing_audio(source_audio_path, output_dir, safe_base, tmp_dir)
                stems_payload = None
                if args.split_stems:
                    pcm_wav = tmp_dir / "decoded_mono.wav"
                    has_mono = convert_audio_to_pcm_wav(source_audio_path, pcm_wav)
                    stereo_stem_input = tmp_dir / "decoded_stereo_44k.wav"
                    if dest_backing_path and dest_backing_path.exists() and dest_backing_path.suffix.lower() == ".wav":
                        stem_source_wav = dest_backing_path
                    elif convert_audio_to_stereo_backing_wav(source_audio_path, stereo_stem_input):
                        stem_source_wav = stereo_stem_input
                    else:
                        stem_source_wav = pcm_wav if has_mono else None
                    if stem_source_wav and Path(stem_source_wav).exists():
                        stems_dir = output_dir / f"{safe_base}_stems"
                        stems_map = separate_audio_into_6_stems(Path(stem_source_wav), stems_dir, tmp_dir)
                        if stems_map and stems_map.get("vocals"):
                            vocal_sub = try_split_lead_and_backing_vocals(Path(stems_map["vocals"]), stems_dir, tmp_dir)
                            if vocal_sub:
                                stems_map.update(vocal_sub)
                        stems_payload = {k: str(v) for k, v in stems_map.items()}
                log_status(
                    "complete",
                    f"Clean Backing Audio ready in Imports/: {dest_backing_path.name}",
                    100,
                    {
                        "title": title,
                        "midi_path": None,
                        "backing_path": str(dest_backing_path) if dest_backing_path.exists() else None,
                        "stems": stems_payload,
                        "audio_only": True,
                        "engine": "yt-dlp-audio-only",
                    },
                )
                return 0

            dest_midi_path = output_dir / f"{safe_base}.mid"
            dest_backing_path = None

            # 1. Decode input audio (.webm/.m4a/.mp3/.wav) to 22050Hz mono 16-bit PCM .wav first
            #    so both Spotify basic-pitch (via soundfile) and fallback DSP can read it cleanly!
            pcm_wav = tmp_dir / "decoded_mono.wav"
            has_pcm_wav = convert_audio_to_pcm_wav(source_audio_path, pcm_wav)
            inference_audio_path = pcm_wav if has_pcm_wav else source_audio_path

            # 2. Copy synced backing audio into ../Imports BEFORE writing the .mid file (Issue #13)
            #    so that when fs.watch detects the new .mid file, the paired backing track is already on disk!
            if not args.no_backing:
                try:
                    dest_backing_path = save_playable_backing_audio(
                        source_audio_path,
                        output_dir,
                        safe_base,
                        tmp_dir,
                        mono_pcm_wav=pcm_wav if has_pcm_wav else None,
                    )
                except Exception:
                    dest_backing_path = None

            # 2b. Issue #41, #42 & #161: Optional 6-stem separation before MIDI writing.
            #     Feed 44.1 kHz STEREO WAV into Demucs so `vocals.wav` preserves stereo Lead vs. Harmony panning!
            stems_map = None
            stem_tracks = None
            if args.split_stems and has_pcm_wav:
                stems_dir = output_dir / f"{safe_base}_stems"
                stereo_stem_input = tmp_dir / "decoded_stereo_44k.wav"
                if dest_backing_path and dest_backing_path.exists() and dest_backing_path.suffix.lower() == ".wav":
                    stem_source_wav = dest_backing_path
                elif convert_audio_to_stereo_backing_wav(source_audio_path, stereo_stem_input):
                    stem_source_wav = stereo_stem_input
                else:
                    stem_source_wav = pcm_wav
                stems_map = separate_audio_into_6_stems(stem_source_wav, stems_dir, tmp_dir)
                if stems_map and stems_map.get("vocals"):
                    vocal_sub = try_split_lead_and_backing_vocals(Path(stems_map["vocals"]), stems_dir, tmp_dir)
                    if vocal_sub:
                        stems_map.update(vocal_sub)
                stem_tracks = transcribe_separated_stems_for_highways(stems_map)

            # 3. Resolve requested engine (Issue #144/#145/#146)
            try:
                import importlib.util
                has_transkun = (
                    importlib.util.find_spec("transkun") is not None
                    and importlib.util.find_spec("torch") is not None
                )
                has_demucs = importlib.util.find_spec("demucs") is not None
            except Exception:
                has_transkun = False
                has_demucs = False

            used_engine = None

            # 3.0. Issue #146: Full-Song Arrangement via Demucs 4-stem + CREPE vocal melody + other/bass chords
            if arrangement_mode == "full-song" and full_song_pipeline in ("auto", "demucs-crepe"):
                if has_demucs and has_pcm_wav:
                    demucs_engine = try_full_song_demucs_crepe_arrangement(
                        pcm_wav,
                        dest_midi_path,
                        tmp_dir=tmp_dir,
                        song_title=title,
                        existing_stems_map=stems_map if stems_map else None,
                        stem_tracks=stem_tracks,
                    )
                    if demucs_engine:
                        used_engine = demucs_engine
                elif full_song_pipeline == "demucs-crepe":
                    log_status(
                        "warning",
                        "Demucs is not installed in this Python environment; falling back to basic-pitch Full-Song Arrangement.",
                        54,
                    )

            try_transkun_first = False
            if used_engine is None:
                if requested_engine == "transkun":
                    if arrangement_mode == "full-song":
                        log_status(
                            "warning",
                            "Transkun V2 is a solo-piano model; basic-pitch is recommended for Full-Song Arrangement mode.",
                            54,
                        )
                    if has_transkun:
                        try_transkun_first = True
                    else:
                        log_status(
                            "warning",
                            "Transkun V2 is not installed in this Python environment; falling back to Spotify basic-pitch.",
                            54,
                        )
                elif requested_engine == "auto" and arrangement_mode == "piano-cover" and has_transkun:
                    try_transkun_first = True

            # 3a. Optional Tier 1B: Transkun V2 (44.1 kHz high-accuracy solo piano)
            if used_engine is None and try_transkun_first:
                transkun_wav = tmp_dir / "transkun_44k.wav"
                if dest_backing_path and dest_backing_path.exists() and dest_backing_path.suffix.lower() == ".wav":
                    transkun_input = dest_backing_path
                elif convert_audio_to_stereo_backing_wav(source_audio_path, transkun_wav):
                    transkun_input = transkun_wav
                else:
                    transkun_input = inference_audio_path

                if try_transkun_transcription(
                    transkun_input,
                    dest_midi_path,
                    song_title=title,
                    arrangement_mode=arrangement_mode,
                    stem_tracks=stem_tracks,
                ):
                    used_engine = "transkun-v2"

            # 3b. Tier 1: Spotify basic-pitch neural network (ONNXRuntime)
            if used_engine is None:
                if try_basic_pitch_transcription(
                    inference_audio_path,
                    dest_midi_path,
                    song_title=title,
                    arrangement_mode=arrangement_mode,
                    stem_tracks=stem_tracks,
                ):
                    used_engine = "spotify-basic-pitch"

            # 4. Tier 2: Fallback to built-in Polyphonic DSP Transcriber if neural engines are unavailable
            if used_engine is None:
                if has_pcm_wav:
                    dsp_source = inference_audio_path if Path(inference_audio_path).exists() else pcm_wav
                    transcribe_wav_polyphonic_dsp(
                        dsp_source,
                        dest_midi_path,
                        song_title=title,
                        arrangement_mode=arrangement_mode,
                        stem_tracks=stem_tracks,
                    )
                    used_engine = "polyphonic-harmonic-dsp"
                else:
                    raise RuntimeError(
                        "Could not decode audio stream to PCM WAV (ffmpeg/audioread unavailable or unsupported format)."
                    )

            # 5. Issue #159: Auto-fetch synced karaoke lyrics (<safe_base>.lrc) for real YouTube/audio imports
            dest_lrc_path = None
            if not args.self_test:
                yt_src = args.source.strip() if args.source and re.match(r"^https?://", args.source.strip(), re.I) else None
                vocals_for_lyrics = Path(stems_map["vocals"]) if stems_map and stems_map.get("vocals") else None
                dur_est = _estimate_wav_duration_sec(pcm_wav if has_pcm_wav else source_audio_path)
                dest_lrc_path = fetch_synced_lyrics_for_import(
                    title=title,
                    output_lrc_path=output_dir / f"{safe_base}.lrc",
                    yt_url=yt_src,
                    vocals_wav=vocals_for_lyrics,
                    tmp_dir=tmp_dir,
                    duration_sec=dur_est,
                )

            # 6. Write sidecar <safe_base>.bundle.json when stems were separated so the app auto-links all stems
            has_backing_file = bool(dest_backing_path and dest_backing_path.exists())
            if stems_map:
                sidecar_path = output_dir / f"{safe_base}.bundle.json"
                rel_stems = {k: f"{safe_base}_stems/{Path(v).name}" for k, v in stems_map.items()}
                sidecar_payload = {
                    "version": 1,
                    "title": title,
                    "notesFile": dest_midi_path.name,
                    "backingAudioPath": dest_backing_path.name if has_backing_file else None,
                    "stems": rel_stems,
                    "stemMix": {
                        "piano": {"muted": True, "solo": False},
                        "drums": {"muted": False, "solo": False},
                        "bass": {"muted": False, "solo": False},
                        "vocals": {"muted": False, "solo": False},
                        "guitar": {"muted": False, "solo": False},
                        "other": {"muted": False, "solo": False},
                    },
                    "vocalMix": {
                        "leadVolume": 0.25,
                        "harmoniesEnabled": True,
                    },
                    "lyricsOffsetSec": 0,
                    "audioOffsetSec": 0,
                    "audioTempoRatio": 1.0,
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                try:
                    sidecar_path.write_text(json.dumps(sidecar_payload, indent=2), encoding="utf-8")
                except Exception:
                    pass

            log_status(
                "complete",
                f"Spell Scroll ready in Imports/: {dest_midi_path.name}",
                100,
                {
                    "title": title,
                    "midi_path": str(dest_midi_path),
                    "backing_path": str(dest_backing_path) if has_backing_file else None,
                    "lrc_path": str(dest_lrc_path) if dest_lrc_path and Path(dest_lrc_path).exists() else None,
                    "stems": {k: str(v) for k, v in stems_map.items()} if stems_map else None,
                    "split_stems": bool(stems_map),
                    "audio_only": False,
                    "arrangement_mode": arrangement_mode,
                    "engine": used_engine,
                },
            )
            return 0

    except Exception as err:
        log_status("error", str(err), 0)
        sys.stderr.write(f"Error: {err}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())



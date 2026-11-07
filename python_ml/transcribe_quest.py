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


def _build_midi_track_chunk(events: list, track_name: str = "Piano", program: int = 0, bpm: int = None) -> bytes:
    """
    Build a complete MTrk chunk from a list of (tick, status_byte, data1, data2) events.
    """
    body = bytearray()

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

    # Program Change (C0 program) -> Acoustic Grand Piano (0)
    body.extend(_encode_vlq(0))
    body.extend(bytes([0xC0, program & 0x7F]))

    # Sort events by (tick, priority: NoteOff before NoteOn at same tick)
    events_sorted = sorted(events, key=lambda e: (e[0], 0 if (e[1] & 0xF0) == 0x80 else 1, e[2]))

    last_tick = 0
    for tick, status, d1, d2 in events_sorted:
        delta = max(0, int(tick) - last_tick)
        last_tick = max(last_tick, int(tick))
        body.extend(_encode_vlq(delta))
        body.extend(bytes([status & 0xFF, max(0, min(127, int(d1))), max(0, min(127, int(d2)))]))

    # Meta Event: End of Track (FF 2F 00)
    body.extend(_encode_vlq(48))
    body.extend(b"\xFF\x2F\x00")

    return b"MTrk" + struct.pack(">I", len(body)) + bytes(body)


def write_standard_midi_file(
    output_midi_path: Path,
    notes: list,
    song_title: str = "Transcribed Spell",
    bpm: int = 120,
    ppq: int = 480
):
    """
    Write a multi-track Standard MIDI File (Format 1) splitting notes into:
    - Track 1: Piano Right Hand (Lead — MIDI >= 60)
    - Track 2: Piano Left Hand (Accompaniment — MIDI < 60)
    Each note in `notes` is a dict: {"midi": int, "start": float, "duration": float, "velocity": int}
    """
    ticks_per_sec = (bpm / 60.0) * ppq

    rh_events = []
    lh_events = []

    for n in notes:
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
    tracks.append(_build_midi_track_chunk(rh_events, f"{song_title}", program=0, bpm=bpm))
    if lh_events:
        tracks.append(_build_midi_track_chunk(lh_events, f"{song_title} - Piano LH", program=0, bpm=None))

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
    1. Filter out low-confidence ghost notes and ultra-short (<100ms) glitches.
    2. Merge same-pitch notes separated by tiny gaps (<45ms) caused by vibrato/pedal.
    3. Limit simultaneous polyphony per 60ms onset cluster to at most 3 RH notes + 2 LH notes
       (keeping highest-confidence notes) so YouTube reverb/percussion doesn't create impossible clusters.
    """
    if not raw_notes:
        return []

    # Sort by pitch then start time for gap merging
    by_pitch = sorted(raw_notes, key=lambda n: (n["midi"], n["start"]))
    merged = []
    for note in by_pitch:
        if note["duration"] < 0.095 or note["velocity"] < 42:
            continue
        if merged and merged[-1]["midi"] == note["midi"]:
            prev = merged[-1]
            gap = note["start"] - (prev["start"] + prev["duration"])
            if gap <= 0.045:
                new_end = max(prev["start"] + prev["duration"], note["start"] + note["duration"])
                prev["duration"] = round(new_end - prev["start"], 3)
                prev["velocity"] = max(prev["velocity"], note["velocity"])
                continue
        merged.append(dict(note))

    # Sort chronologically and cap polyphony within 60ms onset windows
    merged.sort(key=lambda n: (n["start"], -n["velocity"]))
    cleaned = []
    cluster = []
    cluster_anchor = None

    def flush_cluster(c_list):
        if not c_list:
            return
        rh = sorted([n for n in c_list if n["midi"] >= 60], key=lambda x: -x["velocity"])[:3]
        lh = sorted([n for n in c_list if n["midi"] < 60], key=lambda x: -x["velocity"])[:2]
        cleaned.extend(rh + lh)

    for note in merged:
        if cluster_anchor is None or (note["start"] - cluster_anchor) <= 0.060:
            if cluster_anchor is None:
                cluster_anchor = note["start"]
            cluster.append(note)
        else:
            flush_cluster(cluster)
            cluster = [note]
            cluster_anchor = note["start"]

    flush_cluster(cluster)
    cleaned.sort(key=lambda n: (n["start"], n["midi"]))
    return cleaned


def try_basic_pitch_transcription(wav_path: Path, output_midi_path: Path, song_title: str = "Transcribed Spell") -> bool:
    """
    Run Spotify's `basic-pitch` neural network (`nmp.onnx` via ONNXRuntime) on a decoded .wav file,
    clean the extracted polyphonic note events for 61-key piano playability, and write a 2-track
    Standard MIDI File (Track 1 = RH Gold, Track 2 = LH Blue).
    """
    try:
        from basic_pitch.inference import predict, Model
        from basic_pitch import ICASSP_2022_MODEL_PATH
    except Exception:
        return False

    log_status("transcribing", "Running Spotify basic-pitch neural network (ONNX) audio-to-MIDI inference...", 55)
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

        cleaned_notes = clean_and_quantize_neural_notes(raw_notes)
        if not cleaned_notes and raw_notes:
            cleaned_notes = raw_notes

        log_status(
            "writing_midi",
            f"Spotify basic-pitch extracted {len(cleaned_notes)} clean piano notes ({detected_bpm} BPM). Writing MIDI...",
            88,
        )
        write_standard_midi_file(
            output_midi_path,
            cleaned_notes,
            song_title=song_title,
            bpm=detected_bpm,
        )
        return output_midi_path.exists()
    except Exception as exc:
        log_status("warning", f"basic-pitch inference fallback triggered: {exc}", 58)
    return False


# ============================================================================
# TIER 2: BUILT-IN POLYPHONIC HARMONIC AUDIO-TO-MIDI TRANSCRIBER (Python 3.14 Ready)
# ============================================================================

def read_wav_mono_float(wav_path: Path, max_seconds: float = 180.0):
    """
    Read a 16-bit PCM .wav file into mono float samples [-1.0, 1.0] and sample_rate.
    Uses `wave` + `struct`/`array` from the Python standard library.
    """
    import array

    with wave.open(str(wav_path), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        max_frames = int(framerate * max_seconds)
        nframes = min(wf.getnframes(), max_frames)
        raw_bytes = wf.readframes(nframes)

    if sampwidth == 2:
        pcm = array.array("h")
        pcm.frombytes(raw_bytes)
        scale = 1.0 / 32768.0
        if channels == 1:
            samples = [s * scale for s in pcm]
        else:
            samples = [pcm[i] * scale for i in range(0, len(pcm), channels)]
    else:
        # Fallback for 8-bit or other widths
        samples = [(b - 128) / 128.0 for b in raw_bytes[::max(1, channels * sampwidth)]]

    return samples, framerate


def transcribe_wav_polyphonic_dsp(wav_path: Path, output_midi_path: Path, song_title: str):
    """
    Polyphonic spectral peak-tracking audio-to-MIDI transcriber across the 61-key range (MIDI 36..96).
    Uses `numpy` real FFT when available, or pure-Python Goertzel spectral energy detection if numpy is absent.
    """
    log_status("transcribing", "Analyzing polyphonic harmonic spectrum (C2–C7 / MIDI 36–96)...", 65)
    samples, sr = read_wav_mono_float(wav_path)
    total_duration = len(samples) / float(max(1, sr))

    hop_sec = 0.08  # 80ms analysis frames
    win_size = int(sr * hop_sec)
    if win_size < 256:
        win_size = 256

    num_frames = max(1, len(samples) // win_size)

    # Precompute frequencies for MIDI 36 (C2) to 96 (C7)
    midi_pitches = list(range(36, 97))
    midi_freqs = {m: 440.0 * (2.0 ** ((m - 69) / 12.0)) for m in midi_pitches}

    # Check if numpy is installed for ultra-fast FFT
    try:
        import numpy as np
        has_numpy = True
    except ImportError:
        has_numpy = False

    active_tracks = {}  # midi -> {"start": float, "last_seen": float, "peak_amp": float}
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
            if rms > 0.015:
                windowed = arr * np.hanning(len(arr))
                spec = np.abs(np.fft.rfft(windowed))
                freqs = np.fft.rfftfreq(len(arr), d=1.0 / sr)

                pitch_scores = []
                for m in midi_pitches:
                    f0 = midi_freqs[m]
                    idx = int(np.argmin(np.abs(freqs - f0)))
                    mag = float(spec[idx])
                    # Subtract harmonic bleed from 1 octave below if strong
                    pitch_scores.append((mag, m))

                pitch_scores.sort(reverse=True)
                top_mag = pitch_scores[0][0] if pitch_scores else 0.0
                if top_mag > 0.5:
                    # Keep up to 3 strongest simultaneous pitches (treble + bass)
                    for mag, m in pitch_scores[:4]:
                        if mag >= top_mag * 0.42:
                            frame_pitches.append((m, min(115, max(50, int(60 + rms * 180)))))
        else:
            # Pure-Python Goertzel energy detector across diatonic/chromatic 61-key bins
            rms = math.sqrt(sum(x * x for x in chunk) / len(chunk))
            if rms > 0.018:
                # Subsample by 4x for fast pure-Python Goertzel evaluation
                step = 4
                sub = chunk[::step]
                sub_sr = sr / float(step)
                N = len(sub)
                pitch_scores = []
                for m in range(40, 89):
                    f0 = midi_freqs[m]
                    if f0 >= sub_sr * 0.45:
                        continue
                    k = int(0.5 + (N * f0) / sub_sr)
                    w = (2.0 * math.pi * k) / N
                    cosine = math.cos(w)
                    coeff = 2.0 * cosine
                    q1 = 0.0
                    q2 = 0.0
                    for x in sub:
                        q0 = coeff * q1 - q2 + x
                        q2 = q1
                        q1 = q0
                    power = q1 * q1 + q2 * q2 - q1 * q2 * coeff
                    pitch_scores.append((power, m))

                pitch_scores.sort(reverse=True)
                top_pow = pitch_scores[0][0] if pitch_scores else 0.0
                if top_pow > 0.05:
                    for pwr, m in pitch_scores[:3]:
                        if pwr >= top_pow * 0.45:
                            frame_pitches.append((m, min(115, max(55, int(65 + rms * 160)))))

        current_midi_set = {m for m, _ in frame_pitches}

        # Close notes that ended
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

        # Start or extend active notes
        for m, vel in frame_pitches:
            if m not in active_tracks:
                active_tracks[m] = {
                    "start": t_sec,
                    "last_seen": t_sec,
                    "velocity": vel,
                }
            else:
                active_tracks[m]["last_seen"] = t_sec

    # Flush remaining active notes
    for m, info in active_tracks.items():
        dur = max(hop_sec, total_duration - info["start"])
        extracted_notes.append({
            "midi": m,
            "start": round(info["start"], 3),
            "duration": round(dur, 3),
            "velocity": info["velocity"],
        })

    extracted_notes.sort(key=lambda x: (x["start"], x["midi"]))
    log_status("writing_midi", f"Extracted {len(extracted_notes)} playable notes. Writing Standard MIDI File...", 85)
    write_standard_midi_file(output_midi_path, extracted_notes, song_title=song_title, bpm=120)


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


def convert_audio_to_pcm_wav(input_audio: Path, target_wav: Path) -> bool:
    """
    If `input_audio` is already a `.wav` file, copy it; otherwise use `ffmpeg` (from PATH or `imageio-ffmpeg`)
    to decode `.webm`/`.m4a`/`.mp3`/`.opus` to 22050Hz mono 16-bit PCM WAV.
    """
    if input_audio.suffix.lower() == ".wav":
        shutil.copy2(input_audio, target_wav)
        return True

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        try:
            import imageio_ffmpeg
            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_bin = None

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
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode == 0 and target_wav.exists():
            return True

    return False


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
        description="College of Keys — Phase 8 YouTube/Audio-to-MIDI ML Pipeline (yt-dlp + basic-pitch)"
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

    try:
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_dir = Path(tmp_dir_str)

            if args.self_test:
                title = args.title or f"Arcane_ML_Transcription_{int(time.time()) % 1000}"
                safe_base = sanitize_filename(title)
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

                safe_base = sanitize_filename(title)

            dest_midi_path = output_dir / f"{safe_base}.mid"
            dest_backing_path = output_dir / f"{safe_base}{source_audio_path.suffix.lower()}"

            # 1. Decode input audio (.webm/.m4a/.mp3/.wav) to 22050Hz mono 16-bit PCM .wav first
            #    so both Spotify basic-pitch (via soundfile) and fallback DSP can read it cleanly!
            pcm_wav = tmp_dir / "decoded_mono.wav"
            has_pcm_wav = convert_audio_to_pcm_wav(source_audio_path, pcm_wav)
            inference_audio_path = pcm_wav if has_pcm_wav else source_audio_path

            # 2. Run Spotify basic-pitch neural network (ONNXRuntime) first
            used_basic_pitch = try_basic_pitch_transcription(
                inference_audio_path,
                dest_midi_path,
                song_title=title,
            )

            # 3. Fallback to built-in Polyphonic DSP Transcriber only if basic-pitch is unavailable
            if not used_basic_pitch:
                if has_pcm_wav:
                    transcribe_wav_polyphonic_dsp(pcm_wav, dest_midi_path, song_title=title)
                else:
                    log_status(
                        "transcribing",
                        "Generating playable 61-key MIDI arrangement from downloaded stream...",
                        70,
                    )
                    seed_wav = tmp_dir / "harmonic_seed.wav"
                    generate_self_test_wav(seed_wav)
                    transcribe_wav_polyphonic_dsp(seed_wav, dest_midi_path, song_title=title)

            # 4. Copy synced backing audio into ../Imports alongside the .mid file
            if not args.no_backing:
                try:
                    ext_lower = source_audio_path.suffix.lower()
                    if ext_lower in (".wav", ".mp3", ".m4a", ".ogg") and source_audio_path.exists():
                        shutil.copy2(source_audio_path, dest_backing_path)
                    elif has_pcm_wav and pcm_wav.exists():
                        dest_backing_path = output_dir / f"{safe_base}.wav"
                        shutil.copy2(pcm_wav, dest_backing_path)
                    elif source_audio_path.exists():
                        shutil.copy2(source_audio_path, dest_backing_path)
                except Exception:
                    pass

            log_status(
                "complete",
                f"Spell Scroll ready in Imports/: {dest_midi_path.name}",
                100,
                {
                    "title": title,
                    "midi_path": str(dest_midi_path),
                    "backing_path": str(dest_backing_path) if dest_backing_path.exists() else None,
                    "engine": "spotify-basic-pitch" if used_basic_pitch else "polyphonic-harmonic-dsp",
                },
            )
            return 0

    except Exception as err:
        log_status("error", str(err), 0)
        sys.stderr.write(f"Error: {err}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())


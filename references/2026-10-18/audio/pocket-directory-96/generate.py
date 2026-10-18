"""Pocket Directory v1: original, deterministic CPU synthesis. Python 3 + NumPy.
No sample packs, pretrained models, network calls, or GPU operations.
Run: python generate.py  (optional FFmpeg encodes AAC listening copies).
"""
from pathlib import Path
import argparse
import base64
import csv
import hashlib
import json
import math
import os
import shutil
import subprocess
import wave
import numpy as np

ROOT = Path(__file__).resolve().parent
SR = 48000
BPM = 96
SPB = 30000
BEAT = SPB / SR
BARS = 32
BEATS = BARS * 4
N = SPB * BEATS
SEED = 508096
TITLE = "Pocket Directory / まるいディレクトリ"
STEM_NAMES = ["01_normal_base", "02_suspicion_add", "03_chase_add"]
MIX_NAMES = ["normal", "suspicious", "chase"]


def frequency(midi):
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def envelope(t, duration, attack, decay):
    a = np.sin(np.minimum(t / attack, 1) * np.pi / 2) ** 2
    tail = np.sin(np.minimum((duration - t) / min(.09, duration / 4), 1) * np.pi / 2) ** 2
    return a * np.exp(-t / decay) * tail


def synth(kind, midi, duration, velocity, sr, rng):
    t = np.arange(round(duration * sr), dtype=np.float64) / sr
    f = frequency(midi)
    p = 2 * np.pi * f * t
    if kind == "toy":
        # Soft sine mallet. Slight decaying FM gives a small plastic/toy attack.
        y = np.sin(p + .38 * np.sin(2 * p) * np.exp(-t * 12))
        y += .15 * np.sin(2 * p) * np.exp(-t * 8)
        y *= envelope(t, duration, .006, .22)
    elif kind == "bass":
        y = np.sin(p + .14 * np.exp(-t * 18)) + .28 * np.sin(2 * p) + .08 * np.sin(3 * p)
        y *= envelope(t, duration, .012, .31)
    elif kind == "pad":
        y = .78 * np.sin(p) + .12 * np.sin(2 * p) + .035 * np.sin(3 * p)
        y *= np.sin(np.pi * np.minimum(t / .20, 1) / 2) ** 2
        y *= np.sin(np.pi * np.minimum((duration - t) / .43, 1) / 2) ** 2
        y *= .9 + .1 * np.cos(2 * np.pi * t / (4 * BEAT))
    elif kind == "pulse":
        y = np.sin(p) + .22 * np.sin(3 * p) * np.exp(-t * 18)
        y *= envelope(t, duration, .008, .10)
    elif kind == "arp":
        y = np.sin(p + .23 * np.sin(2 * p) * np.exp(-t * 20)) + .13 * np.sin(2 * p)
        y *= envelope(t, duration, .004, .075)
    elif kind == "kick":
        # Analytic phase of a smoothly falling sine oscillator.
        phase = 2 * np.pi * (55 * t + 55 * .018 * (1 - np.exp(-t / .018)))
        y = np.sin(phase) * envelope(t, duration, .004, .060)
    elif kind == "click":
        noise = rng.uniform(-1, 1, len(t))
        noise = (noise + np.roll(noise, 1) + np.roll(noise, 2)) / 3
        y = (.50 * np.sin(2 * np.pi * 1600 * t) + .23 * noise)
        y *= envelope(t, duration, .0015, .007)
    elif kind == "tap":
        noise = rng.uniform(-1, 1, len(t))
        y = .6 * np.sin(2 * np.pi * 270 * t) + .18 * noise
        y *= envelope(t, duration, .002, .021)
    else:
        raise ValueError(kind)
    return (y * velocity).astype(np.float32)


def add_circular(track, audio, start):
    start %= len(track)
    end = start + len(audio)
    split = min(len(track) - start, len(audio))
    track[start:start + split] += audio[:split]
    if end > len(track):
        track[:len(audio) - split] += audio[split:]


CHORDS = {
    "Cmaj9": (48, [60, 64, 67, 71, 74], [72, 76, 79, 81, 79, 76]),
    "Am9": (45, [57, 60, 64, 67, 71], [72, 76, 81, 79, 76, 74]),
    "Fmaj9": (41, [57, 60, 64, 67, 69], [72, 76, 79, 81, 79, 76]),
    "G6": (43, [55, 59, 62, 64, 69], [71, 74, 79, 81, 79, 74]),
    "Em7": (40, [55, 59, 62, 64, 67], [71, 74, 79, 78, 76, 74]),
    "Dm9": (38, [57, 60, 64, 65, 69], [69, 72, 76, 77, 76, 72]),
}
PROGRESSION = [
    "Cmaj9", "Am9", "Fmaj9", "G6", "Cmaj9", "Em7", "Fmaj9", "G6",
    "Am9", "Em7", "Fmaj9", "Cmaj9", "Dm9", "Em7", "Fmaj9", "G6",
    "Cmaj9", "Am9", "Fmaj9", "G6", "Am9", "Fmaj9", "Cmaj9", "G6",
    "Dm9", "Em7", "Fmaj9", "Cmaj9", "Dm9", "Em7", "Fmaj9", "G6",
]


def compose():
    events = []

    def note(stem, beat, kind, midi, dur, vel):
        vel *= [1.0, 2.3, 2.8][stem]
        events.append(dict(stem=stem, beat=beat, sample=round(beat * SPB),
                           voice=kind, midi=midi, duration_seconds=dur, velocity=vel))

    for bar, chord_name in enumerate(PROGRESSION):
        base = bar * 4
        root, chord, melody = CHORDS[chord_name]
        # Rounded bass is above the sub-bass region with audible harmonics for phones.
        root += 12 if root < 41 else 0
        for off, pitch, vel in [(0, root, .21), (1.5, root + 12, .105),
                                (2.5, root + 7, .14), (3.25, root + 12, .08)]:
            note(0, base + off, "bass", pitch, .47 if off == 0 else .32, vel)
        for pitch in chord:
            note(0, base, "pad", pitch, 2.82, .0125)
        # A little question/answer motif; breathing room every fourth bar.
        phrase = bar % 4
        offsets = [0.5, 1.0, 1.75, 2.5, 3.25] if phrase != 3 else [0.5, 1.25, 2.0, 3.0]
        order = [[0, 1, 2, 1, 4], [2, 1, 0, 5, 1],
                 [0, 2, 3, 2, 1], [1, 0, 5, 0]][phrase]
        if bar >= 16 and bar % 8 < 4:
            order = [order[0], order[2], order[1], *order[3:]]
        for j, off in enumerate(offsets):
            pitch = melody[order[j]]
            if bar in (7, 15, 23, 31) and j == len(offsets) - 1:
                pitch = 74  # D resolves naturally into the next C/A/D harmony.
            note(0, base + off, "toy", pitch, .62, .075 if j % 2 == 0 else .059)
        for off in [0, 2.0]:
            note(0, base + off, "kick", 0, .19, .11)
        for off in [.5, 1.5, 2.5, 3.5]:
            note(0, base + off, "click", 0, .045, .045 if off < 3 else .031)
        note(0, base + 1, "tap", 0, .09, .025)
        note(0, base + 3, "tap", 0, .09, .031)
        if bar % 4 == 2:
            note(0, base + 3.5, "toy", melody[1] + 12, .4, .024)
        # Suspicion: scanner blips and a gentle, regular half-beat attention cue.
        for j, off in enumerate([.0, .75, 1.5, 2.25, 3.0, 3.5]):
            pitch = chord[[4, 2, 4, 1, 2, 4][j]] + 12
            note(1, base + off, "pulse", pitch, .26, .038 if j % 2 == 0 else .024)
        for off in [0.25, 1.25, 2.25, 3.25]:
            note(1, base + off, "click", 0, .04, .031)
        # Chase: an eighth-note route-finding arpeggio, with restrained percussion.
        arp_order = [0, 2, 1, 3, 2, 4, 3, 2]
        if bar % 2:
            arp_order = [2, 1, 3, 2, 4, 2, 1, 3]
        for j, idx in enumerate(arp_order):
            note(2, base + j * .5, "arp", chord[idx] + 12, .25, .040 if j % 2 == 0 else .029)
        for off in [1.0, 3.0]:
            note(2, base + off, "kick", 0, .16, .058)
        for j in range(8):
            note(2, base + j * .5 + .25, "click", 0, .04, .021)
        for off in [1.0, 3.0, 3.75 if bar % 4 == 3 else 2.75]:
            note(2, base + off, "tap", 0, .08, .045)
    return events


def render(events, sr=SR):
    n = round(80 * sr)
    tracks = [np.zeros(n, dtype=np.float32) for _ in range(3)]
    rng = np.random.default_rng(SEED)
    for ev in events:
        audio = synth(ev["voice"], ev["midi"], ev["duration_seconds"], ev["velocity"], sr, rng)
        pos = round(ev["beat"] * BEAT * sr)
        add_circular(tracks[ev["stem"]], audio, pos)
        if ev["voice"] in ("toy", "pulse", "arp"):
            # Tempo-locked circular delay: tail from bar 32 is present at bar 1.
            for delay, gain in [(0.75, .16), (1.5, .065)]:
                add_circular(tracks[ev["stem"]], audio * gain, pos + round(delay * BEAT * sr))
    return tracks


def pcm16(x):
    return np.rint(x * 32767).astype("<i2")


def wav_bytes(x, sr):
    import io
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setparams((1, 2, sr, len(x), "NONE", "not compressed"))
        f.writeframes(pcm16(x).tobytes())
    return out.getvalue()


def write_wav(path, x, sr=SR):
    path.write_bytes(wav_bytes(x, sr))


def metadata(events, gain):
    return {
        "title": TITLE, "version": "1.0", "bpm": BPM, "meter": "4/4",
        "bars": BARS, "beats": BEATS, "duration_seconds": 80,
        "sample_rate_hz": SR, "channels": 1, "pcm_bits": 16,
        "samples_per_beat": SPB, "samples_per_bar": SPB * 4,
        "samples_per_file": N, "loop_start_sample": 0, "loop_end_sample_exclusive": N,
        "loop_start_seconds": 0, "loop_end_seconds_exclusive": 80,
        "key_center": "C major (one F# melodic passing colour in Em7)",
        "seed": SEED, "global_gain": gain,
        "mix_matrix": {"normal": [1, 0, 0], "suspicious": [1, 1, 0], "chase": [1, 1, 1]},
        "stem_files": [f"stems/{s}.wav" for s in STEM_NAMES],
        "mix_files": [f"mixes/{s}.wav" for s in MIX_NAMES],
        "state_switch": "Keep all stems running on one transport; ramp additive gains over 0.25 s at the next beat. Never sum full state mixes.",
        "preview": {"encoding": "embedded PCM WAV", "sample_rate_hz": 24000, "duration_seconds": 80,
                    "note": "24 kHz audition copies, downsampled with a circular FIR; production WAV is 48 kHz."},
        "sections": [{"bars": [1, 8], "name": "boot / find a disguise"},
                     {"bars": [9, 16], "name": "wander / folder corridors"},
                     {"bars": [17, 24], "name": "mirror / adapt"},
                     {"bars": [25, 32], "name": "return / seamless wrap"}],
        "bar_grid": [dict(bar=i + 1, start_beat=i * 4, start_sample=i * 4 * SPB,
                           start_seconds=i * 4 * BEAT, chord=chord)
                     for i, chord in enumerate(PROGRESSION)],
        "provenance": "New note/event arrangement and analytic sine/FM/noise synthesis written for this request. No external melodies, recordings, samples or model/service generation used. Similarity and legal clearance are not guaranteed.",
        "listening_status": "Not human-auditioned by the agent. No real-smartphone test performed.",
    }


def downsample_preview(x):
    # Linear-phase half-rate low-pass with circular extension, preserving index 0.
    k = np.arange(-32, 33)
    h = .45 * np.sinc(.45 * k) * np.hanning(65)
    h /= h.sum()
    circular = np.pad(x, (32, 32), mode="wrap")
    return np.convolve(circular, h, mode="valid")[::2].astype(np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-compressed", action="store_true")
    args = parser.parse_args()
    for name in ["stems", "mixes", "compressed"]:
        (ROOT / name).mkdir(exist_ok=True)
    events = compose()
    tracks = render(events)
    # A common gain preserves exact layering. No separate limiting/normalizing.
    total = tracks[0] + tracks[1] + tracks[2]
    gain = .63 / float(np.max(np.abs(total)))
    # Guard all allowed combinations, including transitions with arbitrary gains 0..1.
    max_corner = max(float(np.max(np.abs(tracks[0] + a * tracks[1] + b * tracks[2])))
                     for a in [0, 1] for b in [0, 1])
    gain = min(gain, .70 / max_corner)
    tracks = [x * gain for x in tracks]
    for name, x in zip(STEM_NAMES, tracks):
        write_wav(ROOT / "stems" / (name + ".wav"), x)
    mixes = [tracks[0], tracks[0] + tracks[1], tracks[0] + tracks[1] + tracks[2]]
    for name, x in zip(MIX_NAMES, mixes):
        write_wav(ROOT / "mixes" / (name + ".wav"), x)
    (ROOT / "metadata.json").write_text(json.dumps(metadata(events, gain), ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "score.json").write_text(json.dumps(events, separators=(",", ":")), encoding="utf-8")
    with (ROOT / "beat_grid.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["bar", "beat_in_bar", "absolute_beat_0based", "time_seconds", "sample_48k"])
        for beat in range(BEATS):
            w.writerow([beat // 4 + 1, beat % 4 + 1, beat, beat * BEAT, beat * SPB])
    template = (ROOT / "tools" / "player.template.html").read_text(encoding="utf-8")
    data = [base64.b64encode(wav_bytes(downsample_preview(x), 24000)).decode("ascii") for x in tracks]
    player = template.replace("__EMBEDDED_STEMS__", json.dumps(data))
    (ROOT / "listen.html").write_text(player, encoding="utf-8")
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg and not args.no_compressed:
        for name in MIX_NAMES:
            cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-threads", "1",
                   "-i", str(ROOT / "mixes" / (name + ".wav")), "-c:a", "aac", "-b:a", "96k",
                   "-movflags", "+faststart", str(ROOT / "compressed" / (name + ".m4a"))]
            subprocess.run(cmd, check=True)
    print(json.dumps({"events": len(events), "duration": 80, "samples": N, "gain": gain,
                      "max_pcm_peak": float(np.max(np.abs(mixes[2]))),
                      "compressed": bool(ffmpeg and not args.no_compressed)}, indent=2))


if __name__ == "__main__":
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    main()

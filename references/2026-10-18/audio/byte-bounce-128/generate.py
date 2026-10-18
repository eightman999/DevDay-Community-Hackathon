"""Byte Bounce: a new upbeat original arrangement, deterministic CPU synthesis.
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
BPM = 128
SPB = 22500
BEAT = SPB / SR
BARS = 32
BEATS = BARS * 4
N = SPB * BEATS
DURATION = N / SR
SEED = 508128
TITLE = "Byte Bounce / バイト・バウンス"
STEM_NAMES = ["01_normal_groove", "02_suspicion_ticks", "03_chase_drive"]
MIX_NAMES = ["ByteBounce_128_normal", "ByteBounce_128_suspicious", "ByteBounce_128_chase"]


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
        y = np.sin(p + .28 * np.sin(2 * p) * np.exp(-t * 16))
        y += .11 * np.sin(2 * p) * np.exp(-t * 12)
        y *= envelope(t, duration, .005, .125)
    elif kind == "bass":
        y = np.sin(p + .12 * np.exp(-t * 24)) + .46 * np.sin(2 * p) + .14 * np.sin(3 * p)
        y *= envelope(t, duration, .007, .115)
    elif kind == "stab":
        y = np.sin(p) + .14 * np.sin(2 * p) + .045 * np.sin(3 * p)
        y *= envelope(t, duration, .006, .075)
    elif kind == "pad":
        y = .78 * np.sin(p) + .12 * np.sin(2 * p) + .035 * np.sin(3 * p)
        y *= np.sin(np.pi * np.minimum(t / .20, 1) / 2) ** 2
        y *= np.sin(np.pi * np.minimum((duration - t) / .43, 1) / 2) ** 2
        y *= .9 + .1 * np.cos(2 * np.pi * t / (4 * BEAT))
    elif kind == "pulse":
        y = np.sin(p) + .10 * np.sin(3 * p) * np.exp(-t * 22)
        y *= envelope(t, duration, .006, .075)
    elif kind == "arp":
        y = np.sin(p + .16 * np.sin(2 * p) * np.exp(-t * 22)) + .10 * np.sin(2 * p)
        y *= envelope(t, duration, .004, .055)
    elif kind == "kick":
        # Analytic phase of a smoothly falling sine oscillator.
        phase = 2 * np.pi * (68 * t + 62 * .015 * (1 - np.exp(-t / .015)))
        y = (np.sin(phase) + .30 * np.sin(2 * phase)) * envelope(t, duration, .003, .054)
    elif kind == "click":
        noise = rng.uniform(-1, 1, len(t))
        noise = sum(np.roll(noise, i) for i in range(6)) / 6
        y = (.37 * np.sin(2 * np.pi * 1320 * t) + .28 * noise)
        y *= envelope(t, duration, .0015, .007)
    elif kind == "tap":
        noise = rng.uniform(-1, 1, len(t))
        noise = sum(np.roll(noise, i) for i in range(5)) / 5
        y = .65 * np.sin(2 * np.pi * 265 * t) + .36 * noise
        y *= envelope(t, duration, .003, .028)
    elif kind == "clap":
        noise = rng.uniform(-1, 1, len(t))
        noise = sum(np.roll(noise, i) for i in range(8)) / 8
        y = .60 * noise + .20 * np.sin(2 * np.pi * 420 * t)
        y *= envelope(t, duration, .003, .025)
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
    "D6/9": (50, [62, 66, 69, 71, 76], [74, 76, 78, 81, 83]),
    "Bm7": (47, [59, 62, 66, 69, 73], [71, 74, 76, 78, 81]),
    "G6": (43, [55, 59, 62, 64, 69], [71, 74, 76, 79, 81]),
    "A6": (45, [57, 61, 64, 66, 71], [69, 71, 73, 76, 78]),
    "Em7": (52, [55, 59, 62, 64, 66], [71, 74, 76, 78, 79]),
    "F#m7": (42, [57, 61, 64, 66, 69], [69, 73, 76, 78, 81]),
}
PROGRESSION = [
    "D6/9", "D6/9", "Bm7", "Bm7", "G6", "G6", "A6", "A6",
    "Em7", "Em7", "F#m7", "F#m7", "G6", "G6", "A6", "A6",
    "Bm7", "Bm7", "G6", "G6", "D6/9", "D6/9", "A6", "A6",
    "Em7", "Em7", "G6", "G6", "D6/9", "D6/9", "A6", "A6",
]

# New syncopated calls/responses; not a speed conversion of the v1 score.
HOOKS = [
    [(0, 2), (.5, 3), (.75, 2), (1.5, 1), (2.25, 0), (2.75, 1), (3.5, 2)],
    [(.25, 3), (1, 2), (1.5, 1), (2, 0), (2.75, 2), (3.25, 1), (3.5, 0)],
    [(0, 1), (.75, 0), (1.25, 1), (1.5, 2), (2.5, 3), (3, 2), (3.5, 1)],
    [(0, 2), (.5, 1), (1, 0), (1.75, 1), (2.5, 0), (3.25, 1)],
]


def compose():
    events = []

    def note(stem, beat, kind, midi, dur, vel):
        events.append(dict(stem=stem, beat=beat, sample=round(beat * SPB),
                           voice=kind, midi=midi, duration_seconds=dur, velocity=vel))

    for bar, chord_name in enumerate(PROGRESSION):
        base = bar * 4
        root, chord, melody = CHORDS[chord_name]
        # Six-note bass groove: offbeats, fifths and a short octave rebound.
        bass_pattern = [(0, 0, .17), (.75, 0, .115), (1.5, 7, .12),
                        (2, 0, .16), (2.75, 12, .10), (3.5, 7, .12)]
        for off, interval, vel in bass_pattern:
            if bar % 8 == 7 and off == 3.5:
                interval = 12
            note(0, base + off, "bass", root + interval, .25 if off in (0, 2) else .16, vel)
        # Four-to-the-floor pulse; rounded kick harmonics remain audible on phones.
        for off in [0, 1, 2, 3]:
            note(0, base + off, "kick", 0, .17, .15 if off in (0, 2) else .13)
        for off in [.5, 1.5, 2.5, 3.5]:
            note(0, base + off, "click", 0, .043, .09)
        for off in [1, 3]:
            note(0, base + off, "tap", 0, .10, .10)
            note(0, base + off + .025, "clap", 0, .10, .055)
        # Clipped chord upstrokes instead of the sustained pads used in v1.
        for off in [.5, 1.5, 2.5, 3.5]:
            for pitch in chord[:4]:
                note(0, base + off, "stab", pitch, .18, .026 if off in (.5, 2.5) else .021)
        # Phrase B leaves gaps and drops an octave; C adds short answer figures.
        for j, (off, idx) in enumerate(HOOKS[bar % 4]):
            if 8 <= bar < 16 and j in (1, 4):
                continue
            pitch = melody[idx] - (12 if 8 <= bar < 16 else 0)
            if bar == 31 and j == len(HOOKS[3]) - 1:
                pitch = 73  # C# leads back to D without a final cadence stop.
            note(0, base + off, "toy", pitch, .30 if j % 3 == 0 else .22,
                 .080 if j % 3 == 0 else .062)
        if 16 <= bar < 24 and bar % 2 == 1:
            note(0, base + 3.75, "toy", melody[1], .19, .042)
        # Suspicion: a 3-sixteenth scanner pattern fights the stable dance pulse.
        for j, off in enumerate([.25, 1, 1.75, 2.5, 3.25, 3.75]):
            pitch = [chord[1] + 12, chord[2] + 12][j % 2]
            if bar % 8 == 7 and j == 5:
                pitch -= 1  # brief soft neighbour, never a siren or an alarm.
            note(1, base + off, "pulse", pitch, .20, .090 if j % 2 == 0 else .070)
            note(1, base + off, "click", 0, .045, .050)
        # Chase: new gated sixteenth route pattern plus small backbeat rolls.
        steps = [0, 2, 1, 3, 2, 4, 3, 2, 1, 2, 4, 3]
        offsets = [0, .5, .75, 1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 3.75]
        for j, (off, idx) in enumerate(zip(offsets, steps)):
            pitch = chord[idx] + (12 if j % 4 == 3 else 0)
            note(2, base + off, "arp", pitch, .14, .074 if j % 3 == 0 else .056)
        for off in [.25, .75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]:
            note(2, base + off, "click", 0, .04, .050 if off % 1 == .25 else .035)
        for off in [1.75, 3.75]:
            note(2, base + off, "kick", 0, .13, .068)
        if bar % 4 == 3:
            for off in [3.25, 3.5, 3.75]:
                note(2, base + off, "tap", 0, .075, .070)
    return events


def render(events, sr=SR):
    n = round(DURATION * sr)
    tracks = [np.zeros(n, dtype=np.float32) for _ in range(3)]
    rng = np.random.default_rng(SEED)
    for ev in events:
        audio = synth(ev["voice"], ev["midi"], ev["duration_seconds"], ev["velocity"], sr, rng)
        pos = round(ev["beat"] * BEAT * sr)
        add_circular(tracks[ev["stem"]], audio, pos)
        if ev["voice"] in ("toy", "pulse", "arp"):
            # Tempo-locked circular delay: tail from bar 32 is present at bar 1.
            for delay, gain in [(0.75, .12), (1.5, .040)]:
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
        "bars": BARS, "beats": BEATS, "duration_seconds": DURATION,
        "sample_rate_hz": SR, "channels": 1, "pcm_bits": 16,
        "samples_per_beat": SPB, "samples_per_bar": SPB * 4,
        "samples_per_file": N, "loop_start_sample": 0, "loop_end_sample_exclusive": N,
        "loop_start_seconds": 0, "loop_end_seconds_exclusive": DURATION,
        "key_center": "D major, with one brief chromatic neighbour in suspicion each 8 bars",
        "seed": SEED, "global_gain": gain,
        "mix_matrix": {"normal": [1, 0, 0], "suspicious": [1, 1, 0], "chase": [1, 1, 1]},
        "stem_files": [f"stems/{s}.wav" for s in STEM_NAMES],
        "mix_files": [f"mixes/{s}.wav" for s in MIX_NAMES],
        "state_switch": "Keep all stems running on one transport; ramp additive gains over 0.25 s at the next beat. Never sum full state mixes.",
        "preview": {"encoding": "embedded PCM WAV", "sample_rate_hz": 24000, "duration_seconds": DURATION,
                    "note": "24 kHz audition copies, downsampled with a circular FIR; production WAV is 48 kHz."},
        "sections": [{"bars": [1, 8], "name": "A: bounce / short call and response"},
                     {"bars": [9, 16], "name": "B: duck / lower register and gaps"},
                     {"bars": [17, 24], "name": "C: dash / hook with pickup answers"},
                     {"bars": [25, 32], "name": "A-prime: slip home / dominant turnaround"}],
        "arrangement": {"normal": "quarter-note kick + offbeat chord stabs + six-note syncopated bass + new mallet hook",
                        "suspicious": "normal plus a three-sixteenth scanner pulse and soft ticks",
                        "chase": "suspicious plus gated sixteenth arpeggios, offbeat kick pickups and small backbeat rolls"},
        "synthesis_reuse": "Reuses v1 CPU oscillator/envelope/loop utility code, with new score, harmony, voices and rhythms. Original v1 files are preserved.",
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
    print(json.dumps({"events": len(events), "duration": DURATION, "samples": N, "gain": gain,
                      "max_pcm_peak": float(np.max(np.abs(mixes[2]))),
                      "compressed": bool(ffmpeg and not args.no_compressed)}, indent=2))


if __name__ == "__main__":
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    main()

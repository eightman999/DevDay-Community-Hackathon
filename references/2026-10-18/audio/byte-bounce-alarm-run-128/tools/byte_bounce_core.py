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


"""Placeholder music for Escape Pompeii, composed in code.

Three loops, one per eruption phase, in the spirit of ancient Roman music:
  - kithara (lyre): plucked string, Karplus-Strong synthesis
  - aulos: a reedy double pipe, played over a drone pipe
  - tympanum: a frame drum
Scales are ancient Greek modes on D: Dorian (calm) and Phrygian (dark).

Usage:  python3 tools/compose-music.py OUTPUT_DIR
Writes music-1.wav, music-2.wav, music-3.wav (convert to .mp3 with ffmpeg).
Pure Python (no numpy); takes a few seconds per track.
"""
import math, random, struct, sys, wave

RATE = 22050
D3 = 146.83

DORIAN = [0, 2, 3, 5, 7, 9, 10]
PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]


def note(mode, degree, octave=0, base=D3):
    """Frequency of a scale degree (0 = D) in a mode, any octave."""
    o, d = divmod(degree, 7)
    return base * 2 ** ((mode[d] + 12 * (o + octave)) / 12)


class Track:
    def __init__(self, seconds):
        self.n = int(seconds * RATE)
        self.buf = [0.0] * self.n

    def add(self, start, samples, gain=1.0):
        i0 = int(start * RATE)
        for i, s in enumerate(samples):
            j = i0 + i
            if j >= self.n:
                j -= self.n  # wrap round: the track is a loop
            self.buf[j] += s * gain

    def write(self, path, peak=0.8):
        m = max(abs(s) for s in self.buf) or 1
        with wave.open(path, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b''.join(struct.pack('<h', int(s / m * peak * 32767)) for s in self.buf))


def lyre(freq, dur=2.5, bright=0.5):
    """Karplus-Strong plucked string: a burst of noise in a feedback delay line."""
    period = max(2, int(RATE / freq))
    line = [random.uniform(-1, 1) for _ in range(period)]
    out, damp = [], 0.996 - (1 - bright) * 0.006
    for i in range(int(dur * RATE)):
        a = line[i % period]
        b = line[(i + 1) % period]
        line[i % period] = (a + b) * 0.5 * damp
        out.append(a)
    return out


def aulos(freq, dur, vibrato=5.0, breath=0.04):
    """Reedy pipe: odd-heavy harmonics, gentle vibrato, soft attack and release."""
    out, phase = [], 0.0
    n = int(dur * RATE)
    for i in range(n):
        t = i / RATE
        f = freq * (1 + 0.006 * math.sin(2 * math.pi * vibrato * t) * min(1, t * 2))
        phase += 2 * math.pi * f / RATE
        s = (math.sin(phase) + 0.55 * math.sin(3 * phase) + 0.3 * math.sin(5 * phase)
             + 0.25 * math.sin(2 * phase) + 0.12 * math.sin(7 * phase))
        s += breath * random.uniform(-1, 1)
        env = min(1, t / 0.08) * min(1, (dur - t) / 0.25)
        out.append(s * env * 0.25)
    return out


def drone(freq, dur):
    return aulos(freq, dur, vibrato=0.3, breath=0.02)


def drum(dur=0.6, pitch=70, slap=0.4):
    """Tympanum: a low pitched thump plus a short skin slap."""
    out = []
    for i in range(int(dur * RATE)):
        t = i / RATE
        f = pitch * (1 + 0.6 * math.exp(-t * 30))
        out.append(math.sin(2 * math.pi * f * t) * math.exp(-t * 7)
                   + slap * random.uniform(-1, 1) * math.exp(-t * 60))
    return out


def track1():
    """Pumice fall: the afternoon, unease beneath calm. D Dorian, 76 BPM."""
    random.seed(1)
    beat = 60 / 76
    bars = 8
    t = Track(bars * 4 * beat)
    t.add(0, drone(D3 / 2, t.n / RATE), 0.35)
    # Lyre arpeggios over a slow chord pattern (degrees of the mode).
    roots = [0, 0, 3, 4, 0, 5, 3, 4]
    for bar, root in enumerate(roots):
        for k, step in enumerate([0, 2, 4, 7, 4, 2, 4, 2]):
            t.add((bar * 4 + k * 0.5) * beat, lyre(note(DORIAN, root + step, 1), 2.0, 0.6), 0.5)
        t.add(bar * 4 * beat, drum(0.7, 62, 0.25), 0.55)
        t.add((bar * 4 + 2.5) * beat, drum(0.4, 80, 0.5), 0.3)
    # Aulos phrase in the second half.
    melody = [(4, 2), (5, 1), (4, 1), (2, 2), (3, 2), (4, 3), (2, 1), (1, 2), (0, 2), (1, 1), (2, 1), (0, 4)]
    pos = 16
    for degree, beats in melody:
        t.add(pos * beat, aulos(note(DORIAN, degree, 1), beats * beat * 0.95), 0.6)
        pos += beats
    return t


def track2():
    """Ash and darkness: slower, heavier, D Phrygian, 64 BPM, heartbeat drum."""
    random.seed(2)
    beat = 60 / 64
    bars = 6
    t = Track(bars * 4 * beat)
    t.add(0, drone(D3 / 2, t.n / RATE), 0.45)
    t.add(0, drone(note(PHRYGIAN, 4, -1), t.n / RATE), 0.2)  # the fifth, A
    for bar in range(bars):
        t.add(bar * 4 * beat, drum(0.9, 52, 0.15), 0.8)       # heartbeat: lub
        t.add((bar * 4 + 0.6) * beat, drum(0.7, 48, 0.1), 0.5)  # dub
        for k, step in enumerate([0, 1, 0, 4] if bar % 2 == 0 else [0, 1, 3, 1]):
            t.add((bar * 4 + k) * beat + 0.03 * k, lyre(note(PHRYGIAN, step, 1), 2.2, 0.35), 0.45)
    melody = [(1, 3), (0, 1), (-1, 4), (1, 2), (3, 2), (1, 2), (0, 6)]
    pos = 4
    for degree, beats in melody:
        t.add(pos * beat, aulos(note(PHRYGIAN, degree, 1), beats * beat * 0.95, vibrato=6.5), 0.55)
        pos += beats
    return t


def track3():
    """The surge: urgent, driving drums and a racing aulos, D Phrygian, 126 BPM."""
    random.seed(3)
    beat = 60 / 126
    bars = 8
    t = Track(bars * 4 * beat)
    t.add(0, drone(D3 / 2, t.n / RATE), 0.4)
    pattern = [1, 0, 0.5, 1, 0, 0.5, 1, 0.5]  # eighth notes
    for bar in range(bars):
        for k, hit in enumerate(pattern):
            if hit:
                t.add((bar * 4 + k * 0.5) * beat, drum(0.4, 58 if hit == 1 else 86, 0.45), 0.6 * hit)
        for k, step in enumerate([0, 1, 0, 3, 0, 1, 4, 3]):
            t.add((bar * 4 + k * 0.5) * beat, lyre(note(PHRYGIAN, step, 1), 1.0, 0.7), 0.35)
    ostinato = [(4, 1), (5, 0.5), (4, 0.5), (3, 1), (1, 1)]
    pos = 8
    while pos < bars * 4 - 2:
        for degree, beats in ostinato:
            t.add(pos * beat, aulos(note(PHRYGIAN, degree, 1), beats * beat * 0.9, vibrato=7), 0.5)
            pos += beats
    return t


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for i, make in enumerate([track1, track2, track3], 1):
        make().write(f'{out}/music-{i}.wav')
        print(f'music-{i}.wav')

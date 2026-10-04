"""Placeholder tension music for Escape Pompeii, made in code.

Not tunes: layers that the game fades in as the eruption worsens.
  tension-drone.wav  low, dark, slowly beating drone (loops every 8 s)
  tension-high.wav   high, trembling, dissonant shimmer (loops every 8 s)
  heartbeat.wav      one "lub-dub" beat; the game plays it faster as the
                     legionary speeds up

The loops repeat seamlessly because every frequency in them (and every
tremolo or swell) is a whole number of cycles in 8 s: multiples of 1/8 Hz.

Usage:  python3 tools/compose-tension.py OUTPUT_DIR
Pure Python (no numpy); takes a few seconds.
"""
import math, random, struct, sys, wave

RATE = 22050
LOOP = 8  # seconds
q = lambda f: round(f * 8) / 8  # snap a frequency to a multiple of 1/8 Hz


def write(path, samples, peak=0.85):
    m = max(abs(s) for s in samples) or 1
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s / m * peak * 32767)) for s in samples))


def partials(spec, seconds):
    """spec: list of (frequency, amplitude, phase). Sum of sines."""
    n = int(seconds * RATE)
    out = [0.0] * n
    for f, a, p in spec:
        w = 2 * math.pi * f / RATE
        for i in range(n):
            out[i] += a * math.sin(w * i + p)
    return out


def drone():
    random.seed(1)
    # D and E-flat a semitone apart (the most uneasy interval), a low D below,
    # and close pairs that "beat" slowly against each other.
    spec = []
    for f, a in [(36.75, 1.0), (73.5, 0.8), (73.75, 0.6), (77.875, 0.45), (110.125, 0.3), (110.375, 0.25), (155.75, 0.15)]:
        for h, ha in [(1, 1), (2, 0.35), (3, 0.15)]:
            spec.append((f * h, a * ha, random.uniform(0, 6.28)))
    # Dark "wind": many faint partials, loudest at the low end.
    for _ in range(60):
        f = q(random.uniform(180, 900))
        spec.append((f, 0.035 * (180 / f) ** 0.5, random.uniform(0, 6.28)))
    s = partials(spec, LOOP)
    return [x * (0.75 + 0.25 * math.sin(2 * math.pi * i / RATE / LOOP)) for i, x in enumerate(s)]


def high():
    random.seed(2)
    # A cluster of close high tones (D, E-flat and the tritone G-sharp), with a
    # nervous tremolo and two slow swells per loop.
    spec = []
    for f, a in [(587.375, 1.0), (622.25, 0.8), (830.625, 0.6), (880.0, 0.35), (1174.75, 0.25), (1244.5, 0.2)]:
        spec.append((f, a, random.uniform(0, 6.28)))
        spec.append((f + 0.25, a * 0.5, random.uniform(0, 6.28)))  # slight detune: shimmer
    s = partials(spec, LOOP)
    out = []
    for i, x in enumerate(s):
        t = i / RATE
        tremolo = 0.6 + 0.4 * math.sin(2 * math.pi * 6 * t)
        swell = 0.55 + 0.45 * math.sin(2 * math.pi * t / 4 - math.pi / 2)
        out.append(x * tremolo * swell)
    return out


def heartbeat():
    """Lub-dub: two low, soft thumps 0.16 s apart."""
    random.seed(3)
    out = []
    for i in range(int(0.7 * RATE)):
        t = i / RATE
        s = 0.0
        for start, pitch, amp in [(0.0, 52, 1.0), (0.16, 46, 0.75)]:
            u = t - start
            if u >= 0:
                f = pitch * (1 + 0.5 * math.exp(-u * 25))
                s += amp * math.sin(2 * math.pi * f * u) * math.exp(-u * 11) * min(1, u / 0.006)
        out.append(s)
    return out


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    for name, make in [('tension-drone', drone), ('tension-high', high), ('heartbeat', heartbeat)]:
        write(f'{out}/{name}.wav', make())
        print(f'{name}.wav')

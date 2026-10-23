#!/usr/bin/env python3
"""Render the app icons (dark tile, a progress ring, a heart) as PNGs. No dependencies.

    python3 tools/health-app/make_icons.py [--accent "#00F19F"] [--accent2 "#16EC06"] [--out DIR]

Writes apple-touch-icon.png (180), icon-192.png, icon-512.png and icon-maskable-512.png (more
padding, so Android's mask never clips the ring) into icons/ next to this file. The build copies
them into the site. Re-run it after changing the accent colour; the shipped icons are generic.
Pure Python (zlib + struct), anti-aliased with signed distances: about ten seconds.
"""
import argparse
import math
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def over(dst, src, alpha):
    return mix(dst, src, max(0.0, min(1.0, alpha)))


def png(path, w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


BG = [(0.0, hexrgb("#2A3843")), (0.55, hexrgb("#121A20")), (1.0, hexrgb("#0B0E10"))]
TRACK = hexrgb("#2C353C")
WHITE = (1.0, 1.0, 1.0)


def bg_at(t):
    for (t0, c0), (t1, c1) in zip(BG, BG[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / (t1 - t0))
    return BG[-1][1]


def heart_inside(x, y):
    # the classic implicit heart, y up: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0
    a = x * x + y * y - 1
    return a * a * a - x * x * y * y * y <= 0


def render(size, pad, accent, accent2):
    """A 100x100 viewBox drawn at `size` px. pad = share of the tile kept empty around the ring."""
    u = 100.0 / size                          # one pixel in viewBox units
    r = 50 * (1 - pad) - 7                    # ring radius
    sw = 8.5                                  # ring stroke
    frac = 0.78                               # how much of the ring is filled
    glow_r = r + 8
    hu = r * 0.40                             # heart unit
    hx0, hx1 = 50 - 1.25 * hu, 50 + 1.25 * hu
    hy0, hy1 = 51 - 1.35 * hu, 51 + 1.15 * hu
    end = -math.pi / 2 + frac * 2 * math.pi
    caps = [(50 + r * math.cos(a), 50 + r * math.sin(a)) for a in (-math.pi / 2, end)]
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            x, y = (px + 0.5) * u, (py + 0.5) * u
            c = bg_at(y / 100)
            dx, dy = x - 50, y - 50
            d = math.hypot(dx, dy)
            # soft glow around the ring
            q = d / glow_r
            if 0.55 < q < 1:
                g = (q - 0.55) / 0.25 if q < 0.8 else (1 - q) / 0.2
                c = over(c, accent, 0.18 * g)
            # track
            ring = abs(d - r) - sw / 2
            c = over(c, TRACK, 0.5 - ring / u)
            # filled arc with round caps: signed distance to the arc segment
            ang = math.atan2(dy, dx)
            rel = (ang + math.pi / 2) % (2 * math.pi)
            if rel <= frac * 2 * math.pi:
                sd = ring
            else:
                sd = min(math.hypot(x - cx, y - cy) for cx, cy in caps) - sw / 2
            if sd < u:
                col = mix(accent, accent2, max(0.0, min(1.0, (x + y) / 200)))
                c = over(c, col, 0.5 - sd / u)
            # heart, 4x4 supersampled inside its box only
            if hx0 <= x <= hx1 and hy0 <= y <= hy1:
                hit = 0
                for sy in range(4):
                    for sx in range(4):
                        X = (x + (sx - 1.5) * u / 4 - 50) / hu
                        Y = -(y + (sy - 1.5) * u / 4 - 51) / hu + 0.12
                        hit += heart_inside(X, Y)
                if hit:
                    c = over(c, WHITE, hit / 16)
            row += bytes(int(round(max(0, min(1, v)) * 255)) for v in c)
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--accent", default="#00F19F")
    ap.add_argument("--accent2", default="#16EC06", help="the arc fades from accent to accent2")
    ap.add_argument("--out", default=os.path.join(HERE, "icons"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    acc, acc2 = hexrgb(a.accent), hexrgb(a.accent2)
    for name, size, pad in [("apple-touch-icon.png", 180, .16), ("icon-192.png", 192, .16),
                            ("icon-512.png", 512, .16), ("icon-maskable-512.png", 512, .28)]:
        png(os.path.join(a.out, name), size, size, render(size, pad, acc, acc2))
        print("wrote", os.path.join(a.out, name))


if __name__ == "__main__":
    main()

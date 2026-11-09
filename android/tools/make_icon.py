#!/usr/bin/env python3
"""Generate the launcher icons for StarVault using only the Python stdlib.

Produces a purple rounded square with a white five-pointed star at four
densities, supersampled for smooth edges. Run once; the PNGs are committed.
"""
import math
import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')
DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}
SS = 3  # supersampling factor


def star(cx, cy, outer, inner):
    pts = []
    for i in range(10):
        radius = outer if i % 2 == 0 else inner
        angle = -math.pi / 2 + i * math.pi / 5
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return pts


def in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def in_rounded(x, y, size, radius):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(raw, 9)) +
           chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def build(size):
    pts = star(size / 2.0, size / 2.0, size * 0.30, size * 0.132)
    radius = size * 0.22
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + (sx + 0.5) / SS
                    py = y + (sy + 0.5) / SS
                    if not in_rounded(px, py, size, radius):
                        continue
                    t = (px / size * 0.55 + py / size * 0.45)
                    cr = int(0x6C + (0xA8 - 0x6C) * t)
                    cg = int(0x5C + (0x5B - 0x5C) * t)
                    cb = int(0xE7 + (0xFF - 0xE7) * t)
                    if in_poly(px, py, pts):
                        cr = cg = cb = 255
                    r += cr
                    g += cg
                    b += cb
                    a += 255
            n = SS * SS
            row += bytes((r // n, g // n, b // n, a // n))
        rows.append(row)
    return rows


for folder, size in DENSITIES.items():
    directory = os.path.join(RES, folder)
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, 'ic_launcher.png')
    write_png(path, size, build(size))
    print('%s -> %s (%d px)' % (folder, path, size))

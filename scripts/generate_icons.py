#!/usr/bin/env python3
"""Original 'Lucy' PWA icons: violet rounded square, white play triangle,
amber orbit ring rotated -20 deg. Re-runnable."""
import math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'assets', 'icons')
os.makedirs(OUT, exist_ok=True)
VIOLET = (139, 92, 246, 255)
AMBER = (251, 191, 36, 255)
WHITE = (255, 255, 255, 255)

def draw_mark(draw, S, pad=0):
    # violet rounded square
    draw.rounded_rectangle([pad, pad, S - pad, S - pad],
                           radius=int(S * 0.22), fill=VIOLET)
    cx = cy = S / 2
    # amber orbit ring: ellipse stroke rotated -20 deg
    ring = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rx, ry = S * 0.34, S * 0.20
    rd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
               outline=AMBER, width=max(3, int(S * 0.028)))
    ring = ring.rotate(20, resample=Image.BICUBIC, center=(cx, cy))
    base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(base)
    bd.rounded_rectangle([pad, pad, S - pad, S - pad],
                         radius=int(S * 0.22), fill=VIOLET)
    base = Image.alpha_composite(base, ring)
    bd = ImageDraw.Draw(base)
    # white play triangle centered
    t = S * 0.15
    bd.polygon([(cx - t * 0.7, cy - t), (cx - t * 0.7, cy + t),
                (cx + t * 1.1, cy)], fill=WHITE)
    return base

def save(name, S, pad=0):
    img = draw_mark(ImageDraw.Draw(Image.new('RGBA', (S, S))), S, pad)
    img.save(os.path.join(OUT, name))
    print('wrote', name, f'{S}x{S}')

save('icon-192.png', 192)
save('icon-512.png', 512)
save('icon-maskable-512.png', 512, pad=int(512 * 0.15))  # safe zone padding
save('apple-touch-icon.png', 180)

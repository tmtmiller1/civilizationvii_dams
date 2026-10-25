#!/usr/bin/env python3
"""compose.py <x,y> <name> '<json pieces>' [more name json pairs...] - draw a composition on a plot, shoot it,
and tile the shots into shots/sheet-<first name>.png. Pieces are [asset, ox, oy, scale, angle, water?] in hex widths."""
import os, sys, time, json
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hexshot as H
xy = sys.argv[1]; pairs = sys.argv[2:]
x, y = (int(v) for v in xy.split(","))
zoom = float(os.environ.get("ZOOM", "0.02"))
crop = [float(v) for v in os.environ.get("CROP", "0.22,0.18,0.78,0.85").split(",")]
win = H.window_id(); tiles = []
for i in range(0, len(pairs), 2):
    name, pieces = pairs[i], pairs[i + 1]
    r = H.ev(f"__t.draw({x},{y},{pieces})")
    time.sleep(2)
    H.shoot(x, y, f"c-{name}", zoom, win)
    im = Image.open(os.path.join(H.SHOTS, f"hex-c-{name}-clean.png")); w, h = im.size
    im = im.crop((int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3])))
    im = im.resize((900, int(im.height * 900 / im.width)))
    d = ImageDraw.Draw(im); d.rectangle((0, im.height - 24, 900, im.height), fill=(0, 0, 0)); d.text((6, im.height - 18), name, fill=(255, 255, 255))
    tiles.append(im)
if os.environ.get("KEEP") != "1":
    H.ev(f"__t.clear({x},{y})")
cols = 2 if len(tiles) > 1 else 1
rows = (len(tiles) + cols - 1) // cols
th = max(t.height for t in tiles)
sheet = Image.new("RGB", (cols * 906, rows * (th + 6)), (255, 255, 255))
for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * 906, (i // cols) * (th + 6)))
out = os.path.join(H.SHOTS, f"sheet-{pairs[0]}.png"); sheet.save(out); print("sheet", out)

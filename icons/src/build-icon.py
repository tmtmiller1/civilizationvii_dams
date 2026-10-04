#!/usr/bin/env python3
"""Build the three per-age build icons at 256, 128 and 64 px: the age's dam art inside a gold ring.

Both parts are drawn here from the mod's own vector art: dam-<age>.svg for the scene, and ring.svg (written by this
script) for the frame, a gold band in the style of the game's build icons. No game file is read. The art is kept
inside radius RING_IN and the ring is laid over it. Needs rsvg-convert and Pillow.

    python3 icons/src/build-icon.py            # from the mod root

Writes icons/src/ring.svg and icons/dam_<age>.png plus _128 and _64, for age in ancient, medieval, modern.
"""
import os
import subprocess
import tempfile

from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(os.path.dirname(HERE))
SIZE = 256
C = SIZE / 2
RING_IN = 114  # the art's disc; the ring covers 114 to 127
AGES = ("ancient", "medieval", "modern")

# Dark backing, gold band, a thin dark line where the band meets the art, and a pale outer rim.
RING_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbe7a6"/><stop offset="0.35" stop-color="#d9a94b"/>
      <stop offset="0.7" stop-color="#9c6d22"/><stop offset="1" stop-color="#e8c26a"/>
    </linearGradient>
  </defs>
  <circle cx="{C}" cy="{C}" r="120.5" fill="none" stroke="#3a2608" stroke-width="13"/>
  <circle cx="{C}" cy="{C}" r="120.5" fill="none" stroke="url(#gold)" stroke-width="9.5"/>
  <circle cx="{C}" cy="{C}" r="115" fill="none" stroke="#2b1a05" stroke-width="1.6" opacity="0.8"/>
  <circle cx="{C}" cy="{C}" r="125.6" fill="none" stroke="#fff3c4" stroke-width="0.9" opacity="0.65"/>
</svg>
"""


def render(svg, out):
    subprocess.run(["rsvg-convert", "-w", str(SIZE), "-h", str(SIZE), svg, "-o", out], check=True)
    return Image.open(out).convert("RGBA")


def disc_mask():
    """An antialiased disc of radius RING_IN, drawn at 4x and reduced."""
    big = Image.new("L", (SIZE * 4, SIZE * 4), 0)
    r = RING_IN * 4
    ImageDraw.Draw(big).ellipse((C * 4 - r, C * 4 - r, C * 4 + r, C * 4 + r), fill=255)
    return big.resize((SIZE, SIZE), Image.LANCZOS)


def compose(ring, art, mask, out):
    """The art inside the disc, the ring over it."""
    inside = art.copy()
    inside.putalpha(ImageChops.multiply(art.getchannel("A"), mask))
    result = Image.alpha_composite(inside, ring)
    result.save(out)
    print(f"wrote {out}")
    for size in (128, 64):
        small = out.replace(".png", f"_{size}.png")
        result.resize((size, size), Image.LANCZOS).save(small)
        print(f"wrote {small}")


def main():
    ring_svg = os.path.join(HERE, "ring.svg")
    with open(ring_svg, "w", encoding="utf-8") as f:
        f.write(RING_SVG)
    mask = disc_mask()
    with tempfile.TemporaryDirectory() as tmp:
        ring = render(ring_svg, os.path.join(tmp, "ring.png"))
        for age in AGES:
            art = render(os.path.join(HERE, f"dam-{age}.svg"), os.path.join(tmp, f"{age}.png"))
            compose(ring, art, mask, os.path.join(MOD, "icons", f"dam_{age}.png"))


if __name__ == "__main__":
    main()

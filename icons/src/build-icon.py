#!/usr/bin/env python3
"""Build the three per-age build icons at 256, 128 and 64 px, each rendered inside the base game's gold ring.

The ring is lifted from the shipped buildicon_modbridge texture (decoded with tools/civ7_blp_inspect.py) so the
Dam matches the rest of the build menu. Pixels at radius >= RING_IN come from the base icon; inside it, the SVG
art; a one-pixel band blends the two. Needs rsvg-convert and Pillow.

    python3 icons/src/build-icon.py            # from the mod root

Writes icons/dam_<age>.png plus _128 and _64, for age in ancient, medieval, modern.
"""
import math
import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(os.path.dirname(HERE))
TOOLS = os.path.normpath(os.path.join(MOD, "..", "..", "tools"))
INSTALL = os.path.expanduser(
    "~/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/"
    "CivilizationVII.app/Contents/Resources/DLC/boot-shell/Platforms/Mac/BLPs/SHARED_DATA"
)
RING_TEXTURE = "TEXTURE_buildicon_modbridge"
RING_IN = 113.5  # measured: the ring's dark inner edge starts at r = 114 on the 256 px icon
SIZE = 256


AGES = ("ancient", "medieval", "modern")


def compose(ring, art, out):
    """Art inside, ring outside, one pixel of blend between them."""
    result = Image.new("RGBA", (SIZE, SIZE))
    rp, ap, op = ring.load(), art.load(), result.load()
    c = (SIZE - 1) / 2
    for y in range(SIZE):
        for x in range(SIZE):
            r = math.hypot(x - c, y - c)
            t = min(1.0, max(0.0, r - (RING_IN - 0.5)))  # 0 = art, 1 = ring
            a, b = ap[x, y], rp[x, y]
            op[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(4))
    result.save(out)
    print(f"wrote {out}")
    for size in (128, 64):
        small = out.replace(".png", f"_{size}.png")
        result.resize((size, size), Image.LANCZOS).save(small)
        print(f"wrote {small}")


def main():
    with tempfile.TemporaryDirectory() as tmp:
        ring_png = os.path.join(tmp, "ring.png")
        subprocess.run(
            [sys.executable, os.path.join(TOOLS, "civ7_blp_inspect.py"), os.path.join(INSTALL, RING_TEXTURE),
             "--decode", ring_png],
            check=True, stdout=subprocess.DEVNULL,
        )
        ring = Image.open(ring_png).convert("RGBA")
        for age in AGES:
            art_png = os.path.join(tmp, f"{age}.png")
            subprocess.run(
                ["rsvg-convert", "-w", str(SIZE), "-h", str(SIZE), os.path.join(HERE, f"dam-{age}.svg"),
                 "-o", art_png],
                check=True,
            )
            compose(ring, Image.open(art_png).convert("RGBA"), os.path.join(MOD, "icons", f"dam_{age}.png"))


if __name__ == "__main__":
    main()

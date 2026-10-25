#!/usr/bin/env python3
"""gallery.py <x,y> <sheet-name> <asset[@scale]> ... - in the running game, draw each asset alone at the centre of an
open plot, shoot it close, and tile the shots into shots/sheet-<name>.png with the asset name under each. Uses the
page helper __t (draw/clear) that the dams probe installs. Effects (VFX_*) go through addVFXAtPlot."""
import os, sys, time, json
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hexshot as H


def main():
    xy, name, assets = sys.argv[1], sys.argv[2], sys.argv[3:]
    x, y = (int(v) for v in xy.split(","))
    zoom = float(os.environ.get("ZOOM", "0.02"))
    win = H.window_id()
    tiles = []
    for a in assets:
        asset, _, sc = a.partition("@")
        sc = float(sc or 1)
        r = H.ev(f"__t.draw({x},{y},[[{json.dumps(asset)},0,0,{sc},0]])")
        time.sleep(1.5)
        tag = f"g-{name}-{asset}"
        H.shoot(x, y, tag, zoom, win)
        im = Image.open(os.path.join(H.SHOTS, f"hex-{tag}-clean.png"))
        w, h = im.size
        im = im.crop((int(w * 0.18), int(h * 0.12), int(w * 0.82), int(h * 0.88))).resize((560, 420))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 392, 560, 420), fill=(0, 0, 0))
        d.text((6, 398), f"{asset} @{sc}  {r[:40]}", fill=(255, 255, 255))
        tiles.append(im)
    H.ev(f"__t.clear({x},{y})")
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 566, rows * 426), (255, 255, 255))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * 566, (i // cols) * 426))
    out = os.path.join(H.SHOTS, f"sheet-{name}.png")
    sheet.save(out)
    print("sheet", out)


if __name__ == "__main__":
    main()

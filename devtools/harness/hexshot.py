#!/usr/bin/env python3
"""hexshot.py x y name [zoom] - camera on a plot in the running game, capture the game window by id, and write
shots/hex-<name>.png (a crop around the plot with its hex outlined) and shots/hex-<name>-clean.png (no outline).

The game window, when another window covers it, hands back frames that lag the camera: a capture taken right after a
move can show where the camera was before. So the camera is aimed, the frame is taken until two in a row agree, the
camera is aimed again, and the frame is taken until it settles a second time. Several plots in one call:
    hexshot.py 25,36:D 24,36:bare 28,34:E1 [--zoom 0.035]
"""
import json, os, subprocess, sys, time
from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../../.."))
SHOTS = os.path.join(HERE, "shots")
TB = ["node", os.path.join(ROOT, "tools/tower-bench/tower-bench.mjs"), "eval"]


def ev(code):
    out = subprocess.run(TB + [code], capture_output=True, text=True).stdout.strip().splitlines()
    return out[-1] if out else ""


def window_id():
    out = subprocess.run(["swift", os.path.join(HERE, "dam-winid.swift")], capture_output=True, text=True).stdout
    rows = [r.split() for r in out.splitlines() if len(r.split()) == 3]
    rows = [r for r in rows if int(r[2]) > 600]
    rows.sort(key=lambda r: -int(r[1]))
    return rows[0][0]


def grab(win, path):
    subprocess.run(["screencapture", "-x", "-o", "-l", win, path])
    return Image.open(path).convert("RGB")


def small(im):
    return im.convert("L").resize((96, 60))


def settle(win, path, tries=12):
    prev = None
    for k in range(tries):
        im = grab(win, path)
        s = small(im)
        if prev is not None:
            d = ImageChops.difference(prev, s).point(lambda v: 255 if v > 30 else 0)
            frac = sum(1 for v in d.getdata() if v) / (96 * 60)
            mean = sum(s.getdata()) / (96 * 60)
            if frac < 0.03 and mean > 40:
                return im
        prev = s
        time.sleep(2)
    return im


def shoot(x, y, name, zoom, win):
    aim = f"Camera.lookAtPlot({{x:{x},y:{y}}},{{zoom:{zoom}}}); 'ok'"
    raw = os.path.join(SHOTS, f"hexraw-{name}.png")
    ev(aim); time.sleep(4); settle(win, raw)
    ev(aim); time.sleep(3); im = settle(win, raw)
    uv = json.loads(ev(
        "(()=>{const R=['DIRECTION_EAST','DIRECTION_SOUTHEAST','DIRECTION_SOUTHWEST','DIRECTION_WEST',"
        "'DIRECTION_NORTHWEST','DIRECTION_NORTHEAST'];const c={x:%d,y:%d};const pts=[c,...R.map(d=>{"
        "const n=GameplayMap.getAdjacentPlotLocation(c,DirectionTypes[d]);return {x:n.x,y:n.y};})];"
        "return JSON.stringify({w:window.innerWidth,h:window.innerHeight,uv:pts.map(p=>WorldUI.getScreenPlotPos(p))});})()"
        % (x, y)))
    W, H = im.size
    vh = round(W * uv["h"] / uv["w"]); top = H - vh
    P = [(p["x"] * W, top + p["y"] * vh) for p in uv["uv"]]
    c, n = P[0], P[1:]
    verts = [((c[0] + n[i][0] + n[(i + 1) % 6][0]) / 3, (c[1] + n[i][1] + n[(i + 1) % 6][1]) / 3) for i in range(6)]
    r = max(abs(v[0] - c[0]) for v in verts) * 2.2
    box = (max(0, int(c[0] - r * 1.4)), max(0, int(c[1] - r)), min(W, int(c[0] + r * 1.4)), min(H, int(c[1] + r * 0.9)))
    json.dump({"P": P, "W": W, "H": H}, open(os.path.join(SHOTS, f"hexmeta-{name}.json"), "w"))
    clean = im.crop(box)
    lab = im.copy()
    dr = ImageDraw.Draw(lab)
    dr.line(verts + [verts[0]], fill=(255, 220, 0), width=4)
    if os.environ.get("GRID"):
        # neighbour centres in world: E = (+64, 0), NE = (+32, +55.4); hex-local unit u = 64 world (flat to flat).
        # screen(ox, oy) = c + ox * (E - c) + (oy * 64 / 55.4256) * (NE - c) - (oy * 64 / 55.4256) * 0.5 * (E - c)
        E, NE = n[0], n[5]
        ex, ey = E[0] - c[0], E[1] - c[1]
        nx, ny = NE[0] - c[0], NE[1] - c[1]
        k = 64 / 55.4256
        def scr(ox, oy):
            a = ox - 0.5 * oy * k
            b = oy * k
            return (c[0] + a * ex + b * nx, c[1] + a * ey + b * ny)
        ticks = [-0.5, -0.25, 0, 0.25, 0.5]
        for t in ticks:
            col = (255, 60, 60) if t == 0 else (255, 140, 140)
            dr.line([scr(t, -0.58), scr(t, 0.58)], fill=col, width=2)
            col = (60, 160, 255) if t == 0 else (140, 190, 255)
            dr.line([scr(-0.5, t), scr(0.5, t)], fill=col, width=2)
    lab = lab.crop(box)
    s = 1600 / clean.width
    clean.resize((1600, int(clean.height * s))).save(os.path.join(SHOTS, f"hex-{name}-clean.png"))
    lab.resize((1600, int(lab.height * s))).save(os.path.join(SHOTS, f"hex-{name}.png"))
    print("ok", name, f"{x},{y}", "center px", [round(v) for v in c])


def main():
    args = sys.argv[1:]
    zoom = 0.035
    if "--zoom" in args:
        i = args.index("--zoom"); zoom = float(args[i + 1]); del args[i:i + 2]
    jobs = []
    if args and ":" in args[0]:
        for a in args:
            xy, name = a.split(":"); x, y = xy.split(","); jobs.append((int(x), int(y), name))
    else:
        jobs.append((int(args[0]), int(args[1]), args[2]))
        if len(args) > 3: zoom = float(args[3])
    win = window_id()
    for x, y, name in jobs:
        shoot(x, y, name, zoom, win)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""lotfind.py <before-name> <after-name>: where in the hex did the picture change? Reads shots/hexraw-*.png and the
hexmeta json of the after shot; prints the centroid of changed pixels inside the hex in hex-local units (x east, y
north, hex flat-to-flat = 1) and its compass bearing."""
import sys, json, math, os
from PIL import Image, ImageChops
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
def run(b, a):
    m = json.load(open(f"{S}/hexmeta-{a}.json")); P = m["P"]; c = P[0]; E = P[1]; NE = P[6]
    A = Image.open(f"{S}/hexraw-{b}.png").convert("RGB"); B = Image.open(f"{S}/hexraw-{a}.png").convert("RGB")
    d = ImageChops.difference(A, B).convert("L")
    ex, ey = E[0]-c[0], E[1]-c[1]; nx, ny = NE[0]-c[0], NE[1]-c[1]
    det = ex*ny - ey*nx
    sx = sy = n = 0
    W, H = d.size; px = d.load()
    for yy in range(0, H, 3):
        for xx in range(0, W, 3):
            if px[xx, yy] < 45: continue
            dx, dy = xx-c[0], yy-c[1]
            a_ = (dx*ny - dy*nx)/det; b_ = (ex*dy - ey*dx)/det   # screen = c + a*E + b*NE
            hx = a_ + 0.5*b_; hy = b_*0.866
            if math.hypot(hx, hy) > 0.5: continue
            sx += hx; sy += hy; n += 1
    if not n: return None
    cx, cy = sx/n, sy/n
    ang = (math.degrees(math.atan2(cy, cx)) + 360) % 360
    return round(cx, 3), round(cy, 3), round(ang), n
if __name__ == "__main__":
    for pair in sys.argv[1:]:
        b, a = pair.split(":"); print(pair, run(b, a))

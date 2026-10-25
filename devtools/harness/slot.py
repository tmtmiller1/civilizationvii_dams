#!/usr/bin/env python3
"""slot.py: place a dam composition (slot-local [asset, x, y, scale, angle]) into a layout slot and print pieces."""
import json, math, sys
def place(slot, local):
    sx, sy, sr = slot; r = math.radians(sr); c, s = math.cos(r), math.sin(r)
    return [[a, round(sx + c * x - s * y, 4), round(sy + s * x + c * y, 4), sc, round(sr + ang, 1)] for a, x, y, sc, ang in local]
DAMS = {
  # x along the wall (east), y upstream (north): the reservoir lies behind the wall, the spill runs toward the camera
  "MED": [["WON_Forbidden_City_Pond_A", 0, 0.06, 1.8, 0], ["Great_Wall_Wall", 0, -0.025, 0.36, 0],
          ["Great_Wall_TowerA", -0.13, -0.025, 0.3, 0], ["Great_Wall_TowerA", 0.13, -0.025, 0.3, 0],
          ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, -0.04, 0.45, 270], ["VFX_Riverfoam_Straight1", 0, -0.11, 0.45, 90]],
  "ANT": [["WON_Forbidden_City_Pond_A", 0, 0.06, 1.6, 0]] +
         [["IMP_Kabakas_Lake_Rocks_%s" % "ABCD"[i % 4], -0.15 + 0.05 * i, -0.025, 0.55, 61 * i] for i in range(7)] +
         [["Ant1_Euro_Fortification_Rock0%d" % (1 + i % 2), -0.13 + 0.0433 * i, -0.045, 1.4, 37 * i] for i in range(7)] +
         [["VFX_WaterFall_Loop_AutoHeight_Medium", 0, -0.045, 0.3, 270], ["VFX_Riverfoam_Straight1_Short", 0, -0.09, 0.5, 90]],
  "MOD": [["WON_Forbidden_City_Pond_A", 0, 0.06, 1.8, 0], ["GEN_MOD_Harbor_Pier_HB", -0.08, -0.02, 0.3, 0], ["GEN_MOD_Harbor_Pier_HB", 0.08, -0.02, 0.3, 0],
          ["NAF_MOD_RadioStation_ElectricBox", 0.17, -0.05, 0.5, 0],
          ["VFX_WaterFall_Loop_AutoHeight_Medium", -0.04, -0.04, 0.45, 270], ["VFX_WaterFall_Loop_AutoHeight_Medium", 0.04, -0.04, 0.45, 270],
          ["VFX_Riverfoam_Thick_Straight1", 0, -0.12, 0.6, 90]],
}
def place(slot, local, k=1.0):
    sx, sy, sr = slot
    return [[p[0], round(sx + p[1] * k, 4), round(sy + p[2] * k, 4), round(p[3] * k, 3), p[4]] + p[5:] for p in local]
if __name__ == "__main__":
    import math
    base = json.load(open(sys.argv[1])); B = json.loads(sys.argv[2]); A = json.loads(sys.argv[3]); age = sys.argv[4]; alone = len(sys.argv) > 5
    # turn the layout by the 60-degree step that puts the dam's slot furthest south
    best = min(range(6), key=lambda k: math.sin(math.radians(60 * k)) * B[0] + math.cos(math.radians(60 * k)) * B[1])
    d = math.radians(60 * best); c, s = math.cos(d), math.sin(d)
    turn = lambda x, y: (round(c * x - s * y, 4), round(s * x + c * y, 4))
    out = []
    for p in base:
        a, x, y, sc, ang = p[:5]
        if alone and a.endswith("_HB"): continue
        tx, ty = turn(x, y); out.append([a, tx, ty, sc, round(ang + 60 * best, 1)] + p[5:])
    bx, by = turn(B[0], B[1]); ax, ay = turn(A[0], A[1])
    if alone: out += place(((bx + ax) / 2, (by + ay) / 2, 0), DAMS[age], 1.45)
    else: out += place((bx, by, 0), DAMS[age])
    print(json.dumps(out))

import json, sys
def exp(cx, cy, k=1.0):
    P = [["WON_Forbidden_City_Pond_A", 0, 0.1, 2.4, 0], ["Great_Wall_TowerA", -0.17, -0.04, 0.45, 0], ["Great_Wall_TowerA", 0.17, -0.04, 0.45, 0],
         ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, -0.06, 0.7, 270], ["VFX_Riverfoam_Straight1", 0, -0.18, 0.7, 90]]
    return [[a, round(cx + ox * k, 3), round(cy + oy * k, 3), round(s * k, 3), ang] for a, ox, oy, s, ang in P]
if __name__ == "__main__":
    print(json.dumps(globals()[sys.argv[1]](*[float(v) for v in sys.argv[2:]])))

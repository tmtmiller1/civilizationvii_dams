import json, math, sys
P = json.load(sys.stdin); d = float(sys.argv[1]); r = math.radians(d); c, s = math.cos(r), math.sin(r)
print(json.dumps([[a, round(c * x - s * y, 4), round(s * x + c * y, 4), sc, round(ang + d, 1)] for a, x, y, sc, ang in P]))

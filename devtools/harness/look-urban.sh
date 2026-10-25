#!/bin/zsh
# look-urban.sh - capture each Dam look variant on an urban river tile that holds buildings, on a bare land river tile
# and on a navigable channel, in whatever game is running (a lab game or a loaded save, game scope). Captures the game
# window by id, so it can sit behind other windows. Output: shots/urban-<site>-<variant>.png
#
#   zsh look-urban.sh                      # every variant on the nearest site of each kind
#   VARIANTS="exp-cur exp-big" zsh look-urban.sh
#   URBAN=41,22 LAND=40,21 WATER=38,20 zsh look-urban.sh   # choose the tiles yourself
#   ZOOM=0.08 zsh look-urban.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
TB=(node "$ROOT/tools/tower-bench/tower-bench.mjs")
OUT="${SHOTDIR:-$HERE/shots}"; mkdir -p "$OUT"
ZOOM="${ZOOM:-0.08}"
say() { echo "[$(date +%H:%M:%S)] $*"; }
ev() { "${TB[@]}" eval "$1" 2>&1 | tail -1; }

say "install: $(ev "$(cat "$HERE/look-urban.eval.js")")"
SITES=$(ev 'JSON.stringify(__dl.sites())')
say "sites: $SITES"
pick() { node -e 'const s=JSON.parse(process.argv[1]); const e=(s[process.argv[2]]||[])[0]; if(e) console.log(e.x+","+e.y)' "$SITES" "$1"; }
URBAN="${URBAN:-$(pick urban)}"; LAND="${LAND:-$(pick land)}"; WATER="${WATER:-$(pick water)}"
say "urban=$URBAN land=$LAND water=$WATER"

winid() { swift "$HERE/dam-winid.swift" 2>/dev/null | awk '$2 > 600' | sort -k2 -n -r | head -1 | awk '{print $1}'; }
WIN=$(winid); [ -n "$WIN" ] || { say "no game window"; exit 1; }
VARIANTS="${VARIANTS:-ant-cur ant-big ant-towers exp-cur exp-big exp-arch exp-gate mod-cur mod-big mod-towers}"

ev '__dl.view(true)' >/dev/null
for site in urban land water; do
  xy="${(P)${(U)site}}"
  [ -n "$xy" ] || { say "no $site site"; continue; }
  x="${xy%,*}"; y="${xy#*,}"
  for v in ${=VARIANTS}; do
    age=$(case "$v" in ant-*) echo ANTIQUITY;; exp-*) echo EXPLORATION;; *) echo MODERN;; esac)
    r=$(ev "JSON.stringify(__dl.draw({x:$x,y:$y},'$age','$v'))")
    ev "__dl.look({x:$x,y:$y},$ZOOM)" >/dev/null
    sleep 6
    screencapture -x -o -l "$WIN" "$OUT/urban-$site-$v.png"
    say "$site $v at $x,$y -> $r"
    ev "__dl.clear({x:$x,y:$y})" >/dev/null
  done
done
ev '__dl.view(false)' >/dev/null
say "done: $OUT/urban-*.png"

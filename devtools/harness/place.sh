#!/bin/zsh
# place.sh <x> <y> <name> '<json array of constructible types>' - in the running idle probe game: buy the plot, shoot
# it, make it an urban district holding those types, shoot it again from the same camera.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"
X=$1; Y=$2; NAME=$3; TYPES=$4
tb() { node "$ROOT/tools/tower-bench/tower-bench.mjs" eval "$1" 2>&1 | tail -1; }
tb "__r.buy({x:$X,y:$Y})" >/dev/null
zsh "$HERE/hexshot.sh" $X $Y "$NAME-before" 0.05 2>&1 | grep -v Deprecation
tb "(async()=>{const c=__r.city(); const h=await __r.urbanWith(GameContext.localPlayerID,{x:$X,y:$Y},{id:c.id,owner:c.owner},$TYPES); return JSON.stringify(h);})()"
sleep 3
MINCHANGE=0 zsh "$HERE/hexshot.sh" $X $Y "$NAME-after" 0.05 2>&1 | grep -v Deprecation

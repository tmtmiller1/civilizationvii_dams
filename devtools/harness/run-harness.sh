#!/bin/zsh
# run-harness.sh <game-script.js> [label] [timeout seconds] [deploy: none, or any of floods,mod,grant joined by +]
#
# Hands-free probe run for the dams work. A trimmed copy of the canals harness
# (mod_ideas_tested/canals/devtools/harness/run-harness.sh): new Play Now games only, nothing deployed but the
# harness itself. It
#   - refuses to start if the game is already running, and stashes (then restores) any other
#     session's probe/harness mod, which would otherwise hijack the launch
#   - backs up the player's autosaves and puts them back if the run churned the rotation
#   - installs dam-harness with the chosen game script, launches via Steam, waits for the DONE
#     marker, collects the [DAM] lines and any crash report, then quits and cleans up
#
# Usage:
#   SEED=9001 zsh run-harness.sh damh-game-d1.js d1 600
#   START_AGE=AGE_EXPLORATION SEED=4242 zsh run-harness.sh damh-game-d1.js d1b 600
#   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d2.js d2 900 floods   # frequent floods
#   SEED=9001 zsh run-harness.sh damh-game-d4.js d4 900 mod+grant   # the shipped mod, Dams unlocked at turn 1
#   CONFIG="CompactCities-RingLock=ENABLED" SEED=9001 zsh run-harness.sh damh-game-d28.js d28 900 mod+grant+compact
#   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-d29.js d29 2400 mod+grant+shortage   # age transition
#   SAVE=DAM-d6.Civ7Save zsh run-harness.sh damh-game-d7.js d7 600 mod+grant   # load a save instead (KEEP_SAVES=1 keeps DAM-*)
#   SEED=9001 zsh run-harness.sh damh-game-emig-interop.js emig1 2400 mod+floods+emig   # with Emigration from the repo
# NOTE: "mod" installs tower_mods/dams as Mods/tower-dams and removes it on cleanup. "emig" moves the player's
# Mods/emigration aside, installs tower_mods/emigration in its place (modinfo + the folders it lists, never dist/,
# whose same-id modinfo would blank the screen) and puts the player's copy back on every exit path.
#
# The game comes up full screen in front of whatever is on the Mac. Do not run it while someone is
# using the machine.
set -u
SCRIPT="${1:?game script, e.g. damh-game-d1.js}"
LABEL="${2:-run}"
TIMEOUT="${3:-600}"
DEPLOY="${4:-none}"

S="$HOME/Library/Application Support/Civilization VII"
DB="$S/Mods.sqlite"; MODS="$S/Mods"; LOG="$S/Logs/UI.log"; AUTO="$S/Saves/Single/auto"
HERE="$(cd "$(dirname "$0")" && pwd)"
HDIR="$MODS/dam-harness"
FDIR="$MODS/dam-flood-probe"
MDIR="$MODS/tower-dams"
GDIR="$MODS/dam-grant-probe"
ADIR="$MODS/dam-short-age-probe"
CDIR="$MODS/dam-compact-cities"
CREPO="$(cd "$HERE/../../../../other_peoples_mods/3781288701" 2>/dev/null && pwd)"
MOD="${MODSRC:-$(cd "$HERE/../.." && pwd)}"   # MODSRC= another copy of the mod, e.g. an older release
QDIR="$MODS/dam-floodfreq-probe"
BAK="$S/dam-harness-backup/auto-$LABEL"
say() { echo "[$(date +%H:%M:%S)] $*"; }

[ -f "$HERE/$SCRIPT" ] || { say "missing script $HERE/$SCRIPT"; exit 1; }
pgrep -x CivilizationVII >/dev/null && { say "Civ VII is ALREADY RUNNING - another session may be using it. Stop here."; exit 1; }

# Another session's harness installed in the last 15 minutes is a run in progress (it may be about to launch):
# stashing it broke a canals run on 2026-09-28. Refuse instead; an older one is a leftover and is stashed as before.
BUSY=$(find "$MODS" -maxdepth 1 -type d -iname "*harness*" ! -name dam-harness -mmin -15 2>/dev/null)
[ -n "$BUSY" ] && { say "another session's harness is fresh ($(basename "$BUSY")) - a run is in progress. Stop here."; exit 1; }
STASH="$S/dam-harness-backup/foreign-$LABEL"
FOREIGN=$(ls "$MODS" 2>/dev/null | grep -iE "probe|harness" | grep -vE "^(dam-harness|dam-flood-probe|dam-floodfreq-probe|dam-grant-probe)$")
restore_foreign() {
  [ -d "$STASH" ] || return 0
  for d in "$STASH"/*(N); do
    [ -e "$d" ] || continue
    rm -rf "$MODS/$(basename "$d")"
    mv "$d" "$MODS/" && say "restored foreign mod $(basename "$d")"
  done
  rmdir "$STASH" 2>/dev/null
}
if [ -n "$FOREIGN" ]; then
  mkdir -p "$STASH"
  echo "$FOREIGN" | while read -r d; do
    [ -n "$d" ] || continue
    mv "$MODS/$d" "$STASH/" && say "stashed foreign mod $d (will be restored)"
  done
fi
EDIR="$MODS/emigration"
EBAK="$S/dam-harness-backup/emigration-live-$LABEL"
EREPO="$(cd "$HERE/../../../emigration" && pwd)"
EMIG_MOVED=0
restore_emig() {
  [ "$EMIG_MOVED" = 1 ] && [ -d "$EBAK" ] || return 0
  rm -rf "$EDIR"; mv "$EBAK" "$EDIR" && say "restored the player's Mods/emigration ($(grep -o '<Version>[^<]*' "$EDIR/emigration.modinfo"))"
}
# AI_VERBOSE=1 turns on the engine's AI scoring logs (AI_ConstructibleBroker.csv shows which buildings the AI chose
# and where). AppOptions.txt is the player's file: backed up here, put back on every exit path.
OPTS="$S/AppOptions.txt"
restore_opts() { [ -f "$OPTS.dam-bak" ] && mv "$OPTS.dam-bak" "$OPTS" && say "AppOptions.txt restored"; return 0; }
if [ "${AI_VERBOSE:-0}" = "1" ] && [ -f "$OPTS" ]; then
  cp -p "$OPTS" "$OPTS.dam-bak"
  if grep -q "^AIVerboseLogging" "$OPTS"; then sed -i '' 's/^AIVerboseLogging .*/AIVerboseLogging 1/' "$OPTS";
  else sed -i '' 's/^;AIVerboseLogging 0/AIVerboseLogging 1/' "$OPTS"; fi
  say "AIVerboseLogging on (AppOptions.txt backed up)"
fi
trap 'restore_opts; restore_emig; restore_foreign' EXIT INT TERM

rm -rf "$BAK"; mkdir -p "$BAK"; cp -p "$AUTO"/*.Civ7Save "$BAK"/ 2>/dev/null
say "autosaves backed up: $(ls "$BAK" 2>/dev/null | wc -l | tr -d ' ')"

rm -rf "$HDIR" "$FDIR" "$MDIR" "$GDIR" "$ADIR" "$CDIR" "$QDIR"; mkdir -p "$HDIR/ui"
for part in ${(s:+:)DEPLOY}; do
  case "$part" in
    none) ;;
    floods) mkdir -p "$FDIR"; cp -R "$HERE/../probe-floods/." "$FDIR/"; say "deployed: dam-flood-probe (floods 300x per age, levee marker)" ;;
    freqfloods) mkdir -p "$QDIR"; cp -R "$HERE/../probe-floods-freq/." "$QDIR/"; rm -f "$QDIR/data/floods-big.xml" "$QDIR/data/floods-mixed.xml"; say "deployed: dam-floodfreq-probe (floods 300x per age, the game's own pillage shares)" ;;
    freqmixfloods) mkdir -p "$QDIR"; cp -R "$HERE/../probe-floods-freq/." "$QDIR/"; mv "$QDIR/data/floods-mixed.xml" "$QDIR/data/floods.xml"; rm -f "$QDIR/data/floods-big.xml"; say "deployed: dam-floodfreq-probe (major 300, moderate 30, no 1000-year)" ;;
    freqbigfloods) mkdir -p "$QDIR"; cp -R "$HERE/../probe-floods-freq/." "$QDIR/"; mv "$QDIR/data/floods-big.xml" "$QDIR/data/floods.xml"; rm -f "$QDIR/data/floods-mixed.xml"; say "deployed: dam-floodfreq-probe (major and 1000-year floods only, the game's own pillage shares)" ;;
    bigfloods) mkdir -p "$FDIR"; cp -R "$HERE/../probe-floods/." "$FDIR/"; cp "$HERE/../probe-floods-big/floods.xml" "$FDIR/data/floods.xml"; say "deployed: dam-flood-probe with major and 1000-year floods only" ;;
    mod) mkdir -p "$MDIR"; cp "$MOD/dams.modinfo" "$MDIR/"; for d in data text ui icons; do [ -d "$MOD/$d" ] && cp -R "$MOD/$d" "$MDIR/"; done; rm -rf "$MDIR/icons/src"; say "deployed: the mod from tower_mods/dams" ;;
    emig)
      [ -d "$EBAK" ] && { say "stale $EBAK exists - restore it by hand first"; exit 1; }
      mkdir -p "$(dirname "$EBAK")"
      [ -d "$EDIR" ] && mv "$EDIR" "$EBAK" && EMIG_MOVED=1
      mkdir -p "$EDIR"; cp "$EREPO/emigration.modinfo" "$EDIR/"
      for d in ui text data images; do cp -R "$EREPO/$d" "$EDIR/"; done
      say "deployed: emigration from the repo ($(grep -o '<Version>[^<]*' "$EDIR/emigration.modinfo")), player's copy kept at $EBAK" ;;
    grant) mkdir -p "$GDIR"; cp -R "$HERE/../probe-grant/." "$GDIR/"; say "deployed: dam-grant-probe (Dams unlocked at turn 1)" ;;
    shortage) mkdir -p "$ADIR"; cp -R "$HERE/../probe-short-age/." "$ADIR/"; say "deployed: dam-short-age-probe (Exploration ends at 12 points)" ;;
    compact)
      [ -n "$CREPO" ] || { say "compact: the reference copy of Compact Cities (other_peoples_mods/3781288701) is missing"; exit 1; }
      sqlite3 "$DB" "select count(*) from Mods where ModId='compact-cities'" | grep -qx 0 || { say "compact: the player already has a compact-cities row; a second copy would shadow it. Stop here."; exit 1; }
      mkdir -p "$CDIR"; cp -R "$CREPO/." "$CDIR/"; CDEPLOYED=1; say "deployed: Compact Cities 1.6 from the reference corpus (removed on cleanup)" ;;
    *) say "unknown DEPLOY part '$part'"; exit 1 ;;
  esac
done
cp "$HERE/dam-harness.modinfo" "$HDIR/"
if [ "${LAN:-0}" = "1" ]; then
  sed -e "s/__AGE__/${START_AGE:-}/" -e "s/__SEED__/${SEED:-}/" "$HERE/damh-shell-lan.js" > "$HDIR/ui/damh-shell.js"
elif [ -n "${SAVE:-}" ]; then
  [ -f "$S/Saves/Single/$SAVE" ] || { say "missing save $S/Saves/Single/$SAVE"; exit 1; }
  sed -e "s/AugustusExp66.Civ7Save/$SAVE/" "$HERE/damh-shell-load.js" > "$HDIR/ui/damh-shell.js"
else
  sed -e "s/__AGE__/${START_AGE:-}/" -e "s/__SEED__/${SEED:-}/" -e "s/__REALISM__/${REALISM:-}/" -e "s/__CONFIG__/${CONFIG:-}/" "$HERE/damh-shell-new.js" > "$HDIR/ui/damh-shell.js"
fi
sed -e "s|__PROBE_OPTS__|${PROBE_OPTS:-}|" "$HERE/$SCRIPT" > "$HDIR/ui/damh-game.js"
say "harness installed: $SCRIPT (${SAVE:-NEW game, age=${START_AGE:-default} seed=${SEED:-random}})"

if [ -s "$LOG" ]; then
  KEEP="$S/dam-harness-backup/UI-before-$LABEL-$(date +%Y%m%d-%H%M%S).log"
  mkdir -p "$(dirname "$KEEP")"; cp -p "$LOG" "$KEEP"
  say "previous UI.log kept at $KEEP ($(wc -l < "$KEEP" | tr -d ' ') lines)"
fi
: > "$LOG" 2>/dev/null
open steam://rungameid/1295660
n=0; until pgrep -x CivilizationVII >/dev/null; do sleep 2; n=$((n+1)); [ $n -gt 90 ] && { say "GAME DID NOT START"; break; }; done
say "game pid $(pgrep -x CivilizationVII | head -1)"

# Screenshots on demand: "[DAM] SHOT <name>" captures the game's own window by id, never the display.
SHOTDIR="${SHOTDIR:-$HERE/shots}"; mkdir -p "$SHOTDIR"
taken=""
take_shots() {
  for name in $(grep -o "\[DAM\] SHOT [A-Za-z0-9_-]*" "$LOG" 2>/dev/null | awk '{print $3}' | sort -u); do
    case " $taken " in *" $name "*) continue ;; esac
    taken="$taken $name"
    sleep 4
    wins=$(swift "$HERE/dam-winid.swift" 2>/dev/null)
    winid=$(printf "%s\n" "$wins" | awk '$3 > 600' | sort -k3 -n -r | head -1 | awk '{print $1}')
    out="$SHOTDIR/$LABEL-$name.png"
    if [ -n "$winid" ]; then
      screencapture -x -o -l "$winid" "$out" && say "shot $name (window $winid) -> $(stat -f%z "$out" 2>/dev/null) bytes"
    else
      say "shot $name skipped: no game window found"
    fi
  done
}
t=0; result=timeout
while [ $t -lt $TIMEOUT ]; do
  sleep 4; t=$((t+4))
  take_shots
  if grep -q "DONE harness " "$LOG" 2>/dev/null; then result=done; sleep 6; break; fi
  if grep -q "LOAD gave up\|cannot load" "$LOG" 2>/dev/null; then result=loadfail; break; fi
  if ! pgrep -x CivilizationVII >/dev/null; then result=crashed; break; fi
done
say "result=$result after ${t}s"

grep "\[DAM\]" "$LOG" | cut -c1-4000 > "$HERE/$LABEL-UI.log"
grep "\[Emigration\] \(event\|events:\|boot\)" "$LOG" | cut -c1-600 > "$HERE/$LABEL-emig.log" 2>/dev/null
grep -i "error\|exception\|failed" "$LOG" | grep -iv "\[DAM\]" | tail -30 > "$HERE/$LABEL-errors.txt"
for dl in Database.log Modding.log Game_RandomEvents.csv; do cp -p "$S/Logs/$dl" "$HERE/$LABEL-$dl" 2>/dev/null; done
if [ "${AI_VERBOSE:-0}" = "1" ]; then
  for ai in "$S/Logs/"*onstructible*.csv(N); do cp -p "$ai" "$HERE/$LABEL-$(basename "$ai")" && say "collected $(basename "$ai") ($(wc -l < "$ai" | tr -d ' ') lines)"; done
fi
if [ "$result" = crashed ]; then
  say "waiting 60s for the crash report to land"
  sleep 60
  latest=$(ls -t "$HOME/Library/Logs/DiagnosticReports"/CivilizationVII*.ips 2>/dev/null | head -1)
  [ -n "$latest" ] && { cp "$latest" "$HERE/$LABEL-crash.ips"; say "crash report: $(basename $latest)"; } || say "no .ips found"
fi

pkill -TERM CivilizationVII; sleep 8; pgrep -x CivilizationVII >/dev/null && { sleep 10; pkill -KILL CivilizationVII; }
rm -rf "$HDIR" "$FDIR" "$MDIR" "$GDIR" "$ADIR" "$CDIR" "$QDIR"
sqlite3 "$DB" "delete from Mods where ModId in ('dam-harness','dam-flood-probe','dam-floodfreq-probe','tower-dams','dam-grant-probe','dam-short-age-probe'$([ -n "${CDEPLOYED:-}" ] && echo ",'compact-cities'"))" 2>/dev/null
[ "${KEEP_SAVES:-0}" = "1" ] || rm -f "$S/Saves/Single/DAM-"*.Civ7Save 2>/dev/null
say "cleaned up: $(ls "$MODS" | grep -icE 'dam-harness|dam-flood-probe|tower-dams|dam-grant-probe|dam-short-age-probe|dam-compact-cities' | tr -d ' ') of our folders left in Mods/"

if [ "$(ls "$AUTO"/*.Civ7Save 2>/dev/null | xargs -n1 basename | sort)" != "$(ls "$BAK" 2>/dev/null | sort)" ]; then
  say "autosaves changed during the run; putting the player's back"
  rm -f "$AUTO"/*.Civ7Save; cp -p "$BAK"/*.Civ7Save "$AUTO"/ 2>/dev/null
fi
say "FINISHED result=$result  log: $HERE/$LABEL-UI.log"

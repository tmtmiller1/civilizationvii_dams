#!/bin/zsh
# run-languages.sh [locale ...] - one short game per display language with only the mod deployed. Each game composes
# the three Dam descriptions and the Civilopedia chapter, captures the Dams Civilopedia page and the three Dam building
# pages, and quits. check-languages.mjs then compares every language with the English run.
#   zsh run-languages.sh                 # all twelve, English first
#   zsh run-languages.sh de_DE ja_JP     # just these (the English run t-en_US must already exist)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCALES=("$@")
[ ${#LOCALES[@]} -eq 0 ] && LOCALES=(en_US de_DE es_ES fr_FR it_IT ja_JP ko_KR pl_PL pt_BR ru_RU zh_Hans_CN zh_Hant_HK)
for loc in "${LOCALES[@]}"; do
  echo "[$(date +%H:%M:%S)] uptime: $(uptime | sed 's/.*up \([^,]*\),.*/\1/')"
  if pgrep -x CivilizationVII >/dev/null; then echo "Civ VII is running - stopping before $loc"; exit 1; fi
  DISPLAY_LANG="$loc" PROBE_OPTS=text SEED=9001 zsh "$HERE/run-harness.sh" damh-game-adj.js "t-$loc" 480 mod || { echo "harness failed on $loc"; exit 1; }
  sleep 10
done
node "$HERE/check-languages.mjs" "${LOCALES[@]}"

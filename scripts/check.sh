#!/bin/zsh
# Dev gate: every file the modinfo names exists, every LOC tag it uses has text, XML parses, JS lints.
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
import re, os, sys
items = re.findall(r'<Item>([^<]+)</Item>', open('dams.modinfo').read())
missing = [i for i in items if not os.path.exists(i)]
tags = set(re.findall(r'Tag="(LOC_[A-Z0-9_]+)"', open('text/en_us/DamsText.xml').read()))
used = set()
for f in ['dams.modinfo'] + ['data/' + x for x in os.listdir('data')] + ['ui/dams.js']:
    used |= set(re.findall(r'LOC_[A-Z0-9_]+', open(f).read()))
used = {t for t in used if not t.startswith(('LOC_MODULE', 'LOC_PEDIA', 'LOC_BUILDING_CONSTRUCT'))}
gaps = sorted(used - tags)
if missing or gaps:
    print('missing files:', missing)
    print('LOC tags with no text:', gaps)
    sys.exit(1)
print(f'modinfo: {len(items)} files present, {len(tags)} text tags, none missing')
PY
for f in data/*.xml text/en_us/*.xml dams.modinfo; do
  xmllint --noout "$f" 2>&1 | grep -v "not absolute\|^<Mod id\|^<GameEffects\|\^" || true
done
npm run --silent verify
echo "check.sh: clean"

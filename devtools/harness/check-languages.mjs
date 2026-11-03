// check-languages.mjs [locale ...] - reads t-<locale>-UI.log from run-languages.sh and checks each language's Dams
// text against the English run: the game's own text in that language, every key composed and not opening with the
// English, and each Civilopedia page opened with text and no raw markup (checked in the game on the full page). The
// "+1" and icon counts of each translation are the i18n test's job (tests/i18n.test.mjs). Exit 1 on any failure.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const all = ["en_US", "de_DE", "es_ES", "fr_FR", "it_IT", "ja_JP", "ko_KR", "pl_PL", "pt_BR", "ru_RU", "zh_Hans_CN", "zh_Hant_HK"];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
// The game cuts every log line at 1022 bytes, often inside a character, so whole JSON can't be parsed and long
// descriptions are clipped. The page flags (open, chars, raw) are computed in the game on the full text and come
// first in the line, so they're read by pattern; descriptions are compared by their opening.
function read(loc) {
  const f = [join(HERE, "full-logs", `t-${loc}-UI.log`), join(HERE, `t-${loc}-UI.log`)].find(existsSync);
  if (!f) return null;
  const text = {}, pedia = {};
  let library = null;
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m = line.match(/TEXT language=\S* library="([^"]*)"/);
    if (m) library = m[1];
    m = line.match(/TEXT (LOC_[A-Z0-9_]+) compose="(.*)/);
    if (m) text[m[1]] = m[2].replace(/"$/, "");
    m = line.match(/PEDIA (\S+) navigate=(\S+) read=\{"open":(true|false)/);
    if (m) {
      const chars = line.match(/"chars":(\d+)/), rawFlag = line.match(/"raw":(true|false)/);
      pedia[m[1]] = { navigate: m[2], open: m[3] === "true", chars: chars ? Number(chars[1]) : 0, raw: rawFlag ? rawFlag[1] === "true" : null };
    }
  }
  return { library, text, pedia };
}
const count = (s, re) => (String(s).match(re) || []).length;
const en = read("en_US");
if (!en) { console.log("no t-en_US-UI.log: run English first"); process.exit(1); }
let failed = 0;
for (const loc of wanted) {
  const r = read(loc);
  const problems = [];
  if (!r) { console.log(`${loc}: no log`); failed++; continue; }
  if (loc !== "en_US" && r.library === en.library) problems.push("game text still English (Library name matches)");
  for (const [k, enText] of Object.entries(en.text)) {
    const t = r.text[k];
    if (t === undefined) { problems.push(`${k} missing`); continue; }
    if (t.startsWith("LOC_") || !t.trim()) problems.push(`${k} not composed`);
    if (loc !== "en_US" && t.slice(0, 60) === enText.slice(0, 60)) problems.push(`${k} opens with the English text`);
  }
  for (const page of ["DAMS_OVERVIEW", "BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"]) {
    const p = r.pedia[page];
    if (!p) { problems.push(`${page} page not read`); continue; }
    if (!p.open || p.navigate !== "true") problems.push(`${page} navigate=${p.navigate} open=${p.open}`);
    if (p.raw !== false) problems.push(`${page} raw markup flag ${p.raw}`);
    if (!(p.chars > 200)) problems.push(`${page} only ${p.chars} characters`);
  }
  if (problems.length) failed++;
  console.log(`${loc}: ${problems.length ? "FAIL\n  " + problems.join("\n  ") : "ok"}`);
}
console.log(failed ? `${failed} language(s) failed` : `all ${wanted.length} passed`);
process.exit(failed ? 1 : 0);

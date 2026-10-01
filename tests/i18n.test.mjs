// i18n.test.mjs
//
// Every language file under text/<lang>/ must carry exactly the English tag set, each tag once, with the Language
// attribute the modinfo loads it under, the same markup as the English string and every number in it: [icon:...], [TIP:...],
// [/TIP], [B], [/B], [BLIST], [LI], [/LIST] and every number. A missing tag shows the player the English (or the raw
// tag); a duplicate rolls back the whole file; a broken token shows up as literal text in game.
//
// Run as a plain node script: `node ./tests/i18n.test.mjs` (also run by npm run verify).

import fs from "node:fs";
import path from "node:path";

const failures = [];
const fail = (m) => failures.push(m);
const read = (p) => fs.readFileSync(p, "utf8");
const unescape = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function entries(xml, kind) {
  const out = [];
  const re = kind === "Row"
    ? /<Row\s+Tag="([A-Z0-9_]+)"\s*>\s*<Text>([\s\S]*?)<\/Text>\s*<\/Row>/g
    : /<Replace\s+Tag="([A-Z0-9_]+)"\s+Language="([^"]+)"\s*>\s*<Text>([\s\S]*?)<\/Text>\s*<\/Replace>/g;
  for (const m of xml.matchAll(re)) out.push(kind === "Row" ? { tag: m[1], text: unescape(m[2]) } : { tag: m[1], lang: m[2], text: unescape(m[3]) });
  return out;
}
const tokens = (t) => (t.match(/\[(?:icon:[A-Z_]+|TIP:[A-Z0-9_]+|\/TIP|B|\/B|BLIST|LI|\/LIST)\]/g) || []).sort();
// "1000" is left out: the game's own name for the 1000-year flood drops the digits in some languages (zh: 千年洪災).
const numbers = (t) => (t.match(/\d+/g) || []).filter((n) => n !== "1000").sort();

const english = entries(read("text/en_us/DamsText.xml"), "Row");
const en = new Map(english.map((e) => [e.tag, e.text]));
if (en.size !== english.length) fail(`en_us: ${english.length - en.size} duplicate tag(s)`);

// The locales the modinfo loads, and the folder each one comes from.
const modinfo = read("dams.modinfo");
const loaded = new Map();
for (const m of modinfo.matchAll(/<Item locale="([^"]+)">text\/([a-z_]+)\/DamsText\.xml<\/Item>/g)) loaded.set(m[2], m[1]);
for (const dir of fs.readdirSync("text", { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "en_us")) {
  if (!loaded.has(dir.name)) fail(`${dir.name}: folder not loaded by dams.modinfo`);
}
for (const [dir, locale] of loaded) {
  const file = path.join("text", dir, "DamsText.xml");
  if (!fs.existsSync(file)) { fail(`${dir}: ${file} missing`); continue; }
  const xml = read(file);
  if (/<EnglishText>/.test(xml)) fail(`${dir}: uses EnglishText, not LocalizedText`);
  const rows = entries(xml, "Replace");
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.tag)) fail(`${dir}: duplicate ${r.tag}`);
    seen.add(r.tag);
    if (r.lang !== locale) fail(`${dir}: ${r.tag} has Language="${r.lang}", the modinfo loads "${locale}"`);
    if (!en.has(r.tag)) { fail(`${dir}: ${r.tag} is not an English tag`); continue; }
    const e = en.get(r.tag);
    if (!r.text.trim()) fail(`${dir}: ${r.tag} is empty`);
    if (tokens(r.text).join() !== tokens(e).join()) fail(`${dir}: ${r.tag} markup differs: ${tokens(r.text).join(" ")} vs ${tokens(e).join(" ")}`);
    // Every English number must survive; extra ones are fine (ja and ko write "one to three" and "a quarter" in digits).
    const have = numbers(r.text);
    const lost = numbers(e).filter((n) => { const k = have.indexOf(n); if (k < 0) return true; have.splice(k, 1); return false; });
    if (lost.length) fail(`${dir}: ${r.tag} loses number(s) ${lost.join(" ")}`);
  }
  for (const tag of en.keys()) if (!seen.has(tag)) fail(`${dir}: missing ${tag}`);
  const raw = (xml.match(/<Replace\b/g) || []).length;
  if (raw !== rows.length) fail(`${dir}: ${raw - rows.length} Replace element(s) the check could not read`);
}

if (failures.length) {
  console.error(`i18n check FAILED (${failures.length}):\n  ` + failures.join("\n  "));
  process.exit(1);
}
console.log(`i18n check passed (${loaded.size} languages x ${en.size} tags)`);

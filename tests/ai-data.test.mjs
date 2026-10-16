// ai-data.test.mjs
//
// The AI data gate for data/dams-ai.xml, the one list that raises the game's AI's score of a Dam (docs/DESIGN.md,
// "The AI and Dams").
//
// With no game needed:
//   - the file holds AI list rows only: one list, bound to TRAIT_LEADER_MAJOR_CIV as ConstructibleBiases, naming each
//     buildable Dam once at one value, with no Levee (the script places those) and no difficulty limits;
//   - every Item is a buildable Dam that data/dams.xml defines. AiFavoredItems.Item has no foreign key, so a misspelt
//     type would load without complaint and change nothing;
//   - dams.modinfo loads the file in the always-on game group, so every age gets it.
//
// Against a compiled gameplay database (DAMS_COMPILED_DB, or else the game's Debug/gameplay-copy.sqlite):
//   - AiListTypes, AiLists and AiFavoredItems have foreign keys only on ListType and the difficulties, so no row here
//     can point at something a player missing a DLC doesn't have (CLAUDE.md, "Any DLC, any version");
//   - TRAIT_LEADER_MAJOR_CIV is held by LEADER_DEFAULT, every major leader inherits from it, and no independent or
//     city-state leader does;
//   - the rows, inserted into a copy of that database the way the game inserts XML rows (plain INSERT, foreign keys
//     on), compile, and PRAGMA foreign_key_check on every table finds exactly what it found before the insert, which
//     on a clean compile is nothing.
// The database part is skipped with a message when there's no compiled database with the Dams in it. The original
// is opened read-only and the copy is deleted afterwards.
//
// Run as a plain node script: `node ./tests/ai-data.test.mjs` (also run by npm run verify).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const failures = [];
const fail = (m) => failures.push(m);
const read = (p) => fs.readFileSync(p, "utf8");
const stripComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, "");

function attrsOf(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2];
  return o;
}
/** Every `<Row …>` inside every `<table>…</table>` block of `xml`. */
function rowsIn(xml, table) {
  const out = [];
  for (const block of xml.matchAll(new RegExp(`<${table}(?:\\s[^>]*)?>([\\s\\S]*?)</${table}>`, "g"))) {
    for (const m of block[1].matchAll(/<Row(\s[^>]*?)\/?>/g)) out.push(attrsOf(m[1]));
  }
  return out;
}

const AI_FILE = "data/dams-ai.xml";
const AI_TABLES = ["AiListTypes", "AiLists", "AiFavoredItems"];
const ai = stripComments(read(AI_FILE));
const tables = [...new Set([...ai.matchAll(/<([A-Za-z_]+)(?:\s[^>]*)?>/g)].map((m) => m[1]))]
  .filter((t) => t !== "Database" && t !== "Row");
const rows = Object.fromEntries(AI_TABLES.map((t) => [t, rowsIn(ai, t)]));

// 1. The file: AI list rows only, one list for every major leader.
const extra = tables.filter((t) => !AI_TABLES.includes(t));
if (extra.length) fail(`${AI_FILE}: tables other than the AI lists (${extra.join(", ")}); a rule belongs in its own file`);
const listTypes = rows.AiListTypes.map((r) => r.ListType);
if (listTypes.length !== 1) fail(`${AI_FILE}: expected one AiListTypes row, found ${listTypes.length}`);
const LIST = listTypes[0];
const bindings = rows.AiLists;
if (bindings.length !== 1) fail(`${AI_FILE}: expected one AiLists row, found ${bindings.length}`);
for (const b of bindings) {
  if (b.ListType !== LIST) fail(`AiLists row names ${b.ListType}, not the declared list ${LIST}`);
  if (b.LeaderType !== "TRAIT_LEADER_MAJOR_CIV") fail(`AiLists row is bound to ${b.LeaderType}; every leader needs TRAIT_LEADER_MAJOR_CIV`);
  if (b.System !== "ConstructibleBiases") fail(`AiLists row has System ${b.System}, not ConstructibleBiases`);
  if (b.MinDifficulty || b.MaxDifficulty) fail("AiLists row is limited by difficulty; the nudge is for every game");
}

// 2. The items: each buildable Dam once, at one value.
const dams = stripComments(read("data/dams.xml"));
const buildable = rowsIn(dams, "Buildings").filter((r) => !r.TraitType).map((r) => r.ConstructibleType).sort();
const levees = rowsIn(dams, "Buildings").filter((r) => r.TraitType).map((r) => r.ConstructibleType);
if (buildable.length !== 3) fail(`data/dams.xml: expected three buildable Dams, found ${buildable.join(", ")}`);
const items = rows.AiFavoredItems;
for (const r of items) {
  if (r.ListType !== LIST) fail(`AiFavoredItems row for ${r.Item} names ${r.ListType}, not ${LIST}`);
  if (levees.includes(r.Item)) fail(`AiFavoredItems names the Levee ${r.Item}; the script places Levees, the AI never builds one`);
  else if (!buildable.includes(r.Item)) fail(`AiFavoredItems names ${r.Item}, which isn't a Dam data/dams.xml defines`);
  if (!/^-?\d+$/.test(r.Value || "")) fail(`AiFavoredItems row for ${r.Item} has no whole-number Value`);
  if (r.Favored === "false" || r.Favored === "0") fail(`AiFavoredItems row for ${r.Item} is unfavoured`);
  if (r.MinDifficulty || r.MaxDifficulty) fail(`AiFavoredItems row for ${r.Item} is limited by difficulty`);
}
const named = items.map((r) => r.Item).sort();
if (named.join() !== buildable.join()) fail(`AiFavoredItems names ${named.join(", ")}; expected each of ${buildable.join(", ")} once`);
const values = [...new Set(items.map((r) => r.Value))];
if (values.length !== 1) fail(`AiFavoredItems gives the Dams different values (${values.join(", ")}); one value for every age`);
const VALUE = Number(values[0]);
if (!(VALUE > 0)) fail(`AiFavoredItems value ${values[0]} doesn't raise the Dam`);

// 3. The modinfo loads it in every age.
const modinfo = read("dams.modinfo");
const group = modinfo.match(/<ActionGroup id="dams-game"[^>]*>([\s\S]*?)<\/ActionGroup>/);
if (!group) fail("dams.modinfo: no dams-game action group");
else {
  if (!/<ActionGroup id="dams-game"[^>]*criteria="always"/.test(modinfo)) fail("dams.modinfo: the dams-game group isn't always on");
  const update = group[1].match(/<UpdateDatabase>([\s\S]*?)<\/UpdateDatabase>/);
  if (!update || !update[1].includes(`<Item>${AI_FILE}</Item>`)) fail(`dams.modinfo: the dams-game group doesn't load ${AI_FILE}`);
}
const loads = (modinfo.match(new RegExp(`<Item>${AI_FILE.replace(".", "\\.")}</Item>`, "g")) || []).length;
if (loads !== 1) fail(`dams.modinfo loads ${AI_FILE} ${loads} times; a second load would insert the rows twice`);

// 4. A compiled database: foreign keys, the trait, and the rows compiled into a copy.
const sq = (s) => `'${String(s).replace(/'/g, "''")}'`;
function sqlite(args, input) {
  return execFileSync("sqlite3", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 26 });
}
/** Every table's foreign_key_check in one run: violation rows on stdout, schema mismatches on stderr. */
function fkCheck(db) {
  const names = sqlite([db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"]).trim().split("\n");
  const script = names.map((n) => `PRAGMA foreign_key_check(${sq(n)});`).join("\n");
  try {
    return { rows: sqlite([db], script).trim(), errors: "" };
  } catch (e) {
    // No -bail: sqlite3 runs every check and exits non-zero if any table's foreign keys don't match an index.
    return { rows: String(e.stdout || "").trim(), errors: String(e.stderr || "").trim() };
  }
}
function insertSql() {
  const lines = ["PRAGMA foreign_keys = ON;", "BEGIN;"];
  for (const t of AI_TABLES) {
    for (const r of rows[t]) {
      const cols = Object.keys(r);
      lines.push(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((c) => sq(r[c])).join(", ")});`);
    }
  }
  lines.push("COMMIT;");
  return lines.join("\n");
}
function findDb() {
  const live = path.join(os.homedir(), "Library/Application Support/Civilization VII/Debug/gameplay-copy.sqlite");
  return process.env.DAMS_COMPILED_DB || live;
}

let dbNote = "";
function checkCompiled() {
  const src = findDb();
  try { sqlite(["-version"]); } catch { dbNote = "SKIPPED the compiled-database check (no sqlite3 on PATH)"; return; }
  if (!fs.existsSync(src)) { dbNote = `SKIPPED the compiled-database check (no ${src}; set DAMS_COMPILED_DB)`; return; }
  const q = (sql) => sqlite(["-readonly", src, sql]).trim();
  let damRows = 0;
  try { damRows = Number(q(`SELECT count(*) FROM Constructibles WHERE ConstructibleType IN (${buildable.map(sq).join(", ")})`)); } catch { damRows = 0; }
  if (damRows !== buildable.length) {
    dbNote = `SKIPPED the compiled-database check (${src} holds no game with the Dams in it; launch one or set DAMS_COMPILED_DB)`;
    return;
  }

  // Foreign keys of the three tables: only ListType and the difficulties.
  const allowed = { AiListTypes: [], AiLists: ["AiListTypes", "Difficulties"], AiFavoredItems: ["AiListTypes", "Difficulties"] };
  for (const t of AI_TABLES) {
    const fks = q(`SELECT "from" || '>' || "table" FROM pragma_foreign_key_list(${sq(t)})`).split("\n").filter(Boolean);
    for (const fk of fks) {
      const [from, to] = fk.split(">");
      if (!allowed[t].includes(to) || !["ListType", "MinDifficulty", "MaxDifficulty"].includes(from)) {
        fail(`${t}.${from} now has a foreign key to ${to}; check the rows can't point at DLC content before shipping`);
      }
    }
  }

  // The trait reaches every major leader and nothing else.
  const holders = q("SELECT LeaderType FROM LeaderTraits WHERE TraitType = 'TRAIT_LEADER_MAJOR_CIV'").split("\n").filter(Boolean);
  if (!holders.includes("LEADER_DEFAULT")) fail(`TRAIT_LEADER_MAJOR_CIV isn't held by LEADER_DEFAULT (held by: ${holders.join(", ") || "nobody"})`);
  const majors = Number(q("SELECT count(*) FROM Leaders WHERE InheritFrom = 'LEADER_DEFAULT'"));
  if (!(majors > 0)) fail("no leader inherits from LEADER_DEFAULT, so the list would reach nobody");
  const strays = q(`SELECT LeaderType FROM Leaders WHERE (LeaderType = 'LEADER_INDEPENDENT' OR LeaderType LIKE 'LEADER_MINOR_CIV%')
    AND (InheritFrom = 'LEADER_DEFAULT' OR LeaderType IN (SELECT LeaderType FROM LeaderTraits WHERE TraitType = 'TRAIT_LEADER_MAJOR_CIV'))`);
  if (strays) fail(`independent or city-state leaders would get the Dam bias: ${strays.replace(/\n/g, ", ")}`);

  // Compile the rows into a copy.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dams-ai-"));
  const copy = path.join(dir, "gameplay.sqlite");
  try {
    sqlite(["-readonly", src, `.backup ${sq(copy)}`]);
    // A database compiled with this file in it already holds the rows: take them out first. Only rows that are this
    // file's (the Dams under one TRAIT_LEADER_MAJOR_CIV binding) come out; another mod's list of the same name stays,
    // and the insert below then collides with it as it would in the game.
    const held = sqlite([copy, `SELECT group_concat(Item) FROM (SELECT Item FROM AiFavoredItems WHERE ListType = ${sq(LIST)} ORDER BY Item)`]).trim();
    const bound = sqlite([copy, `SELECT group_concat(LeaderType || '/' || System) FROM AiLists WHERE ListType = ${sq(LIST)}`]).trim();
    const already = held === buildable.join() && bound === "TRAIT_LEADER_MAJOR_CIV/ConstructibleBiases";
    if (already) {
      sqlite([copy], `DELETE FROM AiFavoredItems WHERE ListType = ${sq(LIST)}; DELETE FROM AiLists WHERE ListType = ${sq(LIST)};
        DELETE FROM AiListTypes WHERE ListType = ${sq(LIST)};`);
    }
    const before = fkCheck(copy);
    if (before.rows) fail(`the compiled database already fails foreign_key_check before the insert:\n${before.rows.slice(0, 400)}`);
    try {
      sqlite(["-bail", copy], insertSql());
    } catch (e) {
      fail(`the rows don't compile: ${String(e.stderr || e.message).trim()}`);
      return;
    }
    const landed = sqlite([copy, `SELECT (SELECT count(*) FROM AiListTypes WHERE ListType = ${sq(LIST)}) || ' ' ||
      (SELECT count(*) FROM AiLists WHERE ListType = ${sq(LIST)}) || ' ' ||
      (SELECT count(*) FROM AiFavoredItems WHERE ListType = ${sq(LIST)} AND Value = ${VALUE})`]).trim();
    if (landed !== `1 1 ${buildable.length}`) fail(`after the insert the copy holds ${landed} rows (list, binding, items); expected 1 1 ${buildable.length}`);
    const after = fkCheck(copy);
    if (after.rows !== before.rows) fail(`foreign_key_check changed after the insert:\n${after.rows.slice(0, 400)}`);
    if (after.errors !== before.errors) fail(`foreign_key_check reported new schema errors after the insert:\n${after.errors}`);
    const mismatches = before.errors ? before.errors.split("\n").length : 0;
    dbNote = `compiled into a copy of ${path.basename(src)} (${majors} major leaders; ${already ? "the rows were already in it, re-inserted; " : ""}` +
      `foreign_key_check clean on every table${mismatches ? `, ${mismatches} base-game schema mismatch(es) unchanged` : ""})`;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
checkCompiled();

if (failures.length) {
  console.error(`ai-data check FAILED (${failures.length}):\n  ` + failures.join("\n  "));
  process.exit(1);
}
if (dbNote.startsWith("SKIPPED")) console.warn(`ai-data: ${dbNote}`);
console.log(`ai-data check passed ("${LIST}": ${items.length} Dams at +${VALUE} for TRAIT_LEADER_MAJOR_CIV${dbNote && !dbNote.startsWith("SKIPPED") ? `; ${dbNote}` : ""})`);

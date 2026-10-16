// broker-dams.mjs - read an AI_ConstructibleBroker.csv for the Dam: how often the AI weighed it, at what score, what it
// committed to instead, and the Dams it committed to. The e4 numbers in docs/DESIGN.md ("The AI and Dams") come from
// this script, so a rerun reads the same way.
//
//   node broker-dams.mjs e4-AI_ConstructibleBroker.csv
//   node broker-dams.mjs e7b-AI_ConstructibleBroker.csv --control e7a-AI_ConstructibleBroker.csv
//   DAM=LOC_BUILDING_DAM_ANTIQUITY_NAME node broker-dams.mjs <csv>        (another age's Dam)
//
// Columns: Game Turn, Player, Message, Consumer, Type, Budget, Amount, Request, value. A request row's last column is
// the score DESIGN.md quotes (e4: mean 558); its DISCOUNT VALUE row is the score a commit (MARKRUNNING) carries.
// --control compares two runs of one seed turn by turn: every row that doesn't name the Dam should match until a Dam
// commit changes the game, and every Dam score should be the control's times one ratio, 1 + V/100 if the bias landed.
import fs from "node:fs";

const DAM = process.env.DAM || "LOC_BUILDING_DAM_EXPLORATION_NAME";
const num = (s) => Number(String(s).trim());
const plotOf = (s) => (String(s).match(/-?\d+/g) || []).join(",");
const tail = (line) => { const m = line.trim().match(/\(([-\d.]+)\) ([-\d.]+)$/); return m ? Number(m[2]) : NaN; };

function parse(file) {
  const sections = []; const marks = []; const lines = []; let cur = null;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const p = line.split(",").map((x) => x.trim());
    if (p.length < 3 || !/^\d+$/.test(p[0])) continue;
    const turn = num(p[0]), player = num(p[1]), msg = p[2];
    lines.push({ turn, line: line.trim() });
    const st = msg.match(/^STARTING City (Economic|Production): (.*) SLOT (.*)$/);
    if (st) { cur = { turn, player, city: st[2], slot: st[3], reqs: [] }; sections.push(cur); continue; }
    if (msg === "TURN STARTING") { cur = null; continue; }
    if (msg.startsWith("MARKRUNNING")) {
      const m = msg.match(/^MARKRUNNING (\S+); \((-?\d+) (-?\d+)\)/);
      if (m) marks.push({ turn, player, item: m[1], plot: `${m[2]},${m[3]}`, value: tail(line) });
      continue;
    }
    if (!cur) continue;
    if (msg === "" && p.length >= 9 && p[7].startsWith("LOC_")) {
      const [item, plot] = p[7].split(";");
      cur.reqs.push({ item, plot: plotOf(plot), value: num(p[8]), disc: null });
    } else if (msg === "DISCOUNT VALUE") {
      const [item, plot] = p[5].split(";");
      const r = [...cur.reqs].reverse().find((x) => x.item === item && x.disc === null);
      if (r) { r.disc = tail(line); r.plot = plotOf(plot); }
    }
  }
  return { sections, marks, lines };
}
const sorted = (a) => [...a].sort((x, y) => x - y);
const q = (s, f) => { if (!s.length) return NaN; const k = (s.length - 1) * f, i = Math.floor(k), j = Math.min(i + 1, s.length - 1); return s[i] + (s[j] - s[i]) * (k - i); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "-");
const spread = (a) => { const s = sorted(a); return `n=${s.length} p10=${r0(q(s, 0.1))} p25=${r0(q(s, 0.25))} median=${r0(q(s, 0.5))} mean=${r0(mean(s))} max=${r0(s.at(-1))}`; };

function report(file) {
  const { sections, marks } = parse(file);
  const reqs = sections.flatMap((s) => s.reqs.filter((r) => r.item === DAM));
  console.log(`${file}\n  ${DAM}`);
  console.log(`  weighed ${reqs.length} times: mean ${r0(mean(reqs.map((r) => r.value)))}, max ${r0(Math.max(...reqs.map((r) => r.value)))} (discounted: ${spread(reqs.map((r) => r.disc).filter(Number.isFinite))})`);
  const weighedIn = new Set(sections.filter((s) => s.reqs.some((r) => r.item === DAM)).map((s) => `${s.player}:${s.city}`));
  const lastTurn = Math.max(...sections.map((s) => s.turn));
  const atEnd = new Set(sections.filter((s) => s.turn === lastTurn).map((s) => `${s.player}:${s.city}`));
  console.log(`  settlements that weighed it: ${weighedIn.size} of ${new Set(sections.map((s) => `${s.player}:${s.city}`)).size} seen (${atEnd.size} on turn ${lastTurn})`);
  console.log(`  every commit: ${spread(marks.map((m) => m.value))}`);
  const dams = marks.filter((m) => m.item === DAM);
  console.log(`  Dam commits: ${dams.length}${dams.length ? " - " + dams.map((m) => `t${m.turn} p${m.player} (${m.plot}) ${r0(m.value)}`).join("; ") : ""}`);
  // In the city-turns that weighed the Dam and committed something, how far the commit was above the Dam.
  const ratios = [];
  for (const s of sections) {
    const d = s.reqs.filter((r) => r.item === DAM && Number.isFinite(r.disc)).sort((a, b) => b.disc - a.disc)[0];
    if (!d) continue;
    const won = marks.find((m) => m.turn === s.turn && m.player === s.player &&
      s.reqs.some((r) => r.item === m.item && r.plot === m.plot && Math.abs(r.disc - m.value) < 0.01));
    if (won && won.item !== DAM) ratios.push({ ratio: won.value / d.disc, won });
  }
  const rs = sorted(ratios.map((r) => r.ratio));
  console.log(`  commits that beat it in its own city: ${spread(ratios.map((r) => r.won.value))}`);
  if (rs.length) {
    console.log(`  commit / Dam (discounted): p10=${q(rs, 0.1).toFixed(2)} p25=${q(rs, 0.25).toFixed(2)} median=${q(rs, 0.5).toFixed(2)}; ` +
      [2, 2.5, 3, 4, 5].map((x) => `x${x} tops ${rs.filter((r) => r < x).length}`).join(", ") + ` of ${rs.length}`);
  }
}

// Turn by turn from turn 1 until the two runs first differ in a row that doesn't name the Dam (a Dam commit changes
// the game from there on), pairing the Dam scores of the identical turns.
function compareRuns(file, control) {
  const a = parse(file).lines, b = parse(control).lines;
  const byTurn = (ls, t) => ls.filter((l) => l.turn === t).map((l) => l.line);
  const other = (ls) => ls.filter((l) => !l.includes(DAM));
  const val = (ls) => ls.filter((l) => l.includes(DAM) && !l.includes("MARKRUNNING")).map((l) => (l.includes("DISCOUNT VALUE") ? tail(l) : num(l.split(",").at(-1))));
  const last = Math.min(Math.max(...a.map((l) => l.turn)), Math.max(...b.map((l) => l.turn)));
  let same = 0; const ratios = [];
  for (let t = 1; t <= last; t++) {
    const ta = byTurn(a, t), tb = byTurn(b, t), oa = other(ta), ob = other(tb);
    if (oa.length !== ob.length || oa.some((l, i) => l !== ob[i])) break;
    const va = val(ta), vb = val(tb);
    if (va.length !== vb.length) break;
    va.forEach((v, i) => { if (vb[i]) ratios.push(v / vb[i]); });
    same = t;
  }
  console.log(`against ${control}: rows without the Dam identical through turn ${same}${same < last ? ` (they differ from turn ${same + 1})` : ""}; ` +
    `${ratios.length} Dam scores paired, ratio ${ratios.length ? `${Math.min(...ratios).toFixed(3)} to ${Math.max(...ratios).toFixed(3)}` : "-"}`);
}

const [file, flag, control] = process.argv.slice(2);
if (!file) { console.error("usage: node broker-dams.mjs <AI_ConstructibleBroker.csv> [--control <csv>]"); process.exit(2); }
report(file);
if (flag === "--control" && control) compareRuns(file, control);

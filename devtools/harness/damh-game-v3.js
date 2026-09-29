// damh-game-v3.js - V3, v1 for any age (START_AGE), with the capital founded first in Antiquity. From v1: dam sites in the shipped mod: each Dam requires the site marker; the mod marks one tile of each
// river where a Dam guards something for each AI, and the tile of each player order. Play Now (START_AGE, seed 9001),
// the mod alone (no grant probe).
//   S0  the marker in the database, the AI sites after the load (river, reason), marked tiles and their yields
//   S1  before Machinery the Dam is locked; after it, the capital's list offers river tiles, a production order on
//       an unmarked one marks it, enters the queue, and the Dam completes there and is drawn
//   S2  a second Dam bought on another river: it lands and is drawn
//   S3  Autoplay (AI science pushed): every AI Dam stands on a marked site on a river that floods
// The AI log (AI_ConstructibleBroker.csv) is checked after the run: every tile an AI weighed a Dam on was marked.
//   AI_VERBOSE=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-v1.js v1 3600 mod
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const TURNS = Number("__PROBE_OPTS__".replace(/\D/g, "")) || 40;
let local = -1;
const locOf = (i) => { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; };
const idx = (l) => GameplayMap.getIndexFromXY(l.x, l.y);
const feature = (l) => safe(() => { const f = GameplayMap.getFeatureType(l.x, l.y); return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType); }, "?");
const yieldsOf = (l) => safe(() => ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD"].map((y) => GameplayMap.getYield(l.x, l.y, YieldTypes[y], local)), "?");
const occ = (l) => safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []);
async function endTurns(n, perTurn) {
  const t = Game.turn;
  safe(() => { Autoplay.setTurns(n); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  let last = t;
  for (let k = 0; k < 1500 && Game.turn < t + n; k++) { await sleep(2000); if (Game.turn !== last) { last = Game.turn; if (perTurn) perTurn(); } }
  await sleep(12000); safe(() => Autoplay.setActive(false)); await sleep(4000);
}
function research(node) {
  const op = PlayerOperationTypes.SET_TECH_TREE_NODE;
  const tryNode = (name) => { const h = safe(() => GameInfo.Types.lookup(name).Hash, null); for (const v of [name, h]) { if (v == null) continue; const a = { ProgressionTreeNodeType: v }; const c = safe(() => Game.PlayerOperations.canStart(local, op, a, false), null); if (c && c.Success) { Game.PlayerOperations.sendRequest(local, op, a); return true; } } return false; };
  if (tryNode(node)) return node;
  let chose = null; const prefix = node.slice(0, 13);
  safe(() => GameInfo.ProgressionTreeNodes.forEach((n) => { const t = String(n.ProgressionTreeNodeType); if (!chose && t.startsWith(prefix) && !safe(() => Players.get(local).Techs.isNodeUnlocked(t), false) && tryNode(t)) chose = t; }));
  return chose;
}
function sitesNow(M) { return Object.entries(M.loadSites()).map(([p, r]) => { const l = locOf(Number(p)); return `${l.x},${l.y}:${feature(l) || "-"}:${r.was || "bare"}${r.order ? ":order" : ""}:${J(yieldsOf(l))}`; }); }

async function ensureCapital() {
  const op = safe(() => PlayerOperationTypes.ADVANCED_START_MARK_COMPLETED, null);
  if (op != null) { const can = safe(() => Game.PlayerOperations.canStart(local, op, {}, false), null); if (can && can.Success) safe(() => Game.PlayerOperations.sendRequest(local, op, {})); }
  await sleep(2000);
  if (safe(() => Players.get(local).Cities.getCapital(), null)) return "capital";
  for (const id of safe(() => Players.get(local).Units.getUnitIds(), [])) {
    const u = safe(() => Units.get(id), null); if (!u) continue;
    const can = safe(() => Game.UnitOperations.canStart(id, "UNITOPERATION_FOUND_CITY", {}, false), null);
    if (can && can.Success) { safe(() => Game.UnitOperations.sendRequest(id, "UNITOPERATION_FOUND_CITY", { X: u.location.x, Y: u.location.y })); break; }
  }
  for (let k = 0; k < 40 && !safe(() => Players.get(local).Cities.getCapital(), null); k++) await sleep(250);
  return safe(() => Players.get(local).Cities.getCapital(), null) ? "founded" : "none";
}
async function run() {
  local = GameContext.localPlayerID;
  emit(`P capital=${await ensureCapital()}`);
  const M = globalThis.__dams; const def = M.thisAgesDam();
  const node = safe(() => String(GameInfo.ProgressionTreeNodeUnlocks.find((r) => String(r.TargetType) === def.ConstructibleType).ProgressionTreeNodeType), "?");
  await sleep(10000);
  emit(`S0 turn=${Game.turn} dam=${def.ConstructibleType} node=${node} markerRow=${!!safe(() => GameInfo.Features.lookup("FEATURE_DAMS_SITE"), null)} required=${safe(() => GameInfo.Constructible_RequiredFeatures.filter((r) => String(r.FeatureType) === "FEATURE_DAMS_SITE").length)} aiSites=${J([...M.aiSites()].map(([p, w]) => { const l = locOf(p); return `${l.x},${l.y}@${w.pid} river ${w.river} ${w.why}`; }))} marked=${J(sitesNow(M))}`);
  const cap = Players.get(local).Cities.getCapital();
  const verdict = (at) => { const a = { ConstructibleType: def.$index }; if (at) { a.X = at.x; a.Y = at.y; } const r = safe(() => Game.CityOperations.canStart(cap.id, CityOperationTypes.BUILD, a, false), null); return r ? { ok: r.Success, locked: r.Locked, need: r.NeededUnlock, why: r.FailureReasons, plots: (r.Plots || []).map((p) => { const l = locOf(p); return `${l.x},${l.y}`; }) } : null; };
  emit(`S1a before the tech: ${J(verdict())}`);
  for (let i = 0; i < 20 && !safe(() => Players.get(local).Techs.isNodeUnlocked(node), false); i++) {
    const chose = research(node); safe(() => Players.grantYield(local, YieldTypes.YIELD_SCIENCE, 5000));
    await endTurns(1); local = local >= 0 ? local : GameContext.localObserverID;
    if (chose === node) emit(`T research ${node} turn=${Game.turn}`);
  }
  const v = verdict();
  emit(`S1b after the tech: ${J(v)}`);
  const pick = (v && v.plots || []).map((s) => { const [x, y] = s.split(",").map(Number); return { x, y }; }).find((l) => feature(l) !== "FEATURE_DAMS_SITE");
  if (pick) {
    const y0 = yieldsOf(pick); const f0 = feature(pick);
    const args = { ConstructibleType: def.$index, X: pick.x, Y: pick.y };
    const one = verdict(pick);
    const sent = safe(() => Game.CityOperations.sendRequest(cap.id, CityOperationTypes.BUILD, args), "ERR");
    await sleep(9000);
    const q = safe(() => (cap.BuildQueue.getQueue() || []).map((i) => safe(() => String(GameInfo.Constructibles.lookup(i.constructibleType).ConstructibleType), J(i))), "?");
    emit(`S1c order at ${pick.x},${pick.y}: perPlot=${J(one && { ok: one.ok, why: one.why })} sent=${J(sent)} feature ${f0 || "-"} -> ${feature(pick)} yields ${J(y0)} -> ${J(yieldsOf(pick))} queue=${J(q)}`);
    safe(() => cap.BuildQueue.addProgress(Number(def.Cost) * 3));
    await endTurns(1); await sleep(5000);
    M.forget();
    const built = occ(pick).includes(def.ConstructibleType);
    emit(`S1 ${built && M.drawn().includes(idx(pick)) ? "PASS" : "FAIL"} player's Dam at ${pick.x},${pick.y}: tile=${J(occ(pick))} drawn=${M.drawn().includes(idx(pick))} feature=${feature(pick)}`);
  } else emit("S1 FAIL no plot offered");
  // S2
  local = local >= 0 ? local : GameContext.localObserverID;
  let second = null;
  for (const c of Players.get(local).Cities.getCities() || []) {
    const r = safe(() => Game.CityCommands.canStart(c.id, CityCommandTypes.PURCHASE, { ConstructibleType: def.$index }, false), null);
    for (const p of (r && r.Plots) || []) { const l = locOf(p); if (!second && !occ(l).includes(def.ConstructibleType)) second = { c, l }; }
  }
  if (second) {
    safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, 8000)); await sleep(3000);
    const args = { ConstructibleType: def.$index, X: second.l.x, Y: second.l.y };
    const sent = safe(() => Game.CityCommands.sendRequest(second.c.id, CityCommandTypes.PURCHASE, args), "ERR");
    await sleep(12000); M.forget();
    emit(`S2 ${occ(second.l).includes(def.ConstructibleType) ? "PASS" : "FAIL"} bought Dam at ${second.l.x},${second.l.y} (river ${M.riverAt(second.l)}): sent=${J(sent)} tile=${J(occ(second.l))} drawn=${M.drawn().includes(idx(second.l))}`);
  } else emit("S2 SKIP no second river tile offered for purchase");
  // S3
  const push = () => { for (const pid of M.aiMajors()) safe(() => Players.grantYield(pid, YieldTypes.YIELD_SCIENCE, 900)); };
  const start = Game.turn;
  engine.on("TurnBegin", () => { const t = safe(() => Game.turn, 0); if ((t - start) % 10 === 0) emit(`Q t${t} aiTech=${J(M.aiMajors().map((p) => `${p}:${safe(() => Players.get(p).Techs.isNodeUnlocked(node), "?")}`))} marked=${J(sitesNow(M))} dams=${J(M.damsOnMap().map((d) => `${d.loc.x},${d.loc.y}@${d.owner}:${d.complete ? "done" : "building"}`))}`); });
  await endTurns(TURNS, push);
  local = local >= 0 ? local : GameContext.localObserverID;
  M.forget();
  const dams = M.damsOnMap();
  const ai = dams.filter((d) => d.owner !== local);
  const bad = ai.filter((d) => !M.riverFloods(d.river) || feature(d.loc) !== "FEATURE_DAMS_SITE" && !(idx(d.loc) in M.loadSites()));
  emit(`S3 ${bad.length === 0 ? "PASS" : "FAIL"} every AI Dam on a marked site of a flooding river (${ai.length} AI Dams: ${J(ai.map((d) => `${d.loc.x},${d.loc.y}@${d.owner} river ${d.river} floods=${M.riverFloods(d.river)} ${d.complete ? "done" : "building"} feature=${feature(d.loc)}`))}; all Dams ${dams.length})`);
  if (ai[0]) { safe(() => Camera.lookAtPlot(ai[0].loc, { zoom: 0.25 })); await sleep(5000); emit("SHOT ai-own-dam"); await sleep(12000); }
  finishNow("read");
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness v3 finished"), 4000); }
emit("attached v1 dam sites");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(run, 20000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

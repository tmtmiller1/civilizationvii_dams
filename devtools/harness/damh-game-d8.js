// damh-game-d8.js - D8. Can a Dam take the flood's fertility away from its river? The flood leaves yields behind
// ("Fertility Added = N" in Game_RandomEvents.csv, +1/+2 Food on the tiles); a dammed river should stop gaining it.
// Two routes, measured side by side against a control, under frequent floods:
//   route CLEAR  the floodplain feature is removed from the river's tiles (D2: the river still floods - but does the
//                tile still gain?)
//   route UNDO   the tiles keep their feature; after each flood the script puts the yields back
//                (WorldBuilder.MapPlots.setFertility, or whatever S0 finds)
//   S0  the surface: GameplayMap.getFertilityType, MapPlotYields.getYieldModifiers, FertilityBuilder,
//       WorldBuilder.MapPlots.setFertility signatures, city NumRandomEventsFertility
//   S1  three rivers picked and their tiles' baseline (fertility type, Food/Production, yield modifiers)
//   S2  roll turns; log PlotFertilityChanged and RandomEventOccurred; after each flood, per-tile deltas, then try
//       the UNDO writes on that river and re-read
//   S9  verdict: does either route stop the gain?
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d8.js d8 1500 floods
const TAG = "[DAM]";
const MAX_TURNS = 24;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(x, y) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(x, y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), "?"); }
function members(o) { if (!o) return null; const out = new Set(); for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor") out.add(k); return [...out].sort(); }
let local = -1;
function fert(l) { return safe(() => GameplayMap.getFertilityType(l.x, l.y), "ERR"); }
function yld(l, t) { return safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes[t], local), null); }
function mods(l) { return safe(() => MapPlotYields.getYieldModifiers(idxOf(l)), "ERR"); }
function snap(l) { return { x: l.x, y: l.y, f: fert(l), food: yld(l, "YIELD_FOOD"), prod: yld(l, "YIELD_PRODUCTION"), feature: featureName(l) }; }
function diff(a, b) { return { f: a.f === b.f ? 0 : `${a.f}->${b.f}`, food: (b.food ?? 0) - (a.food ?? 0), prod: (b.prod ?? 0) - (a.prod ?? 0) }; }

const events = { PlotFertilityChanged: 0, RandomEventOccurred: 0, PlotYieldChanged: 0 };
const fertPlots = new Map(); const occurred = [];
function hook() {
  safe(() => engine.on("PlotFertilityChanged", (d) => { events.PlotFertilityChanged++; if (d && d.location) fertPlots.set(idxOf(d.location), Game.turn); if (events.PlotFertilityChanged <= 10) emit(`EV PlotFertilityChanged #${events.PlotFertilityChanged} turn ${Game.turn} ${J(d)}`); }));
  safe(() => engine.on("RandomEventOccurred", (d) => { events.RandomEventOccurred++; occurred.push({ turn: Game.turn, type: safe(() => GameInfo.RandomEvents.lookup(d.eventType)?.RandomEventType, d.eventType), at: d.location }); }));
  safe(() => engine.on("PlotYieldChanged", () => { events.PlotYieldChanged++; }));
}
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
/** Every way a script might write fertility back; the first that moves the read wins. */
function undoWrites(l, want) {
  const tries = [];
  const wb = safe(() => WorldBuilder.MapPlots, null);
  if (wb && typeof wb.setFertility === "function") {
    tries.push(["setFertility(idx, want)", () => wb.setFertility(idxOf(l), want)]);
    tries.push(["setFertility(want, loc)", () => wb.setFertility(want, { x: l.x, y: l.y })]);
    tries.push(["setFertility(loc, want)", () => wb.setFertility({ x: l.x, y: l.y }, want)]);
  }
  const fb = safe(() => FertilityBuilder, null);
  if (fb && typeof fb.setFertilityType === "function") tries.push(["FertilityBuilder.setFertilityType(idx, want)", () => fb.setFertilityType(idxOf(l), want)]);
  return tries;
}
async function run() {
  local = GameContext.localPlayerID;
  emit(`S0 getFertilityType=${typeof GameplayMap.getFertilityType} MapPlotYields=${J(members(safe(() => MapPlotYields, null)))}`);
  emit(`S0 FertilityBuilder=${J(members(safe(() => FertilityBuilder, null)))} WorldBuilder.MapPlots=${J(members(safe(() => WorldBuilder.MapPlots, null)))} isActive=${J(safe(() => WorldBuilder.isActive, "?"))}`);
  hook();
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  // Rivers with floodplains, ranked; three groups.
  const rivers = [];
  const n = safe(() => MapRivers.numRivers, 0);
  for (let i = 0; i < n; i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    const fp = plots.filter((l) => isFloodplain(l.x, l.y));
    if (fp.length >= 3) rivers.push({ i, id, fp, name: safe(() => Locale.compose(GameplayMap.getRiverName(fp[0].x, fp[0].y) || ""), "") });
  }
  rivers.sort((a, b) => b.fp.length - a.fp.length);
  if (rivers.length < 3) return finishNow(`only ${rivers.length} rivers with 3+ floodplains`);
  const [CLEAR, UNDO, CTRL] = rivers;
  CLEAR.group = "clear"; UNDO.group = "undo"; CTRL.group = "control";
  const base = new Map();
  for (const r of [CLEAR, UNDO, CTRL]) for (const l of r.fp) base.set(idxOf(l), { ...snap(l), group: r.group, river: r.i });
  emit(`S1 rivers=${J([CLEAR, UNDO, CTRL].map((r) => ({ group: r.group, i: r.i, name: r.name, tiles: r.fp.length })))}`);
  emit(`S1 baseline=${J([...base.values()])}`);
  emit(`S1 yieldModifiers sample=${J(mods(CTRL.fp[0]))}`);
  const cityOf = (l) => safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.owner >= 0 ? Cities.get(c) : null; }, null);
  const cityFert = () => safe(() => [...new Set([CLEAR, UNDO, CTRL].flatMap((r) => r.fp.map(cityOf)).filter(Boolean))].map((c) => ({ name: safe(() => Locale.compose(c.name), "?"), n: safe(() => c.NumRandomEventsFertility ?? c.numRandomEventsFertility, "?") })), "?");
  emit(`S1 city fertility counters=${J(cityFert())}`);
  // route CLEAR: take the floodplain features off that river now
  safe(() => { WorldBuilder.startBlock(); for (const l of CLEAR.fp) WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, l); WorldBuilder.endBlock(); });
  await sleep(3000);
  emit(`S1 after clearing ${CLEAR.fp.length} features: ${J(CLEAR.fp.map(snap))}`);
  let undoReport = "no flood on the UNDO river yet";
  for (let t = 0; t < MAX_TURNS; t++) {
    const ok = await roll();
    // Undo on the UNDO river: put every tile back to its baseline fertility.
    const moved = UNDO.fp.filter((l) => { const b = base.get(idxOf(l)); const s = snap(l); return s.f !== b.f || (s.food ?? 0) !== (b.food ?? 0); });
    if (moved.length && undoReport.startsWith("no flood")) {
      const l = moved[0], b = base.get(idxOf(l));
      const before = snap(l);
      const results = [];
      for (const [label, fn] of undoWrites(l, b.f)) { const r = safe(fn, "ERR"); await sleep(1200); results.push({ label, r, now: snap(l) }); }
      undoReport = `tile ${J({ x: l.x, y: l.y })} base=${J(b)} afterFlood=${J(before)} writes=${J(results)}`;
      emit(`S2 UNDO ${undoReport}`);
    }
    if (t % 4 === 3 || moved.length) emit(`S2 turn ${Game.turn} floods=${occurred.length} events=${J(events)} fertPlots=${fertPlots.size} moved(undo)=${moved.length}`);
    if (!ok) break;
    if (occurred.length >= 10 && t >= 10) break;
  }
  const rows = [...base.entries()].map(([i, b]) => ({ ...b, now: snap(locOf(i)), d: diff(b, snap(locOf(i))) }));
  const byGroup = rows.reduce((m, r) => { const g = (m[r.group] = m[r.group] || { tiles: 0, gainedFood: 0, gainedProd: 0, fertMoved: 0, totalFood: 0 }); g.tiles++; if (r.d.food > 0) g.gainedFood++; if (r.d.prod > 0) g.gainedProd++; if (r.d.f !== 0) g.fertMoved++; g.totalFood += r.d.food; return m; }, {});
  emit(`S3 rows=${J(rows)}`);
  emit(`S3 floods=${J(occurred)}`);
  emit(`S3 city fertility counters=${J(cityFert())} fertPlotsSeen=${J([...fertPlots.keys()].slice(0, 20))}`);
  finishNow(`byGroup=${J(byGroup)} events=${J(events)} undo=${undoReport.slice(0, 300)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d8 finished"), 4000); }
emit("attached d8");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

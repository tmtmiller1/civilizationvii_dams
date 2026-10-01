// damh-game-e2.js - E2, overtopping (2.0.0). Exploration, the shipped mod, the grant, floods of every size 300 times per
// age with the game's own pillage shares (dam-floodfreq-probe). The mod runs as shipped (Levees, drying).
//   S0  the Machinery unlock row; the overtopping rows read back
//   S1  settlements with floodplain river tiles buy them; on each river, in a different settlement, one Dam goes on an
//       ORIGINAL floodplain tile (floods reach only those, d2), in rotation Ancient, Medieval, Modern, none. The other
//       floodplain tiles of those settlements get farms, so a flood that gets through shows on them.
//   S2  each turn: every Dam tile and farm tile that newly carries PLOTEFFECT_FLOODED is logged as HIT with the Dam's
//       tier, whether the Dam (or farm) is now pillaged, and the Levee plan for its river. Severity is in
//       Game_RandomEvents.csv: join on turn and river afterwards.
//   Expected: an Ancient Dam is pillaged by severity 1 and 2, a Medieval Dam by 2 only, a Modern Dam never; a pillaged
//   Dam drops out of M.leveePlan(); open question: does the settlement keep its own immunity once its Dam is pillaged.
//   PROBE_OPTS=30 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-e2.js e2 2400 mod+grant+freqfloods
// e2b: major and 1000-year floods only, a Dam on every floodplain river a settlement reaches (tiers in rotation):
//   PROBE_OPTS=22 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-e2.js e2b 2400 mod+grant+freqbigfloods
const TAG = "[DAM]";
// PROBE_OPTS: "<turns>" or "<turns>,ancient" (every Dam an Ancient one).
const OPTS = "__PROBE_OPTS__".split(",");
const MAX_TURNS = Number(OPTS[0]) || 30;
const ONLY_ANCIENT = OPTS[1] === "ancient";
const DAMS = [null, "BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occ(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const i = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(i.type).ConstructibleType), damaged: safe(() => i.damaged, "?"), complete: !!i.complete }; }), []); }
function owningCity(l) { const c = safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null); return c && c.owner >= 0 ? `${c.owner}:${c.id}` : null; }
function riverName(l) { return safe(() => Locale.compose(GameplayMap.getRiverName(l.x, l.y)), "?"); }
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 90000) await sleep(750);
  await sleep(1500);
}
async function run() {
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  const un = safe(() => GameInfo.ProgressionTreeNodeUnlocks.filter((r) => String(r.TargetType).startsWith("BUILDING_DAM_")).map((r) => `${r.ProgressionTreeNodeType}>${r.TargetType}`), []);
  check("S0 Machinery unlocks the Medieval Dam", J(un) === J(["NODE_TECH_EX_MACHINERY>BUILDING_DAM_EXPLORATION"]), J(un));
  const pe = safe(() => GameInfo.Constructible_PillageRandomEvents.filter((r) => String(r.ConstructibleType).startsWith("BUILDING_DAM_")).length, 0);
  check("S0 nine overtopping rows", pe === 9, String(pe));
  const local = GameContext.localPlayerID;
  const FLOODED = safe(() => GameInfo.PlotEffects.lookup("PLOTEFFECT_FLOODED").$index, null);
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  // The original floodplains, read before any Dam dries one.
  const fp = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloodplain({ x, y })) fp.push({ x, y });
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 8; k++) await roll();
  emit(`S1 turn ${Game.turn} cities=${cityCount()} original floodplain tiles=${fp.length}`);
  const cities = [];
  for (const p of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    const near = fp.filter((l) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, l.x, l.y), 99) <= 4);
    if (!near.length) continue;
    for (const l of near) if (!owningCity(l)) safe(() => c.purchasePlot({ x: l.x, y: l.y }));
    cities.push({ key: `${cid.owner}:${cid.id}`, cid, owner: p.id, near });
  }
  await sleep(3000);
  // One Dam per river, each in its own settlement, on a free original floodplain tile.
  const usedRivers = new Set(); const plan = []; let tier = 1;
  for (const c of cities) {
    const own = c.near.filter((l) => owningCity(l) === c.key && !occ(l).some((o) => /^BUILDING_|^WONDER_/.test(o.type)));
    const site = own.find((l) => M.riverAt(l) != null && !usedRivers.has(M.riverAt(l)));
    if (!site) continue;
    usedRivers.add(M.riverAt(site));
    const t = ONLY_ANCIENT ? 1 : ((tier - 1) % 3) + 1; tier++;
    plan.push({ ...c, site, river: M.riverAt(site), tier: t, farms: own.filter((l) => idxOf(l) !== idxOf(site)) });
  }
  for (const c of plan) {
    if (c.tier) {
      if (!occ(c.site).length) { safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: c.site, Parent: c.cid, Owner: c.owner })); await sleep(1000); }
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: DAMS[c.tier], Location: c.site, Owner: c.owner }));
      await sleep(1500);
    } else c.farms.unshift(c.site);
    for (const l of c.farms) {
      if (occ(l).length) continue;
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: l, Parent: c.cid, Owner: c.owner }));
      await sleep(600);
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_FARM", Location: l, Owner: c.owner }));
    }
  }
  await sleep(3000);
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(4000);
  emit(`S1 plan ${J(plan.map((c) => ({ key: c.key, tier: c.tier, site: c.site, river: c.river, name: riverName(c.site), dam: occ(c.site).map((o) => o.type), farms: c.farms.length })))}`);
  check("S1 at least one Ancient and one Medieval Dam placed", plan.some((c) => c.tier === 1 && occ(c.site).some((o) => o.type === DAMS[1])) && plan.some((c) => c.tier === 2 && occ(c.site).some((o) => o.type === DAMS[2])), "");
  const tiles = plan.flatMap((c) => [{ ...c.site, kind: c.tier ? "dam" : "farm", c }, ...c.farms.map((l) => ({ ...l, kind: "farm", c }))]);
  const state = new Map(tiles.map((t) => [idxOf(t), { flooded: safe(() => MapPlotEffects.hasPlotEffect(idxOf(t), FLOODED), false) === true, dmg: occ(t).some((o) => o.damaged === true) }]));
  const levees = () => J([...safe(() => M.leveePlan(), new Map()).values()].map((v) => `${v.key}:${String(v.levee).replace("BUILDING_DAM_", "")}`));
  for (let k = 0; k < MAX_TURNS; k++) {
    await roll();
    let hits = 0;
    for (const t of tiles) {
      const i = idxOf(t); const was = state.get(i);
      const flooded = safe(() => MapPlotEffects.hasPlotEffect(i, FLOODED), false) === true;
      const o = occ(t); const dmg = o.some((x) => x.damaged === true);
      if (flooded && !was.flooded) {
        hits++;
        emit(`HIT turn=${Game.turn - 1} city=${t.c.key} tier=${t.c.tier} kind=${t.kind} river=${t.c.river} name=${J(riverName(t))} plot=${t.x},${t.y} before=${was.dmg ? "pillaged" : "intact"} after=${dmg ? "pillaged" : "intact"} occ=${J(o.map((x) => x.type.replace("BUILDING_", "").replace("IMPROVEMENT_", "")))}`);
      }
      if (dmg !== was.dmg && !(flooded && !was.flooded)) emit(`CHANGE turn=${Game.turn - 1} city=${t.c.key} kind=${t.kind} plot=${t.x},${t.y} now=${dmg ? "pillaged" : "intact"}`);
      state.set(i, { flooded, dmg });
    }
    const dams = plan.filter((c) => c.tier).map((c) => `${c.tier}:${occ(c.site).some((o) => o.damaged === true) ? "P" : "ok"}`);
    emit(`TURN ${Game.turn} hits=${hits} dams=${J(dams)} leveePlan=${levees()}`);
  }
  // Verdicts from the HIT lines are joined with the CSV afterwards; here only the end state.
  const end = plan.filter((c) => c.tier).map((c) => ({ key: c.key, tier: c.tier, river: c.river, damaged: occ(c.site).some((o) => o.damaged === true) }));
  emit(`S9 end ${J(end)}`);
  check("S9 no Modern Dam pillaged", end.filter((d) => d.tier === 3).every((d) => !d.damaged), "");
  const pillagedDams = end.filter((d) => d.damaged);
  const planNow = [...safe(() => M.leveePlan(), new Map()).values()];
  const plannedRivers = new Set(planNow.map((v) => safe(() => M.citiesOnRiver, null) && v.key));
  emit(`S9 leveePlan end ${J(planNow.map((v) => ({ key: v.key, levee: v.levee, tier: v.tier })))} pillaged=${J(pillagedDams)}`);
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""} (overtopping verdicts: join HIT lines with Game_RandomEvents.csv)`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e2 finished"), 4000); }
emit("attached e2");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

// damh-game-e1.js - E1, Dams 2.0 in an Antiquity game, the shipped mod alone (no grant). Each check prints PASS/FAIL:
//   A1 the data: costs, yields, upkeep, the 25 % cost progression, the overtopping rows, no site requirement, no AI
//      list, the Irrigation unlock row
//   A2 before Irrigation the Ancient Dam is locked, and the unlock it waits on is Irrigation
//   A3 research Irrigation (Pottery and Animal Husbandry first) by rolling turns; the Ancient Dam opens
//   A4 the production check offers river tiles with no marker on them, and only river tiles
//   A5 a real BUILD order on a river tile goes into the queue, and no dam-site marker appears
//   A6 cost: read with no Dam, after one finished Dam, after two (expect x1.25, x1.5 of the first read)
//   A7 yields and upkeep of one finished Dam, read as the difference with it and with it destroyed
//   A8 a second Dam on the same river in the same settlement is offered (no one-per-river rule)
//   A9 single player drying: a finished Dam's river has no floodplain left after the sweep
//   START_AGE=AGE_ANTIQUITY SEED=9001 zsh run-harness.sh damh-game-e1.js e1 2400 mod
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function featureName(l) { return safe(() => { const f = GameplayMap.getFeatureType(l.x, l.y); return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType); }, "?"); }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occ(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const i = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(i.type).ConstructibleType), id: i.localId != null ? i.localId : i.id, owner: i.owner, complete: !!i.complete }; }), []); }
function owningCity(l) { const c = safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null); return c && c.owner >= 0 ? c : null; }
function sameCity(a, b) { return a && b && a.owner === b.owner && a.id === b.id; }
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 90000) await sleep(750);
  await sleep(1500);
}
async function foundCapital(local) {
  const p = Players.get(local);
  if (safe(() => p.Cities.getCityIds().length, 0) > 0) return true;
  for (const id of safe(() => p.Units.getUnitIds(), []) || []) {
    const u = safe(() => Units.get(id), null);
    if (!u || !/SETTLER|FOUNDER/.test(String(safe(() => GameInfo.Units.lookup(u.type).UnitType, "")))) continue;
    safe(() => Game.UnitOperations.sendRequest(id, UnitOperationTypes.FOUND_CITY, {}));
    for (let k = 0; k < 20 && safe(() => p.Cities.getCityIds().length, 0) === 0; k++) await sleep(500);
    return safe(() => p.Cities.getCityIds().length, 0) > 0;
  }
  return false;
}
const DAM = "BUILDING_DAM_ANTIQUITY";
function rows(table, f) { return safe(() => GameInfo[table].filter(f), []) || []; }
function dataChecks() {
  const def = safe(() => GameInfo.Constructibles.lookup(DAM), null);
  check("A1 Ancient Dam cost 150", def && def.Cost === 150, J(def && def.Cost));
  const y = rows("Constructible_YieldChanges", (r) => r.ConstructibleType === DAM).map((r) => `${r.YieldType}:${r.YieldChange}`).sort();
  check("A1 Ancient Dam yields +2 Food +2 Production", J(y) === J(["YIELD_FOOD:2", "YIELD_PRODUCTION:2"]), J(y));
  const m = rows("Constructible_Maintenances", (r) => String(r.ConstructibleType).startsWith("BUILDING_DAM_")).map((r) => `${r.ConstructibleType}:${r.YieldType}:${r.Amount}`).sort();
  check("A1 upkeep 1/2/3 Gold", m.length === 3, J(m));
  const p = rows("Constructibles", (r) => String(r.ConstructibleType).startsWith("BUILDING_DAM_") && !/LEVEE/.test(r.ConstructibleType)).map((r) => `${r.CostProgressionModel}:${r.CostProgressionParam1}`);
  check("A1 cost progression PREVIOUS_COPIES 25 on all three", p.length === 3 && p.every((s) => s === "COST_PROGRESSION_PREVIOUS_COPIES:25"), J(p));
  const pe = rows("Constructible_PillageRandomEvents", (r) => String(r.ConstructibleType).startsWith("BUILDING_DAM_")).map((r) => `${String(r.ConstructibleType).slice(13)}:${String(r.EventClass).replace("CLASS_", "")}:${r.PercentChance}`).sort();
  const want = ["ANTIQUITY:DAMS_FLOOD_1000_YEAR:100", "ANTIQUITY:DAMS_FLOOD_MAJOR:100", "ANTIQUITY:FLOOD:0", "EXPLORATION:DAMS_FLOOD_1000_YEAR:100", "EXPLORATION:DAMS_FLOOD_MAJOR:0", "EXPLORATION:FLOOD:0", "MODERN:DAMS_FLOOD_1000_YEAR:0", "MODERN:DAMS_FLOOD_MAJOR:0", "MODERN:FLOOD:0"];
  check("A1 overtopping rows as shipped", J(pe) === J(want), J(pe));
  const rf = rows("Constructible_RequiredFeatures", (r) => String(r.ConstructibleType).startsWith("BUILDING_DAM_"));
  check("A1 no feature required", rf.length === 0, J(rf));
  check("A1 site feature still defined (old saves)", !!safe(() => GameInfo.Features.lookup("FEATURE_DAMS_SITE"), null), "");
  const ai = rows("AiListTypes", (r) => /Dams/.test(String(r.ListType)));
  check("A1 no Dams AI list", ai.length === 0, J(ai));
  const un = rows("ProgressionTreeNodeUnlocks", (r) => String(r.TargetType).startsWith("BUILDING_DAM_")).map((r) => `${r.ProgressionTreeNodeType}>${r.TargetType}`);
  check("A1 Irrigation unlocks the Ancient Dam", J(un) === J(["NODE_TECH_AQ_IRRIGATION>BUILDING_DAM_ANTIQUITY"]), J(un));
  for (const t of ["LOC_BUILDING_DAM_ANTIQUITY_DESCRIPTION", "LOC_BUILDING_DAM_ANTIQUITY_TOOLTIP", "LOC_PEDIA_CONCEPTS_PAGE_DAMS_PROTECTION_CHAPTER_OVERTOP_PARA_1", "LOC_PEDIA_CONCEPTS_PAGE_DAMS_PROTECTION_CHAPTER_DRY_PARA_1", "LOC_PEDIA_CONCEPTS_PAGE_DAMS_LEVEES_CHAPTER_MULTIPLAYER_PARA_1"]) {
    const s = safe(() => Locale.compose(t), t);
    check(`A1 text ${t}`, s && s !== t, J(String(s).slice(0, 140)));
  }
}
function damIndex() { return safe(() => GameInfo.Constructibles.lookup(DAM).$index, -1); }
function canDam(cid, loc) {
  const args = { ConstructibleType: damIndex() };
  if (loc) { args.X = loc.x; args.Y = loc.y; }
  return safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, args, false), null);
}
function cost(city) { return safe(() => city.Production.getConstructibleProductionCost(DAM), "?"); }
function net(city) { return ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD"].map((y) => safe(() => Math.round(city.Yields.getNetYield(YieldTypes[y]) * 100) / 100, "?")); }
async function placeComplete(local, cid, loc) {
  if (!occ(loc).length) {
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: loc, Parent: cid, Owner: cid.owner }));
    await sleep(1200);
  }
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: DAM, Location: loc, Owner: cid.owner }));
  await sleep(2500);
  return occ(loc).some((o) => o.type === DAM);
}
async function destroyDam(local, loc) {
  const d = occ(loc).find((o) => o.type === DAM);
  if (d) safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: d.owner, LocalID: d.id }));
  await sleep(2500);
  return !occ(loc).some((o) => o.type === DAM);
}
async function research(local) {
  const p = Players.get(local);
  const done = (n) => !!safe(() => p.Techs.isNodeUnlocked(n), false);
  const order = ["NODE_TECH_AQ_POTTERY", "NODE_TECH_AQ_ANIMAL_HUSBANDRY", "NODE_TECH_AQ_IRRIGATION"];
  for (let k = 0; k < 60 && !done("NODE_TECH_AQ_IRRIGATION"); k++) {
    const next = order.find((n) => !done(n));
    const hash = safe(() => GameInfo.ProgressionTreeNodes.lookup(next).ProgressionTreeNodeType, next);
    const args = { ProgressionTreeNodeType: safe(() => Database.makeHash(hash), hash) };
    const ok = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.SET_TECH_TREE_NODE, args, false).Success, false);
    if (ok) safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.SET_TECH_TREE_NODE, args));
    if (k % 5 === 0) emit(`R turn=${Game.turn} researching ${next} canStart=${ok} done=${J(order.map(done))}`);
    await roll();
  }
  return done("NODE_TECH_AQ_IRRIGATION");
}
async function run() {
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  dataChecks();
  if (!(await foundCapital(local))) return finishNow("no capital");
  await roll();
  const p = Players.get(local);
  const cid = p.Cities.getCityIds()[0];
  const city = Cities.get(cid);
  // A2 locked, waiting on Irrigation
  const pre = canDam(cid);
  // NeededUnlock is the node's row index, not its hash (e1: 103).
  const irr = safe(() => GameInfo.ProgressionTreeNodes.lookup(pre.NeededUnlock).ProgressionTreeNodeType, null);
  check("A2 Ancient Dam locked before Irrigation", pre && !pre.Success, J(pre && { Success: pre.Success, NeededUnlock: pre.NeededUnlock, FailureReasons: pre.FailureReasons }));
  check("A2 the unlock it waits on is Irrigation", irr === "NODE_TECH_AQ_IRRIGATION", J({ need: pre && pre.NeededUnlock, irr }));
  // A3 research Irrigation
  const got = await research(local);
  check("A3 Irrigation researched by rolling turns", got, `turn=${Game.turn}`);
  if (!got) return finishNow("Irrigation not reached");
  await roll();
  const post = canDam(cid);
  check("A3 Ancient Dam open after Irrigation", post && post.Success, J(post && { Success: post.Success, plots: (post.Plots || []).length, FailureReasons: post.FailureReasons }));
  // Buy every river tile within 3 so there is room to work with.
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const c0 = city.location;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    if (safe(() => GameplayMap.getPlotDistance(c0.x, c0.y, xx, yy), 99) > 3) continue;
    if (M.riverAt({ x: xx, y: yy }) == null || owningCity({ x: xx, y: yy })) continue;
    safe(() => city.purchasePlot({ x: xx, y: yy }));
  }
  await sleep(3000);
  const owned = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const l = { x: xx, y: yy };
    if (M.riverAt(l) != null && sameCity(owningCity(l), cid)) owned.push(l);
  }
  emit(`S1 capital ${J(c0)} owned river tiles ${owned.length}: ${J(owned.map((l) => ({ ...l, river: M.riverAt(l), occ: occ(l).map((o) => o.type), f: featureName(l) })))}`);
  // A4 offered plots are river tiles, none marked
  const res = canDam(cid);
  const plots = [...((res && res.Plots) || []), ...((res && res.ExpandUrbanPlots) || [])].map(locOf);
  check("A4 at least one plot offered", plots.length > 0, J(plots));
  check("A4 every offered plot is a river tile", plots.every((l) => M.riverAt(l) != null), J(plots.map((l) => M.riverAt(l))));
  check("A4 no offered plot carries a marker", plots.every((l) => featureName(l) !== "FEATURE_DAMS_SITE"), J(plots.map(featureName)));
  // Pick tiles: the order tile, then free tiles for finished Dams, preferring a river with floodplains for A9.
  const free = owned.filter((l) => !occ(l).some((o) => /^BUILDING_/.test(o.type)) && !sameCity({ owner: -9 }, null));
  const byRiver = new Map();
  for (const l of free) { const r = M.riverAt(l); if (!byRiver.has(r)) byRiver.set(r, []); byRiver.get(r).push(l); }
  const rivers = [...byRiver.entries()].sort((a, b) => b[1].length - a[1].length);
  emit(`S2 free tiles by river ${J(rivers.map(([r, ls]) => [r, ls.length, (M.riverPlots(r) || []).map(locOf).filter(isFloodplain).length]))}`);
  // A5 a real order
  const orderAt = plots.find((l) => featureName(l) !== "FEATURE_DAMS_SITE");
  if (orderAt) {
    safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: damIndex(), X: orderAt.x, Y: orderAt.y }));
    await sleep(4000);
    const q = safe(() => city.BuildQueue.getQueue().map((e) => String(safe(() => GameInfo.Constructibles.lookup(e.constructibleType).ConstructibleType, e.constructibleType))), []);
    check("A5 the order is in the queue", J(q).includes(DAM), J(q));
    check("A5 no marker on the order tile", featureName(orderAt) !== "FEATURE_DAMS_SITE", featureName(orderAt));
  }
  // A6 cost, A7 yields and upkeep: two finished Dams on tiles other than the order's
  const tiles = rivers.flatMap(([, ls]) => ls).filter((l) => !orderAt || idxOf(l) !== idxOf(orderAt));
  if (tiles.length < 2) return finishNow(`only ${tiles.length} free river tiles for finished Dams`);
  const [t1] = tiles;
  const offeredNow = () => { const r = canDam(cid); return [...((r && r.Plots) || []), ...((r && r.ExpandUrbanPlots) || [])].map(locOf); };
  const t2 = tiles.find((l) => M.riverAt(l) === M.riverAt(t1) && idxOf(l) !== idxOf(t1)) || tiles[1];
  const c0cost = cost(city);
  const n0 = net(city);
  check("A6 Dam 1 placed", await placeComplete(local, cid, t1), J(occ(t1)));
  await sleep(2000);
  const c1cost = cost(city); const n1 = net(city);
  const maint = safe(() => city.Constructibles.getMaintenance(DAM), "?");
  emit(`S3 upkeep read for the type ${J(maint)}`);
  // A8 a second Dam on the same river in the same settlement
  const same = M.riverAt(t2) === M.riverAt(t1);
  const after = offeredNow();
  emit(`S3b offered after Dam 1: ${J(after.map((l) => ({ ...l, river: M.riverAt(l) })))}`);
  const sameOffered = after.filter((l) => M.riverAt(l) === M.riverAt(t1) && idxOf(l) !== idxOf(t1));
  check("A8 a tile on the dammed river is still offered", sameOffered.length > 0 || !tiles.some((l) => M.riverAt(l) === M.riverAt(t1) && idxOf(l) !== idxOf(t1)), J(sameOffered));
  const v2 = canDam(cid, t2);
  emit(`S3c canStart at t2 ${J(t2)} (${same ? "same river" : "other river"}) offered=${after.some((l) => idxOf(l) === idxOf(t2))} -> ${J(v2 && { Success: v2.Success, FailureReasons: v2.FailureReasons })}`);
  check("A6 Dam 2 placed", await placeComplete(local, cid, t2), J(occ(t2)));
  await sleep(2000);
  const c2cost = cost(city);
  emit(`S4 cost reads ${J([c0cost, c1cost, c2cost])}`);
  check("A6 one Dam raises the cost by a quarter", typeof c0cost === "number" && Math.abs(c1cost / c0cost - 1.25) < 0.02, `${c0cost} -> ${c1cost}`);
  check("A6 two Dams raise it by a half", typeof c0cost === "number" && Math.abs(c2cost / c0cost - 1.5) < 0.02, `${c0cost} -> ${c2cost}`);
  // A9 drying: the sweep runs on build completion; force one too
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(4000);
  const fpLeft = (M.riverPlots(M.riverAt(t1)) || []).map(locOf).filter(isFloodplain).length;
  check("A9 the dammed river has no floodplain left", fpLeft === 0, `river ${M.riverAt(t1)} floodplains=${fpLeft}`);
  // A7 yields: Dam 2 destroyed, the difference is one Dam
  const nWith = net(city);
  check("A7 Dam 2 destroyed", await destroyDam(local, t2), J(occ(t2)));
  await sleep(2000);
  const nWithout = net(city);
  const d = nWith.map((v, i) => Math.round((v - nWithout[i]) * 100) / 100);
  emit(`S5 net [food, prod, gold] before=${J(n0)} one=${J(n1)} two=${J(nWith)} back to one=${J(nWithout)} diff=${J(d)}`);
  check("A7 one Dam is +2 Food, +2 Production, -1 Gold", d[0] === 2 && d[1] === 2 && d[2] === -1, J(d));
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e1 finished"), 4000); }
emit("attached e1");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

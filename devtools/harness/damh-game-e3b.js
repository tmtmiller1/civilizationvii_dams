// damh-game-e3.js - E3, the Modern Dam (2.0.0). A Modern game, the shipped mod alone (no grant). Built from e1:
//   A1 the Electricity unlock row and the Modern Dam's cost 600
//   A2 before Electricity the Modern Dam is locked, and the unlock it waits on is Electricity
//   A6 cost: read with no Dam, after one finished Dam, after two (expect x1.25, x1.5)
//   A7 yields and upkeep of one finished Modern Dam: +4 Food, +6 Production, -3 Gold
//   A9 single player drying on the dammed river
//   START_AGE=AGE_MODERN SEED=9001 zsh run-harness.sh damh-game-e3.js e3 1800 mod
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
const DAM = "BUILDING_DAM_MODERN";
function rows(table, f) { return safe(() => GameInfo[table].filter(f), []) || []; }
function dataChecks() {
  const def = safe(() => GameInfo.Constructibles.lookup(DAM), null);
  check("A1 Modern Dam cost 600", def && def.Cost === 600, J(def && def.Cost));
  const y = rows("Constructible_YieldChanges", (r) => r.ConstructibleType === DAM).map((r) => `${r.YieldType}:${r.YieldChange}`).sort();
  check("A1 Modern Dam yields +4 Food +6 Production", J(y) === J(["YIELD_FOOD:4", "YIELD_PRODUCTION:6"]), J(y));
  const un = rows("ProgressionTreeNodeUnlocks", (r) => String(r.TargetType).startsWith("BUILDING_DAM_")).map((r) => `${r.ProgressionTreeNodeType}>${r.TargetType}`);
  check("A1 Electricity unlocks the Modern Dam", J(un) === J(["NODE_TECH_MO_ELECTRICITY>BUILDING_DAM_MODERN"]), J(un));
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
  // A2 locked, waiting on Electricity
  const pre = canDam(cid);
  const node = safe(() => GameInfo.ProgressionTreeNodes.lookup(pre.NeededUnlock).ProgressionTreeNodeType, null);
  emit(`S0b electricity researched=${safe(() => p.Techs.isNodeUnlocked("NODE_TECH_MO_ELECTRICITY"), "?")} canStart=${J(pre)} keys=${J(pre && Object.keys(pre))}`);
  const gm = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: GameInfo.Constructibles.lookup("BUILDING_GRISTMILL").$index }, false), null);
  const lab = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: GameInfo.Constructibles.lookup("BUILDING_LABORATORY").$index }, false), null);
  emit(`S0c control: Laboratory (also Electricity) canStart=${J(lab)}; Gristmill=${J(gm && { Success: gm.Success })}`);
  check("A2 Modern Dam locked before Electricity", pre && !pre.Success, J(pre && { Success: pre.Success, NeededUnlock: pre.NeededUnlock }));
  check("A2 the unlock it waits on is Electricity", node === "NODE_TECH_MO_ELECTRICITY", J(node));
  return finishNow("e3b: unlock read only");
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
  // Pick tiles: the order tile, then free tiles for finished Dams, preferring a river with floodplains for A9.
  const free = owned.filter((l) => !occ(l).some((o) => /^BUILDING_/.test(o.type)) && !sameCity({ owner: -9 }, null));
  const byRiver = new Map();
  for (const l of free) { const r = M.riverAt(l); if (!byRiver.has(r)) byRiver.set(r, []); byRiver.get(r).push(l); }
  const rivers = [...byRiver.entries()].sort((a, b) => b[1].length - a[1].length);
  emit(`S2 free tiles by river ${J(rivers.map(([r, ls]) => [r, ls.length, (M.riverPlots(r) || []).map(locOf).filter(isFloodplain).length]))}`);
  const orderAt = null;
  // A6 cost, A7 yields and upkeep: two finished Dams on tiles other than the order's
  const tiles = rivers.flatMap(([, ls]) => ls).filter((l) => !orderAt || idxOf(l) !== idxOf(orderAt));
  if (tiles.length < 2) return finishNow(`only ${tiles.length} free river tiles for finished Dams`);
  const [t1] = tiles;
  const t2 = tiles.find((l) => M.riverAt(l) === M.riverAt(t1) && idxOf(l) !== idxOf(t1)) || tiles[1];
  const c0cost = cost(city);
  const n0 = net(city);
  check("A6 Dam 1 placed", await placeComplete(local, cid, t1), J(occ(t1)));
  await sleep(2000);
  const c1cost = cost(city); const n1 = net(city);
  const maint = safe(() => city.Constructibles.getMaintenance(DAM), "?");
  emit(`S3 upkeep read for the type ${J(maint)}`);
  check("A6 Dam 2 placed", await placeComplete(local, cid, t2), J(occ(t2)));
  await sleep(2000);
  const c2cost = cost(city);
  emit(`S4 cost reads ${J([c0cost, c1cost, c2cost])}`);
  check("A6 one Dam in the settlement adds 150", c1cost - c0cost === 150, `${c0cost} -> ${c1cost}`);
  check("A6 two add 300", c2cost - c0cost === 300, `${c0cost} -> ${c2cost}`);
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
  check("A7 one Dam is +4 Food, +6 Production, -3 Gold", d[0] === 4 && d[1] === 6 && d[2] === -3, J(d));
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e3b finished"), 4000); }
emit("attached e3");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

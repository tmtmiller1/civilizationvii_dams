// damh-game-w1.js - W1. Can a specialist be placed on a Dam tile? Builds a Dam on a minor-river tile and on a
// navigable tile, and a Granary on a plain land tile as the control, then dumps city.Workers.GetAllPlacementInfo()
// (the list the growth screen colours purple) and the ASSIGN_WORKER verdict for each of the three tiles.
//   SEED=9001 zsh run-harness.sh damh-game-w1.js w1 900 mod+slotgrant+workers   (cap 2 from turn 1, Library/Bridge unlocked)
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function riverKind(l) { const t = safe(() => GameplayMap.getRiverType(l.x, l.y), -1); return t === RiverTypes.RIVER_NAVIGABLE ? "navigable" : t === RiverTypes.RIVER_MINOR ? "minor" : "none"; }
function districtAt(l) { return safe(() => { const d = Districts.getAtLocation(l); return d ? String(GameInfo.Districts.lookup(d.type)?.DistrictType) : ""; }, "?"); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), complete: safe(() => inst.complete, "?") }; }), []); }

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
function offered(cid, def) {
  const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false), null);
  if (!r) return [];
  const cls = (a) => (Array.isArray(a) ? a.map(locOf).map((l) => ({ ...l, river: riverKind(l), district: districtAt(l) })) : []);
  return [...cls(r.Plots), ...cls(r.ExpandUrbanPlots)];
}
async function buildAt(cid, def, l, label) {
  safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }));
  let queued = false; const t0 = Date.now();
  while (!queued && Date.now() - t0 < 12000) { await sleep(300); queued = occupants(l).some((o) => o.type === def.ConstructibleType); }
  if (!queued) { emit(`S2 ${label} ${J(l)} not queued; verdict ${J(safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }, false), null))}`); return false; }
  safe(() => Cities.get(cid).BuildQueue.addProgress(5000));
  let done = false; const t1 = Date.now();
  while (!done && Date.now() - t1 < 30000) { await sleep(800); done = occupants(l).some((o) => o.type === def.ConstructibleType && o.complete === true); }
  emit(`S2 ${label} ${J(l)} river=${riverKind(l)} complete=${done} district=${districtAt(l)} holds=${J(occupants(l))}`);
  return done;
}
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function neighbours(l) { return RING.map((d) => safe(() => GameplayMap.getAdjacentPlotLocation(l, DirectionTypes[d]), null)).filter((n) => n && n.x >= 0); }
function tileYields(l, local) { return { food: safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_FOOD, local), "?"), prod: safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_PRODUCTION, local), "?") }; }
function around(l) { return neighbours(l).map((n) => ({ x: n.x, y: n.y, river: riverKind(n), district: districtAt(n), res: safe(() => GameplayMap.getResourceType(n.x, n.y) !== ResourceTypes.NO_RESOURCE, "?") })); }
async function growthShot(cid, l, name) {
  let IM = null;
  try { IM = (await import("/core/ui/interface-modes/interface-modes.js")).InterfaceMode; } catch (e) { emit("S7 IM import failed " + e); return; }
  safe(() => Camera.lookAtPlot(l, { zoom: 0.2 })); await sleep(2000);
  const sw = safe(() => IM.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: cid }), "?"); await sleep(6000);
  emit(`S7 switch=${J(sw)} mode=${J(safe(() => IM.getCurrent(), "?"))} hoverable=${J(safe(() => document.querySelector("panel-place-population") != null, "?"))}`);
  emit("SHOT " + name); await sleep(30000);
  safe(() => IM.switchToDefault()); await sleep(1500);
}
function workerDump(local, cid, named) {
  const city = Cities.get(cid);
  const W = city.Workers;
  emit(`S5 Workers members=${J(safe(() => Object.getOwnPropertyNames(Object.getPrototypeOf(W)), "?"))} cap=${J(safe(() => W.getCityWorkerCap(), "?"))} isTown=${J(city.isTown)}`);
  const all = safe(() => W.GetAllPlacementInfo(), null) || [];
  emit(`S5 placement entries=${all.length} firstKeys=${J(all[0] ? Object.keys(all[0]) : [])} sample=${J(all.slice(0, 3))}`);
  const urban = [];
  for (const p of (safe(() => city.getPurchasedPlots(), []) || [])) { const l = locOf(p); const d = districtAt(l); if (d && d !== "DISTRICT_RURAL" && d !== "DISTRICT_WILDERNESS") urban.push({ ...l, river: riverKind(l), district: d, holds: occupants(l).map((o) => o.type), placement: all.find((q) => q.PlotIndex === p) || null }); }
  emit(`S5 urbanTiles=${J(urban)}`);
  for (const [label, l] of Object.entries(named)) {
    if (!l) { emit(`S5 ${label}: not built`); continue; }
    const idx = idxOf(l);
    const e = all.find((p) => p.PlotIndex === idx) || null;
    const op = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_WORKER, { Location: idx, Amount: 1 }, false), null);
    emit(`S5 ${label} ${J(l)} river=${riverKind(l)} district=${districtAt(l)} holds=${J(occupants(l).map((o) => o.type))} tileYields=${J(tileYields(l, local))} around=${J(around(l))} placement=${J(e)} assignWorker=${J(op && { Success: op.Success, FailureReasons: op.FailureReasons })}`);
  }
}
async function run() {
  const local = GameContext.localPlayerID;
  const AGE = String(safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "AGE_ANTIQUITY"));
  const dam = GameInfo.Constructibles.lookup("BUILDING_DAM_" + AGE.replace("AGE_", "")), gran = GameInfo.Constructibles.lookup("BUILDING_LIBRARY"), bridge = GameInfo.Constructibles.lookup("BUILDING_ANCIENT_BRIDGE");
  emit(`S0 age=${AGE} dam=${!!dam} granary=${!!gran} modActive=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2000);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = city.location;
  // buy every river tile within 3 so both river kinds are in reach
  const n = safe(() => MapRivers.numRivers, 0);
  for (let i = 0; i < n; i++) { const id = safe(() => MapRivers.getRiverIDByIndex(i), null); for (const p of (safe(() => MapRivers.getRiverPlots(id), []) || [])) { const l = typeof p === "number" ? locOf(p) : { x: p.x, y: p.y }; if (safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99) <= 3 && !safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null)) safe(() => city.purchasePlot(l)); } }
  await sleep(2500);
  const o = offered(cid, dam);
  emit(`S1 capital ${J(C)} damOffered=${J(o)}`);
  const minor = o.find((p) => p.river === "minor"), nav = o.find((p) => p.river === "navigable");
  const built = { centre: C, damMinor: null, damNavigable: null, bridgeNavigable: null, library: null };
  if (minor && (await buildAt(cid, dam, minor, "damMinor"))) built.damMinor = minor;
  if (nav && (await buildAt(cid, dam, nav, "damNavigable"))) built.damNavigable = nav;
  const bo = offered(cid, bridge).filter((p) => p.river === "navigable" && !occupants(p).length);
  emit(`S1 bridgeOffered=${bo.length}`);
  if (bo[0] && (await buildAt(cid, bridge, bo[0], "bridgeNavigable"))) built.bridgeNavigable = bo[0];
  const go = offered(cid, gran).filter((p) => p.river === "none" && !occupants(p).length);
  emit(`S1 libraryOffered=${go.length}`);
  if (go[0] && (await buildAt(cid, gran, go[0], "library"))) built.library = go[0];
  await sleep(2000);
  workerDump(local, cid, built);
  // a turn later, in case placement info refreshes on turn start
  safe(() => UI.Player.deselectAllUnits()); const t = Game.turn; safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750); await sleep(3000);
  emit(`S6 after turn ${Game.turn}`); workerDump(local, cid, built);
  const damTile = built.damMinor || built.damNavigable;
  if (damTile) await growthShot(cid, damTile, "growth-dam");
  finishNow(`built=${J(Object.fromEntries(Object.entries(built).map(([k, v]) => [k, !!v])))}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness w1 finished"), 4000); }
emit("attached w1");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

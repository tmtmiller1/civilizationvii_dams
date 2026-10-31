// damh-game-s1.js - S1. Does a Dam take one of an urban tile's two building slots, and does it make a quarter with a
// building of its age? Run on the mod as deployed with the slot grant (Ancient Dam and six base buildings at turn 1):
//   SEED=9001 zsh run-harness.sh damh-game-s1.js s1 1500 mod+slotgrant
//   S0  capital, defs, the icons the placement pips use (UI.getIconBLP) for the Dam and a base building
//   S1  dam tile T: a minor-river tile offered to both the Dam and the Library. Dam built, then the Library on T.
//       After each: what the engine holds on T, district.isQuarter, and whether a Market is still offered on T.
//       A Market offered on T beside a Dam and a Library means the Dam isn't counted in the slot cap.
//   S2  control tile U: Barracks + Monument, then the same Market check (the cap should refuse it)
//   S3  bridge control V, when a navigable river tile is offered: Ancient Bridge + Garden, then the Market check
//   S4  the placement view for the Market, so the slot pips under T, U and V are on screen
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function riverKind(l) { const t = safe(() => GameplayMap.getRiverType(l.x, l.y), -1); return t === RiverTypes.RIVER_NAVIGABLE ? "navigable" : t === RiverTypes.RIVER_MINOR ? "minor" : "none"; }
function occupants(l) {
  return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => {
    const inst = Constructibles.getByComponentID(c);
    return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), complete: safe(() => inst.complete, "?") };
  }), []);
}
function districtInfo(l) {
  return safe(() => {
    const d = Districts.getAtLocation(l);
    if (!d) return null;
    const ids = safe(() => d.getConstructibleIds() || [], []);
    const names = ids.map((id) => safe(() => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(id).type).ConstructibleType), "?"));
    const proto = Object.getPrototypeOf(d);
    const methods = proto ? Object.getOwnPropertyNames(proto).filter((k) => k !== "constructor") : [];
    return {
      type: String(safe(() => GameInfo.Districts.lookup(d.type).DistrictType, d.type)),
      isQuarter: safe(() => d.isQuarter, "?"), isUniqueQuarter: safe(() => d.isUniqueQuarter, "?"),
      ids: names, methods,
    };
  }, "?");
}
function def(t) { return GameInfo.Constructibles.lookup(t); }
function verdict(cid, t, l) {
  const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def(t).$index, X: l.x, Y: l.y }, false), null);
  return r ? { ok: r.Success, why: r.FailureReasons } : null;
}
function offeredPlots(cid, t) {
  const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def(t).$index }, false), null);
  if (!r) return [];
  return [...(r.Plots || []), ...(r.ExpandUrbanPlots || [])].map(locOf);
}
const same = (a, b) => a.x === b.x && a.y === b.y;
function snap(label, cid, l, probe) {
  emit(`${label} at ${J(l)} holds=${J(occupants(l))} district=${J(districtInfo(l))} ${probe}=${J(verdict(cid, probe, l))} ${probe}OfferedHere=${offeredPlots(cid, probe).some((p) => same(p, l))}`);
}
async function buildAt(cid, t, l, label) {
  safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: def(t).$index, X: l.x, Y: l.y }));
  let queued = false; const t0 = Date.now();
  while (!queued && Date.now() - t0 < 12000) { await sleep(300); queued = occupants(l).some((o) => o.type === t); }
  if (!queued) { emit(`${label} ${t} at ${J(l)} not queued: ${J(verdict(cid, t, l))}`); return false; }
  let done = false; const t1 = Date.now();
  while (!done && Date.now() - t1 < 30000) {
    safe(() => Cities.get(cid).BuildQueue.addProgress(5000));
    await sleep(800);
    done = occupants(l).some((o) => o.type === t && o.complete === true);
  }
  emit(`${label} ${t} at ${J(l)} complete=${done}`);
  return done;
}
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
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
let AIM = null;
async function shot(name) { if (AIM) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(20000); }

async function run() {
  const local = GameContext.localPlayerID;
  const types = ["BUILDING_DAM_ANTIQUITY", "BUILDING_LIBRARY", "BUILDING_MARKET", "BUILDING_BARRACKS", "BUILDING_MONUMENT", "BUILDING_GARDEN", "BUILDING_ANCIENT_BRIDGE", "BUILDING_GRISTMILL"];
  emit(`S0 defs=${J(types.map((t) => [t, !!def(t)]))} iconBLP=${J(types.slice(0, 2).concat(["BUILDING_ANCIENT_BRIDGE"]).map((t) => [t, safe(() => UI.getIconBLP(t), "?"), safe(() => UI.getIconURL(t), "?")]))} empty=${J(safe(() => UI.getIconBLP("BUILDING_EMPTY"), "?"))} mod=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2000);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = city.location;
  // Buy every tile within 3 so river tiles of both kinds are in reach.
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (safe(() => GameplayMap.getPlotDistance(C.x, C.y, x, y), 99) > 3) continue;
    if (safe(() => GameplayMap.getOwningCityFromXY(x, y), null)) continue;
    safe(() => city.purchasePlot({ x, y }));
  }
  await sleep(2500);
  emit(`S0 capital ${J(C)} offered: ${J(Object.fromEntries(types.map((t) => [t, offeredPlots(cid, t).length])))}`);

  const libPlots = offeredPlots(cid, "BUILDING_LIBRARY");
  const damPlots = offeredPlots(cid, "BUILDING_DAM_ANTIQUITY");
  const T = damPlots.find((p) => riverKind(p) === "minor" && libPlots.some((q) => same(p, q))) || damPlots.find((p) => libPlots.some((q) => same(p, q)));
  emit(`S1 dam plots=${J(damPlots.map((p) => ({ ...p, r: riverKind(p) })))} T=${J(T)}`);
  if (T) {
    AIM = { loc: T, zoom: 0.15 }; safe(() => Camera.lookAtPlot(T, { zoom: 0.15 }));
    if (await buildAt(cid, "BUILDING_DAM_ANTIQUITY", T, "S1")) {
      snap("S1 after Dam", cid, T, "BUILDING_LIBRARY");
      if (await buildAt(cid, "BUILDING_LIBRARY", T, "S1")) snap("S1 after Dam+Library", cid, T, "BUILDING_MARKET");
    }
  }
  const mktPlots = offeredPlots(cid, "BUILDING_MARKET");
  const U = offeredPlots(cid, "BUILDING_BARRACKS").find((p) => (!T || !same(p, T)) && riverKind(p) === "none" && mktPlots.some((q) => same(p, q)) && occupants(p).length === 0);
  emit(`S2 U=${J(U)}`);
  if (U && await buildAt(cid, "BUILDING_BARRACKS", U, "S2")) {
    if (await buildAt(cid, "BUILDING_MONUMENT", U, "S2")) snap("S2 after Barracks+Monument", cid, U, "BUILDING_MARKET");
  }
  const V = offeredPlots(cid, "BUILDING_ANCIENT_BRIDGE").find((p) => (!T || !same(p, T)) && occupants(p).length === 0);
  emit(`S3 V=${J(V)} bridgePlots=${offeredPlots(cid, "BUILDING_ANCIENT_BRIDGE").length}`);
  if (V && await buildAt(cid, "BUILDING_ANCIENT_BRIDGE", V, "S3")) {
    snap("S3 after Bridge", cid, V, "BUILDING_GARDEN");
    if (await buildAt(cid, "BUILDING_GARDEN", V, "S3")) snap("S3 after Bridge+Garden", cid, V, "BUILDING_MARKET");
  }
  await roll();
  if (T) snap("S4 next turn", cid, T, "BUILDING_MARKET");
  // The placement view for the Market: the pips under each urban tile.
  safe(() => UI.Player.selectCity(cid)); await sleep(1500);
  const sw = safe(() => InterfaceMode.switchTo("INTERFACEMODE_PLACE_BUILDING", { CityID: cid, OperationArguments: { ConstructibleType: def("BUILDING_MARKET").$index }, IsPurchasing: false }), "?");
  await sleep(3000);
  emit(`S4 placement mode switch=${J(sw)} now=${J(safe(() => InterfaceMode.getCurrent(), "?"))}`);
  AIM = { loc: T || C, zoom: 0.25 };
  await shot("s1-pips");
  AIM = { loc: T || C, zoom: 0.1 };
  await shot("s1-pips-close");
  safe(() => InterfaceMode.switchToDefault());
  finishNow(`T=${J(T)} U=${J(U)} V=${J(V)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness s1 finished"), 4000); }
emit("attached s1");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

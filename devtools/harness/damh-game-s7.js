// damh-game-s7.js - S7: the S6 setup (a Dam alone, a Barracks alone, the Library placement view), then the game is
// left to tower-bench eval until globalThis.__s7done is set or 25 minutes pass. After S6, after S4-S5 (a mod's art bundle only loads from the game's DLC folder or the user override
// folders): a BC7 .dds shipped in a mod as a map sprite, and the Dam's PNG as a page element pinned to its slot pip with a
// world anchor (alignment and size against the real pips, at two zooms). Deploy: mod+slotgrant+artprobe (ARTSRC art3).
// Earlier S3 notes: the Dam's own pip: a Dam alone on its tile, the placement view for a Library, and four
// test sprites (each address form for the Dam icon, plus a base icon) on nearby tiles in the same view. After S2, after S1 (s1-UI.log: the engine counts the Dam in the slot cap and the Dam + Library tile
// is a quarter). Same setup, then the pips themselves.
// Original S1 notes: Does a Dam take one of an urban tile's two building slots, and does it make a quarter with a
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


const SPRITE_FORMS = [
  ["bare", "dam_ancient_128"],
  ["fs-png", "fs://game/tower-dams/icons/dam_ancient_128.png"],
  ["fs-noext", "fs://game/tower-dams/icons/dam_ancient_128"],
  ["control-library", "buildicon_library"],
];
async function run() {
  const local = GameContext.localPlayerID;
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2000);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = city.location;
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (safe(() => GameplayMap.getPlotDistance(C.x, C.y, x, y), 99) > 3) continue;
    if (safe(() => GameplayMap.getOwningCityFromXY(x, y), null)) continue;
    safe(() => city.purchasePlot({ x, y }));
  }
  await sleep(2500);
  const libPlots = offeredPlots(cid, "BUILDING_LIBRARY");
  const damPlots = offeredPlots(cid, "BUILDING_DAM_ANTIQUITY");
  const T = damPlots.find((p) => libPlots.some((q) => same(p, q)));
  let dam1 = false;
  if (T) dam1 = await buildAt(cid, "BUILDING_DAM_ANTIQUITY", T, "S2");
  const mktPlots = offeredPlots(cid, "BUILDING_MARKET");
  // A second tile with the Dam alone: the Dam's own pip with an empty slot beside it.
  const U = offeredPlots(cid, "BUILDING_BARRACKS").find((p) => (!T || !same(p, T)) && mktPlots.some((q) => same(p, q)) && occupants(p).length === 0);
  if (U) { await buildAt(cid, "BUILDING_BARRACKS", U, "S2"); }
  emit(`S2 T(Dam+Library)=${J(T)} holds=${J(T && occupants(T))} U(Barracks)=${J(U)} holds=${J(U && occupants(U))}`);
  await roll();
  // The game's own placement view for the Market: the pips under every urban tile.
  let IM = null;
  try { IM = (await import("/core/ui/interface-modes/interface-modes.js")).InterfaceMode; } catch (e) { emit("S3 import failed " + e); }
  safe(() => UI.Player.selectCity(cid)); await sleep(1500);
  const sw = safe(() => IM.switchTo("INTERFACEMODE_PLACE_BUILDING", { CityID: cid, OperationArguments: { ConstructibleType: def("BUILDING_LIBRARY").$index }, IsPurchasing: false }), "?");
  await sleep(3000);
  emit(`S3 placement switch=${J(sw)} inMode=${J(safe(() => IM.isInInterfaceMode("INTERFACEMODE_PLACE_BUILDING"), "?"))}`);
  globalThis.__s7 = { T, U, C, cid, IM };
  emit(`S7 READY T=${J(T)} U=${J(U)}`);
  const t0 = Date.now();
  while (!globalThis.__s7done && Date.now() - t0 < 25 * 60000) await sleep(2000);
  finishNow(`T=${J(T)} U=${J(U)} switch=${J(sw)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness s7 finished"), 4000); }
emit("attached s7");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

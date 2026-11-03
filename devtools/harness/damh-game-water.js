// damh-game-water.js - the lake and navigable river adjacencies proposed for the Dams, watched before the shipping
// data changes. dam-water-probe adds +1 Food per adjacent lake tile and +1 Production per adjacent navigable river
// tile (AdjacentLake, AdjacentTerrain TERRAIN_NAVIGABLE_RIVER) to the three Dams. The script scans the map for a river
// tile beside both (logged only: Units.setLocation and Units.create are refused from a UI script), founds the capital
// where it starts, buys the land within 3, builds the Dam on the offered site with the most lake and navigable neighbours
// and reads the specialist preview on the Dam tile (GetAllPlacementInfo NextYields), which should come to
//   Food        = river neighbours (navigable ones count too, as a2b showed) + lake neighbours
//   Production  = navigable river neighbours (+ resource neighbours in Exploration, + Quarters in Modern)
// in Antiquity the river Food row and the probe rows are the only adjacencies with a neighbour to count.
//   SEED=9001 zsh run-harness.sh damh-game-water.js w7d 900 mod+grant+workers+adj+water          (lake at 56,36)
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-water.js w8 900 mod+grant+workers+adj+water
//   START_AGE=AGE_MODERN SEED=9001 zsh run-harness.sh damh-game-water.js w9 900 mod+grant+workers+adj+water
import { instance as Pedia } from "/base-standard/ui/civilopedia/model-civilopedia.js";
const OPTS = "__PROBE_OPTS__";
const TEXT_ONLY = /(^|,)text(,|$)/.test(OPTS);
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function same(a, b) { return a && b && a.x === b.x && a.y === b.y; }
function riverKind(l) { const t = safe(() => GameplayMap.getRiverType(l.x, l.y), -1); return t === RiverTypes.RIVER_NAVIGABLE ? "navigable" : t === RiverTypes.RIVER_MINOR ? "minor" : "none"; }
function districtOf(l) { return safe(() => Districts.getAtLocation(l), null); }
function districtAt(l) { return safe(() => { const d = districtOf(l); return d ? String(GameInfo.Districts.lookup(d.type)?.DistrictType) : ""; }, "?"); }
function isQuarter(l) { return safe(() => { const d = districtOf(l); return d ? !!d.isQuarter : false; }, "?"); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), complete: safe(() => inst.complete, "?") }; }), []); }
function resAt(l) { return safe(() => { const r = GameplayMap.getResourceType(l.x, l.y); return r === ResourceTypes.NO_RESOURCE ? "" : String(GameInfo.Resources.lookup(r)?.ResourceType); }, "?"); }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function neighbours(l) { return RING.map((d) => safe(() => GameplayMap.getAdjacentPlotLocation(l, DirectionTypes[d]), null)).filter((n) => n && n.x >= 0).map((n) => ({ x: n.x, y: n.y })); }
function around(l) { return neighbours(l).map((n) => ({ ...n, river: riverKind(n), district: districtAt(n), quarter: isQuarter(n), res: resAt(n), water: safe(() => GameplayMap.isWater(n.x, n.y), "?"), owner: safe(() => GameplayMap.getOwner(n.x, n.y), "?") })); }
function yieldsAt(l, local) { const o = {}; for (const y of ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_SCIENCE", "YIELD_CULTURE", "YIELD_HAPPINESS"]) o[y.slice(6, 10)] = safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes[y], local), "?"); return o; }
function net(city) { const o = {}; for (const y of ["YIELD_FOOD", "YIELD_PRODUCTION", "YIELD_GOLD", "YIELD_HAPPINESS"]) o[y.slice(6, 10)] = safe(() => Math.round(city.Yields.getNetYield(YieldTypes[y]) * 100) / 100, "?"); return o; }

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
  if (!def) return [];
  const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false), null);
  if (!r) return [];
  const cls = (a) => (Array.isArray(a) ? a.map(locOf) : []);
  return [...cls(r.Plots), ...cls(r.ExpandUrbanPlots)];
}
async function buildAt(cid, def, l, label) {
  safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }));
  let queued = false; const t0 = Date.now();
  while (!queued && Date.now() - t0 < 12000) { await sleep(300); queued = occupants(l).some((o) => o.type === def.ConstructibleType); }
  if (!queued) { emit(`BUILD ${label} ${def.ConstructibleType} ${J(l)} not queued; verdict ${J(safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }, false), null))}`); return false; }
  for (let k = 0; k < 3; k++) safe(() => Cities.get(cid).BuildQueue.addProgress(5000));
  let done = false; const t1 = Date.now();
  while (!done && Date.now() - t1 < 40000) { await sleep(800); done = occupants(l).some((o) => o.type === def.ConstructibleType && o.complete === true); if (!done && (Date.now() - t1) % 8000 < 800) safe(() => Cities.get(cid).BuildQueue.addProgress(5000)); }
  emit(`BUILD ${label} ${def.ConstructibleType} ${J(l)} river=${riverKind(l)} complete=${done} district=${districtAt(l)} quarter=${isQuarter(l)} holds=${J(occupants(l))}`);
  return done;
}
async function passTurn() {
  safe(() => UI.Player.deselectAllUnits()); const t = Game.turn; safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); while (Game.turn === t && Date.now() - t0 < 90000) await sleep(750); await sleep(3000);
  emit(`TURN now ${Game.turn}`);
}
async function growthShot(cid, l, name) {
  let IM = null;
  try { IM = (await import("/core/ui/interface-modes/interface-modes.js")).InterfaceMode; } catch (e) { emit("SHOT-SETUP IM import failed " + e); return; }
  safe(() => Camera.lookAtPlot(l, { zoom: 0.2 })); await sleep(2000);
  const sw = safe(() => IM.switchTo("INTERFACEMODE_ACQUIRE_TILE", { CityID: cid }), "?"); await sleep(6000);
  emit(`SHOT-SETUP growth switch=${J(sw)} mode=${J(safe(() => IM.getCurrent(), "?"))}`);
  emit("SHOT " + name); await sleep(30000);
  safe(() => IM.switchToDefault()); await sleep(1500);
}
function pediaRead(page) {
  const root = document.querySelector("screen-civilopedia");
  if (!root) return { open: false };
  const paras = Array.from(root.querySelectorAll("div[data-l10n-id].font-body.text-base.m-3, .civilopedia-page div[data-l10n-id], .pedia-page-content div[data-l10n-id]"));
  const text = paras.map((n) => String(n.textContent || "")).join(" | ");
  const headers = Array.from(root.querySelectorAll("fxs-header")).map((h) => h.getAttribute("title") || "").filter(Boolean);
  return { open: true, page: page.pageID, headers, paragraphs: paras.length, chars: text.length,
    raw: /\[(B|LI|BLIST|icon|TIP|\/TIP)[:\]]|LOC_[A-Z_]{6,}/.test(text), keys: paras.map((n) => n.getAttribute("data-l10n-id")).slice(0, 12),
    sample: text.replace(/\s+/g, " ").slice(0, 500) };
}
async function pediaShots(tag) {
  safe(() => ContextManager.push("screen-civilopedia", { singleton: true, createMouseGuard: true })); await sleep(5000);
  if (!document.querySelector("screen-civilopedia")) { safe(() => window.dispatchEvent(new CustomEvent("hotkey-open-civilopedia"))); await sleep(5000); }
  const pages = [{ sectionID: "CONCEPTS", pageID: "DAMS_OVERVIEW" }, { sectionID: "BUILDINGS", pageID: "BUILDING_DAM_ANTIQUITY" },
    { sectionID: "BUILDINGS", pageID: "BUILDING_DAM_EXPLORATION" }, { sectionID: "BUILDINGS", pageID: "BUILDING_DAM_MODERN" }];
  for (const page of pages) {
    const ok = safe(() => Pedia.navigateTo(page)); await sleep(4000);
    emit(`PEDIA ${page.pageID} navigate=${J(ok)} read=${J(pediaRead(page))}`);
    emit("SHOT pedia-" + tag + "-" + page.pageID.toLowerCase().replace(/_/g, "-")); await sleep(14000);
  }
  safe(() => ContextManager.pop("screen-civilopedia")); await sleep(1500);
}
function textDump() {
  const keys = ["LOC_BUILDING_DAM_ANTIQUITY_DESCRIPTION", "LOC_BUILDING_DAM_EXPLORATION_DESCRIPTION", "LOC_BUILDING_DAM_MODERN_DESCRIPTION", "LOC_PEDIA_CONCEPTS_PAGE_DAMS_OVERVIEW_CHAPTER_AGES_PARA_1"];
  emit(`TEXT language=${J(safe(() => Locale.getCurrentDisplayLanguageOption(), "?"))} library=${J(safe(() => Locale.compose("LOC_BUILDING_LIBRARY_NAME"), "?"))}`);
  for (const k of keys) emit(`TEXT ${k} compose=${J(safe(() => Locale.compose(k), "?"))}`);
}
function paintResource(l, type) {
  const r = type === null ? ResourceTypes.NO_RESOURCE : safe(() => GameInfo.Resources.lookup(type).$index, null);
  if (r === null) return "no " + type;
  safe(() => WorldBuilder.startBlock());
  safe(() => WorldBuilder.MapPlots.setResource(r, { x: l.x, y: l.y }, 1));
  safe(() => WorldBuilder.endBlock());
  return resAt(l);
}
async function settle(ms) { await sleep(ms || 3500); }
function preview(cid, l) { const p = placement(Cities.get(cid), l); return p ? { FOOD: p.NextYields[0], PROD: p.NextYields[1] } : null; }
function placement(city, l) { const idx = idxOf(l); return (safe(() => city.Workers.GetAllPlacementInfo(), null) || []).find((p) => p.PlotIndex === idx) || null; }
async function specialist(local, cid, l) {
  const city = Cities.get(cid);
  for (let k = 0; k < 4 && !safe(() => city.Growth.isReadyToPlacePopulation, false); k++) {
    emit(`WORKER waiting for a citizen: food ${J(safe(() => city.Growth.currentFood, "?"))} of ${J(safe(() => city.Growth.getNextGrowthFoodThreshold().value, "?"))}`);
    await passTurn();
  }
  emit(`WORKER ready=${J(safe(() => city.Growth.isReadyToPlacePopulation, "?"))} cap=${J(safe(() => city.Workers.getCityWorkerCap(), "?"))} placement=${J(placement(city, l))} tile=${J(yieldsAt(l, local))} city=${J(net(city))}`);
  const can = safe(() => Game.PlayerOperations.canStart(local, PlayerOperationTypes.ASSIGN_WORKER, { Location: idxOf(l), Amount: 1 }, false), null);
  emit(`WORKER canStart=${J(can && { Success: can.Success, FailureReasons: can.FailureReasons })}`);
  safe(() => Game.PlayerOperations.sendRequest(local, PlayerOperationTypes.ASSIGN_WORKER, { Location: idxOf(l), Amount: 1 }));
  const t0 = Date.now(); while (Date.now() - t0 < 15000 && !(placement(city, l) || {}).NumWorkers) await sleep(500);
  await sleep(2000);
  const after = placement(city, l);
  emit(`WORKER after placement=${J(after)} tile=${J(yieldsAt(l, local))} city=${J(net(city))}`);
  emit(`WORKER VERDICT ${after && after.NumWorkers === 1 ? "PLACED" : "NOT_PLACED"} currentYields=${J(after && after.CurrentYields)}`);
}
function terrainName(l) { return safe(() => String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y)).TerrainType), "?"); }
function isLake(l) { return safe(() => !!GameplayMap.isLake(l.x, l.y), false); }
function isNav(l) { return terrainName(l) === "TERRAIN_NAVIGABLE_RIVER"; }
function landOk(l) { return !safe(() => GameplayMap.isWater(l.x, l.y), true) && !safe(() => GameplayMap.isMountain(l.x, l.y), true); }
function counts(l) { const n = neighbours(l); return { lakes: n.filter(isLake).length, navs: n.filter(isNav).length, rivers: n.filter((m) => riverKind(m) !== "none").length, res: n.filter((m) => resAt(m)).length }; }
async function run() {
  const local = GameContext.localPlayerID;
  const AGE = String(safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "AGE_ANTIQUITY"));
  const short = AGE.replace("AGE_", "");
  const dam = GameInfo.Constructibles.lookup("BUILDING_DAM_" + short);
  emit(`S0 age=${AGE} dam=${!!dam} adjRows=${J(safe(() => GameInfo.Constructible_Adjacencies.filter((r) => r.ConstructibleType === dam.ConstructibleType).map((r) => r.YieldChangeId), "?"))} probeRows=${J(safe(() => GameInfo.Adjacency_YieldChanges.filter((r) => /^DamProbe/.test(r.ID)).map((r) => ({ id: r.ID, y: r.YieldType, lake: r.AdjacentLake, terrain: r.AdjacentTerrain })), "?"))}`);
  safe(() => WorldBuilder.MapPlots.setAllRevealed(true));
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const both = [], lakeOnly = [], navOnly = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = { x, y }; if (!landOk(l) || riverKind(l) === "none") continue;
    const c = counts(l); const e = { ...l, ...c, self: riverKind(l), terrain: terrainName(l) };
    if (c.lakes && c.navs) both.push(e); else if (c.lakes) lakeOnly.push(e); else if (c.navs) navOnly.push(e);
  }
  const score = (a, b) => (b.lakes + b.navs) - (a.lakes + a.navs);
  both.sort(score);
  emit(`S1 scan both=${both.length} lakeOnly=${lakeOnly.length} navOnly=${navOnly.length} top=${J(both.slice(0, 6))} lakeTop=${J(lakeOnly.slice(0, 3))}`);
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2500);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = { x: city.location.x, y: city.location.y };
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    const x = C.x + dx, y = C.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (safe(() => GameplayMap.getPlotDistance(C.x, C.y, x, y), 99) <= 3 && !safe(() => GameplayMap.getOwningCityFromXY(x, y), null)) safe(() => city.purchasePlot({ x, y }));
  }
  await sleep(2500);
  const sites = offered(cid, dam).map((l) => ({ ...l, ...counts(l) }));
  emit(`S2 capital ${J(C)} damSites=${J(sites)}`);
  const site = sites.filter((s) => s.lakes && s.navs).sort(score)[0] || sites.filter((s) => s.lakes || s.navs).sort(score)[0];
  if (!site) return finishNow("no offered Dam site beside a lake or a navigable river");
  const y0 = yieldsAt(site, local);
  emit(`S2 site ${J(site)} terrain=${terrainName(site)} before=${J(y0)} around=${J(around(site).map((n) => ({ ...n, lake: isLake(n), nav: isNav(n), terrain: terrainName(n) })))}`);
  if (!(await buildAt(cid, dam, site, "dam"))) return finishNow("Dam not built");
  await settle(3000);
  const y1 = yieldsAt(site, local);
  const p1 = preview(cid, site);
  const want = { FOOD: site.rivers + site.lakes, PROD: site.navs + (AGE === "AGE_EXPLORATION" ? site.res : 0) };
  emit(`S3 afterDam=${J(y1)} delta=${J(diff(y0, y1))} specialistPreview=${J(p1)} want=${J(want)} (rivers ${site.rivers}, lakes ${site.lakes}, navigable ${site.navs}, resources ${site.res})`);
  const ok = p1 && p1.FOOD === want.FOOD && p1.PROD === want.PROD;
  const verdict = (ok ? "WATER_ADJ_OK" : "WATER_ADJ_WRONG") + ` lakes=${site.lakes} navs=${site.navs}`;
  safe(() => Camera.lookAtPlot(site, { zoom: 0.25 })); await sleep(3000);
  emit("SHOT water-dam-" + short.toLowerCase()); await sleep(15000);
  await specialist(local, cid, site);
  await growthShot(cid, site, "water-growth-" + short.toLowerCase());
  finishNow(verdict);
}
function diff(a, b) { const o = {}; for (const k of Object.keys(b)) o[k] = typeof a[k] === "number" && typeof b[k] === "number" ? b[k] - a[k] : "?"; return o; }
function baseOf(def) { return safe(() => GameInfo.Constructible_YieldChanges.filter((r) => r.ConstructibleType === def.ConstructibleType).map((r) => r.YieldType.slice(6, 10) + "+" + r.YieldChange), "?"); }
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness adj finished"), 4000); }
emit("attached adj");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e + " " + (e && e.stack))), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);


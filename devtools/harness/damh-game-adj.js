// damh-game-adj.js - the 2.2.0 adjacency bonuses and the Dams text, one run per age and one per language.
// Full mode founds the capital, buys the land around it, builds the age's Dam on the river tile with the most free
// neighbours, then adds the neighbour the age's bonus needs, reading the Dam tile's yields before and after:
//   Antiquity   a Wonder beside the Dam (dam-adj-probe unlocks three with no placement rule)        -> +1 Food
//   Exploration the Dam site with a resource beside it; a resource painted with
//               WorldBuilder.MapPlots.setResource is only a fallback (in a2 it didn't count reliably)  -> +1 Production
//   Modern      two of five unlocked Modern buildings on one neighbour, every neighbour and pair tried
//               until the game reports the tile as a Quarter                                          -> +1 Production
// The specialist preview on the Dam tile (GetAllPlacementInfo NextYields) is the clean measure of the adjacency; the
// tile's own yield also changes from rural to urban when the Dam lands. The game cuts log lines at 1022 bytes.
// Then a specialist goes on the Dam tile once a citizen is waiting, and the tile and city yields are read again. Every run (full or text)
// composes the three descriptions and the Civilopedia chapter in the running language and captures the Dams
// Civilopedia page and the three Dam building pages; full runs also capture the growth screen.
//   SEED=9001 zsh run-harness.sh damh-game-adj.js a1 1200 mod+grant+workers+adj
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-adj.js a2 1200 mod+grant+workers+adj
//   START_AGE=AGE_MODERN SEED=9001 zsh run-harness.sh damh-game-adj.js a3 1200 mod+grant+workers+adj
//   zsh run-languages.sh        (PROBE_OPTS=text and DISPLAY_LANG for each of the twelve languages)
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
async function run() {
  const local = GameContext.localPlayerID;
  const AGE = String(safe(() => GameInfo.Ages.lookup(Game.age).AgeType, "AGE_ANTIQUITY"));
  const short = AGE.replace("AGE_", "");
  const dam = GameInfo.Constructibles.lookup("BUILDING_DAM_" + short);
  const wonders = ["WONDER_GATE_OF_ALL_NATIONS", "WONDER_DUR_SHARRUKIN", "WONDER_GREAT_STELE"].map((t) => GameInfo.Constructibles.lookup(t)).filter(Boolean);
  const modern = ["BUILDING_SCHOOLHOUSE", "BUILDING_CANNERY", "BUILDING_MUSEUM", "BUILDING_MILITARY_ACADEMY", "BUILDING_CITY_PARK"].map((t) => GameInfo.Constructibles.lookup(t));
  emit(`S0 age=${AGE} dam=${!!dam} modActive=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))} adjRows=${J(safe(() => GameInfo.Constructible_Adjacencies.filter((r) => r.ConstructibleType === dam.ConstructibleType).map((r) => r.YieldChangeId), "?"))}`);
  if (TEXT_ONLY) {
    await sleep(4000);
    textDump();
    await pediaShots("text");
    return finishNow("text");
  }
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2000);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = { x: city.location.x, y: city.location.y };
  // buy the land within 2 and every river tile within 3
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    const x = C.x + dx, y = C.y + dy; if (x < 0 || y < 0 || x >= GameplayMap.getGridWidth() || y >= GameplayMap.getGridHeight()) continue;
    const d = safe(() => GameplayMap.getPlotDistance(C.x, C.y, x, y), 99);
    if (d <= 2 || (d <= 3 && riverKind({ x, y }) !== "none")) { if (!safe(() => GameplayMap.getOwningCityFromXY(x, y), null)) safe(() => city.purchasePlot({ x, y })); }
  }
  await sleep(2500);
  const sites = offered(cid, dam).map((l) => { const a = around(l); return { ...l, river: riverKind(l), rivers: a.filter((n) => n.river !== "none").length, res: a.filter((n) => n.res).length, free: a.filter((n) => !n.water && !n.district && n.owner === local && !n.res).length }; });
  emit(`S1 capital ${J(C)} damSites=${J(sites)}`);
  const site = (AGE === "AGE_EXPLORATION" && sites.find((s2) => s2.res > 0)) || sites.filter((s2) => s2.free > 0).sort((a, b) => b.free - a.free || b.rivers - a.rivers)[0] || sites[0];
  if (!site) return finishNow("no Dam site offered");
  const y0 = yieldsAt(site, local);
  emit(`S2 site ${J(site)} before=${J(y0)} preview=${J(preview(cid, site))} around=${J(around(site))}`);
  if (!(await buildAt(cid, dam, site, "dam"))) return finishNow("Dam not built");
  await settle(2000);
  const y1 = yieldsAt(site, local);
  const p1 = preview(cid, site);
  emit(`S2 afterDam=${J(y1)} specialistPreview=${J(p1)} delta=${J(diff(y0, y1))} expected: base ${J(baseOf(dam))}, plus 1 a river neighbour (${site.rivers})${AGE === "AGE_EXPLORATION" ? ", plus 1 Production a resource neighbour (" + site.res + ")" : ""}`);
  const free = () => around(site).filter((n) => !n.water && !n.district && n.owner === local && !n.res && safe(() => !GameplayMap.isMountain(n.x, n.y), true));
  let verdict = "ok";
  if (AGE === "AGE_ANTIQUITY") {
    let landed = null;
    for (const w of wonders) {
      const spots = offered(cid, w).filter((l) => neighbours(site).some((n) => same(n, l)));
      emit(`S3 ${w.ConstructibleType} offeredBesideDam=${J(spots)}`);
      for (const spot of spots) { if (await buildAt(cid, w, spot, "wonder")) { landed = { type: w.ConstructibleType, at: spot }; break; } }
      if (landed) break;
    }
    await settle();
    const y2 = yieldsAt(site, local);
    const d = diff(y1, y2);
    const p2 = preview(cid, site);
    emit(`S3 wonder=${J(landed)} specialistPreview=${J(p1)}->${J(p2)} afterWonder=${J(y2)} delta=${J(d)} wonderTileDistrict=${landed ? districtAt(landed.at) : "-"} (want FOOD +1)`);
    verdict = landed ? (d.FOOD === 1 && p2 && p1 && p2.FOOD - p1.FOOD === 1 ? "WONDER_FOOD_OK" : "WONDER_FOOD_WRONG") : "WONDER_NOT_BUILT";
  } else if (AGE === "AGE_EXPLORATION") {
    const natural = around(site).filter((n) => n.res);
    const pNat = preview(cid, site);
    emit(`S3 natural resources beside the Dam ${J(natural)} rivers=${site.rivers} specialistPreview=${J(pNat)} (want PROD = ${natural.length})`);
    const naturalOk = natural.length > 0 && pNat && pNat.PROD === natural.length;
    // a painted resource, waited on until it reads back, then a turn later
    const spot = free()[0];
    let painted = "not tried";
    if (spot) {
      const p0 = preview(cid, site);
      paintResource(spot, "RESOURCE_HORSES");
      const t0 = Date.now(); while (Date.now() - t0 < 20000 && resAt(spot) !== "RESOURCE_HORSES") await sleep(500);
      await settle(5000);
      const p1b = preview(cid, site);
      emit(`S3 painted Horses at ${J(spot)} reads=${resAt(spot)} after ${Date.now() - t0} ms specialistPreview=${J(p0)}->${J(p1b)}`);
      painted = p1b && p0 && p1b.PROD - p0.PROD === 1 ? "painted +1" : "painted no change";
    }
    verdict = (naturalOk ? "RESOURCE_PROD_OK" : natural.length ? "RESOURCE_PROD_WRONG" : "NO_NATURAL_RESOURCE_SITE") + " (" + painted + ")";
  } else if (AGE === "AGE_MODERN") {
    const pool = modern.filter(Boolean);
    let quarterAt = null, yq0 = null, yq1 = null, firstDelta = null;
    for (const n of neighbours(site)) {
      if (quarterAt) break;
      if (safe(() => GameplayMap.isWater(n.x, n.y), true) || districtAt(n) === "DISTRICT_CITY_CENTER" || districtAt(n) === "DISTRICT_WONDER") continue;
      const firstChoices = pool.filter((b) => offered(cid, b).some((l) => same(l, n)));
      emit(`S3 neighbour ${J(n)} river=${riverKind(n)} district=${districtAt(n)} offers=${J(firstChoices.map((b) => b.ConstructibleType))}`);
      if (!firstChoices.length) continue;
      const ya = yieldsAt(site, local);
      let first = null;
      for (const b of firstChoices) { if (await buildAt(cid, b, n, "first")) { first = b; break; } }
      if (!first) continue;
      await settle(2000);
      const yb = yieldsAt(site, local); firstDelta = diff(ya, yb);
      emit(`S3 afterFirst ${first.ConstructibleType} quarter=${isQuarter(n)} specialistPreview=${J(preview(cid, site))} delta=${J(firstDelta)} (want no change)`);
      for (const b of pool.filter((x) => x !== first && offered(cid, x).some((l) => same(l, n)))) {
        if (!(await buildAt(cid, b, n, "second"))) continue;
        await settle();
        const q = isQuarter(n);
        emit(`S3 afterSecond ${b.ConstructibleType} quarter=${q} holds=${J(occupants(n).map((o) => o.type))}`);
        if (q === true) { quarterAt = n; yq0 = yb; yq1 = yieldsAt(site, local); emit(`S3 specialistPreview after the Quarter ${J(preview(cid, site))}`); break; }
      }
    }
    const d = quarterAt ? diff(yq0, yq1) : null;
    emit(`S3 quarter=${J(quarterAt)} afterQuarter=${J(yq1)} delta=${J(d)} (want PROD +1)`);
    verdict = !quarterAt ? "QUARTER_NOT_FORMED" : (d.PROD === 1 && firstDelta && firstDelta.PROD === 0 ? "QUARTER_PROD_OK" : "QUARTER_PROD_WRONG");
  }
  emit(`S3 VERDICT ${verdict} riverPart=${diff(y0, y1).FOOD !== undefined ? J(diff(y0, y1)) : "?"}`);
  await passTurn();
  emit(`S4 settled tile=${J(yieldsAt(site, local))} specialistPreview=${J(preview(cid, site))} around=${J(around(site))}`);
  await specialist(local, cid, site);
  textDump();
  await growthShot(cid, site, "growth-" + short.toLowerCase());
  await pediaShots(short.toLowerCase());
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

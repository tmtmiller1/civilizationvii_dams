// damh-game-d28.js - D28, Dams next to a compact-city mod (Compact Cities 1.6, ring lock on). Checks:
//   C0 the ring lock is really on: base buildings carry AdjacentDistrict = DISTRICT_CITY_CENTER
//   C1 no Dams building carries an adjacency (data/dams-placement.sql)
//   C2 the engine offers the Ancient Dam on a river tile two or more tiles from the capital
//   C3 an Ancient Dam on a shared river puts a Levee in the other settlements
//   CONFIG="CompactCities-RingLock=ENABLED" SEED=9001 zsh run-harness.sh damh-game-d28.js d28 1200 mod+grant+compact
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
function owningCity(l) { const c = safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null); return c && c.owner >= 0 ? c : null; }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function adj(loc, k) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[k]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
let IM = null;
function mode() { return safe(() => IM.getCurrent(), "?"); }
/**
 * InterfaceMode is a module, not a global: `safe(() => InterfaceMode)` is always null, so every mode read and
 * switchTo in these probes did nothing until it was imported (the canals probes import it; c41).
 */
async function loadIM() {
  try { IM = (await import("/core/ui/interface-modes/interface-modes.js")).InterfaceMode; } catch (e) { emit(`IM import ${e}`); }
  emit(`IM loaded=${!!IM} mode=${mode()}`);
}
/**
 * Revealing the map queues one reveal cinematic per natural wonder, each of which takes the camera; pressing its
 * buttons does not end it (d21c: 45 presses, still INTERFACEMODE_CINEMATIC). CinematicManager.stop() closes the
 * current one, the way the game's own Continue does. So these probes no longer reveal the map at all, and anything that
 * still starts is stopped here until three reads in a row are clean.
 */
let CM = null;
async function drainCinematics(label) {
  if (!CM) { try { CM = (await import("/base-standard/ui/cinematic/cinematic-manager.js")).CinematicManager; } catch (e) { emit(`CM import ${e}`); } }
  let clean = 0, stopped = 0;
  for (let k = 0; k < 40 && clean < 3; k++) {
    const busy = mode() === "INTERFACEMODE_CINEMATIC" || !!safe(() => CM && CM.isMovieInProgress(), false);
    if (!busy) { clean++; await sleep(1500); continue; }
    clean = 0; stopped++;
    safe(() => CM && CM.stop());
    await sleep(1200);
    if (mode() === "INTERFACEMODE_CINEMATIC") safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
    await sleep(1200);
  }
  emit(`DRAIN ${label} stopped=${stopped} clean=${clean} mode=${mode()}`);
}

function panelEl() { return document.querySelector("panel-production-chooser"); }
function items() { return Array.from(document.querySelectorAll("production-chooser-item")); }
function panelReady() { return Array.from(document.querySelectorAll(".production-category")).length > 0; }
let AGE = "AGE_ANTIQUITY";
let AIM = null;
// Zooms and the clean view are the canals gallery's (canalh-game-gallery.js): 0.2 reads as a close shot, 0.4 as a
// wide one, and the HUD and its overlays come off so the picture is the map rather than the interface.
async function look(loc, zoom) { await drainCinematics("look"); AIM = { loc, zoom }; safe(() => Camera.lookAtPlot(loc, { zoom })); await sleep(3000); }
async function shot(name) {
  if (AIM) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2500); }
  await sleep(4000);
  if (hidden.length) rehide();
  emit("SHOT " + name);
  await sleep(52000);
}
const hidden = [];
let LM = null;
async function loadLens() {
  try { LM = (await import("/core/ui/lenses/lens-manager.js")).default; } catch (e) { LM = globalThis.LensManager || null; }
  // The active lens survives a relaunch and is restored after an early read, so a coloured overlay can sit over
  // every capture. Put it back to the plain map before anything is shot.
  emit(`VIEW lens was ${J(safe(() => LM && LM.getActiveLens(), "?"))}`);
  safe(() => LM.setActiveLens("fxs-default-lens"));
  await sleep(1500);
  emit(`VIEW lens now ${J(safe(() => LM && LM.getActiveLens(), "?"))}`);
}
function rehide() {
  for (const el of Array.from(document.body.children)) { if (el.style.visibility !== "hidden") { hidden.push(el); el.style.visibility = "hidden"; } }
  const t = document.getElementById("tooltips");
  if (t) { t.style.visibility = "hidden"; t.style.opacity = "0"; }
}
function cleanView(on) {
  if (!LM) emit("VIEW no lens manager: the overlays stay on");
  for (const layer of ["fxs-yields-layer", "fxs-culture-borders-layer", "fxs-hexgrid-layer", "fxs-resource-layer", "fxs-city-borders-layer"]) {
    try { if (on) LM.disableLayer(layer); else LM.enableLayer(layer); } catch (e) { emit(`VIEW ${layer} ${e}`); }
  }
  if (on) { for (const el of Array.from(document.body.children)) { if (el.style.visibility !== "hidden") { hidden.push(el); el.style.visibility = "hidden"; } } }
  else { for (const el of hidden) el.style.visibility = ""; hidden.length = 0; }
  emit(`VIEW clean=${on}`);
}
async function clearScreens(label) {
  for (let k = 0; k < 15; k++) {
    const m = mode();
    const buttons = Array.from(document.querySelectorAll("fxs-button, fxs-hero-button, fxs-close-button")).filter((b) => safe(() => b.getBoundingClientRect().width > 0, false));
    const hit = buttons.find((b) => /continue|close|LOC_WONDER_MOVIE|LOC_GENERIC_(CONTINUE|OK|CLOSE)/i.test(String(b.getAttribute("caption") || "") + " " + String(b.textContent || "")));
    if (m !== "INTERFACEMODE_CINEMATIC" && !hit) { emit(`CLEAR ${label} clean after ${k} (mode=${m})`); return; }
    if (hit) hit.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); else safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
    await sleep(2500);
  }
}
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2000);
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
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
const DAMS = ["BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN", "BUILDING_DAM_LEVEE", "BUILDING_DAM_LEVEE_EXPLORATION", "BUILDING_DAM_LEVEE_MODERN"];
function dist(a, b) { return safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), 99); }
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  await drainCinematics("start");
  const adj = (t) => safe(() => GameInfo.Constructibles.lookup(t).AdjacentDistrict, "?");
  const lib = ["BUILDING_LIBRARY", "BUILDING_GRANARY", "BUILDING_MONUMENT"].map((t) => [t, adj(t)]);
  const ringLock = lib.some(([, v]) => v === "DISTRICT_CITY_CENTER");
  if ("__PROBE_OPTS__".startsWith("control")) emit(`C0 CONTROL run: ring lock ${ringLock ? "ON (unexpected)" : "off"} ${J(lib)}`);
  else check("C0 the ring lock is on (base buildings pinned to the centre)", ringLock, J(lib));
  for (const t of DAMS) check(`C1 ${t} keeps no adjacency`, adj(t) == null, J(adj(t)));
  if (!(await foundCapital(local))) return finishNow("no capital");
  for (let k = 0; k < 8 && Game.turn < 8; k++) await roll();
  // C2 the engine offers a Dam on river tiles away from the centre
  const p = Players.get(local);
  const cid = p.Cities.getCityIds()[0];
  const city = Cities.get(cid);
  const center = { x: city.location.x, y: city.location.y };
  const far = [];
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0); i++) {
    const id = MapRivers.getRiverIDByIndex(i);
    for (const q of MapRivers.getRiverPlots(id) || []) { const l = typeof q === "number" ? locOf(q) : q; const d = dist(center, l); if (d >= 2 && d <= 3) far.push(l); }
  }
  for (const l of far) if (!owningCity(l)) safe(() => city.purchasePlot(l));
  await sleep(3000);
  const ownedFar = far.filter((l) => { const o = owningCity(l); return o && o.owner === cid.owner && o.id === cid.id; });
  if ("__PROBE_OPTS__" === "control-raw") { M.enabled = false; emit("C2 the mod's wrapper is off: the engine's own answer"); }
  const res = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: GameInfo.Constructibles.lookup({ AGE_ANTIQUITY: "BUILDING_DAM_ANTIQUITY", AGE_EXPLORATION: "BUILDING_DAM_EXPLORATION", AGE_MODERN: "BUILDING_DAM_MODERN" }[safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), "AGE_ANTIQUITY")] || "BUILDING_DAM_ANTIQUITY").$index }, false), null);
  const offered = ((res && res.Plots) || []).concat((res && res.ExpandUrbanPlots) || []).map(locOf);
  const offeredFar = offered.filter((l) => dist(center, l) >= 2);
  emit(`C2 capital=${J(center)} river tiles 2-3 away owned=${J(ownedFar)} offered=${J(offered)} success=${res && res.Success} reasons=${J(res && res.FailureReasons)}`);
  check("C2 a Dam is offered on a river tile two or more from the centre", ownedFar.length ? offeredFar.length > 0 : false, `${offeredFar.length} of ${ownedFar.length} owned far river tiles`);
  // C3 a Levee is placed in another settlement on a dammed river
  let pick = null;
  for (let tries = 0; tries < 8 && !pick; tries++) {
    for (let i = 0; i < safe(() => MapRivers.numRivers, 0) && !pick; i++) {
      const id = MapRivers.getRiverIDByIndex(i);
      const cities = safe(() => M.citiesOnRiver(id), []) || [];
      if (cities.length < 2) continue;
      const free = (MapRivers.getRiverPlots(id) || []).map((q) => (typeof q === "number" ? locOf(q) : q)).filter((l) => owningCity(l) && !occupants(l).length);
      if (free.length) pick = { id, cities, a: free[0] };
    }
    if (!pick) await roll();
  }
  if (!pick) return finishNow("no river shared by two settlements");
  const c = owningCity(pick.a);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: pick.a, Parent: c.id, Owner: c.owner }));
  await sleep(1200);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_ANTIQUITY", Location: pick.a, Owner: c.owner }));
  await sleep(2500);
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(3500);
  const holder = `${c.owner}:${c.id}`;
  const others = M.citiesOnRiver(pick.id).filter((x) => x.key !== holder);
  const got = others.map((x) => ({ key: x.key, center: occupants(x.center).filter((t) => t.includes("LEVEE")) }));
  check("C3 every other settlement on the river got its Levee", others.length > 0 && got.every((g) => g.center.includes("BUILDING_DAM_LEVEE")), J(got));
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d28 finished"), 4000); }
emit("attached d28");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

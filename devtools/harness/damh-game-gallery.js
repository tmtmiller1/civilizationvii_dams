// damh-game-gallery.js - the release captures, one run per age (the age comes from the game, so the same script
// serves all three). Shot list, named g-<age>-*:
//   site-before   the river stretch as it starts, floodplains still on it
//   production    the Dam's row in the production list, with its icon
//   dam-close     the finished Dam across its river
//   dam-wide      the same, pulled back so the river and the settlement read
//   valley        the dried floodplain stretch after the Dam completed
// It builds through the real path where the engine offers one, and falls back to placing the Dam directly so a run
// always produces pictures.
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-gallery.js gal-exp 1500 mod+grant
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
async function openProduction(cid, damType) {
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT")); await sleep(1200);
  safe(() => UI.Player.selectCity(cid)); await sleep(1200);
  for (let a = 0; a < 4 && !panelReady(); a++) { safe(() => IM.switchTo("INTERFACEMODE_CITY_PRODUCTION", { CityID: cid })); for (let k = 0; k < 30 && !panelReady(); k++) await sleep(500); }
  const bcat = document.querySelector("#production-category-buildings");
  const visible = () => items().filter((e) => safe(() => e.getBoundingClientRect().height > 0, false));
  if (bcat && !visible().length) { const h = bcat.querySelector("fxs-activatable"); if (h) h.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); await sleep(2500); }
  const row = items().find((e) => String(e.getAttribute("data-type") || "") === damType);
  if (row) { safe(() => row.scrollIntoView()); await sleep(1500); }
  emit(`G2 production panel=${panelReady()} damRow=${!!row}`);
  return !!row;
}
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  AGE = safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), "AGE_ANTIQUITY");
  const tag = AGE.replace("AGE_", "").toLowerCase();
  const def = GameInfo.Constructibles.lookup("BUILDING_DAM_" + AGE.replace("AGE_", ""));
  const M = globalThis.__dams;
  emit(`G0 age=${AGE} dam=${def && def.ConstructibleType} mod=${M && M.version}`);
  if (!def || !M) return finishNow("no Dam for this age, or the mod is not active");
  await clearScreens("start");
  if (!(await foundCapital(local))) return finishNow("no capital");
  await drainCinematics("after reveal");
  await sleep(2000);
  // Borders at turn 1 reach only the urban core, and a Dam placed there disappears into the rooftops (gal-ant).
  // Roll a little first so the settlement owns some open ground.
  for (let k = 0; k < 10 && Game.turn < 12; k++) await roll();
  const cid = Players.get(local).Cities.getCityIds()[0];
  const city = Cities.get(cid), C = city.location;
  // the river stretch nearest the capital that carries floodplains
  let best = null;
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0); i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    if (!plots.length) continue;
    const d = Math.min(...plots.map((l) => safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99)));
    const fp = plots.filter(isFloodplain).length;
    if (d <= 4 && (!best || fp > best.fp || (fp === best.fp && d < best.d))) best = { id, plots, d, fp };
  }
  if (!best) return finishNow("no river within reach of the capital");
  const mid = best.plots[Math.floor(best.plots.length / 2)];
  emit(`G1 river ${best.id} plots=${best.plots.length} floodplains=${best.fp} nearest=${best.d}`);
  await loadLens();
  cleanView(true);
  await look(mid, 0.3);
  await shot(`g-${tag}-site-before`);
  cleanView(false);
  // buy what we can, so the Dam has somewhere legal to stand
  for (const l of best.plots) if (!owningCity(l) && safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99) <= 3) { safe(() => city.purchasePlot({ x: l.x, y: l.y })); await sleep(700); }
  await sleep(1500);
  await openProduction(cid, def.ConstructibleType);
  AIM = null;
  await shot(`g-${tag}-production`);
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT")); await sleep(1500);
  // The picture wants open water, so choose the site rather than take the first plot production offers: a navigable
  // river tile with nothing built on it or beside it, bought for the settlement if it is not owned yet.
  const openness = (l) => {
    let n = 0;
    for (let k = 0; k < 6; k++) { const a = adj(l, k); if (a && !occupants(a).length) n++; }
    return n + (safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false) ? 6 : 0) + (isFloodplain(l) ? 2 : 0);
  };
  const scenic = best.plots
    .filter((l) => !occupants(l).length && safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99) <= 4)
    .sort((a, b) => openness(b) - openness(a));
  emit(`G3 scenic=${J(scenic.map((l) => ({ ...l, open: openness(l), owned: !!owningCity(l) })))}`);
  let site = null;
  for (const l of scenic.slice(0, 3)) {
    let c = owningCity(l);
    if (!c) { safe(() => city.purchasePlot({ x: l.x, y: l.y })); await sleep(1200); c = owningCity(l); }
    if (!c) continue;
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.id, Owner: c.owner }));
    await sleep(1200);
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: def.ConstructibleType, Location: { x: l.x, y: l.y }, Owner: c.owner }));
    await sleep(2000);
    if (occupants(l).includes(def.ConstructibleType)) { site = l; break; }
  }
  const offered = site ? null : safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false), null);
  const plots = [...((offered && offered.Plots) || []), ...((offered && offered.ExpandUrbanPlots) || [])].map(locOf);
  emit(`G3 offered=${J(plots)}`);
  if (!site && plots.length) {
    const l = plots[0];
    safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }));
    for (let k = 0; k < 40 && !occupants(l).includes(def.ConstructibleType); k++) await sleep(300);
    safe(() => city.BuildQueue.addProgress(6000));
    for (let k = 0; k < 40 && !occupants(l).includes(def.ConstructibleType); k++) await sleep(500);
    if (occupants(l).includes(def.ConstructibleType)) site = l;
  }
  if (!site) {
    for (const l of best.plots) {
      const c = owningCity(l);
      if (!c) continue;
      if (!occupants(l).length) { safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.id, Owner: c.owner })); await sleep(1200); }
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: def.ConstructibleType, Location: { x: l.x, y: l.y }, Owner: c.owner }));
      await sleep(2000);
      if (occupants(l).includes(def.ConstructibleType)) { site = l; break; }
    }
  }
  if (!site) return finishNow("nowhere on the river would take a Dam");
  safe(() => M.forget()); safe(() => M.sweep());
  await sleep(4000);
  emit(`G4 dam at ${J(site)} holds=${J(occupants(site))} drawn=${J(M.drawn())} levees=${J(M.citiesOnRiver(best.id).map((c) => occupants(c.center)))}`);
  // The production panel leaves the settlement selected, and the camera snaps back to it: drop the selection and
  // the interface mode first, or every dam shot frames the palace instead of the river (gal-ant4).
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
  safe(() => UI.Player.deselectAllUnits());
  safe(() => UI.Player.selectCity(null));
  await sleep(2000);
  // A natural-wonder cinematic can start at any point and takes the camera with it: gal-ant6 photographed a
  // Redwood Forest reveal three times over. Clear it here, while the buttons are still visible to press.
  await clearScreens("before the dam shots");
  cleanView(true);
  emit(`G5 framing site=${J(site)} lens=${J(safe(() => LM && LM.getActiveLens(), "?"))} hidden=${hidden.length}`);
  // The zoom that reads as a close shot depends on the ground: 0.2 framed an estuary nicely and put the camera
  // under the treetops on a wooded hill. Take the range and keep whichever frame is right.
  for (const z of [0.25, 0.4, 0.6]) {
    await look(site, z);
    await shot(`g-${tag}-dam-z${String(z).replace("0.", "")}`);
  }
  await look(mid, 0.5);
  await shot(`g-${tag}-valley`);
  cleanView(false);
  await roll();
  finishNow(`age=${AGE} dam=${J(site)} shots=5`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness gallery finished"), 4000); }
emit("attached gallery");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

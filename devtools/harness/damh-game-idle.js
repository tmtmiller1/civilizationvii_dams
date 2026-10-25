// damh-game-idle.js - sets up the remap probe game and hands it to the bench (tower-bench eval), which drives the
// placements and captures step by step and checks the camera before each shot.: can the engine draw a Dam as part of a district tile? The dam-remap-probe gives each Dam
// a shipped river building's art through VisualRemaps (Kind BUILDING). Three urban river tiles near the capital:
//   A  Gristmill + Dam        the question: does the Dam get the donor's half-block and a layout of its own?
//   B  Gristmill + Library    reference: two real buildings laid out by the engine
//   C  Dam alone              does the remap draw the full-tile donor?
// The mod's own WorldUI overlay is switched off, so a frame shows only what the engine draws. Then two side questions
// on the same map: does MapPlotEffects.addPlotEffect(PLOTEFFECT_FLOODED) take from the UI side (water behind a dam),
// and do the standalone water meshes draw through addModelAtPlot. Each site is shot before and after its buildings go down, from the same camera, so a diff of the two frames shows exactly what the engine added.
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-remap.js r1 900 mod+grant+remap
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
  // placing a district pulls the camera back to the city and selects it; put it back on the tile, three times
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT")); safe(() => UI.Player.selectCity(null)); safe(() => UI.Player.deselectAllUnits());
  for (let k = 0; k < 3 && AIM; k++) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2000); }
  await sleep(3000);
  if (hidden.length) rehide();
  emit("SHOT " + name);
  await sleep(20000);
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

const IDS = ["REMAP_DAM_ANTIQUITY", "REMAP_DAM_EXPLORATION", "REMAP_DAM_MODERN"];
function remapOn() {
  for (const id of IDS) emit(`R0 at load ${id} state=${J(safe(() => VisualRemaps.getRemapState(id), "?"))}`);
  const avail = safe(() => VisualRemaps.getAvailableRemaps(), null);
  emit(`R0 remaps available=${J(Array.isArray(avail) ? avail.map((r) => r.id) : avail)}`);
  const E = safe(() => VisualRemapSelection.Enabled, 1);
  for (const id of IDS) emit(`R0 set ${id} -> ${J(safe(() => VisualRemaps.setRemapState(id, E), "ERR"))} state=${J(safe(() => VisualRemaps.getRemapState(id), "?"))}`);
  emit(`R0 save=${J(safe(() => VisualRemaps.saveConfiguration(), "ERR"))}`);
}
function create(local, kind, type, l, c) {
  const args = { Kind: kind, Type: type, Location: { x: l.x, y: l.y }, Owner: c.owner };
  if (kind === "DISTRICT") args.Parent = c.id;
  return safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", args), "ERR");
}
async function urbanWith(local, l, c, types) {
  if (!occupants(l).length) { create(local, "DISTRICT", "DISTRICT_URBAN", l, c); await sleep(1500); }
  for (const t of types) { create(local, "CONSTRUCTIBLE", t, l, c); await sleep(1500); }
  await sleep(2500);
  return occupants(l);
}
function terrainName(l) { return safe(() => String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y)).TerrainType), "?"); }
function featureName(l) { return safe(() => { const f = GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y)); return f ? String(f.FeatureType) : "none"; }, "?"); }
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  remapOn();
  await clearScreens("start");
  if (!(await foundCapital(local))) return finishNow("no capital");
  await drainCinematics("after found");
  M.enabled = false; for (const p of M.drawn()) M.clearDam(p);
  await loadLens();
  // hand the game to the bench: helpers on globalThis.__r, DONE only when __r.finish() is called
  globalThis.__r = {
    IM, LM, create, urbanWith, occupants, owningCity, adj, terrainName, featureName, drainCinematics, clearScreens,
    clean: cleanView, look: (l, z) => safe(() => Camera.lookAtPlot(l, { zoom: z }), "ERR"),
    city: () => { const cid = Players.get(local).Cities.getCityIds()[0]; const c = Cities.get(cid); return { id: cid.id, owner: cid.owner, x: c.location.x, y: c.location.y }; },
    buy: (l) => { const cid = Players.get(local).Cities.getCityIds()[0]; return safe(() => Cities.get(cid).purchasePlot(l), "ERR"); },
    finish: (v) => finishNow(v || "idle finished"),
  };
  emit("IDLE ready: drive through tower-bench eval, call __r.finish() when done");
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness idle finished"), 4000); }
emit("attached idle");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

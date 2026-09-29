// damh-game-d27.js - D27, Levees by age (1.2.0). Each check prints PASS or FAIL:
//   T1 text for the three Dams and three Levees; every Levee kept out of the Civilopedia
//   T2 an Ancient Dam on a river two settlements share: the other settlement gets the Ancient Levee, the holder none
//   T3 a Modern Dam on the same river in the other settlement: the Modern Levee goes in at once, the Ancient one is
//      removed a turn later; the game is saved here as DAM-d27 (d27b loads it)
//   T4 the Modern Dam razed: the Ancient Levee comes back at once and the Modern one goes a turn later
//   START_AGE=AGE_EXPLORATION SEED=9001 KEEP_SAVES=1 zsh run-harness.sh damh-game-d27.js d27 1200 mod+grant
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
const LEVEES = ["BUILDING_DAM_LEVEE", "BUILDING_DAM_LEVEE_EXPLORATION", "BUILDING_DAM_LEVEE_MODERN"];
const TIER = { BUILDING_DAM_ANTIQUITY: 1, BUILDING_DAM_EXPLORATION: 2, BUILDING_DAM_MODERN: 3 };
function leveesAt(center) { return occupants(center).filter((t) => LEVEES.includes(t)); }
/** What each settlement on the river should hold, worked out here independently of the mod: the Levee of the best
 *  finished Dam on the river, unless it holds a Dam at least that good itself. */
function expected(M, river) {
  const dams = M.damsOnMap().filter((d) => d.complete && d.river === river);
  const best = Math.max(0, ...dams.map((d) => TIER[d.type] || 0));
  const out = {};
  for (const c of M.citiesOnRiver(river)) {
    const held = Math.max(0, ...dams.filter((d) => { const o = owningCity(d.loc); return o && `${o.owner}:${o.id}` === c.key; }).map((d) => TIER[d.type] || 0));
    out[c.key] = best > held ? LEVEES[best - 1] : null;
  }
  return out;
}
function compare(M, river, label, strict) {
  const want = expected(M, river);
  const have = Object.fromEntries(M.citiesOnRiver(river).map((c) => [c.key, leveesAt(c.center)]));
  const ok = Object.entries(want).every(([k, w]) => (w ? have[k].includes(w) : true) && (!strict || have[k].length === (w ? 1 : 0)));
  check(label, ok, `want=${J(want)} have=${J(have)}`);
  return ok;
}
async function place(local, loc, type) {
  const c = owningCity(loc);
  if (!occupants(loc).length) {
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: loc, Parent: c.id, Owner: c.owner }));
    await sleep(1200);
  }
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: type, Location: loc, Owner: c.owner }));
  await sleep(2500);
  return occupants(loc).includes(type);
}
async function sweepAndSettle(M) { safe(() => M.forget()); safe(() => M.sweep()); await sleep(3500); }
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  await drainCinematics("start");
  // T1 text for every Dam and Levee
  for (const tag of ["LOC_BUILDING_DAM_ANTIQUITY_DESCRIPTION", "LOC_BUILDING_DAM_EXPLORATION_DESCRIPTION", "LOC_BUILDING_DAM_MODERN_DESCRIPTION",
    "LOC_BUILDING_DAM_ANTIQUITY_TOOLTIP", "LOC_BUILDING_DAM_EXPLORATION_TOOLTIP", "LOC_BUILDING_DAM_MODERN_TOOLTIP",
    "LOC_BUILDING_DAM_LEVEE_DESCRIPTION", "LOC_BUILDING_DAM_LEVEE_EXPLORATION_DESCRIPTION", "LOC_BUILDING_DAM_LEVEE_MODERN_DESCRIPTION"]) {
    const t = safe(() => Locale.compose(tag), tag);
    check(`T1 ${tag}`, t && t !== tag, J(String(t).slice(0, 160)));
  }
  for (const c of ["CLASS_DAMS_FLOOD_MAJOR", "CLASS_DAMS_FLOOD_1000_YEAR"]) {
    const got = [safe(() => UI.getIconURL(c), ""), safe(() => UI.getIconURL(c, "FONTICON"), "")];
    const base = [safe(() => UI.getIconURL("CLASS_FLOOD"), "?"), safe(() => UI.getIconURL("CLASS_FLOOD", "FONTICON"), "?")];
    check(`T1 ${c} icons match the base flood`, got[0] === base[0] && got[1] === base[1], J({ got, base }));
  }
  for (const l of LEVEES) {
    const excl = safe(() => GameInfo.CivilopediaPageExcludes.filter((r) => r.PageID === l).length, 0);
    check(`T1 ${l} out of the Civilopedia`, excl > 0, "");
  }
  if (!(await foundCapital(local))) return finishNow("no capital");
  for (let k = 0; k < 8 && Game.turn < 8; k++) await roll();
  let pick = null;
  for (let tries = 0; tries < 8 && !pick; tries++) {
    for (let i = 0; i < safe(() => MapRivers.numRivers, 0) && !pick; i++) {
      const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
      const cities = safe(() => M.citiesOnRiver(id), []) || [];
      if (cities.length < 2) continue;
      const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
      const free = plots.filter((l) => owningCity(l) && !occupants(l).length);
      const a = free[0];
      const aKey = a && `${owningCity(a).owner}:${owningCity(a).id}`;
      const b = free.find((l) => `${owningCity(l).owner}:${owningCity(l).id}` !== aKey) || free[1];
      if (a && b) pick = { id, cities, a, b };
    }
    if (!pick) await roll();
  }
  if (!pick) return finishNow("no river shared by two settlements with two free tiles");
  const keyOf = (l) => { const c = owningCity(l); return `${c.owner}:${c.id}`; };
  emit(`S1 river=${pick.id} settlements=${J(pick.cities.map((c) => c.key))} a=${J(pick.a)} in ${keyOf(pick.a)} b=${J(pick.b)} in ${keyOf(pick.b)}`);
  // T2 an Ancient Dam: every other settlement on the river gets the Ancient Levee
  check("T2 Ancient Dam placed", await place(local, pick.a, "BUILDING_DAM_ANTIQUITY"), J(occupants(pick.a)));
  await sweepAndSettle(M);
  compare(M, pick.id, "T2 Levees after the Ancient Dam", true);
  // T3 a Modern Dam on the same river, in another settlement: the new Levee goes in at once, the old one a turn later
  check("T3 Modern Dam placed", await place(local, pick.b, "BUILDING_DAM_MODERN"), J(occupants(pick.b)));
  await sweepAndSettle(M);
  compare(M, pick.id, "T3 the Modern Levee is in at once", false);
  await roll(); await sweepAndSettle(M);
  compare(M, pick.id, "T3 a turn later only the Modern Levee is left", true);
  // Save here for the reload half (d27b)
  const saved = safe(() => Network.saveGame({ Location: SaveLocations.LOCAL_STORAGE, LocationCategories: SaveLocationCategories.NORMAL, Type: SaveTypes.SINGLE_PLAYER, ContentType: SaveFileTypes.GAME_STATE, Overwrite: true, FileName: "DAM-d27" }), "ERR");
  emit(`S2 saveGame DAM-d27 -> ${J(saved)} turn=${Game.turn} river=${pick.id} a=${J(pick.a)} b=${J(pick.b)}`);
  await sleep(6000);
  // T4 the Modern Dam razed: the settlements fall back to the Ancient Levee, and the Modern one goes a turn later
  const dam = safe(() => MapConstructibles.getConstructibles(pick.b.x, pick.b.y).map((id) => Constructibles.getByComponentID(id)).find((inst) => String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType) === "BUILDING_DAM_MODERN"), null);
  safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: dam.owner, LocalID: dam.localId != null ? dam.localId : dam.id }));
  await sleep(3000); await sweepAndSettle(M);
  check("T4 Modern Dam gone", !occupants(pick.b).includes("BUILDING_DAM_MODERN"), J(occupants(pick.b)));
  compare(M, pick.id, "T4 the Ancient Levee is back at once", false);
  await roll(); await sweepAndSettle(M);
  compare(M, pick.id, "T4 a turn later the Modern Levee is gone", true);
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d27 finished"), 4000); }
emit("attached d27");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

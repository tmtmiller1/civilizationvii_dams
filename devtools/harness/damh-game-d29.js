// damh-game-d29.js - D29, a Dam across the age transition. The transition reloads the gameplay database and every
// game-scope script, so this file runs twice and picks its half from the age:
//   Exploration: a Medieval Dam on a river (a shared one if there is one), the sweep, a report; then turns until the
//                age ends (dam-short-age-probe: 12 points), passing the transition hands-free (engine-closed.md)
//   Modern:      the Dam is still there, complete and drawn; the Levees stayed; the floodplains stayed dry; the
//                Medieval modifiers and the flood split are in the Modern database
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-d29.js d29 2400 mod+grant+shortage
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
function ageName() { return safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), "?"); }
function isFloodplainAt(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function riverLocs(id) { return (safe(() => MapRivers.getRiverPlots(id), []) || []).map((q) => (typeof q === "number" ? locOf(q) : q)); }
function report(M, label) {
  const dams = M.damsOnMap();
  const rivers = [...new Set(dams.map((d) => d.river))];
  emit(`${label} age=${ageName()} turn=${Game.turn} dams=${J(dams.map((d) => ({ plot: d.plot, type: d.type, complete: d.complete, river: d.river })))} drawn=${J(M.drawn())} levees=${J(rivers.map((r) => M.citiesOnRiver(r).map((c) => ({ key: c.key, levees: occupants(c.center).filter((t) => t.includes("LEVEE")) }))))} floodplainsLeft=${J(rivers.map((r) => riverLocs(r).filter(isFloodplainAt).length))}`);
  return dams;
}
let CTX = null;
async function passTransition(local) {
  const ids = safe(() => Game.Notifications.getIdsForPlayer(local), []) || [];
  const id = ids.find((n) => String(safe(() => Game.Notifications.getTypeName(n), "")) === "NOTIFICATION_AGE_TRANSITION");
  if (id == null) return false;
  emit("X age transition notification found; passing it");
  safe(() => Game.Notifications.activate(id)); await sleep(6000);
  const op = safe(() => PlayerOperationTypes.ADVANCED_START_MARK_COMPLETED, null);
  const can = safe(() => Game.PlayerOperations.canStart(local, op, {}, false), null);
  if (can && can.Success) safe(() => Game.PlayerOperations.sendRequest(local, op, {}));
  emit(`X mark completed canStart=${J(can && can.Success)}`);
  await sleep(3000);
  if (!CTX) { try { CTX = (await import("/core/ui/context-manager/context-manager.js")).ContextManager; } catch (e) { emit(`X ContextManager import ${e}`); } }
  safe(() => CTX && CTX.pop("screen-dedication-selection"));
  await sleep(2000);
  safe(() => GameContext.sendTurnComplete());
  return true;
}
async function explorationHalf(M, local) {
  if (!(await foundCapital(local))) return finishNow("no capital");
  for (let k = 0; k < 4; k++) await roll();
  let pick = null;
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0) && !pick; i++) {
    const id = MapRivers.getRiverIDByIndex(i);
    const cities = safe(() => M.citiesOnRiver(id), []) || [];
    const free = riverLocs(id).filter((l) => owningCity(l) && !occupants(l).length);
    if (free.length && cities.length >= 2) pick = { id, a: free[0] };
  }
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0) && !pick; i++) {
    const id = MapRivers.getRiverIDByIndex(i);
    const free = riverLocs(id).filter((l) => owningCity(l) && !occupants(l).length);
    if (free.length) pick = { id, a: free[0] };
  }
  if (!pick) return finishNow("no owned free river tile");
  const c = owningCity(pick.a);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: pick.a, Parent: c.id, Owner: c.owner }));
  await sleep(1200);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_EXPLORATION", Location: pick.a, Owner: c.owner }));
  await sleep(2500);
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(3500);
  report(M, "E1 before the transition");
  for (let t = 0; t < 40; t++) {
    const before = Game.turn;
    await roll();
    if (Game.turn === before) {
      if (!(await passTransition(local))) emit(`E2 turn ${Game.turn} did not advance; no transition notification yet`);
      await sleep(15000);
    }
    if (ageName() !== "AGE_EXPLORATION") return;
  }
  finishNow(`the age did not end within 40 turns (turn ${Game.turn}, ${ageName()})`);
}
async function modernHalf(M) {
  await sleep(8000);
  const dams = report(M, "M1 after the transition");
  const med = dams.filter((d) => d.type === "BUILDING_DAM_EXPLORATION");
  check("M1 the Medieval Dam is still on the map", med.length > 0, J(med));
  check("M1 it is complete", med.every((d) => d.complete), "");
  check("M1 it is drawn again", med.every((d) => M.drawn().includes(d.plot)), J(M.drawn()));
  const rivers = [...new Set(med.map((d) => d.river))];
  const levees = rivers.flatMap((r) => M.citiesOnRiver(r).map((c) => ({ key: c.key, holder: med.some((d) => { const o = owningCity(d.loc); return o && `${o.owner}:${o.id}` === c.key; }), levees: occupants(c.center).filter((t) => t.includes("LEVEE")) })));
  check("M2 every other settlement on the river holds the Medieval Levee", levees.filter((l) => !l.holder).every((l) => l.levees.includes("BUILDING_DAM_LEVEE_EXPLORATION")), J(levees));
  check("M3 the floodplains stay dried", rivers.every((r) => riverLocs(r).filter(isFloodplainAt).length === 0), "");
  const mods = ["MOD_DAMS_DAM_EXPLORATION_FLOOD_IMMUNITY", "MOD_DAMS_LEVEE_EXPLORATION_FLOOD_IMMUNITY"].map((m) => !!safe(() => GameInfo.Modifiers.lookup(m), null));
  check("M4 the Medieval immunity modifiers are in the Modern database", mods.every(Boolean), J(mods));
  const cls = safe(() => String(GameInfo.RandomEvents.lookup("RANDOM_EVENT_FLOOD_MAJOR").EventClass), "?");
  check("M4 the flood split holds in the Modern database", cls === "CLASS_DAMS_FLOOD_MAJOR", cls);
  await roll(); await sleep(3000);
  report(M, "M5 a turn later");
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`S0 loaded in ${ageName()} turn ${Game.turn} mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  await drainCinematics("start");
  if (ageName() === "AGE_EXPLORATION") return explorationHalf(M, local);
  return modernHalf(M);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d29 finished"), 4000); }
emit("attached d29");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

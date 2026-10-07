// damh-game-d25.js - D25, the checks for tonight's fixes. Each prints PASS or FAIL:
//   T1 text and icons resolve for all three ages; the Levee's Civilopedia exclusion row is loaded
//   T2 the upgrade rule: an Antiquity Dam on a river does not block a Medieval one, but does block another Antiquity
//   T3 a Dam that lands complete (as a purchase does) is drawn without anyone calling sweep: the added-to-map hook
//   T4 the Levee lifecycle: placed in the other settlement on the river; the Dam razed; the Levee survives the first
//      orphaned turn and is gone after the second
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-d25.js d25 900 mod+grant
// Was: D22, the save half of the reload test. Places a Dam on a river the capital owns, lets the mod's
// sweep draw it, raise Levees and dry the floodplains, records all of it, then saves as DAM-d22. D23 loads that save
// and checks it all came back - including that the first sweep after a load does not strip the Levees (unprotect
// waits for two turns before removing one).
//   START_AGE=AGE_EXPLORATION SEED=9001 KEEP_SAVES=1 zsh run-harness.sh damh-game-d22.js d22 900 mod+grant
// Was: damh-game-gallery.js - the release captures, one run per age (the age comes from the game, so the same script
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
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
async function run() {
  await loadIM();
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  await drainCinematics("start");
  // T1
  for (const age of ["ANTIQUITY", "EXPLORATION", "MODERN"]) {
    const tag = `LOC_BUILDING_DAM_${age}_NAME`;
    const name = safe(() => Locale.compose(tag), tag);
    const icon = safe(() => UI.getIconURL(`BUILDING_DAM_${age}`), "");
    check(`T1 ${age} name`, name && name !== tag, J(name));
    check(`T1 ${age} icon`, /dam_(ancient|medieval|modern)/.test(String(icon)), J(icon));
  }
  const excl = safe(() => GameInfo.CivilopediaPageExcludes.filter((r) => r.PageID === "BUILDING_DAM_LEVEE"), []);
  check("T1 Levee kept out of the Civilopedia", excl && excl.length > 0, J(excl && excl.map((r) => r.SectionID)));
  // find a river two settlements share (as d22)
  if (!(await foundCapital(local))) return finishNow("no capital");
  for (let k = 0; k < 8 && Game.turn < 8; k++) await roll();
  let pick = null;
  for (let tries = 0; tries < 6 && !pick; tries++) {
    for (let i = 0; i < safe(() => MapRivers.numRivers, 0) && !pick; i++) {
      const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
      const cities = safe(() => M.citiesOnRiver(id), []) || [];
      if (cities.length < 2) continue;
      const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
      const free = plots.filter((l) => owningCity(l) && !occupants(l).length);
      if (free.length >= 2) pick = { id, cities, a: free[0], b: free[1] };
    }
    if (!pick) await roll();
  }
  if (!pick) return finishNow("no river shared by two settlements with two free tiles");
  // T2: the rule, asked directly of the mod with an Antiquity Dam on the river
  const fake = [{ plot: idxOf(pick.a), loc: pick.a, river: pick.id, type: "BUILDING_DAM_ANTIQUITY", complete: true }];
  const vSame = safe(() => M.damVerdict(pick.b, fake, "BUILDING_DAM_ANTIQUITY"), "ERR");
  const vNewer = safe(() => M.damVerdict(pick.b, fake, "BUILDING_DAM_EXPLORATION"), "ERR");
  check("T2 same age blocked", vSame === "LOC_DAM_RIVER_TAKEN", J(vSame));
  check("T2 newer age allowed", vNewer === null, J(vNewer));
  // T3: place a Dam complete, then wait - no sweep call - for the hook to draw it
  const c = owningCity(pick.a);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: pick.a, Parent: c.id, Owner: c.owner }));
  await sleep(1200);
  safe(() => M.forget());
  const before = M.drawn().length;
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_EXPLORATION", Location: pick.a, Owner: c.owner }));
  let drawnByHook = false;
  for (let k = 0; k < 16 && !drawnByHook; k++) { await sleep(500); drawnByHook = M.drawn().includes(idxOf(pick.a)); }
  check("T3 a Dam that lands complete is drawn without a sweep call", drawnByHook, `drawn ${before} -> ${M.drawn().length}`);
  // T4: the Levee lifecycle
  safe(() => M.sweep()); await sleep(3000);
  const holder = `${c.owner}:${c.id}`;
  const other = pick.cities.find((x) => x.key !== holder);
  const leveeIn = (key) => { const x = M.citiesOnRiver(pick.id).find((y) => y.key === key); return !!x && occupants(x.center).includes("BUILDING_DAM_LEVEE"); };
  check("T4 Levee placed in the other settlement", other && leveeIn(other.key), J(other && other.key));
  check("T4 no Levee in the holder", !leveeIn(holder), holder);
  const dam = safe(() => MapConstructibles.getConstructibles(pick.a.x, pick.a.y).map((id) => Constructibles.getByComponentID(id)).find((inst) => String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType) === "BUILDING_DAM_EXPLORATION"), null);
  safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: dam.owner, LocalID: dam.localId != null ? dam.localId : dam.id }));
  await sleep(3000);
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(2500);
  check("T4 the Dam is gone", !occupants(pick.a).includes("BUILDING_DAM_EXPLORATION"), J(occupants(pick.a)));
  check("T4 its look is cleared", !M.drawn().includes(idxOf(pick.a)), J(M.drawn()));
  check("T4 Levee survives the first orphaned sweep", other && leveeIn(other.key), "turn " + Game.turn);
  await roll(); safe(() => M.sweep()); await sleep(3000);
  const gone = other && !safe(() => { const x = safe(() => Cities.get({ owner: Number(other.key.split(":")[0]), id: Number(other.key.split(":")[1]), type: 1 }), null); return occupants(other.center).includes("BUILDING_DAM_LEVEE"); }, true);
  check("T4 Levee removed on the next turn", gone, "turn " + Game.turn);
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d25 finished"), 4000); }
emit("attached d25");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

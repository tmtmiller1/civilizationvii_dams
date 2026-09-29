// damh-game-d21.js - D21. The three ages' dams at their shipped scales, side by side in one frame, so their sizes can
// be compared directly. The meshes differ a lot in native size, so matching scale numbers says nothing about what
// renders. Reads DAM_LOOKS from the running mod (globalThis.__dams.looks), so it tests exactly what ships.
// Was: D20. The Antiquity rock weir, four ways. The boulders tried so far stand up like menhirs
// (gal-ant3) and the gallery camera never framed the replacement (gal-ant4), so this draws the arrangements on open
// navigable water and frames each one on its own, which is how the medieval and modern looks were settled.
// Was: D19. The other two ages. d18 settled the medieval look: the Great Wall's river span reads as a
// stone barrier across the water with a gated arch through it. This looks for a rock weir for Antiquity and a
// concrete one for Modern.
// Was: D18. The Great Wall's river span, seen on its own. Of everything the game ships, the piece
// literally shaped like a wall crossing water is the Great Wall where it fords a river, and it has never yet been
// seen cleanly: d4 and d6 stacked it with three other models on one tile, d9 shot the advisor screen and d11 shot
// fog. Four variants, one to a tile of open navigable water, each framed on its own.
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-d18.js d18 1200 mod
// Was: D17. Make it look like a dam. Single models do not: d11b drew twelve, one to a tile, and the
// best of them (a dockyard gatehouse) is a compact building, while gal-ant then buried it in a city. A dam has to
// span the water and have water falling over it, so this draws COMPOSITIONS - a row of wall pieces across the flow,
// with a gatehouse and a waterfall - one per tile of an open navigable river, and captures each tile on its own.
//   SEED=9001 zsh run-harness.sh damh-game-d17.js d17 1200 mod
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function adj(loc, k) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[k]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
function armAngle(k) { return (360 - 60 * k) % 360; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), "?"); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), damaged: safe(() => inst.damaged, "?") }; }), []); }
function owningCity(l) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.owner >= 0 ? c : null; }, null); }
let local = -1;
function food(l) { return safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_FOOD, local), null); }
let AIM = null;
async function look(loc, zoom) { await drainCinematics("look"); AIM = { loc, zoom }; safe(() => Camera.lookAtPlot(loc, { zoom })); await sleep(2500); }
async function shot(name) { if (AIM) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(50000); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
const occurred = [];
function hook() { safe(() => engine.on("RandomEventOccurred", (d) => occurred.push({ turn: Game.turn, at: d.location, type: safe(() => GameInfo.RandomEvents.lookup(d.eventType)?.RandomEventType, d.eventType) }))); }

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
function categories() { return Array.from(document.querySelectorAll(".production-category")); }
function items() { return Array.from(document.querySelectorAll("production-chooser-item")); }
function panelReady() { return categories().length > 0; }
/** Press Continue / Close on whatever cinematic or popup is up (copied from the canals harness, c41). */
async function clearScreens(label) {
  for (let k = 0; k < 15; k++) {
    const m = mode();
    const buttons = Array.from(document.querySelectorAll("fxs-button, fxs-hero-button, fxs-close-button")).filter((b) => safe(() => b.getBoundingClientRect().width > 0, false));
    const hit = buttons.find((b) => /continue|close|LOC_WONDER_MOVIE|LOC_GENERIC_(CONTINUE|OK|CLOSE)/i.test(String(b.getAttribute("caption") || "") + " " + String(b.textContent || "")));
    if (m !== "INTERFACEMODE_CINEMATIC" && !hit) { emit(`CLEAR ${label} clean after ${k} (mode=${m})`); return; }
    if (hit) hit.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); else safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
    await sleep(2500);
  }
  emit(`CLEAR ${label} gave up mode=${mode()}`);
}
function flowSides(l, set) { const out = []; for (let k = 0; k < 6; k++) { const n = adj(l, k); if (n && set.has(idxOf(n))) out.push(k); } return out; }
async function meshPass(chain, set) {
  if (typeof WorldUI === "undefined" || typeof PlacementMode === "undefined") { emit("P1 no WorldUI"); return; }
  const mid = chain[Math.floor(chain.length / 2)];
  for (let b = 0; b < BATCHES.length; b++) {
    const group = safe(() => WorldUI.createModelGroup("DamProbe9_" + b), null);
    const placed = [];
    BATCHES[b].forEach((asset, k) => {
      const l = chain[k];
      if (!l) return;
      const sides = flowSides(l, set);
      const across = ((sides.length ? armAngle(sides[0]) : 0) + 90) % 360;
      const r = safe(() => group.addModelAtPlot(asset, { i: l.x, j: l.y }, { x: 0, y: 0, z: 0 }, { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: 1, angle: across }), "ERR");
      placed.push({ asset, at: l, across, ok: !!(r && r.id) });
    });
    emit(`P1 batch ${b} ${J(placed)}`);
    await look(mid, 0.06);
    await shot(`d11-mesh-${b}`);
    safe(() => group.clear()); safe(() => group.destroy());
  }
}



/** Four ways to build a dam out of shipped pieces. Each entry is [asset, along the wall, downstream, scale, turn]. */
const AGES = ["AGE_ANTIQUITY", "AGE_EXPLORATION", "AGE_MODERN"];
let COMPOSITIONS = [];
function offsetFor(angle, along, down) {
  const r = angle * Math.PI / 180;
  return { x: Math.cos(r) * along - Math.sin(r) * down, y: Math.sin(r) * along + Math.cos(r) * down, z: 0 };
}
async function run() {
  await loadIM();
  local = GameContext.localPlayerID;
  emit(`P0 mod=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  await clearScreens("start");
  await sleep(2500);
  await clearScreens("after reveal");
  await drainCinematics("after reveal");
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const isNav = (l) => safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false) === true;
  const builtOn = (l) => safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).length > 0, false);
  // Open navigable water: nothing built on the tile, and at least one navigable neighbor so the flow has an axis.
  // The four compositions do not need to sit next to each other - each is framed on its own - so take four that are
  // spread out rather than a contiguous run (the first cut of this probe looked for a run and found one tile).
  // Only tiles the player can already see: revealing the map is what queued the wonder cinematics that stole the
  // camera. Navigable water first, any river tile if there is not enough of it in sight.
  const seen = (l) => safe(() => GameplayMap.getRevealedState(local, l.x, l.y), 0) !== safe(() => RevealedStates.HIDDEN, 0);
  const riverKind = (l) => safe(() => GameplayMap.getRiverType(l.x, l.y), -1);
  const nav = [], minor = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = { x, y };
    if (!seen(l) || builtOn(l)) continue;
    const k = riverKind(l);
    if (k === safe(() => RiverTypes.RIVER_NAVIGABLE, 1)) nav.push(l);
    else if (k === safe(() => RiverTypes.RIVER_MINOR, 0)) minor.push(l);
  }
  const all = [...nav, ...minor];
  const set = new Set(all.map(idxOf));
  const clear = all.filter((l) => flowSides(l, set).length > 0);
  const looks = safe(() => globalThis.__dams.looks, null);
  if (!looks) return finishNow("mod not active: no looks to draw");
  COMPOSITIONS = AGES.map((age) => [age, looks[age] || []]);
  // Three open tiles in a loose run - each two or three from the last, all within six of the first - so the three
  // dams share one wide frame. (Demanding all three pairwise exactly two apart found nothing on 33 open tiles.)
  const dist = (a, b) => safe(() => GameplayMap.getPlotDistance(a.x, a.y, b.x, b.y), 99);
  let chain = [];
  for (const seed of clear) {
    const pick = [seed];
    for (const l of clear) {
      if (pick.length === 3) break;
      const last = pick[pick.length - 1];
      const d = dist(last, l);
      if (d >= 2 && d <= 3 && pick.every((p) => dist(p, l) >= 2) && dist(seed, l) <= 6) pick.push(l);
    }
    if (pick.length === 3) { chain = pick; break; }
  }
  emit(`P1 visible navigable=${nav.length} minor=${minor.length} usable=${clear.length} chain=${J(chain)}`);
  if (chain.length < 3) return finishNow(`no three open navigable tiles two apart (open=${clear.length})`);
  if (typeof WorldUI === "undefined") return finishNow("no WorldUI");
  // Draw through the mod's own drawDam, so this is exactly what ships: same pieces, same flow angle, same VFX route.
  const M = globalThis.__dams;
  const drawnPlots = [];
  AGES.forEach((age, k) => {
    const l = chain[k];
    if (!l) return;
    const plot = idxOf(l);
    const d = { plot, loc: l, river: M.riverAt(l), type: "BUILDING_DAM_" + age.replace("AGE_", "") };
    const ok = safe(() => M.drawDam(d), "ERR");
    drawnPlots.push(plot);
    emit(`P2 ${k} ${age} at ${J(l)} river=${d.river} flow=${J(safe(() => M.flowAngle(l, d.river), "?"))} drawn=${J(ok)}`);
  });
  await sleep(2500);
  const cx = Math.round(chain.reduce((n, l) => n + l.x, 0) / chain.length);
  const cy = Math.round(chain.reduce((n, l) => n + l.y, 0) / chain.length);
  await look({ x: cx, y: cy }, 0.3);
  await shot("d21-all-three");
  for (let k = 0; k < chain.length; k++) {
    await look(chain[k], 0.2);
    await shot(`d21-${AGES[k].replace("AGE_", "").toLowerCase()}`);
  }
  for (const plot of drawnPlots) safe(() => M.clearDam(plot));
  finishNow(`compositions=${COMPOSITIONS.length} chain=${J(chain)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d21 finished"), 4000); }
emit("attached d21");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

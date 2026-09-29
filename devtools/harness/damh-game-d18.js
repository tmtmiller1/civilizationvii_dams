// damh-game-d18.js - D18. The Great Wall's river span, seen on its own. Of everything the game ships, the piece
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
async function look(loc, zoom) { AIM = { loc, zoom }; safe(() => Camera.lookAtPlot(loc, { zoom })); await sleep(2500); }
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

const IM = safe(() => InterfaceMode, null);
function mode() { return safe(() => IM.getCurrent(), "?"); }
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
const COMPOSITIONS = [
  ["Han river span", [["IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 1, 0]]],
  ["Ming river span", [["IMPROVEMENT_MING_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 1, 0]]],
  ["Han river arch", [["HAN_Great_Wall_River_Arch", 0, 0, 1, 0]]],
  ["Han river span with a spill", [
    ["IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 1, 0],
    ["VFX_WaterFall_Loop_AutoHeight_Medium_Flood", 0, 0.24, 1, 0],
  ]],
];
function offsetFor(angle, along, down) {
  const r = angle * Math.PI / 180;
  return { x: Math.cos(r) * along - Math.sin(r) * down, y: Math.sin(r) * along + Math.cos(r) * down, z: 0 };
}
async function run() {
  local = GameContext.localPlayerID;
  emit(`P0 mod=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  await clearScreens("start");
  emit(`P0 reveal=${J(safe(() => Visibility.revealAllPlots(local), "ERR"))}`);
  await sleep(2500);
  await clearScreens("after reveal");
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const isNav = (l) => safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false) === true;
  const builtOn = (l) => safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).length > 0, false);
  // Open navigable water: nothing built on the tile, and at least one navigable neighbor so the flow has an axis.
  // The four compositions do not need to sit next to each other - each is framed on its own - so take four that are
  // spread out rather than a contiguous run (the first cut of this probe looked for a run and found one tile).
  const nav = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = { x, y }; if (isNav(l)) nav.push(l); }
  const set = new Set(nav.map(idxOf));
  const clear = nav.filter((l) => !builtOn(l) && flowSides(l, set).length > 0);
  const chain = [];
  const far = (l) => chain.every((c) => safe(() => GameplayMap.getPlotDistance(c.x, c.y, l.x, l.y), 0) >= 3);
  for (const l of clear) { if (far(l)) chain.push(l); if (chain.length === 4) break; }
  emit(`P1 navigable=${nav.length} open=${clear.length} chain=${J(chain)}`);
  if (chain.length < 2) return finishNow(`only ${chain.length} open navigable tiles`);
  if (typeof WorldUI === "undefined") return finishNow("no WorldUI");
  const groups = [];
  COMPOSITIONS.forEach(([name, pieces], k) => {
    const l = chain[k];
    if (!l) return;
    const sides = flowSides(l, set);
    const across = ((sides.length ? armAngle(sides[0]) : 0) + 90) % 360;
    const g = safe(() => WorldUI.createModelGroup("DamComp_" + k), null);
    if (!g) return;
    for (const [asset, along, down, scale, turn] of pieces) {
      safe(() => g.addModelAtPlot(asset, { i: l.x, j: l.y }, offsetFor(across, along, down),
        { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale, angle: (across + turn) % 360 }));
    }
    groups.push(g);
    emit(`P2 ${k} "${name}" at ${J(l)} across=${across} pieces=${pieces.length}`);
  });
  await sleep(2500);
  for (let k = 0; k < Math.min(chain.length, COMPOSITIONS.length); k++) {
    await look(chain[k], 0.04);
    await shot(`d18-span-${k}`);
  }
  for (const g of groups) { safe(() => g.clear()); safe(() => g.destroy()); }
  finishNow(`compositions=${COMPOSITIONS.length} chain=${J(chain)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d18 finished"), 4000); }
emit("attached d18");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

// damh-game-d11.js - D11. The candidate dam meshes, seen properly. d6 stacked four on one tile; d9 captured the
// opening advisor screen instead of the map. This one dismisses whatever is up first, reveals the map, then draws
// ONE candidate per tile along a four-tile stretch of the longest river and captures each batch.
//   SEED=9001 zsh run-harness.sh damh-game-d11.js d11 900 mod
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
// One candidate per tile: four tiles, four meshes, one capture. Names verified against the 1.5.0 asset catalog.
const BATCHES = [
  ["IMPROVEMENT_HAN_GREAT_WALL_MIDDLE", "IMPROVEMENT_MING_GREAT_WALL_MIDDLE", "IMP_Great_Wall_Turns_Straight_A", "Great_Wall_Gap_Filler"],
  ["IMPROVEMENT_Kasbah_Wall_01", "IMPROVEMENT_TERRACE_FARM", "IMP_TerraceFarm_A", "Machu_Picchu_Cliff_Top_B"],
  ["MOD_Bridge_Stone_A", "ANT_Bridge_Wooden_C", "MED_CRT_Dockyard_Gate_HB", "STD_Mountain_Bridge_Straight_A"],
];
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


async function run() {
  local = GameContext.localPlayerID;
  emit(`P0 mod=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  await clearScreens("start");
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
  await sleep(1500);
  emit(`P0 reveal=${J(safe(() => Visibility.revealAllPlots(local), "ERR"))}`);
  await sleep(2500);
  await clearScreens("after reveal");
  const rivers = [];
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0); i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    rivers.push({ i, id, plots, set: new Set(plots.map(idxOf)) });
  }
  // Near the capital, not the longest on the map: a far river sits in fog and every model renders black (d11 first run).
  const cap = safe(() => Players.get(local).Cities.getCapital(), null);
  const C = cap ? cap.location : { x: GameplayMap.getGridWidth() / 2, y: GameplayMap.getGridHeight() / 2 };
  const near = (r) => Math.min(...r.plots.map((l) => safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99)));
  const longest = rivers.filter((r) => r.plots.length >= 4).sort((a, b) => near(a) - near(b))[0]
    || rivers.slice().sort((a, b) => b.plots.length - a.plots.length)[0];
  emit(`P1 capital=${J(C)} chosen river distance=${J(longest && near(longest))}`);
  const chain = [];
  for (const l of longest.plots) { if (!chain.length || flowSides(l, new Set(chain.map(idxOf))).length) chain.push(l); if (chain.length === 4) break; }
  emit(`P1 river ${longest.i} plots=${longest.plots.length} chain=${J(chain)} mode=${mode()}`);
  if (chain.length < 4) return finishNow("no four-tile stretch");
  // Does drying a river touch anything but the floodplain feature? Read terrain and navigability either side, on a
  // river that carries navigable tiles, then hand the tiles back by re-reading (nothing is restored: this is a probe).
  const M = safe(() => globalThis.__dams, null);
  const terrainName = (l) => safe(() => String(GameInfo.Terrains.lookup(GameplayMap.getTerrainType(l.x, l.y))?.TerrainType), "?");
  const navOf = (l) => safe(() => GameplayMap.isNavigableRiver(l.x, l.y), "?");
  const riverName = (l) => safe(() => Locale.compose(GameplayMap.getRiverName(l.x, l.y) || ""), "");
  const pick = rivers.filter((r) => r.plots.some((l) => navOf(l) === true && isFloodplain(l)))
    .sort((a, b) => b.plots.length - a.plots.length)[0];
  if (M && pick) {
    const snap = () => pick.plots.map((l) => ({ x: l.x, y: l.y, terrain: terrainName(l), nav: navOf(l), fp: isFloodplain(l), river: riverName(l) }));
    const was = snap();
    const n = safe(() => M.dry([{ river: pick.id, complete: true }]), "ERR");
    await sleep(2500);
    emit(`P2 dry(river ${pick.i}) -> ${J(n)}`);
    emit(`P2 before=${J(was)}`);
    emit(`P2 after=${J(snap())}`);
    emit(`P2 riverPlotsStillListed=${(safe(() => MapRivers.getRiverPlots(pick.id), []) || []).length}`);
  } else emit("P2 no river with a navigable floodplain tile on this seed");
  await meshPass(chain, longest.set);
  finishNow(`batches=${BATCHES.length} chain=${J(chain)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d11 finished"), 4000); }
emit("attached d11");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

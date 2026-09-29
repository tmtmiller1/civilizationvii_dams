// damh-game-d23.js - D23, the load half of the reload test. Loads DAM-d22 with the mod on and checks that the Dam is
// read back off the map and drawn again, the Levees are still there - and still there after the first sweep and after
// a turn, since unprotect must not strip them while the map is still loading - and the floodplains stay dried.
//   SAVE=DAM-d22.Civ7Save zsh run-harness.sh damh-game-d23.js d23 600 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
async function shot(name, loc) { if (loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0.08 })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(50000); }
async function run() {
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  // Read the Levees at once, before the mod's own first sweep (it runs about 3 s after load), then again after it.
  const leveesNow = () => M.damsOnMap().map((d) => M.citiesOnRiver(d.river).map((c) => ({ key: c.key, levee: occupants(c.center).includes("BUILDING_DAM_LEVEE") })));
  emit(`S0a at load levees=${J(leveesNow())}`);
  await sleep(6000);
  emit(`S0b after the first sweep levees=${J(leveesNow())}`);
  const dams = M.damsOnMap();
  const fpLeft = dams.map((d) => ((safe(() => MapRivers.getRiverPlots(d.river), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p))).filter(isFloodplain).length);
  emit(`S0c floodplains left per dammed river=${J(fpLeft)}`);
  emit(`S0 turn ${Game.turn} dams=${J(dams.map((d) => ({ loc: d.loc, river: d.river, type: d.type, complete: d.complete })))} drawn=${J(M.drawn())} levees=${J(dams.map((d) => M.citiesOnRiver(d.river).map((c) => ({ key: c.key, center: occupants(c.center) }))))}`);
  if (dams[0]) await shot("d7-reloaded", dams[0].loc);
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(4000);
  emit(`S1 turn ${Game.turn} drawn=${J(M.drawn())} dams=${M.damsOnMap().length} levees=${J(leveesNow())}`);
  // A settlement holding a finished Dam is covered by the Dam and has no Levee; every other one on the river has one.
  const holders = new Set(dams.map((d) => safe(() => { const c = GameplayMap.getOwningCityFromXY(d.loc.x, d.loc.y); return `${c.owner}:${c.id}`; }, "")));
  const leveesOk = dams.every((d) => M.citiesOnRiver(d.river).every((c) => occupants(c.center).includes("BUILDING_DAM_LEVEE") !== holders.has(c.key)));
  finishNow(`dams=${dams.length} drawn=${M.drawn().length} leveesOk=${leveesOk}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d23 finished"), 4000); }
emit("attached d23");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

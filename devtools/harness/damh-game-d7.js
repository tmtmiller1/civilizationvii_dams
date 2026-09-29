// damh-game-d7.js - D7. A save with Dams, reloaded with the mod on: are the Dams read back off the map, drawn again,
// and their Levees still in place? Also rolls one turn with the reloaded game.
//   SAVE=DAM-d6.Civ7Save zsh run-harness.sh damh-game-d7.js d7 600 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
async function shot(name, loc) { if (loc) { safe(() => Camera.lookAtPlot(loc, { zoom: 0.08 })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(50000); }
async function run() {
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  await sleep(4000);
  const dams = M.damsOnMap();
  emit(`S0 turn ${Game.turn} dams=${J(dams.map((d) => ({ loc: d.loc, river: d.river, type: d.type, complete: d.complete })))} drawn=${J(M.drawn())} levees=${J(dams.map((d) => M.citiesOnRiver(d.river).map((c) => ({ key: c.key, center: occupants(c.center) }))))}`);
  if (dams[0]) await shot("d7-reloaded", dams[0].loc);
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(4000);
  emit(`S1 turn ${Game.turn} drawn=${J(M.drawn())} dams=${M.damsOnMap().length}`);
  finishNow(`dams=${dams.length} drawn=${M.drawn().length} leveesOk=${dams.every((d) => M.citiesOnRiver(d.river).every((c) => occupants(c.center).includes("BUILDING_DAM_LEVEE")))}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d7 finished"), 4000); }
emit("attached d7");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

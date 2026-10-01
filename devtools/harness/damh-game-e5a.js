// damh-game-e5a.js - E5a, a 1.3.0 save with dam-site markers on it, for e5b to load with 2.0.0. Runs on the 1.3.0
// mod (MODSRC=a checkout of v1.3.0). Exploration, so the AIs have built-on tiles along flooding rivers and 1.3.0 marks
// their sites. Logs every marker on the map with the feature 1.3.0 recorded under it, then saves DAM-e5.
//   MODSRC=/path/to/v1.3.0 START_AGE=AGE_EXPLORATION SEED=9001 KEEP_SAVES=1 zsh run-harness.sh damh-game-e5a.js e5a 900 mod
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function featureName(x, y) { return safe(() => { const f = GameplayMap.getFeatureType(x, y); return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType); }, "?"); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 90000) await sleep(750);
  await sleep(1500);
}
function markers() {
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight(); const out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (featureName(x, y) === "FEATURE_DAMS_SITE") out.push(GameplayMap.getIndexFromXY(x, y));
  return out;
}
async function run() {
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version}`);
  if (!M || M.version !== "1.3.0") return finishNow(`wrong mod ${M && M.version}`);
  for (let k = 0; k < 4 && markers().length < 2; k++) { await roll(); await sleep(6000); }
  const rec = safe(() => JSON.parse(String(Configuration.getGame().getValue("Dams_Sites_v1"))), {});
  const m = markers();
  emit(`S1 turn=${Game.turn} markers=${m.length} record=${J(rec)}`);
  emit(`EXPECT ${J(m.map((i) => ({ i, was: (rec[i] && rec[i].was) || "" })))}`);
  const saved = safe(() => Network.saveGame({ Location: SaveLocations.LOCAL_STORAGE, LocationCategories: SaveLocationCategories.NORMAL, Type: SaveTypes.SINGLE_PLAYER, ContentType: SaveFileTypes.GAME_STATE, Overwrite: true, FileName: "DAM-e5" }), "ERR");
  emit(`S2 saveGame DAM-e5 -> ${J(saved)}`);
  await sleep(8000);
  finishNow(m.length ? `saved with ${m.length} markers` : "no markers to test");
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e5a finished"), 4000); }
emit("attached e5a");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

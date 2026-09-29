// damh-game-d27b.js - D27b, the load half of d27. Loads DAM-d27 (an Ancient and a Modern Dam on one river, the Modern
// Levee in the settlement holding only the Ancient Dam) and checks the Levees come back, survive the first sweep after
// the load, and are unchanged a turn later.
//   SAVE=DAM-d27.Civ7Save zsh run-harness.sh damh-game-d27b.js d27b 600 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
function owningKey(l) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.owner >= 0 ? `${c.owner}:${c.id}` : null; }, null); }
const LEVEES = ["BUILDING_DAM_LEVEE", "BUILDING_DAM_LEVEE_EXPLORATION", "BUILDING_DAM_LEVEE_MODERN"];
const TIER = { BUILDING_DAM_ANTIQUITY: 1, BUILDING_DAM_EXPLORATION: 2, BUILDING_DAM_MODERN: 3 };
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
function state(M) {
  const out = {};
  for (const d of M.damsOnMap()) for (const c of M.citiesOnRiver(d.river)) out[c.key] = occupants(c.center).filter((t) => LEVEES.includes(t));
  return out;
}
function want(M) {
  const out = {};
  const dams = M.damsOnMap().filter((d) => d.complete);
  for (const river of new Set(dams.map((d) => d.river))) {
    const on = dams.filter((d) => d.river === river);
    const best = Math.max(...on.map((d) => TIER[d.type] || 0));
    for (const c of M.citiesOnRiver(river)) {
      const held = Math.max(0, ...on.filter((d) => owningKey(d.loc) === c.key).map((d) => TIER[d.type] || 0));
      out[c.key] = best > held ? LEVEES[best - 1] : null;
    }
  }
  return out;
}
function matches(have, w) { return Object.entries(w).every(([k, v]) => (v ? (have[k] || []).length === 1 && have[k][0] === v : !(have[k] || []).length)); }
async function run() {
  const M = globalThis.__dams;
  if (!M) return finishNow("mod not active");
  const atLoad = state(M);
  emit(`S0a at load dams=${J(M.damsOnMap().map((d) => ({ type: d.type, river: d.river, complete: d.complete })))} levees=${J(atLoad)} want=${J(want(M))}`);
  check("L1 the Levees came back with the save", matches(atLoad, want(M)), J(atLoad));
  await sleep(6000);
  const afterSweep = state(M);
  check("L2 the first sweep after the load strips nothing", matches(afterSweep, want(M)), J(afterSweep));
  check("L3 both Dams drawn again", M.drawn().length >= 2, J(M.drawn()));
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(5000);
  const later = state(M);
  check("L4 a turn later the Levees are unchanged", matches(later, want(M)), J(later));
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d27b finished"), 4000); }
emit("attached d27b");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

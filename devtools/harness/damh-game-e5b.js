// damh-game-e5b.js - E5b, the 1.3.0 save DAM-e5 loaded with 2.0.0: every dam-site marker is lifted and the feature
// it stood in for is back. PROBE_OPTS carries e5a's EXPECT list ([{i, was}]).
//   PROBE_OPTS='<EXPECT json>' SAVE=DAM-e5.Civ7Save zsh run-harness.sh damh-game-e5b.js e5b 600 mod
const TAG = "[DAM]";
const EXPECT = (() => { try { return JSON.parse('__PROBE_OPTS__'); } catch (e) { return null; } })();
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function featureName(i) { return safe(() => { const l = GameplayMap.getLocationFromIndex(i); const f = GameplayMap.getFeatureType(l.x, l.y); return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType); }, "?"); }
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
async function run() {
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version} expect=${EXPECT ? EXPECT.length : "none"}`);
  if (!M || !EXPECT) return finishNow("mod not active or no EXPECT");
  // The lift runs 3 s after the game starts and waits on each write; give it time.
  for (let k = 0; k < 20 && EXPECT.some((e) => featureName(e.i) === "FEATURE_DAMS_SITE"); k++) await sleep(2000);
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight(); let left = 0;
  for (let i = 0; i < W * H; i++) if (featureName(i) === "FEATURE_DAMS_SITE") left++;
  check("E5 no dam-site marker left on the map", left === 0, `left=${left}`);
  const got = EXPECT.map((e) => ({ i: e.i, was: e.was, now: featureName(e.i) }));
  check("E5 every recorded feature is back (or bare where none was)", got.every((g) => g.now === g.was), J(got));
  const key = safe(() => String(Configuration.getGame().getValue("Dams_Sites_v1")), "?");
  check("E5 the record is emptied", key === "{}", key);
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e5b finished"), 4000); }
emit("attached e5b");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

// damh-game-u1.js - U1, where the AI puts its Dams. A Play Now Exploration game created with the mod and the grant
// probe (every major has the Dam from turn 1), then Autoplay with no help. Every 10 turns and at the end, a census of
// every Dam on the map: owner, human or AI, its river, whether that river floods at all, and how many other Dams stand
// on the same river. Answers whether the game's own AI builds Dams, and whether it builds them where they protect
// anything. Run with AI_VERBOSE=1 so AI_ConstructibleBroker.csv shows the AI's own choices.
//   AI_VERBOSE=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-u1.js u1 2400 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const TURNS = Number("__PROBE_OPTS__".replace(/\D/g, "")) || 60;
let local = -1;

function floodable(river) { return safe(() => { const r = MapRivers.getRiver(river); return r ? !!r.isFloodable : null; }, null); }
function census(M, label) {
  M.forget();
  const dams = safe(() => M.damsOnMap(), []);
  const perRiver = new Map();
  for (const d of dams) perRiver.set(d.river, (perRiver.get(d.river) || 0) + 1);
  let ai = 0, aiDry = 0, aiDup = 0;
  for (const d of dams) {
    const human = safe(() => Players.get(d.owner).isHuman, false);
    const fl = floodable(d.river);
    const onRiver = perRiver.get(d.river);
    if (!human) { ai++; if (fl === false) aiDry++; if (onRiver > 1) aiDup++; }
    emit(`D ${label} at=${d.loc.x},${d.loc.y} owner=${d.owner}${human ? "(human)" : ""} type=${d.type} complete=${d.complete} river=${d.river} floodable=${fl} damsOnRiver=${onRiver} settlementsOnRiver=${safe(() => M.citiesOnRiver(d.river).length, "?")}`);
  }
  emit(`C ${label} turn=${safe(() => Game.turn)} dams=${dams.length} ai=${ai} aiOnNonFloodingRiver=${aiDry} aiSharingARiver=${aiDup} rivers=${perRiver.size}`);
}
async function run() {
  local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`R0 turn=${safe(() => Game.turn)} mod=${safe(() => M.version, "ABSENT")} local=${local}`);
  if (!M) { finishNow("mod absent"); return; }
  const rivers = safe(() => MapRivers.numRivers, 0); let fl = 0;
  for (let i = 0; i < rivers; i++) if (floodable(safe(() => MapRivers.getRiverIDByIndex(i), -1))) fl++;
  emit(`R1 rivers=${rivers} floodable=${fl}`);
  const start = safe(() => Game.turn, 1);
  engine.on("TurnBegin", () => { const t = safe(() => Game.turn, 0); if ((t - start) % 10 === 0) census(M, "t" + t); });
  safe(() => { Autoplay.setTurns(TURNS); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  emit(`A autoplay ${TURNS} turns from ${start}`);
  for (let k = 0; k < 2000 && safe(() => Game.turn, start) < start + TURNS; k += 5) await sleep(5000);
  await sleep(10000);
  safe(() => Autoplay.setActive(false));
  census(M, "end");
  finishNow("read");
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness u1 finished"), 4000); }
emit("attached u1 AI dams census");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(run, 20000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

// damh-game-e1c.js - E1c, does the Dams' cost progression move? (e1/e1b: three reads of 150 with Dams placed by
// CREATE_ELEMENT, under NO_COST_PROGRESSION + a BuildingCostProgressions row and then under PREVIOUS_COPIES 25.)
// Hypothesis: the progression counts only Dams the player made through the game (built or bought).
// Disproof: buy a Dam with the game's own PURCHASE command and read the cost again. Control: the Monument (base,
// PREVIOUS_BUILDINGS_CITY 5 %) read before and after, which proves the cost read reflects a progression at all.
// e1c2 showed the cost read does not move for the control either, so the observable is the gold each purchase takes.
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-e1c.js e1c3 900 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function occ(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 90000) await sleep(750);
  await sleep(1500);
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
async function run() {
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  await roll();
  const p = Players.get(local);
  const type = "BUILDING_DAM_EXPLORATION";
  const dam = safe(() => GameInfo.Constructibles.lookup(type), null);
  safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, 20000)); await sleep(5000);
  const offers = [];
  for (const cid of p.Cities.getCityIds()) {
    const can = safe(() => Game.CityCommands.canStart(cid, CityCommandTypes.PURCHASE, { ConstructibleType: dam.$index }, false), null);
    for (const i of [...((can && can.Plots) || []), ...((can && can.ExpandUrbanPlots) || [])]) offers.push({ cid, at: locOf(i), river: M.riverAt(locOf(i)) });
  }
  emit(`S1 model=${dam.CostProgressionModel}:${dam.CostProgressionParam1} gold=${safe(() => p.Treasury.goldBalance, "?")} offers=${J(offers.map((o) => ({ c: o.cid.id, ...o.at, r: o.river })))}`);
  const spent = [];
  const used = new Set();
  for (let n = 0; n < 3; n++) {
    // Re-ask each time: the list changes as Dams land.
    const fresh = [];
    for (const cid of p.Cities.getCityIds()) {
      const can = safe(() => Game.CityCommands.canStart(cid, CityCommandTypes.PURCHASE, { ConstructibleType: dam.$index }, false), null);
      for (const i of [...((can && can.Plots) || []), ...((can && can.ExpandUrbanPlots) || [])]) if (!used.has(i)) fresh.push({ cid, i, at: locOf(i) });
    }
    const pick = fresh[0];
    if (!pick) { emit(`S2 no plot left for purchase ${n + 1}`); break; }
    used.add(pick.i);
    const city = Cities.get(pick.cid);
    const readCost = safe(() => city.Production.getConstructibleProductionCost(type), "?");
    const g0 = safe(() => p.Treasury.goldBalance, 0);
    safe(() => Game.CityCommands.sendRequest(pick.cid, CityCommandTypes.PURCHASE, { ConstructibleType: dam.$index, X: pick.at.x, Y: pick.at.y }));
    for (let k = 0; k < 20 && !occ(pick.at).includes(type); k++) await sleep(500);
    await sleep(1500);
    const g1 = safe(() => p.Treasury.goldBalance, 0);
    spent.push(Math.round(g0 - g1));
    emit(`S2 purchase ${n + 1} city=${pick.cid.id} at=${J(pick.at)} river=${M.riverAt(pick.at)} landed=${occ(pick.at).includes(type)} costRead=${readCost} goldSpent=${Math.round(g0 - g1)}`);
  }
  const rises = spent.length >= 2 && spent[1] > spent[0];
  finishNow(`gold per purchase ${J(spent)}; rises=${rises}${spent.length >= 2 ? ` ratio=${(spent[1] / spent[0]).toFixed(3)}` : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e1c finished"), 4000); }
emit("attached e1c");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

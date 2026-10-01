// damh-game-e6.js - E6, Dams 2.0 in a network game: a LAN game hosted alone (damh-shell-lan.js), Exploration, the
// grant. 1.3.0 offered no Dam at all here (the site marker was required and never placed).
//   N1 the game reads as a network game, and the mod took its network path
//   N2 a Dam is offered on river tiles, with no marker
//   N3 a real BUILD order goes into the queue
//   N4 a Dam bought with the game's PURCHASE command lands; a second one in the same settlement costs 70 more
//   N5 no floodplain dried and no Levee placed (both single player only)
//   LAN=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-e6.js e6 1200 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function featureName(l) { return safe(() => { const f = GameplayMap.getFeatureType(l.x, l.y); return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType); }, "?"); }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occ(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
async function run() {
  const local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version} local=${local}`);
  if (!M) return finishNow("mod not active");
  const net = safe(() => Configuration.getGame().isNetworkMultiplayer, "?");
  check("N1 a network game", net === true, `isNetworkMultiplayer=${net} gameMode=${safe(() => Configuration.getGame().gameMode, "?")}`);
  check("N1 the mod is on its network path", M.multiplayer === true, String(M.multiplayer));
  const type = "BUILDING_DAM_EXPLORATION";
  const dam = GameInfo.Constructibles.lookup(type);
  const p = Players.get(local);
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const fp0 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloodplain({ x, y })) fp0.push({ x, y });
  const offers = [];
  for (const cid of p.Cities.getCityIds()) {
    const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: dam.$index }, false), null);
    for (const i of [...((r && r.Plots) || []), ...((r && r.ExpandUrbanPlots) || [])]) offers.push({ cid, i, at: locOf(i) });
  }
  for (const cid of p.Cities.getCityIds()) {
    const c = Cities.get(cid);
    const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: dam.$index }, false), null);
    const g = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: GameInfo.Constructibles.lookup("BUILDING_GRISTMILL").$index }, false), null);
    let rivers = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = safe(() => GameplayMap.getOwningCityFromXY(x, y), null); if (o && o.owner === cid.owner && o.id === cid.id && M.riverAt({ x, y }) != null) rivers++; }
    emit(`S0d city ${safe(() => Locale.compose(c.name), "?")} riverTiles=${rivers} dam=${J(r && { Success: r.Success, NeededUnlock: r.NeededUnlock, FailureReasons: r.FailureReasons, plots: (r.Plots || []).length, expand: (r.ExpandUrbanPlots || []).length })} gristmill=${J(g && { Success: g.Success, NeededUnlock: g.NeededUnlock, FailureReasons: g.FailureReasons, plots: (g.Plots || []).length, expand: (g.ExpandUrbanPlots || []).length })}`);
  }
  emit(`S0e cities=${p.Cities.getCityIds().length} turn=${Game.turn} damUnlocked(Machinery)=${safe(() => p.Techs.isNodeUnlocked("NODE_TECH_EX_MACHINERY"), "?")} grant modifiers=${safe(() => GameInfo.GameModifiers.filter((r) => String(r.ModifierId).startsWith("MOD_DAM_GRANT")).length, "?")}`);
  emit(`S1 offers ${J(offers.map((o) => ({ c: o.cid.id, ...o.at, river: M.riverAt(o.at), f: featureName(o.at) })))}`);
  check("N2 a Dam is offered", offers.length > 0, String(offers.length));
  check("N2 only river tiles, none marked", offers.every((o) => M.riverAt(o.at) != null && featureName(o.at) !== "FEATURE_DAMS_SITE"), "");
  if (!offers.length) return finishNow("nothing offered");
  // N3 a real order in one settlement
  const o1 = offers[0];
  safe(() => Game.CityOperations.sendRequest(o1.cid, CityOperationTypes.BUILD, { ConstructibleType: dam.$index, X: o1.at.x, Y: o1.at.y }));
  await sleep(4000);
  const q = safe(() => Cities.get(o1.cid).BuildQueue.getQueue().map((e) => String(safe(() => GameInfo.Constructibles.lookup(e.constructibleType).ConstructibleType, e.constructibleType))), []);
  check("N3 the order is in the queue", J(q).includes(type), J(q));
  // N4 purchases in a settlement with two offered tiles (other than the order's)
  safe(() => Players.grantYield(local, YieldTypes.YIELD_GOLD, 20000)); await sleep(5000);
  emit(`S2 gold=${safe(() => p.Treasury.goldBalance, "?")}`);
  const spent = []; const bought = [];
  for (let n = 0; n < 2; n++) {
    let pick = null;
    for (const cid of p.Cities.getCityIds()) {
      const r = safe(() => Game.CityCommands.canStart(cid, CityCommandTypes.PURCHASE, { ConstructibleType: dam.$index }, false), null);
      const tiles = [...((r && r.Plots) || []), ...((r && r.ExpandUrbanPlots) || [])].map(locOf).filter((l) => !(l.x === o1.at.x && l.y === o1.at.y));
      if (tiles.length && (!bought.length || bought[0].cid.id === cid.id)) { pick = { cid, at: tiles[0] }; break; }
    }
    if (!pick) { emit(`S3 no tile for purchase ${n + 1}`); break; }
    const g0 = safe(() => p.Treasury.goldBalance, 0);
    safe(() => Game.CityCommands.sendRequest(pick.cid, CityCommandTypes.PURCHASE, { ConstructibleType: dam.$index, X: pick.at.x, Y: pick.at.y }));
    for (let k = 0; k < 20 && !occ(pick.at).includes(type); k++) await sleep(500);
    await sleep(1500);
    spent.push(Math.round(g0 - safe(() => p.Treasury.goldBalance, 0)));
    bought.push(pick);
    emit(`S3 purchase ${n + 1} city=${pick.cid.id} at=${J(pick.at)} landed=${occ(pick.at).includes(type)} gold=${spent[n]}`);
  }
  check("N4 a bought Dam lands", bought.length > 0 && occ(bought[0].at).includes(type), J(spent));
  if (spent.length === 2) check("N4 the second in the settlement costs 70 more Production (280 Gold)", spent[1] - spent[0] === 280, J(spent));
  // N5 after a sweep: nothing dried, no Levee
  safe(() => M.forget()); safe(() => M.sweep()); await sleep(5000);
  const fp1 = fp0.filter(isFloodplain).length;
  check("N5 no floodplain dried", fp1 === fp0.length, `${fp0.length} -> ${fp1}`);
  let levees = 0;
  for (const pl of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => pl.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    levees += occ(c.location).filter((t) => t.includes("LEVEE")).length;
  }
  check("N5 no Levee placed", levees === 0, String(levees));
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`passed ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness e6 finished"), 4000); }
emit("attached e6");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 15000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 200) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

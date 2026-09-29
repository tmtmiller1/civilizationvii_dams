// damh-game-d14.js - D14. Does a flood raise a tile's Food at all, and does the floodplain feature matter?
// d13 disproved the claim d8 suggested: a river whose floodplains the mod had dried gained the SAME +5 Food over the
// same 8 floods as that river did undammed in d10 (same seed, same turns) - the drying only cost the floodplain's own
// Food up front. So the slow rise measured over 24 turns is probably not the flood at all. This measures one flood at
// a time: every floodplain tile's Food is read at the start of each turn and again seconds after the flood lands, so
// nothing else has time to move.
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d14.js d14 1500 mod+floods
const TAG = "[DAM]";
const MAX_TURNS = 20;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), ""); }
let local = -1;
function yields(l) {
  return {
    f: safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_FOOD, local), null),
    p: safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_PRODUCTION, local), null),
  };
}
const flooded = [];
function hook() { safe(() => engine.on("RandomEventOccurred", (d) => flooded.push({ turn: Game.turn, at: d.location && { x: d.location.x, y: d.location.y } }))); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  return Game.turn !== t;
}
async function run() {
  local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`P0 mod=${M && M.version}`);
  hook();
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  // every river, by id, with its floodplain tiles
  const rivers = new Map();
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0); i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    if (plots.length) rivers.set(id, plots);
  }
  const riverOfPlot = new Map();
  for (const [id, plots] of rivers) for (const l of plots) riverOfPlot.set(idxOf(l), id);
  // Half the rivers with floodplains are dried now, so each flood lands on one kind or the other.
  const withFp = [...rivers.entries()].filter(([, plots]) => plots.some(isFloodplain));
  const dried = new Set();
  withFp.forEach(([id], k) => { if (k % 2 === 0) { safe(() => M.dry([{ river: id, complete: true }])); dried.add(id); } });
  await sleep(2500);
  emit(`P1 rivers with floodplains=${withFp.length} dried=${dried.size} stillFp=${withFp.filter(([id, pl]) => pl.some(isFloodplain)).map(([id]) => id).length}`);
  const rows = [];
  for (let t = 0; t < MAX_TURNS; t++) {
    const before = new Map();
    for (const [, plots] of rivers) for (const l of plots) before.set(idxOf(l), yields(l));
    const seen = flooded.length;
    const ok = await roll();
    await sleep(1500);
    for (const f of flooded.slice(seen)) {
      const id = f.at ? riverOfPlot.get(idxOf(f.at)) : null;
      const plots = (id != null && rivers.get(id)) || [];
      const moved = plots.map((l) => ({ x: l.x, y: l.y, was: before.get(idxOf(l)), now: yields(l), fp: !!featureName(l) }))
        .filter((r) => r.was && (r.now.f !== r.was.f || r.now.p !== r.was.p));
      rows.push({ turn: f.turn, at: f.at, river: id, driedRiver: dried.has(id), tiles: plots.length, moved });
      emit(`P2 flood turn ${f.turn} at ${J(f.at)} river=${id} dried=${dried.has(id)} movedTiles=${moved.length} ${J(moved.slice(0, 6))}`);
    }
    if (!ok) break;
  }
  const tally = rows.reduce((m, r) => {
    const k = r.driedRiver ? "dried" : "floodplain";
    const g = (m[k] = m[k] || { floods: 0, floodsThatMoved: 0, tilesMoved: 0, food: 0 });
    g.floods++; if (r.moved.length) g.floodsThatMoved++;
    g.tilesMoved += r.moved.length;
    g.food += r.moved.reduce((n, x) => n + ((x.now.f ?? 0) - (x.was.f ?? 0)), 0);
    return m;
  }, {});
  emit(`P3 rows=${J(rows.slice(0, 12))}`);
  finishNow(`tally=${J(tally)} floods=${rows.length}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d14 finished"), 4000); }
emit("attached d14");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

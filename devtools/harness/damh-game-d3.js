// damh-game-d3.js - D3 (runs d3b-d3d). Does the native avoid-flood modifier, carried by a script-placed marker building (the
// probe's BUILDING_DAMPROBE_LEVEE), keep floods off the river tiles of the city that holds it, and only that city?
//   S0  every city: floodplain tiles within 3 plots, bought for the city (purchasePlot) so floods land on owned land
//   S1  alternate cities get the Levee through CREATE_ELEMENT at their center ("warded"); the rest are "open";
//       read back that it landed, that it took no slot, and that it is not offered in production
//   S2  roll up to MAX_TURNS turns with dam-flood-probe's frequent floods; after each roll, classify every plot
//       carrying PLOTEFFECT_FLOODED by the owning city's group; count damaged constructibles; food yield deltas
//   S9  verdict: flooded tiles and damage for warded vs open cities
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d3.js d3 1200 floods
const TAG = "[DAM]";
const MAX_TURNS = 30;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function isFloodplain(x, y) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(x, y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); const def = GameInfo.Constructibles.lookup(inst.type); return { type: String(def.ConstructibleType), damaged: safe(() => inst.damaged, "?"), complete: safe(() => inst.complete, "?") }; }), []); }
function owningCity(x, y) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(x, y); return c ? `${c.owner}:${c.id}` : null; }, null); }
function food(x, y, pid) { return safe(() => GameplayMap.getYield(x, y, YieldTypes.YIELD_FOOD, pid), null); }
let FLOODED = null;
function hasFlood(i) { return safe(() => MapPlotEffects.hasPlotEffect(i, FLOODED), false) === true; }
const seen = { RandomEventOccurred: 0, PlotEffectAddedToMap: 0, UnitDamageChanged: 0 };
const occurred = [];
function hook() {
  for (const name of Object.keys(seen)) safe(() => engine.on(name, (d) => {
    seen[name]++;
    if (name === "RandomEventOccurred") occurred.push({ turn: Game.turn, type: safe(() => GameInfo.RandomEvents.lookup(d.eventType)?.RandomEventType, d.eventType), at: d.location, city: d.location ? owningCity(d.location.x, d.location.y) : null });
  }), null);
}
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
async function run() {
  const pe = GameInfo.PlotEffects.lookup("PLOTEFFECT_FLOODED"); FLOODED = pe ? pe.$index : null;
  const levee = GameInfo.Constructibles.lookup("BUILDING_DAMPROBE_LEVEE");
  const mod = safe(() => GameInfo.Modifiers.lookup("MOD_DAMPROBE_LEVEE_AVOID_FLOOD"), null);
  emit(`S0 levee=${!!levee} modifier=${!!mod} realism=${J(safe(() => Configuration.getGame().getValue("RealismSettingType"), "?"))}`);
  hook();
  const local = GameContext.localPlayerID;
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const fp = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloodplain(x, y)) fp.push({ x, y });
  // S0: cities and the floodplains near them. Nobody has a city on turn 1: roll until the AI players have founded.
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  emit(`S0 turn ${Game.turn} cities=${cityCount()}`);
  const cities = [];
  for (const p of safe(() => Players.getAlive(), []) || []) {
    for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
      const c = safe(() => Cities.get(cid), null); if (!c) continue;
      const near = fp.filter((l) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, l.x, l.y), 99) <= 4);
      if (!near.length) continue;
      for (const l of near) if (!owningCity(l.x, l.y)) safe(() => c.purchasePlot({ x: l.x, y: l.y }));
      cities.push({ key: `${cid.owner}:${cid.id}`, cid, owner: p.id, name: safe(() => Locale.compose(c.name), "?"), at: { x: c.location.x, y: c.location.y }, near });
    }
  }
  await sleep(3000);
  for (const c of cities) c.owned = c.near.filter((l) => owningCity(l.x, l.y) === c.key);
  // Farms on every owned floodplain tile that holds nothing, so a flood has something to pillage (D3c).
  // A bare tile takes an improvement only once it has a rural district (Parent + Owner, as emigration places one).
  for (const c of cities) for (const l of c.owned) if (!occupants(l).length) {
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.cid, Owner: c.owner }));
    await sleep(800);
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_FARM", Location: { x: l.x, y: l.y }, Owner: c.owner }));
  }
  await sleep(3000);
  const sample = cities.flatMap((c) => c.owned).find((l) => occupants(l).length);
  emit(`S0 farms: ${J(cities.map((c) => ({ key: c.key, tiles: c.owned.map((l) => ({ ...l, holds: occupants(l) })) })))} instanceKeys=${J(sample && safe(() => { const id = MapConstructibles.getConstructibles(sample.x, sample.y)[0]; const inst = Constructibles.getByComponentID(id); const ks = new Set(); for (let p = inst; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach((k) => ks.add(k)); return [...ks]; }, "?"))}`);
  // S1: ward alternate cities
  const withLand = cities.filter((c) => c.owned.length).sort((a, b) => b.owned.length - a.owned.length);
  withLand.forEach((c, k) => { c.group = k % 2 === 0 ? "warded" : "open"; });
  for (const c of withLand.filter((c) => c.group === "warded")) {
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAMPROBE_LEVEE", Location: c.at, Owner: c.owner }));
  }
  await sleep(3000);
  for (const c of withLand) c.levee = occupants(c.at).some((o) => o.type === "BUILDING_DAMPROBE_LEVEE");
  const offered = safe(() => { const cap = Players.get(local).Cities.getCapital(); const r = Game.CityOperations.canStart(cap.id, CityOperationTypes.BUILD, { ConstructibleType: levee.$index }, false); return { success: r.Success, reasons: r.FailureReasons, plots: r.Plots && r.Plots.length }; }, "?");
  emit(`S1 cities=${J(withLand.map((c) => ({ key: c.key, name: c.name, group: c.group, levee: c.levee, owned: c.owned.length, near: c.near.length, center: occupants(c.at).map((o) => o.type) })))} leveeOfferedToLocalCapital=${J(offered)}`);
  const groupOf = new Map(withLand.map((c) => [c.key, c.group]));
  const foodBefore = new Map(fp.map((l) => [idxOf(l), food(l.x, l.y, local)]));
  const hits = new Map();
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const ok = await roll();
    for (const l of fp) {
      const i = idxOf(l);
      if (!hasFlood(i) || hits.has(i)) continue;
      const city = owningCity(l.x, l.y);
      hits.set(i, { ...l, turn: Game.turn, city, group: city ? (groupOf.get(city) || "cityNoProbe") : "unowned", damaged: occupants(l).filter((o) => o.damaged === true).map((o) => o.type) });
    }
    emit(`S2 turn ${Game.turn} rolled=${ok} floods=${occurred.length} floodedTiles=${hits.size} events=${J(seen)}`);
    if (!ok) break;
  }
  const all = [...hits.values()];
  const by = all.reduce((m, h) => { m[h.group] = (m[h.group] || 0) + 1; return m; }, {});
  const exposure = { warded: withLand.filter((c) => c.group === "warded").reduce((s, c) => s + c.owned.length, 0), open: withLand.filter((c) => c.group === "open").reduce((s, c) => s + c.owned.length, 0) };
  const foodDelta = (group) => fp.filter((l) => groupOf.get(owningCity(l.x, l.y)) === group).map((l) => (food(l.x, l.y, local) ?? 0) - (foodBefore.get(idxOf(l)) ?? 0));
  emit(`S3 occurred=${J(occurred)}`);
  emit(`S3 flooded tiles by group=${J(by)} exposure(owned floodplain tiles)=${J(exposure)} damaged=${J(all.filter((h) => h.damaged.length).map((h) => ({ x: h.x, y: h.y, group: h.group, damaged: h.damaged })))}`);
  emit(`S3 food delta on owned floodplains: warded=${J(foodDelta("warded"))} open=${J(foodDelta("open"))}`);
  emit(`S3 sample=${J(all.slice(0, 30))}`);
  emit(`S3 final state of owned floodplain tiles: ${J(withLand.map((c) => ({ key: c.key, group: c.group, tiles: c.owned.map((l) => ({ ...l, holds: occupants(l) })) })))}`);
  finishNow(`floods=${occurred.length} wardedTiles=${by.warded || 0}/${exposure.warded} openTiles=${by.open || 0}/${exposure.open} unowned=${by.unowned || 0} leveesLanded=${withLand.filter((c) => c.levee).length}/${withLand.filter((c) => c.group === "warded").length}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d3 finished"), 4000); }
emit("attached d3");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

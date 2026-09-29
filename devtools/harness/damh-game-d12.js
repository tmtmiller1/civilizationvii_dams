// damh-game-d12.js - D12. The "after" half of the pair. d10 ran this exact seed and river with no Dam on it (the
// CREATE_ELEMENT was aimed at an unowned tile and quietly did nothing): its four floodplain tiles gained +5 Food
// across 8 floods. This run dams the same river properly - buy the plot, give it a district, then place - and asks
// whether the same tiles now gain nothing.
// Was: D10. Does a dammed river stop enriching its tiles? d9 could not tell: the dammed river and the
// control took one flood each and neither gained. This picks the two rivers that flood most on seed 9001 - the one
// through (48,11), which flooded five times in turns 8-12 in both d8 and d9, and the one through (57,13), which
// flooded four times in turns 13-17 - dams the first, leaves the second, and traces every tile's Food each turn.
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d10.js d10 1500 mod+floods
const TAG = "[DAM]";
const MAX_TURNS = 22;
const DAM_SEED_TILE = { x: 48, y: 11 };
const CTRL_SEED_TILE = { x: 57, y: 13 };
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function adj(loc, k) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[k]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
function armAngle(k) { return (360 - 60 * k) % 360; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), "?"); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), damaged: safe(() => inst.damaged, "?") }; }), []); }
function owningCity(l) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(l.x, l.y); return c && c.owner >= 0 ? c : null; }, null); }
let local = -1;
function food(l) { return safe(() => GameplayMap.getYield(l.x, l.y, YieldTypes.YIELD_FOOD, local), null); }
let AIM = null;
async function look(loc, zoom) { AIM = { loc, zoom }; safe(() => Camera.lookAtPlot(loc, { zoom })); await sleep(2500); }
async function shot(name) { if (AIM) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(50000); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
const occurred = [];
function hook() { safe(() => engine.on("RandomEventOccurred", (d) => occurred.push({ turn: Game.turn, at: d.location, type: safe(() => GameInfo.RandomEvents.lookup(d.eventType)?.RandomEventType, d.eventType) }))); }

function flowSides(l, set) { const out = []; for (let k = 0; k < 6; k++) { const n = adj(l, k); if (n && set.has(idxOf(n))) out.push(k); } return out; }

async function run() {
  local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`P0 mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  hook();
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  safe(() => WorldBuilder.MapPlots.setAllRevealed(true));
  await sleep(1500);
  const riverOf = (seed) => {
    const id = M.riverAt(seed);
    if (id == null) return null;
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    return { id, plots, set: new Set(plots.map(idxOf)), fp: plots.filter(isFloodplain), name: safe(() => Locale.compose(GameplayMap.getRiverName(seed.x, seed.y) || ""), "") };
  };
  const DAMMED = riverOf(DAM_SEED_TILE), CTRL = riverOf(CTRL_SEED_TILE);
  if (!DAMMED || !CTRL) return finishNow(`seed tiles are not on rivers: ${J({ dammed: !!DAMMED, control: !!CTRL })}`);
  emit(`P1 dammed=${DAMMED.name} id=${DAMMED.id} plots=${DAMMED.plots.length} fp=${DAMMED.fp.length}`);
  emit(`P1 control=${CTRL.name} id=${CTRL.id} plots=${CTRL.plots.length} fp=${CTRL.fp.length}`);
  const trace = (r) => r.fp.map((l) => ({ x: l.x, y: l.y, food: food(l), feature: featureName(l) ? "fp" : "-" }));
  emit(`P1 before dammed=${J(trace(DAMMED))}`);
  emit(`P1 before control=${J(trace(CTRL))}`);
  const start = new Map([...DAMMED.fp, ...CTRL.fp].map((l) => [idxOf(l), food(l)]));
  // The Dam needs a tile a settlement owns, with a district on it: a bare or unowned plot swallows the request
  // silently (d10). Buy the nearest plot of the river, give it a rural district, then place the Dam there.
  const cities = (safe(() => Players.getAlive(), []) || []).flatMap((p) => (safe(() => p.Cities.getCityIds(), []) || []).map((id) => safe(() => Cities.get(id), null))).filter(Boolean);
  let site = null, owner = local;
  for (const l of DAMMED.plots) {
    let c = owningCity(l);
    if (!c) {
      const near = cities.map((city) => ({ city, d: safe(() => GameplayMap.getPlotDistance(city.location.x, city.location.y, l.x, l.y), 99) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 4) continue;
      safe(() => near.city.purchasePlot({ x: l.x, y: l.y }));
      await sleep(1200);
      c = owningCity(l);
    }
    if (!c) continue;
    if (!occupants(l).length) {
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.id, Owner: c.owner }));
      await sleep(1200);
    }
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_ANTIQUITY", Location: { x: l.x, y: l.y }, Owner: c.owner }));
    await sleep(2500);
    if (occupants(l).some((o) => o.type === "BUILDING_DAM_ANTIQUITY")) { site = l; owner = c.owner; break; }
    emit(`P1 dam refused at ${J(l)} owner=${c.owner} holds=${J(occupants(l))}`);
  }
  if (!site) return finishNow("no tile of the river would take a Dam");
  safe(() => M.forget()); safe(() => M.sweep());
  await sleep(3500);
  const dams = safe(() => M.damsOnMap().map((d) => ({ loc: d.loc, river: d.river, complete: d.complete })), "?");
  emit(`P1 dam at ${J(site)} owner=${owner} holds=${J(occupants(site))} damsOnMap=${J(dams)} afterDry dammed=${J(trace(DAMMED))}`);
  if (trace(DAMMED).some((t) => t.feature === "fp")) emit("P1 WARNING the dammed river still carries floodplains");
  for (let t = 0; t < MAX_TURNS; t++) {
    const ok = await roll();
    const sum = (r) => r.fp.reduce((n, l) => n + (food(l) ?? 0), 0);
    emit(`P2 turn ${Game.turn} floods=${occurred.length} foodSum dammed=${sum(DAMMED)} control=${sum(CTRL)}`);
    if (!ok) break;
  }
  const rows = [...DAMMED.fp.map((l) => ["dammed", l]), ...CTRL.fp.map((l) => ["control", l])]
    .map(([group, l]) => ({ group, x: l.x, y: l.y, from: start.get(idxOf(l)), to: food(l), d: (food(l) ?? 0) - (start.get(idxOf(l)) ?? 0), fp: !!featureName(l) }));
  const tally = rows.reduce((m, r) => { const g = (m[r.group] = m[r.group] || { tiles: 0, d: 0, gained: 0 }); g.tiles++; g.d += r.d; if (r.d > 0) g.gained++; return m; }, {});
  const onRiver = (l, r) => !!l && r.set.has(idxOf(l));
  const floods = { dammed: occurred.filter((o) => onRiver(o.at, DAMMED)).length, control: occurred.filter((o) => onRiver(o.at, CTRL)).length };
  emit(`P3 rows=${J(rows)}`);
  emit(`P3 floodsByRiver=${J(floods)} all=${J(occurred.map((o) => ({ t: o.turn, at: o.at })))}`);
  finishNow(`tally=${J(tally)} floods=${J(floods)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d12 finished"), 4000); }
emit("attached d12");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

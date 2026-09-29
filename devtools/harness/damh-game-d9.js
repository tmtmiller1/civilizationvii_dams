// damh-game-d9.js - D9. The Dam end to end on the shipped mod, plus a clean look at the candidate meshes.
//   Part 1 (meshes, no turns): the longest river on the map, revealed; ONE candidate per tile along a four-tile
//     stretch, drawn across the flow, one capture per batch. d6's pass stacked four on a single tile and proved
//     nothing.
//   Part 2 (the Dam's own run): a Dam placed on the river with the most floodplain tiles, farms on the floodplains of
//     that river and of a control river, then turns under frequent floods. Watches: the dammed river's floodplains go
//     (dry), its tiles stop gaining Food while the control's climb, and nothing on it is pillaged.
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d9.js d9 1800 mod+floods
const TAG = "[DAM]";
const MAX_TURNS = 26;
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

// One candidate per tile: four tiles, four meshes, one capture. Names verified against the 1.5.0 asset catalog.
const BATCHES = [
  ["IMPROVEMENT_HAN_GREAT_WALL_MIDDLE", "IMPROVEMENT_MING_GREAT_WALL_MIDDLE", "IMP_Great_Wall_Turns_Straight_A", "Great_Wall_Gap_Filler"],
  ["IMPROVEMENT_Kasbah_Wall_01", "IMPROVEMENT_TERRACE_FARM", "IMP_TerraceFarm_A", "Machu_Picchu_Cliff_Top_B"],
  ["MOD_Bridge_Stone_A", "ANT_Bridge_Wooden_C", "MED_CRT_Dockyard_Gate_HB", "STD_Mountain_Bridge_Straight_A"],
];
function flowSides(l, set) { const out = []; for (let k = 0; k < 6; k++) { const n = adj(l, k); if (n && set.has(idxOf(n))) out.push(k); } return out; }
async function meshPass(chain, set) {
  if (typeof WorldUI === "undefined" || typeof PlacementMode === "undefined") { emit("P1 no WorldUI"); return; }
  const mid = chain[Math.floor(chain.length / 2)];
  for (let b = 0; b < BATCHES.length; b++) {
    const group = safe(() => WorldUI.createModelGroup("DamProbe9_" + b), null);
    const placed = [];
    BATCHES[b].forEach((asset, k) => {
      const l = chain[k];
      if (!l) return;
      const sides = flowSides(l, set);
      const across = ((sides.length ? armAngle(sides[0]) : 0) + 90) % 360;
      const r = safe(() => group.addModelAtPlot(asset, { i: l.x, j: l.y }, { x: 0, y: 0, z: 0 }, { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: 1, angle: across }), "ERR");
      placed.push({ asset, at: l, across, ok: !!(r && r.id) });
    });
    emit(`P1 batch ${b} ${J(placed)}`);
    await look(mid, 0.06);
    await shot(`d9-mesh-${b}`);
    safe(() => group.clear()); safe(() => group.destroy());
  }
}

async function run() {
  local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`P0 mod=${M && M.version} rivers=${safe(() => MapRivers.numRivers, "?")}`);
  if (!M) return finishNow("mod not active");
  hook();
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  safe(() => WorldBuilder.MapPlots.setAllRevealed(true));
  await sleep(2000);
  // rivers, by plots and by floodplains
  const rivers = [];
  for (let i = 0; i < safe(() => MapRivers.numRivers, 0); i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    rivers.push({ i, id, plots, set: new Set(plots.map(idxOf)), fp: plots.filter(isFloodplain), name: plots[0] ? safe(() => Locale.compose(GameplayMap.getRiverName(plots[0].x, plots[0].y) || ""), "") : "" });
  }
  // Part 1: the longest river, four tiles that each touch the next
  const longest = rivers.slice().sort((a, b) => b.plots.length - a.plots.length)[0];
  const chain = [];
  for (const l of longest.plots) { if (!chain.length || flowSides(l, new Set(chain.map(idxOf))).length) chain.push(l); if (chain.length === 4) break; }
  emit(`P1 river ${longest.i} ${longest.name} plots=${longest.plots.length} chain=${J(chain)}`);
  if (chain.length === 4) await meshPass(chain, longest.set);
  // Part 2: the Dam's own run
  const ranked = rivers.filter((r) => r.fp.length >= 3).sort((a, b) => b.fp.length - a.fp.length);
  if (ranked.length < 2) return finishNow(`only ${ranked.length} rivers with 3+ floodplains`);
  const DAMMED = ranked[0], CTRL = ranked[1];
  // farms on both rivers' floodplains, bought for whichever settlement is nearest
  const prep = async (r) => {
    for (const l of r.fp) {
      let c = owningCity(l);
      if (!c) {
        const near = (safe(() => Players.getAlive(), []) || []).flatMap((p) => (safe(() => p.Cities.getCityIds(), []) || []).map((id) => safe(() => Cities.get(id), null))).filter(Boolean)
          .map((city) => ({ city, d: safe(() => GameplayMap.getPlotDistance(city.location.x, city.location.y, l.x, l.y), 99) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.d <= 4) { safe(() => near.city.purchasePlot({ x: l.x, y: l.y })); await sleep(600); c = owningCity(l); }
      }
      if (c && !occupants(l).length) {
        safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.id, Owner: c.owner }));
        await sleep(700);
        safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_FARM", Location: { x: l.x, y: l.y }, Owner: c.owner }));
        await sleep(400);
      }
    }
  };
  await prep(DAMMED); await prep(CTRL);
  await sleep(2000);
  const before = new Map();
  for (const r of [DAMMED, CTRL]) for (const l of r.fp) before.set(idxOf(l), { x: l.x, y: l.y, group: r === DAMMED ? "dammed" : "control", food: food(l), feature: featureName(l), holds: occupants(l).map((o) => o.type) });
  emit(`P2 dammed=${DAMMED.i} ${DAMMED.name} fp=${DAMMED.fp.length} control=${CTRL.i} ${CTRL.name} fp=${CTRL.fp.length}`);
  emit(`P2 before=${J([...before.values()])}`);
  // the Dam, on a tile of the dammed river that carries no farm
  const farmed = new Set(DAMMED.fp.map(idxOf));
  const site = DAMMED.plots.find((l) => owningCity(l) && !farmed.has(idxOf(l))) || DAMMED.plots.find((l) => owningCity(l)) || DAMMED.plots[0];
  const owner = safe(() => owningCity(site).owner, local);
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_ANTIQUITY", Location: site, Owner: owner }));
  await sleep(3000);
  safe(() => M.sweep());
  await sleep(4000);
  const dried = DAMMED.fp.map((l) => ({ x: l.x, y: l.y, feature: featureName(l), food: food(l) }));
  emit(`P2 dam at ${J(site)} holds=${J(occupants(site))} driedNow=${J(dried)} levees=${J(M.citiesOnRiver(DAMMED.id).map((c) => ({ key: c.key, center: occupants(c.center).map((o) => o.type) })))}`);
  await look(site, 0.08); await shot("d9-dam");
  for (let t = 0; t < MAX_TURNS; t++) {
    const ok = await roll();
    if (t % 5 === 4) emit(`P2 turn ${Game.turn} floods=${occurred.length}`);
    if (!ok) break;
    if (occurred.length >= 14 && t >= 12) break;
  }
  const rows = [...before.entries()].map(([i, b]) => { const l = locOf(i); return { ...b, now: { food: food(l), feature: featureName(l), holds: occupants(l) }, dFood: (food(l) ?? 0) - (b.food ?? 0), pillaged: occupants(l).some((o) => o.damaged === true) }; });
  const tally = rows.reduce((m, r) => { const g = (m[r.group] = m[r.group] || { tiles: 0, dFood: 0, gained: 0, lost: 0, pillaged: 0, stillFloodplain: 0 }); g.tiles++; g.dFood += r.dFood; if (r.dFood > 0) g.gained++; if (r.dFood < 0) g.lost++; if (r.pillaged) g.pillaged++; if (r.now.feature) g.stillFloodplain++; return m; }, {});
  const onRiver = (l, r) => r.set.has(idxOf(l));
  emit(`P2 floods=${J(occurred.map((o) => ({ turn: o.turn, at: o.at, dammed: onRiver(o.at, DAMMED), control: onRiver(o.at, CTRL) })))}`);
  emit(`P2 rows=${J(rows)}`);
  finishNow(`tally=${J(tally)} floodsOnDammed=${occurred.filter((o) => onRiver(o.at, DAMMED)).length} floodsOnControl=${occurred.filter((o) => onRiver(o.at, CTRL)).length}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d9 finished"), 4000); }
emit("attached d9");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

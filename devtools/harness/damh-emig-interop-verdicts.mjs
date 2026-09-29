// damh-emig-interop-verdicts.mjs - offline check of the verdicts in damh-game-emig-interop.js: runs the probe in a mocked
// engine, plays scripted floods with a known answer and compares each VERDICT label. No game needed.
//   node damh-emig-interop-verdicts.mjs
import fs from "node:fs";
import vm from "node:vm";
const SRC = fs.readFileSync(process.argv[2] || new URL("./damh-game-emig-interop.js", import.meta.url), "utf8");
const realTimeout = setTimeout;

async function scenario(name, { gateoff = false, turns, bTurns = [], expect }) {
  const out = [];
  const idx = (x, y) => y * 100 + x;
  // Cities: D dammed (2:1), S spared (5:1), C damaged (4:1), X storm-hit (6:1). Plots: each city owns 3.
  const cities = { "2:1": [idx(1, 1), idx(2, 1), idx(3, 1)], "5:1": [idx(1, 5), idx(2, 5), idx(3, 5)], "4:1": [idx(1, 9), idx(2, 9), idx(3, 9)], "6:1": [idx(9, 9), idx(8, 9), idx(7, 9)] };
  const ownerOf = new Map(); for (const [k, ps] of Object.entries(cities)) for (const p of ps) ownerOf.set(p, k);
  const river = [idx(1, 1), idx(2, 1), idx(1, 9), idx(2, 9), idx(0, 0)]; // a flood at (0,0) reaches D and C via the river
  const damaged = new Set();
  const state = { EmigrationDisaster_v1: { byCity: {}, typeByCity: {} }, EmigrationMigStats_v1: { flows: {} } };
  let handler = null;
  const players = [2, 4, 5, 6].map((id) => ({ id, Cities: { getCityIds: () => Object.keys(cities).filter((k) => k.startsWith(id + ":")).map((k) => ({ owner: id, id: Number(k.split(":")[1]) })) } }));
  const ctx = {
    console: { error: (m) => out.push(String(m)), log() {}, warn() {} },
    setTimeout: (fn, ms) => (ms === 2500 ? realTimeout(fn, 50) : 0), setInterval: () => 0,
    document: { querySelectorAll: () => [] },
    engine: { on: (n, fn) => { if (n === "RandomEventOccurred") handler = fn; } },
    Game: { turn: 1 }, UI: { getGameLoadingState: () => 0 }, UIGameLoadingState: {},
    GameplayMap: {
      getIndexFromXY: idx, getLocationFromIndex: (i) => ({ x: i % 100, y: Math.floor(i / 100) }),
      // Unowned tiles answer as the engine does for some: an owner with city id -1, which resolves to no city.
      getOwningCityFromXY: (x, y) => { const k = ownerOf.get(idx(x, y)); return k ? { owner: Number(k.split(":")[0]), id: Number(k.split(":")[1]) } : { owner: 63, id: -1 }; },
      getPlotIndicesInRadius: (x, y) => [idx(x + 1, y), idx(x, y + 1)],
    },
    MapRivers: { numRivers: 1, getRiverIDByIndex: () => 7, getRiverPlots: () => river },
    MapConstructibles: { getConstructibles: (x, y) => (ownerOf.has(idx(x, y)) ? [{ id: idx(x, y) }] : []) },
    Constructibles: { getByComponentID: (c) => ({ type: 0, damaged: damaged.has(c.id) }) },
    GameInfo: { Constructibles: { lookup: () => ({ ConstructibleType: "IMPROVEMENT_FARM" }) }, RandomEvents: { lookup: (t) => ({ RandomEventType: t, EventClass: t.includes("FLOOD") ? "CLASS_FLOOD" : "CLASS_THUNDERSTORM" }) } },
    Players: { getAlive: () => players },
    Cities: { get: (cid) => (!cid || cid.id < 0 ? null : { name: "city" + cid.owner, isInfected: false, getPurchasedPlots: () => cities[cid.owner + ":" + cid.id] }) },
    Configuration: { getGame: () => ({ getValue: (k) => JSON.stringify(state[k]) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC.replace("__PROBE_OPTS__", (gateoff ? "gateoff " : "") + "b=" + bTurns.length), ctx);
  ctx.__turns = [...turns, ...bTurns]; ctx.__na = turns.length; ctx.__nb = bTurns.length; ctx.__env = { damaged, state, fire: (type, x, y) => handler({ eventType: type, location: { x, y } }), idx };
  ctx.__done = null;
  vm.runInContext(`
    dammedKeys = new Set(["2:1"]);
    roll = async () => { Game.turn++; const f = __turns[Game.turn - 2]; if (f) f(__env); return true; };
    __done = runPhase("A", __na).then(() => (__nb ? runPhase("B", __nb) : null));`, ctx);
  await ctx.__done;
  await new Promise((r) => realTimeout(r, 200));
  const lines = vm.runInContext(`verdicts("BUILDING_DAM_MODERN")`, ctx);
  const got = lines.map((l) => l.split(" ").slice(0, 2).join(" "));
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  console.log((ok ? "OK   " : "BAD  ") + name + "  got " + JSON.stringify(got) + (ok ? "" : "  expected " + JSON.stringify(expect)));
  if (!ok) for (const l of out.filter((m) => /VERDICT|S8|EVT|LATE/.test(m))) console.log("       " + l);
  return ok;
}

const floodDC = (e, dist) => { e.damaged.add(e.idx(1, 9)); e.fire("RANDOM_EVENT_FLOOD_MODERATE", 0, 0); Object.assign(e.state.EmigrationDisaster_v1.byCity, dist); };
const floodS = (e, dist) => { e.fire("RANDOM_EVENT_FLOOD_MODERATE", 1, 4); Object.assign(e.state.EmigrationDisaster_v1.byCity, dist || {}); }; // (1,4)+radius reaches (1,5) = S
const storm = (e) => { e.fire("RANDOM_EVENT_THUNDERSTORM", 8, 8); e.state.EmigrationDisaster_v1.byCity["6:1"] = 2; }; // reaches (9,8)? no: (9,8),(8,9) -> X
const all = [];
all.push(await scenario("fix on: dammed + spared untouched, damaged gets distress, storm excluded", { turns: [(e) => floodDC(e, { "4:1": 4.4 }), (e) => floodS(e), storm], expect: ["PASS V1", "PASS V2", "INCONCLUSIVE V3", "PASS V4", "PASS V5"] }));
all.push(await scenario("bug: dammed takes distress with the fix on", { turns: [(e) => floodDC(e, { "4:1": 4.4, "2:1": 4.4 }), (e) => floodS(e)], expect: ["FAIL V1", "PASS V2", "INCONCLUSIVE V3", "PASS V4", "PASS V5"] }));
all.push(await scenario("gateoff control reproduces the bug", { gateoff: true, turns: [(e) => floodDC(e, { "4:1": 4.4, "2:1": 4.4 }), (e) => floodS(e, { "5:1": 4.4 })], expect: ["PASS V1", "PASS V2", "INCONCLUSIVE V3", "PASS V4", "PASS V5"] }));
all.push(await scenario("no damage anywhere: V2 and V4 inconclusive, not failed", { turns: [(e) => { e.fire("RANDOM_EVENT_FLOOD_MODERATE", 0, 0); }], expect: ["PASS V1", "INCONCLUSIVE V2", "INCONCLUSIVE V3", "INCONCLUSIVE V4", "PASS V5"] }));
all.push(await scenario("damage appearing after the event fails V5", { turns: [(e) => { e.fire("RANDOM_EVENT_FLOOD_MODERATE", 0, 0); e.damaged.add(e.idx(1, 9)); }], expect: ["PASS V1", "INCONCLUSIVE V2", "INCONCLUSIVE V3", "INCONCLUSIVE V4", "FAIL V5"] }));
all.push(await scenario("the Dam fails: dammed settlement damaged", { turns: [(e) => { e.damaged.add(e.idx(1, 1)); e.damaged.add(e.idx(1, 9)); e.fire("RANDOM_EVENT_FLOOD_MODERATE", 0, 0); Object.assign(e.state.EmigrationDisaster_v1.byCity, { "4:1": 4.4, "2:1": 4.4 }); }], expect: ["INCONCLUSIVE V1", "PASS V2", "INCONCLUSIVE V3", "FAIL V4", "PASS V5"] }));
all.push(await scenario("phase B: spared settlement takes distress with the gate off", { turns: [(e) => floodDC(e, { "4:1": 4.4 })], bTurns: [(e) => floodS(e, { "5:1": 4.4 })], expect: ["PASS V1", "PASS V2", "PASS V3", "PASS V4", "PASS V5"] }));
all.push(await scenario("phase B: spared settlement still clean with the gate off fails V3", { turns: [(e) => floodDC(e, { "4:1": 4.4 })], bTurns: [(e) => floodS(e)], expect: ["PASS V1", "PASS V2", "FAIL V3", "PASS V4", "PASS V5"] }));
// A raid pillages S early in the turn, a flood elsewhere passes, then a flood reaches S without damaging it: the raid
// is not that flood's damage, so S counts as spared (and takes no distress), not as damaged-without-distress.
all.push(await scenario("earlier damage in the turn is not the next flood's damage", { turns: [(e) => { e.damaged.add(e.idx(2, 5)); floodDC(e, { "4:1": 4.4 }); floodS(e); }], expect: ["PASS V1", "PASS V2", "INCONCLUSIVE V3", "PASS V4", "PASS V5"] }));
// A storm and an undamaging flood both reach S and S shows distress: it could be the storm's, so S is left out of the
// spared group rather than failing V1.
all.push(await scenario("a settlement a storm also reached is left out", { turns: [(e) => { floodDC(e, { "4:1": 4.4 }); floodS(e); e.fire("RANDOM_EVENT_THUNDERSTORM", 1, 4); e.state.EmigrationDisaster_v1.byCity["5:1"] = 2; }], expect: ["PASS V1", "PASS V2", "INCONCLUSIVE V3", "PASS V4", "PASS V5"] }));
console.log(all.every(Boolean) ? "ALL SCENARIOS OK" : "SOME SCENARIOS BAD");
process.exitCode = all.every(Boolean) ? 0 : 1;

// dams.js - Dams, a Civilization VII mod. Game scope.
//
// What it does:
//   1. Placement. The Dam buildings (data/dams.xml) use the engine's river rule (RiverPlacement="RIVER"). This
//      script adds one rule on top by wrapping the calls that place a building (Game.CityOperations BUILD and
//      Game.CityCommands PURCHASE, and canStartQuery, which the production and purchase lists are built from): one
//      Dam per river, counting Dams still under construction.
//   2. Protection. A script cannot stop a flood or change which tiles it covers (engine-closed.md: applyEvent starts
//      nothing, clearing a floodplain does not stop its river flooding). What the engine can do is keep a flood from
//      pillaging, per settlement (EFFECT_CITY_ADJUST_AVOID_RANDOM_EVENT, the Khmer Baray's effect), by flood class.
//      The data splits the floods into three classes by severity, so the protection is graded by age: an Ancient Dam
//      holds back moderate floods, a Medieval Dam major ones too, a Modern Dam every flood. A settlement holding a Dam
//      has its Dam's protection from data. Every settlement that owns a tile of a dammed river and holds no Dam as good
//      as the best one on its rivers gets that Dam's Levee (no slot, never offered in production) in its center.
//      The Dam's price is the valley: the floodplain features come off the dammed river, and those tiles lose the
//      floodplain's own yield. Floods still come and still leave their silt; no mod can stop that (d13-d15).
//   3. Safety net. On load and at the start of every local turn, the map is read again: every finished Dam, every
//      settlement on its river, a Levee wherever one is missing. So a Dam bought with gold (no completion event), an
//      AI's Dam, a new settlement or a tile bought later is caught within a turn.
//   4. Look. Each finished Dam is drawn from shipped meshes across its river (WorldUI model groups), one look per age.
//   Multiplayer: CREATE_ELEMENT is a local call, so in a network game no Levees are placed; a Dam still protects the
//   settlement that holds it.
"use strict";

const TAG = "[Dams]";
const G = globalThis;
const KEY = "__dams";
const VERSION = "1.2.0";
const DAM_TYPES = ["BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"];
/** The Levee each Dam raises, by the Dam's tier (its index in DAM_TYPES plus one). A higher tier holds more floods. */
const LEVEES = [null, "BUILDING_DAM_LEVEE", "BUILDING_DAM_LEVEE_EXPLORATION", "BUILDING_DAM_LEVEE_MODERN"];
const SETTLE_MS = 1500;
const RING = [
  "DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST",
  "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST",
];

function log(m) { try { console.error(TAG + " " + m); } catch (_) { /* ignore */ } }
function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }

const state = {
  enabled: true, multiplayer: false, originals: null,
  riverOf: new Map(), riverPlots: new Map(), damIndexes: new Set(), overlays: new Map(),
  dams: null, damsAt: 0, orphans: new Map(),
};
/** How long a read of the map's Dams may be reused. The placement lists ask many times in a row. */
const DAMS_TTL_MS = 2000;

// --- map reads -----------------------------------------------------------------------------------

function idx(loc) { return GameplayMap.getIndexFromXY(loc.x, loc.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function neighborIn(loc, k) {
  const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[k]]), null);
  return n && n.x >= 0 ? { x: n.x, y: n.y } : null;
}
function isFloodplain(loc) {
  const cls = safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(loc.x, loc.y)), null);
  return !!cls && String(cls.FeatureClassType) === "FEATURE_CLASS_FLOODPLAIN";
}
function occupants(loc) {
  return safe(() => (MapConstructibles.getConstructibles(loc.x, loc.y) || []).map((c) => {
    const inst = Constructibles.getByComponentID(c);
    const def = GameInfo.Constructibles.lookup(inst.type);
    return {
      type: String(def.ConstructibleType),
      complete: !!safe(() => inst.complete, false),
      owner: safe(() => inst.owner, -1),
      id: safe(() => (inst.localId != null ? inst.localId : inst.id), null),
    };
  }), []);
}
function owningCity(loc) {
  const c = safe(() => GameplayMap.getOwningCityFromXY(loc.x, loc.y), null);
  return c && c.owner >= 0 ? c : null;
}
function currentAge() { return safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), ""); }

/** Plot -> river id, and river id -> its plots, from MapRivers (rivers never change after map creation). */
function indexRivers() {
  state.riverOf.clear(); state.riverPlots.clear();
  const n = safe(() => MapRivers.numRivers, 0);
  for (let i = 0; i < n; i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    if (id == null) continue;
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? p : idx(p)));
    state.riverPlots.set(id, plots);
    for (const p of plots) state.riverOf.set(p, id);
  }
}
function riverAt(loc) { return loc ? (state.riverOf.has(idx(loc)) ? state.riverOf.get(idx(loc)) : null) : null; }

/**
 * Every Dam on the map, finished or not, read from the river tiles themselves. The production and purchase lists ask
 * for this many times in a row, and the scan touches every river tile, so the answer is held for a moment; anything
 * that can add or finish a Dam clears it (forget()).
 */
function damsOnMap() {
  if (state.dams && Date.now() - state.damsAt < DAMS_TTL_MS) return state.dams;
  const out = [];
  for (const [id, plots] of state.riverPlots) {
    for (const p of plots) {
      const loc = locOf(p);
      for (const o of occupants(loc)) {
        if (!DAM_TYPES.includes(o.type)) continue;
        out.push({ plot: p, loc, river: id, type: o.type, complete: o.complete, owner: o.owner });
      }
    }
  }
  state.dams = out; state.damsAt = Date.now();
  return out;
}
function forget() { state.dams = null; }
function damDef(type) {
  for (const t of DAM_TYPES) {
    const d = safe(() => GameInfo.Constructibles.lookup(t), null);
    if (d && (d.$index === type || safe(() => GameInfo.Types.lookup(t).Hash, null) === type)) return d;
  }
  return null;
}

// --- placement -----------------------------------------------------------------------------------

function plotOf(args) { return args && args.X != null && args.Y != null ? { x: args.X, y: args.Y } : null; }

/**
 * A plot a Dam may take: a river tile whose river has no other Dam of the same age (built or under way). A Dam from an
 * earlier age does not block a later one, so a river dammed in Antiquity can take a Medieval Dam as the city grows;
 * blocking it would leave the player stuck with the weakest dam forever.
 */
function damVerdict(loc, dams, type) {
  const river = riverAt(loc);
  if (river == null) return "LOC_DAM_NOT_RIVER";
  const same = (d) => !type || String(d.type) === String(type);
  if (dams.some((d) => d.river === river && d.plot !== idx(loc) && same(d))) return "LOC_DAM_RIVER_TAKEN";
  return null;
}

/** Whether this call is a Dam placement the mod has an opinion about. */
function isDamCall(type, placeType, args, res) {
  return !!(state.enabled && type === placeType && args && damDef(args.ConstructibleType)
    && res && typeof res === "object");
}

/** The engine's list of offered plots, with the rivers that already have a Dam taken out. */
function filterPlots(res, dams, type) {
  const keep = (a) => (Array.isArray(a) ? a.filter((p) => !damVerdict(locOf(p), dams, type)) : a);
  const out = { ...res, Plots: keep(res.Plots), ExpandUrbanPlots: keep(res.ExpandUrbanPlots) };
  const any = (out.Plots && out.Plots.length) || (out.ExpandUrbanPlots && out.ExpandUrbanPlots.length);
  if (res.Success && !any) return { ...out, Success: false, FailureReasons: ["LOC_DAM_RIVER_TAKEN"] };
  return out;
}

function wrapCanStart(oCan, placeType) {
  return function (cityID, type, args, ...rest) {
    const res = oCan(cityID, type, args, ...rest);
    if (!isDamCall(type, placeType, args, res)) return res;
    const dams = damsOnMap();
    const damType = safe(() => damDef(args.ConstructibleType).ConstructibleType, null);
    const loc = plotOf(args);
    if (!loc) return filterPlots(res, dams, damType);
    const why = damVerdict(loc, dams, damType);
    return why ? { ...res, Success: false, FailureReasons: [why] } : res;
  };
}

/** The lists come from canStartQuery: give each Dam entry the verdict of the wrapped canStart. */
function wrapCanStartQuery(oQuery, host, placeType) {
  return function (cityID, opType, queryType, ...rest) {
    const res = oQuery(cityID, opType, queryType, ...rest);
    if (!state.enabled || opType !== placeType || !Array.isArray(res)) return res;
    for (const e of res) {
      if (!e || !damDef(e.index)) continue;
      const verdict = safe(() => host.canStart(cityID, placeType, { ConstructibleType: e.index }, false), null);
      if (verdict) e.result = verdict;
    }
    return res;
  };
}

function wrapHost(host, type) {
  if (!host || typeof host.canStart !== "function") return null;
  const saved = { host, canStart: host.canStart };
  host.canStart = wrapCanStart(saved.canStart.bind(host), type);
  if (typeof host.canStartQuery === "function") {
    saved.canStartQuery = host.canStartQuery;
    host.canStartQuery = wrapCanStartQuery(saved.canStartQuery.bind(host), host, type);
  }
  return saved;
}

// --- protection ----------------------------------------------------------------------------------

/** Settlements that own at least one tile of the river, as { owner, id, key, center }. */
function citiesOnRiver(river) {
  const seen = new Map();
  for (const p of state.riverPlots.get(river) || []) {
    const c = owningCity(locOf(p));
    if (!c) continue;
    const key = `${c.owner}:${c.id}`;
    if (seen.has(key)) continue;
    const city = safe(() => Cities.get(c), null);
    const center = city && safe(() => ({ x: city.location.x, y: city.location.y }), null);
    if (center) seen.set(key, { owner: c.owner, id: c.id, key, center });
  }
  return [...seen.values()];
}

function tierOf(type) { return DAM_TYPES.indexOf(String(type)) + 1; }
function isLevee(type) { return LEVEES.includes(type); }
/** Raises map[key] to at least tier. */
function raise(map, key, tier) { map.set(key, Math.max(map.get(key) || 0, tier)); }

/**
 * The Levee each settlement should hold, keyed by settlement: the Levee of the best finished Dam on any river it owns a
 * tile of, unless it holds a Dam at least that good itself. Settlements that need none are absent. The protection is
 * per settlement in the engine, so a settlement on two dammed rivers takes the better of the two.
 */
function leveePlan(done) {
  const best = new Map();
  const held = new Map();
  for (const d of done) {
    raise(best, d.river, tierOf(d.type));
    const c = owningCity(d.loc);
    if (c) raise(held, `${c.owner}:${c.id}`, tierOf(d.type));
  }
  const need = new Map();
  for (const [river, tier] of best) {
    for (const c of citiesOnRiver(river)) {
      const prev = need.get(c.key);
      if (!prev || tier > prev.tier) need.set(c.key, { ...c, tier });
    }
  }
  const plan = new Map();
  for (const [key, c] of need) if (c.tier > (held.get(key) || 0)) plan.set(key, { ...c, levee: LEVEES[c.tier] });
  return plan;
}

/** Places each settlement's planned Levee where it is missing. Returns how many were placed. */
function protect(plan) {
  if (state.multiplayer) return 0;
  const local = GameContext.localPlayerID;
  let placed = 0;
  for (const c of plan.values()) {
    if (occupants(c.center).some((o) => o.type === c.levee)) continue;
    safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: c.levee, Location: c.center, Owner: c.owner }));
    placed++;
  }
  return placed;
}

/**
 * A Levee stays only while it is the one its settlement's plan calls for. A Dam can be pillaged or razed, a better Dam
 * can be finished upstream, and a settlement can lose its river tiles to a border change or a trade; without this, it
 * would keep the old protection for good after the reason had gone.
 *
 * A Levee goes only once it has been out of plan on two different turns. The first sweep after a load can run before
 * the map's buildings read back, see no Dams at all, and would otherwise strip every Levee on the map. Returns how many
 * were removed.
 */
function unprotect(plan) {
  if (state.multiplayer) return 0;
  const turn = safe(() => Game.turn, -1);
  let removed = 0;
  for (const city of allCities()) {
    const want = plan.has(city.key) ? plan.get(city.key).levee : null;
    const extra = occupants(city.center).filter((o) => isLevee(o.type) && o.type !== want && o.id != null);
    if (!extra.length) { state.orphans.delete(city.key); continue; }
    if (!confirmedOrphan(city.key, turn)) continue;
    removed += destroyAll(extra);
    state.orphans.delete(city.key);
  }
  return removed;
}

/** True once a settlement has been seen with a Levee it should not hold on an earlier turn than this one. */
function confirmedOrphan(key, turn) {
  const first = state.orphans.get(key);
  if (first == null) { state.orphans.set(key, turn); return false; }
  return first !== turn;
}

function destroyAll(constructibles) {
  const local = GameContext.localPlayerID;
  for (const o of constructibles) {
    safe(() => Game.PlayerOperations.sendRequest(local, "DESTROY_ELEMENT", { Kind: "CONSTRUCTIBLE", Owner: o.owner, LocalID: o.id }));
  }
  return constructibles.length;
}

/** Every settlement on the map, as { key, center }. */
function allCities() {
  const out = [];
  for (const p of safe(() => Players.getAlive(), []) || []) {
    for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
      const city = safe(() => Cities.get(cid), null);
      const center = city && safe(() => ({ x: city.location.x, y: city.location.y }), null);
      if (center) out.push({ key: `${cid.owner}:${cid.id}`, center });
    }
  }
  return out;
}

/**
 * The price of the Dam: the valley below it dries out. The floodplain features come off the dammed river and those
 * tiles lose the floodplain's own yield, about 1 Food each, for good. This is a cost by design, not a mechanism: floods
 * still come and still add their Food or Production to the river's tiles whether or not a floodplain is there
 * (d13, d14), and the gain cannot be written back (d15). Returns how many were dried.
 */
function dry(dams) {
  if (state.multiplayer) return 0;
  let dried = 0;
  for (const river of new Set(dams.filter((d) => d.complete).map((d) => d.river))) {
    const plots = (state.riverPlots.get(river) || []).map(locOf).filter(isFloodplain);
    if (!plots.length) continue;
    safe(() => {
      WorldBuilder.startBlock();
      for (const loc of plots) WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, loc);
      WorldBuilder.endBlock();
    });
    dried += plots.length;
  }
  return dried;
}

// --- look ----------------------------------------------------------------------------------------

/**
 * Pieces per age as [asset, along the wall, downstream, scale, angle offset, placement]. The wall runs across
 * the river: angle 0 of a piece is the wall's direction. A piece marked "surface" sits on the water line when the
 * Dam stands on water. PlacementMode.TERRAIN seats it on the riverbed, where the tall medieval span and modern piers
 * still reach up through the water but low rocks and stakes drown out of sight (d24-ant2).
 * One look per age, in the manner of the Canals mod: rocks, then masonry, then
 * concrete. Chosen from the d18, d19 and d20 captures, where candidates were drawn one to a tile of open navigable
 * water. The dams grow with the age, a rough weir to a masonry wall to a concrete barrage, and the scales are set by
 * what renders rather than by matching numbers: the three meshes differ a lot in native size (d21 draws all three
 * in one frame to compare).
 */
const DAM_LOOKS = {
  // A rough weir: two staggered rows of boulders packed into one berm across the flow, white water below.
  // The fortification rock piles lie low in the water (d20); the sandbar rocks stand up like menhirs at any scale that
  // fits a hex, and river-rock decals alone read as ordinary riverbed. It has to be a line, not a scatter: at 0.26 the
  // piles were single pebbles lost among the river's own rocks (d24-ant), and one row of seven still read as sparse
  // (d24-ant4). Low and rough, so still the smallest of the three beside the medieval ford and the modern barrage.
  AGE_ANTIQUITY: [
    ["Decal_Major_River_Rocks_A", 0, 0, 1, 0],
    ["Decal_Major_River_Rocks_C", 0, -0.04, 1, 60],
    ["Ant1_Euro_Fortification_RockPile01", -0.28, 0.00, 0.72, 0, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", -0.21, 0.00, 0.8, 47, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", -0.14, 0.00, 0.8, 94, "surface"],
    ["Ant1_Euro_Fortification_RockPile01", -0.07, 0.00, 0.8, 141, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", 0.00, 0.00, 0.8, 188, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", 0.07, 0.00, 0.8, 235, "surface"],
    ["Ant1_Euro_Fortification_RockPile01", 0.14, 0.00, 0.8, 282, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", 0.21, 0.00, 0.8, 329, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", 0.28, 0.00, 0.72, 16, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", -0.245, -0.05, 0.7, 20, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", -0.175, -0.05, 0.7, 73, "surface"],
    ["Ant1_Euro_Fortification_RockPile01", -0.105, -0.05, 0.7, 126, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", -0.035, -0.05, 0.7, 179, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", 0.035, -0.05, 0.7, 232, "surface"],
    ["Ant1_Euro_Fortification_RockPile01", 0.105, -0.05, 0.7, 285, "surface"],
    ["Ant1_Euro_Fortification_RockPile02", 0.175, -0.05, 0.7, 338, "surface"],
    ["Ant1_Euro_Fortification_RockPile03", 0.245, -0.05, 0.7, 31, "surface"],
    ["VFX_Riverfoam_Straight1_Short", 0, 0.16, 0.9, 90],
  ],



  // The Great Wall where it fords a river: a stone barrier across the water with a gated arch through it (d18), a
  // mill wheel turning on the downstream side, and foam where the water comes through the arch.
  AGE_EXPLORATION: [
    ["IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 0.45, 0],
    ["NEU_NOR_Gristmill_WaterWheel", 0.2, 0.12, 0.35, 90],
    ["VFX_Riverfoam_Straight1", 0, 0.2, 0.8, 90],
  ],
  // A concrete barrage: two piers set end to end across the flow with cranes along the crest (d19), a transformer
  // house on the bank, and heavy white water below the spillway.
  AGE_MODERN: [
    ["GEN_MOD_Harbor_Pier_HB", -0.24, 0, 0.55, 0],
    ["GEN_MOD_Harbor_Pier_HB", 0.24, 0, 0.55, 0],
    ["NAF_MOD_RadioStation_ElectricBox", 0.32, 0.18, 0.6, 0],
    ["VFX_Riverfoam_Thick_Straight1", 0, 0.24, 1, 90],
    ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, 0.12, 0.6, 90],
  ],
};

/** Screen angle of a ring direction: 0 points east and turns counter-clockwise on screen. */
function armAngle(k) { return (360 - 60 * k) % 360; }

/**
 * The direction the river runs through a tile, as a screen angle, from its same-river neighbors. Unreliable where the
 * river forks or meets the sea: there the same-river neighbors are the branches, not upstream and downstream, and the
 * average of two branches can sit at right angles to the real channel (d24-ant4 laid the weir along the river). Used
 * only as the fallback for wallAngle.
 */
function flowAngle(loc, river) {
  const set = new Set(state.riverPlots.get(river) || []);
  const sides = [];
  for (let k = 0; k < 6; k++) { const n = neighborIn(loc, k); if (n && set.has(idx(n))) sides.push(k); }
  if (!sides.length) return 0;
  if (sides.length === 1) return armAngle(sides[0]);
  // two or more: the axis through the first pair, averaged on the circle
  const a = armAngle(sides[0]) * Math.PI / 180, b = (armAngle(sides[1]) + 180) * Math.PI / 180;
  return (Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b)) * 180 / Math.PI + 360) % 360;
}

/** Land that a Dam can be built against: not sea, lake or navigable river. */
function isBank(loc) {
  return !!loc && !safe(() => GameplayMap.isWater(loc.x, loc.y) || GameplayMap.isNavigableRiver(loc.x, loc.y), true);
}

/**
 * The line a Dam's wall runs along, as a screen angle. On water it spans bank to bank: of the tile's three axes, the
 * one with land at both ends, and where two qualify, the one with more water beside it. That holds at forks and river
 * mouths, where the flow read from same-river neighbors does not. On a land tile with a minor river, and on water with
 * no axis landed at both ends, the wall runs across the flow instead.
 */
function wallAngle(loc, river) {
  const onWater = !!safe(() => GameplayMap.isNavigableRiver(loc.x, loc.y) || GameplayMap.isWater(loc.x, loc.y), false);
  if (onWater) {
    let best = null;
    for (let k = 0; k < 3; k++) {
      const ends = [neighborIn(loc, k), neighborIn(loc, k + 3)];
      if (!ends.every(isBank)) continue;
      const sides = [neighborIn(loc, (k + 1) % 6), neighborIn(loc, (k + 2) % 6), neighborIn(loc, (k + 4) % 6),
        neighborIn(loc, (k + 5) % 6)];
      const wet = sides.filter((n) => n && !isBank(n)).length;
      if (!best || wet > best.wet) best = { k, wet };
    }
    if (best) return armAngle(best.k);
  }
  return (flowAngle(loc, river) + 90) % 360;
}

/** An offset in hex units (as canals.js alongArm): `along` the wall, `down` across it. */
function offsetFor(angle, along, down) {
  const r = angle * Math.PI / 180;
  return { x: Math.cos(r) * along - Math.sin(r) * down, y: Math.sin(r) * along + Math.cos(r) * down, z: 0 };
}

function drawDam(d) {
  if (state.overlays.has(d.plot) || typeof WorldUI === "undefined" || typeof PlacementMode === "undefined") return false;
  const def = safe(() => GameInfo.Constructibles.lookup(d.type), null);
  const pieces = DAM_LOOKS[(def && String(def.Age)) || currentAge()] || DAM_LOOKS.AGE_ANTIQUITY;
  const group = safe(() => WorldUI.createModelGroup("Dams_" + d.plot), null);
  if (!group) return false;
  const wall = wallAngle(d.loc, d.river);
  const { x, y } = d.loc;
  const onWater = !!safe(() => GameplayMap.isNavigableRiver(x, y) || GameplayMap.isWater(x, y), false);
  for (const piece of pieces) drawPiece(group, d.loc, wall, onWater, piece);
  state.overlays.set(d.plot, group);
  return true;
}

/**
 * One piece of a Dam's look. Effects go through addVFXAtPlot, which takes the plot as {x, y}: through addModelAtPlot
 * they draw nothing (national_park np-draw.js; the waterfall tried in d17 and d18 never appeared for that reason).
 */
function drawPiece(group, loc, wall, onWater, [asset, along, down, scale, rot, place]) {
  const off = offsetFor(wall, along, down);
  const angle = (wall + rot) % 360;
  if (asset.startsWith("VFX_")) {
    safe(() => group.addVFXAtPlot(asset, { x: loc.x, y: loc.y }, off, { angle, scale }));
    return;
  }
  const placement = place === "surface" && onWater ? PlacementMode.WATER : PlacementMode.TERRAIN;
  safe(() => group.addModelAtPlot(asset, { i: loc.x, j: loc.y }, off,
    { placement, followTerrain: placement === PlacementMode.TERRAIN, needsShadows: true, scale, angle }));
}

function clearDam(plot) {
  const g = state.overlays.get(plot);
  if (!g) return;
  safe(() => g.clear());
  safe(() => g.destroy());
  state.overlays.delete(plot);
}

// --- the sweep -----------------------------------------------------------------------------------

function sweep() {
  if (!state.enabled) return;
  forget();
  const dams = damsOnMap();
  const done = dams.filter((d) => d.complete);
  const live = new Set(done.map((d) => d.plot));
  for (const plot of [...state.overlays.keys()]) if (!live.has(plot)) clearDam(plot);
  let drawn = 0;
  for (const d of done) if (drawDam(d)) drawn++;
  const plan = leveePlan(done);
  const placed = protect(plan);
  const removed = unprotect(plan);
  const dried = dry(done);
  if (drawn || placed || removed || dried) {
    log(`sweep: ${done.length} dams, ${drawn} drawn, ${placed} levees placed, ${removed} removed, ${dried} floodplains dried`);
  }
}

function onBuildCompleted(data) {
  if (!state.enabled || !data || !data.location) return;
  const def = safe(() => GameInfo.Constructibles.lookup(data.constructibleType), null);
  if (!def || !DAM_TYPES.includes(String(def.ConstructibleType))) return;
  forget();
  setTimeout(sweep, SETTLE_MS);
}

/**
 * A Dam bought with gold lands complete and the engine sends no completion event for it (canals c36), and a Dam can
 * be pillaged or razed. Either shows up as a constructible added to or removed from the map, so sweep then too.
 */
function onConstructibleMoved(data) {
  if (!state.enabled || !data) return;
  const type = data.constructibleType;
  if (type == null || !state.damIndexes.has(type)) return;
  forget();
  setTimeout(sweep, SETTLE_MS);
}

// --- install -------------------------------------------------------------------------------------

/** Wrap both paths a building is placed through; each one the mod misses simply keeps the engine's own rule. */
function wrapPlacement() {
  const hosts = [];
  const build = wrapHost(safe(() => Game.CityOperations, null), safe(() => CityOperationTypes.BUILD, null));
  if (build) hosts.push(build);
  else log("Game.CityOperations not wrappable; one Dam per river is not enforced in production");
  const purchase = wrapHost(safe(() => Game.CityCommands, null), safe(() => CityCommandTypes.PURCHASE, null));
  if (purchase) hosts.push(purchase);
  else log("Game.CityCommands not wrappable; one Dam per river is not enforced for purchases");
  return hosts;
}

function install() {
  for (const t of DAM_TYPES) {
    const d = safe(() => GameInfo.Constructibles.lookup(t), null);
    if (d) { state.damIndexes.add(d.$index); safe(() => state.damIndexes.add(GameInfo.Types.lookup(t).Hash)); }
  }
  if (!state.damIndexes.size) { log("no Dam buildings in the database; inactive"); return false; }
  state.multiplayer = !!safe(() => Configuration.getGame().isNetworkMultiplayer, false);
  indexRivers();
  state.originals = { hosts: wrapPlacement() };
  safe(() => engine.on("ConstructibleBuildCompleted", onBuildCompleted));
  safe(() => engine.on("ConstructibleAddedToMap", onConstructibleMoved));
  safe(() => engine.on("ConstructibleRemovedFromMap", onConstructibleMoved));
  safe(() => engine.on("PlayerTurnActivated", (d) => { if (d && (d.player ?? d.Player) === GameContext.localPlayerID) setTimeout(sweep, SETTLE_MS); }));
  setTimeout(sweep, SETTLE_MS * 2);
  log(`active ${VERSION}: ${state.riverPlots.size} rivers indexed${state.multiplayer ? " (network game: no Levees)" : ""}`);
  return true;
}

function uninstall() {
  for (const h of (state.originals && state.originals.hosts) || []) {
    h.host.canStart = h.canStart;
    if (h.canStartQuery) h.host.canStartQuery = h.canStartQuery;
  }
  safe(() => engine.off("ConstructibleBuildCompleted", onBuildCompleted));
  safe(() => engine.off("ConstructibleAddedToMap", onConstructibleMoved));
  safe(() => engine.off("ConstructibleRemovedFromMap", onConstructibleMoved));
  for (const plot of [...state.overlays.keys()]) clearDam(plot);
  state.enabled = false;
  log("uninstalled");
}

if (!G[KEY]) {
  G[KEY] = {
    version: VERSION,
    set enabled(v) { state.enabled = !!v; },
    get enabled() { return state.enabled; },
    uninstall, sweep, damsOnMap, citiesOnRiver, riverAt, flowAngle, wallAngle, drawDam, clearDam, dry, forget,
    unprotect, damVerdict, leveePlan: () => leveePlan(damsOnMap().filter((d) => d.complete)),
    looks: DAM_LOOKS,
    drawn: () => [...state.overlays.keys()],
  };
  install();
}

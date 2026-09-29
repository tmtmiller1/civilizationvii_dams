// dams-sites.js - Dams, the sites. Game scope, loaded after ui/dams.js and using what it publishes on __dams.
//
// Each Dam requires a site marker on its tile (data/dams-sites.xml, Constructible_RequiredFeatures), so the engine
// offers it, to the game's own AI as to the player, only on a tile this script has marked. The game's AI obeys only the
// data, and the data cannot say "a river that floods, with no Dam as good on it". Left to itself the AI weighed a Dam
// on every river tile it could build on, most of them on rivers that never flood (u1: 1,010 evaluations, 60 turns).
// The script marks:
//   - for each AI player, one tile of each river where a Dam guards something: the river floods, no Dam as good stands
//     on it, and at least MIN_GUARDED of the AI's own built-on tiles along it would be pillaged by a flood. The game's
//     own AI then decides for itself whether and when to build the Dam there, as it does any building;
//   - for the player, the tile of each Dam order, as the order is placed. The player's list is the engine's, widened to
//     every river tile of the settlement the engine would build on (candidatePlots), since without a marker the engine
//     offers none.
// A marker put on a tile that held vegetation, wetland or a floodplain replaces it; that feature is kept (SITES_KEY)
// and put back when the tile stops being a site with no Dam on it. The marker yields exactly what bare land does and
// has no feature class, so the tile yields what it did; growth still offers the tile (watched with the Canals marker,
// runs m1-m7). A save keeps the markers; loaded without the mod they are gone. Not in a network game: the marker is a
// local write.
"use strict";

const TAG = "[Dams]";
const SITE_FEATURE = "FEATURE_DAMS_SITE";
const SITES_KEY = "Dams_Sites_v1";
const MIN_GUARDED = 2;
const ORDER_LAND_MS = 6000;

function log(m) { try { console.error(TAG + " " + m); } catch (_) { /* ignore */ } }
function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idx(loc) { return GameplayMap.getIndexFromXY(loc.x, loc.y); }

let D = null;
const state = { syncing: false, originals: [] };

// --- the marker ------------------------------------------------------------------------------------------

function featureOf(loc) {
  return safe(() => {
    const f = GameplayMap.getFeatureType(loc.x, loc.y);
    return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType);
  }, "?");
}
function siteIndex() { return safe(() => GameInfo.Features.lookup(SITE_FEATURE).$index, null); }
function isMarked(loc) { return featureOf(loc) === SITE_FEATURE; }

/** A feature a marker may stand in for until the Dam is built: vegetation, wetland, floodplain; never a wonder. */
function yieldsToMarker(loc) {
  const f = featureOf(loc);
  if (!f || f === SITE_FEATURE) return true;
  if (safe(() => GameInfo.Feature_NaturalWonders.find((r) => String(r.FeatureType) === f), null)) return false;
  const cls = safe(() => String(GameInfo.Features.lookup(f).FeatureClassType || ""), "");
  return cls === "FEATURE_CLASS_VEGETATED" || cls === "FEATURE_CLASS_WET" || cls === "FEATURE_CLASS_FLOODPLAIN";
}

/** Marked plots, each with the feature the marker replaced ("" for none) and whether a player order holds it. */
function loadSites() {
  const s = safe(() => JSON.parse(String(Configuration.getGame().getValue(SITES_KEY))), null);
  return s && typeof s === "object" ? s : {};
}
function saveSites(s) { safe(() => Configuration.editGame().setValue(SITES_KEY, JSON.stringify(s))); }

/**
 * Set a tile's feature (an index, or FeatureTypes.NO_FEATURE) and wait for it to read back. One feature cannot replace
 * another in a single call: the old one goes and nothing comes in its place (canals m8, five tiles of five); cleared
 * first, the new one lands. True once the tile reads as asked.
 */
async function putFeature(loc, f) {
  const want = f === FeatureTypes.NO_FEATURE ? "" : safe(() => String(GameInfo.Features.lookup(f).FeatureType), "?");
  const at = { x: loc.x, y: loc.y };
  if (featureOf(loc) && featureOf(loc) !== want) {
    safe(() => WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, at));
    for (let k = 0; k < 30 && featureOf(loc); k++) await sleep(100);
  }
  if (want && featureOf(loc) !== want) {
    safe(() => WorldBuilder.MapPlots.setFeature(f, at));
    for (let k = 0; k < 30 && featureOf(loc) !== want; k++) await sleep(100);
  }
  return featureOf(loc) === want;
}

/** Put the marker on a tile, keeping the feature it replaces. True once it reads back. */
async function markSite(loc, order = false) {
  const f = siteIndex();
  if (f == null || !yieldsToMarker(loc)) return false;
  const sites = loadSites(); const plot = idx(loc);
  if (!(plot in sites)) sites[plot] = { was: isMarked(loc) ? "" : featureOf(loc), order };
  else if (order) sites[plot].order = true;
  saveSites(sites);
  return putFeature(loc, f);
}

/** Take the marker off and put back the feature it replaced. */
async function unmarkSite(loc) {
  const sites = loadSites(); const plot = idx(loc);
  const name = sites[plot] && sites[plot].was;
  const was = name ? safe(() => GameInfo.Features.lookup(name).$index, null) : null;
  delete sites[plot]; saveSites(sites);
  if (isMarked(loc)) await putFeature(loc, was != null ? was : FeatureTypes.NO_FEATURE);
}

// --- what a Dam is worth to an AI ---------------------------------------------------------------------------

function isAiMajor(p) {
  return !!p && safe(() => p.isAlive, false) && safe(() => p.isMajor, false) && !safe(() => p.isHuman, false);
}
function aiMajors() {
  const out = [];
  const local = D.localId();
  for (let pid = 0; pid < 64; pid++) if (pid !== local && isAiMajor(safe(() => Players.get(pid), null))) out.push(pid);
  return out;
}

function thisAgesDam() {
  const age = D.currentAge();
  return D.types.map((t) => safe(() => GameInfo.Constructibles.lookup(t), null)).find((d) => d && String(d.Age) === age)
    || null;
}

function riverFloods(river) { return !!safe(() => MapRivers.getRiver(river).isFloodable, false); }

/** A marked tile whose marker stands in for a floodplain: still one a flood would reach (v1: counted as dry, the
 * marker took its own site's worth away and was lifted again the next turn). */
function wasFloodplain(sites, loc) {
  const rec = sites[idx(loc)];
  const cls = rec && rec.was ? safe(() => String(GameInfo.Features.lookup(rec.was).FeatureClassType || ""), "") : "";
  return cls === "FEATURE_CLASS_FLOODPLAIN";
}

/**
 * The tiles of this AI's along the river that a flood would pillage: floodplain tiles it owns with something built on
 * them. A river an older Dam has already dried has no floodplain left, so there every built-on river tile it owns
 * counts; floods land on the same tiles as before (d2).
 */
function guarded(river, pid) {
  const dried = D.damsOnMap().some((d) => d.river === river && d.complete);
  const sites = loadSites();
  const counts = (loc) => safe(() => GameplayMap.getOwner(loc.x, loc.y), -1) === pid
    && (dried || D.isFloodplain(loc) || wasFloodplain(sites, loc))
    && (D.occupants(loc).length > 0 || !!safe(() => Districts.getAtLocation(loc), null));
  return D.riverPlots(river).map(locOf).filter(counts).length;
}

/** What a Dam of this type on this river is worth to this AI, with the reason; worth 0 means not worth building. */
function damWorth(river, pid, type) {
  if (river == null) return { worth: 0, why: "no river" };
  if (!riverFloods(river)) return { worth: 0, why: "river never floods" };
  const tier = D.tierOf(type);
  if (D.damsOnMap().some((d) => d.river === river && D.tierOf(d.type) >= tier)) return { worth: 0, why: "a Dam as good already" };
  const n = guarded(river, pid);
  return n >= MIN_GUARDED ? { worth: n, why: `guards ${n} tiles` } : { worth: 0, why: `guards only ${n}` };
}

// --- where a Dam can go ---------------------------------------------------------------------------------

function districtAt(loc) {
  return safe(() => String(GameInfo.Districts.lookup(Districts.getAtLocation(loc).type).DistrictType), "");
}
function isBuilding(o) { return safe(() => String(GameInfo.Constructibles.lookup(o.type).ConstructibleClass), "") !== "IMPROVEMENT"; }
function neighbours(loc) {
  const ring = safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, 1) || [], []);
  return ring.filter((i) => i !== idx(loc)).map(locOf);
}
const URBAN = ["DISTRICT_URBAN", "DISTRICT_CITY_CENTER"];

/**
 * The river tiles of this settlement the engine would put a building on once marked: an urban tile with room, or a
 * rural tile beside the urban core (the engine grows the core onto it; a young settlement is offered only those, d28e).
 * Within three tiles of the centre, no resource (no building goes on one, canals c53), a feature the marker can stand
 * in for. Read from the map: canStart gives an AI's settlements no plots at all (u2).
 */
function candidatePlots(city) {
  const centre = safe(() => city.location, null);
  const near = (loc) => !centre || safe(() => GameplayMap.getPlotDistance(centre.x, centre.y, loc.x, loc.y), 99) <= 3;
  const room = (loc) => {
    const d = districtAt(loc);
    if (d === "DISTRICT_URBAN") return D.occupants(loc).filter(isBuilding).length < 2;
    return d === "DISTRICT_RURAL" && neighbours(loc).some((n) => URBAN.includes(districtAt(n)));
  };
  const noResource = (loc) => safe(() => GameplayMap.getResourceType(loc.x, loc.y), -1) === ResourceTypes.NO_RESOURCE;
  return safe(() => city.getPurchasedPlots() || [], []).map(locOf)
    .filter((loc) => D.riverAt(loc) != null && near(loc) && noResource(loc) && yieldsToMarker(loc) && room(loc));
}

/** Among a river's candidate tiles, the one the marker costs least on: an urban tile, then one with no feature, and a
 * floodplain last (the marker would stand in for its yield until the Dam is built). */
function bestTile(tiles) {
  const cost = (loc) => (districtAt(loc) === "DISTRICT_URBAN" ? 0 : 2) + (featureOf(loc) && !isMarked(loc) ? 1 : 0)
    + (D.isFloodplain(loc) ? 2 : 0);
  return tiles.slice().sort((a, b) => cost(a) - cost(b))[0];
}

/**
 * The tiles of each river a Dam is worth building on, for each AI player that owns a settlement on it: every candidate
 * with no feature (the marker costs nothing there), or the one that costs least when all hold one. The engine builds
 * only on some of them (an urban tile, or a rural one the settlement can grow onto), and will not say which for an AI's
 * settlement (u2); marked tiles it would not build on went unweighed (v1b), so it is given every free choice.
 */
function aiSites() {
  const out = new Map();
  const def = thisAgesDam();
  if (!def) return out;
  for (const pid of aiMajors()) {
    for (const [river, tiles] of riversOf(pid)) {
      const w = damWorth(river, pid, def.ConstructibleType);
      if (w.worth <= 0) continue;
      const free = tiles.filter((loc) => !featureOf(loc) || isMarked(loc));
      for (const loc of free.length ? free : [bestTile(tiles)]) out.set(idx(loc), { pid, river, why: w.why });
    }
  }
  return out;
}

/** An AI player's candidate tiles, by river. */
function riversOf(pid) {
  const byRiver = new Map();
  for (const city of safe(() => Players.get(pid).Cities.getCities() || [], [])) {
    for (const loc of candidatePlots(city)) {
      const r = D.riverAt(loc);
      if (!byRiver.has(r)) byRiver.set(r, []);
      byRiver.get(r).push(loc);
    }
  }
  return byRiver;
}

// --- keeping the markers --------------------------------------------------------------------------------

const damOn = (loc) => D.occupants(loc).some((o) => D.types.includes(o.type));

async function markWanted(want) {
  let added = 0;
  for (const [p, w] of want) {
    const loc = locOf(p);
    if (isMarked(loc) || !await markSite(loc)) continue;
    added++;
    log(`site marked for AI ${w.pid} at ${loc.x},${loc.y} (river ${w.river}, ${w.why})`);
  }
  return added;
}

/** A Dam stands on the tile: the marker stays for it, and the feature it replaced is not put back if the Dam goes (the
 * Dam dried the river, and a dried floodplain stays dried). */
function settle(p, rec) {
  if (!rec || (!rec.was && !rec.order)) return;
  const s = loadSites();
  if (s[p]) { s[p].was = ""; s[p].order = false; saveSites(s); }
}

/** An order is live while its settlement's queue still holds a Dam. */
function orderLive(loc) {
  const city = safe(() => GameplayMap.getOwningCityFromXY(loc.x, loc.y), null);
  if (!city) return false;
  const defs = D.types.map((t) => safe(() => GameInfo.Constructibles.lookup(t), null)).filter(Boolean);
  return defs.some((d) => inQueue(city, d));
}

/** Unmarks every tile the script marked that is no longer wanted: not an AI site, no order waiting, no Dam on it. */
async function unmarkStale(want) {
  let removed = 0;
  for (const [key, rec] of Object.entries(loadSites())) {
    const p = Number(key); const loc = locOf(p);
    if (damOn(loc)) { settle(p, rec); continue; }
    if (want.has(p) || (rec && rec.order && orderLive(loc))) continue;
    await unmarkSite(loc); removed++;
  }
  return removed;
}

/** Marks every AI site and unmarks the rest. At load, at each of the player's turn starts, after each Dam. */
async function syncSites() {
  if (!D || !D.enabled || D.multiplayer || state.syncing || siteIndex() == null) return;
  state.syncing = true;
  try {
    D.forget();
    const want = aiSites();
    const added = await markWanted(want);
    const removed = await unmarkStale(want);
    if (added || removed) log(`sites: ${added} marked, ${removed} unmarked, ${want.size} AI sites`);
  } finally { state.syncing = false; }
}

// --- the player's orders ----------------------------------------------------------------------------------

function damIndex(type) {
  const hash = (d) => safe(() => GameInfo.Types.lookup(d.ConstructibleType).Hash, null);
  return D.types.map((t) => safe(() => GameInfo.Constructibles.lookup(t), null))
    .find((d) => d && (d.$index === type || hash(d) === type)) || null;
}
function plotOf(args) { return args && args.X != null && args.Y != null ? { x: args.X, y: args.Y } : null; }
function locked(res) { return !!res && (res.Locked === true || (res.NeededUnlock != null && res.NeededUnlock !== -1)); }

/** The settlement's river tiles the mod offers for this Dam: the candidates, less rivers that have one of its age. */
function offered(cityID, type) {
  const city = safe(() => Cities.get(cityID), null);
  if (!city || D.multiplayer) return [];
  const dams = D.damsOnMap();
  return candidatePlots(city).filter((loc) => !D.damVerdict(loc, dams, type)).map(idx);
}

/**
 * canStart, outside the wrapper of ui/dams.js: the engine offers a Dam only on a marked tile, so its list is widened to
 * every candidate river tile of the settlement, and a candidate tile passes the per-plot check (it is marked as the
 * order is placed). A locked Dam, or any refusal other than the location, stands.
 */
function wrapCanStart(inner, placeType) {
  return function (cityID, type, args, ...rest) {
    const res = inner(cityID, type, args, ...rest);
    const def = type === placeType && args ? damIndex(args.ConstructibleType) : null;
    return widenable(def, res) ? widen(res, cityID, def, plotOf(args)) : res;
  };
}

/** A verdict on this age's Dam that the mod may widen: not locked, and refused (if at all) only for want of a place. */
function widenable(def, res) {
  if (!def || !D.enabled || !res || typeof res !== "object" || locked(res)) return false;
  if (String(def.Age) !== D.currentAge()) return false;
  return res.Success || (res.FailureReasons || []).every((r) => String(r) === "LOC_BUILDING_CONSTRUCT_NO_SUITABLE_LOCATION");
}

function widen(res, cityID, def, at) {
  const mine = offered(cityID, def.ConstructibleType);
  if (at) return mine.includes(idx(at)) ? { ...res, Success: true, FailureReasons: [] } : res;
  const plots = [...new Set([...(res.Plots || []), ...mine])];
  return plots.length ? { ...res, Plots: plots, Success: true, FailureReasons: [] } : res;
}

/** Short of gold still lists it, greyed with its price, as the game lists any building it cannot afford. */
function listable(v) { return !!v && (v.Success || (v.InsufficientFunds && (v.Plots || []).length > 0)); }

/** The lists are built from canStartQuery, which drops an entry the engine gave no location: put the Dam back. */
function wrapCanStartQuery(inner, host, placeType) {
  return function (cityID, opType, queryType, ...rest) {
    const res = inner(cityID, opType, queryType, ...rest);
    const constructibles = safe(() => CityQueryType.Constructible, null);
    const ours = opType === placeType && Array.isArray(res) && D.enabled && queryType === constructibles;
    if (ours) listDam(res, host, cityID, placeType);
    return res;
  };
}

function listDam(res, host, cityID, placeType) {
  const def = thisAgesDam();
  const verdict = def && safe(() => host.canStart(cityID, placeType, { ConstructibleType: def.$index }, false), null);
  if (!verdict) return;
  const entry = res.find((e) => e && e.index === def.$index);
  if (entry) entry.result = verdict;
  else if (listable(verdict)) res.push({ index: def.$index, result: verdict });
}

/** A Dam landed on an ordered tile: the marker now stays for the Dam, not the order. */
function orderDone(loc) {
  const s = loadSites();
  if (s[idx(loc)]) { s[idx(loc)].order = false; saveSites(s); }
  D.forget();
}

/** Whether the settlement's build queue holds this Dam (a production order reaches the map only later: canals s1). */
function inQueue(cityID, def) {
  const hash = safe(() => GameInfo.Types.lookup(def.ConstructibleType).Hash, null);
  const items = safe(() => Cities.get(cityID).BuildQueue.getQueue() || [], []);
  return items.some((i) => [i.constructibleType, i.type].some((t) => t != null && (t === def.$index || t === hash)));
}

/** The order: mark the tile, wait for the engine to take the Dam there, then forward. The tile goes back if the Dam
 * neither lands nor enters the queue. */
async function placeOrder(order, forward, accepts) {
  const { loc, cityID, def } = order;
  if (!await markSite(loc, true)) { log(`the site marker did not land at ${loc.x},${loc.y}`); return; }
  for (let k = 0; k < 50 && !accepts(); k++) await sleep(100);
  forward();
  const t0 = Date.now();
  while (Date.now() - t0 < ORDER_LAND_MS) {
    await sleep(200);
    if (damOn(loc)) { orderDone(loc); return; }
    if (inQueue(cityID, def)) return;
  }
  log(`the engine did not take the Dam at ${loc.x},${loc.y}; putting the tile back`);
  await unmarkSite(loc);
}

function wrapSendRequest(inner, host, placeType, innerCan) {
  return function (cityID, type, args, ...rest) {
    const def = type === placeType && args ? damIndex(args.ConstructibleType) : null;
    const loc = plotOf(args);
    if (!def || !loc || !D.enabled || D.multiplayer || isMarked(loc)) return inner(cityID, type, args, ...rest);
    const accepts = () => !!safe(() => innerCan(cityID, type, args, false).Success, false);
    placeOrder({ loc, cityID, def }, () => inner(cityID, type, args, ...rest), accepts);
    return true;
  };
}

function wrapHost(host, type) {
  if (!host || typeof host.canStart !== "function" || typeof host.sendRequest !== "function") return;
  const saved = { host, canStart: host.canStart, sendRequest: host.sendRequest, canStartQuery: host.canStartQuery };
  const innerCan = saved.canStart.bind(host);
  host.canStart = wrapCanStart(innerCan, type);
  host.sendRequest = wrapSendRequest(saved.sendRequest.bind(host), host, type, innerCan);
  if (typeof saved.canStartQuery === "function") host.canStartQuery = wrapCanStartQuery(saved.canStartQuery.bind(host), host, type);
  state.originals.push(saved);
}

// --- install ------------------------------------------------------------------------------------------

function onTurn(d) { if (d && (d.player ?? d.Player) === D.localId()) setTimeout(syncSites, 3000); }
function onDamMoved(data) { if (data && D.types.includes(safe(() => String(GameInfo.Constructibles.lookup(data.constructibleType).ConstructibleType), ""))) setTimeout(syncSites, 2500); }

D = globalThis.__dams || null;
if (D && typeof D.damsOnMap === "function" && !D.syncSites) {
  if (!D.multiplayer) {
    wrapHost(safe(() => Game.CityOperations, null), safe(() => CityOperationTypes.BUILD, null));
    wrapHost(safe(() => Game.CityCommands, null), safe(() => CityCommandTypes.PURCHASE, null));
  }
  Object.assign(D, {
    syncSites, aiSites, damWorth, candidatePlots, markSite, unmarkSite, loadSites, riverFloods, guarded, aiMajors,
    thisAgesDam,
  });
  safe(() => engine.on("PlayerTurnActivated", onTurn));
  safe(() => engine.on("ConstructibleAddedToMap", onDamMoved));
  safe(() => engine.on("ConstructibleRemovedFromMap", onDamMoved));
  setTimeout(syncSites, 6000);
  log("Dam sites active");
} else if (!D) {
  log("ui/dams.js not loaded; no Dam sites");
}

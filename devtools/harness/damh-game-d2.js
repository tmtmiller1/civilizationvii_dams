// damh-game-d2.js - D2. Real floods (dam-flood-probe makes them ~300x per age, Catastrophic intensity): which tiles
// does a flood touch, and does a river whose floodplains are cleared stop flooding?
//   S0  river table: MapRivers.getRiver(id) {type,isFloodable,isFlooded}, plot count, floodplain count
//   S1  A/B: clear every floodplain on alternate floodable rivers ("dry"); on one more river clear only half
//       ("half"); re-read getRiver(id).isFloodable at once
//   S2  roll up to MAX_TURNS turns; log RandomEventOccurred / PlotEffectAddedToMap payloads and, after each roll,
//       every plot carrying PLOTEFFECT_FLOODED, classified by river, floodplain, bank, dry/half/control
//   S9  verdict: floods on dry vs control rivers; flooded tiles that were not floodplain; half-river split
//   REALISM=REALISM_SETTING_HEAVY SEED=9001 zsh run-harness.sh damh-game-d2.js d2 1200 floods
const TAG = "[DAM]";
const MAX_TURNS = 30;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function adj(loc, d) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[d]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), "?"); }
function riverType(l) { return safe(() => GameplayMap.getRiverType(l.x, l.y), "?"); }
function riverName(l) { return safe(() => Locale.compose(GameplayMap.getRiverName(l.x, l.y) || ""), ""); }
let FLOODED = null;
function hasFlood(i) { return safe(() => MapPlotEffects.hasPlotEffect(i, FLOODED), false) === true; }

const seen = { RandomEventOccurred: 0, PlotEffectAddedToMap: 0, PlotEffectRemovedFromMap: 0, UnitDamageChanged: 0, PlotYieldChanged: 0 };
const eventPlots = new Map(); // plot index -> first turn seen via PlotEffectAddedToMap
const occurred = [];
function hook() {
  for (const name of Object.keys(seen)) {
    safe(() => engine.on(name, (d) => {
      seen[name]++;
      if (name === "PlotEffectAddedToMap" && d && d.location) { const i = idxOf(d.location); if (!eventPlots.has(i)) eventPlots.set(i, Game.turn); }
      if (name === "RandomEventOccurred") occurred.push({ turn: Game.turn, type: safe(() => GameInfo.RandomEvents.lookup(d.eventType)?.RandomEventType, d.eventType), at: d.location });
      const cap = name === "PlotYieldChanged" ? 2 : 10;
      if (seen[name] <= cap) emit(`EV ${name} #${seen[name]} turn ${Game.turn} ${J(d).slice(0, 500)}`);
    }), null);
  }
}

function riverTable() {
  const n = safe(() => MapRivers.numRivers, 0);
  const count = typeof n === "function" ? safe(() => MapRivers.numRivers(), 0) : n;
  const rivers = [];
  for (let i = 0; i < count; i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const info = safe(() => MapRivers.getRiver(id), null) || {};
    const plots = safe(() => MapRivers.getRiverPlots(id), []) || [];
    const locs = plots.map((p) => (typeof p === "number" ? locOf(p) : p)).filter(Boolean);
    rivers.push({ i, id, info, locs, set: new Set(locs.map(idxOf)), fp: locs.filter(isFloodplain), name: locs[0] ? riverName(locs[0]) : "", nav: locs.filter((l) => safe(() => GameplayMap.isNavigableRiver(l.x, l.y), false)).length });
  }
  return rivers;
}
function row(r) { return { i: r.i, id: r.id, name: r.name, n: r.locs.length, nav: r.nav, fp: r.fp.length, floodable: safe(() => MapRivers.getRiver(r.id).isFloodable, "?"), flooded: safe(() => MapRivers.getRiver(r.id).isFlooded, "?") }; }

function clear(locs) {
  safe(() => { WorldBuilder.startBlock(); for (const l of locs) WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, l); WorldBuilder.endBlock(); });
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
  const realism = safe(() => Configuration.getGame().getValue("RealismSettingType"), "?");
  const freq = safe(() => GameInfo.RandomEventFrequencies.filter((f) => String(f.RandomEventType).includes("FLOOD")).map((f) => `${f.RandomEventType}/${f.RealismSettingType}=${f.OccurrencesPerAge}`), "?");
  emit(`S0 realism=${J(realism)} freq=${J(freq)} floodPercentChance=${J(safe(() => Game.RandomEvents.floodPercentChance, null))}`);
  hook();
  const rivers = riverTable();
  const floodable = rivers.filter((r) => safe(() => MapRivers.getRiver(r.id).isFloodable, false) === true);
  emit(`S0 rivers=${rivers.length} floodable=${floodable.length} withFloodplain=${rivers.filter((r) => r.fp.length).length} table(floodable or floodplain)=${J(rivers.filter((r) => r.fp.length || row(r).floodable === true).map(row))}`);
  // Does floodability track floodplains? rivers with floodplains that are not floodable, and the reverse.
  emit(`S0 floodable-without-floodplain=${J(floodable.filter((r) => !r.fp.length).map(row))} floodplain-not-floodable=${J(rivers.filter((r) => r.fp.length && row(r).floodable !== true).map(row))}`);
  // S1: dry / half / control
  const ranked = floodable.slice().sort((a, b) => b.fp.length - a.fp.length);
  const dry = [], control = [];
  ranked.forEach((r, k) => (k % 2 === 0 ? control : dry).push(r));
  const half = dry.length > 1 ? dry.pop() : null;
  for (const r of dry) clear(r.fp);
  const halfCleared = half ? half.fp.filter((_, k) => k % 2 === 0) : [];
  if (half) clear(halfCleared);
  await sleep(3000);
  emit(`S1 dry=${J(dry.map(row))}`);
  emit(`S1 half=${J(half && { ...row(half), cleared: halfCleared, kept: half.fp.filter((_, k) => k % 2 === 1) })}`);
  emit(`S1 control=${J(control.map(row))}`);
  const group = (i) => { for (const r of dry) if (r.set.has(i)) return "dry"; if (half && half.set.has(i)) return "half"; for (const r of control) if (r.set.has(i)) return "control"; return "other"; };
  const riverOf = (i) => rivers.find((r) => r.set.has(i)) || null;
  const originalFp = new Set(rivers.flatMap((r) => r.fp.map(idxOf)));
  const halfClearedSet = new Set(halfCleared.map(idxOf));
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const floodedEver = new Map(); // plot -> record
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const ok = await roll();
    let now = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = GameplayMap.getIndexFromXY(x, y);
      if (!hasFlood(i)) continue;
      now++;
      if (floodedEver.has(i)) continue;
      const l = { x, y }; const r = riverOf(i);
      const bankOf = r ? null : rivers.find((rv) => RING.some((d, k) => { const n = adj(l, k); return n && rv.set.has(idxOf(n)); }));
      floodedEver.set(i, { ...l, turn: Game.turn, onRiver: r ? r.i : null, bankOf: bankOf ? bankOf.i : null, group: group(i), wasFloodplain: originalFp.has(i), feature: featureName(l), halfCleared: halfClearedSet.has(i), riverTile: riverType(l) !== RiverTypes.NO_RIVER });
    }
    emit(`S2 turn ${Game.turn} rolled=${ok} floodedNow=${now} floodedEver=${floodedEver.size} events=${J(seen)} chance=${J(safe(() => Game.RandomEvents.floodPercentChance, null))} riversFlooded=${J(rivers.filter((r) => safe(() => MapRivers.getRiver(r.id).isFlooded, false) === true).map((r) => `${r.i}:${group([...r.set][0])}`))}`);
    if (!ok) break;
    if (occurred.length >= 12 && turn >= 8) break;
  }
  const all = [...floodedEver.values()];
  const by = (k) => all.reduce((m, h) => { m[h[k]] = (m[h[k]] || 0) + 1; return m; }, {});
  emit(`S3 occurred=${J(occurred.slice(0, 30))}`);
  emit(`S3 flooded tiles ${all.length} byGroup=${J(by("group"))} wasFloodplain=${J(by("wasFloodplain"))} riverTile=${J(by("riverTile"))} bankOnly=${all.filter((h) => h.onRiver === null).length}`);
  emit(`S3 not-floodplain flooded (sample)=${J(all.filter((h) => !h.wasFloodplain).slice(0, 20))}`);
  const halfHits = all.filter((h) => h.group === "half");
  emit(`S3 half river: clearedFlooded=${halfHits.filter((h) => h.halfCleared).length}/${halfCleared.length} keptFlooded=${halfHits.filter((h) => !h.halfCleared && h.wasFloodplain).length}/${half ? half.fp.length - halfCleared.length : 0}`);
  emit(`S3 rivers after ${J([...dry, ...(half ? [half] : []), ...control].map(row))}`);
  const dryHits = all.filter((h) => h.group === "dry").length, ctlHits = all.filter((h) => h.group === "control").length;
  finishNow(`floods=${occurred.length} tiles=${all.length} dryRivers=${dry.length} dryTiles=${dryHits} controlRivers=${control.length} controlTiles=${ctlHits} nonFloodplainTiles=${all.filter((h) => !h.wasFloodplain).length}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d2 finished"), 4000); }
emit("attached d2");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

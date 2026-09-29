// damh-game-d1.js - D1. What does a flood touch, can a script start one, and does clearing a floodplain make a tile
// unfloodable? Answers the three questions the per-river Dam design waits on (docs/DESIGN.md, "Probe ladder"):
//   S0  the script surface: members of Game.RandomEvents, MapRivers, MapPlotEffects, WorldBuilder.MapPlots
//   S1  survey: floodplain plots vs MapRivers.isFloodable, river tiles vs their banks, the river index
//   S2  engine events a flood raises (RandomEventOccurred, PlotEffectAddedToMap, ...), payloads logged
//   S3  force a flood on the river with the most floodable plots through Game.RandomEvents.applyEvent (several
//       argument shapes; one turn roll if none lands at once), then record the flooded footprint
//   S4  clear the floodplain feature on half of a second river's floodplains; re-read isFloodable on cleared vs
//       control plots; force a flood there too and see whether the cleared plots flood
//   S5  removePlotEffect on one flooded plot (a cosmetic lever, if it works)
//   SEED=9001 zsh run-harness.sh damh-game-d1.js d1 600
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
let local = -1;
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function adj(loc, d) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[d]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
function members(o) {
  if (!o) return null;
  const out = new Set();
  for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor") out.add(k);
  return [...out].sort();
}
function featureName(l) { return safe(() => String(GameInfo.Features.lookup(GameplayMap.getFeatureType(l.x, l.y))?.FeatureType || ""), "?"); }
function isFloodplain(l) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function riverType(l) { return safe(() => GameplayMap.getRiverType(l.x, l.y), "?"); }
function riverName(l) { return safe(() => Locale.compose(GameplayMap.getRiverName(l.x, l.y) || ""), ""); }

// isFloodable / isFlooded take an unknown argument shape: pick the first that answers true on some floodplain.
let floodableCall = null, floodedCall = null;
const SHAPES = [["index", (f, l) => f(idxOf(l))], ["xy", (f, l) => f(l.x, l.y)], ["loc", (f, l) => f({ x: l.x, y: l.y })]];
function resolveCall(name, sample) {
  const f = MapRivers && MapRivers[name] && MapRivers[name].bind(MapRivers);
  if (!f) return { chosen: null, tried: "missing" };
  const tried = {};
  for (const [label, call] of SHAPES) {
    let trues = 0, errs = 0;
    for (const l of sample) { const r = safe(() => call(f, l), "ERR"); if (r === true) trues++; else if (typeof r === "string" && r.startsWith("ERR")) errs++; }
    tried[label] = { trues, errs };
    if (trues > 0) return { chosen: (l) => safe(() => call(f, l), null), label, tried };
  }
  return { chosen: (l) => safe(() => SHAPES[0][1](f, l), null), label: "index(default)", tried };
}
function floodable(l) { return floodableCall ? floodableCall(l) : null; }
function flooded(l) { return floodedCall ? floodedCall(l) : null; }
let floodedEffect = null;
function hasFloodEffect(l) {
  if (!floodedEffect) return null;
  return safe(() => MapPlotEffects.hasPlotEffect(idxOf(l), floodedEffect), null);
}

// S2: engine events, counted and the first payloads logged.
const EVENTS = ["RandomEventOccurred", "PlotEffectAddedToMap", "PlotEffectRemovedFromMap", "PlotYieldChanged", "FeatureChanged", "FeatureRemovedFromMap", "ConstructibleChanged", "UnitDamageChanged", "NotificationAdded"];
const seen = {};
const floodedFromEvents = new Set();
function hook() {
  for (const name of EVENTS) {
    seen[name] = 0;
    safe(() => engine.on(name, (d) => {
      seen[name]++;
      if (name === "PlotEffectAddedToMap" && d && d.location) floodedFromEvents.add(idxOf(d.location));
      if (seen[name] <= 8) emit(`EV ${name} #${seen[name]} ${J(d).slice(0, 600)}`);
    }), null);
  }
}

function survey() {
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const fp = [], riverTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = { x, y };
    if (isFloodplain(l)) fp.push(l);
    const rt = riverType(l);
    if (typeof rt === "number" && rt !== RiverTypes.NO_RIVER) riverTiles.push(l);
  }
  const fc = resolveCall("isFloodable", fp.slice(0, 60)); floodableCall = fc.chosen;
  const fd = resolveCall("isFlooded", fp.slice(0, 60)); floodedCall = fd.chosen;
  emit(`S1 map ${W}x${H} floodplains=${fp.length} riverTiles=${riverTiles.length} isFloodable via ${fc.label} ${J(fc.tried)} isFlooded via ${fd.label} ${J(fd.tried)}`);
  // Where is "floodable" true? floodplain or not, river tile or bank.
  const cells = { fpRiver: 0, fpNoRiver: 0, fpFloodable: 0, fpNotFloodable: 0, floodableNotFp: 0, floodableNotFpOnRiver: 0, floodableNotFpBank: 0 };
  const fpSet = new Set(fp.map(idxOf));
  for (const l of fp) {
    const onRiver = riverType(l) !== RiverTypes.NO_RIVER;
    onRiver ? cells.fpRiver++ : cells.fpNoRiver++;
    floodable(l) === true ? cells.fpFloodable++ : cells.fpNotFloodable++;
  }
  const odd = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = { x, y };
    if (fpSet.has(idxOf(l)) || floodable(l) !== true) continue;
    cells.floodableNotFp++;
    if (riverType(l) !== RiverTypes.NO_RIVER) cells.floodableNotFpOnRiver++; else cells.floodableNotFpBank++;
    if (odd.length < 12) odd.push({ ...l, feature: featureName(l), river: riverType(l), adjRiver: safe(() => GameplayMap.isAdjacentToRivers(x, y, 1), "?") });
  }
  emit(`S1 cells ${J(cells)} floodableButNotFloodplain(sample)=${J(odd)}`);
  const fpNoRiver = fp.filter((l) => riverType(l) === RiverTypes.NO_RIVER).slice(0, 8).map((l) => ({ ...l, feature: featureName(l), adjRiver: safe(() => GameplayMap.isAdjacentToRivers(l.x, l.y, 1), "?") }));
  if (fpNoRiver.length) emit(`S1 floodplains off the river (sample) ${J(fpNoRiver)}`);
  // The river index.
  const rivers = [];
  const n = safe(() => MapRivers.numRivers, 0);
  const nRivers = typeof n === "function" ? safe(() => MapRivers.numRivers(), 0) : n;
  for (let i = 0; i < nRivers; i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const type = safe(() => MapRivers.getRiverTypeByIndex(i), null);
    let plots = safe(() => MapRivers.getRiverPlots(id), null);
    if (!Array.isArray(plots) || plots.length === 0) plots = safe(() => MapRivers.getRiverPlots(i), plots);
    const list = Array.isArray(plots) ? plots : [];
    const locs = list.map((p) => (typeof p === "number" ? locOf(p) : p));
    const fl = locs.filter((l) => l && floodable(l) === true).length;
    const fpc = locs.filter((l) => l && isFloodplain(l)).length;
    rivers.push({ i, id, type, n: locs.length, floodable: fl, floodplain: fpc, name: locs[0] ? riverName(locs[0]) : "", locs });
  }
  emit(`S1 rivers=${nRivers} first getRiver=${J(safe(() => MapRivers.getRiver(rivers[0] && rivers[0].id), null)).slice(0, 400)}`);
  emit(`S1 river table ${J(rivers.map(({ locs, ...r }) => r).sort((a, b) => b.floodable - a.floodable).slice(0, 12))}`);
  return { fp, rivers };
}

async function forceFlood(river, label) {
  const RE = Game.RandomEvents;
  const evs = ["RANDOM_EVENT_FLOOD_MAJOR", "RANDOM_EVENT_FLOOD_MODERATE"].map((t) => GameInfo.RandomEvents.lookup(t)).filter(Boolean);
  const before = { occurred: seen.RandomEventOccurred, added: seen.PlotEffectAddedToMap };
  const tries = [];
  for (const ev of evs) for (const rv of [river.id, river.i]) for (const ty of [ev.$hash, ev.$index]) {
    tries.push({ type: ty, river: rv });
    tries.push({ type: ty, river: rv, volcano: -1, targetValue: 1 });
    tries.push({ eventType: ty, river: rv });
  }
  for (const a of tries) {
    const r = safe(() => RE.applyEvent(a), "ERR");
    await sleep(2500);
    const landed = seen.RandomEventOccurred > before.occurred || seen.PlotEffectAddedToMap > before.added || river.locs.some((l) => flooded(l) === true || hasFloodEffect(l) === true);
    emit(`${label} applyEvent(${J(a)}) -> ${J(r)} landed=${landed}`);
    if (landed) return { how: a, turnRoll: false };
  }
  emit(`${label} nothing landed at once; rolling one turn`);
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now(); const turn0 = Game.turn;
  while (Game.turn === turn0 && Date.now() - t0 < 60000) await sleep(1000);
  await sleep(4000);
  const landed = seen.RandomEventOccurred > before.occurred || river.locs.some((l) => flooded(l) === true || hasFloodEffect(l) === true);
  emit(`${label} after the roll (turn ${turn0} -> ${Game.turn}) landed=${landed}`);
  return landed ? { how: "queued-until-turn", turnRoll: true } : null;
}

function footprint(river, fpSet, label) {
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const riverSet = new Set(river.locs.map(idxOf));
  const hit = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = { x, y };
    const on = flooded(l) === true || hasFloodEffect(l) === true || floodedFromEvents.has(idxOf(l));
    if (!on) continue;
    const bank = !riverSet.has(idxOf(l)) && RING.some((d, i) => { const n = adj(l, i); return n && riverSet.has(idxOf(n)); });
    hit.push({ ...l, onThisRiver: riverSet.has(idxOf(l)), bank, floodplain: fpSet.has(idxOf(l)), feature: featureName(l), riverName: riverName(l) });
  }
  const s = { total: hit.length, onThisRiver: hit.filter((h) => h.onThisRiver).length, bank: hit.filter((h) => h.bank).length, elsewhere: hit.filter((h) => !h.onThisRiver && !h.bank).length, notFloodplain: hit.filter((h) => !h.floodplain).length };
  emit(`${label} footprint ${J(s)} riverFloodable=${river.floodable} sample=${J(hit.slice(0, 20))}`);
  return hit;
}

async function run() {
  local = GameContext.localPlayerID;
  emit(`S0 Game.RandomEvents=${J(members(safe(() => Game.RandomEvents, null)))}`);
  emit(`S0 RandomEvents props floodPercentChance=${J(safe(() => Game.RandomEvents.floodPercentChance, null))} eruption=${J(safe(() => Game.RandomEvents.eruptionPercentChance, null))} storm=${J(safe(() => Game.RandomEvents.stormPercentChance, null))}`);
  emit(`S0 MapRivers=${J(members(safe(() => MapRivers, null)))}`);
  emit(`S0 MapPlotEffects=${J(members(safe(() => MapPlotEffects, null)))}`);
  emit(`S0 WorldBuilder.MapPlots=${J(members(safe(() => WorldBuilder.MapPlots, null)))}`);
  const pe = safe(() => GameInfo.PlotEffects.lookup("PLOTEFFECT_FLOODED"), null);
  floodedEffect = pe ? pe.$index : null;
  emit(`S0 PLOTEFFECT_FLOODED index=${pe && pe.$index} hash=${pe && pe.$hash}`);
  hook();
  const { fp, rivers } = survey();
  const fpSet = new Set(fp.map(idxOf));
  const ranked = rivers.filter((r) => r.floodable > 0 || r.floodplain > 0).sort((a, b) => (b.floodable - a.floodable) || (b.floodplain - a.floodplain));
  if (ranked.length < 1) return finishNow("no river with floodable or floodplain plots on this seed");
  // S3: force a flood on the best river.
  const R1 = ranked[0];
  emit(`S3 target river i=${R1.i} id=${R1.id} name=${R1.name} plots=${R1.n} floodable=${R1.floodable} floodplain=${R1.floodplain}`);
  const f1 = await forceFlood(R1, "S3");
  const hit1 = f1 ? footprint(R1, fpSet, "S3") : [];
  // S4: clear half of a second river's floodplains, compare isFloodable, then flood it.
  const R2 = ranked.find((r) => r !== R1 && r.floodplain >= 4) || null;
  let s4 = "skipped (no second river with 4+ floodplains)";
  if (R2) {
    const fpl = R2.locs.filter((l) => fpSet.has(idxOf(l)));
    const cleared = fpl.filter((_, k) => k % 2 === 0), control = fpl.filter((_, k) => k % 2 === 1);
    const pre = { cleared: cleared.map((l) => floodable(l)), control: control.map((l) => floodable(l)) };
    safe(() => { WorldBuilder.startBlock(); for (const l of cleared) WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, l); WorldBuilder.endBlock(); });
    await sleep(3000);
    const post = { clearedFeature: cleared.map(featureName), cleared: cleared.map((l) => floodable(l)), control: control.map((l) => floodable(l)) };
    emit(`S4 river i=${R2.i} name=${R2.name} cleared=${J(cleared)} pre=${J(pre)} post=${J(post)}`);
    const f2 = await forceFlood(R2, "S4");
    if (f2) {
      const hit2 = footprint(R2, fpSet, "S4");
      const hitSet = new Set(hit2.map(idxOf));
      const cHit = cleared.filter((l) => hitSet.has(idxOf(l))).length, kHit = control.filter((l) => hitSet.has(idxOf(l))).length;
      s4 = `clearedFlooded=${cHit}/${cleared.length} controlFlooded=${kHit}/${control.length} floodableAfterClear=${post.cleared.filter((v) => v === true).length}/${cleared.length}`;
    } else s4 = `no flood landed; floodableAfterClear=${post.cleared.filter((v) => v === true).length}/${cleared.length} control=${post.control.filter((v) => v === true).length}/${control.length}`;
    emit(`S4 ${s4}`);
  }
  // S5: removePlotEffect on one flooded plot.
  if (hit1.length && floodedEffect !== null) {
    const l = hit1[0];
    const r = safe(() => MapPlotEffects.removePlotEffect(idxOf(l), floodedEffect), "ERR");
    await sleep(2000);
    emit(`S5 removePlotEffect(${J(l)}) -> ${J(r)} stillFlooded=${J({ effect: hasFloodEffect(l), isFlooded: flooded(l) })}`);
  }
  emit(`S6 events seen ${J(seen)}`);
  finishNow(`trigger=${J(f1 && f1.how)} S3footprint=${hit1.length} S4 ${s4}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d1 finished"), 4000); }
emit("attached d1");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

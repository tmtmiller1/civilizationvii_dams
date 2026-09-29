// damh-game-d5.js - D5. The mod's protection end to end, under floods that pillage everything they reach
// (dam-flood-probe: floods ~300x per age, CONSTRUCTIBLE_DAMAGED 100 %).
//   S0  roll until the AI has settled; every city's floodplain tiles within 4 bought for it; farms on bare ones
//   S1  a Dam placed (CREATE_ELEMENT, as its owner) on the river of the city with most floodplain tiles ("dammed");
//       the mod's sweep must put a Levee in every city on that river; a city on another river is the control
//   S2  roll up to MAX_TURNS; per flood, the engine's own log (Game_RandomEvents.csv, collected by the harness) and
//       the farms' pillaged state
//   S9  verdict: pillaged farms on the dammed river vs the control
//   SEED=9001 zsh run-harness.sh damh-game-d5.js d5 1500 mod+floods
const TAG = "[DAM]";
const MAX_TURNS = 30;
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(x, y) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(x, y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), damaged: safe(() => inst.damaged, "?"), complete: safe(() => inst.complete, "?") }; }), []); }
function owningCity(x, y) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(x, y); return c && c.owner >= 0 ? `${c.owner}:${c.id}` : null; }, null); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
async function run() {
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version} damDef=${!!GameInfo.Constructibles.lookup("BUILDING_DAM_ANTIQUITY")} levee=${!!GameInfo.Constructibles.lookup("BUILDING_DAM_LEVEE")} immunity=${J(["MOD_DAMS_DAM_ANTIQUITY_FLOOD_IMMUNITY", "MOD_DAMS_LEVEE_FLOOD_IMMUNITY"].map((m) => !!safe(() => GameInfo.Modifiers.lookup(m), null)))}`);
  if (!M) return finishNow("mod not active");
  const local = GameContext.localPlayerID;
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 6; k++) await roll();
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const fp = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloodplain(x, y)) fp.push({ x, y });
  const cities = [];
  for (const p of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    const near = fp.filter((l) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, l.x, l.y), 99) <= 4);
    if (!near.length) continue;
    for (const l of near) if (!owningCity(l.x, l.y)) safe(() => c.purchasePlot({ x: l.x, y: l.y }));
    cities.push({ key: `${cid.owner}:${cid.id}`, cid, owner: p.id, name: safe(() => Locale.compose(c.name), "?"), at: { x: c.location.x, y: c.location.y }, near });
  }
  await sleep(3000);
  for (const c of cities) {
    c.owned = c.near.filter((l) => owningCity(l.x, l.y) === c.key);
    c.rivers = [...new Set(c.owned.map((l) => M.riverAt(l)).filter((r) => r != null))];
    for (const l of c.owned) if (!occupants(l).length) {
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.cid, Owner: c.owner }));
      await sleep(800);
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_FARM", Location: { x: l.x, y: l.y }, Owner: c.owner }));
    }
  }
  await sleep(3000);
  const withLand = cities.filter((c) => c.owned.length).sort((a, b) => b.owned.length - a.owned.length);
  emit(`S0 turn ${Game.turn} cities=${J(withLand.map((c) => ({ key: c.key, name: c.name, rivers: c.rivers, tiles: c.owned.map((l) => ({ ...l, holds: occupants(l).map((o) => o.type) })) })))}`);
  const dammedCity = withLand[0];
  if (!dammedCity || !dammedCity.rivers.length) return finishNow("no city with floodplain river tiles");
  const river = dammedCity.rivers[0];
  // The Dam goes on a tile of that river the farms do not use, if there is one.
  const farmSet = new Set(withLand.flatMap((c) => c.owned.map(idxOf)));
  const riverPlots = (safe(() => MapRivers.getRiverPlots(river), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p));
  const site = riverPlots.find((l) => owningCity(l.x, l.y) === dammedCity.key && !farmSet.has(idxOf(l))) || riverPlots.find((l) => owningCity(l.x, l.y) === dammedCity.key) || riverPlots[0];
  safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "BUILDING_DAM_ANTIQUITY", Location: site, Owner: dammedCity.owner }));
  await sleep(3000);
  safe(() => M.sweep());
  await sleep(3000);
  const onRiver = M.citiesOnRiver(river).map((c) => c.key);
  const control = withLand.filter((c) => !c.rivers.includes(river) && !onRiver.includes(c.key));
  emit(`S1 dam at ${J(site)} holds=${J(occupants(site))} river=${river} citiesOnRiver=${J(onRiver)} levees=${J(M.citiesOnRiver(river).map((c) => ({ key: c.key, center: occupants(c.center).map((o) => o.type) })))} damsOnMap=${J(M.damsOnMap().map((d) => ({ plot: d.plot, river: d.river, complete: d.complete })))} control=${J(control.map((c) => c.key))}`);
  const group = (key) => (onRiver.includes(key) ? "dammed" : control.some((c) => c.key === key) ? "control" : "other");
  for (let t = 0; t < MAX_TURNS; t++) { const ok = await roll(); if (!ok) break; if (t % 5 === 4) emit(`S2 turn ${Game.turn}`); }
  const farms = withLand.flatMap((c) => c.owned.map((l) => ({ ...l, city: c.key, group: group(c.key), holds: occupants(l) })));
  const tally = farms.reduce((m, f) => { const g = (m[f.group] = m[f.group] || { tiles: 0, improved: 0, pillaged: 0 }); g.tiles++; const imp = f.holds.filter((o) => o.type.startsWith("IMPROVEMENT_")); if (imp.length) g.improved++; if (f.holds.some((o) => o.damaged === true)) g.pillaged++; return m; }, {});
  emit(`S3 farms=${J(farms)}`);
  emit(`S3 levees at the end=${J(M.citiesOnRiver(river).map((c) => ({ key: c.key, center: occupants(c.center).map((o) => o.type) })))}`);
  finishNow(`river=${river} tally=${J(tally)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d5 finished"), 4000); }
emit("attached d5");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

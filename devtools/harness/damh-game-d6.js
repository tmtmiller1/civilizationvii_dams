// damh-game-d6.js - D6. D4 again where it fell short: an Exploration start (seed 9001 gives Roma a navigable
// estuary), the production panel captured BEFORE the Dam is built (after it, the river is taken and the row goes),
// and the candidate meshes drawn at a smaller scale on the capital's own visible river tiles, camera close.
//   S0  defs and icon URL; found the local capital
//   S1  where the production screen offers BUILDING_DAM_ANTIQUITY (RiverPlacement=RIVER): plots classified by river
//       type (minor, navigable, none); river tiles near the capital bought first so both kinds are in reach
//   S2  BUILD a Dam on a minor-river tile (and one on a navigable tile when offered); complete it; completion event
//   S3  candidate meshes drawn across a river, four per frame, perpendicular to the flow
//   S4  the production panel with the Dam row (icon)
//   START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-d6.js d6 1500 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST", "DIRECTION_NORTHWEST", "DIRECTION_NORTHEAST"];
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function adj(loc, d) { const n = safe(() => GameplayMap.getAdjacentPlotLocation(loc, DirectionTypes[RING[d]]), null); return n && n.x >= 0 ? { x: n.x, y: n.y } : null; }
function armAngle(k) { return (360 - 60 * k) % 360; }
function riverKind(l) { const t = safe(() => GameplayMap.getRiverType(l.x, l.y), -1); return t === RiverTypes.RIVER_NAVIGABLE ? "navigable" : t === RiverTypes.RIVER_MINOR ? "minor" : "none"; }
function districtAt(l) { return safe(() => { const d = Districts.getAtLocation(l); return d ? String(GameInfo.Districts.lookup(d.type)?.DistrictType) : ""; }, "?"); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), complete: safe(() => inst.complete, "?") }; }), []); }
let AIM = null;
async function look(loc, zoom) { AIM = { loc, zoom }; safe(() => Camera.lookAtPlot(loc, { zoom })); await sleep(2500); }
async function shot(name) { if (AIM) { safe(() => Camera.lookAtPlot(AIM.loc, { zoom: AIM.zoom })); await sleep(2500); } await sleep(4000); emit("SHOT " + name); await sleep(50000); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
}
const completed = [];
function riverIndex() {
  const byPlot = new Map(), rivers = new Map();
  const n = safe(() => MapRivers.numRivers, 0);
  for (let i = 0; i < n; i++) {
    const id = safe(() => MapRivers.getRiverIDByIndex(i), null);
    const plots = (safe(() => MapRivers.getRiverPlots(id), []) || []).map((p) => (typeof p === "number" ? p : idxOf(p)));
    rivers.set(id, plots);
    for (const p of plots) byPlot.set(p, id);
  }
  return { byPlot, rivers };
}
function flowSides(loc, set) { const out = []; for (let k = 0; k < 6; k++) { const n = adj(loc, k); if (n && set.has(idxOf(n))) out.push(k); } return out; }

async function foundCapital(local) {
  const p = Players.get(local);
  if (safe(() => p.Cities.getCityIds().length, 0) > 0) return true;
  for (const id of safe(() => p.Units.getUnitIds(), []) || []) {
    const u = safe(() => Units.get(id), null);
    if (!u || !/SETTLER|FOUNDER/.test(String(safe(() => GameInfo.Units.lookup(u.type).UnitType, "")))) continue;
    const can = safe(() => Game.UnitOperations.canStart(id, UnitOperationTypes.FOUND_CITY, {}, false), null);
    safe(() => Game.UnitOperations.sendRequest(id, UnitOperationTypes.FOUND_CITY, {}));
    for (let k = 0; k < 20 && safe(() => p.Cities.getCityIds().length, 0) === 0; k++) await sleep(500);
    emit(`S0 found city with settler ${J(id)} canStart=${J(can && can.Success)} cities=${safe(() => p.Cities.getCityIds().length, 0)}`);
    return safe(() => p.Cities.getCityIds().length, 0) > 0;
  }
  return false;
}

function offered(cid, def) {
  const r = safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index }, false), null);
  if (!r) return { success: null };
  const cls = (a) => (Array.isArray(a) ? a.map(locOf).map((l) => ({ ...l, river: riverKind(l), district: districtAt(l) })) : []);
  return { success: r.Success, reasons: r.FailureReasons, plots: cls(r.Plots), expand: cls(r.ExpandUrbanPlots) };
}

async function buildAt(cid, def, l, label) {
  safe(() => Game.CityOperations.sendRequest(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }));
  let queued = false; const t0 = Date.now();
  while (!queued && Date.now() - t0 < 12000) { await sleep(300); queued = occupants(l).some((o) => o.type === def.ConstructibleType); }
  if (!queued) { emit(`S2 ${label} ${J(l)} not queued; plot verdict ${J(safe(() => Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }, false), null))}`); return false; }
  safe(() => Cities.get(cid).BuildQueue.addProgress(5000));
  let done = false; const t1 = Date.now();
  while (!done && Date.now() - t1 < 30000) { await sleep(800); done = occupants(l).some((o) => o.type === def.ConstructibleType && o.complete === true); }
  emit(`S2 ${label} ${J(l)} river=${riverKind(l)} queued=${queued} complete=${done} district=${districtAt(l)} holds=${J(occupants(l))} completionEvents=${J(completed.filter((c) => c.x === l.x && c.y === l.y))}`);
  return done;
}

const CANDIDATES = [
  "IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", "IMPROVEMENT_MING_GREAT_WALL_RIVER_STRAIGHT", "HAN_Great_Wall_River_Arch", "Great_Wall_River_Arch",
  "City_Wall_Single_Side", "MOD_Bridge_Stone_A", "MED_CRT_Dockyard_Gate_HB", "NEU_NOR_Gristmill_WaterWheel",
  "IMPROVEMENT_Highland_Power_Station_E_W", "Highland_Power_Station_Grassland_Mountain", "IMP_Saqiya_Building_A_Wheel", "IMP_Saqiya_Canal_Decal_Straight_A",
];

async function drawCandidates(chain, set) {
  if (typeof WorldUI === "undefined" || typeof PlacementMode === "undefined") { emit("S3 no WorldUI"); return; }
  for (let b = 0; b < CANDIDATES.length; b += 4) {
    const batch = CANDIDATES.slice(b, b + 4);
    const group = safe(() => WorldUI.createModelGroup("DamProbe_" + b), null);
    const placed = [];
    batch.forEach((asset, k) => {
      const l = chain[k % chain.length];
      const sides = flowSides(l, set);
      const across = ((sides.length ? armAngle(sides[0]) : 0) + 90) % 360;
      const r = safe(() => group.addModelAtPlot(asset, { i: l.x, j: l.y }, { x: 0, y: 0, z: 0 }, { placement: PlacementMode.TERRAIN, followTerrain: true, needsShadows: true, scale: 0.55, angle: across }), "ERR");
      placed.push({ asset, at: l, sides, angle: across, r });
    });
    emit(`S3 batch ${b / 4} ${J(placed)}`);
    await look(chain[1] || chain[0], 0.08);
    await shot(`d6-mesh-${b / 4}`);
    safe(() => group.clear()); safe(() => group.destroy());
  }
}

const IM = safe(() => InterfaceMode, null);
function mode() { return safe(() => IM.getCurrent(), "?"); }
function panelEl() { return document.querySelector("panel-production-chooser"); }
function categories() { return Array.from(document.querySelectorAll(".production-category")); }
function items() { return Array.from(document.querySelectorAll("production-chooser-item")); }
function panelReady() { return categories().length > 0; }
/** Press Continue / Close on whatever cinematic or popup is up (copied from the canals harness, c41). */
async function clearScreens(label) {
  for (let k = 0; k < 15; k++) {
    const m = mode();
    const buttons = Array.from(document.querySelectorAll("fxs-button, fxs-hero-button, fxs-close-button")).filter((b) => safe(() => b.getBoundingClientRect().width > 0, false));
    const hit = buttons.find((b) => /continue|close|LOC_WONDER_MOVIE|LOC_GENERIC_(CONTINUE|OK|CLOSE)/i.test(String(b.getAttribute("caption") || "") + " " + String(b.textContent || "")));
    if (m !== "INTERFACEMODE_CINEMATIC" && !hit) { emit(`CLEAR ${label} clean after ${k} (mode=${m})`); return; }
    if (hit) hit.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); else safe(() => IM.switchTo("INTERFACEMODE_DEFAULT"));
    await sleep(2500);
  }
  emit(`CLEAR ${label} gave up mode=${mode()}`);
}
/** The game's own route into the production panel (canals harness c41), then the Dam's row. */
async function openPanel(cid, damType) {
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT")); await sleep(1500);
  try { const m = await import("/base-standard/ui/production-chooser/panel-production-chooser.js"); if (m && m.ProductionChooserScreen) m.ProductionChooserScreen.shouldReturnToPurchase = false; } catch (e) { emit(`S4 import ${e}`); }
  safe(() => UI.Player.selectCity(cid)); await sleep(1200);
  for (let a = 0; a < 4 && !panelReady(); a++) { safe(() => IM.switchTo("INTERFACEMODE_CITY_PRODUCTION", { CityID: cid })); for (let k = 0; k < 30 && !panelReady(); k++) await sleep(500); }
  const bcat = document.querySelector("#production-category-buildings");
  const visible = () => items().filter((e) => safe(() => e.getBoundingClientRect().height > 0, false));
  if (bcat && !visible().length) { const h = bcat.querySelector("fxs-activatable"); if (h) h.dispatchEvent(new CustomEvent("action-activate", { bubbles: true })); await sleep(2500); }
  const types = items().map((e) => String(e.getAttribute("data-type") || "?"));
  const row = items().find((e) => String(e.getAttribute("data-type") || "") === damType);
  const ic = row && row.querySelector('[data-name="Icon"]');
  emit(`S4 panel ready=${panelReady()} mode=${mode()} types=${J(types)} damRow=${!!row} leveeRow=${types.includes("BUILDING_DAM_LEVEE")} name=${J(row && safe(() => Locale.compose(row.getAttribute("data-name")), "?"))} iconBg=${J(ic ? safe(() => getComputedStyle(ic).backgroundImage, "?") : "-")}`);
  if (row) { safe(() => row.scrollIntoView()); await sleep(1500); }
}

async function run() {
  const local = GameContext.localPlayerID;
  const AGE = safe(() => String(GameInfo.Ages.lookup(Game.age).AgeType), "AGE_ANTIQUITY");
  const def = GameInfo.Constructibles.lookup("BUILDING_DAM_" + AGE.replace("AGE_", ""));
  emit(`S0 age=${AGE} dam=${def && def.ConstructibleType} defs=${J(["BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"].map((t) => !!GameInfo.Constructibles.lookup(t)))} riverPlacement=${def && def.RiverPlacement} iconURL=${J(safe(() => UI.getIconURL("BUILDING_DAM_ANTIQUITY"), "?"))} modActive=${J(safe(() => globalThis.__dams && globalThis.__dams.version, null))}`);
  safe(() => engine.on("ConstructibleBuildCompleted", (d) => completed.push({ x: d.location.x, y: d.location.y, type: safe(() => GameInfo.Constructibles.lookup(d.constructibleType).ConstructibleType, d.constructibleType) })));
  await clearScreens("start");
  if (!(await foundCapital(local))) return finishNow("no capital");
  await sleep(2000);
  const cid = Players.get(local).Cities.getCityIds()[0]; const city = Cities.get(cid); const C = city.location;
  const { byPlot, rivers } = riverIndex();
  const near = [];
  for (const [p] of byPlot) { const l = locOf(p); const d = safe(() => GameplayMap.getPlotDistance(C.x, C.y, l.x, l.y), 99); if (d <= 3) near.push({ ...l, d, river: riverKind(l) }); }
  emit(`S1 capital ${J(C)} riverTilesWithin3=${J(near)}`);
  for (const l of near) if (!safe(() => GameplayMap.getOwningCityFromXY(l.x, l.y), null)) safe(() => city.purchasePlot({ x: l.x, y: l.y }));
  await sleep(2500);
  const o = offered(cid, def);
  const kinds = (a) => a.reduce((m, p) => { m[p.river] = (m[p.river] || 0) + 1; return m; }, {});
  emit(`S1 offered success=${o.success} reasons=${J(o.reasons)} plots=${J(kinds(o.plots || []))} expand=${J(kinds(o.expand || []))} list=${J([...(o.plots || []), ...(o.expand || [])])}`);
  const query = safe(() => Game.CityOperations.canStartQuery(cid, CityOperationTypes.BUILD, CityQueryType.Constructible), null);
  emit(`S1 canStartQuery has Dam row=${J(Array.isArray(query) ? query.filter((e) => e && e.index === def.$index).map((e) => ({ success: e.result && e.result.Success, reasons: e.result && e.result.FailureReasons })) : "?")}`);
  const pq = safe(() => Game.CityCommands.canStartQuery(cid, CityCommandTypes.PURCHASE, CityQueryType.Constructible), null);
  emit(`S1 purchase canStartQuery Dam row=${J(Array.isArray(pq) ? pq.filter((e) => e && e.index === def.$index).map((e) => ({ success: e.result && e.result.Success, reasons: e.result && e.result.FailureReasons, plots: e.result && e.result.Plots && e.result.Plots.length })) : "?")}`);
  await openPanel(cid, def.ConstructibleType);
  await sleep(2000);
  AIM = null; await shot("d6-panel");
  safe(() => IM.switchTo("INTERFACEMODE_DEFAULT")); await sleep(1500);
  const all = [...(o.plots || []), ...(o.expand || [])];
  const minor = all.find((p) => p.river === "minor"), nav = all.find((p) => p.river === "navigable");
  // Navigable first: it is the case D4 could not reach. A second Dam on the same river must be refused.
  if (nav) { await look(nav, 0.08); await buildAt(cid, def, nav, "navigable"); await shot("d6-built-navigable"); }
  if (minor) { await look(minor, 0.08); await buildAt(cid, def, minor, "minor"); await shot("d6-built-minor"); }
  if (!minor && !nav) emit("S2 no river tile offered; nothing built");
  // The mod's rules after a real build: the Levees, and one Dam per river.
  const M = globalThis.__dams;
  if (M && (minor || nav)) {
    safe(() => M.sweep()); await sleep(3000);
    const built = M.damsOnMap();
    for (const d of built) {
      const others = (rivers.get(d.river) || []).map(locOf).filter((l) => idxOf(l) !== d.plot);
      const verdicts = others.slice(0, 3).map((l) => ({ ...l, v: safe(() => { const r = Game.CityOperations.canStart(cid, CityOperationTypes.BUILD, { ConstructibleType: def.$index, X: l.x, Y: l.y }, false); return { ok: r.Success, why: r.FailureReasons }; }, "?") }));
      emit(`S2 rule dam ${J(d.loc)} river=${d.river} complete=${d.complete} levees=${J(M.citiesOnRiver(d.river).map((c) => ({ key: c.key, center: occupants(c.center).map((o) => o.type) })))} sameRiverVerdicts=${J(verdicts)}`);
    }
    const o2 = offered(cid, def);
    emit(`S2 offered after build: ${J([...(o2.plots || []), ...(o2.expand || [])].map((p) => ({ x: p.x, y: p.y, river: p.river, riverId: M.riverAt(p) })))}`);
  }
  // S3: the capital's own river tiles (visible), those without a Dam
  const damPlots = new Set((M ? M.damsOnMap() : []).map((d) => d.plot));
  const chain = near.filter((l) => !damPlots.has(idxOf(l))).slice(0, 4);
  const set = new Set([...rivers.values()].flat());
  emit(`S3 chain=${J(chain)}`);
  if (chain.length) await drawCandidates(chain, set);
  emit(`S5 saveGame DAM-d6 -> ${J(safe(() => Network.saveGame({ Location: SaveLocations.LOCAL_STORAGE, LocationCategories: SaveLocationCategories.NORMAL, Type: SaveTypes.SINGLE_PLAYER, ContentType: SaveFileTypes.GAME_STATE, Overwrite: true, FileName: "DAM-d6" }), "ERR"))} overlays=${J(M && M.damsOnMap().map((d) => d.plot))}`);
  await sleep(8000);
  finishNow(`offered=${J(kinds(all))} builtMinor=${!!minor} builtNav=${!!nav} completions=${completed.filter((c) => String(c.type).startsWith("BUILDING_DAM")).length}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d6 finished"), 4000); }
emit("attached d6");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

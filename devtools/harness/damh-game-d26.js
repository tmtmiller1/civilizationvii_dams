// damh-game-d26.js - D26, flood protection by age (1.2.0). Floods ~300x per age, every flooded constructible
// pillaged (dam-flood-probe).
//   S0  the data: the three floods' classes, every other flood immunity widened, tooltips and icons for the new
//       classes, the flood names, the Dams' own immunity lists
//   S1  as d5: settlements with floodplain tiles buy them and farm them. The mod's sweep is switched off so it neither
//       dries the floodplains nor moves Levees; each settlement then gets one tier by hand, in rotation: none (the
//       control), the Ancient Levee, the Medieval Levee, the Modern Levee
//   S2  each turn, every farm tile that newly carries PLOTEFFECT_FLOODED is logged as FLOODHIT with its settlement's
//       tier, its river's name and whether the flood pillaged it. The flood's severity is in Game_RandomEvents.csv
//       (collected by the harness): join on turn and river afterwards
//   Expected: tier 1 blocks severity 0 only, tier 2 severities 0 and 1, tier 3 all; the control is pillaged by all.
//   SEED=9001 zsh run-harness.sh damh-game-d26.js d26 2400 mod+floods
//   PROBE_OPTS=40 SEED=9001 zsh run-harness.sh damh-game-d26.js d26b 2400 mod+bigfloods   # major and 1000-year only
const TAG = "[DAM]";
const MAX_TURNS = Number("__PROBE_OPTS__") || 30;
const LEVEES = [null, "BUILDING_DAM_LEVEE", "BUILDING_DAM_LEVEE_EXPLORATION", "BUILDING_DAM_LEVEE_MODERN"];
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function isFloodplain(x, y) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(x, y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), damaged: safe(() => inst.damaged, "?") }; }), []); }
function owningCity(x, y) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(x, y); return c && c.owner >= 0 ? `${c.owner}:${c.id}` : null; }, null); }
function riverName(l) { return safe(() => GameplayMap.getRiverName(l.x, l.y) || "", ""); }
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  const t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  await sleep(2500);
  return Game.turn !== t;
}
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok }); emit(`${ok ? "PASS" : "FAIL"} ${name} ${detail || ""}`); }
function dataChecks() {
  const cls = (t) => safe(() => String(GameInfo.RandomEvents.lookup(t).EventClass), "?");
  check("S0 moderate flood stays CLASS_FLOOD", cls("RANDOM_EVENT_FLOOD_MODERATE") === "CLASS_FLOOD", cls("RANDOM_EVENT_FLOOD_MODERATE"));
  check("S0 major flood class", cls("RANDOM_EVENT_FLOOD_MAJOR") === "CLASS_DAMS_FLOOD_MAJOR", cls("RANDOM_EVENT_FLOOD_MAJOR"));
  check("S0 1000-year flood class", cls("RANDOM_EVENT_FLOOD_1000_YEAR") === "CLASS_DAMS_FLOOD_1000_YEAR", cls("RANDOM_EVENT_FLOOD_1000_YEAR"));
  const arg = (m) => safe(() => GameInfo.ModifierArguments.find((a) => a.ModifierId === m && a.Name === "RandomEventClass").Value, "?");
  for (const m of ["MOD_BARAY_RIVER_FLOOD_IMMUNITY", "HO_OKUPU_I_MOD_AVOID_DISASTERS", "MOD_WATER_PUPPET_THEATER_FLOOD_IMMUNITY"]) {
    if (!safe(() => GameInfo.Modifiers.lookup(m), null)) { emit(`S0 ${m} not in this age's database; skipped`); continue; }
    const v = String(arg(m));
    check(`S0 ${m} covers all three floods`, /CLASS_FLOOD\b/.test(v) && v.includes("CLASS_DAMS_FLOOD_MAJOR") && v.includes("CLASS_DAMS_FLOOD_1000_YEAR"), J(v));
  }
  const want = { ANTIQUITY: 1, EXPLORATION: 2, MODERN: 3 };
  for (const [age, n] of Object.entries(want)) {
    for (const kind of ["DAM", "LEVEE"]) {
      const id = kind === "DAM" ? `MOD_DAMS_DAM_${age}_FLOOD_IMMUNITY` : (age === "ANTIQUITY" ? "MOD_DAMS_LEVEE_FLOOD_IMMUNITY" : `MOD_DAMS_LEVEE_${age}_FLOOD_IMMUNITY`);
      const v = String(arg(id));
      check(`S0 ${id} lists ${n} classes`, v.split(",").length === n, J(v));
    }
  }
  for (const c of ["CLASS_DAMS_FLOOD_MAJOR", "CLASS_DAMS_FLOOD_1000_YEAR"]) {
    const ui = safe(() => GameInfo.RandomEventUI.lookup(c), null);
    check(`S0 ${c} tooltip row`, ui && ui.Tooltip === "LOC_UI_RANDOM_EVENT_FLOOD_TOOLTIP", J(ui && ui.Tooltip));
    const icon = safe(() => UI.getIconURL(c), "");
    emit(`S0 icon ${c} ${J(icon)} base CLASS_FLOOD ${J(safe(() => UI.getIconURL("CLASS_FLOOD"), "?"))} with FONTICON ${J(safe(() => UI.getIconURL(c, "FONTICON"), "?"))} base ${J(safe(() => UI.getIconURL("CLASS_FLOOD", "FONTICON"), "?"))}`);
    check(`S0 ${c} icon`, String(icon) === String(safe(() => UI.getIconURL("CLASS_FLOOD"), "?")) && String(safe(() => UI.getIconURL(c, "FONTICON"), "")) === String(safe(() => UI.getIconURL("CLASS_FLOOD", "FONTICON"), "?")), J(icon));
  }
  const pill = safe(() => GameInfo.Constructible_PillageRandomEvents.filter((r) => String(r.ConstructibleType) === "BUILDING_ANCIENT_BRIDGE").map((r) => String(r.EventClass)), []);
  check("S0 Ancient Bridge still pillaged by all three floods", pill.length === 3, J(pill));
  const names = ["MODERATE", "MAJOR", "1000_YEAR"].map((k) => safe(() => Locale.compose(`LOC_RANDOM_EVENT_FLOOD_${k}_NAME`), "?"));
  emit(`S0 flood names ${J(names)}`);
  for (const a of ["ANTIQUITY", "EXPLORATION", "MODERN"]) emit(`S0 text ${a} ${J(safe(() => Locale.compose(`LOC_BUILDING_DAM_${a}_TOOLTIP`), "?"))}`);
}
async function run() {
  const M = globalThis.__dams;
  emit(`S0 mod=${M && M.version}`);
  if (!M) return finishNow("mod not active");
  dataChecks();
  M.enabled = false;
  const FLOODED = safe(() => GameInfo.PlotEffects.lookup("PLOTEFFECT_FLOODED").$index, null);
  const local = GameContext.localPlayerID;
  const cityCount = () => (safe(() => Players.getAlive(), []) || []).reduce((n, p) => n + (safe(() => p.Cities.getCityIds().length, 0) || 0), 0);
  for (let k = 0; k < 6 && cityCount() < 8; k++) await roll();
  const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
  const fp = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFloodplain(x, y)) fp.push({ x, y });
  const cities = [];
  for (const p of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    const near = fp.filter((l) => safe(() => GameplayMap.getPlotDistance(c.location.x, c.location.y, l.x, l.y), 99) <= 4);
    if (!near.length) continue;
    for (const l of near) if (!owningCity(l.x, l.y)) safe(() => c.purchasePlot({ x: l.x, y: l.y }));
    cities.push({ key: `${cid.owner}:${cid.id}`, cid, owner: p.id, center: { x: c.location.x, y: c.location.y }, near });
  }
  await sleep(3000);
  for (const c of cities) {
    c.owned = c.near.filter((l) => owningCity(l.x, l.y) === c.key);
    for (const l of c.owned) if (!occupants(l).length) {
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "DISTRICT", Type: "DISTRICT_RURAL", Location: { x: l.x, y: l.y }, Parent: c.cid, Owner: c.owner }));
      await sleep(800);
      safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: "IMPROVEMENT_FARM", Location: { x: l.x, y: l.y }, Owner: c.owner }));
    }
  }
  await sleep(3000);
  const withLand = cities.filter((c) => c.owned.length).sort((a, b) => b.owned.length - a.owned.length);
  withLand.forEach((c, i) => {
    c.tier = i % 4;
    if (c.tier) safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: LEVEES[c.tier], Location: c.center, Owner: c.owner }));
  });
  await sleep(3000);
  const tierOf = new Map(withLand.map((c) => [c.key, c.tier]));
  emit(`S1 turn ${Game.turn} settlements=${J(withLand.map((c) => ({ key: c.key, tier: c.tier, center: occupants(c.center).map((o) => o.type).filter((t) => t.includes("LEVEE")), tiles: c.owned.length, rivers: [...new Set(c.owned.map(riverName))] })))}`);
  const tiles = withLand.flatMap((c) => c.owned.map((l) => ({ ...l, i: idxOf(l), city: c.key, river: riverName(l) })));
  let wasFlooded = new Set(tiles.filter((t) => safe(() => MapPlotEffects.hasPlotEffect(t.i, FLOODED), false) === true).map((t) => t.i));
  let wasDamaged = new Map(tiles.map((t) => [t.i, occupants(t).some((o) => o.damaged === true)]));
  let hits = 0;
  for (let t = 0; t < MAX_TURNS; t++) {
    if (!(await roll())) break;
    const nowFlooded = new Set();
    for (const tile of tiles) {
      const flooded = safe(() => MapPlotEffects.hasPlotEffect(tile.i, FLOODED), false) === true;
      const damaged = occupants(tile).some((o) => o.damaged === true);
      if (flooded) nowFlooded.add(tile.i);
      if (flooded && !wasFlooded.has(tile.i)) {
        hits++;
        emit(`FLOODHIT turn=${Game.turn - 1} city=${tile.city} tier=${tierOf.get(tile.city)} river=${tile.river} plot=${tile.x},${tile.y} before=${wasDamaged.get(tile.i) ? "pillaged" : "intact"} after=${damaged ? "pillaged" : "intact"}`);
      }
      wasDamaged.set(tile.i, damaged);
    }
    wasFlooded = nowFlooded;
  }
  emit(`S2 levees at the end=${J(withLand.map((c) => ({ key: c.key, tier: c.tier, center: occupants(c.center).map((o) => o.type).filter((x) => x.includes("LEVEE")) })))}`);
  const fails = results.filter((r) => !r.ok).map((r) => r.name);
  finishNow(`data ${results.length - fails.length}/${results.length}${fails.length ? " failed: " + J(fails) : ""}; ${hits} flood hits logged, join with the CSV`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness d26 finished"), 4000); }
emit("attached d26");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

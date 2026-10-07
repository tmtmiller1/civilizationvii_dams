// damh-game-emig-interop.js - Dams together with Emigration: a settlement a Dam protects must send out no flood
// refugees, while one a flood damages still does. dam-flood-probe makes floods frequent and pillage everything they
// reach, so an unprotected settlement shows damage.
//   S0  the d5 setup: roll until the AI has settled, buy every city's floodplain tiles within 4, farm the bare ones
//   S1  a Dam (Modern when it exists) on the river of the city with the most floodplain tiles; the sweep adds Levees
//   A   PHASE_A turns at Emigration's shipped settings (disasterRequireDamage on, or off with "gateoff")
//   B   PHASE_B turns with disasterRequireDamage off (0 skips it)
//   S9  verdicts, each PASS / FAIL / INCONCLUSIVE
// The verdicts judge every settlement on the map by what each flood observably did to it, never a fixed list:
//   reach   the settlements a flood could strike, by Emigration's own rule (the epicenter's ring, and for a flood
//           the whole river it lies on)
//   damage  which of those newly carry pillage at the moment the event fires, which is what Emigration reads
//   effect  each settlement's disaster distress (sampled every turn) and disaster refugees, from Emigration's state
// A settlement a flood reached but never damaged is "spared" (a Dam, a Levee, or luck); one it damaged is "damaged".
// A settlement any non-flood event reached in the phase is left out, since its distress could come from that.
// Emigration's own per-city lines ("[Emigration] event city=...") are collected by the runner into <label>-emig.log.
//   SEED=9001 zsh run-harness.sh damh-game-emig-interop.js emig1 2400 mod+floods+emig
const TAG = "[DAM]";
// PROBE_OPTS (runner env), e.g. "a=30 b=0 gateoff": turns per phase; gateoff runs phase A with
// disasterRequireDamage off from the start, the same-seed control for an A/B pair.
const OPTS = "__PROBE_OPTS__";
const opt = (k, d) => { const m = OPTS.match(new RegExp("\\b" + k + "=(\\d+)")); return m ? Number(m[1]) : d; };
const GATE_OFF = /\bgateoff\b/.test(OPTS);
const PHASE_A = opt("a", 14);
const PHASE_B = opt("b", 8);
const EVENT_RADIUS = 1; // Emigration's blast radius (emigration-events.js)
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function idxOf(l) { return GameplayMap.getIndexFromXY(l.x, l.y); }
function locOf(i) { const l = GameplayMap.getLocationFromIndex(i); return { x: l.x, y: l.y }; }
function isFloodplain(x, y) { return safe(() => GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(x, y))?.FeatureClassType === "FEATURE_CLASS_FLOODPLAIN", false); }
function occupants(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => { const inst = Constructibles.getByComponentID(c); return { type: String(GameInfo.Constructibles.lookup(inst.type).ConstructibleType), damaged: safe(() => inst.damaged, "?"), complete: safe(() => inst.complete, "?") }; }), []); }
function owningCity(x, y) { return safe(() => { const c = GameplayMap.getOwningCityFromXY(x, y); return c && c.owner >= 0 ? `${c.owner}:${c.id}` : null; }, null); }

// Emigration's pop-ups wait for a person; answer them as an unattended player would.
const ANSWERS = [/Let the city settle them/i, /Welcome them in/i];
let answered = 0;
function answerDialogs() {
  safe(() => {
    for (const d of Array.from(document.querySelectorAll("screen-dialog-box"))) {
      const buttons = Array.from(d.querySelectorAll("fxs-button, fxs-hero-button"));
      if (!buttons.length) continue;
      const label = (b) => String(b.getAttribute("caption") || b.textContent || "").trim();
      let pick = null;
      for (const re of ANSWERS) { pick = buttons.find((b) => re.test(label(b))); if (pick) break; }
      if (!pick) pick = buttons[buttons.length - 1];
      pick.dispatchEvent(new CustomEvent("action-activate", { bubbles: true }));
      answered++;
      if (answered <= 20) emit(`DIALOG #${answered} -> ${J(label(pick))}`);
      break;
    }
  });
}
setInterval(answerDialogs, 1500);

let fallbacks = 0;
async function roll() {
  const t = Game.turn;
  safe(() => UI.Player.deselectAllUnits()); safe(() => GameContext.sendTurnComplete());
  let t0 = Date.now();
  while (Game.turn === t && Date.now() - t0 < 45000) await sleep(750);
  if (Game.turn === t) {
    // Blocked: let the AI play the local civ for one turn (it spends and builds, which does not matter here).
    const pid = GameContext.localPlayerID;
    fallbacks++;
    safe(() => { Autoplay.setTurns(1); Autoplay.setReturnAsPlayer(pid); Autoplay.setObserveAsPlayer(pid); Autoplay.setActive(true); });
    t0 = Date.now();
    while (Game.turn === t && Date.now() - t0 < 60000) await sleep(750);
  }
  await sleep(4000); // Emigration's pass runs on the local turn; give it time to land
  return Game.turn !== t;
}

function readState(key) {
  return safe(() => {
    const raw = Configuration.getGame().getValue(key);
    if (typeof raw !== "string" || !raw.length) return null;
    const p = JSON.parse(raw);
    return p && typeof p.v === "number" && p.data ? p.data : p;
  }, null);
}

// Observation. Emigration's reach rule, mirrored (emigration-events.js struckPlots).
function isFloodClass(cls) { return String(cls || "").split("_").includes("FLOOD"); }
function riverPlotsAt(loc) {
  const at = idxOf(loc);
  const n = safe(() => Number(MapRivers.numRivers) || 0, 0);
  for (let i = 0; i < n; i++) {
    const plots = (safe(() => MapRivers.getRiverPlots(MapRivers.getRiverIDByIndex(i)), []) || []).map((p) => (typeof p === "number" ? p : idxOf(p)));
    if (plots.includes(at)) return plots;
  }
  return [];
}
function citiesReached(loc, cls) {
  const plots = [idxOf(loc), ...(safe(() => GameplayMap.getPlotIndicesInRadius(loc.x, loc.y, EVENT_RADIUS), []) || [])];
  if (isFloodClass(cls)) plots.push(...riverPlotsAt(loc));
  const keys = new Set();
  // Like Emigration's cityAt: a tile whose owner resolves to no city (the engine reports id -1 for some) is skipped.
  for (const i of plots) { const l = locOf(i); const k = owningCity(l.x, l.y); if (k && Number(k.split(":")[1]) >= 0 && safe(() => Cities.get(GameplayMap.getOwningCityFromXY(l.x, l.y)), null)) keys.add(k); }
  return [...keys];
}
// Damaged city plots on the whole map (plot index -> city key).
function damagedPlots() {
  const out = new Map();
  for (const p of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    for (const i of safe(() => c.getPurchasedPlots(), []) || []) { const l = locOf(i); if (occupants(l).some((o) => o.damaged === true)) out.set(i, `${cid.owner}:${cid.id}`); }
  }
  return out;
}
// Newly damaged plots since the baseline, per city key. The baseline is refreshed before each turn and advanced at
// every event, so one flood's damage is never counted again for the next.
let baseline = new Map();
function refreshBaseline() { baseline = damagedPlots(); }
function freshByCity(now) {
  const out = new Map();
  for (const [i, key] of now) if (!baseline.has(i)) out.set(key, (out.get(key) || 0) + 1);
  return out;
}

let phase = "setup";
const stats = {}; // phase -> { floods, damagingFloods, late, cities: Map(key -> { reached, damaged, other }) }
function phaseStats(ph) { return stats[ph] || (stats[ph] = { floods: 0, damagingFloods: 0, late: [], cities: new Map() }); }
function cityStat(ph, key) { const m = phaseStats(ph).cities; return m.get(key) || (m.set(key, { reached: 0, damaged: 0, other: 0 }), m.get(key)); }
let dammedKeys = new Set();

safe(() => engine.on("RandomEventOccurred", (d) => {
  if (phase !== "A" && phase !== "B") return;
  const info = safe(() => GameInfo.RandomEvents.lookup(d.eventType), null);
  const cls = info && info.EventClass;
  const loc = d && d.location ? { x: d.location.x, y: d.location.y } : null;
  if (!loc) return;
  const ph = phase, turn = Game.turn;
  const reached = citiesReached(loc, cls);
  const now = damagedPlots();
  const fresh = freshByCity(now);
  for (const [i, k] of now) baseline.set(i, k);
  const st = phaseStats(ph);
  if (!isFloodClass(cls)) { for (const k of reached) cityStat(ph, k).other++; return; }
  st.floods++;
  const hit = reached.filter((k) => fresh.has(k));
  if (hit.length) st.damagingFloods++;
  for (const k of reached) { const c = cityStat(ph, k); c.reached++; if (fresh.has(k)) c.damaged++; }
  const tag = (k) => k + (dammedKeys.has(k) ? "(dammed)" : "");
  if (reached.length) emit(`EVT ${ph} t${turn} ${info ? info.RandomEventType : d.eventType} at ${J(loc)} reached=${J(reached.map(tag))} damaged=${J(hit.map((k) => tag(k) + "x" + fresh.get(k)))}`);
  // Damage that shows up only after the event is damage Emigration could not have read.
  setTimeout(() => {
    const later = freshByCity(damagedPlots());
    const late = reached.filter((k) => later.has(k) && !fresh.has(k));
    if (late.length) { st.late.push({ turn, loc, late }); emit(`LATE ${ph} t${turn} at ${J(loc)} damage appeared after the event in ${J(late)}`); }
  }, 2500);
}));

// Every settlement's disaster distress and disaster refugees, from Emigration's saved state.
let byCause = () => ({});
let nameOf = () => "?";
function snapshotAll() {
  const ds = readState("EmigrationDisaster_v1") || {};
  const ms = readState("EmigrationMigStats_v1") || {};
  const refugees = new Map();
  for (const [k, v] of Object.entries(ms.flows || {})) {
    const [so, , sn] = k.split(">");
    const n = v && typeof v === "object" ? Number(v.disaster) || 0 : 0;
    if (n > 0) refugees.set(so + "|" + sn, (refugees.get(so + "|" + sn) || 0) + n);
  }
  const out = new Map();
  for (const p of safe(() => Players.getAlive(), []) || []) for (const cid of safe(() => p.Cities.getCityIds(), []) || []) {
    const c = safe(() => Cities.get(cid), null); if (!c) continue;
    const key = `${cid.owner}:${cid.id}`;
    out.set(key, { distress: Number((ds.byCity || {})[key] || 0), cause: (ds.typeByCity || {})[key] || null, refugees: refugees.get(cid.owner + "|" + nameOf(c)) || 0, infected: safe(() => !!c.isInfected, false) });
  }
  return out;
}
const peak = {}; // phase -> Map(key -> { distress, refugees, infected })
async function runPhase(label, turns) {
  phase = label;
  const m = peak[label] || (peak[label] = new Map());
  const start = snapshotAll();
  for (let t = 0; t < turns; t++) {
    refreshBaseline();
    const ok = await roll();
    for (const [k, s] of snapshotAll()) {
      const e = m.get(k) || { distress: 0, refugees: 0, infected: false };
      e.distress = Math.max(e.distress, s.distress);
      e.refugees = Math.max(e.refugees, s.refugees - ((start.get(k) || {}).refugees || 0));
      e.infected = e.infected || s.infected;
      m.set(k, e);
    }
    emit(`${label} turn ${Game.turn} distress ${J(Object.fromEntries([...m].filter(([, e]) => e.distress > 0).map(([k, e]) => [k, +e.distress.toFixed(2)])))}`);
    if (!ok) { emit(`${label} turn did not advance`); break; }
  }
  phase = "between";
}

// Verdicts from the observations of one phase.
function classify(ph) {
  const st = phaseStats(ph), pk = peak[ph] || new Map();
  const spared = [], damaged = [], excluded = [];
  for (const [k, c] of st.cities) {
    const e = pk.get(k) || { distress: 0, refugees: 0, infected: false };
    const row = { key: k, dammed: dammedKeys.has(k), reached: c.reached, damaged: c.damaged, distress: +e.distress.toFixed(2), refugees: Math.round(e.refugees) };
    if (c.other > 0 || e.infected) excluded.push(row);
    else if (c.damaged > 0) damaged.push(row);
    else if (c.reached > 0) spared.push(row);
  }
  return { st, spared, damaged, excluded };
}
function verdict(ok, why, inconclusive) { return (inconclusive ? "INCONCLUSIVE" : ok ? "PASS" : "FAIL") + " " + why; }

// All verdict lines for the run, from the phase observations. damType names the Dam placed.
function verdicts(damType) {
  const A = classify("A");
  emit(`S8 phase A floods=${A.st.floods} damaging=${A.st.damagingFloods} late=${A.st.late.length} spared=${J(A.spared)} damaged=${J(A.damaged)} excluded=${J(A.excluded)}`);
  const lines = [];
  const gateOnA = !GATE_OFF;
  // V1: a settlement a flood reached but did not damage takes no flood distress (with the gate on), or does take it
  // (the gateoff control, which should reproduce the original bug).
  const sparedDist = A.spared.filter((r) => r.distress > 0 || r.refugees > 0);
  const sparedDammed = A.spared.filter((r) => r.dammed);
  lines.push(gateOnA
    ? verdict(sparedDist.length === 0, `V1 spared settlements take no flood distress: ${A.spared.length} spared (${sparedDammed.length} dammed), with distress or refugees ${J(sparedDist)}`, A.spared.length === 0)
    : verdict(sparedDist.length > 0, `V1 control (gate off) reproduces the bug: ${sparedDist.length} of ${A.spared.length} spared settlements took distress ${J(sparedDist)}`, A.spared.length === 0));
  // V2: every settlement a flood damaged takes flood distress.
  const damagedNoDist = A.damaged.filter((r) => !(r.distress > 0));
  lines.push(verdict(damagedNoDist.length === 0, `V2 damaged settlements take flood distress: ${A.damaged.length} damaged, without distress ${J(damagedNoDist)}, refugees ${J(A.damaged.map((r) => [r.key, r.refugees]))}`, A.damaged.length === 0));
  // V3: phase B (gate off) - settlements spared in B take distress, showing the setting is what shielded them.
  if (PHASE_B > 0) {
    const B = classify("B");
    const bDist = B.spared.filter((r) => r.distress > 0);
    lines.push(verdict(bDist.length > 0, `V3 with the gate off, spared settlements take distress: ${bDist.length} of ${B.spared.length} ${J(bDist)}`, B.spared.length === 0));
  } else lines.push("INCONCLUSIVE V3 skipped (no phase B; use a gateoff run as the control)");
  // V4: Dams protects beside Emigration - floods reached the dammed river's settlements and damaged nothing there,
  // while damaging settlements elsewhere (so the floods were able to damage at all).
  const dammedRows = [...A.spared, ...A.damaged].filter((r) => r.dammed);
  const dammedReached = dammedRows.reduce((n, r) => n + r.reached, 0);
  const dammedHit = dammedRows.filter((r) => r.damaged > 0);
  const elsewhere = A.damaged.filter((r) => !r.dammed).length;
  lines.push(verdict(dammedHit.length === 0, `V4 the ${damType} protects: floods reached dammed settlements ${dammedReached} times, damaged ${J(dammedHit)}; ${elsewhere} undammed settlements damaged`, dammedReached === 0 || elsewhere === 0));
  // V5: the damage Emigration measures is there when the event fires.
  lines.push(verdict(A.st.late.length === 0, `V5 no flood damage appeared after the event: ${J(A.st.late)}`, A.st.floods === 0));
  return lines;
}

async function run() {
  const M = globalThis.__dams;
  const E = await import("/emigration/ui/emigration-config.js").catch((e) => { emit("emigration import failed " + e); return null; });
  const N = await import("/emigration/ui/emigration-migration-records.js").catch(() => null);
  const ST = await import("/emigration/ui/emigration-migration-stats.js").catch(() => null);
  byCause = (pid) => safe(() => (ST ? ST.emigrationByCause(pid) : {}), {});
  const CONFIG = E && E.CONFIG;
  emit(`S0 dams=${M && M.version} emigration=${!!CONFIG} disasterRequireDamage=${CONFIG && CONFIG.disasterRequireDamage} disastersEnabled=${CONFIG && CONFIG.disastersEnabled} impactScaling=${CONFIG && CONFIG.disasterImpactScalingEnabled}`);
  if (!M) return finishNow("FAIL dams mod not active");
  if (!CONFIG || CONFIG.disasterRequireDamage !== true) return finishNow("FAIL emigration with the fix is not loaded");
  if (GATE_OFF) CONFIG.disasterRequireDamage = false;
  emit(`S0 opts=${J(OPTS)} phaseA=${PHASE_A} phaseB=${PHASE_B} gateOffFromStart=${GATE_OFF} disasterRequireDamage=${CONFIG.disasterRequireDamage}`);
  nameOf = (c) => (N && N.cityName ? N.cityName(c) : safe(() => Locale.compose(c.name), "?"));
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
    cities.push({ key: `${cid.owner}:${cid.id}`, cid, owner: cid.owner, name: nameOf(c), at: { x: c.location.x, y: c.location.y }, near });
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
  const dammedCity = withLand[0];
  if (!dammedCity || !dammedCity.rivers.length) return finishNow("INCONCLUSIVE no city with floodplain river tiles");
  const river = dammedCity.rivers[0];
  const farmSet = new Set(withLand.flatMap((c) => c.owned.map(idxOf)));
  const riverPlots = (safe(() => MapRivers.getRiverPlots(river), []) || []).map((p) => (typeof p === "number" ? locOf(p) : p));
  const site = riverPlots.find((l) => owningCity(l.x, l.y) === dammedCity.key && !farmSet.has(idxOf(l))) || riverPlots.find((l) => owningCity(l.x, l.y) === dammedCity.key) || riverPlots[0];
  // Dams 1.2.0 splits floods by severity and only the Modern Dam holds back all three, so place that one when it
  // exists; the flood probe fires every severity.
  let damType = "BUILDING_DAM_MODERN";
  const place = async (t) => { safe(() => Game.PlayerOperations.sendRequest(local, "CREATE_ELEMENT", { Kind: "CONSTRUCTIBLE", Type: t, Location: site, Owner: dammedCity.owner })); await sleep(3000); return occupants(site).some((o) => o.type === t); };
  if (!(await place(damType))) { damType = "BUILDING_DAM_ANTIQUITY"; await place(damType); }
  safe(() => M.sweep());
  await sleep(3000);
  const onRiver = M.citiesOnRiver(river).map((c) => c.key);
  const levees = M.citiesOnRiver(river).filter((c) => c.key !== dammedCity.key).map((c) => ({ key: c.key, levees: occupants(c.center).map((o) => o.type).filter((t) => t.includes("LEVEE")) }));
  const leveesOk = levees.every((c) => c.levees.length > 0);
  const damOk = occupants(site).some((o) => o.type === damType);
  dammedKeys = new Set(onRiver);
  emit(`S1 dam at ${J(site)} type=${damType} placed=${damOk} levees=${J(levees)} river=${river} citiesOnRiver=${J(onRiver)} leveesInPlace=${leveesOk} farmed=${J(withLand.map((c) => ({ key: c.key, name: c.name, rivers: c.rivers, tiles: c.owned.length })))}`);
  if (!damOk) return finishNow("INCONCLUSIVE the Dam did not land");

  await runPhase("A", PHASE_A);
  const allPids = (safe(() => Players.getAlive(), []) || []).map((p) => p.id);
  emit(`S7 end of A: distress ${J((readState("EmigrationDisaster_v1") || {}).byCity || {})} emigration by cause ${J(Object.fromEntries(allPids.map((o) => [o, byCause(o)]).filter(([, v]) => Object.keys(v).length)))}`);
  if (PHASE_B > 0) {
    CONFIG.disasterRequireDamage = false;
    emit(`B start: disasterRequireDamage=${CONFIG.disasterRequireDamage}`);
    await runPhase("B", PHASE_B);
    CONFIG.disasterRequireDamage = true;
  }

  const lines = verdicts(damType);
  emit(`S8 fallbacks=${fallbacks} dialogs=${answered}`);
  for (const line of lines) emit("VERDICT " + line);
  finishNow(lines.map((l) => l.split(" ")[0] + ":" + l.split(" ")[1]).join(","));
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness emig-interop finished"), 4000); }
emit("attached emig-interop");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

// damh-game-u3.js - U3, the AI usefulness check, second pass: sites read from the map (u2 found canStart gives an AI's
// settlements no plots) and the planner running under Autoplay (localPlayerID reads -1 there). Otherwise as u2: Same game as u1 (Play Now Exploration, seed 9001, mod + grant), with
// the game's own AI kept off the Dam (data/dams-ai.xml) and ui/dams.js planning AI Dams itself.
//   P1  turn 1, the player's own turn: every AI's candidate rivers with the planner's worth and reason
//   P2  Autoplay; every planner decision is in the [Dams] lines; a census every 10 turns
//   P3  back on the player's own turn: an AI's Dam project paid in full, the planner called, the Dam watched landing,
//       then the sweep (drawn, Levees, floodplains dried); a capture of it
//   P4  the final census: every AI Dam on a river that floods, none sharing a river with one as good
// With AI_VERBOSE=1, AI_ConstructibleBroker.csv shows whether the game's own AI still weighs the Dam (u1 had 616 rows).
//   AI_VERBOSE=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-u3.js u3 3000 mod+grant
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const TURNS = 30;
let local = -1;

function floodable(river) { return safe(() => { const r = MapRivers.getRiver(river); return r ? !!r.isFloodable : null; }, null); }
function occ(l) { return safe(() => (MapConstructibles.getConstructibles(l.x, l.y) || []).map((c) => String(GameInfo.Constructibles.lookup(Constructibles.getByComponentID(c).type).ConstructibleType)), []); }
function census(M, label) {
  M.forget();
  const dams = safe(() => M.damsOnMap(), []);
  let ai = 0, bad = 0;
  for (const d of dams) {
    const human = safe(() => Players.get(d.owner).isHuman, false);
    const fl = floodable(d.river);
    const tier = (t) => ["BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"].indexOf(String(t));
    const rival = dams.filter((o) => o !== d && o.river === d.river && tier(o.type) >= tier(d.type)).length;
    if (!human) { ai++; if (fl !== true || rival) bad++; }
    emit(`D ${label} at=${d.loc.x},${d.loc.y} owner=${d.owner}${human ? "(human)" : ""} type=${d.type} complete=${d.complete} river=${d.river} floodable=${fl} asGoodOnRiver=${rival}`);
  }
  emit(`C ${label} turn=${safe(() => Game.turn)} dams=${dams.length} ai=${ai} aiUseless=${bad}`);
  return { dams, ai, bad };
}
function candidates(M, def) {
  let any = 0;
  for (const pid of safe(() => M.aiMajors(), [])) {
    const rivers = new Map(); let plots = 0;
    for (const c of safe(() => Players.get(pid).Cities.getCities() || [], [])) {
      for (const l of safe(() => M.candidatePlots(c), [])) {
        plots++; const r = safe(() => M.riverAt(l), null);
        if (r != null && !rivers.has(r)) rivers.set(r, safe(() => M.damWorth(r, pid, def.ConstructibleType), "ERR"));
      }
    }
    const site = safe(() => M.aiDamSite(pid, def), null); if (site) any++;
    emit(`K turn=${safe(() => Game.turn)} pid=${pid} tech=${safe(() => M.hasDam(pid, def))} plots=${plots} rivers=${J([...rivers].map(([r, w]) => `${r}:${w.worth}(${w.why})`))} pick=${site ? `${site.loc.x},${site.loc.y} river ${site.river} ${site.why}` : "none"}`);
  }
  return any;
}
async function run() {
  local = GameContext.localPlayerID;
  const M = globalThis.__dams;
  emit(`R0 turn=${safe(() => Game.turn)} mod=${safe(() => M.version, "ABSENT")} local=${local} planner=${typeof (M && M.aiPlan)}`);
  if (!M || typeof M.aiPlan !== "function") { finishNow("planner absent"); return; }
  const def = M.thisAgesDam();
  emit(`R1 dam=${def && def.ConstructibleType} ban rows=${safe(() => GameInfo.AiFavoredItems.filter((r) => String(r.ListType) === "Dams Native Ban").length, "?")}`);
  // P1
  candidates(M, def);
  emit(`P1 aiPlan -> ${J(await M.aiPlan())} state=${J(M.aiState())}`);
  // P2
  const start = safe(() => Game.turn, 1);
  engine.on("TurnBegin", () => { const t = safe(() => Game.turn, 0); if ((t - start) % 10 === 0) { census(M, "t" + t); candidates(M, def); } });
  safe(() => { Autoplay.setTurns(TURNS); Autoplay.setReturnAsPlayer(local); Autoplay.setObserveAsPlayer(local); Autoplay.setActive(true); });
  emit(`A autoplay ${TURNS} turns from ${start}`);
  for (let k = 0; k < 2400 && safe(() => Game.turn, start) < start + TURNS; k += 5) await sleep(5000);
  await sleep(15000);
  safe(() => Autoplay.setActive(false));
  await sleep(5000);
  // P3
  candidates(M, def);
  let st = M.aiState();
  let pid = Object.keys(st.projects)[0];
  if (pid == null) {
    for (const p of M.aiMajors()) {
      const site = M.aiDamSite(p, def); if (!site) continue;
      st.projects[p] = { plot: GameplayMap.getIndexFromXY(site.loc.x, site.loc.y), cityId: site.city.id, type: def.ConstructibleType, need: Number(def.Cost), paid: 0 };
      pid = String(p); emit(`H no project under way; one made for AI ${p} at ${site.loc.x},${site.loc.y} (${site.why})`); break;
    }
  }
  if (pid == null) { await mechanics(M, def); return; }
  const pr = st.projects[pid]; pr.paid = pr.need; delete st.last[pid];
  safe(() => Configuration.editGame().setValue("Dams_AI_v1", JSON.stringify(st)));
  const at = GameplayMap.getLocationFromIndex(pr.plot); const loc = { x: at.x, y: at.y };
  const river = M.riverAt(loc);
  const fpBefore = safe(() => (MapRivers.getRiverPlots(river) || []).length, "?");
  emit(`P3 AI ${pid} project paid at ${loc.x},${loc.y} river=${river} before=${J(occ(loc))} levees=${J([...M.leveePlan().values()].map((c) => c.key + ":" + c.levee))} riverPlots=${fpBefore}`);
  const r = await M.aiPlan();
  await sleep(6000);
  M.forget();
  const landed = occ(loc);
  const drawn = M.drawn().includes(GameplayMap.getIndexFromXY(loc.x, loc.y));
  const plan = [...M.leveePlan().values()].map((c) => c.key + ":" + c.levee);
  const fp = safe(() => (MapRivers.getRiverPlots(river) || []).map((p) => GameplayMap.getLocationFromIndex(p)).filter((l) => String(GameInfo.FeatureClasses.lookup(GameplayMap.getFeatureClassType(l.x, l.y))?.FeatureClassType) === "FEATURE_CLASS_FLOODPLAIN").length, "?");
  emit(`P3 aiPlan -> ${J(r)} after=${J(landed)} drawn=${drawn} levees=${J(plan)} floodplainsLeft=${fp} state=${J(M.aiState())}`);
  emit(`S3 ${landed.includes(def.ConstructibleType) ? "PASS" : "FAIL"} AI Dam landed on its site`);
  safe(() => Camera.lookAtPlot(loc, { zoom: 0.25 })); await sleep(5000); emit("SHOT ai-dam"); await sleep(10000);
  // P4
  const c = census(M, "end");
  emit(`S4 ${c.bad === 0 ? "PASS" : "FAIL"} every AI Dam on a flooding river with none as good beside it (${c.ai} AI Dams)`);
  finishNow("read");
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness u3 finished"), 4000); }
async function mechanics(M, def) {
  // no site worth a Dam anywhere: place one by the planner's own path on the most-guarded AI candidate, to watch the
  // placement and the sweep after it; this Dam is left out of the usefulness census
  let pick = null;
  for (const p of M.aiMajors()) for (const c of Players.get(p).Cities.getCities() || []) for (const l of M.candidatePlots(c)) {
    const r = M.riverAt(l); const g = M.guarded(r, p) + (M.riverFloods(r) ? 100 : 0);
    if (!pick || g > pick.g) pick = { p, l, r, g };
  }
  if (!pick) { census(M, "end"); finishNow("no AI candidate plot at all"); return; }
  emit(`M no site worth a Dam; placement only: AI ${pick.p} at ${pick.l.x},${pick.l.y} river=${pick.r} floods=${M.riverFloods(pick.r)} worth=${J(M.damWorth(pick.r, pick.p, def.ConstructibleType))} before=${J(occ(pick.l))}`);
  const ok = await M.aiPlaceDam(pick.p, pick.l, def); await sleep(6000); M.forget();
  const drawn = M.drawn().includes(GameplayMap.getIndexFromXY(pick.l.x, pick.l.y));
  emit(`M after=${J(occ(pick.l))} landed=${ok} drawn=${drawn} levees=${J([...M.leveePlan().values()].map((c) => c.key + ":" + c.levee))} owner=${safe(() => GameplayMap.getOwner(pick.l.x, pick.l.y))}`);
  emit(`S3 ${ok && occ(pick.l).includes(def.ConstructibleType) ? "PASS" : "FAIL"} (placement only) AI Dam landed by aiPlaceDam`);
  safe(() => Camera.lookAtPlot(pick.l, { zoom: 0.25 })); await sleep(5000); emit("SHOT ai-dam-mechanics"); await sleep(10000);
  const c = census(M, "end");
  emit(`S4 ${c.bad <= 1 ? "PASS" : "FAIL"} no AI Dam but the probe's own on a useless site (${c.ai} AI Dams, ${c.bad} useless)`);
  finishNow("read");
}
emit("attached u3 AI dams usefulness");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { emit("LOAD GameStarted"); setTimeout(run, 20000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

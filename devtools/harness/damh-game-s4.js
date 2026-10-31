// damh-game-s4.js - S4, which places the engine reads a mod's art bundle from (DEPLOY=artprobe, ARTSRC=... with the
// bundles built by tower-bench-private lib/cli/ui-art.mjs): damprobe_a (bundle at the mod folder's root), damprobe_b
// (bundle in a subfolder of the mod), damprobe_c (bundle in the game's DLC folder), and the base buildicon_library.
// Each is drawn as a map sprite on its own tile around the first unit, and as a page image (blp: in CSS), then the
// window is captured. A texture that isn't mounted logs "Failed loading resource: blp:<name>" in UI.log.
//   ARTSRC=<dir> SEED=9001 zsh run-harness.sh damh-game-s4.js s4 600 artprobe
const TAG = "[DAM]";
function emit(m) { try { console.error(TAG + " " + m); } catch (_) {} }
function J(o) { try { return JSON.stringify(o); } catch (e) { return "?"; } }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? ("ERR:" + e) : fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const NAMES = [["a-mod-root", "damprobe_a"], ["b-mod-subfolder", "damprobe_b"], ["c-game-dlc", "damprobe_c"], ["control", "buildicon_library"]];
const RING = ["DIRECTION_EAST", "DIRECTION_SOUTHEAST", "DIRECTION_SOUTHWEST", "DIRECTION_WEST"];
async function run() {
  const local = GameContext.localPlayerID;
  const ids = safe(() => Players.get(local).Units.getUnitIds(), []) || [];
  const u = ids.length ? Units.get(ids[0]) : null;
  const C = u ? { x: u.location.x, y: u.location.y } : { x: 10, y: 10 };
  const grid = safe(() => WorldUI.createSpriteGrid("DamArtProbe", true), null);
  const placed = NAMES.map(([label, asset], k) => {
    const n = safe(() => GameplayMap.getAdjacentPlotLocation(C, DirectionTypes[RING[k]]), null);
    const idx = n ? GameplayMap.getIndexFromXY(n.x, n.y) : -1;
    const r = safe(() => grid.addSprite(idx, asset, { x: 0, y: 0, z: 30 }, { scale: 2 }), "ERR");
    return { label, asset, at: n && { x: n.x, y: n.y }, dir: RING[k], r };
  });
  emit(`S4 sprites ${J(placed)} centre=${J(C)}`);
  const box = document.createElement("div");
  box.style.position = "absolute"; box.style.left = "40px"; box.style.top = "120px"; box.style.zIndex = "99999";
  box.style.display = "flex"; box.style.flexDirection = "row";
  for (const [label, asset] of NAMES) {
    const cell = document.createElement("div");
    cell.style.width = "160px"; cell.style.height = "190px"; cell.style.marginRight = "12px";
    cell.style.backgroundColor = "rgb(30,30,30)";
    const img = document.createElement("div");
    img.style.width = "160px"; img.style.height = "160px";
    img.style.backgroundImage = `url("blp:${asset}")`; img.style.backgroundSize = "contain"; img.style.backgroundRepeat = "no-repeat";
    const t = document.createElement("div");
    t.textContent = label; t.style.color = "white"; t.style.fontSize = "16px";
    cell.appendChild(img); cell.appendChild(t); box.appendChild(cell);
  }
  document.body.appendChild(box);
  safe(() => Camera.lookAtPlot(C, { zoom: 0.2 }));
  await sleep(6000);
  emit("SHOT s4-art");
  await sleep(20000);
  finishNow(`centre=${J(C)}`);
}
let finished = false;
function finishNow(v) { if (finished) return; finished = true; emit(`S9 VERDICT ${v}`); setTimeout(() => emit("DONE harness s4 finished"), 4000); }
emit("attached s4");
let beginTries = 0;
function loadStateName() { return safe(() => { const s = UI.getGameLoadingState(); for (const k of Object.keys(UIGameLoadingState)) if (UIGameLoadingState[k] === s) return k; return String(s); }, "?"); }
function beginPoll() { const st = loadStateName(); if (st === "GameStarted") { setTimeout(() => run().catch((e) => finishNow("threw " + e)), 12000); return; } beginTries++; if (st === "WaitingToStart" || st === "WaitingForUIReady" || beginTries % 5 === 0) safe(() => UI.notifyUIReady()); if (beginTries < 150) setTimeout(beginPoll, 2000); else emit("LOAD gave up"); }
setTimeout(beginPoll, 3000);

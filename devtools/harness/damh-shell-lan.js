// damh-shell-lan.js - shell scope. Hosts a LAN game alone (the other slots as the setup leaves them) and starts it, so
// a probe can run in a network game: Configuration.getGame().isNetworkMultiplayer reads true there, and the mod's
// script takes its network path. run-harness.sh substitutes __AGE__ and __SEED__ (LAN=1).
const START_AGE = "__AGE__";
const SEED = "__SEED__";
function emit(m) { try { console.error("[DAM] shell " + m); } catch (_) {} }
function safe(fn, fb) { try { return fn(); } catch (e) { return fb === undefined ? "ERR:" + e : fb; } }
let phase = "idle";
let ticks = 0;
function host() {
  phase = "hosting";
  safe(() => Configuration.editGame().reset(GameModeTypes.LAN));
  if (START_AGE) emit("start age " + safe(() => { Configuration.editGame().setStartAgeType(START_AGE); return START_AGE; }));
  if (SEED) emit("seeds " + safe(() => { Configuration.editMap().setMapSeed(Number(SEED)); Configuration.editGame().setGameSeed(Number(SEED)); return SEED; }));
  const r = safe(() => Network.hostMultiplayerGame(ServerType.SERVER_TYPE_LAN));
  emit(`hostMultiplayerGame(LAN) -> ${r} (OK=${safe(() => NetworkResult.NETWORKRESULT_OK)} PENDING=${safe(() => NetworkResult.NETWORKRESULT_PENDING)})`);
  setTimeout(poll, 3000);
}
function poll() {
  ticks++;
  const inSession = safe(() => Network.isInSession, "?");
  const players = safe(() => Configuration.getMap() && Configuration.getGame().humanPlayerCount, "?");
  const mode = safe(() => Configuration.getGame().gameMode, "?");
  const net = safe(() => Configuration.getGame().isNetworkMultiplayer, "?");
  if (ticks % 3 === 1) emit(`lobby tick ${ticks} inSession=${inSession} humans=${players} gameMode=${mode} network=${net} ready=${safe(() => Network.isPlayerStartReady(GameContext.localPlayerID), "?")}`);
  // The session opens late (e6: tick 37); ready and start only take once it is open, so keep pressing both.
  if (inSession === true && safe(() => Network.isPlayerStartReady(GameContext.localPlayerID), false) !== true && ticks % 2 === 0) emit("toggle ready " + safe(() => Network.toggleLocalPlayerStartReady()));
  if (inSession === true && ticks % 4 === 0) emit("startMultiplayerGame " + safe(() => Network.startMultiplayerGame()));
  if (ticks < 120) setTimeout(poll, 3000);
}
emit("attached; LAN game");
setTimeout(host, 20000);

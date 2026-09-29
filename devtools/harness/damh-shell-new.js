// damh-shell-new.js - shell scope. Starts a Play Now game (optionally in a chosen age with fixed seeds) so a
// probe can run on a game CREATED with the probe's data mod present: unlock grants and tech-node unlocks fire at
// creation, never retroactively on a loaded save. Copied from the canals harness (canalh-shell-new.js).
// run-harness.sh substitutes __AGE__, __SEED__ and __REALISM__ (Disaster Intensity, e.g. REALISM_SETTING_HEAVY).
const START_AGE = "__AGE__";
const SEED = "__SEED__";
const REALISM = "__REALISM__";
// Setup options as key=value pairs joined by ";", e.g. "CompactCities-RingLock=ENABLED".
const CONFIG = "__CONFIG__";
function emit(m) { try { console.error("[DAM] shell " + m); } catch (_) {} }
let fired = false;
function playNow() {
  if (fired) return; fired = true;
  try {
    Configuration.editGame()?.reset(GameModeTypes.SINGLEPLAYER);
    if (START_AGE) { try { Configuration.editGame().setStartAgeType(START_AGE); emit("start age set " + START_AGE); } catch (e) { emit("setStartAgeType threw " + e); } }
    if (SEED) { try { Configuration.editMap().setMapSeed(Number(SEED)); Configuration.editGame().setGameSeed(Number(SEED)); emit("seeds set " + SEED); } catch (e) { emit("seed set threw " + e); } }
    if (REALISM) { try { Configuration.editGame().setValue("RealismSettingType", REALISM); emit("realism set " + REALISM + " read " + Configuration.getGame().getValue("RealismSettingType")); } catch (e) { emit("realism set threw " + e); } }
    for (const pair of CONFIG.split(";").filter(Boolean)) {
      const [k, v] = pair.split("=");
      try { Configuration.editGame().setValue(k, v); emit("config " + k + " set " + v + " read " + Configuration.getGame().getValue(k)); } catch (e) { emit("config " + k + " threw " + e); }
    }
    engine.call("startGame");
    emit("startGame called (Play Now)");
  } catch (e) { emit("startGame threw " + e); }
}
emit("attached; NEW game");
setTimeout(playNow, 20000);

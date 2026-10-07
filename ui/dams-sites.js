// dams-sites.js - Dams, the old dam sites. Game scope, loaded after ui/dams.js.
//
// In 1.3.0 a Dam could stand only on a dam-site marker (FEATURE_DAMS_SITE) the script placed: one per river for each
// AI, and the tile of each order the player gave. From 2.0.0 a Dam goes on any river tile and nothing requires the
// marker, so all this file does is lift the markers a 1.3.0 save still carries. Each one goes, and the feature it
// replaced (woods, wetland, floodplain; recorded under SITES_KEY) comes back. A marker under a finished Dam had
// already been settled with nothing to restore, so its tile is left bare. Saves without the key do nothing.
// Not in a network game: a feature write is local to this machine, and 1.3.0 never placed markers there anyway.
"use strict";

const TAG = "[Dams]";
const SITE_FEATURE = "FEATURE_DAMS_SITE";
const SITES_KEY = "Dams_Sites_v1";

function log(m) { try { console.error(TAG + " " + m); } catch (_) { /* ignore */ } }
function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function featureOf(loc) {
  return safe(() => {
    const f = GameplayMap.getFeatureType(loc.x, loc.y);
    return f === FeatureTypes.NO_FEATURE ? "" : String(GameInfo.Features.lookup(f).FeatureType);
  }, "?");
}

function loadSites() {
  const s = safe(() => JSON.parse(String(Configuration.getGame().getValue(SITES_KEY))), null);
  return s && typeof s === "object" ? s : {};
}

/**
 * Set a tile's feature and wait for it to read back. One feature cannot replace another in a single call: the old one
 * goes and nothing comes in its place (canals m8, five tiles of five); cleared first, the new one lands.
 */
async function putFeature(loc, f) {
  const want = f === FeatureTypes.NO_FEATURE ? "" : safe(() => String(GameInfo.Features.lookup(f).FeatureType), "?");
  if (featureOf(loc)) {
    safe(() => WorldBuilder.MapPlots.setFeature(FeatureTypes.NO_FEATURE, { x: loc.x, y: loc.y }));
    for (let k = 0; k < 30 && featureOf(loc); k++) await sleep(100);
  }
  if (want) {
    safe(() => WorldBuilder.MapPlots.setFeature(f, { x: loc.x, y: loc.y }));
    for (let k = 0; k < 30 && featureOf(loc) !== want; k++) await sleep(100);
  }
}

async function liftOldSites() {
  const sites = loadSites();
  const plots = Object.keys(sites);
  if (!plots.length) return;
  let lifted = 0;
  for (const key of plots) {
    const l = safe(() => GameplayMap.getLocationFromIndex(Number(key)), null);
    if (!l || featureOf(l) !== SITE_FEATURE) continue;
    const name = sites[key] && sites[key].was;
    const was = name ? safe(() => GameInfo.Features.lookup(name).$index, null) : null;
    await putFeature(l, was != null ? was : FeatureTypes.NO_FEATURE);
    lifted++;
  }
  safe(() => Configuration.editGame().setValue(SITES_KEY, "{}"));
  log(`old dam sites: ${lifted} of ${plots.length} lifted`);
}

/** A loaded save waits behind Begin Game; map writes go in only once the game has started. */
async function whenStarted() {
  for (let k = 0; k < 600; k++) {
    if (safe(() => UI.getGameLoadingState() === UIGameLoadingState.GameStarted, true)) break;
    await sleep(1000);
  }
  await sleep(3000);
  await liftOldSites();
}

if (!safe(() => Configuration.getGame().isNetworkMultiplayer, false)) whenStarted();

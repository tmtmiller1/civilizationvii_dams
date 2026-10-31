// dams-pips.js - Dams, a Civilization VII mod. Game scope.
//
// When you place a building, the placement view draws each district's building slots as pips under the tile. Those
// pips are map sprites, and a map sprite only draws icons packed in the game's own BLP textures, which a Workshop mod
// can't add: the engine loads a mod's art bundle only from the game's DLC folder or the user override folders
// (devtools s4-s5, 2026-10-31). So the Dam's pip is drawn twice:
//   - as a sprite, with the Bridge icon of the Dam's age standing in for the PNG the sprite can't load, and
//   - as a page element showing the Dam's own icon, pinned over that pip with a world anchor and sized each frame from
//     the screen distance between two slot positions, so it follows the map's pan and zoom.
// If the page element ever fails, the Bridge icon is what the player sees.
"use strict";

const PIPS_KEY = "__damsPips";
const PIP_DAMS = ["BUILDING_DAM_ANTIQUITY", "BUILDING_DAM_EXPLORATION", "BUILDING_DAM_MODERN"];
const PIP_STAND_IN = {
  BUILDING_DAM_ANTIQUITY: "buildicon_ancbridge",
  BUILDING_DAM_EXPLORATION: "buildicon_expbridge",
  BUILDING_DAM_MODERN: "buildicon_modbridge",
};
const PIP_PNG_NAME = /^dam_(ancient|medieval|modern)(_\d+)?$/;
// The placement layer's own numbers (building-placement-layer.js): slots 16 world units apart, 24 up the tile.
const SLOT_SPACING = 16;
const SLOT_Y = 24;
// A pip's diameter as a share of the slot spacing on screen, measured on the 2026-10-31 captures at two zooms.
const PIP_SHARE = 0.85;
const PLACEMENT_LAYER = "fxs-building-placement-layer";
const pipState = { swapped: false, hooked: false, pips: [], root: null, frame: 0 };

function pipLog(m) { try { console.error("[Dams] " + m); } catch (_e) { /* ignore */ } }
function pipSafe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }

/** The sprite: a Bridge icon instead of a blank, for the three Dams only. */
function swapSpriteIcon() {
  const ui = globalThis.UI;
  const original = ui && typeof ui.getIconBLP === "function" ? ui.getIconBLP : null;
  if (!original) return;
  const lookup = function (id, ...rest) {
    const found = original.call(ui, id, ...rest);
    const key = typeof id === "string" ? id : null;
    if (key && PIP_STAND_IN[key] && (!found || PIP_PNG_NAME.test(String(found)))) return PIP_STAND_IN[key];
    return found;
  };
  try { ui.getIconBLP = lookup; pipState.swapped = ui.getIconBLP === lookup; } catch (_e) { /* read-only */ }
}

function pipRoot() {
  if (pipState.root && pipState.root.isConnected) return pipState.root;
  const el = document.createElement("div");
  el.id = "dams-slot-pips";
  const css = { position: "absolute", left: "0px", top: "0px", width: "100%", height: "100%", pointerEvents: "none" };
  for (const [k, v] of Object.entries(css)) el.style[k] = v;
  // Just above the map's own pinned icons and under every panel, as the sprite pips are: added at the end of the page
  // the Dam drew over the production panel when its tile scrolled under it (s8).
  const icons = document.querySelector("plot-icons-root");
  if (icons && icons.parentNode) icons.parentNode.insertBefore(el, icons.nextSibling);
  else document.body.insertBefore(el, document.body.firstChild);
  pipState.root = el;
  return el;
}

/** A bound element has to be in the page before its binding is set, or the binding never takes (s6, s7). */
function anchoredElement(parent, loc, offset, withOpacity) {
  const h = pipSafe(() => WorldAnchors.RegisterFixedWorldAnchor(loc, offset), -1);
  if (typeof h !== "number" || h < 0) return null;
  const el = document.createElement("div");
  el.style.position = "absolute"; el.style.left = "0px"; el.style.top = "0px";
  parent.appendChild(el);
  el.setAttribute("data-bind-style-transform2d", `{{FixedWorldAnchors.offsetTransforms[${h}].value}}`);
  if (withOpacity) el.setAttribute("data-bind-style-opacity", `{{FixedWorldAnchors.visibleValues[${h}]}}`);
  return { h, el };
}

function dropAnchor(a) {
  if (!a) return;
  pipSafe(() => WorldAnchors.UnregisterFixedWorldAnchor(a.h));
  pipSafe(() => a.el.remove());
}

function screenXY(el) {
  const m = /translateX\(([-\d.]+)px\)\s*translateY\(([-\d.]+)px\)/.exec(el.style.transform || "");
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}

function clearPips() {
  for (const p of pipState.pips) { dropAnchor(p.at); dropAnchor(p.ref); }
  pipState.pips = [];
  if (pipState.frame) { pipSafe(() => cancelAnimationFrame(pipState.frame)); pipState.frame = 0; }
}

function sizePips() {
  pipState.frame = 0;
  if (!pipState.pips.length) return;
  for (const p of pipState.pips) {
    const a = screenXY(p.at.el), b = screenXY(p.ref.el);
    if (!a || !b) continue;
    const size = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * PIP_SHARE));
    if (p.size === size) continue;
    p.size = size;
    p.img.style.width = size + "px"; p.img.style.height = size + "px";
    p.img.style.left = (-size / 2) + "px"; p.img.style.top = (-size / 2) + "px";
  }
  pipState.frame = requestAnimationFrame(sizePips);
}

function addPip(loc, slotX, type) {
  const url = pipSafe(() => UI.getIconURL(type), "");
  if (!url) return;
  const root = pipRoot();
  const at = anchoredElement(root, loc, { x: slotX, y: SLOT_Y, z: 0 }, true);
  const ref = anchoredElement(root, loc, { x: slotX + SLOT_SPACING, y: SLOT_Y, z: 0 }, false);
  if (!at || !ref) { dropAnchor(at); dropAnchor(ref); return; }
  const img = document.createElement("div");
  const css = { position: "absolute", width: "0px", height: "0px", backgroundImage: `url("${url}")`, backgroundSize: "100% 100%" };
  for (const [k, v] of Object.entries(css)) img.style[k] = v;
  at.el.appendChild(img);
  pipState.pips.push({ at, ref, img, size: 0 });
  if (!pipState.frame) pipState.frame = requestAnimationFrame(sizePips);
}

/** The types the layer gives a pip on this district, in its slot order: its realizeBuildSlots filter. */
function slotTypes(loc) {
  const ids = pipSafe(() => MapConstructibles.getConstructibles(loc.x, loc.y), []) || [];
  const kept = [];
  for (const id of ids) {
    const c = pipSafe(() => Constructibles.getByComponentID(id), null);
    const def = c ? pipSafe(() => GameInfo.Constructibles.lookup(c.type), null) : null;
    if (def && !def.ExistingDistrictOnly) kept.push(String(def.ConstructibleType));
  }
  return kept;
}

/** Where the layer puts each Dam's pip on a district. */
function damSlots(district) {
  const def = pipSafe(() => GameInfo.Districts.lookup(district.type), null);
  const max = def ? def.MaxConstructibles : 0;
  if (!max) return [];
  const loc = { x: district.location.x, y: district.location.y };
  const groupWidth = (max - 1) * SLOT_SPACING;
  const out = [];
  slotTypes(loc).forEach((type, i) => {
    const slotX = i * SLOT_SPACING + groupWidth / 2 - groupWidth;
    if (i < max && PIP_DAMS.includes(type)) out.push({ loc, slotX, type });
  });
  return out;
}

async function findPlacementLayer() {
  let LM = null;
  try { LM = (await import("/core/ui/lenses/lens-manager.js")).default; } catch (_e) { LM = null; }
  // The layer registers itself when its module loads, which can come after this script.
  for (let i = 0; i < 30; i++) {
    const layer = LM && LM.layers && LM.layers.get(PLACEMENT_LAYER);
    if (layer && typeof layer.realizeBuildSlots === "function" && typeof layer.removeLayer === "function") return layer;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function hookPlacementLayer() {
  const layer = await findPlacementLayer();
  if (!layer) { pipLog("slot pips: placement layer not found; the Bridge icon stands in"); return; }
  const realize = layer.realizeBuildSlots;
  layer.realizeBuildSlots = function (district, ...rest) {
    const r = realize.call(this, district, ...rest);
    try { for (const s of damSlots(district)) addPip(s.loc, s.slotX, s.type); } catch (e) { pipLog("slot pips: " + e); }
    return r;
  };
  const remove = layer.removeLayer;
  layer.removeLayer = function (...rest) {
    try { clearPips(); } catch (_e) { /* ignore */ }
    return remove.apply(this, rest);
  };
  pipState.hooked = true;
  pipLog("slot pips: the Dam's icon is drawn over its slot");
}

if (!globalThis[PIPS_KEY]) {
  globalThis[PIPS_KEY] = { state: pipState, clearPips, damSlots, standIn: PIP_STAND_IN };
  swapSpriteIcon();
  hookPlacementLayer();
}

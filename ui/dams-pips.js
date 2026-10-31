// dams-pips.js - Dams, a Civilization VII mod. Game scope.
//
// The building-slot pips under each urban tile (placement view) are map sprites, and a map sprite only draws an icon
// packed in the game's BLP textures. The Dam's icon is a PNG, so UI.getIconBLP hands back its file name and the pip
// stays blank, though the engine counts the Dam in the slot and the tile is a quarter with a building of its age
// (devtools s1-s3, 2026-10-31). Here the lookup answers with the base Bridge icon of the Dam's age instead: a structure
// across the river, drawn in the game's own style. Only names the PNG icon would give are swapped, so a Dam icon that
// some later version packs as a real BLP comes through untouched.
"use strict";

(() => {
  const G = globalThis;
  const KEY = "__damsPips";
  if (G[KEY]) return;
  const STAND_IN = {
    BUILDING_DAM_ANTIQUITY: "buildicon_ancbridge",
    BUILDING_DAM_EXPLORATION: "buildicon_expbridge",
    BUILDING_DAM_MODERN: "buildicon_modbridge",
  };
  const PNG_NAME = /^dam_(ancient|medieval|modern)(_\d+)?$/;
  const ui = G.UI;
  const original = ui && typeof ui.getIconBLP === "function" ? ui.getIconBLP : null;
  if (!original) return;
  const lookup = function (id, ...rest) {
    const found = original.call(ui, id, ...rest);
    const key = typeof id === "string" ? id : null;
    if (key && STAND_IN[key] && (!found || PNG_NAME.test(String(found)))) return STAND_IN[key];
    return found;
  };
  try {
    ui.getIconBLP = lookup;
  } catch (_e) {
    return;
  }
  G[KEY] = { swapped: ui.getIconBLP === lookup, standIn: STAND_IN };
  try { console.error(`[Dams] slot pips: ${G[KEY].swapped ? "Bridge icons stand in for the Dam" : "lookup not replaceable"}`); } catch (_e) { /* ignore */ }
})();

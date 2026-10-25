// look-urban.eval.js - a page helper for trying Dam looks on tiles that already hold buildings. Sent into a running
// game with `tower-bench eval "$(cat look-urban.eval.js)"` (look-urban.sh does this); it installs globalThis.__dl.
// Nothing here is saved: every overlay goes through the mod's own drawDam/clearDam, and the next sweep puts the
// shipping look back on any real Dam.
//   __dl.sites()            river tiles within 6 of the player's cities: urban (holding buildings), land, water
//   __dl.draw({x,y}, "EXPLORATION", "exp-big")   draw a named variant of an age's look on a tile (any tile)
//   __dl.clear({x,y})       take it off again
//   __dl.view(true|false)   hide / restore the HUD and the map layers, as the gallery probe does
//   __dl.look({x,y}, 0.08)  camera on the tile
(() => {
  const M = globalThis.__dams;
  if (!M) return "no mod";
  const safe = (f, fb) => { try { return f(); } catch (e) { return fb; } };
  const idx = (l) => GameplayMap.getIndexFromXY(l.x, l.y);
  const nav = (l) => safe(() => GameplayMap.isNavigableRiver(l.x, l.y) || GameplayMap.isWater(l.x, l.y), false);
  const D = { hidden: [] };

  D.sites = function () {
    const local = GameContext.localPlayerID;
    const p = Players.get(local);
    const centers = (safe(() => p.Cities.getCityIds(), []) || [])
      .map((id) => safe(() => { const c = Cities.get(id); return { x: c.location.x, y: c.location.y }; }, null))
      .filter(Boolean);
    const dist = (l) => Math.min(99, ...centers.map((c) => GameplayMap.getPlotDistance(c.x, c.y, l.x, l.y)));
    const W = GameplayMap.getGridWidth(), H = GameplayMap.getGridHeight();
    const out = { urban: [], land: [], water: [] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = { x, y };
      const r = M.riverAt(l);
      if (r == null) continue;
      const d = dist(l);
      if (d > 6) continue;
      const holds = M.occupants(l).map((o) => o.type);
      const e = { x, y, river: r, d, holds };
      if (nav(l)) { if (!holds.length) out.water.push(e); }
      else if (holds.length) out.urban.push(e);
      else out.land.push(e);
    }
    for (const k of Object.keys(out)) { out[k].sort((a, b) => a.d - b.d); out[k] = out[k].slice(0, 6); }
    return out;
  };

  // Variants: [asset, along the wall, downstream, scale, angle offset, placement], as DAM_LOOKS.
  const piles = (scale) => {
    const rows = [];
    const names = ["Ant1_Euro_Fortification_RockPile01", "Ant1_Euro_Fortification_RockPile02", "Ant1_Euro_Fortification_RockPile03"];
    for (let i = 0; i < 9; i++) rows.push([names[i % 3], -0.28 + 0.07 * i, 0, scale, (47 * i) % 360, "surface"]);
    for (let i = 0; i < 8; i++) rows.push([names[(i + 1) % 3], -0.245 + 0.07 * i, -0.05, scale * 0.9, (53 * i + 20) % 360, "surface"]);
    return rows;
  };
  D.V = {
    "ant-cur": null,
    "ant-big": [["Decal_Major_River_Rocks_A", 0, 0, 1, 0], ...piles(1.3), ["VFX_Riverfoam_Straight1_Short", 0, 0.16, 0.9, 90]],
    "ant-towers": [["Decal_Major_River_Rocks_A", 0, 0, 1, 0], ...piles(1.2),
      ["Walls_ANT_Stone_Tower_A", -0.36, 0, 0.7, 0], ["Walls_ANT_Stone_Tower_A", 0.36, 0, 0.7, 0],
      ["VFX_Riverfoam_Straight1_Short", 0, 0.16, 0.9, 90]],
    "exp-cur": null,
    "exp-big": [["IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 0.9, 0], ["NEU_NOR_Gristmill_WaterWheel", 0.3, 0.14, 0.5, 90],
      ["VFX_Riverfoam_Straight1", 0, 0.22, 1, 90]],
    "exp-arch": [["Great_Wall_River_Arch", 0, 0, 1.0, 0], ["Great_Wall_TowerA", -0.32, 0, 0.55, 0], ["Great_Wall_TowerA", 0.32, 0, 0.55, 0],
      ["NEU_NOR_Gristmill_WaterWheel", 0.18, 0.14, 0.5, 90], ["VFX_Riverfoam_Straight1", 0, 0.22, 1, 90]],
    "exp-gate": [["Walls_EXP_Gate_A", 0, 0, 0.8, 0], ["Walls_EXP_Tower_A", -0.3, 0, 0.8, 0], ["Walls_EXP_Tower_A", 0.3, 0, 0.8, 0],
      ["NEU_NOR_Gristmill_WaterWheel", 0.18, 0.14, 0.5, 90], ["VFX_Riverfoam_Straight1", 0, 0.22, 1, 90]],
    "exp-tall": [["IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT", 0, 0, 1.2, 0], ["NEU_NOR_Gristmill_WaterWheel", 0.34, 0.16, 0.6, 90],
      ["VFX_Riverfoam_Straight1", 0, 0.24, 1.1, 90]],
    "mod-tall": [["GEN_MOD_Harbor_Pier_HB", -0.3, 0, 1.2, 0], ["GEN_MOD_Harbor_Pier_HB", 0.3, 0, 1.2, 0],
      ["NAF_MOD_RadioStation_ElectricBox", 0.4, 0.22, 0.8, 0], ["VFX_Riverfoam_Thick_Straight1", 0, 0.28, 1.3, 90],
      ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, 0.14, 0.9, 90]],
    "ant-tall": [["Decal_Major_River_Rocks_A", 0, 0, 1, 0], ...piles(2.0), ["VFX_Riverfoam_Straight1_Short", 0, 0.18, 1.0, 90]],
    "ant-wall": [["Decal_Major_River_Rocks_A", 0, 0, 1, 0], ...piles(1.4), ["Walls_ANT_Stone_Gate_A", 0, 0, 0.9, 0],
      ["VFX_Riverfoam_Straight1_Short", 0, 0.18, 1.0, 90]],
    "mod-cur": null,
    "mod-big": [["GEN_MOD_Harbor_Pier_HB", -0.3, 0, 0.85, 0], ["GEN_MOD_Harbor_Pier_HB", 0.3, 0, 0.85, 0],
      ["NAF_MOD_RadioStation_ElectricBox", 0.36, 0.2, 0.7, 0], ["VFX_Riverfoam_Thick_Straight1", 0, 0.26, 1.2, 90],
      ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, 0.12, 0.8, 90]],
    "mod-towers": [["GEN_MOD_Harbor_Pier_HB", -0.26, 0, 0.7, 0], ["GEN_MOD_Harbor_Pier_HB", 0.26, 0, 0.7, 0],
      ["Walls_MOD_Tower_A", -0.4, 0, 0.8, 0], ["Walls_MOD_Tower_A", 0.4, 0, 0.8, 0],
      ["NAF_MOD_RadioStation_ElectricBox", 0.36, 0.2, 0.7, 0], ["VFX_Riverfoam_Thick_Straight1", 0, 0.26, 1.2, 90],
      ["VFX_WaterFall_Loop_AutoHeight_Medium", 0, 0.12, 0.8, 90]],
  };

  D.draw = function (l, age, variant) {
    const key = "AGE_" + age;
    const saved = M.looks[key];
    if (variant && D.V[variant]) M.looks[key] = D.V[variant];
    const d = { plot: idx(l), loc: l, river: M.riverAt(l), type: "BUILDING_DAM_" + age };
    M.clearDam(d.plot);
    const ok = M.drawDam(d);
    M.looks[key] = saved;
    return { ok, wall: M.wallAngle(l, d.river), onWater: nav(l), holds: M.occupants(l).map((o) => o.type) };
  };
  D.clear = (l) => { M.clearDam(idx(l)); return true; };
  D.look = (l, zoom) => { Camera.lookAtPlot(l, { zoom }); return true; };
  D.view = async function (on) {
    let LM = null;
    try { LM = (await import("/core/ui/lenses/lens-manager.js")).default; } catch (e) { LM = globalThis.LensManager || null; }
    if (LM) {
      if (on) safe(() => LM.setActiveLens("fxs-default-lens"));
      for (const layer of ["fxs-yields-layer", "fxs-culture-borders-layer", "fxs-hexgrid-layer", "fxs-resource-layer", "fxs-city-borders-layer"]) {
        safe(() => (on ? LM.disableLayer(layer) : LM.enableLayer(layer)));
      }
    }
    if (on) {
      for (const el of Array.from(document.body.children)) if (el.style.visibility !== "hidden") { D.hidden.push(el); el.style.visibility = "hidden"; }
      const t = document.getElementById("tooltips");
      if (t) { t.style.visibility = "hidden"; t.style.opacity = "0"; }
    } else {
      for (const el of D.hidden) el.style.visibility = "";
      D.hidden.length = 0;
    }
    return D.hidden.length;
  };
  globalThis.__dl = D;
  return "ok " + Object.keys(D.V).join(",");
})()

// tools.eval.js - page helpers for the look probes, sent with `tower-bench eval "$(cat tools.eval.js)"`.
// __t.draw(x, y, pieces) draws [asset, ox, oy, scale, angle, water?] on a plot (offsets in hex widths), clear(x, y) removes
// them, clip(x, y, h) / unclip() hold WorldUI.clipHexHeight on a set of plots every frame.
(() => {
  const g = {};
  globalThis.__t = {
    g,
    draw(x, y, pieces) {
      const k = x + "," + y;
      if (g[k]) g[k].clear(); else g[k] = WorldUI.createModelGroup("DamTry" + k);
      const out = [];
      for (const [a, ox, oy, sc, ang, water] of pieces) {
        const pl = water ? PlacementMode.WATER : PlacementMode.TERRAIN;
        try {
          if (a.startsWith("VFX_")) out.push(g[k].addVFXAtPlot(a, { x, y }, { x: ox, y: oy, z: 0 }, { angle: ang || 0, scale: sc || 1 }));
          else out.push(g[k].addModelAtPlot(a, { i: x, j: y }, { x: ox, y: oy, z: 0 }, { placement: pl, followTerrain: !water, needsShadows: true, scale: sc || 1, angle: ang || 0 }));
        } catch (e) { out.push("ERR " + e.message); }
      }
      return JSON.stringify(out.map((o) => (o && o.assetName ? o.assetName : o)));
    },
    clear(x, y) { const k = x + "," + y; if (g[k]) g[k].clear(); return "ok"; },
    clips: new Map(),
    clip(x, y, h) {
      this.clips.set(x + "," + y, { p: { i: x, j: y }, h });
      if (!this.loop) { const f = () => { for (const c of this.clips.values()) WorldUI.clipHexHeight(c.p, c.h); this.loop = requestAnimationFrame(f); }; f(); }
      return "clipping " + this.clips.size;
    },
    unclip(x, y) {
      if (x === undefined) this.clips.clear(); else this.clips.delete(x + "," + y);
      WorldUI.restoreAllHexHeight();
      return "clipping " + this.clips.size;
    },
  };
  return "ok";
})()

# Changelog

All notable changes to Dams are documented here. This project follows semantic versioning. The probes and harness
runs live in `devtools/`, outside the shipped files.

## [Unreleased]

## [1.0.0] - 2026-09-29

- A Dam for each age (Irrigation, Machinery, Electricity), placed on any river tile. A river takes one Dam of each
  age, so an older Dam can be joined by a newer one.
- A finished Dam protects every settlement on its river from flood pillage: the settlement holding it directly, the
  others through a Levee in their center.
- The valley is the price. A dammed river loses its floodplains, about 1 Food a tile, for good. Floods still come, are
  still reported and still leave silt behind; the engine offers no way to prevent that, only to stop the damage.
- Each age has its own look, growing with the age: a rough weir of heaped boulders, a stone ford with a gated
  arch, a concrete barrage with a spillway. Each has its own build icon.
- A settlement that loses its reason for a Levee (its Dam razed, its river tiles lost) loses the Levee a turn later.

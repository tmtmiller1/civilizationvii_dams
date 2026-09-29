# Changelog

All notable changes to Dams are documented here. This project follows semantic versioning. The probes and harness
runs live in `devtools/`, outside the shipped files.

## [Unreleased]

## [1.2.0] - 2026-09-29

- Flood protection now grows with the age. An Ancient Dam holds back moderate floods, a Medieval Dam moderate and major
  floods, and a Modern Dam every flood, the 1000-year flood included. Floods a Dam does not hold back pillage as they
  would without it. Each Dam's text says which floods it holds back.
- Levees follow the best Dam on their river: a newer Dam raises them to match at once, and razing it drops them back
  to the next best a turn later.
- Major and 1000-year floods have flood classes of their own. Every other source of flood immunity, from the base
  game or another mod, is widened to cover them, so it still protects against all three.

## [1.1.0] - 2026-09-29

- Dams can go on any river tile of the settlement, and Levees are placed, alongside compact-city mods that confine
  every building to the ring around the city centre. Those mods keep applying to every other building.
- Known conflict: Dams plus a mod that turns floods off: the Dam still dries the floodplains but protects against
  nothing.

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

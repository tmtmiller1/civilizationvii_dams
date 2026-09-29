# Changelog

All notable changes to Dams are documented here. This project follows semantic versioning. The probes and harness
runs live in `devtools/`, outside the shipped files.

## [1.3.0] - 2026-09-29

- AI players build Dams themselves, as they build any building, and only where a Dam guards something. The mod marks,
  for each AI, the river tiles of its settlements on each river that floods, has no Dam as good on it yet, and runs
  past at least two of the AI's own built-on tiles a flood would pillage. The game offers an AI the Dam there and
  nowhere else, and the AI decides when to build it. Before, the game's AI could put a Dam on any river tile it
  owned, most of them on rivers that never flood.
- A Dam needs a dam site on its tile, a marker the mod places. Your build and purchase lists offer every river tile of
  the settlement as before, and ordering a Dam marks its tile. A marked tile yields what it did. On an AI site that
  held a floodplain or woods the marker takes their place until the Dam is built or the site dropped.

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

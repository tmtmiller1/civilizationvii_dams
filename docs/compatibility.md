# Compatibility with other mods

Last reviewed 2026-09-29 against Dams 1.2.0 on Civilization VII 1.5.0.

This file records what Dams touches, which kinds of mod touch the same things, and what a player would see when
both are enabled. It was built by reading code, not by playing: 1,187 community mods in the reference corpus
(refreshed 2026-09-21), the mods installed on the development machine, and Tower's own mods. Each finding carries a
status line. "Read from code" means nobody has watched it in a game; treat it as a prediction with its reasoning
laid out, and the cheapest test that would settle it is named beside it. "Watched" points at a run in
[DESIGN.md](DESIGN.md).

Other authors' mods are described by what they do, not by name. The same mechanism usually appears in several mods,
and a player needs to recognise the kind of mod, not one title.

## What Dams touches

| Surface | What Dams does with it |
| --- | --- |
| Database (game scope, LoadOrder 150/151) | Adds `BUILDING_DAM_ANTIQUITY/EXPLORATION/MODERN` (Urban district, `RiverPlacement="RIVER"`, `MultiplePerCity`, Town), three Levees `BUILDING_DAM_LEVEE`, `_EXPLORATION`, `_MODERN` (City Center, `AGELESS`, `IGNORE_DISTRICT_PLACEMENT_CAP`, trait `TRAIT_DAMS_LEVEE`), their yields, one tech unlock row per age (Irrigation, Machinery, Electricity), six `GameModifiers` using `EFFECT_CITY_ADJUST_AVOID_RANDOM_EVENT`, Civilopedia exclusions for the Levees, icons. Keeps `AdjacentDistrict` empty on its buildings with a trigger (finding 1). |
| Flood classes (base rows) | Adds `CLASS_DAMS_FLOOD_MAJOR` and `CLASS_DAMS_FLOOD_1000_YEAR` and moves `RANDOM_EVENT_FLOOD_MAJOR` and `RANDOM_EVENT_FLOOD_1000_YEAR` into them; the moderate flood stays `CLASS_FLOOD`. Copies the `CLASS_FLOOD` rows of `RandomEventUI` and `Constructible_PillageRandomEvents` to the new classes, and appends both to every `RandomEventClass` modifier argument that names `CLASS_FLOOD`, except its own. Two triggers do the same for rows other mods add later (finding 14). |
| `Game.CityOperations` / `Game.CityCommands` | Wraps `canStart` and `canStartQuery` on both hosts. For a Dam it removes plots on a river that already has a Dam of that age. For every other building it returns the engine's answer untouched. Never widens an answer. |
| Map | `WorldBuilder.MapPlots.setFeature(NO_FEATURE)` on the floodplain tiles of a dammed river. Reads rivers once from `MapRivers` when the game loads. |
| Players' cities | `CREATE_ELEMENT` / `DESTROY_ELEMENT` of the Levee in settlement centres. |
| Events | `ConstructibleBuildCompleted`, `ConstructibleAddedToMap`, `ConstructibleRemovedFromMap`, `PlayerTurnActivated`. |
| Look | WorldUI model groups named `Dams_<plot>`. |
| Globals | `globalThis.__dams`. Dams saves no state of its own; it reads everything off the map. |

## Summary

| Kind of mod | Result | Status |
| --- | --- | --- |
| Gives every building a placement adjacency (ring or compact-city mods) | Dams keep their own placement, Levees placed | Watched |
| Turns floods off | The Dam protects against nothing and still dries the floodplains | Read from code |
| Makes floods more damaging | The Dam matters more; protection holds | Watched at 100 % damage |
| Emigration | Refugees leave a protected settlement after a flood, until Emigration's next release | Watched by Emigration's harness |
| Build Wonders Over Antiquated Buildings | A Wonder can replace an earlier-age Dam, ending its protection | Read from code |
| Gives bonuses for floodplains (civilization, belief and tradition mods) | Those bonuses are lost on a dammed river | Read from code |
| Gives flood immunity of its own | Still covers every flood; stacks harmlessly | Base sources watched; other mods tested on the database |
| Reads the flood class for anything else (narrative triggers, UI, disaster tallies) | Major and 1000-year floods carry a new class name | Read from code |
| Canals | Works together | Read from code |
| Another script that restricts where buildings go | Works in either order | Read from code |
| Replaces the production or purchase screen | Works if it builds its lists through the engine calls, which every one found does | Read from code |
| Rescales building costs or reshapes the tech tree | Dam arrives at a different time or price; nothing breaks | Read from code |
| Adds or removes rivers during play | Not seen until the next load | Read from code |
| Two copies of Dams installed at once | Unpredictable | Known engine behaviour |

No type, text key, icon ID, trait, modifier id, global or mod id in the corpus collides with Dams'. Other mods'
own canal improvements and river works use different type names.

## Findings

### 1. Mods that give every building a placement adjacency

Status: fixed and watched with Compact Cities 1.6, ring lock on (runs `d28`, `d28b`): all six Dams buildings keep no
adjacency while the base buildings are pinned, and a Levee is placed. A young settlement is still offered only the
river tiles beside its centre, with or without such a mod: that is the game's own rule for where a building goes, seen
with the ring lock off and the Dams wrapper off too (`d28d`, `d28e`).

Some mods confine buildings near the city centre with one database update that sets `AdjacentDistrict =
'DISTRICT_CITY_CENTER'` on every `BUILDING` except walls and full-tile buildings, run at a very high LoadOrder so it
lands after every other mod. Unfixed, it caught all four Dams buildings: a Dam could only go on a river tile touching
the centre, and a Levee, which may stand only in a City Center district, had to sit beside one too, so no tile could
take it and every other settlement on the river went unprotected.

`data/dams-placement.sql` installs a trigger at Dams' own load: whenever a later update writes `AdjacentDistrict` on
a Dams building, it clears it again. It does not depend on LoadOrder, so it holds however late the other mod runs,
and it touches no other building. Such a mod's trigger for buildings inserted after it loads does not reach Dams,
whose rows are inserted first.

### 2. Mods that turn floods off

Status: read from code.

Disaster mods that set `RandomEventFrequencies.OccurrencesPerAge` to 0 for the flood events leave the Dam nothing
to protect against. It still gives its yields and still takes the floodplain features off its river when finished,
so the player pays the cost for no benefit. The tooltip cannot know this. A player running such a mod should build
Dams for their yields only, on rivers with no floodplains worth keeping.

### 3. Mods that make floods more damaging

Status: watched for the protection itself (runs `d3b`, `d3c`, `d5`): with flood `CONSTRUCTIBLE_DAMAGED` at 100 %, a
protected city lost 0 of 4 farms over three floods while unprotected cities lost 8 of 9. Not run with a specific
disaster mod.

Mods that raise flood damage percentages or frequencies make a Dam worth more, and the protection holds for the
floods a Dam holds back, since it works on the flood class rather than on any one damage row. A mod that makes major or
1000-year floods more common makes the older Dams worth less, since those are the floods they let through. What it does not stop is the flood itself: the tiles
still flood and still gain the flood's yields, as in an unmodded game.

### 4. Emigration

Status: confirmed in game and fixed on the Emigration side, not yet released. Emigration's own harness ran the same
seeded game with Dams 1.2.0 twice (2026-09-29): with Emigration 3.1.2 a flood that reached a dammed settlement sent 4
population points out of it; with the fix, none.

Tower's Emigration mod turns disasters into distress that pushes citizens out of the struck settlement. Its size is
the larger of two numbers: the event type's damage percentage from the `RandomEventYields` and
`RandomEventDamages` tables, and the share of the settlement's tiles the event actually pillaged. A settlement a Dam
or Levee protects has nothing pillaged, but the first number comes from the flood type, not the settlement, and a
confirmed strike is also floored to a minimum. So a flood that did no damage to a dammed settlement still raises its
distress, and refugees leave.

What the player sees, until Emigration's next release: an Emigration disaster notice and refugees from a settlement
that lost nothing.

### 5. Build Wonders Over Antiquated Buildings

Status: read from code, not run.

That mod offers, as Wonder sites, urban tiles whose buildings are all from an earlier age. A Dam from an earlier age
qualifies (the Dams carry no `AGELESS` tag; the Levee does, and sits in the centre anyway). Placing a Wonder there
destroys the Dam. Dams notices the removal and sweeps: the holding settlement loses its protection at once, and the
Levees on that river are removed after being found orphaned on two different turns. The floodplains already dried
stay dry.

This is the player's choice and both mods behave as designed. It is listed because the loss of protection is not
announced.

### 6. Mods that give bonuses for floodplains

Status: read from code.

About forty mods in the corpus refer to floodplain features in gameplay data: civilization and leader abilities,
beliefs, traditions, start biases. The base game has such bonuses too. A finished Dam removes the floodplain
features from its river, so any bonus that needs a floodplain tile stops applying on that river, whichever mod
grants it. Start biases are unaffected (they are read at map creation). This is the Dam's intended cost; with such a
mod it can be a larger cost than the tooltip suggests.

### 7. Mods that give flood immunity of their own

Status: read from code.

Civilization reworks and tradition mods grant the same `EFFECT_CITY_ADJUST_AVOID_RANDOM_EVENT` for `CLASS_FLOOD`
(the Khmer Baray's effect) through their own modifiers. Since 1.2.0 Dams appends its two new flood classes to every such
argument, whether the other mod loads before Dams or after it, so that immunity still covers all three floods. About a
dozen mods in the corpus do this (Khmer reworks, traditions, leader abilities, crisis legacies), all through the
`RandomEventClass` argument. Two sources of the same immunity in one settlement change nothing, so a Dam or Levee
there is redundant but harmless.

### 8. Canals

Status: read from code, not run together.

Both mods wrap the same placement calls. Dams only narrows, for Dam types only; Canals narrows every non-Canal
building on an opened canal and widens only for Canals. The two work in either order.

- A Dam cannot be built on an opened canal: Canals refuses every other building there.
- A Canal cannot be started on a tile that holds a Dam: Canals never offers a tile holding buildings.
- A canal cut across a tile of a minor river leaves that tile in the river's plot list, so the settlement that owns
  the canal still gets a Levee for that river. No player-visible effect is expected.

### 9. Other scripts that restrict where buildings go

Status: read from code.

Dams' wrappers only ever narrow the engine's answer, and only for Dam types. Other wrappers that narrow (Tower's
National Park keeps buildings off park land) combine with it in any order. A wrapper that widens the answer for a
Dam would have to be written for Dams specifically; none exists.

Dams' `uninstall()` (a development hook, never called in play) puts back the functions it saved. If another mod
wrapped after Dams, that also removes the other mod's wrapper until reload.

### 10. Production and purchase screen replacements

Status: read from code; the one installed on the development machine was read in full, the rest by search.

The one-Dam-per-river rule reaches the lists because Dams rewrites the answer of `canStartQuery` and `canStart`.
Every replacement screen found in the corpus builds its lists by calling those on `Game.CityOperations` and
`Game.CityCommands` when it draws, so it receives Dams' answer.

### 11. Cost and tech-tree mods

Status: read from code.

Mods that multiply building costs apply after Dams loads (LoadOrder 500 against 150), so the Dam's price changes
with them. A Levee's cost is never paid, so a multiplier does nothing to it. Tech-tree mods in the corpus move
prerequisites and costs of Irrigation, Machinery and Electricity but none deletes those nodes or the Dam unlock rows,
so the Dam only arrives earlier or later.

### 12. Mods that add or remove rivers during play

Status: read from code. None found in the corpus; sandbox panels and map editors could.

Dams reads the map's rivers once, when the game loads. A river added by an editor mid-game has no Dam rule (any
number of Dams may go on it) and no Levees until the next load; a river removed keeps its old record until then. A
save and load puts it right.

### 13. Two copies of Dams

Status: known behaviour of the game.

A Workshop subscription and a manually installed copy both declare `tower-dams`. The game may load either one, and
a stale copy can shadow a newer one. Keep one copy: unsubscribe or delete the folder.

### 14. Mods that read the flood class for anything else

Status: read from code.

Since 1.2.0 the major and the 1000-year flood carry `CLASS_DAMS_FLOOD_MAJOR` and `CLASS_DAMS_FLOOD_1000_YEAR` instead
of `CLASS_FLOOD`. Flood immunity and flood pillage rows are widened automatically (finding 7). Anything else that
matches the name `CLASS_FLOOD` sees only moderate floods:

- One narrative mod in the corpus fires a gossip line when a flood kills a unit, keyed on `CLASS_FLOOD`. It stays
  silent for major and 1000-year floods. Nothing else changes.
- Tower's Emigration weighs a disaster's distress by its class. Emigration 3.1.2 and earlier do not know the new
  classes and give major and 1000-year floods the default weight (4 instead of a flood's 8), so they push fewer
  refugees out than before. Emigration's next release treats any class whose name contains `FLOOD` as a flood.
- UI mods that look up `CLASS_FLOOD` for the floodplain lens and its tooltip are unaffected: the lens marks floodplain
  tiles, not events, and the new classes carry the same tooltip and icon.

The base game names `CLASS_FLOOD` only in the three immunity modifiers, the flood tooltips and the bridge pillage
rows, all of which Dams widens.

# Dams: design

Status: 1.2.0 built and watched (runs `d26` to `d29`): protection graded by age, Levees by tier, save and reload, Compact
Cities, the age transition. A network game is unwatched.
Sibling of `tower_mods/canals`: a Dam is a building made through the ordinary production screen, placed on a river
tile (navigable or minor), that protects the settlements along that river from its floods.

## What the player gets

- A Dam building in each age (Irrigation, Machinery, Electricity), placeable on any river tile: a
  `TERRAIN_NAVIGABLE_RIVER` tile or a land tile with a minor river. One Dam per river.
- Once it is finished, floods on that river no longer pillage the improvements, buildings and districts of any
  settlement that owns a tile of the river. Floods still come and still leave their fertility.
- Its own model on the map and its own icon in the build menu.

## What the engine allows (watched 2026-09-28 on 1.5.0 unless marked)

The request was a Dam that stops floods on its river and the tiles beside it. Three findings reshaped that, and the
shape they left is the one the mod keeps: **a Dam spares the settlements along its river from flood damage while the
river still floods and still enriches them** (confirmed with the user, 2026-09-28). That is the behavior to design
toward; suppressing the flood itself is neither reachable nor wanted.

1. **A flood cannot be stopped or steered from script** (`d1`, `d2`). `Game.RandomEvents.applyEvent` starts nothing
   for any argument shape tried, and the flood chances read 0 every turn. Clearing a river's floodplain features does
   not stop that river flooding: the Karkheh flooded twice after all its floodplains were removed. So neither a
   script trigger for testing nor a "drain the floodplain" Dam exists.
2. **A flood covers exactly the river's original floodplain tiles** (`d2`). 27 of 27 flooded tiles were river tiles
   that held a floodplain at map creation; no bank tile ever flooded. So "the river and the tiles beside it" and "the
   river's floodplain tiles" are the same set in practice.
3. **The engine's flood immunity stops pillage, per settlement** (`d3b`, `d5`). `EFFECT_CITY_ADJUST_AVOID_RANDOM_EVENT`
   with `CLASS_FLOOD` (the Khmer Baray's effect) leaves the flood and its fertility in place and blocks the pillage,
   for the whole settlement. There is no requirement for "the same river as", so the per-settlement grain cannot be
   narrowed by data.

What that leaves, and what the mod does: the protection is the native immunity, given to every settlement on the
dammed river. A settlement holding the Dam has it from data (`data/dams-effects.xml`); `ui/dams.js` puts a Levee
(`BUILDING_DAM_LEVEE`: no slot, no citizen, never offered in production) in the center of every other settlement that
owns a tile of that river. The known difference from the request: a settlement that touches the dammed river and a
second river is protected on both (Carthage in `d5`: a Song Hong flood also damaged nothing). Unowned river tiles
hold nothing a flood could pillage.

**Graded by age (1.2.0).** Asked for 2026-09-29: an older Dam should protect less. The engine has no partial
protection: `EFFECT_CITY_ADJUST_AVOID_RANDOM_EVENT` takes only a class, and `RandomEventDamages` sets a flood's damage
share for everyone. But the base game files all three floods under `CLASS_FLOOD` while giving each its own
`RandomEvents` row, so `data/dams-floods.xml` and `.sql` move the major and the 1000-year flood into classes of their
own and each age's Dam names the classes it holds back: Ancient the moderate flood, Medieval the moderate and major,
Modern all three. Everything else that names `CLASS_FLOOD` (the three base immunities, the flood tooltips and icons, the
bridge pillage rows, and any other mod's immunity, through two triggers) is widened so the split changes nothing but
the Dams. Weighting each flood by `RandomEventFrequencies` and its `CONSTRUCTIBLE_DAMAGED` share (20/40/60 %), the
damage a Dam prevents is about 17/50/100 % at Light (the default), 29/57/100 % at Moderate and 36/73/100 % at Heavy.
Each settlement's Levee matches the best Dam on its rivers (`leveePlan` in `ui/dams.js`). Watched in `d26`, `d26b`,
`d27`, `d27b`. The rejected alternative was a per-turn chance to hold (a hidden shield switched on by a roll): it only
needed known verbs, but a Dam that randomly fails reads as a bug.

Units are not covered. The engine has a unit-side immunity (`EFFECT_UNITS_IMMUNE_TO_RANDOM_EVENTS`) but no
requirement that ties a unit to a river or a settlement's land, so it would have to cover all of a player's units.

## The runs

Harness: `devtools/harness/run-harness.sh` (trimmed copy of the Canals runner; new seeded Play Now games only).
Probe data: `devtools/probe-floods` (floods 300 times per age, and in `d5` every flooded constructible pillaged),
`devtools/probe-grant` (Dams unlocked at turn 1). The engine logs every flood to `Logs/Game_RandomEvents.csv`; the
harness collects it as `<label>-Game_RandomEvents.csv`.

| Run | Question | Verdict |
| --- | --- | --- |
| `d1` | Script surface; can a script start a flood? | `applyEvent` starts nothing; `isFloodable`/`isFlooded` are fields of `MapRivers.getRiver(id)` |
| `d2` | Which tiles flood; does clearing a floodplain stop it? | Only original floodplain tiles; clearing does not stop the river flooding |
| `d3b` | Does the immunity stop the flood on a warded city's river? | No: the flood and its fertility land as before |
| `d3c` | Does it stop pillage? | Inconclusive: 0 tiles damaged anywhere in 32 floods at base damage rates |
| `d5` | The mod end to end, every flooded constructible pillaged | Dammed river 0 of 4 farms pillaged; other rivers 8 of 9 |
| `d4` | Placement, a real build, candidate meshes, icon | Minor river offered, built, completed; one Dam per river holds; panel not captured |
| `d8` | Can the silt be taken away? | A river whose floodplains were cleared gained nothing from its flood; the untouched river gained on 3 of 5 tiles. Clearing costs about 1 Food a tile at once |
| `d9` | The mod end to end | The sweep dried all 7 floodplains of its river (`sweep: 1 dams, 1 drawn, 0 levees placed, 7 floodplains dried`), Food 2 to 1 on the minor tiles. Did not discriminate on enrichment: one flood each side, neither gained. Mesh pass captured the advisor screen |
| `d10` | The undammed baseline on the two rivers that flood most | No Dam landed (the `CREATE_ELEMENT` was aimed at unclaimed land and was silently dropped), so both rivers ran as controls: river 9 gained +5 Food across 8 floods, river 13 +4 across 3. This is the "before" of the pair |
| `d12` | The same river, dammed | Could not place: river 9 runs through unclaimed land, so no settlement could buy in. Superseded by `d13`, which calls the mod's own `dry()` on that river |
| `d13` | The same river, dried by the mod's own `dry()` | +5 Food over the same 8 floods, exactly as undammed in `d10`; drying cost 2 Food up front. Disproves the `d8` reading |
| `d14` | Does a flood enrich, and does the floodplain matter? | Yes and no: +1 Food or Production on 1-3 tiles per flood, on dried rivers (11 of 15) as much as floodplain ones (5 of 5) |
| `d15` | Can the gain be written back? | No. `setFertility` moves the fertility type but not the yields; a `setTerrain` round trip does not either |
| `d21d` | The three ages' Dams side by side, drawn by the mod's own `drawDam` | Ordering right: the ancient weir smallest, the modern barrage largest. The first attempts shot a wonder cinematic (see below) |
| `d24` | Hero shots, one per age, on open river | Medieval ford and modern barrage read clearly; the ancient weir at 0.26 was invisible among the river's own rocks, then a line of piles at 0.44-0.5 that ran along the channel, not across it (`d24-ant5`), now a two-row berm across it (`d24-ant6`) |
| `d22`, `d23` | Save and reload | Dam read back and redrawn; the Levee in the non-holding city intact at load, after the first sweep and a turn later; the holding city has none |
| `g1-*` | The in-game production list | "Medieval Dam" and "Modern Dam" rows carry their icons among the base buildings. Antiquity's row was absent because the capital owned no river tile yet, the Gristmill's rule |
| `d6` | Navigable placement, the icon in the list, the meshes | Navigable AND minor offered and both built; the row reads "Dam" with `dam_128.png` bound; the Levee is correctly absent; meshes inconclusive (all four drew on one tile) |
| `d26` | 1.2.0: the flood split in the database; moderate floods against each tier | Floods still fire after the split (severity 0 and 1 in `Game_RandomEvents.csv`, fertility as before). Moderate floods pillaged the control 6 of 6 times and no protected tier's farms. The new classes had no plot icon (fixed: the base `CLASS_FLOOD` also has a context-less row) |
| `d26b` | The same with only major and 1000-year floods | Every tier as designed: Ancient Levee pillaged by major (2) and 1000-year (3); Medieval Levee held major (2), pillaged by 1000-year (1); Modern Levee held major (4) and 1000-year (2). One Song Duong flood logged 1 damaged tile while the Modern-Levee settlement's farms stayed intact; the count is river-wide and was not traced |
| `d27` | Levee tiers in play | 22/22: text and icons; Ancient Dam raises the Ancient Levee in the other settlement; a Modern Dam upstream puts the Modern Levee in at once and removes the Ancient one a turn later; razing it brings the Ancient Levee back at once and removes the Modern one a turn later. Saved as `DAM-d27` |
| `d27b` | `DAM-d27` reloaded | 4/4: Levees back with the save, untouched by the first sweep after the load and a turn later; both Dams drawn |
| `d28` | Next to Compact Cities 1.6, ring lock on (Antiquity) | The ring lock was live (Library, Granary, Monument pinned to the centre) and the four 1.1.0 types kept no adjacency, but the two new Levees were pinned: `dams-placement.sql` listed only the old four. Fixed |
| `d28b` | The same in Exploration, after the fix | 8/9: all six types keep no adjacency; an Ancient Dam put the Levee in the other settlement on its river. C2 asked for the wrong age's Dam (fixed in the probe) |
| `d28d`, `d28e` | Why a young capital is offered only the river tile beside it | The same with Compact Cities off (`d28d`) and with the Dams wrapper off too (`d28e`): the engine itself offers only (58,37) of four owned river tiles. It is the game's own rule for a building's tile, not Compact Cities and not Dams |
| `d29` | A Medieval Dam across the Exploration to Modern transition (`dam-short-age-probe`) | 7/7: still on the map, complete and drawn; the other settlement's Medieval Levee carried over (the settlement's id changed with the age, the Levee stayed); floodplains still dry; the Medieval modifiers and the flood split present in the Modern database |

## Placement, build and completion

- `RiverPlacement="RIVER"` (the base Bridge and Gristmill rule), `DISTRICT_URBAN`, `MultiplePerCity`, per-age tech
  unlock files (a node exists only in its own age's database).
- `ui/dams.js` wraps `canStart` and `canStartQuery` on `Game.CityOperations` (BUILD) and `Game.CityCommands`
  (PURCHASE): a plot on a river that already has a Dam, finished or queued, is refused with `LOC_DAM_RIVER_TAKEN`.
- No bookkeeping: every sweep (load, each local turn, each Dam completion) reads the Dams off the river tiles, so a
  bought Dam, an AI's Dam and a settlement founded later are all caught within a turn.
- Multiplayer: `CREATE_ELEMENT` is local, so no Levees in a network game; the Dam still protects its own settlement.

## Visuals

- **3D.** A new building type cannot get a model through `VisualRemaps` (engine-closed.md), so `ui/dams.js` draws the
  Dam with `WorldUI` model groups across its river, one look per age in the manner of Canals: rocks, then masonry,
  then concrete (`DAM_LOOKS`).
  - **Ancient: a rough weir.** Seventeen `Ant1_Euro_Fortification_RockPile*` at 0.7-0.8 in two staggered rows,
    packed 0.07 apart so they overlap into one berm, over a river-rock decal, with foam below. The low pieces are
    seated with `PlacementMode.WATER` on navigable water: `TERRAIN` puts them on the riverbed and they drown out of
    sight (`d24-ant2`). A scatter of piles read as the river's own rocks, and a single row of small piles read as
    sparse; it has to be a filled-in line (`d24-ant4`, `d24-ant6`).
  - **Across the flow, bank to bank.** `wallAngle` lays every look along the hex axis that has land at both ends,
    preferring the one with the most water on its flanks. `flowAngle`, the average bearing of the tile's river
    neighbors, is only the fallback: at a fork or a river mouth it averages two branches and comes out near 90
    degrees off, which laid the ancient weir along the channel (`d24-ant5`: old 60, new 0). On a straight channel
    the two agree up to a half turn (`d24-EXPLORATION-w`, `d24-MODERN-w`: old 120, new 300).
  - **Medieval: a stone ford.** `IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT` at 0.45, the Great Wall where it fords a
    river: stairs down each bank and a gated arch across the flow (`d18`, `d24-exp`).
  - **Modern: a concrete barrage.** Two `GEN_MOD_Harbor_Pier_HB` end to end at 0.55 with cranes along the crest,
    `VFX_WaterFall_Loop_AutoHeight_Medium` pouring through the spillway and heavy foam below (`d24-mod`).
  - **They grow with the age.** Scale numbers mean nothing across meshes of different native size; the ordering was
    set from all three drawn in one frame (`d21d`). Effects must go through `addVFXAtPlot`, not `addModelAtPlot`.
  - **Rejected, with what they look like:** the dockyard gatehouse (a compact building, lost among rooftops),
    terrace farms and Machu Picchu cliff tops (large terraced settlements), the Highland Power Station set (bare
    rock), the factory (a smokestack that dwarfs the river).
- **Capturing.** The HUD, the map overlays and the active lens all have to come off, or the picture is of the
  interface: see the engine-closed entry on captures for the recipe and the zoom values. A Dam placed through the
  production screen lands wherever the settlement happens to own river, which on a young capital is the urban core,
  so the gallery probe chooses an open tile and buys it instead.
- **Build-menu icon.** `icons/dam.png` (256 x 256), drawn in `icons/src/dam-icon.svg` and set inside the base game's
  gold ring by `icons/src/build-icon.py`; imported by the modinfo (`ImportFiles`) and bound by `data/dams-icons.xml`
  (`UpdateIcons`). `UI.getIconURL("BUILDING_DAM_ANTIQUITY")` returns `fs://game/tower-dams/icons/dam.png` (`d4`).

## The silt cannot be taken away

Asked for 2026-09-28, after the protection was watched: a dammed river should **stop enriching its tiles**, as the
price of the safety. That cannot be built, and the mod no longer claims it.

What a flood actually does, read seconds after it lands (`d14`): it permanently raises the Food or Production of one
to three tiles of the river it hits, by 1 each. It does this just as readily on a river whose floodplain features have
been removed (11 of 15 floods moved tiles on dried rivers against 5 of 5 on floodplain ones), so **the floodplain is
not what carries the enrichment** and clearing it costs only the floodplain's own yield.

The false trail, recorded so nobody walks it again: `d8` cleared one river's floodplains and its single flood added
nothing, while an untouched river gained across four floods. That looked like the answer, and it was one flood. `d13`
ran the same seed and the same river as the undammed `d10`, and both rose by exactly +5 Food over the same 8 floods;
the drying only cost 2 Food up front. Tile yields drift over 24 turns for reasons that have nothing to do with floods,
so a measurement spread over many turns says nothing. Read the yields immediately either side of one flood.

Nor can the gain be written back (`d15`): `WorldBuilder.MapPlots.setFertility` does move
`GameplayMap.getFertilityType` (it takes `(loc, v)` or `(v, loc)`, not `(index, v)`), but Food and Production do not
move with it, through thirteen write shapes and a `setTerrain` round trip. Fertility is a separate map property from
whatever the flood writes.

**What the Dam costs instead:** `dry()` in `ui/dams.js` takes the floodplain features off the dammed river, about 1
Food a tile, permanently. The valley below the Dam dries out, which is a price the player can see on the map, and it
is what the mod's text says. It is a design choice rather than a mechanism: it does not stop the silt, because
nothing can.

## Player-facing behavior, and what is not covered

Handled, after a pass through the mod from the player's side:

- **Upgrading.** A river takes one Dam of each age, so a river dammed in Antiquity can take a Medieval Dam later.
  Blocking it would have left the player stuck with the weakest Dam for the rest of the game.
- **Levees follow their reason.** A settlement that no longer owns a tile of a dammed river (its Dam razed, its
  river tiles traded or lost) has its Levee removed. Only once it has been orphaned on two different turns: the first
  sweep after a load can run before the map's buildings read back, and would otherwise strip every Levee (`d23`).
- **No double entries.** The settlement holding a Dam is covered by the Dam and gets no Levee, so its building list
  does not show both.
- **Bought Dams appear at once.** A purchase lands complete with no completion event, so the mod also listens for a
  Dam added to or removed from the map.
- **The Levee stays out of the Civilopedia's buildings**, where a player would go looking for how to build one.
- **Floods still show.** The Dam's text says floods still come and are still reported, and simply do no damage, so a
  flood notice beside a new Dam does not read as the mod failing.

Not covered:

- A dried floodplain stays dried if the Dam is later razed.
- The flood-risk lens stops marking a dammed river's floodplains once they are dried, though floods still come.
- An AI's Dams are placed by the AI's own rules, which the one-per-age check does not see.
- A network game is unwatched.
- A Dam goes where the game lets the settlement put a building. A young settlement is offered only the river tiles
  beside its centre (`d28e`, with the mod's wrapper off), so "any river tile" means any the settlement could build on.

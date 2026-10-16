# Dams: design

Status: 2.0.0 built and tested in single player (2026-10-01, runs `e1` to `e5b`): every rule a player meets moved
into data, so single player and a network game play alike; see "2.0.0: data only" below. A network game is open
(`e6`). 1.3.0 tested in Exploration games (runs `v1` to `v1c`); 1.2.0 tested (runs `d26` to `d29`): protection
graded by age, Levees by tier, save and reload, Compact Cities, the age transition. An AI nudge (`data/dams-ai.xml`,
+200 for every major leader) is built and checked against the compiled database, and waits on its lab run; see "The AI
and Dams" below.
Sibling of `tower_mods/canals`: a Dam is a building made through the ordinary production screen, placed on a river
tile (navigable or minor), that protects the settlements along that river from its floods.

## What the player gets

- A Dam building in each age (Irrigation, Machinery, Electricity), placeable on any river tile: a
  `TERRAIN_NAVIGABLE_RIVER` tile or a land tile with a minor river. Each Dam of an age a settlement has adds about a
  quarter of the base cost to the next one there.
- It yields Food and Production on any river. Once it is finished, floods no longer pillage the improvements,
  buildings and districts of its settlement, and in single player of every settlement that owns a tile of the river.
  Floods still come and still leave their fertility.
- Its own model on the map and its own icon in the build menu.

## What the engine allows (runs of 2026-09-28 on 1.5.0 unless marked)

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
Each settlement's Levee matches the best Dam on its rivers (`leveePlan` in `ui/dams.js`). Runs `d26`, `d26b`, `d27`
and `d27b`. The rejected alternative was a per-turn chance to hold (a hidden shield switched on by a roll): it only
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
| `e1`, `e1b` | 2.0.0 in Antiquity, the mod alone (`damh-game-e1.js`) | The data as shipped; the Ancient Dam locked until Irrigation (its `NeededUnlock` is the Irrigation node's row index) and open once Irrigation was researched by rolling turns (turn 28); offered tiles are river tiles with no marker; a real BUILD order queued with no marker; one finished Dam is exactly +2 Food, +2 Production, -1 Gold; drying cleared its river. Cost did not move (150, 150, 150): see `e1c*` |
| `e1c2`-`e1c5` | Which cost model raises a Dam's price | Bought with the game's PURCHASE: `PREVIOUS_COPIES` 25 leaves it (two Medieval Dams at 1,100 Gold each, `e1c3`); `PREVIOUS_COPIES_CITY` 25 takes the second in a settlement to 300 (`e1c4`), so Param1 is flat Production; at 70 to 345 (`e1c5`). Two Dams on one river in one settlement both landed (river 61). The Monument's 5 % per building did not move in `e1c2` |
| `e2`, `e2b` | Overtopping in Exploration (`dam-floodfreq-probe`, the game's own pillage shares) | `e2`: almost every flood moderate, an Ancient Dam held them. `e2b` (major and 1000-year only): an Ancient Dam pillaged by 3 of 3 major floods (Tarim), a Medieval Dam held 3 (Vistula); no 1000-year flood came in Exploration |
| `e2c` | The same in Antiquity, Dams of all three ages placed by script | Exactly the table: Ancient pillaged by major (Karkheh) and 1000-year (Awash, Karkheh); Medieval held a major and was pillaged by a 1000-year (Song Duong); Modern held a major and three 1000-year floods with its farms intact (Sejenane), and its settlement's other river too (Grijalva) |
| `e2d`, `e2e` | Does a settlement keep its immunity while its Dam is pillaged | `e2d`: all three tiers held every moderate flood (Ancient: 9 hits). `e2e` (major 300, moderate 30, Ancient Dams only): Karkheh's Dam, pillaged on turns 22 and 25, was still pillaged when a moderate flood came on turn 46, and that flood pillaged a farm (7,12). A pillaged Dam protects nothing until repaired. The AI repaired some Dams the next turn, others not for 20 turns |
| `e3`, `e3b` | 2.0.0 in Modern, the mod alone | Cost 600, 750, 900 with one and two Modern Dams in the settlement; one Dam +4 Food, +6 Production, -3 Gold; drying. Before Electricity the Dam is refused with no `NeededUnlock`, as is the base Laboratory (also Electricity) |
| `e4` | The game's AI over 60 turns of Autoplay, Exploration, Dams unlocked at turn 1 (`damh-game-u1.js`, `AI_VERBOSE`) | No Dam built. The broker weighed the Medieval Dam 582 times at a mean of 558 (max 1,056): about the Gristmill (651) and the Harbor (582), well under what it builds first (Temple 2,198, Kiln 1,980). No spam; also no use |
| `e5a`, `e5b` | A 1.3.0 save with dam-site markers, loaded with 2.0.0 (`MODSRC` = v1.3.0) | 1.3.0 marked 3 AI sites, one over a desert floodplain; loaded with 2.0.0 all 3 were lifted ("old dam sites: 3 of 3 lifted"), the floodplain was back, the record emptied |
| `e6`-`e6c` | A LAN game hosted alone (`damh-shell-lan.js`, `LAN=1`) | `e6`: the game started, read `isNetworkMultiplayer` true, the mod logged its network path; no Dam tile was offered to the capital and the run did not record why (the LAN game ignored the seed: 58 rivers). `e6b`, `e6c`: the lobby never opened a session, the game never started. Open |

## Placement, build and completion

- `RiverPlacement="RIVER"` (the base Bridge and Gristmill rule), `DISTRICT_URBAN`, `MultiplePerCity`, per-age tech
  unlock files (a node exists only in its own age's database).
- The limit is the price: `CostProgressionModel="COST_PROGRESSION_PREVIOUS_COPIES_CITY"` (the Ancient Walls' model)
  with `CostProgressionParam1` a flat 40 / 70 / 150 Production per Dam already in the settlement, plus Gold upkeep
  (`Constructible_Maintenances`). Runs of 2026-10-01: `Constructible_BuildingCostProgressions` only feeds
  `PREVIOUS_BUILDINGS_CITY` and did nothing on its own (`e1`, `e1b`); the empire-wide `PREVIOUS_COPIES` (Settlers'
  model) leaves a building's price alone (`e1c3`: two Medieval Dams bought at 1,100 Gold each); `PREVIOUS_COPIES_CITY`
  at 25 took the second to 300 (`e1c4`), so Param1 is flat Production, and at 70 to 345 (`e1c5`). The cost read
  `city.Production.getConstructibleProductionCost` shows it; the Monument's 5 % per building did not move in `e1c2`.
  The 1.0.0 to 1.3.0 one-Dam-per-river wrapper on `canStart` is gone (2.0.0).
- No bookkeeping: every sweep (load, each local turn, each Dam completion) reads the Dams off the river tiles, so a
  bought Dam, an AI's Dam and a settlement founded later are all caught within a turn.
- Multiplayer: `CREATE_ELEMENT` is local, so no Levees in a network game; the Dam still protects its own settlement.

## 2.0.0: data only (2026-10-01)

1.3.0 could not be built at all in a network game: `Constructible_RequiredFeatures` required the dam-site marker in
every game, and `ui/dams-sites.js` placed none when `isNetworkMultiplayer`, since a feature write is local (found by
reading the code; not run). The user asked for single player and multiplayer to work the same, as simply and as
crash-free as possible, with Dams buildable on any river tile, worth it for yields and for protection, balanced, and
not spammed by the AI.

- Every rule is in data. The site requirement, the +3,000 AI bias (`dams-ai.xml`) and the one-per-river wrapper are
  gone. A rule only the script enforces binds neither the AI (its builds do not pass through `canStart`) nor anyone
  in a network game the script cannot write in.
- Not one per river, because the data cannot say "on the same river as". One per settlement (`MultiplePerCity`
  false) can be said, but the user wanted a settlement on two rivers to dam both.
- Per settlement, not per player: no cost model counts a building across the empire (`e1c3`), so the price rises
  within a settlement only. The Gold upkeep is what weighs on an empire full of Dams.
- The AI should not spam Dams. At the game's default weighting and the 1.2.0 price the AI weighed the Dam 573 times
  in 60 turns of `u1` and built none. The new Dam is cheaper for its yield, so it should build some; the rising cost
  bounds how many. How often it does is still to be seen.
- Yields are set against the base buildings: Gristmill 175 for +4 Food, Sawmill 175 for +3 Production, Factory 780
  for +12 Production with 4 Gold and 4 Happiness upkeep, each with adjacencies. Dams: 150 / 275 / 600 for +2+2 / +3+3
  / +4+6, 1 / 2 / 3 Gold, no adjacencies; a little under for the protection, and no longer the 1.2.0 price of 250 /
  450 / 750 for +2+1 / +3+2 / +3+4, which a Dam on a river that never floods did not repay.
- Overtopping (the user asked for "a pillaged Dam causes a flood"; a script cannot start one, so the reverse):
  `Constructible_PillageRandomEvents` is the chance a flood class pillages a building (base: Ancient Bridge 100,
  Modern Bridge 0), not an event a pillage sets off. Each Dam is 100 for the classes it cannot hold and 0 for the
  rest (`data/dams-floods.xml`). A flood reaches only original floodplain tiles, so a Dam elsewhere is never
  overtopped. The Levee plan skips a Dam whose instance reads `damaged`.
- Single player keeps the script's extras (the user's call): the Levees and the drying of the dammed river's
  floodplains, both local writes and so skipped in a network game. Everything else is the same in both modes.
- Old saves: `FEATURE_DAMS_SITE` stays defined so a 1.3.0 save loads, and `ui/dams-sites.js` now only lifts its
  markers and puts back what each replaced (`Dams_Sites_v1`), outside a network game.

## The AI and Dams (2026-10-15)

The owner decided on 2026-10-15 that the game's AI should build Dams. In `e4` it weighed the Medieval Dam 582 times in
60 turns and didn't build one. This section reads how the AI scores a Dam, picks the nudge, and sets out how to measure
it. Status: built in data and checked against the compiled database; not yet run in a game. Until the lab run below
passes, the README and the lines elsewhere in this file still describe an AI that doesn't build Dams.

### What the AI reads

Source: the compiled database of a clean 1.5.0 launch at 15:07 on 2026-10-15, every DLC and the 16 Tower mods on,
Dams 2.0.3's data in it (Antiquity, seed 4242;
`~/.tower-bench/runs/2026-10-15T19-07-19/gameplay-copy-usualset-antiquity-seed4242-20261015-150736.sqlite`: 917
`AiFavoredItems`, 390 `AiLists`, 79 `PseudoYields`). A compiled database holds one age's lists. For the Modern age, a
compiled Modern database of 2026-10-12 without Dams (`other_peoples_mods_analysis/_debug-db/gameplay-copy.sqlite`).
There's no compiled Exploration database on this Mac, so its lists come from the base game's
`age-exploration/data/ai-exploration.xml`, read as source and marked "source" below.

- Not one row mentions the Dam. The AI lists never name it, and the three Dams don't carry a tag (`TypeTags`), so the
  tag lists pass them by too.
- For everyone:
  - `TRAIT_LEADER_MAJOR_CIV` is held by `LEADER_DEFAULT` alone, and all 38 major leaders inherit from it; the
    independents and the 7 city-state leaders don't. Bound to it: `Major Yield Biases` (Culture +100, Science +100),
    the settling, tactical and operation lists, and Canals' `Canals Site Priority` (+3,000 on its four Canal buildings,
    which its site markers hold to their sites).
  - Age lists, bound to the age's civilization trait: `Antiquity Constructible Biases` (Garden -50) and `Antiquity Tag
    Biases` (PRODUCTION +100) on `TRAIT_ANTIQUITY_CIV` and `TRAIT_ANACHRONISTIC_CIV`; `Modern Tag Biases` (PRODUCTION
    +100) on `TRAIT_MODERN_CIV` (the Modern database). Exploration declares its three lists and never binds them
    (source; engine-closed.md, "The Exploration AI bias lists are unbound"), so in `e4` the age lists left every
    building alone.
  - Strategy lists, bound to a strategy instead of a leader and on while a city or victory strategy runs
    (`Strategy_Priorities`): constructible biases for the Factory 2,000, Port and Rail Station 1,000, Academy 800,
    Department Store, Airfield and Launch Pad 500, Library 400, Museum and Nalanda 200, Mundo Perdido 50; yield biases
    (`CityStrategyFoodBias` Food +100, `CityStrategyProductionBias` Production +200, `CityStrategyHappinessBias`
    Happiness +100, and smaller legacy-path ones); Exploration's coastal `CityStrategyBuildingsBiases` (Fishing Quay
    +200, source).
- Per leader: 43 of the 51 `ConstructibleBiases` lists are bound to one civilization's or one leader's trait. Near the
  Dam's role: the Harbor +25 for Yi Sun-sin only; the base game's own flood guards, the Baray +200 for Khmer and Maurya
  and the Water Puppet Theater +200 for Đại Việt; the Temple +200 for Abbasid, Bulgaria, Hawaii and Majapahit. The
  Gristmill doesn't appear in the Antiquity database's lists, the Modern one's, or Exploration's source.
- `PseudoYields`: 79 rows, none for floods, random events or protection (the nearest are City Defenses 25 and Repair
  Bonus 10,000). A pseudo-yield is the AI's price for one kind of effect, the same for every item that has it, so it
  can't single out a building. None of the 39 `PseudoYieldBiases` lists (31 per leader, 8 per strategy) is about floods.

What reaches the Dam and nothing else, for every leader, is a `ConstructibleBiases` row naming it on a list bound to
`TRAIT_LEADER_MAJOR_CIV`: the shape 1.3.0 shipped and Canals uses in the same database. Each alternative reaches more
than the Dam or misses an age. A tag such as PRODUCTION is also read by rules (two Great Britain requirements and a
narrative event in the compiled database pick buildings by it), and the tag lists are bound in Antiquity and Modern but
not Exploration. A pseudo-yield's default moves every item with that effect. The yield and strategy lists move every
building with that yield, and only while a strategy runs.

### The nudge: +200

The score law (engine-closed.md, same entry): Final = base × (1 + V/100). It holds in the broker itself: the same Dam,
Pārsa (6,13) on turn 8, scored 467.969 unraised (`v1`) and 2,339.863 at +400 (`v1b`, ×5.000), and 14,507.176 at
+3,000 on turn 6 (`v1c`, ×31.000). Its discounted value, the number a commit carries, moved by the same factor:
352.801, 1,764.035, 10,937.047.

The target is what the AI committed to in `e4` (seed 9001, Exploration, 60 turns; `e4-AI_ConstructibleBroker.csv`,
read with `devtools/harness/broker-dams.mjs`). A commit (`MARKRUNNING`) carries the item's discounted value, so the Dam
is read on the same footing: discounted, its median was 417 and its mean 456 (the 558 quoted for `e4` is the same rows
before the discount).

| `e4`, discounted values | p10 | p25 | median | max |
| --- | --- | --- | --- | --- |
| Every commit (138) | 979 | 1,634 | 3,100 | 92,378 |
| Commits in a settlement-turn that weighed the Dam (78) | 1,474 | 2,045 | 3,603 | 37,579 |
| The Dam, unraised (582) | 146 | 297 | 417 | 936 |
| The Dam at +200, ×3 | 438 | 891 | 1,251 | 2,808 |

The Dam was weighed in 9 of the 33 AI settlements, the ones with a river tile it could go on, one tile per
settlement-turn. In the 78 settlement-turns where it was weighed and something was committed, the commit scored 1.65 to
194 times the Dam (median 9.88). Those ratios have one gap: 15 fall between 1.65 and 2.97 (Stonecutters, Observatories,
Kilns, Wharves, Taverns, a Sawmill, a Trading Factory and a Wonder), the next is 3.53, and from there they climb
steadily; every Temple, Guildhall, Bazaar and Tea House commit is past ×5.9. So:

- +100 (×2) would put the Dam above 2 of the 78 commits, both after turn 50, too late to finish in a 60-turn run.
- **+200 (×3)** puts it above all 15 under the gap and none past it. It's the smallest round value that clears them
  (×2.97 needs +197). The Dam's scores, 1,251 at the median and 2,808 at most, land among the ordinary buildings the AI
  built in `e4` (Stonecutter commits 914-1,655 bar one at 37,579, Observatory 991-3,475, Kiln 1,238-2,679, Wharf
  1,171-2,150) and stay under the median commit in its own settlements, 3,603.
- +300 (×4) adds 2 more, +400 (×5) another 4.

Fifteen out of 78, in 5 of the 9 settlements, is a ceiling read off a game that would go differently once the first
Dam went up; the measurement below is what counts.

Why +200 can't turn into spam:

- It multiplies the AI's own score; it isn't a rule. Where the AI rates a Dam low (a settlement working few river
  tiles, a Dam that costs more) the Dam stays low, three times over. At +200 the best Dam in `e4`, 2,808, still loses to
  the median Temple, Bazaar or Guildhall commit.
- The price is the engine's and binds the AI as it binds the player (`e1c4`, `e1c5`): every Medieval Dam already in a
  settlement adds 70 Production to the next (275, 345, 415 and on), and each Dam costs 2 Gold a turn. A settlement that
  builds Dams spends its Production on them and not on anything else.
- Independents and city-states don't hold `TRAIT_LEADER_MAJOR_CIV`, so they weigh a Dam as before.

Why it works in a network game: it's data only. The list is read when a game is created (engine-closed.md, "AI list
data is read at game creation only"), from the database every machine builds from the same mod, and none of it goes
through the script, which skips its local writes in a network game. The other side of that: a game already under way
keeps the old weighting, so the CHANGELOG and README say "in new games".

### What's built

- `data/dams-ai.xml`: one list, `Dams Priority`, bound to `TRAIT_LEADER_MAJOR_CIV` as `ConstructibleBiases`, giving each
  of the three Dams +200, loaded by the always-on `dams-game` group so every age has it. It leaves out the Levees and
  holds at every difficulty. One value for all three ages: only the Medieval Dam has broker numbers, so the Ancient and
  Modern Dams take +200 unmeasured.
- XML rows are safe here: `AiLists` and `AiFavoredItems` have foreign keys only on `ListType` (the mod's own list type)
  and the difficulties, and `Item` and `LeaderType` aren't keys at all, so every key in the file lands on the mod's own
  list type.
- `tests/ai-data.test.mjs`, in `npm run verify`: the file holds only that list, for every major leader, naming each
  buildable Dam once at one value; the modinfo loads it in every age. Then, against a compiled database
  (`DAMS_COMPILED_DB`, or else the live `Debug/gameplay-copy.sqlite`): the three tables' foreign keys are still only
  `ListType` and the difficulties, `TRAIT_LEADER_MAJOR_CIV` reaches every major leader and no independent or
  city-state, and the rows insert into a copy (plain INSERT, foreign keys on) with `PRAGMA foreign_key_check` unchanged
  on every table. On the 15:07 database: 38 major leaders, every table clean; the one base-game schema mismatch
  (`CultureSlotAllowances` to `Traditions`) is there before and after. Without a compiled database holding the Dams the
  database half is skipped with a message. It fails on a misspelt Dam, a Levee, a second list, a list name another mod
  already uses, and a row pointing at an undeclared list (each tried on a scratch copy).

### Measuring it (lab, not yet run)

The `e4` setup (`damh-game-u1.js`, `AI_VERBOSE=1`, Exploration, seed 9001, the grant probe, 60 turns of Autoplay), a new
game every time, since AI lists are read when a game is created. `e4` itself can't be the "before": it ran with the
2026-10-01 mod list (Canals, Build Wonders, the Tower Bench agent and Workshop mods since switched off), and a seeded
game repeats only with the same mod list (engine-closed.md). So the first run is a control on today's list.

`u1` now also logs each river's floodplain tiles at turn 1 (`R2`, and `floodplainsAtStart` on each `D` line), each
Dam's settlement, and the major civilizations' settlement count (`C` line), all reads. That logging hasn't run in a game
yet. Under Autoplay every seat is AI-run, the local one too (`u2`), so the counts cover all six majors.

Before each run, the lab rules in `tools/plans/next-2026-10-15/README.md` (ask the other sessions; back up
`Mods.sqlite` and note its hash). The registry has two `tower-dams` rows, the Workshop copy and `Mods/dams`, and the
harness's `mod` deploy adds a third folder with that id, `Mods/tower-dams`: switch the two off for the run, and after
the launch check that `Modding.log` loads `Mods/tower-dams/dams.modinfo` and no other copy. `run-harness.sh`'s cleanup
deletes every `tower-dams` row from `Mods.sqlite`, so restore the backup after every run.

| Run | Other mods | Dams | Command, in `devtools/harness/` |
| --- | --- | --- | --- |
| `e7a`, control | all off | 2.0.3 as released: `git archive v2.0.3 \| tar -x -C <dir>` | `MODSRC=<dir> AI_VERBOSE=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-u1.js e7a 2400 mod+grant` |
| `e7b`, the nudge | all off | the working tree, +200 | `AI_VERBOSE=1 START_AGE=AGE_EXPLORATION SEED=9001 zsh run-harness.sh damh-game-u1.js e7b 2400 mod+grant` |
| `e8`, usual set | the 16 Tower mods as the registry has them | the working tree, final value | as `e7b`, labelled `e8` |

After each launch, before reading anything else: `Debug/gameplay-copy.sqlite` holds the rows (`SELECT Item, Value FROM
AiFavoredItems WHERE ListType = 'Dams Priority'` gives the three Dams at the value under test, and an empty result in
`e7a`), and `Database.log` passed its foreign-key validation.

Read:

1. The same map: the `R1` and `R2` lines of `e7a-UI.log` and `e7b-UI.log` match. Then `node broker-dams.mjs
   e7b-AI_ConstructibleBroker.csv --control e7a-AI_ConstructibleBroker.csv`: the rows without the Dam match from turn 1
   until the first Dam commit, and every paired Dam score is ×3.000. If the maps differ, or the rows differ before any
   Dam commit, stop and report, and don't read the counts as a before and after.
2. From the same output: how often the Dam was weighed, its mean and max, the Dam commits (turn, player, plot), and the
   number of settlements that weighed it.
3. From `e7b-UI.log`, the `C end` line and the `D end` lines: AI Dams finished (`complete=true`), Dams per settlement
   (`aiSettlementsWithDams`, `maxPerSettlement`, `majorSettlements`), and Dams sharing a river (`aiSharingARiver`).
4. Where they went: each `D end` line's `floodplainsAtStart` (0 is a river no flood reaches) and
   `e7b-Game_RandomEvents.csv` for the rivers that flooded during the run.

Pass: at least one AI finishes a Dam, and AI Dams don't outnumber the settlements that weighed one, so there's at most
one per settlement that can build one, on average.

Fail, and what to do. Each rerun is a new game, same seed and mods, labelled `e7c`, then `e7d`:

- No AI finishes a Dam: raise to +300 (×4, the next step in the ratios above) and rerun.
- More AI Dams than settlements that weighed one: lower to +150 (×2.5) and rerun.
- If the first rerun overshoots the other way, the second takes the value halfway between (+250, or +175).
- Two reruns at most. After the second, stop and report the numbers whichever way they fall; don't try a third value.

Report these even on a pass: Dams on rivers with no floodplains at turn 1, and any settlement with two Dams on one
river. Then run the final value once with the usual set (`e8`, step 6); the vanilla side is the last `e7` run. Only
after a pass do the docs change: the README's lines on the AI ("weighs a Dam as it weighs any other building" under What
the player does, and "building none" in the 2.0.0 status paragraph), the matching line in
`docs/steam-workshop-description.txt`, the lines in this file that say the AI didn't build any or that a nudge is a
design call, and the CHANGELOG's `[Unreleased]` line, which is drafted and waits on this. The Ancient and Modern Dams'
+200 stays unmeasured until a run in those ages.

## Visuals

- A new building type cannot get a model through `VisualRemaps` (engine-closed.md), so `ui/dams.js` draws the Dam
  with `WorldUI` model groups across its river, one look per age in the manner of Canals: rocks, then masonry, then
  concrete (`DAM_LOOKS`).
  - Ancient, a rough weir. Seventeen `Ant1_Euro_Fortification_RockPile*` at 0.7-0.8 in two staggered rows,
    packed 0.07 apart so they overlap into one berm, over a river-rock decal, with foam below. The low pieces are
    seated with `PlacementMode.WATER` on navigable water: `TERRAIN` puts them on the riverbed and they drown out of
    sight (`d24-ant2`). A scatter of piles read as the river's own rocks, and a single row of small piles read as
    sparse; it has to be a filled-in line (`d24-ant4`, `d24-ant6`).
  - Across the flow, bank to bank. `wallAngle` lays every look along the hex axis that has land at both ends,
    preferring the one with the most water on its flanks. `flowAngle`, the average bearing of the tile's river
    neighbors, is only the fallback: at a fork or a river mouth it averages two branches and comes out near 90
    degrees off, which laid the ancient weir along the channel (`d24-ant5`: old 60, new 0). On a straight channel
    the two agree up to a half turn (`d24-EXPLORATION-w`, `d24-MODERN-w`: old 120, new 300).
  - Medieval, a stone ford. `IMPROVEMENT_HAN_GREAT_WALL_RIVER_STRAIGHT` at 0.45, the Great Wall where it fords a
    river: stairs down each bank and a gated arch across the flow (`d18`, `d24-exp`).
  - Modern, a concrete barrage. Two `GEN_MOD_Harbor_Pier_HB` end to end at 0.55 with cranes along the crest,
    `VFX_WaterFall_Loop_AutoHeight_Medium` pouring through the spillway and heavy foam below (`d24-mod`).
  - They grow with the age. Scale numbers mean nothing across meshes of different native size; the ordering was
    set from all three drawn in one frame (`d21d`). Effects must go through `addVFXAtPlot`, not `addModelAtPlot`.
  - Rejected, with what they look like: the dockyard gatehouse (a compact building, lost among rooftops),
    terrace farms and Machu Picchu cliff tops (large terraced settlements), the Highland Power Station set (bare
    rock), the factory (a smokestack that dwarfs the river).
- Capturing. The HUD, the map overlays and the active lens all have to come off, or the picture is of the
  interface: see the engine-closed entry on captures for the recipe and the zoom values. A Dam placed through the
  production screen lands wherever the settlement happens to own river, which on a young capital is the urban core,
  so the gallery probe chooses an open tile and buys it instead.
- Build-menu icons, one per age: `icons/dam_ancient.png`, `dam_medieval.png` and `dam_modern.png` (256 x 256, with
  `_128` and `_64` copies). `icons/src/build-icon.py` draws each from `icons/src/dam-<age>.svg` inside a gold ring it
  draws itself (2.0.1 made the ring fuller). The modinfo imports all nine (`ImportFiles`, `dams.modinfo:49`) and
  `data/dams-icons.xml` binds each age's Dam to its own set (`UpdateIcons`), addressed with the `.png` extension or the
  icon is blank (Canals `c38`). In `d4`, when there was one icon, `UI.getIconURL("BUILDING_DAM_ANTIQUITY")` returned
  `fs://game/tower-dams/icons/dam.png`.

## The silt cannot be taken away

Asked for 2026-09-28, after the protection runs: a dammed river should **stop enriching its tiles**, as the
price of the safety. That cannot be built, and the mod no longer claims it.

What a flood actually does, read seconds after it lands (`d14`): it permanently raises the Food or Production of one
to three tiles of the river it hits, by 1 each. It does this just as readily on a river whose floodplain features have
been removed (11 of 15 floods moved tiles on dried rivers against 5 of 5 on floodplain ones), so **the floodplain is
not what carries the enrichment** and clearing it costs only the floodplain's own yield.

The false trail: `d8` cleared one river's floodplains and its single flood added
nothing, while an untouched river gained across four floods. That looked like the answer, and it was one flood. `d13`
ran the same seed and the same river as the undammed `d10`, and both rose by exactly +5 Food over the same 8 floods;
the drying only cost 2 Food up front. Tile yields drift over 24 turns for reasons that have nothing to do with floods,
so a measurement spread over many turns says nothing. Read the yields immediately either side of one flood.

Nor can the gain be written back (`d15`): `WorldBuilder.MapPlots.setFertility` does move
`GameplayMap.getFertilityType` (it takes `(loc, v)` or `(v, loc)`, not `(index, v)`), but Food and Production do not
move with it, through thirteen write shapes and a `setTerrain` round trip. Fertility is a separate map property from
whatever the flood writes.

**What the Dam costs instead (single player and hotseat):** `dry()` in `ui/dams.js` takes the floodplain features off
the dammed river, about 1 Food a tile, permanently. The valley below the Dam dries out, which is a price the player can
see on the map. It is a design choice rather than a mechanism: it does not stop the silt, because nothing can.

## Player-facing behavior, and what is not covered

Handled, after a pass through the mod from the player's side:

- Each age has its own Dam type, so a river dammed in Antiquity can take a Medieval Dam later.
- Levees follow their reason. A settlement that no longer owns a tile of a dammed river (its Dam razed, its
  river tiles traded or lost) has its Levee removed. Only once it has been orphaned on two different turns: the first
  sweep after a load can run before the map's buildings read back, and would otherwise strip every Levee (`d23`).
- No double entries: the settlement holding a Dam is covered by the Dam and gets no Levee, so its building list
  does not show both.
- Bought Dams appear at once. A purchase lands complete with no completion event, so the mod also listens for a
  Dam added to or removed from the map.
- The Levee stays out of the Civilopedia's buildings, where a player would go looking for how to build one.
- Floods still show. The Dam's text says floods still come and are still reported, and do no damage, so a
  flood notice beside a new Dam does not read as the mod failing.

Not covered:

- A dried floodplain stays dried if the Dam is later razed.
- The flood-risk lens stops marking a dammed river's floodplains once they are dried, though floods still come.
- AI Dams, 1.3.0 only (`ui/dams-sites.js`, 2026-09-29; replaced in 2.0.0). Left to itself the game's AI weighed a Dam
  on every river tile it could build on (`u1`: 1,010 evaluations in 60 turns), blind to floods: on seed 9001 only 8 of
  61 rivers read `isFloodable`, which engine-closed.md finds does not predict floods (what does: whether the river had
  floodplain tiles at map creation). No AI bias keeps it off a building (Canals `w1`, `w1b`), and the data cannot say
  "a river that floods". So each Dam requires a dam-site marker (`data/dams-sites.xml`,
  `Constructible_RequiredFeatures`, the mechanism from Canals `m1`-`m8`), and the script marks, for each AI, the
  candidate tiles of each river that floods, has no Dam as good, and runs past at least two of its own built-on tiles
  a flood would pillage (a marker standing in for a floodplain still counts, or it would lift itself: `v1`). The
  player's lists are widened to every candidate river tile and the order marks its tile. The AI's value of the Dam is
  raised (`data/dams-ai.xml`, +3,000; at +400 it scored about 1,900 and lost, `v1b`). `v1c`: AI 2 committed to a Dam
  on its marked site (6,13, a flooding river) on turn 10, finished it by turn 24, the sweep drew it and dried the
  river; the AI weighed a Dam nowhere else; the player's production and purchase Dams landed and were drawn. Sites
  come from the map: `canStart` gives an AI's settlements no plots (`u2`).
- A network game started once (`e6`) and offered no Dam tile, and the run didn't record why; in `e6b` and `e6c` the
  lobby never started. Nobody has yet built a Dam in a network game.
- A Dam goes where the game lets the settlement put a building. A young settlement is offered only the river tiles
  beside its centre (`d28e`, with the mod's wrapper off), so "any river tile" means any the settlement could build on.
- Not yet run on 2.0.0 (2026-10-01): a Dam offered and built in a network game (`e6`-`e6c`); Levees falling back when
  a Dam on a shared river is pillaged (the planner skips a Dam whose instance reads `damaged`, read only in code);
  Machinery opening the Medieval Dam in play (the row is in the Exploration database; Irrigation was run end to
  end in `e1b`). The AI never chose a Dam in `e4`: whether to nudge it is a design call.

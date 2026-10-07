# Translating Dams (`text/`)

Every string a player sees from this mod is a `LOC_*` tag defined here: the mod's name and description in the
Additional Content list, the three Dams and the Levee (names, descriptions, tooltips), the old dam-site marker, and the
Civilopedia's Dams group in Game Concepts (pages Dams, Flood Protection and Levees, with four search terms). The pages'
structure is in `data/dams-civilopedia.xml`. A translation needs no code change: add the language's file here and two
lines to `dams.modinfo` (the shell and the game `UpdateText`).

## Files

| File | Contents |
| --- | --- |
| `en_us/DamsText.xml` | The English source (55 tags). |
| `<lang>/DamsText.xml` | The same tags in one language: `de_de`, `es_es`, `fr_fr`, `it_it`, `ja_jp`, `ko_kr`, `pl_pl`, `pt_br`, `ru_ru`, `zh_cn` (Simplified, `zh_Hans_CN`) and `zh_hk` (Traditional, `zh_Hant_HK`). |

The eleven languages ship as machine translations (2026-10-01) that use the game's own words for its terms
(Settlement, Floodplains, the three flood events, pillage, Improvements, Buildings, Districts, the techs and ages),
taken from the game's l10n files. To correct one, edit its `<Text>`; to change the English, edit the English and update
every language.

## Two file shapes

English uses an `EnglishText` block with `Row`; every other language uses a `LocalizedText` block with `Replace` and a
`Language` attribute:

```xml
<Database>
    <LocalizedText>
        <Replace Tag="LOC_BUILDING_DAM_ANTIQUITY_NAME" Language="de_DE"><Text>...</Text></Replace>
    </LocalizedText>
</Database>
```

## Rules

- Every tag once per file: one duplicate tag rolls back the whole file.
- Keep markup exactly: `[icon:YIELD_FOOD]`, `[B]...[/B]`, `[BLIST][LI]...[/LIST]`, and in
  `[TIP:LOC_PEDIA_CONCEPTS_SETTLEMENT_TOOLTIP]Settlement[/TIP]` translate only the word between the tags.
- Keep the numbers: costs (150, 275, 600), cost steps (40, 70, 150), percentages.
- `npm run pedia` checks the English pages; a language's file is checked against the English tag set by hand or by
  script before release.

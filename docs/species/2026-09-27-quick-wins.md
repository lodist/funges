# Forecasts for the catalog species that had none (roadmap #272, step 2)

Date: 2026-09-27

Eleven catalog species had pages and photo identification but no forecast
(`forecast.enabled: false`). This record covers turning them on, adding the
black walnut to the walnut range, and the look-alike warnings that came with
them. It is the reviewed source the manifests cite in `scoringReferences`.

**The parameter values below are agent-derived and await approval by Loris Di
Stefano.** The validator checks types, ranges and sigmas; it cannot establish
scientific authority, and no mycologist or botanist has reviewed them.

Shiitake stays without a forecast: it is not wild in Europe or the US.

## Species and GBIF keys

| id                     | forecast column      | range prior keys                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chicken-of-the-woods` | Chicken of the Woods | genus _Laetiporus_ 2542160                                                                                                                                                                                                                                                                                                       |
| `oyster-mushroom`      | Oyster Mushroom      | genus _Pleurotus_ 2518610                                                                                                                                                                                                                                                                                                        |
| `elderflower`          | Elderflower          | _Sambucus nigra_ 2888728, _S. canadensis_ 6369819, _S. cerulea_ 2888726                                                                                                                                                                                                                                                          |
| `elderberry`           | Elderberry           | the same three                                                                                                                                                                                                                                                                                                                   |
| `blackberry`           | Blackberry           | _Rubus fruticosus_ 8436459, _R. ulmifolius_ 2996929, _R. armeniacus_ 2996525, _R. laciniatus_ 2992543, _R. plicatus_ 2990412, _R. vestitus_ 8289268, _R. caesius_ 2995209, _R. allegheniensis_ 8235931, _R. argutus_ 2990801, _R. pensilvanicus_ 2989061, _R. flagellaris_ 2992071, _R. trivialis_ 2992760, _R. ursinus_ 2990646 |
| `blueberry`            | Wild Blueberry       | _Vaccinium myrtillus_ 2882833, _V. angustifolium_ 2882868, _V. corymbosum_ 2882849, _V. pallidum_ 2882895, _V. myrtilloides_ 2882880                                                                                                                                                                                             |
| `hazelnut`             | Hazelnut             | _Corylus avellana_ 2875979, _C. americana_ 2876060, _C. cornuta_ 2876032                                                                                                                                                                                                                                                         |
| `wild-mint`            | Wild Mint            | genus _Mentha_ 2927173                                                                                                                                                                                                                                                                                                           |
| `violets`              | Sweet Violet         | _Viola odorata_ 5331181                                                                                                                                                                                                                                                                                                          |
| `plantain`             | Common Plantain      | none (see below)                                                                                                                                                                                                                                                                                                                 |
| `daisy`                | Common Daisy         | _Bellis perennis_ 3117424                                                                                                                                                                                                                                                                                                        |
| `walnut`               | Wild Walnut          | _Juglans regia_ 3054368 + **_J. nigra_ 3054357**                                                                                                                                                                                                                                                                                 |

Why these keys and not the catalog name alone:

- **Chicken of the woods, genus.** GBIF files _L. cincinnatus_ under
  _L. sulphureus_, and the West's chickens are other species: _L. gilbertsonii_
  (6,628 US West records) and _L. conifericola_ (2,539), against 30 for
  _L. sulphureus_. The genus also takes in _L. huroniensis_ and _L. montanus_.
  All of them are picked as chicken of the woods.
- **Oyster, genus.** The genus holds twice the US East records of
  _P. ostreatus_ + _P. pulmonarius_ + _P. populinus_. That includes records
  named only to genus and the naturalised golden oyster, which is also picked.
- **Elder, three species, not the genus.** The genus includes red elder
  (_S. racemosa_) and dwarf elder (_S. ebulus_), both toxic. American elder is
  the US East's, blue elder the US West's.
- **Blackberry, thirteen species.** GBIF has no key for the blackberry section,
  and recorders have moved to segregate names: _R. fruticosus_ has 96,012 North
  Europe records in 1990–2025 but 112 in 2026. The genus would bring in
  cloudberry and arctic bramble, and open Lapland.
- **Blueberry.** Bilberry in Europe; lowbush, highbush and velvetleaf
  blueberries in the US East. Huckleberry (_V. membranaceum_) is a separate
  roadmap species, and bog bilberry is left out.
- **Wild mint, genus.** Every wild _Mentha_ is picked as wild mint.
  _M. aquatica_ is four times as recorded in Europe as the catalog's
  _M. arvensis_.
- **Plantain, no prior.** _P. major_ grows across the whole forecast area. Its
  prior excludes nothing anywhere (mean 0.98–1.00 in every region), so, as for
  dandelion in #275, a prior could only ever hide it.
- **Walnut + black walnut.** The US walnut layer was _J. regia_ alone: 33 US
  records in 2026, against 3,331 of _J. nigra_, the walnut Americans forage.

Every species is available in all four regions. As in #275, the range prior
and host layer decide where each grows, not the forecast-region seams.

## Where they can grow

Priors were built locally with `build_range_priors.py`'s own functions from
1990–2025 GBIF data (casual rescue included). They were checked against 2026
records: individual sightings for the two fungi, and the full 2026 record grid
for the plants. The prior is a 0.1° grid, so the grid counts every 2026 record.

| species               | 2026 records EU / US | hidden EU | hidden US | NE points < 0.1 |  SE | USE | USW |
| --------------------- | -------------------: | --------: | --------: | --------------: | --: | --: | --: |
| Chicken of the Woods  |        8,687 / 3,026 |      0.0% |      0.0% |             44% |  0% |  0% |  0% |
| Oyster Mushroom       |        1,769 / 4,038 |      0.2% |      0.0% |              6% |  0% |  0% |  0% |
| Elder                 |       21,579 / 8,563 |     0.01% |     0.00% |             47% |  1% |  0% |  1% |
| Blackberry            |        9,361 / 8,771 |     0.01% |     0.31% |             50% |  0% |  2% | 49% |
| Wild Blueberry        |       19,721 / 2,584 |     0.01% |     0.00% |              1% | 17% | 10% | 34% |
| Hazelnut              |       17,997 / 2,588 |     0.01% |     0.04% |             17% |  2% | 20% | 30% |
| Wild Mint             |         11,873 / 845 |     0.01% |     0.00% |             20% |  0% |  3% |  0% |
| Sweet Violet          |          8,618 / 341 |     0.01% |     0.00% |             45% |  1% | 14% |  0% |
| Common Daisy          |       37,050 / 3,837 |     0.01% |     0.63% |             28% |  0% | 68% | 39% |
| Walnut (+ _J. nigra_) |        7,418 / 3,331 |     0.09% |     0.03% |             61% |  0% |  3% | 29% |

Hidden is the share of 2026 records where the factor is below 0.1; the
fungi's include their European host lists. Most North Europe exclusions are
northern Fennoscandia, which these species do not reach.

Spot checks of the range prior:

- **Chicken of the woods:** 0.00 at Oulu, Lapland and Trondheim; 1.00 in
  southern Scandinavia and everywhere south.
- **Elder:** 0.00 at Helsinki, where _S. nigra_ is not wild and red elder is
  the common one; 1.00 in the Arizona desert through the Mexican blue
  elderberry.
- **Hazel:** 0.00 in Florida, Texas and the Arizona desert.
- **Walnut:** Helsinki 0.00, Stockholm 0.02, Oslo 0.14; Arizona desert 0.00.

**Known misses:**

- **Hazel reads 1.00 in interior Finnish Lapland,** beyond its range. The
  temperature term keeps its score down there.
- **Iceland reads as possible** for several plants (0.4–0.97) and for chicken
  of the woods (0.89). Recording there is too thin to rule them out, and the
  tree map does not reach it.

### Host trees (the two fungi)

| hosts                                     | hidden, EU | hidden, US |
| ----------------------------------------- | ---------: | ---------: |
| chicken: oak, beech, other broadleaf (EU) |       0.0% |          — |
| chicken: any US forest                    |          — |       7.6% |
| oyster: beech, oak, other broadleaf (EU)  |       0.2% |          — |
| oyster: any US forest                     |          — |       3.9% |

Both get host lists in Europe only. In the US even "any forest" hides 7.6% of
chicken and 3.9% of oyster sightings: park and street trees, and California
eucalyptus, which the USFS forest-type map does not see. Both are wood-decay
fungi that are found on park trees more than most.

## Seasons

**Fungi:** the empirical GBIF season curves (genus keys) take over after the
next quarterly rebuild. Until then `season_months` holds the observed window,
from 2020–2025 GBIF months:

- **Chicken of the woods:** May–October; August–November in the US West,
  where the Pacific chickens fruit with the autumn rains.
- **Oyster:** a winter mushroom in Europe (32% of North Europe records in
  December–January), a summer one in the US East (72% in May–September).

**Plants:** `empiricalSeason` stays off, because a plant is seen long before
the part people pick is ready. `season_months` comes from iNaturalist's
"Flowers and Fruits" annotations, counting only observations annotated with
the stage that is foraged:

| entry           | stage counted          | NE      | SE      | USE     | USW     |
| --------------- | ---------------------- | ------- | ------- | ------- | ------- |
| Elderflower     | flowers                | May–Jun | Apr–Jun | May–Jul | Mar–Jul |
| Elderberry      | fruits                 | Jul–Sep | Jun–Sep | Jun–Sep | Jun–Oct |
| Blackberry      | fruits                 | Jul–Oct | Jun–Oct | Apr–Aug | Jun–Oct |
| Wild Blueberry  | fruits                 | Jun–Sep | Jun–Sep | Jun–Aug | Jul–Aug |
| Hazelnut        | ripe nuts (literature) | Aug–Sep | Aug–Sep | Aug–Sep | Aug–Sep |
| Wild Mint       | all observations       | May–Sep | Apr–Oct | May–Sep | Apr–Oct |
| Sweet Violet    | flowers                | Feb–Apr | Feb–Apr | Mar–May | Jan–Apr |
| Common Plantain | all observations       | Apr–Oct | Apr–Oct | Apr–Oct | Apr–Oct |
| Common Daisy    | flowers                | Mar–Jun | Feb–May | Apr–Jun | Feb–Jun |

- **Blackberry, US East:** fruiting begins in April. The Gulf-coast dewberries
  ripen in April–May.
- **Hazelnut:** the only season not taken from the annotations. Fruit
  annotations peak in July, when the nuts are still green; hazelnuts are
  picked ripe in August–September.

## Scoring parameters

The method is the one used for the US porcini
(`docs/species/2026-09-27-us-porcini.md`):

- **Weather:** the production regional parquets, at the scoring point nearest
  each 2026 sighting. For plants, these are iNaturalist observations annotated
  with the forageable stage. Only sightings within 0.25° of a scoring point
  count.
- **Europe:** each sighting takes the weather, and the region's parameters, of
  its nearest scoring point across both European sets. North Europe's points
  start at 49.5° N and South Europe's reach 54.8° N. A first pass split
  sightings at 47° N, which matched southern Germany, Austria and Switzerland
  to North Europe points up to 7–9° away. The values below come from the
  corrected matching.
- **Values:** optima at the sighting medians. The rain threshold sits at the
  lower quartile of 21-day rain.
- **Plants:** wider temperature sigmas (6) than fungi, and no wind
  sensitivity or `rain_first`.
- **Wood-decay fungi:** a neutral pH sigma (2.5), because they grow on wood,
  not soil.

| species              | region | temp (°C) | humidity (%) | altitude (m) |  pH | rain (mm, 21 days) | rain weight |
| -------------------- | ------ | --------: | -----------: | -----------: | --: | -----------------: | ----------: |
| Chicken of the Woods | NE     |    17 ± 5 |           64 |    30 ± 1000 | 4.7 |                  9 |         1.5 |
| Chicken of the Woods | SE     |    18 ± 5 |           61 |   190 ± 1000 | 5.2 |                 19 |         1.5 |
| Chicken of the Woods | USE    |    23 ± 5 |           70 |   230 ± 1000 | 5.4 |                 44 |         1.5 |
| Chicken of the Woods | USW    |    19 ± 5 |           64 |   240 ± 1000 | 6.0 |                  5 |         1.5 |
| Oyster Mushroom      | NE     |    13 ± 7 |           75 |    60 ± 1200 | 4.8 |                 25 |         1.5 |
| Oyster Mushroom      | SE     |    13 ± 7 |           65 |   300 ± 1200 | 5.2 |                 26 |         1.5 |
| Oyster Mushroom      | USE    |    15 ± 7 |           75 |   240 ± 1200 | 5.8 |                 48 |         1.5 |
| Oyster Mushroom      | USW    |    13 ± 7 |           75 |   530 ± 1200 | 5.8 |                 10 |         1.5 |
| Elderflower          | NE     |    11 ± 6 |           85 |     50 ± 800 | 4.7 |                 19 |           0 |
| Elderflower          | SE     |    14 ± 6 |           65 |    350 ± 800 | 5.6 |                 23 |         1.5 |
| Elderflower          | USE    |    23 ± 6 |           70 |    100 ± 800 | 5.5 |                 57 |         1.5 |
| Elderflower          | USW    |    19 ± 6 |           45 |   200 ± 1300 | 6.6 |                  2 |           0 |
| Elderberry           | NE     |    18 ± 6 |           65 |     50 ± 800 | 4.8 |                  2 |           0 |
| Elderberry           | SE     |    21 ± 6 |           55 |    250 ± 800 | 5.4 |                 12 |         0.3 |
| Elderberry           | USE    |    25 ± 6 |           70 |    100 ± 800 | 5.6 |                 47 |         1.5 |
| Elderberry           | USW    |    20 ± 6 |           50 |   200 ± 1300 | 6.6 |                  1 |           0 |
| Blackberry           | NE     |    18 ± 6 |           65 |     50 ± 800 | 4.8 |                  1 |           0 |
| Blackberry           | SE     |    22 ± 6 |           60 |    250 ± 800 | 5.5 |                  9 |           0 |
| Blackberry           | USE    |    22 ± 6 |           70 |    150 ± 800 | 5.6 |                 35 |           0 |
| Blackberry           | USW    |    18 ± 6 |           65 |    250 ± 800 | 5.7 |                  1 |           0 |
| Wild Blueberry       | NE     |    14 ± 6 |           75 |    150 ± 800 | 4.7 |                 34 |         1.5 |
| Wild Blueberry       | SE     |    18 ± 6 |           65 |   850 ± 1900 | 5.3 |                 28 |         1.5 |
| Wild Blueberry       | USE    |    22 ± 6 |           70 |    150 ± 800 | 5.2 |                 40 |           0 |
| Wild Blueberry       | USW    |    16 ± 6 |           65 |  1500 ± 1500 | 5.0 |                  5 |           0 |
| Hazelnut             | NE     |    17 ± 6 |           70 |     50 ± 800 | 4.6 |                  8 |           0 |
| Hazelnut             | SE     |    21 ± 6 |           55 |   500 ± 1200 | 5.3 |                 15 |         1.5 |
| Hazelnut             | USE    |    22 ± 6 |           70 |    250 ± 800 | 5.6 |                 45 |           0 |
| Hazelnut             | USW    |    17 ± 6 |           65 |    150 ± 800 | 5.6 |                  4 |           0 |
| Wild Mint            | NE     |    17 ± 6 |           70 |     50 ± 800 | 4.6 |                  5 |           0 |
| Wild Mint            | SE     |    21 ± 6 |           60 |    300 ± 900 | 5.4 |                  7 |           0 |
| Wild Mint            | USE    |    22 ± 6 |           70 |    200 ± 800 | 5.6 |                 44 |         1.5 |
| Wild Mint            | USW    |    19 ± 6 |           60 |   250 ± 1400 | 6.0 |                  1 |           0 |
| Sweet Violet         | NE     |     7 ± 6 |           80 |    150 ± 800 | 6.0 |                 10 |           0 |
| Sweet Violet         | SE     |     9 ± 6 |           75 |   500 ± 1000 | 6.0 |                 10 |           0 |
| Sweet Violet         | USE    |    12 ± 6 |           70 |    200 ± 800 | 6.0 |                 10 |         1.5 |
| Sweet Violet         | USW    |    11 ± 6 |           70 |   300 ± 1000 | 6.0 |                 10 |           0 |
| Common Plantain      | NE     |    16 ± 6 |           70 |     50 ± 800 | 4.6 |                  8 |           0 |
| Common Plantain      | SE     |    18 ± 6 |           60 |    300 ± 800 | 5.5 |                 14 |         1.5 |
| Common Plantain      | USE    |    21 ± 6 |           70 |    150 ± 800 | 5.5 |                 42 |         1.5 |
| Common Plantain      | USW    |    19 ± 6 |           60 |   250 ± 1300 | 6.3 |                  3 |           0 |
| Common Daisy         | NE     |    10 ± 6 |           80 |     50 ± 800 | 4.7 |                 12 |           0 |
| Common Daisy         | SE     |    11 ± 6 |           60 |    200 ± 800 | 5.5 |                  9 |           0 |
| Common Daisy         | USE    |    11 ± 6 |           70 |    200 ± 800 | 5.8 |                 44 |         1.5 |
| Common Daisy         | USW    |    14 ± 6 |           80 |    150 ± 800 | 5.7 |                  2 |           0 |

**Against the siblings.** These values are compared with raspberry's (for
berries and nuts) and nettle's (for greens and flowers). Each cell is the mean
weather score at real sightings, then how often a sighting outscores a random
point of its region on the same day.

| species         | region | sibling    | final      |
| --------------- | ------ | ---------- | ---------- |
| Blackberry      | NE     | 5.2 · 0.30 | 9.2 · 0.79 |
| Blackberry      | SE     | 4.5 · 0.54 | 8.1 · 0.58 |
| Blackberry      | USE    | 5.3 · 0.61 | 9.0 · 0.71 |
| Blackberry      | USW    | 5.0 · 0.71 | 8.7 · 0.93 |
| Elderberry      | NE     | 4.8 · 0.26 | 9.0 · 0.72 |
| Elderberry      | SE     | 4.6 · 0.56 | 8.0 · 0.59 |
| Elderberry      | USE    | 4.3 · 0.52 | 8.8 · 0.65 |
| Elderberry      | USW    | 3.3 · 0.48 | 8.4 · 0.78 |
| Wild Blueberry  | NE     | 7.0 · 0.56 | 8.8 · 0.62 |
| Wild Blueberry  | SE     | 6.1 · 0.69 | 8.3 · 0.68 |
| Wild Blueberry  | USE    | 5.9 · 0.72 | 8.8 · 0.69 |
| Hazelnut        | NE     | 6.0 · 0.36 | 9.1 · 0.72 |
| Hazelnut        | SE     | 5.1 · 0.59 | 7.9 · 0.61 |
| Hazelnut        | USE    | 5.7 · 0.76 | 9.0 · 0.72 |
| Hazelnut        | USW    | 6.1 · 0.80 | 8.8 · 0.93 |
| Elderflower     | NE     | 6.7 · 0.60 | 8.8 · 0.74 |
| Elderflower     | SE     | 6.7 · 0.66 | 8.3 · 0.65 |
| Elderflower     | USE    | 4.4 · 0.48 | 8.8 · 0.71 |
| Elderflower     | USW    | 4.3 · 0.58 | 8.6 · 0.81 |
| Common Daisy    | NE     | 6.0 · 0.53 | 8.7 · 0.69 |
| Common Daisy    | SE     | 6.1 · 0.58 | 8.7 · 0.70 |
| Common Daisy    | USE    | 6.4 · 0.72 | 8.1 · 0.77 |
| Common Daisy    | USW    | 6.1 · 0.81 | 8.5 · 0.94 |
| Wild Mint       | NE     | 5.2 · 0.31 | 8.7 · 0.69 |
| Wild Mint       | SE     | 4.5 · 0.50 | 7.8 · 0.55 |
| Wild Mint       | USE    | 4.8 · 0.67 | 8.6 · 0.67 |
| Wild Mint       | USW    | 4.1 · 0.62 | 8.0 · 0.78 |
| Common Plantain | NE     | 5.7 · 0.41 | 8.7 · 0.66 |
| Common Plantain | SE     | 5.2 · 0.59 | 7.2 · 0.54 |
| Common Plantain | USE    | 5.2 · 0.66 | 8.2 · 0.59 |
| Common Plantain | USW    | 4.5 · 0.64 | 7.8 · 0.74 |

The score at sightings rises in every species and region. Ranking improves in most, and drops in a few: Common Plantain SE (0.59 → 0.54), Wild Blueberry USE (0.72 → 0.69), Hazelnut USE (0.76 → 0.72), Common Plantain USE (0.66 → 0.59). The range prior and land cover do most of the spatial ranking.

**Values not calibrated from 2026 weather:**

- **Sweet violet:** it flowers in February–April, before the weather files
  begin (12 April). Its values follow the regions' early-spring weather and
  chickweed, the catalog's other early-spring plant.
- **Wild blueberry, US West:** only 6 annotated sightings, so these are
  literature values: Rocky Mountain bilberry at altitude.
- **Oyster:** the April–September sample holds only the summer oysters, so the
  temperature is from the literature. _P. ostreatus_ fruits from October to
  early April (MushroomExpert), so the optimum is a winter-tolerant
  13 ± 7 °C, or 15 ± 7 °C in the summer-dominated US East.

**Known limits:**

- **Daily skill for the two fungi is weak** (temporal AUC 0.40–0.70). A
  chicken of the woods or oyster stays up for weeks, and the day it is logged
  says more about who walked past than about the rain. Their timing comes
  from the season curve.
- **The water-distance factor was tested for wild mint and rejected.** Only
  1–5% of mint sightings are within 500 m of mapped water, no more than random
  points.

## Rain weight

Elder, blackberry and mint fruit or grow through the dry Californian and
Mediterranean summers (median 21-day rain at US West sightings: 2–6 mm). Every
score used to weigh recent rain at 1.5, against temperature 1.75, humidity 1.0,
altitude 0.75 and soil pH 1.0. After a dry spell the rain term sat at its floor,
and because the score multiplies its terms, that capped these plants near 4/10.
No parameter could lift it: even a 1 mm rain target floors when no rain falls.

`scoring.rain_weight` makes the weight per species and region. It defaults to
1.5, so every species that does not set it scores exactly as before. The
golden-master scoring tests are unchanged.

**How each value was chosen.** Each species and region was scored at 2026
sightings with weights 1.5, 0.75, 0.3 and 0, using the same stage sightings and
production scoring as the parameters, on weather alone. The weight is the
lowest one that meets all three conditions:

- the ranking against random points on the same days drops by no more than
  0.01;
- the mean score at sightings does not drop;
- something clearly improves: ranking up by at least 0.03, or the score at
  sightings up by at least 0.5.

Otherwise the species keeps 1.5. Rain does carry information for some plants,
and the rule keeps it there.

| species         | NE  | SE  | USE | USW |
| --------------- | --- | --- | --- | --- |
| Amaranth        | 1.5 | 0   | 1.5 | 0   |
| Blackberry      | 0   | 0   | 0   | 0   |
| Chestnut        | 0   | 1.5 | —   | —   |
| Chickweed       | 1.5 | 1.5 | 1.5 | 1.5 |
| Common Daisy    | 0   | 0   | 1.5 | 0   |
| Common Plantain | 0   | 1.5 | 1.5 | 0   |
| Common Sorrel   | 0   | 1.5 | 1.5 | 0   |
| Dandelion       | 0   | 1.5 | 1.5 | 0   |
| Elderberry      | 0   | 0.3 | 1.5 | 0   |
| Elderflower     | 0   | 1.5 | 1.5 | 0   |
| Hazelnut        | 0   | 1.5 | 0   | 0   |
| Lingonberry     | 1.5 | 1.5 | 1.5 | 1.5 |
| Masterwort      | 1.5 | 1.5 | —   | —   |
| Nettle          | 0   | 1.5 | 1.5 | 0   |
| Sweet Violet    | 0   | 0   | 1.5 | 0   |
| Walnut          | 0   | 1.5 | 0   | 0   |
| Wild Artichoke  | 1.5 | 0   | 1.5 | 0   |
| Wild Asparagus  | 1.5 | 0   | —   | —   |
| Wild Blueberry  | 1.5 | 1.5 | 0   | 0   |
| Wild Garlic     | 0   | 1.5 | —   | —   |
| Wild Mint       | 0   | 0   | 1.5 | 0   |
| Wild Raspberry  | 1.5 | 1.5 | 1.5 | 1.5 |
| Wild Strawberry | 0   | 1.5 | 1.5 | 0   |

**Untested regions follow their closest tested relative.** Sweet violet
follows daisy, chestnut and walnut follow hazelnut, and wild blueberry in the
US West follows the US East. Violet flowers in February–April and the two nuts
drop in late September–October, outside the weather files (12 April – today),
so all three can be checked once those sightings exist. The mushrooms keep
1.5.

**The evidence**: each cell is the score at sightings · the ranking against
random points.

| species         | region | 1.5 (before) | 0.75       | 0.3        | 0          | chosen |
| --------------- | ------ | ------------ | ---------- | ---------- | ---------- | ------ |
| Blackberry      | NE     | 7.4 · 0.48   | 8.0 · 0.53 | 8.6 · 0.62 | 9.2 · 0.79 | 0      |
| Blackberry      | SE     | 7.1 · 0.58   | 7.4 · 0.59 | 7.8 · 0.59 | 8.1 · 0.58 | 0      |
| Blackberry      | USE    | 8.4 · 0.65   | 8.6 · 0.67 | 8.8 · 0.69 | 9.0 · 0.71 | 0      |
| Blackberry      | USW    | 6.5 · 0.67   | 7.2 · 0.76 | 8.0 · 0.87 | 8.7 · 0.93 | 0      |
| Elderberry      | NE     | 6.7 · 0.40   | 7.4 · 0.44 | 8.2 · 0.53 | 9.0 · 0.72 | 0      |
| Elderberry      | SE     | 7.3 · 0.59   | 7.6 · 0.59 | 8.0 · 0.59 | 8.3 · 0.57 | 0.3    |
| Elderberry      | USE    | 8.8 · 0.65   | 8.8 · 0.65 | 8.9 · 0.65 | 9.0 · 0.64 | 1.5    |
| Elderberry      | USW    | 5.1 · 0.43   | 6.2 · 0.47 | 7.3 · 0.61 | 8.4 · 0.78 | 0      |
| Wild Blueberry  | NE     | 8.8 · 0.61   | 8.9 · 0.63 | 8.9 · 0.63 | 8.9 · 0.63 | 1.5    |
| Wild Blueberry  | SE     | 8.2 · 0.69   | 8.3 · 0.67 | 8.3 · 0.65 | 8.4 · 0.61 | 1.5    |
| Wild Blueberry  | USE    | 8.7 · 0.65   | 8.8 · 0.67 | 8.8 · 0.68 | 8.8 · 0.69 | 0      |
| Hazelnut        | NE     | 8.2 · 0.53   | 8.5 · 0.58 | 8.8 · 0.64 | 9.1 · 0.72 | 0      |
| Hazelnut        | SE     | 7.9 · 0.61   | 8.1 · 0.61 | 8.3 · 0.61 | 8.5 · 0.57 | 1.5    |
| Hazelnut        | USE    | 8.8 · 0.67   | 8.9 · 0.69 | 8.9 · 0.72 | 9.0 · 0.72 | 0      |
| Hazelnut        | USW    | 7.6 · 0.78   | 8.0 · 0.84 | 8.4 · 0.90 | 8.8 · 0.93 | 0      |
| Elderflower     | NE     | 8.4 · 0.63   | 8.6 · 0.66 | 8.7 · 0.69 | 8.8 · 0.74 | 0      |
| Elderflower     | SE     | 8.3 · 0.65   | 8.4 · 0.65 | 8.5 · 0.64 | 8.6 · 0.62 | 1.5    |
| Elderflower     | USE    | 8.8 · 0.71   | 8.8 · 0.72 | 8.9 · 0.72 | 8.9 · 0.72 | 1.5    |
| Elderflower     | USW    | 6.3 · 0.57   | 7.0 · 0.60 | 7.8 · 0.70 | 8.6 · 0.81 | 0      |
| Common Daisy    | NE     | 8.2 · 0.58   | 8.3 · 0.61 | 8.5 · 0.65 | 8.7 · 0.69 | 0      |
| Common Daisy    | SE     | 8.1 · 0.65   | 8.3 · 0.67 | 8.5 · 0.69 | 8.7 · 0.70 | 0      |
| Common Daisy    | USE    | 8.1 · 0.77   | 8.1 · 0.78 | 8.2 · 0.79 | 8.3 · 0.79 | 1.5    |
| Common Daisy    | USW    | 7.5 · 0.81   | 7.8 · 0.87 | 8.2 · 0.92 | 8.5 · 0.94 | 0      |
| Wild Mint       | NE     | 7.6 · 0.53   | 8.0 · 0.56 | 8.3 · 0.61 | 8.7 · 0.69 | 0      |
| Wild Mint       | SE     | 6.9 · 0.53   | 7.2 · 0.54 | 7.5 · 0.55 | 7.8 · 0.55 | 0      |
| Wild Mint       | USE    | 8.6 · 0.67   | 8.7 · 0.69 | 8.7 · 0.70 | 8.8 · 0.70 | 1.5    |
| Wild Mint       | USW    | 6.0 · 0.57   | 6.6 · 0.61 | 7.3 · 0.70 | 8.0 · 0.79 | 0      |
| Common Plantain | NE     | 8.1 · 0.58   | 8.3 · 0.60 | 8.5 · 0.62 | 8.7 · 0.66 | 0      |
| Common Plantain | SE     | 7.2 · 0.54   | 7.3 · 0.54 | 7.5 · 0.53 | 7.6 · 0.52 | 1.5    |
| Common Plantain | USE    | 8.2 · 0.59   | 8.2 · 0.59 | 8.2 · 0.60 | 8.3 · 0.59 | 1.5    |
| Common Plantain | USW    | 6.4 · 0.59   | 6.9 · 0.62 | 7.3 · 0.69 | 7.8 · 0.74 | 0      |
| Wild Raspberry  | NE     | 7.1 · 0.56   | 6.9 · 0.56 | 6.8 · 0.57 | 6.7 · 0.56 | 1.5    |
| Wild Raspberry  | SE     | 5.7 · 0.70   | 5.5 · 0.69 | 5.3 · 0.68 | 5.2 · 0.67 | 1.5    |
| Wild Raspberry  | USE    | 5.8 · 0.78   | 5.5 · 0.78 | 5.3 · 0.78 | 5.1 · 0.78 | 1.5    |
| Wild Strawberry | NE     | 8.2 · 0.59   | 8.1 · 0.60 | 8.1 · 0.61 | 8.0 · 0.61 | 0      |
| Wild Strawberry | SE     | 7.4 · 0.62   | 7.3 · 0.62 | 7.2 · 0.62 | 7.1 · 0.62 | 1.5    |
| Wild Strawberry | USE    | 7.9 · 0.80   | 7.7 · 0.80 | 7.5 · 0.80 | 7.4 · 0.80 | 1.5    |
| Wild Strawberry | USW    | 6.5 · 0.76   | 6.7 · 0.79 | 6.8 · 0.81 | 7.0 · 0.82 | 0      |
| Lingonberry     | NE     | 8.4 · 0.48   | 8.4 · 0.48 | 8.4 · 0.48 | 8.4 · 0.48 | 1.5    |
| Lingonberry     | SE     | 7.1 · 0.88   | 6.9 · 0.88 | 6.8 · 0.88 | 6.6 · 0.87 | 1.5    |
| Lingonberry     | USE    | 7.3 · 0.94   | 7.0 · 0.94 | 6.9 · 0.94 | 6.7 · 0.94 | 1.5    |
| Nettle          | NE     | 5.9 · 0.41   | 5.9 · 0.43 | 5.9 · 0.45 | 5.9 · 0.47 | 0      |
| Nettle          | SE     | 5.7 · 0.65   | 5.5 · 0.65 | 5.4 · 0.65 | 5.4 · 0.64 | 1.5    |
| Nettle          | USE    | 5.7 · 0.72   | 5.4 · 0.72 | 5.2 · 0.72 | 5.0 · 0.72 | 1.5    |
| Nettle          | USW    | 4.8 · 0.67   | 4.9 · 0.70 | 5.0 · 0.72 | 5.1 · 0.74 | 0      |
| Dandelion       | NE     | 7.4 · 0.51   | 7.6 · 0.55 | 7.8 · 0.59 | 7.9 · 0.65 | 0      |
| Dandelion       | SE     | 8.0 · 0.74   | 8.0 · 0.74 | 8.0 · 0.74 | 8.0 · 0.73 | 1.5    |
| Dandelion       | USE    | 7.3 · 0.73   | 7.2 · 0.75 | 7.2 · 0.76 | 7.1 · 0.76 | 1.5    |
| Dandelion       | USW    | 6.2 · 0.70   | 6.3 · 0.72 | 6.4 · 0.73 | 6.5 · 0.75 | 0      |
| Chickweed       | NE     | 6.5 · 0.50   | 6.3 · 0.53 | 6.3 · 0.55 | 6.2 · 0.55 | 1.5    |
| Chickweed       | SE     | 6.1 · 0.67   | 6.0 · 0.68 | 6.0 · 0.69 | 6.0 · 0.69 | 1.5    |
| Chickweed       | USE    | 5.5 · 0.64   | 5.4 · 0.67 | 5.3 · 0.69 | 5.3 · 0.70 | 1.5    |
| Chickweed       | USW    | 6.3 · 0.85   | 6.2 · 0.87 | 6.2 · 0.88 | 6.2 · 0.89 | 1.5    |
| Common Sorrel   | NE     | 7.4 · 0.59   | 7.3 · 0.60 | 7.2 · 0.61 | 7.1 · 0.62 | 0      |
| Common Sorrel   | SE     | 6.7 · 0.68   | 6.5 · 0.68 | 6.5 · 0.68 | 6.4 · 0.68 | 1.5    |
| Common Sorrel   | USE    | 6.5 · 0.75   | 6.3 · 0.76 | 6.2 · 0.76 | 6.0 · 0.76 | 1.5    |
| Common Sorrel   | USW    | 6.7 · 0.85   | 6.7 · 0.87 | 6.8 · 0.89 | 6.8 · 0.89 | 0      |
| Wild Garlic     | NE     | 6.2 · 0.54   | 6.5 · 0.61 | 6.8 · 0.68 | 7.1 · 0.74 | 0      |
| Wild Garlic     | SE     | 6.5 · 0.65   | 6.7 · 0.69 | 6.9 · 0.72 | 7.0 · 0.74 | 1.5    |
| Amaranth        | SE     | 7.1 · 0.58   | 7.3 · 0.59 | 7.6 · 0.59 | 7.9 · 0.59 | 0      |
| Amaranth        | USE    | 9.0 · 0.71   | 8.9 · 0.71 | 8.9 · 0.71 | 8.8 · 0.71 | 1.5    |
| Amaranth        | USW    | 5.2 · 0.47   | 5.5 · 0.49 | 5.8 · 0.52 | 6.2 · 0.55 | 0      |
| Wild Asparagus  | SE     | 5.0 · 0.46   | 5.2 · 0.48 | 5.3 · 0.50 | 5.5 · 0.51 | 0      |
| Wild Artichoke  | NE     | 5.5 · 0.34   | 5.6 · 0.37 | 5.8 · 0.41 | 6.0 · 0.46 | 1.5    |
| Wild Artichoke  | SE     | 4.8 · 0.41   | 5.1 · 0.45 | 5.5 · 0.48 | 5.8 · 0.52 | 0      |
| Wild Artichoke  | USE    | 4.4 · 0.47   | 4.1 · 0.47 | 3.8 · 0.47 | 3.7 · 0.47 | 1.5    |
| Wild Artichoke  | USW    | 5.2 · 0.67   | 6.0 · 0.80 | 6.8 · 0.88 | 7.6 · 0.93 | 0      |
| Masterwort      | SE     | 7.3 · 0.92   | 7.0 · 0.93 | 6.9 · 0.93 | 6.8 · 0.92 | 1.5    |

For the existing plants these rows use all April–September sightings. Where the in-season check
below disagrees, it supersedes them, and the chosen column shows the value now in the manifest.
**Recalibrated existing plants.** All twelve existing plants were checked on
their in-season 2026 sightings: from 3 May, when the 21-day lookback is
complete, with missing weather days skipped as the scorer does. Each was
recalibrated with the method above, and nettle's water factor was tested too.
A region takes the new values under the rain-weight rule: the ranking holds
(within 0.01), the score at sightings does not drop, and one of them clearly
improves.

| plant           | region | sightings | before     | after      |             | new values                                                         |
| --------------- | ------ | --------: | ---------- | ---------- | ----------- | ------------------------------------------------------------------ |
| Wild Artichoke  | SE     |        71 | 7.8 · 0.63 | 8.6 · 0.72 | **applied** | 17 °C, 70%, 100 ± 800 m, pH 5.9, rain 11 mm, weight 0              |
| Wild Artichoke  | USW    |        64 | 8.5 · 0.96 | 9.1 · 0.98 | **applied** | 17 °C, 70%, 100 ± 800 m, pH 6.7, rain 5 mm, weight 0               |
| Wild Asparagus  | SE     |        53 | 8.1 · 0.65 | 8.8 · 0.72 | **applied** | 16 °C, 70%, 200 ± 800 m, pH 6.3, rain 20 mm, weight 0              |
| Amaranth        | SE     |       459 | 7.9 · 0.58 | 8.5 · 0.63 | **applied** | 22 °C, 55%, 200 ± 800 m, pH 5.5, rain 11 mm, weight 0              |
| Amaranth        | USE    |       298 | 9.0 · 0.70 | 8.8 · 0.66 | kept        | 23 °C, 70%, 200 ± 800 m, pH 5.9, rain 50 mm, weight 1.5            |
| Amaranth        | USW    |       290 | 6.2 · 0.55 | 8.4 · 0.62 | **applied** | 22 °C, 40%, 1350 ± 1900 m, pH 7.0, rain 3 mm, weight 0             |
| Dandelion       | NE     |        31 | 7.7 · 0.49 | 8.9 · 0.62 | **applied** | 12 °C, 75%, 50 ± 800 m, pH 4.6, rain 20 mm, weight 0               |
| Dandelion       | SE     |       160 | 7.3 · 0.65 | 7.7 · 0.62 | kept        | 15 °C, 70%, 450 ± 1400 m, pH 5.9, rain 31 mm, weight 1.5           |
| Dandelion       | USE    |       176 | 7.4 · 0.77 | 7.9 · 0.68 | kept        | 16 °C, 75%, 200 ± 800 m, pH 5.8, rain 57 mm, weight 1.5            |
| Dandelion       | USW    |       172 | 5.7 · 0.70 | 7.7 · 0.69 | kept        | 16 °C, 55%, 1000 ± 2700 m, pH 6.5, rain 3 mm, weight 0             |
| Wild Garlic     | NE     |        36 | 6.9 · 0.67 | 9.3 · 0.84 | **applied** | 10 °C, 75%, 50 ± 800 m, pH 4.5, rain 18 mm, weight 0               |
| Wild Garlic     | SE     |       101 | 7.1 · 0.72 | 7.8 · 0.68 | kept        | 12 °C, 75%, 550 ± 1000 m, pH 5.7, rain 32 mm, weight 1.5           |
| Lingonberry     | NE     |       101 | 8.4 · 0.48 | 8.9 · 0.67 | **applied** | 15 °C, 75%, 100 ± 800 m, pH 4.7, rain 32 mm, weight 1.5            |
| Lingonberry     | SE     |        78 | 7.1 · 0.89 | 8.5 · 0.86 | kept        | 16 °C, 70%, 1100 ± 2100 m, pH 5.4, rain 38 mm, weight 1.5          |
| Lingonberry     | USE    |        47 | 7.3 · 0.94 | 9.2 · 0.91 | kept        | 18 °C, 70%, 350 ± 800 m, pH 4.9, rain 40 mm, weight 1.5            |
| Nettle          | NE     |        83 | 6.3 · 0.43 | 8.9 · 0.68 | **applied** | 15 °C, 75%, 50 ± 800 m, pH 4.6, rain 22 mm, weight 0, water off    |
| Nettle          | SE     |       260 | 5.1 · 0.59 | 7.0 · 0.59 | **applied** | 19 °C, 65%, 450 ± 1300 m, pH 5.5, rain 16 mm, weight 1.5           |
| Nettle          | USE    |       227 | 5.4 · 0.71 | 8.2 · 0.60 | kept        | 20 °C, 70%, 200 ± 800 m, pH 5.8, rain 45 mm, weight 1.5, water off |
| Nettle          | USW    |       227 | 4.8 · 0.71 | 7.7 · 0.74 | **applied** | 17 °C, 60%, 450 ± 2200 m, pH 6.0, rain 3 mm, weight 0, water off   |
| Wild Raspberry  | NE     |        46 | 7.1 · 0.55 | 8.9 · 0.69 | **applied** | 15 °C, 75%, 100 ± 800 m, pH 4.6, rain 34 mm, weight 1.5            |
| Wild Raspberry  | SE     |        86 | 5.7 · 0.70 | 7.5 · 0.74 | **applied** | 18 °C, 60%, 1450 ± 1700 m, pH 5.5, rain 27 mm, weight 1.5          |
| Wild Raspberry  | USE    |        79 | 5.7 · 0.79 | 9.0 · 0.69 | kept        | 22 °C, 70%, 200 ± 800 m, pH 5.4, rain 41 mm, weight 1.5            |
| Common Sorrel   | NE     |       126 | 7.6 · 0.63 | 9.1 · 0.71 | **applied** | 12 °C, 75%, 50 ± 800 m, pH 4.7, rain 26 mm, weight 0               |
| Common Sorrel   | SE     |       184 | 7.0 · 0.62 | 7.6 · 0.63 | **applied** | 14 °C, 70%, 500 ± 1000 m, pH 5.3, rain 28 mm, weight 1.5           |
| Common Sorrel   | USE    |       178 | 7.2 · 0.79 | 8.5 · 0.76 | kept        | 15 °C, 75%, 200 ± 800 m, pH 5.3, rain 54 mm, weight 1.5            |
| Common Sorrel   | USW    |       178 | 7.1 · 0.91 | 8.5 · 0.91 | **applied** | 13 °C, 75%, 150 ± 800 m, pH 5.7, rain 12 mm, weight 0              |
| Wild Strawberry | NE     |        52 | 8.3 · 0.60 | 9.2 · 0.76 | **applied** | 16 °C, 75%, 50 ± 800 m, pH 4.6, rain 33 mm, weight 0               |
| Wild Strawberry | SE     |        96 | 7.5 · 0.60 | 8.3 · 0.61 | **applied** | 17 °C, 70%, 600 ± 1100 m, pH 5.3, rain 28 mm, weight 1.5           |
| Wild Strawberry | USE    |        63 | 7.9 · 0.80 | 8.8 · 0.75 | kept        | 19 °C, 75%, 200 ± 800 m, pH 5.5, rain 49 mm, weight 1.5            |
| Wild Strawberry | USW    |        33 | 6.7 · 0.78 | 8.3 · 0.84 | **applied** | 15 °C, 65%, 500 ± 2100 m, pH 5.7, rain 4 mm, weight 0              |
| Masterwort      | SE     |       430 | 7.3 · 0.94 | 8.6 · 0.92 | kept        | 15 °C, 70%, 1800 ± 1400 m, pH 5.4, rain 67 mm, weight 1.5          |

- **Nettle:** its old values put its optimum at 700 ± 800 m and 85% humidity,
  and applied the water-distance factor. Its sightings sit near 50 m at 75%,
  most of them far from mapped water. In North Europe it now scores 8.9 at
  sightings instead of 6.3.
- **Lingonberry:** its optimum moves from 10.5 °C to the 15 °C at which its
  fruit is found.
- **Wild garlic, North Europe:** 6.9 → 9.3.

**Not checked:**

- **Too few in-season sightings (under 30):** artichoke in NE and USE,
  asparagus in NE, lingonberry, raspberry and masterwort in the regions
  missing above, amaranth in NE.
- **Chickweed, everywhere:** its season (October–April) falls outside the
  weather files.

**Rain weight rechecked in season.** Two rain weights had been set from all
April–September sightings. On in-season sightings the rule no longer supports
them, so they are back at 1.5:

- wild garlic in South Europe, where summer sightings had carried it;
- artichoke in North Europe, foraged in spring but chosen on summer sightings
  of flowering plants.

## Photo identification and look-alikes

The catalog labels are unchanged: all eleven species were already in the
vocabulary. What changed:

- **Promoted to toxic:**
  - pokeweed (_Phytolacca americana_), the elderberry look-alike in North
    America;
  - red elder (_Sambucus racemosa_), whose raw berries are poisonous;
  - lesser celandine (_Ficaria verna_), whose leaves are picked for violet
    leaves in spring.

  All three were neutral rows, so a photo showed "no safety information". Two
  new checks were added in all six languages: berry colour, and flower shape
  (violet against celandine).

- **Poison and water hemlock** now also warn against elderflower (flat white
  flower heads), with the woody-shrub check.
- Existing warnings already covered oyster (_Omphalotus_, sulphur tuft, angel
  wings), elder (dwarf elder) and blueberry (deadly nightshade, herb Paris).

- **North American bolete look-alikes, new to the vocabulary:** the three
  eastern boletes that make people sick (_Neoboletus subvelutipes_,
  _Boletus sensibilis_, _B. huronensis_), the two bitter _Tylopilus_ that pass
  for the Eastern King (_T. rubrobrunneus_, and _T. plumbeoviolaceus_, as violet
  as _X. separans_), and the two western _Rubroboletus_ that grow with Pacific
  porcini (_R. pulcherrimus_ has caused a death). None was in the vocabulary,
  so a photo of one could only surface as a neighbouring label. Every entry
  reuses existing reason and check texts.

**The gate now measures what it says.** Since #266, 30 test photos still
carried the retired genus label `Boletus`. As catalog photos they could never
be answered correctly, and the warning metric counted them as toxic.
`--stage verify-shipped` now skips test photos whose label no longer ships as
catalog or toxic, and counts a photo as toxic only when its species is flagged
toxic. On the same artifacts, this lifts the figures:

- warning availability: 93.9% → 97.7%;
- catalog top-1 / top-3: 79.1% / 89.1% → 81.8% / 92.1%;
- false-edible: unchanged at 1.36%.

`--stage verify-shipped` (corrected), 1,560 test photos, 660 of them toxic:

|                                       | `main` (after #276)     | this change             | gate              |
| ------------------------------------- | ----------------------- | ----------------------- | ----------------- |
| labels (catalog / toxic / other)      | 2,625 (40 / 65 / 2,520) | 2,635 (40 / 75 / 2,520) | —                 |
| false-edible@1                        | 1.36%                   | 1.36%                   | ceiling 2% — pass |
| toxic label in top-3 of a toxic photo | 97.6%                   | 97.7%                   | floor 92% — pass  |
| catalog top-1 / top-3                 | 81.8% / 92.1%           | 81.8% / 92.1%           | not gated         |

The promoted and new names took ten tier-2 slots, and the observation-ranked
cap let as many regional names in, so tier 2 stays at 2,520.

**The new bolete labels on real photos.** The test set has no photos of the
seven new boletes. So 14–15 recent research-grade iNaturalist photos of each
were scored against the vocabulary before and after:

| species                      | edible label first (before → after) | toxic label in top 3 (before → after) |
| ---------------------------- | ----------------------------------: | ------------------------------------: |
| _Boletus huronensis_         |                            64% → 7% |                             43% → 93% |
| _Tylopilus plumbeoviolaceus_ |                            33% → 0% |                            20% → 100% |
| _Tylopilus rubrobrunneus_    |                            13% → 0% |                            87% → 100% |
| _Neoboletus subvelutipes_    |                             0% → 0% |                            60% → 100% |
| _Boletus sensibilis_         |                             0% → 0% |                            67% → 100% |
| _Rubroboletus pulcherrimus_  |                             0% → 0% |                            93% → 100% |
| _Rubroboletus eastwoodiae_   |                             0% → 0% |                           100% → 100% |

Before, most Huron bolete photos came back as _B. edulis_ or _B. variipes_,
edible labels with no warning. BioCLIP may have seen some of these photos in
training, so the "after" figures are optimistic. The "before" column shows the
risk either way.

## Literature check (fungi)

MushroomExpert agrees with the hosts and seasons above:

- [_L. sulphureus_](https://www.mushroomexpert.com/laetiporus_sulphureus.html):
  on living and dead oaks, sometimes other hardwoods; summer and fall.
- [_L. gilbertsonii_](https://www.mushroomexpert.com/laetiporus_gilbertsonii.html):
  on oaks and eucalyptus; fall and winter; the West Coast and the Southwest.
- [_P. ostreatus_](https://www.mushroomexpert.com/pleurotus_ostreatus.html):
  late fall (October) through early spring (early April).
- [_P. pulmonarius_](https://www.mushroomexpert.com/pleurotus_pulmonarius.html):
  late spring through September.
- [_P. populinus_](https://www.mushroomexpert.com/pleurotus_populinus.html):
  on aspen and cottonwood, spring to fall.

The plants' seasons come from iNaturalist phenology rather than from a
literature source. Hazelnut is the exception, where the annotations mix green
and ripe nuts.

## Chestnut and walnut seasons, one month earlier

Both existing nuts were set to October–November, which misses the September
fall and runs into November after the best weeks. The new windows follow the
ripe end of the iNaturalist fruit annotations (green fruit dominates earlier
months) and the harvest timing:

| species               | before  | after                  | evidence                                                           |
| --------------------- | ------- | ---------------------- | ------------------------------------------------------------------ |
| Chestnut              | Oct–Nov | NE Sep–Oct, SE Sep–Nov | burr annotations: NE Sep 31%, Oct 27%; SE Sep 25%, Oct 26%, Nov 8% |
| Walnut / black walnut | Oct–Nov | Sep–Oct everywhere     | black walnut, US East: Sep 22%, Oct 15%, Nov 3%                    |

Walnut's European annotations peak in June–July on green fruit, so they say
little about ripening. Its window follows the September–October harvest of
_J. regia_ and matches the black walnut's.

## Rollout

- **Range priors:** rebuilt on the next scoring run, because the published
  files record their taxon keys.
- **Season curves** for the two fungi: rebuilt on the first run on or after
  1 October. If this merges later, run `build_season_curves.py --force`.
- **Publishing:** `Task_Scheduler/Upload_Scores_GitHub_logic.py` maps the
  eleven new `<id>_score` columns. That folder is not a git repo, so the
  change is local. Two ids are hyphenated (`chicken-of-the-woods_score`,
  `oyster-mushroom_score`), which the map layers and the parquet handle as
  they do any other.

## Recipes

Not in this change. None of the eleven has a recipe yet, and every recipe in
the app has a painted illustration in the house style.

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

- **Weather:** the production regional parquets, at the base point nearest
  each 2026 sighting. For plants, these are iNaturalist observations annotated
  with the forageable stage.
- **Values:** optima at the sighting medians. The rain threshold sits at the
  lower quartile of 21-day rain, so dry-season sightings are not all zeroed.
- **Plants:** wider temperature sigmas (6) than fungi, and no wind
  sensitivity or `rain_first`.
- **Wood-decay fungi:** a neutral pH sigma (2.5), because they grow on wood,
  not soil.

| species              | region | temp (°C) | humidity (%) | altitude (m) |  pH | rain (mm, 21 days) |
| -------------------- | ------ | --------: | -----------: | -----------: | --: | -----------------: |
| Chicken of the Woods | NE     |    17 ± 5 |           65 |    50 ± 1000 | 5.0 |                 13 |
| Chicken of the Woods | SE     |    20 ± 5 |           65 |   330 ± 1000 | 5.3 |                 12 |
| Chicken of the Woods | USE    |    23 ± 5 |           70 |   230 ± 1000 | 5.4 |                 44 |
| Chicken of the Woods | USW    |    19 ± 5 |           64 |   240 ± 1000 | 6.0 |                  5 |
| Oyster Mushroom      | NE     |    13 ± 7 |           75 |    70 ± 1200 | 5.8 |                 21 |
| Oyster Mushroom      | SE     |    13 ± 7 |           75 |   600 ± 1200 | 5.8 |                 24 |
| Oyster Mushroom      | USE    |    15 ± 7 |           75 |   240 ± 1200 | 5.8 |                 48 |
| Oyster Mushroom      | USW    |    13 ± 7 |           75 |   530 ± 1200 | 5.8 |                 10 |
| Elderflower          | NE     |    10 ± 6 |           85 |    100 ± 800 | 5.0 |                 23 |
| Elderflower          | SE     |    14 ± 6 |           65 |   450 ± 1000 | 6.0 |                 22 |
| Elderflower          | USE    |    23 ± 6 |           70 |    100 ± 800 | 5.5 |                 57 |
| Elderflower          | USW    |    19 ± 6 |           45 |   200 ± 1300 | 6.6 |                  2 |
| Elderberry           | NE     |    18 ± 6 |           70 |    100 ± 800 | 5.0 |                  6 |
| Elderberry           | SE     |    23 ± 6 |           55 |   650 ± 1200 | 5.7 |                  7 |
| Elderberry           | USE    |    25 ± 6 |           70 |    100 ± 800 | 5.6 |                 47 |
| Elderberry           | USW    |    20 ± 6 |           50 |   200 ± 1300 | 6.6 |                  1 |
| Blackberry           | NE     |    18 ± 6 |           70 |    100 ± 800 | 5.0 |                  7 |
| Blackberry           | SE     |    24 ± 6 |           55 |   350 ± 1100 | 6.0 |                  4 |
| Blackberry           | USE    |    22 ± 6 |           70 |    150 ± 800 | 5.6 |                 35 |
| Blackberry           | USW    |    18 ± 6 |           65 |    250 ± 800 | 5.7 |                  1 |
| Wild Blueberry       | NE     |    15 ± 6 |           75 |    150 ± 800 | 4.8 |                 35 |
| Wild Blueberry       | SE     |    18 ± 6 |           55 |  1600 ± 1400 | 5.6 |                 25 |
| Wild Blueberry       | USE    |    22 ± 6 |           70 |    150 ± 800 | 5.2 |                 40 |
| Wild Blueberry       | USW    |    16 ± 6 |           65 |  1500 ± 1500 | 5.0 |                  5 |
| Hazelnut             | NE     |    18 ± 6 |           70 |    100 ± 800 | 5.0 |                 10 |
| Hazelnut             | SE     |    22 ± 6 |           55 |   850 ± 1500 | 5.7 |                 15 |
| Hazelnut             | USE    |    22 ± 6 |           70 |    250 ± 800 | 5.6 |                 45 |
| Hazelnut             | USW    |    17 ± 6 |           65 |    150 ± 800 | 5.6 |                  4 |
| Wild Mint            | NE     |    17 ± 6 |           70 |    100 ± 800 | 5.0 |                  9 |
| Wild Mint            | SE     |    22 ± 6 |           55 |   350 ± 1100 | 5.8 |                  5 |
| Wild Mint            | USE    |    22 ± 6 |           70 |    200 ± 800 | 5.6 |                 44 |
| Wild Mint            | USW    |    19 ± 6 |           60 |   250 ± 1400 | 6.0 |                  1 |
| Sweet Violet         | NE     |     7 ± 6 |           80 |    150 ± 800 | 6.0 |                 10 |
| Sweet Violet         | SE     |     9 ± 6 |           75 |   500 ± 1000 | 6.0 |                 10 |
| Sweet Violet         | USE    |    12 ± 6 |           70 |    200 ± 800 | 6.0 |                 10 |
| Sweet Violet         | USW    |    11 ± 6 |           70 |   300 ± 1000 | 6.0 |                 10 |
| Common Plantain      | NE     |    16 ± 6 |           75 |    150 ± 800 | 5.2 |                 14 |
| Common Plantain      | SE     |    20 ± 6 |           65 |    350 ± 900 | 5.8 |                 12 |
| Common Plantain      | USE    |    21 ± 6 |           70 |    150 ± 800 | 5.5 |                 42 |
| Common Plantain      | USW    |    19 ± 6 |           60 |   250 ± 1300 | 6.3 |                  3 |
| Common Daisy         | NE     |     8 ± 6 |           75 |    100 ± 800 | 5.0 |                  3 |
| Common Daisy         | SE     |    12 ± 6 |           55 |   350 ± 1100 | 5.8 |                 12 |
| Common Daisy         | USE    |    11 ± 6 |           70 |    200 ± 800 | 5.8 |                 44 |
| Common Daisy         | USW    |    14 ± 6 |           80 |    150 ± 800 | 5.7 |                  2 |

**Against the siblings.** Compared with raspberry's values (berries, nuts) or
nettle's (greens, flowers), these raise the mean weather score at real
sightings in every species and region. For example:

- Elderberry, US East: 4.3 → 8.8.
- Blackberry, South Europe: 3.3 → 6.3.
- Wild mint, US East: 4.8 → 8.6.

Against random points of the region on the same days they rank sightings
higher in most cases, a little lower in a few. The range prior and land cover
do that ranking anyway.

**Values not calibrated from 2026 weather:**

- **Sweet violet:** it flowers in February–April, before the weather files
  begin (12 April). Its values follow the regions' early-spring weather and
  chickweed, the catalog's other early-spring plant.
- **Wild blueberry, US West:** only 6 annotated sightings, so these are
  literature values: Rocky Mountain bilberry at altitude.
- **Oyster:** the April–September sample holds only the summer oysters, so the
  temperature is from the literature. _P. ostreatus_ fruits from October to
  early April (MushroomExpert), so the optimum is a winter-tolerant
  13 ± 7 °C, or 15 ± 7 °C in the summer-dominated US East. That keeps the
  summer oysters in the sample at a mean of 7.3–8.1.

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

`scoring.rain_weight` makes the weight per species. It defaults to 1.5, so every
species that does not set it scores exactly as before. The golden-master
scoring tests are unchanged.

**Tested** with the production scoring on the same 2026 stage sightings as the
parameters (weather only). Each cell shows the mean score at sightings, then how
often a sighting outscores a random point of its region on the same day.

| species     | region | 1.5 (before) | 0.75       | 0.3        | 0              |
| ----------- | ------ | ------------ | ---------- | ---------- | -------------- |
| Blackberry  | NE     | 8.0 · 0.56   | 8.3 · 0.60 | 8.7 · 0.66 | **9.0 · 0.74** |
| Blackberry  | SE     | 6.3 · 0.48   | 6.9 · 0.50 | 7.5 · 0.53 | **8.2 · 0.58** |
| Blackberry  | USE    | 8.4 · 0.65   | 8.6 · 0.67 | 8.8 · 0.69 | **9.0 · 0.71** |
| Blackberry  | USW    | 6.5 · 0.67   | 7.2 · 0.76 | 8.0 · 0.87 | **8.7 · 0.93** |
| Elderberry  | NE     | 7.6 · 0.53   | 8.0 · 0.56 | 8.4 · 0.61 | **8.8 · 0.71** |
| Elderberry  | SE     | 6.8 · 0.53   | 7.3 · 0.53 | 7.8 · 0.55 | **8.4 · 0.57** |
| Elderberry  | USE    | 8.8 · 0.65   | 8.8 · 0.65 | 8.9 · 0.65 | 9.0 · 0.64     |
| Elderberry  | USW    | 5.1 · 0.43   | 6.1 · 0.47 | 7.3 · 0.61 | **8.4 · 0.78** |
| Blueberry   | NE     | 8.7 · 0.59   | 8.8 · 0.61 | 8.8 · 0.61 | 8.8 · 0.61     |
| Blueberry   | SE     | 8.0 · 0.72   | 8.1 · 0.73 | 8.2 · 0.73 | 8.4 · 0.72     |
| Blueberry   | USE    | 8.7 · 0.65   | 8.8 · 0.67 | 8.8 · 0.68 | **8.8 · 0.69** |
| Hazelnut    | NE     | 8.1 · 0.55   | 8.4 · 0.60 | 8.6 · 0.65 | **8.9 · 0.71** |
| Hazelnut    | SE     | 8.0 · 0.65   | 8.2 · 0.65 | 8.4 · 0.64 | 8.5 · 0.60     |
| Hazelnut    | USE    | 8.8 · 0.67   | 8.9 · 0.69 | 8.9 · 0.72 | **9.0 · 0.72** |
| Hazelnut    | USW    | 7.6 · 0.78   | 8.0 · 0.84 | 8.4 · 0.90 | **8.8 · 0.93** |
| Elderflower | NE     | 8.2 · 0.61   | 8.3 · 0.63 | 8.3 · 0.65 | **8.4 · 0.68** |
| Elderflower | SE     | 8.3 · 0.65   | 8.4 · 0.65 | 8.5 · 0.65 | 8.6 · 0.64     |
| Elderflower | USE    | 8.8 · 0.71   | 8.8 · 0.72 | 8.9 · 0.72 | **8.9 · 0.72** |
| Elderflower | USW    | 6.3 · 0.57   | 7.0 · 0.60 | 7.8 · 0.70 | **8.6 · 0.81** |
| Daisy       | NE     | 7.6 · 0.53   | 7.9 · 0.55 | 8.3 · 0.59 | **8.7 · 0.69** |
| Daisy       | SE     | 8.0 · 0.60   | 8.2 · 0.61 | 8.4 · 0.61 | 8.6 · 0.60     |
| Daisy       | USE    | 8.1 · 0.77   | 8.1 · 0.78 | 8.2 · 0.79 | **8.4 · 0.79** |
| Daisy       | USW    | 7.5 · 0.81   | 7.8 · 0.87 | 8.2 · 0.92 | **8.5 · 0.94** |
| Wild Mint   | NE     | 7.8 · 0.57   | 8.1 · 0.60 | 8.4 · 0.64 | **8.7 · 0.70** |
| Wild Mint   | SE     | 6.6 · 0.48   | 6.9 · 0.49 | 7.3 · 0.51 | **7.7 · 0.52** |
| Wild Mint   | USE    | 8.6 · 0.67   | 8.7 · 0.69 | 8.7 · 0.70 | **8.8 · 0.70** |
| Wild Mint   | USW    | 6.0 · 0.57   | 6.6 · 0.61 | 7.3 · 0.70 | **8.0 · 0.78** |
| Plantain    | NE     | 7.9 · 0.55   | 8.0 · 0.57 | 8.2 · 0.58 | **8.3 · 0.60** |
| Plantain    | SE     | 7.1 · 0.53   | 7.2 · 0.53 | 7.4 · 0.53 | **7.5 · 0.53** |
| Plantain    | USE    | 8.2 · 0.59   | 8.2 · 0.59 | 8.3 · 0.60 | 8.3 · 0.59     |
| Plantain    | USW    | 6.4 · 0.59   | 6.9 · 0.62 | 7.3 · 0.69 | **7.8 · 0.74** |

Weight 0 is best, or within 0.05 of the best, on both numbers in all 30 pairs.
The gains are largest where summers are dry, where the rain term had been
working against the plants.

**Set to 0:** blackberry, elderberry, blueberry, hazelnut, elderflower, daisy,
wild mint and plantain (tested), plus sweet violet, chestnut and walnut, which
could not be tested. Violet flowers in February–April and the two nuts drop in
late September–October, outside the weather files (12 April – today). They
follow the tested flowers and hazelnut, and can be checked once this autumn's
sightings are in the files.

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

`--stage verify-shipped`, same 1,590 test photos:

|                                       | before                  | after                   | gate              |
| ------------------------------------- | ----------------------- | ----------------------- | ----------------- |
| labels (catalog / toxic / other)      | 2,625 (40 / 65 / 2,520) | 2,628 (40 / 68 / 2,520) | —                 |
| false-edible@1                        | 1.36%                   | 1.36%                   | ceiling 2% — pass |
| toxic label in top-3 of a toxic photo | 93.8%                   | 93.9%                   | floor 92% — pass  |
| catalog top-1 / top-3                 | 79.1% / 89.1%           | 79.1% / 89.1%           | not gated         |

The three promoted names left tier 2, and the observation-ranked cap let three
more regional names in, so tier 2 stays at 2,520.

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

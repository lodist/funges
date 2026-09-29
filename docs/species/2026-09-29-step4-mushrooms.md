# Saffron milk cap, hedgehog, shaggy mane, giant puffball and matsutake

Date: 2026-09-29 (roadmap #272, step 4: the mushrooms)

Five of the most-hunted wild mushrooms the app did not cover. This record covers
their catalog entries and forecasts. It is the reviewed source the manifests
cite in `scoringReferences` and `identification.safetyReview`.

**The parameter values below are agent-derived and await Loris Di Stefano's
approval.** The validator checks types, ranges and sigmas. It cannot establish
scientific authority, and no mycologist has reviewed them. They rest on GBIF
and iNaturalist records and the 2026 weather at real sightings, checked against
the sources in [Literature check](#literature-check).

## Changes

| id                  | name              | range and season keys (GBIF)                                                                                                                                                                                                                 | regions          |
| ------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `saffron_milk_cap`  | Saffron Milk Cap  | _Lactarius deliciosus_ 5248629, _L. deterrimus_ 7925734, _L. sanguifluus_ 5248648, _L. semisanguifluus_ 5248649, _L. salmonicolor_ 5248788, _L. quieticolor_ 5248728, _L. vinosus_ 5462971, _L. rubrilacteus_ 5463706, _L. aestivus_ 7526756 | NE, SE, USE, USW |
| `hedgehog_mushroom` | Hedgehog Mushroom | genus _Hydnum_ 2513763                                                                                                                                                                                                                       | NE, SE, USE, USW |
| `shaggy_mane`       | Shaggy Mane       | _Coprinus comatus_ 7987658                                                                                                                                                                                                                   | NE, SE, USE, USW |
| `giant_puffball`    | Giant Puffball    | _Calvatia gigantea_ 2536058, _C. booniana_ 3339928                                                                                                                                                                                           | NE, SE, USE, USW |
| `matsutake`         | Matsutake         | _Tricholoma matsutake_ 5241820, _T. murrillianum_ 5241743, _T. magnivelare_ 5241741                                                                                                                                                          | NE, USE, USW     |

Also in this PR:

- Two look-alikes join the photo-ID vocabulary as toxic, and seven existing
  toxic entries gain a warning pair with a new species
  ([Photo identification](#photo-identification)).
- Six recipes in six locales ([Recipes](#recipes)).
- Two small fixes:
  - `species:check` no longer rejects Spanish and Portuguese text containing
    "todo" (all). Its TODO check was case-insensitive.
  - The recipe cards of lion's mane and hen of the woods (#279) showed a raw
    key instead of the species name.

## What each entry covers

Foragers do not split these the way taxonomists do, so each entry is the group
people pick as one mushroom.

- **Saffron milk cap: the orange-milk _Lactarius_ (section _Deliciosi_).** All
  bleed orange to red milk, all are edible, and field guides and markets treat
  them as one:
  - _L. deliciosus_, _L. sanguifluus_ and _L. semisanguifluus_ with pines. The
    last two are the Catalan _rovelló_ and the Italian _sanguinello_.
  - _L. deterrimus_ with spruce: 25,379 of the group's 47,775 European records,
    the _rydz_ and _ryzhik_ of Poland and Russia.
  - _L. salmonicolor_ with fir, and _L. quieticolor_ and _L. vinosus_ with pines.
  - In North America: _L. rubrilacteus_ (Douglas-fir) and _L. aestivus_ in the
    West. GBIF files the eastern cedar-swamp _L. thyinos_ under
    _L. salmonicolor_, so that key carries it.
  - Left out: the blue _L. indigo_, a different mushroom to the people who eat
    it.
- **Hedgehog: the genus _Hydnum_.** Every _Hydnum_ is a hedgehog and edible.
  North America has at least ten species, most recently split out of
  _H. repandum_ (_H. umbilicatum_, _H. subolympicum_, _H. oregonense_ …), and
  most of its records are filed at genus level.
- **Shaggy mane: _Coprinus comatus_ alone.**
- **Giant puffball: _Calvatia gigantea_ and the western giant puffball
  _C. booniana_.** _C. booniana_ replaces _C. gigantea_ in the arid West (742
  of the 772 US West records). Left out: the smaller purple-spored
  _C. cyathiformis_.
- **Matsutake: _T. matsutake_ in Europe, _T. murrillianum_ in western and
  _T. magnivelare_ in eastern North America.** Left out: _T. caligatum_, the
  bitter Mediterranean "European matsutake".

## Records

GBIF human observations with coordinates, 1990–2025 (training) / 2026:

| taxon                         | North Europe | South Europe |    US East |   US West |
| ----------------------------- | -----------: | -----------: | ---------: | --------: |
| _Lactarius deliciosus_        |     9,441/53 |     2,574/14 |       87/0 |     575/8 |
| _L. deterrimus_               |   22,111/363 |      3,268/9 |     239/11 |      52/3 |
| _L. salmonicolor_ (+ thyinos) |      3,516/1 |      1,889/4 |     387/31 |       4/0 |
| _L. rubrilacteus_             |            0 |            0 |          0 |   1,173/5 |
| other _Deliciosi_ (5)         |     3,528/11 |      1,448/2 |        2/0 |      65/0 |
| genus _Hydnum_                |   44,257/418 |     5,405/24 |   1,086/15 |    646/47 |
| _Coprinus comatus_            |  107,718/700 |    6,164/167 | 10,597/228 | 7,861/227 |
| _Calvatia gigantea_           |   13,818/500 |       321/10 |  5,929/235 |      30/1 |
| _C. booniana_                 |            0 |         15/0 |       14/2 |    742/78 |
| _Tricholoma matsutake_        |     5,830/49 |         12/0 |          0 |         0 |
| _T. murrillianum_             |            0 |            0 |          0 |  1,037/15 |
| _T. magnivelare_              |            0 |            0 |      101/1 |       3/0 |

GBIF's 2026 counts are low because the autumn records have not arrived yet. The
calibration uses iNaturalist instead: verifiable observations from 12 April to
28 September 2026 (the weather files' observed days), without obscured
locations or accuracy worse than 5 km, and within 0.25° of a scoring point.
That last filter drops sightings in Canada, Russia and Belarus, which the search
boxes include and the grid does not (5–55% of each sample).

| species          |       Europe |    US |
| ---------------- | -----------: | ----: |
| saffron milk cap |          652 |   335 |
| hedgehog         |          323 |   758 |
| shaggy mane      |        1,628 | 1,143 |
| giant puffball   |          784 | 2,121 |
| matsutake        | 5 (GBIF: 49) |    15 |

- **Matsutake is the thin one.** The Nordic records are in Artportalen and
  Laji.fi, not iNaturalist, so its European sample is the 49 GBIF 2026
  sightings. Its American season (October–November) had not started when the
  weather files end: 12 sightings in US East and 2 in US West.
- **_Lactarius torminosus_ (woolly milk cap):** 16,980 European records, the
  look-alike of the saffron milk cap.

## Where they can grow

### Range prior

Built locally with `build_range_priors.py`'s own functions (1990–2025, fungi
background, casual rescue), then scored against the 2026 sightings.

| species          | 2026 sightings hidden (prior < 0.1)              | mean prior, share < 0.1: NE / SE / USE / USW |
| ---------------- | ------------------------------------------------ | -------------------------------------------- |
| saffron milk cap | GBIF 0.0% of 499, iNaturalist 0.0% of 1,366      | 0.98, 0% / 1.00, 0% / 0.79, 0% / 0.99, 0%    |
| hedgehog         | GBIF 0.0% of 480, iNaturalist 0.0% of 1,334      | 1.00, 0% / 0.99, 0% / 0.96, 0% / 0.97, 0%    |
| shaggy mane      | GBIF 0.0% of 1,256, iNaturalist 0.0% of 3,409    | 0.91, 2% / 1.00, 0% / 0.95, 0% / 1.00, 0%    |
| giant puffball   | GBIF 0.1% of 784, iNaturalist 0.1% of 3,690      | 0.69, 10% / 0.98, 0% / 0.83, 0% / 0.96, 1%   |
| matsutake        | GBIF 0.0% of 50, iNaturalist 1 of 38 (see below) | 0.57, 31% / — / 0.57, 6% / 0.96, 0%          |

- **Four of the five grow almost everywhere their region reaches**, so the prior
  rules little out. The host trees and the land cover do that work.
- **The giant puffball prior closes the far north** (10% of the North Europe
  points).
- **The matsutake prior closes a third of North Europe**: Britain, the Low
  Countries and most of Germany. The one hidden sighting is an unconfirmed May
  record in Saxony filed as the North American _T. magnivelare_.

### Host trees

Three are mycorrhizal and list their hosts. The test is the share hidden among
sightings made in forest (≥ 10% mapped forest within ~5 km), on all-year GBIF
records with coordinate uncertainty ≤ 1 km and on the 2026 iNaturalist
sightings. The host maps are not GBIF-built, so all years can be used without
leakage. Town and farmland sightings cannot appear on the forest-only map with
or without a host list.

| species, region       | host classes                                        | hidden among forest sightings (all years / 2026) |
| --------------------- | --------------------------------------------------- | -----------------------------------------------: |
| saffron milk cap, NE  | pine                                                |                                      4.9% / 7.9% |
| saffron milk cap, NE  | pine, spruce, other conifers                        |                                      0.0% / 0.0% |
| saffron milk cap, SE  | pine                                                |                                    11.2% / 26.5% |
| saffron milk cap, SE  | pine, spruce, other conifers                        |                                      1.2% / 0.0% |
| saffron milk cap, USE | all conifers                                        |                                      5.8% / 6.8% |
| saffron milk cap, USE | conifers + oak–pine, aspen–birch, maple–beech–birch |                                      0.5% / 0.4% |
| saffron milk cap, USW | pines                                               |                                    77.6% / 33.3% |
| saffron milk cap, USW | all conifers                                        |                                      0.3% / 0.0% |
| hedgehog, all regions | every forest class                                  |                                      0.0% / 0.0% |
| matsutake, NE         | pine                                                |                                     0.0% (4,200) |
| matsutake, USE        | all conifers                                        |                            0.0% / 0.0% (40 / 28) |

- **Saffron milk cap needs more than pine.** _L. deterrimus_ grows with spruce,
  and the Alpine 2026 sample is 59% spruce. Other conifers carry the fir of
  _L. salmonicolor_.
- **In US East the saffron milk caps sit in stands the map types as hardwood**
  (86–91% of the forest around them): the conifers inside New England and Great
  Lakes northern-hardwood stands, and the cedar swamps of _L. thyinos_. This is
  the same as _B. edulis_ in #269, which lists maple–beech–birch for it.
- **Pinyon–juniper is left out** of the saffron milk cap and matsutake lists.
  Neither grows in the dry pinyon woodland, and the class also carries eastern
  redcedar.
- **Matsutake, US West: literature.** Its 37 precise records are too few, and 92%
  of them are not in mapped forest. The list is all conifers except
  pinyon–juniper, plus tanoak for California.
- **Hedgehog lists every forest class.** It grows with conifers and broadleaves
  alike, so the list only closes open country: 3% of NE points, 11% of US East,
  26% of US West.

Full score (weather × range × hosts) at the calibration sightings against 400
random points of the region on the same days:

| species, region       | hosts              | mean at sightings | mean at random points | spatial AUC | random points closed |
| --------------------- | ------------------ | ----------------: | --------------------: | ----------: | -------------------: |
| saffron milk cap, NE  | none               |              8.69 |                  7.98 |       0.629 |                   0% |
| saffron milk cap, NE  | conifers           |              8.37 |                  6.89 |       0.620 |                  10% |
| saffron milk cap, SE  | none               |              8.38 |                  4.31 |       0.881 |                   0% |
| saffron milk cap, SE  | conifers           |              8.30 |                  3.64 |       0.887 |                  12% |
| saffron milk cap, USE | none               |              8.79 |                  4.55 |       0.917 |                   0% |
| saffron milk cap, USE | conifers only      |              6.80 |                  2.07 |       0.854 |                  48% |
| saffron milk cap, USE | chosen list        |              8.79 |                  3.16 |       0.927 |                  31% |
| saffron milk cap, USW | chosen list        |              7.13 |                  1.74 |       0.905 |                  59% |
| hedgehog, USE         | every forest class |              8.68 |                  5.53 |       0.837 |                  11% |
| hedgehog, USW         | every forest class |              7.43 |                  2.45 |       0.933 |                  26% |
| matsutake, NE         | none               |              8.67 |                  4.80 |       0.844 |                  30% |
| matsutake, NE         | pine               |              8.67 |                  3.82 |       0.864 |                  43% |
| matsutake, NE         | pine + spruce      |              8.67 |                  4.04 |       0.860 |                  38% |

### Land cover

The map draws only the land-cover classes in its wilderness layer: forests,
natural grassland, scrub and bare ground. Lawns, parks, pastures and roadsides
are not in it.

- **Saffron milk cap and matsutake:** conifer and mixed forest, plus
  transitional woodland (CORINE 312, 313, 324). In the US, all forest for the
  saffron milk cap (NLCD 41–43, because its US East hosts sit in hardwood-typed
  stands) and evergreen and mixed forest for matsutake (42, 43).
- **Hedgehog:** all forest (CORINE 311–313, NLCD 41–43).
- **Shaggy mane and giant puffball: broadleaf and mixed forest, natural
  grassland and scrub** (CORINE 311, 313, 321, 324; NLCD 41, 43, 52, 71).
  - Many of their finds are in towns and farmland: 37–63% of US sightings have
    less than 10% forest within ~5 km (3–30% in Europe). The map cannot show
    those places.
  - It shows the forecast in the nearest wild ground instead, the way it does
    for dandelion and nettle. The "how to find" text sends people to lawns,
    verges and pastures.
  - Adding pasture and urban green to the wilderness layer would be the real
    fix, and is a separate change.

## Seasons

Share of all-year precise records by month (≥ 5% in bold):

| species (region)       |    Jan |    Feb |   Mar |    Apr |    May |    Jun |    Jul |    Aug |    Sep |    Oct |    Nov |    Dec |
| ---------------------- | -----: | -----: | ----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: |
| saffron milk cap (NE)  |      0 |      0 |     0 |      0 |      0 |      0 |  **6** | **25** | **32** | **29** |  **6** |      0 |
| saffron milk cap (SE)  |  **5** |      0 |     0 |      0 |      0 |      1 |      3 | **10** | **14** | **33** | **26** |  **7** |
| saffron milk cap (USE) |      0 |      0 |     0 |      0 |      0 |      0 |      3 | **25** | **48** | **22** |      2 |      0 |
| saffron milk cap (USW) | **18** |  **5** |     1 |      1 |      1 |      1 |      1 |  **5** |      4 | **18** | **27** | **18** |
| hedgehog (NE)          |      0 |      0 |     0 |      0 |      0 |      1 |  **7** | **22** | **30** | **31** |  **6** |      1 |
| hedgehog (SE)          | **19** |  **7** |     2 |      0 |      0 |      1 |      2 |  **7** | **11** | **28** | **14** |  **7** |
| hedgehog (USE)         |      2 |      1 |     0 |      0 |      1 |      2 | **13** | **26** | **28** | **20** |      4 |  **5** |
| hedgehog (USW)         | **23** | **10** | **6** |      2 |      2 |      1 |      2 |  **7** |  **5** | **10** | **14** | **18** |
| shaggy mane (NE)       |      0 |      0 |     0 |      1 |      1 |      1 |      2 |  **9** | **54** | **32** |      0 |      0 |
| shaggy mane (SE)       |      1 |      3 | **6** | **18** | **13** |      3 |      1 | **14** | **28** | **13** |      0 |      0 |
| shaggy mane (USE)      |      0 |      0 |     1 | **10** |  **7** |      3 |      1 |      2 | **30** | **27** | **18** |      1 |
| shaggy mane (USW)      |  **7** |      3 |     4 |  **6** |  **5** |      3 |      2 |      2 | **10** | **28** | **21** | **10** |
| giant puffball (NE)    |      2 |      1 |     3 |      4 |      2 |      2 | **11** | **27** | **28** | **15** |      3 |      1 |
| giant puffball (SE)    |      0 |      1 |     1 |      1 |  **6** |  **8** | **17** | **15** | **26** | **19** |      3 |      1 |
| giant puffball (USE)   |      0 |      0 |     1 |      1 |      1 |      1 |      2 | **16** | **32** | **40** |  **5** |      1 |
| giant puffball (USW)   |      1 |      1 | **5** | **18** | **17** | **16** | **11** | **12** | **11** |  **5** |      3 |      1 |
| matsutake (NE)         |      1 |      0 |     0 |      0 |      0 |      0 |      0 | **43** | **53** |      3 |      0 |      0 |
| matsutake (USE, n=40)  |      0 |      0 |     0 |      0 |      0 |      0 |  **5** |  **8** | **35** | **42** |  **8** |      2 |
| matsutake (USW, n=37)  |      0 |      0 |     0 |      0 |      0 |      0 |      0 |      0 | **16** | **19** | **49** | **16** |

- **US West is two seasons.** The Pacific coast holds 93–94% of its saffron
  milk cap and hedgehog records and fruits from October into February. The Rockies
  fruit in August and September with the monsoon.
- **The western giant puffball fruits in spring** (April–June in California),
  the eastern one in late summer and autumn.
- **Fallback `season_months`** follow the table (the months at ≥ 5%, plus the
  season's edges). `empiricalSeason` uses the same keys, so the per-zone curves
  replace them on the first scoring run on or after 2026-10-01.

## Scoring parameters

Weather at the base point nearest each sighting (median distance 0.019–0.028°),
from the four `data.fung.es/<REGION>_weather_data.parquet` files, days to 28
September. Up to 400 in-season sightings per species and region; European
sightings go to their nearest point across North and South Europe, and US
sightings within 0.25° of a US West point go to US West, whose tiles draw on top.
Lags are weighted like the scorer, and missing days are skipped.

| at the sightings (q25 / median / q75) |   n | lag-weighted temperature (°C) | humidity (%) | rain, 21 days (mm, q25) | elevation (m, median) |  pH |
| ------------------------------------- | --: | ----------------------------- | -----------: | ----------------------: | --------------------: | --: |
| saffron milk cap, NE                  | 231 | 12.9 / 14.1 / 15.5            |           79 |                      42 |                    81 | 4.8 |
| saffron milk cap, SE                  | 388 | 12.4 / 14.4 / 15.9            |           73 |                      32 |                   743 | 5.3 |
| saffron milk cap, USE                 | 248 | 15.9 / 17.7 / 19.8            |           72 |                 55 (78) |                   352 | 5.0 |
| saffron milk cap, USW                 |  71 | 12.6 / 15.4 / 18.7            |           48 |                      30 |                 2,925 | 5.9 |
| hedgehog, NE                          | 230 | 13.5 / 15.0 / 16.2            |           76 |                      42 |                    80 | 4.5 |
| hedgehog, SE                          |  82 | 14.1 / 16.7 / 19.3            |           70 |                      21 |                   756 | 5.3 |
| hedgehog, USE                         | 383 | 17.7 / 20.5 / 22.8            |           72 |                 46 (72) |                   350 | 5.1 |
| hedgehog, USW                         |  82 | 14.2 / 15.6 / 19.8            |           73 |                 19 (33) |                   596 | 5.1 |
| shaggy mane, NE                       | 384 | 12.6 / 14.2 / 15.4            |           79 |                      35 |                    60 | 4.6 |
| shaggy mane, SE                       | 390 | 13.2 / 15.1 / 16.5            |           70 |                      24 |                   236 | 5.3 |
| shaggy mane, USE                      | 339 | 14.4 / 17.9 / 20.3            |           76 |                 32 (35) |                   243 | 6.2 |
| shaggy mane, USW                      | 281 | 11.5 / 13.5 / 15.3            |           65 |                 20 (25) |                   721 | 6.2 |
| giant puffball, NE                    | 340 | 14.7 / 15.7 / 16.9            |           76 |                      32 |                    48 | 4.7 |
| giant puffball, SE                    | 375 | 16.1 / 17.4 / 19.2            |           67 |                      28 |                   108 | 5.2 |
| giant puffball, USE                   | 356 | 18.3 / 20.9 / 22.7            |           73 |                 64 (98) |                   241 | 5.9 |
| giant puffball, USW                   | 384 | 12.5 / 15.1 / 18.5            |           56 |                 12 (14) |                   946 | 6.3 |
| matsutake, NE (GBIF)                  |  49 | 9.6 / 11.7 / 13.3             |           78 |                      46 |                   234 | 5.0 |
| matsutake, USE                        |  12 | 11.4 / 14.3 / 17.3            |           74 |                 85 (98) |                   490 | 4.4 |

US rain: glitch-free windows (no day above 60 mm), all windows in brackets; see
below.

**Chosen:**

| species, region       | temp ± sigma (°C) | humidity ± 17 (%) | altitude ± sigma (m) | pH ± sigma | rain, 21 days (mm) | rain weight | season months    |
| --------------------- | ----------------: | ----------------: | -------------------: | ---------: | -----------------: | ----------: | ---------------- |
| saffron milk cap, NE  |            13 ± 5 |                79 |             80 ± 800 |  4.8 ± 1.5 |                 40 |         1.5 | Jul–Nov          |
| saffron milk cap, SE  |            13 ± 5 |                73 |           740 ± 1600 |  5.3 ± 1.5 |                 30 |         1.5 | Aug–Jan          |
| saffron milk cap, USE |            17 ± 5 |                72 |            350 ± 800 |  5.0 ± 1.5 |                 55 |         1.5 | Aug–Oct          |
| saffron milk cap, USW |            12 ± 5 |                48 |          1500 ± 2000 |  5.9 ± 1.5 |                 30 |         1.5 | Aug–Feb          |
| hedgehog, NE          |            14 ± 5 |                76 |             80 ± 800 |  4.5 ± 1.5 |                 40 |         1.5 | Jul–Nov          |
| hedgehog, SE          |            16 ± 5 |                70 |           760 ± 1500 |  5.3 ± 1.5 |                 20 |         1.5 | Aug–Feb          |
| hedgehog, USE         |            20 ± 5 |                72 |            350 ± 800 |  5.1 ± 1.5 |                 45 |         1.5 | Jul–Nov          |
| hedgehog, USW         |            15 ± 5 |                73 |           600 ± 1200 |  5.1 ± 1.5 |                 20 |         1.5 | Aug–Mar          |
| shaggy mane, NE       |            13 ± 5 |                79 |             60 ± 800 |  4.6 ± 2.5 |                 35 |           0 | Aug–Oct          |
| shaggy mane, SE       |            15 ± 5 |                70 |           240 ± 1100 |  5.3 ± 2.5 |                 25 |         1.5 | Mar–May, Aug–Oct |
| shaggy mane, USE      |            17 ± 5 |                76 |            240 ± 800 |  6.2 ± 2.5 |                 30 |         1.5 | Apr–May, Sep–Nov |
| shaggy mane, USW      |            13 ± 5 |                65 |           720 ± 2300 |  6.2 ± 2.5 |                 20 |         1.5 | Sep–Jan, Apr–Jun |
| giant puffball, NE    |            16 ± 5 |                76 |             50 ± 800 |  4.7 ± 2.5 |                 30 |         1.5 | Jul–Oct          |
| giant puffball, SE    |            17 ± 5 |                67 |            110 ± 800 |  5.2 ± 2.5 |                 30 |         1.5 | Jun–Oct          |
| giant puffball, USE   |            20 ± 5 |                73 |            240 ± 800 |  5.9 ± 2.5 |                 65 |         1.5 | Aug–Oct          |
| giant puffball, USW   |            15 ± 5 |                56 |           950 ± 2900 |  6.3 ± 2.5 |                 10 |         1.5 | Apr–Sep          |
| matsutake, NE         |            12 ± 5 |                78 |            230 ± 800 |  5.0 ± 1.5 |                 45 |         1.5 | Aug–Oct          |
| matsutake, USE        |            13 ± 5 |                74 |            490 ± 800 |  4.4 ± 1.5 |                 45 |         1.5 | Sep–Nov          |
| matsutake, USW        |            11 ± 5 |                75 |           900 ± 1200 |  5.0 ± 1.5 |                 45 |         1.5 | Sep–Dec          |

How each value was set:

- **Optima at the sighting medians**, not at the AUC maximum:
  - For every autumn species the day-to-day AUC keeps rising as the
    temperature optimum cools. That is the temperature term acting as a season
    proxy (the mirror of the summer trap in #276).
  - Where the weather window (to 28 September) misses the cooler half of the
    season, the optimum is 1 °C below the median, as in #279. That applies to
    all of them except the giant puffball in Europe and US West, the spring and
    autumn shaggy mane in South Europe, and the North European matsutake, whose
    season ends in September.
- **Altitude sigma:** 1.5 × the sighting interquartile range, at least 800 m.
- **Rain threshold:** the lower quartile of 21-day rain.
  - US East's 2026 rain is broken in August and September (up to 2,415 mm in a
    day; #268). There the quartile is taken over windows without a day above
    60 mm, as in #279.
  - Matsutake's 12 US East sightings are too few for a quartile; both US regions
    take North Europe's 45 mm.
- **pH sigma:** 1.5 for the mycorrhizal three, whose soil matters. 2.5 for the
  shaggy mane and giant puffball: they grow on lawns, verges and pastures, where
  the ground is disturbed, manured or limed, so the soil map says little.
- **Rain weight: the #277 rule, plus one condition.**
  - The rule takes the lowest of 1.5, 0.75, 0.3 and 0 that keeps spatial AUC
    within 0.01, does not lower the mean score at sightings, and gains (spatial
    AUC +0.03 or mean +0.5).
  - The added condition: the day-to-day AUC may not drop by more than 0.01
    either. The rule looked at places and at the score at sightings, not at
    days. For fungi the day-to-day signal is the forecast, and on the giant
    puffball the rule alone would have traded 0.06 of it for places.

| rain weight: temporal / spatial AUC, mean | 1.5                 | 0.75                | 0.3                 | 0                   | chosen |
| ----------------------------------------- | ------------------- | ------------------- | ------------------- | ------------------- | -----: |
| shaggy mane, NE                           | 0.687 / 0.579, 8.71 | 0.701 / 0.600, 8.75 | 0.707 / 0.613, 8.79 | 0.703 / 0.622, 8.81 |      0 |
| giant puffball, NE                        | 0.691 / 0.676, 8.50 | 0.681 / 0.708, 8.60 | 0.667 / 0.727, 8.68 | 0.631 / 0.740, 8.76 |    1.5 |
| giant puffball, USW                       | 0.704 / 0.756, 7.30 | 0.703 / 0.778, 7.44 | 0.694 / 0.795, 7.60 | 0.642 / 0.801, 7.77 |    1.5 |

- **The shaggy mane in North Europe goes to 0.** It gains on days and on places.
  Rain carried no signal there in the 2026 autumn at any threshold (35–80 mm):
  it rained enough nearly everywhere.
- **The giant puffball stays at 1.5.** In North Europe and US West, the first
  lower weight that gains on places costs 0.0101 and 0.0106 of day-to-day AUC.
- Every other species and region stays at 1.5: no lower weight passes the rule.

**Against a literature starting point** (weather-only score; temporal AUC:
each sighting's day against the other in-season days at the same point;
spatial AUC: sighting points against 400 random points of the region on the
same days):

| species, region         | literature start: temporal / spatial AUC | chosen: temporal / spatial AUC | mean at sightings, chosen |
| ----------------------- | ---------------------------------------: | -----------------------------: | ------------------------: |
| saffron milk cap, NE    |                            0.688 / 0.675 |                  0.706 / 0.613 |                      8.69 |
| saffron milk cap, SE    |                            0.701 / 0.860 |                  0.728 / 0.881 |                      8.38 |
| saffron milk cap, USE   |                            0.670 / 0.931 |                  0.643 / 0.907 |                      8.81 |
| saffron milk cap, USW   |                            0.626 / 0.791 |                  0.629 / 0.893 |                      7.20 |
| hedgehog, NE            |                            0.504 / 0.633 |                  0.515 / 0.700 |                      8.76 |
| hedgehog, SE            |                            0.555 / 0.814 |                  0.548 / 0.799 |                      8.01 |
| hedgehog, USE           |                            0.627 / 0.850 |                  0.556 / 0.811 |                      8.73 |
| hedgehog, USW           |                            0.573 / 0.916 |                  0.573 / 0.907 |                      7.43 |
| shaggy mane, NE         |                            0.649 / 0.600 |                  0.703 / 0.622 |                      8.81 |
| shaggy mane, SE         |                            0.731 / 0.783 |                  0.738 / 0.781 |                      8.19 |
| shaggy mane, USE        |                            0.747 / 0.688 |                  0.735 / 0.705 |                      7.73 |
| shaggy mane, USW        |                            0.677 / 0.770 |                  0.670 / 0.807 |                      7.77 |
| giant puffball, NE      |                            0.670 / 0.692 |                  0.691 / 0.676 |                      8.50 |
| giant puffball, SE      |                            0.543 / 0.797 |                  0.544 / 0.821 |                      8.22 |
| giant puffball, USE     |                            0.608 / 0.804 |                  0.561 / 0.787 |                      8.74 |
| giant puffball, USW     |                            0.702 / 0.679 |                  0.704 / 0.756 |                      7.30 |
| matsutake, NE           |                            0.602 / 0.696 |                  0.599 / 0.737 |                      9.09 |
| matsutake, USE (n = 12) |                            0.750 / 0.938 |                  0.698 / 0.934 |                      8.44 |

The literature starting points: saffron milk cap 14 °C, 80%, 600 m, pH 5.5,
30 mm; hedgehog 14 °C, 85%, 600 m, pH 5.0, 35 mm; shaggy mane 14 °C, 75%,
300 m, pH 6.5, 25 mm; giant puffball 17 °C, 70%, 300 m, pH 6.5, 30 mm;
matsutake 12 °C, 80%, 300 m, pH 4.5, 40 mm.

- **Hedgehogs barely follow the weather day to day** (temporal AUC 0.52–0.57):
  they last for weeks once up. The forecast still tells their places apart
  (0.70–0.91).
- **Where the literature start scores higher, it is cooler.** In US East
  (saffron milk cap, hedgehog, giant puffball) a 14–17 °C start beats the
  August–September medians on both AUCs, the season-proxy effect above. The
  late-October recheck decides between them.

### US West

- **Saffron milk cap: the coast is not in the sample.** Its 71 US West
  sightings in the window are mostly the Rockies in August and September (median
  elevation 2,925 m, 48% humidity). The Pacific coast, with 93% of the all-year
  records, fruits from October to February. So:
  - 12 ± 5 °C;
  - a humidity optimum at the Rockies' 48%, which does not penalise the wet
    coast (the humidity term has no penalty above its optimum);
  - 1,500 ± 2,000 m, so the coast and the Rockies each lose about a fifth of the
    altitude term.
- **Hedgehog: the sample is the Pacific Northwest's early autumn** (60 of 108
  July–September sightings), plus 28 in the Kansas–Kentucky band. California's
  winter season is missing. It keeps the sample's own values (15 ± 5 °C); an
  11 °C winter day keeps 73% of the temperature term.
- **Matsutake: literature.** 11 ± 5 °C for the October–November fruiting in the
  Cascades, the Sierra and the coast ranges, 75% humidity, 900 ± 1,200 m, and
  North Europe's 45 mm rain.
- **US West's points reach 81.7° W**, and its tiles draw over US East's, so US
  West's values also score the Kansas–Kentucky band. There the host lists keep
  the saffron milk cap and matsutake to conifer stands.
- The winter checks below cover the coast.

## Literature check

(filled in below)

## Photo identification

**Vocabulary.**

- Three of the five labels were new to it: _Lactarius deliciosus_, _Hydnum
  repandum_ and _Tricholoma matsutake_.
- Two moved from tier 2 ("other") to catalog: _Coprinus comatus_ and _Calvatia
  gigantea_.
- Two look-alikes join as toxic: the common ink cap (_Coprinopsis
  atramentaria_) and the woolly milk cap (_Lactarius torminosus_). Neither was
  in the vocabulary, so a photo of one could only land on the edible species.
- The matrix has 2,644 rows: 47 catalog, 77 toxic and 2,520 other. The
  2,500-name tier-2 cap refilled the freed slots.

**Look-alike warnings.** Each toxic entry names the checks that tell it apart,
and a pair gets an escalated note when both appear in one result:

| toxic label                                                              | mechanism                                      | checks                                 | escalated note, next to             |
| ------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------- | ----------------------------------- |
| _Coprinopsis atramentaria_ (new)                                         | coprine: a violent reaction with alcohol (new) | cap scales (new), ring and stem        | shaggy mane                         |
| _Lactarius torminosus_ (new)                                             | stomach upset                                  | milk colour (new), woolly margin (new) | none                                |
| _Amanita smithiana_                                                      | kidney failure                                 | unchanged                              | matsutake (new)                     |
| _A. phalloides_, _A. virosa_, _A. bisporigera_, _A. ocreata_             | amatoxins                                      | unchanged                              | giant puffball (new): the egg stage |
| _Scleroderma citrinum_, _S. polyrhizum_, _S. areolatum_, _S. verrucosum_ | stomach upset                                  | unchanged                              | giant puffball (new)                |

All texts are in the six locales. The earthball and _Amanita_ notes are one text
("cut it in half from top to bottom before anything else").

### Measured gate result

`bioclip_export.py --stage verify-shipped` gives the same result as before the
change, because its test split has no photos of the new species:

- **False-edible:** 1.36% (ceiling 2%).
- **Toxic photos warned** (a toxic label in the top 3): 97.7%.
- **Catalog accuracy:** top-1 81.8%, top-3 92.1%.

### Spot check on new photos

20 recent research-grade iNaturalist photos per taxon (one per observation),
embedded with the PyTorch BioCLIP model and ranked against the shipped matrix:

| photos of                 | catalog label expected | first | in top 3 | a toxic label in top 3 |
| ------------------------- | ---------------------- | ----: | -------: | ---------------------: |
| _Lactarius deliciosus_    | saffron milk cap       |  100% |     100% |                    95% |
| _Lactarius deterrimus_    | saffron milk cap       |   95% |     100% |                    90% |
| _Lactarius thyinos_       | saffron milk cap       |   95% |     100% |                    70% |
| _Lactarius rubrilacteus_  | saffron milk cap       |   85% |     100% |                    45% |
| _Hydnum repandum_         | hedgehog               |  100% |     100% |                    15% |
| _Hydnum umbilicatum_      | hedgehog               |   70% |      95% |                    15% |
| _Hydnum oregonense_       | hedgehog               |   90% |      90% |                    10% |
| _Coprinus comatus_        | shaggy mane            |  100% |     100% |                    65% |
| _Calvatia gigantea_       | giant puffball         |   90% |      95% |                    60% |
| _Calvatia booniana_       | giant puffball         |   50% |      85% |                    75% |
| _Tricholoma matsutake_    | matsutake              |   80% |      80% |                    50% |
| _Tricholoma magnivelare_  | matsutake              |   65% |      70% |                    35% |
| _Tricholoma murrillianum_ | matsutake              |   20% |      70% |                    85% |

| photos of the look-alike   | its own name first | an edible label first | a toxic label in top 3 |
| -------------------------- | -----------------: | --------------------: | ---------------------: |
| _Coprinopsis atramentaria_ |                90% |                    5% |                   100% |
| _Lactarius torminosus_     |               100% |                    0% |                   100% |
| _Lactarius pubescens_      |      (not a label) |                    0% |                   100% |
| _Amanita smithiana_        |                75% |                    0% |                   100% |
| _Scleroderma citrinum_     |                90% |                    0% |                    95% |

- **The errors run the safe way.** No look-alike photo reached an edible label
  first, except one common ink cap photo, which ranked shaggy mane first with
  the ink cap second: the alcohol note fires on it. _L. pubescens_, which has no
  label, lands on the woolly milk cap (90%).
- **Western matsutake is the weak spot.** Its photos rank _Amanita smithiana_
  first 30% of the time, and matsutake is in the top 3 of 70%. In that case the
  matsutake–_A. smithiana_ note fires, which is the advice Pacific Northwest
  guides give for this pair. The Nordic _T. matsutake_ is the label because it
  is the name people search for; a _T. murrillianum_ label would cost the
  Nordic photos.
- **Frequent warnings on the edible side are false alarms at rank 2–3,** and
  they point at the right check:
  - the woolly milk cap next to a saffron milk cap: check the milk;
  - the ink cap next to a shaggy mane: the alcohol note;
  - earthballs, _Entoloma_ and young _Amanita_ next to a puffball: cut it in
    half.

## Recipes

Six recipes, in all six locales. Each carries the safety notes that matter for
its species:

| recipe id                      | species          | dish                                              |
| ------------------------------ | ---------------- | ------------------------------------------------- |
| `grilled-saffron-milk-caps`    | saffron milk cap | caps grilled gill-side up with garlic and parsley |
| `saffron-milk-cap-potato-stew` | saffron milk cap | the Spanish _níscalos con patatas_                |
| `hedgehog-mushroom-risotto`    | hedgehog         | risotto with pan-browned hedgehogs and thyme      |
| `shaggy-mane-soup`             | shaggy mane      | a cream soup made the day they are picked         |
| `giant-puffball-parmigiana`    | giant puffball   | slices fried and baked like aubergine parmigiana  |
| `matsutake-rice`               | matsutake        | the Japanese _matsutake gohan_                    |

The safety notes:

- **Saffron milk cap:** the milk must be orange to red; white milk means another
  _Lactarius_, such as the woolly milk cap. The mushroom stains green and turns
  urine reddish, both harmless.
- **Hedgehog:** spines, not gills; big ones can be bitter.
- **Shaggy mane:**
  - cook it within hours, before it turns to ink, and use only young, all-white
    ones;
  - the common ink cap reacts with alcohol, so the soup is served without it;
  - don't pick from roadsides or polluted ground: it takes up heavy metals.
- **Giant puffball:** cook it, and cut every one in half top to bottom. The
  flesh must be pure white and even, with no outline of a cap or stem (an
  _Amanita_ egg) and no purple-black (an earthball).
- **Matsutake:** check the base and the smell against _Amanita smithiana_, and
  never rake the ground.

## Illustrations

Not in this PR yet: five catalog images (512 px) and six recipe images
(768 px), generated in the house style. The brief is in the PR description.

## Rollout

- **Before merging:** approval of the settings, and the eleven images.
- **Scoring:** the first run after merging builds the five range priors (new
  keys). The first run on or after 2026-10-01 builds their season curves.
- **Late October:** check the temperature optima against October sightings,
  with the #279 species: US East especially, where a cooler optimum scored
  better.
- **Winter:** check US West's saffron milk cap and hedgehog against the Pacific
  coast's winter sightings, and matsutake everywhere against its October–
  November sightings.
- **Once the upstream US rain fix lands:** recheck the US rain thresholds.

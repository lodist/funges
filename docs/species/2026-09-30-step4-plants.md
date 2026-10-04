# Ramps, fiddleheads, cloudberry, huckleberry, pawpaw, rose hips, sloes and sea buckthorn

Date: 2026-09-30 (roadmap #272, step 4: the plants)

Eight wild plants from the roadmap's spring, berry and autumn-fruit list. This
record covers their catalog entries and forecasts. It is the reviewed source the
manifests cite in `scoringReferences` and `identification.safetyReview`.

**The parameter values below are agent-derived and await Loris Di Stefano's
approval.** The validator checks types, ranges and sigmas. It cannot establish
scientific authority, and no botanist has reviewed them. They rest on GBIF and
iNaturalist records and the 2026 weather at real sightings in the forageable
stage, checked against the sources in [Literature check](#literature-check).

Bilberry, also on the roadmap's list, is already covered by #277's wild
blueberry.

## Changes

| id              | name          | range keys (GBIF)                                                                   | regions          |
| --------------- | ------------- | ----------------------------------------------------------------------------------- | ---------------- |
| `ramps`         | Ramps         | _Allium tricoccum_ 2856301 (includes var. _burdickii_)                              | USE, USW         |
| `fiddleheads`   | Fiddleheads   | _Matteuccia struthiopteris_ 2650999                                                 | USE, USW         |
| `cloudberry`    | Cloudberry    | _Rubus chamaemorus_ 2998290                                                         | NE               |
| `huckleberry`   | Huckleberry   | _Vaccinium membranaceum_ 9060377, _V. deliciosum_ 2882961, _V. ovalifolium_ 2882894 | USE, USW         |
| `pawpaw`        | Pawpaw        | _Asimina triloba_ 3158040                                                           | USE, USW         |
| `rose_hips`     | Rose Hips     | genus _Rosa_ 8395064                                                                | NE, SE, USE, USW |
| `sloes`         | Sloes         | _Prunus spinosa_ 3023221                                                            | NE, SE           |
| `sea_buckthorn` | Sea Buckthorn | _Hippophae rhamnoides_ 3039285                                                      | NE, SE           |

Also in this PR: two look-alikes join the photo-ID vocabulary as toxic
(bracken and common buckthorn), and three existing toxic plants gain a warning
pair with ramps ([Photo identification](#photo-identification)). There are
eight recipes in six locales ([Recipes](#recipes)).

## What each entry covers

- **Ramps:** _Allium tricoccum_, whose key includes the narrow-leaved var.
  _burdickii_ (white ramps). Eastern North America only.
- **Fiddleheads:** the ostrich fern alone. The other ferns are not eaten, and
  bracken is carcinogenic.
- **Cloudberry:** _Rubus chamaemorus_. North Europe only: the lower-48 US has
  about 320 records, in a few Maine and New York bogs.
- **Huckleberry: the mountain huckleberries of the western US.** That is the
  thin-leaved _V. membranaceum_ (_V. globulare_ is filed under it), plus the
  Cascade _V. deliciosum_ and the oval-leaved _V. ovalifolium_. These are the
  berries of the Montana, Idaho and Cascades huckleberry culture.
  - Left out: the coastal red (_V. parvifolium_, 15,853 records) and evergreen
    (_V. ovatum_, 14,718) huckleberries. They are lowland plants with a
    different season, and they would outweigh the mountain species six to one in
    the calibration. They could be a second entry later.
  - Also left out: the eastern _Gaylussacia_ "huckleberries", a different genus.
- **Pawpaw:** _Asimina triloba_ only. The genus adds the small-fruited dwarf
  pawpaws of the Southeast.
- **Rose hips: the genus _Rosa_.** Every wild rose's hips are edible, so the
  range is the genus.
  - Europe: mostly the dog rose, plus the beach rose (_R. rugosa_) on North and
    Baltic Sea coasts.
  - US: multiflora rose in the East, and the Woods', Nootka and California roses
    in the West.
  - The photo label is the dog rose (see [Photo identification](#photo-identification)).
- **Sloes and sea buckthorn:** Europe only. The US has 0–300 records of each.

## Records

GBIF human observations with coordinates, 1990–2025 (training) / 2026:

| taxon                              |   North Europe |  South Europe |        US East |      US West |
| ---------------------------------- | -------------: | ------------: | -------------: | -----------: |
| _Allium tricoccum_                 |              0 |             0 |   13,493/2,979 |          0/0 |
| _Matteuccia struthiopteris_        |   32,164/1,825 |       940/149 |   16,790/2,530 |         48/5 |
| _Rubus chamaemorus_                |   73,634/2,313 |           1/0 |         256/37 |        66/11 |
| _Vaccinium membranaceum_           |              0 |             0 |         137/27 |    2,670/188 |
| _V. deliciosum_ + _V. ovalifolium_ |              0 |             0 |         383/34 |    1,804/182 |
| _Asimina triloba_                  |           19/0 |           1/0 |   33,635/4,901 |          1/0 |
| genus _Rosa_                       | 986,948/20,032 | 258,277/2,090 | 110,628/10,537 | 28,433/3,137 |
| _Prunus spinosa_                   | 558,486/10,075 | 176,733/1,621 |           34/0 |         43/0 |
| _Hippophae rhamnoides_             |   78,108/4,310 |     8,961/198 |         281/25 |         56/7 |

**Calibration samples: the forageable stage, not every sighting.** A plant is
seen long before the part people pick is ready, so, as in #277, each sample
counts only sightings at that stage, from 12 April to 28 September 2026. Every
sighting also has to be within 0.25° of a scoring point.

| species       | sample                                                                       | Europe |  US |
| ------------- | ---------------------------------------------------------------------------- | -----: | --: |
| ramps         | iNaturalist, April–May, no flowering or fruiting annotation (the leaf stage) |      — | 468 |
| fiddleheads   | iNaturalist, April–May (the coiled stage)                                    |      — | 424 |
| cloudberry    | GBIF, 15 July–31 August                                                      |    400 |   — |
| huckleberry   | iNaturalist, annotated fruiting                                              |      — |  74 |
| pawpaw        | iNaturalist, annotated fruiting, from 15 July                                |      — | 345 |
| rose hips     | iNaturalist, annotated fruiting, from 20 August                              |    276 | 318 |
| sloes         | GBIF, September (ripe and blue)                                              |    181 |   — |
| sea buckthorn | GBIF, August–September                                                       |    505 |   — |

- **Ramps' locations are blurred.** iNaturalist obscures every ramps
  observation by taxon: the public point is anywhere in a cell of about 27 km,
  to protect patches from poachers. The weather at the nearest point is still a
  fair picture of three weeks' temperature and humidity. Elevation is not.
- **Cloudberry, sloes and sea buckthorn use GBIF.** Their annotated iNaturalist
  samples were 30–84 sightings. The Nordic and European records are in
  Artportalen, Laji.fi and the national schemes, and the ripe months stand in for
  the fruiting annotation.

## Where they can grow

### Range prior

Built locally with `build_range_priors.py`'s own functions (1990–2025, plant
background, casual rescue), then checked against the full 2026 record grid, as
in #277. The prior is a 0.1° grid, so the check counts every 2026 record.

| species       | 2026 records | hidden | observed ground excluded | mean prior (share < 0.1)                       |
| ------------- | -----------: | -----: | -----------------------: | ---------------------------------------------- |
| ramps         |        2,979 |  0.00% |                      51% | USE 0.66 (27%), USW 0.11 (76%)                 |
| fiddleheads   |        2,535 |  0.00% |                      51% | USE 0.64 (30%), USW 0.15 (78%)                 |
| cloudberry    |        2,313 |  0.04% |                      79% | NE 0.81 (15%)                                  |
| huckleberry   |          432 |  0.00% |                      84% | USE 0.05 (90%), USW 0.45 (43%)                 |
| pawpaw        |        4,901 |  0.67% |                      69% | USE 0.56 (40%), USW 0.03 (92%)                 |
| rose hips     |       35,860 |  0.01% |                     0–5% | NE 0.98, SE 0.99, USE 0.95 (3%), USW 0.97 (1%) |
| sloes         |       11,695 |  0.01% |                       4% | NE 0.65 (29%), SE 0.97 (1%)                    |
| sea buckthorn |        4,508 |  0.11% |                       7% | NE 0.74 (12%), SE 0.64 (23%)                   |

- **None hides more than 0.7% of this year's records.** The largest is pawpaw's
  0.67%: planted trees north and west of its wild range.
- **They close what they should:**
  - huckleberry, all of US East except the Great Lakes' _V. ovalifolium_;
  - ramps, fiddleheads and pawpaw, the West;
  - cloudberry, everything south of the boreal north;
  - sloes, the far north.
- **Rose hips close almost nothing**, because wild roses grow nearly
  everywhere.
- All the iNaturalist stage sightings pass (0.0–0.2% hidden).

### Land cover

The map draws only the classes in its wilderness layer. In Europe that is
CORINE 311–313, 321–324 and 333, read from the North Europe tile cache: there
are no peat bogs (412) and no dunes (331).

| species       | Europe (CORINE)         | US (NLCD)                                       |
| ------------- | ----------------------- | ----------------------------------------------- |
| ramps         | —                       | 41, 43: deciduous and mixed forest              |
| fiddleheads   | —                       | 41, 43: floodplain forest                       |
| cloudberry    | 312, 322, 324, 333      | —                                               |
| huckleberry   | —                       | 42, 43, 52: conifer and mixed forest, old burns |
| pawpaw        | —                       | 41, 43                                          |
| rose hips     | 311, 313, 321, 322, 324 | 41, 43, 52, 71                                  |
| sloes         | 311, 313, 321, 324      | —                                               |
| sea buckthorn | 321, 322, 324, 333      | —                                               |

- **Cloudberry grows in bogs, and the map has none.** It uses the classes that
  surround Nordic mires: conifer bog-forest, heath, transitional scrub and
  tundra.
- **Sea buckthorn grows on dunes, and the map has none of those either.** It
  uses grassland, heath, scrub and bare ground, which cover grey dunes and the
  gravel banks of Alpine rivers.
- **The real fix is the same as for #282's lawn and pasture fungi:** add those
  classes to the wilderness layer. It is a separate change.

## Seasons

`empiricalSeason` stays off, as for the #277 plants: a plant is seen long before
the part people pick is ready. `season_months` comes from iNaturalist's all-year
observations at the forageable stage (the fruiting annotation for fruits), with
the months at ≥ 5% (bold):

| species (region)           | Jan | Feb |   Mar |    Apr |    May |    Jun |    Jul |    Aug |    Sep |    Oct |   Nov |   Dec | season months |
| -------------------------- | --: | --: | ----: | -----: | -----: | -----: | -----: | -----: | -----: | -----: | ----: | ----: | ------------- |
| ramps (USE, all obs)       |   0 |   0 | **8** | **47** | **19** |  **7** | **12** |      3 |      2 |      1 |     0 |     0 | Mar–May       |
| fiddleheads (USE, all obs) |   1 |   1 |     2 | **16** | **35** | **16** | **11** |  **9** |  **6** |      2 |     1 |     1 | Apr–May       |
| cloudberry (NE)            |   0 |   0 |     0 |      0 |      0 | **11** | **67** | **21** |      1 |      0 |     0 |     0 | Jul–Aug       |
| huckleberry (USW)          |   0 |   0 |     0 |      0 |      2 |  **8** | **25** | **52** | **11** |      2 |     0 |     0 | Jul–Sep       |
| pawpaw (USE)               |   0 |   0 |     0 |      3 |  **6** | **16** | **20** | **27** | **23** |      3 |     0 |     0 | Aug–Oct       |
| rose hips (NE)             |   4 |   2 |     2 |      2 |      2 |  **6** | **12** | **24** | **24** | **13** | **5** |     3 | Aug–Nov       |
| sloes (NE)                 |   1 |   0 |     0 |      1 |      2 |  **5** | **19** | **30** | **22** | **11** | **7** |     2 | Sep–Nov       |
| sea buckthorn (NE)         |   4 |   1 |     1 |      0 |      1 |      1 | **13** | **31** | **23** | **14** |     4 | **6** | Aug–Oct       |

- **Ramps:** the June and July observations are the flowering stalks, which
  come up after the leaves have died back.
- **Fiddleheads:** all observations, because ferns carry no phenology
  annotation. The coiled stage is April and May (literature); later months are
  unfurled fronds.
- **Pawpaw and sloes:** the fruiting annotation starts with green fruit. The
  season months are the ripe ones: pawpaw from late August, sloes from
  September.
- **Rose hips and sea buckthorn** hang on into winter. Their season covers the
  picking months.

## Scoring parameters

The weather at the base point nearest each sighting (median distance
0.018–0.060°), from the four `data.fung.es/<REGION>_weather_data.parquet` files,
days up to 28 September. The method is #277's for plants:

- temperature sigma 6;
- no `rain_first` and no wind sensitivity;
- the rain weight by #277's rule.

Optima sit at the sighting medians. Where the weather window misses the cooler
part of the season they are 1 °C lower, as in #279 and #282: ramps (March is
missing), and pawpaw, rose hips, sloes and sea buckthorn (October and November
are missing).

**The rain threshold** is the lower quartile of 21-day rain, but only on
windows that start inside the weather files (sightings from 3 May) and have at
least 17 of their 21 days. The files have scattered missing days, which are
scaled up. In the US, windows with a day above 60 mm are left out (the #268 rain
glitch).

| at the sightings (q25 / median / q75) |   n | temperature (°C)   | humidity (%) | rain, 21 days (mm, q25) | elevation (m) |  pH |
| ------------------------------------- | --: | ------------------ | -----------: | ----------------------: | ------------: | --: |
| ramps, USE                            | 384 | 8.4 / 11.4 / 13.6  |           75 |                      47 |           258 | 5.9 |
| ramps, USW                            |  84 | 12.1 / 14.3 / 16.3 |           66 |                      27 |           566 | 5.5 |
| fiddleheads, USE                      | 387 | 9.0 / 11.6 / 13.8  |           73 |                      49 |           221 | 5.7 |
| fiddleheads, USW                      |  37 | 13.2 / 16.1 / 18.3 |           68 |                      34 |           242 | 5.7 |
| cloudberry, NE                        | 400 | 11.6 / 14.6 / 15.9 |           69 |                      28 |           304 | 4.7 |
| huckleberry, USW                      |  74 | 18.4 / 20.2 / 21.7 |           55 |                       0 |         1,216 | 5.3 |
| pawpaw, USE                           | 269 | 23.5 / 24.8 / 26.2 |           71 |                      62 |           130 | 5.4 |
| pawpaw, USW                           |  76 | 25.0 / 26.1 / 28.1 |           68 |                      13 |           240 | 5.7 |
| rose hips, NE                         |  85 | 13.8 / 15.3 / 16.9 |           76 |                      29 |            48 | 4.6 |
| rose hips, SE                         | 191 | 16.1 / 17.8 / 21.2 |           63 |                      15 |           321 | 5.4 |
| rose hips, USE                        | 174 | 17.3 / 20.2 / 22.4 |           72 |                      42 |           116 | 5.2 |
| rose hips, USW                        | 144 | 15.4 / 17.2 / 19.9 |           58 |                       8 |           625 | 5.9 |
| sloes, NE                             | 111 | 15.2 / 16.1 / 16.8 |           74 |                      41 |            45 | 4.7 |
| sloes, SE                             |  70 | 18.7 / 19.8 / 21.6 |           63 |                      22 |           284 | 5.2 |
| sea buckthorn, NE                     | 400 | 16.2 / 18.1 / 19.9 |           68 |                      10 |             6 | 4.8 |
| sea buckthorn, SE                     | 105 | 18.1 / 19.9 / 21.3 |           63 |                      12 |           108 | 5.7 |

**Chosen**, with the weather-only score at the sightings. Temporal AUC puts each
sighting's day against the other in-season days at the same point. Spatial AUC
puts the sighting points against 400 random points of the region on the same
days.

| species, region      | temp ± 6 (°C) | humidity | altitude ± sigma (m) | pH ± 1.5 | rain (mm) | rain weight | season  | temporal / spatial AUC | mean |
| -------------------- | ------------: | -------: | -------------------: | -------: | --------: | ----------: | ------- | ---------------------: | ---: |
| ramps, USE           |            10 |       75 |            260 ± 800 |      5.9 |        47 |           0 | Mar–May |          0.501 / 0.805 | 8.27 |
| ramps, USW           |            13 |       66 |            570 ± 900 |      5.5 |        27 |           0 | Mar–May |          0.492 / 0.866 | 8.17 |
| fiddleheads, USE     |            12 |       73 |            220 ± 800 |      5.7 |        49 |         1.5 | Apr–May |          0.517 / 0.729 | 8.15 |
| fiddleheads, USW     |            16 |       68 |            240 ± 800 |      5.7 |        34 |           0 | Apr–May |          0.556 / 0.871 | 8.36 |
| cloudberry, NE       |            15 |       69 |            300 ± 800 |      4.7 |        28 |         1.5 | Jul–Aug |          0.404 / 0.476 | 8.67 |
| huckleberry, USE+USW |            20 |       55 |        1,220 ± 1,400 |      5.3 |         1 |           0 | Jul–Sep |          0.674 / 0.937 | 8.78 |
| pawpaw, USE          |            24 |       71 |            130 ± 800 |      5.4 |        62 |         1.5 | Aug–Oct |          0.532 / 0.778 | 9.14 |
| pawpaw, USW          |            25 |       68 |            240 ± 800 |      5.7 |        13 |           0 | Aug–Oct |          0.571 / 0.926 | 8.97 |
| rose hips, NE        |            14 |       76 |             50 ± 800 |      4.6 |        29 |           0 | Aug–Nov |          0.593 / 0.606 | 9.09 |
| rose hips, SE        |            17 |       63 |          320 ± 1,100 |      5.4 |        15 |         1.5 | Aug–Nov |          0.635 / 0.656 | 7.52 |
| rose hips, USE       |            19 |       72 |            120 ± 800 |      5.2 |        42 |         1.5 | Aug–Nov |          0.536 / 0.782 | 8.90 |
| rose hips, USW       |            16 |       58 |          620 ± 2,400 |      5.9 |         8 |           0 | Aug–Nov |          0.631 / 0.837 | 8.29 |
| sloes, NE            |            15 |       74 |             40 ± 800 |      4.7 |        41 |           0 | Sep–Nov |          0.343 / 0.719 | 9.48 |
| sloes, SE            |            19 |       63 |            280 ± 800 |      5.2 |        22 |           0 | Sep–Nov |          0.656 / 0.694 | 8.69 |
| sea buckthorn, NE    |            17 |       68 |             10 ± 800 |      4.8 |        10 |           0 | Aug–Oct |          0.388 / 0.719 | 9.22 |
| sea buckthorn, SE    |            19 |       63 |            110 ± 900 |      5.7 |        12 |           0 | Aug–Oct |          0.480 / 0.771 | 8.36 |

- **The rain weight goes to 0 for most fruits**, as it did for the #277 berries.
  The fruit ripens whether or not it rained.
  - The clearest case is the huckleberry. The mountain West is dry in summer
    (21-day rain at a quarter of sightings: 0 mm), and at weight 0 the spatial
    AUC rises from 0.673 to 0.937.
  - Fiddleheads (US East), cloudberry, pawpaw (US East) and rose hips (South
    Europe, US East) keep 1.5: no lower weight passes the rule there.
- **Huckleberry, US East** has 14 sightings (the Great Lakes' _V. ovalifolium_)
  and takes US West's values. The range prior closes 90% of US East anyway.
- **Weak spots:**
  - **Cloudberry:** the weather score separates neither its places nor its
    days (AUC 0.40–0.48). Its forecast rests on the range prior, the land
    cover and the July–August season. The crop's known driver, frost at
    flowering, is outside what the model sees.
  - **Sloes, North Europe:** weight 0 wins on places (spatial AUC 0.649 →
    0.719) but loses on days (0.631 → 0.343). The #277 plant rule does not look
    at days, and for fruit that hangs for weeks the day matters little.
  - **Ramps** are up for weeks, so the day-to-day signal is flat (0.49–0.50),
    as for the #282 hedgehog.

## Literature check

### Why some regions are off

- **Fiddleheads in Europe: protected.** The ostrich fern is legally protected
  in much of central Europe:
  - Germany: BArtSchV Annex 1, "besonders geschützt"; taking wild plants is
    banned under § 44 BNatSchG
    ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/bartschv_2005/anlage_1.html)).
  - Switzerland: "vollständig geschützt", and VU on the red list
    ([Info Flora](https://www.infoflora.ch/de/flora/matteuccia-struthiopteris.html)).
  - Czechia (C3, § 3), Slovakia, Poland (partial protection), Hungary (since 1982) and France (national protection, VU)
    ([botany.cz](https://botany.cz/cs/matteuccia-struthiopteris/),
    [atlas-roslin.pl](https://atlas-roslin.pl/gatunki/Matteuccia_struthiopteris.htm)).
  - Where it is common, in Norway, "at bregnen strutseving er spiselig er ikke
    så godt kjent" (few people know it is edible,
    [NIBIO](https://www.nibio.no/tema/mat/plantegenetiske-ressurser/genetiske-ressurser-i-naturen/strutseving-sunn-gronnsak-og-taktekke)).
- **Cloudberry in Germany: strictly protected.** It is "vom Aussterben bedroht"
  and "streng geschützt"
  ([FloraWeb](https://www.floraweb.de/php/artenhome.php?name-use-id=4925)).
  - Its range prior is below 0.1 at every one of the 608 North Europe points in
    Germany, so the forecast never shows it there.
  - It is not protected in Denmark (red list LC, 2011).
- **Cloudberry in the US:** it is native to the lower 48, but only in a few
  northeastern bogs. It is "threatened" in New Hampshire
  ([Go Botany](https://gobotany.nativeplanttrust.org/species/rubus/chamaemorus/)).
  With about 320 records, the US regions stay off.

### Seasons, habitats and crop drivers

- **Ramps:**
  - "The plants produce new leaves in March to April, which die back as the
    days lengthen … In June … a flower stalk emerges". The cycle runs later
    "at high elevations and locations north of North Carolina and Tennessee"
    ([NC State](https://content.ces.ncsu.edu/cultivation-of-ramps-allium-tricoccum-and-a-burdickii)).
  - In Quebec, the season runs "de la fin d'avril à la fin de mai".
  - "The most common overstory tree associate was sugar maple"
    ([Castanea 2023](https://doi.org/10.3375/22-30)). That fits the deciduous
    and mixed forest land cover.
- **Fiddleheads:** "starting in late April in southern Maine … mid to late May
  in far northern Maine … the season in a given location is quite short", on
  "stream and river floodplains"
  ([UMaine Extension 2540](https://extension.umaine.edu/publications/2540e/)).
- **Cloudberry:**
  - It ripens "Mid-July – Early August" in Finland
    ([luontoon.fi](https://www.luontoon.fi/en/activities/berry-and-mushroom-picking)),
    and in July–August in Denmark and Estonia.
  - The crop is "highly unpredictable due to the unstable weather conditions …
    in the beginning of June when the cloudberry flowers. Early frost in August
    may also destroy the crop"
    ([Purdue New Crops](https://web.archive.org/web/20220819080535/https://www.hort.purdue.edu/newcrop/proceedings1993/V2-524.html)).
  - This is the driver the model cannot see. The weak weather AUC above is
    consistent with it.
- **Huckleberry:**
  - The Washington Cascades' "peak season … mid-August to mid-September"
    ([Gifford Pinchot NF](https://www.fs.usda.gov/r06/giffordpinchot/permits/gifford-pinchot-national-forest-huckleberries)).
    Commercial picking is "predominantly from 1,200 to 1,800 m"
    ([Barney 2003](https://doi.org/10.1300/J301v02n01_03)). The chosen optimum
    is 1,220 ± 1,400 m.
  - "Fields of thinleaf huckleberry … are considered a product of uncontrolled
    wildfires"
    ([FEIS](https://research.fs.usda.gov/feis/species-reviews/vacmem)), which
    is why shrub/scrub (NLCD 52) is in the land cover.
  - "Huckleberry production was highest during cool springs with high July
    diurnal temperature ranges" ([Holden et al.](https://doi.org/10.1002/wsb.128)).
    Rain does not drive it, which fits the rain weight of 0.
- **Pawpaw:**
  - It ripens "late August to mid-October" in Kentucky
    ([KSU](https://www.kysu.edu/academics/college-ahnr/school-of-anr/pawpaw/pawpaw-description-and-nutritional-information.php)),
    September–October in Missouri.
  - It grows in "dense shade on moist lower slopes, ravines, valleys, along
    streams" ([MDC](https://mdc.mo.gov/discover-nature/field-guide/pawpaw)).
- **Rose hips:**
  - They are picked from "September to November" in the UK
    ([Woodland Trust](https://www.woodlandtrust.org.uk/blog/2025/10/foraging-in-october/)),
    and from "the beginning of September until the beginning of December" in
    Slovenia.
  - The frost advice is about texture only: frost cut vitamin C "from 716.8 to
    176.0 mg 100 g(-1) DW"
    ([Cunja et al. 2015](https://pubmed.ncbi.nlm.nih.gov/25768262/)).
- **Sloes:** from "September … lasting into December"; "the best time to pick
  sloes is after the first frost", or picked early and frozen (Woodland Trust).
- **Sea buckthorn:**
  - It grows "an sandigen Meeresküsten, aber auch in den Alpen längs der
    Flußufer … Ab August orangerote … Scheinbeeren"
    ([GIZ Bonn](https://gizbonn.de/giftzentrale-bonn/pflanzen/sanddorn)). That
    covers North Europe's coasts and South Europe's Alpine rivers.
  - In Finland, wild berries are picked in October, "mieluiten ensimmäisten
    pakkasten jälkeen" (preferably after the first frosts)
    ([Arktiset Aromit](https://www.arktisetaromit.fi/luonnontuotteet/luonnonmarjat/luonnonmarjat/tyrni/)).

### Rules and safety

- **Ramps:**
  - Quebec: "Depuis 1995, sa vente et sa cueillette pour commercialisation sont
    interdites", with a personal limit of "200 grammes … ou un maximum de 50
    bulbes ou de 50 plants par personne, par année"
    ([quebec.ca](https://www.quebec.ca/nouvelles/actualites/details/quebec-veut-mieux-proteger-lail-des-bois-47109)).
  - Great Smoky Mountains National Park: "The collection of ramps is not
    allowed" ([NPS](https://www.nps.gov/grsm/learn/management/compendium.htm)).
  - Recovery: "recovery time ranged from 148 years for a 95% harvest to 2.5
    years for a 5% harvest"
    ([Rock et al. 2004](https://www.sciencedirect.com/science/article/abs/pii/S0006320703001939)).
    The one-leaf-per-plant rule is established practice, not a published trial.
  - Look-alikes: "Lily-of-the-valley (Convallaria majalis) and false hellebore
    (Veratrum viride) … ramps should always produce a notable onion and garlic
    smell when crushed" ([Penn State](https://extension.psu.edu/ramps-allium-tricoccum)).
  - The eight people poisoned in Georgia and North Carolina in 2020–21 ate the
    related Appalachian bunchflower: "All patients believed the plants to be …
    ramps" ([PMC9822863](https://pmc.ncbi.nlm.nih.gov/articles/PMC9822863/)).
    It joins the vocabulary as toxic in this PR (below).
- **Fiddleheads:**
  - Health Canada: "boiling water for 15 minutes", or "steam them for 10 to 12
    minutes", and discard the water
    ([canada.ca](https://www.canada.ca/en/health-canada/services/food-safety-fruits-vegetables/fiddlehead-safety-tips.html)).
  - The CDC's 1994 outbreaks followed ferns "sauteed for 2 minutes"
    ([MMWR](https://www.cdc.gov/mmwr/preview/mmwrhtml/00032588.htm)).
  - Harvest "no more than one-half of the emerged fiddleheads from each crown";
    "bracken fern fiddleheads are fuzzy, lack the brown paper-like covering and
    do not have a U-shaped groove" (UMaine 2540).
  - Bracken is "possibly carcinogenic to humans (Group 2B)"
    ([IARC](https://www.inchem.org/documents/iarc/suppl7/brackenfern.html)).
- **Cloudberry:** Norway's old ban on picking unripe cloudberries was repealed.
  Today, owners of "multebærland i Nordland, Troms og Finnmark" may close it,
  but "allmennheten alltid plukke multer som spises på stedet"
  ([Lovdata](https://lovdata.no/dokument/NL/lov/1957-06-28-16/KAPITTEL_1)).
- **Huckleberry:** the Gifford Pinchot NF needs a free permit even for personal
  use, and an area of the Sawtooth Berry Fields "was reserved in 1932 by a
  handshake agreement … for use by Tribal members". The Flathead NF needs no
  permit for up to 10 gallons a year.
- **Pawpaw:** "Consume the pulp only. Fruit skin and seeds should not be
  consumed" ([Purdue](https://extension.purdue.edu/foodlink/food.php?food=pawpaw)).
- **Rose hips:** "Rosehips contain hairs which cause irritation so it is
  important to remove these" (Woodland Trust). No _Rosa_ is protected in
  BArtSchV Annex 1.
- **Sloes:**
  - The kernels hold amygdalin, prunasin and sambunigrin
    ([Biochem. Syst. Ecol.](<https://doi.org/10.1016/S0305-1978(03)00063-2>)).
    The Bonn poison centre nonetheless rates the plant "ungiftig" (non-toxic),
    so the risk is crushed stones.
  - Deadly nightshade berries: "Schwarz, glänzend … kirschgroß", on a
    herbaceous plant ([GIZ Bonn](https://gizbonn.de/giftzentrale-bonn/pflanzen/tollkirsche)).
  - Buckthorn: "Nausea, vomiting, and diarrhea"
    ([NC State](https://plants.ces.ncsu.edu/plants/rhamnus-cathartica/)).
- **Sea buckthorn:**
  - In Finland, "poimiminen oksia katkomalla tai musertamalla on kiellettyä"
    (picking by breaking or crushing branches is forbidden). The recipe tells
    people to pick by hand.
  - In Germany small personal amounts are allowed, but dunes with sea buckthorn
    are an EU habitat type. The Netherlands and Denmark allow small amounts for
    own use.

## Photo identification

**Vocabulary.**

- Seven of the labels were tier-2 ("other") names and move to catalog: ramps,
  ostrich fern, cloudberry, pawpaw, dog rose, sloe and sea buckthorn.
- _Vaccinium membranaceum_ is new.
- Two look-alikes move from tier 2 to toxic: bracken (_Pteridium aquilinum_) and
  common buckthorn (_Rhamnus cathartica_). As tier-2 names, they showed "no
  safety information" next to fiddleheads or sloes.
- One joins as a new toxic label: the Appalachian bunchflower (_Melanthium
  parviflorum_, formerly _Veratrum parviflorum_). It is the plant eaten as ramps
  in the 2020–21 Georgia and North Carolina poisonings, and it was not in the
  vocabulary.
- The matrix has 2,648 rows: 50 catalog, 78 toxic and 2,520 other.

**Look-alike warnings:**

| toxic label                                        | mechanism                        | checks                    | escalated note, next to    |
| -------------------------------------------------- | -------------------------------- | ------------------------- | -------------------------- |
| bracken (new)                                      | ptaquiloside: carcinogenic (new) | fern stem (new)           | fiddleheads (new)          |
| common buckthorn (new)                             | stomach upset                    | berry bloom (new)         | none                       |
| Appalachian bunchflower (new)                      | veratrum alkaloids               | leaves, smell             | ramps (new)                |
| false hellebore, lily of the valley, autumn crocus | unchanged                        | unchanged (smell, leaves) | ramps (new)                |
| deadly nightshade                                  | unchanged                        | unchanged                 | none; now also names sloes |

- The ramps note names all three look-alikes: "crush a leaf: ramps smell
  strongly of onion or garlic, the look-alikes do not".
- The fiddlehead note sets the ostrich fern's smooth, grooved stem against
  bracken's fuzzy, three-branched one.
- All texts are in the six locales.

### Measured gate result

`bioclip_export.py --stage verify-shipped`:

- **False-edible:** 1.52% (ceiling 2%). Before this change it was 1.36%.
- **Toxic photos warned** (a toxic label in the top 3): 97.7%, unchanged.
- **Catalog accuracy:** top-1 81.8%, top-3 92.1%, unchanged.

The one new false-edible photo is an autumn crocus (_Colchicum autumnale_), which
ranks ramps first and the crocus second. It ranked the same way before, but
ramps was a tier-2 name then and did not count as edible. Autumn crocus now
carries the ramps warning pair, so this result shows the escalated note.

### Spot check on new photos

20 recent research-grade iNaturalist photos per taxon (one per observation),
embedded with the PyTorch BioCLIP model and ranked against the shipped matrix:

| photos of                   | catalog label expected | first | in top 3 | a toxic label in top 3 |
| --------------------------- | ---------------------- | ----: | -------: | ---------------------: |
| _Allium tricoccum_          | ramps                  |   95% |     100% |                     0% |
| _Matteuccia struthiopteris_ | fiddleheads            |   95% |     100% |                     0% |
| _Rubus chamaemorus_         | cloudberry             |   95% |     100% |                     0% |
| _Vaccinium membranaceum_    | huckleberry            |  100% |     100% |                     0% |
| _V. deliciosum_             | huckleberry            |   50% |      90% |                     0% |
| _V. ovalifolium_            | huckleberry            |   90% |      95% |                     0% |
| _Asimina triloba_           | pawpaw                 |   90% |     100% |                     0% |
| _Rosa canina_               | rose hips              |   90% |     100% |                     0% |
| _Rosa rugosa_               | rose hips              |    0% |       0% |                     0% |
| _Rosa multiflora_           | rose hips              |    0% |      20% |                     0% |
| _Prunus spinosa_            | sloes                  |  100% |     100% |                     5% |
| _Hippophae rhamnoides_      | sea buckthorn          |  100% |     100% |                    40% |

| photos of the look-alike | its own name first | an edible label first | a toxic label in top 3 |
| ------------------------ | -----------------: | --------------------: | ---------------------: |
| bracken                  |               100% |                    0% |                   100% |
| common buckthorn         |               100% |                    0% |                   100% |
| Appalachian bunchflower  |                80% |                    0% |                    95% |
| false hellebore          |                85% |                    0% |                   100% |
| lily of the valley       |               100% |                    0% |                   100% |
| deadly nightshade        |                55% |                    0% |                    80% |

- **No look-alike photo reached an edible label first.**
- **The beach rose and the multiflora rose have their own tier-2 names**, so
  their photos show them without safety information rather than as rose hips.
  That is not a safety gap, because every rose's hips are edible. A genus-level
  "Rosa" label would catch them, but genus labels need an allow-list in
  `src/lib/photo-id.ts`, whose comment explains why genus matching is otherwise
  avoided. That is left for later.

## Recipes

Eight recipes, in all six locales:

| recipe id             | species       | dish                                            |
| --------------------- | ------------- | ----------------------------------------------- |
| `pickled-ramps`       | ramps         | Appalachian pickled ramps (the bulbs, in brine) |
| `sauteed-fiddleheads` | fiddleheads   | boiled, then sautéed with garlic and lemon      |
| `cloudberry-cream`    | cloudberry    | Norwegian _multekrem_                           |
| `huckleberry-pie`     | huckleberry   | a Montana double-crust pie                      |
| `pawpaw-ice-cream`    | pawpaw        | no-churn ice cream                              |
| `rose-hip-syrup`      | rose hips     | the classic British syrup, strained twice       |
| `sloe-jelly`          | sloes         | sloe and apple jelly, without alcohol           |
| `sea-buckthorn-curd`  | sea buckthorn | a curd, like lemon curd                         |

Each carries the notes that matter for its plant:

- **Ramps:**
  - one leaf per plant, never a whole patch;
  - the Great Smoky Mountains ban;
  - Quebec's limit of 200 g, or 50 bulbs or plants, per person per year, with
    no sale;
  - the smell test against the look-alikes.
- **Fiddleheads:** only the ostrich fern, never bracken; boil for 15 minutes (or
  steam for 10–12) and pour the water away; leave half of each clump.
- **Cloudberry:** pick the soft amber berries. In Nordland, Troms and Finnmark,
  landowners can ban cloudberry picking on their land.
- **Huckleberry:** the small crown at the tip; no red or white clustered berries
  (baneberry); bear country.
- **Pawpaw:** never the seeds or the skin; try a little first.
- **Rose hips:** the irritant hairs, strained out twice; not beside busy roads.
- **Sloes:** don't crush the stones; the black look-alikes.
- **Sea buckthorn:** gloves; the rules in dune reserves.

The plant recipes carry an empty `warnings` list, like the existing plant
recipes. Only the mushroom recipes carry the expert-identification warning.

## Illustrations

Eight catalog images (512 px) and eight recipe images (768 px) in the house style,
WebP quality 75. Codex generated them with its built-in image tool, from the
wild garlic, blueberry, blackberry and elderberry catalog images and three
recipe images as style references.

The features that identify each plant are painted in:

- ramps' burgundy stems and white bulb;
- the fiddleheads' brown scales and smooth, grooved stems;
- a ripe amber and an unripe red cloudberry;
- the huckleberries' crowns, with no bloom;
- the cut pawpaw's large seeds;
- the seeds and hairs inside a cut rose hip;
- the sloes' matte blue bloom;
- sea buckthorn's silvery leaves.

## Rollout

- **Before merging:** approval of the settings, and the images.
- **Merging next to #282:** both branches regenerate the same files (registry,
  map styles, BioCLIP matrix, toxic list count, locale catalogs). Whichever
  merges second needs `main` merged in, then `npm run species:generate`, the
  BioCLIP `text-matrix` and `verify-shipped` stages, and the toxic count in
  `src/test/photo-id.test.ts` updated.
- **Scoring:** the first run after merging builds the eight range priors (new
  keys). The plants have no empirical season curves, so `season_months` stays.
- **Late October:** check the temperature optima of pawpaw, rose hips, sloes and
  sea buckthorn against October sightings.
- **Spring 2027:** check ramps and fiddleheads against a full spring. This
  year's window started on 12 April, after ramps' March start.
- **Once the upstream US rain fix lands:** recheck the US rain thresholds.

# Lion's mane and hen of the woods

Date: 2026-09-27 (roadmap #272, step 3)

Two wood-decay fungi with a large following in North America, and two of the most
searched wild mushrooms there. This record covers the new catalog entries and
their forecasts. It is the reviewed source the manifests cite in
`scoringReferences` and `identification.safetyReview`.

**The parameter values below are agent-derived and await approval.** The
validator checks types, ranges and sigmas. It cannot establish scientific
authority, and no mycologist has reviewed them. They rest on GBIF and
iNaturalist records and the 2026 weather at real sightings, checked against the
sources in [Literature check](#literature-check).

## Changes

| id                 | name             | GBIF keys                                             | regions  |
| ------------------ | ---------------- | ----------------------------------------------------- | -------- |
| `lions_mane`       | Lion's Mane      | 5248508 _Hericium erinaceus_, 5248551 _H. americanum_ | USE, USW |
| `hen_of_the_woods` | Hen of the Woods | 2540800 _Grifola frondosa_                            | USE, USW |

Also: the Italian name of `chicken-of-the-woods` read "Grifola Frondosa",
which is hen of the woods. It is now "Poliporo sulfureo".

## Records

GBIF human observations with coordinates, 1990–2025 (training) / 2026:

| taxon                           | North Europe | South Europe |  US East |  US West |
| ------------------------------- | -----------: | -----------: | -------: | -------: |
| _H. erinaceus_                  |     2,572/10 |        311/5 | 5,548/79 | 1,498/42 |
| _H. americanum_                 |            0 |            0 | 3,623/45 |      6/1 |
| _G. frondosa_                   |    14,039/51 |        240/2 | 7,576/50 |      7/0 |
| _H. coralloides_ (not included) |    9,848/208 |        397/9 | 3,274/86 | 1,562/63 |

GBIF's 2026 counts are low because both seasons are only starting. The
calibration uses iNaturalist instead: verifiable observations from 12 April to
26 September 2026 (the weather files' window), without obscured locations or
accuracy worse than 5 km. That gives 982 lion's mane (726 _H. americanum_, 256
_H. erinaceus_) and 666 hen of the woods, almost all in US East.

- **Lion's mane is two species.** _H. americanum_ (bear's head tooth) is the
  branched, long-spined eastern species. Foragers treat it as lion's mane, and
  young clumps are hard to tell from _H. erinaceus_.
- **Left out:** _H. coralloides_ (comb tooth) looks different, a lacy coral of
  short spines. _H. abietis_ grows on conifers in the Pacific Northwest.

## Why US only

Both are protected or red-listed across much of Europe. A "worth foraging now"
score there would point people at them, so NE and SE are `available: false`.

- **Lion's mane:**
  - In Great Britain it is illegal to pick. It is one of four fungi on Schedule 8
    of the Wildlife and Countryside Act 1981
    ([Woodland Trust](https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/fungi-and-lichens/bearded-tooth/),
    [KentOnline](https://www.kentonline.co.uk/canterbury/news/excitement-as-rare-fungus-found-at-nature-reserve-316159/)).
  - It is red-listed in 13 of the 23 European countries that record it, and is
    "stark gefährdet" (category 2) in Germany
    ([de.wikipedia](https://de.wikipedia.org/wiki/Igel-Stachelbart)).
- **Hen of the woods:**
  - Protected by law in Estonia, Latvia, Lithuania, Poland (partial protection)
    and Ukraine.
  - Nationally red-listed in Bulgaria, Austria, the Czech Republic, Denmark,
    Germany, Norway, Finland, Romania and Sweden
    ([IUCN assessment](https://redlist.info/iucn/species_view/362177/)).
- **Europe's 2026 data is thin anyway:** 19 lion's mane and 117 hen of the woods
  sightings in the weather window.

Both catalog texts say it, so a European user reading the page is told to leave
them.

## Where they can grow

### Range prior

Built locally with `build_range_priors.py`'s own functions (1990–2025, fungi
background, casual rescue), then scored against 2026 sightings:

| species          | 2026 sightings hidden (prior < 0.1)       | US East points: mean, share < 0.1 | US West points: mean, share < 0.1 |
| ---------------- | ----------------------------------------- | --------------------------------- | --------------------------------- |
| lion's mane      | GBIF 0.0% of 146, iNaturalist 0.0% of 982 | 0.99, 0%                          | 0.92, 0%                          |
| hen of the woods | GBIF 0.0% of 40, iNaturalist 0.2% of 666  | 0.89, 1%                          | 0.60, 15%                         |

Lion's mane grows across the East and down the Pacific coast, so its prior rules
little out. Hen of the woods' prior closes most of the West.

### Host trees: none

Both species are wood-decay fungi. That makes a host list tempting, but every
list tested hides far more sightings than the ~3% the host layer allows.

The tests use all-year GBIF records with coordinate uncertainty ≤ 1 km (4,200 per
species; the host maps are not GBIF-built, so this does not leak) and the 2026
iNaturalist sightings:

| species          | host classes                                                       | all years hidden | 2026 hidden |
| ---------------- | ------------------------------------------------------------------ | ---------------: | ----------: |
| lion's mane      | eastern hardwood (oak ×3, maple–beech–birch, elm–ash, aspen–birch) |            25.0% |       29.0% |
| lion's mane      | + western hardwood (western oak, tanoak, alder–maple, other)       |            13.4% |       27.1% |
| hen of the woods | oak (oak–hickory, oak–pine, oak–gum–cypress)                       |            12.3% |       24.2% |
| hen of the woods | + maple–beech–birch                                                |            10.3% |       22.1% |
| hen of the woods | + elm–ash–cottonwood                                               |            10.3% |       22.1% |

Much of it is trees the forest map cannot see: hen of the woods on park,
cemetery and street oaks, and lion's mane on a lone wounded hardwood inside a
conifer-typed stand. The literature agrees that the host is "hardwoods", not
a stand type (see below). Chicken of the woods has no US host list for the same
reason.

## Seasons

Share of all-year precise records by month:

| species (region)           | Aug | Sep | Oct | Nov | Dec | Jan | Feb |
| -------------------------- | --: | --: | --: | --: | --: | --: | --: |
| lion's mane (US East)      |  4% | 31% | 33% | 14% |  6% |  4% |  2% |
| lion's mane (US West)      |  3% |  3% | 12% | 24% | 24% | 22% |  6% |
| hen of the woods (US East) |  2% | 39% | 52% |  6% |  0% |  0% |  0% |

- **Fallback `season_months`:**
  - lion's mane, US East: Aug–Dec;
  - lion's mane, US West: Aug–Feb. That covers California's winter fruiting and
    the fall in US West's eastern points (below);
  - hen of the woods: Aug–Nov.
- **Empirical season curves:** `empiricalSeason` uses the same keys, so the
  per-zone curves replace the fallback on the first scoring run on or after
  2026-10-01.

## Scoring parameters

Weather at the base point nearest each sighting (median distance 0.028° for lion's
mane, 0.025° for hen of the woods), from `data.fung.es/USE_weather_data.parquet`.
The sample is 400 in-season sightings (August–September 2026) per species. Lags
are weighted like the scorer, and missing days are skipped.

| at the sightings (q25 / median / q75) | lion's mane        | hen of the woods   |
| ------------------------------------- | ------------------ | ------------------ |
| lag-weighted temperature (°C)         | 16.8 / 18.4 / 20.2 | 17.2 / 19.1 / 21.2 |
| lag-weighted relative humidity (%)    | 73                 | 73                 |
| rain over 21 days, all windows (mm)   | 112 / 262          | 101 / 206          |
| rain over 21 days, glitch-free (mm)   | 52 / 81            | 39 / 66            |
| elevation (m)                         | 116 / 268 / 442    | 103 / 237 / 358    |
| soil pH                               | 5.4                | 5.5                |

**Chosen (US East and US West):**

| parameter                    |   lion's mane | hen of the woods |
| ---------------------------- | ------------: | ---------------: |
| optimal temperature ± sigma  |        17 ± 5 |           18 ± 5 |
| optimal humidity ± sigma     |       73 ± 17 |          73 ± 17 |
| optimal altitude ± sigma (m) |     270 ± 800 |        240 ± 800 |
| optimal pH ± sigma           |     5.4 ± 2.5 |        5.5 ± 2.5 |
| minimum rain, 21 days (mm)   |            50 |               40 |
| rain weight                  | 1.5 (default) |    1.5 (default) |
| land cover (NLCD)            |    41, 42, 43 |       41, 42, 43 |

How each value was set:

- **Temperature:** 1 °C below the August–September sighting median.
  - The weather files end on 26 September, so the sample misses October (and,
    for lion's mane, November): the cooler half of both seasons.
  - The sensitivity test below shows why this matters. Each degree warmer costs
    0.05–0.09 of temporal AUC.
  - These values get checked again in late October, with oyster, violets,
    chestnut and walnut.
- **Rain threshold: the lower quartile of glitch-free windows.**
  - US East's 2026 rain is broken in August and September: 6.7 and 8.9 mm/day
    against 2.8–5.5 in April–July. 1.4–2.1% of cell-days are above 100 mm, up to
    2,415 mm.
  - 67–68% of the sightings' 21-day windows contain a day above 60 mm.
  - The raw quartile (112 and 101 mm) would be wrong for real rain once the
    upstream fix lands.
  - The chosen values match chicken of the woods (44), oyster (48) and eastern
    king (40), which were calibrated on earlier months.
- **pH sigma 2.5:** like the other wood-decay fungi, because the wood, not the
  soil, sets the pH.
- **Rain weight:** stays at 1.5. No lower weight passed the rule (spatial AUC
  within 0.01, mean score not lower, and a gain of +0.03 AUC or +0.5 mean). The
  rain sweep is also unreliable while the rain data is broken.

**Against the literature starting point.** The metrics use the weather-only
score:

- temporal AUC: each sighting's day against the other in-season days at the same
  point;
- spatial AUC: sighting points against 400 random US East points on the same
  days.

| species          | parameters                                          | mean at sightings | temporal AUC | spatial AUC |
| ---------------- | --------------------------------------------------- | ----------------: | -----------: | ----------: |
| lion's mane      | literature start: 18 °C, 75%, 300 ± 1000 m, rain 25 |              8.90 |        0.570 |       0.851 |
| lion's mane      | chosen                                              |              8.77 |        0.616 |       0.865 |
| hen of the woods | literature start                                    |              8.71 |        0.609 |       0.804 |
| hen of the woods | chosen                                              |              8.69 |        0.603 |       0.804 |

**Temperature sensitivity** (temporal / spatial AUC):

| optimum          | 17 °C       | 18 °C       | 19 °C       | 20 °C       |
| ---------------- | ----------- | ----------- | ----------- | ----------- |
| lion's mane      | 0.616/0.865 | 0.575/0.850 | 0.525/0.821 |             |
| hen of the woods |             | 0.603/0.804 | 0.522/0.784 | 0.437/0.752 |

### US West

- **Where US West reaches:** its base points reach 81.7° W. A quarter of them lie
  east of 100° W, mostly Kansas to Kentucky, and its tiles draw over US East's.
  So US West's values also decide the fall map across that band, not only
  California's winter.
- **US East's values win there.** On the 27 lion's mane sightings within 0.25°
  of a US West point in that band, they scored mean 6.78 with spatial AUC 0.854.
  A winter compromise (14 ± 6 °C, Sep–Feb) scored 6.05 and 0.671.
- **Hen of the woods:** there are 8 such sightings. They scored 6.48 with spatial
  AUC 0.755 on US East's values.
- **California:** its winter lion's mane cannot be checked until winter weather
  is in the files. At 17 °C a 12 °C winter day costs its score about 13%.

## Literature check

**Lion's mane.**

- **[_H. erinaceus_](https://www.mushroomexpert.com/hericium_erinaceus.html)**
  (Kuo, MushroomExpert):
  - "fruiting from the wounds of living hardwoods (especially oaks); late summer
    and fall, or over winter and spring in warmer climates".
  - North America "from Canada to Mexico".
  - A single unbranched clump of 1–4 cm spines, white, yellowing with age.
- **[_H. americanum_](https://www.mushroomexpert.com/hericium_americanum.html)**
  (Kuo):
  - "on dead hardwood logs and stumps, or from the wounds of living hardwoods;
    also sometimes on the wood of conifers; late summer and fall".
  - East of the Great Plains, "especially north of the 38th Parallel".
  - Branched, with long spines; young, unbranched clumps can be confused with
    _H. erinaceus_.
- **[Fungi Perfecti](https://fungi.com/products/hericium-erinaceus-culture):**
  fruits at 60–80 °F (16–27 °C) in cultivation.
- **Agrees with:** the hardwood hosts, the eastern and Pacific range, the
  August–December season with a winter season in warm climates (US West's
  fallback runs to February), and the white spine clump in the description.
- **From the sightings only:**
  - The 17 °C optimum sits at the cool end of the cultivation range. It is a
    12-day mean that includes the cool nights that trigger fruiting.
  - Dropping the host list: the literature's "especially oaks" is not
    restrictive enough to justify a host list that hides 13–29% of sightings.

**Hen of the woods.**

- **[_G. frondosa_](https://www.mushroomexpert.com/grifola_frondosa.html)**
  (Kuo):
  - "Weakly parasitic on living oaks and other hardwoods; also saprobic on
    decaying wood; causing a white butt rot; fruiting near the bases of trees;
    often reappearing in the same place in subsequent years".
  - "summer and fall; widely distributed east of the Rocky Mountains, rare in
    the west".
  - Caps grey-brown; pores white; base branched, whitish.
- **Agrees with:** oak and other hardwoods, the base-of-tree and same-tree text,
  the eastern range (the prior closes the West), and the September–October
  season.
- **From the sightings only:** the 18 °C optimum and the 40 mm rain threshold.

## Photo identification

Both labels were already in the BioCLIP vocabulary as tier-2 ("other") names,
and the manifests promote them to catalog. That freed two tier-2 slots, which the
2,500-name cap refilled with the next most observed species, so the matrix grows
by two rows to 2,637: 42 catalog, 75 toxic and 2,520 other.

**Look-alikes: none dangerous, so no new toxic entries.**

- **Lion's mane:** the other _Hericium_. All are edible. _H. coralloides_ is in
  the vocabulary. _H. americanum_ is not, and its photos land on lion's mane
  (below).
- **Hen of the woods:**
  - black-staining polypore (_Meripilus sumstinei_, _M. giganteus_), edible but
    tough, which bruises black;
  - _Polyporus umbellatus_ and Berkeley's polypore (_Bondarzewia berkeleyi_),
    both edible;
  - cauliflower mushroom (_Sparassis_), edible.

### Measured gate result

`bioclip_export.py --stage verify-shipped` gives the same result as before the
change, because its test split has no photos of the two species:

- **False-edible:** 1.36% (ceiling 2%).
- **Toxic photos warned** (a toxic label in the top 3): 97.7%.
- **Catalog accuracy:** top-1 81.8%, top-3 92.1%.

### Spot check on new photos

20 recent research-grade iNaturalist photos per taxon (one per observation) were
embedded with the PyTorch BioCLIP model and ranked against the shipped matrix:

| photos of                 | catalog label expected | first | in top 3 | a toxic label in top 3 |
| ------------------------- | ---------------------- | ----: | -------: | ---------------------: |
| _Hericium erinaceus_      | lion's mane            |  100% |     100% |                    10% |
| _Hericium americanum_     | lion's mane            |   60% |     100% |                     0% |
| _Grifola frondosa_        | hen of the woods       |   95% |     100% |                     0% |
| _Meripilus sumstinei_     | (none: own name 95%)   |    0% |      40% |                     0% |
| _Bondarzewia berkeleyi_   | (none: own name 95%)   |    0% |       0% |                    10% |

- **Bear's head photos:** the other 40% rank comb tooth (_H. coralloides_)
  first. It is edible too.
- **The toxic labels are false alarms at rank 2–3:**
  - after lion's mane come giant puffball, then _Scleroderma citrinum_ or
    _Entoloma sinuatum_: white, round shapes;
  - after Berkeley's polypore come _Omphalotus illudens_ or _Pleurocybella
    porrigens_.
- **Direction of the errors:** they add a warning to a safe mushroom, the safe
  way round. No photo of a look-alike ranked a new catalog label first.

## Illustrations and recipes

- **Catalog images:** `src/assets/species/lions_mane.webp` and
  `hen_of_the_woods.webp`, in the house style, from the prompts in the PR.
- **Recipes:**
  - `lions-mane-crab-cakes`: lion's mane "crab" cakes, dry-fried first to drive
    out the water.
  - `crispy-roasted-hen-of-the-woods`: roasted hen of the woods with garlic, soy
    and thyme.
- **Recipe texts:** in all six locales. They carry the safety notes that matter
  for these species:
  - cook both through;
  - lion's mane is illegal to pick in Britain;
  - the black-staining polypore bruises black.

## Rollout

- **Before merging:** the four images. Also land #278 (MapLayer memory) first,
  because each species adds two columns to the season file the tile build holds
  three times.
- **Scoring:** the first run after merging builds both range priors (new keys).
  The first run on or after 2026-10-01 builds both season curves.
- **Late October:** check the temperature optima against the October sightings.
- **Once the US rain fix lands:** recheck the rain thresholds.
- **Winter:** check US West's lion's mane against California's winter sightings.

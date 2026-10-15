# A local season for every mushroom

Date: 2026-10-15

Tool: `backend/tools/build_local_season.py`. Read in production by `seasonality.local_season_ratio` through `forecast_pipeline.attach_local_season`.

## Why

A season curve tells the map in which months a species fruits. Until now one curve served a whole region (`build_season_curves.py`), with a few climate-zone curves on top. That is one season for half a continent:

- **Central Florida, 15 October 2026:** the smooth chanterelle's weather and place score was 8.3 out of 10 after a wet week. The US East curve cut it to 1.7 (multiplier 0.62, gate 0.33). On GBIF, Florida's chanterelles in October are at half their July peak (11.0 against 22.0 records per 1,000 fungi records). Across the US East as a whole, October is at a tenth (2.1 against 23.0). The climate zones did not help: Florida's (humid subtropical) has curves for four species, none a chanterelle.
- **Italy:** chanterelles peak in July in the north, in October in the centre and from September to November in the south and on the islands (GBIF, 2010-2026). The South Europe curve has one season for all of it.
- **The golden chanterelle (`chant`)** had no US East curve at all. Its only GBIF key was _Cantharellus cibarius_, a European name with 123 US East records (2020-2026); American golden chanterelles are recorded under their own names. It fell back to its hand-set months, June to September.

## What

Every 0.1° cell gets its own curve: the species' records against all fungi records (the observers' effort), month by month, in three layers. Each leans on the next where its records are few: k pseudo-records of the next layer's shape are mixed with the n kernel-weighted records of its own.

1. **Here:** a Gaussian kernel of `km` around the cell. In the "joint" variant the kernel also weighs records by how close their summer temperature is to the cell's (2 °C), so in the mountains slopes count slopes and valleys valleys.
2. **Its climate:** every place on the continent with a similar summer and winter mean temperature and summer share of the year's rain (ERA5 normals 2016-2025), pooled with a Gaussian kernel in that climate space. Central Italy borrows from Spain and Greece, not from the Alps next door; an Alpine valley from other Alpine valleys.
3. **The continent.**

**No seams.** Mapping whole continents, no curve may draw a line:

- every layer is continuous: the kernels have no edges, each cell's climate is interpolated bilinearly from the normals, and the climate layer is read trilinearly between its bins;
- a species ships on a whole continent or not at all, so North and South Europe (and US East and West) read the same season at the same place, with no seam at a region border;
- a seam is a step between neighbouring places of the same climate (within 0.5 °C in summer and winter and 0.02 in the summer share of rain). A valley and a slope 20 km apart may differ, since the ground explains it. Before shipping, the 99.9th percentile of the season factor's steps between same-climate neighbouring 0.2° cells may not exceed today's (`SEAM_FLOOR` 0.35 where today's curve is flat everywhere).

**Production.** The curves ship as a monthly grid per continent (0.2°, uint8, 254 = the peak month, 255 = no curve), on R2 under `models/local_season/<date>/`, named with its sha256 in `backend/generated/local_season.json`. They replace the zone and region curves where they reach: plant phenology, then the local season, then the zone curve, then the region curve, then the hand-set months. The multiplier and the gate read the local ratio as they read a curve's (multiplier 0.6-1.0, gate from 2% to 10% of the peak). Far from any record of the species the climate analogues carry the curve: a cut-off there would draw a seam, and where the species does not grow its range prior zeroes it anyway.

**The golden chanterelle's keys:** _C. cibarius_ plus the American golden chanterelles (_C. flavus_, _C. tenuithrix_, _C. phasmatis_, _C. enelensis_, _C. velutinus_, _C. appalachiensis_, _C. altipes_, _C. roseocanus_, _C. californicus_, _C. cascadensis_, _C. coccolobae_, _C. texensis_) and the European ones picked as chanterelles (_C. pallens_, _C. alborufescens_, _C. ferruginascens_, _C. amethysteus_, _C. friesii_, _C. romagnesianus_, _C. melanoxeros_, _C. ianthinoxanthus_). Cinnabar, smooth and Pacific chanterelles are species of their own, and the grey _C. cinereus_ is not golden. The same keys feed its range prior, which rebuilds on the next nightly run.

## Data

GBIF human observations (`occurrenceStatus` PRESENT), month by month, on the GBIF map tiles (v2 adhoc, about 0.2° clusters) binned to 0.1°: every mushroom's own keys and the kingdom Fungi, Europe and the US, in two periods, 2010-2019 and 2020-2026. Cached by `--crawl` in `app_operation/season_local_cache` (keyed by the taxon keys, so a changed key is fetched again).

## Test

The curves are fitted on one period and tested on the other's records, both ways round.

- **The score:** in each 0.5° block, the held-out records' months by their log-likelihood under "season factor × that month's fungi records there". The factor is floored at 0.01, and the effort never falls below the species' own records. GBIF clusters a species' records and the whole kingdom's apart, so at 0.1° over half of a species' cell-months had no fungi record at all.
- **Two fair comparisons:**
  - **the method:** today's method (zone curve, else region curve, else hand-set months) refitted on the same training years from the same data, both periods;
  - **the map:** the curves production reads now, on the 2010-2019 records, which neither they (built on 2020-2026) nor the local curves (fitted on 2020-2026 for that test) were built from. On the 2020-2026 records that comparison favours today's curves, which were built on them; it is reported but does not decide.

- **The variant** is the one with the best mean gain over the climate zones (each zone with at least 300 held-out records counts once), so it must hold in the Mediterranean, the boreal north and Florida, not only where most records are.
- **A species ships on a whole continent** when, with 95% intervals over resampled 1° blocks:
  - it is better beyond doubt in at least one of the two comparisons and worse beyond doubt in neither;
  - no region with held-out records in 5 or more blocks is worse beyond doubt against the method;
  - at least 150 records were held out;
  - the seam check passes.

## Results

**The variant:** the joint kernel at 50 km over the climate analogues, 10 pseudo-records per layer. Against today's method refitted on the same years, gain in held-out log-likelihood per record (all species, both periods, both continents; the zone mean counts each climate zone with 300+ held-out records once):

| variant                                    | gain per record |   zone mean |  worst zone |
| ------------------------------------------ | --------------: | ----------: | ----------: |
| **joint: 50 km, k 10, climate**            |     **+0.0510** | **+0.0482** | **+0.0010** |
| joint: 100 km, k 10, climate               |         +0.0478 |     +0.0471 |     +0.0013 |
| climate: 50 km, k 10 (distance only, here) |         +0.0503 |     +0.0456 |     -0.0039 |
| wide: 50 km, k 10 (no climate layer)       |         +0.0482 |     +0.0417 |     -0.0036 |
| climate only: k 10 (no local layer)        |         +0.0195 |     +0.0280 |     -0.0125 |
| joint: 50 km, k 100, climate               |         +0.0311 |     +0.0159 |     -0.0301 |

The same variant won on each continent alone. More records in the prior (k 30, 100) loses everywhere, the climate layer alone loses the local detail, and distance alone loses in some climates; the joint kernel is the only one better than today's method in every climate zone:

| continent | climate zone             | held-out records | gain per record |
| --------- | ------------------------ | ---------------: | --------------: |
| EU        | temperate                |          211,209 |          +0.070 |
| EU        | oceanic north            |          189,637 |          +0.045 |
| EU        | continental              |           47,069 |          +0.028 |
| EU        | subarctic                |           32,940 |          +0.010 |
| EU        | oceanic south            |           14,136 |          +0.044 |
| EU        | alpine                   |            6,820 |          +0.027 |
| EU        | arctic                   |            2,840 |          +0.043 |
| EU        | central Spain            |            2,032 |          +0.100 |
| EU        | Mediterranean dry Spain  |            1,112 |          +0.011 |
| EU        | Mediterranean Greece     |              454 |          +0.003 |
| US        | humid continental        |           62,388 |          +0.034 |
| US        | Mediterranean California |           19,110 |          +0.001 |
| US        | continental              |           17,487 |          +0.052 |
| US        | temperate                |           14,318 |          +0.058 |
| US        | marine west coast        |           11,040 |          +0.041 |
| US        | humid subtropical        |            8,297 |          +0.065 |
| US        | alpine                   |            5,610 |          +0.010 |
| US        | subarctic                |            4,913 |          +0.083 |
| US        | semiarid steppe          |            1,374 |          +0.092 |

Mediterranean Italy (171 records, +0.047) and Sardinia (133, +0.060) gain too, below the 300 that count in the mean.

**Per species and continent** (gain per held-out record; "dead months": the share of held-out records in months whose season factor is below 0.3):

| species              | continent | records | vs the method (95%)     | vs the map, 2010-2019 (95%) | dead months, today → local | ships                                           |
| -------------------- | --------- | ------: | ----------------------- | --------------------------- | -------------------------- | ----------------------------------------------- |
| black chanterelle    | EU        |   8,813 | +0.046 [+0.034, +0.059] | +0.034 [+0.018, +0.054]     | 1.6% → 2.1%                | yes                                             |
| bronze bolete        | EU        |   1,929 | +0.048 [+0.004, +0.089] | +0.051 [-0.008, +0.107]     | 4.5% → 6.5%                | yes                                             |
| golden chanterelle   | EU        |  52,269 | +0.027 [+0.020, +0.033] | +0.017 [+0.009, +0.025]     | 1.5% → 2.3%                | yes                                             |
| chicken of the woods | EU        |  80,209 | +0.195 [+0.138, +0.238] | +0.011 [-0.018, +0.039]     | 9.5% → 5.9%                | yes                                             |
| giant puffball       | EU        |  12,458 | +0.042 [+0.028, +0.055] | +0.035 [+0.021, +0.050]     | 0.2% → 1.3%                | no: South Europe worse, -0.095 [-0.130, -0.056] |
| hedgehog             | EU        |  32,842 | +0.029 [+0.023, +0.036] | +0.019 [+0.010, +0.027]     | 1.0% → 1.3%                | yes                                             |
| matsutake            | EU        |   5,364 | -0.008 [-0.037, +0.020] | +0.042 [-0.028, +0.119]     | 4.8% → 1.7%                | no                                              |
| morel                | EU        |  13,900 | +0.090 [+0.067, +0.118] | +0.063 [+0.037, +0.087]     | 3.2% → 3.9%                | yes                                             |
| porcini              | EU        |  46,042 | +0.024 [+0.018, +0.031] | +0.010 [-0.000, +0.019]     | 0.9% → 1.3%                | yes                                             |
| oyster               | EU        |  40,033 | +0.015 [+0.009, +0.021] | +0.016 [+0.010, +0.022]     | 0.0% → 1.6%                | yes                                             |
| parasol              | EU        |  48,636 | +0.045 [+0.038, +0.052] | +0.021 [+0.012, +0.031]     | 0.9% → 1.2%                | yes                                             |
| pine bolete          | EU        |   4,319 | +0.048 [+0.031, +0.064] | +0.030 [+0.003, +0.056]     | 2.6% → 1.9%                | yes                                             |
| saffron milk cap     | EU        |  32,426 | +0.033 [+0.026, +0.040] | +0.009 [+0.002, +0.016]     | 1.1% → 1.4%                | yes                                             |
| shaggy mane          | EU        | 106,691 | +0.011 [+0.001, +0.025] | +0.017 [+0.005, +0.031]     | 2.3% → 1.2%                | yes                                             |
| St George's mushroom | EU        |  11,190 | +0.037 [+0.012, +0.069] | +0.075 [+0.047, +0.112]     | 2.6% → 4.6%                | yes                                             |
| summer bolete        | EU        |  10,426 | +0.043 [+0.017, +0.068] | +0.010 [-0.014, +0.031]     | 5.5% → 5.7%                | no: South Europe worse, -0.058 [-0.119, -0.006] |
| black truffle        | EU        |      47 | -0.392 [-0.918, +0.031] | -0.316 [-1.311, +0.277]     | 21.3% → 25.5%              | no                                              |
| winter chanterelle   | EU        |  18,699 | +0.028 [+0.017, +0.043] | +0.016 [-0.001, +0.038]     | 1.0% → 1.5%                | yes                                             |
| black chanterelle    | US        |   4,919 | +0.018 [+0.003, +0.033] | +0.023 [-0.012, +0.057]     | 6.0% → 2.9%                | yes                                             |
| golden chanterelle   | US        |   4,453 | +0.025 [+0.001, +0.044] | +0.408 [+0.174, +0.566]     | 25.2% → 2.1%               | yes                                             |
| chicken of the woods | US        |  43,602 | +0.043 [+0.026, +0.062] | +0.034 [+0.017, +0.054]     | 2.4% → 2.5%                | yes                                             |
| eastern king         | US        |   1,446 | -0.006 [-0.025, +0.015] | -0.018 [-0.073, +0.037]     | 1.5% → 2.6%                | no                                              |
| giant puffball       | US        |   7,598 | -0.000 [-0.021, +0.022] | +0.003 [-0.029, +0.038]     | 4.5% → 4.6%                | no                                              |
| hedgehog             | US        |   1,805 | -0.004 [-0.033, +0.023] | +0.032 [-0.006, +0.063]     | 0.4% → 2.6%                | no                                              |
| hen of the woods     | US        |   8,170 | +0.050 [+0.026, +0.070] | +0.010 [-0.035, +0.066]     | 3.8% → 1.8%                | yes                                             |
| lion's mane          | US        |  10,907 | +0.090 [+0.070, +0.111] | +0.068 [+0.033, +0.107]     | 4.6% → 4.7%                | yes                                             |
| matsutake            | US        |   1,186 | +0.014 [-0.031, +0.054] | +0.058 [+0.003, +0.124]     | 1.2% → 2.8%                | no: US East worse, -0.138 [-0.250, -0.034]      |
| morel                | US        |  14,220 | +0.098 [+0.076, +0.122] | +0.107 [+0.068, +0.146]     | 5.7% → 3.0%                | yes                                             |
| porcini              | US        |   5,151 | +0.055 [+0.017, +0.089] | +0.076 [+0.021, +0.140]     | 1.9% → 2.1%                | yes                                             |
| oyster               | US        |  26,969 | +0.031 [+0.021, +0.043] | +0.022 [+0.006, +0.042]     | 1.2% → 1.5%                | yes                                             |
| Pacific chanterelle  | US        |   3,628 | -0.006 [-0.024, +0.010] | +0.000 [-0.013, +0.018]     | 1.2% → 2.3%                | no                                              |
| rocky king           | US        |     978 | -0.036 [-0.128, +0.023] | -0.195 [-0.530, +0.003]     | 2.7% → 3.8%                | no                                              |
| saffron milk cap     | US        |   2,652 | +0.055 [+0.027, +0.088] | +0.051 [+0.005, +0.101]     | 0.1% → 3.1%                | yes                                             |
| shaggy mane          | US        |  19,188 | +0.050 [+0.032, +0.070] | +0.091 [+0.064, +0.119]     | 2.5% → 2.9%                | yes                                             |
| smooth chanterelle   | US        |   1,353 | +0.013 [-0.017, +0.048] | +0.099 [+0.055, +0.148]     | 4.1% → 4.9%                | yes                                             |
| winter chanterelle   | US        |   3,429 | +0.046 [+0.008, +0.083] | -0.018 [-0.078, +0.031]     | 1.2% → 2.8%                | yes                                             |

26 species-continents ship (14 in Europe, 12 in the US); the others keep today's curves. The US golden chanterelle gains most against the map: a quarter of its records fell in months the map called dead (its US East curve was the hand-set June to September), now 2%.

**Seams:** between neighbouring places of the same climate, the 99.9th percentile of the season factor's steps is 0.25 for the local curves (median over species, at most 0.32) against today's 0.53 (at most 0.85), the zone and region borders. Every species passes.

**Named places** (production's season factor on 15 July, 15 October and 15 November; today → local):

| place                  | species            | today              | local              |
| ---------------------- | ------------------ | ------------------ | ------------------ |
| central Florida        | smooth chanterelle | 1.00 / 0.20 / 0.00 | 1.00 / 0.75 / 0.71 |
| central Florida        | golden chanterelle | 1.00 / 0.48 / 0.12 | 0.92 / 0.77 / 0.65 |
| Great Smoky Mountains  | smooth chanterelle | 1.00 / 0.20 / 0.00 | 1.00 / 0.15 / 0.00 |
| San Francisco Bay Area | golden chanterelle | 1.00 / 1.00 / 1.00 | 0.00 / 0.69 / 0.86 |
| Tuscan Apennines       | golden chanterelle | 1.00 / 0.68 / 0.66 | 0.71 / 0.79 / 0.78 |
| Tuscan Apennines       | porcini            | 0.81 / 0.80 / 0.69 | 0.24 / 0.86 / 0.74 |
| Sardinia               | porcini            | 0.81 / 0.84 / 0.74 | 0.34 / 1.00 / 0.78 |
| central Sweden         | porcini            | 0.81 / 0.80 / 0.69 | 0.75 / 0.67 / 0.00 |

Florida keeps its chanterelles into the autumn while the Smokies close; California's golden chanterelles are a winter mushroom; central Italy's chanterelle October now outranks its July, and Swedish porcini end in October.

## Caveats

- **Late in the season, persistent mushrooms read high.** By November few people record fungi, and long-lived chanterelles make up a larger share of what is recorded: central Sweden's golden chanterelle reads 0.79 in November (today's curve 0.66). The weather part closes it there.
- **Thin places borrow:** central Italy has a few dozen chanterelle records in the kernel; its June peak rests on two June records against eight in October (GBIF's central Italy shows both a June and an October peak).
- **Records are not fruiting:** a record is a find someone shared, so the curves follow when people look as well as when mushrooms grow; the fungi kingdom's records correct for the first only as far as all mushroom hunters look alike.
- **Elevation within a cell:** the climate of a 0.1° cell comes from the 0.25° ERA5 normals; a valley and its slopes inside one cell share a curve.

## Rechecks

- After the 2026 season: rebuild with 2026's records (`--crawl` refetches only changed keys; delete the 2020-2026 grids to refresh them) and rerun `--test`.
- The species that did not ship, with 2027's records: summer bolete and giant puffball (South Europe), matsutake, the US kings, Pacific chanterelle.

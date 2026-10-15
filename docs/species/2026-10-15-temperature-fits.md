# Temperature settings fitted per region, and a chanterelle layer

Date: 2026-10-15

Tools: `backend/tools/fit_fruiting_parts.py --temperature` (mushrooms) and `backend/tools/fit_plant_settings.py --temperature` / `--select-temperature` (plants). Follows #321 (temperature optima) and #332 (local season curves).

## Why

A hand-set mushroom or plant scores temperature with a bell curve around `optimal_temp`, `temp_sigma` wide, over the 12 days before ( `min_temp` and `max_temp` are documentation: the scorer does not read them). One curve serves a whole region, and #321 moved the optimum only where it timed the finds better: two of 39 moved.

- **Florida, 15 October 2026:** the golden chanterelle (`chant`) scored under 4.5 everywhere in Florida. Its US East settings were the European _C. cibarius_ ones (16 °C, width 4): 0.14 at a normal October day of 25 °C. Florida's autumn chanterelles are the sea grape chanterelle (_C. coccolobae_, 115 of 207 GBIF records in September and October 2020-2025), one of the golden chanterelles `chant` covers since #332.
- **The training table had no American golden chanterelles:** 61 US East finds, all filed as _C. cibarius_.

## What

**The data:** the golden chanterelle's GBIF finds with all its keys (#332). The finds cache for `chant` was refetched; the 4,924 new finds (US East 589, US West 1,056, North Europe 1,644, South Europe 1,635) went into the training table as `<block>__chant_keys.parquet` rows, scores and daily lags, with case ids above the existing ones (`finds_chant_keys_supplement.parquet`), so nothing else was renumbered. 33 finds in 11 cells without an ERA5 block were left out.

**The fit (mushrooms):** for every hand-set mushroom and region with its temperature part on, the optimum (moved -12 to +14 °C) and width (x0.67 to x2.2) chosen for each held-out year on the other years, by two tests added together:

- **places:** each find's place against up to 10 bracket-fungus finds in its region that day elsewhere (where people walked), on the full production score (the place parts, range prior, hosts, habitat and the local season);
- **timing:** each find's day against the same place 14 and 21 days either side, net of the bracket days (#321's test).

It ships when it is better beyond doubt on one test (95% interval over whole weeks above 0), not worse beyond doubt on the other, its held-out timing gain at least -0.005, and not at the grid's edge.

**Tried and rejected:**

- **Choosing on places alone:** fitted optima ran to the edges (golden chanterelle in North Europe 8 °C, hedgehog 6 °C, chicken of the woods in US East 33 °C) while the timing got worse. A fixed optimum bends to encode where the finds are, not how temperature acts.
- **Temperature as a departure from the place's normal:** the place test (held out 2023-2026) favoured the absolute curve refitted for chanterelle, hedgehog, chicken of the woods, morel and eastern king (morel US East: absolute 0.875, departure 0.767, today 0.793). Absolute temperature carries where-information the season does not.
- **An optimum that slides with the place's yearly mean temperature (half or fully):** no better than the absolute refit, and worse for chicken of the woods and morel in US East.

**Plants:** the same optimum and width per plant and region (-6 to +6 °C, x0.67 to x1.5), chosen on 2016-2023 by the same-day test (a sighting against other plants' sightings in the region within 3 days), and shipped only if it also passes #316's other two on 2024-2026: the whole-year AUC no worse (interval's floor at least -0.001) and the months the tags call dead gaining no more than 5 points at 4+. 33 of 58 plant-regions ran to the grid's edge (the season-gradient trap #316 describes) and stay as they are.

## Results

**Mushrooms** (held-out gain per find; ships = the rule above):

| species              | region |  finds | optimum, width             | places today | places gain (95%)       | timing gain (95%)       |
| -------------------- | ------ | -----: | -------------------------- | -----------: | ----------------------- | ----------------------- |
| golden chanterelle   | USE    |    628 | 16, 4 → **28, 4**          |        0.322 | +0.360 [+0.300, +0.428] | +0.130 [+0.041, +0.216] |
| morel                | NE     |  4,018 | 12, 4.5 → **8, 3.0**       |        0.712 | +0.014 [-0.000, +0.030] | +0.102 [+0.030, +0.162] |
| lion's mane          | USW    |  1,507 | 17, 5 → **23, 3.35**       |        0.714 | +0.066 [+0.034, +0.100] | +0.024 [-0.016, +0.059] |
| winter chanterelle   | USE    |    406 | 11, 4.5 → **19, 9.9**      |        0.629 | +0.046 [+0.006, +0.086] | +0.064 [-0.014, +0.137] |
| chicken of the woods | USW    |  7,696 | 19, 5 → **21, 3.35**       |        0.658 | +0.019 [+0.011, +0.026] | +0.004 [-0.020, +0.031] |
| winter chanterelle   | SE     |  1,594 | 11, 4.5 → **12, 9.9**      |        0.695 | +0.017 [+0.006, +0.028] | +0.012 [-0.011, +0.036] |
| black chanterelle    | SE     |  1,534 | 14.5, 4.5 → **15.5, 6.75** |        0.748 | +0.013 [+0.004, +0.022] | +0.005 [-0.008, +0.019] |
| golden chanterelle   | NE     | 20,577 | 16, 4.5 → **15, 9.9**      |        0.642 | +0.011 [+0.006, +0.016] | +0.002 [-0.017, +0.022] |

Not shipped (21): no clear gain, a gain on one test that costs the other (morel US West: places +0.152, timing -0.053 [-0.090, -0.014]), or the grid's edge (hedgehog US East, oyster US West). The full table is `era5_training/temperature_fruiting.csv`.

The golden chanterelle in US East gains in every band of latitude, the north included (place-test rank, held out):

| band                                    | finds | today (16 °C) | fitted (28 °C) |
| --------------------------------------- | ----: | ------------: | -------------: |
| south of 33° N (Florida, the Gulf)      |    88 |         0.272 |          0.861 |
| 33-38° N (Carolinas, Tennessee)         |    38 |         0.163 |          0.926 |
| 38-42° N (Mid-Atlantic)                 |   116 |         0.220 |          0.720 |
| north of 42° N (New England, the Lakes) |   151 |         0.471 |          0.541 |

Its documented `max_temp` moves from 25 to 34 °C so the manifest check accepts the optimum.

**Plants** (same-day rank on 2024-2026; the whole year's AUC; months the tags call dead at 4+):

| plant      | region | optimum, width     | same day      | whole year (AUC) | dead months at 4+ |
| ---------- | ------ | ------------------ | ------------- | ---------------- | ----------------- |
| dandelion  | USE    | 11, 6 → **7, 6**   | 0.649 → 0.660 | 0.715 → 0.744    | 45% → 8%          |
| wild mint  | USW    | 19, 6 → **23, 9**  | 0.551 → 0.595 | 0.697 → 0.733    | 69% → 69%         |
| amaranth   | SE     | 22, 6 → **24, 6**  | 0.636 → 0.684 | 0.789 → 0.802    | 35% → 28%         |
| violets    | SE     | 9, 6 → **7, 4.02** | 0.597 → 0.626 | 0.933 → 0.933    | 1% → 1%           |
| daisy      | USE    | 11, 6 → **7, 9**   | 0.886 → 0.891 | 0.910 → 0.913    | 0% → 0%           |
| elderberry | NE     | 18, 6 → **20, 6**  | 0.689 → 0.710 | 0.945 → 0.945    | 0% → 0%           |

Elderberry in US East (the whole year 0.896 → 0.895, interval from -0.0045) and plantain in South Europe (dead months 22% → 29%) passed the same-day test and failed the others.

## The chanterelle layer

`cantharellus`, "Chanterelles (all)": like the Boletus layer, the best of its members at each place and day. The true chanterelles: the golden chanterelle everywhere, and the smooth and Pacific chanterelles in North America (in Europe the layer is the golden chanterelle). Black and winter chanterelle (_Craterellus_) are left out; adding them is one line. The card reuses the golden chanterelle's photo for now. The app's score list needs its upload column (`Chanterelle Group`) once merged.

## Rechecks

- With 2026's finds (after the season), refit and rerun both tests; the edge cases first (hedgehog US East, oyster US West, the 33 plants).
- The golden chanterelle in US West stays on its settings (no gain); its finds there are mostly the Californian winter species.

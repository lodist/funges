# Switching off the mushroom weather parts that time the finds the wrong way

Date: 2026-10-13

Tool: `backend/tools/fit_fruiting_parts.py`. Production is unchanged: a manifest already sets `temp_weight`, `humidity_weight` and `rain_weight` (#316), and 0 drops that part from the score's weighted mean.

## Why

42 mushroom species-regions have no fitted weather model (#300, #303) and keep their hand-set temperature, humidity and rain parts, weighted 1.75, 1.0 and 1.5. 40 have finds in the ERA5 training table (#300); pacific chanterelle and rocky king in US East have none. Against the same place 14 and 21 days either side, net of bracket-fungus days (where people walk anyway), some time their finds no better than the walkers: morel in North Europe at -0.015, hedgehog in US West at -0.026.

## The test

The fits' own (`tools/fit_fruiting.py`), on the training table's ERA5 days with the parts as `tools/build_training_table.py` stored them:

1. Timing. Parts go one at a time while that lifts the net by at least 0.002. Each year is scored with the parts chosen on the other years, and a species-region ships where that beats today's model in more years than chance (sign test p < 0.1, at least 6 years with 50 finds). With fewer such years, all held-out years together: at least 150 finds, and a 95% CI of the gain above 0 resampling whole weeks within each year (a week's finds share its weather).
2. Places. Summer 2026 finds against other species' finds in the region that week (`scripts/qa_spatial_weights.py`'s strata), the full score on the app's stored weather: not worse. Only chicken of the woods in US West has summer finds; morels and black chanterelles in US West do not fruit then, and the app's stored weather before 14 June reads humidity differently.
3. The map: no place opened out of season.

## What ships

| Mushroom             | Region | Parts off             | Held-out years better            | Net today | Net after | Places today | Places after | 95% CI         |
| -------------------- | ------ | --------------------- | -------------------------------- | --------: | --------: | -----------: | -----------: | -------------- |
| morel                | NE     | humidity, temperature | 10 of 11 (p 0.006)               |    -0.015 |     0.036 |              |              |                |
| chicken of the woods | USW    | rain                  | 8 of 10 (p 0.055)                |     0.025 |     0.043 |        0.544 |        0.601 | [0.038, 0.075] |
| black chanterelle    | USW    | rain, temperature     | pooled +0.119, CI [0.028, 0.206] |     0.063 |     0.181 |              |              |                |

Net: the find day's rank among its controls minus the bracket-fungus days', on all years with the parts chosen on all years (in sample; the held-out column decides). Places: the find's rank among the week's other finds, 0.5 = no skill.

Morel in North Europe keeps rain alone: with the hand-set temperature (best at 12 C) and humidity in, its find days (April 2,269, May 1,273, March 237) ranked below the walkers'. Chicken of the woods was held back from the fit in US West for removing 20-36 points of 4+ places in September and October; switching rain off moves them the other way, a few points up.

## Did not pass

19 species-regions keep every part even on all years. 18 drop one on all years but not out of sample; those leaning the right way:

| Mushroom            | Region | Parts off on all years | Finds | Held-out years better | Pooled gain, 95% CI    |
| ------------------- | ------ | ---------------------- | ----: | --------------------- | ---------------------- |
| winter chanterelle  | USE    | rain, temperature      |   406 | 2 of 3                | 0.064 [-0.0001, 0.132] |
| hedgehog            | USW    | rain, temperature      |   326 | 3 of 4                | 0.048 [-0.028, 0.121]  |
| hedgehog            | USE    | rain, temperature      |   346 | 3 of 4                | 0.046 [-0.022, 0.106]  |
| lion's mane         | USW    | temperature            | 1,507 | 5 of 8                | 0.022 [-0.016, 0.060]  |
| bronze bolete       | NE     | temperature            |   185 | -                     | 0.013 [-0.063, 0.080]  |
| pacific chanterelle | USW    | temperature            | 1,290 | 5 of 8                | 0.010 [-0.034, 0.063]  |
| smooth chanterelle  | USW    | temperature            |    84 | -                     | 0.071 [-0.002, 0.131]  |
| chanterelle         | USE    | temperature            |    61 | -                     | 0.143 [0.004, 0.289]   |

Winter chanterelle and hedgehog in the US are a year or two of finds short. The rest gain nothing clear out of sample, and two lose, which is why the held-out years decide and not the all-years pick: saffron milk cap in US East (rain off, -0.049 [-0.086, -0.004]) and matsutake in US East (humidity and rain off, -0.050 [-0.092, -0.009]). No gain: chanterelle in US West (6 finds), eastern king in US West, saffron milk cap and winter chanterelle in US West, porcini in US East, chicken of the woods in North Europe (7 of 11 years, 0.001), matsutake in US West and the black truffle (2 and 17 finds).

## On the map

4,000 random places per region on the 12 Oct weather masters, as the nightly run scores them (season curves, range prior, habitat, the blend between regions); share of in-range places (range prior at least 0.5) at 4+, before / after, and the mean score:

| Mushroom             | Region | 25 May                | 25 Jun                | 20 Aug                | 25 Sep                | 11 Oct                |
| -------------------- | ------ | --------------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| morel                | NE     | 97% / 92% (5.8 / 5.7) | 46% / 45% (2.7 / 2.7) | 0% / 0%               | 0% / 0%               | 0% / 0%               |
| chicken of the woods | USW    | 19% / 19% (1.7 / 1.7) | 19% / 20% (1.9 / 1.9) | 13% / 18% (1.5 / 1.8) | 22% / 24% (2.2 / 2.3) | 21% / 23% (2.1 / 2.1) |
| black chanterelle    | USW    | 13% / 13% (1.7 / 1.6) | 15% / 13% (1.6 / 1.7) | 6% / 6% (1.3 / 1.4)   | 11% / 8% (1.9 / 1.7)  | 6% / 6% (1.5 / 1.4)   |

Their neighbours' places across the split (morel in South Europe, both US West species in US East) move by at most 1.2 points.

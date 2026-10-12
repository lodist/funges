# Learned habitat factor

Where a species is found among the places people search. `backend/tools/build_habitat_features.py`, `backend/tools/fit_habitat.py`, 11 October 2026.

## Method

- **Features per app location (349,489):** host-cover tree shares (unknown where the tree map does not reach: 94% of Turkey, North Africa, the Canaries), distance to the nearest town, altitude, distances to water and sea, yearly ERA5 normals.
- **Model:** per species-region, a LightGBM conditional logit of each find against up to 10 other fungi's finds in its region within ±3 days, the places people were searching. Trained 2016–2025; 2026 held out (as from the range prior). Training against bracket fungi alone learned to avoid their cool spruce forests and hurt porcini in North Europe, so all other fungi are the comparison.
- **Factor:** exp(0.5 × (index − its 10th percentile at the species' 2016–2025 find places)), capped at 1 and floored at 0.5; 1 where the tree map does not reach. Nine in ten real find places keep their score; no place loses more than half. It multiplies the score next to the range prior.

## Held-out 2026

Summer 2026 finds with the app's own stored weather and today's models, ranked against the places searched that week (0.5 = no better). **34 species-regions ship** (better against other fungi's finds, no worse against bracket fungi). Mean, shipped species-regions, median-place reference: 0.645 → 0.761 (other fungi), 0.638 → 0.758 (bracket fungi). With the shipped 10th-percentile reference: 0.645 → 0.730 (other fungi), 0.638 → 0.732 (bracket).

| Species | Region | Finds | Score alone | Score × habitat (median ref.) | Ships |
| --- | --- | ---: | ---: | ---: | --- |
| black_chant | NE | 37 | 0.838 | 0.873 | no |
| chant | NE | 683 | 0.668 | 0.798 | yes |
| chicken-of-the-woods | NE | 1864 | 0.541 | 0.738 | yes |
| giant_puffball | NE | 142 | 0.607 | 0.751 | yes |
| hedgehog_mushroom | NE | 243 | 0.709 | 0.816 | yes |
| matsutake | NE | 30 | 0.877 | 0.927 | yes |
| mushroom | NE | 442 | 0.682 | 0.740 | yes |
| oyster-mushroom | NE | 341 | 0.507 | 0.650 | yes |
| parasol | NE | 189 | 0.743 | 0.792 | yes |
| pine_bolete | NE | 93 | 0.811 | 0.891 | yes |
| saffron_milk_cap | NE | 209 | 0.736 | 0.822 | yes |
| shaggy_mane | NE | 281 | 0.662 | 0.702 | yes |
| summer_bolete | NE | 113 | 0.706 | 0.844 | yes |
| winter_chant | NE | 83 | 0.651 | 0.779 | yes |
| chant | SE | 126 | 0.649 | 0.752 | yes |
| chicken-of-the-woods | SE | 1014 | 0.440 | 0.650 | yes |
| giant_puffball | SE | 108 | 0.586 | 0.791 | yes |
| mushroom | SE | 263 | 0.651 | 0.774 | yes |
| oyster-mushroom | SE | 87 | 0.475 | 0.605 | yes |
| parasol | SE | 228 | 0.655 | 0.697 | yes |
| saffron_milk_cap | SE | 31 | 0.713 | 0.803 | yes |
| shaggy_mane | SE | 105 | 0.658 | 0.676 | yes |
| summer_bolete | SE | 105 | 0.635 | 0.724 | yes |
| black_chant | USE | 176 | 0.710 | 0.838 | yes |
| chicken-of-the-woods | USE | 1521 | 0.554 | 0.677 | yes |
| eastern_king | USE | 77 | 0.724 | 0.830 | yes |
| giant_puffball | USE | 134 | 0.603 | 0.741 | yes |
| hen_of_the_woods | USE | 59 | 0.645 | 0.578 | no |
| lions_mane | USE | 52 | 0.548 | 0.697 | yes |
| mushroom | USE | 37 | 0.840 | 0.817 | no |
| oyster-mushroom | USE | 1405 | 0.567 | 0.805 | yes |
| smooth_chant | USE | 38 | 0.762 | 0.856 | yes |
| chicken-of-the-woods | USW | 428 | 0.413 | 0.509 | yes |
| mushroom | USW | 68 | 0.585 | 0.735 | yes |
| oyster-mushroom | USW | 50 | 0.592 | 0.726 | yes |
| rocky_king | USW | 63 | 0.975 | 0.984 | yes |
| shaggy_mane | USW | 46 | 0.533 | 0.743 | yes |

## Places with few records are not penalised

Median factor (porcini / chanterelle / chicken-of-the-woods etc.) is about the same in thinly and densely recorded areas of similar habitat: Abruzzo (139 records per 1,000 locations) ≈ Tuscany (336); Appalachia (844) scores *higher* than New England (3,380) for chicken-of-the-woods (1.0 vs 0.5) and lion's mane (0.95 vs 0.60); Turkey (14, tree map missing) gets 1.0 everywhere. Differences follow habitat: porcini and chanterelle keep 1.0 in Scottish and Norwegian forests and drop to 0.5 in southern England's farmland and towns, chicken-of-the-woods the reverse.

## What changes on the map

Change in the share of map points scoring 4+ with the factor, two weeks of stored weather (9–15 Sep, 30 Sep–6 Oct), 1,500 map points per region; near finds = points in a 0.25° cell with a find since 2016.

| Species | Region | All, Sep / Oct | Away from finds, Sep / Oct | Near finds, Sep / Oct |
| --- | --- | --- | --- | --- |
| black_chant | USE | -21 / -28 | -25 / -33 | -4 / -8 |
| chant | NE | -24 / -22 | -36 / -33 | -11 / -10 |
| chant | SE | -15 / -12 | -16 / -13 | -10 / -10 |
| chicken-of-the-woods | NE | -51 / -47 | -69 / -58 | -18 / -27 |
| chicken-of-the-woods | SE | -13 / -16 | -13 / -18 | -14 / -14 |
| chicken-of-the-woods | USE | -6 / -14 | -9 / -18 | -3 / -10 |
| chicken-of-the-woods | USW | -30 / -32 | -37 / -38 | -9 / -15 |
| eastern_king | USE | -36 / -23 | -39 / -24 | -4 / -8 |
| giant_puffball | NE | -39 / -73 | -46 / -86 | -11 / -19 |
| giant_puffball | SE | -25 / -25 | -28 / -27 | -7 / -8 |
| giant_puffball | USE | -31 / -33 | -39 / -40 | -3 / -8 |
| hedgehog_mushroom | NE | -3 / -7 | -3 / -9 | -3 / -5 |
| lions_mane | USE | -13 / -9 | -16 / -11 | -8 / -3 |
| matsutake | NE | -53 / -78 | -56 / -83 | -23 / -29 |
| mushroom | NE | -4 / -10 | -6 / -12 | -2 / -7 |
| mushroom | SE | -9 / -18 | -12 / -23 | -3 / -6 |
| mushroom | USW | -36 / -49 | -38 / -51 | -13 / -21 |
| oyster-mushroom | NE | -11 / -12 | -15 / -17 | -6 / -5 |
| oyster-mushroom | SE | -18 / -21 | -21 / -24 | -12 / -10 |
| oyster-mushroom | USE | -26 / -32 | -33 / -40 | -17 / -21 |
| oyster-mushroom | USW | -19 / -19 | -23 / -23 | -4 / -5 |
| parasol | NE | -30 / -60 | -38 / -76 | -7 / -17 |
| parasol | SE | -2 / -3 | -3 / -4 | -1 / -2 |
| pine_bolete | NE | -15 / -25 | -17 / -29 | -5 / -13 |
| rocky_king | USW | -20 / +0 | -20 / +0 | -28 / +0 |
| saffron_milk_cap | NE | -11 / -12 | -13 / -15 | -7 / -7 |
| saffron_milk_cap | SE | -17 / -21 | -19 / -24 | -8 / -8 |
| shaggy_mane | NE | -55 / -44 | -66 / -56 | -38 / -24 |
| shaggy_mane | SE | -6 / -5 | -6 / -6 | -5 / -3 |
| shaggy_mane | USW | -4 / -14 | -3 / -17 | -8 / -6 |
| smooth_chant | USE | -49 / -50 | -52 / -53 | -13 / -17 |
| summer_bolete | NE | -65 / -46 | -72 / -50 | -32 / -28 |
| summer_bolete | SE | -12 / -16 | -12 / -16 | -13 / -14 |
| winter_chant | NE | -22 / -21 | -29 / -28 | -8 / -9 |

Mean: all points -24.8, away from finds -29.2, near finds -11.1 points.

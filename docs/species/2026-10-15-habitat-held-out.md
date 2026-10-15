# Habitat factors tested on held-out years

Date: 2026-10-15

Tools: `backend/tools/fit_fruiting_parts.py --habitat` (the test, on the ERA5 training table) and `backend/tools/fit_habitat.py --reuse --export` (the decision and the files). Follows #304 (the habitat factor).

## Why

The habitat factor ships for a species and region when it ranks 2026's finds better among the places people searched. Where 2026 had fewer than 30 finds, or no summer 2026 strata (the spring species), that test never ran and the factor stayed off. Bronze bolete in South Europe had 26 finds in 2026. So in Italy its place factor (range × hosts × habitat) averaged 0.98, porcini's 0.75. That made about half of bronze's lead over porcini in Italy on 21 October (the other half: porcini's weather part reading the dry spell), north of 44° N too, where bronze is rare.

## What

The training table holds 2016-2026. For each year in turn, the habitat model is trained on the other years' finds as `fit_habitat.py` trains it. Each of that year's finds is then ranked with the factor and without, two ways, as in 2026:

- **against bracket finds:** up to 10 bracket-fungus finds that day elsewhere in the region (where people walked). The ranking uses the full score: ERA5 weather with #334's temperature settings, plus the place parts, range prior, hosts and local season;
- **against other fungi's places:** up to 10 places where other fungi were found within ±3 days. The ranking uses the score's place parts (the table has no weather at those places).

It ships when it is better beyond doubt on one test (95% interval over whole weeks above 0) and not worse beyond doubt on the other. 2026's finds, where there are any, must also rank no worse among the places searched that week. The model that ships is the one the 12 October run trained on 2016-2025, as for the others.

Where the years ran, they decide. A few dozen 2026 finds weigh little against them. Black chanterelle in North Europe was turned down on 12 October because 37 finds against bracket fungi slipped (0.812 → 0.788); held out, 2,854 finds gain beyond doubt on both tests. Every decision the 2026 test made otherwise stands, and the 34 factors shipped before are unchanged in the new files (50 now). Species with a fitted weather part (a fruiting fit or GBM) are not in this test, which rebuilds only hand-set weather; for them 2026 still decides.

## Results

All 16 hand-set species-regions without a factor ship (place-test rank, held-out years pooled; 95% intervals over whole weeks). 2026 finds: the 2026 test's cases on 12 October; morel and St George's mushroom are spring species, with no summer 2026 strata to test on.

| species              | region | finds held out (bracket, all) | against bracket finds that day         | against other fungi's places           | 2026 finds |
| -------------------- | ------ | ----------------------------: | -------------------------------------- | -------------------------------------- | ---------: |
| hedgehog             | SE     |                  1,552, 2,840 | 0.610 → 0.730, +0.120 [+0.100, +0.140] | 0.595 → 0.750, +0.155 [+0.141, +0.169] |         24 |
| St George's mushroom | SE     |                    868, 1,599 | 0.681 → 0.732, +0.050 [+0.018, +0.080] | 0.564 → 0.687, +0.123 [+0.098, +0.152] |        206 |
| morel                | NE     |                  3,612, 4,026 | 0.725 → 0.826, +0.101 [+0.083, +0.120] | 0.663 → 0.770, +0.107 [+0.091, +0.122] |        434 |
| lion's mane          | USW    |                    565, 1,443 | 0.780 → 0.850, +0.069 [+0.052, +0.089] | 0.697 → 0.801, +0.104 [+0.095, +0.114] |         43 |
| black chanterelle    | NE     |                  2,854, 2,968 | 0.769 → 0.830, +0.061 [+0.052, +0.071] | 0.729 → 0.828, +0.100 [+0.090, +0.108] |        100 |
| morel                | USW    |                    997, 2,366 | 0.536 → 0.793, +0.257 [+0.221, +0.288] | 0.691 → 0.789, +0.098 [+0.081, +0.113] |        317 |
| winter chanterelle   | SE     |                    923, 1,612 | 0.712 → 0.773, +0.062 [+0.041, +0.081] | 0.685 → 0.782, +0.097 [+0.085, +0.109] |         32 |
| pine bolete          | SE     |                       67, 153 | 0.749 → 0.832, +0.084 [+0.028, +0.150] | 0.708 → 0.803, +0.095 [+0.058, +0.128] |         16 |
| black chanterelle    | SE     |                    891, 1,549 | 0.761 → 0.817, +0.055 [+0.038, +0.073] | 0.709 → 0.798, +0.090 [+0.075, +0.103] |         23 |
| bronze bolete        | SE     |                      336, 636 | 0.883 → 0.929, +0.046 [+0.027, +0.069] | 0.809 → 0.892, +0.084 [+0.068, +0.099] |         26 |
| winter chanterelle   | USW    |                      394, 871 | 0.679 → 0.817, +0.138 [+0.105, +0.170] | 0.819 → 0.899, +0.080 [+0.070, +0.091] |         79 |
| hedgehog             | USE    |                      109, 184 | 0.657 → 0.648, -0.009 [-0.074, +0.049] | 0.682 → 0.753, +0.071 [+0.029, +0.110] |         14 |
| winter chanterelle   | USE    |                      272, 389 | 0.694 → 0.734, +0.040 [+0.016, +0.069] | 0.826 → 0.873, +0.047 [+0.033, +0.060] |         26 |
| morel                | SE     |                  1,649, 2,770 | 0.604 → 0.664, +0.060 [+0.033, +0.085] | 0.633 → 0.678, +0.044 [+0.033, +0.056] |        220 |
| Pacific chanterelle  | USW    |                    643, 1,220 | 0.589 → 0.658, +0.070 [+0.049, +0.091] | 0.834 → 0.861, +0.026 [+0.020, +0.033] |         60 |
| saffron milk cap     | USW    |                      322, 925 | 0.651 → 0.707, +0.056 [+0.029, +0.084] | 0.777 → 0.802, +0.025 [+0.015, +0.033] |          8 |

## Bronze bolete in Italy

Its factor by altitude (mean over places; 1 = no change):

| places                                                 | below 200 m | 200-500 m   | 500-900 m   | 900-1300 m  | above 1300 m |
| ------------------------------------------------------ | ----------- | ----------- | ----------- | ----------- | ------------ |
| Tuscany (box 42.2-44.5° N, 9.7-12.4° E)                | 0.99 (0.57) | 1.00 (0.70) | 1.00 (0.84) | 1.00 (0.97) | 0.98 (1.00)  |
| North Italy and the Alps (box 44-47.1° N, 6.6-13.9° E) | 0.78 (0.53) | 0.89 (0.71) | 0.74 (0.92) | 0.61 (0.98) | 0.51 (0.99)  |
| South Italy (south of 40.5° N)                         | 1.00 (0.53) | 1.00 (0.62) | 1.00 (0.80) | 1.00 (0.95) | 1.00 (0.97)  |

In brackets: porcini's factor, shipped since #304.

Over South Europe's places, 60% keep their score and 25% are halved (the floor). North of 44° N it now falls with altitude. In Tuscany and the south it stays at 1 at every altitude, also in the beech belt above 900 m where porcini belongs. The finds say bronze is absent there: in the Tuscan box, 0 of bronze's 26 finds lie above 900 m, against 8 of porcini's 16. But that is too few to learn from when the factor's reference keeps 9 in 10 find places at full score. Taking beech out of its host list changes nothing: around every one of the 68 Tuscan places above 900 m, oak and other broadleaf (chestnut among them) cover 30% of the ground (median; beech 47%), and 2% within about 5 km is the host part's full cover. What is left for the Tuscan mountains is its weather part: hand-set and absolute, it does not compare a dry autumn with a normal one as porcini's fit does. Its group fit (held back on 14 October for ranking places worse) can be tested again with this factor in the score.

## Not tested here

- Fitted weather parts: St George's mushroom in North Europe, morel, shaggy mane, hen of the woods and porcini in US East, giant puffball in US West. Hen of the woods and porcini in US East failed the 2026 test (#304) and stay off.
- Golden chanterelle in North America: its American finds came with #334's training supplement, after the habitat models were trained. A refit on all its keys is a follow-up.

## Rechecks

- With 2026's finds after the season: refit every habitat model on 2016-2026, and rerun both tests.
- Hedgehog in US East is thin: 109 finds against bracket finds, and two runs with different random draws read +0.056 and -0.009 there. It ships on the other test (+0.071, 184 finds).

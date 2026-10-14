# Switching off the plant score parts that point the wrong way

Date: 2026-10-13

Tool: `backend/tools/fit_plant_settings.py`. Production: a manifest may now set `temp_weight`, `humidity_weight`, `alt_weight` and `ph_weight`, as it already set `rain_weight`; 0 drops that part from the score's weighted mean.

## Why

A plant's weather and place parts (temperature, humidity, rain, altitude, pH) are hand-set per region. Against the places people searched the same week (each sighting of the plant in the stage people pick, against up to 10 other plants' sightings in the region within 3 days), scored with the range prior as in production, some rank the plant's own sightings below chance (0.5) on 2024-2026:

| Plant     | Region | Same-day rank today |
| --------- | ------ | ------------------: |
| dandelion | USW    |               0.305 |
| violets   | USW    |               0.344 |
| rose_hips | USW    |               0.408 |
| dandelion | NE     |               0.430 |
| nettle    | USW    |               0.433 |
| walnut    | SE     |               0.433 |
| plantain  | USE    |               0.463 |
| plantain  | NE     |               0.471 |
| rose_hips | USE    |               0.474 |
| nettle    | NE     |               0.476 |
| nettle    | SE     |               0.489 |
| wild-mint | SE     |               0.500 |

## Tried first: fitting new optima

A coordinate search over the optimal temperature, humidity, rain, altitude and pH on 2016-2023 ranked the held-out years higher for 50 of 74 plant-regions, with optima that describe no plant: dandelion in US West at -1 C, 40% humidity and 1800 m; blackberry in South Europe at 32 C and 30% humidity; many at the search's edges. The same-week strata still carry the season's spatial gradient (a plant is in its stage at altitude late in the season, in warm places early) and the comparison mix (fewer other plants are photographed in a hot dry spell), and a fixed optimum bends to encode them. Not shipped.

## What ships: parts switched off

Switching a part off can only remove a signal. Three tests, all on 2024-2026:

1. The same day: on 2016-2023 parts go one at a time while that lifts the rank by at least 0.002; on the held-out years the result must beat today's settings (paired bootstrap interval above 0).
2. The whole year: the full score (season, learned season, range prior) must rank the plant's stage sightings above all plant sightings no worse than today (AUC, paired bootstrap lower bound at least -0.001). A part also times the season: with temperature off, chestnuts in South Europe went from 4% to 58% of in-range places at 4+ on 20 August.
3. The months the tags call dead (under a tenth of the peak per sighting) gain at most 5 points of sightings at 4+.

Chestnut and walnut are left out: their fruiting tags include green nuts, so the tags keep August alive and test 3 cannot see the map opening them there.

| Plant       | Region | Parts off                           | Same day today | Same day after | 95% CI           | Year AUC today | Year AUC after | 95% CI            |
| ----------- | ------ | ----------------------------------- | -------------: | -------------: | ---------------- | -------------: | -------------: | ----------------- |
| blueberry   | NE     | altitude, humidity, temperature     |          0.605 |          0.647 | [0.0246, 0.0602] |          0.835 |          0.849 | [0.0095, 0.0191]  |
| daisy       | SE     | pH                                  |          0.551 |          0.558 | [0.0016, 0.0104] |          0.668 |          0.670 | [-0.0003, 0.0024] |
| daisy       | USW    | temperature                         |          0.600 |          0.661 | [0.0526, 0.0694] |          0.672 |          0.722 | [0.0376, 0.0458]  |
| dandelion   | NE     | altitude, humidity, pH, temperature |          0.430 |          0.500 | [0.0502, 0.0899] |          0.479 |          0.520 | [0.0232, 0.0583]  |
| dandelion   | USE    | humidity, rain                      |          0.636 |          0.649 | [0.0058, 0.0208] |          0.682 |          0.715 | [0.0308, 0.0398]  |
| dandelion   | USW    | altitude, humidity, pH, temperature |          0.305 |          0.500 | [0.1758, 0.213]  |          0.416 |          0.501 | [0.0647, 0.1023]  |
| elderberry  | USW    | altitude, humidity, temperature     |          0.546 |          0.658 | [0.0884, 0.1353] |          0.744 |          0.782 | [0.03, 0.05]      |
| huckleberry | USW    | humidity, temperature               |          0.797 |          0.941 | [0.1332, 0.1578] |          0.927 |          0.961 | [0.0309, 0.0374]  |
| lingonb     | NE     | humidity, rain, temperature         |          0.668 |          0.712 | [0.0172, 0.0721] |          0.863 |          0.880 | [0.0099, 0.0259]  |
| nettle      | SE     | humidity, pH, rain, temperature     |          0.489 |          0.555 | [0.0389, 0.0922] |          0.480 |          0.576 | [0.0749, 0.1159]  |
| nettle      | USW    | humidity, pH, temperature           |          0.433 |          0.537 | [0.0632, 0.1457] |          0.382 |          0.488 | [0.0723, 0.1404]  |
| pawpaw      | USE    | humidity, rain                      |          0.819 |          0.855 | [0.0307, 0.0419] |          0.830 |          0.840 | [0.0078, 0.011]   |
| plantain    | USE    | pH, rain, temperature               |          0.463 |          0.520 | [0.0161, 0.097]  |          0.545 |          0.592 | [0.0235, 0.077]   |
| raspberry   | NE     | rain, temperature                   |          0.520 |          0.576 | [0.021, 0.0903]  |          0.835 |          0.843 | [0.002, 0.0153]   |
| raspberry   | USW    | altitude, humidity, temperature     |          0.743 |          0.885 | [0.1205, 0.1628] |          0.903 |          0.955 | [0.05, 0.0598]    |
| rose_hips   | USE    | altitude, pH, rain, temperature     |          0.474 |          0.553 | [0.0675, 0.0926] |          0.821 |          0.839 | [0.0162, 0.0196]  |
| rose_hips   | USW    | temperature                         |          0.408 |          0.451 | [0.0341, 0.0523] |          0.736 |          0.757 | [0.0155, 0.0213]  |
| strawberry  | USW    | altitude, humidity                  |          0.512 |          0.583 | [0.0478, 0.0971] |          0.687 |          0.719 | [0.0228, 0.0442]  |
| violets     | SE     | altitude                            |          0.591 |          0.597 | [0.0016, 0.0095] |          0.872 |          0.874 | [0.0002, 0.0021]  |
| violets     | USE    | pH, temperature                     |          0.867 |          0.902 | [0.0226, 0.0505] |          0.909 |          0.940 | [0.0257, 0.0366]  |
| violets     | USW    | altitude, temperature               |          0.344 |          0.448 | [0.0727, 0.1376] |          0.749 |          0.797 | [0.0356, 0.0541]  |
| wild-mint   | SE     | altitude, humidity, pH              |          0.500 |          0.526 | [0.0186, 0.0345] |          0.736 |          0.767 | [0.0304, 0.0382]  |

Passed the same day but not the year or the dead months, so unchanged:

- chickweed in USE: no clear gain across the year; year AUC 0.815 to 0.814, CI [-0.0016, 0.0041]
- elderberry in SE: worse across the year; year AUC 0.826 to 0.792, CI [-0.0444, -0.027]
- elderflower in USW: no clear gain across the year; year AUC 0.825 to 0.830, CI [-0.0017, 0.0053]
- strawberry in USE: no clear gain across the year; year AUC 0.842 to 0.839, CI [-0.0088, 0.0016]
- nettle in USE: opens dead months (months 1 2: 4% to 11% of sightings at 4+); year AUC 0.731 to 0.798, CI [0.0549, 0.1078]
- sloes in NE: no clear gain across the year; year AUC 0.818 to 0.822, CI [-0.0086, 0.0152]
- wild-mint in USW: worse across the year; year AUC 0.697 to 0.623, CI [-0.0938, -0.0614]
- blueberry in SE: no clear gain across the year; year AUC 0.830 to 0.835, CI [-0.0012, 0.0094]
- dandelion in SE: no clear gain across the year; year AUC 0.610 to 0.602, CI [-0.0318, 0.0123]
- plantain in SE: no clear gain across the year; year AUC 0.631 to 0.639, CI [-0.0081, 0.0244]

## On the map

4,000 random places per region on main's stored weather, with the learned season and the blend between regions as in production; share of in-range places (range prior at least 0.5) at 4+, before / after, and the mean score:

| Plant       | Region | 25 May                   | 25 Jun                   | 20 Aug                   | 12 Oct                   |
| ----------- | ------ | ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| blueberry   | NE     | 0% / 0% (1.0 / 1.0)      | 100% / 98% (6.6 / 6.6)   | 96% / 91% (8.1 / 7.8)    | 67% / 94% (4.4 / 5.2)    |
| daisy       | SE     | 99% / 98% (7.8 / 7.9)    | 0% / 0% (1.1 / 1.1)      | 0% / 0% (0.5 / 0.5)      | 0% / 0% (1.0 / 0.9)      |
| daisy       | USW    | 69% / 58% (5.4 / 4.7)    | 44% / 42% (4.0 / 3.9)    | 0% / 0% (0.5 / 0.5)      | 0% / 0% (0.6 / 0.5)      |
| dandelion   | NE     | 100% / 100% (8.1 / 10.0) | 100% / 100% (8.0 / 10.0) | 100% / 100% (7.9 / 10.0) | 100% / 100% (7.8 / 10.0) |
| dandelion   | USE    | 85% / 75% (6.4 / 6.2)    | 59% / 60% (5.3 / 4.8)    | 49% / 38% (4.0 / 3.5)    | 84% / 82% (6.5 / 6.6)    |
| dandelion   | USW    | 76% / 99% (5.3 / 9.1)    | 51% / 90% (4.0 / 8.7)    | 28% / 84% (3.1 / 8.2)    | 72% / 99% (4.9 / 9.0)    |
| elderberry  | USW    | 50% / 67% (3.7 / 4.7)    | 71% / 79% (5.4 / 6.4)    | 90% / 96% (6.8 / 7.7)    | 96% / 97% (6.3 / 7.1)    |
| huckleberry | USW    | 0% / 0% (0.7 / 0.8)      | 92% / 76% (5.4 / 5.2)    | 99% / 93% (6.9 / 6.8)    | 23% / 42% (3.6 / 3.8)    |
| lingonb     | NE     | 0% / 0% (1.0 / 1.1)      | 0% / 0% (1.1 / 1.1)      | 98% / 99% (8.2 / 8.6)    | 100% / 99% (7.3 / 8.9)   |
| nettle      | SE     | 100% / 97% (7.4 / 5.8)   | 88% / 97% (6.9 / 5.7)    | 61% / 97% (5.1 / 5.7)    | 93% / 97% (6.9 / 5.8)    |
| nettle      | USW    | 94% / 99% (6.1 / 8.1)    | 75% / 92% (5.7 / 7.9)    | 69% / 87% (5.2 / 7.5)    | 94% / 97% (6.4 / 8.0)    |
| pawpaw      | USE    | 0% / 0% (1.0 / 1.0)      | 0% / 0% (1.1 / 1.1)      | 94% / 100% (8.2 / 8.6)   | 99% / 95% (7.4 / 7.4)    |
| plantain    | USE    | 100% / 100% (8.1 / 9.1)  | 99% / 99% (8.3 / 9.1)    | 85% / 94% (7.2 / 8.9)    | 100% / 100% (7.8 / 8.8)  |
| raspberry   | NE     | 0% / 0% (1.0 / 1.1)      | 100% / 100% (6.7 / 6.9)  | 96% / 100% (8.1 / 8.7)   | 0% / 0% (0.9 / 1.2)      |
| raspberry   | USW    | 0% / 0% (0.5 / 0.6)      | 32% / 44% (2.8 / 3.2)    | 31% / 54% (3.0 / 4.1)    | 1% / 14% (2.3 / 2.8)     |
| rose_hips   | USE    | 0% / 1% (0.1 / 0.1)      | 5% / 7% (0.7 / 0.9)      | 41% / 62% (3.5 / 4.7)    | 97% / 97% (6.9 / 7.2)    |
| rose_hips   | USW    | 0% / 0% (0.2 / 0.2)      | 5% / 7% (1.0 / 1.1)      | 53% / 62% (4.0 / 4.6)    | 95% / 90% (6.3 / 6.0)    |
| strawberry  | USW    | 90% / 96% (6.2 / 6.5)    | 75% / 78% (5.5 / 5.8)    | 0% / 0% (1.6 / 1.6)      | 0% / 0% (0.8 / 0.8)      |
| violets     | SE     | 0% / 0% (1.7 / 1.6)      | 0% / 0% (0.5 / 0.4)      | 0% / 0% (0.4 / 0.3)      | 0% / 0% (0.8 / 0.8)      |
| violets     | USE    | 91% / 91% (7.8 / 8.9)    | 0% / 0% (1.7 / 2.1)      | 0% / 0% (0.7 / 1.1)      | 0% / 0% (1.0 / 1.1)      |
| violets     | USW    | 17% / 17% (2.2 / 2.3)    | 0% / 0% (0.6 / 0.8)      | 0% / 0% (0.4 / 0.6)      | 0% / 0% (0.6 / 0.7)      |
| wild-mint   | SE     | 95% / 83% (7.0 / 5.6)    | 99% / 99% (8.0 / 8.0)    | 98% / 97% (7.3 / 7.7)    | 96% / 82% (7.3 / 6.0)    |

Dandelion in North Europe loses every weather part and reads 10 wherever it grows, in season: it was at 4+ in every in-range place on all four days before. Its parts ranked its sightings below chance.

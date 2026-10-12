# Learned plant seasons and no lines between the US regions

Date: 2026-10-12

Tools: `backend/tools/fit_phenology.py` (learned season), `blend_neighbour_settings` in `backend/forecast_pipeline.py` (the regions' models across their split).

## 1. Learned plant season

Ships for Europe: blackberry, elderflower, garlic, rose_hips. For the US: elderflower, rose_hips. Every other plant keeps its months.

Every iNaturalist sighting of the app's plants carrying a phenology annotation (flowering, fruiting, budding, no evidence of flowering), 2016 on, Europe and the lower 48: 366,538 sightings. A plant's sightings in the stage people pick are compared with all of them, the record of people out looking, so effort cancels as in the fungi season curves. Read alone, a plant's own share of sightings in the stage stays high out of season: a wild strawberry photographed in October usually has a fruit.

Per plant, a LightGBM classifier on the day of the year, day length, latitude and the place's yearly ERA5 normals. Production reads it per 0.25 degree cell and week as a ratio to the place's own peak week, with a multiplier of 0.8-1.0 and a gate of its own: shut below 10% of the peak, fully open from 30%. The fungi curves' multiplier (0.6-1.0) and gate (fully open at 10%) were too loose for plants: the gate kept wild strawberry's autumn tail open.

A plant ships if, on each year held out, the learned season ranks its stage sightings above all plant sightings better than today's season factor in more years than chance gives (sign test p < 0.1, at least 6 years), and it stays shut in every region-month where the tags show under a tenth of the peak per sighting. Then the map decides: a plant whose tags do not mean what people pick is held back.

| Plant         | Stage picked | Stage sightings | Years | Today | Learned | Result                                                                                                                                                                                                                                       |
| ------------- | ------------ | --------------: | ----: | ----: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| blackberry    | fruiting     |          10,800 |    11 | 0.677 |   0.818 | ships in Europe only: in the US it read 6-7 in Kansas and Nebraska on 12 October, where tags are few                                                                                                                                         |
| blueberry     | fruiting     |           7,057 |    11 | 0.789 |   0.814 | open in months with no fruit or flower (SE-5 USW-6)                                                                                                                                                                                          |
| cloudberry    | fruiting     |             773 |     7 | 0.876 |   0.822 | not better in enough held-out years (2 of 7)                                                                                                                                                                                                 |
| elderberry    | fruiting     |          13,006 |    11 | 0.788 |   0.871 | held back: its fruiting tags include green berries, which are toxic, and it opened in June                                                                                                                                                   |
| huckleberry   | fruiting     |           1,409 |     8 | 0.805 |   0.739 | not better in enough held-out years (3 of 8); open in months with no fruit or flower (USE-1 USE-2 USE-3 USE-4 USE-5 USE-8 USE-9 USE-10 USE-11 USE-12 USW-1 USW-2 USW-3 USW-4 USW-5 USW-10 USW-11 USW-12)                                     |
| lingonb       | fruiting     |           2,274 |    10 | 0.823 |   0.815 | not better in enough held-out years (5 of 10); open in months with no fruit or flower (SE-1 SE-12 USE-1 USE-2 USE-3 USE-4 USE-5 USE-6 USE-11 USE-12)                                                                                         |
| pawpaw        | fruiting     |           6,116 |    11 | 0.697 |   0.775 | held back: fruiting tags include green fruit, and it opened in June                                                                                                                                                                          |
| raspberry     | fruiting     |           3,855 |    11 | 0.832 |   0.842 | not better in enough held-out years (8 of 11); open in months with no fruit or flower (USE-9 USE-10)                                                                                                                                         |
| rose_hips     | fruiting     |          28,761 |    11 | 0.705 |   0.800 | ships                                                                                                                                                                                                                                        |
| sea_buckthorn | fruiting     |             551 |     7 | 0.778 |   0.747 | not better in enough held-out years (1 of 7); open in months with no fruit or flower (SE-12)                                                                                                                                                 |
| sloes         | fruiting     |           3,410 |    10 | 0.714 |   0.816 | held back: fruiting tags include green sloes, and it opened in June                                                                                                                                                                          |
| strawberry    | fruiting     |           3,781 |    11 | 0.714 |   0.769 | open in months with no fruit or flower (USE-3)                                                                                                                                                                                               |
| chestnut      | fruiting     |             826 |     8 | 0.809 |   0.807 | not better in enough held-out years (3 of 8)                                                                                                                                                                                                 |
| hazelnut      | fruiting     |           4,497 |    11 | 0.661 |   0.753 | held back: fruiting tags include green nuts, and it opened in June                                                                                                                                                                           |
| walnut        | fruiting     |           5,908 |    10 | 0.629 |   0.743 | held back: fruiting tags include green nuts, and it opened in June                                                                                                                                                                           |
| daisy         | flowering    |          27,147 |    11 | 0.612 |   0.797 | open in months with no fruit or flower (USE-1)                                                                                                                                                                                               |
| elderflower   | flowering    |          15,619 |    11 | 0.728 |   0.854 | ships                                                                                                                                                                                                                                        |
| violets       | flowering    |           6,579 |     9 | 0.814 |   0.905 | open in months with no fruit or flower (USE-2)                                                                                                                                                                                               |
| garlic        | leaves       |           1,220 |     7 | 0.766 |   0.841 | ships                                                                                                                                                                                                                                        |
| ramps         | leaves       |           1,938 |    10 | 0.583 |   0.717 | held back: its leaf tags count the budding stalks, leafless by late June, and it opened on 25 June                                                                                                                                           |
| nettle        | leaves       |           4,223 |     9 | 0.502 |   0.655 | open in months with no fruit or flower (USE-2)                                                                                                                                                                                               |
| sorrel        | leaves       |           1,097 |     8 | 0.542 |   0.655 | held back: its leaves stay up all winter and its share peaks in December, when few other plants are photographed; spring read under half of that                                                                                             |
| asparagus     | leaves       |             560 |     6 | 0.493 |   0.249 | not better in enough held-out years (0 of 6)                                                                                                                                                                                                 |
| artichoke     | budding      |             280 |     4 | 0.669 |   0.398 | not better in enough held-out years (0 of 4); open in months with no fruit or flower (NE-1 NE-2 NE-3 NE-4 NE-5 NE-8 NE-9 NE-10 NE-11 NE-12 SE-7 SE-8 SE-9 SE-10 USE-1 USE-4 USE-5 USE-6 USE-8 USE-9 USE-10 USE-11 USE-12 USW-8 USW-9 USW-10) |

Today and Learned: AUC of the stage sightings against all plant sightings on each held-out year, averaged; today's factor is main's months.

Not tested: the plants eaten whatever their stage (chickweed, plantain, amaranth, masterwort, wild mint) and dandelion. Their sightings peak when they flower and stand out, not when they are best to eat: learned that way, wild mint in North Europe fell from 100% of places at 4+ to 1% on 25 June. Fiddleheads carry no tags (ferns do not flower).

## 2. No lines between the US regions

The forecast regions are lists of places, and a species scored in both regions of a continent used each region's own model: hand-set settings (optimal temperature and humidity, rain, altitude, pH, months), season curves and, for mushrooms, the fitted models and GBMs that ship per region. US West's list reaches Missouri, Kentucky and Tennessee, so the map jumped along state lines: wild mint on 12 October read 9.3 in Kentucky and 4.3 next door in Indiana, and shaggy mane drew Missouri's and Tennessee's borders. Now each US region's model fades into its neighbour's across a band around the app's split at 100 W (`infer_region`): 105-95 W. A place takes its own side's model: Missouri, Kentucky and Tennessee, on US West's list but east of 95 W, score with US East's, as Iowa, Indiana and Alabama do. Each run loads its neighbour's model as it loads its own (a few MB from R2); if that fails, the region's own scores stand. The learned habitat factor is listed per place, and each region's now also covers its neighbour's places (`tools/fit_habitat.py`, same models, the region's own places unchanged to the last of 255 steps), so a place across the split takes the neighbour's factor too: shaggy mane has one in US West and none in US East, giant puffball the reverse. The range prior, host trees and the learned plant season are already the continent's.

Europe is not blended yet. Its lists meet along the Dutch, Danish and Polish borders (North Europe from 49.5 N, South Europe up to 54.8 N), not at the app's 47 N: a band there would move Germany, Poland and Czechia onto North Europe's model, trained without their finds. Its band has to follow the lists' own boundary, a follow-up.

Mean score on 12 October either side of the old lines, each region's own model / blended:

| Species          | Iowa (USE) | Missouri N (USW) | Indiana (USE) | Kentucky (USW) | Mississippi-Alabama N (USE) | Tennessee S (USW) | Kansas (USW) | Nebraska (USW) |
| ---------------- | ---------: | ---------------: | ------------: | -------------: | --------------------------: | ----------------: | -----------: | -------------: |
| shaggy_mane      |  7.1 / 7.1 |        6.0 / 6.8 |     6.2 / 6.2 |      3.8 / 5.7 |                   5.9 / 5.9 |         3.6 / 5.7 |    4.4 / 5.4 |      6.0 / 6.2 |
| mushroom         |  1.7 / 1.7 |        0.4 / 0.7 |     0.2 / 0.2 |      0.0 / 0.1 |                   0.0 / 0.0 |         0.0 / 0.0 |    0.3 / 0.5 |      0.3 / 0.5 |
| saffron_milk_cap |  1.7 / 1.7 |        0.0 / 1.3 |     5.2 / 5.2 |      0.0 / 2.3 |                   2.9 / 2.9 |         1.1 / 2.9 |    0.0 / 0.8 |      0.0 / 0.7 |
| chant            |  4.4 / 4.4 |        7.7 / 4.4 |     3.0 / 3.0 |      5.7 / 3.3 |                   3.3 / 3.3 |         6.1 / 3.5 |    2.7 / 1.8 |      3.8 / 2.6 |
| giant_puffball   |  8.8 / 8.8 |        9.3 / 8.8 |     6.1 / 6.1 |      6.3 / 5.0 |                   3.5 / 3.5 |         6.3 / 4.2 |    8.9 / 8.3 |      9.1 / 8.4 |
| oyster-mushroom  |  5.2 / 5.2 |        5.3 / 5.4 |     5.3 / 5.3 |      5.1 / 5.7 |                   5.6 / 5.6 |         5.0 / 5.6 |    1.9 / 2.0 |      2.5 / 2.6 |
| wild-mint        |  4.6 / 4.6 |        9.2 / 4.8 |     4.2 / 4.2 |      8.8 / 4.5 |                   4.6 / 4.6 |         8.9 / 4.9 |    8.6 / 5.8 |      8.9 / 5.9 |
| nettle           |  6.6 / 6.6 |        9.4 / 5.9 |     4.6 / 4.6 |      5.8 / 3.5 |                   2.0 / 2.0 |         3.8 / 2.2 |    8.3 / 5.9 |      8.9 / 6.6 |

The plants' state-line boxes from the map check below, before / after:

| Plant      |   Indiana |      Ohio |      Iowa |  Kentucky | Tennessee |    Kansas |  Nebraska |
| ---------- | --------: | --------: | --------: | --------: | --------: | --------: | --------: |
| blackberry | 1.0 / 1.0 | 0.9 / 0.9 | 1.1 / 1.1 | 9.2 / 1.0 | 9.3 / 1.1 | 8.2 / 3.2 | 8.6 / 3.3 |
| dandelion  | 7.2 / 7.2 | 8.7 / 8.7 | 8.1 / 8.1 | 6.2 / 7.0 | 5.9 / 6.8 | 5.1 / 5.6 | 6.0 / 6.3 |
| elderberry | 3.7 / 3.7 | 3.4 / 3.4 | 4.3 / 4.3 | 9.0 / 4.1 | 9.2 / 4.8 | 9.3 / 6.0 | 9.4 / 5.9 |
| nettle     | 6.1 / 6.1 | 7.6 / 7.6 | 7.0 / 7.0 | 9.3 / 6.0 | 9.2 / 5.7 | 8.3 / 5.9 | 8.8 / 6.6 |
| wild-mint  | 4.3 / 4.3 | 4.2 / 4.2 | 4.9 / 4.9 | 9.3 / 4.7 | 9.5 / 5.2 | 8.8 / 6.0 | 9.1 / 6.0 |

Tried first and not shipped: one set of settings per continent, picked by which region's set ranks the plant's stage sightings above all sightings better in more years. It removed the line too, but a single absolute temperature optimum cannot fit a continent (North Europe blackberry 18 C, South Europe 22 C), and levels moved well inside the regions. Share of in-range places at 4+: US West nettle 81% to 12% on 20 August, North Europe sloes 96% to 61% and blackberry 93% to 70% on 12 October; its shared months cut North Europe daisy on 25 June (97% to 0%) and US East violets (95% to 0%) and blueberry (94% to 0%) on 25 May. That test scores a whole year at once, so it mostly rewards telling summer from spring, not the level on a given day. It did flag regional settings that rank a plant's sightings below chance (US West nettle: 0.40), which a recalibration with a same-day test should take up. Its per-year picks:

| Continent | Plant         | Years | AUC, first region | AUC, second region | Years won |
| --------- | ------------- | ----: | ----------------: | -----------------: | --------- |
| EU        | blackberry    |     9 |        0.801 (NE) |         0.822 (SE) | 0-9       |
| EU        | blueberry     |    10 |        0.842 (NE) |         0.817 (SE) | 10-0      |
| EU        | elderberry    |     9 |        0.824 (NE) |         0.833 (SE) | 0-9       |
| EU        | lingonb       |     8 |        0.857 (NE) |         0.864 (SE) | 2-6       |
| EU        | raspberry     |     8 |        0.827 (NE) |         0.840 (SE) | 1-7       |
| EU        | rose_hips     |    11 |        0.693 (NE) |         0.703 (SE) | 2-9       |
| EU        | sea_buckthorn |     7 |        0.757 (NE) |         0.758 (SE) | 3-4       |
| EU        | sloes         |    10 |        0.698 (NE) |         0.777 (SE) | 0-10      |
| EU        | strawberry    |     9 |        0.742 (NE) |         0.781 (SE) | 0-9       |
| EU        | chestnut      |     8 |        0.771 (NE) |         0.755 (SE) | 7-1       |
| EU        | hazelnut      |     9 |        0.711 (NE) |         0.730 (SE) | 0-9       |
| EU        | walnut        |     9 |        0.542 (NE) |         0.540 (SE) | 3-6       |
| EU        | daisy         |    11 |        0.687 (NE) |         0.677 (SE) | 10-1      |
| EU        | dandelion     |    10 |        0.568 (NE) |         0.551 (SE) | 6-4       |
| EU        | elderflower   |     9 |        0.805 (NE) |         0.839 (SE) | 0-9       |
| EU        | violets       |     9 |        0.871 (NE) |         0.863 (SE) | 7-2       |
| EU        | garlic        |     7 |        0.768 (NE) |         0.768 (SE) | 3-4       |
| EU        | nettle        |     8 |        0.494 (NE) |         0.464 (SE) | 6-2       |
| EU        | sorrel        |     6 |        0.588 (NE) |         0.534 (SE) | 6-0       |
| EU        | asparagus     |     6 |        0.498 (NE) |         0.555 (SE) | 0-6       |
| EU        | chickweed     |     9 |        0.711 (NE) |         0.712 (SE) | 2-7       |
| EU        | plantain      |     8 |        0.600 (NE) |         0.616 (SE) | 2-6       |
| EU        | amaranth      |     7 |        0.717 (NE) |         0.764 (SE) | 0-7       |
| EU        | masterwort    |     4 |        0.926 (NE) |         0.929 (SE) | 0-4       |
| EU        | wild-mint     |    11 |        0.623 (NE) |         0.742 (SE) | 0-11      |
| US        | blackberry    |    11 |       0.634 (USE) |        0.630 (USW) | 7-4       |
| US        | blueberry     |    11 |       0.807 (USE) |        0.809 (USW) | 4-7       |
| US        | elderberry    |    11 |       0.691 (USE) |        0.767 (USW) | 0-11      |
| US        | lingonb       |     9 |       0.913 (USE) |        0.912 (USW) | 6-3       |
| US        | pawpaw        |    11 |       0.808 (USE) |        0.808 (USW) | 5-6       |
| US        | raspberry     |    10 |       0.869 (USE) |        0.869 (USW) | 0-0       |
| US        | rose_hips     |    11 |       0.636 (USE) |        0.676 (USW) | 0-11      |
| US        | strawberry    |    10 |       0.750 (USE) |        0.762 (USW) | 3-7       |
| US        | hazelnut      |    11 |       0.656 (USE) |        0.672 (USW) | 3-8       |
| US        | walnut        |    10 |       0.599 (USE) |        0.594 (USW) | 9-1       |
| US        | daisy         |    11 |       0.631 (USE) |        0.609 (USW) | 9-2       |
| US        | dandelion     |    11 |       0.638 (USE) |        0.598 (USW) | 11-0      |
| US        | elderflower   |    11 |       0.681 (USE) |        0.697 (USW) | 3-8       |
| US        | violets       |     8 |       0.821 (USE) |        0.831 (USW) | 0-8       |
| US        | ramps         |    10 |       0.571 (USE) |        0.540 (USW) | 10-0      |
| US        | nettle        |     8 |       0.598 (USE) |        0.397 (USW) | 8-0       |
| US        | sorrel        |     7 |       0.627 (USE) |        0.608 (USW) | 6-1       |
| US        | artichoke     |     1 |       0.711 (USE) |        0.801 (USW) | 0-1       |
| US        | plantain      |    10 |       0.534 (USE) |        0.548 (USW) | 4-6       |
| US        | amaranth      |     2 |       0.692 (USE) |        0.779 (USW) | 0-2       |
| US        | wild-mint     |    11 |       0.564 (USE) |        0.692 (USW) | 0-11      |

## 3. On the map

3,000 random places per region plus every place in the state-line boxes, scored on main's weather for four days; share of places at 4+ among those inside the plant's range (range prior at least 0.5), before / after. Rows that move by 10 points or more on some day:

| Plant       | Region |    25 May |    25 Jun |     20 Aug |     12 Oct |
| ----------- | ------ | --------: | --------: | ---------: | ---------: |
| blackberry  | NE     |   0% / 5% | 98% / 15% | 100% / 89% |  95% / 93% |
| blackberry  | SE     |   0% / 5% | 95% / 78% |  98% / 95% |  94% / 75% |
| blackberry  | USW    | 69% / 69% | 77% / 77% |  62% / 72% |  89% / 61% |
| blueberry   | USW    |  0% / 36% | 77% / 79% |  72% / 86% |    0% / 0% |
| elderberry  | USW    | 84% / 42% | 94% / 59% |  95% / 91% |  99% / 97% |
| elderflower | NE     | 99% / 46% | 97% / 87% |    0% / 0% |    0% / 0% |
| elderflower | SE     | 99% / 86% | 80% / 63% |    0% / 1% |    0% / 0% |
| elderflower | USE    | 97% / 52% | 98% / 99% |    0% / 6% |    0% / 6% |
| elderflower | USW    | 99% / 60% | 94% / 92% |   0% / 10% |    0% / 1% |
| garlic      | NE     | 100% / 1% |   0% / 0% |    0% / 0% |    0% / 0% |
| garlic      | SE     |  98% / 5% |   0% / 0% |    0% / 0% |    0% / 0% |
| hazelnut    | USW    |   0% / 0% |   0% / 0% |  73% / 84% |  54% / 52% |
| nettle      | USW    | 96% / 95% | 85% / 77% |  81% / 66% |  96% / 94% |
| pawpaw      | USW    |   0% / 0% |   0% / 0% | 100% / 88% | 100% / 99% |
| rose_hips   | NE     |   0% / 0% |   0% / 2% | 100% / 66% |  98% / 95% |
| rose_hips   | SE     |   0% / 4% |  0% / 22% |  58% / 50% |  93% / 93% |
| rose_hips   | USE    |   0% / 0% |   0% / 4% |  88% / 39% |  99% / 98% |
| rose_hips   | USW    |   0% / 0% |   0% / 6% |  76% / 49% |  97% / 96% |
| violets     | USW    |  0% / 27% |   0% / 0% |    0% / 0% |    0% / 0% |

## Not in this change

- Europe's lines between North and South Europe: a band along the lists' own boundary (Dutch, Danish and Polish borders), checked as the US one.
- Recalibrating plant settings with a same-day test (the per-year test above found some that rank below chance).
- This year's weather on top of the calendar (warmth since 1 January, winter cold): it added +0.002 to +0.008 AUC for elder, the berries and strawberry, and needs a warmth-to-date sum the nightly run does not keep yet.

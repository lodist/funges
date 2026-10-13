# Mushroom temperature optima, and a place test for every hand-set change

Date: 2026-10-13

Tool: `backend/tools/fit_fruiting_parts.py` (`--optima`). Follows `2026-10-13-mushroom-weather-parts.md` (#320).

## What changes

| Mushroom            | Region | Change                                                        |
| ------------------- | ------ | ------------------------------------------------------------- |
| morel               | NE     | temperature and humidity back on (#320 had switched them off) |
| hedgehog            | SE     | temperature optimum 16 to 15 C                                |
| pacific chanterelle | USW    | temperature optimum 13 to 10 C                                |

## The place test

#320 judged its switch-offs on timing alone: a find's day against the same place 14 and 21 days either side. The test now also asks where. Each find's own day is set against up to 10 bracket-fungus finds in its region that same day at other places, which marks where people walked that day. Both are ranked on the full score: the weather parts from the training table, and altitude, pH, water, range prior x hosts x habitat and season from the production scorer at each find's own place. It runs on all training years (2016-2026) and gives a 95% CI resampling whole weeks. A change ships only where timing improves and places get no worse.

Where both can be run, it agrees with the summer 2026 test (`--spatial`, the app's stored weather, other species' finds as the comparison):

| Change                             | Summer 2026                     | Training years                  |
| ---------------------------------- | ------------------------------- | ------------------------------- |
| chicken of the woods USW, rain off | 0.544 to 0.601 [0.038, 0.075]   | 0.605 to 0.652 [0.032, 0.064]   |
| chanterelle NE, optimum +1 C       | 0.758 to 0.749 [-0.015, -0.003] | 0.668 to 0.656 [-0.014, -0.009] |

On #320's three switch-offs:

| Mushroom             | Region | Parts off             | Places before | Places after | 95% CI           |
| -------------------- | ------ | --------------------- | ------------: | -----------: | ---------------- |
| morel                | NE     | humidity, temperature |         0.673 |        0.539 | [-0.161, -0.103] |
| chicken of the woods | USW    | rain                  |         0.605 |        0.652 | [0.032, 0.064]   |
| black chanterelle    | USW    | rain, temperature     |         0.936 |        0.933 | [-0.027, 0.018]  |

Morel in North Europe timed its finds better in 10 of 11 years with rain alone, but temperature and humidity told its places from the walkers' places, so it is switched back. The other two stay.

It also says several other all-years picks would have hurt places, had they passed timing: lion's mane in US West (temperature off, places -0.17), saffron milk cap in US West (-0.13), hedgehog in US West (-0.11) and US East (-0.07).

## Temperature optima

The temperature part is a bell curve around the optimum on each of the 12 days before, weighted most 4 days back. It is rebuilt from the training table's daily ERA5 temperatures (`training_lags/`), identical to the stored part. Moves of -6 to +6 C are tried for every hand-set mushroom with temperature on, chosen and tested as the switch-offs are: each year scored with the move chosen on the other years. ERA5 reads within about 1 C of the app's stored temperature, so a move carries over.

| Mushroom            | Region | Optimum  | Held-out years better | Places before | Places after | 95% CI          |
| ------------------- | ------ | -------- | --------------------- | ------------: | -----------: | --------------- |
| hedgehog            | SE     | 16 to 15 | 8 of 10 (p 0.055)     |         0.601 |        0.612 | [0.004, 0.018]  |
| pacific chanterelle | USW    | 13 to 10 | 7 of 8 (p 0.035)      |         0.619 |        0.613 | [-0.027, 0.014] |

39 species-regions were tested. Not shipped: chanterelle in North Europe (+1 C, better in 9 of 11 years, but places worse in both tests) and morel in North Europe (-5 C, 8 of 11 years, p 0.11, places -0.05). Of the other 35, 7 keep their optimum even on all years and 28 move on all years but not out of sample. The hand-set optima are close to what the finds support; the gains that remain are small (net +0.006 for hedgehog, +0.020 for pacific chanterelle).

## On the map

4,000 random places per region on the 12 Oct weather masters, as the nightly run scores them (season curves, range prior, habitat, the blend between regions); share of in-range places (range prior at least 0.5) at 4+, before / after, and the mean score:

| Mushroom            | Region | 25 May                | 25 Jun                | 20 Aug                | 25 Sep                | 11 Oct                |
| ------------------- | ------ | --------------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| morel               | NE     | 92% / 97% (5.7 / 5.8) | 45% / 46% (2.7 / 2.7) | 0% / 0%               | 0% / 0%               | 0% / 0%               |
| hedgehog            | SE     | 0% / 0% (1.3 / 1.3)   | 61% / 55% (4.1 / 3.9) | 49% / 46% (4.1 / 3.9) | 74% / 73% (5.8 / 5.7) | 88% / 88% (6.4 / 6.5) |
| pacific chanterelle | USW    | 0% / 0%               | 1% / 1% (0.5 / 0.4)   | 0% / 0% (0.4 / 0.3)   | 16% / 14% (1.3 / 1.2) | 12% / 10% (1.1 / 1.0) |

The cooler hedgehog optimum takes summer places down and leaves autumn as it was. Pacific chanterelle's season runs into December, past the weather masters. Their neighbours across the split (hedgehog in North Europe, pacific chanterelle in US East) move by at most 0.1 points.

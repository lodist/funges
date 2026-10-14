# Ripe fruit from the photos, and ramps on its leaves

Date: 2026-10-13

Tools: `backend/tools/tag_ripeness.py` (new) and `backend/tools/fit_phenology.py`. Production is unchanged: it reads the weekly grids named in `backend/generated/phenology.json`.

## What changes

Elderberry (Europe and the US) and ramps (the US) get the learned season. Both were held back in #317. The grids are on R2 under `models/phenology/20261013-1936/`; the species already live come out identical to the byte.

## Ramps: leaves before the buds

Ramps was read as "leaves": sightings tagged with no flowers or with buds. Its buds stand on bare stalks in June, after the leaves are gone, so the learned season opened it on 25 June (20-47% of places at 4+). It now reads leaves tagged with no flowers and no buds (`leaves_unbudded`). In US East, the share of those tags against each latitude band's peak half-month:

| Ramps, leaves | Mar 16-31 | Apr 1-15 | Apr 16-30 | May 1-15 | May 16-31 | Jun 1-15 |
| ------------- | --------: | -------: | --------: | -------: | --------: | -------: |
| 36-40 N       |      1.00 |     0.25 |      0.16 |     0.04 |      0.01 |     0.00 |
| 40-44 N       |      1.00 |     0.51 |      0.36 |     0.12 |      0.03 |     0.00 |
| 44-48 N       |      0.34 |     1.00 |      0.96 |     0.56 |      0.14 |     0.01 |

Update, 14 Oct: ramps' learned season had an autumn bump where the plant is rare (Minnesota, the Dakotas, 44-49 N): the ratio to each place's own small spring peak rose to about 0.4 from late September to mid-October, on one leaf tag in October against 42 in April there, and 856 US East places read 4+ on 14 October. The band dead-month check averages the whole 4-degree band, so it stayed under its 0.5 threshold. Ramps' season may now open only within a month of its months (March-May): the export shuts January and July-December, and leaves February-June, its spring, as fitted (`MONTHS_GUARD` in `fit_phenology.py`; grids `models/phenology/20261014-0849/`, every other species identical to the byte).

## Ripe or green

iNaturalist's fruiting tag counts green fruit, and flower heads, too. Where fruit hangs green for weeks, the learned season opened that early: elderberry at 45% of places at 4+ on 25 June. `tag_ripeness.py` scores each fruiting sighting's first photo with a general CLIP model (LAION ViT-B/32), zero-shot, against "ripe black elderberries" and "green unripe elderberries", and the like for each plant. The new stage `ripe` keeps the sightings scored ripe (P at least 0.5).

On a pilot of 814 photos (up to 12 a month per plant), the mean P(ripe) by month:

| Plant      | Model   | Apr  | May  | Jun  | Jul  | Aug  | Sep  | Oct  |
| ---------- | ------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| elderberry | BioCLIP | 0.93 | 0.91 | 0.75 | 0.71 | 0.76 | 0.89 | 0.87 |
| elderberry | CLIP    | 0.04 | 0.01 | 0.35 | 0.32 | 0.83 | 0.87 | 0.74 |
| walnut     | CLIP    | 0.76 | 0.33 | 0.00 | 0.00 | 0.00 | 0.04 | 0.45 |

BioCLIP, trained for taxonomy, calls green July elderberries as ripe as September's. Contact sheets of the 16 most and the 16 least ripe per plant, checked by eye: right for the dark berries (elderberry, sloes, blueberry), the least ripe being green berries and flower heads. Wrong for the nuts and pawpaw: their ripest-looking photos are last year's empty husks, shells and seeds on winter ground, so they keep their months.

All 23,925 fruiting photos of the three berries were scored. The share called ripe, by month, in Europe:

| Plant      | Apr  | May  | Jun  | Jul  | Aug  | Sep  | Oct  | Nov  |
| ---------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| elderberry | 0.00 | 0.00 | 0.11 | 0.38 | 0.78 | 0.89 | 0.82 | 0.93 |
| sloes      | 0.00 | 0.03 | 0.28 | 0.68 | 0.86 | 0.88 | 0.87 | 0.90 |
| blueberry  | 0.04 | 0.09 | 0.34 | 0.48 | 0.51 | 0.62 | 0.70 | 0.62 |

## The tests

As in #317: the stage sightings against all plant sightings, each year scored by a season fitted on the other years (AUC), today's months against the learned season; and no dead band-month (under a tenth of the band's peak) opened.

| Plant      | Stage           | Stage sightings | Held-out years better | AUC months | AUC learned | Dead month opened         |
| ---------- | --------------- | --------------: | --------------------- | ---------: | ----------: | ------------------------- |
| elderberry | ripe            |           7,780 | 11 of 11              |      0.831 |       0.895 | none                      |
| ramps      | leaves_unbudded |           1,133 | 6 of 7 (p 0.06)       |      0.778 |       0.798 | none                      |
| sloes      | ripe            |           2,607 | 10 of 10              |      0.765 |       0.843 | none (held, below)        |
| blueberry  | ripe            |           2,885 | 11 of 11              |      0.805 |       0.848 | South Europe 40-44 N, Jun |

## Still held, and why

- Sloes: they colour in July in the south and August in the north, but are picked from September, after the first frosts. Dark is not ripe for sloes, and the learned season opened South Europe on 20 August (41% to 90% of places at 4+).
- Blueberry: it opens a dead June band in South Europe (40-44 N). US West has under 20 ripe tags in every band, so its opening on 12 October there (0% to 45%) is US East's clock.
- Hazelnut, walnut, pawpaw: the photos cannot tell this year's fruit from last year's remains.
- Sorrel: its leaves stay up all winter; unchanged.

## On the map

4,000 random places per region on the 12 Oct weather masters, as the nightly run scores them; share of in-range places (range prior at least 0.5) at 4+, months / learned season (mean score):

| Plant      | Region | 20 Apr                 | 25 May                 | 25 Jun                | 20 Aug                | 12 Oct                |
| ---------- | ------ | ---------------------- | ---------------------- | --------------------- | --------------------- | --------------------- |
| elderberry | NE     | 0% / 0%                | 0% / 0%                | 0% / 0%               | 98% / 59% (7.0 / 4.6) | 52% / 60% (3.8 / 4.5) |
| elderberry | SE     | 0% / 0%                | 0% / 0%                | 0% / 12% (1.0 / 0.9)  | 95% / 94% (6.7 / 6.4) | 57% / 29% (3.9 / 2.5) |
| elderberry | USE    | 0% / 0%                | 4% / 3% (1.4 / 0.3)    | 11% / 22% (1.6 / 1.8) | 96% / 96% (8.0 / 7.6) | 53% / 19% (4.3 / 1.7) |
| elderberry | USW    | 0% / 0%                | 67% / 0% (4.7 / 0.1)   | 79% / 11% (6.4 / 0.9) | 96% / 93% (7.7 / 7.2) | 97% / 61% (7.1 / 4.6) |
| ramps      | USE    | 100% / 55% (7.1 / 4.3) | 98% / 4% (7.4 / 0.4)   | 0% / 0%               | 0% / 0%               | 0% / 1%               |
| ramps      | USW    | 100% / 41% (6.4 / 3.0) | 100% / 19% (6.2 / 1.3) | 0% / 0%               | 0% / 9% (0.4 / 0.7)   | 0% / 5% (0.7 / 0.6)   |

The months opened all of US West's elderberry in May and June; its ripe tags start in late May in California (32-36 N) and in August from 40 N. In US East they are done by October except south of 32 N. Ramps' leaves are past by late May except north of 44 N, as the tags above.

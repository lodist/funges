# US strawberry and violets on the learned season

Date: 2026-10-13

Tool: `backend/tools/fit_phenology.py`. Production is unchanged: it reads the weekly grids named in
`backend/generated/phenology.json` (R2 `models/phenology/20261013-1413/`).

## What changes

The US gets the learned season for wild strawberry and violets, held back in #317. Europe and the
US elderflower and rose hips keep the same seasons (the refit reproduces them).

## Why they were held, and why that was wrong

In #317 both passed every test (strawberry won 11 of 11 held-out years, violets 9 of 9, no dead
month opened) but were held back on the map: on 25 June, US East strawberry fell from 92% to 48% of
in-range places at 4+, and on 25 May violets from 91% to 0%. The reading was that the learned season
shut the north too early. The tags, by latitude band in US East (share of stage tags against the
band's own peak half-month), say it does not:

| Wild strawberry, fruiting | May 1-15 | May 16-31 | Jun 1-15 | Jun 16-30 | Jul 1-15 |
| ------------------------- | -------: | --------: | -------: | --------: | -------: |
| 36-40 N                   |     0.33 |      1.00 |     0.55 |      0.21 |     0.23 |
| 40-44 N                   |     0.07 |      0.32 |     0.87 |      1.00 |     0.26 |
| 44-48 N                   |     0.03 |      0.08 |     0.48 |      1.00 |     0.53 |

| Violets, flowering | Apr 1-15 | Apr 16-30 | May 1-15 | May 16-31 |
| ------------------ | -------: | --------: | -------: | --------: |
| 40-44 N            |     1.00 |      0.30 |     0.08 |      0.00 |
| 44-48 N            |     0.61 |      1.00 |     0.44 |      0.03 |

The learned seasons follow them: strawberry is shut at 34-36 N by late June and open at 38-46 N
(factor 0.87-1.00 on 25 June); violets are open from April and shut everywhere by late May. On 25
June the map's 48% is that mix of a finished south and a ripe north; 91% of places at 4+ for violets
on 25 May was the months', not the plant's.

## Tried: measuring against everyone out, not just plant sightings

Plant sightings tagged with a stage do swell in late spring against all iNaturalist observations
(US East, 32-44 N: about 1.2 per 1,000 observations in March, 2.1-2.2 in May), so reweighting the
background to all-taxa observations per 2-degree box and month looked like the fix. It was not: US
strawberry and violets shut the same, blueberry opened more (South Europe on 25 May, 0% to 49%), and
blackberry in US East fell to 31% on 25 May; on held-out years it ranked slightly worse
(blackberry 0.818 to 0.809, daisy 0.790 to 0.762, nettle 0.665 to 0.641). Not shipped.

## On the map

Share of in-range places at 4+, live / this change (mean score):

| Plant      | Region | 20 Apr              | 25 May              | 25 Jun              | 20 Aug  | 12 Oct  |
| ---------- | ------ | ------------------- | ------------------- | ------------------- | ------- | ------- |
| strawberry | USE    | 51% / 3% (3.5/0.7)  | 97% / 65% (7.5/5.2) | 92% / 48% (7.0/4.1) | 0% / 0% | 0% / 3% |
| strawberry | USW    | 24% / 7% (3.2/0.6)  | 96% / 51% (6.5/4.0) | 78% / 55% (5.8/4.3) | 0% / 8% | 0% / 2% |
| violets    | USE    | 79% / 59% (7.6/5.0) | 91% / 0% (8.9/0.0)  | 0% / 0%             | 0% / 0% | 0% / 0% |
| violets    | USW    | 67% / 39% (5.5/2.9) | 17% / 0% (2.3/0.0)  | 0% / 0%             | 0% / 0% | 0% / 1% |

Blueberry stays held: it opens unripe places the sightings do not reach (South Europe's mountains on
25 May, 0% to 40%).

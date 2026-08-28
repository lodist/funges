# Observer-background geography audit

Period: **2026-06-01 through 2026-08-27**. Scores use the replayed resilient scorer.
GBIF data were retrieved on **2026-08-28**; the latest matched target event is
**2026-08-24**, so the final days are incomplete because of reporting lag.

## Direct subregional check

| Area                     | Sampled fungal-observer cell-days | Porcini background median | Porcini finds | Porcini finding median | Chanterelle background median | Chanterelle finds | Chanterelle finding median |
| ------------------------ | --------------------------------: | ------------------------: | ------------: | ---------------------: | ----------------------------: | ----------------: | -------------------------: |
| Southern Finland (<65°N) |                               780 |                      6.29 |            29 |                   7.51 |                          7.96 |                84 |                       8.27 |
| Northern Finland (≥65°N) |                               117 |                      5.53 |             2 |                   7.74 |                          7.27 |                 1 |                       7.27 |
| Southern Spain (<40°N)   |                                39 |                      1.23 |             0 |                      — |                          0.91 |                 0 |                          — |
| Central Spain (40–42°N)  |                               151 |                      1.68 |             6 |                   3.72 |                          1.12 |                 2 |                       1.27 |
| Northern Spain (≥42°N)   |                               339 |                      6.11 |             3 |                   4.83 |                          4.82 |                 3 |                       3.60 |
| Portugal                 |                               162 |                      2.71 |             2 |                   5.05 |                          2.50 |                 1 |                       1.91 |

The former “Spain” row was not a country cohort: it used an Iberian bounding rectangle
that also admitted Portuguese observations. This replacement uses GBIF country codes and
then divides Spain into explicit latitude bands.

There are **14** Spanish Porcini/Chanterelle cell-days and
**3** Portuguese cell-days in this cohort. Spanish findings span
**40.06–43.32°N**: **0** are south of 40°N, **8** are between
40–42°N, and **6** are at or north of 42°N. Counts remain presence-only and
must not be read as prevalence.

The map does express a strong Spanish north–south gradient: northern-Spain background
medians are **6.11**
for Porcini and **4.82**
for Chanterelle, versus **1.23**
and **0.91** in the south.
That part of the original visual observation is supported.

It does not follow that Spanish locations are ranked well. Against same-day fungal-observer
cells inside Spain, mean presence-background percentiles are
**0.241** for Porcini (day-bootstrap
95% CI **0.166–0.338**) and
**0.553** for Chanterelle (CI
**0.370–0.828**; random = 0.500). Porcini therefore
ranks poorly inside Spain; Chanterelle is inconclusive overall, with only five findings
on four days and three northern findings carrying the stronger northern result.

Extending the endpoint from 12 to 27 August adds no Spanish Porcini or Chanterelle event
dates: the latest are **2026-07-15** and
**2026-06-27**. It still matters for the continental cohort,
but it does not change the Spanish geographic conclusion.

Background medians show whether the map distinguishes the bands. Finding medians show
what it assigned at actual occurrence cells. The same-day within-country percentile is
the more direct statistic for whether it ranks locations inside Spain.

## Method

- GBIF `HUMAN_OBSERVATION`, `PRESENT`, coordinate-bearing records from 2026.
- Coordinate uncertainty above 20 km was excluded and observations were deduplicated to
  20 km cell-days.
- Country membership comes from GBIF `countryCode`, not rectangular country proxies.
- Scores are the resilient scorer replayed from retained production weather history.
- Each finding’s within-country percentile compares it with same-day cells where any
  fungus was reported in that country, weighted for the continental background sampling.
- Confidence intervals resample observation days, preserving same-day clusters. Spanish
  control samples are sparse, so the within-country result is diagnostic rather than a
  definitive country-specific validation.
- Recent GBIF dates are subject to reporting lag; the retrieval timestamp is retained in
  `geography-summary.json`.

# Fung.es model evaluation, 2026

Status: **current evidence summary**, generated from the committed QA artifacts in this directory.

## Executive result

The model has demonstrated useful skill at its intended broad foraging-map scale. It does
two important jobs:

1. It identifies the active part of the year. After the season gate was added, median
   season-discrimination AUC rose from **0.707** to **0.923**
   across 17 testable region-species combinations. Dead-season cell-days
   above the user-facing score threshold fell from **40.8%** to
   **9.1%**, while in-season coverage stayed at
   **56.5%**.
2. It ranks useful macro-regions. Against same-day cells where people reported any fungus,
   the current resilient scorer reaches **0.640** AUC over
   1,029 Porcini, Chanterelle, and
   Parasol cell-days (day-bootstrap 95% CI
   **0.622–0.658**).
   Random ranking is 0.500.

That supports broad continental ranking, but raw finding counts are not the evidence:
GBIF is presence-only and observation effort differs sharply between countries. The
country-coded audit confirms that the map scores northern Spain substantially above
southern Spain. Its within-Spain ranking is still weak for Porcini and near neutral for
Chanterelle. The model therefore has macro signal without demonstrated stand-level
habitat ranking or reliable day-to-day fruiting forecasts.

| Question                                         | Cohort and control                      |                                              Result | Interpretation                                    |
| ------------------------------------------------ | --------------------------------------- | --------------------------------------------------: | ------------------------------------------------- |
| Is the season active?                            | Same locations, fruiting vs dead months |                                       AUC **0.923** | Strong operational timing after the gate          |
| Does the calendar help on an observation day?    | Same location, nearby control days      |                    season **0.634**, full **0.632** | The season term carries real timing information   |
| Does short-term weather pick the day?            | Same location, nearby control days      |                                  **0.515**, n=1,035 | Near-neutral overall; not yet demonstrated        |
| Does the map rank European macro-regions?        | Same-day fungal-observer background     |                             **0.640** (0.622–0.658) | Useful broad geographic signal                    |
| Does it rank cells within the same climate zone? | Uniform same-day zone background        |                                           **0.556** | Positive but modest fine-scale signal             |
| Which spatial side currently carries signal?     | Same-day cross-location decomposition   | weather **0.597**, static **0.514**, full **0.599** | Static habitat is the clearest improvement target |

## Seasonal timing: the repaired model

The long historical season report in `seasonal-timing/` diagnosed the model before it
could turn a species off. That diagnosis led to the season gate and should not be read as
the current verdict.

On the same retained April-August grid, the current gate produced:

- median season AUC **0.923**, with 1 of
  17 tests below random;
- **9.1%** median dead-season false positives at score >=4, down from
  **40.8%**;
- unchanged **56.5%** in-season coverage;
- median onset error **+15 days** and median absolute error
  **17.5 days** over 12 uncensored onsets.

This is the right headline: seasonal timing works at monthly resolution. The next known
timing limitation is the interpolation of monthly curves, which smears sharp boundaries.

## Macro-region behavior

The observer-background assessment controls the largest presence-only bias by comparing
target finds with other fungal-observer cells on the same day. This cohort runs
**2026-06-01 through 2026-08-27**. The resilient change is small in northern Europe and materially
improves southern Europe:

| Region | Target cell-days | Previous AUC | Current AUC | Change | 95% CI for change |
| ------ | ---------------: | -----------: | ----------: | -----: | ----------------: |
| NE     |              918 |        0.654 |       0.648 | -0.006 |  -0.015 to +0.003 |
| SE     |              111 |        0.493 |       0.577 | +0.084 |  +0.050 to +0.119 |

The direct geography check now uses GBIF country codes rather than the former rectangular
“Spain” proxy, which also included Portugal. Spain is split into explicit latitude bands:

| Area                     | Sampled fungal-observer cell-days | Porcini background median | Porcini finds | Porcini finding median | Chanterelle background median | Chanterelle finds | Chanterelle finding median |
| ------------------------ | --------------------------------: | ------------------------: | ------------: | ---------------------: | ----------------------------: | ----------------: | -------------------------: |
| Southern Finland (<65°N) |                               780 |                      6.29 |            29 |                   7.51 |                          7.96 |                84 |                       8.27 |
| Northern Finland (≥65°N) |                               117 |                      5.53 |             2 |                   7.74 |                          7.27 |                 1 |                       7.27 |
| Southern Spain (<40°N)   |                                39 |                      1.23 |             0 |                      — |                          0.91 |                 0 |                          — |
| Central Spain (40–42°N)  |                               151 |                      1.68 |             6 |                   3.72 |                          1.12 |                 2 |                       1.27 |
| Northern Spain (≥42°N)   |                               339 |                      6.11 |             3 |                   4.83 |                          4.82 |                 3 |                       3.60 |
| Portugal                 |                               162 |                      2.71 |             2 |                   5.05 |                          2.50 |                 1 |                       1.91 |

The north-south Spanish gradient is real in the scores: northern background medians are
**6.11** for Porcini and
**4.82** for Chanterelle, versus
**1.23** and
**0.91** in southern Spain. All
14 Spanish Porcini/Chanterelle target cell-days occur above 40°N; none are in southern
Spain.

That does not mean local Spanish ranking works. Against same-day fungal-observer cells
inside Spain, the mean percentiles are **0.241**
for Porcini (day-bootstrap 95% CI **0.166–0.338**)
and **0.553** for Chanterelle (CI
**0.370–0.828**; random = 0.500). The model captures
the broad gradient but misses several central and northern Porcini locations. The five
Spanish Chanterelle findings are too sparse for a firm local verdict. Extending through
27 August adds no Spanish target event after 15 July, so it strengthens the continental
cohort without changing this conclusion.

The cohort was retrieved on **2026-08-28**. Its latest matched target event is
**2026-08-24**, so 25–27 August should be treated as incomplete due to GBIF
reporting lag rather than as observed zero-find days.

## Why the other AUC is lower

The within-zone report gives **0.556**
(0.536-0.576) for the three
adequately sampled fungi. It deliberately removes season and broad climate-zone geography.
It asks whether the model selects the best local cell after those advantages are taken
away. It is therefore a stricter habitat-resolution test, not a contradictory verdict on
the whole map.

The decomposition says the same thing. Across 936 spatial cases, the weather
side ranks at **0.597**, while the existing altitude/pH/water static side
is **0.514**. Northern-Europe static AUC is especially weak for Porcini and
Chanterelle. This is why tree-genus composition and distributional terrain features are
the next model work.

The new candidate runner establishes the current frozen baseline before those features
are added. It recomputes the current scorer over 543,434 cached NE/SE weather rows and
reports deterministic two-degree spatial folds:

| Region | Species     | Static AUC | Weather AUC | Full AUC | Full AUC across folds |
| ------ | ----------- | ---------: | ----------: | -------: | --------------------: |
| NE     | Porcini     |      0.427 |       0.599 |    0.631 |           0.556-0.714 |
| NE     | Chanterelle |      0.419 |       0.605 |    0.578 |           0.493-0.633 |
| SE     | Porcini     |      0.444 |       0.713 |    0.723 |           0.590-0.828 |
| SE     | Chanterelle |      0.417 |       0.624 |    0.668 |           0.546-0.770 |

The fold range is diagnostic rather than a confidence interval. Candidate selection will
use four folds and reserve one untouched fold for the promotion decision.

## Evidence boundaries

- The season curves and the GBIF climatology share a data source. The gate's operational
  separation is measured, but curve shape is not a fully independent scientific test.
- Presence-background AUC is not presence/absence AUC. Same-day fungal-observer controls
  reduce observer-effort bias but cannot remove it completely.
- The retained score window ends before the main autumn season for several fungi.
- Short-term weather timing is near neutral in the case-crossover test; it should be
  described as unproven rather than absent.
- Fine-scale static habitat discrimination is weak in northern Europe and is the active
  improvement target.

## Artifact guide

- [`seasonal-timing/`](seasonal-timing/) - current gate simulation, weather attribution,
  historical pre-gate diagnosis, and sampled grid data.
- [`seasonal-ground-truth/`](seasonal-ground-truth/) - retained GBIF seasonal counts and
  observations.
- [`spatial-observer-background/`](spatial-observer-background/) - the primary macro-region
  operational QA with same-day human fungal-observer controls.
- [`spatial-grid-background/`](spatial-grid-background/) - stricter same-day, within-zone
  ranking assessment.
- [`resilient-score-ablation/`](resilient-score-ablation/) - paired old/current scorer
  comparison on identical weather and observations.
- [`climatology/`](climatology/) - compact monthly score archive for future held-out seasons.
- [`candidate-baseline.json`](candidate-baseline.json) - current recomputed baseline and
  spatial-fold results for parameter/static-feature experiments.

## Reproduction

```bash
python scripts/qa_model_report.py
python -m pytest tests/test_qa_season_metrics.py tests/test_season_gate.py tests/test_qa_candidate_spatial.py
```

Candidate parameters and new static components are evaluated with
`scripts/qa_candidate_spatial.py`; see [`CANDIDATES.md`](CANDIDATES.md) for its frozen-fold
workflow.

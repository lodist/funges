# Continental GBIF observer-background QA

Period: **2026-06-01 through 2026-08-12**.

## Verdict

The model has a useful broad geographic/seasonal signal for the three adequately sampled summer fungi. Across 740 deduplicated target cell-days, their observation-weighted score percentile against same-day European fungal-observer cells is **0.616** (random = 0.500).

| Species                    | Target cell-days | Mean percentile | 95% day-bootstrap CI | Median score | Score ≥4 |
| -------------------------- | ---------------: | --------------: | -------------------: | -----------: | -------: |
| Porcini / Boletus          |              213 |           0.591 |          0.552–0.628 |         6.19 |    91.5% |
| Chanterelle / Cantharellus |              461 |           0.623 |          0.597–0.647 |         6.18 |    94.8% |
| Parasol Mushroom           |               66 |           0.651 |          0.560–0.726 |         5.49 |    92.4% |
| Morel                      |               27 |           0.592 |          0.470–0.765 |         4.77 |    81.5% |
| St. George's Mushroom      |               71 |           0.449 |          0.388–0.516 |         5.13 |    91.5% |
| Black Chanterelle          |                2 |           0.726 |         insufficient |         3.99 |    50.0% |

Morel and Black Chanterelle are too sparse for a decision. St. George's does not rank findings above the observer background in this period.

## Direct geography check

These figures describe model scores at 20 km fungal-observer cell-days, followed by target findings in the same broad areas.

| Area             | Background cell-days | Porcini median | Porcini findings | Chanterelle median | Chanterelle findings | Parasol median | Parasol findings |
| ---------------- | -------------------: | -------------: | ---------------: | -----------------: | -------------------: | -------------: | ---------------: |
| Southern Finland |                  742 |           5.26 |                8 |               6.01 |                   64 |           4.75 |                3 |
| Northern Finland |                  422 |           4.77 |                6 |               5.87 |                    2 |           0.00 |                0 |
| Spain            |                  598 |           2.89 |               10 |               2.30 |                    6 |           2.68 |                0 |

The model correctly expresses the broad ordering **southern Finland > northern Finland > Spain**, especially for chanterelles and parasols. However, the ten Spanish porcini and six Spanish chanterelle cell-days are genuine human observations after coordinate-quality filtering. Their median scores at the findings were only **1.43** and **2.62**, respectively. Most occurred in June. The model therefore misses real early-summer Spanish fruiting events; “Spain is low” is directionally reasonable but over-generalized.

## Method

- GBIF `HUMAN_OBSERVATION`, `PRESENT`, coordinate-bearing records from 2026 only.
- Records with a stated coordinate uncertainty above 20 km were excluded.
- Occurrences were deduplicated into 20 km cell-days, reflecting the approximate weather/grid resolution.
- R2 scores were taken from the exact observation date; points farther than 30 km from production coverage were excluded.
- Observer-effort background consisted of cells where any fungus was reported on that date across northern and southern Europe.
- Each target score was converted to its weighted percentile among those same-day observer-background cells. This preserves continental seasonality and geography instead of conditioning them away.

This is still presence/background validation, not true presence/absence validation. GBIF reporting is incomplete—especially for August—and the production empirical fungal season curves were themselves built from 2020–2026 GBIF monthly ratios, so this is an operational QA rather than a clean held-out scientific validation.

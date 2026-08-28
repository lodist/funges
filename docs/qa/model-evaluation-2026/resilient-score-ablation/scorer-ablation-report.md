# Resilient scorer observer-background ablation

Period: **2026-06-01 through 2026-08-27**.

## Verdict

Across the primary Porcini, Chanterelle, and Parasol cohort, the resilient scorer changes
the same-day European fungal-observer AUC from **0.636** to
**0.640** (+0.004). This is a small
overall ranking improvement (paired day-bootstrap 95% CI for the change
**-0.005 to
+0.013**), with the material gain concentrated in
southern Europe.

| Region | Target cell-days | Previous AUC | Current AUC | Change | 95% CI for change |
| ------ | ---------------: | -----------: | ----------: | -----: | ----------------: |
| NE     |              918 |        0.654 |       0.648 | -0.006 |  -0.015 to +0.003 |
| SE     |              111 |        0.493 |       0.577 | +0.084 |  +0.050 to +0.119 |

## Species results

| Species                    |   n | Old AUC | New AUC | Change | Old median | New median | Old ≥4 | New ≥4 |
| -------------------------- | --: | ------: | ------: | -----: | ---------: | ---------: | -----: | -----: |
| Porcini / Boletus          | 335 |   0.619 |   0.632 | +0.013 |       6.29 |       7.03 |  93.1% |  97.6% |
| Black Chanterelle          |  20 |   0.758 |   0.739 | -0.019 |       4.72 |       5.75 |  90.0% | 100.0% |
| Parasol Mushroom           |  88 |   0.678 |   0.687 | +0.009 |       5.60 |       6.25 |  94.3% |  97.7% |
| Morel                      |  29 |   0.601 |   0.709 | +0.108 |       4.71 |       3.88 |  79.3% |  37.9% |
| St. George's Mushroom      |  72 |   0.449 |   0.432 | -0.017 |       5.10 |       3.91 |  91.7% |  45.8% |
| Chanterelle / Cantharellus | 606 |   0.640 |   0.638 | -0.002 |       6.29 |       7.27 |  95.0% |  92.7% |

Scores and threshold hit rates rise more than ranking quality. That should not be read as
an equally large discrimination gain: the background threshold rates also move. AUC is
the primary comparison here.

The former rectangular “Spain” subsection has been replaced by the country-coded
[observer-background geography audit](../spatial-observer-background/macro-region-report.md).
That audit separates southern, central, and northern Spain and reports same-day
within-country ranks.

## Method

- The exact target and fungal-observer controls from the observer-background cohort are
  retained.
- The current resilient algorithm is replayed from production weather history at those
  same location-days, including spatial smoothing.
- Old and new percentiles therefore use identical observations and same-day controls.
- This remains presence-background QA, not presence/absence validation.

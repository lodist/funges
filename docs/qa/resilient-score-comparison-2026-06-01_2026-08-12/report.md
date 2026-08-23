# Resilient-score paired GBIF QA

Period: **2026-06-01 to 2026-08-12**

## Verdict

The branch is **better in southern Europe and roughly neutral overall**. It is not a
continental ranking breakthrough: the primary observation/background AUC rises from
**0.616 to 0.621** (delta **+0.005**, day-bootstrap 95% CI **-0.007 to +0.017**).

The important regional result is clearer:

| Region          | Target cell-days | Old AUC | New AUC |      Delta | 95% day-bootstrap CI |
| --------------- | ---------------: | ------: | ------: | ---------: | -------------------: |
| Northern Europe |              655 |   0.635 |   0.630 |     -0.005 |     -0.017 to +0.007 |
| Southern Europe |               85 |   0.470 |   0.554 | **+0.084** | **+0.048 to +0.127** |

The southern correction is real in this cohort; the small northern regression is not
statistically distinguishable from noise.

## Primary in-season fungi

| Species           |   n | Old AUC | New AUC |  Delta | Old median | New median | Old score >=4 | New score >=4 |
| ----------------- | --: | ------: | ------: | -----: | ---------: | ---------: | ------------: | ------------: |
| Porcini / Boletus | 213 |   0.591 |   0.598 | +0.007 |       6.19 |       6.44 |         91.5% |         95.8% |
| Parasol           |  66 |   0.651 |   0.659 | +0.008 |       5.49 |       5.72 |         92.4% |         97.0% |
| Chanterelle       | 461 |   0.623 |   0.626 | +0.004 |       6.18 |       6.66 |         94.8% |         99.3% |

Scores rise more than ranking quality. Threshold hit rates therefore look much better,
but that should not be mistaken for an equally large gain in discrimination.

## Spain and the dry June failures

For southern-European June records:

| Species     |   n | Old AUC |   New AUC | Old median | New median |
| ----------- | --: | ------: | --------: | ---------: | ---------: |
| Porcini     |  43 |   0.511 | **0.618** |       6.12 |       6.43 |
| Chanterelle |  16 |   0.201 | **0.346** |       4.05 |       5.00 |

The Litago observations that originally exposed the rain veto improve substantially:
porcini rises from **0.02-0.93** to **3.01-3.21**, and the chanterelle record rises from
**0.23 to 2.78**. Their background percentile remains very low, however, so those exact
records are still not well explained by the weather signal. The change fixes the
absurd near-zero output without pretending those observations are now fully predicted.

## Other signals

- Morel improves from AUC **0.592 to 0.740**, but only 27 records are available and June
  is outside the core morel window in much of the region.
- St. George's mushroom slips from **0.449 to 0.439**. These June-July records are outside
  its intended spring window, so this is not used in the primary verdict.
- Black chanterelle has only two records and cannot support a conclusion.

## Method

The replay used the stored R2 weather for the exact production locations, with 42 prior
days reconstructed for every evaluated cell-day. Each requested point's five nearest
production neighbours were included so branch spatial smoothing used real grid scores.
Old and new scores were evaluated against the same **840 GBIF target cell-days** and
**11,134 human fungal-observer background cell-days**, using identical observation
weights and dates. This is a paired presence-background diagnostic, not a true
presence/absence AUC.

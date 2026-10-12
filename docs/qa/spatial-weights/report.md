# Spatial test: does the score pick a species' places out of the places people search?

`scripts/qa_spatial_weights.py`, 11 October 2026. The timing tests of #291 compare a find day with the same place on other days, so the static parts (pH, altitude, range, season by place) cancel there. This test compares places instead: each 2026 summer find (14 June – 11 September, held out of the range prior) against up to 10 bracket-fungus finds in the same region within ±3 days, which mark where people were walking that week. Everything is the app's own stored weather and static data, scored by `forecast_pipeline` with today's models (linear fits and GBMs included). 0.5 = no better than the searched places. A run against other species' finds as the comparison (`spatial_result_all_species.csv`) gives the same picture.

## Findings

1. **The score already separates the places well for soil fungi:** mean 0.70 over 26 species-regions. Best: rocky king 0.99, smooth chanterelle 0.94, eastern king 0.92, matsutake 0.88, black chanterelle North Europe 0.80, pine bolete 0.78, parasol North Europe 0.77.
2. **The weather part does most of it:** 0.63–0.91 on its own for most soil fungi; pH, altitude and range each add a little.
3. **Today's weights are close to the best:** weights fitted on the other weeks (conditional logit on the parts' logs, pulled toward today's) gain +0.00 to +0.05 on held-out weeks, all in one direction (more weight on the weather part, less on pH in North Europe). Simple variants without fitting: no pH 0.696, no season-by-place 0.702, today 0.700.
4. **pH is regional:** it helps in South Europe (giant puffball 0.667 vs 0.611 without it, shaggy mane 0.618 vs 0.584, parasol 0.638 vs 0.613) and costs a little in North Europe (porcini 0.671 vs 0.682, parasol 0.767 vs 0.792, summer bolete 0.764 vs 0.790).
5. **Where the score cannot tell the places apart:** chicken-of-the-woods (0.33–0.61), oyster (0.48–0.65), lion's mane (0.41), porcini and shaggy mane in US West (0.45, 0.36). Fitted weights there come out negative or absurd: reweighting cannot fix them, because no part of the score describes where they grow (dead wood, park and street trees).

## Decision

No weight change on one summer's data: the gain is small and could be noise. Re-run on 2027 finds before changing pH by region. The larger lever is a habitat part for the wood-decay species.

`spatial_result_*.csv`: per species-region, each part's skill, today's against fitted weights on held-out weeks.

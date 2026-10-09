# Fitted fruiting response vs today's model (Europe, first pass)

Step 3 of #291, 9 October 2026. `backend/tools/fit_fruiting.py` on the training table from `build_training_table.py`, built from ERA5 blocks downloaded so far.

- **Coverage:** 75% of all sightings. The US areas are still downloading, so this is Europe only.
- **Training:** 2016–2024, 276,960 sighting-days.
- **Test:** 2025–2026, 62,709, never seen by the fit.

## Method

- **Model:** a conditional logit on each sighting's own day against the same point 14 and 21 days either side.
- **Features:** rain over 0, 1–3, 4–7, 8–14, 15–28 and 29–42 days back (log scale), days since ≥5 mm, mean temperature and its square, cold snap (Tmin drop), frost days, humidity over 1–7 and 8–21 days, and sunshine.
- **Regions:** each species is fitted on all its regions, then each region is pulled toward that shared fit by a penalty.
- **Score:** the rank of the sighting day among its control days, minus the same index's rank of bracket-fungi days (the outing placebo). 0 means no timing skill.
- **Today's model** is scored on exactly the same days, with ERA5 weather.

A bracket-fitted outing model was also tried as a fixed offset. It cost skill (chanterelle +0.124 → +0.106, shaggy mane +0.082 → +0.046), so it is only reported, not used. The score's placebo subtraction already removes outing effects.

## Results, all regions, 2025–2026

| Species | Test cases | Today's model | Fitted (95% CI) |
| --- | ---: | ---: | --- |
| bronze_bolete | 122 | +0.243 | **+0.320** (+0.270 to +0.368) |
| summer_bolete | 1,123 | +0.186 | **+0.268** (+0.250 to +0.290) |
| parasol | 3,046 | +0.142 | **+0.192** (+0.179 to +0.205) |
| mushroom | 4,081 | +0.100 | **+0.187** (+0.174 to +0.199) |
| st_george | 1,115 | +0.134 | **+0.162** (+0.141 to +0.181) |
| pine_bolete | 415 | +0.102 | **+0.154** (+0.121 to +0.186) |
| giant_puffball | 1,628 | +0.061 | **+0.143** (+0.123 to +0.162) |
| saffron_milk_cap | 1,977 | +0.090 | **+0.136** (+0.122 to +0.153) |
| black_chant | 646 | +0.077 | **+0.133** (+0.110 to +0.156) |
| matsutake | 149 | +0.123 | **+0.130** (+0.074 to +0.190) |
| chant | 3,322 | +0.119 | **+0.121** (+0.108 to +0.137) |
| winter_chant | 1,370 | +0.096 | **+0.098** (+0.081 to +0.117) |
| morel | 1,118 | +0.040 | **+0.096** (+0.077 to +0.114) |
| shaggy_mane | 12,630 | +0.118 | **+0.084** (+0.073 to +0.093) |
| chicken-of-the-woods | 13,119 | +0.042 | **+0.053** (+0.044 to +0.062) |
| hedgehog_mushroom | 1,764 | +0.052 | **+0.047** (+0.031 to +0.062) |
| oyster-mushroom | 4,617 | +0.005 | **+0.036** (+0.024 to +0.049) |

Per region and for 2025 alone, see `fruiting_report_eu_2026-10-09.json`.

Some species' hand-set parameters were tuned on 2026 sightings, so 2025 is the fairer year for those. In 2025, porcini in North Europe goes from +0.017 (today) to +0.176 (fitted).

**Worse than today:**
- shaggy mane in North Europe;
- chicken of the woods and morel in South Europe;
- hedgehog and winter chanterelle in South Europe, slightly.

Step 4 ships the fit only where it wins.

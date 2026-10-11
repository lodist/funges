# Fruiting GBM vs the model in use

#291, after the linear fit (#300). `backend/tools/fit_fruiting_gbm.py`; what ships is in `backend/generated/fruiting_gbm.json` and `fruiting_gbm/<species>.txt.gz`.

## Method

- **Model:** LightGBM trained on the exact conditional likelihood of each case-crossover stratum (a find day and the same place 14 and 21 days either side): a custom objective, gradient p − y, hessian p(1 − p). Like the linear fit it only learns what separates a find day from its own place's other days; unlike it, it finds optima and interactions. One model per species, pooled over regions, region as a categorical feature.
- **Features (111):** the linear fit's 13 window features; daily rain d0–42 (log1p), mean and minimum temperature d1–14, humidity d1–21; the find cell's 2016–2025 ERA5 normals for the month (rain, temperature, humidity; `era5_normals_{EU,US}.npz`), its latitude and the find's day of year; region. Normals, latitude and day of year are the same on every day of a stratum, so they only shape how the weather counts. In the nightly scoring they are the run's date, on every day scored.
- **Tuning:** inside each held-out year, the number of rounds is chosen by early stopping on 15% of the other years' strata (learning rate 0.05, at most 2,000 rounds, 15 leaves).
- **Inputs:** stored WeatherAPI humidity, temperature and minimum temperature are put on ERA5's level per region (mean/SD matched, July–September 2026) before the GBM reads them; each species-region's score keeps today's scale through one quantile map per calendar month, as for the linear fit.

## What ships

A species-region ships when the GBM beats the model in use (the linear fit where it ships, else today's) in more held-out years than chance (sign test p < 0.1, at least 6 years). **10 species-regions ship.** Chicken-of-the-woods in US West passed (8 of 10 years, +0.017 → +0.046) but is held back, as it was from the linear fit: tiny skill either way.

| Species | Region | Model in use | Years won | p | In use (mean) | GBM (mean) |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| mushroom | NE | linear fit | 9 of 11 | 0.033 | +0.114 | **+0.162** |
| parasol | NE | hand-set | 9 of 11 | 0.033 | +0.069 | **+0.131** |
| pine_bolete | NE | linear fit | 11 of 11 | 0.001 | +0.107 | **+0.160** |
| shaggy_mane | NE | hand-set | 10 of 11 | 0.006 | +0.080 | **+0.136** |
| st_george | NE | hand-set | 9 of 11 | 0.033 | +0.120 | **+0.171** |
| summer_bolete | NE | linear fit | 11 of 11 | 0.001 | +0.173 | **+0.218** |
| parasol | SE | linear fit | 10 of 11 | 0.006 | +0.164 | **+0.194** |
| saffron_milk_cap | SE | linear fit | 9 of 11 | 0.033 | +0.103 | **+0.143** |
| summer_bolete | SE | hand-set | 10 of 11 | 0.006 | +0.156 | **+0.221** |
| hen_of_the_woods | USE | hand-set | 8 of 9 | 0.019 | +0.048 | **+0.160** |

Every other species-region keeps its current model. Mean over all 522 species-region-years: GBM +0.107, linear fit +0.092, today's +0.059.

## Summer 2026 on the app's own stored weather

`scripts/qa_fruiting_gbm.py`: 14 June – 11 September 2026 finds, strata rebuilt as in training, production code and the exported models (St George is a spring species: no summer finds).

| Region | Species | Finds | Today | Linear | GBM |
| --- | --- | ---: | ---: | ---: | ---: |
| NE | mushroom | 442 | +0.181 | +0.057 | **+0.200** |
| NE | parasol | 189 | +0.216 | +0.216 | **+0.192** |
| NE | pine_bolete | 93 | +0.144 | +0.077 | **+0.239** |
| NE | shaggy_mane | 281 | +0.123 | +0.123 | **+0.134** |
| NE | summer_bolete | 113 | +0.132 | +0.189 | **+0.221** |
| SE | parasol | 228 | +0.157 | +0.206 | **+0.292** |
| SE | saffron_milk_cap | 31 | +0.061 | +0.072 | **+0.279** |
| SE | summer_bolete | 105 | +0.177 | +0.177 | **+0.236** |
| USE | hen_of_the_woods | 59 | -0.112 | -0.112 | **+0.243** |

GBM above the linear fit in 8 of 9 and above today's in 8 of 9; North Europe parasol is the exception (+0.192 against +0.216).

## What changes on the map

Share of map points scoring 4+, the model in use vs the GBM, two weeks of stored weather, 1,500 random map points per region; "near finds" = points in a 0.25° cell with a find since 2016.

| Species | Region | All, 9–15 Sep | All, 30 Sep–6 Oct | Near finds, 9–15 Sep | Near finds, 30 Sep–6 Oct |
| --- | --- | ---: | ---: | ---: | ---: |
| hen_of_the_woods | USE | +27 | -10 | +3 | -1 |
| mushroom | NE | -1 | -8 | +0 | -6 |
| parasol | NE | +2 | +4 | +0 | +0 |
| parasol | SE | +4 | +8 | +0 | +8 |
| pine_bolete | NE | +0 | -4 | +0 | -2 |
| saffron_milk_cap | SE | +4 | +7 | +3 | +11 |
| shaggy_mane | NE | +1 | +0 | +1 | +0 |
| st_george | NE | +0 | +0 | +0 | +0 |
| summer_bolete | NE | -6 | -6 | -2 | +4 |
| summer_bolete | SE | +5 | +0 | +5 | +1 |

Mean change near finds: +1.2 points; all points +1.4.

Per-year results: `gbm_loyo.csv`; the gate: `gbm_gate.csv`.

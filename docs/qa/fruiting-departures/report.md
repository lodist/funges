# Humidity and temperature relative to each place's normal

The linear fruiting fits read humidity and temperature as departures from each place's own normal for the time of year. `backend/forecast_pipeline.py` (`fruiting_relative`), `backend/tools/fit_fruiting.py`, 12 October 2026.

## Why

Run on ERA5 for the wet autumn of 2024, the porcini fit for South Europe gave the central Apennines a peak of about 7.5 (Abruzzo, Marche, Umbria) and the Alps about 9. The fit learns only from days at one place: each find day against the same place 14 and 21 days either side. It never compares places. But it read absolute humidity and temperature, so a drier or warmer climate lowered every day there. Nothing tested that level: the timing tests compare days within a place, the scale maps one month across the whole region.

## How

- **Features:** humidity over days 1–7 and 8–21 and temperature over days 1–7 become departures from the place's ERA5 normal (2016–2025, `era5_normals`), taken on each window's middle day. Normals are blended between the months either side, so they never jump at a month's turn. The temperature optimum's term is taken against the normal's own. Rain, dry days, frost and the drop in night temperature stay as they were.
- **Coefficients unchanged:** within one comparison (a place, three weeks either side) the place's normal is the same for every day. Absolute values and departures therefore give the very same fit. Only the level between places changes, so the monthly scale maps are rebuilt on the new index.
- **Tried and dropped:** refitting on departures from each day's own seasonal normal. That removes the seasonal drift within the three weeks either side, which the fit uses for timing, and two shipped models fell under the shipping rule (black chanterelle North Europe 8/10 → 7/10 years, chanterelle South Europe 9/11 → 8/11).
- **Off the normals grid** (the Canaries and North Africa south of 33° N): humidity and temperature count as average, the rule for any input a row lacks.
- **The GBM** (10 species-regions) is unchanged: it reads the normals as inputs of its own.

## Results

The 18 species-regions on the linear fit (the 10 on the GBM are unchanged). Habitat factor on in both spatial runs, as it ships.

- **Each year held out, 2016–2026:** identical for every species-region, by construction. The same 23 species-regions ship with the same coefficients; chicken-of-the-woods US West stays held back.
- **Timing on the app's stored weather, summer 2026** (find day against the same place 14 and 21 days either side, net of bracket fungi; `scripts/qa_weather_skill.py`): mean **0.101 → 0.095** over 16 species-regions. Each day is read against its own seasonal normal, so part of the seasonal drift within those three weeks is taken out.
- **Spatial, summer 2026** (each find against the places other fungi were found that week, 0.5 = no better; `scripts/qa_spatial_weights.py`): mean **0.717 → 0.704** over 14 species-regions, better in 4. Read as absolute values, a wetter, cooler climate also said where these species are found more often. Departures leave that to the range prior and the habitat factor. This is the same choice as the habitat factor's 10th-percentile reference: possibility of growth, not frequency.
- **Map, 12 October forward window** (4,000 random locations per region): share of places at 4+ **+2.4 points** (median). Scores before and after correlate at 0.96–0.99 in North Europe and US East, and at 0.61–0.88 in South Europe and US West, where climates differ most.

| Species | Region | Spatial finds | Spatial now | Spatial departures | Timing finds | Timing now | Timing departures | 4+ now | 4+ departures |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| black_chant | NE | 37 | 0.750 | 0.825 | 37 | +0.109 | +0.101 | 49% | 52% |
| black_chant | USE | 176 | 0.827 | 0.824 | 176 | +0.114 | +0.141 | 47% | 50% |
| chant | SE | 126 | 0.721 | 0.736 | 126 | +0.132 | +0.094 | 44% | 53% |
| giant_puffball | NE | 142 | 0.797 | 0.793 | 142 | +0.086 | +0.110 | 58% | 62% |
| giant_puffball | SE | 108 | 0.718 | 0.720 | 108 | +0.154 | +0.144 | 42% | 49% |
| giant_puffball | USW | – | – | – | 403 | +0.132 | +0.134 | 68% | 76% |
| lions_mane | USE | 52 | 0.613 | 0.528 | 51 | -0.038 | -0.082 | 75% | 82% |
| matsutake | NE | – | – | – | 30 | +0.067 | +0.029 | 4% | 3% |
| morel | USE | – | – | – | – | – | – | 0% | 0% |
| mushroom | SE | 263 | 0.726 | 0.699 | 263 | +0.204 | +0.213 | 59% | 59% |
| oyster-mushroom | NE | 341 | 0.616 | 0.613 | 341 | +0.012 | +0.008 | 81% | 83% |
| oyster-mushroom | SE | 87 | 0.571 | 0.541 | 87 | +0.021 | +0.027 | 88% | 82% |
| oyster-mushroom | USE | 1405 | 0.739 | 0.737 | 1405 | +0.071 | +0.075 | 81% | 82% |
| saffron_milk_cap | NE | 209 | 0.758 | 0.768 | 209 | +0.097 | +0.069 | 66% | 70% |
| shaggy_mane | SE | 105 | 0.692 | 0.642 | 105 | +0.202 | +0.211 | 97% | 97% |
| shaggy_mane | USE | – | – | – | – | – | – | 77% | 92% |
| shaggy_mane | USW | 46 | 0.652 | 0.610 | 440 | +0.129 | +0.143 | 71% | 66% |
| smooth_chant | USE | 38 | 0.854 | 0.821 | 38 | +0.127 | +0.108 | 3% | 2% |

### Porcini, South Europe, Italy (ERA5 2024–2025, the 2026 backcast)

Peak regional average (best 10% of places):

| Region | 2024 now | 2024 departures | 2025 now | 2025 departures | 2026 now | 2026 departures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Trentino-Alto Adige | 8.8 (9.3) | 8.9 (9.3) | 9.1 (9.6) | 9.2 (9.5) | 9.0 (9.4) | 9.1 (9.4) |
| Lombardia | 8.4 (9.5) | 8.9 (9.4) | 9.0 (9.8) | 9.2 (9.6) | 8.1 (9.3) | 8.6 (9.3) |
| Toscana | 8.1 (8.6) | 8.9 (9.2) | 8.9 (9.4) | 9.4 (9.6) | 6.6 (7.4) | 7.5 (8.9) |
| Umbria | 7.5 (7.9) | 8.4 (8.8) | 8.1 (8.6) | 8.9 (9.3) | 6.1 (7.0) | 6.7 (7.2) |
| Marche | 7.5 (7.9) | 8.2 (8.6) | 7.2 (7.9) | 8.3 (8.8) | 6.0 (7.0) | 6.5 (7.1) |
| Abruzzo | 7.6 (8.3) | 8.1 (8.5) | 7.4 (8.2) | 8.1 (8.5) | 6.0 (6.8) | 6.2 (6.8) |
| Lazio | 7.9 (8.3) | 8.6 (8.9) | 8.1 (8.6) | 9.1 (9.4) | 6.0 (6.6) | 7.1 (8.7) |
| Campania | 7.7 (8.1) | 8.5 (8.8) | 7.7 (8.2) | 8.8 (9.1) | 5.4 (6.0) | 5.9 (6.8) |

In a normal autumn the central Apennines now sit about 0.6 below the Alps instead of 1.3. What remains is limestone soil pH (about 0.5 in Abruzzo) and the season curve at the end of September. 2026 stays low there: August and September brought a third of the normal rain, and the departures say so.

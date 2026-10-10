# Fitted fruiting response vs today's model

Steps 3 and 4 of #291, 10 October 2026. `backend/tools/fit_fruiting.py` on the training table from `build_training_table.py`; what ships is in `backend/generated/fruiting_fit.json`.

- **Coverage:** ERA5 for 5,091 of 5,091 areas with sightings, Europe and the US.
- **Sighting-days:** 438,818 from 2016-2026; 350,388 up to 2024 and 88,430 in 2025-2026.

## Method

- **Model:** a conditional logit on each sighting's own day against the same point 14 and 21 days either side.
- **Features:** rain over 0, 1–3, 4–7, 8–14, 15–28 and 29–42 days back (log scale), days since ≥5 mm, mean temperature and its square, cold snap (Tmin drop), frost days, and humidity over 1–7 and 8–21 days. Sunshine is left out: the app has stored it only since 8 October 2026, so its gap to ERA5 can't be measured yet, and leaving it out cost the fit nothing (each year held out: -0.002 on average over 56 species-regions).
- **Regions:** each species is fitted on all its regions, then each region is pulled toward that shared fit by a penalty.
- **Score:** the rank of the sighting day among its control days, minus the same index's rank of bracket-fungi days (the outing placebo). 0 means no timing skill.
- **Today's model** is scored on exactly the same days, with ERA5 weather.

A bracket-fitted outing model held fixed as an offset was tried and cost skill, so it is only reported. The score's placebo subtraction already removes outing effects.

## What ships

A species-region ships when its fit beats today's model in more held-out years than chance (sign test p < 0.1, at least 6 years). Each year is scored by a fit on all the other years; a single test period is not enough (porcini in North Europe won 9 of 11 years but lost 2026). What ships is then refitted on every year. **23 species-regions ship**; every other species and region keeps today's hand-set weather part. Chicken-of-the-woods in US West passed the rule but is held back on review: little skill on either side (+0.050 against +0.017, about zero in summer 2026) for 20–36 points fewer 4+ places in September and October.

| Species | Region | Years won | p | Today (mean) | Fitted (mean) |
| --- | --- | ---: | ---: | ---: | ---: |
| black_chant | NE | 8 of 10 | 0.055 | +0.046 | **+0.056** |
| black_chant | USE | 9 of 9 | 0.002 | +0.006 | **+0.183** |
| chant | SE | 9 of 11 | 0.033 | +0.078 | **+0.098** |
| giant_puffball | NE | 9 of 11 | 0.033 | +0.026 | **+0.080** |
| giant_puffball | SE | 8 of 9 | 0.019 | +0.052 | **+0.121** |
| giant_puffball | USW | 7 of 7 | 0.008 | +0.074 | **+0.102** |
| lions_mane | USE | 10 of 11 | 0.006 | +0.021 | **+0.060** |
| matsutake | NE | 8 of 9 | 0.019 | +0.051 | **+0.082** |
| morel | USE | 8 of 10 | 0.055 | +0.082 | **+0.138** |
| mushroom | NE | 9 of 11 | 0.033 | +0.058 | **+0.114** |
| mushroom | SE | 9 of 11 | 0.033 | +0.099 | **+0.144** |
| oyster-mushroom | NE | 10 of 11 | 0.006 | -0.011 | **+0.014** |
| oyster-mushroom | SE | 11 of 11 | 0.001 | +0.006 | **+0.047** |
| oyster-mushroom | USE | 11 of 11 | 0.001 | -0.002 | **+0.062** |
| parasol | SE | 11 of 11 | 0.001 | +0.106 | **+0.164** |
| pine_bolete | NE | 10 of 11 | 0.006 | +0.052 | **+0.107** |
| saffron_milk_cap | NE | 9 of 11 | 0.033 | +0.055 | **+0.076** |
| saffron_milk_cap | SE | 10 of 11 | 0.006 | +0.060 | **+0.103** |
| shaggy_mane | SE | 10 of 11 | 0.006 | +0.061 | **+0.127** |
| shaggy_mane | USE | 11 of 11 | 0.001 | +0.088 | **+0.196** |
| shaggy_mane | USW | 8 of 10 | 0.055 | +0.051 | **+0.092** |
| smooth_chant | USE | 6 of 6 | 0.016 | +0.090 | **+0.135** |
| summer_bolete | NE | 11 of 11 | 0.001 | +0.082 | **+0.173** |

## Keeping the score's scale

The fitted index replaces the hand-set weather part only through a map that pairs their quantiles, so a score keeps its range and its 4+ threshold and only its order changes. Two things keep that map honest:

- **One map per calendar month,** built at up to 100 of the species' places over every third day of 2016–2026; a day blends the two months either side of it. The fit only compares a day with the same place 2–3 weeks either side, so it says nothing about how one season compares with another. A single map for the whole year moved early October's share of 4+ scores by up to 45 points.
- **Stored humidity put on ERA5's level.** The fit learned on ERA5; the app's stored WeatherAPI humidity reads lower, most on dry days. From 1 July to 30 September 2026, at 1,500 map points per region:

| Region | ERA5 humidity from stored | At 50% | At 80% |
| --- | --- | ---: | ---: |
| North Europe | 13.5 + 0.861 × stored | +6.5 | +2.3 |
| South Europe | 11.9 + 0.890 × stored | +6.4 | +3.2 |
| US East | 8.0 + 0.945 × stored | +5.3 | +3.6 |
| US West | 7.0 + 0.974 × stored | +5.7 | +4.9 |

Days stored before the current forecast fetch started (14 June 2026) read differently and are left out.

### What changes on the map

Share of map points scoring 4+, today's model vs the fitted one, in two weeks of the app's stored weather (1,500 random map points per region). "Near finds" is the points in a 0.25° cell where the species was found since 2016. Per month the two models agree on average at those places by construction; in any one week they can disagree, and that is the change people will see. Morel is out of season (0% in both).

| Species | Region | All points, 9–15 Sep | All points, 30 Sep–6 Oct | Near finds, 9–15 Sep | Near finds, 30 Sep–6 Oct |
| --- | --- | ---: | ---: | ---: | ---: |
| black_chant | NE | 100% → 100% (+0) | 99% → 100% (+1) | 100% → 100% (+0) | 100% → 100% (-0) |
| black_chant | USE | 46% → 71% (+25) | 71% → 79% (+8) | 67% → 82% (+15) | 86% → 92% (+6) |
| chant | SE | 60% → 63% (+2) | 61% → 40% (-21) | 90% → 90% (+0) | 80% → 56% (-25) |
| giant_puffball | NE | 99% → 100% (+1) | 96% → 100% (+4) | 100% → 100% (+0) | 100% → 100% (+0) |
| giant_puffball | SE | 70% → 89% (+19) | 76% → 74% (-2) | 94% → 99% (+5) | 93% → 90% (-3) |
| giant_puffball | USW | 68% → 60% (-8) | 87% → 90% (+3) | 70% → 63% (-8) | 76% → 87% (+12) |
| lions_mane | USE | 63% → 54% (-8) | 91% → 86% (-6) | 70% → 62% (-8) | 97% → 91% (-6) |
| matsutake | NE | 100% → 96% (-4) | 100% → 100% (+0) | 100% → 100% (+0) | 100% → 100% (+0) |
| mushroom | NE | 97% → 100% (+3) | 90% → 97% (+7) | 99% → 100% (+1) | 95% → 98% (+3) |
| mushroom | SE | 69% → 73% (+4) | 77% → 76% (-1) | 95% → 98% (+3) | 94% → 91% (-3) |
| oyster-mushroom | NE | 100% → 100% (-0) | 100% → 100% (+0) | 100% → 100% (-0) | 100% → 100% (+0) |
| oyster-mushroom | SE | 65% → 70% (+5) | 75% → 81% (+7) | 77% → 79% (+2) | 81% → 88% (+6) |
| oyster-mushroom | USE | 76% → 95% (+20) | 89% → 99% (+11) | 85% → 99% (+13) | 93% → 99% (+6) |
| parasol | SE | 69% → 76% (+7) | 81% → 88% (+6) | 84% → 87% (+4) | 88% → 91% (+2) |
| pine_bolete | NE | 100% → 100% (+0) | 99% → 100% (+1) | 100% → 100% (+0) | 99% → 100% (+1) |
| saffron_milk_cap | NE | 100% → 100% (+0) | 100% → 100% (+0) | 100% → 100% (+0) | 100% → 100% (+0) |
| saffron_milk_cap | SE | 65% → 65% (-1) | 81% → 85% (+4) | 78% → 78% (+0) | 84% → 87% (+3) |
| shaggy_mane | SE | 66% → 72% (+6) | 83% → 92% (+9) | 82% → 84% (+3) | 89% → 97% (+8) |
| shaggy_mane | USE | 61% → 61% (-0) | 90% → 83% (-7) | 88% → 84% (-3) | 95% → 93% (-2) |
| shaggy_mane | USW | 46% → 37% (-8) | 81% → 78% (-3) | 61% → 53% (-8) | 79% → 82% (+2) |
| smooth_chant | USE | 84% → 95% (+11) | 72% → 86% (+14) | 85% → 99% (+14) | 80% → 91% (+11) |
| summer_bolete | NE | 73% → 94% (+21) | 47% → 68% (+21) | 97% → 98% (+1) | 88% → 72% (-17) |

Mean change, all points: +3.5 points (typical size 6.6); near finds: +0.9 (typical size 4.6).

## Summer 2026 with the app's stored weather

14 June – 11 September 2026, the same rank test on the weather the app actually had (`scripts/qa_weather_skill.py --fruiting`). Shipped species-regions only; under 20 sightings is not testable.

| Species | Region | Sightings | Today | Fitted (95% CI) | Verdict |
| --- | --- | ---: | ---: | --- | --- |
| black_chant | NE | 37 | +0.115 | **+0.109** (+0.010 to +0.205) | about equal |
| black_chant | USE | 176 | -0.014 | **+0.114** (+0.061 to +0.165) | better |
| chant | SE | 126 | +0.025 | **+0.132** (+0.068 to +0.192) | better |
| giant_puffball | NE | 142 | +0.118 | **+0.086** (+0.023 to +0.148) | about equal |
| giant_puffball | SE | 108 | +0.101 | **+0.154** (+0.082 to +0.230) | about equal |
| giant_puffball | USW | 19 | | | not testable |
| lions_mane | USE | 51 | +0.006 | **-0.038** (-0.141 to +0.068) | about equal |
| matsutake | NE | 30 | +0.180 | **+0.067** (-0.078 to +0.202) | about equal |
| morel | USE | 1 | | | not testable |
| mushroom | NE | 442 | +0.181 | **+0.057** (+0.014 to +0.099) | worse |
| mushroom | SE | 263 | +0.189 | **+0.204** (+0.152 to +0.254) | about equal |
| oyster-mushroom | NE | 341 | -0.032 | **+0.012** (-0.029 to +0.053) | better |
| oyster-mushroom | SE | 87 | -0.060 | **+0.021** (-0.049 to +0.091) | better |
| oyster-mushroom | USE | 1405 | -0.073 | **+0.071** (+0.029 to +0.115) | better |
| parasol | SE | 228 | +0.157 | **+0.206** (+0.155 to +0.256) | about equal |
| pine_bolete | NE | 93 | +0.144 | **+0.077** (+0.004 to +0.150) | about equal |
| saffron_milk_cap | NE | 209 | +0.097 | **+0.097** (+0.050 to +0.144) | about equal |
| saffron_milk_cap | SE | 31 | +0.061 | **+0.072** (-0.047 to +0.193) | about equal |
| shaggy_mane | SE | 105 | +0.104 | **+0.202** (+0.139 to +0.263) | better |
| shaggy_mane | USE | 8 | | | not testable |
| shaggy_mane | USW | 46 | +0.105 | **+0.043** (-0.060 to +0.146) | about equal |
| smooth_chant | USE | 38 | +0.035 | **+0.127** (+0.025 to +0.232) | about equal |
| summer_bolete | NE | 113 | +0.132 | **+0.189** (+0.124 to +0.251) | about equal |

6 better, 13 about equal, 1 worse. Some hand-set parameters were tuned on 2026 sightings, which favours today's model here: today's porcini scores 2026 at +0.175 in North Europe against at most +0.106 in 2016–2025.

## Held out: 2025–2026, from a fit on 2016–2024

**Verdict rule:** "better" or "worse" means the fitted model's 95% interval lies wholly above or below today's score.

All regions: 13 species better, 8 about equal, 2 worse.

| Species | Test cases | Today's model | Fitted (95% CI) | Verdict |
| --- | ---: | ---: | --- | --- |
| bronze_bolete | 123 | +0.245 | **+0.319** (+0.263 to +0.372) | better |
| summer_bolete | 1,124 | +0.186 | **+0.272** (+0.253 to +0.291) | better |
| eastern_king | 174 | +0.264 | **+0.230** (+0.181 to +0.278) | about equal |
| smooth_chant | 82 | +0.129 | **+0.208** (+0.140 to +0.273) | better |
| parasol | 3,058 | +0.142 | **+0.190** (+0.178 to +0.204) | better |
| mushroom | 4,628 | +0.092 | **+0.172** (+0.161 to +0.184) | better |
| pine_bolete | 419 | +0.104 | **+0.149** (+0.113 to +0.185) | better |
| black_chant | 1,123 | +0.035 | **+0.147** (+0.126 to +0.168) | better |
| st_george | 1,115 | +0.134 | **+0.146** (+0.126 to +0.165) | about equal |
| giant_puffball | 2,480 | +0.072 | **+0.138** (+0.122 to +0.152) | better |
| saffron_milk_cap | 2,123 | +0.087 | **+0.130** (+0.117 to +0.144) | better |
| chant | 3,326 | +0.119 | **+0.124** (+0.111 to +0.137) | about equal |
| rocky_king | 95 | +0.118 | **+0.120** (+0.040 to +0.188) | about equal |
| matsutake | 159 | +0.133 | **+0.115** (+0.066 to +0.171) | about equal |
| shaggy_mane | 14,525 | +0.105 | **+0.089** (+0.080 to +0.097) | worse |
| winter_chant | 1,701 | +0.078 | **+0.086** (+0.070 to +0.101) | about equal |
| morel | 2,984 | +0.036 | **+0.084** (+0.071 to +0.097) | better |
| lions_mane | 894 | +0.039 | **+0.074** (+0.050 to +0.101) | better |
| pacific_chant | 336 | +0.054 | **+0.071** (+0.029 to +0.111) | about equal |
| chicken-of-the-woods | 20,236 | +0.045 | **+0.055** (+0.048 to +0.062) | better |
| oyster-mushroom | 10,363 | -0.008 | **+0.055** (+0.046 to +0.064) | better |
| hedgehog_mushroom | 1,912 | +0.043 | **+0.039** (+0.023 to +0.055) | about equal |
| hen_of_the_woods | 742 | +0.048 | **+0.021** (-0.005 to +0.047) | worse |

Per region. "Unseen" is a fit that never saw that region: the transfer test for thinly covered regions.

| Species | Region | Test cases | Today | Fitted | Unseen | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| black_chant | NE | 349 | +0.084 | +0.101 | +0.072 | about equal |
| black_chant | SE | 298 | +0.080 | +0.178 | +0.164 | better |
| black_chant | USE | 422 | -0.039 | +0.160 | +0.101 | better |
| black_chant | USW | 54 | +0.018 | +0.164 | +0.177 | better |
| bronze_bolete | SE | 123 | +0.245 | +0.319 | n/a | better |
| chant | NE | 2,777 | +0.090 | +0.096 | +0.100 | about equal |
| chant | SE | 549 | +0.165 | +0.175 | +0.169 | about equal |
| chicken-of-the-woods | NE | 7,662 | +0.014 | +0.040 | +0.021 | better |
| chicken-of-the-woods | SE | 5,474 | +0.086 | +0.065 | +0.061 | worse |
| chicken-of-the-woods | USE | 5,075 | +0.057 | +0.057 | +0.035 | about equal |
| chicken-of-the-woods | USW | 2,025 | +0.042 | +0.063 | +0.043 | about equal |
| eastern_king | USE | 174 | +0.264 | +0.230 | n/a | about equal |
| giant_puffball | NE | 1,202 | +0.023 | +0.114 | +0.108 | better |
| giant_puffball | SE | 426 | +0.136 | +0.232 | +0.224 | better |
| giant_puffball | USE | 672 | +0.085 | +0.109 | +0.078 | about equal |
| giant_puffball | USW | 180 | +0.098 | +0.139 | +0.150 | about equal |
| hedgehog_mushroom | NE | 1,497 | +0.019 | +0.018 | +0.014 | about equal |
| hedgehog_mushroom | SE | 286 | +0.092 | +0.089 | +0.092 | about equal |
| hedgehog_mushroom | USE | 50 | -0.049 | -0.010 | -0.036 | about equal |
| hedgehog_mushroom | USW | 79 | -0.047 | +0.053 | +0.046 | better |
| hen_of_the_woods | USE | 742 | +0.048 | +0.021 | -0.141 | worse |
| lions_mane | USE | 589 | +0.041 | +0.084 | -0.018 | better |
| lions_mane | USW | 305 | +0.030 | +0.056 | +0.045 | about equal |
| matsutake | NE | 159 | +0.133 | +0.115 | n/a | about equal |
| morel | NE | 686 | -0.025 | +0.086 | +0.097 | better |
| morel | SE | 439 | +0.144 | +0.114 | +0.109 | about equal |
| morel | USE | 1,171 | -0.003 | +0.074 | -0.036 | better |
| morel | USW | 688 | +0.084 | +0.065 | +0.071 | about equal |
| mushroom | NE | 2,643 | +0.058 | +0.164 | +0.165 | better |
| mushroom | SE | 1,451 | +0.172 | +0.234 | +0.248 | better |
| mushroom | USE | 101 | +0.118 | +0.116 | +0.054 | about equal |
| mushroom | USW | 433 | +0.050 | +0.081 | +0.083 | about equal |
| oyster-mushroom | NE | 3,018 | -0.014 | +0.008 | +0.003 | better |
| oyster-mushroom | SE | 1,611 | +0.033 | +0.092 | +0.070 | better |
| oyster-mushroom | USE | 5,085 | -0.042 | +0.056 | +0.039 | better |
| oyster-mushroom | USW | 649 | +0.031 | +0.053 | +0.070 | about equal |
| pacific_chant | USW | 336 | +0.054 | +0.071 | n/a | about equal |
| parasol | NE | 1,535 | +0.126 | +0.143 | +0.153 | about equal |
| parasol | SE | 1,523 | +0.174 | +0.251 | +0.242 | better |
| pine_bolete | NE | 368 | +0.075 | +0.137 | n/a | better |
| pine_bolete | SE | 51 | +0.148 | +0.168 | +0.128 | about equal |
| rocky_king | USW | 95 | +0.118 | +0.120 | n/a | about equal |
| saffron_milk_cap | NE | 1,322 | +0.074 | +0.107 | +0.059 | better |
| saffron_milk_cap | SE | 675 | +0.110 | +0.185 | +0.182 | better |
| saffron_milk_cap | USW | 126 | +0.050 | +0.058 | +0.069 | about equal |
| shaggy_mane | NE | 9,818 | +0.104 | +0.058 | +0.091 | worse |
| shaggy_mane | SE | 2,929 | +0.103 | +0.154 | +0.166 | better |
| shaggy_mane | USE | 743 | +0.036 | +0.202 | +0.154 | better |
| shaggy_mane | USW | 1,035 | +0.033 | +0.086 | +0.031 | better |
| smooth_chant | USE | 82 | +0.129 | +0.208 | n/a | better |
| st_george | NE | 769 | +0.099 | +0.117 | +0.116 | about equal |
| st_george | SE | 346 | +0.199 | +0.197 | +0.184 | about equal |
| summer_bolete | NE | 592 | +0.140 | +0.234 | +0.225 | better |
| summer_bolete | SE | 532 | +0.249 | +0.321 | +0.311 | better |
| winter_chant | NE | 1,090 | +0.074 | +0.071 | +0.064 | about equal |
| winter_chant | SE | 280 | +0.129 | +0.130 | +0.141 | about equal |
| winter_chant | USE | 51 | -0.079 | -0.017 | -0.079 | about equal |
| winter_chant | USW | 280 | +0.031 | +0.077 | +0.020 | about equal |

2025 alone, the confidence intervals per region and every year of the leave-one-year-out test are in `fruiting_report.json`.

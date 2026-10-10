# Fitted fruiting response vs today's model

Step 3 of #291, 10 October 2026. `backend/tools/fit_fruiting.py` on the training table from `build_training_table.py`.

- **Coverage:** ERA5 for 4,766 of 5,091 areas with sightings, Europe and the US.
- **Training:** 2016–2024, 350,143 sighting-days.
- **Test:** 2025–2026, 88,353 sighting-days, never seen by the fit.

## Method

- **Model:** a conditional logit on each sighting's own day against the same point 14 and 21 days either side.
- **Features:** rain over 0, 1–3, 4–7, 8–14, 15–28 and 29–42 days back (log scale), days since ≥5 mm, mean temperature and its square, cold snap (Tmin drop), frost days, humidity over 1–7 and 8–21 days, and sunshine.
- **Regions:** each species is fitted on all its regions, then each region is pulled toward that shared fit by a penalty.
- **Score:** the rank of the sighting day among its control days, minus the same index's rank of bracket-fungi days (the outing placebo). 0 means no timing skill.
- **Today's model** is scored on exactly the same days, with ERA5 weather.

A bracket-fitted outing model held fixed as an offset was tried and cost skill, so it is only reported. The score's placebo subtraction already removes outing effects.

**Verdict rule:** "better" or "worse" means the fitted model's 95% interval lies wholly above or below today's score.

## All regions, 2025–2026

13 species better, 8 about equal, 2 worse.

| Species | Test cases | Today's model | Fitted (95% CI) | Verdict |
| --- | ---: | ---: | --- | --- |
| bronze_bolete | 123 | +0.245 | **+0.322** (+0.265 to +0.372) | better |
| summer_bolete | 1,124 | +0.186 | **+0.268** (+0.248 to +0.288) | better |
| eastern_king | 174 | +0.264 | **+0.229** (+0.178 to +0.273) | about equal |
| smooth_chant | 80 | +0.135 | **+0.203** (+0.131 to +0.272) | about equal |
| parasol | 3,058 | +0.142 | **+0.191** (+0.179 to +0.205) | better |
| mushroom | 4,626 | +0.092 | **+0.169** (+0.158 to +0.180) | better |
| st_george | 1,115 | +0.134 | **+0.161** (+0.142 to +0.179) | better |
| pine_bolete | 419 | +0.104 | **+0.148** (+0.113 to +0.182) | better |
| black_chant | 1,122 | +0.035 | **+0.147** (+0.127 to +0.165) | better |
| giant_puffball | 2,476 | +0.071 | **+0.135** (+0.121 to +0.151) | better |
| rocky_king | 95 | +0.118 | **+0.134** (+0.067 to +0.194) | about equal |
| saffron_milk_cap | 2,122 | +0.087 | **+0.132** (+0.116 to +0.146) | better |
| chant | 3,326 | +0.119 | **+0.121** (+0.108 to +0.133) | about equal |
| matsutake | 159 | +0.133 | **+0.107** (+0.053 to +0.159) | about equal |
| shaggy_mane | 14,501 | +0.106 | **+0.088** (+0.079 to +0.095) | worse |
| winter_chant | 1,701 | +0.078 | **+0.088** (+0.071 to +0.103) | about equal |
| morel | 2,980 | +0.036 | **+0.084** (+0.071 to +0.096) | better |
| lions_mane | 886 | +0.040 | **+0.082** (+0.056 to +0.109) | better |
| pacific_chant | 335 | +0.055 | **+0.081** (+0.042 to +0.125) | about equal |
| chicken-of-the-woods | 20,230 | +0.045 | **+0.057** (+0.050 to +0.065) | better |
| oyster-mushroom | 10,351 | -0.009 | **+0.052** (+0.044 to +0.061) | better |
| hedgehog_mushroom | 1,912 | +0.043 | **+0.041** (+0.023 to +0.055) | about equal |
| hen_of_the_woods | 742 | +0.048 | **+0.013** (-0.015 to +0.039) | worse |

## Per region

"Unseen" is a fit that never saw that region: the transfer test for thinly covered regions.

| Species | Region | Test cases | Today | Fitted | Unseen | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| black_chant | NE | 349 | +0.084 | +0.097 | +0.071 | about equal |
| black_chant | SE | 298 | +0.080 | +0.179 | +0.159 | better |
| black_chant | USE | 421 | -0.039 | +0.159 | +0.098 | better |
| black_chant | USW | 54 | +0.018 | +0.162 | +0.178 | better |
| bronze_bolete | SE | 123 | +0.245 | +0.322 | +nan | better |
| chant | NE | 2,777 | +0.090 | +0.092 | +0.100 | about equal |
| chant | SE | 549 | +0.165 | +0.176 | +0.169 | about equal |
| chicken-of-the-woods | NE | 7,662 | +0.013 | +0.039 | +0.021 | better |
| chicken-of-the-woods | SE | 5,474 | +0.086 | +0.074 | +0.061 | about equal |
| chicken-of-the-woods | USE | 5,073 | +0.057 | +0.058 | +0.035 | about equal |
| chicken-of-the-woods | USW | 2,021 | +0.042 | +0.059 | +0.036 | about equal |
| eastern_king | USE | 174 | +0.264 | +0.229 | +nan | about equal |
| giant_puffball | NE | 1,202 | +0.023 | +0.110 | +0.108 | better |
| giant_puffball | SE | 426 | +0.136 | +0.224 | +0.223 | better |
| giant_puffball | USE | 672 | +0.085 | +0.111 | +0.063 | about equal |
| giant_puffball | USW | 176 | +0.093 | +0.132 | +0.151 | about equal |
| hedgehog_mushroom | NE | 1,497 | +0.019 | +0.022 | +0.016 | about equal |
| hedgehog_mushroom | SE | 286 | +0.092 | +0.074 | +0.095 | about equal |
| hedgehog_mushroom | USE | 50 | -0.049 | -0.003 | -0.032 | about equal |
| hedgehog_mushroom | USW | 79 | -0.047 | +0.076 | +0.036 | better |
| hen_of_the_woods | USE | 742 | +0.048 | +0.013 | -0.128 | worse |
| lions_mane | USE | 585 | +0.041 | +0.086 | +0.016 | better |
| lions_mane | USW | 301 | +0.032 | +0.077 | +0.050 | better |
| matsutake | NE | 159 | +0.133 | +0.107 | +nan | about equal |
| morel | NE | 686 | -0.025 | +0.085 | +0.098 | better |
| morel | SE | 439 | +0.144 | +0.116 | +0.117 | about equal |
| morel | USE | 1,170 | -0.003 | +0.069 | -0.034 | better |
| morel | USW | 685 | +0.083 | +0.071 | +0.070 | about equal |
| mushroom | NE | 2,643 | +0.058 | +0.162 | +0.161 | better |
| mushroom | SE | 1,451 | +0.172 | +0.232 | +0.243 | better |
| mushroom | USE | 101 | +0.118 | +0.115 | +0.028 | about equal |
| mushroom | USW | 431 | +0.049 | +0.067 | +0.069 | about equal |
| oyster-mushroom | NE | 3,018 | -0.014 | +0.009 | -0.002 | better |
| oyster-mushroom | SE | 1,611 | +0.033 | +0.078 | +0.064 | better |
| oyster-mushroom | USE | 5,081 | -0.042 | +0.058 | +0.037 | better |
| oyster-mushroom | USW | 641 | +0.029 | +0.047 | +0.064 | about equal |
| pacific_chant | USW | 335 | +0.055 | +0.081 | +nan | about equal |
| parasol | NE | 1,535 | +0.126 | +0.143 | +0.151 | better |
| parasol | SE | 1,523 | +0.174 | +0.254 | +0.242 | better |
| pine_bolete | NE | 368 | +0.075 | +0.138 | +nan | better |
| pine_bolete | SE | 51 | +0.149 | +0.156 | +0.123 | about equal |
| rocky_king | USW | 95 | +0.118 | +0.134 | +nan | about equal |
| saffron_milk_cap | NE | 1,322 | +0.074 | +0.107 | +0.059 | better |
| saffron_milk_cap | SE | 674 | +0.110 | +0.185 | +0.184 | better |
| saffron_milk_cap | USW | 126 | +0.050 | +0.075 | +0.068 | about equal |
| shaggy_mane | NE | 9,816 | +0.104 | +0.057 | +0.088 | worse |
| shaggy_mane | SE | 2,925 | +0.103 | +0.150 | +0.167 | better |
| shaggy_mane | USE | 739 | +0.035 | +0.202 | +0.156 | better |
| shaggy_mane | USW | 1,021 | +0.034 | +0.096 | +0.030 | better |
| smooth_chant | USE | 80 | +0.135 | +0.203 | +nan | about equal |
| st_george | NE | 769 | +0.099 | +0.135 | +0.124 | better |
| st_george | SE | 346 | +0.199 | +0.205 | +0.190 | about equal |
| summer_bolete | NE | 592 | +0.139 | +0.229 | +0.220 | better |
| summer_bolete | SE | 532 | +0.249 | +0.320 | +0.314 | better |
| winter_chant | NE | 1,090 | +0.074 | +0.077 | +0.069 | about equal |
| winter_chant | SE | 280 | +0.129 | +0.123 | +0.146 | about equal |
| winter_chant | USE | 51 | -0.078 | -0.009 | -0.068 | about equal |
| winter_chant | USW | 280 | +0.031 | +0.077 | +0.033 | about equal |

2025 alone and the confidence intervals per region are in `fruiting_report.json`. Some species' hand-set parameters were tuned on 2026 sightings, so 2025 is the fairer year for those.

Step 4 ships the fit per species and region only where it is better.

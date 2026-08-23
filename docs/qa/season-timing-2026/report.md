# Season-timing QA: does the model know _when_, not just _where_?

Period: **2026-04-12 to 2026-08-20** (the full span of score history retained in R2).
Target: **production scores** (`main`), with a separate replay comparing `main` against
PR #171 on identical weather.

## Why this QA exists

The two QA runs already in the repo both compare a target observation against a
background **drawn from the same day**. That design answers _"given today, does the model
pick the right places?"_ and deliberately conditions the calendar away. Neither run can
detect an error in _when_ a species is scored highly, which is the half of the product
that decides whether a user is told to go looking in the first place.

This run adds the missing axis. Three things make it independent of the existing work:

1. **Volumes come from GBIF `count` responses, not from paginated samples.** The existing
   background sampler draws two 300-record blocks at fixed offsets on high-volume days;
   GBIF's ordering clusters by dataset, so that sample is geographically skewed exactly
   when it matters most. Counts are exact.
2. **Ground truth is effort-normalised.** Every count is divided by all fungal
   observations in the same region on the same day or month, so observer effort,
   weekends and GBIF's year-on-year growth cancel.
3. **The score is decomposed.** Production computes
   `score = weather_side × season_multiplier(date, zone)`, and the multiplier is exactly
   reproducible from the published curves. So the GBIF-derived climatology and the weather
   model can be scored separately — the weather side is the only part that cannot be
   circular.

Cohort: 6,543 fully enumerated fungal records, 3.06 M grid cell-days across four regions
(~6,000 sampled locations per region), 5,002 observation-matched cell-days.

## Verdict

**Spatially the model is real. Temporally it is close to inert, and in several
region-species combinations it is inverted.**

The season term is a multiplicative tilt of at most **1.67×** by construction, against an
observed seasonal range of **21× to 9,616×**. Because the tilt is so small, the calendar
is effectively decided by "is the weather pleasant", which coincides with the season in
some places and contradicts it in others.

Concretely: **41% of dead-month cell-days score ≥4** (median across 17 testable
region-species; worst case 78%). `MIN_SCORE = 4.0` is exactly the threshold
[generate_worth_foraging_now.py](../../../scripts/generate_worth_foraging_now.py) uses to
decide what to recommend, and
[worth-foraging-now.ts](../../../src/lib/worth-foraging-now.ts) applies **no season gate
at all** — `seasonLabel` is display text. So this is a user-facing false-positive rate,
not an abstract metric.

**Season start is not predicted.** For every species whose onset falls inside the window,
the model's median score reaches 4 _before_ fruiting begins — by 5 to 69 days.

## A. Seasonal amplitude is compressed by two to three orders of magnitude

[build_season_curves.py:190](../../../backend/tools/build_season_curves.py#L190):

```python
curve = {m: round(low + (high - low) * (ratio[m] / mx), 3) for m in range(1, 13)}
#            low=0.6, high=1.0
```

The observed effort-normalised monthly ratio is measured correctly and then linearly
rescaled into `[0.6, 1.0]`. A month with zero fruiting maps to **0.6**, not to 0. The
_shape_ survives (peak months are usually right — that part is near-circular, since the
curve is built from GBIF too) but the amplitude does not.

| Region | Species           | Observed range | Model range (in window) | Observed peak / model peak |
| ------ | ----------------- | -------------: | ----------------------: | -------------------------: |
| NE     | Porcini           |           378× |                   1.55× |                  Aug / Aug |
| NE     | Chanterelle       |           489× |                   1.59× |                  Jul / Jul |
| NE     | Black chanterelle |           173× |                   1.43× |                  Sep / Aug |
| NE     | Parasol           |           441× |                   1.41× |                  Oct / Aug |
| NE     | Morel             |     **9,616×** |                   1.42× |                  Apr / May |
| NE     | St George's       |         1,230× |                   1.57× |                  May / Apr |
| SE     | Porcini           |           125× |                   1.52× |                  Sep / Jul |
| SE     | Chanterelle       |            21× |                   1.56× |                  Jul / Jul |
| USE    | Chanterelle       |         1,128× |                   1.53× |                  Jul / Jul |
| USE    | Morel             |         3,452× |                   1.49× |                  Apr / Apr |
| USW    | Chanterelle       |            96× |                   1.56× |                  Sep / Jul |

Full-year multiplier range is 1.67× for every species in every region — the floor is hit
in all of them.

## B. In-season versus dead-month discrimination

Within-location AUC (each location compared only against itself, so no location's
baseline level can carry the result). Months are labelled from the effort-normalised
climatology: **in-season** ≥50% of peak rate, **dead** ≤10%. Only months inside the score
window are testable.

| Region | Species           | Full score | Weather only | Median in-season | Median dead | ≥4 in-season | **≥4 dead** |
| ------ | ----------------- | ---------: | -----------: | ---------------: | ----------: | -----------: | ----------: |
| NE     | Chanterelle       |      0.869 |        0.695 |             6.38 |        2.38 |          86% |         26% |
| NE     | Porcini           |      0.795 |        0.590 |             5.55 |        3.30 |          84% |     **39%** |
| NE     | Black chanterelle |      0.776 |        0.613 |             4.78 |        2.55 |          62% |         14% |
| NE     | Parasol           |      0.718 |        0.508 |             5.50 |        3.71 |          79% |     **44%** |
| NE     | St George's       |      0.707 |        0.409 |             5.25 |        4.05 |          71% |     **53%** |
| NE     | Morel             |  **0.423** |        0.254 |             3.38 |        3.83 |          34% |     **42%** |
| SE     | St George's       |      0.992 |        0.955 |             6.43 |        0.99 |          91% |          3% |
| SE     | Morel             |      0.943 |        0.820 |             4.89 |        1.23 |          73% |          7% |
| SE     | Porcini           |  **0.336** |        0.170 |             3.39 |        5.11 |          44% |     **78%** |
| SE     | Chanterelle       |  **0.329** |        0.211 |             2.68 |        4.08 |          34% |     **51%** |
| USE    | Morel             |      0.976 |        0.931 |             4.73 |        1.17 |          64% |          4% |
| USE    | Porcini           |      0.637 |        0.416 |             4.33 |        4.41 |          56% |     **54%** |
| USE    | Black chanterelle |  **0.324** |        0.135 |             3.13 |        4.10 |          27% |     **52%** |
| USE    | Chanterelle       |  **0.322** |        0.151 |             3.12 |        4.34 |          34% |     **55%** |
| USW    | Morel             |      0.962 |        0.925 |             3.77 |        0.48 |          46% |          0% |
| USW    | Porcini           |  **0.351** |        0.275 |             1.52 |        3.36 |          20% |     **41%** |
| USW    | Chanterelle       |  **0.194** |        0.131 |             0.88 |        2.84 |           4% |         27% |

Median full-score AUC **0.707**, but **7 of 17 are below random**. Weather-only median is
**0.416** — _worse than random_: on its own, the weather model cannot tell a fruiting
month from a dead one, and more often than not gets the sign wrong.

The pattern is systematic, not noise. Every strong result is a **spring** species in a
**warm** region (morel and St George's in SE/USE/USW score 0.94–0.99) and every inversion
is a **summer/autumn** species in a **warm** region (SE porcini 0.336, USE chanterelle
0.322, USW chanterelle 0.194). One mechanism explains both: Mediterranean and western-US
summers are hot and dry, the weather side collapses, and a 1.5× seasonal tilt cannot lift
it back. Spring species get the right answer for the wrong reason — they benefit from the
same summer collapse that ruins the autumn species.

Verified straight from the parquet, independently of the analysis code:

```
SE porcini, April  (observed 5% of peak):     77.6% of cell-days ≥4, median 5.11, n=115,520
SE porcini, Jul+Aug (observed 80-100% of peak): 33.5% of cell-days ≥4, median 2.45, n=310,080
```

Southern Europe rates April **more than twice as good as peak porcini season**.

Note the `season_curve_only` column, which is 1.0 almost everywhere in the raw output, is
degenerate — the multiplier is a deterministic function of the month, so it ranks months
perfectly by construction. The ordering was never the problem; the amplitude is.

## C. Season start

Onset = first sustained crossing of 15% of the peak effort-normalised rate (spike-proof:
the level must hold for most of the following week). The model's onset is the first day
the regional median score reaches 4.0 — the product's own recommendation threshold.

| Region | Species           | Observed onset | Model reaches 4.0 | Error | Share of window model says ≥4 | Season's share of year |
| ------ | ----------------- | -------------- | ----------------- | ----: | ----------------------------: | ---------------------: |
| SE     | Black chanterelle | 2026-06-23     | 2026-04-15        | −69 d |                            7% |                    17% |
| NE     | Black chanterelle | 2026-07-29     | 2026-06-07        | −52 d |                           18% |                    25% |
| USE    | Chanterelle       | 2026-05-26     | 2026-04-12        | −44 d |                           40% |                    17% |
| USE    | Black chanterelle | 2026-05-23     | 2026-04-12        | −41 d |                           30% |                    25% |
| USE    | Porcini           | 2026-05-28     | 2026-04-19        | −39 d |                           89% |                    17% |
| NE     | Parasol           | 2026-06-13     | 2026-05-16        | −28 d |                           74% |                    33% |
| SE     | Chanterelle       | 2026-05-03     | 2026-04-12        | −21 d |                           36% |                    25% |
| NE     | Chanterelle       | 2026-06-10     | 2026-05-21        | −20 d |                           66% |                    17% |
| SE     | Parasol           | 2026-04-26     | 2026-04-12        | −14 d |                           56% |                    25% |
| NE     | Porcini           | 2026-05-30     | 2026-05-18        | −12 d |                           73% |                    25% |
| SE     | Porcini           | 2026-04-17     | 2026-04-12        |  −5 d |                           56% |                    42% |
| USW    | Chanterelle       | 2026-04-13     | 2026-04-14        |  +1 d |                            9% |                    42% |
| USW    | Porcini           | 2026-05-05     | 2026-06-01        | +27 d |                            5% |                    33% |

Every European and eastern-US case fires early, several by more than a month. Onsets for
morel and St George's are censored — both were already fruiting on 2026-04-12, so no
error can be claimed for them.

The last column is the clearest single statement of the calibration problem: NE porcini is
recommendable on **73%** of days in a season occupying **25%** of the year; USE porcini
**89%** against **17%**.

The two USW rows fail in the opposite direction. Western-US medians are so low (in-season
median 1.52 for porcini, 0.88 for chanterelle) that the region is almost never above the
recommendation threshold — 5% and 9% of the window. USW is not badly _timed_ so much as
uniformly floored, and its apparently good onset errors (+1 d, +27 d) are a side effect of
a series that barely crosses 4.0 at all.

## D/E. Does the weather model add anything?

Both the score and the fruiting rate rise through the summer, so a raw correlation is
mostly shared trend. After differencing (which removes any trend and asks whether fruiting
moves _when the weather score moves_):

|                |   Median ρ | Positive | Significant either way |
| -------------- | ---------: | -------: | ---------------------: |
| Day-over-day   | **+0.062** |    11/17 | 4 positive, 2 negative |
| Week-over-week | **+0.132** |    11/17 |                      — |

11 of 17 positive is not distinguishable from a coin flip (binomial p ≈ 0.17), and the
significant results include genuine negatives (SE morel −0.251 daily, −0.581 weekly;
USE chanterelle −0.197 weekly). The raw undifferenced correlations look much better
(ρ up to 0.72) but that is the shared summer trend, not skill.

**Honest reading:** no dependable short-term weather skill is demonstrated, and none is
ruled out either. Daily GBIF counts are noisy and lag-affected, so this test has limited
power — a null here is weak evidence, not proof. What it does establish is that the
confident-looking seasonal correlations in the existing QA reports do not survive
detrending.

## What the model _is_ good at

Spatial discrimination is genuine. For in-season observations, the score at the observed
cell sits at percentile **0.649** (median over 15 region-species) of all same-day grid
cells:

| Region | Species           |   n | In-season percentile |
| ------ | ----------------- | --: | -------------------: |
| USE    | Morel             | 690 |                0.752 |
| USE    | Black chanterelle |  60 |                0.746 |
| NE     | Morel             | 159 |                0.716 |
| USW    | Morel             | 147 |                0.704 |
| SE     | Porcini           |  75 |                0.689 |
| SE     | St George's       |  31 |                0.687 |
| USE    | Chanterelle       | 344 |                0.684 |
| NE     | Porcini           | 118 |                0.649 |
| NE     | St George's       | 352 |                0.644 |
| USE    | Porcini           |  88 |                0.634 |
| NE     | Parasol           |  19 |                0.629 |
| USW    | Porcini           | 115 |                0.599 |
| SE     | Chanterelle       |  34 |                0.586 |
| NE     | Chanterelle       | 357 |                0.574 |
| SE     | Morel             |  24 |                0.516 |

This background is a uniform grid sample, so observer-effort geography is _not_ controlled
and 0.649 is an upper bound. The existing observer-background QA gets 0.616 on the
effort-controlled version; the two agree that the spatial signal is real. NE morel is
instructive: percentile 0.716 in-season but 0.513 out of season — the spatial signal
exists exactly when the species is actually fruiting.

## Two concrete defects

**1. The truffle season curve is inverted, and it silently overrode a correct one.**
[build_season_curves.py:34](../../../backend/tools/build_season_curves.py#L34) maps
`truffle_b` to `8282501` — the **genus** _Tuber_ — while the app scores and labels
_Tuber melanosporum_, a winter species. Measured over 2020–2026 in Northern Europe:

| Taxon                                       | Records | Peak month |
| ------------------------------------------- | ------: | ---------- |
| _Tuber_ genus (used to build the curve)     |   2,086 | **August** |
| _T. melanosporum_ (what is scored)          |   **2** | —          |
| _T. aestivum_ (the actual Burgundy truffle) |      42 | October    |

The genus clears the builder's `min_total=200` trust gate, so a curve peaking in **July**
is published and — per the precedence in
[seasonality.py:44](../../../backend/seasonality.py#L44) — _overrides_ the correct
hand-written `season_months` of `[1,2,3,4,10,11,12]`. Had the species key been used, 2
records would have failed the gate and the correct winter window would have survived. The
existing QA already flagged the `Burgundy Truffle` / _melanosporum_ label mismatch; this is
the same confusion reaching into the season model.

**2. The curve builder does not filter `basisOfRecord`.** Only `hasCoordinate` is set
([build_season_curves.py:153](../../../backend/tools/build_season_curves.py#L153)), so
preserved specimens and machine observations shape the curves, while the app's users
generate human observations. That is part of why genus _Tuber_ looks like a summer taxon.

Also worth noting: 6,080 of 778,240 SE cell-days (0.78%) carry NaN production scores.

## Effect of PR #171

`main` and the branch scored over one identical replayed frame (1,152 NE locations,
101,376 cell-days, 2026-05-24 to 2026-08-20 — the earliest date with 42 full lag days).
Both versions get the lag frame each actually ran in production: 21 days without wind lags
for `main`, 42 with wind lags for the branch.

| Species           | AUC main | AUC branch | ≥4 in dead months, main | ≥4 in dead months, branch |
| ----------------- | -------: | ---------: | ----------------------: | ------------------------: |
| Porcini           |    0.849 |  **0.925** |                   39.4% |                 **53.0%** |
| Chanterelle       |    0.843 |  **0.915** |                   48.3% |                 **69.4%** |
| Black chanterelle |    0.671 |  **0.758** |                   21.9% |                 **33.9%** |
| Parasol           |    0.768 |  **0.833** |                   39.1% |                 **51.3%** |
| St George's       |    0.976 |  **0.998** |                   52.1% |                 **66.2%** |

The branch **improves month ordering for all five species and worsens the out-of-season
false-positive rate for all five**, by 12 to 21 percentage points. It is a genuine ranking
improvement and a genuine calibration regression, which is the same "hit rates rise more
than discrimination" effect the PR's own report noted — measured here on the side the PR
never measured.

Chanterelle is the sharpest case: after this PR, **69% of dead-month cell-days in Northern
Europe clear the recommendation threshold**, up from 48%.

(These AUCs are higher than the production table in section B because the replay window
starts 2026-05-24, leaving only late May as dead-month coverage. Main-versus-branch deltas
are apples-to-apples; the two tables are not.)

**In Southern Europe the branch helps the seasonal axis, and this is worth crediting.** SE
dead months are January–April, which precede the replayable window, so only St George's is
directly testable there (AUC 0.998 → 1.000, dead-month ≥4 3.1% → 5.6%). But the in-season
lift is measurable, and section B showed the SE problem is in-season scores sitting _below_
dead-month scores:

| Species           | In-season median (Jun–Aug) main → branch | April median (main, production) |
| ----------------- | ---------------------------------------: | ------------------------------: |
| Porcini           |                          3.39 → **4.55** |                            5.11 |
| Chanterelle       |                          2.79 → **3.77** |                            4.08 |
| Parasol           |                              3.30 → 4.39 |                               — |
| Black chanterelle |                              1.39 → 2.24 |                               — |

The branch closes most of the southern inversion gap: in-season porcini rises from 3.39 to
4.55 against an April level of 5.11. April will rise too — it cannot be replayed, so the
residual inversion is unmeasured — but the direction is right, and the mechanism (moisture
memory surviving a dry Mediterranean summer) is the correct one for this failure. The PR's
southern claim is better supported by this than by the AUC delta it actually reports.

## Limits

- **The window is April 12 – August 20, 2026.** R2 retains no more score history. Autumn
  and winter are untestable, which spares the model its hardest cases: every autumn
  species' true peak (parasol Oct, black chanterelle Sep–Oct, truffle winter) sits outside
  the window.
- **Presence-only ground truth.** GBIF absence is not biological absence. Effort
  normalisation removes the largest bias but not reporting lag, identification skew, or
  misdated records — 54 NE _Cantharellus_ records in January are almost certainly one of
  the latter two.
- **Shape agreement between the curve and the observed climatology is near-circular** —
  both come from GBIF. Only the amplitude finding and the weather-side tests are
  independent of that, which is why the verdict rests on those.
- **The detrended weather tests are low-powered** (≈120 days, ≈18 weeks per
  region-species). Treat the null as "not demonstrated", not "absent".
- One-year cohort, no held-out year. The 2026 season may not be typical.
- **The branch replay starts 2026-05-24** (42 full lag days after the history begins), so
  it cannot reach April. That is exactly where the southern inversion lives, so the PR's
  effect on the inversion itself is inferred from the in-season lift, not measured.
- The replay omits USE/USW. The western-US flooring is a `main` observation only.

## What I would change

1. **Raise the seasonal dynamic range.** `--low 0.6` is the single highest-leverage number
   in the model. Even `low=0.15` would let a dead month read as dead. This is a one-flag
   change plus a curve rebuild, and it is testable with the harness in this directory.
2. **Add a season gate to recommendations.** Independent of the curve, don't let
   `worth_foraging_now` surface a species in a month holding <10% of its peak
   effort-normalised rate. Cheap, and it caps the worst user-facing failure immediately.
3. **Fix `truffle_b` to the species key** (`5258468`), or relabel the product species to
   _T. aestivum_ (`5258469`) and use that. Either way the curve should fail the trust gate
   and fall back to the correct winter `season_months`.
4. **Filter `basisOfRecord=HUMAN_OBSERVATION` in the curve builder**, matching the
   population the app serves.
5. **Investigate the southern/western inversion before further weather tuning.** SE and
   USW are not miscalibrated by a constant; they are anti-correlated with the season. PR
   #171 improves the symptom in Spain but the sign error is upstream of it.
6. **Add the dead-month false-positive rate to the PR checklist.** It is one line next to
   the existing hit-rate computation and it is the number that moves in the wrong
   direction here.

## What was implemented, and what it measures

All of the above was implemented and re-measured on the same April–August grid
(`scripts/qa_season_simulate.py`, results in `season-simulation.json`).

**The season term is now two terms.** `season_multiplier_for_species` still tilts the
score across the calendar; a new `season_gate_for_species` in
[seasonality.py](../../../backend/seasonality.py) is allowed to reach **zero**, which is
the thing the model previously could not express. The gate reads the _uncompressed_
monthly ratio, which the curve builder now publishes alongside the compressed multiplier —
the ratio was always computed and then thrown away by the `[0.6, 1.0]` rescale. Both curve
schemas load, so deployed curves keep working.

**Measured effect across all 17 testable region-species:**

|               | median season AUC | below random | ≥4 in dead months | ≥4 in season |          median onset error |
| ------------- | ----------------: | -----------: | ----------------: | -----------: | --------------------------: |
| production    |             0.707 |       7 / 17 |             40.8% |          56% |     27 d (early in 9 of 11) |
| **with gate** |         **0.923** |   **1 / 17** |          **9.1%** |      **56%** | **15 d (early in 3 of 11)** |

The in-season column is the point: out-of-season noise drops more than four-fold **without
costing a single in-season recommendation**. The inversions are gone — SE chanterelle
0.329 → 0.915, SE porcini 0.336 → 0.797, USE black chanterelle 0.324 → 0.703, USE
chanterelle 0.322 → 0.649.

**Two of my earlier recommendations were wrong, and the measurement says so.**

_Lowering the `--low` floor to 0.15–0.2 is not worth it._ It does buy more separation
(AUC 0.950, dead-month false positives 0%), but it suppresses the real season too:
in-season cell-days above the threshold fall 56% → 40%, median onset error rises 15 → 41
days, and four region-species never reach the recommendation threshold at all. The floor
stays at 0.6; the gate does the cutting. Left as a flag with the numbers recorded next to
it.

_The gate thresholds needed tuning, not just adding._ At my first guess (5%/15% of peak)
the season started **late** — trading "always on" for "switches on too late", which is the
same failure wearing different clothes. Swept four settings; 2%/10% keeps the separation
while cutting onset error rather than overshooting it.

**Truffle.** `truffle_b` now maps to `5258468` (_T. melanosporum_), and the rebuild
confirms the intended behaviour: `target=0 sightings → SKIP` in all four regions, so no
curve is published and the correct hand-written winter window applies again. The curve
builder also filters `basisOfRecord=HUMAN_OBSERVATION`, matching the population the app
serves.

**Aggregator.** `geometric_share` defaults to 1.0 (pure geometric). Ablated on an
identical replayed frame: the arithmetic blend bought +0.006 season AUC for +8 pp
dead-month false positives on chanterelle. The 0.02 component floor — not the blend — is
what fixes the near-zero scores this PR set out to fix.

**Still open.** USW chanterelle remains below random (0.384) and USW porcini is 0.580.
Component capture shows the western US is vetoed by humidity (median component **0.042**
vs 0.581 in NE, against `optimal_humidity=80` in both), but deserts and California
correctly score 0.00, and the one zone that matters — `marine_west_coast`, holding 18 of
27 chanterelle finds — is only testable in July–August, which is _early_ for Pacific
Northwest chanterelles. Bringing humidity, temperature and moisture all to NE levels would
still only reach ~4.2, so no single parameter rescues it. This needs autumn data, which is
exactly what `scripts/archive_score_climatology.py` now accumulates (13 KB/month).

**Next limitation to attack.** Monthly curve resolution. Linear interpolation between
month midpoints smears a sharp season boundary over ~30 days, which is why NE morel still
shows 31% dead-month false positives: early June interpolates from May's high ratio.
Semi-monthly or day-of-year curves would fix it.

## Reproducing

```bash
python scripts/qa_season_truth.py          # GBIF counts + complete enumeration (cached)
python scripts/qa_season_scan.py           # one pass per R2 region
python scripts/qa_season_analysis.py       # tests A-E -> season-analysis.json
python scripts/qa_season_branch_replay.py  # main vs PR #171 on identical weather
python scripts/qa_season_simulate.py       # retest the fix -> season-simulation.json
python scripts/archive_score_climatology.py  # append this month to the durable archive
python -m pytest tests/test_qa_season_metrics.py tests/test_season_gate.py

# check a curve change without the multi-hundred-cell zone crawl, and never touch R2
python backend/tools/build_season_curves.py --local-only --regions-only --force --out-dir /tmp
```

Every number in this report comes from those scripts, `season-analysis.json`, or the
parquet files beside it. Nothing is computed off-script.

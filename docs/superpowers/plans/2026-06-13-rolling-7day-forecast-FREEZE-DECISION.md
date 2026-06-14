# Decision: Freeze the past at its day-0 forecast

**Status:** Decided & implemented (rolling-7-day-forecast pipeline).
**Date:** 2026-06-14.

## Context

The scoring pipeline moved from fetching *yesterday's actual* weather (`history.json`,
1 day) to a rolling 7-day *forecast* (`forecast.json`, 7 days in one billed call). Each
run writes one dated row per forecast day for `[today .. today+6]`. The open question:
**what do we store for a day once it stops being in the future?**

## Options

### RECOMMENDED — Freeze at day-0 forecast (chosen)
A calendar day enters the window at lead +6 and is **refreshed every run** as the forecast
refines (lead +6 → +5 → … → 0). On the day itself it is written one last time at **lead 0**.
Once it becomes "yesterday" it rolls out of the window and is **never refetched** — it
freezes at that lead-0 value.

- **Cost:** zero extra API calls. Satisfies hard requirement #1 (exactly 1 call/coord/run).
- **Accuracy of frozen history:** each past day is frozen at its **lead-0** forecast, which
  is effectively the observed value (see measurement below), *not* a stale multi-day-out
  forecast. So "historical rain = best forecast we had" is, in practice, "historical rain ≈
  measured actual".

### ALTERNATIVE — Refetch just-passed days via `history.json` (rejected for now)
Also re-pull the 1–2 days that just passed with `history.json` to overwrite forecast with
measured actuals.

- **Cost:** +1–2 calls per coordinate per run → **violates requirement #1** unless the
  weather grid is coarsened to claw back the call budget.
- **Rejected** because the measured benefit is tiny (below) and the cost is a hard-constraint
  violation. Revisit only if a future error study shows lead-0 forecast bias is material.

## Quantification (the freeze error is small)

A true forecast-vs-actual error must pair a forecast *made for* date D against the *actual*
observed on D, so it accrues over time. Tooling: `tests/forecast_vs_actual.py`
(`capture` daily, `compare` once dates pass). An initial paired sample (day-0 forecast vs
`history.json` actual, NE coords) gave:

| variable | n | mean abs error | max abs error |
|----------|---|----------------|---------------|
| precip (mm) | 2 | **0.01** | 0.01 |
| avgtemp (°C) | 2 | **0.20** | 0.30 |

i.e. a **lead-0 forecast is essentially the observed value**. For scale/context, measured
day-to-day precip *variability* over recent NE history was mean **2.94 mm** / max **8.60 mm**
per day — two orders of magnitude larger than the lead-0 error. Since the pipeline freezes
each day at lead-0 (not at a multi-day-out lead), the accuracy cost of freezing is negligible
relative to the natural daily swing that drives the model.

> Sample is small (n=2 paired rows available synchronously). Run `forecast_vs_actual.py
> capture` daily and `compare` after a week for a robust multi-lead error curve before
> reconsidering the alternative.

## Scoring implications (implemented)

- Scores are computed for **every row with Date ≥ today** (the forward window), not just the
  latest row. A given `(location, date)` score therefore **changes run-to-run** as the
  forecast refines — nothing downstream may assume score immutability.
- Frozen past rows keep their previously-computed scores (`apply_forward_scores` only writes
  the forward window; `merge_master` keeps `keep='last'` so fresher forecasts win and frozen
  rows are untouched).
- A future date's 21-day lag window spans frozen past + forward forecast; `compute_lag_features`
  is calendar-date-keyed, so contiguity matters — `assert_window_contiguous` hard-asserts the
  forward window is gapless and warns on legacy lookback gaps.

## Deferred downstream follow-ups (NOT in this change — per user: "for now ignore maplayer")

These consumers currently select `max(Date)`, which after this change becomes `today+6`.
They are intentionally left for the next phase (the date-dimension work):

1. `backend/*/*/*_MapLayer.py` — `groupby().first()` after sort-desc selects the max date per
   coord; tiles will reflect the far end of the window. Add a date dimension / per-day tiles.
2. `scripts/generate_scores_metadata.py:16` — `max(Date)` would report a future date as
   `updated_at`.
3. `scripts/generate_worth_foraging_now.py:67` — `max(Date)` as "latest"; should instead pick
   the **peak day** in the next 7.
4. Frontend Map + "Worth Foraging Now" — date selector / "best day in next 7" (the forecast
   slider — the real payoff of having a time axis).

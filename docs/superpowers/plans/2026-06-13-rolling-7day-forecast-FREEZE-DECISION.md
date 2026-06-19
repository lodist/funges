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
- **Accuracy of frozen history:** each past day is frozen at its **lead-0** (same-day)
  forecast, *not* a stale multi-day-out forecast. Measured against actuals (see below), that
  is reliable for wet/dry classification (~89%) and dry amounts, but **over-predicts wet-day
  rainfall by ~4 mm on average** (worse in the US). So "historical rain = best forecast we
  had" is close in the median but carries a real wet-bias — good enough given requirement #1,
  with a calibration caveat.

### ALTERNATIVE — Refetch just-passed days via `history.json` (rejected for now)
Also re-pull the 1–2 days that just passed with `history.json` to overwrite forecast with
measured actuals.

- **Cost:** +1–2 calls per coordinate per run → **violates requirement #1** unless the
  weather grid is coarsened to claw back the call budget.
- **Rejected** because the measured benefit is tiny (below) and the cost is a hard-constraint
  violation. Revisit only if a future error study shows lead-0 forecast bias is material.

## Quantification (measured against actuals after a week live)

What we store for a past day is the **frozen lead-0 forecast** (the day's own same-day
forecast, written when it was "today", then never refetched). To measure the freeze error we
compared that registered value against the `history.json` **actual** for the same coordinate
and date, on genuinely-frozen forecast-era days (06-15..06-18; the pipeline went live
2026-06-14). Sample: **256 (region, location, date) pairs across all 4 regions**, half drawn
from registered-rain locations and half from registered-dry.

| cut | n | mean &#124;err&#124; | median &#124;err&#124; | bias (registered − actual) |
|-----|---|------------|--------------|----------------------------|
| **overall** | 256 | **4.47 mm** | **1.25 mm** | **+1.88 mm** |
| NE | 64 | 2.95 mm | — | +1.83 mm |
| SE | 64 | 2.47 mm | — | +2.01 mm |
| USE | 64 | 6.74 mm | — | +1.42 mm |
| USW | 64 | 5.73 mm | — | +2.25 mm |
| registered-rain | 128 | 8.50 mm | — | **+4.19 mm** (reg 15.7 vs act 11.6) |
| registered-dry | 128 | 0.45 mm | — | −0.43 mm |

Correlation(registered, actual) = **0.76**; worst single miss **104.6 mm** (heavy-tailed —
median 1.25 mm ≪ mean 4.47 mm). **Wet/dry classification accuracy: ~89% both ways** (89% of
registered-rain actually rained ≥1 mm; 89% of registered-dry stayed <1 mm).

**Read:**
- **Dry is reliable** (0.45 mm error) and **wet/dry classification is ~89%** — the binary the
  model leans on is sound.
- **Rain magnitude is over-predicted** on wet days by **~4 mm** (a genuine positive bias, not
  just scatter), with a heavy tail of occasional large misses.
- **US regions are ~2× worse than EU** (USE/USW ≈ 6 mm vs NE/SE ≈ 3 mm mean error).
- Caveat: registered = forecast at the *nearest fetched coord*; actual = `history.json` at the
  exact output point — a few-km spatial mismatch inflates the scatter/tail (not the bias).

This is **larger than an earlier n=2 synchronous sample suggested** (that tiny sample caught
days that had effectively already happened, i.e. nowcast ≈ observed). The error is modest in
the median but has a real wet-day over-prediction bias.

> Implication for the decision: still **freeze at lead-0** — the alternative (refetch actuals
> via `history.json`) costs the extra API calls requirement #1 forbids, and the model scores on
> 21-day *cumulative* rain + wet/dry-day counts where unbiased-ish daily scatter partly cancels.
> But the **+4 mm wet-day over-prediction (esp. US)** is a model-calibration watch-item: scores
> may skew slightly optimistic on rain. Re-run `tests/forecast_vs_actual.py` periodically; if the
> bias proves material to scores, reconsider the refetch alternative (with a coarsened grid to
> stay within the call budget).

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

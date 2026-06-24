# Forecast date slider — design

**Date:** 2026-06-24
**Status:** Draft for review
**Branch:** `feat/forecast-slider`

## Goal

Add a date slider at the bottom of the main map. Moving it changes the map to
show that day's foraging scores. Range: **today through today+6** (the 7-day
forward window the data already carries). Forecast only — no past/history.

## Why this is small

The forecast data already exists end to end; the map just discards it.

- `backend/forecast_pipeline.py` makes **one** WeatherAPI `forecast.json` call per
  coordinate (billed as one) → 7 forward days, and writes a per-(point, date)
  master time series with `<species>_score` for `today..today+6`. No change here.
- The map tile builders (`backend/{EU/North_Europe,EU/South_Europe,US/USE,US/USW}/*_MapLayer.py`)
  throw the forecast away at one spot — e.g. `NE_MapLayer.py:195-202`:
  `df = df[df['Date'] <= today]` then `groupby(['Latitude','Longitude']).first()`
  → one row (today) per coordinate.
- Rendering (`public/funges_style.json`, built by `scripts/add-overlay-to-style.cjs`):
  one `fill` layer per species×region, colored by
  `["interpolate","linear",["get","<species>_score"], 0…10 → ramp]`, sourced from
  the per-region PMTiles on R2. The app (`src/components/AdvancedMap.tsx`,
  `src/store/mapStore.ts`) only toggles layer visibility by selected species.

So: stop discarding the forecast, bake the extra days into the same tiles as
extra properties, and switch which property the color expression reads when the
slider moves. No new tilesets, no new dependency, instant client-side switching.

## Data model

### Additive property naming

Keep today exactly as-is; forecast days are purely additive.

- `<species>_score` → **today (d0)**, unchanged. Existing layers, route-to-dish,
  and the today view keep working with zero changes.
- `<species>_score_d1 … _d6` → new, future days only.

### Sparse encoding (keeps tiles from bloating ~7×)

Vector-tile feature size is driven by **attribute count per feature**, not value
width. Two facts make the data sparse, so we store it sparse:

1. **Most species are 0 on any triangle** (habitat-gated; today's tiles already
   carry these zeros). → **Omit any score property whose value is 0.**
2. **A weekly forecast is smooth** — most days round to the same 1-decimal value
   as today. → **Emit `<species>_score_dN` only when `round(dN,1) != round(d0,1)`**
   (this includes a genuine drop to 0; excludes "same as today").

The client reads with a coalesce chain:

```
["interpolate","linear",
  ["coalesce", ["get","<sp>_score_dN"], ["get","<sp>_score"], 0],
  …same 0→10 ramp… ]
```

→ use day N if present, else today, else 0. Day 0 uses
`["coalesce", ["get","<sp>_score"], 0]`.

Net: per triangle stores the few non-zero species plus only their days that
actually move — a small multiple of today's size, not 7×. Today's tiles get
*leaner* too (zeros dropped). Exact factor is measured on NE before rollout
(see Verification).

## Part A — Pipeline (Python, `backend/`)

The 4 `*_MapLayer.py` are parallel copies (NE↔SE differ ~17 non-region lines;
US ~81; all 21 species). The score loop is shared logic, so put the new behavior
in **one shared helper** and call it from each of the 4.

1. **New `backend/maplayer_forecast.py`** — one function that, given the master
   df, the canonical coord set, the KDTree/centroids already built in the script,
   and the day list, returns per-triangle scores for d0…d6 as `<species>_score`
   (= d0) plus `<species>_score_dN`. Per day it reindexes that day's point scores
   to the canonical coord order (missing coord/day → NaN → 0.0, exactly as today's
   `fillna(0.0)` path). It reuses the existing per-triangle neighbor search (the
   expensive `query_ball_point` + Gaussian weights stay **once per triangle**; only
   the cheap weighted-combine repeats per day → ~2–4× the score step, not 7×). It
   also does the sparse emit (omit zeros; omit dN == d0).

2. **Each `*_MapLayer.py`** (4 sites): replace the today-collapse
   (`NE_MapLayer.py:195-202` and equivalents) with: keep all forward rows, build
   the canonical coord set for triangulation (coords are identical across days),
   and call the helper. Everything downstream (clip cache, dominant habitat,
   tippecanoe, mbtiles→pmtiles→R2) is unchanged — extra properties pass through.

3. **Filter + dummies** (`NE_MapLayer.py:479-491` and equivalents): keep a
   triangle if **any species on any day** ≥ 4 (today it's "all today's scores < 4"
   dropped). Set the two color-anchor dummy triangles to 0 / 10 for `<species>_score`
   and every emitted `<species>_score_dN`.

4. **Forecast base date** — needed for correct slider labels (see Decision D1).

No change to `forecast_pipeline.py`, `scripts/generate_data.py` (data_nerd), or
`Task_Scheduler/Upload_Scores_GitHub_logic.py`.

## Part B — Frontend (`src/`)

5. **`store/mapStore.ts`** — add `activeDay: number` (0 = today) and `setActiveDay`.
   No persistence (resets to today each load).

6. **Color/label helper** — `scoreExpr(species, day)` returns the interpolate
   expression with the coalesce chain above (extract the existing 0→10 ramp stops
   from the style once). Day 0 → `["coalesce",["get","<sp>_score"],0]`.

7. **`store/mapStore.ts:updateVisibleLayers()`** — for the visible species'
   region layers, additionally `setPaintProperty(fill,'fill-color', scoreExpr(...))`
   and `setLayoutProperty(numbers,'text-field', scoreExpr(...))` using `activeDay`.
   Day change just calls `updateVisibleLayers()` — reuses existing machinery and
   survives the dark-mode style swap (re-applied on the new style's `load`).

8. **New `src/components/ForecastSlider.tsx`** — native
   `<input type="range" min=0 max=6 step=1>` plus a date label for the active day.
   On input → `setActiveDay`. Rendered bottom-center in `AdvancedMap`, positioned
   above the existing `MapInfoCard` (bottom-left) and the mobile navbar
   (`bottom-24`). Labelled + keyboard-accessible. i18n the static label.

9. **`src/components/FeatureInfoModal.tsx:66-94`** — it scans every `*_score`
   property; the new `_dN` keys would show as junk rows. Filter the scan to keys
   matching exactly `<name>_score` (so `_score_dN` is excluded), and read the
   active day's value via the same coalesce logic so the modal reflects the slider.

## Components intentionally untouched

`backend/forecast_pipeline.py`, `scripts/generate_data.py`,
`Task_Scheduler/Upload_Scores_GitHub_logic.py`, `src/lib/route-to-dish.ts` (plans
on today via `<species>_score`, which is unchanged).

## Tile-size strategy & verification

Sparse encoding (above) is baked in from the start — it's a few lines and also
slims today's tiles, so it's not deferred. Verification before rollout:

1. Build NE tiles with the change; compare `ne_mushroom_data.pmtiles` size vs
   current. `log` the factor.
2. Eyeball two days (today vs +3) on the map — colors shift, no missing regions.
3. Fallbacks if still too heavy: trim the horizon (e.g. +4 instead of +6), or
   split into a today tileset (byte-identical to now) + a forecast tileset fetched
   only when the slider first leaves today (forecast cost becomes opt-in).

## Decisions for review

- **D1 — slider labels / base date.** Tiles' d0 = the day the pipeline ran. Options:
  (a) **Recommended:** label from the device's `today` (zero infra; correct as
  long as tiles regenerate daily, which the "chore: update site data" cadence
  suggests). (b) Robust: the pipeline writes a tiny `forecast_meta.json`
  (`{base_date, days}`) to R2; the app fetches it once and falls back to device
  date. Pick (a) now, add (b) if skipped-run date drift is ever observed.
- **D2 — shared helper vs 4 copies.** Recommended: one `maplayer_forecast.py`
  imported by all 4 scripts (the subtle loop lives once). Alternative: duplicate
  into each (simpler diff, drift risk). Going with the shared helper.

## Out of scope

History/past days (would need a new daily-snapshot store), forecast on the Data
Nerd page, per-day route-to-dish, animating/playing the slider automatically.

## Acceptance criteria

- Slider with 7 day-stops at the bottom of the map; default = today.
- Moving it recolors the visible species' map to that day; today view is identical
  to current behavior.
- One PMTiles fetch per region; switching days makes no network request.
- NE PMTiles size increase is measured and within an agreed bound (target ≲ ~2×;
  fallback plan if not).
- route-to-dish and the today map view unchanged; feature modal shows no junk rows.

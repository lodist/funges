# Forecast date slider — design

**Date:** 2026-06-24 (rev 2026-06-25: split-tileset construction, measured)
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
  the per-region PMTiles on R2 (range-streamed). The app
  (`src/components/AdvancedMap.tsx`, `src/store/mapStore.ts`) only toggles layer
  visibility by selected species.

## Measured tile cost (NE, 66,936 kept points, window 2026-06-25→07-01)

Naive bake = 7× per-feature properties. Measured reality
(`scratchpad/measure_forecast_sparsity.py`):

| lever | outcome |
|---|---|
| omit zero scores | weak — kept cells average **17.4 / 21** species non-zero |
| emit future day if it differs at 0.1 | **86 / 126** future cells change → **~4.9×** |
| emit future day if it differs **≥ 0.5** (a visible ramp step) | **27 / 126** → **~2.1×** |

Properties dominate tile bytes here (17–44 numeric attrs vs a 3-point triangle),
so tile size ≈ property multiple. A single combined tileset is therefore **~2×
for every region and every user** (NE 10.9 → ~23 MB), range-streamed — a real
regression even for users who never touch the slider. Point-level drift is an
upper bound on triangle (interpolated) drift, so true growth is ≤ this.

## Construction: split tileset (no bloat for the default view)

- **Today tileset** `<region>_mushroom_data.pmtiles` — built exactly as now from
  `<species>_score` (= d0). **Byte-identical to current.** Zero regression.
- **Forecast tileset** `<region>_forecast.pmtiles` — NEW. Same triangle geometry,
  but properties are sparse forecast **deltas**: for each triangle, for d1..d6, emit
  `<species>_score_dN` only when `abs(round(dN,1) - round(d0,1)) >= 0.5`. A triangle
  with no emitted property (flat week) is **dropped entirely**. So this tileset holds
  only what actually changes — likely smaller than the today tileset, and it is
  fetched **only when the slider first leaves today**, then cached.

### Why the forecast tileset loads lazily for free

MapLibre fetches a source's tiles only when a **visible** layer references it.
So we declare the forecast source + forecast layers in the style but leave them
`visibility:none`. Day 0 → forecast layers hidden → **no forecast tiles fetched**
→ default view costs exactly what it does today. Day N → show the selected
species' forecast layer → MapLibre fetches forecast tiles on demand.

### Rendering a forecast day (no cross-source coalesce)

Two stacked layers per species:

- **today layer** (base, always present): `["get","<species>_score"]`, as now.
- **forecast layer** (on top, hidden until day N>0):
  `["get","<species>_score_dN"]`. It only has features for changed triangles, so
  unchanged areas show the today layer beneath. Correct because an absent forecast
  triangle means "same as today" by construction.

Day 0 hides all forecast layers (today only). Day N shows the selected species'
forecast layer and sets its paint to `_dN`.

## Part A — Pipeline (Python, `backend/`)

The 4 `*_MapLayer.py` are parallel copies (NE↔SE differ ~17 non-region lines;
US ~81; all 21 species). The per-day score loop is shared logic → one helper.

1. **New `backend/maplayer_forecast.py`** — given the master df, the canonical
   coord set, and the KDTree/centroids the script already builds, returns
   per-triangle scores for d0…d6. Per day it reindexes that day's point scores to
   the canonical coord order (missing → NaN → 0.0, as today's `fillna(0.0)`). It
   **reuses the per-triangle neighbor search once** (the expensive `query_ball_point`
   + Gaussian weights); only the cheap weighted-combine repeats per day → ~2–4× the
   score step, not 7×.

2. **Each `*_MapLayer.py`** (4 sites): replace the today-collapse
   (`NE_MapLayer.py:195-202` etc.) — keep all forward rows, build the canonical coord
   set (coords identical across days), call the helper.
   - **Today tileset**: build from d0 exactly as now (unchanged path). d0 mirrors
     current behavior (today's row, or latest available if today's scoring is late).
   - **Forecast tileset**: build the delta GeoJSON (rule above), drop no-change
     triangles, add the 0/10 color-anchor dummies for each emitted `_dN`,
     tippecanoe `-l <region>_forecast` → mbtiles → pmtiles →
     `<region>_forecast.pmtiles` on R2 (reuse the existing convert+upload helpers).

3. **Forecast base date** — for slider labels (Decision D1).

No change to `forecast_pipeline.py`, `scripts/generate_data.py`, or
`Task_Scheduler/Upload_Scores_GitHub_logic.py`.

## Part B — Frontend (`src/`)

4. **`scripts/add-overlay-to-style.cjs`** — also append a `forecast-<region>`
   pmtiles source and a hidden forecast `fill` layer per species×region (id e.g.
   `<species>_<region>_fc`, `visibility:none`, paint reads `<species>_score_d1` as a
   placeholder; the client rewrites it per active day). Forecast **numbers** layers
   omitted (halves the added layers; the today numbers layer stays for labels) —
   confirm in review.

5. **`store/mapStore.ts`** — add `activeDay: number` (0 = today) + `setActiveDay`
   (no persistence). Extend `updateVisibleLayers()`: today layers as now; for
   forecast layers, set visibility = (selected species AND activeDay>0) and, when
   shown, `setPaintProperty(fill,'fill-color', ["get", "<sp>_score_d"+activeDay])`.
   Day change just calls `updateVisibleLayers()`; survives the dark-mode style swap.

6. **New `src/components/ForecastSlider.tsx`** — native
   `<input type="range" min=0 max=6 step=1>` + active-day date label. On input →
   `setActiveDay`. Bottom-center in `AdvancedMap`, above `MapInfoCard` and the mobile
   navbar (`bottom-24`). Labelled + keyboard-accessible; i18n the static label.

7. **`src/components/FeatureInfoModal.tsx:66-94`** — scans every `*_score` property;
   the `_dN` keys would show as junk. Filter to exact `<name>_score`, and when
   activeDay>0 read the clicked feature's `<name>_score_dN` from the forecast source
   if present (else the today value).

## Components intentionally untouched

`backend/forecast_pipeline.py`, `scripts/generate_data.py`,
`Task_Scheduler/Upload_Scores_GitHub_logic.py`, `src/lib/route-to-dish.ts` (plans
on today via `<species>_score`, unchanged).

## Verification

1. Build NE today + forecast tilesets; confirm today pmtiles size == current
   (±noise) and `log` the forecast pmtiles size (expect ≤ today's).
2. Slider at today → no forecast tile requests in the network panel (default view
   unchanged). Move to +3 → forecast tiles load once; colors shift; unchanged areas
   keep today's color; no missing regions.
3. Re-run `measure_forecast_sparsity.py` per region to confirm the ≥0.5 cell counts
   before rollout (NE cached in scratchpad).

## Decisions for review

- **D1 — slider labels / base date.** Tiles' d0 = the day the pipeline ran.
  (a) **Recommended:** label from the device's `today` (zero infra; correct while
  tiles regenerate daily). (b) Robust: pipeline writes a tiny `forecast_meta.json`
  (`{base_date, days}`) to R2; app fetches once, device-date fallback. Start with (a).
- **D2 — shared helper vs 4 copies.** Recommended: one `maplayer_forecast.py`
  imported by all 4 scripts.
- **D3 — forecast threshold.** ≥0.5 (one visible ramp step) → ~2.1× *delta* volume.
  Raising toward 1.0 shrinks the forecast tileset further at the cost of fidelity;
  tunable knob.

## Out of scope

History/past days (needs a daily-snapshot store), forecast on the Data Nerd page,
per-day route-to-dish, auto-playing the slider.

## Acceptance criteria

- Slider with 7 day-stops at the bottom of the map; default = today.
- **Today view byte-identical to current**: no forecast tile fetched until the
  slider leaves today.
- Moving to day N recolors the visible species to that day; unchanged areas keep
  today's color; switching days after first load needs no extra network.
- Forecast tileset per region ≤ the today tileset's size (measured).
- route-to-dish and the today view unchanged; feature modal shows no junk rows.

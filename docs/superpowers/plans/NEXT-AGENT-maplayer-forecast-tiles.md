# Next-agent brief: put the 7-day forecast INTO the map tiles (PLAN ONLY)

> **Your job is to STUDY and PRODUCE A PLAN — do not implement yet.** Deliver a written
> implementation plan (use the superpowers:writing-plans skill) for evolving the MapLayer
> tiles to carry today's scores AND the future-day scores, so a future frontend forecast
> slider can switch days. Keep "today" working the whole time. End by saving the plan to
> `docs/superpowers/plans/YYYY-MM-DD-maplayer-forecast-tiles.md` and listing open decisions.

---

## 1. What was just done (resume point)

The scoring pipeline was converted from same-day history to a **rolling 7-day forecast**
(branch `feature/rolling-7day-forecast`, not yet merged). Concretely:

- `backend/forecast_pipeline.py` is a shared module; the 4 regional scripts
  (`backend/{EU/North_Europe/NE,EU/South_Europe/SE,US/USE/USE,US/USW/USW}_Scoring.py`) are
  thin configs calling `run_pipeline(config)`.
- Each run fetches `forecast.json` **once per coordinate** (7 days, same API cost as the old
  1-day fetch) and writes **one master row per (Location_Id, Date)** for `[today .. today+6]`.
- The per-region master parquet (`*_WEATHER_DATA` on R2) now holds a daily-contiguous series
  with **a 0–10 score per species for every forward day**, not just today. Frozen past days
  keep their scores; the forward window is re-scored each run.
- **Timezone reality (important for you):** `forecast.json` returns each coordinate's *local*
  7 days. US regions therefore start a calendar day behind a UTC/Europe runner (e.g. EU day-0
  = 06-14 while US day-0 = 06-13). "today" in the pipeline is anchored to the **earliest
  forecast date actually fetched**, and contiguity is verified **per Location_Id** (each
  location's own forward run is consecutive). Your tile design must NOT assume one global
  calendar date across regions.
- **MapLayer today:** all 4 `*_MapLayer.py` were given a *minimal* change — they now select
  **today** (`Date <= today`, take the latest remaining per coord) instead of the latest date
  (which had become today+6). This is a stopgap so the current single-day map keeps working.
  Your plan REPLACES this single-day collapse with a multi-day encoding.

Scoring data you need is **already in the master** — this task is purely about getting the
existing forward-day scores into the tiles + frontend. No scoring or API changes.

---

## 2. The goal

The `.mbtiles` we generate (and the parallel Mapbox Tiling Service tileset) should contain
**today's scores and the next 6 forecast days' scores**, so the frontend can add a forecast
slider / "best day in the next 7" without re-fetching per day. Plan the tile encoding, the
MapLayer changes, and the frontend property contract. Building the slider UI itself can be a
later task, but design the data contract it will consume.

---

## 3. Where the work lives (read these before planning)

MapLayer (4 near-identical files; `NE_MapLayer.py` is the reference, ~783 lines):
- `backend/EU/North_Europe/NE_MapLayer.py`
  - **Date selection** (the stopgap to replace): ~lines 216–225 (`Date <= today`, groupby
    `['Latitude','Longitude']`).first()).
  - **Geometry**: Delaunay triangulation of the coord grid, clipped to wilderness, cached as a
    GPKG (`*_CLIPPED_GPKG`). Geometry is **date-independent** — build once, attach many days.
  - **Score attach**: per species, `score_col = f'{specie}_score'` is joined onto triangles via
    `raster_val` / nearest (~lines 270–435). This is where you'd attach per-day columns.
  - **Feature properties / filtering**: features keep only `*_score` columns; features where
    **all** scores `< 4` are dropped; scores rounded to 1 dp (~lines 493–546). Re-derive these
    for the multi-day case (keep a feature if ANY day×species ≥ 4; watch property count).
  - **Two outputs**:
    1. Mapbox Tiling Service: `upload_source_ndjson()` + publish a **recipe** (layer
       `*_scores`, minzoom 3 / maxzoom 10) — ~lines 540–680.
    2. `tippecanoe` → `.mbtiles` (`build_mbtiles_from_geojson`, layer `f"{region_code}_scores"`,
       `-zg --drop-densest-as-needed --extend-zooms-if-still-dropping`), uploaded to R2 at
       `*_MBTILES` — ~lines 700–783.
  - Both output paths must carry the same multi-day properties — plan for both.

Frontend consumers of the tile `{species}_score` properties (the contract you're changing):
- `src/components/AdvancedMap.tsx` (filters/paints by `id.includes('_score')`, adds the source).
- `src/components/FeatureInfoModal.tsx` (strips `_score` to label species).
- `src/lib/route-to-dish.ts` (per-species `scorePropertyAliases` like `['mushroom_score', ...]`
  and reads `source-layer`).
- `src/lib/worth-foraging-now.ts`, `src/components/MapLastUpdated.tsx` (read
  `public/data/worth_foraging_now.json` + `scores_metadata.json`).
- ~21 species; current property names are flat `{species}_score` (e.g. `mushroom_score`).
- Verify any TS change with `npm run build` (runs `tsc -b`). Do NOT trust `npm run type-check`
  — `tsconfig.json` is solution-style (`"files": []`) so `tsc --noEmit` checks nothing.

Downstream date consumers to fold into the plan (currently key off `max(Date)`, which is now
today+6): `scripts/generate_scores_metadata.py:16`, `scripts/generate_worth_foraging_now.py:67`.

---

## 4. The core design decisions to resolve (the heart of your plan)

1. **Tile encoding of the time axis.** Pick and justify one:
   - **(A) Wide properties** — each triangle feature carries `{species}` × `{day}` numeric
     props (e.g. `mushroom_d0 … mushroom_d6`). One tileset; instant client-side day switching;
     ~7× properties → watch tile size. **Likely the right default for a fixed 7-day window.**
   - **(B) One tileset/mbtiles per day** — 7 outputs; each tile stays small; switching a day is
     a source swap (network); 7× tippecanoe + upload + publish.
   - **(C) One mbtiles, one layer per day** — single file, layer-toggle switching; still 7× data.
   Evaluate against tile-size budget, MTS recipe limits, and frontend ergonomics.

2. **Day axis = relative lead day, not absolute date (recommended) — because of the timezone
   anchoring.** A single global calendar-date slider maps to different local days per region
   (EU 06-14 vs US 06-13) and some cells would miss the extreme date. Prefer **lead day d0..d6**
   ("today … 6 days ahead") per location, which is consistent everywhere and matches a "best day
   in the next 7" UX. If product wants absolute dates, document how to reconcile the per-region
   offset. Decide and write it down, with a small per-region `d0->date` mapping in metadata.

3. **Tile-size budget.** ~7× properties will grow tiles. Plan: keep the "drop if all < 4" filter
   but generalized to **any (day,species) ≥ 4**; keep 1-dp rounding; reconsider
   `--drop-densest-as-needed` / zoom range; measure actual `.mbtiles` size for one region before
   committing. Note any silent feature drops in `log`.

4. **Frontend property contract.** Define the exact property names (`{species}_d{n}` vs
   `{species}_score` for d0 back-compat) and update `AdvancedMap.tsx`, `FeatureInfoModal.tsx`,
   `route-to-dish.ts`. Keep a **d0 alias equal to today** so nothing that reads `{species}_score`
   breaks during rollout.

5. **Downstream metadata.** Plan `scores_metadata.json` to expose the window (e.g. `from`/`to`
   or the `d0->date` map) instead of a single `max(Date)`; plan `generate_worth_foraging_now.py`
   to consider the **peak day in the window**.

6. **Performance.** Geometry/triangulation is date-independent — build/clip once, then attach all
   7 days (vectorized join across days), don't re-triangulate per day. Apply across all 4 regions.

---

## 5. Constraints / gotchas (discovered this round)

- **Don't half-break "today."** The single-day MapLayer must keep working until the multi-day
  tileset + a frontend that reads it both ship. Stage the rollout (d0 alias).
- **Per-location dates, not global.** Build the day axis per Location_Id (lead day), per §4.2.
- **`tippecanoe` is optional at runtime** (`shutil.which` guard) — your plan must still work when
  it's present in CI; note the MTS path is separate and also needs the multi-day props.
- **No scoring/API changes** — the 7 days already exist in the master. If you find yourself
  editing `forecast_pipeline.py` scoring, you've over-scoped.
- This codebase "has bitten people" — verify empirically (build one region's multi-day mbtiles,
  inspect feature properties + size) before claiming done; don't trust assumptions.

---

## 6. Deliverable

A written plan at `docs/superpowers/plans/YYYY-MM-DD-maplayer-forecast-tiles.md` covering:
the chosen encoding (with rationale vs the alternatives), exact MapLayer changes for both output
paths across all 4 regions, the frontend property contract + files to touch, the metadata/worth-
foraging updates, the tile-size verification step (measure a real region), and a staged rollout
that never breaks today's map. Then surface the open product decisions (lead-day vs absolute
date; slider UX) for sign-off before implementation.

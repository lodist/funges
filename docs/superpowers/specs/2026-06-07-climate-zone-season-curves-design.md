# Climate-zone season curves

**Date:** 2026-06-07
**Branch:** `improvement/climate-zone-season-curves`
**Status:** Approved design

## Problem

Empirical seasonality curves (GBIF target-group ratios that scale each species'
score by a per-month multiplier) are currently built **per region** — one curve per
species for the whole NE region, another for the whole SE region, etc.

Two region bounding boxes overlap geographically:

| Region | lat | lon |
|---|---|---|
| NE | 49.0 – 71.5 | −25.0 – 32.0 |
| SE | 34.0 – 55.5 | 12.0 – 42.5 |

The overlap (lat 49–55.5 × lon 12–32) is **Poland and eastern Germany**. Both the NE
and SE scoring runs produce scores for those coordinates, and the upload step
(`Task_Scheduler/Upload_Scores_GitHub_logic.py`) dedups by `(Latitude, Longitude)`
keeping `last`, so whichever run wrote last wins.

The SE curve is dominated by Mediterranean sightings where Boletus fruits early, so
its June multiplier for `mushroom` (Porcini) is **1.044 — a boost**, versus NE's
**0.924**. Poland therefore gets early-summer Boletus scores inflated to ~7.6, which
round to **8** on the map, even though continental Boletus actually peaks Aug–Sep.

Root cause: one curve per giant region is spatially too coarse. Poland (continental,
autumn peak) and the Italian Alps (alpine, summer peak) share the same SE curve.

## Goal

Make seasonality curves vary by **climate zone** instead of by region, using the
`climate_zone` label already attached to every scored coordinate. This:

1. Gives each zone its own biologically-appropriate seasonal shape.
2. **Dissolves the overlap bug as a side effect** — NE and SE both read the *same*
   zone-curve file, so a `continental` Poland coordinate gets an identical multiplier
   regardless of which run wrote it last.

## Scope

- **All 4 regions** (EU = NE+SE, US = USE+USW). USE/USW overlap in the south-central
  US, so the same class of bug can exist there.
- **GBIF method: A — grid-of-cells**, binned by dominant climate zone (chosen over the
  download-API approach for zero new infra and lower risk; the boundary-leakage
  weakness only affects fragmented zones like `alpine`, not contiguous `continental`
  Poland).
- **Fungi only** — curves cover the 7 species with GBIF taxon keys
  (`mushroom, morel, black_chant, chant, parasol, st_george, truffle_b`). Plants /
  berries / nuts keep their `season_months` ramp (the perennial sighting-date problem
  makes GBIF dates unreliable for them).

### Explicitly out of scope

- Plant/berry/nut curves (perennial sighting-date problem).
- Continuous spatial kernel (per-coordinate seasonality without zone bins).
- GBIF async download API path.
- Any change to `[low, high]` multiplier range or a `1.0` cap — the curve is the
  intended dominant signal and >1.0 boosts are deliberate; they just need to land in
  the right months per zone.

## Architecture & data flow

```
build_season_curves.py  (offline, periodic)
   │  for each macro-region {EU, US}:
   │    1. tile bbox into --cell-size cells (default 2.0°)
   │    2. load labeled coords (EU/US_STATIC_INFO) → cKDTree
   │    3. for each LAND cell: GBIF month-facet for species + all-fungi
   │    4. assign cell → climate_zone by majority vote of labeled coords in cell
   │    5. sum counts per (zone, species, month) and (zone, fungi, month)
   │    6. target-group ratio → curve, gated by --min-total per (zone, species)
   ▼
R2:  EU_zone_season_curves.json   {zone: {species: {month: mult}}}
     US_zone_season_curves.json
     (region curves still built & kept as the fallback layer)
   │
   ▼
NE_Scoring.py / SE_Scoring.py  →  load EU_zone_season_curves.json
USE / USW scoring              →  load US_zone_season_curves.json
   per row: multiplier = zone-curve[zone][sp] ?? region-curve[sp] ?? season_months ramp
```

The two macro-regions never overlap (lon ranges disjoint), so EU-`continental` and
US-`continental` stay distinct curves in separate files. Within EU, NE and SE agree on
every shared coordinate because they read the same file.

## Component 1 — build tool (`backend/tools/build_season_curves.py`)

Keep the existing region-curve path untouched (it is now the fallback layer). Add a
macro-region zone-curve path.

Macro-regions:

| Macro | bbox (lat / lon) | labeled coords env | output env |
|---|---|---|---|
| EU | 34.0–71.5 / −25.0–42.5 | `EU_STATIC_INFO` | `EU_ZONE_SEASON_CURVES` |
| US | 24.0–49.5 / −125.5–−75.0 | `US_STATIC_INFO` | `US_ZONE_SEASON_CURVES` |

New flow per macro-region:

1. Load labeled `(lat, lon, climate_zone)` from the static-info CSV; build a cKDTree on
   the coordinates with a parallel array of zone labels.
2. Tile the macro bbox into `--cell-size` cells (default 2.0°).
3. For each cell, find labeled coords inside it. **No coords → skip** (ocean/unlabeled;
   also trims API volume). Else assign the cell its **majority** `climate_zone`.
4. For each non-empty cell, call the existing `_facet_month` once for all-fungi
   (`FUNGI_KEY`) and once per species. A cell bbox is just a `{lat, lon}` dict, so
   `_facet_month` is reused unchanged. Accumulate into
   `zone_species_counts[zone][sp][month]` and `zone_fungi_counts[zone][month]`.
5. After all cells, for each `(zone, species)` run the existing `build_curve(...)` with
   the per-zone target-group ratio, gated by `--min-total`. Data-poor pairs return
   `None` and are simply absent from the output (→ scoring falls back to region curve).
6. Write `{zone: {species: {month: mult}}}` to the macro-region's R2 path.

Call volume ≈ `non_empty_cells × (n_species + 1)` — roughly ~3,500 facet calls for a
full EU+US run (~440 land cells × 8). `[low, high] = [0.8, 1.2]` unchanged.

**Parallelization (required).** Run the per-cell facet calls through a
`ThreadPoolExecutor` (same pattern as the weather fetcher in the scoring scripts,
`max_workers=3`). Use a modest pool (`--workers`, default 6–8) to stay polite to GBIF;
this cuts wall-clock from ~30–40 min single-threaded to ~5–10 min. The per-call
`time.sleep(0.2)` politeness delay is dropped in favor of bounded concurrency.
Accumulation into the per-zone count buckets happens as futures complete (counts are
summed, so completion order does not matter). Retries already live inside
`_facet_month`; a cell that exhausts retries is logged and skipped rather than failing
the whole run.

### Build cadence

This is an offline job, fully decoupled from the 3-hour weather scoring cron (scoring
only reads the published JSON — milliseconds). Curves are a slow-moving biological
prior built from a 7-year GBIF window (`--years THIS_YEAR-6,THIS_YEAR`), so the shape
is stable month to month.

- **Calendar:** quarterly (semi-annually is also fine). The main reason for *any*
  schedule is to keep the rolling `--years` window current.
- **On change (the important trigger):** re-run whenever the species/taxon list,
  climate-zone definitions, or region bboxes change.

Monthly is unnecessary — it would re-derive a near-identical curve from the same
multi-year aggregate.

## Component 2 — scoring (`NE_Scoring.py`, mirrored in SE / USE / USW)

**Loading:** load *both* the existing region curve file (unchanged → merged into
`params[sp]["season_curve"]`) **and** the new zone file
(`EU_ZONE_SEASON_CURVES` for NE/SE, `US_ZONE_SEASON_CURVES` for USE/USW) into
`zone_curves = {zone: {sp: {month: mult}}}`. A missing/unreadable zone file degrades
gracefully to region curves (same try/except pattern already present for region
curves).

**Refactor** the inline curve/ramp block (current `NE_Scoring.py` lines 713–730) into
two helpers:

- `season_months_ramp(dates, params)` — the existing flat-ramp logic, extracted
  verbatim (1.0 inside allowed months; linear ramp down over `ramp_days=31` outside,
  clipped to `season_factor` floor).
- `season_multiplier_for_species(df, sp, params, zone_curves)` — returns the
  per-row multiplier array:
  1. **Base:** region `season_curve` via `empirical_season_multiplier` if present, else
     `season_months_ramp`, else `1.0`.
  2. **Overlay:** for each zone that has a curve for this species, recompute the
     multiplier for just the rows where `climate_zone == zone` via
     `empirical_season_multiplier`.

Per-row precedence is therefore **zone curve → region curve → season_months → 1.0**.
Application stays a single line: `df[f'{sp}_score'] *= season_multiplier_for_species(...)`.

`empirical_season_multiplier` is unchanged: piecewise-linear interpolation between the
12 month-midpoint day-of-year knots with periodic Dec→Jan wraparound — smooth
all-year shaping, so the curve *is* the ramp for fungi. Off-season floor is `--low`
(0.8): the curve de-emphasizes rather than hard-gates, which is the intended behavior.

All four scoring scripts receive the identical refactor; only the zone-file env var
differs.

## Configuration

Add to `.env`:

```
EU_ZONE_SEASON_CURVES=https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/EU/EU_zone_season_curves.json
US_ZONE_SEASON_CURVES=https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/USA/US_zone_season_curves.json
```

(Same `r2.dev` public-read host as the existing `*_SEASON_CURVES` vars; writes go via
boto3 to the same bucket, matching the existing `save_curves` path logic.)

## Testing

**Unit tests (no network — mock `_facet_month`):**

- **Cell→zone binning:** synthetic labeled grid; a mixed-label cell takes the majority
  zone; an empty (ocean) cell is skipped.
- **Per-zone aggregation:** canned monthly counts for cells across two zones sum into
  the correct `zone_species_counts` buckets; `build_curve` gated by `--min-total`
  (data-poor zone absent from output).
- **`season_multiplier_for_species` precedence:** rows across zones + species resolve
  zone→region→season_months→1.0 correctly (zone overrides region; missing zone falls to
  region; non-fungi with no curve uses the ramp).
- **`empirical_season_multiplier`:** smooth interpolation at month midpoints and
  continuous Dec→Jan wraparound.

**Validation (the actual bug):**

- Build EU zone curves with `--local-only`; assert the `continental` `mushroom` curve
  peaks Aug–Sep and June < 1.0 (no boost).
- Run scoring on a Poland sample with the new zone file; assert June `mushroom_score`
  mean drops below the current ~6.85 / no false 8s, and the result is identical via the
  NE or SE path (overlap dissolved).

## Rollout (order matters — fallback makes each step safe)

1. Branch `improvement/climate-zone-season-curves`.
2. Land the scoring refactor first. With no zone file present it falls back to region
   curves → behavior unchanged → safe to merge.
3. Add `EU_ZONE_SEASON_CURVES` / `US_ZONE_SEASON_CURVES` to `.env`; run the build tool
   to publish zone files to R2.
4. Next scoring run picks up zone curves automatically. Spot-check Poland map tiles.
5. Mirror the refactor into SE / USE / USW scoring scripts.

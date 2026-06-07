# Climate-zone Season Curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace coarse per-region GBIF season curves with per-climate-zone curves so Poland/Germany (and the US overlap band) get biologically correct seasonality, dissolving the NE/SE overlap that inflated Boletus scores.

**Architecture:** A shared, unit-tested `backend/seasonality.py` module holds the multiplier logic (extracted from 4 duplicate copies). The build tool `build_season_curves.py` gains a `--mode zone` path that tiles each macro-region (EU, US) into ~2° cells, facet-queries GBIF per land cell in parallel, bins cells to climate zones by majority vote, and writes `{zone: {species: {month: mult}}}` files to R2. Each scoring script loads both the existing region curve (fallback) and the new zone file, applying per-row precedence **zone → region → season_months → 1.0**.

**Tech Stack:** Python 3, pandas, numpy, scipy, boto3, urllib (GBIF), pytest (new dev dep).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/seasonality.py` | Shared multiplier helpers: `empirical_season_multiplier`, `season_months_ramp`, `season_multiplier_for_species`. Importable + unit-tested. | Create |
| `backend/tools/build_season_curves.py` | Add `--mode zone`: macro-region tiling, cell→zone binning, parallel facet fetch, per-zone curve build. Keep region mode intact. | Modify |
| `backend/EU/North_Europe/NE_Scoring.py` | Import shared module, load `EU_ZONE_SEASON_CURVES`, apply per-zone helper. Remove local dup logic. | Modify |
| `backend/EU/South_Europe/SE_Scoring.py` | Same as NE (env `EU_ZONE_SEASON_CURVES`). | Modify |
| `backend/US/USE/USE_Scoring.py` | Same, env `US_ZONE_SEASON_CURVES`. | Modify |
| `backend/US/USW/USW_Scoring.py` | Same, env `US_ZONE_SEASON_CURVES`. | Modify |
| `backend/requirements-dev.txt` | Dev deps (pytest). | Create |
| `tests/conftest.py` | Put `backend/` and `backend/tools/` on `sys.path`. | Create |
| `tests/test_seasonality.py` | Unit tests for the shared module. | Create |
| `tests/test_zone_curves.py` | Unit tests for build-tool pure helpers. | Create |
| `.env` | Add `EU_ZONE_SEASON_CURVES`, `US_ZONE_SEASON_CURVES`. | Modify (local, untracked) |

**Note on runtime copies:** The git repo (`funges`) is the source of truth. If a separate local runtime copy of the scoring scripts exists under `app_operation/Europe/...` or `app_operation/tools/`, sync it from this repo after merge (Task 9 note).

---

## Task 1: Test scaffolding

**Files:**
- Create: `backend/requirements-dev.txt`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create dev requirements**

`backend/requirements-dev.txt`:

```
-r requirements.txt
pytest
```

- [ ] **Step 2: Create conftest that exposes backend modules to tests**

`tests/conftest.py`:

```python
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))
sys.path.insert(0, str(_BACKEND / "tools"))
```

- [ ] **Step 3: Install pytest**

Run: `python -m pip install pytest`
Expected: pytest installs (or "already satisfied").

- [ ] **Step 4: Verify pytest collects nothing yet (no error)**

Run: `python -m pytest tests/ -q`
Expected: `no tests ran` (exit code 5 is fine — no tests collected yet).

- [ ] **Step 5: Commit**

```bash
git add backend/requirements-dev.txt tests/conftest.py
git commit -m "test: add pytest scaffolding and conftest path setup"
```

---

## Task 2: Shared `seasonality.py` module (TDD)

**Files:**
- Create: `backend/seasonality.py`
- Test: `tests/test_seasonality.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_seasonality.py`:

```python
import numpy as np
import pandas as pd

from seasonality import (
    empirical_season_multiplier,
    season_months_ramp,
    season_multiplier_for_species,
)


def _dates(*iso):
    return pd.Series(pd.to_datetime(list(iso)))


def test_empirical_multiplier_hits_curve_value_at_month_midpoint():
    # Month midpoints are day-of-year 15,46,74,... ; Jan midpoint = Jan 15.
    curve = {m: 0.8 for m in range(1, 13)}
    curve[1] = 1.2
    out = empirical_season_multiplier(_dates("2026-01-15"), curve)
    assert abs(out[0] - 1.2) < 1e-9


def test_empirical_multiplier_interpolates_between_midpoints():
    curve = {m: 0.0 for m in range(1, 13)}
    curve[6] = 1.0  # Jun midpoint doy=166
    curve[7] = 0.0  # Jul midpoint doy=196
    # A date between Jun15 and Jul15 should fall strictly between the two values.
    out = empirical_season_multiplier(_dates("2026-07-01"), curve)  # doy=182
    assert 0.0 < out[0] < 1.0


def test_empirical_multiplier_wraps_dec_to_jan_continuously():
    curve = {m: 0.5 for m in range(1, 13)}
    curve[12] = 1.0
    curve[1] = 1.0
    # Dec 31 (doy 365) sits between Dec midpoint and Jan midpoint; both are 1.0,
    # so the wrapped interpolation stays at 1.0 with no seam.
    out = empirical_season_multiplier(_dates("2026-12-31"), curve)
    assert abs(out[0] - 1.0) < 1e-6


def test_season_months_ramp_is_one_in_season_and_floors_off_season():
    params = {"season_months": [6, 7, 8], "season_factor": 0.5}
    out = season_months_ramp(_dates("2026-07-15", "2026-01-15"), params)
    assert abs(out[0] - 1.0) < 1e-9          # July in season
    assert abs(out[1] - 0.5) < 1e-9          # deep off-season hits the floor


def test_multiplier_precedence_zone_over_region():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-06-15", "2026-06-15"]),
        "climate_zone": ["continental", "temperate"],
    })
    params = {"season_curve": {m: 0.9 for m in range(1, 13)}}
    zone_curves = {"continental": {"mushroom": {m: 0.3 for m in range(1, 13)}}}
    out = season_multiplier_for_species(df, "mushroom", params, zone_curves)
    assert abs(out[0] - 0.3) < 1e-9          # continental row uses zone curve
    assert abs(out[1] - 0.9) < 1e-9          # temperate row falls back to region curve


def test_multiplier_falls_back_to_season_months_when_no_curves():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-15"]),
        "climate_zone": ["continental"],
    })
    params = {"season_months": [7], "season_factor": 0.5}
    out = season_multiplier_for_species(df, "garlic", params, zone_curves={})
    assert abs(out[0] - 1.0) < 1e-9


def test_multiplier_defaults_to_one_when_nothing_defined():
    df = pd.DataFrame({
        "Date": pd.to_datetime(["2026-07-15"]),
        "climate_zone": ["continental"],
    })
    out = season_multiplier_for_species(df, "garlic", params={}, zone_curves={})
    assert abs(out[0] - 1.0) < 1e-9
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_seasonality.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'seasonality'`.

- [ ] **Step 3: Create the module**

`backend/seasonality.py`:

```python
"""Seasonality multipliers shared by the regional scoring scripts.

Extracted so the logic has one home and can be unit-tested in isolation
(the scoring scripts themselves run network/R2 side effects at import time).
"""
import numpy as np
import pandas as pd

# Day-of-year of each month's midpoint (Jan..Dec). Curve values are pinned here
# and linearly interpolated between, with periodic Dec->Jan wraparound.
_MONTH_MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])


def empirical_season_multiplier(dates, season_curve):
    """Smooth per-day multiplier from a 12-month curve {month(1-12): value}."""
    curve = {int(k): float(v) for k, v in season_curve.items()}
    vals = np.array([curve[m] for m in range(1, 13)], dtype=float)
    xp = np.concatenate(([_MONTH_MID_DOY[-1] - 365], _MONTH_MID_DOY, [_MONTH_MID_DOY[0] + 365]))
    fp = np.concatenate(([vals[-1]], vals, [vals[0]]))
    return np.interp(dates.dt.dayofyear.to_numpy(), xp, fp)


def season_months_ramp(dates, params):
    """Flat 1.0 inside season_months, linear ramp down to season_factor outside."""
    ramp_days = 31
    allowed_months = set(params["season_months"])
    in_season = dates.dt.month.isin(allowed_months)
    day_of_year = dates.dt.dayofyear
    valid_days = np.concatenate([
        pd.date_range(f'2021-{m:02d}-01', f'2021-{m:02d}-{pd.Period(f"2021-{m:02d}").days_in_month}')
          .dayofyear.to_numpy()
        for m in sorted(allowed_months)
    ])
    dist = np.minimum(
        np.abs(day_of_year.values[:, None] - valid_days[None, :]),
        365 - np.abs(day_of_year.values[:, None] - valid_days[None, :])
    ).min(axis=1)
    factor = params.get("season_factor", 0.5)
    return np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))


def season_multiplier_for_species(df, specie, params, zone_curves):
    """Per-row seasonality multiplier with precedence:
    zone curve -> region curve (params['season_curve']) -> season_months ramp -> 1.0.

    df must have 'Date' (datetime) and 'climate_zone' columns.
    zone_curves is {climate_zone: {species: {month: multiplier}}}.
    """
    n = len(df)
    dates = df['Date']
    if "season_curve" in params:
        mult = np.asarray(empirical_season_multiplier(dates, params["season_curve"]), dtype=float)
    elif "season_months" in params:
        mult = np.asarray(season_months_ramp(dates, params), dtype=float)
    else:
        mult = np.ones(n, dtype=float)

    zones = df['climate_zone'].to_numpy()
    for zone, sp_map in zone_curves.items():
        curve = sp_map.get(specie)
        if not curve:
            continue
        mask = zones == zone
        if mask.any():
            mult[mask] = empirical_season_multiplier(dates[mask], curve)
    return mult
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_seasonality.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/seasonality.py tests/test_seasonality.py
git commit -m "feat: shared seasonality module with per-zone multiplier precedence"
```

---

## Task 3: Wire `NE_Scoring.py` to the shared module + zone curves

**Files:**
- Modify: `backend/EU/North_Europe/NE_Scoring.py` (imports; lines 97-106 region-load block; lines 440-452 local dup defs; lines 713-730 application block)

- [ ] **Step 1: Add `sys` import and shared-module import**

In `backend/EU/North_Europe/NE_Scoring.py`, find line 5:

```python
import os, json, time, math
```

Replace with:

```python
import os, sys, json, time, math
```

Then find the import block end (after line 13 `from scipy.spatial import cKDTree`) and add, immediately after it:

```python
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/ for shared modules
from seasonality import season_multiplier_for_species
```

(Note: `Path` is already imported on line 6; this line runs after `from pathlib import Path`. Only `season_multiplier_for_species` is imported — the scoring scripts no longer reference `empirical_season_multiplier` directly once the local copy is removed in Step 3.)

- [ ] **Step 2: Add zone-curve loading after the region-curve block**

Find lines 97-106 (the region-curve `try/except` ending with the `[warn]` print). Immediately after line 106, insert:

```python

# Per-climate-zone curves (built by tools/build_season_curves.py --mode zone, published
# to R2 at EU_ZONE_SEASON_CURVES). Keyed climate_zone -> species -> {month: multiplier}.
# A row uses its zone's curve when present, else the region curve, else season_months
# (see seasonality.season_multiplier_for_species). os.getenv (not get_required_env) so an
# unset var during rollout simply leaves zone_curves empty and falls back gracefully.
_zone_curves_path = os.getenv("EU_ZONE_SEASON_CURVES")
zone_curves = {}
if _zone_curves_path:
    try:
        _zraw = (r2_fetch(_zone_curves_path).decode("utf-8")
                 if is_remote_path(_zone_curves_path)
                 else Path(_zone_curves_path).read_text(encoding="utf-8"))
        _zone_raw = json.loads(_zraw)
        zone_curves = {
            str(_z): {str(_sp): {int(k): float(v) for k, v in _c.items()}
                      for _sp, _c in _spmap.items()}
            for _z, _spmap in _zone_raw.items()
        }
        print(f"Loaded zone season curves for {len(zone_curves)} climate zones.")
    except Exception as _e:
        print(f"[warn] could not load zone curves from {_zone_curves_path}: {_e}; falling back to region/season_months")
```

- [ ] **Step 3: Remove the now-duplicated local seasonality defs**

Delete lines 440-452 — the comment block starting `# Empirical seasonality:` through the end of the local `empirical_season_multiplier` function (the `return np.interp(...)` line). These now live in `seasonality.py`. Concretely, remove this block:

```python
# Empirical seasonality: replace the flat season_months ramp with a smooth multiplier
# derived from a 12-month curve (the GBIF target-group sighting ratio). The curve lives
# in params["season_curve"] as {month(1-12): multiplier}; values are interpolated at
# month midpoints (periodic) so the multiplier varies smoothly across the day-of-year
# instead of stepping at month boundaries. Species without a curve use season_months.
_MONTH_MID_DOY = np.array([15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349])

def empirical_season_multiplier(dates, season_curve):
    curve = {int(k): float(v) for k, v in season_curve.items()}
    vals = np.array([curve[m] for m in range(1, 13)], dtype=float)
    xp = np.concatenate(([_MONTH_MID_DOY[-1] - 365], _MONTH_MID_DOY, [_MONTH_MID_DOY[0] + 365]))
    fp = np.concatenate(([vals[-1]], vals, [vals[0]]))
    return np.interp(dates.dt.dayofyear.to_numpy(), xp, fp)
```

- [ ] **Step 4: Replace the application block with the per-zone helper**

Find lines 713-730 (the `if "season_curve" in params:` / `elif "season_months" in params:` block inside `calculate_mushroom_score`). Replace the entire block:

```python
        if "season_curve" in params:
            df[f'{specie}_score'] *= empirical_season_multiplier(df['Date'], params["season_curve"])
        elif "season_months" in params:
            ramp_days = 31
            allowed_months = set(params["season_months"])
            in_season = df['Date'].dt.month.isin(allowed_months)
            day_of_year = df['Date'].dt.dayofyear
            valid_days = np.concatenate([
                pd.date_range(f'2021-{m:02d}-01', f'2021-{m:02d}-{pd.Period(f"2021-{m:02d}").days_in_month}')
                  .dayofyear.to_numpy()
                for m in sorted(allowed_months)
            ])
            dist = np.minimum(
                np.abs(day_of_year.values[:, None] - valid_days[None, :]),
                365 - np.abs(day_of_year.values[:, None] - valid_days[None, :])
            ).min(axis=1)
            factor = params.get("season_factor", 0.5)
            df[f'{specie}_score'] *= np.where(in_season, 1, np.clip(1 - (1 - factor) * dist / ramp_days, factor, 1))
```

with:

```python
        df[f'{specie}_score'] *= season_multiplier_for_species(df, specie, params, zone_curves)
```

(`zone_curves` is the module-level global defined in Step 2.)

- [ ] **Step 5: Byte-compile to catch syntax/indentation errors**

Run: `python -m py_compile backend/EU/North_Europe/NE_Scoring.py`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add backend/EU/North_Europe/NE_Scoring.py
git commit -m "feat(NE): per-zone season curves via shared seasonality module"
```

---

## Task 4: Mirror the wiring into SE, USE, USW

The three remaining scoring scripts are byte-identical to NE in the touched regions (verified: same line numbers 5, 97-106, 440-452, 713-730). Apply the **exact same** edits from Task 3 Steps 1-4 to each, with one difference: the zone env var.

| File | Zone env var in Step 2 |
|---|---|
| `backend/EU/South_Europe/SE_Scoring.py` | `EU_ZONE_SEASON_CURVES` |
| `backend/US/USE/USE_Scoring.py` | `US_ZONE_SEASON_CURVES` |
| `backend/US/USW/USW_Scoring.py` | `US_ZONE_SEASON_CURVES` |

- [ ] **Step 1: Apply Task 3 Steps 1-4 to `SE_Scoring.py`** (env var `EU_ZONE_SEASON_CURVES`)

Use the identical code from Task 3. The Step 2 insert block is identical (SE is also EU macro, so it reads `EU_ZONE_SEASON_CURVES`).

- [ ] **Step 2: Byte-compile SE**

Run: `python -m py_compile backend/EU/South_Europe/SE_Scoring.py`
Expected: no output.

- [ ] **Step 3: Apply Task 3 Steps 1-4 to `USE_Scoring.py`**, but in the Step 2 insert block replace **both** occurrences of `EU_ZONE_SEASON_CURVES` with `US_ZONE_SEASON_CURVES` (the `os.getenv(...)` line and the comment), and adjust the comment's parenthetical to `US_ZONE_SEASON_CURVES`.

- [ ] **Step 4: Byte-compile USE**

Run: `python -m py_compile backend/US/USE/USE_Scoring.py`
Expected: no output.

- [ ] **Step 5: Apply Task 3 Steps 1-4 to `USW_Scoring.py`** (env var `US_ZONE_SEASON_CURVES`, same as USE).

- [ ] **Step 6: Byte-compile USW**

Run: `python -m py_compile backend/US/USW/USW_Scoring.py`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add backend/EU/South_Europe/SE_Scoring.py backend/US/USE/USE_Scoring.py backend/US/USW/USW_Scoring.py
git commit -m "feat(SE,USE,USW): per-zone season curves via shared seasonality module"
```

---

## Task 5: Build-tool pure helpers (TDD)

**Files:**
- Modify: `backend/tools/build_season_curves.py` (add helpers; existing `build_curve`, `_facet_month`, `FUNGI_KEY`, `TAXON_MAP` reused)
- Test: `tests/test_zone_curves.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_zone_curves.py`:

```python
import numpy as np

import build_season_curves as bsc


def test_generate_cells_tiles_bbox_inclusive_of_remainder():
    cells = bsc.generate_cells((0.0, 5.0), (0.0, 4.0), 2.0)
    # lat edges 0,2,4 -> 3 bands (0-2,2-4,4-5); lon edges 0,2,4 -> 2 cols (0-2,2-4)
    assert len(cells) == 3 * 2
    # last cell clamps to the bbox max, not 6/6
    assert cells[-1] == (4.0, 5.0, 2.0, 4.0)


def test_majority_zone_picks_most_common_label_in_cell():
    lats = np.array([1.0, 1.5, 1.2])
    lons = np.array([1.0, 1.1, 1.2])
    zones = np.array(["continental", "continental", "alpine"])
    cell = (0.0, 2.0, 0.0, 2.0)
    assert bsc.majority_zone_in_cell(cell, lats, lons, zones) == "continental"


def test_majority_zone_returns_none_for_empty_cell():
    lats = np.array([10.0])
    lons = np.array([10.0])
    zones = np.array(["continental"])
    cell = (0.0, 2.0, 0.0, 2.0)
    assert bsc.majority_zone_in_cell(cell, lats, lons, zones) is None


def test_build_zone_curves_sums_cells_and_gates_on_min_total():
    months = {m: 0 for m in range(1, 13)}
    # continental: 2 cells, Boletus heavy in Aug(8); fungi flat -> ratio peaks Aug.
    sp_a = dict(months); sp_a[8] = 150
    sp_b = dict(months); sp_b[8] = 150
    fungi = {m: 100 for m in range(1, 13)}
    # temperate: a single sparse cell below min_total -> dropped.
    sp_sparse = dict(months); sp_sparse[8] = 5
    cell_results = [
        ("continental", {"mushroom": sp_a}, dict(fungi)),
        ("continental", {"mushroom": sp_b}, dict(fungi)),
        ("temperate",   {"mushroom": sp_sparse}, dict(fungi)),
    ]
    out = bsc.build_zone_curves(cell_results, low=0.8, high=1.2, min_total=200)
    assert "continental" in out                 # 300 sightings >= 200
    assert "mushroom" in out["continental"]
    assert "temperate" not in out               # 5 sightings < 200 -> gated out
    aug = out["continental"]["mushroom"][8]
    other = out["continental"]["mushroom"][1]
    assert aug > other                          # peak month scores higher
    assert abs(aug - 1.2) < 1e-9                # ratio max -> high ceiling
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_zone_curves.py -v`
Expected: FAIL with `AttributeError: module 'build_season_curves' has no attribute 'generate_cells'`.

- [ ] **Step 3: Add the pure helpers to the build tool**

In `backend/tools/build_season_curves.py`, after the `build_curve(...)` function (ends at line 122) and before `def main():`, insert:

```python
from collections import defaultdict


def generate_cells(lat_range, lon_range, cell_size):
    """Tile a bbox into (lat_lo, lat_hi, lon_lo, lon_hi) cells, clamping the last
    row/column to the bbox edges."""
    cells = []
    lat = lat_range[0]
    while lat < lat_range[1]:
        lat_hi = min(lat + cell_size, lat_range[1])
        lon = lon_range[0]
        while lon < lon_range[1]:
            lon_hi = min(lon + cell_size, lon_range[1])
            cells.append((lat, lat_hi, lon, lon_hi))
            lon = lon_hi
        lat = lat_hi
    return cells


def majority_zone_in_cell(cell, lats, lons, zones):
    """Most common climate_zone among labeled coords inside the cell, or None if the
    cell contains no labeled coords (ocean / unlabeled -> skipped, no GBIF call)."""
    lat_lo, lat_hi, lon_lo, lon_hi = cell
    mask = (lats >= lat_lo) & (lats < lat_hi) & (lons >= lon_lo) & (lons < lon_hi)
    if not mask.any():
        return None
    vals, counts = np.unique(zones[mask], return_counts=True)
    return str(vals[counts.argmax()])


def build_zone_curves(cell_results, low, high, min_total):
    """Aggregate per-cell facet counts into per-zone curves.

    cell_results: iterable of (zone, {species: {month: count}}, {month: count}) where
    the third element is the all-fungi denominator for that cell.
    Returns {zone: {species: curve}} with data-poor (zone, species) pairs omitted.
    """
    zero = lambda: {m: 0 for m in range(1, 13)}
    zone_species = defaultdict(lambda: defaultdict(zero))
    zone_fungi = defaultdict(zero)
    for zone, sp_counts, fungi_counts in cell_results:
        for m in range(1, 13):
            zone_fungi[zone][m] += fungi_counts.get(m, 0)
        for sp, counts in sp_counts.items():
            for m in range(1, 13):
                zone_species[zone][sp][m] += counts.get(m, 0)

    out = {}
    for zone, sp_map in zone_species.items():
        curves = {}
        for sp, counts in sp_map.items():
            curve, _total = build_curve(counts, zone_fungi[zone], low, high, min_total)
            if curve:
                curves[sp] = curve
        if curves:
            out[zone] = curves
    return out
```

Note: `import numpy as np` is required. The build tool does not currently import numpy — add `import numpy as np` to the import block near the top (after `import boto3` on line 15).

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_zone_curves.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/build_season_curves.py tests/test_zone_curves.py
git commit -m "feat(build): pure helpers for cell tiling, zone binning, zone-curve aggregation"
```

---

## Task 6: Build-tool macro-region wiring (`--mode zone`)

**Files:**
- Modify: `backend/tools/build_season_curves.py` (add `MACROS`, fetch/orchestration funcs, `main()` branch + args)

- [ ] **Step 1: Add pandas import + MACROS table**

In `backend/tools/build_season_curves.py`, add to the import block (after the `import numpy as np` added in Task 5):

```python
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
```

After the existing `REGIONS = { ... }` dict (ends line 38), insert:

```python
# Macro-regions for zone curves. EU = NE ∪ SE bbox, US = USE ∪ USW bbox. Disjoint in
# longitude, so EU-continental and US-continental stay distinct files. Both EU sub-region
# scoring scripts read the EU file (dissolving the NE/SE overlap); both US scripts read US.
MACROS = {
    "EU": {"lat": (34.0, 71.5), "lon": (-25.0, 42.5),
           "static_env": "EU_STATIC_INFO", "out_env": "EU_ZONE_SEASON_CURVES"},
    "US": {"lat": (24.0, 49.5), "lon": (-125.5, -75.0),
           "static_env": "US_STATIC_INFO", "out_env": "US_ZONE_SEASON_CURVES"},
}
```

- [ ] **Step 2: Add static-coord loader and per-cell fetch**

After the `build_zone_curves(...)` function added in Task 5, insert:

```python
def load_static_coords(env_name):
    """Load labeled (lat, lon, climate_zone) from a static-info CSV (local or remote)."""
    src = get_required_env(env_name)
    if is_remote_path(src):
        raw = urllib.request.urlopen(src, timeout=120).read()
        df = pd.read_csv(BytesIO(raw))
    else:
        df = pd.read_csv(src)
    return (
        df["Latitude"].astype(float).to_numpy(),
        df["Longitude"].astype(float).to_numpy(),
        df["climate_zone"].astype(str).to_numpy(),
    )


def fetch_cell_counts(cell, taxon_map, years):
    """GBIF month-facets for one cell: returns (fungi_counts, {species: counts})."""
    region = {"lat": (cell[0], cell[1]), "lon": (cell[2], cell[3])}
    fungi_counts, _ = _facet_month([FUNGI_KEY], region, years)
    sp_counts = {}
    for sp, keys in taxon_map.items():
        counts, _ = _facet_month(keys, region, years)
        sp_counts[sp] = counts
    return fungi_counts, sp_counts


def build_zone_curves_for_macro(macro, years, low, high, min_total, cell_size, workers):
    lats, lons, zones = load_static_coords(macro["static_env"])
    cells = generate_cells(macro["lat"], macro["lon"], cell_size)
    land = [(c, z) for c in cells for z in [majority_zone_in_cell(c, lats, lons, zones)] if z]
    print(f"  {len(land)} land cells of {len(cells)} total; fetching with {workers} workers")

    cell_results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fetch_cell_counts, cell, TAXON_MAP, years): zone for cell, zone in land}
        done = 0
        for fut in as_completed(futs):
            zone = futs[fut]
            try:
                fungi_counts, sp_counts = fut.result()
                cell_results.append((zone, sp_counts, fungi_counts))
            except Exception as e:
                print(f"  [warn] cell in zone {zone} failed: {e}; skipping")
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(land)} cells fetched...")
    return build_zone_curves(cell_results, low, high, min_total)
```

- [ ] **Step 3: Add CLI args and the `--mode zone` branch in `main()`**

In `main()`, after the existing `ap.add_argument(...)` calls (the last is `--out-dir`, line 136) and before `args = ap.parse_args()`, add:

```python
    ap.add_argument("--mode", choices=["region", "zone"], default="region",
                    help="region: legacy per-region curves; zone: per-climate-zone curves")
    ap.add_argument("--macros", default=",".join(MACROS), help="comma-separated macro codes (zone mode)")
    ap.add_argument("--cell-size", type=float, default=2.0, help="grid cell size in degrees (zone mode)")
    ap.add_argument("--workers", type=int, default=6, help="parallel GBIF fetch workers (zone mode)")
```

Then, immediately after the two `load_dotenv(...)` calls in `main()` (lines 139-140) and before the existing `for region in args.regions.split(","):` loop, insert:

```python
    if args.mode == "zone":
        for macro_code in args.macros.split(","):
            macro_code = macro_code.strip()
            if macro_code not in MACROS:
                print(f"[{macro_code}] unknown macro, skipping")
                continue
            macro = MACROS[macro_code]
            print(f"[{macro_code}] building zone curves...")
            curves = build_zone_curves_for_macro(
                macro, args.years, args.low, args.high, args.min_total,
                args.cell_size, args.workers)
            n_curves = sum(len(v) for v in curves.values())
            print(f"[{macro_code}] {n_curves} curve(s) across {len(curves)} zone(s)")
            if args.local_only:
                dest = str(Path(args.out_dir) / f"{macro_code}_zone_season_curves.json")
            else:
                dest = get_required_env(macro["out_env"])
            save_curves(curves, dest)
        return
```

The existing region-mode loop stays untouched after this block.

- [ ] **Step 4: Byte-compile and re-run unit tests (imports must still resolve)**

Run: `python -m py_compile backend/tools/build_season_curves.py`
Expected: no output.

Run: `python -m pytest tests/ -v`
Expected: 11 passed (7 seasonality + 4 zone_curves).

- [ ] **Step 5: Smoke-test the CLI wiring without network (help text)**

Run: `python backend/tools/build_season_curves.py --help`
Expected: help output listing `--mode`, `--macros`, `--cell-size`, `--workers`.

- [ ] **Step 6: Commit**

```bash
git add backend/tools/build_season_curves.py
git commit -m "feat(build): --mode zone macro-region orchestration with parallel GBIF fetch"
```

---

## Task 7: Configuration (`.env`)

**Files:**
- Modify: `.env` (repo root; local/untracked — does not get committed)

- [ ] **Step 1: Add the zone-curve env vars**

Add these two lines to `.env` (next to the existing `*_SEASON_CURVES` entries):

```
EU_ZONE_SEASON_CURVES=https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/EU/EU_zone_season_curves.json
US_ZONE_SEASON_CURVES=https://pub-9988c4492e7945f0a2ff14e35232acdf.r2.dev/USA/US_zone_season_curves.json
```

- [ ] **Step 2: Verify they load**

Run: `python -c "import os; from pathlib import Path; [os.environ.update(dict([l.split('=',1)])) for l in Path('.env').read_text().splitlines() if l and not l.startswith('#') and '=' in l]; print(os.environ['EU_ZONE_SEASON_CURVES']); print(os.environ['US_ZONE_SEASON_CURVES'])"`
Expected: both URLs printed.

(No commit — `.env` is untracked.)

---

## Task 8: Build & validate the actual bug fix

**Files:** none modified — this is a verification run.

- [ ] **Step 1: Build EU zone curves locally (no R2 upload)**

Run: `python backend/tools/build_season_curves.py --mode zone --macros EU --local-only --out-dir .`
Expected: progress logs (`N land cells...`), then `EU_zone_season_curves.json` written locally. Wall-clock ~4-6 min.

- [ ] **Step 2: Assert continental Boletus peaks in autumn, not June**

Run:

```bash
python -c "import json; c=json.load(open('EU_zone_season_curves.json'))['continental']['mushroom']; print('Jun', c['6'], 'Aug', c['8'], 'Sep', c['9']); assert float(c['6']) < 1.0, 'June should not boost'; assert float(c['8']) > float(c['6']) and float(c['9']) > float(c['6']), 'autumn should exceed June'; print('OK: continental Boletus de-emphasized in June, peaks autumn')"
```

Expected: `OK: ...` printed (June < 1.0, Aug/Sep > June).

- [ ] **Step 3: Upload both macro-regions to R2**

Run: `python backend/tools/build_season_curves.py --mode zone --macros EU,US`
Expected: `uploaded to R2:` for both `EU_zone_season_curves.json` and `US_zone_season_curves.json`.

- [ ] **Step 4: Confirm a scoring script loads the zone file**

Run: `python -c "import os,json,urllib.request; from io import BytesIO; from pathlib import Path; [os.environ.update(dict([l.split('=',1)])) for l in Path('.env').read_text().splitlines() if l and not l.startswith('#') and '=' in l]; u=os.environ['EU_ZONE_SEASON_CURVES']; d=json.loads(urllib.request.urlopen(u,timeout=60).read()); print('zones:', sorted(d)); print('continental species:', sorted(d.get('continental',{})))"`
Expected: prints the zone list including `continental` and its fungi species.

- [ ] **Step 5: Commit the local curve artifact removal (housekeeping)**

```bash
rm -f EU_zone_season_curves.json US_zone_season_curves.json
```

(Local validation artifacts; nothing to commit. The authoritative copies live in R2.)

---

## Task 9: Finalize the branch

- [ ] **Step 1: Full test run**

Run: `python -m pytest tests/ -v`
Expected: 11 passed.

- [ ] **Step 2: Byte-compile every modified script**

Run:

```bash
python -m py_compile backend/seasonality.py backend/tools/build_season_curves.py backend/EU/North_Europe/NE_Scoring.py backend/EU/South_Europe/SE_Scoring.py backend/US/USE/USE_Scoring.py backend/US/USW/USW_Scoring.py
```

Expected: no output.

- [ ] **Step 3: Sync runtime copies if applicable**

If a separate local runtime copy of the scoring scripts is used (e.g. under `app_operation/Europe/...`, `app_operation/tools/`), copy the updated `backend/seasonality.py`, `backend/tools/build_season_curves.py`, and the four scoring scripts there too. Otherwise skip.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin improvement/climate-zone-season-curves
gh pr create --title "Per-climate-zone season curves" --body "Implements docs/superpowers/specs/2026-06-07-climate-zone-season-curves-design.md. Replaces coarse per-region GBIF curves with per-climate-zone curves, dissolving the NE/SE overlap that inflated Poland Boletus scores."
```

Expected: PR URL printed.

---

## Self-Review Notes

- **Spec coverage:** macro-regions (Task 6 MACROS) ✓; grid-of-cells + majority binning (Task 5) ✓; parallel fetch (Task 6) ✓; fungi-only via existing `TAXON_MAP` (unchanged) ✓; fallback chain zone→region→season_months→1.0 (Task 2 helper, Task 3 wiring) ✓; both EU scripts read same file (Task 3/4 env vars) ✓; graceful degrade via `os.getenv` (Task 3 Step 2) ✓; `.env` vars (Task 7) ✓; validation that continental June < 1.0 (Task 8) ✓; rollout order — scoring lands first and falls back when var unset (Tasks 3-4 before 7-8) ✓.
- **Out of scope (untouched):** plant curves, continuous kernel, download API, `[low,high]` range — none modified.
- **Type consistency:** `season_multiplier_for_species(df, specie, params, zone_curves)` signature identical in module (Task 2) and call site (Task 3 Step 4). `zone_curves` shape `{zone: {species: {month: float}}}` consistent across loader (Task 3 Step 2), helper (Task 2), and builder output (Task 5 `build_zone_curves`). `generate_cells`/`majority_zone_in_cell`/`build_zone_curves` names match between Task 5 defs and Task 6 callers.

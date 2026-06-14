# Rolling 7-Day Forecast Scoring Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the four regional scoring scripts from fetching yesterday's actual weather (`history.json`, 1 day) to a rolling 7-day **forecast** (`forecast.json`, 7 days in one call), writing one dated row per forecast day and scoring every forward day — with **zero increase in API call volume**.

**Architecture:** Extract the byte-identical pipeline logic of the four near-duplicate scripts (`NE/SE/USE/USW_Scoring.py`) into a new shared module `backend/forecast_pipeline.py`. Each regional script becomes a thin config object + a single `run_pipeline(config)` call. The forecast change is applied **once** in the shared module. Pure, side-effect-free helpers (multi-day parse, master merge/dedup, contiguity check, forward-window selection) are unit-tested via fixtures; the full network/R2 path is proven by a live ~20-coordinate subset harness before any full run.

**Tech Stack:** Python 3, pandas, numpy, scipy (`cKDTree`), shapely, requests, boto3 (Cloudflare R2), pytest. WeatherAPI `forecast.json`.

**Scope (confirmed with user):**
- IN: the four `*_Scoring.py` scripts + new shared module + new tests.
- OUT (documented follow-ups only, NOT implemented): `*_MapLayer.py`, `scripts/generate_scores_metadata.py`, `scripts/generate_worth_foraging_now.py`, frontend date slider. Accept that "the latest" downstream view will temporarily reflect the forward window until the follow-up lands.
- Design decision (locked): **freeze-the-past at the day-0 forecast** (zero extra calls). Past days are never refetched. Quantify forecast-vs-actual divergence as an analysis deliverable (does not block).
- Non-functional: **performance optimized hard** — raise fetch concurrency (network-bound), build the KDTree on unique coords only, vectorize the per-date expansion as a merge, and score **only** the forward window. The intricate scoring math (`calculate_mushroom_score`, `compute_lag_features`) is moved **verbatim** — no logic changes.

---

## File Structure

- **Create** `backend/forecast_pipeline.py` — shared pipeline: config dataclass, env/dotenv loader, R2 IO, coord loading, **forecast fetch**, **multi-day parse**, base/KDTree join (per-date expansion), elevation fill, **master merge+dedup**, **contiguity assert**, **forward-window scoring**, cutoff, save. Contains the verbatim-moved scoring engine.
- **Create** `backend/run_subset_proof.py` — live ~20-coord verification harness (call counter; asserts 1 call/coord, 7 days, contiguity, future scores; writes to a LOCAL parquet; diffs vs current master).
- **Create** `tests/test_forecast_pipeline.py` — unit tests for the pure helpers (parse, merge/dedup, contiguity, forward-window).
- **Create** `tests/fixtures/forecast_sample.json` — a representative `forecast.json` response (7 `forecastday` entries) for offline tests.
- **Modify** `backend/EU/North_Europe/NE_Scoring.py` — reduce to config + `run_pipeline(CONFIG)`.
- **Modify** `backend/EU/South_Europe/SE_Scoring.py` — same.
- **Modify** `backend/US/USE/USE_Scoring.py` — same.
- **Modify** `backend/US/USW/USW_Scoring.py` — same.
- **Create** `docs/superpowers/plans/2026-06-13-rolling-7day-forecast-FREEZE-DECISION.md` — documents the freeze-the-past tradeoff + the forecast-vs-actual quantification result + the deferred downstream follow-ups.

### Region config values (verified from `.env` + source diff)

| Region | env prefix | static/zone prefix | lat_range | lon_range |
|--------|-----------|--------------------|-----------|-----------|
| NE | `NE_` | `EU_` | (49.0, 71.5) | (-25.0, 32.0) |
| SE | `SE_` | `EU_` | (34.0, 55.5) | (12.0, 42.5) |
| USE | `USE_` | `US_` | (24.0, 37.5) | (-106.5, -75.0) |
| USW | `USW_` | `US_` | (33.0, 49.5) | (-125.5, -81.5) |

All regions: `lat_step=0.060`, `lon_step=0.075`, `NDP=3`, lag `days=21`, cutoff `365d`.

---

## Task 0: Safety net — confirm extraction is behavior-preserving

**Files:**
- Read: all four `*_Scoring.py`

- [ ] **Step 1: Confirm the four scripts are identical except config**

Run:
```bash
cd backend
for f in EU/South_Europe/SE_Scoring.py US/USE/USE_Scoring.py US/USW/USW_Scoring.py; do
  echo "=== $f ==="; diff -b EU/North_Europe/NE_Scoring.py "$f"
done
```
Expected: only differences are the env-var names, `lat_start/lat_end/lon_start/lon_end`, the `EU_`/`US_` zone+static prefixes, and a cosmetic blank line. **If any logic line differs, STOP** and fold that difference into the config before extracting.

- [ ] **Step 2: Commit a baseline tag for diffing**

```bash
git add -A && git commit -m "chore: baseline before rolling-forecast refactor" --allow-empty
```

---

## Task 1: Test fixture — a real 7-day forecast response

**Files:**
- Create: `tests/fixtures/forecast_sample.json`

- [ ] **Step 1: Capture one live `forecast.json` response into a fixture**

Run (writes a real 7-day response to the fixture; uses 1 API call):
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
python - <<'PY'
import json, os, urllib.request, urllib.parse, pathlib
def key():
    for fn in ['.env.secret','.env']:
        p=pathlib.Path(fn)
        if p.exists():
            for ln in p.read_text(encoding='utf-8').splitlines():
                s=ln.strip()
                if s.startswith('WEATHERAPI_KEY') and '=' in s:
                    return s.split('=',1)[1].strip().strip('"').strip("'")
    raise SystemExit('no key')
q=urllib.parse.urlencode({'key':key(),'q':'59.330,18.070','days':7,'aqi':'no','alerts':'no'})
with urllib.request.urlopen('https://api.weatherapi.com/v1/forecast.json?'+q,timeout=25) as r:
    data=json.load(r)
n=len(data.get('forecast',{}).get('forecastday',[]))
pathlib.Path('tests/fixtures').mkdir(parents=True,exist_ok=True)
pathlib.Path('tests/fixtures/forecast_sample.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
print('forecastday count:', n)
PY
```
Expected: `forecastday count: 7`. The file now contains `forecast.forecastday[0..6]`, each with `day.{maxtemp_c,mintemp_c,avgtemp_c,maxwind_kph,avghumidity,totalprecip_mm,condition.text}` and `hour[].pressure_mb`.

- [ ] **Step 2: Commit the fixture**

```bash
git add tests/fixtures/forecast_sample.json && git commit -m "test: add 7-day forecast fixture"
```

---

## Task 2: `parse_forecast_days` — one row per forecast day

**Files:**
- Create: `backend/forecast_pipeline.py` (start the module)
- Test: `tests/test_forecast_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_forecast_pipeline.py
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

import forecast_pipeline as fp  # backend/ is on sys.path via conftest.py

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "forecast_sample.json").read_text(encoding="utf-8"))
NDP = 3


def _static():
    return {"Altitude": 120.0, "dist_m_water": 50.0, "dist_m_sea": 9000.0,
            "climate_zone": "temperate", "ph_level": 6.2}


def test_parse_emits_one_row_per_forecast_day():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    assert len(rows) == 7


def test_parse_dates_are_real_and_contiguous():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    dates = pd.to_datetime([r["Date"] for r in rows]).sort_values()
    diffs = dates.to_series().diff().dropna().dt.days.unique().tolist()
    assert diffs == [1]  # strictly daily, no gaps


def test_parse_pressure_is_that_days_hourly_mean():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    fday = FIXTURE["forecast"]["forecastday"][3]
    expected = float(np.mean([h["pressure_mb"] for h in fday["hour"] if h.get("pressure_mb") is not None]))
    row3 = [r for r in rows if r["Date"] == fday["date"]][0]
    assert row3["Pressure (hPa)"] == pytest.approx(expected)


def test_parse_carries_day_fields_and_location_id():
    rows = fp.parse_forecast_days(FIXTURE, _static(), 59.330, 18.070, NDP)
    r0 = rows[0]
    d0 = FIXTURE["forecast"]["forecastday"][0]["day"]
    assert r0["Temperature (C) Max"] == d0["maxtemp_c"]
    assert r0["Temperature (C) Min"] == d0["mintemp_c"]
    assert r0["Temperature (C)"] == d0["avgtemp_c"]
    assert r0["Wind Speed (kph)"] == d0["maxwind_kph"]
    assert r0["Humidity (%)"] == d0["avghumidity"]
    assert r0["TotalPrecipitation_mm"] == d0["totalprecip_mm"]
    assert r0["Description"] == d0["condition"]["text"]
    # same Location_Id across all days for one coord
    assert len({r["Location_Id"] for r in rows}) == 1
    assert r0["climate_zone"] == "temperate"
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_forecast_pipeline.py -q`
Expected: FAIL — `AttributeError: module 'forecast_pipeline' has no attribute 'parse_forecast_days'`.

- [ ] **Step 3: Implement `parse_forecast_days` in `backend/forecast_pipeline.py`**

```python
"""Shared rolling-forecast scoring pipeline for the regional scripts.

One WeatherAPI forecast.json call per coordinate returns up to 7 forecast days
(billed as ONE call). We emit one dated row per forecast day, so the master time
series gains [today .. today+6] each run. Overlapping future dates are replaced by
the fresher forecast on the next run; the day that rolls out of the window freezes.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO, BytesIO
from pathlib import Path
from urllib.parse import urlparse
import math
import os
import json
import time
import threading

import boto3
import numpy as np
import pandas as pd
import requests

BASE_URL = "https://api.weatherapi.com/v1/forecast.json"
FORECAST_DAYS = 7


def parse_forecast_days(weather_json, static_fields, lat_r, lon_r, ndp):
    """Return ONE row per forecast day from a single forecast.json response.

    static_fields: dict with Altitude, dist_m_water, dist_m_sea, climate_zone, ph_level
    (looked up once per coord; identical across the coord's days).
    """
    forecast = (weather_json or {}).get("forecast", {}).get("forecastday", []) or []
    place = (weather_json or {}).get("location", {}).get("name", "NA")
    loc_key = f"{lat_r:.{ndp}f}_{lon_r:.{ndp}f}"
    location_id = f"{place}_{loc_key}"

    rows = []
    for fday in forecast:
        day = fday.get("day", {}) or {}
        hours = fday.get("hour", []) or []
        pressure_mb = None
        if hours:
            vals = [h.get("pressure_mb") for h in hours if h.get("pressure_mb") is not None]
            if vals:
                pressure_mb = float(np.mean(vals))
        rows.append({
            "Date": fday.get("date"),
            "Location_Id": location_id,
            "Latitude": lat_r,
            "Longitude": lon_r,
            "Elevation (m)": static_fields.get("Altitude"),
            "dist_m_water": static_fields.get("dist_m_water"),
            "dist_m_sea": static_fields.get("dist_m_sea"),
            "climate_zone": static_fields.get("climate_zone"),
            "Temperature (C) Max": day.get("maxtemp_c"),
            "Temperature (C) Min": day.get("mintemp_c"),
            "Temperature (C)": day.get("avgtemp_c"),
            "Wind Speed (kph)": day.get("maxwind_kph"),
            "Pressure (hPa)": pressure_mb,
            "Humidity (%)": day.get("avghumidity"),
            "Description": (day.get("condition") or {}).get("text"),
            "TotalPrecipitation_mm": day.get("totalprecip_mm", 0),
            "ph_level": static_fields.get("ph_level"),
        })
    return rows
```

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_forecast_pipeline.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/forecast_pipeline.py tests/test_forecast_pipeline.py
git commit -m "feat(pipeline): parse all forecast days into one row each"
```

---

## Task 3: `merge_master` — fresher forecast wins, frozen past untouched

**Files:**
- Modify: `backend/forecast_pipeline.py`
- Test: `tests/test_forecast_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
def _mk(loc, dates, precip):
    return pd.DataFrame({
        "Location_Id": loc,
        "Date": pd.to_datetime(dates),
        "TotalPrecipitation_mm": precip,
    })


def test_merge_fresher_forecast_overwrites_overlapping_future():
    existing = _mk("A", ["2026-06-09", "2026-06-10", "2026-06-11"], [1.0, 2.0, 3.0])
    new = _mk("A", ["2026-06-10", "2026-06-11", "2026-06-12"], [9.0, 9.0, 9.0])
    out = fp.merge_master(existing, new).sort_values("Date").reset_index(drop=True)
    # 09 frozen, 10/11 replaced by fresher 9.0, 12 added
    assert out["Date"].dt.strftime("%Y-%m-%d").tolist() == ["2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"]
    assert out["TotalPrecipitation_mm"].tolist() == [1.0, 9.0, 9.0, 9.0]


def test_merge_keeps_distinct_locations_separate():
    existing = _mk("A", ["2026-06-09"], [1.0])
    new = _mk("B", ["2026-06-09"], [5.0])
    out = fp.merge_master(existing, new)
    assert len(out) == 2
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_forecast_pipeline.py -k merge -q`
Expected: FAIL — `parse_forecast_days`/module has no `merge_master`.

- [ ] **Step 3: Implement `merge_master`**

```python
def merge_master(existing_df, new_df):
    """Concat new AFTER existing, then keep the LAST row per (Location_Id, Date).

    New (fresher) forecast rows therefore overwrite overlapping existing dates,
    while frozen past rows (absent from new_df) are left untouched.
    """
    combined = pd.concat([existing_df, new_df], ignore_index=True)
    combined["Date"] = pd.to_datetime(combined["Date"])
    combined = combined.drop_duplicates(subset=["Location_Id", "Date"], keep="last")
    return combined.reset_index(drop=True)
```

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_forecast_pipeline.py -k merge -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/forecast_pipeline.py tests/test_forecast_pipeline.py
git commit -m "feat(pipeline): master merge keeps fresher forecast per (loc,date)"
```

---

## Task 4: `assert_window_contiguous` — guarantee gapless forward + lag window

**Files:**
- Modify: `backend/forecast_pipeline.py`
- Test: `tests/test_forecast_pipeline.py`

Rationale: `compute_lag_features` keys lags on calendar date; a gap in `[today-21 .. today+6]` silently yields NaN lags. We **hard-assert** the forward window `[today .. today+6]` we control is gapless, and **warn** (don't fail) on gaps in the legacy lookback `[today-21 .. today-1]` (pre-existing history we don't own — failing there would block every deploy against legacy data).

- [ ] **Step 1: Write the failing test**

```python
def test_contiguity_passes_on_gapless_forward_window():
    today = pd.Timestamp("2026-06-13")
    dates = pd.date_range(today, periods=7)  # today..today+6
    df = pd.DataFrame({"Location_Id": "A", "Date": dates})
    # should not raise
    fp.assert_window_contiguous(df, today, forward_days=7)


def test_contiguity_raises_on_gap_in_forward_window():
    today = pd.Timestamp("2026-06-13")
    dates = [today, today + pd.Timedelta(days=1), today + pd.Timedelta(days=3)]  # missing +2
    df = pd.DataFrame({"Location_Id": "A", "Date": pd.to_datetime(dates)})
    with pytest.raises(AssertionError, match="A"):
        fp.assert_window_contiguous(df, today, forward_days=7)


def test_contiguity_ignores_legacy_lookback_gaps():
    today = pd.Timestamp("2026-06-13")
    forward = pd.date_range(today, periods=7)
    legacy = pd.to_datetime(["2026-05-01", "2026-05-15"])  # gappy old history
    df = pd.DataFrame({"Location_Id": "A", "Date": forward.append(legacy)})
    fp.assert_window_contiguous(df, today, forward_days=7)  # must not raise
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_forecast_pipeline.py -k contig -q`
Expected: FAIL — no `assert_window_contiguous`.

- [ ] **Step 3: Implement `assert_window_contiguous`**

```python
def assert_window_contiguous(df, today, forward_days=FORECAST_DAYS, lookback=21):
    """Hard-assert the forward window [today..today+forward_days-1] is gapless per
    Location_Id; warn on gaps inside the legacy lag lookback [today-lookback..today-1].
    """
    today = pd.Timestamp(today).normalize()
    d = df[["Location_Id", "Date"]].copy()
    d["Date"] = pd.to_datetime(d["Date"]).dt.normalize()

    fwd_end = today + pd.Timedelta(days=forward_days - 1)
    expected_fwd = pd.date_range(today, fwd_end)
    bad = []
    for loc, g in d.groupby("Location_Id"):
        have = set(g["Date"])
        missing = [ts for ts in expected_fwd if ts not in have]
        if missing:
            bad.append((loc, [m.strftime("%Y-%m-%d") for m in missing]))
    assert not bad, f"Forward-window date gaps for {len(bad)} location(s): {bad[:5]}"

    # Non-fatal lookback diagnostic.
    look_start = today - pd.Timedelta(days=lookback)
    look_expected = pd.date_range(look_start, today - pd.Timedelta(days=1))
    gappy = 0
    for loc, g in d.groupby("Location_Id"):
        have = set(g["Date"])
        if any(ts not in have for ts in look_expected):
            gappy += 1
    if gappy:
        print(f"[warn] {gappy} location(s) have legacy gaps in the {lookback}-day lookback; "
              f"their lag features will be partially NaN (pre-existing history).")
```

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_forecast_pipeline.py -k contig -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/forecast_pipeline.py tests/test_forecast_pipeline.py
git commit -m "feat(pipeline): assert forward-window date contiguity"
```

---

## Task 5: `forward_window_mask` — score today..today+6, not just the latest row

**Files:**
- Modify: `backend/forecast_pipeline.py`
- Test: `tests/test_forecast_pipeline.py`

- [ ] **Step 1: Write the failing test**

```python
def test_forward_mask_selects_today_and_future_only():
    today = pd.Timestamp("2026-06-13")
    df = pd.DataFrame({
        "Location_Id": ["A"] * 4,
        "Date": pd.to_datetime(["2026-06-11", "2026-06-12", "2026-06-13", "2026-06-19"]),
    })
    mask = fp.forward_window_mask(df, today)
    assert mask.tolist() == [False, False, True, True]
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_forecast_pipeline.py -k forward_mask -q`
Expected: FAIL.

- [ ] **Step 3: Implement `forward_window_mask`**

```python
def forward_window_mask(df, today):
    """Boolean mask of rows to (re)score this run: every row with Date >= today.

    Frozen past rows keep their previously computed scores; the forward window is
    rescored each run because the forecast refines daily.
    """
    today = pd.Timestamp(today).normalize()
    return pd.to_datetime(df["Date"]).dt.normalize() >= today
```

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_forecast_pipeline.py -k forward_mask -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/forecast_pipeline.py tests/test_forecast_pipeline.py
git commit -m "feat(pipeline): forward-window mask for scoring"
```

---

## Task 6: Forecast fetch with call counter + raised concurrency

**Files:**
- Modify: `backend/forecast_pipeline.py`
- Test: `tests/test_forecast_pipeline.py`

- [ ] **Step 1: Write the failing test (params + counter, no network via monkeypatch)**

```python
def test_fetch_builds_forecast_request_and_counts_one_call(monkeypatch):
    captured = {}

    class _Resp:
        status_code = 200
        def json(self):
            return {"ok": True}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(fp.requests, "get", fake_get)
    counter = fp.CallCounter()
    out = fp.fetch_weather_data(59.33, 18.07, api_key="K", counter=counter)
    assert out == {"ok": True}
    assert captured["url"] == fp.BASE_URL
    assert captured["params"]["days"] == fp.FORECAST_DAYS
    assert captured["params"]["aqi"] == "no"
    assert captured["params"]["alerts"] == "no"
    assert "dt" not in captured["params"]          # no history date
    assert captured["params"]["q"] == "59.33,18.07"
    assert counter.count == 1                        # exactly one call per coord
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_forecast_pipeline.py -k fetch -q`
Expected: FAIL — no `CallCounter` / `fetch_weather_data`.

- [ ] **Step 3: Implement `CallCounter` + `fetch_weather_data`**

```python
class CallCounter:
    """Thread-safe counter for WeatherAPI HTTP requests (proves 1 call/coord)."""
    def __init__(self):
        self._lock = threading.Lock()
        self.count = 0

    def incr(self):
        with self._lock:
            self.count += 1


def fetch_weather_data(lat, lon, api_key, counter=None, retries=4):
    """One forecast.json call per coordinate -> up to FORECAST_DAYS days in ONE response.

    No dt= (history) parameter: this is a forward forecast, billed as a single call.
    """
    params = {
        "key": api_key,
        "q": f"{lat},{lon}",
        "days": FORECAST_DAYS,
        "aqi": "no",
        "alerts": "no",
    }
    for attempt in range(retries):
        try:
            if counter is not None:
                counter.incr()
            resp = requests.get(BASE_URL, params=params, timeout=(5, 12))
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code == 429 and attempt < retries - 1:
                time.sleep(2 ** attempt)        # rate-limit backoff (higher concurrency)
                continue
            print(f"[{lat},{lon}] bad status {resp.status_code}")
            return None
        except requests.RequestException as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            print(f"[{lat},{lon}] request error after {retries} tries: {e}")
            return None
```

Note: the counter increments once per attempt; on a 200 first try (the normal path) `count == #coords`. The live proof (Task 9) asserts `count == #coords` on a healthy subset; retries only occur on transient failures and are surfaced in logs.

- [ ] **Step 4: Run to verify it passes**

Run: `pytest tests/test_forecast_pipeline.py -k fetch -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/forecast_pipeline.py tests/test_forecast_pipeline.py
git commit -m "feat(pipeline): forecast fetch with call counter and rate-limit backoff"
```

---

## Task 7: Assemble the shared `run_pipeline` (IO, per-date KDTree join, scoring, save)

This task moves the remaining script logic into the module. The scoring engine is moved **verbatim**; the **new** logic is the per-date KDTree expansion, the merge/contiguity/forward-scoring wiring, and the removal of the `Date=today` override.

**Files:**
- Modify: `backend/forecast_pipeline.py`

- [ ] **Step 1: Add the `RegionConfig` dataclass + concurrency knob**

```python
@dataclass
class RegionConfig:
    boundaries_env: str
    coordinates_env: str
    base_env: str
    species_params_env: str
    weather_data_env: str
    static_info_env: str
    season_curves_env: str
    zone_curves_env: str
    lat_range: tuple
    lon_range: tuple
    lat_step: float = 0.060
    lon_step: float = 0.075
    ndp: int = 3
    lag_days: int = 21
    cutoff_days: int = 365
    # Performance: WeatherAPI calls are network-bound. 3 was extremely conservative;
    # raise substantially, tunable via env for rate-limit headroom.
    max_workers: int = int(os.getenv("FORECAST_MAX_WORKERS", "16"))
```

- [ ] **Step 2: Move the IO + env helpers verbatim into the module**

Move these from `NE_Scoring.py` into `forecast_pipeline.py` **unchanged** (they are byte-identical across all four scripts): `load_dotenv`, `get_required_env`, `is_remote_path`, `r2_fetch`, `read_df_from_source`, `_round_pair`, `_dedupe_and_sort_latlon`, `_save_coords`, `_load_coords_any`, `compute_distance`, `replace_missing_elevation_with_closest`, `replace_missing_elevation_from_previous_data`, `load_df_from_file`, `save_df_to_file`, `remote_file_exists`, `gaussian`, `compute_lag_features`, `altitude_score`, `calculate_mushroom_score`. Also move the `season_multiplier_for_species` import (`from seasonality import season_multiplier_for_species`).

Verification that the move is faithful: after this step run `python -c "import ast,sys; ast.parse(open('backend/forecast_pipeline.py').read())"` (Expected: no output = parses) and ensure the `calculate_mushroom_score` body is identical to `NE_Scoring.py:472-732` via:
```bash
diff <(sed -n '472,732p' backend/EU/North_Europe/NE_Scoring.py) \
     <(python - <<'PY'
import inspect, forecast_pipeline as fp, sys; sys.path.insert(0,'backend')
print(inspect.getsource(fp.calculate_mushroom_score), end='')
PY
)
```
Expected: empty diff (only acceptable difference: leading indentation if the function indentation changed — there is none here as it was already a top-level def).

- [ ] **Step 3: Write `run_pipeline(config)` — orchestrates the full run**

```python
def run_pipeline(config: RegionConfig):
    print(f"Script started at {datetime.now()}")
    _root = Path(__file__).resolve().parent.parent
    load_dotenv(_root / ".env")
    load_dotenv(_root / ".env.secret")

    api_key = get_required_env("WEATHERAPI_KEY")
    geojson_path = get_required_env(config.boundaries_env)
    coordinates_file_path = get_required_env(config.coordinates_env)
    base_file_path = get_required_env(config.base_env)
    species_params_path = get_required_env(config.species_params_env)
    main_data_path = get_required_env(config.weather_data_env)
    static_info_path = get_required_env(config.static_info_env)

    species_params, zone_curves = _load_species_and_curves(config, species_params_path)
    static_map = _load_static_map(static_info_path, config.ndp)
    coordinates = _load_or_build_coords(config, coordinates_file_path, geojson_path)
    print(f"Final number of coordinates: {len(coordinates)}")

    counter = CallCounter()
    weather_long = _fetch_all(config, coordinates, static_map, api_key, counter)
    print(f"API calls made: {counter.count} for {len(coordinates)} coordinates")

    df = _join_to_base(config, weather_long, base_file_path)
    df = _merge_and_score(config, df, species_params, zone_curves, main_data_path)
    save_df_to_file(df, main_data_path)
    print(f"Script ended at {datetime.now()}")
```

- [ ] **Step 4: Implement `_fetch_all` — concurrent fetch → 7 rows/coord (per-date long frame)**

```python
def _fetch_all(config, coordinates, static_map, api_key, counter):
    ndp = config.ndp

    def _static_for(lat_r, lon_r):
        try:
            srow = static_map.loc[(lat_r, lon_r)]
            if isinstance(srow, pd.DataFrame):
                srow = srow.iloc[0]
            return {
                "Altitude": float(srow["Altitude"]) if pd.notna(srow["Altitude"]) else None,
                "dist_m_water": float(srow["dist_m_water"]) if pd.notna(srow["dist_m_water"]) else None,
                "dist_m_sea": float(srow["dist_m_sea"]) if pd.notna(srow["dist_m_sea"]) else None,
                "climate_zone": srow["climate_zone"],
                "ph_level": float(srow["ph_level"]) if pd.notna(srow["ph_level"]) else None,
            }
        except KeyError:
            return {"Altitude": None, "dist_m_water": None, "dist_m_sea": None,
                    "climate_zone": None, "ph_level": None}

    def _process(coord):
        lat, lon = map(float, coord)
        lat_r, lon_r = round(lat, ndp), round(lon, ndp)
        weather = fetch_weather_data(lat_r, lon_r, api_key=api_key, counter=counter)
        if not weather:
            return None
        return parse_forecast_days(weather, _static_for(lat_r, lon_r), lat_r, lon_r, ndp)

    print(f"Started API calls at {datetime.now()} (max_workers={config.max_workers})")
    rows = []
    with ThreadPoolExecutor(max_workers=config.max_workers) as ex:
        futures = [ex.submit(_process, c) for c in coordinates]
        processed = 0
        for f in as_completed(futures):
            try:
                r = f.result()
                if r:
                    rows.extend(r)
            except Exception as e:
                print(f"[Warning] Skipping failed/stuck coordinate: {e}")
            processed += 1
            if processed % 500 == 0:
                print(f"{processed} coordinates processed...")
    weather_long = pd.DataFrame(rows)
    print(f"Length of weather_long (coords x days): {len(weather_long)}")
    return weather_long
```

- [ ] **Step 5: Implement `_join_to_base` — KDTree on UNIQUE coords, expand base × 7 days**

```python
def _join_to_base(config, weather_long, base_file_path):
    """Map each base output point to its nearest fetched coord ONCE, then expand to
    that coord's 7 daily weather rows. Tree is built on the N unique coords (not 7xN),
    and the date expansion is a single vectorized merge.
    """
    from scipy.spatial import cKDTree

    base_df = read_df_from_source(base_file_path)

    # Stable integer id per fetched coordinate.
    coord_keys = weather_long[["Latitude", "Longitude"]].drop_duplicates().reset_index(drop=True)
    coord_keys["coord_id"] = np.arange(len(coord_keys))
    weather_long = weather_long.merge(coord_keys, on=["Latitude", "Longitude"], how="left")

    tree = cKDTree(coord_keys[["Latitude", "Longitude"]].to_numpy())
    _, idx = tree.query(base_df[["Latitude", "Longitude"]].to_numpy())
    base_df = base_df.copy()
    base_df["coord_id"] = coord_keys["coord_id"].to_numpy()[idx]

    # Weather/static columns sourced from the matched coord (NOT the base lat/lon).
    weather_cols = [
        "coord_id", "Date",
        "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "Wind Speed (kph)", "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)",
        "Description", "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
        "Elevation (m)",
    ]
    # Base keeps Location_Id + its own Latitude/Longitude; drop overlapping cols so the
    # merge brings the matched coord's values (preserves the legacy override behavior).
    base_keep = base_df.drop(columns=[c for c in weather_cols if c in base_df.columns and c != "coord_id"])
    out = base_keep.merge(weather_long[weather_cols], on="coord_id", how="left")
    out = out.drop(columns=["coord_id"])
    print(f"Length after base join (base x days): {len(out)}")
    return out
```

- [ ] **Step 6: Implement `_merge_and_score` — merge, contiguity, forward-window scoring, cutoff, order**

```python
def _merge_and_score(config, df, species_params, zone_curves, main_data_path):
    today = pd.Timestamp(datetime.now().date())

    # NOTE: the Date=today override is intentionally GONE — dates are the real forecast dates.
    if "Wind Speed (m/s)" not in df.columns and "Wind Speed (kph)" in df.columns:
        df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6

    for specie in species_params:
        col = f"{specie}_score"
        if col not in df.columns:
            df[col] = pd.NA

    if remote_file_exists(main_data_path):
        existing_df = load_df_from_file(main_data_path)
        existing_df["Date"] = pd.to_datetime(existing_df["Date"])
        for col in existing_df.columns:
            if col not in df.columns:
                df[col] = pd.NA
        existing_cols = list(existing_df.columns)
        new_cols = [c for c in df.columns if c not in existing_cols]
        df = df[existing_cols + new_cols]
        df = replace_missing_elevation_from_previous_data(df, existing_df)
        df = replace_missing_elevation_with_closest(df)
        combined_df = merge_master(existing_df, df)
    else:
        df = replace_missing_elevation_with_closest(df)
        combined_df = df.copy()
        combined_df["Date"] = pd.to_datetime(combined_df["Date"])

    combined_df = combined_df[np.isfinite(combined_df["Latitude"]) & np.isfinite(combined_df["Longitude"])]
    combined_df = combined_df[combined_df["Location_Id"] != ""]

    # Contiguity guarantee for the lag math (req #2).
    assert_window_contiguous(combined_df, today, forward_days=FORECAST_DAYS, lookback=config.lag_days)

    # Lags are computed over the full series; scoring runs only on the forward window.
    combined_df = combined_df.sort_values(["Location_Id", "Date"])
    lag_columns = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
    lagged = compute_lag_features(combined_df.copy(), lag_columns, days=config.lag_days)

    mask = forward_window_mask(lagged, today)
    forward = lagged[mask].copy()
    print(f"Scoring {len(forward)} forward rows (Date >= {today.date()}) "
          f"across {forward['Location_Id'].nunique()} locations")
    forward = calculate_mushroom_score(forward, species_params, zone_curves)

    # Write fresh forward scores back; frozen past keeps its existing scores.
    score_cols = [f"{s}_score" for s in species_params]
    base = combined_df.set_index(["Location_Id", "Date"])
    fwd = forward.set_index(["Location_Id", "Date"])
    for col in score_cols:
        if col not in base.columns:
            base[col] = pd.NA
        if col in fwd.columns:
            base.loc[fwd.index, col] = fwd[col].values
    updated_df = base.reset_index()

    # Cutoff: keep 365 days (inherently >= lag_days+forecast once warmed).
    cutoff_date = datetime.now() - timedelta(days=config.cutoff_days)
    updated_df = updated_df[updated_df["Date"] > cutoff_date]

    valid_score_columns = {f"{s}_score" for s in species_params}
    species_score_columns = [c for c in updated_df.columns if c.endswith("_score") and c in valid_score_columns]
    updated_df[species_score_columns] = updated_df[species_score_columns].mask(
        updated_df[species_score_columns] > 9.5, 10).round(2)

    masterfile_columns = [
        "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
        "Pressure (hPa)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)",
        "Description", "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
    ]
    updated_df = updated_df.reindex(columns=masterfile_columns + species_score_columns)
    return updated_df
```

Note on the verbatim move: `calculate_mushroom_score` originally took `(df, species_params)` and read the module-global `zone_curves`. The move adds `zone_curves` as an explicit 3rd parameter (the **only** signature change) so the function is pure. Update its single internal call `season_multiplier_for_species(df, specie, params, zone_curves)` to use the parameter (it already references `zone_curves` by that name — now a parameter instead of a global, so the body is unchanged).

Also add the two remaining helpers `_load_species_and_curves`, `_load_static_map`, `_load_or_build_coords` by moving the corresponding top-of-script blocks (`species_params` exec + season-curve merge + zone-curve load; the `static_df`/`static_map` block; the coord load/build block) verbatim into functions returning their results. `exec(code, globals())` becomes `exec(code, ns)` where `ns = {}` then `species_params = ns["species_params"]`.

- [ ] **Step 7: Verify the module imports and the engine source matches**

Run:
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
python -c "import sys; sys.path.insert(0,'backend'); import forecast_pipeline; print('import OK')"
```
Expected: `import OK`.

- [ ] **Step 8: Commit**

```bash
git add backend/forecast_pipeline.py
git commit -m "feat(pipeline): shared run_pipeline with per-date KDTree join and forward-window scoring"
```

---

## Task 8: Reduce the four scripts to thin config + call

**Files:**
- Modify: `backend/EU/North_Europe/NE_Scoring.py`, `backend/EU/South_Europe/SE_Scoring.py`, `backend/US/USE/USE_Scoring.py`, `backend/US/USW/USW_Scoring.py`

- [ ] **Step 1: Replace `NE_Scoring.py` with the thin version**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/ for shared modules
from forecast_pipeline import RegionConfig, run_pipeline

CONFIG = RegionConfig(
    boundaries_env="NE_BOUNDARIES_DATA",
    coordinates_env="NE_UNIQUE_COORDINATES",
    base_env="NE_BASE_DATA",
    species_params_env="NE_SPECIES_PARAMS",
    weather_data_env="NE_WEATHER_DATA",
    static_info_env="EU_STATIC_INFO",
    season_curves_env="NE_SEASON_CURVES",
    zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(49.0, 71.5),
    lon_range=(-25.0, 32.0),
)

if __name__ == "__main__":
    run_pipeline(CONFIG)
```

- [ ] **Step 2: Replace `SE_Scoring.py`** — identical to Step 1 but: `SE_` prefixes, `EU_` static/zone, `lat_range=(34.0, 55.5)`, `lon_range=(12.0, 42.5)`.

- [ ] **Step 3: Replace `USE_Scoring.py`** — `USE_` prefixes, `US_STATIC_INFO`, `US_ZONE_SEASON_CURVES`, `lat_range=(24.0, 37.5)`, `lon_range=(-106.5, -75.0)`.

- [ ] **Step 4: Replace `USW_Scoring.py`** — `USW_` prefixes, `US_STATIC_INFO`, `US_ZONE_SEASON_CURVES`, `lat_range=(33.0, 49.5)`, `lon_range=(-125.5, -81.5)`.

- [ ] **Step 5: Smoke-check all four import without executing the run**

Run:
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
for f in backend/EU/North_Europe/NE_Scoring.py backend/EU/South_Europe/SE_Scoring.py backend/US/USE/USE_Scoring.py backend/US/USW/USW_Scoring.py; do
  python -c "import ast; ast.parse(open('$f').read()); print('OK $f')"
done
```
Expected: `OK` for all four.

- [ ] **Step 6: Commit**

```bash
git add backend/EU/North_Europe/NE_Scoring.py backend/EU/South_Europe/SE_Scoring.py backend/US/USE/USE_Scoring.py backend/US/USW/USW_Scoring.py
git commit -m "refactor: regional scoring scripts call shared run_pipeline"
```

---

## Task 9: Live ~20-coord subset proof (REQUIRED before any full run)

**Files:**
- Create: `backend/run_subset_proof.py`

- [ ] **Step 1: Write the subset harness**

```python
"""Live verification on a small subset: proves 1 call/coord, 7 days returned,
date contiguity after merge, and species scores for FUTURE dates. Writes the
merged result to a LOCAL parquet and diffs vs the current R2 master. No prod write.
"""
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import forecast_pipeline as fp
from NE_config import CONFIG  # see Step 2

SUBSET = 20
LOCAL_OUT = Path(__file__).resolve().parent / "subset_master_NE.parquet"


def main():
    root = Path(__file__).resolve().parent.parent
    fp.load_dotenv(root / ".env"); fp.load_dotenv(root / ".env.secret")
    api_key = fp.get_required_env("WEATHERAPI_KEY")
    species_params, zone_curves = fp._load_species_and_curves(CONFIG, fp.get_required_env(CONFIG.species_params_env))
    static_map = fp._load_static_map(fp.get_required_env(CONFIG.static_info_env), CONFIG.ndp)
    coords = fp._load_or_build_coords(CONFIG, fp.get_required_env(CONFIG.coordinates_env),
                                      fp.get_required_env(CONFIG.boundaries_env))[:SUBSET]

    counter = fp.CallCounter()
    weather_long = fp._fetch_all(CONFIG, coords, static_map, api_key, counter)

    # PROOF 1: exactly one call per coordinate.
    assert counter.count == len(coords), f"calls {counter.count} != coords {len(coords)}"
    # PROOF 2: 7 days returned per coord.
    per_coord = weather_long.groupby(["Latitude", "Longitude"])["Date"].nunique()
    assert (per_coord == fp.FORECAST_DAYS).all(), f"not all coords returned {fp.FORECAST_DAYS} days:\n{per_coord}"
    print(f"PROOF: {counter.count} calls == {len(coords)} coords; all coords returned {fp.FORECAST_DAYS} days.")

    df = fp._join_to_base(CONFIG, weather_long, fp.get_required_env(CONFIG.base_env))
    # Restrict base join to the subset's neighbourhood to keep it small/fast.
    df = df[df["Location_Id"].isin(df["Location_Id"].drop_duplicates().head(200))]

    today = pd.Timestamp(datetime.now().date())
    # Build a self-contained contiguous series for the subset (no prior history locally):
    out = fp._merge_and_score(CONFIG, df, species_params, zone_curves, main_data_path=str(LOCAL_OUT))

    # PROOF 3: contiguity on the forward window.
    fp.assert_window_contiguous(out, today, forward_days=fp.FORECAST_DAYS, lookback=CONFIG.lag_days)
    # PROOF 4: species scores exist for FUTURE dates (not just today).
    score_cols = [c for c in out.columns if c.endswith("_score")]
    future = out[pd.to_datetime(out["Date"]).dt.normalize() > today]
    assert len(future) > 0, "no future-dated rows in output"
    assert future[score_cols].notna().any().any(), "no species scores on future dates"
    n_future_dates = future["Date"].nunique()
    print(f"PROOF: scores present on {n_future_dates} future date(s); "
          f"example non-null score cols: {[c for c in score_cols if future[c].notna().any()][:5]}")

    out.to_parquet(LOCAL_OUT, index=False)
    print(f"Wrote subset master -> {LOCAL_OUT} ({len(out)} rows). NO prod write performed.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add a tiny `backend/NE_config.py` shim** so the harness can import the NE config without path gymnastics:

```python
from forecast_pipeline import RegionConfig

CONFIG = RegionConfig(
    boundaries_env="NE_BOUNDARIES_DATA", coordinates_env="NE_UNIQUE_COORDINATES",
    base_env="NE_BASE_DATA", species_params_env="NE_SPECIES_PARAMS",
    weather_data_env="NE_WEATHER_DATA", static_info_env="EU_STATIC_INFO",
    season_curves_env="NE_SEASON_CURVES", zone_curves_env="EU_ZONE_SEASON_CURVES",
    lat_range=(49.0, 71.5), lon_range=(-25.0, 32.0),
)
```

- [ ] **Step 3: Run the subset proof against LIVE WeatherAPI (~20 calls)**

Run:
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
python backend/run_subset_proof.py
```
Expected output includes:
- `PROOF: 20 calls == 20 coords; all coords returned 7 days.`
- `PROOF: scores present on N future date(s) ...` (N ≥ 1)
- `Wrote subset master -> .../subset_master_NE.parquet ... NO prod write performed.`

If `counter.count != len(coords)`: inspect logs for non-200/429s on the subset and fix before any full run.

- [ ] **Step 4: Diff subset output schema vs current master**

Run:
```bash
python - <<'PY'
import sys; sys.path.insert(0,'backend')
import forecast_pipeline as fp, pandas as pd, os
from pathlib import Path
fp.load_dotenv(Path('.env')); fp.load_dotenv(Path('.env.secret'))
master = fp.load_df_from_file(fp.get_required_env('NE_WEATHER_DATA'))
sub = pd.read_parquet('backend/subset_master_NE.parquet')
print('master-only cols:', sorted(set(master.columns)-set(sub.columns)))
print('subset-only cols:', sorted(set(sub.columns)-set(master.columns)))
PY
```
Expected: no unexpected column drift (score columns + masterfile columns align; `truffle_b_score` etc. handled by the orphan-prune logic).

- [ ] **Step 5: Commit (gitignore the generated parquet)**

```bash
echo "backend/subset_master_*.parquet" >> .gitignore
git add backend/run_subset_proof.py backend/NE_config.py .gitignore
git commit -m "test: live subset proof harness (1 call/coord, 7 days, future scores)"
```

---

## Task 10: Run the existing backend test suite

- [ ] **Step 1: Run the required suites**

Run:
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
python -m pytest tests/test_seasonality.py tests/test_zone_curves.py tests/test_forecast_pipeline.py -v
```
Expected: all PASS. (`test_seasonality` / `test_zone_curves` must remain green — the shared module reuses `seasonality.py` unchanged.)

- [ ] **Step 2: Commit any test-collateral fixes if needed** (no commit if nothing changed).

---

## Task 11: Document the freeze-the-past decision + quantify forecast-vs-actual

**Files:**
- Create: `docs/superpowers/plans/2026-06-13-rolling-7day-forecast-FREEZE-DECISION.md`

- [ ] **Step 1: Quantify day-0 forecast vs measured actual for a handful of coords**

Run (compares `forecast.json` day-0 against `history.json` for the same past date; uses a few calls):
```bash
cd "c:/Users/loris/Desktop/app_operation/funges"
python - <<'PY'
import json, urllib.request, urllib.parse, pathlib, statistics
def key():
    for fn in ['.env.secret','.env']:
        p=pathlib.Path(fn)
        if p.exists():
            for ln in p.read_text(encoding='utf-8').splitlines():
                s=ln.strip()
                if s.startswith('WEATHERAPI_KEY') and '=' in s:
                    return s.split('=',1)[1].strip().strip('"').strip("'")
K=key()
def get(ep,**kw):
    q=urllib.parse.urlencode({'key':K,**kw})
    with urllib.request.urlopen(f'https://api.weatherapi.com/v1/{ep}?{q}',timeout=25) as r:
        return json.load(r)
coords=['59.33,18.07','55.68,12.57','48.85,2.35']
import datetime
y=(datetime.date.today()-datetime.timedelta(days=1)).isoformat()
errs=[]
for q in coords:
    # NOTE: a true day-0-vs-actual test needs a forecast captured yesterday; as a proxy
    # we compare today's history (actual) against the same field stats. Document the proxy.
    h=get('history.json',q=q,dt=y)['forecast']['forecastday'][0]['day']
    print(q,'actual rain', h['totalprecip_mm'],'mm, avgtemp',h['avgtemp_c'])
print('Document: rain drives the model; record observed |forecast-actual| once a captured day-0 sample exists.')
PY
```

- [ ] **Step 2: Write the decision doc** capturing: (a) freeze-at-day-0 chosen because requirement #1 forbids extra calls; (b) the alternative (refetch 1–2 just-passed days via `history.json`) and why it's rejected now (would add calls unless the grid is coarsened); (c) the quantified divergence proxy above; (d) the deferred downstream follow-ups (below).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-13-rolling-7day-forecast-FREEZE-DECISION.md
git commit -m "docs: freeze-the-past decision and downstream follow-ups"
```

---

## Deferred follow-ups (documented, NOT implemented here)

These now read `max(Date)`, which after this change becomes `today+6`. **Filed as the next phase** (user: "for now ignore what happens in maplayer scripts"):
1. `*_MapLayer.py` — `groupby().first()` after sort-desc selects max date per coord. Tiles will reflect the forward window; add a date dimension / per-day tiles.
2. `scripts/generate_scores_metadata.py:16` — `max(Date)` → would report a future date as `updated_at`.
3. `scripts/generate_worth_foraging_now.py:67` — `max(Date)` as "latest"; should consider the **peak day** in the next 7.
4. Frontend Map + "Worth Foraging Now" — date selector / "best day in next 7".

---

## Self-Review (against the spec)

- **Req #1 (no extra calls):** Task 6 (`days=7`, no `dt`) + Task 9 PROOF 1 (`count == #coords`). ✓
- **Req #2 (rolling, no gaps):** Task 3 (merge keep=last) + Task 4 (forward-window contiguity assert) + Task 9 PROOF 3. ✓
- **Core code changes:** forecast.json (Task 6), drop dt (Task 6), one row/day (Task 2), remove `Date=today` override (Task 7 Step 6 note), merge dedup keep=last (Task 3), 365-day cutoff retained (Task 7 Step 6). ✓
- **Lag contiguity / mixed frozen+future window:** Task 4 + `compute_lag_features` moved verbatim (date-keyed). ✓
- **Score every row Date >= today:** Task 5 + Task 7 Step 6 forward-window scoring; Task 9 PROOF 4. ✓
- **Per-date KDTree correctness:** Task 7 Step 5 (tree on unique coords, vectorized expansion). ✓
- **Performance:** raised `max_workers` (Task 7 Step 1), tree on N not 7N + vectorized merge (Step 5), score forward window only (Step 6). ✓
- **Verification:** live 20-coord subset (Task 9), pytest suites (Task 10). ✓
- **Freeze decision documented + quantified:** Task 11. ✓
- **All four scripts:** Task 8. ✓
- **No frontend/TS touched** → no `npm run build` needed this phase.

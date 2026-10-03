import json
from datetime import date, timedelta
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import box

from bloom import (CHILL_DAYS, EPOCH, FORCE_BASE, FORCING, LAPSE, build_bloom, daily_normals, peak_index,
                   season)


def test_season_runs_february_to_june():
    assert season(date(2027, 2, 1)) == (date(2026, 11, 1), date(2027, 6, 30))
    assert season(date(2027, 6, 30)) == (date(2026, 11, 1), date(2027, 6, 30))
    assert season(date(2027, 1, 31)) is None
    assert season(date(2026, 10, 1)) is None


def test_peak_after_chill_then_forcing():
    # 10 °C every day: every day counts as chill, so forcing starts on day 119
    # (the 120th) and adds 13 a day; Kanzan's 485 is reached on its 38th day.
    t = np.full((1, 240), 10.0)
    per_day = 10.0 - FORCE_BASE
    expected = CHILL_DAYS - 1 + int(np.ceil(FORCING["kanzan"] / per_day)) - 1
    assert peak_index(t, FORCING["kanzan"])[0] == expected == 156
    assert peak_index(t, FORCING["yoshino"])[0] < expected


def test_no_peak_without_winter_or_warmth():
    warm = np.full((1, 240), 20.0)  # never below 17 °C: no chill, forcing never starts
    cold = np.full((1, 240), -3.0)  # chilled, but nothing above the base
    assert np.isnan(peak_index(np.vstack([warm, cold]), FORCING["kanzan"])).all()


def test_warm_winter_delays_the_peak():
    # Same spring, but the first 60 days are above the chill threshold: the chill count
    # and so the forcing start come 60 days later, and so does the peak.
    t = np.full((2, 240), 10.0)
    t[1, :60] = 18.0
    a, b = peak_index(t, FORCING["kanzan"])
    assert b - a == 60


def _normals(t2m=None, elev=0.0):
    lat, lon = np.meshgrid([49.5, 50.0, 50.5], [7.5, 8.125, 8.75], indexing="ij")
    t2m = np.tile(np.arange(12, dtype=float), (9, 1)) if t2m is None else t2m
    return {"lat": lat.ravel(), "lon": lon.ravel(), "elev": np.full(9, elev), "t2m": t2m}


def test_daily_normals_hits_the_monthly_mean_mid_month():
    # 14 Feb is day 45, the middle of February (month index 1 -> value 1.0).
    out = daily_normals(_normals(), np.array([50.0]), np.array([8.125]), np.array([0.0]), date(2027, 2, 14), 1)
    assert np.isclose(out[0, 0], 1.0)
    # Halfway between mid-January and mid-February.
    out = daily_normals(_normals(), np.array([50.0]), np.array([8.125]), np.array([0.0]), date(2027, 1, 30), 1)
    assert 0.4 < out[0, 0] < 0.6


def test_daily_normals_follow_elevation():
    n = _normals(elev=200.0)
    up = daily_normals(n, np.array([50.0]), np.array([8.125]), np.array([1200.0]), date(2027, 2, 14), 1)
    unknown = daily_normals(n, np.array([50.0]), np.array([8.125]), np.array([np.nan]), date(2027, 2, 14), 1)
    assert np.isclose(up[0, 0], 1.0 - LAPSE * 1000)
    assert np.isclose(unknown[0, 0], 1.0)


def _master(path, today, temps):
    """Master parquet with two base points per cell, from 1 Nov to today + 6."""
    first = season(today)[0]
    days = pd.date_range(first, today + timedelta(days=6))
    rows = []
    for (lat, lon), t in temps.items():
        for dlat in (0.0, 0.02):
            for d in days:
                rows.append({"Location_Id": f"{lat}_{lon}_{dlat}", "Date": d, "Latitude": lat + dlat,
                             "Longitude": lon, "Elevation (m)": 100.0, "Temperature (C) Max": t + 4,
                             "Temperature (C) Min": t - 4, "Temperature (C)": t, "mushroom_score": 1.0})
    pd.DataFrame(rows).to_parquet(path, index=False)


def test_build_bloom_end_to_end(tmp_path):
    today = date(2027, 3, 20)
    _master(tmp_path / "m.parquet", today, {(50.0, 8.0): 10.0, (50.5, 8.0): 6.0})
    normals = _normals(t2m=np.full((9, 12), 10.0), elev=100.0)
    uploads, layers = {}, []

    def build_mbtiles(geojson, mbtiles, layer):
        layers.append((json.loads(Path(geojson).read_text()), layer))
        Path(mbtiles).write_bytes(b"tiles")

    def to_pmtiles(mbtiles, pmtiles):
        Path(pmtiles).write_bytes(Path(mbtiles).read_bytes())
        return True

    def upload(path, key):
        uploads[key] = Path(path).read_bytes()

    # A town over each cell, and one over neither: only built-up ground is drawn.
    towns = gpd.GeoDataFrame(geometry=[box(7.98, 49.98, 8.02, 50.02), box(7.98, 50.48, 8.02, 50.52),
                                       box(20.0, 60.0, 20.1, 60.1)], crs="EPSG:4326")
    out = build_bloom(tmp_path / "m.parquet", "ne", "EU/NE", to_pmtiles, upload, build_mbtiles=build_mbtiles,
                      today=today, normals=normals, towns=towns)

    assert set(uploads) == {"EU/NE/ne_bloom.pmtiles"}
    geojson, layer = layers[0]
    assert layer == "ne_bloom"
    peaks = [f["properties"]["peak"] for f in geojson["features"]]
    assert all(isinstance(p, int) for p in peaks) and len(peaks) == len(set(peaks)) == out["bands"] == 2
    # Each band is its town, not its 0.1° cell.
    bounds = gpd.GeoDataFrame.from_features(geojson["features"]).total_bounds
    assert tuple(round(float(v), 2) for v in bounds) == (7.98, 49.98, 8.02, 50.52)
    # Observed days and normals are both 10 °C at the warmer cell (6 °C observed at the other).
    first_unix = (date(2026, 11, 1) - EPOCH).days
    assert min(peaks) == first_unix + 156


def test_build_bloom_draws_nothing_away_from_towns(tmp_path):
    today = date(2027, 3, 20)
    _master(tmp_path / "m.parquet", today, {(50.0, 8.0): 10.0})
    built = []
    towns = gpd.GeoDataFrame(geometry=[box(20.0, 60.0, 20.1, 60.1)], crs="EPSG:4326")
    out = build_bloom(tmp_path / "m.parquet", "ne", "EU/NE", lambda *a: True, lambda *a: built.append(a),
                      build_mbtiles=lambda *a: built.append(a), today=today,
                      normals=_normals(t2m=np.full((9, 12), 10.0), elev=100.0), towns=towns)
    assert out["drawn"] == 1 and out["bands"] == 0 and built == []


@pytest.mark.parametrize("normal_t, drawn", [(2.5, 1), (1.5, 0)])
def test_build_bloom_draws_only_where_a_normal_year_blooms_by_7_june(tmp_path, normal_t, drawn):
    # This year's 10 °C up to 26 March brings an April peak either way. A normal
    # year at 2.5 °C blooms on 27 May; at 1.5 °C only on 15 June, too cold for the trees.
    today = date(2027, 3, 20)
    _master(tmp_path / "m.parquet", today, {(50.0, 8.0): 10.0})
    towns = gpd.GeoDataFrame(geometry=[box(7.98, 49.98, 8.02, 50.02)], crs="EPSG:4326")
    out = build_bloom(tmp_path / "m.parquet", "ne", "EU/NE", lambda *a: True, lambda *a: None,
                      build_mbtiles=lambda *a: None, today=today,
                      normals=_normals(t2m=np.full((9, 12), normal_t), elev=100.0), towns=towns)
    assert out["drawn"] == drawn


def test_build_bloom_skips_out_of_season(tmp_path):
    def fail(*args):
        raise AssertionError("touched out of season")

    assert build_bloom(tmp_path / "missing.parquet", "ne", "EU/NE", fail, fail, build_mbtiles=fail,
                       today=date(2026, 10, 1)) is None

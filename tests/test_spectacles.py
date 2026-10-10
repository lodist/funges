import json
from datetime import date, timedelta
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import box

import bloom
import bluebell
import superbloom


def _normals(t2m, prec=0.0):
    lat, lon = np.meshgrid([33.5, 34.0, 50.0, 50.5], [-116.25, -115.625, 7.5, 8.125], indexing="ij")
    return {"lat": lat.ravel(), "lon": lon.ravel(), "elev": np.full(16, 100.0), "t2m": np.full((16, 12), t2m),
            "prectotcorr": np.full((16, 12), prec)}


def _master(path, first, last, cells, rain=None):
    """Two base points per cell, every day from `first` to `last`; `rain(day)` ->
    (mm, measured) or no rain columns."""
    rows = []
    for (lat, lon), t in cells.items():
        for dlat in (0.0, 0.02):
            for d in pd.date_range(first, last):
                row = {"Date": d, "Latitude": lat + dlat, "Longitude": lon, "Elevation (m)": 100.0,
                       "Temperature (C) Max": t + 4, "Temperature (C) Min": t - 4}
                if rain:
                    row["TotalPrecipitation_mm"], row["Rain Measured"] = rain(d.date(), dlat)
                rows.append(row)
    pd.DataFrame(rows).to_parquet(path, index=False)


def _capture():
    uploads, layers = {}, []

    def build_mbtiles(geojson, mbtiles, layer):
        layers.append((json.loads(Path(geojson).read_text()), layer))
        Path(mbtiles).write_bytes(b"tiles")

    def to_pmtiles(mbtiles, pmtiles):
        Path(pmtiles).write_bytes(Path(mbtiles).read_bytes())
        return True

    return uploads, layers, build_mbtiles, to_pmtiles, lambda path, key: uploads.__setitem__(key, path)


# --- bluebell ---------------------------------------------------------------------

def test_bluebell_season_runs_march_to_june():
    assert bluebell.season(date(2027, 3, 1)) == (date(2026, 11, 1), date(2027, 6, 30))
    assert bluebell.season(date(2027, 2, 28)) is None and bluebell.season(date(2027, 7, 1)) is None


def test_bluebell_counts_warmth_from_1_april_only():
    # 10 °C adds 8 a day from 1 April (index 151): 169 is reached on its 22nd day, 22 April.
    t = np.full((2, 242), 10.0)
    t[1, bluebell.START:] = 1.0  # a warm winter, then a spring below the base: no peak
    peak = bluebell.peak_index(t)
    assert peak[0] == bluebell.START + 21 and np.isnan(peak[1])


def test_build_bluebell_end_to_end(tmp_path):
    today = date(2027, 4, 10)
    _master(tmp_path / "m.parquet", date(2026, 11, 1), today + timedelta(days=6), {(50.0, 8.0): 10.0, (50.5, 8.0): 10.0})
    uploads, layers, build_mbtiles, to_pmtiles, upload = _capture()
    ground = gpd.GeoDataFrame(geometry=[box(7.9, 49.9, 8.1, 50.1)], crs="EPSG:4326")  # under one cell only
    out = bluebell.build_bluebell(tmp_path / "m.parquet", "ne", "EU/NE", to_pmtiles, upload,
                                  build_mbtiles=build_mbtiles, today=today, normals=_normals(10.0), ground=ground)
    assert set(uploads) == {"EU/NE/ne_bluebell.pmtiles"} and layers[0][1] == "ne_bluebell"
    assert out == {"cells": 2, "drawn": 2, "bands": 1}
    [feature] = layers[0][0]["features"]
    assert feature["properties"] == {"peak": (date(2027, 4, 22) - bloom.EPOCH).days}


def test_build_bluebell_skips_out_of_season(tmp_path):
    def fail(*args):
        raise AssertionError("touched out of season")

    assert bluebell.build_bluebell(tmp_path / "missing.parquet", "ne", "EU/NE", fail, fail, build_mbtiles=fail,
                                   today=date(2027, 2, 1)) is None


# --- superbloom -------------------------------------------------------------------

def test_superbloom_season_runs_january_to_may():
    assert superbloom.season(date(2027, 1, 1)) == (date(2026, 10, 1), date(2027, 5, 31))
    assert superbloom.season(date(2026, 12, 31)) is None and superbloom.season(date(2027, 6, 1)) is None


def test_rain_share_sets_the_strength_and_a_missing_day_counts_as_normal():
    normal = np.full((5, 10), 2.0)
    rain = np.array([[np.nan] * 10, [1.0] * 10, [1.3] * 10, [3.2] * 10, [np.nan] * 10])
    normal[4] = 0.0  # no normal: an unknown share, which is no bloom
    ratio = superbloom.rain_ratio(rain, normal, end=9)
    assert np.allclose(ratio[:4], [1.0, 0.5, 0.65, 1.6])
    assert list(superbloom.strength(ratio)) == [2, 0, 1, 3, 0]


def test_peak_waits_for_the_rain():
    normal = np.full((2, 130), 1.0)
    rain = np.full((2, 130), 1.0)
    rain[1, :50] = 0.0  # dry until day 50: 40% of the normal (40 mm) comes on day 89
    start = superbloom.forcing_start(rain, normal, first=10, end=99)
    assert list(start) == [39, 89]  # the wet row reaches 40 mm on day 39, after `first`
    t = np.full((2, 130), 50.0)  # 50 degree-days a day: 840 takes 17 days
    assert list(superbloom.peak_index(t, start)) == [39 + 16, 89 + 16]


def _rain(today):
    """1 mm a day measured, except a glitched point (300 mm) and unmeasured days near today."""
    def rain(day, dlat):
        if day > today - timedelta(days=10):
            return 50.0, False  # WeatherAPI's stored rain: ignored, counts as normal
        return (300.0 if dlat else 1.0), True
    return rain


# Measured 1 mm a day (0.89 scaled) from 1 Oct to 31 Jan, then normals: 108% of a
# 0.8 mm normal, 52% of 3 mm, 166% of 0.45 mm.
@pytest.mark.parametrize("normal_mm, level", [(0.8, 2), (3.0, 0), (0.45, 3)])
def test_build_superbloom_end_to_end(tmp_path, normal_mm, level):
    today = date(2027, 2, 10)
    _master(tmp_path / "m.parquet", date(2026, 10, 1), today + timedelta(days=6), {(33.5, -116.0): 15.0},
            rain=_rain(today))
    uploads, layers, build_mbtiles, to_pmtiles, upload = _capture()
    ground = gpd.GeoDataFrame(geometry=[box(-116.1, 33.4, -115.9, 33.6)], crs="EPSG:4326")
    out = superbloom.build_superbloom(tmp_path / "m.parquet", "usw", "USA/USW", to_pmtiles, upload,
                                      build_mbtiles=build_mbtiles, today=today,
                                      normals=_normals(15.0, prec=normal_mm), ground=ground)
    assert set(uploads) == {"USA/USW/usw_superbloom.pmtiles"} and layers[0][1] == "usw_superbloom"
    [feature] = layers[0][0]["features"]
    assert feature["properties"]["level"] == level
    # From 15 January: 33 observed days at 15 °C + TEMP_OFFSET to 16 February, then
    # normals at 15 °C reach 840 on 9 March. A dry winter's "no bloom" is dated by
    # warmth alone, the same day.
    assert feature["properties"]["peak"] == (date(2027, 3, 9) - bloom.EPOCH).days
    assert out["drawn"] == 1


def test_superbloom_refuses_a_master_without_measured_rain(tmp_path):
    today = date(2027, 2, 10)
    _master(tmp_path / "m.parquet", date(2026, 10, 1), today, {(33.5, -116.0): 15.0})
    with pytest.raises(ValueError, match="Rain Measured"):
        superbloom.build_superbloom(tmp_path / "m.parquet", "usw", "USA/USW", None, None, today=today,
                                    normals=_normals(15.0, prec=1.0), ground=gpd.GeoDataFrame(geometry=[]))


def test_every_spectacle_is_registered():
    names = [name for name, *_ in bloom._spectacles()]
    assert names == ["cherry_blossom", "bluebell", "superbloom"]

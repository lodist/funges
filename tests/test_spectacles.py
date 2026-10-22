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
import foliage
import heather
import r2
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


# --- heather ----------------------------------------------------------------------

def test_heather_season_runs_july_to_september():
    assert heather.season(date(2027, 7, 1)) == (date(2027, 1, 1), date(2027, 10, 31))
    assert heather.season(date(2027, 6, 30)) is None and heather.season(date(2027, 10, 1)) is None


def test_heather_peaks_on_its_normal_date_moved_by_a_quarter_of_the_lead():
    normal = np.full((2, 304), 12.0)
    warm = normal.copy()
    warm[1] += 2.0  # 14 °C instead of 12: the normal sum at 19 August comes 24 days earlier
    peak = heather.peak_index(warm, normal)
    assert peak[0] == heather.NORMAL_PEAK
    lead = (heather.NORMAL_PEAK - heather.START + 1) * 12.0 / 14.0 - (heather.NORMAL_PEAK - heather.START + 1)
    assert np.isclose(peak[1], heather.NORMAL_PEAK + heather.K * np.ceil(lead), atol=heather.K)


def test_build_heather_end_to_end(tmp_path):
    today = date(2027, 8, 1)
    _master(tmp_path / "m.parquet", date(2027, 1, 1), today + timedelta(days=6), {(50.0, 8.0): 12.0})
    uploads, layers, build_mbtiles, to_pmtiles, upload = _capture()
    ground = gpd.GeoDataFrame(geometry=[box(7.9, 49.9, 8.1, 50.1)], crs="EPSG:4326")
    heather.build_heather(tmp_path / "m.parquet", "ne", "EU/NE", to_pmtiles, upload, build_mbtiles=build_mbtiles,
                          today=today, normals=_normals(12.0), ground=ground)
    assert set(uploads) == {"EU/NE/ne_heather.pmtiles"} and layers[0][1] == "ne_heather"
    # Observed and normal temperatures alike: the normal date, 19 August.
    [feature] = layers[0][0]["features"]
    assert feature["properties"]["peak"] == (date(2027, 8, 19) - bloom.EPOCH).days


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


def test_bands_blend_between_cells_and_end_halfway_to_an_empty_one():
    # Two neighbouring cells peaking 10 days apart: the days in between are drawn
    # between them, and the drawn area stops halfway to the cells around, corners cut.
    ground = gpd.GeoDataFrame(geometry=[box(7.0, 49.0, 9.0, 51.0)], crs="EPSG:4326")
    out = bloom._bands(np.array([500, 500]), np.array([80, 81]), {"peak": np.array([100.0, 110.0])}, ground)
    assert sorted(out.peak) == [100, 102, 104, 106, 108, 110]
    assert np.allclose(out.total_bounds, [7.95, 49.95, 8.15, 50.05])
    assert out.area.sum() < 0.2 * 0.1


def test_bands_fill_a_hole_in_the_lattice_but_not_past_its_edge():
    # A 5 x 5 block of cells without its centre (no base points there): the hole is
    # drawn from its neighbours, while the block's outer edge stays where it was.
    ground = gpd.GeoDataFrame(geometry=[box(7.0, 49.0, 9.0, 51.0)], crs="EPSG:4326")
    cy, cx = np.meshgrid(np.arange(498, 503), np.arange(78, 83), indexing="ij")
    keep = ~((cy == 500) & (cx == 80))
    out = bloom._bands(cy[keep], cx[keep], {"peak": np.full(keep.sum(), 100.0)}, ground)
    assert out.contains(gpd.points_from_xy([8.0], [50.0])[0]).any()
    assert np.allclose(out.total_bounds, [7.75, 49.75, 8.25, 50.25])


# --- fall foliage -----------------------------------------------------------------

def test_foliage_season_runs_september_to_november():
    assert foliage.season(date(2026, 9, 1)) == (date(2026, 7, 1), date(2026, 12, 31))
    assert foliage.season(date(2026, 8, 31)) is None and foliage.season(date(2026, 12, 1)) is None


def test_foliage_counts_cooling_from_15_august_with_a_requirement_per_row():
    # 13 °C adds 20 a day from 15 August (index 45): 1,031 is reached on its 52nd day
    # (5 October), the aspens' 897 on its 45th.
    t = np.full((2, 184), 13.0)
    peak = foliage.peak_index(t, np.array([foliage.REQUIREMENT, foliage.ASPEN_REQUIREMENT]))
    assert list(peak) == [foliage.START + 51, foliage.START + 44]
    t[0, : foliage.START] = -20.0  # cold before 15 August does not count
    assert foliage.peak_index(t)[0] == foliage.START + 51


def test_foliage_requirement_by_place():
    lon = np.array([-80.0, -105.0, -105.0, -120.0, -120.0])
    elev = np.array([2000.0, 2500.0, 800.0, 300.0, np.nan])
    assert list(foliage.requirement_of(lon, elev)) == [
        foliage.REQUIREMENT, foliage.ASPEN_REQUIREMENT, foliage.REQUIREMENT,
        foliage.PACIFIC_REQUIREMENT, foliage.PACIFIC_REQUIREMENT]


def test_foliage_europe_requirement_and_larch(monkeypatch):
    assert list(foliage.eu_requirement_of([50.0, 65.0])) == [foliage.EU_REQUIREMENT, foliage.BOREAL_REQUIREMENT]
    # No line on the map: from 57 to 61 N the requirement moves evenly from the temperate to the boreal one.
    lo, hi = foliage.BOREAL_RAMP
    ramp = foliage.eu_requirement_of([lo, (lo + hi) / 2, hi])
    assert list(ramp) == [foliage.EU_REQUIREMENT, (foliage.EU_REQUIREMENT + foliage.BOREAL_REQUIREMENT) / 2,
                          foliage.BOREAL_REQUIREMENT]
    steps = np.abs(np.diff(foliage.eu_requirement_of(np.arange(55.0, 63.0, 0.1))))
    assert steps.max() < 20.0  # °C·days per 0.1° cell: under a day's cooling
    mask = np.zeros((10, 10), bool)
    mask[2, 3] = True  # one larch cell: 52-53 N, 3-4 E
    monkeypatch.setattr(foliage, "larch_mask", lambda: (50.0, 0.0, 1.0, mask))
    # A larch cell at any height; the Alps from 1,300 m only; elsewhere no.
    assert list(foliage.is_larch([52.5, 46.5, 46.5, 55.0], [3.5, 9.8, 9.8, 5.0],
                                 [0.0, 1800.0, 900.0, 1800.0])) == [True, True, False, False]
    assert foliage.larch_mask is not None and np.load(r2.generated(bloom._BACKEND / "generated" / "larch_mask_EU.npz"))["mask"].any()


def test_build_foliage_in_europe_colours_broadleaf_woods_on_its_requirement(tmp_path):
    today = date(2026, 10, 1)
    _master(tmp_path / "m.parquet", date(2026, 7, 1), today + timedelta(days=6), {(50.0, 8.0): 13.0})
    land = gpd.GeoDataFrame({"raster_val": [311, 322, 312]},
                            geometry=[box(7.96, 49.96, 8.04, 50.04), box(7.96, 50.0, 8.04, 50.04),
                                      box(7.96, 49.96, 8.0, 50.0)], crs="EPSG:4326")
    uploads, layers, build_mbtiles, to_pmtiles, upload = _capture()
    out = foliage.build_foliage(tmp_path / "m.parquet", "ne", "EU/NE", to_pmtiles, upload, land=land,
                                build_mbtiles=build_mbtiles, today=today, normals=_normals(13.0))
    assert set(uploads) == {"EU/NE/ne_foliage.pmtiles"}
    # The broadleaf wood only: heath is no wood, and a lowland conifer wood off the larch
    # cells is not larch. 13 °C adds 20 a day from 15 August: 1,539 on 30 October.
    [feature] = layers[0][0]["features"]
    assert feature["properties"] == {"peak": (date(2026, 10, 30) - bloom.EPOCH).days} and out["pieces"] == 1


def test_sample_colours_each_piece_by_the_forecast_at_its_middle():
    pieces = gpd.GeoDataFrame(geometry=[box(7.99, 49.99, 8.01, 50.01), box(8.09, 49.99, 8.11, 50.01),
                                        box(20.0, 60.0, 20.1, 60.1)], crs="EPSG:4326")
    out = bloom._sample(np.array([500, 500]), np.array([80, 81]), {"peak": np.array([100.0, 110.0])}, pieces)
    assert list(out.peak) == [100, 110]  # each cell's own value; the piece far from any cell is dropped


def test_build_foliage_colours_the_woods_only(tmp_path):
    today = date(2026, 10, 1)
    _master(tmp_path / "m.parquet", date(2026, 7, 1), today + timedelta(days=6),
            {(40.0, -80.0): 13.0, (40.0, -105.0): 13.0})
    land = gpd.GeoDataFrame({"raster_val": [41, 42, 43]},
                            geometry=[box(-80.04, 39.96, -79.96, 40.04), box(-80.04, 40.0, -79.96, 40.04),
                                      box(-105.04, 39.96, -104.96, 40.04)], crs="EPSG:4326")
    uploads, layers, build_mbtiles, to_pmtiles, upload = _capture()
    normals = _normals(13.0)
    normals["lat"], normals["lon"] = np.repeat([39.5, 40.0, 40.5, 41.0], 4), np.tile([-105.0, -104.375, -80.0, -79.375], 4)
    out = foliage.build_foliage(tmp_path / "m.parquet", "use", "USA/USE", to_pmtiles, upload, land=land,
                                build_mbtiles=build_mbtiles, today=today, normals=normals)
    assert set(uploads) == {"USA/USE/use_foliage.pmtiles"} and layers[0][1] == "use_foliage"
    # The deciduous and mixed pieces, not the evergreen one. The western one lies at 100 m
    # in the interior, which keeps the eastern requirement: both peak on 5 October.
    peaks = [f["properties"]["peak"] for f in layers[0][0]["features"]]
    assert peaks == [(date(2026, 10, 5) - bloom.EPOCH).days] * 2 and out["pieces"] == 2
    assert foliage.build_foliage(tmp_path / "m.parquet", "use", "USA/USE", to_pmtiles, upload, today=today) is None


def test_every_spectacle_is_registered():
    names = [name for name, *_ in bloom._spectacles()]
    assert names == ["cherry_blossom", "bluebell", "heather", "superbloom", "foliage"]

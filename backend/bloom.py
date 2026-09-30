"""Cherry blossom peak-bloom forecast (roadmap #272 step 5).

A cherry peaks once winter is over and enough warmth has built up. Winter is the
count of days with a mean below CHILL_BELOW since 1 November. From the day it
reaches CHILL_DAYS (1 March in most of Europe and the US, later where winters are
warm), each day adds its mean above FORCE_BASE, and the peak is the day the sum
reaches the variety's FORCING. Where winter never gets there (south Florida) or the
sum is not reached by 30 June there is no peak, and nothing is drawn.

Fitted on NASA POWER temperatures, the source of the normals as well:
docs/species/2026-09-30-cherry-blossom.md. The map follows Prunus serrulata
('Kanzan'); each spot names its own variety.

Called at the end of each *_MapLayer.py, which hands over its own tile and upload
helpers; it does nothing outside 1 February - 30 June.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

CHILL_BELOW = 17.0  # °C, daily mean
CHILL_DAYS = 120
FORCE_BASE = -3.0  # °C
FORCING = {"yoshino": 285.0, "kanzan": 485.0}  # °C·days above FORCE_BASE
MAP_VARIETY = "kanzan"
CELL = 0.1  # degrees; base points are averaged into cells this size
LAPSE = 0.0065  # °C per metre, moves a normal to a cell's elevation
PAST_DAYS = 14  # a cell stays on the map this long after its peak
EPOCH = date(1970, 1, 1)

_BACKEND = Path(__file__).resolve().parent
SPOTS_PATH = _BACKEND.parent / "src" / "data" / "bloom-spots.json"
NORMALS_MACRO = {"ne": "EU", "se": "EU", "use": "US", "usw": "US"}
# Day of year at the middle of each month, where a monthly normal applies exactly.
_MID = np.array([15.5, 45.0, 74.5, 105.0, 135.5, 166.0, 196.5, 227.5, 258.0, 288.5, 319.0, 349.5])
_COLS = ["Date", "Latitude", "Longitude", "Elevation (m)", "Temperature (C) Max", "Temperature (C) Min"]


def season(today):
    """First and last day of the season `today` falls in, or None outside 1 Feb - 30 Jun."""
    if not 2 <= today.month <= 6:
        return None
    return date(today.year - 1, 11, 1), date(today.year, 6, 30)


def peak_index(tmean, forcing):
    """Index of the peak day in each row of `tmean` (points x days from 1 Nov), NaN if none.

    `tmean` must be complete: a NaN stops the sums from ever reaching the target.
    """
    chill = np.cumsum(tmean < CHILL_BELOW, axis=1)
    heat = np.cumsum(np.where(chill >= CHILL_DAYS, np.maximum(tmean - FORCE_BASE, 0.0), 0.0), axis=1)
    done = heat >= forcing
    idx = done.argmax(axis=1).astype(float)
    idx[~done.any(axis=1)] = np.nan
    return idx


def _unit(lat, lon):
    la, lo = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    return np.column_stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def daily_normals(normals, lat, lon, elev, first, n_days):
    """Normal daily mean temperature, points x n_days from `first`.

    Inverse-distance mean of the four nearest POWER cells, each moved to the point's
    elevation (unmoved where it is unknown), with the monthly means interpolated
    linearly between mid-months.
    """
    from scipy.spatial import cKDTree

    dist, near = cKDTree(_unit(normals["lat"], normals["lon"])).query(_unit(lat, lon), k=4)
    w = 1.0 / np.maximum(dist, 1e-9) ** 2
    w /= w.sum(axis=1, keepdims=True)
    dz = normals["elev"][near] - np.asarray(elev, float)[:, None]
    monthly = normals["t2m"][near] + LAPSE * np.nan_to_num(dz)[..., None]
    monthly = (w[..., None] * monthly).sum(axis=1)  # points x 12
    doy = np.array([(first + timedelta(days=d)).timetuple().tm_yday for d in range(n_days)], float)
    ext = np.concatenate([[_MID[-1] - 365], _MID, [_MID[0] + 365]])
    month = np.concatenate([[11], np.arange(12), [0]])
    hi = np.searchsorted(ext, doy, side="right").clip(1, len(ext) - 1)
    frac = (doy - ext[hi - 1]) / (ext[hi] - ext[hi - 1])
    return monthly[:, month[hi - 1]] * (1 - frac) + monthly[:, month[hi]] * frac


def _cells(path, first, n_days):
    """Daily (Tmax + Tmin) / 2 per CELL from the master parquet, one row group at a time.

    Two passes over a few columns: the first finds the cells, the second sums into a
    cells x days matrix, so a region's winter never sits in pandas at base resolution.
    Returns cell lattice indices (cy, cx), mean elevation, and the matrix (NaN = no data).
    """
    pf = pq.ParquetFile(path)

    def keys(df):
        cy = np.rint(df["Latitude"].to_numpy(float) / CELL).astype(np.int64)
        cx = np.rint(df["Longitude"].to_numpy(float) / CELL).astype(np.int64)
        return cy * 100_000 + cx  # |cx| < 1800, so the pair packs into one key

    found = [np.unique(keys(pf.read_row_group(rg, columns=["Latitude", "Longitude"]).to_pandas()))
             for rg in range(pf.num_row_groups)]
    cell_keys = np.unique(np.concatenate(found)) if found else np.array([], np.int64)
    n = len(cell_keys)
    t_sum, t_cnt = np.zeros(n * n_days), np.zeros(n * n_days)
    e_sum, e_cnt = np.zeros(n), np.zeros(n)
    for rg in range(pf.num_row_groups):
        df = pf.read_row_group(rg, columns=_COLS).to_pandas()
        row = np.searchsorted(cell_keys, keys(df))
        elev = df["Elevation (m)"].to_numpy(float)
        ok = np.isfinite(elev)
        e_sum += np.bincount(row[ok], weights=elev[ok], minlength=n)
        e_cnt += np.bincount(row[ok], minlength=n)
        day = (pd.to_datetime(df["Date"]).dt.normalize() - pd.Timestamp(first)).dt.days.to_numpy()
        t = (df["Temperature (C) Max"].to_numpy(float) + df["Temperature (C) Min"].to_numpy(float)) / 2
        ok = (day >= 0) & (day < n_days) & np.isfinite(t)
        flat = row[ok] * n_days + day[ok]
        t_sum += np.bincount(flat, weights=t[ok], minlength=n * n_days)
        t_cnt += np.bincount(flat, minlength=n * n_days)
    with np.errstate(invalid="ignore", divide="ignore"):
        obs = (t_sum / t_cnt).reshape(n, n_days)
        elev = e_sum / e_cnt
    cy = np.floor_divide(cell_keys + 50_000, 100_000)
    return cy, cell_keys - cy * 100_000, elev, obs


def _local_master(path):
    """A local copy of a remote master (the caller deletes it), or the path itself."""
    if not str(path).startswith(("http://", "https://")):
        return str(path), False
    import requests

    fd, name = tempfile.mkstemp(suffix=".parquet")
    with os.fdopen(fd, "wb") as f, requests.get(path, timeout=600, stream=True) as r:
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
            f.write(chunk)
    return name, True


def _bands(cy, cx, peak):
    """One feature per peak day: the cells' squares dissolved, so tiles carry ~100 features."""
    import geopandas as gpd
    from shapely.geometry import box

    # Edges from the integer lattice, so neighbouring squares share them bit for bit
    # and the dissolve leaves no slivers between them.
    squares = [box((x - 0.5) * CELL, (y - 0.5) * CELL, (x + 0.5) * CELL, (y + 0.5) * CELL)
               for y, x in zip(cy, cx)]
    cells = gpd.GeoDataFrame({"peak": peak.astype(int)}, geometry=squares, crs="EPSG:4326")
    return cells.dissolve(by="peak", as_index=False)


def build_bloom(master_path, region_code, r2_prefix, build_mbtiles, to_pmtiles, upload,
                *, today=None, spots=None, normals=None):
    """Build and upload `<region>_bloom.pmtiles` and `<region>_bloom_spots.json`.

    build_mbtiles(geojson, mbtiles, layer), to_pmtiles(mbtiles, pmtiles) -> bool and
    upload(path, key) are the calling MapLayer script's own helpers. Returns a small
    summary, or None out of season.
    """
    today = today or date.today()
    span = season(today)
    if span is None:
        print(f"Bloom: out of season on {today}, skipped.")
        return None
    first, last = span
    n_days = (last - first).days + 1
    spots = spots if spots is not None else json.loads(SPOTS_PATH.read_text(encoding="utf-8"))
    spots = [s for s in spots if s["region"].lower() == region_code]
    if normals is None:
        normals = dict(np.load(_BACKEND / "generated" / f"bloom_normals_{NORMALS_MACRO[region_code]}.npz"))

    local, downloaded = _local_master(master_path)
    try:
        cy, cx, elev, obs = _cells(local, first, n_days)
    finally:
        if downloaded:
            os.unlink(local)
    tmean = np.where(np.isfinite(obs), obs, daily_normals(normals, cy * CELL, cx * CELL, elev, first, n_days))
    del obs
    base = (first - EPOCH).days
    peak = base + peak_index(tmean, FORCING[MAP_VARIETY])
    drawn = np.isfinite(peak) & (peak >= (today - EPOCH).days - PAST_DAYS)
    print(f"Bloom {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn "
          f"({int(np.isnan(peak).sum())} without a peak)")

    spot_peaks = {}
    if spots and len(cy):
        from scipy.spatial import cKDTree

        dist, rows = cKDTree(_unit(cy * CELL, cx * CELL)).query(
            _unit([s["lat"] for s in spots], [s["lon"] for s in spots]))
        for s, d, r in zip(spots, dist, rows):
            if d > np.radians(3 * CELL):  # no cell of this region near it: a wrong `region` in the spots file
                print(f"Bloom {region_code}: spot {s['id']} is {np.degrees(d):.1f}° from the nearest cell, skipped")
                continue
            i = peak_index(tmean[r:r + 1], FORCING[s["variety"]])[0]
            spot_peaks[s["id"]] = None if np.isnan(i) else int(base + i)

    bands = 0
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        # Nothing left to draw late in June: the last tileset's cells are all past by
        # then, which the map paints transparent, so it can stay.
        if drawn.any():
            geojson = tmp / f"{region_code}_bloom.geojson"
            features = _bands(cy[drawn], cx[drawn], peak[drawn])
            bands = len(features)
            geojson.write_text(features.to_json(), encoding="utf-8")
            mbtiles, pmtiles = tmp / f"{region_code}_bloom.mbtiles", tmp / f"{region_code}_bloom.pmtiles"
            build_mbtiles(geojson, mbtiles, f"{region_code}_bloom")
            if Path(mbtiles).exists() and to_pmtiles(mbtiles, pmtiles):
                upload(pmtiles, f"{r2_prefix}/{region_code}_bloom.pmtiles")
        spots_json = tmp / f"{region_code}_bloom_spots.json"
        spots_json.write_text(json.dumps({"generated": today.isoformat(), "peaks": spot_peaks}), encoding="utf-8")
        upload(spots_json, f"{r2_prefix}/{region_code}_bloom_spots.json")
    return {"cells": len(peak), "drawn": int(drawn.sum()), "bands": bands, "spots": spot_peaks}

"""Cherry blossom peak-bloom forecast (roadmap #272 step 5).

A cherry peaks once winter is over and enough warmth has built up. Winter is the
count of days with a mean below CHILL_BELOW since 1 November. From the day it
reaches CHILL_DAYS (1 March in most of Europe and the US, later where winters are
warm), each day adds its mean above FORCE_BASE, and the peak is the day the sum
reaches the variety's FORCING. Where winter never gets there (south Florida) or the
sum is not reached by 30 June there is no peak, and nothing is drawn.

The trees are planted in towns and cities, so the cells are clipped to Natural
Earth's built-up areas (backend/generated/bloom_towns_*.geojson, from
backend/tools/build_bloom_towns.py): the layer shows where they are, not the land.

Fitted on NASA POWER temperatures, the source of the normals as well:
docs/species/2026-09-30-cherry-blossom.md. The map follows Prunus serrulata
('Kanzan'); FORCING keeps the Yoshino requirement the DC fit gives as well.

Called at the end of each *_MapLayer.py through build_spectacles, which builds
every spectacle in season from one download of the master: this one, bluebell.py
and superbloom.py, which share the helpers below. Cherry blossom does nothing
outside 1 February - 30 June.
"""
from __future__ import annotations

import os
import shutil
import subprocess
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
# Where the trees can be planted at all: a town is drawn only if a normal (1991-2020)
# year brings its bloom by this day. The latest place with planted Japanese cherries
# on iNaturalist, Umeå, comes on 2 June; Tromsø (14 June) and the ski towns have none.
LATEST_NORMAL_PEAK = (6, 7)  # month, day
CELL = 0.1  # degrees; base points are averaged into cells this size
LAPSE = 0.0065  # °C per metre, moves a normal to a cell's elevation
EPOCH = date(1970, 1, 1)

_BACKEND = Path(__file__).resolve().parent
NORMALS_MACRO = {"ne": "EU", "se": "EU", "use": "US", "usw": "US"}
# Day of year at the middle of each month, where a monthly normal applies exactly.
_MID = np.array([15.5, 45.0, 74.5, 105.0, 135.5, 166.0, 196.5, 227.5, 258.0, 288.5, 319.0, 349.5])
_COLS = ["Date", "Latitude", "Longitude", "Elevation (m)", "Temperature (C) Max", "Temperature (C) Min"]
_RAIN_COLS = ["TotalPrecipitation_mm", "Rain Measured"]


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


def daily_normals(normals, lat, lon, elev, first, n_days, key="t2m"):
    """Normal daily mean temperature (or `key`: "prectotcorr", rain in mm/day),
    points x n_days from `first`.

    Inverse-distance mean of the four nearest POWER cells, temperature moved to the
    point's elevation (unmoved where it is unknown), with the monthly means
    interpolated linearly between mid-months.
    """
    from scipy.spatial import cKDTree

    dist, near = cKDTree(_unit(normals["lat"], normals["lon"])).query(_unit(lat, lon), k=4)
    w = 1.0 / np.maximum(dist, 1e-9) ** 2
    w /= w.sum(axis=1, keepdims=True)
    dz = normals["elev"][near] - np.asarray(elev, float)[:, None]
    monthly = normals[key][near] + (LAPSE * np.nan_to_num(dz)[..., None] if key == "t2m" else 0.0)
    monthly = (w[..., None] * monthly).sum(axis=1)  # points x 12
    doy = np.array([(first + timedelta(days=d)).timetuple().tm_yday for d in range(n_days)], float)
    ext = np.concatenate([[_MID[-1] - 365], _MID, [_MID[0] + 365]])
    month = np.concatenate([[11], np.arange(12), [0]])
    hi = np.searchsorted(ext, doy, side="right").clip(1, len(ext) - 1)
    frac = (doy - ext[hi - 1]) / (ext[hi] - ext[hi - 1])
    return monthly[:, month[hi - 1]] * (1 - frac) + monthly[:, month[hi]] * frac


def _cells(path, first, n_days, rain_cap=None):
    """Daily (Tmax + Tmin) / 2 per CELL from the master parquet, one row group at a time.

    Two passes over a few columns: the first finds the cells, the second sums into a
    cells x days matrix, so a region's winter never sits in pandas at base resolution.
    Returns cell lattice indices (cy, cx), mean elevation, and the matrix (NaN = no data).
    With `rain_cap`, also the measured (ERA5) rain matrix: a base point's day counts
    only once measured and up to rain_cap mm, so a glitched point never reaches its
    cell's mean (NaN = nothing measured).
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
    rain = rain_cap is not None
    r_sum, r_cnt = (np.zeros(n * n_days), np.zeros(n * n_days)) if rain else (None, None)
    if rain and "Rain Measured" not in pf.schema_arrow.names:
        # Without it nothing counts as measured, and every season would read as normal.
        raise ValueError(f"{path} has no 'Rain Measured' column")
    for rg in range(pf.num_row_groups):
        df = pf.read_row_group(rg, columns=_COLS + (_RAIN_COLS if rain else [])).to_pandas()
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
        if rain:
            r = df["TotalPrecipitation_mm"].to_numpy(float)
            ok = (day >= 0) & (day < n_days) & df["Rain Measured"].eq(True).to_numpy() & (r >= 0) & (r <= rain_cap)
            flat = row[ok] * n_days + day[ok]
            r_sum += np.bincount(flat, weights=r[ok], minlength=n * n_days)
            r_cnt += np.bincount(flat, minlength=n * n_days)
    with np.errstate(invalid="ignore", divide="ignore"):
        obs = (t_sum / t_cnt).reshape(n, n_days)
        elev = e_sum / e_cnt
        measured = (r_sum / r_cnt).reshape(n, n_days) if rain else None
    cy = np.floor_divide(cell_keys + 50_000, 100_000)
    if rain:
        return cy, cell_keys - cy * 100_000, elev, obs, measured
    return cy, cell_keys - cy * 100_000, elev, obs


def _local_master(path):
    """A local copy of a remote master (the caller deletes it), or the path itself."""
    if not str(path).startswith(("http://", "https://")):
        return str(path), False
    import requests

    fd, name = tempfile.mkstemp(suffix=".parquet")
    try:
        with os.fdopen(fd, "wb") as f, requests.get(path, timeout=600, stream=True) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
    except BaseException:
        os.unlink(name)  # a broken download would leave up to GBs in /tmp
        raise
    return name, True


def _bands(cy, cx, props, ground):
    """One feature per combination of `props` (name -> an int per cell, such as the
    peak day): the part of the cells' squares on `ground` (towns, woods, desert),
    dissolved."""
    import geopandas as gpd
    from shapely.geometry import box

    # Edges from the integer lattice, so neighbouring squares share them bit for bit
    # and the dissolve leaves no slivers between them.
    squares = [box((x - 0.5) * CELL, (y - 0.5) * CELL, (x + 0.5) * CELL, (y + 0.5) * CELL)
               for y, x in zip(cy, cx)]
    cells = gpd.GeoDataFrame({k: np.asarray(v).astype(int) for k, v in props.items()}, geometry=squares,
                             crs="EPSG:4326")
    w, s, e, n = cells.total_bounds
    cells = gpd.overlay(cells, ground.cx[w:e, s:n][["geometry"]], how="intersection", keep_geom_type=True)
    return cells.dissolve(by=list(props), as_index=False)


def _tippecanoe(geojson, mbtiles, layer):
    """Town-sized shapes keep their outline to zoom 10. The forecast's settings (z6,
    -d9, simplification 4) are tuned for the species mesh and shave a town to a shard."""
    exe = shutil.which("tippecanoe")
    if exe is None:
        print("tippecanoe not found; bloom tiles skipped.")
        return
    subprocess.run([exe, "-o", str(mbtiles), "-l", layer, "-z10", "--force",
                    "--drop-densest-as-needed", str(geojson)], check=True)


def load_normals(region_code):
    return dict(np.load(_BACKEND / "generated" / f"bloom_normals_{NORMALS_MACRO[region_code]}.npz"))


def load_ground(stem, region_code):
    """Where a spectacle is drawn: backend/generated/<stem>_<EU|US>.geojson."""
    import geopandas as gpd

    return gpd.read_file(_BACKEND / "generated" / f"{stem}_{NORMALS_MACRO[region_code]}.geojson")


def publish(features, region_code, tiles, r2_prefix, to_pmtiles, upload, build_mbtiles=_tippecanoe):
    """Tile `features` as `<region>_<tiles>.pmtiles` (layer `<region>_<tiles>`) and
    upload it next to the forecast's. Returns the number of features."""
    if not len(features):
        return 0
    name = f"{region_code}_{tiles}"
    with tempfile.TemporaryDirectory() as tmpdir:
        geojson, mbtiles, pmtiles = (Path(tmpdir) / f"{name}.{ext}" for ext in ("geojson", "mbtiles", "pmtiles"))
        geojson.write_text(features.to_json(), encoding="utf-8")
        build_mbtiles(geojson, mbtiles, name)
        if Path(mbtiles).exists() and to_pmtiles(mbtiles, pmtiles):
            upload(pmtiles, f"{r2_prefix}/{name}.pmtiles")
    return len(features)


def build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, *, label, tiles, season, peak_index,
                latest_normal_peak, ground, build_mbtiles=_tippecanoe, today=None, normals=None):
    """Build and upload `<region>_<tiles>.pmtiles` for a spectacle timed by temperature
    alone: `peak_index(tmean)` over its `season`, on observed days, then normals.

    to_pmtiles(mbtiles, pmtiles) -> bool and upload(path, key) are the calling
    MapLayer script's own helpers. A cell is drawn on `ground` only, and only where
    a normal year peaks by `latest_normal_peak` (month, day). Returns a small
    summary, or None out of season.
    """
    today = today or date.today()
    span = season(today)
    if span is None:
        print(f"{label}: out of season on {today}, skipped.")
        return None
    first, last = span
    n_days = (last - first).days + 1
    if normals is None:
        normals = load_normals(region_code)

    local, downloaded = _local_master(master_path)
    try:
        cy, cx, elev, obs = _cells(local, first, n_days)
    finally:
        if downloaded:
            os.unlink(local)
    normal = daily_normals(normals, cy * CELL, cx * CELL, elev, first, n_days)
    tmean = np.where(np.isfinite(obs), obs, normal)
    del obs
    # The normal year decides where it grows, this year's weather when it peaks.
    grows = peak_index(normal) <= (date(last.year, *latest_normal_peak) - first).days
    del normal
    peak = (first - EPOCH).days + peak_index(tmean)
    # Every place with a peak stays all season, green once it is done: one that
    # vanished after its bloom read as a place without any.
    drawn = np.isfinite(peak) & grows
    print(f"{label} {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn "
          f"({int(np.isnan(peak).sum())} without a peak, "
          f"{int((np.isfinite(peak) & ~grows).sum())} outside its climate)")
    features = _bands(cy[drawn], cx[drawn], {"peak": peak[drawn]}, ground) if drawn.any() else []
    bands = publish(features, region_code, tiles, r2_prefix, to_pmtiles, upload, build_mbtiles)
    return {"cells": len(peak), "drawn": int(drawn.sum()), "bands": bands}


def build_bloom(master_path, region_code, r2_prefix, to_pmtiles, upload,
                *, build_mbtiles=_tippecanoe, today=None, normals=None, towns=None):
    """Build and upload `<region>_bloom.pmtiles`, on towns."""
    today = today or date.today()
    if towns is None and season(today) is not None:
        towns = load_ground("bloom_towns", region_code)
    return build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, label="Bloom", tiles="bloom",
                       season=season, peak_index=lambda t: peak_index(t, FORCING[MAP_VARIETY]),
                       latest_normal_peak=LATEST_NORMAL_PEAK, ground=towns, build_mbtiles=build_mbtiles,
                       today=today, normals=normals)


def _spectacles():
    """(name, regions, season, build) for every spectacle, cherry blossom first."""
    import bluebell
    import superbloom

    return [("cherry_blossom", frozenset(NORMALS_MACRO), season, build_bloom),
            ("bluebell", bluebell.REGIONS, bluebell.season, bluebell.build_bluebell),
            ("superbloom", superbloom.REGIONS, superbloom.season, superbloom.build_superbloom)]


def build_spectacles(master_path, region_code, r2_prefix, to_pmtiles, upload, *, today=None, spectacles=None):
    """Build every spectacle drawn in this region and in season, from one download.

    Each MapLayer script calls this once at its end. The master is downloaded once
    for all of them, and a spectacle that fails is printed while the others still
    run. Returns {name: that builder's summary, or None if it failed}.
    """
    import traceback

    today = today or date.today()
    due = [(name, build) for name, regions, in_season, build in (spectacles or _spectacles())
           if region_code in regions and in_season(today)]
    if not due:
        print(f"Spectacles: none in season on {today}, skipped.")
        return {}
    local, downloaded = _local_master(master_path)
    out = {}
    try:
        for name, build in due:
            try:
                out[name] = build(local, region_code, r2_prefix, to_pmtiles, upload, today=today)
            except Exception:
                traceback.print_exc()
                out[name] = None
    finally:
        if downloaded:
            os.unlink(local)
    return out

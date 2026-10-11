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

import inspect
import json
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
FINE = 5  # sub-cells per cell side the bands are smoothed on (0.02°)
PEAK_STEP = 0.25  # days: bands this far apart, so the colour ramp's steep part has no visible edges
GAP = 2  # cells: holes in a region's lattice up to twice this wide are filled from their neighbours
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


def _fine(cy, cx, props):
    """The cells' `props` (name -> a number per cell) interpolated bilinearly to FINE x
    FINE sub-cells: (south, west, {name: grid}), grids with row 0 south and NaN off the
    drawn area. Small holes in the lattice are filled from their neighbours; past the
    region's edge the drawn area ends halfway to the next cell, its corners cut."""
    from scipy.ndimage import binary_closing, distance_transform_edt, map_coordinates

    cy, cx = np.asarray(cy), np.asarray(cx)
    pad = GAP + 1
    y0, x0 = cy.min() - pad, cx.min() - pad
    shape = (cy.max() - y0 + pad + 1, cx.max() - x0 + pad + 1)
    rr, cc = np.meshgrid((np.arange(shape[0] * FINE) + 0.5) / FINE - 0.5,
                         (np.arange(shape[1] * FINE) + 0.5) / FINE - 0.5, indexing="ij")
    # Holes up to 2 * GAP cells wide (no base points under a farm or a town) take
    # their nearest cell's values, so the ground, not the lattice, draws the outline.
    have = np.zeros(shape, bool)
    have[cy - y0, cx - x0] = True
    filled = binary_closing(have, np.ones((3, 3), bool), iterations=GAP)
    nearest = distance_transform_edt(~have, return_distances=False, return_indices=True)

    def fine(values):
        grid = np.zeros(shape)
        grid[cy - y0, cx - x0] = values
        grid = np.where(filled, grid[nearest[0], nearest[1]], 0.0)
        return map_coordinates(grid, [rr, cc], order=1)

    weight = fine(1.0)
    inside = weight >= 0.5
    with np.errstate(invalid="ignore", divide="ignore"):
        grids = {k: np.where(inside, fine(np.asarray(v, float)) / weight, np.nan) for k, v in props.items()}
    return (y0 - 0.5) * CELL, (x0 - 0.5) * CELL, grids


def _bands(cy, cx, props, ground, steps=None):
    """One feature per combination of `props` (name -> a number per cell, such as the
    peak day), on `ground` (towns, woods, desert), each rounded to its `steps` (1).

    The values are interpolated to sub-cells (_fine) and rounded, so a band's edge runs
    smoothly between the cells instead of along their squares.
    """
    import geopandas as gpd
    import shapely

    cy, cx = np.asarray(cy), np.asarray(cx)
    squares = shapely.box((cx - 0.5) * CELL, (cy - 0.5) * CELL, (cx + 0.5) * CELL, (cy + 0.5) * CELL)
    near = np.unique(shapely.STRtree(ground.geometry.values).query(squares, predicate="intersects")[0])
    if not len(near):
        return gpd.GeoDataFrame({k: [] for k in props}, geometry=[], crs="EPSG:4326")
    south, west, grids = _fine(cy[near], cx[near], {k: np.asarray(v, float)[near] for k, v in props.items()})
    inside = np.isfinite(next(iter(grids.values())))
    steps = {k: (steps or {}).get(k, 1) for k in props}
    values = np.column_stack([np.rint(grids[k][inside] / steps[k]) for k in props]).astype(np.int64)
    combos, label = np.unique(values, axis=0, return_inverse=True)
    grid = np.zeros(inside.shape, np.int64)
    grid[inside] = label.ravel() + 1
    # Each row's runs of one label become strips, unioned per label.
    edge = np.diff(grid, axis=1, prepend=-1) != 0
    row, start = np.nonzero(edge)
    stop = np.r_[start[1:], 0]
    stop[np.r_[row[1:] != row[:-1], True]] = grid.shape[1]
    lab = grid[row, start]
    keep = lab > 0
    row, start, stop, lab = row[keep], start[keep], stop[keep], lab[keep]
    step = CELL / FINE
    strips = shapely.box(west + start * step, south + row * step, west + stop * step, south + (row + 1) * step)
    order = np.argsort(lab, kind="stable")
    parts = np.split(strips[order], np.flatnonzero(np.diff(lab[order])) + 1)
    bands = gpd.GeoDataFrame({k: combos[:, i] * steps[k] for i, k in enumerate(props)},
                             geometry=[shapely.union_all(p) for p in parts], crs="EPSG:4326")
    w, s, e, n = bands.total_bounds
    bands = gpd.overlay(bands, ground.cx[w:e, s:n][["geometry"]], how="intersection", keep_geom_type=True)
    return bands.dissolve(by=list(props), as_index=False)


def _sample(cy, cx, props, pieces, steps=None):
    """`pieces` (the land-cover polygons a species layer is drawn on, with their own
    columns) each with the cells' `props` at its middle, interpolated as for _bands and
    rounded to `steps` (1); pieces off the drawn area are dropped. For a ground too fine
    to cut into bands."""
    import geopandas as gpd

    south, west, grids = _fine(cy, cx, props)
    step = CELL / FINE
    middle = pieces.geometry.representative_point()
    i = np.floor((middle.y.to_numpy() - south) / step).astype(np.int64)
    j = np.floor((middle.x.to_numpy() - west) / step).astype(np.int64)
    first = next(iter(grids.values()))
    ok = (i >= 0) & (i < first.shape[0]) & (j >= 0) & (j < first.shape[1])
    ok[ok] = np.isfinite(first[i[ok], j[ok]])
    steps = {k: (steps or {}).get(k, 1) for k in props}
    values = {k: np.rint(grids[k][i[ok], j[ok]] / steps[k]) * steps[k] for k in props}
    own = {c: pieces[c].to_numpy()[ok] for c in pieces.columns if c != pieces.geometry.name}
    return gpd.GeoDataFrame({**own, **values}, geometry=pieces.geometry.values[ok], crs="EPSG:4326")


def _tippecanoe(geojson, mbtiles, layer, options=("-z10", "--detect-shared-borders")):
    """Town-sized shapes keep their outline to zoom 10. The forecast's settings (z6,
    -d9, simplification 4) are tuned for the species mesh and shave a town to a shard.
    Neighbouring bands are simplified along their shared borders alike, so lower
    zooms smooth the steps without opening gaps between them."""
    exe = shutil.which("tippecanoe")
    if exe is None:
        print("tippecanoe not found; bloom tiles skipped.")
        return
    subprocess.run([exe, "-o", str(mbtiles), "-l", layer, *options, "--force", "--drop-densest-as-needed",
                    str(geojson)], check=True)


def _tippecanoe_mesh(geojson, mbtiles, layer):
    """A mesh of land-cover pieces (fall foliage's woods), tiled as the species forecast
    is (z6, -d9, simplification 4), so it looks like it and stays as small."""
    _tippecanoe(geojson, mbtiles, layer, ("-z6", "--simplification=4", "-d9"))


def load_normals(region_code):
    return dict(np.load(_BACKEND / "generated" / f"bloom_normals_{NORMALS_MACRO[region_code]}.npz"))


def load_ground(stem, region_code):
    """Where a spectacle is drawn: backend/generated/<stem>_<EU|US>.parquet or .geojson."""
    import geopandas as gpd

    path = _BACKEND / "generated" / f"{stem}_{NORMALS_MACRO[region_code]}"
    if path.with_suffix(".parquet").exists():
        return gpd.read_parquet(path.with_suffix(".parquet"))
    return gpd.read_file(path.with_suffix(".geojson"))


def publish(features, region_code, tiles, r2_prefix, to_pmtiles, upload, build_mbtiles=_tippecanoe):
    """Tile `features` as `<region>_<tiles>.pmtiles` (layer `<region>_<tiles>`) and
    upload it next to the forecast's. Returns the number of features."""
    if not len(features):
        return 0
    name = f"{region_code}_{tiles}"
    with tempfile.TemporaryDirectory() as tmpdir:
        geojson, mbtiles, pmtiles = (Path(tmpdir) / f"{name}.{ext}" for ext in ("geojson", "mbtiles", "pmtiles"))
        # Streamed feature by feature, as the forecast is: a ground of pieces runs to 100,000s.
        with open(geojson, "w", encoding="utf-8") as f:
            f.write('{"type": "FeatureCollection", "features": [')
            for i, feature in enumerate(features.iterfeatures()):
                f.write(", " if i else "")
                json.dump(feature, f)
            f.write("]}")
        build_mbtiles(geojson, mbtiles, name)
        if Path(mbtiles).exists() and to_pmtiles(mbtiles, pmtiles):
            upload(pmtiles, f"{r2_prefix}/{name}.pmtiles")
    return len(features)


def build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, *, label, tiles, season, peak_index,
                latest_normal_peak, ground, build_mbtiles=_tippecanoe, today=None, normals=None):
    """Build and upload `<region>_<tiles>.pmtiles` for a spectacle timed by temperature
    alone: `peak_index(tmean, normal)` over its `season`, on observed days then normals
    (`tmean`) and on normals alone (`normal`, for a model that moves a normal date).

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
    grows = peak_index(normal, normal) <= (date(last.year, *latest_normal_peak) - first).days
    peak = (first - EPOCH).days + peak_index(tmean, normal)
    del normal
    # Every place with a peak stays all season, green once it is done: one that
    # vanished after its bloom read as a place without any.
    drawn = np.isfinite(peak) & grows
    print(f"{label} {region_code}: {int(drawn.sum())} of {len(peak)} cells drawn "
          f"({int(np.isnan(peak).sum())} without a peak, "
          f"{int((np.isfinite(peak) & ~grows).sum())} outside its climate)")
    features = []
    if drawn.any():
        features = _bands(cy[drawn], cx[drawn], {"peak": peak[drawn]}, ground, {"peak": PEAK_STEP})
    bands = publish(features, region_code, tiles, r2_prefix, to_pmtiles, upload, build_mbtiles)
    return {"cells": len(peak), "drawn": int(drawn.sum()), "bands": bands}


def build_bloom(master_path, region_code, r2_prefix, to_pmtiles, upload,
                *, build_mbtiles=_tippecanoe, today=None, normals=None, towns=None):
    """Build and upload `<region>_bloom.pmtiles`, on towns."""
    today = today or date.today()
    if towns is None and season(today) is not None:
        towns = load_ground("bloom_towns", region_code)
    return build_peaks(master_path, region_code, r2_prefix, to_pmtiles, upload, label="Bloom", tiles="bloom",
                       season=season, peak_index=lambda t, _: peak_index(t, FORCING[MAP_VARIETY]),
                       latest_normal_peak=LATEST_NORMAL_PEAK, ground=towns, build_mbtiles=build_mbtiles,
                       today=today, normals=normals)


def _spectacles():
    """(name, regions, season, build) for every spectacle, cherry blossom first."""
    import bluebell
    import foliage
    import heather
    import superbloom

    return [("cherry_blossom", frozenset(NORMALS_MACRO), season, build_bloom),
            ("bluebell", bluebell.REGIONS, bluebell.season, bluebell.build_bluebell),
            ("heather", heather.REGIONS, heather.season, heather.build_heather),
            ("superbloom", superbloom.REGIONS, superbloom.season, superbloom.build_superbloom),
            ("foliage", foliage.REGIONS, foliage.season, foliage.build_foliage)]


def build_spectacles(master_path, region_code, r2_prefix, to_pmtiles, upload, *, today=None, spectacles=None,
                     land=None):
    """Build every spectacle drawn in this region and in season, from one download.

    Each MapLayer script calls this once at its end. The master is downloaded once
    for all of them, and a spectacle that fails is printed while the others still
    run. `land` (the land-cover pieces the region's species layers are drawn on,
    `raster_val` and geometry) goes to the builders that take it. Returns {name: that
    builder's summary, or None if it failed}.
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
                extra = {"land": land} if "land" in inspect.signature(build).parameters else {}
                out[name] = build(local, region_code, r2_prefix, to_pmtiles, upload, today=today, **extra)
            except Exception:
                traceback.print_exc()
                out[name] = None
    finally:
        if downloaded:
            os.unlink(local)
    return out

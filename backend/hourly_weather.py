"""Hourly weather at our points from free model files, for the crop forecasts to come.

Each night this takes the newest complete run of each model in hourly_sources, reads only
the fields we use, samples them at the region's points and writes one parquet: every hour
from the first model's run start to 7 days ahead, each from the finest model that reaches
it. Passed hours move into daily past files, so an hourly history builds up from the first
night: the short-range forecast, as Earth's master keeps its day-0 forecast, until measured
weather replaces it.

Under HOURLY_WEATHER_DIR (default app_operation/hourly_weather): <REGION>/forecast/<run>.parquet
(30 days here, for good on R2 under hourly_weather/) and <REGION>/past/<YYYY-MM-DD>.parquet.
Downloads stay two days in cache/, so a continent's second region reads the first one's.
"""
from __future__ import annotations

import bz2
import hashlib
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from scipy.spatial import cKDTree
from urllib3.util.retry import Retry

from era5_normals import CONTINENT
from hourly_sources import SOURCES, WORKERS

HOURS = 168
HOUR = pd.Timedelta(hours=1)
VARS = ("t2m_c", "td2m_c", "precip_mm", "wind10_kmh", "swdown_wm2", "cloud_pct")
DECIMALS = {"t2m_c": 1, "td2m_c": 1, "precip_mm": 2, "wind10_kmh": 1, "swdown_wm2": 0, "cloud_pct": 0}
OUT_DIR = Path(os.getenv("HOURLY_WEATHER_DIR") or Path(__file__).resolve().parents[2] / "hourly_weather")
KEEP_FORECAST_DAYS, KEEP_CACHE_DAYS = 30, 2


def _xyz(lats, lons):
    lat, lon = np.radians(lats), np.radians(lons)
    return np.column_stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def nearest_cells(grid_lats, grid_lons, lats, lons):
    """Each point's nearest grid cell, or -1 where the model does not reach it: the nearest
    cell further than twice the grid's spacing (ICON-EU stops at 70.5° N, NBM at the US).
    Works on any grid ecCodes can list, regular or Lambert."""
    tree = cKDTree(_xyz(grid_lats, grid_lons))
    dist, cell = tree.query(_xyz(lats, lons))
    spacing = np.median(tree.query(_xyz(grid_lats[::997], grid_lons[::997]), k=2)[0][:, 1])
    return np.where(dist <= 2 * spacing, cell, -1)


def to_hours(kind, valid, values, hours, init):
    """One model variable, values[step, point] at its valid times, on our hours (each the
    end of its hour). 'state': instant values, linear between steps. 'accum': amount since
    the run started; 'mean': mean since the run started (ICON's radiation); 'hourly': amount
    in the hour ending at the step. Those three come out as the amount in, or the mean over,
    each hour. NaN where the model's steps do not reach."""
    t = np.asarray((valid - init) / HOUR, float)
    h = np.asarray((hours - init) / HOUR, float)
    out = np.full((len(h), values.shape[1]), np.nan)
    if kind == "state":
        if len(t) < 2:
            return out
        i = np.clip(np.searchsorted(t, h), 1, len(t) - 1)
        w = ((h - t[i - 1]) / (t[i] - t[i - 1]))[:, None]
        out = values[i - 1] * (1 - w) + values[i] * w
        out[(h < t[0]) | (h > t[-1])] = np.nan
        return out
    if kind == "hourly":
        start, rate = t - 1, values
    else:
        start = np.r_[0.0, t[:-1]]
        prev = np.vstack([np.zeros_like(values[:1]), values[:-1]])
        span = (t - start)[:, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            if kind == "accum":
                rate = np.clip((values - prev) / span, 0, None)
            else:
                rate = (values * t[:, None] - prev * start[:, None]) / span
    i = np.searchsorted(t, h)  # the first step ending at or after the hour's end
    ok = i < len(t)
    i = np.minimum(i, len(t) - 1)
    ok &= start[i] <= h - 1    # ... whose window holds the whole hour
    out[ok] = rate[i[ok]]
    return out


def source_vars(source, fields, hours, init):
    """{variable: values[hour, point]} from one run's sampled fields {field: {valid: values}};
    a variable missing one of its fields is left out."""
    out = {}
    for var, (kind, names, convert) in source.vars.items():
        if not all(fields.get(name) for name in names):
            continue
        valid = sorted(set.intersection(*(set(fields[name]) for name in names)))
        stacked = [np.stack([fields[name][v] for v in valid]) for name in names]
        out[var] = to_hours(kind, pd.DatetimeIndex(valid), convert(*stacked), hours, init)
    return out


def blend(layers):
    """Each value from the first layer (finest model first) that has it: (values, layer)."""
    out = np.full(layers[0].shape, np.nan, dtype=np.float32)
    src = np.full(layers[0].shape, -1, dtype=np.int8)
    for k, layer in enumerate(layers):
        take = np.isnan(out) & ~np.isnan(layer)
        out[take], src[take] = layer[take], k
    return out, src


def to_frame(hours, lats, lons, layers, names):
    """A row per hour and point; `source` names the run its temperature came from."""
    n = len(lats)
    missing = np.full((len(hours), n), np.nan, dtype=np.float32)
    frame = pd.DataFrame({"time": hours.repeat(n), "lat": np.tile(lats, len(hours)),
                          "lon": np.tile(lons, len(hours))})
    for var in VARS:
        values, src = blend([layer.get(var, missing) for layer in layers])
        frame[var] = np.round(values.ravel(), DECIMALS[var]).astype(np.float32)
        if var == "t2m_c":
            frame["source"] = np.asarray([*names, ""])[src.ravel()]
    return frame


def write_night(region_dir, frame, start):
    """Tonight's file, named by the first model's run start."""
    path = Path(region_dir) / "forecast" / f"{start:%Y%m%d%H}.parquet"
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False, compression="zstd")
    return path


def roll_past(region_dir, start):
    """Add to the daily past files (UTC days) the hours the newest earlier night covered up
    to tonight's run start and the past does not have yet: each hour once, from the newest
    run that started before it. A missed night is filled from the older run's longer leads.
    Daily, so a night rewrites two small files, not a month's. Returns the files written."""
    region_dir = Path(region_dir)
    earlier = sorted(p for p in (region_dir / "forecast").glob("*.parquet") if p.stem < f"{start:%Y%m%d%H}")
    if not earlier:
        return []
    rows = pd.read_parquet(earlier[-1])
    rows = rows[rows["time"] <= start]
    past_dir = region_dir / "past"
    past_dir.mkdir(exist_ok=True)
    days = sorted(past_dir.glob("*.parquet"))
    if days:
        rows = rows[rows["time"] > pd.read_parquet(days[-1], columns=["time"])["time"].max()]
    written = []
    for day, part in rows.groupby(rows["time"].dt.strftime("%Y-%m-%d")):
        path = past_dir / f"{day}.parquet"
        if path.exists():
            part = pd.concat([pd.read_parquet(path), part], ignore_index=True)
        part.to_parquet(path, index=False, compression="zstd")
        written.append(path)
    return written


def prune(folder, days):
    """Delete the files under `folder` older than `days`, then the folders left empty."""
    folder = Path(folder)
    if not folder.exists():
        return
    cutoff = time.time() - days * 86400
    for path in folder.rglob("*"):
        if path.is_file() and path.stat().st_mtime < cutoff:
            path.unlink()
    for path in sorted(folder.rglob("*"), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()


def newest_run(source, session, now):
    """The newest run of the last two days whose last files are up, or None."""
    for back in range(48):
        init = (now - back * HOUR).floor("h")
        if init.hour in source.cycles and all(
                session.head(url, timeout=30).status_code == 200 for url in source.probe(init)):
            return init
    return None


def download(session, url, span, folder):
    """The file, or its byte span, in the cache folder; fetched unless already there."""
    path = Path(folder) / (hashlib.sha1(f"{url} {span}".encode()).hexdigest() + ".grib2")
    if not path.exists():
        headers = {"Range": f"bytes={span[0]}-{'' if span[1] is None else span[1]}"} if span else {}
        response = session.get(url, headers=headers, timeout=180)
        response.raise_for_status()
        data = bz2.decompress(response.content) if url.endswith(".bz2") else response.content
        part = path.with_suffix(".part")
        part.write_bytes(data)
        part.replace(path)
    return path


def decode(data, with_grid=False):
    """(valid time, values with NaN where the field has none, (lats, lons) or None) of one
    GRIB message. For an amount or a mean the valid time is the end of its window."""
    import eccodes  # here, not at the top: only the nightly weather needs it, after LightGBM loads
    gid = eccodes.codes_new_from_message(data)
    try:
        values = eccodes.codes_get_values(gid).astype(np.float32)
        if eccodes.codes_get(gid, "bitmapPresent"):
            values[values == eccodes.codes_get(gid, "missingValue")] = np.nan
        if eccodes.codes_get(gid, "alternativeRowScanning"):
            # NBM's rows alternate direction. ecCodes 2.50 lists every row's coordinates west
            # to east but returns values in file order: put every other row back, or half the
            # points read the mirror place across the US (the Finger Lakes' 17 Oct 2026 read
            # 20 °C; it is 8 °C, as WeatherAPI's 6 °C and GDAL's decoding agree).
            rows = values.reshape(-1, eccodes.codes_get(gid, "Ni"))
            rows[1::2] = rows[1::2, ::-1].copy()
        stamp = f"{eccodes.codes_get(gid, 'validityDate')}{eccodes.codes_get(gid, 'validityTime'):04d}"
        valid = pd.to_datetime(stamp, format="%Y%m%d%H%M", utc=True)
        grid = ((eccodes.codes_get_array(gid, "latitudes"), eccodes.codes_get_array(gid, "longitudes"))
                if with_grid else None)
    finally:
        eccodes.codes_release(gid)
    return valid, values, grid


def read_source(source, init, last, lats, lons, session):
    """{field: {valid time: values at the points}} of one run, NaN where the model does not
    reach. Downloads run in parallel and are decoded as they land; up to 5% may fail."""
    files = source.files(session, init, last)
    folder = OUT_DIR / "cache" / source.name / f"{init:%Y%m%d%H}"
    folder.mkdir(parents=True, exist_ok=True)
    fields, cells, failed = {}, None, 0
    with ThreadPoolExecutor(WORKERS) as pool:
        jobs = {pool.submit(download, session, url, span, folder): field for field, url, span in files}
        for job in as_completed(jobs):
            try:
                data = job.result().read_bytes()
            except requests.RequestException as e:
                failed += 1
                print(f"Hourly weather: {source.name} download failed: {e!r}")
                continue
            valid, values, grid = decode(data, with_grid=cells is None)
            if cells is None:
                cells = nearest_cells(*grid, lats, lons)
            fields.setdefault(jobs[job], {})[valid] = np.where(cells >= 0, values[cells], np.nan).astype(np.float32)
    if failed > 0.05 * len(files):
        raise RuntimeError(f"{source.name}: {failed} of {len(files)} downloads failed")
    return fields


def upload(paths):
    """Copy the files to R2 under hourly_weather/, as they lie under OUT_DIR."""
    import r2
    s3 = r2.client()  # loads .env.secret, which holds the bucket name
    for path in paths:
        s3.upload_file(str(path), os.environ["R2_BUCKET_NAME"],
                       f"hourly_weather/{Path(path).relative_to(OUT_DIR).as_posix()}")


def summary(frame, seconds):
    """What tonight's file holds, for the run log."""
    print(f"Hourly weather: {len(frame):,} rows, {frame['time'].min()} to {frame['time'].max()}, {seconds:.0f} s")
    for var in VARS:
        print(f"  {var}: missing {frame[var].isna().mean():.1%}, {frame[var].min()} to {frame[var].max()}")
    print(f"  from: {frame['source'].value_counts(normalize=True).round(3).to_dict()}")


def _session():
    session = requests.Session()
    retry = Retry(total=4, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=("GET", "HEAD"))
    session.mount("https://", HTTPAdapter(max_retries=retry, pool_maxsize=2 * WORKERS))
    return session


def run(region, points, now=None):
    """Tonight's hourly forecast at the region's points, the hours since last night added to
    the past, both copied to R2."""
    started = time.time()
    now = pd.Timestamp.now(tz="UTC") if now is None else now
    lats, lons = np.asarray(points, float).T
    session = _session()
    prune(OUT_DIR / "cache", KEEP_CACHE_DAYS)
    runs = []
    for source in SOURCES[CONTINENT[region]]:
        init = newest_run(source, session, now)
        print(f"Hourly weather: {source.name} run {init}")
        if init is not None:
            runs.append((source, init))
    if not runs:
        raise RuntimeError("no complete model run")
    start = runs[0][1]
    hours = pd.date_range(start + HOUR, periods=HOURS, freq="h")
    end = hours[-1] + 6 * HOUR  # a step past the last hour, to interpolate up to it
    layers, names = [], []
    for source, init in runs:
        try:
            fields = read_source(source, init, int((end - init) / HOUR), lats, lons, session)
        except Exception as e:  # noqa: BLE001  one model's outage must not cost the others
            print(f"Hourly weather: {source.name} failed: {e!r}")
            continue
        layers.append(source_vars(source, fields, hours, init))
        names.append(f"{source.name} {init:%Y-%m-%d %H}z")
    if not layers:
        raise RuntimeError("no model run could be read")
    frame = to_frame(hours, lats, lons, layers, names)
    region_dir = OUT_DIR / region
    written = [write_night(region_dir, frame, start), *roll_past(region_dir, start)]
    prune(region_dir / "forecast", KEEP_FORECAST_DAYS)
    upload(written)
    summary(frame, time.time() - started)


if __name__ == "__main__":
    # python backend/hourly_weather.py NE: one region by hand, at its Earth coordinates.
    import sys

    from forecast_pipeline import _load_coords_any, get_required_env, load_dotenv
    root = Path(__file__).resolve().parents[1]
    load_dotenv(root / ".env")
    load_dotenv(root / ".env.secret")
    region = sys.argv[1]
    coords = _load_coords_any(get_required_env(f"{region}_UNIQUE_COORDINATES"))
    run(region, [(round(lat, 3), round(lon, 3)) for lat, lon in coords])

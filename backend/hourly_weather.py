"""Hourly weather at our points from free model files, for the crop forecasts to come.

Each night this takes the newest complete run of each model in hourly_sources, reads only
the fields we use, samples them at the region's points and writes one parquet: every hour
from the first model's run start to 7 days ahead, each from the finest model that reaches
it. Passed hours move into monthly past files, so an hourly history builds up from the first
night: the short-range forecast, as Earth's master keeps its day-0 forecast, until measured
weather replaces it.

Under HOURLY_WEATHER_DIR (default app_operation/hourly_weather): <REGION>/forecast/<run>.parquet
(30 days here, for good on R2 under hourly_weather/) and <REGION>/past/<YYYY-MM>.parquet.
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

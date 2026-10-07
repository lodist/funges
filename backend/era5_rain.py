"""Measured rain for past days, from ERA5 (Copernicus), at no WeatherAPI cost.

The master's past days are each day's day-0 forecast, and day-0 rain correlated only 0.71
with ERA5 reanalysis (60 coords, 1-3 Oct 2026); temperature and humidity were fine. ERA5
publishes what fell about five days later. This downloads hourly total precipitation
for the region's box and turns it into each fetched coord's local-day total.

The Copernicus licence allows commercial use; anything published from it must say
"Contains modified Copernicus Climate Change Service information".
"""
from __future__ import annotations

import os
import tempfile
import threading
from datetime import timedelta
from itertools import groupby
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd

DATASET = "reanalysis-era5-single-levels"
CDS_URL = "https://cds.climate.copernicus.eu/api"
# Local days today-10 .. today-6. ERA5 lands about five days behind real time, at no fixed
# hour; a five-day window asks for each day on several nights, so a slow queue or a day
# not out yet only delays it.
NEWEST_DAY, OLDEST_DAY = 6, 10
RAIN_HOUR_MM = 0.1
EMPTY = pd.DataFrame(columns=["Latitude", "Longitude", "Date", "TotalPrecipitation_mm",
                              "Rain Hours", "Rain Measured"])


def cds_requests(utc_days, lat_range, lon_range) -> list[dict]:
    """One request per month: year/month/day lists are crossed, so a request spanning a
    month end would ask for days that do not exist yet."""
    days = sorted(pd.Timestamp(d) for d in utc_days)
    south, north = lat_range
    west, east = lon_range
    return [{
        "product_type": ["reanalysis"],
        "variable": ["total_precipitation"],
        "year": [f"{year}"],
        "month": [f"{month:02d}"],
        "day": [f"{d.day:02d}" for d in group],
        "time": [f"{hour:02d}:00" for hour in range(24)],
        "data_format": "netcdf",
        "download_format": "unarchived",
        "area": [north, west, south, east],
    } for (year, month), group in groupby(days, key=lambda d: (d.year, d.month))]


def read_hourly(paths) -> tuple[np.ndarray, pd.DatetimeIndex, np.ndarray, np.ndarray]:
    """CDS netCDF files -> (hourly rain in mm [time, lat, lon], UTC hour ends, lats, lons)."""
    blocks, stamps, lats, lons = [], [], None, None
    for path in paths:
        with netCDF4.Dataset(path) as nc:
            tp = nc["tp"]
            time_name = "valid_time" if "valid_time" in tp.dimensions else "time"
            data = np.ma.filled(tp[:].astype(float), np.nan)
            extra = tuple(i for i, name in enumerate(tp.dimensions)
                          if name not in (time_name, "latitude", "longitude"))
            if extra:  # final and preliminary ERA5 can arrive as an extra dimension
                data = np.nanmax(data, axis=extra)
            times = nc[time_name]
            stamps.append(pd.DatetimeIndex(netCDF4.num2date(
                times[:], times.units, only_use_cftime_datetimes=False,
                only_use_python_datetimes=True)))
            blocks.append(data)
            lats, lons = np.asarray(nc["latitude"][:], float), np.asarray(nc["longitude"][:], float)
    times = stamps[0].append(stamps[1:]) if len(stamps) > 1 else stamps[0]
    hourly = np.clip(np.concatenate(blocks) * 1000.0, 0.0, None)  # metres; packing noise < 0
    order = np.argsort(times.values, kind="stable")
    return hourly[order], times[order], lats, lons


def local_day_rain(hourly, times, lats, lons, coords, days) -> pd.DataFrame:
    """Each coord's rain total and rain hours over its local days, from the nearest cell.

    A local day at longitude L runs from midnight at UTC-L/15 h. Each hourly value is the
    rain of the hour ending at its time. A day missing any of its 24 hours, or with one
    left blank, is left out: it comes again on a later run."""
    coords = np.asarray(coords, float).reshape(-1, 2)
    rows = np.abs(lats[None, :] - coords[:, :1]).argmin(axis=1)
    cols = np.abs(lons[None, :] - coords[:, 1:]).argmin(axis=1)
    series = hourly[:, rows, cols]                                  # [time, coord]
    offset = pd.to_timedelta(np.round(coords[:, 1] / 15.0), unit="h").values
    stamps = pd.DatetimeIndex(times).values[:, None]
    frames = []
    for day in days:
        start = np.datetime64(pd.Timestamp(day)) - offset           # local midnight, in UTC
        inside = ((stamps > start[None, :]) & (stamps <= (start + np.timedelta64(1, "D"))[None, :])
                  & np.isfinite(series))                         # a blank hour is a missing hour
        complete = inside.sum(axis=0) == 24
        rain = np.where(inside, series, 0.0)
        frames.append(pd.DataFrame({
            "Latitude": coords[:, 0], "Longitude": coords[:, 1],
            "Date": pd.Timestamp(day).strftime("%Y-%m-%d"),
            "TotalPrecipitation_mm": rain.sum(axis=0).round(2),
            "Rain Hours": (inside & (series >= RAIN_HOUR_MM)).sum(axis=0),
            "Rain Measured": True,
        })[complete])
    return pd.concat(frames, ignore_index=True) if frames else EMPTY.copy()


def measured_rain(lat_range, lon_range, coords, today) -> pd.DataFrame:
    """Download the window's ERA5 rain and return it per coord and local day."""
    import cdsapi  # only the pipeline needs it, not the tests of the maths above

    client = cdsapi.Client(url=CDS_URL, key=os.environ["CDSAPI_KEY"], quiet=True, progress=False)
    days = [today - timedelta(days=back) for back in range(OLDEST_DAY, NEWEST_DAY - 1, -1)]
    # Every longitude's local day fits inside the UTC days either side of it.
    utc_days = pd.date_range(days[0] - timedelta(days=1), days[-1] + timedelta(days=1)).date
    with tempfile.TemporaryDirectory() as folder:
        paths = []
        for number, request in enumerate(cds_requests(utc_days, lat_range, lon_range)):
            path = Path(folder) / f"tp-{number}.nc"
            client.retrieve(DATASET, request, str(path))
            paths.append(path)
        hourly, times, lats, lons = read_hourly(paths)
    return local_day_rain(hourly, times, lats, lons, coords, days)


def start(lat_range, lon_range, coords, today):
    """Download ERA5 rain in the background (Copernicus queues requests, for minutes or
    hours) while WeatherAPI is fetched. Returns rows(wait): the rain, or an empty frame if
    it is not there after `wait` more seconds. The thread is a daemon, so a slow queue
    never holds the run open; the days come again tomorrow."""
    box = {}

    def run():
        try:
            box["rows"] = measured_rain(lat_range, lon_range, coords, today)
            print(f"ERA5 rain: {len(box['rows']):,} coord-days", flush=True)
        except Exception as error:  # no rain this run means forecast rain one more day
            print(f"[warn] ERA5 rain skipped: {error}", flush=True)

    if not os.environ.get("CDSAPI_KEY"):
        print("[warn] ERA5 rain skipped: CDSAPI_KEY is not set", flush=True)
        return lambda wait: EMPTY.copy()
    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    def rows(wait):
        thread.join(wait)
        if thread.is_alive():
            print(f"[warn] ERA5 rain not back after {wait}s more; skipped this run", flush=True)
        return box.get("rows", EMPTY.copy())

    return rows

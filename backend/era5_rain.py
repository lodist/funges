"""Measured rain for past days, from ERA5 (Copernicus), at no WeatherAPI cost.

The master's past days are each day's day-0 forecast, and day-0 rain correlated only 0.71
with ERA5 reanalysis (60 coords, 1-3 Oct 2026); temperature and humidity were fine. ERA5
publishes what fell about five days later. This orders hourly total precipitation for
the region's box and turns it into each fetched coord's local-day total.

Copernicus queues orders, at night for one to five hours (9-10 Oct 2026), so a run does
not wait for its own: it places tonight's order and downloads the ones earlier runs placed
that have finished since, which may include tonight's on a quiet night.

The Copernicus licence allows commercial use; anything published from it must say
"Contains modified Copernicus Climate Change Service information".
"""
from __future__ import annotations

import os
import tempfile
from datetime import timedelta
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd
import requests

DATASET = "reanalysis-era5-single-levels"
CDS_API = "https://cds.climate.copernicus.eu/api/retrieve/v1"
# Orders this recent are downloaded; finished ones were still there after three days.
LOOKBACK = timedelta(days=2)
# Local days today-10 .. today-6. ERA5 lands about five days behind real time, at no fixed
# hour; a five-day window asks for each day on several nights, so a slow queue or a day
# not out yet only delays it.
NEWEST_DAY, OLDEST_DAY = 6, 10
RAIN_HOUR_MM = 0.1
GRID = 0.25                     # ERA5's grid step in degrees, as Copernicus delivers it
EMPTY = pd.DataFrame(columns=["Latitude", "Longitude", "Date", "TotalPrecipitation_mm",
                              "Rain Hours", "Rain Measured"])


def box(coords) -> tuple[tuple, tuple]:
    """The coords' bounds on ERA5's 0.25° grid, so every coord's nearest cell is ordered.
    The regions' own boxes are for building their grids: South Europe's stopped at 12° E
    while its coords reach 18° W, and from 28 Sep 2026 Spain, France and north-west Italy
    read the rain of the box's edge."""
    c = np.asarray(coords, float).reshape(-1, 2)
    lo, hi = np.floor(c.min(axis=0) / GRID) * GRID, np.ceil(c.max(axis=0) / GRID) * GRID
    return (float(lo[0]), float(hi[0])), (float(lo[1]), float(hi[1]))


def area(lat_range, lon_range) -> list:
    """The region's box in CDS order: north, west, south, east."""
    return [lat_range[1], lon_range[0], lat_range[0], lon_range[1]]


def cds_request(utc_days, lat_range, lon_range) -> dict:
    """One order for the whole window, as a date range: year/month/day lists are crossed,
    so a window across a month end took two orders, and Copernicus queues only a few per
    user (US West's were rejected on 11 Oct 2026, eight orders into the night)."""
    days = sorted(pd.Timestamp(d) for d in utc_days)
    return {
        "product_type": ["reanalysis"],
        "variable": ["total_precipitation"],
        "date": [f"{days[0]:%Y-%m-%d}/{days[-1]:%Y-%m-%d}"],
        "time": [f"{hour:02d}:00" for hour in range(24)],
        "data_format": "netcdf",
        "download_format": "unarchived",
        "area": area(lat_range, lon_range),
    }


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
    # Orders from different nights overlap: keep each hour once, the value any file has.
    unique, slot = np.unique(times.values, return_inverse=True)
    merged = np.full((len(unique),) + hourly.shape[1:], np.nan)
    np.fmax.at(merged, slot, hourly)
    return merged, pd.DatetimeIndex(unique), lats, lons


def local_day_rain(hourly, times, lats, lons, coords, days) -> pd.DataFrame:
    """Each coord's rain total and rain hours over its local days, from the nearest cell.

    A local day at longitude L runs from midnight at UTC-L/15 h. Each hourly value is the
    rain of the hour ending at its time. A day missing any of its 24 hours, or with one
    left blank, is left out: it comes again on a later run. A coord whose nearest cell is
    more than half a cell away is off the downloaded grid and gets no row: its stored rain
    stays, where the grid's edge would have given it another place's rain."""
    coords = np.asarray(coords, float).reshape(-1, 2)
    rows = np.abs(lats[None, :] - coords[:, :1]).argmin(axis=1)
    cols = np.abs(lons[None, :] - coords[:, 1:]).argmin(axis=1)
    on_grid = ((np.abs(lats[rows] - coords[:, 0]) <= GRID / 2 + 1e-9)
               & (np.abs(lons[cols] - coords[:, 1]) <= GRID / 2 + 1e-9))
    coords, rows, cols = coords[on_grid], rows[on_grid], cols[on_grid]
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


def place_orders(key, lat_range, lon_range, today) -> None:
    """Order the window's rain. Copernicus answers at once and works the order later."""
    days = [today - timedelta(days=back) for back in range(OLDEST_DAY, NEWEST_DAY - 1, -1)]
    # Every longitude's local day fits inside the UTC days either side of it.
    utc_days = pd.date_range(days[0] - timedelta(days=1), days[-1] + timedelta(days=1)).date
    try:
        requests.post(f"{CDS_API}/processes/{DATASET}/execution",
                      json={"inputs": cds_request(utc_days, lat_range, lon_range)},
                      headers={"PRIVATE-TOKEN": key}, timeout=60).raise_for_status()
    except Exception as error:  # its days are ordered again tomorrow
        print(f"[warn] ERA5 order not placed: {error}", flush=True)


def finished_orders(key, lat_range, lon_range, since) -> list[str]:
    """Download links of this box's rain orders placed after `since` that are done."""
    headers = {"PRIVATE-TOKEN": key}
    jobs = requests.get(f"{CDS_API}/jobs", headers=headers, timeout=60, params={
        "processID": DATASET, "status": "successful", "sortby": "-created", "limit": 100})
    jobs.raise_for_status()
    links = []
    for job in jobs.json()["jobs"]:
        if pd.Timestamp(job["created"]) < since:
            break
        job_info = requests.get(f"{CDS_API}/jobs/{job['jobID']}", params={"request": "true"},
                                headers=headers, timeout=60)
        job_info.raise_for_status()
        request = job_info.json()["metadata"]["request"]["ids"]
        if (request.get("area") == area(lat_range, lon_range)
                and request.get("variable") == ["total_precipitation"]):
            links.append(job["metadata"]["results"]["asset"]["value"]["href"])
    return links


def measured_rain(key, lat_range, lon_range, coords) -> pd.DataFrame:
    """Download the box's finished orders and return their rain per coord and local day."""
    since = pd.Timestamp.now("UTC").tz_localize(None) - LOOKBACK  # CDS times are naive UTC
    links = finished_orders(key, lat_range, lon_range, since)
    with tempfile.TemporaryDirectory() as folder:
        paths = []
        for number, link in enumerate(links):
            try:  # the token stays off the file store's host
                response = requests.get(link, timeout=300)
                response.raise_for_status()
            except requests.RequestException as error:  # one gone order costs only its days
                print(f"[warn] ERA5 order not downloaded: {error}", flush=True)
                continue
            path = Path(folder) / f"tp-{number}.nc"
            path.write_bytes(response.content)
            paths.append(path)
        if not paths:
            return EMPTY.copy()
        hourly, times, lats, lons = read_hourly(paths)
    days = pd.date_range(times[0].normalize(), times[-1].normalize()).date
    return local_day_rain(hourly, times, lats, lons, coords, days)


def start(coords, today):
    """Place tonight's order for the box around the coords now, while WeatherAPI is fetched.
    Returns rows(): the rain of every finished order, downloaded when it is called, after
    the fetch. Nothing here stops the night: any failure means no measured rows, so the
    stored rain stays as it did before ERA5, and the days come again tomorrow."""
    try:
        key = os.environ.get("CDSAPI_KEY")
        if not key:
            raise RuntimeError("CDSAPI_KEY is not set")
        lat_range, lon_range = box(coords)
    except Exception as error:
        print(f"[warn] ERA5 rain skipped: {error}", flush=True)
        return lambda: EMPTY.copy()
    place_orders(key, lat_range, lon_range, today)

    def rows():
        try:
            found = measured_rain(key, lat_range, lon_range, coords)
        except Exception as error:
            print(f"[warn] ERA5 rain skipped: {error}", flush=True)
            return EMPTY.copy()
        print(f"ERA5 rain: {len(found):,} coord-days", flush=True)
        return found

    return rows

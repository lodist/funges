#!/usr/bin/env python3
"""ERA5 weather at the training set's places, as daily values (#291 step 2).

Copernicus' ERA5 time-series dataset serves years of hourly data for a small area fast:
a request holds at most a 2x2 block of 0.25° cells with these six variables (3x3 is "too
large"), and only two requests per user are accepted at a time. So this asks for every
2x2 block that holds a find, busiest first, and stores each cell's local days under the
master parquet's column names, ready for the production scoring code.

Blocks are saved as <out>/era5_blocks/<south>_<west>.parquet, so a rerun resumes. With
--follow it keeps picking up blocks for finds that build_training_finds.py adds, until
that script has written its final file. Nothing is submitted 00:30-06:00, while the
nightly scoring makes its own Copernicus request.

    python backend/tools/download_era5_points.py --out ../era5_training --follow
"""
from __future__ import annotations

import argparse
import io
import math
import os
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forecast_pipeline as fp  # noqa: E402

DATASET = "reanalysis-era5-single-levels-timeseries"
CDS_URL = "https://cds.climate.copernicus.eu/api"
VARIABLES = ["total_precipitation", "2m_temperature", "2m_dewpoint_temperature",
             "surface_solar_radiation_downwards", "10m_u_component_of_wind",
             "10m_v_component_of_wind"]
FIRST_DAY = "2016-01-01"
STEP = 0.25
WORKERS = 2          # Copernicus rejects a third queued request for this dataset
QUIET = (0.5, 6.0)   # local hours, start inclusive
RAIN_HOUR_MM = 0.1


def log(message: str) -> None:
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}", flush=True)


def seconds_until_allowed(now: datetime) -> float:
    """0 outside the quiet hours, else the seconds until they end."""
    hour = now.hour + now.minute / 60
    if not QUIET[0] <= hour < QUIET[1]:
        return 0.0
    end = now.replace(hour=int(QUIET[1]), minute=0, second=0, microsecond=0)
    return (end - now).total_seconds()


def blocks(points: pd.DataFrame) -> pd.DataFrame:
    """2x2-cell blocks (south-west cell) holding the points, busiest first.
    points: Latitude, Longitude, one row per find."""
    south = np.floor(np.round(points["Latitude"] / STEP) * STEP / (2 * STEP)) * 2 * STEP
    west = np.floor(np.round(points["Longitude"] / STEP) * STEP / (2 * STEP)) * 2 * STEP
    counts = pd.DataFrame({"south": south.round(2), "west": west.round(2)}).value_counts()
    return counts.rename("finds").reset_index()


def daily(hourly: pd.DataFrame) -> pd.DataFrame:
    """Hourly ERA5 rows of one or more cells -> each cell's local days.

    A local day at longitude L starts at UTC-L/15 h. Rain and radiation are summed over
    the hours ending in the day; temperature, humidity and wind are taken at the instants
    in it. A day missing any of its 24 hours is left out."""
    t = pd.to_datetime(hourly["valid_time"])
    offset = pd.to_timedelta(np.round(hourly["longitude"] / 15.0), unit="h")
    key = [hourly["latitude"].round(2), hourly["longitude"].round(2)]
    temp, dew = hourly["t2m"] - 273.15, hourly["d2m"] - 273.15
    humidity = 100.0 * np.exp(17.625 * dew / (243.04 + dew)) / np.exp(17.625 * temp / (243.04 + temp))
    rain = (hourly["tp"] * 1000.0).clip(lower=0)
    sums = pd.DataFrame({
        "Latitude": key[0], "Longitude": key[1], "Date": (t - pd.Timedelta(hours=1) + offset).dt.normalize(),
        "TotalPrecipitation_mm": rain, "Rain Hours": rain >= RAIN_HOUR_MM,
        "Solar Radiation (Wh/m2)": (hourly["ssrd"] / 3600.0).clip(lower=0), "hours": 1,
    }).groupby(["Latitude", "Longitude", "Date"]).sum()
    instants = pd.DataFrame({
        "Latitude": key[0], "Longitude": key[1], "Date": (t + offset).dt.normalize(),
        "temp": temp, "humidity": humidity.clip(upper=100.0),
        "wind": np.hypot(hourly["u10"], hourly["v10"]) * 3.6,
    }).groupby(["Latitude", "Longitude", "Date"]).agg(
        **{"Temperature (C)": ("temp", "mean"), "Temperature (C) Max": ("temp", "max"),
           "Temperature (C) Min": ("temp", "min"), "Humidity (%)": ("humidity", "mean"),
           "Wind Speed (kph)": ("wind", "max"), "instants": ("temp", "size")})
    days = sums.join(instants, how="inner")
    days = days[(days.pop("hours") == 24) & (days.pop("instants") == 24)]
    return days.reset_index().astype({"Rain Hours": int}).round(3)


def fetch_block(client, out: Path, south: float, west: float, last_day: str) -> None:
    path = out / "era5_blocks" / f"{south:.2f}_{west:.2f}.parquet"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    archive = path.with_suffix(".zip.part")
    for attempt in range(12):
        pause = seconds_until_allowed(datetime.now())
        if pause:
            log(f"quiet hours: waiting {pause / 3600:.1f} h")
            time.sleep(pause)
        try:
            client.retrieve(DATASET, {
                "variable": VARIABLES, "data_format": "csv",
                "area": [south + STEP, west, south, west + STEP],
                "date": f"{FIRST_DAY}/{last_day}",
            }, str(archive))
            break
        except Exception as error:  # the queue limit, the network, or the request itself
            text = str(error)
            busy = "queued requests" in text
            if not busy:
                log(f"block {south:.2f},{west:.2f} attempt {attempt + 1}: {text.splitlines()[-1][:160]}")
            time.sleep(30 if busy else min(1800, 60 * 2 ** attempt))
    else:
        log(f"GAVE UP block {south:.2f},{west:.2f}; rerun to retry")
        return
    with zipfile.ZipFile(archive) as zipped:
        hourly = pd.concat(pd.read_csv(io.BytesIO(zipped.read(i))) for i in zipped.infolist())
    archive.unlink()
    days = daily(hourly)
    days.to_parquet(path.with_suffix(".part"), index=False)
    path.with_suffix(".part").rename(path)


def find_points(out: Path) -> tuple[pd.DataFrame, bool]:
    """Every find so far, with its point's coordinates, and whether the list is final."""
    parts = [pd.read_parquet(p) for p in (out / "finds_cache").glob("*.parquet")]
    parts = [p for p in parts if len(p)]
    if not parts:
        return pd.DataFrame(columns=["Latitude", "Longitude"]), False
    finds = pd.concat(parts, ignore_index=True)
    base = pd.concat([
        pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{r}_BASE_DATA")).decode("utf-8")),
                    usecols=["Location_Id", "Latitude", "Longitude"])
        for r in ("NE", "SE", "USE", "USW")]).drop_duplicates("Location_Id")
    final = any(out.glob("finds_*_*.parquet"))
    return finds.merge(base, on="Location_Id"), final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--follow", action="store_true",
                        help="keep picking up new finds until build_training_finds.py is done")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    import cdsapi

    out = Path(args.out)
    # Through the end of last month: the newest days may not be in the time series yet.
    last_day = (datetime.now().replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")
    clients = [cdsapi.Client(url=CDS_URL, key=os.environ["CDSAPI_KEY"], quiet=True, progress=False)
               for _ in range(WORKERS)]
    while True:
        points, final = find_points(out)
        todo = [b for b in blocks(points).itertuples(index=False)
                if not (out / "era5_blocks" / f"{b.south:.2f}_{b.west:.2f}.parquet").exists()]
        if todo:
            log(f"{len(todo):,} blocks to fetch ({sum(b.finds for b in todo):,} finds), through {last_day}")
            started = time.time()
            with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                for n, _ in enumerate(pool.map(
                        lambda job: fetch_block(clients[job[0] % WORKERS], out, job[1].south, job[1].west, last_day),
                        enumerate(todo)), start=1):
                    if n % 50 == 0 or n == len(todo):
                        rate = n / (time.time() - started) * 3600
                        log(f"  {n:,}/{len(todo):,} blocks ({rate:.0f}/h)")
        if not args.follow or (final and not todo):
            break
        if not todo:
            time.sleep(600)
    log("done")


if __name__ == "__main__":
    main()

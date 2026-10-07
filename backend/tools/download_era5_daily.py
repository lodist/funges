#!/usr/bin/env python3
"""Download ERA5 daily weather for the model's training set (#291 step 2).

Copernicus' daily statistics at 0.25°, each area counted in its own local time, one
request per area, year, statistic and block of months. Every finished request is
unpacked into <out>/<area>/<year>/<statistic>_<months>/ and never asked for again, so the
script can be stopped and rerun at any time.

It submits nothing between 00:30 and 06:00: the nightly scoring runs from 01:30 and makes
its own Copernicus request, which must not wait behind these.

    python backend/tools/download_era5_daily.py --out ../era5_training
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forecast_pipeline as fp  # noqa: E402  (only for the .env loader)

DATASET = "derived-era5-single-levels-daily-statistics"
CDS_URL = "https://cds.climate.copernicus.eu/api"
AREAS = {  # [north, west, south, east]; the US split where the two time zones meet
    "EU": {"area": [71.5, -25.0, 34.0, 42.5], "time_zone": "utc+01:00"},
    "USE": {"area": [49.5, -100.0, 24.0, -67.0], "time_zone": "utc-05:00"},
    "USW": {"area": [49.5, -125.5, 24.0, -100.0], "time_zone": "utc-07:00"},
}
STATISTICS = {
    "daily_sum": ["total_precipitation", "surface_solar_radiation_downwards", "snowfall"],
    "daily_mean": ["2m_temperature", "2m_dewpoint_temperature"],
    "daily_maximum": ["2m_temperature", "instantaneous_10m_wind_gust"],
    "daily_minimum": ["2m_temperature"],
}
QUIET = (0.5, 6.0)  # local hours, start inclusive


def log(message: str) -> None:
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}", flush=True)


def seconds_until_allowed(now: datetime) -> float:
    """0 outside the quiet hours, else the seconds until they end."""
    hour = now.hour + now.minute / 60
    if not QUIET[0] <= hour < QUIET[1]:
        return 0.0
    end = now.replace(hour=int(QUIET[1]), minute=0, second=0, microsecond=0)
    return (end - now).total_seconds()


def jobs(years: list[int], last_month: dict[int, int]) -> list[tuple[str, int, str, list[int]]]:
    return [(area, year, statistic, list(range(1, last_month.get(year, 12) + 1)))
            for year in years for area in AREAS for statistic in STATISTICS]


def target(out: Path, area: str, year: int, statistic: str, months: list[int]) -> Path:
    return out / area / str(year) / f"{statistic}_{months[0]:02d}-{months[-1]:02d}"


def too_large(error: Exception) -> bool:
    text = str(error).lower()
    return any(word in text for word in ("too large", "cost limit", "exceed"))


def fetch(client, out: Path, area: str, year: int, statistic: str, months: list[int]) -> None:
    """Download one block, unpacked; halve the months if Copernicus calls it too large."""
    folder = target(out, area, year, statistic, months)
    if (folder / ".done").exists():
        return
    for attempt in range(6):
        pause = seconds_until_allowed(datetime.now())
        if pause:
            log(f"quiet hours: {area} {year} {statistic} waits {pause / 3600:.1f} h")
            time.sleep(pause)
        started = time.time()
        archive = folder.with_suffix(".zip.part")
        archive.parent.mkdir(parents=True, exist_ok=True)
        try:
            client.retrieve(DATASET, {
                "product_type": "reanalysis",
                "variable": STATISTICS[statistic],
                "year": str(year),
                "month": [f"{m:02d}" for m in months],
                "day": [f"{d:02d}" for d in range(1, 32)],
                "daily_statistic": statistic,
                "time_zone": AREAS[area]["time_zone"],
                "frequency": "1_hourly",
                "area": AREAS[area]["area"],
            }, str(archive))
        except Exception as error:  # the queue, the network or the request itself
            if too_large(error) and len(months) > 1:
                log(f"{area} {year} {statistic} {months[0]}-{months[-1]} too large; halving")
                half = len(months) // 2
                fetch(client, out, area, year, statistic, months[:half])
                fetch(client, out, area, year, statistic, months[half:])
                return
            log(f"{area} {year} {statistic} attempt {attempt + 1} failed: {error}")
            time.sleep(min(1800, 60 * 2 ** attempt))
            continue
        unpacked = folder.with_name(folder.name + ".part")
        shutil.rmtree(unpacked, ignore_errors=True)
        if zipfile.is_zipfile(archive):  # several variables: one netCDF each
            with zipfile.ZipFile(archive) as zipped:
                zipped.extractall(unpacked)
            archive.unlink()
        else:                            # one variable: the netCDF itself
            unpacked.mkdir(parents=True)
            archive.rename(unpacked / f"{STATISTICS[statistic][0]}_{statistic}.nc")
        shutil.rmtree(folder, ignore_errors=True)
        unpacked.rename(folder)
        (folder / ".done").write_text(datetime.now().isoformat(), encoding="utf-8")
        size = sum(f.stat().st_size for f in folder.iterdir()) / 1e6
        log(f"done {area} {year} {statistic} {months[0]}-{months[-1]}: "
            f"{size:.0f} MB in {(time.time() - started) / 60:.1f} min")
        return
    log(f"GAVE UP {area} {year} {statistic} {months[0]}-{months[-1]}; rerun to retry")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--first-year", type=int, default=2016)
    parser.add_argument("--last-year", type=int, default=2026)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    import cdsapi

    client = cdsapi.Client(url=CDS_URL, key=os.environ["CDSAPI_KEY"], quiet=True, progress=False)
    out = Path(args.out)
    # This year only up to the last month ERA5 has fully published (it runs ~5 days behind).
    newest = datetime.now() - timedelta(days=6)
    last_month = {newest.year: newest.month - 1} if newest.month > 1 else {}
    todo = jobs(list(range(args.first_year, args.last_year + 1)), last_month)
    todo = [job for job in todo if job[3]]
    log(f"{len(todo)} blocks to fetch into {out.resolve()}")
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for future in [pool.submit(fetch, client, out, *job) for job in todo]:
            future.result()
    log("all blocks fetched")


if __name__ == "__main__":
    main()

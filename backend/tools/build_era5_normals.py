#!/usr/bin/env python3
"""Monthly ERA5 normals (2016-2025) on the 0.25° grid, for the fruiting GBM.

The GBM reads each place's normal rain, temperature and humidity for the month: they let a
weather response depend on the local climate (20 mm means something else in Andalusia than
in Scotland). Training and the nightly scoring both look them up here, so the two can never
disagree. From Copernicus's monthly averaged reanalysis: 2 m temperature, 2 m dew point
(humidity from the monthly means through the Magnus formula) and total precipitation.

    python backend/tools/build_era5_normals.py      # writes backend/generated/era5_normals_{EU,US}.npz
"""
from __future__ import annotations

import io
import os
import sys
import time
import zipfile
from pathlib import Path

import netCDF4
import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import r2  # noqa: E402
from era5_normals import relative_humidity  # noqa: E402

API = "https://cds.climate.copernicus.eu/api/retrieve/v1"
DATASET = "reanalysis-era5-single-levels-monthly-means"
YEARS = range(2016, 2026)
# north, west, south, east: every region's box with a margin
BOXES = {"EU": [72.0, -26.0, 33.0, 46.0], "US": [50.5, -126.5, 23.0, -66.0]}
OUT = Path(__file__).resolve().parents[1] / "generated"


def order(key: str, box: list) -> str:
    request = {"product_type": ["monthly_averaged_reanalysis"],
               "variable": ["2m_temperature", "2m_dewpoint_temperature", "total_precipitation"],
               "year": [str(y) for y in YEARS], "month": [f"{m:02d}" for m in range(1, 13)],
               "time": ["00:00"], "data_format": "netcdf", "download_format": "unarchived", "area": box}
    r = requests.post(f"{API}/processes/{DATASET}/execution", json={"inputs": request},
                      headers={"PRIVATE-TOKEN": key}, timeout=60)
    r.raise_for_status()
    return r.json()["jobID"]


def download(key: str, job: str) -> list[bytes]:
    headers = {"PRIVATE-TOKEN": key}
    while (status := requests.get(f"{API}/jobs/{job}", headers=headers, timeout=60).json()["status"]) \
            not in ("successful", "failed", "rejected"):
        time.sleep(30)
    if status != "successful":
        raise RuntimeError(f"{job}: {status}")
    href = requests.get(f"{API}/jobs/{job}/results", headers=headers, timeout=60).json()["asset"]["value"]["href"]
    content = requests.get(href, timeout=600).content
    if content[:2] == b"PK":                     # several variables can come zipped, one file each
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            return [z.read(name) for name in z.namelist() if name.endswith(".nc")]
    return [content]


def normals(files: list[bytes]) -> dict:
    fields = {}
    for content in files:
        with netCDF4.Dataset("in-memory", memory=content) as nc:
            time_name = "valid_time" if "valid_time" in nc.variables else "time"
            months = netCDF4.num2date(nc[time_name][:], nc[time_name].units)
            month = np.array([m.month for m in months])
            lat, lon = nc["latitude"][:].astype(np.float32), nc["longitude"][:].astype(np.float32)
            for name in ("t2m", "d2m", "tp"):
                if name in nc.variables:
                    data = np.ma.filled(nc[name][:].astype(float), np.nan)
                    if data.ndim == 4:               # final and preliminary as an extra dimension
                        data = np.nanmax(data, axis=1)
                    fields[name] = np.stack([np.nanmean(data[month == m], axis=0) for m in range(1, 13)])
    t, td = fields["t2m"] - 273.15, fields["d2m"] - 273.15
    return {"lat": lat, "lon": lon,
            # float16: half the size; rounding stays under 0.04 °C, mm/day or % here
            "tmean": t.astype(np.float16),
            "rain": (fields["tp"] * 1000.0).astype(np.float16),        # m/day -> mm/day
            "rh": relative_humidity(t, td).astype(np.float16)}


def main() -> None:
    for line in (Path(__file__).resolve().parents[2] / ".env.secret").read_text(encoding="utf-8").splitlines():
        if line.startswith("CDSAPI_KEY="):
            os.environ.setdefault("CDSAPI_KEY", line.split("=", 1)[1].strip().strip('"'))
    key = os.environ["CDSAPI_KEY"]
    jobs = {name: order(key, box) for name, box in BOXES.items()}
    for name, job in jobs.items():
        grid = normals(download(key, job))
        np.savez_compressed(OUT / f"era5_normals_{name}.npz", **grid)
        r2.ship(OUT / f"era5_normals_{name}.npz")
        print(f"{name}: {len(grid['lat'])} x {len(grid['lon'])} cells, "
              f"tmean {np.nanmin(grid['tmean']):.1f}..{np.nanmax(grid['tmean']):.1f} °C", flush=True)


if __name__ == "__main__":
    main()

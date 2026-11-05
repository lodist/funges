#!/usr/bin/env python3
"""June-August rain (mm/day) per summer since 1991 on the 0.25° ERA5 grid, for summer_rain.py.

A black-truffle winter is as good as the summer before it was wet. Run it once a year after
August's monthly ERA5 is out (early September); until then the new winter scores without
the factor.

    python backend/tools/build_summer_rain.py      # writes backend/generated/summer_rain_EU.npz
"""
from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

import netCDF4
import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import r2  # noqa: E402
from build_era5_normals import API, BOXES, DATASET, OUT, download  # noqa: E402

FIRST_YEAR = 1991          # the normal is 1991-2020


def order(key: str, box: list, years: range) -> str:
    request = {"product_type": ["monthly_averaged_reanalysis"], "variable": ["total_precipitation"],
               "year": [str(y) for y in years], "month": ["06", "07", "08"], "time": ["00:00"],
               "data_format": "netcdf", "download_format": "unarchived", "area": box}
    r = requests.post(f"{API}/processes/{DATASET}/execution", json={"inputs": request},
                      headers={"PRIVATE-TOKEN": key}, timeout=60)
    r.raise_for_status()
    return r.json()["jobID"]


def summers(files: list[bytes]) -> dict:
    for content in files:
        with netCDF4.Dataset("in-memory", memory=content) as nc:
            time_name = "valid_time" if "valid_time" in nc.variables else "time"
            year = np.array([t.year for t in netCDF4.num2date(nc[time_name][:], nc[time_name].units)])
            data = np.ma.filled(nc["tp"][:].astype(float), np.nan)
            if data.ndim == 4:                       # final and preliminary as an extra dimension
                data = np.nanmax(data, axis=1)
            years = np.unique(year)
            rain = np.stack([np.nanmean(data[year == y], axis=0) for y in years]) * 1000.0   # m -> mm/day
            return {"lat": nc["latitude"][:].astype(np.float32), "lon": nc["longitude"][:].astype(np.float32),
                    "years": years.astype(np.int16), "rain": rain.astype(np.float32)}
    raise RuntimeError("no total_precipitation in the download")


def main() -> None:
    secret = Path(__file__).resolve().parents[2] / ".env.secret"     # a worktree has none: export it
    for line in secret.read_text(encoding="utf-8").splitlines() if secret.exists() else []:
        if line.startswith("CDSAPI_KEY="):
            os.environ.setdefault("CDSAPI_KEY", line.split("=", 1)[1].strip().strip('"'))
    key = os.environ["CDSAPI_KEY"]
    last = date.today().year if date.today().month >= 9 else date.today().year - 1
    job = order(key, BOXES["EU"], range(FIRST_YEAR, last + 1))
    print("ordered", job, flush=True)
    grid = summers(download(key, job))
    np.savez_compressed(OUT / "summer_rain_EU.npz", **grid)
    r2.ship(OUT / "summer_rain_EU.npz")
    print(f"summers {grid['years'][0]}-{grid['years'][-1]}, {len(grid['lat'])} x {len(grid['lon'])} cells")


if __name__ == "__main__":
    main()

"""Monthly ERA5 normals (2016-2025, 0.25°) per place: rain (mm/day), mean temperature (°C)
and relative humidity (%). Built by tools/build_era5_normals.py; read by the fruiting GBM in
training and in the nightly scoring, so both see the same values."""
from __future__ import annotations

from pathlib import Path

import numpy as np

GENERATED = Path(__file__).resolve().parent / "generated"
CONTINENT = {"NE": "EU", "SE": "EU", "USE": "US", "USW": "US"}
STEP = 0.25


def relative_humidity(t, td):
    """Magnus formula, °C in, % out."""
    return 100.0 * np.exp(17.625 * td / (243.04 + td) - 17.625 * t / (243.04 + t))


def load(region: str) -> dict:
    with np.load(GENERATED / f"era5_normals_{CONTINENT[region]}.npz") as z:
        return {name: z[name] for name in z.files}


def lookup(grid: dict, lats, lons, months) -> dict:
    """Each place's nearest cell, for its month (1-12); NaN outside the grid."""
    lat, lon = grid["lat"], grid["lon"]
    i = np.rint((lat[0] - np.asarray(lats, float)) / (lat[0] - lat[1])).astype(int)
    j = np.rint((np.asarray(lons, float) - lon[0]) / (lon[1] - lon[0])).astype(int)
    inside = (i >= 0) & (i < len(lat)) & (j >= 0) & (j < len(lon))
    i, j, m = np.clip(i, 0, len(lat) - 1), np.clip(j, 0, len(lon) - 1), np.asarray(months) - 1
    return {f"norm_{name}": np.where(inside, grid[name][m, i, j].astype(float), np.nan)
            for name in ("rain", "tmean", "rh")}

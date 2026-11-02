"""Last summer's rain against the place's 1991-2020 normal: a wet June-August makes a good
black-truffle winter, a dry one a poor one (national yields 1970-2017, Büntgen et al. 2019,
r = 0.63; French markets 2009-2025, x1.3 kg per SD; funges-lab qa/truffle-2026-11-02).
A species opts in with `summer_rain_per_sd`, the score's multiplier per SD of that rain.
Built by tools/build_summer_rain.py once a year after August."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

import r2
from era5_normals import CONTINENT, cells

GENERATED = Path(__file__).resolve().parent / "generated"
NORMAL = (1991, 2020)
Z_CAP = 2.0                # ponytail: the fits saw summers within about 2 SD; beyond, held flat


def load(region: str) -> dict:
    """The grid with each summer's rain as SD from the cell's 1991-2020 normal."""
    with np.load(r2.generated(GENERATED / f"summer_rain_{CONTINENT[region]}.npz")) as z:
        grid = {name: z[name] for name in z.files}
    base = grid["rain"][(grid["years"] >= NORMAL[0]) & (grid["years"] <= NORMAL[1])]
    with np.errstate(invalid="ignore", divide="ignore"):
        grid["z"] = (grid["rain"] - base.mean(axis=0)) / base.std(axis=0)
    return grid


def attach(species_params: dict, region: str) -> None:
    """The grid on every species that opts in. One that cannot load leaves them without it."""
    wanted = [p for p in species_params.values() if "summer_rain_per_sd" in p]
    if not wanted:
        return
    try:
        grid = load(region)
    except Exception as error:
        print(f"[warn] summer rain not loaded ({error}); scores go without it")
        return
    for p in wanted:
        p["summer_rain"] = grid
    print(f"Summer rain {grid['years'][0]}-{grid['years'][-1]} for {len(wanted)} species")


def factor(df: pd.DataFrame, params: dict):
    """Per-row multiplier: per_sd ** z of the summer before the date (September onwards: this
    year's; up to August: last year's). 1.0 without the grid, outside it, or for a summer it
    does not hold yet."""
    grid = params.get("summer_rain")
    if grid is None:
        return 1.0
    dates = pd.to_datetime(df["Date"])
    summer = (dates.dt.year - (dates.dt.month < 9)).to_numpy()
    k = np.clip(np.searchsorted(grid["years"], summer), 0, len(grid["years"]) - 1)
    i, j, inside = cells(grid, df["Latitude"], df["Longitude"])
    z = np.where(inside & (grid["years"][k] == summer), grid["z"][k, i, j], 0.0)
    return params["summer_rain_per_sd"] ** np.clip(np.nan_to_num(z), -Z_CAP, Z_CAP)

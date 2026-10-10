#!/usr/bin/env python3
"""The training table for the fitted weather model (#291 steps 2-3).

For every find, and the same point 14 and 21 days either side (the case-crossover's
controls), the weather it had: rain over the windows a fruiting response could use, days
since real rain, temperature, cold snaps, humidity and sunshine, all from ERA5 at the
point's 0.25° cell. And what today's model makes of the same days, via the production
code: its weather part and that part's temperature, humidity and rain components, for the
find's species, and for the bracket placebo every species of its region. A fit then has a
baseline to beat on exactly the same rows.

One output pair per downloaded ERA5 block, under <out>/training/ and
<out>/training_scores/, so it runs on whatever has arrived and a rerun only adds blocks
that came in since.

    python backend/tools/build_training_table.py --out ../era5_training
"""
from __future__ import annotations

import argparse
import sys
from io import StringIO
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "backend" / "tools"))
import forecast_pipeline as fp  # noqa: E402
from download_era5_points import STEP, log  # noqa: E402

OFFSETS = (0, -21, -14, 14, 21)
PLACEBO = "placebo"
LAG_DAYS = 42


def case_rows(finds: pd.DataFrame) -> pd.DataFrame:
    """Each find's own day and its four same-weekday controls; case_id is the finds row."""
    repeated = finds.loc[np.repeat(finds.index.to_numpy(), len(OFFSETS))]
    rows = pd.DataFrame({
        "case_id": repeated.index.to_numpy(), "species": repeated["species"].to_numpy(),
        "Location_Id": repeated["Location_Id"].to_numpy(), "region": repeated["region"].to_numpy(),
        "find_date": repeated["Date"].to_numpy(), "offset": np.tile(OFFSETS, len(finds)),
    })
    rows["date"] = rows["find_date"] + pd.to_timedelta(rows["offset"], unit="D")
    for column in ("cell_lat", "cell_lon"):
        if column in finds:
            rows[column] = repeated[column].to_numpy()
    return rows


def _window(values: np.ndarray, idx: np.ndarray, near: int, far: int, mean: bool = False) -> np.ndarray:
    """Sum (or mean) of values[idx-far .. idx-near]; NaN if any of those days is missing."""
    valid = np.isfinite(values)
    total = np.concatenate([[0.0], np.cumsum(np.where(valid, values, 0.0))])
    count = np.concatenate([[0], np.cumsum(valid)])
    lo, hi = idx - far, idx - near + 1
    inside = (lo >= 0) & (hi <= len(values))
    lo_c, hi_c = np.clip(lo, 0, len(values)), np.clip(hi, 0, len(values))
    sums, counts = total[hi_c] - total[lo_c], count[hi_c] - count[lo_c]
    out = sums / np.maximum(counts, 1) if mean else sums
    return np.where(inside & (counts == far - near + 1), out, np.nan)


def features(cell: pd.DataFrame, dates: pd.DatetimeIndex) -> pd.DataFrame:
    """One cell's daily ERA5 -> the weather features of each date, in the order given."""
    cell = cell.set_index("Date").sort_index()
    cell = cell.reindex(pd.date_range(cell.index[0], cell.index[-1]))  # gaps become NaN days
    idx = np.asarray((pd.DatetimeIndex(dates) - cell.index[0]).days)
    rain = cell["TotalPrecipitation_mm"].to_numpy(float)
    temp = cell["Temperature (C)"].to_numpy(float)
    tmin = cell["Temperature (C) Min"].to_numpy(float)
    humidity = cell["Humidity (%)"].to_numpy(float)
    sun = cell["Solar Radiation (Wh/m2)"].to_numpy(float)

    position = np.arange(len(rain), dtype=float)
    last_real_rain = np.maximum.accumulate(np.where(rain >= 5.0, position, -1.0))
    before = idx - 1
    seen = np.where((before >= 0) & (before < len(rain)), last_real_rain[np.clip(before, 0, len(rain) - 1)], -1.0)
    frost = np.where(np.isfinite(tmin), (tmin < 0).astype(float), np.nan)

    out = pd.DataFrame({
        "rain_0": _window(rain, idx, 0, 0),
        "rain_1_3": _window(rain, idx, 1, 3),
        "rain_4_7": _window(rain, idx, 4, 7),
        "rain_8_14": _window(rain, idx, 8, 14),
        "rain_15_28": _window(rain, idx, 15, 28),
        "rain_29_42": _window(rain, idx, 29, 42),
        "days_since_rain5": np.where(seen >= 0, idx - seen, np.nan),
        "temp_0": _window(temp, idx, 0, 0),
        "temp_1_7": _window(temp, idx, 1, 7, mean=True),
        "temp_8_14": _window(temp, idx, 8, 14, mean=True),
        "tmin_1_3": _window(tmin, idx, 1, 3, mean=True),
        "tmin_8_14": _window(tmin, idx, 8, 14, mean=True),
        "frost_days_1_14": _window(frost, idx, 1, 14),
        "humidity_0": _window(humidity, idx, 0, 0),
        "humidity_1_7": _window(humidity, idx, 1, 7, mean=True),
        "humidity_8_21": _window(humidity, idx, 8, 21, mean=True),
        "sun_1_7_kwh": _window(sun, idx, 1, 7) / 1000.0,
    })
    out["tmin_drop"] = out["tmin_1_3"] - out["tmin_8_14"]
    return out


def _history(block: pd.DataFrame) -> pd.DataFrame:
    """ERA5 daily as the master parquet's raw columns. The statics are placeholders: they
    only enter the static part, never the weather part read here."""
    return pd.DataFrame({
        "Location_Id": block["Latitude"].round(2).astype(str) + "_" + block["Longitude"].round(2).astype(str),
        "Date": block["Date"], "Latitude": block["Latitude"], "Longitude": block["Longitude"],
        "Elevation (m)": 500.0, "Pressure (hPa)": np.nan,
        "TotalPrecipitation_mm": block["TotalPrecipitation_mm"], "Humidity (%)": block["Humidity (%)"],
        "Wind Speed (m/s)": block["Wind Speed (kph)"] / 3.6, "Temperature (C)": block["Temperature (C)"],
        "dist_m_water": 100.0, "dist_m_sea": 10000.0, "climate_zone": "temperate", "ph_level": 6.5,
    })


def baseline(block: pd.DataFrame, rows: pd.DataFrame, specs: dict) -> pd.DataFrame:
    """Today's model on the rows' days: weather part and components, long by species."""
    from qa_season_branch_replay import BRANCH_LAG_COLUMNS
    from qa_weather_skill import decompose

    history = _history(block)
    rows = rows.assign(Location_Id_cell=rows["cell_lat"].round(2).astype(str) + "_" + rows["cell_lon"].round(2).astype(str))
    wanted = rows[["Location_Id_cell", "date"]].drop_duplicates().rename(
        columns={"Location_Id_cell": "Location_Id", "date": "Date"})
    target = history.merge(wanted, on=["Location_Id", "Date"])
    if target.empty:
        return pd.DataFrame()
    frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS, LAG_DAYS, target=target).reset_index(drop=True)
    pieces = []
    for region, here in rows.groupby("region"):
        params, zone_curves = specs[region]
        species_rows = here[here["species"] != PLACEBO]
        jobs = [(s, species_rows[species_rows["species"] == s]) for s in species_rows["species"].unique()]
        placebo = here[here["species"] == PLACEBO]
        if len(placebo):
            jobs += [(s, placebo) for s in params]
        for species, subset in jobs:
            if species not in params or subset.empty:
                continue
            parts = decompose(frame, species, params, zone_curves)[
                ["Location_Id", "Date", "weather_part", "temp", "humidity", "moisture"]]
            scored = subset[["case_id", "offset", "Location_Id_cell", "date"]].merge(
                parts, left_on=["Location_Id_cell", "date"], right_on=["Location_Id", "Date"])
            pieces.append(scored.drop(columns=["Location_Id_cell", "date", "Location_Id", "Date"])
                          .assign(species=species))
    return pd.concat(pieces, ignore_index=True) if pieces else pd.DataFrame()


def process_block(job) -> str:
    block_path, rows, specs, out = job
    block = pd.read_parquet(block_path)
    pieces = []
    for (lat, lon), here in rows.groupby(["cell_lat", "cell_lon"]):
        cell = block[(block["Latitude"].round(2) == round(lat, 2)) & (block["Longitude"].round(2) == round(lon, 2))]
        if cell.empty:
            continue
        pieces.append(pd.concat([here.reset_index(drop=True),
                                 features(cell, pd.DatetimeIndex(here["date"]))], axis=1))
    name = block_path.name
    if pieces:
        table = pd.concat(pieces, ignore_index=True)
        table.to_parquet(out / "training" / name, index=False)
        baseline(block, table, specs).to_parquet(out / "training_scores" / name, index=False)
    else:
        pd.DataFrame().to_parquet(out / "training" / name, index=False)
    return name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    from qa_season_branch_replay import load_specs

    out = Path(args.out)
    for folder in ("training", "training_scores"):
        (out / folder).mkdir(exist_ok=True)
    finds = pd.read_parquet(sorted(out.glob("finds_*_*.parquet"))[-1])
    base = pd.concat([
        pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(f"{r}_BASE_DATA")).decode("utf-8")),
                    usecols=["Location_Id", "Latitude", "Longitude"])
        for r in ("NE", "SE", "USE", "USW")]).drop_duplicates("Location_Id")
    finds = finds.reset_index(drop=True).merge(base, on="Location_Id", how="left").set_index(finds.index)
    finds["cell_lat"] = (np.round(finds["Latitude"] / STEP) * STEP).round(2)
    finds["cell_lon"] = (np.round(finds["Longitude"] / STEP) * STEP).round(2)
    finds["block"] = [f"{np.floor(a / (2 * STEP)) * 2 * STEP:.2f}_{np.floor(b / (2 * STEP)) * 2 * STEP:.2f}"
                      for a, b in zip(finds["cell_lat"], finds["cell_lon"])]
    session = requests.Session()
    specs = {region: load_specs(session, region) for region in ("NE", "SE", "USE", "USW")}

    done = {p.name for p in (out / "training").glob("*.parquet")}
    jobs = []
    for block_path in sorted((out / "era5_blocks").glob("*.parquet")):
        if block_path.name in done:
            continue
        here = finds[finds["block"] == block_path.stem]
        jobs.append((block_path, case_rows(here), specs, out))
    log(f"{len(jobs):,} blocks to build ({sum(len(j[1]) for j in jobs):,} rows)")
    with Pool(args.workers) as pool:
        for n, _ in enumerate(pool.imap_unordered(process_block, jobs), start=1):
            if n % 200 == 0 or n == len(jobs):
                log(f"  {n:,}/{len(jobs):,} blocks")


if __name__ == "__main__":
    main()

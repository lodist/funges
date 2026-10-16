"""Each fitted weather model's place level, put where the hand-set weather part has the place.

The fits (fit_fruiting.py, fit_fruiting_gbm.py) learn from a find day against the same place's
other days, so how one place compares with another is not something they learned, yet their
part replaces the temperature, humidity and rain parts. Replayed on 2026's finds
(scripts/qa_replay.py) they timed finds better than the hand-set parts but ranked the places
worse: North Europe porcini's GBM placed its finds at 0.74 of a random place's score against
the hand-set 0.79, pine bolete 0.75 against 0.79. Put each place-month's fitted part at the
hand-set part's mean for it, the same finds were placed at 0.81 and timed as the fit times them.

So, per fitted model, place and calendar month: the shift to the fitted index that puts its mean
where the hand-set weather part's mean is, taken onto the index's scale through the month's map
(which pairs the two by quantile over every place). The nightly scoring adds it to the index
(forecast_pipeline.attach_fit_levels): under the place's usual weather the fitted part lands on
the hand-set one, and the fit moves only the days. The shift is the same for a place within a
month, so the held-out tests the fits shipped on, a find day against the same place 2-3 weeks
either side, are as they were.

ERA5 2016-2025 (2026 is what the replay tests) at up to MAX_CELLS cells of each region's
training blocks, every DAY_STEP-th day: the fitted index on ERA5 inputs, as fitted; the hand-set
part on stored-level inputs, as the nightly run computes it, with the stored-input corrections
the model's map was built with. A cell's mean per month reaches the normals grid nodes the
region's places fall on through the NEIGHBOURS cells nearest in climate (the month's normal
temperature, rain and humidity) and place.

Writes backend/generated/fit_levels_<EU|US>.npz: "<species>.<region>.<gbm|linear>" -> int16
hundredths of the index per [month, lat, lon] of the era5_normals grid, FIT_LEVEL_NONE off it.
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import forecast_pipeline as fp  # noqa: E402  first: it loads LightGBM before pandas and pyarrow

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402

import build_training_table as tt  # noqa: E402
import era5_normals  # noqa: E402
import fit_fruiting as ff  # noqa: E402
import fit_fruiting_gbm as fg  # noqa: E402
from download_era5_points import log  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REGIONS = ("NE", "SE", "USE", "USW")
YEARS = ("2016-01-01", "2025-12-31")
DAY_STEP = 3
MAX_CELLS = 1200          # per region
REACH_KM = 30.0           # a block's cell is the region's whose place is nearest, within this
MIN_DAYS = 10             # per cell and month
NEIGHBOURS = 12
# One unit of each in the neighbour search: a cell 3 °C warmer weighs like one 110 km away.
SCALES = {"tmean": 3.0, "rain": 0.25, "rh": 5.0, "km": 110.0}

_WORKER = {}


def to_index(part, dates, maps):
    """The hand-set weather part back onto a fitted index's scale: fp._monthly_map inverted, the
    months either side blended the same way."""
    months = (pd.DatetimeIndex(dates).dayofyear.to_numpy() - 15.0) / (365.25 / 12)
    before = np.floor(months).astype(int)
    weight = months - before
    out = np.empty(len(part))
    for month in np.unique(before):
        rows = before == month
        back = []
        for m in (maps[month % 12], maps[(month + 1) % 12]):
            parts = np.asarray(m["weather_part"], float)
            parts = parts + np.arange(len(parts)) * 1e-9          # ties (a dry month's zeros) kept in order
            back.append(np.interp(part[rows], parts, np.asarray(m["eta"], float)))
        out[rows] = (1 - weight[rows]) * back[0] + weight[rows] * back[1]
    return out


def fitted_models(region):
    """key -> (species, kind, what a worker needs to rebuild the model) for every fitted model the
    region may score with: its GBMs and its linear fits (a GBM's species falls back to its fit)."""
    fit = json.loads((ROOT / "backend" / "generated" / "fruiting_fit.json").read_text(encoding="utf-8"))
    spec = json.loads((ROOT / "backend" / "generated" / "fruiting_gbm.json").read_text(encoding="utf-8"))
    linear = {s: {} for s, regions in fit["models"].items() if region in regions}
    gbm = {s: {} for s, m in spec["models"].items() if region in m["regions"]}
    fp.attach_fruiting_models(linear, region)
    fp.attach_fruiting_gbm(gbm, region, pd.Timestamp.now())
    out = {}
    for s, p in linear.items():
        m = p["fruiting"]
        out[f"{s}.{region}.linear"] = (s, "linear", {"beta": m["beta"], "means": m["means"], "sds": m["sds"],
                                                     "map": m["map"], "corrections": {"Humidity (%)": m["humidity_from_stored"]}})
    for s, p in gbm.items():
        m = p.get("fruiting_gbm")
        if m:
            out[f"{s}.{region}.gbm"] = (s, "gbm", {"booster": m["booster"].model_to_string(), "map": m["map"],
                                                   "corrections": m["corrections"]})
    return out


def _start(region, models, specs):
    import lightgbm as lgb
    grid = era5_normals.load(region)
    built = {}
    for key, (species, kind, m) in models.items():
        index = (ff.linear_index(np.asarray(m["beta"], float), np.asarray(m["means"], float), np.asarray(m["sds"], float), grid)
                 if kind == "linear" else fg.gbm_index(lgb.Booster(model_str=m["booster"]), region))
        built[key] = (species, index, m["map"], {c: tuple(ab) for c, ab in m["corrections"].items()})
    _WORKER.update(region=region, models=built, specs=specs)


def block_levels(job):
    """One ERA5 block's cells -> per model, cell and month: the mean of the hand-set part's index
    less the fitted index, and the days behind it."""
    path, cells = job
    region, models, specs = _WORKER["region"], _WORKER["models"], _WORKER["specs"]
    block = pd.read_parquet(path)
    block = block[(block["Date"] >= YEARS[0]) & (block["Date"] <= YEARS[1])]
    fitted = []
    for lat, lon in cells:
        cell = block[(block["Latitude"].round(2) == lat) & (block["Longitude"].round(2) == lon)]
        if len(cell) <= 42:
            continue
        days = pd.DatetimeIndex(cell["Date"].sort_values().iloc[42::DAY_STEP])
        for key, (species, index, _, _) in models.items():
            fitted.append(pd.DataFrame({"key": key, "species": species, "region": region, "cell_lat": lat,
                                        "cell_lon": lon, "date": days, "offset": 0, "eta": index(cell, days)}))
    if not fitted:
        return pd.DataFrame()
    fitted = pd.concat(fitted, ignore_index=True)
    fitted["case_id"] = np.arange(len(fitted))
    out = []
    groups = {}
    for key, (_, _, _, corrections) in models.items():
        groups.setdefault(tuple(sorted(corrections.items())), []).append(key)
    for corrections, keys in groups.items():
        stored_level = block.assign(**{c: (block[c] - a) / b for c, (a, b) in corrections})
        if "Humidity (%)" in dict(corrections):
            stored_level["Humidity (%)"] = stored_level["Humidity (%)"].clip(0, 100)
        rows = fitted[fitted["key"].isin(keys)]
        hand = tt.baseline(stored_level, rows, specs)
        if hand.empty:
            continue
        both = rows.merge(hand[["case_id", "weather_part"]], on="case_id").dropna(subset=["eta", "weather_part"])
        for key, mine in both.groupby("key"):
            gap = to_index(mine["weather_part"].to_numpy(float), mine["date"], models[key][2]) - mine["eta"].to_numpy(float)
            out.append(mine.assign(month=pd.DatetimeIndex(mine["date"]).month, gap=gap)
                           .groupby(["key", "cell_lat", "cell_lon", "month"])["gap"].agg(["mean", "size"]).reset_index())
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def _climate(grid, month, lats, lons):
    normal = era5_normals.lookup(grid, lats, lons, np.full(len(lats), month))
    return np.column_stack([normal["norm_tmean"] / SCALES["tmean"], np.log1p(normal["norm_rain"]) / SCALES["rain"],
                            normal["norm_rh"] / SCALES["rh"], np.asarray(lats, float) * 111.0 / SCALES["km"],
                            np.asarray(lons, float) * 111.0 * np.cos(np.radians(lats)) / SCALES["km"]])


def spread(cells, grid, nodes):
    """Per month, each node's offset: the inverse-distance mean of the NEIGHBOURS cells nearest
    in climate and place ([12, nodes]; NaN where the month has no cells)."""
    out = np.full((12, len(nodes)), np.nan)
    node_lat, node_lon = grid["lat"][nodes[:, 0]], grid["lon"][nodes[:, 1]]
    for month in range(1, 13):
        mine = cells[(cells["month"] == month) & (cells["size"] >= MIN_DAYS)]
        here = _climate(grid, month, mine["cell_lat"].to_numpy(float), mine["cell_lon"].to_numpy(float))
        ok = np.isfinite(here).all(axis=1)
        if ok.sum() < NEIGHBOURS:
            continue
        there = _climate(grid, month, node_lat, node_lon)
        known = np.isfinite(there).all(axis=1)
        distance, near = cKDTree(here[ok]).query(there[known], k=NEIGHBOURS)
        weight = 1.0 / (distance + 0.3)
        values = mine["mean"].to_numpy(float)[ok][near]
        out[month - 1, known] = (weight * values).sum(axis=1) / weight.sum(axis=1)
    return out


def region_cells(regions, places):
    """Every block cell (block name: its south-west corner on 0.5°, cells on 0.25°) -> the region
    whose place is nearest, within REACH_KM."""
    names = [p.stem for p in BLOCKS.glob("*.parquet")]
    rows = []
    for name in names:
        lat, lon = (float(v) for v in name.split("_"))
        rows += [(name, round(lat + a, 2), round(lon + b, 2)) for a in (0.0, 0.25) for b in (0.0, 0.25)]
    cells = pd.DataFrame(rows, columns=["block", "lat", "lon"])
    every = pd.concat([pd.DataFrame(p, columns=["lat", "lon"]).assign(region=r) for r, p in places.items()],
                      ignore_index=True)
    xyz = lambda lat, lon: np.column_stack([np.cos(np.radians(lat)) * np.cos(np.radians(lon)),  # noqa: E731
                                            np.cos(np.radians(lat)) * np.sin(np.radians(lon)), np.sin(np.radians(lat))])
    distance, index = cKDTree(xyz(every["lat"].to_numpy(), every["lon"].to_numpy())).query(
        xyz(cells["lat"].to_numpy(), cells["lon"].to_numpy()))
    cells["region"] = np.where(distance * 6371.0 <= REACH_KM, every["region"].to_numpy()[index], None)
    return cells[cells["region"].isin(regions)]


def main():
    global BLOCKS
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--regions", default=",".join(REGIONS))
    parser.add_argument("--blocks", type=Path, default=ROOT.parent / "era5_training" / "era5_blocks")
    parser.add_argument("--workers", type=int, default=16)
    args = parser.parse_args()
    BLOCKS = args.blocks
    regions = args.regions.split(",")
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    from qa_season_branch_replay import load_specs

    places = {r: fp._load_coords_any(fp.get_required_env(f"{r}_UNIQUE_COORDINATES")) for r in REGIONS}
    cells = region_cells(regions, places)
    files = {}
    for region in regions:
        models = fitted_models(region)
        if not models:
            continue
        mine = cells[cells["region"] == region]
        mine = mine.sample(min(MAX_CELLS, len(mine)), random_state=291)
        jobs = [(BLOCKS / f"{block}.parquet", list(zip(g["lat"], g["lon"]))) for block, g in mine.groupby("block")]
        log(f"{region}: {len(models)} fitted models, {len(mine)} cells in {len(jobs)} blocks")
        specs = {region: load_specs(None, region)}
        with ProcessPoolExecutor(args.workers, initializer=_start, initargs=(region, models, specs)) as pool:
            parts = [p for p in pool.map(block_levels, jobs, chunksize=4) if not p.empty]
        gaps = pd.concat(parts, ignore_index=True)
        grid = era5_normals.load(region)
        i, j, inside = era5_normals.cells(grid, places[region][:, 0], places[region][:, 1])
        nodes = np.unique(np.column_stack([i[inside], j[inside]]), axis=0)
        continent = era5_normals.CONTINENT[region]
        files.setdefault(continent, {"lat": grid["lat"], "lon": grid["lon"]})
        for key in sorted(models):
            offset = spread(gaps[gaps["key"] == key], grid, nodes)
            stored = np.full((12, len(grid["lat"]), len(grid["lon"])), fp.FIT_LEVEL_NONE, dtype=np.int16)
            stored[:, nodes[:, 0], nodes[:, 1]] = np.where(np.isfinite(offset), np.rint(offset * fp.FIT_LEVEL_SCALE),
                                                           fp.FIT_LEVEL_NONE).astype(np.int16)
            files[continent][key] = stored
            months = np.nanmean(offset, axis=1)
            log(f"  {key}: offset by month {np.round(months, 2).tolist()}")
    for continent, arrays in files.items():
        path = fp.FIT_LEVELS_DIR / f"fit_levels_{continent}.npz"
        if path.exists():  # keep the regions this run did not rebuild
            with np.load(path) as old:
                arrays = {**{name: old[name] for name in old.files}, **arrays}
        np.savez_compressed(path, **arrays)
        log(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()

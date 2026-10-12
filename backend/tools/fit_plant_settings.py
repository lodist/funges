#!/usr/bin/env python3
"""A plant's weather and place settings, fitted to where it is found on the day.

Each sighting of a plant in the stage people pick (tools/fit_phenology.py's table) is compared
with up to K sightings of other plants made in the same region within +-WINDOW_DAYS at other
places: where people were out looking that week. The season is the same for all of them, so
only the weather and place parts of the score can rank the plant's sighting first, and fitting
them cannot learn the season (the trap of fitting an optimal temperature to summer sightings).
The range prior scores with them, as in production: a region's list spans Spain to Germany, and
settings fitted without it learn where the plant grows (wild asparagus wanted 28 C) rather than
the weather it is found in, which the range prior already says.
Per plant and region, on 2016-2023, a coordinate search over the hand-set settings (optimal
temperature, humidity, the rain it needs, altitude, pH) ranks the sightings higher; 2024 on is
held out. Fitted settings ship where they rank the held-out sightings better than today's
(paired bootstrap interval above zero).

Regions as the nightly run scores them: in the US by the app's split at 100 W (the blend gives
US West's eastern places US East's settings), in Europe by the nearest place on each list.

    python backend/tools/fit_plant_settings.py --out ../plant_training --strata   # strata + their weather
    python backend/tools/fit_plant_settings.py --out ../plant_training            # fit, test, report
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import sys
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend" / "tools"), str(ROOT / "scripts")]
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import find_day_rank  # noqa: E402
from fit_phenology import STAGE, TAXA  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS  # noqa: E402
from qa_weather_skill import LAG_DAYS  # noqa: E402
from species_registry import get_species_params  # noqa: E402

K, WINDOW_DAYS, MAX_CASES = 10, 3, 4000          # cases per plant, region and split
TEST_FROM, MIN_CASES, PASSES = 2024, 150, 2
SEARCH = ("optimal_temp", "optimal_humidity", "min_cumulative_rain", "optimal_alt", "optimal_pH")
STATIC_ENV = {"EU": "EU_STATIC_INFO", "US": "US_STATIC_INFO"}


def scoring_region(s: pd.DataFrame) -> np.ndarray:
    """The region whose settings score each sighting's place."""
    region = np.where(s["lon"] < fp.get_region_boundaries()["uswMaxLongitude"], "USW", "USE").astype(object)
    eu = (s["box"] == "EU").to_numpy()
    if eu.any():
        lat, lon = s.loc[eu, "lat"].to_numpy(float), s.loc[eu, "lon"].to_numpy(float)
        near = {r: fp._nearest_km(fp._load_coords_any(fp.get_required_env(f"{r}_UNIQUE_COORDINATES")), lat, lon)
                for r in ("NE", "SE")}
        region[eu] = np.where(near["NE"] <= near["SE"], "NE", "SE")
    return region


def taxa(out: Path) -> pd.Series:
    """Each sighting's plant, from the iNaturalist file it came in."""
    frames = [pd.read_parquet(f).assign(taxon=f.stem) for f in sorted((out / "inat").glob("*.parquet"))]
    return pd.concat([f[["id", "taxon"]] for f in frames if len(f)]).drop_duplicates("id").set_index("id")["taxon"]


def strata(s: pd.DataFrame, rng) -> pd.DataFrame:
    """(case, slot 0 = the plant's sighting, slots 1.. = other plants' sightings in the region
    within +-WINDOW_DAYS at other cells), per plant scored in the region."""
    params = {r: get_species_params(r) for r in ("NE", "SE", "USE", "USW")}
    rows, case = [], 0
    for region, here in s.groupby("scoring_region"):
        here = here.sort_values("date").reset_index(drop=True)
        days = here["date"].to_numpy()
        cell = (here["cell_lat"].astype(str) + "_" + here["cell_lon"].astype(str)).to_numpy()
        for species in [sp for sp in STAGE if sp in params[region]]:
            taxon = TAXA.get(species, species)
            mine = here.index[here[species].to_numpy(bool)]
            for train in (True, False):
                picked = mine[(here.loc[mine, "year"] < TEST_FROM) == train]
                if len(picked) > MAX_CASES:
                    picked = rng.choice(picked, MAX_CASES, replace=False)
                for i in picked:
                    lo = np.searchsorted(days, days[i] - np.timedelta64(WINDOW_DAYS, "D"), side="left")
                    hi = np.searchsorted(days, days[i] + np.timedelta64(WINDOW_DAYS, "D"), side="right")
                    pool = np.arange(lo, hi)
                    pool = pool[(here["taxon"].to_numpy()[pool] != taxon) & (cell[pool] != cell[i])]
                    if len(pool) < 3:
                        continue
                    pool = rng.choice(pool, min(K, len(pool)), replace=False)
                    rows.append((case, 0, species, region, here.at[i, "id"]))
                    rows.extend((case, j + 1, species, region, here.at[p, "id"]) for j, p in enumerate(pool))
                    case += 1
    return pd.DataFrame(rows, columns=["case", "slot", "species", "region", "id"])


def static_info(continent: str) -> pd.DataFrame:
    return pd.read_csv(StringIO(fp.r2_fetch(fp.get_required_env(STATIC_ENV[continent])).decode("utf-8")))


def weather(rows: pd.DataFrame, blocks: Path, static: pd.DataFrame) -> pd.DataFrame:
    """Each sighting's day as the scoring code reads it: ERA5 daily lags from its cell's block and
    the place's statics from the nearest static-info point."""
    from scipy.spatial import cKDTree
    tree = cKDTree(static[["Latitude", "Longitude"]].to_numpy(float))
    rows = rows.assign(block=[f"{np.floor(a / 0.5) * 0.5:.2f}_{np.floor(b / 0.5) * 0.5:.2f}"
                              for a, b in zip(rows["cell_lat"], rows["cell_lon"])])
    out = []
    for block, here in rows.groupby("block"):
        path = blocks / f"{block}.parquet"
        if not path.exists():
            continue
        w = pd.read_parquet(path)
        w["Date"] = pd.to_datetime(w["Date"])
        near = tree.query(w[["Latitude", "Longitude"]].to_numpy(float))[1]
        history = pd.DataFrame({
            "Location_Id": w["Latitude"].round(2).astype(str) + "_" + w["Longitude"].round(2).astype(str),
            "Date": w["Date"], "Latitude": w["Latitude"], "Longitude": w["Longitude"],
            "Elevation (m)": static["Altitude"].to_numpy(float)[near], "Pressure (hPa)": np.nan,
            "TotalPrecipitation_mm": w["TotalPrecipitation_mm"], "Humidity (%)": w["Humidity (%)"],
            "Wind Speed (m/s)": w["Wind Speed (kph)"] / 3.6, "Temperature (C)": w["Temperature (C)"],
            "dist_m_water": static["dist_m_water"].to_numpy(float)[near], "dist_m_sea": static["dist_m_sea"].to_numpy(float)[near],
            "climate_zone": static["climate_zone"].to_numpy()[near], "ph_level": static["ph_level"].to_numpy(float)[near]})
        keys = here.assign(Location_Id=here["cell_lat"].round(2).astype(str) + "_" + here["cell_lon"].round(2).astype(str))
        wanted = keys[["Location_Id", "date"]].drop_duplicates().rename(columns={"date": "Date"})
        target = history.merge(wanted, on=["Location_Id", "Date"])
        if target.empty:
            continue
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS, LAG_DAYS, target=target)
        out.append(keys[["id", "Location_Id", "date"]].merge(frame, left_on=["Location_Id", "date"], right_on=["Location_Id", "Date"]))
    return pd.concat(out, ignore_index=True)


def build(out: Path, blocks: Path) -> None:
    s = pd.read_parquet(out / "phenology_table.parquet")
    s["taxon"] = s["id"].map(taxa(out))
    s["scoring_region"] = scoring_region(s)
    layout = strata(s, np.random.default_rng(291))
    layout.to_parquet(out / "settings_strata.parquet", index=False)
    print(f"{layout['case'].nunique():,} cases, {len(layout):,} rows", flush=True)
    need = s[s["id"].isin(layout["id"])]
    frames = []
    for continent, regions in (("EU", ("NE", "SE")), ("US", ("USE", "USW"))):
        part = need[need["scoring_region"].isin(regions)]
        frames.append(weather(part, blocks, static_info(continent)).drop(columns=["Location_Id", "date"]))
        print(f"{continent}: {len(frames[-1]):,} sightings with weather", flush=True)
    pd.concat(frames, ignore_index=True).drop_duplicates("id").to_parquet(out / "settings_weather.parquet", index=False)


def candidates(name: str, value: float) -> list:
    """The values searched for one setting, today's among them."""
    grid = {"optimal_temp": [value + d for d in (-6, -4, -2, 0, 2, 4, 6)],
            "optimal_humidity": [v for v in (value + d for d in range(-20, 25, 5)) if 30 <= v <= 100],
            "min_cumulative_rain": [1, 5, 10, 20, 40, 60],
            "optimal_alt": [0, 100, 250, 500, 800, 1200, 1800],
            "optimal_pH": [4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0]}[name]
    return sorted(set(grid) | {value})


def with_value(params: dict, name: str, value: float) -> dict:
    """The settings with one moved; temperature drags its soil optimum and limits along, pH its range."""
    p = dict(params)
    if name == "optimal_temp":
        shift = value - params["optimal_temp"]
        for key in ("optimal_temp", "optimal_soil_temp", "min_temp", "max_temp"):
            if key in p:
                p[key] = params[key] + shift
    elif name == "optimal_pH":
        shift = value - params["optimal_pH"]
        p["optimal_pH"], p["pH_range_near"] = value, [a + shift for a in params["pH_range_near"]]
    else:
        p[name] = value
    return p


def ranks(frame: pd.DataFrame, at: np.ndarray, mask: np.ndarray, species: str, params: dict,
          prior=None) -> np.ndarray:
    """Per case, the find-day rank of the plant's sighting among its stratum (0.5 = no skill),
    the range prior included. The season is left out: every row of a stratum shares it."""
    p = {**params, "season_months": list(range(1, 13)), **({"range_prior": prior} if prior is not None else {})}
    p.pop("season_curve", None)
    score = fp.calculate_mushroom_score(frame.copy(), {species: p}, {})[f"{species}_score"].to_numpy(float)
    return find_day_rank(np.where(mask, score[np.clip(at, 0, None)], 0.0), mask)


def paired_ci(after: np.ndarray, before: np.ndarray, seed: int = 291) -> list:
    rng = np.random.default_rng(seed)
    d = after - before
    draws = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(1000)]
    return [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])]


def fit_one(layout: pd.DataFrame, weather: pd.DataFrame, s_year: pd.Series, species: str, region: str,
            prior=None) -> dict:
    """Coordinate search on the training cases; today's and the fitted settings on the held-out ones."""
    rows = layout[(layout["species"] == species) & (layout["region"] == region)]
    frame = weather[weather["id"].isin(rows["id"])].reset_index(drop=True)
    where = pd.Series(np.arange(len(frame)), index=frame["id"].to_numpy())
    cases = np.unique(rows["case"].to_numpy(), return_inverse=True)[1]
    at = np.full((cases.max() + 1, K + 1), -1)
    at[cases, rows["slot"].to_numpy()] = where.reindex(rows["id"]).fillna(-1).astype(int).to_numpy()
    mask = at >= 0
    keep = mask[:, 0] & (mask[:, 1:].sum(axis=1) >= 3)
    at, mask = at[keep], mask[keep]
    year = s_year.reindex(frame["id"].to_numpy()[at[:, 0]]).to_numpy()
    train, test = year < TEST_FROM, year >= TEST_FROM
    entry = {"species": species, "region": region, "train cases": int(train.sum()), "test cases": int(test.sum())}
    if train.sum() < MIN_CASES or test.sum() < MIN_CASES:
        return entry
    today = get_species_params(region)[species]
    best, best_rank = today, ranks(frame, at[train], mask[train], species, today, prior).mean()
    entry["today train"] = round(float(best_rank), 4)
    for _ in range(PASSES):
        for name in SEARCH:
            if name not in best:
                continue
            for value in candidates(name, best[name]):
                trial = with_value(best, name, value)
                r = ranks(frame, at[train], mask[train], species, trial, prior).mean()
                if r > best_rank + 1e-4:
                    best, best_rank = trial, r
    before, after = (ranks(frame, at[test], mask[test], species, today, prior),
                     ranks(frame, at[test], mask[test], species, best, prior))
    entry.update({"fitted train": round(float(best_rank), 4), "today test": round(float(before.mean()), 4),
                  "fitted test": round(float(after.mean()), 4), "ci": paired_ci(after, before),
                  **{name: best[name] for name in SEARCH if name in best},
                  **{f"was {name}": today[name] for name in SEARCH if name in today}})
    entry["ships"] = bool(entry["ci"][0] > 0)
    return entry


def fit_all(out: Path, part: int, of: int) -> None:
    layout = pd.read_parquet(out / "settings_strata.parquet")
    weather = pd.read_parquet(out / "settings_weather.parquet")
    s_year = pd.read_parquet(out / "phenology_table.parquet", columns=["id", "year"]).drop_duplicates("id").set_index("id")["year"]
    pairs = sorted(set(zip(layout["species"], layout["region"])))[part::of]
    from range_prior import load_range_priors
    priors = {c: load_range_priors(fp.r2_fetch(fp.get_required_env(f"{c}_RANGE_PRIORS"))) for c in ("EU", "US")}
    done_path = out / f"settings_result_{part}.csv"
    done = pd.read_csv(done_path) if done_path.exists() else pd.DataFrame(columns=["species", "region"])
    for species, region in pairs:
        if ((done["species"] == species) & (done["region"] == region)).any():
            continue
        entry = fit_one(layout, weather, s_year, species, region, priors["EU" if region in ("NE", "SE") else "US"].get(species))
        print(entry, flush=True)
        done = pd.concat([done, pd.DataFrame([entry])], ignore_index=True)
        done.to_csv(done_path, index=False)       # a stop loses one plant at most


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the plant training folder (phenology_table.parquet, inat/)")
    parser.add_argument("--blocks", default=str(ROOT.parent / "era5_training" / "era5_blocks"))
    parser.add_argument("--strata", action="store_true", help="build the strata and their weather")
    parser.add_argument("--part", type=int, default=0, help="this process's share of the plants: --part k --of n")
    parser.add_argument("--of", type=int, default=1)
    args = parser.parse_args()
    out = Path(args.out)
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    if args.strata:
        build(out, Path(args.blocks))
        return
    fit_all(out, args.part, args.of)


if __name__ == "__main__":
    main()

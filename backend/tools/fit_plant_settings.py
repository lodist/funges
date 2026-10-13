#!/usr/bin/env python3
"""Switch off the parts of a plant's score that rank its places the wrong way.

A plant's weather and place parts (temperature, humidity, rain, altitude, pH) are hand-set per
region, and some point the wrong way: against the places people searched that week, today's
settings rank US West's nettle, dandelion and violet sightings below chance. Fitting new
optima does not mend that: each sighting of a plant in its picked stage (tools/fit_phenology.py's
table) against up to K other plants' sightings in the region within +-WINDOW_DAYS still carries
the season's spatial gradient (a plant is in stage at altitude late, in warm places early) and
the comparison mix (fewer other plants are photographed in a hot dry spell), so the optima ran
to the search's edges (dandelion in US West at -1 C and 1800 m). Switching a part off can only
remove a signal, never invent one.

Three tests, the range prior scoring with the parts as in production:
  1. the same day (find-day rank in those strata, season left out): on 2016-2023, parts go one
     at a time while that lifts the rank; on 2024-2026, better than today (paired bootstrap above 0);
  2. the whole year (AUC of the stage sightings against all plant sightings, the full score with
     the season and the learned season): not worse on 2024-2026. A part also times the season:
     with temperature off, autumn fruit opened in August;
  3. the months the tags call dead (under fit_phenology.DEAD_MONTH of the peak) gain no more
     than DEAD_RISE of their sightings at 4+.
Nuts whose fruiting tags include green nuts are left out (HELD): the tags keep August alive, so
test 3 cannot see the map opening them there.

Regions as the nightly run scores them: in the US by the app's split at 100 W, in Europe by the
nearest place on each list.

    python backend/tools/fit_plant_settings.py --out ../plant_training --strata   # strata + their weather
    python backend/tools/fit_plant_settings.py --out ../plant_training --parts    # test 1 (--part k --of n)
    python backend/tools/fit_plant_settings.py --out ../plant_training --select   # tests 2 and 3 -> parts_final.json
    python backend/tools/fit_plant_settings.py --out ../plant_training --apply    # write it into the manifests
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import json
import sys
from io import StringIO
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend" / "tools"), str(ROOT / "scripts")]
import forecast_pipeline as fp  # noqa: E402
from fit_fruiting import find_day_rank  # noqa: E402
from fit_phenology import DEAD_MONTH, STAGE, TAXA  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS  # noqa: E402
from qa_weather_skill import LAG_DAYS  # noqa: E402
from species_registry import get_species_params  # noqa: E402

K, WINDOW_DAYS, MAX_CASES = 10, 3, 4000          # cases per plant, region and split
TEST_FROM, MIN_CASES = 2024, 150
# the score's parts a manifest can switch off, at forecast_pipeline's default weights
PARTS = {"temp_weight": 1.75, "humidity_weight": 1.0, "rain_weight": 1.5, "alt_weight": 0.75, "ph_weight": 1.0}
MIN_GAIN = 0.002                                 # a part goes only if that lifts the training rank this much
DEAD_RISE = 0.05
HELD = {"chestnut", "walnut"}
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


def range_priors() -> dict:
    from range_prior import load_range_priors
    return {c: load_range_priors(fp.r2_fetch(fp.get_required_env(f"{c}_RANGE_PRIORS"))) for c in ("EU", "US")}


def prior_of(priors: dict, species: str, region: str):
    return priors["EU" if region in ("NE", "SE") else "US"].get(species)


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


def cases_of(layout: pd.DataFrame, weather: pd.DataFrame, s_year: pd.Series, species: str, region: str):
    """The species' strata in the region: its rows' weather, [case, slot] row indices and mask, and each case's year."""
    rows = layout[(layout["species"] == species) & (layout["region"] == region)]
    frame = weather[weather["id"].isin(rows["id"])].reset_index(drop=True)
    where = pd.Series(np.arange(len(frame)), index=frame["id"].to_numpy())
    cases = np.unique(rows["case"].to_numpy(), return_inverse=True)[1]
    at = np.full((cases.max() + 1, K + 1), -1)
    at[cases, rows["slot"].to_numpy()] = where.reindex(rows["id"]).fillna(-1).astype(int).to_numpy()
    mask = at >= 0
    keep = mask[:, 0] & (mask[:, 1:].sum(axis=1) >= 3)
    at, mask = at[keep], mask[keep]
    return frame, at, mask, s_year.reindex(frame["id"].to_numpy()[at[:, 0]]).to_numpy()


def parts_one(layout, weather, s_year, species: str, region: str, prior=None) -> dict:
    """Test 1: switch off, one at a time, the parts whose removal ranks the training cases higher;
    then today's settings against the result on the held-out cases."""
    frame, at, mask, year = cases_of(layout, weather, s_year, species, region)
    train, test = year < TEST_FROM, year >= TEST_FROM
    entry = {"species": species, "region": region, "train cases": int(train.sum()), "test cases": int(test.sum())}
    if train.sum() < MIN_CASES or test.sum() < MIN_CASES:
        return entry
    today = get_species_params(region)[species]
    weights = {k: float(today.get(k, v)) for k, v in PARTS.items()}
    current = ranks(frame, at[train], mask[train], species, today, prior).mean()
    entry["today train"] = round(float(current), 4)
    while True:
        trials = {k: ranks(frame, at[train], mask[train], species, {**today, **weights, k: 0.0}, prior).mean()
                  for k, w in weights.items() if w > 0}
        if not trials:
            break
        k, r = max(trials.items(), key=lambda kv: kv[1])
        if r < current + MIN_GAIN:
            break
        weights[k], current = 0.0, r
    off = sorted(k for k, w in weights.items() if w == 0 and float(today.get(k, PARTS[k])) > 0)
    before = ranks(frame, at[test], mask[test], species, today, prior)
    after = ranks(frame, at[test], mask[test], species, {**today, **weights}, prior)
    flat = ranks(frame, at[test], mask[test], species, {**today, **{k: 0.0 for k in PARTS}}, prior)
    entry.update({"switched off": " ".join(off), "tuned train": round(float(current), 4),
                  "today test": round(float(before.mean()), 4), "tuned test": round(float(after.mean()), 4),
                  "prior only test": round(float(flat.mean()), 4), "ci": paired_ci(after, before)})
    entry["ships"] = bool(off) and entry["ci"][0] > 0
    return entry


def timing(out: Path, picks: dict, max_rows: int = 60000) -> pd.DataFrame:
    """Tests 2 and 3 for each same-day pick, on 2024-2026: AUC of the plant's stage sightings
    against all plant sightings across the year (the full score: season, learned season, range
    prior), paired bootstrap over sightings; and the share at 4+ of the sightings in the months
    the tags call dead."""
    from sklearn.metrics import roc_auc_score
    every = pd.read_parquet(out / "phenology_table.parquet")
    every["scoring_region"] = scoring_region(every)
    s = every[every["year"] >= TEST_FROM].reset_index(drop=True)
    weather = pd.read_parquet(out / "settings_weather.parquet")
    priors = range_priors()
    rows = []
    for key, off in picks.items():
        species, region = key.split("|")
        here = s[s["scoring_region"] == region][["id", "year", species]].merge(weather, on="id")
        if len(here) > max_rows:
            here = here.sample(max_rows, random_state=291)
        here = here.reset_index(drop=True)
        today, prior = get_species_params(region)[species], prior_of(priors, species, region)
        scores = {}
        for name, p in (("before", dict(today)), ("after", {**today, **{k: 0.0 for k in off}})):
            p = {species: {**p, **({"range_prior": prior} if prior is not None else {})}}
            fp.attach_phenology(p, region)
            scores[name] = fp.calculate_mushroom_score(here.copy(), p, {})[f"{species}_score"].to_numpy(float)
        y = here[species].to_numpy(bool)
        mine = every[every["scoring_region"] == region]
        share = mine.groupby(mine["date"].dt.month)[species].mean().reindex(range(1, 13), fill_value=0)
        dead = [m for m in range(1, 13) if share.max() > 0 and share[m] / share.max() < DEAD_MONTH]
        in_dead = pd.to_datetime(here["Date"]).dt.month.isin(dead).to_numpy()
        opened = {n: float((v[in_dead] >= 4).mean()) if in_dead.any() else 0.0 for n, v in scores.items()}
        years = [{n: roc_auc_score(y[idx], scores[n][idx]) for n in scores}
                 for idx in here.groupby("year").indices.values() if 30 <= y[idx].sum() < len(idx)]
        rng = np.random.default_rng(291)
        draws = []
        for _ in range(300):
            b = rng.integers(0, len(here), len(here))
            if 0 < y[b].sum() < len(b):
                draws.append(roc_auc_score(y[b], scores["after"][b]) - roc_auc_score(y[b], scores["before"][b]))
        rows.append({"species": species, "region": region, "switched off": " ".join(off),
                     "sightings": len(here), "stage": int(y.sum()),
                     "auc before": round(float(np.mean([v["before"] for v in years])), 4) if years else np.nan,
                     "auc after": round(float(np.mean([v["after"] for v in years])), 4) if years else np.nan,
                     "timing ci": [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])] if draws else None,
                     "dead months": " ".join(map(str, dead)), "dead at 4+ before": round(opened["before"], 3),
                     "dead at 4+ after": round(opened["after"], 3)})
        print(rows[-1], flush=True)
    return pd.DataFrame(rows)


def run_parts(out: Path, part: int, of: int) -> None:
    layout = pd.read_parquet(out / "settings_strata.parquet")
    weather = pd.read_parquet(out / "settings_weather.parquet")
    s_year = pd.read_parquet(out / "phenology_table.parquet", columns=["id", "year"]).drop_duplicates("id").set_index("id")["year"]
    priors = range_priors()
    done_path = out / f"parts_result_{part}.csv"
    done = pd.read_csv(done_path) if done_path.exists() else pd.DataFrame(columns=["species", "region"])
    for species, region in sorted(set(zip(layout["species"], layout["region"])))[part::of]:
        if ((done["species"] == species) & (done["region"] == region)).any():
            continue
        entry = parts_one(layout, weather, s_year, species, region, prior_of(priors, species, region))
        print(entry, flush=True)
        done = pd.concat([done, pd.DataFrame([entry])], ignore_index=True)
        done.to_csv(done_path, index=False)       # a stop loses one plant at most


def select(out: Path) -> dict:
    """Test 1's winners through tests 2 and 3, HELD left out: {"species|region": [parts off]}."""
    same_day = pd.concat([pd.read_csv(f) for f in sorted(out.glob("parts_result_*.csv"))], ignore_index=True)
    same_day = same_day[same_day["ships"].astype(str) == "True"]
    picks = {f"{s}|{r}": str(off).split() for s, r, off in zip(same_day["species"], same_day["region"], same_day["switched off"])
             if s not in HELD}
    year = timing(out, picks)
    year.to_csv(out / "parts_timing.csv", index=False)
    ok = (year["timing ci"].apply(lambda ci: ci is not None and ci[0] >= -0.001)
          & (year["dead at 4+ after"] - year["dead at 4+ before"] <= DEAD_RISE))
    final = {f"{s}|{r}": off.split() for s, r, off in year.loc[ok, ["species", "region", "switched off"]].itertuples(index=False)}
    (out / "parts_final.json").write_text(json.dumps(final, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(final)} of {len(picks)} pass the year and the dead months", flush=True)
    return final


def apply(out: Path) -> None:
    """Write parts_final.json into the manifests: each listed part's weight 0 in that region."""
    final = json.loads((out / "parts_final.json").read_text(encoding="utf-8"))
    for key, off in sorted(final.items()):
        species, region = key.split("|")
        path = ROOT / "content" / "species" / species / "species.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["forecast"]["regions"][region]["scoring"].update({k: 0 for k in off})
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the plant training folder (phenology_table.parquet, inat/)")
    parser.add_argument("--blocks", default=str(ROOT.parent / "era5_training" / "era5_blocks"))
    parser.add_argument("--strata", action="store_true", help="build the strata and their weather")
    parser.add_argument("--parts", action="store_true", help="test 1: the parts to switch off, per plant and region")
    parser.add_argument("--part", type=int, default=0, help="this process's share of the plants: --part k --of n")
    parser.add_argument("--of", type=int, default=1)
    parser.add_argument("--select", action="store_true", help="tests 2 and 3 on test 1's winners -> parts_final.json")
    parser.add_argument("--apply", action="store_true", help="write parts_final.json into the manifests")
    args = parser.parse_args()
    out = Path(args.out)
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    if args.strata:
        build(out, Path(args.blocks))
    elif args.parts:
        run_parts(out, args.part, args.of)
    elif args.select:
        select(out)
    elif args.apply:
        apply(out)


if __name__ == "__main__":
    main()

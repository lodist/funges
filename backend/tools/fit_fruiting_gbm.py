#!/usr/bin/env python3
"""The fruiting response as a gradient-boosted ranker (#291, after the linear fit).

Same design as fit_fruiting.py: each find's own day against the same place 14 and 21 days
either side. LightGBM is trained on the exact conditional likelihood of each stratum (a
softmax over its days), so, like the linear fit, it only learns what separates a find day
from its own place's other days; unlike it, the trees can find optima and interactions.
"""
from __future__ import annotations

import lightgbm as lgb  # before pandas/pyarrow: see tests/conftest.py
import numpy as np

from fit_fruiting import find_day_rank  # noqa: F401  (re-exported: the same rank test)

PARAMS = {"learning_rate": 0.05, "num_leaves": 15, "min_data_in_leaf": 200, "feature_fraction": 0.9,
          "bagging_fraction": 0.8, "bagging_freq": 1, "lambda_l2": 1.0, "max_bin": 63, "verbose": -1,
          "seed": 291}
EARLY_STOP = 50


def clogit_objective(sizes):
    """LightGBM objective for strata of `sizes` consecutive rows, find day first: the gradient
    p - y and the diagonal hessian p(1 - p) of the stratum softmax's negative log-likelihood."""
    starts = np.r_[0, np.cumsum(sizes)[:-1]]
    group = np.repeat(np.arange(len(sizes)), sizes)

    def objective(preds, data):
        label = data.get_label() if hasattr(data, "get_label") else data
        e = np.exp(preds - np.maximum.reduceat(preds, starts)[group])
        p = e / np.add.reduceat(e, starts)[group]
        return p - label, np.maximum(p * (1 - p), 1e-6)
    return objective


def clogit_loss(sizes):
    """LightGBM eval: the strata's mean negative conditional log-likelihood (lower is better)."""
    starts = np.r_[0, np.cumsum(sizes)[:-1]]
    group = np.repeat(np.arange(len(sizes)), sizes)

    def evaluate(preds, data):
        top = np.maximum.reduceat(preds, starts)
        log_total = top + np.log(np.add.reduceat(np.exp(preds - top[group]), starts))
        return "clogit", float((log_total - preds[starts]).mean()), False
    return evaluate


def _dataset(x, mask, categorical, reference=None):
    case, slot = np.nonzero(mask)
    sizes = np.bincount(case)[np.unique(case)]
    data = lgb.Dataset(x[case, slot], (slot == 0).astype(float), reference=reference,
                       categorical_feature=list(categorical) or "auto", free_raw_data=False)
    return data, sizes


def fit(x: np.ndarray, mask: np.ndarray, rounds: int = 400, categorical=(), params=None, valid=None):
    """x [case, 5 days, k] and mask [case, 5], find day in slot 0 -> a LightGBM booster.
    With valid=(x, mask), boosting stops once those strata's likelihood stops improving for
    EARLY_STOP rounds, and the booster's best_iteration is the round to predict with."""
    data, sizes = _dataset(x, mask, categorical)
    extra = {}
    if valid is not None:
        held, held_sizes = _dataset(*valid, categorical, reference=data)
        extra = {"valid_sets": [held], "feval": clogit_loss(held_sizes),
                 "callbacks": [lgb.early_stopping(EARLY_STOP, verbose=False)]}
    return lgb.train({**PARAMS, **(params or {}), "metric": "None", "objective": clogit_objective(sizes)},
                     data, num_boost_round=rounds, **extra)


def predict(model, x: np.ndarray, rounds: int | None = None) -> np.ndarray:
    """The index for every day of every stratum, [case, 5]; masked days are ignored downstream."""
    n, days, k = x.shape
    return model.predict(x.reshape(n * days, k), num_iteration=rounds, raw_score=True).reshape(n, days)


# --- Training run ---------------------------------------------------------------------------
# python backend/tools/fit_fruiting_gbm.py --out ../era5_training [--export]
#
# Same strata as fit_fruiting.py. Features: its 13 window features, the daily lags
# (training_lags/, build_training_table.py --lags), each find cell's ERA5 normals for the
# find's month, its latitude, the find's day of year, and the region. The normals, latitude
# and day of year are the same on every day of a stratum, so they can only shape how the
# weather counts, never rank the days by themselves.
STATIC = ["norm_rain", "norm_tmean", "norm_rh", "lat", "find_doy"]
REGIONS = ["NE", "SE", "USE", "USW"]
MAX_ROUNDS, VALID_SHARE = 2000, 0.15
# Passed the rule but kept on today's settings on review: tiny skill either way, and the
# linear fit there cost 20-36 points of 4+ places (held back from it on 11 Oct 2026 too).
HELD_BACK = {("chicken-of-the-woods", "USW")}


def load(out):
    import fit_fruiting as ff
    import pandas as pd
    import pyarrow.parquet as pq
    import era5_normals
    import forecast_pipeline as fp

    def read(folder):
        return pd.concat([pd.read_parquet(p) for p in sorted((out / folder).glob("*.parquet"))
                          if "case_id" in pq.read_schema(p).names or folder == "training_scores"], ignore_index=True)

    table, scores, lags = read("training"), read("training_scores"), read("training_lags")
    cases, raw, mask = ff.strata(table, ff.transform(table))
    where = (table[table["offset"] == 0].drop_duplicates("case_id")
             .set_index("case_id")[["cell_lat", "cell_lon"]].reindex(cases["case_id"]))
    row = pd.Series(np.arange(len(cases)), index=cases["case_id"].to_numpy())
    lags = lags[lags["case_id"].isin(row.index)]
    lag_names = [c for c in lags.columns if c not in ("case_id", "offset")]
    daily = np.full((len(cases), 5, len(lag_names)), np.nan, dtype=np.float32)
    daily[row.reindex(lags["case_id"]).to_numpy(), lags["offset"].map(ff.SLOTS).to_numpy()] = lags[lag_names].to_numpy(np.float32)
    found = pd.to_datetime(cases["find_date"])
    static = np.full((len(cases), len(STATIC)), np.nan, dtype=np.float32)
    for continent, regions in (("EU", ["NE", "SE"]), ("US", ["USE", "USW"])):
        here = cases["region"].isin(regions).to_numpy()
        normal = era5_normals.lookup(era5_normals.load(regions[0]), where["cell_lat"].to_numpy()[here],
                                     where["cell_lon"].to_numpy()[here], found.dt.month.to_numpy()[here])
        static[here, :3] = np.column_stack([normal[f"norm_{n}"] for n in ("rain", "tmean", "rh")])
    static[:, 3] = where["cell_lat"].to_numpy()
    static[:, 4] = found.dt.dayofyear.to_numpy()
    region = pd.Categorical(cases["region"], categories=REGIONS).codes.astype(np.float32)
    x = np.concatenate([raw.astype(np.float32), daily, np.repeat(static[:, None, :], 5, axis=1),
                        np.repeat(region[:, None, None], 5, axis=1)], axis=2)
    names = [*ff.FEATURES, *lag_names, *STATIC, "region"]
    assert names == fp.FRUITING_GBM_FEATURES, "training and production features differ"
    return table, cases, x, mask, scores, names


def leave_one_year_out(cases, x, mask, species, today, rng):
    """Per region: (year, net, best_iteration). Each year is scored by a model on the other
    years, its rounds chosen by early stopping on VALID_SHARE of those years' strata."""
    import fit_fruiting as ff
    years, regions = cases["year"].to_numpy(), cases["region"].to_numpy()
    mine = (cases["species"] == species).to_numpy()
    placebo = (cases["species"] == ff.PLACEBO).to_numpy()
    days = mask & np.isfinite(today)
    results = {}
    for year in sorted(set(years[mine])):
        train = np.flatnonzero(mine & (years != year))
        if len(train) < ff.MIN_TRAIN_STRATA:
            continue
        held = rng.random(len(train)) < VALID_SHARE
        model = fit(x[train[~held]], mask[train[~held]], rounds=MAX_ROUNDS, categorical=[x.shape[2] - 1],
                    valid=(x[train[held]], mask[train[held]]))
        test = (mine | placebo) & (years == year)
        index = np.full(mask.shape, -np.inf)
        index[test] = predict(model, x[test], model.best_iteration)
        for region in sorted(set(regions[mine])):
            here = regions == region
            tc, tp = mine & here & (years == year) & days[:, 0], placebo & here & (years == year) & days[:, 0]
            if tc.sum() < ff.MIN_TEST_STRATA or tp.sum() < ff.MIN_TEST_STRATA:
                continue
            net = float(find_day_rank(index[tc], days[tc]).mean() - find_day_rank(index[tp], days[tp]).mean())
            results.setdefault(region, []).append((int(year), net, int(model.best_iteration)))
    return results


def gbm_index(booster, region):
    """index(cell, days) for fit_fruiting.season_maps: the GBM on one cell's ERA5 days, each
    day its own anchor for normals and day of year."""
    import pandas as pd
    import build_training_table as tt
    import era5_normals
    import forecast_pipeline as fp
    grid, code = era5_normals.load(region), REGIONS.index(region)

    def index(cell, days):
        days = pd.DatetimeIndex(days)
        lat, lon = float(cell["Latitude"].iloc[0]), float(cell["Longitude"].iloc[0])
        normal = era5_normals.lookup(grid, np.full(len(days), lat), np.full(len(days), lon), days.month)
        x = np.column_stack([fp.fruiting_design(tt.features(cell, days)).to_numpy(float),
                             tt.daily_lags(cell, days).to_numpy(float),
                             normal["norm_rain"], normal["norm_tmean"], normal["norm_rh"],
                             np.full(len(days), lat), days.dayofyear.to_numpy(float), np.full(len(days), code)])
        return booster.predict(x, raw_score=True)
    return index


def export(table_rows, cases, x, mask, loyo, gate, names, out, root):
    """The shipped species' models on every year, their regions' monthly maps and the regions'
    stored-input corrections -> backend/generated/fruiting_gbm.json + fruiting_gbm/<species>.txt."""
    import gzip
    import json
    import sys
    import requests
    import fit_fruiting as ff
    import forecast_pipeline as fp
    from download_era5_points import log
    sys.path.insert(0, str(root / "scripts"))
    from qa_season_branch_replay import load_specs

    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    session = requests.Session()
    specs = {region: load_specs(session, region) for region in REGIONS}
    shipped = gate[gate["ships"]]
    columns = ("Humidity (%)", "Temperature (C)", "Temperature (C) Min")
    saved = out / "stored_corrections.json"   # measured ahead, e.g. before a weekend R2 block
    if saved.exists():
        corrections = {region: {c: tuple(ab) for c, ab in cols.items()}
                       for region, cols in json.loads(saved.read_text(encoding="utf-8")).items()}
    else:
        corrections = {region: ff.stored_corrections(out, region, columns) for region in sorted(set(shipped["region"]))}
    corrections = {region: corrections[region] for region in sorted(set(shipped["region"]))}
    folder = root / "backend" / "generated" / "fruiting_gbm"
    folder.mkdir(exist_ok=True)
    for old in folder.glob("*.txt.gz"):
        old.unlink()
    models = {}
    for species, rows in shipped.groupby("species"):
        mine = (cases["species"] == species).to_numpy()
        rounds = max(int(loyo.loc[loyo["species"] == species, "rounds"].median()), 50)
        booster = fit(x[mine], mask[mine], rounds=rounds, categorical=[x.shape[2] - 1])
        (folder / f"{species}.txt.gz").write_bytes(gzip.compress(booster.model_to_string().encode(), mtime=0))
        regions = {}
        for row in rows.itertuples(index=False):
            regions[row.region] = {
                "map": ff.season_maps(table_rows, out, species, row.region, gbm_index(booster, row.region),
                                      specs, corrections[row.region]),
                "each_year_held_out": {"years": int(row.years), "wins": int(row.wins), "p": float(row.p),
                                       "in_use": row.in_use, "mean_in_use": float(row.current),
                                       "mean_gbm": float(row.gbm)}}
        models[species] = {"file": f"fruiting_gbm/{species}.txt.gz", "rounds": rounds, "regions": regions}
        log(f"exported {species}: {rounds} rounds, {', '.join(regions)}")
    spec = {"features": names, "trained": f"{int(cases['year'].min())}-{int(cases['year'].max())}",
            "shipped_if": "beats the model in use (the linear fit where it ships, else today's) in more held-out "
                          f"years than chance (sign test p < {ff.SHIP_P}, at least {ff.SHIP_MIN_YEARS} years)",
            "inputs_from_stored": {r: {c: [round(a, 4), round(b, 4)] for c, (a, b) in cols.items()}
                                   for r, cols in corrections.items()},
            "models": models}
    (root / "backend" / "generated" / "fruiting_gbm.json").write_text(json.dumps(spec, indent=1) + "\n", encoding="utf-8")


def main() -> None:
    import argparse
    import json
    import sys
    from pathlib import Path
    import pandas as pd
    import fit_fruiting as ff
    from download_era5_points import log

    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--export", action="store_true", help="write backend/generated/fruiting_gbm*")
    parser.add_argument("--reuse", action="store_true", help="take the year-by-year results from gbm_loyo.csv")
    args = parser.parse_args()
    out = Path(args.out)
    root = Path(__file__).resolve().parents[2]
    linear = json.loads((out / "fruiting_report.json").read_text(encoding="utf-8"))
    live = json.loads((root / "backend" / "generated" / "fruiting_fit.json").read_text(encoding="utf-8"))["models"]

    table_rows, cases, x, mask, scores, names = load(out)
    log(f"{len(cases):,} strata, {x.shape[2]} features")
    rng = np.random.default_rng(291)
    rows = []
    species_list = [] if args.reuse else sorted(set(cases["species"]) - {ff.PLACEBO})
    for species in species_list:
        if (cases["species"] == species).sum() < ff.MIN_TRAIN_STRATA:
            continue
        today = ff.baseline_index(scores, cases, species)
        for region, results in leave_one_year_out(cases, x, mask, species, today, rng).items():
            per_year = {y["year"]: y for y in linear.get(species, {}).get(region, {}).get("by_year", {}).get("per_year", [])}
            in_use = "linear" if region in live.get(species, {}) else "today"
            for year, net, rounds in results:
                if year in per_year:
                    rows.append({"species": species, "region": region, "year": year, "gbm": net, "rounds": rounds,
                                 "today": per_year[year]["today"], "linear": per_year[year]["fitted"], "in_use": in_use})
        log(f"{species} done")
        pd.DataFrame(rows).to_csv(out / "gbm_loyo.csv", index=False)
    table = pd.read_csv(out / "gbm_loyo.csv") if args.reuse else pd.DataFrame(rows)
    gate = []
    for (species, region), g in table.groupby(["species", "region"]):
        current = g["linear"] if g["in_use"].iloc[0] == "linear" else g["today"]
        results = list(zip(g["year"], current, g["gbm"]))
        wins, p, gain = ff.sign_test(results)
        gate.append({"species": species, "region": region, "in_use": g["in_use"].iloc[0], "years": len(g),
                     "wins": wins, "p": round(p, 4), "current": round(float(current.mean()), 3),
                     "gbm": round(float(g["gbm"].mean()), 3),
                     "ships": ff.ships(results) and (species, region) not in HELD_BACK,
                     "rounds": int(g["rounds"].median())})
    gate = pd.DataFrame(gate)
    gate.to_csv(out / "gbm_gate.csv", index=False)
    log(f"GBM ships in {gate['ships'].sum()} species-regions "
        f"({(gate['ships'] & (gate['in_use'] == 'linear')).sum()} replacing the linear fit)")
    print(gate[gate["ships"]].to_string(index=False), flush=True)
    if args.export:
        export(table_rows, cases, x, mask, table, gate, names, out, root)


if __name__ == "__main__":
    main()

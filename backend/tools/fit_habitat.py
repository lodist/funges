#!/usr/bin/env python3
"""Learned habitat factor: which places a species is found at, among the places people search.

Each find is compared with up to K bracket-fungus finds made in its region within +-3 days
(perennial, on dead wood everywhere people walk: they mark where people were out). A
LightGBM conditional logit on the places' static features (build_habitat_features.py: tree
shares, distance to towns, altitude, water, yearly normals) learns which places are the
species'. Trained on 2016-2025; 2026 is held out (as from the range prior) and scored two
ways: the habitat index alone on every 2026 find, and the full score with and without it on
summer 2026's stored-weather strata (qa_spatial_weights.py --placebo-only).

    python backend/tools/fit_habitat.py --out ../era5_training
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path[:0] = [str(Path(__file__).resolve().parent), str(Path(__file__).resolve().parents[1])]
import fit_fruiting_gbm as gbm  # noqa: E402
from fit_fruiting import PLACEBO, find_day_rank  # noqa: E402

K, WINDOW_DAYS, MAX_CASES, MIN_CASES = 10, 3, 30000, 300
TEST_YEAR = 2026
PARAMS = {"num_leaves": 15, "min_data_in_leaf": 100}


def columns(features: pd.DataFrame) -> list[str]:
    return [c for c in features.columns if c not in ("Location_Id", "Latitude", "Longitude", "region")
            and features[c].notna().mean() > 0.5]


def strata(finds, species, features, rng, max_cases=MAX_CASES, background_all=True):
    """x [case, 1+K, k], mask: each of the species' finds at a place with features, and up to
    K other places searched in the same region within +-WINDOW_DAYS (other fungi's finds)."""
    index = pd.Series(np.arange(len(features)), index=features["Location_Id"].to_numpy())
    known = finds["Location_Id"].isin(index.index)
    cases = finds[known & (finds["species"] == species)]
    if len(cases) > max_cases:
        cases = cases.sample(max_cases, random_state=int(rng.integers(1 << 30)))
    # All other fungi's finds by default: brackets alone carry their own habitat (cool conifer
    # forests), which a model then learns to avoid (porcini in North Europe lost 0.08 that way).
    others = (finds["species"] != species) if background_all else (finds["species"] == PLACEBO)
    background = finds[known & others].sort_values("Date")
    days = background["Date"].to_numpy()
    where = index.reindex(background["Location_Id"]).to_numpy()
    lo = np.searchsorted(days, cases["Date"].to_numpy() - np.timedelta64(WINDOW_DAYS, "D"))
    hi = np.searchsorted(days, cases["Date"].to_numpy() + np.timedelta64(WINDOW_DAYS, "D"), side="right")
    rows = np.full((len(cases), 1 + K), -1)
    rows[:, 0] = index.reindex(cases["Location_Id"]).to_numpy()
    for n, (a, b) in enumerate(zip(lo, hi)):
        pool = np.unique(where[a:b])
        pool = pool[pool != rows[n, 0]]
        if len(pool) >= 3:
            rows[n, 1:1 + min(K, len(pool))] = rng.choice(pool, min(K, len(pool)), replace=False)
    keep = (rows[:, 1:] >= 0).sum(axis=1) >= 3
    rows = rows[keep]
    values = features[columns(features)].to_numpy(np.float32)
    return values[np.clip(rows, 0, None)], rows >= 0, cases[keep]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    out = Path(args.out)
    rng = np.random.default_rng(291)
    finds = pd.read_parquet(out / "finds_2016_2026.parquet")
    finds["Date"] = pd.to_datetime(finds["Date"])
    summers = {"bracket": pd.read_parquet(out / "spatial_placebo" / "spatial_strata.parquet"),
               "all": pd.read_parquet(out / "spatial" / "spatial_strata.parquet")}
    (out / "habitat_models").mkdir(exist_ok=True)
    results = []
    for region in ("NE", "SE", "USE", "USW"):
        features = pd.read_parquet(out / f"habitat_features_{region}.parquet")
        cols = columns(features)
        here = finds[finds["region"] == region]
        train, test = here[here["Date"].dt.year < TEST_YEAR], here[here["Date"].dt.year == TEST_YEAR]
        for species in sorted(set(here["species"]) - {PLACEBO}):
            x, mask, _ = strata(train, species, features, rng)
            if len(x) < MIN_CASES:
                continue
            held = rng.random(len(x)) < 0.15
            model = gbm.fit(x[~held], mask[~held], rounds=1000, params=PARAMS, valid=(x[held], mask[held]))
            tx, tmask, _ = strata(test, species, features, rng)
            entry = {"species": species, "region": region, "train": len(x), "test_2026": len(tx),
                     "rounds": model.best_iteration}
            if len(tx) >= 30:
                entry["habitat_2026"] = round(float(find_day_rank(gbm.predict(model, tx, model.best_iteration), tmask).mean()), 3)
            model.save_model(str(out / "habitat_models" / f"{species}_{region}.txt"), num_iteration=model.best_iteration)
            for label, summer in summers.items():
                g = summer[(summer["species"] == species) & (summer["region"] == region)]
                if g["case"].nunique() >= 30:
                    ids = pd.Series(np.arange(len(features)), index=features["Location_Id"].to_numpy())
                    g = g[g["Location_Id"].isin(ids.index)]
                    cases = np.unique(g["case"], return_inverse=True)[1]
                    n, slots = cases.max() + 1, g["slot"].max() + 1
                    score, eta = np.zeros((n, slots)), np.zeros((n, slots))
                    mask_s = np.zeros((n, slots), bool)
                    x_s = features[cols].to_numpy(np.float32)[ids.reindex(g["Location_Id"]).to_numpy()]
                    score[cases, g["slot"]] = np.log(np.clip(g["score"].to_numpy(float), 1e-3, None))
                    eta[cases, g["slot"]] = model.predict(x_s, num_iteration=model.best_iteration, raw_score=True)
                    mask_s[cases, g["slot"]] = np.isfinite(g["score"].to_numpy(float))
                    keep = mask_s[:, 0] & (mask_s[:, 1:].sum(axis=1) >= 3)
                    entry[f"{label}_finds"] = int(keep.sum())
                    for name, index in (("score", score), ("habitat", eta), ("+0.25", score + 0.25 * eta), ("+0.5", score + 0.5 * eta), ("+1", score + eta)):
                        entry[f"{label}_{name}"] = round(float(find_day_rank(index[keep], mask_s[keep]).mean()), 3)
            importance = pd.Series(model.feature_importance("gain"), index=cols)
            entry["top_features"] = ", ".join(importance.sort_values(ascending=False).index[:4])
            results.append(entry)
            print(entry, flush=True)
    table = pd.DataFrame(results)
    table.to_csv(out / "habitat_result.csv", index=False)
    pd.set_option("display.width", 250)
    print(table.drop(columns=["top_features"]).to_string(index=False))


if __name__ == "__main__":
    main()

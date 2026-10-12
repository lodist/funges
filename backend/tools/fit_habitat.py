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
import lightgbm as lgb  # before pandas/pyarrow: see tests/conftest.py
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
# The factor that ships: exp(STRENGTH * (index - REFERENCE_QUANTILE of it at the species'
# training finds)), capped at 1 and floored: nine in ten real find places keep their score
# ("possibility of growth, not frequency"), no place loses more than half, and the factor is 1
# where the tree map does not reach (no evidence, as host_prior). At the median instead, half
# the real find places were lowered and the share of 4+ places fell 31-35 points even near
# finds; at the 10th percentile the ranking keeps three quarters of the gain (0.645 -> 0.730).
STRENGTH, FLOOR, REFERENCE_QUANTILE = 0.5, 0.5, 0.10
R2_FOLDER = "models/habitat"
# Each region's factor also covers its neighbour's places: the nightly run scores the places
# across the split with the neighbour's model, habitat too (forecast_pipeline.blend_neighbour_settings,
# the US for now).
NEIGHBOUR = {"NE": "SE", "SE": "NE", "USE": "USW", "USW": "USE"}


def factor(eta, reference, mapped):
    return np.where(mapped, np.clip(np.exp(STRENGTH * (eta - reference)), FLOOR, 1.0), 1.0)


def columns(features: pd.DataFrame) -> list[str]:
    return [c for c in features.columns if c not in ("Location_Id", "Latitude", "Longitude", "region", "tree_map")
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


def from_models(table, finds, out):
    """The shipped factors from habitat_models/, each region's on its own places and then its
    neighbour's; the reference stays the region's own training finds."""
    factors, ids_by_region = {}, {}
    train = finds[finds["Date"].dt.year < TEST_YEAR]
    for region, rows in table[table["ships"]].groupby("region"):
        own = pd.read_parquet(out / f"habitat_features_{region}.parquet")
        other = pd.read_parquet(out / f"habitat_features_{NEIGHBOUR[region]}.parquet")
        cols = columns(own)                       # as trained
        features = pd.concat([own, other[~other["Location_Id"].isin(own["Location_Id"])]], ignore_index=True)
        ids_by_region[region] = features["Location_Id"].to_numpy()
        where = pd.Series(np.arange(len(own)), index=own["Location_Id"].to_numpy())
        for species in rows["species"]:
            model = lgb.Booster(model_file=str(out / "habitat_models" / f"{species}_{region}.txt"))
            eta_all = model.predict(features[cols].to_numpy(np.float32), raw_score=True)
            at = where.reindex(train.loc[(train["species"] == species) & (train["region"] == region), "Location_Id"]).dropna().astype(int)
            factors[(species, region)] = factor(eta_all, float(np.quantile(eta_all[at.to_numpy()], REFERENCE_QUANTILE)),
                                                 features["tree_map"].to_numpy(bool))
    return factors, ids_by_region


def export(table, factors, ids_by_region, out) -> None:
    """Per region one file on R2 (R2_FOLDER/<date>/habitat_<region>.npz: location ids, species,
    factor x 255 as uint8) and backend/generated/habitat_factor.json naming each with its sha256."""
    import hashlib
    import io
    import json
    import time
    import forecast_pipeline as fp
    root = Path(__file__).resolve().parents[2]
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    client, bucket = fp._r2_client(), fp.get_required_env("R2_BUCKET_NAME")
    folder = f"{R2_FOLDER}/{time.strftime('%Y%m%d-%H%M')}"
    spec = {"strength": STRENGTH, "floor": FLOOR, "reference_quantile": REFERENCE_QUANTILE,
            "trained": f"2016-{TEST_YEAR - 1}",
            "shipped_if": "score x habitat ranks held-out 2026 finds above the places searched that week better than "
                          "the score alone (other fungi's finds), and no worse against bracket fungi", "regions": {}}
    for region, rows in table[table["ships"]].groupby("region"):
        species = sorted(rows["species"])
        matrix = np.column_stack([np.rint(factors[(s, region)] * 255) for s in species]).astype(np.uint8)
        buffer = io.BytesIO()
        np.savez_compressed(buffer, ids=ids_by_region[region].astype(str), species=np.array(species), factor=matrix)
        data = buffer.getvalue()
        key = f"{folder}/habitat_{region}.npz"
        client.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/octet-stream")
        spec["regions"][region] = {"file": key, "sha256": hashlib.sha256(data).hexdigest(), "species": species}
        print(f"uploaded {key}: {len(species)} species, {len(data) / 1e6:.1f} MB", flush=True)
    (root / "backend" / "generated" / "habitat_factor.json").write_text(json.dumps(spec, indent=1) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--export", action="store_true", help="upload the shipped factors, write backend/generated/habitat_factor.json")
    parser.add_argument("--reuse", action="store_true", help="factors from habitat_models/ and habitat_result.csv, no training")
    args = parser.parse_args()
    out = Path(args.out)
    rng = np.random.default_rng(291)
    finds = pd.read_parquet(out / "finds_2016_2026.parquet")
    finds["Date"] = pd.to_datetime(finds["Date"])
    if args.reuse:
        table = pd.read_csv(out / "habitat_result.csv")
        if args.export:
            export(table, *from_models(table, finds, out), out)
        return
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
            eta_all = model.predict(features[cols].to_numpy(np.float32), num_iteration=model.best_iteration, raw_score=True)
            at = pd.Series(np.arange(len(features)), index=features["Location_Id"].to_numpy()).reindex(
                train.loc[train["species"] == species, "Location_Id"]).dropna().astype(int).to_numpy()
            reference = float(np.quantile(eta_all[at], REFERENCE_QUANTILE))
            for label, summer in summers.items():
                g = summer[(summer["species"] == species) & (summer["region"] == region)]
                if g["case"].nunique() >= 30:
                    ids = pd.Series(np.arange(len(features)), index=features["Location_Id"].to_numpy())
                    g = g[g["Location_Id"].isin(ids.index)]
                    cases = np.unique(g["case"], return_inverse=True)[1]
                    n, slots = cases.max() + 1, g["slot"].max() + 1
                    score, eta = np.zeros((n, slots)), np.zeros((n, slots))
                    mask_s = np.zeros((n, slots), bool)
                    mapped_s = np.ones((n, slots), bool)
                    mapped_s[cases, g["slot"]] = features["tree_map"].to_numpy(bool)[ids.reindex(g["Location_Id"]).to_numpy()]
                    x_s = features[cols].to_numpy(np.float32)[ids.reindex(g["Location_Id"]).to_numpy()]
                    score[cases, g["slot"]] = np.log(np.clip(g["score"].to_numpy(float), 1e-3, None))
                    eta[cases, g["slot"]] = model.predict(x_s, num_iteration=model.best_iteration, raw_score=True)
                    mask_s[cases, g["slot"]] = np.isfinite(g["score"].to_numpy(float))
                    keep = mask_s[:, 0] & (mask_s[:, 1:].sum(axis=1) >= 3)
                    entry[f"{label}_finds"] = int(keep.sum())
                    h = factor(eta, reference, mapped_s)
                    for name, index in (("score", score), ("habitat", eta), ("with_factor", score + np.log(h))):
                        entry[f"{label}_{name}"] = round(float(find_day_rank(index[keep], mask_s[keep]).mean()), 3)
            importance = pd.Series(model.feature_importance("gain"), index=cols)
            entry["top_features"] = ", ".join(importance.sort_values(ascending=False).index[:4])
            results.append(entry)
            print(entry, flush=True)
    table = pd.DataFrame(results)
    has = table["all_finds"].notna() if "all_finds" in table else pd.Series(False, index=table.index)
    table["ships"] = has & (table.get("all_with_factor") > table.get("all_score")) & ~(
        table.get("bracket_with_factor") < table.get("bracket_score"))
    table.to_csv(out / "habitat_result.csv", index=False)
    if args.export:
        export(table, *from_models(table, finds, out), out)
    pd.set_option("display.width", 250)
    print(table.drop(columns=["top_features"]).to_string(index=False))


if __name__ == "__main__":
    main()

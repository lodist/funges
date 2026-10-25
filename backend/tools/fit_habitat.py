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

A species added after the finds table was built (its finds in finds_<species>_supplement.parquet)
is trained on its own with --add, after its held-out years (fit_fruiting_parts.py --habitat
--species, as it has no summer 2026 strata). With --export its factors join the shipped files,
every other species' factor copied as it is:

    python backend/tools/fit_habitat.py --out ../era5_training --add bay_bolete --regions SE --export
"""
import lightgbm as lgb  # before pandas/pyarrow: see tests/conftest.py
import argparse
import hashlib
import io
import json
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
SHIPPED = Path(__file__).resolve().parents[1] / "generated" / "habitat_factor.json"
# Each region's factor also covers its neighbour's places: the nightly run scores the places
# across the split with the neighbour's model, habitat too (forecast_pipeline.blend_neighbour_settings).
NEIGHBOUR = {"NE": "SE", "SE": "NE", "USE": "USW", "USW": "USE"}


def factor(eta, reference, mapped):
    return np.where(mapped, np.clip(np.exp(STRENGTH * (eta - reference)), FLOOR, 1.0), 1.0)


def columns(features: pd.DataFrame) -> list[str]:
    return [c for c in features.columns if c not in ("Location_Id", "Latitude", "Longitude", "region", "tree_map")
            and features[c].notna().mean() > 0.5]


def strata(finds, species, features, rng, max_cases=MAX_CASES, background_all=True):
    """x [case, 1+K, k], mask, the cases and their feature rows (-1 pads): each of the species'
    finds at a place with features, and up to K other places searched in the same region within
    +-WINDOW_DAYS (other fungi's finds)."""
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
    return values[np.clip(rows, 0, None)], rows >= 0, cases[keep], rows


def held_out_years(species, score, at, years, weeks, sites, finds, features, place_score=None, seed=291) -> dict:
    """The factor tested on the training table's held-out years, for where 2026 is too thin to
    test it (bronze bolete in South Europe: 26 finds; spring species have no summer strata). For
    each year a model trained on the other years' finds, and each of that year's finds ranked with
    the factor and without, two ways as in 2026: among that day's bracket finds elsewhere (at:
    fit_fruiting_parts.control_sets) on the full score ([case] values), and among the places other
    fungi were found within +-WINDOW_DAYS (strata) on place_score(sites, dates), the score's place
    parts on the find's day (the training table has no weather there). Each change is pooled over
    the years, its 95% CI resampling whole weeks."""
    from fit_fruiting_parts import place_ranks, week_ci
    rng = np.random.default_rng(seed)
    index = pd.Series(np.arange(len(features)), index=features["Location_Id"].to_numpy())
    position = index.reindex(sites).to_numpy()
    listed = np.isfinite(position)
    position = np.where(listed, position, 0).astype(int)
    ids = features["Location_Id"].to_numpy()
    values, mapped = features[columns(features)].to_numpy(np.float32), features["tree_map"].to_numpy(bool)
    before, change = place_ranks(score, at), np.full(len(at), np.nan)
    other = []                                  # per year: (rank without, change, weeks) among other fungi
    test_year = years[at[:, 0]]
    for year in np.unique(test_year):
        in_year = finds["Date"].dt.year == year
        x, mask, *_ = strata(finds[~in_year], species, features, rng)
        if len(x) < MIN_CASES:
            continue
        held = rng.random(len(x)) < 0.15
        model = gbm.fit(x[~held], mask[~held], rounds=1000, params=PARAMS, valid=(x[held], mask[held]))
        eta = model.predict(values, num_iteration=model.best_iteration, raw_score=True)
        own = index.reindex(finds.loc[~in_year & (finds["species"] == species), "Location_Id"]).dropna().astype(int)
        h = factor(eta, float(np.quantile(eta[own.to_numpy()], REFERENCE_QUANTILE)), mapped)
        rows = test_year == year
        change[rows] = place_ranks(score * np.where(listed, h[position], 1.0), at[rows]) - before[rows]
        if place_score is not None:
            _, tmask, cases, slots = strata(finds[in_year], species, features, rng)
            if len(cases):
                slots = np.clip(slots, 0, None)
                s = place_score(ids[slots].ravel(), np.repeat(cases["Date"].to_numpy(), slots.shape[1])).reshape(slots.shape)
                r0, iso = find_day_rank(s, tmask), cases["Date"].dt.isocalendar()
                other.append((r0, find_day_rank(s * h[slots], tmask) - r0, (iso.year * 100 + iso.week).to_numpy(int)))

    def summary(name, b, c, w):
        ci = week_ci(c, w)
        return {f"years_{name}_finds": len(c), f"years_{name}_score": round(float(b.mean()), 4),
                f"years_{name}_with_factor": round(float((b + c).mean()), 4),
                f"years_{name}_gain": round(float(c.mean()), 4), f"years_{name}_ci_low": ci[0], f"years_{name}_ci_high": ci[1]}

    ok = np.isfinite(change)
    result = summary("bracket", before[ok], change[ok], weeks[at[ok, 0]]) if ok.any() else {}
    if other:
        result.update(summary("all", *(np.concatenate(v) for v in zip(*other))))
    return result


def ships(table: pd.DataFrame) -> pd.Series:
    """Where the held-out years ran (held_out_years) they decide, as the temperature fit does: better
    beyond doubt on one of their two tests (against bracket finds, against other fungi's places) and
    not worse beyond doubt on the other, and summer 2026's finds, where there are any, rank no worse
    among the places searched that week. A few dozen 2026 finds against bracket fungi weigh nothing
    next to thousands held out (black chanterelle in North Europe: 37 finds 0.812 -> 0.788; held out,
    2,854 finds +0.060 [+0.050, +0.070]). Elsewhere (fitted weather parts) 2026 decides: better than
    the score alone among other fungi's finds, and no worse against bracket fungi."""
    t = table.reindex(columns=["all_finds", "all_score", "all_with_factor", "bracket_score", "bracket_with_factor",
                               "years_bracket_ci_low", "years_bracket_ci_high", "years_all_ci_low", "years_all_ci_high"])
    in_2026 = t["all_finds"].notna() & (t["all_with_factor"] > t["all_score"]) & ~(
        t["bracket_with_factor"] < t["bracket_score"])
    years = (((t["years_bracket_ci_low"] > 0) & ~(t["years_all_ci_high"] < 0))
             | ((t["years_all_ci_low"] > 0) & ~(t["years_bracket_ci_high"] < 0))) & ~(t["all_with_factor"] < t["all_score"])
    return in_2026.where(t["years_bracket_ci_low"].isna() & t["years_all_ci_low"].isna(), years)


def with_years(table: pd.DataFrame, out: Path) -> pd.DataFrame:
    """The results with the held-out years' test where it ran (fit_fruiting_parts.py --habitat; a
    species added later ran on its own, into habitat_years_<species>.csv)."""
    paths = [p for p in (out / "habitat_years.csv", *sorted(out.glob("habitat_years_*.csv"))) if p.exists()]
    if not paths:
        return table
    years = pd.concat([pd.read_csv(p) for p in paths]).drop_duplicates(["species", "region"], keep="last")
    names = [c for c in years.columns if c.startswith("years_")]
    return table.drop(columns=names, errors="ignore").merge(years[["species", "region", *names]],
                                                            on=["species", "region"], how="left")


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


def r2_folder():
    """forecast_pipeline with the R2 credentials loaded, and today's folder for the files."""
    import time
    import forecast_pipeline as fp
    root = Path(__file__).resolve().parents[2]
    fp.load_dotenv(root / ".env")
    fp.load_dotenv(root / ".env.secret")
    return fp, f"{R2_FOLDER}/{time.strftime('%Y%m%d-%H%M')}"


def upload(fp, folder, region, ids, columns: dict) -> dict:
    """One region's file on R2 (R2_FOLDER/<date>/habitat_<region>.npz: location ids, species,
    factor x 255 as uint8), and its entry for habitat_factor.json."""
    species = sorted(columns)
    buffer = io.BytesIO()
    np.savez_compressed(buffer, ids=ids.astype(str), species=np.array(species),
                        factor=np.column_stack([columns[s] for s in species]))
    data = buffer.getvalue()
    key = f"{folder}/habitat_{region}.npz"
    fp._r2_client().put_object(Bucket=fp.get_required_env("R2_BUCKET_NAME"), Key=key, Body=data,
                               ContentType="application/octet-stream")
    print(f"uploaded {key}: {len(species)} species, {len(data) / 1e6:.1f} MB", flush=True)
    return {"file": key, "sha256": hashlib.sha256(data).hexdigest(), "species": species}


def add_to_shipped(species, factors, ids_by_region) -> None:
    """--add: the species' factors join the shipped region files. Every other column is copied as it
    is, so no other species' factor moves; a file listing other places than today's is refused."""
    fp, folder = r2_folder()
    spec = json.loads(SHIPPED.read_text(encoding="utf-8"))
    for region, ids in ids_by_region.items():
        entry = spec["regions"][region]
        data = fp.r2_fetch(entry["file"])
        assert hashlib.sha256(data).hexdigest() == entry["sha256"], f"{entry['file']} is not the file shipped"
        with np.load(io.BytesIO(data)) as z:
            assert np.array_equal(z["ids"], ids.astype(str)), f"{region}: the places changed since {entry['file']}"
            columns = dict(zip((str(s) for s in z["species"]), z["factor"].T))
        columns[species] = np.rint(factors[(species, region)] * 255).astype(np.uint8)
        spec["regions"][region] = upload(fp, folder, region, ids, columns)
    SHIPPED.write_text(json.dumps(spec, indent=1) + "\n", encoding="utf-8", newline="\n")


def export(table, factors, ids_by_region, out) -> None:
    """Per region one file on R2 (upload) and backend/generated/habitat_factor.json naming each
    with its sha256."""
    fp, folder = r2_folder()
    spec = {"strength": STRENGTH, "floor": FLOOR, "reference_quantile": REFERENCE_QUANTILE,
            "trained": f"2016-{TEST_YEAR - 1}",
            "shipped_if": "score x habitat ranks held-out finds better than the score alone: on the training table's "
                          "held-out years (hand-set weather), better beyond doubt against that day's bracket finds or "
                          "other fungi's places and not worse beyond doubt on the other; otherwise 2026's finds above "
                          "the places searched that week (other fungi's finds), and no worse against bracket fungi",
            "regions": {}}
    for region, rows in table[table["ships"]].groupby("region"):
        spec["regions"][region] = upload(fp, folder, region, ids_by_region[region],
                                         {s: np.rint(factors[(s, region)] * 255).astype(np.uint8) for s in rows["species"]})
    SHIPPED.write_text(json.dumps(spec, indent=1) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--export", action="store_true", help="upload the shipped factors, write backend/generated/habitat_factor.json")
    parser.add_argument("--reuse", action="store_true", help="factors from habitat_models/ and habitat_result.csv, no training")
    parser.add_argument("--add", metavar="SPECIES",
                        help="train only this species, added after the finds table was built; with --export its "
                             "factors join the shipped files, every other factor in them unchanged")
    parser.add_argument("--regions", nargs="+", default=list(NEIGHBOUR), help="the regions to train in")
    args = parser.parse_args()
    out = Path(args.out)
    rng = np.random.default_rng(291)
    finds = pd.read_parquet(out / "finds_2016_2026.parquet")
    # A species added after the table was built brings its finds, here and in every later run that
    # trains or exports it (they set its reference).
    listed = pd.read_csv(out / "habitat_result.csv")["species"] if (out / "habitat_result.csv").exists() else []
    added = sorted({*listed, *([args.add] if args.add else [])} - set(finds["species"]))
    finds = pd.concat([finds, *(pd.read_parquet(out / f"finds_{s}_supplement.parquet") for s in added)], ignore_index=True)
    finds["Date"] = pd.to_datetime(finds["Date"])
    if args.reuse:
        table = with_years(pd.read_csv(out / "habitat_result.csv"), out)
        table["ships"] = ships(table)
        table.to_csv(out / "habitat_result.csv", index=False)
        if args.export:
            export(table, *from_models(table, finds, out), out)
        return
    summers = {"bracket": pd.read_parquet(out / "spatial_placebo" / "spatial_strata.parquet"),
               "all": pd.read_parquet(out / "spatial" / "spatial_strata.parquet")}
    (out / "habitat_models").mkdir(exist_ok=True)
    results = []
    for region in args.regions:
        features = pd.read_parquet(out / f"habitat_features_{region}.parquet")
        cols = columns(features)
        here = finds[finds["region"] == region]
        train, test = here[here["Date"].dt.year < TEST_YEAR], here[here["Date"].dt.year == TEST_YEAR]
        for species in [args.add] if args.add else sorted(set(here["species"]) - {PLACEBO}):
            x, mask, *_ = strata(train, species, features, rng)
            if len(x) < MIN_CASES:
                continue
            held = rng.random(len(x)) < 0.15
            model = gbm.fit(x[~held], mask[~held], rounds=1000, params=PARAMS, valid=(x[held], mask[held]))
            tx, tmask, *_ = strata(test, species, features, rng)
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
    table = with_years(pd.DataFrame(results), out)
    table["ships"] = ships(table)
    if args.add:
        old = pd.read_csv(out / "habitat_result.csv")
        mine = table
        table = pd.concat([old[~((old["species"] == args.add) & old["region"].isin(args.regions))], mine], ignore_index=True)
    table.to_csv(out / "habitat_result.csv", index=False)
    if args.export and args.add:
        add_to_shipped(args.add, *from_models(mine, finds, out))
    elif args.export:
        export(table, *from_models(table, finds, out), out)
    pd.set_option("display.width", 250)
    print(table.drop(columns=["top_features"]).to_string(index=False))


if __name__ == "__main__":
    main()

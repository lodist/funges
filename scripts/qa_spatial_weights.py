#!/usr/bin/env python3
"""Do the score's parts rank the places where a species is found above the places people
search anyway? The spatial counterpart of the #291 timing tests.

Each 2026 find is compared, on its own day, with up to K finds of other species (bracket
fungi included) made in the same region within +-3 days: those places mark where people
were out that week, so a part only scores here if it picks the species' places out of the
searched ones. 2026 is held out of the range prior. Weather and static data are the app's
own stored values (qa_weather_skill.py's cache), scored by forecast_pipeline's own code.

Per species-region it reports how often each part (and the full score) ranks the find
above its comparison places, and fits the parts' weights directly: the score's log is a
weighted sum of the parts' logs, so a conditional logit over each find and its comparison
places estimates the weights; folds by week compare them with today's weights.

    python scripts/qa_spatial_weights.py --finds ../era5_training/finds-2026-06-14_2026-09-11.csv \\
        --cache ../era5_training/acceptance_cache --out ../era5_training/spatial
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "tools"))
sys.path.insert(0, str(ROOT / "scripts"))
import forecast_pipeline as fp  # noqa: E402
import seasonality as sn  # noqa: E402
from fit_fruiting import PLACEBO, find_day_rank, fit  # noqa: E402
from qa_season_branch_replay import BRANCH_LAG_COLUMNS  # noqa: E402
from qa_weather_skill import LAG_DAYS  # noqa: E402

K, WINDOW_DAYS, MIN_CASES = 10, 3, 30
PARTS = ["weather", "altitude", "ph", "water", "range", "season"]
SCRIPTS = {"NE": "EU/North_Europe/NE_Scoring.py", "SE": "EU/South_Europe/SE_Scoring.py",
           "USE": "US/USE/USE_Scoring.py", "USW": "US/USW/USW_Scoring.py"}


def region_config(region):
    spec = importlib.util.spec_from_file_location(f"{region}_scoring", ROOT / "backend" / SCRIPTS[region])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.CONFIG


def strata(here, rng, placebo_only=False):
    """Each species find (case) with up to K other-species finds of the same region within
    +-WINDOW_DAYS, at other places: rows (case, slot 0 = the find, location, date of the find)."""
    rows = []
    dates = here["Date"].to_numpy()
    for case, find in enumerate(here.itertuples(index=False)):
        if find.species == PLACEBO:
            continue
        near = here[(np.abs(dates - np.datetime64(find.Date)) <= np.timedelta64(WINDOW_DAYS, "D"))
                    & (here["species"] != find.species) & (here["Location_Id"] != find.Location_Id)
                    & ((here["species"] == PLACEBO) if placebo_only else True)]
        near = near.drop_duplicates("Location_Id")
        if len(near) < 3:
            continue
        near = near.sample(min(K, len(near)), random_state=int(rng.integers(1 << 30)))
        rows.append((case, 0, find.species, find.Location_Id, find.Date))
        rows.extend((case, j + 1, find.species, loc, find.Date) for j, loc in enumerate(near["Location_Id"]))
    return pd.DataFrame(rows, columns=["case", "slot", "species", "Location_Id", "Date"])


def parts(frame, species, params, zone_curves):
    """Each row's parts for one species: the weighted weather mean, altitude, pH, water, the
    range prior and the season factor, plus the full score and today's part weights."""
    captured, original = [], fp._hybrid_component_mean_rows

    def spy(components, weights, **kwargs):
        captured.append((np.asarray(components, float), np.asarray(weights, float)))
        return original(components, weights, **kwargs)

    fp._hybrid_component_mean_rows = spy
    try:
        scored = fp.calculate_mushroom_score(frame.copy(), {species: params[species]}, zone_curves)
    finally:
        fp._hybrid_component_mean_rows = original
    out = pd.DataFrame({"Location_Id": frame["Location_Id"].to_numpy(), "Date": frame["Date"].to_numpy(),
                        **{p: np.nan for p in PARTS}})
    has_ph = frame["ph_level"].notna().to_numpy()
    weights = None
    for components, w in captured:
        if components.shape[1] != len(frame):
            continue
        rows = has_ph if components.shape[0] == 6 else ~has_ph
        c = np.clip(components, 0.02, 1.0)
        w3 = w[:3]
        out.loc[rows, "weather"] = np.exp((w3[:, None] * np.log(c[:3])).sum(0) / max(w3.sum(), 1e-9))[rows]
        out.loc[rows, "altitude"] = c[3][rows]
        out.loc[rows, "ph"] = c[4][rows] if components.shape[0] == 6 else 1.0
        out.loc[rows, "water"] = c[-1][rows]
        if components.shape[0] == 6:
            weights = {"weather": w3.sum(), "altitude": w[3], "ph": w[4], "water": w[5]}
    out["range"] = np.asarray(fp.range_prior_for_species(frame, params[species]), float) * np.ones(len(frame))
    out["season"] = (sn.season_multiplier_for_species(frame, species, params[species], zone_curves)
                     * sn.season_gate_for_species(frame, species, params[species], zone_curves))
    out["score"] = scored[f"{species}_score"].to_numpy()
    return out, weights


ALPHA, FOLDS = 20.0, 5


def stack(table, columns):
    """Rows -> [case, slot, k] arrays and the mask of slots present (slot 0 = the find)."""
    cases = np.unique(table["case"].to_numpy(), return_inverse=True)[1]
    slots = table["slot"].to_numpy()
    x = np.zeros((cases.max() + 1, slots.max() + 1, len(columns)))
    mask = np.zeros(x.shape[:2], bool)
    values = table[columns].to_numpy(float)
    ok = np.isfinite(values).all(axis=1)
    x[cases[ok], slots[ok]] = values[ok]
    mask[cases[ok], slots[ok]] = True
    keep = mask[:, 0] & (mask[:, 1:].sum(axis=1) >= 3)
    return x[keep], mask[keep], keep


def analyse(table, current):
    """Per species-region: each part's spatial skill, and today's weights against weights
    fitted on the other weeks (folds by ISO week)."""
    rows = []
    for (species, region), g in table.groupby(["species", "region"]):
        w = current.get((species, region))
        if not w:
            continue
        total = sum(w.values())
        today = np.array([w["weather"] / total, w["altitude"] / total, w["ph"] / total, w["water"] / total, 1.0, 1.0])
        logs = g.assign(**{p: np.log(g[p].clip(lower=0.02 if p in ("weather", "altitude", "ph", "water") else 1e-3))
                           for p in PARTS})
        x, mask, keep = stack(logs, PARTS)
        if len(x) < MIN_CASES:
            continue
        entry = {"species": species, "region": region, "finds": len(x)}
        for i, part in enumerate(PARTS):
            entry[part] = round(float(find_day_rank(x[..., i], mask).mean()), 3)
        week = (g.groupby("case")["Date"].first().dt.isocalendar().week.to_numpy())[keep]
        held_today, held_tuned, fitted = [], [], []
        for fold in range(FOLDS):
            test = (week % FOLDS) == fold
            if test.sum() < 5 or (~test).sum() < MIN_CASES:
                continue
            beta = fit(x[~test], mask[~test], center=today, alpha=ALPHA)
            fitted.append(beta)
            held_today.append(find_day_rank(x[test] @ today, mask[test]))
            held_tuned.append(find_day_rank(x[test] @ beta, mask[test]))
        if not fitted:                       # too few finds to hold a week out
            continue
        entry["score_today"] = round(float(np.concatenate(held_today).mean()), 3)
        entry["score_tuned"] = round(float(np.concatenate(held_tuned).mean()), 3)
        mean_beta = np.mean(fitted, axis=0)
        for i, part in enumerate(PARTS):
            entry[f"w_{part}"] = f"{today[i]:.2f}->{mean_beta[i]:.2f}"
        rows.append(entry)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--finds", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--analyse", action="store_true", help="only analyse spatial_strata.parquet")
    parser.add_argument("--placebo-only", action="store_true",
                        help="compare with bracket-fungus finds only (where people walk, not other species' habitats)")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.analyse:
        weights = pd.read_csv(out / "current_weights.csv")
        current = {(r.species, r.region): {p: getattr(r, p) for p in ("weather", "altitude", "ph", "water")}
                   for r in weights.itertuples() if pd.notna(r.weather)}
        result = analyse(pd.read_parquet(out / "spatial_strata.parquet"), current)
        result.to_csv(out / "spatial_result.csv", index=False)
        pd.set_option("display.width", 250)
        print(result.to_string(index=False))
        return
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    finds = pd.read_csv(args.finds, parse_dates=["Date"])
    rng = np.random.default_rng(291)
    tables, weights = [], {}
    for region in SCRIPTS:
        here = finds[finds["region"] == region].reset_index(drop=True)
        cached = list(Path(args.cache).glob(f"stored-{region}-*.parquet"))
        if here.empty or not cached:
            continue
        params, zone_curves = fp._load_species_and_curves(region_config(region))
        layout = strata(here, rng, args.placebo_only)
        history = pd.read_parquet(cached[0])
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        need = layout[["Location_Id", "Date"]].drop_duplicates()
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS + fp.FRUITING_LAG_COLUMNS, LAG_DAYS,
                                        target=history.merge(need, on=["Location_Id", "Date"]))
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)
        for species in sorted(set(layout["species"]) & set(params)):
            mine = layout[layout["species"] == species]
            if mine["case"].nunique() < MIN_CASES:
                continue
            pieces = []
            for day, rows in frame[frame["Date"].isin(mine["Date"].unique())].groupby("Date"):
                local = {k: dict(v) for k, v in params.items() if k == species}
                if "fruiting_gbm" in local[species]:
                    local[species]["fruiting_gbm"] = {**local[species]["fruiting_gbm"], "anchor": day}
                piece, w = parts(rows.reset_index(drop=True), species, local, zone_curves)
                pieces.append(piece)
                weights[(species, region)] = w or weights.get((species, region))
            values = pd.concat(pieces, ignore_index=True)
            table = mine.merge(values, on=["Location_Id", "Date"], how="left").assign(region=region)
            tables.append(table)
            print(f"{region} {species:22s} {mine['case'].nunique():5d} finds", flush=True)
    table = pd.concat(tables, ignore_index=True)
    table.to_parquet(out / "spatial_strata.parquet", index=False)
    pd.DataFrame([{"species": s, "region": r, **(w or {})} for (s, r), w in weights.items()]).to_csv(
        out / "current_weights.csv", index=False)
    print(f"wrote {len(table):,} rows ({table.groupby(['species', 'region', 'case']).ngroups:,} strata)")


if __name__ == "__main__":
    main()

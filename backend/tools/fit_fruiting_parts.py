#!/usr/bin/env python3
"""Switch off the hand-set weather parts that time a mushroom's finds the wrong way.

Where no fitted model ships (tools/fit_fruiting.py, tools/fit_fruiting_gbm.py), a mushroom's
weather is its hand-set temperature, humidity and rain parts in a geometric mean weighted 1.75,
1.0 and rain_weight (1.5), and some time the finds no better than the walkers: morel in North
Europe (-0.015 net of the bracket-fungus days), hedgehog in US West (-0.026). The test is
fit_fruiting's: each find's own day against the same place 14 and 21 days either side, net of
bracket-placebo days, on the training table's ERA5 days with the parts as
tools/build_training_table.py stored them. Parts go one at a time while that lifts the net by MIN_GAIN; each year is scored with the
parts chosen on the other years, and a species-region ships where that beats today's model in
more years than chance (sign test p < 0.1, at least 6 years), as the fits ship. Where fewer than
6 years have 50 finds, all its held-out years together: at least MIN_POOLED finds and a gain whose
95% CI, resampling whole weeks within each year (a week's finds share its weather), is above 0.
A part that times the finds badly can still rank places well, so a pick still has to pass the
spatial test and the map before it is written.

    python backend/tools/fit_fruiting_parts.py --out ../era5_training             # -> parts_fruiting.csv
    python backend/tools/fit_fruiting_parts.py --out ../era5_training --spatial   # the picks on summer 2026
"""
import lightgbm  # noqa: F401  before pandas/pyarrow: see tests/conftest.py
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "backend" / "tools"), str(ROOT / "backend"), str(ROOT / "scripts")]
from fit_fruiting import (MIN_TEST_STRATA, PLACEBO, SHIP_MIN_YEARS, SLOTS, find_day_rank, sign_test, ships,  # noqa: E402
                          strata, transform)
from species_registry import get_species_params  # noqa: E402

PARTS = {"temp_weight": ("temp", 1.75), "humidity_weight": ("humidity", 1.0), "rain_weight": ("moisture", 1.5)}
MIN_GAIN = 0.002
MIN_POOLED = 150


def wide(scores: pd.DataFrame, cases: pd.DataFrame, column: str) -> np.ndarray:
    """[case, 5 days] of one stored column for these cases (NaN where absent)."""
    return (scores.pivot_table(index="case_id", columns="offset", values=column)
            .reindex(index=cases["case_id"], columns=list(SLOTS)).to_numpy(float))


def weather(parts: dict, weights: dict, wind: np.ndarray) -> np.ndarray:
    """The weather part with these weights, as forecast_pipeline combines it (each part floored at
    0.02, a weighted geometric mean; 1 with every part off), times the stored wind factor."""
    total = sum(weights.values())
    if total <= 0:
        return wind
    log_sum = sum(w * np.log(np.clip(parts[name], 0.02, 1.0)) for name, w in
                  ((PARTS[k][0], weights[k]) for k in PARTS))
    return np.exp(log_sum / total) * wind


def net(index: np.ndarray, days: np.ndarray, target: np.ndarray, placebo: np.ndarray) -> float:
    return float(find_day_rank(index[target], days[target]).mean() - find_day_rank(index[placebo], days[placebo]).mean())


def choose(parts, today, wind, days, target, placebo) -> dict:
    """Parts off, one at a time, while that lifts the net on these strata by MIN_GAIN."""
    weights = dict(today)
    current = net(weather(parts, weights, wind), days, target, placebo)
    while True:
        trials = {k: net(weather(parts, {**weights, k: 0.0}, wind), days, target, placebo)
                  for k, w in weights.items() if w > 0}
        if not trials:
            return weights
        k, best = max(trials.items(), key=lambda kv: kv[1])
        if best < current + MIN_GAIN:
            return weights
        weights[k], current = 0.0, best


def pooled_gain(held_out: list, seed: int = 291) -> tuple[float, list]:
    """All held-out years together: the net's gain, each year weighted by its finds, and its 95% CI
    resampling whole weeks of finds and of placebo days within each year. held_out: per year,
    ((finds' change in rank, their weeks), (placebo days' change, their weeks))."""
    def by_week(change, weeks):
        index = np.unique(weeks, return_inverse=True)[1]
        return np.bincount(index, change), np.bincount(index)

    years = [(by_week(*finds), by_week(*placebo)) for finds, placebo in held_out]
    n = np.array([f[1].sum() for f, _ in years], float)

    def gain(draw):
        d = [f[0][i].sum() / f[1][i].sum() - p[0][j].sum() / p[1][j].sum() for (f, p), (i, j) in zip(years, draw)]
        return float(np.dot(n, d) / n.sum())

    rng = np.random.default_rng(seed)
    draws = [gain([(rng.integers(0, len(f[0]), len(f[0])), rng.integers(0, len(p[0]), len(p[0]))) for f, p in years])
             for _ in range(1000)]
    return gain([(np.arange(len(f[0])), np.arange(len(p[0]))) for f, p in years]), \
        [round(float(q), 4) for q in np.quantile(draws, [0.025, 0.975])]


def hand_set(species: str, region: str, fits: dict, gbms: dict) -> bool:
    return region not in fits.get(species, {}) and region not in gbms.get(species, {}).get("regions", {})


def spatial(out: Path, picks: pd.DataFrame) -> pd.DataFrame:
    """Each pick on scripts/qa_spatial_weights.py's summer 2026 strata (a find against other
    species' finds in its region that week, on the app's stored weather): the find's rank with
    today's parts and with the pick's parts off, the full score as the nightly run scores it."""
    import forecast_pipeline as fp
    from fit_plant_settings import paired_ci
    from qa_season_branch_replay import BRANCH_LAG_COLUMNS
    from qa_spatial_weights import MIN_CASES, region_config, stack
    from qa_weather_skill import LAG_DAYS
    fp.load_dotenv(ROOT / ".env")
    fp.load_dotenv(ROOT / ".env.secret")
    layout_all = pd.read_parquet(out / "spatial" / "spatial_strata.parquet",
                                 columns=["case", "slot", "species", "Location_Id", "Date", "region"])
    layout_all["Date"] = pd.to_datetime(layout_all["Date"]).dt.normalize()
    rows = []
    for region, mine in picks.groupby("region"):
        layout = layout_all[(layout_all["region"] == region) & layout_all["species"].isin(mine["species"])]
        if layout.empty:
            continue
        params, zone_curves = fp._load_species_and_curves(region_config(region))
        history = pd.read_parquet(next((out / "acceptance_cache").glob(f"stored-{region}-*.parquet")))
        history["Date"] = pd.to_datetime(history["Date"]).dt.normalize()
        need = layout[["Location_Id", "Date"]].drop_duplicates()
        frame = fp.compute_lag_features(history, BRANCH_LAG_COLUMNS + fp.FRUITING_LAG_COLUMNS, LAG_DAYS,
                                        target=history.merge(need, on=["Location_Id", "Date"]))
        frame = frame.drop_duplicates(["Location_Id", "Date"], keep="last").reset_index(drop=True)
        for species, off in zip(mine["species"], mine["switched off"]):
            table = layout[layout["species"] == species]
            if table["case"].nunique() < MIN_CASES:
                continue
            here = frame[frame["Date"].isin(table["Date"].unique())].reset_index(drop=True)
            scored = here[["Location_Id", "Date"]].copy()
            for name, p in (("before", params[species]), ("after", {**params[species], **{k: 0.0 for k in off.split()}})):
                scored[name] = fp.calculate_mushroom_score(here.copy(), {species: p}, zone_curves)[f"{species}_score"].to_numpy()
            x, mask, _ = stack(table.merge(scored, on=["Location_Id", "Date"], how="left"), ["before", "after"])
            before, after = find_day_rank(x[..., 0], mask), find_day_rank(x[..., 1], mask)
            rows.append({"species": species, "region": region, "switched off": off, "finds": len(before),
                         "today": round(float(before.mean()), 4), "after": round(float(after.mean()), 4),
                         "ci": paired_ci(after, before)})
            print(rows[-1], flush=True)
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="the training folder (training/, training_scores/)")
    parser.add_argument("--spatial", action="store_true", help="the timing picks on the summer 2026 strata")
    args = parser.parse_args()
    out = Path(args.out)
    if args.spatial:
        picks = pd.read_csv(out / "parts_fruiting.csv")
        result = spatial(out, picks[picks["ships"].astype(str) == "True"])
        result.to_csv(out / "parts_fruiting_spatial.csv", index=False)
        print(result.to_string(index=False))
        return
    table = pd.concat([t for t in (pd.read_parquet(p) for p in (out / "training").glob("*.parquet")) if len(t)], ignore_index=True)
    scores = pd.concat([s for s in (pd.read_parquet(p) for p in (out / "training_scores").glob("*.parquet")) if len(s)],
                       ignore_index=True)
    cases, _, mask = strata(table, transform(table))
    is_placebo = (cases["species"] == PLACEBO).to_numpy()
    fits = json.loads((ROOT / "backend" / "generated" / "fruiting_fit.json").read_text(encoding="utf-8")).get("models", {})
    gbms = json.loads((ROOT / "backend" / "generated" / "fruiting_gbm.json").read_text(encoding="utf-8")).get("models", {})
    params = {r: get_species_params(r) for r in ("NE", "SE", "USE", "USW")}
    years, regions = cases["year"].to_numpy(), cases["region"].to_numpy()
    found = pd.to_datetime(cases["find_date"])
    weeks = (found.dt.isocalendar().year * 100 + found.dt.isocalendar().week).to_numpy(int)
    rows = []
    for species in sorted(set(cases["species"]) - {PLACEBO}):
        mine_all = (cases["species"] == species).to_numpy()
        own = scores[scores["species"] == species]
        parts = {name: wide(own, cases, name) for name, _ in PARTS.values()}
        stored = wide(own, cases, "weather_part")
        for region in sorted(set(regions[mine_all])):
            if region not in params or species not in params[region] or not hand_set(species, region, fits, gbms):
                continue
            p = params[region][species]
            today = {k: float(p.get(k, default)) for k, (_, default) in PARTS.items()}
            base = weather(parts, today, np.ones_like(stored))
            wind = np.where(base > 0, stored / base, 1.0)        # wind-sensitive species: stored / rebuilt
            days = mask & np.isfinite(stored)
            mine = mine_all & (regions == region) & days[:, 0]
            plac = is_placebo & (regions == region) & days[:, 0]
            results, held_out = [], []
            for year in sorted(set(years[mine])):
                held = years == year
                tc, tp = mine & held, plac & held
                if not tp.any():
                    continue
                after = weather(parts, choose(parts, today, wind, days, mine & ~held, plac & ~held), wind)
                (f0, f1), (p0, p1) = [[find_day_rank(i[s], days[s]) for i in (stored, after)] for s in (tc, tp)]
                held_out.append(((f1 - f0, weeks[tc]), (p1 - p0, weeks[tp])))
                if tc.sum() >= MIN_TEST_STRATA and tp.sum() >= MIN_TEST_STRATA:
                    results.append((int(year), float(f0.mean() - p0.mean()), float(f1.mean() - p1.mean())))
            final = choose(parts, today, wind, days, mine, plac)
            off = sorted(k for k in PARTS if today[k] > 0 and final[k] == 0)
            wins, pval, gain = sign_test(results) if results else (0, 1.0, 0.0)
            pooled, ci = pooled_gain(held_out) if held_out else (0.0, [0.0, 0.0])
            thin = len(results) < SHIP_MIN_YEARS
            rows.append({"species": species, "region": region, "finds": int(mine.sum()), "years": len(results),
                         "wins": wins, "p": round(pval, 4), "mean gain": round(gain, 4),
                         "pooled gain": round(pooled, 4), "pooled ci": ci,
                         "today net": round(net(stored, days, mine, plac), 4),
                         "after net": round(net(weather(parts, final, wind), days, mine, plac), 4),
                         "switched off": " ".join(off),
                         "ships": bool(off) and (mine.sum() >= MIN_POOLED and ci[0] > 0 if thin else ships(results))})
            print(rows[-1], flush=True)
    result = pd.DataFrame(rows)
    result.to_csv(out / "parts_fruiting.csv", index=False)
    pd.set_option("display.width", 220)
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()

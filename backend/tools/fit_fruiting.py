#!/usr/bin/env python3
"""Fit the fruiting response (#291 step 3) and test it against today's model.

A conditional logit over the training table's case-crossover strata: each find's own day
against the same point 14 and 21 days either side, so everything fixed at a place cancels.
Outings are handled by the test, not the fit: an index is scored by how far it ranks find
days above their controls minus how far it ranks bracket-placebo days, so one that only
tracks when people go out scores zero. Holding a bracket-fitted outing model fixed as an
offset was tried and cost skill (shaggy mane +0.08 -> +0.05, chanterelle +0.12 -> +0.11);
it is still fitted, per continent, for the report.

Each species is fitted on all its regions together; each region with enough finds is then
refitted with a penalty that pulls it toward that shared answer, so a thin region stays
close to it. Two tests, both with the rank test of scripts/qa_weather_skill.py next to
today's model on the very same days:

- Leaving one year out: every year is scored by a fit on all the other years. This decides
  what ships: a species-region whose fit beats today's model in more years than chance
  would give (one-sided sign test, p < 0.1, over at least 6 years). A single test period
  is not enough: porcini in North Europe won 9 of 11 years, but lost summer 2026.
- 2025-2026 held out from a fit on 2016-2024, and each region scored by a fit that never
  saw it, for the report.

What ships is refitted on every year. 2025 is reported on its own as well: some
species' hand-set parameters were tuned on 2026 sightings, which favours today's model there.

    python backend/tools/fit_fruiting.py --out ../era5_training
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import binomtest

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import forecast_pipeline as fp  # noqa: E402
from download_era5_points import log  # noqa: E402

SLOTS = {0: 0, -21: 1, -14: 2, 14: 3, 21: 4}
PLACEBO = "placebo"
CONTINENT = {"NE": "EU", "SE": "EU", "USE": "US", "USW": "US"}
LAST_TRAIN_YEAR = 2024
MIN_TRAIN_STRATA = 300       # a species with fewer keeps its hand-set parameters
MIN_REGION_STRATA = 100      # a region with fewer uses its species' shared answer
ALPHA_SHARED, ALPHA_REGION = 1.0, 50.0
MIN_TEST_STRATA = 50
SHIP_P, SHIP_MIN_YEARS = 0.1, 6
MAP_CELLS, MAP_DAY_STEP = 100, 3   # the scale map's sample: places, and every n-th day
# The forecast fetch that stores today's rows (one per forecast day, the past frozen) started
# on 14 June 2026. Days stored before it came from another setup and read differently: their
# humidity sat above ERA5's, the current fetch's below it.
STORED_FROM = pd.Timestamp("2026-07-01")
FEATURES = fp.FRUITING_FEATURES
MAP_QUANTILES = np.linspace(0, 1, 101)


def transform(table: pd.DataFrame) -> pd.DataFrame:
    """Training-table columns -> the fit's features, with the production pipeline's code."""
    return fp.fruiting_design(table)


def strata(table: pd.DataFrame, values: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray, np.ndarray]:
    """Rows -> (one row per case, values [case, 5 days, k], mask [case, 5]); the find day
    is slot 0. Cases without their own day and a control on each side are dropped."""
    case_ids, stratum = np.unique(table["case_id"].to_numpy(), return_inverse=True)
    slot = table["offset"].map(SLOTS).to_numpy()
    k = values.shape[1]
    data = np.zeros((len(case_ids), 5, k))
    mask = np.zeros((len(case_ids), 5), bool)
    rows = values.to_numpy(float)
    ok = np.isfinite(rows).all(axis=1)
    data[stratum[ok], slot[ok]] = rows[ok]
    mask[stratum[ok], slot[ok]] = True
    keep = mask[:, 0] & mask[:, 1:3].any(1) & mask[:, 3:].any(1)
    cases = (table[table["offset"] == 0].drop_duplicates("case_id").set_index("case_id")
             .reindex(case_ids)[["species", "region", "find_date"]].reset_index())
    cases["year"] = pd.to_datetime(cases["find_date"]).dt.year
    return cases[keep].reset_index(drop=True), data[keep], mask[keep]


def fit(x: np.ndarray, mask: np.ndarray, offset: np.ndarray | None = None,
        center: np.ndarray | None = None, alpha: float = 0.0) -> np.ndarray:
    """Conditional logit: maximise sum log P(slot 0 | its stratum), minus alpha*|b - center|^2."""
    k = x.shape[2]
    center = np.zeros(k) if center is None else center
    base = np.zeros(mask.shape) if offset is None else offset

    def loss(beta):
        eta = np.where(mask, x @ beta + base, -np.inf)
        top = eta.max(axis=1, keepdims=True)
        weights = np.exp(eta - top)
        total = weights.sum(axis=1)
        p = weights / total[:, None]
        log_lik = (eta[:, 0] - top[:, 0] - np.log(total)).sum()
        gradient = (x[:, 0, :] - np.einsum("sj,sjk->sk", p, x)).sum(axis=0)
        return (-log_lik + alpha * np.sum((beta - center) ** 2),
                -gradient + 2 * alpha * (beta - center))

    return minimize(loss, center.copy(), jac=True, method="L-BFGS-B").x


def find_day_rank(index: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Percentile of the find day's index among its stratum's control days (0.5 = none)."""
    case, controls, valid = index[:, :1], index[:, 1:], mask[:, 1:]
    below = (valid & (controls < case)).sum(axis=1)
    equal = (valid & (controls == case)).sum(axis=1)
    return (below + 0.5 * equal) / np.maximum(valid.sum(axis=1), 1)


def bootstrap(a: np.ndarray, b: np.ndarray, seed: int = 291) -> list[float]:
    rng = np.random.default_rng(seed)
    draws = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() for _ in range(500)]
    return [round(float(q), 3) for q in np.quantile(draws, [0.025, 0.975])]


def baseline_index(scores: pd.DataFrame, cases: pd.DataFrame, species: str) -> np.ndarray:
    """Today's model's weather part for these cases' five days ([case, 5]; NaN where absent)."""
    rows = scores[scores["species"] == species]
    wide = rows.pivot_table(index="case_id", columns="offset", values="weather_part")
    wide = wide.reindex(index=cases["case_id"], columns=list(SLOTS))
    return wide.to_numpy(float)


def month_maps(dates, eta: np.ndarray, part: np.ndarray) -> list[dict]:
    """Per calendar month: quantiles of the fitted index and of today's weather part."""
    month = pd.DatetimeIndex(dates).month.to_numpy()
    return [{"eta": np.quantile(eta[month == m], MAP_QUANTILES).round(6).tolist(),
             "weather_part": np.quantile(part[month == m], MAP_QUANTILES).round(6).tolist(),
             "days": int((month == m).sum())} for m in range(1, 13)]


def season_maps(table, out, species, region, beta, means, sds, specs, humidity) -> list[dict]:
    """month_maps over every MAP_DAY_STEP-th day of every year at up to MAP_CELLS of the
    species' places in the region. One map per month keeps today's level at each time of
    year: the fit only compares a day with the same place 2-3 weeks either side, so it says
    nothing about how one season compares with another, and a single map for the whole year
    moved early October's share of 4+ scores by up to 45 points. Today's side is computed on
    stored-level humidity, as production computes it; the index on ERA5's level, which
    production reaches through humidity_from_stored."""
    import build_training_table as tt

    a, b = humidity
    finds = table[(table["species"] == species) & (table["region"] == region) & (table["offset"] == 0)]
    cells = finds[["cell_lat", "cell_lon"]].drop_duplicates()
    cells = cells.sample(min(MAP_CELLS, len(cells)), random_state=291)
    cells["block"] = [f"{np.floor(lat / 0.5) * 0.5:.2f}_{np.floor(lon / 0.5) * 0.5:.2f}"
                      for lat, lon in zip(cells["cell_lat"], cells["cell_lon"])]
    dates, etas, parts = [], [], []
    for name, group in cells.groupby("block"):
        path = out / "era5_blocks" / f"{name}.parquet"
        if not path.exists():
            continue
        block = pd.read_parquet(path)
        rows = []
        for lat, lon in zip(group["cell_lat"], group["cell_lon"]):
            cell = block[(block["Latitude"].round(2) == lat) & (block["Longitude"].round(2) == lon)]
            days = pd.DatetimeIndex(cell["Date"].sort_values().iloc[42::MAP_DAY_STEP])
            z = (fp.fruiting_design(tt.features(cell, days)).to_numpy(float) - means) / sds
            rows.append(pd.DataFrame({"species": species, "region": region, "cell_lat": lat, "cell_lon": lon,
                                      "date": days, "offset": 0, "eta": z @ beta}))
        rows = pd.concat(rows, ignore_index=True)
        rows["case_id"] = np.arange(len(rows))
        stored_level = block.assign(**{"Humidity (%)": ((block["Humidity (%)"] - a) / b).clip(0, 100)})
        today = tt.baseline(stored_level, rows, specs)[["case_id", "weather_part"]]
        both = rows.merge(today, on="case_id").dropna(subset=["eta", "weather_part"])
        dates.append(both["date"].to_numpy())
        etas.append(both["eta"].to_numpy())
        parts.append(both["weather_part"].to_numpy())
    return month_maps(np.concatenate(dates), np.concatenate(etas), np.concatenate(parts))


def humidity_correction(stored: np.ndarray, era5: np.ndarray) -> tuple[float, float]:
    """(a, b) such that a + b * stored has ERA5's mean and spread on the same places and days."""
    b = float(np.std(era5) / np.std(stored))
    return float(np.mean(era5) - b * np.mean(stored)), b


def stored_humidity_correction(out: Path, region: str, points: int = 1500) -> tuple[float, float]:
    """humidity_correction between the region's stored weather (WeatherAPI) at a sample of map
    points and ERA5 at their cell, over every day both have since STORED_FROM. Stored humidity
    reads 2-7 points lower, most on dry days."""
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.parquet as pq
    from qa_weather_skill import r2_filesystem

    key = f"{fp.get_required_env('R2_BUCKET_NAME')}/{fp._r2_key(fp.get_required_env(f'{region}_WEATHER_DATA'))}"
    parquet = pq.ParquetFile(r2_filesystem().open_input_file(key))
    places = (parquet.read_row_group(parquet.num_row_groups - 1, columns=["Location_Id", "Latitude", "Longitude"])
              .to_pandas().drop_duplicates("Location_Id"))
    places["cell_lat"] = (np.round(places["Latitude"] / 0.25) * 0.25).round(2)
    places["cell_lon"] = (np.round(places["Longitude"] / 0.25) * 0.25).round(2)
    places["block"] = [f"{np.floor(lat / 0.5) * 0.5:.2f}_{np.floor(lon / 0.5) * 0.5:.2f}"
                       for lat, lon in zip(places["cell_lat"], places["cell_lon"])]
    places = places[[(out / "era5_blocks" / f"{name}.parquet").exists() for name in places["block"]]]
    places = places.sample(min(points, len(places)), random_state=291)
    wanted = pa.array(places["Location_Id"].tolist())
    pieces = []
    for group in range(parquet.num_row_groups):
        rows = parquet.read_row_group(group, columns=["Location_Id", "Date", "Humidity (%)"])
        pieces.append(rows.filter(pc.is_in(rows["Location_Id"], value_set=wanted)).to_pandas())
    stored = pd.concat(pieces, ignore_index=True)
    stored["Date"] = pd.to_datetime(stored["Date"]).dt.normalize()
    stored = stored.drop_duplicates(["Location_Id", "Date"], keep="last").merge(places, on="Location_Id")
    era5 = pd.concat([pd.read_parquet(out / "era5_blocks" / f"{name}.parquet",
                                      columns=["Latitude", "Longitude", "Date", "Humidity (%)"])
                      for name in stored["block"].unique()], ignore_index=True)
    era5 = era5.rename(columns={"Latitude": "cell_lat", "Longitude": "cell_lon"})
    both = stored.merge(era5, on=["cell_lat", "cell_lon", "Date"], suffixes=("", "_era5"))
    both = both[both["Date"] >= STORED_FROM].dropna(subset=["Humidity (%)", "Humidity (%)_era5"])
    a, b = humidity_correction(both["Humidity (%)"].to_numpy(float), both["Humidity (%)_era5"].to_numpy(float))
    log(f"{region}: ERA5 humidity = {a:.1f} + {b:.3f} x stored ({len(both):,} place-days, "
        f"{both['Date'].min():%d %b} - {both['Date'].max():%d %b %Y})")
    return a, b


def leave_one_year_out(cases, x, mask, mine, is_placebo, days, today_index) -> dict:
    """Per region: (year, today's net, fitted net) with each year scored by a fit on the others."""
    years = cases["year"].to_numpy()
    regions = cases["region"].to_numpy()
    results = {}
    for year in sorted(set(years[mine])):
        train = mine & (years != year)
        if train.sum() < MIN_TRAIN_STRATA:
            continue
        shared = fit(x[train], mask[train], alpha=ALPHA_SHARED)
        for region in sorted(set(regions[mine])):
            here = regions == region
            tc = mine & here & (years == year) & days[:, 0]
            tp = is_placebo & here & (years == year) & days[:, 0]
            if tc.sum() < MIN_TEST_STRATA or tp.sum() < MIN_TEST_STRATA:
                continue
            beta = (fit(x[train & here], mask[train & here], center=shared, alpha=ALPHA_REGION)
                    if (train & here).sum() >= MIN_REGION_STRATA else shared)

            def net(index):
                return float(find_day_rank(index[tc], days[tc]).mean() - find_day_rank(index[tp], days[tp]).mean())

            results.setdefault(region, []).append((int(year), net(today_index), net(x @ beta)))
    return results


def sign_test(results) -> tuple[int, float, float]:
    """Years the fit beat today's model, the one-sided sign test's p, and the mean gain."""
    wins = sum(f > t for _, t, f in results)
    p = binomtest(wins, len(results), 0.5, alternative="greater").pvalue
    return wins, p, float(np.mean([f - t for _, t, f in results]))


def ships(results) -> bool:
    _, p, gain = sign_test(results)
    return len(results) >= SHIP_MIN_YEARS and p < SHIP_P and gain > 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--export", help="write the shipped models here (backend/generated/fruiting_fit.json)")
    args = parser.parse_args()
    out = Path(args.out)

    table = pd.concat([t for t in (pd.read_parquet(p) for p in (out / "training").glob("*.parquet")) if len(t)],
                      ignore_index=True)
    scores = pd.concat([s for s in (pd.read_parquet(p) for p in (out / "training_scores").glob("*.parquet"))
                        if len(s)], ignore_index=True)
    cases, x, mask = strata(table, transform(table))
    cases["continent"] = cases["region"].map(CONTINENT)
    train = (cases["year"] <= LAST_TRAIN_YEAR).to_numpy()
    flat = x[mask]
    means, sds = flat.mean(axis=0), flat.std(axis=0)
    x = np.where(mask[..., None], (x - means) / sds, 0.0)
    log(f"{len(cases):,} strata ({train.sum():,} train, {(~train).sum():,} test), {len(FEATURES)} features")

    specs = {}
    if args.export:
        import requests
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
        from qa_season_branch_replay import load_specs
        session = requests.Session()
        specs = {region: load_specs(session, region) for region in ("NE", "SE", "USE", "USW")}
        root = Path(__file__).resolve().parents[2]
        fp.load_dotenv(root / ".env")
        fp.load_dotenv(root / ".env.secret")
        humidity = {region: stored_humidity_correction(out, region) for region in specs}
    is_placebo = (cases["species"] == PLACEBO).to_numpy()
    outing = {}
    for continent in ("EU", "US"):
        on = is_placebo & train & (cases["continent"] == continent).to_numpy()
        if on.sum() < MIN_TRAIN_STRATA:
            continue
        outing[continent] = fit(x[on], mask[on], alpha=ALPHA_SHARED)
        log(f"outing model {continent}: {on.sum():,} placebo strata; "
            + ", ".join(f"{f} {b:+.2f}" for f, b in zip(FEATURES, outing[continent])))

    report, coefficients = {}, {"features": FEATURES, "means": means.tolist(), "sds": sds.tolist(),
                                "outing": {c: b.tolist() for c, b in outing.items()}, "species": {}}
    shipped = {}
    for species in sorted(set(cases["species"]) - {PLACEBO}):
        mine = (cases["species"] == species).to_numpy()
        if (mine & train).sum() < MIN_TRAIN_STRATA:
            continue
        shared = fit(x[mine & train], mask[mine & train], alpha=ALPHA_SHARED)
        by_region = {}
        for region in sorted(set(cases.loc[mine, "region"])):
            here = mine & (cases["region"] == region).to_numpy()
            by_region[region] = (fit(x[here & train], mask[here & train], center=shared, alpha=ALPHA_REGION)
                                 if (here & train).sum() >= MIN_REGION_STRATA else shared)
        coefficients["species"][species] = {"shared": shared.tolist(),
                                            "regions": {r: b.tolist() for r, b in by_region.items()}}
        # Both models are ranked on exactly the same days: those today's model has a score for.
        today = baseline_index(scores, cases, species)
        days = mask & np.isfinite(today)
        indices = {"today": np.where(days, today, -np.inf)}
        report[species], pooled = {}, {}
        for region in sorted(by_region):
            here = (cases["region"] == region).to_numpy()
            tc = mine & ~train & here & days[:, 0]
            tp = is_placebo & ~train & here & days[:, 0]
            if tc.sum() < MIN_TEST_STRATA or tp.sum() < MIN_TEST_STRATA:
                continue
            others = mine & train & ~here
            unseen = (fit(x[others], mask[others], alpha=ALPHA_SHARED)
                      if others.sum() >= MIN_TRAIN_STRATA else None)
            indices["fitted"] = x @ by_region[region]
            indices["region_unseen"] = None if unseen is None else x @ unseen
            entry = {"n": int(tc.sum()), "placebo_n": int(tp.sum())}
            first_test_year = (cases["year"] == LAST_TRAIN_YEAR + 1).to_numpy()
            for name, index in indices.items():
                if index is None:
                    continue
                target, placebo = find_day_rank(index[tc], days[tc]), find_day_rank(index[tp], days[tp])
                entry[name] = {"net": round(float(target.mean() - placebo.mean()), 3),
                               "net_ci": bootstrap(target, placebo)}
                c25, p25 = tc & first_test_year, tp & first_test_year
                if c25.sum() >= MIN_TEST_STRATA and p25.sum() >= MIN_TEST_STRATA:
                    entry[name]["net_2025"] = round(float(find_day_rank(index[c25], days[c25]).mean()
                                                          - find_day_rank(index[p25], days[p25]).mean()), 3)
                pooled.setdefault(name, ([], []))
                pooled[name][0].append(target)
                pooled[name][1].append(placebo)
            report[species][region] = entry
            log(f"{species:22s} {region:4s} n={entry['n']:5d}  today {entry['today']['net']:+.3f}  "
                f"fitted {entry['fitted']['net']:+.3f} {entry['fitted']['net_ci']}  unseen region "
                f"{entry['region_unseen']['net'] if 'region_unseen' in entry else float('nan'):+.3f}  "
                f"| 2025 only: today {entry['today'].get('net_2025', float('nan')):+.3f} "
                f"fitted {entry['fitted'].get('net_2025', float('nan')):+.3f}")
        if pooled:
            report[species]["ALL"] = {}
            for name, (target, placebo) in pooled.items():
                target, placebo = np.concatenate(target), np.concatenate(placebo)
                report[species]["ALL"][name] = {"net": round(float(target.mean() - placebo.mean()), 3),
                                                "net_ci": bootstrap(target, placebo), "n": int(len(target))}
            summary = report[species]["ALL"]
            log(f"{species:22s} ALL  n={summary['today']['n']:5d}  today {summary['today']['net']:+.3f}  "
                f"fitted {summary['fitted']['net']:+.3f} {summary['fitted']['net_ci']}")

        by_year = leave_one_year_out(cases, x, mask, mine, is_placebo, days, indices["today"])
        everything = fit(x[mine], mask[mine], alpha=ALPHA_SHARED)
        for region, results in sorted(by_year.items()):
            wins, p, gain = sign_test(results)
            report[species].setdefault(region, {})["by_year"] = {
                "years": len(results), "wins": wins, "p": round(p, 4), "mean_gain": round(gain, 3),
                "per_year": [{"year": y, "today": round(t, 3), "fitted": round(f, 3)} for y, t, f in results]}
            log(f"{species:22s} {region:4s} each year held out: fitted beats today {wins}/{len(results)} "
                f"(p {p:.3f}), mean gain {gain:+.3f}")
            if not ships(results):
                continue
            here = mine & (cases["region"] == region).to_numpy()
            beta = (fit(x[here], mask[here], center=everything, alpha=ALPHA_REGION)
                    if here.sum() >= MIN_REGION_STRATA else everything)
            shipped.setdefault(species, {})[region] = {
                "beta": beta.round(6).tolist(),
                "map": season_maps(table, out, species, region, beta, means, sds, specs, humidity[region])
                if specs else None,
                "each_year_held_out": {"years": len(results), "wins": wins, "p": round(p, 4),
                                       "mean_today": round(float(np.mean([t for _, t, _ in results])), 3),
                                       "mean_fitted": round(float(np.mean([f for _, _, f in results])), 3)},
            }

    (out / "fruiting_fit.json").write_text(json.dumps(coefficients, indent=1), encoding="utf-8")
    if args.export:
        export = {"features": FEATURES, "means": means.round(6).tolist(), "sds": sds.round(6).tolist(),
                  "trained": f"{int(cases['year'].min())}-{int(cases['year'].max())}",
                  "humidity_from_stored": {region: [round(a, 4), round(b, 4)] for region, (a, b) in humidity.items()},
                  "shipped_if": f"beats today's model in more held-out years than chance (sign test p < {SHIP_P}, "
                                f"at least {SHIP_MIN_YEARS} years)",
                  "models": shipped}
        Path(args.export).write_text(json.dumps(export, indent=1) + "\n", encoding="utf-8")
        log(f"shipped {sum(len(r) for r in shipped.values())} species-regions to {args.export}: "
            + "; ".join(f"{s} {', '.join(r)}" for s, r in sorted(shipped.items())))
    (out / "fruiting_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    log(f"wrote {out / 'fruiting_fit.json'} and {out / 'fruiting_report.json'}")


if __name__ == "__main__":
    main()

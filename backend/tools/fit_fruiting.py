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
close to it. Fits use 2016-2024 only. 2025-2026 is scored with the rank test of
scripts/qa_weather_skill.py, next to today's model on the very same days, and each region
is also scored by a fit that never saw it. 2025 is reported on its own as well: some
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
    flat = x[train][mask[train]]
    means, sds = flat.mean(axis=0), flat.std(axis=0)
    x = np.where(mask[..., None], (x - means) / sds, 0.0)
    log(f"{len(cases):,} strata ({train.sum():,} train, {(~train).sum():,} test), {len(FEATURES)} features")

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
            # Ship only where the fit's whole 95% interval is above today's score. Its index is
            # then mapped onto today's weather part through their quantiles on the training
            # days, so the score keeps its scale and only its order changes.
            if entry["fitted"]["net_ci"][0] > entry["today"]["net"]:
                rows = mine & train & here
                eta = (x[rows] @ by_region[region])[days[rows]]
                part = today[rows][days[rows]]
                shipped.setdefault(species, {})[region] = {
                    "beta": by_region[region].round(6).tolist(),
                    "map": {"eta": np.quantile(eta, MAP_QUANTILES).round(6).tolist(),
                            "weather_part": np.quantile(part, MAP_QUANTILES).round(6).tolist()},
                    "test_2025_2026": {"today": entry["today"]["net"], "fitted": entry["fitted"]["net"],
                                       "fitted_ci": entry["fitted"]["net_ci"], "cases": entry["n"]},
                }
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

    (out / "fruiting_fit.json").write_text(json.dumps(coefficients, indent=1), encoding="utf-8")
    if args.export:
        export = {"features": FEATURES, "means": means.round(6).tolist(), "sds": sds.round(6).tolist(),
                  "trained": f"2016-{LAST_TRAIN_YEAR}", "tested": f"{LAST_TRAIN_YEAR + 1}-",
                  "models": shipped}
        Path(args.export).write_text(json.dumps(export, indent=1) + "\n", encoding="utf-8")
        log(f"shipped {sum(len(r) for r in shipped.values())} species-regions to {args.export}: "
            + "; ".join(f"{s} {', '.join(r)}" for s, r in sorted(shipped.items())))
    (out / "fruiting_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    log(f"wrote {out / 'fruiting_fit.json'} and {out / 'fruiting_report.json'}")


if __name__ == "__main__":
    main()

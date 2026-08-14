"""Retest the season fix on the full April-August production grid.

Production score = weather_side * old_multiplier, and the multiplier is reproducible from
the published curves, so the weather side can be recovered exactly and re-combined with
the new season handling:

    fixed = weather_side * new_multiplier * gate

The deployed curves are `0.6 + 0.4 * ratio`, so the uncompressed ratio the gate needs can
be inverted straight out of them -- no GBIF refetch, and the whole 2026-04-12..08-20
window stays available instead of the 42-day-lag-limited replay window. That matters
because dead months for the autumn species only exist in April and May.

This isolates the seasonality change. The aggregator change (geometric_share) affects the
weather side and is measured separately by the replay script.
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import seasonality as sn
from qa_gbif_scores import PARAM_URLS, REGION_CURVE_URLS, ZONE_CURVE_URLS
from qa_season_analysis import (
    CLIMATOLOGY_YEARS, GOOD_SCORE, MIN_CLIMATOLOGY_RECORDS, ONSET_FRACTION,
    crossing_date, daily_observed_rate, month_labels, monthly_rate, within_location_auc,
)
from qa_season_scan import FUNGI

# What the deployed curves were compressed with, needed to invert them.
DEPLOYED_LOW, DEPLOYED_HIGH = 0.6, 1.0
NEW_LOW, NEW_HIGH = 0.2, 1.0
LABEL = {"mushroom": "Porcini", "chant": "Chanterelle", "black_chant": "Black chanterelle",
         "parasol": "Parasol", "morel": "Morel", "st_george": "St George's"}


def load_specs(session: requests.Session, region: str) -> tuple[dict, dict, dict]:
    response = session.get(PARAM_URLS[region], timeout=60)
    response.raise_for_status()
    tree = ast.parse(response.text)
    assignment = next(
        node for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "species_params" for t in node.targets)
    )
    all_params = ast.literal_eval(assignment.value)
    region_curves = session.get(REGION_CURVE_URLS[region], timeout=60).json()
    zone_curves = session.get(ZONE_CURVE_URLS[region], timeout=60).json()
    params = {species: dict(all_params[species]) for species in FUNGI}
    return params, region_curves, zone_curves


def invert(curve: dict) -> dict:
    """Recover the uncompressed monthly ratio from a deployed [0.6, 1.0] curve."""
    span = DEPLOYED_HIGH - DEPLOYED_LOW
    return {int(m): max(0.0, (float(v) - DEPLOYED_LOW) / span) for m, v in curve.items()}


def season_terms(region: str, species: str, dates: list[str], zones: list[str],
                 params: dict, region_curves: dict, zone_curves: dict) -> pd.DataFrame:
    """Per (date, zone): the deployed multiplier, the new multiplier, and the new gate."""
    grid = pd.MultiIndex.from_product([dates, zones], names=["date", "climate_zone"]).to_frame(index=False)
    frame = pd.DataFrame({"Date": pd.to_datetime(grid.date), "climate_zone": grid.climate_zone})
    spec = dict(params[species])

    deployed_spec = dict(spec)
    if species in region_curves:
        deployed_spec["season_curve"] = region_curves[species]
    old_multiplier = sn.season_multiplier_for_species(frame, species, deployed_spec, zone_curves)

    # Same curves, re-expressed in the two-part schema so the gate can see the ratio.
    fixed_spec = dict(spec)
    if species in region_curves:
        ratio = invert(region_curves[species])
        fixed_spec["season_curve"] = {
            "multiplier": {m: NEW_LOW + (NEW_HIGH - NEW_LOW) * r for m, r in ratio.items()},
            "ratio": ratio,
        }
    fixed_zone_curves = {}
    for zone, species_map in zone_curves.items():
        if species not in species_map:
            fixed_zone_curves[zone] = {}
            continue
        ratio = invert(species_map[species])
        fixed_zone_curves[zone] = {species: {
            "multiplier": {m: NEW_LOW + (NEW_HIGH - NEW_LOW) * r for m, r in ratio.items()},
            "ratio": ratio,
        }}
    new_multiplier = sn.season_multiplier_for_species(frame, species, fixed_spec, fixed_zone_curves)
    gate = sn.season_gate_for_species(frame, species, fixed_spec, fixed_zone_curves)

    return grid.assign(old_multiplier=old_multiplier, new_multiplier=new_multiplier, gate=gate)


def evaluate(frame: pd.DataFrame, column: str, in_season: set, dead: set) -> dict:
    labelled = frame[frame.month.isin(in_season | dead)].copy()
    labelled["in_season"] = labelled.month.isin(in_season)
    if labelled.in_season.nunique() < 2:
        return {}
    auc, _ = within_location_auc(labelled, column)
    inside = labelled[labelled.in_season][column]
    outside = labelled[~labelled.in_season][column]
    return {
        "auc": None if auc is None else round(auc, 3),
        "median_in": round(float(inside.median()), 2),
        "median_dead": round(float(outside.median()), 2),
        "share_ge4_in": round(float((inside >= GOOD_SCORE).mean()), 3),
        "share_ge4_dead": round(float((outside >= GOOD_SCORE).mean()), 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--truth", default="docs/qa/season-truth-2026/gbif-season-truth.json")
    parser.add_argument("--scan", default="docs/qa/season-timing-2026")
    parser.add_argument("--regions", default="NE,SE,USE,USW")
    parser.add_argument("--gate-off", type=float, default=sn.GATE_OFF,
                        help="gate fully closed at or below this fraction of peak rate")
    parser.add_argument("--gate-full", type=float, default=sn.GATE_FULL,
                        help="gate fully open at or above this fraction of peak rate")
    args = parser.parse_args()
    # The gate thresholds are the calibration knob: too aggressive and the season starts
    # late, too soft and dead months leak back in. Sweeping them is the point.
    sn.GATE_OFF, sn.GATE_FULL = args.gate_off, args.gate_full
    print(f"gate thresholds: off={sn.GATE_OFF} full={sn.GATE_FULL}", flush=True)
    scan = Path(args.scan)
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season simulation"

    results = {}
    for region in args.regions.split(","):
        path = scan / f"grid-cell-days-{region}.parquet"
        if not path.exists():
            print(f"skip {region}: {path} missing", flush=True)
            continue
        grid = pd.read_parquet(path)
        grid["Date"] = pd.to_datetime(grid.date)
        grid["month"] = grid.Date.dt.month
        params, region_curves, zone_curves = load_specs(session, region)
        dates = sorted(grid.date.unique())
        zones = sorted(grid.climate_zone.dropna().unique())
        print(f"{region}: {len(grid):,} cell-days, {grid.Location_Id.nunique():,} locations", flush=True)

        results[region] = {}
        for species in FUNGI:
            score_column = f"{species}_score"
            if score_column not in grid.columns:
                continue
            records = sum(sum(truth["climatology_monthly"][region][species][y].values())
                          for y in CLIMATOLOGY_YEARS)
            if records < MIN_CLIMATOLOGY_RECORDS:
                continue
            rates = monthly_rate(truth, region, species)
            if not np.isfinite(rates).any():
                continue
            in_season, dead = month_labels(rates)

            allowed = params[species].get("climate_zones", [])
            frame = grid[grid.climate_zone.isin(allowed)] if allowed else grid
            if frame.empty:
                continue
            terms = season_terms(region, species, dates, zones, params, region_curves, zone_curves)
            frame = frame.merge(terms, on=["date", "climate_zone"], how="left")

            weather = np.clip(frame[score_column] / frame.old_multiplier.replace(0, np.nan), 0, 10)
            frame["production"] = frame[score_column]
            frame["fixed"] = weather * frame.new_multiplier * frame.gate
            # Isolate the two halves of the season change.
            frame["floor_only"] = weather * frame.new_multiplier
            frame["gate_only"] = weather * frame.old_multiplier * frame.gate

            entry = {
                "climatology_records": int(records),
                "in_season_months": sorted(in_season),
                "dead_months": sorted(dead),
                "variants": {
                    name: evaluate(frame, name, in_season, dead)
                    for name in ("production", "floor_only", "gate_only", "fixed")
                },
            }

            daily = frame.groupby("Date").agg(
                production=("production", "median"), floor_only=("floor_only", "median"),
                gate_only=("gate_only", "median"), fixed=("fixed", "median"))
            observed = daily_observed_rate(truth, region, species).reindex(daily.index)
            observed_onset = crossing_date(observed.rate_smooth, ONSET_FRACTION)
            entry["onset"] = {
                "observed": observed_onset.date().isoformat() if observed_onset is not None else None,
                "censored": bool(observed_onset is not None and observed_onset == daily.index[0]),
            }
            for name in ("production", "floor_only", "gate_only", "fixed"):
                above = daily.index[daily[name] >= GOOD_SCORE]
                reached = above[0] if len(above) else None
                entry["onset"][name] = reached.date().isoformat() if reached is not None else None
                entry["onset"][f"{name}_share_of_window_ge4"] = round(
                    float((daily[name] >= GOOD_SCORE).mean()), 3)
                if reached is not None and observed_onset is not None:
                    entry["onset"][f"{name}_error_days"] = int((reached - observed_onset).days)
            results[region][species] = entry

    (scan / "season-simulation.json").write_text(json.dumps(results, indent=2), encoding="utf-8")

    print(f"\n{'reg':4s} {'species':12s} | {'variant':11s} {'AUC':>6s} {'med_in':>7s} {'med_dd':>7s} "
          f"{'>=4 in':>7s} {'>=4 DEAD':>9s}")
    for region, species_map in results.items():
        for species, entry in species_map.items():
            for name, values in entry["variants"].items():
                if not values:
                    continue
                head = f"{region:4s} {LABEL.get(species, species):12s}" if name == "production" else " " * 17
                print(f"{head} | {name:11s} {values['auc']:6.3f} {values['median_in']:7.2f} "
                      f"{values['median_dead']:7.2f} {values['share_ge4_in'] * 100:6.0f}% "
                      f"{values['share_ge4_dead'] * 100:8.0f}%")
    print(f"\nwrote {scan / 'season-simulation.json'}")


if __name__ == "__main__":
    main()

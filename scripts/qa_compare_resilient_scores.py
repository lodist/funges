"""Paired historical QA: production scores versus the resilient-scoring branch.

Replays the branch algorithm from stored R2 weather, then evaluates old and new
scores against the exact same cached GBIF target/background cohort.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import math
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import fsspec
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import requests
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from forecast_pipeline import calculate_mushroom_score, spatial_smooth_scores

from qa_gbif_observer_background import TARGETS, weighted_percentile
from qa_gbif_scores import PARAM_URLS, REGION_CURVE_URLS, REGIONS, ZONE_CURVE_URLS, chord_to_km, unit_xyz


RAW_COLUMNS = [
    "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)",
    "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)",
    "Temperature (C)", "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
]
LAG_COLUMNS = ["Temperature (C)", "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)"]


def load_model_specs(session: requests.Session, region: str) -> tuple[dict, dict]:
    response = session.get(PARAM_URLS[region], timeout=60)
    response.raise_for_status()
    tree = ast.parse(response.text)
    assignment = next(
        node for node in tree.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "species_params" for target in node.targets)
    )
    all_params = ast.literal_eval(assignment.value)
    region_curves = session.get(REGION_CURVE_URLS[region], timeout=60).json()
    zone_curves = session.get(ZONE_CURVE_URLS[region], timeout=60).json()
    params = {}
    for species in TARGETS:
        spec = dict(all_params[species])
        if species in region_curves:
            spec["season_curve"] = region_curves[species]
        params[species] = spec
    return params, zone_curves


def read_coordinates(parquet: pq.ParquetFile) -> pd.DataFrame:
    pieces = []
    for batch in parquet.iter_batches(columns=["Location_Id", "Latitude", "Longitude"]):
        pieces.append(batch.to_pandas().drop_duplicates("Location_Id"))
    return pd.concat(pieces, ignore_index=True).drop_duplicates("Location_Id").reset_index(drop=True)


def scoring_pairs_with_neighbours(
    desired: pd.DataFrame, coordinates: pd.DataFrame, neighbours: int = 5
) -> pd.DataFrame:
    coordinate_index = coordinates.set_index("Location_Id")
    missing = sorted(set(desired.Location_Id) - set(coordinate_index.index))
    if missing:
        raise RuntimeError(f"{len(missing)} requested production locations are absent from R2")
    source = coordinate_index.loc[desired.Location_Id.drop_duplicates()]
    tree = cKDTree(unit_xyz(coordinates.Latitude.to_numpy(), coordinates.Longitude.to_numpy()))
    _, near = tree.query(unit_xyz(source.Latitude.to_numpy(), source.Longitude.to_numpy()), k=neighbours)
    neighbourhood = {
        location: coordinates.iloc[np.atleast_1d(indices)].Location_Id.tolist()
        for location, indices in zip(source.index, near)
    }
    pairs = set()
    for row in desired.itertuples(index=False):
        for location in neighbourhood[row.Location_Id]:
            pairs.add((location, pd.Timestamp(row.Date).normalize()))
    return pd.DataFrame(sorted(pairs), columns=["Location_Id", "Date"])


def read_selected_history(
    parquet: pq.ParquetFile, locations: set[str], history_start: pd.Timestamp, end: pd.Timestamp
) -> pd.DataFrame:
    pieces = []
    for batch_number, batch in enumerate(parquet.iter_batches(columns=RAW_COLUMNS), start=1):
        frame = batch.to_pandas()
        frame["Date"] = pd.to_datetime(frame["Date"]).dt.normalize()
        frame = frame[
            frame.Location_Id.isin(locations)
            & frame.Date.between(history_start, end)
        ]
        if not frame.empty:
            pieces.append(frame)
        if batch_number % 25 == 0:
            print(f"  scanned {batch_number}/{parquet.num_row_groups} batches", flush=True)
    if not pieces:
        raise RuntimeError("No matching history rows found")
    return (
        pd.concat(pieces, ignore_index=True)
        .drop_duplicates(["Location_Id", "Date"], keep="last")
        .sort_values(["Location_Id", "Date"])
    )


def add_lags(scoring: pd.DataFrame, history: pd.DataFrame, days: int = 42) -> pd.DataFrame:
    scoring = scoring.copy().set_index(["Location_Id", "Date"])
    history = history.set_index(["Location_Id", "Date"]).sort_index()
    scoring = scoring.join(history, how="left")
    locations = scoring.index.get_level_values("Location_Id").to_numpy()
    dates = scoring.index.get_level_values("Date")
    lag_data = {}
    for column in LAG_COLUMNS:
        lookup = history[column]
        for day in range(1, days + 1):
            target = pd.MultiIndex.from_arrays(
                [locations, dates - pd.Timedelta(days=day)], names=["Location_Id", "Date"]
            )
            lag_data[f"{column}_{day}days_ago"] = lookup.reindex(target).to_numpy()
    return pd.concat([scoring.reset_index(), pd.DataFrame(lag_data)], axis=1)


def replay_region(
    region: str, desired: pd.DataFrame, start: str, end: str, session: requests.Session
) -> tuple[pd.DataFrame, dict]:
    print(f"{region}: loading production coordinates", flush=True)
    fs = fsspec.filesystem("https")
    url = REGIONS[region][0]
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        coordinates = read_coordinates(parquet)
        scoring_pairs = scoring_pairs_with_neighbours(desired, coordinates)
        history_start = pd.Timestamp(start) - pd.Timedelta(days=42)
        print(
            f"{region}: replaying {len(scoring_pairs):,} location-days at "
            f"{scoring_pairs.Location_Id.nunique():,} locations",
            flush=True,
        )
        history = read_selected_history(
            parquet, set(scoring_pairs.Location_Id), history_start, pd.Timestamp(end)
        )

    scoring = add_lags(scoring_pairs, history)
    params, zone_curves = load_model_specs(session, region)
    scoring = calculate_mushroom_score(scoring, params, zone_curves)
    score_columns = [f"{species}_score" for species in TARGETS]
    scoring = spatial_smooth_scores(scoring, score_columns)
    for species, spec in params.items():
        allowed = spec.get("climate_zones", [])
        if allowed:
            scoring.loc[~scoring.climate_zone.isin(allowed), f"{species}_score"] = 0.0

    wanted = desired.merge(scoring, on=["Location_Id", "Date"], how="left")
    return wanted, {
        "r2_url": url,
        "grid_points": len(coordinates),
        "replayed_location_days": len(scoring_pairs),
        "history_rows": len(history),
    }


def compare(background: pd.DataFrame, targets: pd.DataFrame) -> tuple[list[dict], list[dict]]:
    controls_by_day = defaultdict(list)
    for row in background.to_dict("records"):
        controls_by_day[row["date"]].append({
            "scores": {species: row.get(f"new_{species}_score") for species in TARGETS},
            "sample_weight": row["sample_weight"],
        })

    detail = []
    for row in targets.to_dict("records"):
        species = row["species_id"]
        new_score = row.get(f"new_{species}_score")
        if new_score is None or not math.isfinite(new_score):
            continue
        new_percentile = weighted_percentile(new_score, controls_by_day[row["date"]], species)
        detail.append({
            **row,
            "old_score": row["score"],
            "new_score": new_score,
            "score_delta": new_score - row["score"],
            "old_percentile": row["effort_percentile"],
            "new_percentile": new_percentile,
            "percentile_delta": new_percentile - row["effort_percentile"] if new_percentile is not None else np.nan,
        })

    summary = []
    detail_frame = pd.DataFrame(detail)
    for species, (label, _) in TARGETS.items():
        group = detail_frame[detail_frame.species_id == species]
        # A hit rate on target cells means nothing without the same rate on background
        # cells: if a change lifts the whole distribution, "95% of finds score >=4" can
        # rise while the score's ability to discriminate is flat or worse. These two
        # columns are the false-positive side of every hit-rate claim.
        background_old = background[f"{species}_score"] if f"{species}_score" in background else pd.Series(dtype=float)
        background_new = background[f"new_{species}_score"] if f"new_{species}_score" in background else pd.Series(dtype=float)
        summary.append({
            "species_id": species,
            "label": label,
            "n": len(group),
            "old_auc": group.old_percentile.mean() if len(group) else np.nan,
            "new_auc": group.new_percentile.mean() if len(group) else np.nan,
            "auc_delta": group.percentile_delta.mean() if len(group) else np.nan,
            "old_median_score": group.old_score.median() if len(group) else np.nan,
            "new_median_score": group.new_score.median() if len(group) else np.nan,
            "median_score_delta": group.score_delta.median() if len(group) else np.nan,
            "old_hit_ge_4": (group.old_score >= 4).mean() if len(group) else np.nan,
            "new_hit_ge_4": (group.new_score >= 4).mean() if len(group) else np.nan,
            "old_background_ge_4": (background_old >= 4).mean() if len(background_old) else np.nan,
            "new_background_ge_4": (background_new >= 4).mean() if len(background_new) else np.nan,
            "old_hit_lift": ((group.old_score >= 4).mean() - (background_old >= 4).mean()
                             if len(group) and len(background_old) else np.nan),
            "new_hit_lift": ((group.new_score >= 4).mean() - (background_new >= 4).mean()
                             if len(group) and len(background_new) else np.nan),
        })
    return detail, summary


def render_report(summary: pd.DataFrame, result: dict) -> str:
    rows = []
    for row in summary.itertuples(index=False):
        rows.append(
            f"| {row.label} | {row.n} | {row.old_auc:.3f} | {row.new_auc:.3f} | "
            f"{row.auc_delta:+.3f} | {row.old_median_score:.2f} | "
            f"{row.new_median_score:.2f} | {row.old_hit_ge_4:.1%} | "
            f"{row.new_hit_ge_4:.1%} |"
        )
    region_rows = "\n".join(
        f"| {region} | {entry['target_cell_days']} | {entry['old_auc']:.3f} | "
        f"{entry['new_auc']:.3f} | {entry['new_auc'] - entry['old_auc']:+.3f} | "
        f"{entry['day_bootstrap_ci']['delta'][0]:+.3f} to "
        f"{entry['day_bootstrap_ci']['delta'][1]:+.3f} |"
        for region, entry in result["region_auc"].items()
    )
    start, end = result["period"]
    return f"""# Resilient scorer observer-background ablation

Period: **{start} through {end}**.

## Verdict

Across the primary Porcini, Chanterelle, and Parasol cohort, the resilient scorer changes
the same-day European fungal-observer AUC from **{result['old_primary_auc']:.3f}** to
**{result['new_primary_auc']:.3f}** ({result['primary_auc_delta']:+.3f}). This is a small
overall ranking improvement (paired day-bootstrap 95% CI for the change
**{result['day_bootstrap_ci']['delta'][0]:+.3f} to
{result['day_bootstrap_ci']['delta'][1]:+.3f}**), with the material gain concentrated in
southern Europe.

| Region | Target cell-days | Previous AUC | Current AUC | Change | 95% CI for change |
| --- | ---: | ---: | ---: | ---: | ---: |
{region_rows}

## Species results

| Species | n | Old AUC | New AUC | Change | Old median | New median | Old ≥4 | New ≥4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

Scores and threshold hit rates rise more than ranking quality. That should not be read as
an equally large discrimination gain: the background threshold rates also move. AUC is
the primary comparison here.

The former rectangular “Spain” subsection has been replaced by the country-coded
[observer-background geography audit](../spatial-observer-background/macro-region-report.md).
That audit separates southern, central, and northern Spain and reports same-day
within-country ranks.

## Method

- The exact target and fungal-observer controls from the observer-background cohort are
  retained.
- The current resilient algorithm is replayed from production weather history at those
  same location-days, including spatial smoothing.
- Old and new percentiles therefore use identical observations and same-day controls.
- This remains presence-background QA, not presence/absence validation.
"""


def paired_day_bootstrap(
    detail: pd.DataFrame, iterations: int = 10_000, seed: int = 20260828
) -> dict:
    daily = detail.groupby("date").agg(
        old_sum=("old_percentile", "sum"),
        new_sum=("new_percentile", "sum"),
        n=("date", "size"),
    )
    if len(daily) < 2:
        return {"old": None, "new": None, "delta": None}
    rng = np.random.default_rng(seed)
    sampled = rng.integers(0, len(daily), size=(iterations, len(daily)))
    counts = daily.n.to_numpy()[sampled].sum(axis=1)
    old = daily.old_sum.to_numpy()[sampled].sum(axis=1) / counts
    new = daily.new_sum.to_numpy()[sampled].sum(axis=1) / counts

    def interval(values: np.ndarray) -> list[float]:
        low, high = np.quantile(values, [0.025, 0.975])
        return [float(low), float(high)]

    return {"old": interval(old), "new": interval(new), "delta": interval(new - old)}


def enrich_uncertainty(result: dict, detail: pd.DataFrame) -> dict:
    primary = detail[detail.species_id.isin(result["primary_species"])]
    result["day_bootstrap_ci"] = paired_day_bootstrap(primary)
    for region, entry in result["region_auc"].items():
        entry["day_bootstrap_ci"] = paired_day_bootstrap(
            primary[primary.region.eq(region)]
        )
    return result


def write_report(output: Path, enrich: bool = False) -> None:
    summary = pd.read_csv(output / "species-comparison.csv")
    result = json.loads((output / "summary.json").read_text(encoding="utf-8"))
    if enrich:
        detail = pd.read_csv(output / "matched-target-comparison.csv")
        result = enrich_uncertainty(result, detail)
        (output / "summary.json").write_text(
            json.dumps(result, indent=2), encoding="utf-8"
        )
    (output / "scorer-ablation-report.md").write_text(
        render_report(summary, result), encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        default="docs/qa/model-evaluation-2026/spatial-observer-background",
    )
    parser.add_argument(
        "--output",
        default="docs/qa/model-evaluation-2026/resilient-score-ablation",
    )
    parser.add_argument("--start", default="2026-06-01")
    parser.add_argument("--end", default="2026-08-27")
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    source, output = Path(args.source), Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        write_report(output, enrich=True)
        return
    background = pd.read_csv(source / "fungal-observer-background.csv")
    targets = pd.read_csv(source / "matched-targets.csv")
    for frame in (background, targets):
        frame["Date"] = pd.to_datetime(frame.pop("date")).dt.normalize()
        frame["Location_Id"] = frame.pop("location_id")

    session = requests.Session()
    session.headers["User-Agent"] = "fung.es resilient-score replay QA"
    metadata = {}
    replayed = []
    all_requested = pd.concat(
        [background[["region", "Location_Id", "Date"]], targets[["region", "Location_Id", "Date"]]],
        ignore_index=True,
    ).drop_duplicates()
    for region in ("NE", "SE"):
        requested = all_requested[all_requested.region == region].drop(columns="region")
        result, metadata[region] = replay_region(region, requested, args.start, args.end, session)
        result["region"] = region
        replayed.append(result)
    scores = pd.concat(replayed, ignore_index=True)
    rename = {f"{species}_score": f"new_{species}_score" for species in TARGETS}
    score_lookup = scores[["region", "Location_Id", "Date", *rename]].rename(columns=rename)
    background = background.merge(score_lookup, on=["region", "Location_Id", "Date"], how="left")
    targets = targets.merge(score_lookup, on=["region", "Location_Id", "Date"], how="left")
    for frame in (background, targets):
        frame["date"] = frame.Date.dt.strftime("%Y-%m-%d")

    detail, summary = compare(background, targets)
    detail_frame, summary_frame = pd.DataFrame(detail), pd.DataFrame(summary)
    background.to_csv(output / "background-comparison.csv", index=False)
    detail_frame.to_csv(output / "matched-target-comparison.csv", index=False)
    summary_frame.to_csv(output / "species-comparison.csv", index=False)

    primary_species = {"mushroom", "parasol", "chant"}
    primary = detail_frame[detail_frame.species_id.isin(primary_species)]
    region_auc = {
        region: {
            "target_cell_days": int(len(group)),
            "old_auc": float(group.old_percentile.mean()),
            "new_auc": float(group.new_percentile.mean()),
        }
        for region, group in primary.groupby("region")
    }
    result = {
        "period": [args.start, args.end],
        "cohort": {"background_cell_days": len(background), "target_cell_days": len(targets)},
        "primary_species": sorted(primary_species),
        "old_primary_auc": float(primary.old_percentile.mean()),
        "new_primary_auc": float(primary.new_percentile.mean()),
        "primary_auc_delta": float(primary.percentile_delta.mean()),
        "region_auc": region_auc,
        "background_ge_4": {
            species: {
                "old": float((background[f"{species}_score"] >= 4).mean()),
                "new": float((background[f"new_{species}_score"] >= 4).mean()),
            }
            for species in sorted(primary_species)
            if f"{species}_score" in background and f"new_{species}_score" in background
        },
        "regions": metadata,
    }
    result = enrich_uncertainty(result, detail_frame)
    (output / "summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    write_report(output)
    print(summary_frame.to_string(index=False, float_format=lambda value: f"{value:.3f}"))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

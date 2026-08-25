"""Score the same replayed weather with main's scorer and this branch's scorer.

The committed paired QA compares stored production scores against replayed branch
scores. That leaves the scoring code and the weather vintage varying together. Here
both versions run over one identical frame, so any difference is the algorithm.

main's scorer derives its rain window from the number of precipitation lag columns
present, and never used wind lags, so it is handed a 21-day frame and the branch a
42-day frame -- that is what each version actually ran in production.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import fsspec
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import requests
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from funges_backend import forecast_pipeline as branch_pipeline
from qa_gbif_scores import PARAM_URLS, REGION_CURVE_URLS, REGIONS, ZONE_CURVE_URLS
from qa_season_scan import FUNGI, chord_to_km, multiplier_table, unit_xyz

RAW_COLUMNS = [
    "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)", "Pressure (hPa)",
    "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)", "Temperature (C)",
    "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
]
MAIN_LAG_COLUMNS = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
BRANCH_LAG_COLUMNS = [*MAIN_LAG_COLUMNS, "Wind Speed (m/s)"]
MAIN_LAG_DAYS = 21
BRANCH_LAG_DAYS = 42
SEED_LOCATIONS = 1200
NEIGHBOURS = 5


def load_main_pipeline() -> object:
    """Import backend/forecast_pipeline.py as it exists on main, alongside the branch copy."""
    source = subprocess.run(
        ["git", "show", "main:backend/forecast_pipeline.py"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout
    path = Path(tempfile.mkdtemp()) / "main_forecast_pipeline.py"
    path.write_text(source, encoding="utf-8")
    spec = importlib.util.spec_from_file_location("main_forecast_pipeline", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["main_forecast_pipeline"] = module
    spec.loader.exec_module(module)
    return module


def load_specs(session: requests.Session, region: str) -> tuple[dict, dict]:
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
    params = {}
    for species in FUNGI:
        spec = dict(all_params[species])
        if species in region_curves:
            spec["season_curve"] = region_curves[species]
        params[species] = spec
    return params, zone_curves


def add_lags(frame: pd.DataFrame, columns: list[str], days: int) -> pd.DataFrame:
    frame = frame.sort_values(["Location_Id", "Date"]).reset_index(drop=True)
    indexed = frame.set_index(["Location_Id", "Date"])
    locations = frame.Location_Id.to_numpy()
    dates = frame.Date
    lag_data = {}
    for column in columns:
        if column not in indexed.columns:
            continue
        lookup = indexed[column]
        lookup = lookup[~lookup.index.duplicated(keep="last")]
        for day in range(1, days + 1):
            target = pd.MultiIndex.from_arrays(
                [locations, dates - pd.Timedelta(days=day)], names=["Location_Id", "Date"]
            )
            lag_data[f"{column}_{day}days_ago"] = lookup.reindex(target).to_numpy()
    return pd.concat([frame, pd.DataFrame(lag_data)], axis=1)


def apply_zone_exclusions(frame: pd.DataFrame, params: dict) -> pd.DataFrame:
    for species, spec in params.items():
        allowed = spec.get("climate_zones", [])
        if allowed:
            frame.loc[~frame.climate_zone.isin(allowed), f"{species}_score"] = 0.0
    return frame


def replay_region(region: str, session: requests.Session, main_pipeline: object,
                  first_scored: str) -> tuple[pd.DataFrame, dict]:
    url = REGIONS[region][0]
    fs = fsspec.filesystem("https")
    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        pieces = []
        for batch in parquet.iter_batches(columns=["Location_Id", "Latitude", "Longitude"]):
            pieces.append(batch.to_pandas().drop_duplicates("Location_Id"))
        coordinates = (
            pd.concat(pieces, ignore_index=True)
            .drop_duplicates("Location_Id").reset_index(drop=True)
        )
        modulus = max(1, round(len(coordinates) / SEED_LOCATIONS))
        digest = coordinates.Location_Id.astype(str).map(
            lambda value: int(hashlib.blake2b(value.encode(), digest_size=8).hexdigest(), 16)
        )
        seeds = coordinates[(digest % modulus == 0).to_numpy()].reset_index(drop=True)
        # Pull each seed's real neighbours too, so branch smoothing sees the same
        # neighbourhood production would have seen.
        tree = cKDTree(unit_xyz(coordinates.Latitude.to_numpy(), coordinates.Longitude.to_numpy()))
        _, near = tree.query(unit_xyz(seeds.Latitude.to_numpy(), seeds.Longitude.to_numpy()),
                             k=NEIGHBOURS)
        wanted = set(coordinates.iloc[np.unique(near).ravel()].Location_Id)
        print(f"{region}: {len(seeds):,} seed locations, {len(wanted):,} with neighbours", flush=True)

        rows = []
        for number, batch in enumerate(parquet.iter_batches(columns=RAW_COLUMNS), start=1):
            frame = batch.to_pandas()
            frame["Date"] = pd.to_datetime(frame["Date"]).dt.normalize()
            hit = frame[frame.Location_Id.isin(wanted)]
            if not hit.empty:
                rows.append(hit)
            if number % 4 == 0:
                print(f"  {region}: {number}/{parquet.num_row_groups} row groups", flush=True)

    history = (
        pd.concat(rows, ignore_index=True)
        .drop_duplicates(["Location_Id", "Date"], keep="last")
        .sort_values(["Location_Id", "Date"])
        .reset_index(drop=True)
    )
    params, zone_curves = load_specs(session, region)
    score_columns = [f"{species}_score" for species in FUNGI]
    cutoff = pd.Timestamp(first_scored)

    main_frame = add_lags(history, MAIN_LAG_COLUMNS, MAIN_LAG_DAYS)
    main_frame = main_frame[main_frame.Date >= cutoff].reset_index(drop=True)
    main_scored = main_pipeline.calculate_mushroom_score(main_frame.copy(), params, zone_curves)
    main_scored = apply_zone_exclusions(main_scored, params)

    branch_frame = add_lags(history, BRANCH_LAG_COLUMNS, BRANCH_LAG_DAYS)
    branch_frame = branch_frame[branch_frame.Date >= cutoff].reset_index(drop=True)
    branch_scored = branch_pipeline.calculate_mushroom_score(branch_frame.copy(), params, zone_curves)
    branch_scored = branch_pipeline.spatial_smooth_scores(branch_scored, score_columns)
    branch_scored = apply_zone_exclusions(branch_scored, params)

    keep = ["Location_Id", "Date", "Latitude", "Longitude", "climate_zone"]
    combined = main_scored[keep + score_columns].rename(
        columns={column: f"main_{column}" for column in score_columns}
    ).merge(
        branch_scored[["Location_Id", "Date", *score_columns]].rename(
            columns={column: f"branch_{column}" for column in score_columns}
        ),
        on=["Location_Id", "Date"], how="inner",
    )
    combined = combined[combined.Location_Id.isin(set(seeds.Location_Id))].reset_index(drop=True)
    combined["date"] = combined.Date.dt.strftime("%Y-%m-%d")
    combined["region"] = region
    multipliers = multiplier_table(
        params, zone_curves, sorted(combined.date.unique()),
        sorted(combined.climate_zone.dropna().unique()),
    )
    combined = combined.merge(multipliers, on=["date", "climate_zone"], how="left")
    return combined, {
        "grid_points": int(len(coordinates)), "seed_locations": int(len(seeds)),
        "locations_read": int(len(wanted)), "history_rows": int(len(history)),
        "scored_cell_days": int(len(combined)),
        "first_scored_date": first_scored,
        "dates": [combined.date.min(), combined.date.max()],
        "source_url": url,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    # The parquet history starts 2026-04-12, so 42 full lag days first exist on 2026-05-24.
    parser.add_argument("--first-scored", default="2026-05-24")
    parser.add_argument("--output", default="docs/qa/season-timing-2026")
    parser.add_argument("--regions", default="NE,SE")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    main_pipeline = load_main_pipeline()
    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season-timing branch replay"
    metadata = {}
    for region in args.regions.split(","):
        frame, metadata[region] = replay_region(region, session, main_pipeline, args.first_scored)
        frame.to_parquet(output / f"branch-replay-{region}.parquet", index=False)
        print(json.dumps({region: metadata[region]}, indent=2), flush=True)
    (output / "branch-replay-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

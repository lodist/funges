"""One pass over each production score parquet, extracting what season-timing QA needs.

Production scores are exactly `weather_side * season_multiplier(date, zone)`, and the
multiplier is reproducible from the published curves. This script therefore stores both
the published score and the reconstructed multiplier so the weather model can be
evaluated separately from the GBIF-derived climatology it is multiplied by.

Outputs (per region, into --output):
  grid-cell-days.parquet    deterministic location subsample, all dates, all fungal scores
  observation-scores.csv    nearest production score for every enumerated GBIF record
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import sys
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
from seasonality import season_multiplier_for_species

from qa_gbif_scores import PARAM_URLS, REGION_CURVE_URLS, REGIONS, ZONE_CURVE_URLS

FUNGI = ["mushroom", "chant", "black_chant", "parasol", "morel", "st_george", "truffle_b"]
SCORE_COLUMNS = [f"{species}_score" for species in FUNGI]
TARGET_LOCATIONS = 6000
MAX_MATCH_KM = 30
EARTH_KM = 6371.0088


def unit_xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat_r, lon_r = np.radians(lat), np.radians(lon)
    return np.column_stack(
        [np.cos(lat_r) * np.cos(lon_r), np.cos(lat_r) * np.sin(lon_r), np.sin(lat_r)]
    )


def chord_to_km(chord: np.ndarray) -> np.ndarray:
    return 2.0 * EARTH_KM * np.arcsin(np.clip(np.asarray(chord) / 2.0, 0.0, 1.0))


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


def multiplier_table(params: dict, zone_curves: dict, dates: list[str], zones: list[str]) -> pd.DataFrame:
    """Reproduce the production season multiplier for every (date, zone, species)."""
    grid = pd.MultiIndex.from_product([dates, zones], names=["date", "climate_zone"]).to_frame(index=False)
    frame = pd.DataFrame({
        "Date": pd.to_datetime(grid.date), "climate_zone": grid.climate_zone,
    })
    out = grid.copy()
    for species in FUNGI:
        out[f"{species}_season_mult"] = season_multiplier_for_species(
            frame, species, params[species], zone_curves
        )
    return out


def keep_mask(location_ids: pd.Series, modulus: int) -> np.ndarray:
    digest = location_ids.astype(str).map(
        lambda value: int(hashlib.blake2b(value.encode(), digest_size=8).hexdigest(), 16)
    )
    return (digest % modulus == 0).to_numpy()


def scan_region(region: str, records: pd.DataFrame, session: requests.Session, output: Path) -> dict:
    url = REGIONS[region][0]
    params, zone_curves = load_specs(session, region)
    fs = fsspec.filesystem("https")
    columns = ["Location_Id", "Date", "Latitude", "Longitude", "climate_zone", *SCORE_COLUMNS]

    with fs.open(url, "rb", block_size=16 * 1024 * 1024) as handle:
        parquet = pq.ParquetFile(handle)
        coordinate_pieces = []
        for batch in parquet.iter_batches(columns=["Location_Id", "Latitude", "Longitude"]):
            coordinate_pieces.append(batch.to_pandas().drop_duplicates("Location_Id"))
        coordinates = (
            pd.concat(coordinate_pieces, ignore_index=True)
            .drop_duplicates("Location_Id").reset_index(drop=True)
        )
        print(f"{region}: {len(coordinates):,} grid points", flush=True)

        region_records = records[records.region == region].copy()
        wanted_pairs: set[tuple] = set()
        if not region_records.empty:
            tree = cKDTree(unit_xyz(coordinates.Latitude.to_numpy(), coordinates.Longitude.to_numpy()))
            distance, index = tree.query(
                unit_xyz(region_records.lat.to_numpy(), region_records.lon.to_numpy()), k=1
            )
            region_records["distance_km"] = chord_to_km(distance)
            region_records["location_id"] = coordinates.iloc[index].Location_Id.to_numpy()
            matched = region_records[region_records.distance_km <= MAX_MATCH_KM]
            wanted_pairs = set(zip(matched.location_id, matched.date))
            print(f"{region}: {len(matched):,} of {len(region_records):,} records within "
                  f"{MAX_MATCH_KM} km", flush=True)

        modulus = max(1, round(len(coordinates) / TARGET_LOCATIONS))
        grid_pieces, observation_pieces = [], []
        for number, batch in enumerate(parquet.iter_batches(columns=columns), start=1):
            frame = batch.to_pandas()
            frame["date"] = pd.to_datetime(frame.pop("Date")).dt.strftime("%Y-%m-%d")
            grid_pieces.append(frame[keep_mask(frame.Location_Id, modulus)])
            if wanted_pairs:
                pair_index = pd.MultiIndex.from_arrays([frame.Location_Id, frame.date])
                hit = pair_index.isin(wanted_pairs)
                if hit.any():
                    observation_pieces.append(frame[hit])
            if number % 4 == 0:
                print(f"  {region}: {number}/{parquet.num_row_groups} row groups", flush=True)

    grid = pd.concat(grid_pieces, ignore_index=True)
    grid = grid.drop_duplicates(["Location_Id", "date"], keep="last")
    dates = sorted(grid.date.unique())
    zones = sorted(set(grid.climate_zone.dropna().unique()))
    multipliers = multiplier_table(params, zone_curves, dates, zones)
    grid = grid.merge(multipliers, on=["date", "climate_zone"], how="left")
    grid["region"] = region
    grid.to_parquet(output / f"grid-cell-days-{region}.parquet", index=False)

    matched_scores = pd.DataFrame()
    if observation_pieces:
        scored = pd.concat(observation_pieces, ignore_index=True).drop_duplicates(
            ["Location_Id", "date"], keep="last"
        )
        scored = scored.merge(multipliers, on=["date", "climate_zone"], how="left")
        matched_scores = matched.merge(
            scored.rename(columns={"Location_Id": "location_id"}),
            on=["location_id", "date"], how="left", suffixes=("", "_grid"),
        )
        matched_scores["region"] = region
        matched_scores.to_csv(output / f"observation-scores-{region}.csv", index=False)

    return {
        "grid_points": int(len(coordinates)),
        "subsample_modulus": int(modulus),
        "subsample_locations": int(grid.Location_Id.nunique()),
        "subsample_cell_days": int(len(grid)),
        "dates": [dates[0], dates[-1]],
        "zones": zones,
        "records_in_region": int(len(region_records)),
        "records_matched": int(len(matched_scores)),
        "source_url": url,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--truth",
        default="docs/qa/model-evaluation-2026/seasonal-ground-truth/gbif-season-truth.json",
    )
    parser.add_argument("--output", default="docs/qa/model-evaluation-2026/seasonal-timing")
    parser.add_argument("--regions", default="NE,SE,USE,USW")
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    records = pd.DataFrame(truth["records"])

    session = requests.Session()
    session.headers["User-Agent"] = "fung.es season-timing QA"
    metadata = {}
    for region in args.regions.split(","):
        metadata[region] = scan_region(region, records, session, output)
        print(json.dumps({region: metadata[region]}, indent=2), flush=True)
    (output / "scan-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

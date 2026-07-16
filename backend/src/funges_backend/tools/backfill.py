#!/usr/bin/env python3
"""One-shot backfill of R2 source files into Postgres.

For each region, reads the coordinates JSON, static-info CSV, boundaries GeoJSON, and
weather/score master parquet/CSV (paths resolved the same way the scoring pipeline
resolves them, via `RegionConfig`'s env vars), plus the shared species_params.txt and
season/zone curve files, and loads them into Postgres via the species, geo, and
weather-score repositories.

Safe to re-run: every write goes through an idempotent upsert (or delete-then-insert /
on-conflict-do-nothing), so re-running the backfill converges to the same end state
rather than duplicating rows.

Usage:
    uv run python -m funges_backend.tools.backfill --region NE
    uv run python -m funges_backend.tools.backfill --region all
"""

import argparse
import json
from pathlib import Path

import pandas as pd

from funges_backend import forecast_pipeline as fp
from funges_backend.db.engine import get_engine
from funges_backend.forecast_pipeline import RegionConfig
from funges_backend.geo import BoundaryRepository, CoordinateRepository
from funges_backend.species import SpeciesRepository
from funges_backend.tools.regions import REGIONS
from funges_backend.weather_scores import WeatherScoreRepository

_ROOT = Path(__file__).resolve().parents[4]


def _clean(value):
    """None for missing/NaN, else the value unchanged -- pandas NaN is not JSON-serializable
    and is not a valid value for the nullable Postgres columns these rows are written to."""
    return None if pd.isna(value) else value


def backfill_species_and_curves(config: RegionConfig, species_repo: SpeciesRepository) -> tuple[int, int]:
    """Load species_params.txt + season/zone curve files and upsert species before zone
    curves (zone_season_curves.species has a FK to species.name)."""
    species_params, zone_curves = fp._load_species_and_curves(config, fp.get_required_env(config.species_params_env))
    for name, params in species_params.items():
        species_repo.upsert_species(name, params)

    n_curve_rows = 0
    for climate_zone, species_map in zone_curves.items():
        for species_name, curve in species_map.items():
            species_repo.upsert_zone_curve(climate_zone, species_name, curve)
            n_curve_rows += len(curve)
    return len(species_params), n_curve_rows


def _read_geojson(path: str) -> dict:
    raw = fp.r2_fetch(path) if fp.is_remote_path(path) else Path(path).read_bytes()
    return json.loads(raw)


def backfill_geo(region: str, config: RegionConfig, boundary_repo: BoundaryRepository, coord_repo: CoordinateRepository) -> tuple[int, int]:
    """Store the region's boundary (before coordinates -- FK), its coordinate grid, and
    coordinate-keyed static attributes."""
    boundary_repo.store_boundary_from_geojson(region, _read_geojson(fp.get_required_env(config.boundaries_env)))

    coords = fp._load_coords_any(fp.get_required_env(config.coordinates_env))
    coord_repo.store_coordinates(region, coords)

    static_map = fp._load_static_map(fp.get_required_env(config.static_info_env), config.ndp)
    for (lat, lon), row in static_map.iterrows():
        coord_repo.upsert_static_attributes(
            lat,
            lon,
            altitude=_clean(row["Altitude"]),
            dist_m_water=_clean(row["dist_m_water"]),
            dist_m_sea=_clean(row["dist_m_sea"]),
            climate_zone=_clean(row["climate_zone"]),
            ph_level=_clean(row["ph_level"]),
        )
    return len(coords), len(static_map)


# Wide master-file column -> `weather_scores` column, everything but Location_Id/Date/scores.
_MASTERFILE_COLUMN_MAP = {
    "Latitude": "latitude",
    "Longitude": "longitude",
    "Elevation (m)": "elevation_m",
    "Pressure (hPa)": "pressure_hpa",
    "TotalPrecipitation_mm": "total_precipitation_mm",
    "Humidity (%)": "humidity_pct",
    "Wind Speed (m/s)": "wind_speed_ms",
    "Description": "description",
    "Temperature (C) Max": "temperature_c_max",
    "Temperature (C) Min": "temperature_c_min",
    "Temperature (C)": "temperature_c",
    "dist_m_water": "dist_m_water",
    "dist_m_sea": "dist_m_sea",
    "climate_zone": "climate_zone",
    "ph_level": "ph_level",
}


def _to_weather_score_row(record: dict, score_columns: list[str]) -> dict:
    row = {"location_id": record["Location_Id"], "date": pd.Timestamp(record["Date"]).date()}
    for src_col, dest_col in _MASTERFILE_COLUMN_MAP.items():
        row[dest_col] = _clean(record.get(src_col))
    row["scores"] = {col[: -len("_score")]: float(record[col]) for col in score_columns if pd.notna(record.get(col))}
    return row


# weather_scores has 18 columns; Postgres caps a single statement at 65535 bind
# parameters, so a full region's history (potentially years of daily rows across many
# locations) must be upserted in batches rather than one `INSERT ... VALUES`.
_WEATHER_SCORE_BATCH_SIZE = 2000


def backfill_weather_scores(config: RegionConfig, weather_repo: WeatherScoreRepository) -> int:
    """Load a region's wide weather/score master file and pivot its per-species
    `{specie}_score` columns into the single `scores` JSONB column per row."""
    df = fp.read_df_from_source(fp.get_required_env(config.weather_data_env))
    score_columns = [c for c in df.columns if c.endswith("_score")]
    rows = [_to_weather_score_row(record, score_columns) for record in df.to_dict("records")]
    for start in range(0, len(rows), _WEATHER_SCORE_BATCH_SIZE):
        weather_repo.upsert_historical_rows(rows[start : start + _WEATHER_SCORE_BATCH_SIZE])
    return len(rows)


def backfill_region(region: str, config: RegionConfig, engine) -> None:
    species_repo = SpeciesRepository(engine)
    boundary_repo = BoundaryRepository(engine)
    coord_repo = CoordinateRepository(engine)
    weather_repo = WeatherScoreRepository(engine)

    n_species, n_curve_rows = backfill_species_and_curves(config, species_repo)
    print(f"[{region}] species={n_species} zone_season_curve_rows={n_curve_rows}")

    n_coords, n_static = backfill_geo(region, config, boundary_repo, coord_repo)
    print(f"[{region}] coordinates={n_coords} static_attributes={n_static}")

    n_weather_rows = backfill_weather_scores(config, weather_repo)
    print(f"[{region}] weather_score_rows={n_weather_rows}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", choices=[*REGIONS, "all"], default="all", help="Region to backfill (NE/SE/USE/USW), or 'all' for every region (default)")
    args = ap.parse_args()

    fp.load_dotenv(_ROOT / ".env")
    fp.load_dotenv(_ROOT / ".env.secret")

    engine = get_engine()
    regions = list(REGIONS) if args.region == "all" else [args.region]
    for region in regions:
        print(f"[{region}] starting backfill")
        backfill_region(region, REGIONS[region], engine)


if __name__ == "__main__":
    main()

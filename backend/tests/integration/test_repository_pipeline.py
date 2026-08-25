from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from pydantic import SecretStr
from shapely.geometry import Polygon
from sqlalchemy import create_engine
from testcontainers.community.postgres import PostgresContainer

from funges_backend.forecast_pipeline import RegionConfig, run_pipeline
from funges_backend.repositories import (
    BoundaryRepository,
    CoordinateRepository,
    PipelineInputRepository,
    SpeciesRepository,
    WeatherScoreRepository,
)


@pytest.mark.integration
def test_pipeline_reads_and_writes_only_repositories():
    try:
        container = PostgresContainer("postgis/postgis:16-3.4")
        container.start()
    except Exception as error:
        pytest.skip(f"Docker/PostGIS is unavailable: {error}")
    url = container.get_connection_url().replace("postgresql+psycopg2", "postgresql+psycopg")
    backend_root = Path(__file__).resolve().parents[2]
    alembic = Config(str(backend_root / "alembic.ini"))
    alembic.set_main_option("sqlalchemy.url", url)
    command.upgrade(alembic, "head")
    engine = create_engine(url)
    try:
        BoundaryRepository(engine).upsert("TST", Polygon([(0, 0), (0, 2), (2, 2), (2, 0)]))
        coords = CoordinateRepository(engine)
        coords.generate_grid(
            "TST", lat_range=(1, 2), lon_range=(1, 2), lat_step=1, lon_step=1
        )
        coords.upsert_static_attributes(
            "TST",
            [{
                "Latitude": 1.0, "Longitude": 1.0, "Altitude": 100,
                "dist_m_water": 100, "dist_m_sea": 1000,
                "climate_zone": "temperate", "ph_level": 6.5,
            }],
        )
        PipelineInputRepository(engine).upsert_base_points(
            "TST", [{"Location_Id": "base-1", "Latitude": 1.0, "Longitude": 1.0}]
        )
        SpeciesRepository(engine).upsert_species(
            "test_species",
            {
                "optimal_temp": 15, "temp_sigma": 8, "optimal_alt": 100,
                "alt_sigma": 500, "optimal_humidity": 80, "humidity_sigma": 20,
                "optimal_pH": 6.5, "pH_sigma_near": 1, "pH_sigma_far": 2,
                "pH_range_near": [5.5, 7.5], "climate_zones": ["temperate"],
                "season_months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            },
        )

        def fake_weather(_lat, _lon, *, api_key, counter):
            assert api_key == "mock-key"
            counter.increment()
            return {
                "location": {"name": "Mock"},
                "forecast": {"forecastday": [{
                    "date": f"2026-08-{day:02d}",
                    "day": {
                        "maxtemp_c": 18, "mintemp_c": 12, "avgtemp_c": 15,
                        "maxwind_kph": 5, "avghumidity": 80, "totalprecip_mm": 5,
                        "condition": {"text": "Clear"},
                    },
                    "hour": [{"pressure_mb": 1012}],
                } for day in range(20, 27)]},
            }

        result = run_pipeline(
            RegionConfig(region_id="TST", lat_range=(1, 2), lon_range=(1, 2), max_workers=1),
            engine=engine,
            weather_settings=SimpleNamespace(key=SecretStr("mock-key")),
            fetcher=fake_weather,
        )
        persisted = WeatherScoreRepository(engine).read_all("TST")
        assert len(result) == len(persisted) == 7
        assert persisted["test_species_score"].notna().all()
    finally:
        engine.dispose()
        container.stop()

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from testcontainers.community.postgres import PostgresContainer

from funges_backend.repositories.species import SpeciesRepository


@pytest.fixture(scope="module")
def repository():
    try:
        container = PostgresContainer("postgis/postgis:16-3.4")
        container.start()
    except Exception as error:
        pytest.skip(f"Docker/PostGIS is unavailable: {error}")

    backend_root = Path(__file__).resolve().parents[2]
    url = container.get_connection_url().replace("postgresql+psycopg2", "postgresql+psycopg")
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    try:
        yield SpeciesRepository(engine)
    finally:
        engine.dispose()
        container.stop()


@pytest.mark.integration
def test_species_params_round_trip_and_upsert(repository):
    params = {
        "optimal_temp": 12.0,
        "temp_sigma": 5.0,
        "optimal_alt": 100.0,
        "alt_sigma": 400.0,
        "optimal_humidity": 80.0,
        "humidity_sigma": 12.0,
        "optimal_pH": 7.0,
        "pH_sigma_near": 0.6,
        "pH_sigma_far": 1.2,
        "pH_range_near": [6.5, 7.5],
        "min_cumulative_rain": 40.0,
        "season_months": [3, 4, 5],
        "weather_preference": {"rain_first": True},
        "custom_weight": 0.75,
    }
    repository.upsert_species("morel", params, scientific_name="Morchella spp.")
    assert repository.get_species_params("morel") == params

    changed = {**params, "optimal_temp": 13.5}
    repository.upsert_species("morel", changed, scientific_name="Morchella spp.")
    assert repository.get_species_params("morel")["optimal_temp"] == 13.5


@pytest.mark.integration
def test_zone_curve_round_trip_and_upsert(repository):
    repository.upsert_zone_curves(
        {
            "temperate": {
                "morel": {
                    "multiplier": {1: 0.2, 2: 0.7, 3: 1.0},
                    "ratio": {1: 0.0, 2: 0.5, 3: 1.0},
                }
            }
        }
    )
    curves = repository.get_zone_curves("temperate")
    assert curves["temperate"]["morel"]["multiplier"][3] == 1.0
    assert curves["temperate"]["morel"]["ratio"][2] == 0.5

    repository.upsert_zone_curves({"temperate": {"morel": {1: 0.4, 2: 0.8, 3: 1.0}}})
    assert repository.get_zone_curves("temperate")["temperate"]["morel"]["multiplier"][1] == 0.4


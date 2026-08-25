from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from shapely.geometry import Polygon
from sqlalchemy import create_engine
from testcontainers.community.postgres import PostgresContainer

from funges_backend.repositories.geo import BoundaryRepository, CoordinateRepository


@pytest.fixture(scope="module")
def repositories():
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
        yield BoundaryRepository(engine), CoordinateRepository(engine)
    finally:
        engine.dispose()
        container.stop()


@pytest.mark.integration
def test_boundary_round_trip_and_postgis_grid_filter(repositories):
    boundaries, coordinates = repositories
    boundary = Polygon([(0.25, 0.25), (2.75, 0.25), (2.75, 2.75), (0.25, 2.75)])
    boundaries.upsert("TEST", boundary)

    assert boundaries.get("TEST").equals(boundary)
    grid = coordinates.generate_grid(
        "TEST",
        lat_range=(0.0, 4.0),
        lon_range=(0.0, 4.0),
        lat_step=1.0,
        lon_step=1.0,
        ndp=3,
    )
    assert grid == [(1.0, 1.0), (1.0, 2.0), (2.0, 1.0), (2.0, 2.0)]


@pytest.mark.integration
def test_static_attributes_use_nearest_non_null_altitude(repositories):
    _boundaries, coordinates = repositories
    coordinates.upsert_static_attributes(
        "TEST",
        [
            {
                "Latitude": 1.0,
                "Longitude": 1.0,
                "Altitude": 125.0,
                "dist_m_water": 50.0,
                "dist_m_sea": 5000.0,
                "climate_zone": "temperate",
                "ph_level": 6.5,
            },
            {
                "Latitude": 1.0,
                "Longitude": 2.0,
                "Altitude": None,
                "dist_m_water": 75.0,
                "dist_m_sea": 5100.0,
                "climate_zone": "temperate",
                "ph_level": 6.7,
            },
        ],
    )

    result = coordinates.get_static_attributes("TEST", 1.0, 2.0)
    assert result["Altitude"] == 125.0
    assert result["dist_m_water"] == 75.0


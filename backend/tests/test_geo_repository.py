from pathlib import Path

import pytest
from alembic.config import Config
from shapely.geometry import Polygon, box
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings
from funges_backend.geo import BoundaryRepository, CoordinateRepository

BACKEND_DIR = Path(__file__).resolve().parent.parent

# A simple square boundary covering roughly lat [0, 2] x lon [0, 2], used to spot-check
# ST_Contains grid filtering the same way `_load_or_build_coords`'s shapely `.within()`
# loop was spot-checked against a known polygon.
SQUARE_BOUNDARY = box(0.0, 0.0, 2.0, 2.0)


@pytest.fixture(scope="module")
def postgis_container():
    with PostgresContainer("postgis/postgis:16-3.4", driver="psycopg") as container:
        yield container


@pytest.fixture
def engine(monkeypatch, postgis_container):
    monkeypatch.setenv("DB_HOST", postgis_container.get_container_host_ip())
    monkeypatch.setenv("DB_PORT", str(postgis_container.get_exposed_port(postgis_container.port)))
    monkeypatch.setenv("DB_NAME", postgis_container.dbname)
    monkeypatch.setenv("DB_USER", postgis_container.username)
    monkeypatch.setenv("DB_PASSWORD", postgis_container.password)
    get_database_settings.cache_clear()

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(cfg, "head")

    url = get_database_settings().sqlalchemy_url
    eng = build_engine(url)
    with eng.begin() as conn:
        conn.execute(text("TRUNCATE TABLE static_geo_attributes, coordinates, boundaries"))
    yield eng
    eng.dispose()
    get_database_settings.cache_clear()


@pytest.fixture
def boundary_repo(engine):
    return BoundaryRepository(engine)


@pytest.fixture
def coord_repo(engine):
    return CoordinateRepository(engine)


def test_boundary_round_trips_geometry(boundary_repo):
    boundary_repo.store_boundary("NE", SQUARE_BOUNDARY)

    stored = boundary_repo.get_boundary("NE")

    assert stored is not None
    assert stored.equals(SQUARE_BOUNDARY)
    assert boundary_repo.get_boundary("unknown-region") is None


def test_store_boundary_from_geojson_unions_features(boundary_repo):
    feature_collection = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": box(0.0, 0.0, 1.0, 1.0).__geo_interface__, "properties": {}},
            {"type": "Feature", "geometry": box(1.0, 0.0, 2.0, 1.0).__geo_interface__, "properties": {}},
        ],
    }

    boundary_repo.store_boundary_from_geojson("NE", feature_collection)

    stored = boundary_repo.get_boundary("NE")
    assert stored.equals(box(0.0, 0.0, 2.0, 1.0))


def test_boundary_store_overwrites_existing_region(boundary_repo):
    boundary_repo.store_boundary("NE", box(0.0, 0.0, 1.0, 1.0))
    boundary_repo.store_boundary("NE", SQUARE_BOUNDARY)

    assert boundary_repo.get_boundary("NE").equals(SQUARE_BOUNDARY)


def test_generate_grid_keeps_only_points_inside_boundary(boundary_repo, coord_repo):
    boundary_repo.store_boundary("NE", SQUARE_BOUNDARY)

    # Offset by 0.5 so no candidate lands exactly on an edge/corner of the square,
    # keeping the inside/outside expectation unambiguous regardless of whether
    # ST_Contains treats boundary points as contained.
    grid = coord_repo.generate_grid("NE", lat_range=(-1.5, 3.0), lon_range=(-1.5, 3.0), lat_step=1.0, lon_step=1.0)

    grid_points = {tuple(point) for point in grid}
    assert (0.5, 0.5) in grid_points
    assert (1.5, 1.5) in grid_points
    assert (-0.5, -0.5) not in grid_points
    assert (2.5, 2.5) not in grid_points
    assert all(0.0 <= lat <= 2.0 and 0.0 <= lon <= 2.0 for lat, lon in grid_points)


def test_generate_grid_persists_and_dedupes_coordinates(boundary_repo, coord_repo):
    boundary_repo.store_boundary("NE", SQUARE_BOUNDARY)

    first = coord_repo.generate_grid("NE", lat_range=(-1.5, 3.0), lon_range=(-1.5, 3.0), lat_step=1.0, lon_step=1.0)
    coord_repo.generate_grid("NE", lat_range=(-1.5, 3.0), lon_range=(-1.5, 3.0), lat_step=1.0, lon_step=1.0)

    persisted = coord_repo.get_coordinates("NE")
    assert len(persisted) == len(first)
    assert {tuple(point) for point in persisted} == {tuple(point) for point in first}


def test_generate_grid_respects_a_non_rectangular_boundary(boundary_repo, coord_repo):
    triangle = Polygon([(-0.5, -0.5), (-0.5, 4.5), (4.5, -0.5)])
    boundary_repo.store_boundary("NE", triangle)

    grid = coord_repo.generate_grid("NE", lat_range=(-1.0, 5.0), lon_range=(-1.0, 5.0), lat_step=1.0, lon_step=1.0)

    grid_points = {tuple(point) for point in grid}
    assert (0.0, 0.0) in grid_points  # well inside the right-angle corner
    assert (1.0, 1.0) in grid_points  # still inside, near the hypotenuse
    assert (3.0, 3.0) not in grid_points  # outside the hypotenuse (x + y > 4)
    assert (-1.0, -1.0) not in grid_points  # outside the two legs


def test_static_attributes_round_trip(coord_repo):
    coord_repo.upsert_static_attributes(
        1.234567, 2.345678, altitude=123.0, dist_m_water=500.0, dist_m_sea=10000.0, climate_zone="temperate", ph_level=6.5,
    )

    attrs = coord_repo.get_static_attributes(1.234567, 2.345678)

    assert attrs["altitude"] == 123.0
    assert attrs["dist_m_water"] == 500.0
    assert attrs["dist_m_sea"] == 10000.0
    assert attrs["climate_zone"] == "temperate"
    assert attrs["ph_level"] == 6.5


def test_static_attributes_upsert_overwrites_existing_row(coord_repo):
    coord_repo.upsert_static_attributes(1.0, 1.0, altitude=100.0, dist_m_water=1.0, dist_m_sea=1.0, climate_zone="a", ph_level=5.0)
    coord_repo.upsert_static_attributes(1.0, 1.0, altitude=200.0, dist_m_water=2.0, dist_m_sea=2.0, climate_zone="b", ph_level=6.0)

    attrs = coord_repo.get_static_attributes(1.0, 1.0)
    assert attrs["altitude"] == 200.0
    assert attrs["climate_zone"] == "b"


def test_static_attributes_missing_coordinate_returns_all_none(coord_repo):
    attrs = coord_repo.get_static_attributes(50.0, 50.0)
    assert attrs == {"altitude": None, "dist_m_water": None, "dist_m_sea": None, "climate_zone": None, "ph_level": None}


def test_static_attributes_falls_back_to_nearest_known_elevation(coord_repo):
    coord_repo.upsert_static_attributes(10.0, 10.0, altitude=250.0, dist_m_water=1.0, dist_m_sea=1.0, climate_zone="c", ph_level=6.0)
    coord_repo.upsert_static_attributes(10.001, 10.001, altitude=None, dist_m_water=2.0, dist_m_sea=2.0, climate_zone="c", ph_level=6.1)

    attrs = coord_repo.get_static_attributes(10.001, 10.001)

    assert attrs["altitude"] == 250.0
    assert attrs["dist_m_water"] == 2.0
    assert attrs["climate_zone"] == "c"

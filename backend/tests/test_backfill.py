from datetime import date
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings
from funges_backend.forecast_pipeline import RegionConfig
from funges_backend.geo import BoundaryRepository, CoordinateRepository
from funges_backend.species import SpeciesRepository
from funges_backend.tools import backfill
from funges_backend.weather_scores import WeatherScoreRepository

BACKEND_DIR = Path(__file__).resolve().parent.parent
FIXTURES = BACKEND_DIR / "tests" / "fixtures" / "backfill"

REGION = "TEST"
CONFIG = RegionConfig(
    boundaries_env="TEST_BOUNDARIES",
    coordinates_env="TEST_COORDINATES",
    base_env="TEST_BASE",
    species_params_env="TEST_SPECIES_PARAMS",
    weather_data_env="TEST_WEATHER_DATA",
    static_info_env="TEST_STATIC_INFO",
    season_curves_env="TEST_SEASON_CURVES",
    zone_curves_env="TEST_ZONE_SEASON_CURVES",
    lat_range=(0.0, 2.0),
    lon_range=(0.0, 2.0),
)


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
        conn.execute(text("TRUNCATE TABLE weather_scores, static_geo_attributes, coordinates, boundaries, zone_season_curves, species"))
    yield eng
    eng.dispose()
    get_database_settings.cache_clear()


@pytest.fixture(autouse=True)
def region_env(monkeypatch):
    monkeypatch.setenv("TEST_BOUNDARIES", str(FIXTURES / "boundaries.geojson"))
    monkeypatch.setenv("TEST_COORDINATES", str(FIXTURES / "coordinates.json"))
    monkeypatch.setenv("TEST_SPECIES_PARAMS", str(FIXTURES / "species_params.txt"))
    monkeypatch.setenv("TEST_WEATHER_DATA", str(FIXTURES / "weather_data.parquet"))
    monkeypatch.setenv("TEST_STATIC_INFO", str(FIXTURES / "static_info.csv"))
    monkeypatch.setenv("TEST_SEASON_CURVES", str(FIXTURES / "season_curves.json"))
    monkeypatch.setenv("TEST_ZONE_SEASON_CURVES", str(FIXTURES / "zone_season_curves.json"))


def test_backfill_region_loads_species_and_zone_curves(engine):
    backfill.backfill_region(REGION, CONFIG, engine)

    species_repo = SpeciesRepository(engine)
    params = species_repo.get_all_species_params()
    assert set(params) == {"mushroom", "chant"}
    assert params["mushroom"]["optimal_temp"] == 14.0
    assert params["chant"]["season_curve"][6] == 1.0  # from season_curves.json

    zone_curves = species_repo.get_zone_curves("temperate")
    assert zone_curves == {"mushroom": {6: 0.6, 7: 0.9, 8: 1.0, 9: 0.8}}


def test_backfill_region_loads_boundary_coordinates_and_static_attributes(engine):
    backfill.backfill_region(REGION, CONFIG, engine)

    boundary_repo = BoundaryRepository(engine)
    coord_repo = CoordinateRepository(engine)

    assert boundary_repo.get_boundary(REGION) is not None

    coords = {tuple(point) for point in coord_repo.get_coordinates(REGION)}
    assert coords == {(1.0, 1.0), (1.5, 1.5), (0.5, 0.5)}

    attrs = coord_repo.get_static_attributes(1.0, 1.0)
    assert attrs["altitude"] == 120.0
    assert attrs["dist_m_water"] == 500.0
    assert attrs["climate_zone"] == "temperate"
    assert attrs["ph_level"] == 6.1

    # Row with blank Altitude/ph_level in the CSV -> None, with the nearest-known-elevation
    # fallback filling altitude from a neighboring coordinate.
    sparse_attrs = coord_repo.get_static_attributes(0.5, 0.5)
    assert sparse_attrs["ph_level"] is None
    assert sparse_attrs["altitude"] is not None


def test_backfill_region_pivots_wide_score_columns_into_scores_jsonb(engine):
    backfill.backfill_region(REGION, CONFIG, engine)

    weather_repo = WeatherScoreRepository(engine)
    history = weather_repo.get_history("TestPlace_1.000_1.000")

    assert [row["date"] for row in history] == [date(2026, 6, 1), date(2026, 6, 2)]
    assert history[0]["scores"] == {"mushroom": 7.5, "chant": 4.0}
    # chant_score was NaN in the source row -> absent from scores, not stored as NaN/null.
    assert history[1]["scores"] == {"mushroom": 8.0}
    assert history[0]["temperature_c"] == 15.0
    assert history[0]["latitude"] == 1.0


def test_backfill_weather_scores_batches_large_regions(monkeypatch, engine):
    # Force a batch size smaller than the fixture's row count so the batching loop in
    # `backfill_weather_scores` actually splits the upsert across multiple calls.
    monkeypatch.setattr(backfill, "_WEATHER_SCORE_BATCH_SIZE", 1)

    n_rows = backfill.backfill_weather_scores(CONFIG, WeatherScoreRepository(engine))

    assert n_rows == 3
    assert len(WeatherScoreRepository(engine).get_all()) == 3


def test_backfill_region_is_idempotent(engine):
    backfill.backfill_region(REGION, CONFIG, engine)
    backfill.backfill_region(REGION, CONFIG, engine)

    coord_repo = CoordinateRepository(engine)
    weather_repo = WeatherScoreRepository(engine)
    species_repo = SpeciesRepository(engine)

    assert len(coord_repo.get_coordinates(REGION)) == 3
    assert len(weather_repo.get_all()) == 3
    assert set(species_repo.get_all_species_params()) == {"mushroom", "chant"}
    assert species_repo.get_zone_curves("temperate") == {"mushroom": {6: 0.6, 7: 0.9, 8: 1.0, 9: 0.8}}

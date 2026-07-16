from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings
from funges_backend.species import SpeciesRepository

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Mirrors _phase2_fixture.py's sp_water: relies on the season_months/season_factor
# ramp fallback (no season_curve), and omits optional keys like climate_zones
# entirely rather than passing empty defaults -- the repository must fill those in.
SP_WATER_PARAMS = {
    "optimal_temp": 14.0, "temp_sigma": 6.0,
    "optimal_alt": 800.0, "alt_sigma": 500.0,
    "optimal_humidity": 85.0, "humidity_sigma": 15.0,
    "optimal_pH": 6.0, "pH_sigma_near": 0.5, "pH_sigma_far": 1.5, "pH_range_near": (5.0, 7.0),
    "min_cumulative_rain": 25.0,
    "weather_preference": {"rain_first": True},
    "water_relevance": True, "sea_relevance": True,
    "wind_sensitive": True,
    "climate_zones": ["temperate", "boreal"],
    "season_months": [6, 7, 8, 9],
    "season_factor": 0.4,
}

# A sparse entry with none of the optional keys set, matching how real
# species_params.txt entries can omit them rather than passing explicit defaults.
SP_SPARSE_PARAMS = {
    "optimal_temp": 9.0, "temp_sigma": 4.0,
    "optimal_alt": 400.0, "alt_sigma": 300.0,
    "optimal_humidity": 70.0, "humidity_sigma": 12.0,
    "optimal_pH": 5.5, "pH_sigma_near": 0.4, "pH_sigma_far": 1.2, "pH_range_near": (5.0, 6.0),
}

SP_CURVE_PARAMS = {
    "optimal_temp": 11.0, "temp_sigma": 5.0,
    "optimal_alt": 1200.0, "alt_sigma": 600.0,
    "optimal_humidity": 80.0, "humidity_sigma": 18.0,
    "optimal_pH": 6.5, "pH_sigma_near": 0.6, "pH_sigma_far": 1.4, "pH_range_near": (5.5, 7.5),
    "min_cumulative_rain": 15.0,
    "weather_preference": {"rain_first": False},
    "water_relevance": False, "sea_relevance": False,
    "wind_sensitive": False,
    "climate_zones": [],
    "season_curve": dict(zip(range(1, 13), [0.2, 0.2, 0.3, 0.5, 0.8, 1.0, 1.0, 0.9, 0.7, 0.5, 0.3, 0.2], strict=True)),
}


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
        conn.execute(text("TRUNCATE TABLE zone_season_curves, species"))
    yield eng
    eng.dispose()
    get_database_settings.cache_clear()


@pytest.fixture
def repo(engine):
    return SpeciesRepository(engine)


def test_round_trips_scalar_and_jsonb_fields(repo):
    repo.upsert_species("sp_water", SP_WATER_PARAMS)
    repo.upsert_species("sp_curve", SP_CURVE_PARAMS)

    params = repo.get_all_species_params()

    assert set(params) == {"sp_water", "sp_curve"}
    water = params["sp_water"]
    assert water["optimal_temp"] == 14.0
    assert water["pH_range_near"] == (5.0, 7.0)
    assert water["weather_preference"] == {"rain_first": True}
    assert water["climate_zones"] == ["temperate", "boreal"]
    assert water["wind_sensitive"] is True
    assert "season_curve" not in water

    curve = params["sp_curve"]
    assert curve["season_curve"] == SP_CURVE_PARAMS["season_curve"]
    assert water["season_months"] == [6, 7, 8, 9]
    assert water["season_factor"] == 0.4


def test_upsert_species_fills_in_defaults_for_omitted_optional_fields(repo):
    repo.upsert_species("sp_sparse", SP_SPARSE_PARAMS)

    params = repo.get_all_species_params()["sp_sparse"]

    assert params["min_cumulative_rain"] == 20.0
    assert params["wind_sensitive"] is False
    assert params["water_relevance"] is False
    assert params["sea_relevance"] is False
    assert params["weather_preference"] == {}
    assert params["climate_zones"] == []
    assert "season_curve" not in params
    assert "season_months" not in params
    assert "season_factor" not in params


def test_upsert_species_overwrites_existing_row(repo):
    repo.upsert_species("sp_water", SP_WATER_PARAMS)

    updated = {**SP_WATER_PARAMS, "optimal_temp": 20.0}
    repo.upsert_species("sp_water", updated)

    params = repo.get_all_species_params()
    assert len(params) == 1
    assert params["sp_water"]["optimal_temp"] == 20.0


def test_get_zone_curves_returns_species_month_multipliers_for_zone(repo):
    repo.upsert_species("sp_curve", SP_CURVE_PARAMS)
    repo.upsert_species("sp_water", SP_WATER_PARAMS)

    boreal_curve = dict(zip(
        range(1, 13), [0.1, 0.1, 0.2, 0.4, 0.7, 1.0, 1.0, 0.8, 0.6, 0.4, 0.2, 0.1], strict=True
    ))
    repo.upsert_zone_curve("boreal", "sp_curve", boreal_curve)

    zone_curves = repo.get_zone_curves("boreal")

    assert set(zone_curves) == {"sp_curve"}
    assert zone_curves["sp_curve"] == boreal_curve
    assert repo.get_zone_curves("temperate") == {}


def test_upsert_zone_curve_replaces_prior_months(repo):
    repo.upsert_species("sp_curve", SP_CURVE_PARAMS)
    repo.upsert_zone_curve("boreal", "sp_curve", {1: 0.1, 2: 0.2})

    repo.upsert_zone_curve("boreal", "sp_curve", {6: 1.0})

    assert repo.get_zone_curves("boreal") == {"sp_curve": {6: 1.0}}


def test_get_all_zone_curves_groups_by_zone_then_species(repo):
    repo.upsert_species("sp_curve", SP_CURVE_PARAMS)
    repo.upsert_species("sp_water", SP_WATER_PARAMS)
    repo.upsert_zone_curve("boreal", "sp_curve", {1: 0.1, 6: 1.0})
    repo.upsert_zone_curve("temperate", "sp_water", {3: 0.5})

    zone_curves = repo.get_all_zone_curves()

    assert zone_curves == {
        "boreal": {"sp_curve": {1: 0.1, 6: 1.0}},
        "temperate": {"sp_water": {3: 0.5}},
    }


def test_get_all_zone_curves_empty_when_no_curves_stored(repo):
    assert repo.get_all_zone_curves() == {}

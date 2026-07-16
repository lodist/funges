"""End-to-end proof for issue #140: a full region run of `run_pipeline`, backed by a
real Postgres/PostGIS instance (via testcontainers) and a faked WeatherAPI HTTP layer,
produces scoring output equivalent to the pre-rewrite file-based pipeline.

`parse_forecast_days` and `calculate_mushroom_score` are the same pure functions the
pre-rewrite pipeline used to score a WeatherAPI response -- this test proves the
repository-backed `run_pipeline` feeds them the same data and stores the same result,
without any R2/file I/O or exec()-based species loading.
"""
import json
from pathlib import Path

import pandas as pd
import pytest
from alembic.config import Config
from shapely.geometry import box
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend import forecast_pipeline as fp
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings
from funges_backend.geo import BoundaryRepository, CoordinateRepository
from funges_backend.settings import get_weatherapi_settings
from funges_backend.species import SpeciesRepository
from funges_backend.weather_scores import WeatherScoreRepository

BACKEND_DIR = Path(__file__).resolve().parent.parent
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "forecast_sample.json").read_text(encoding="utf-8"))

LAT, LON = 59.330, 18.070
NDP = 3

SPECIES_PARAMS = {
    "sp_test": {
        "optimal_temp": 12.0, "temp_sigma": 6.0,
        "optimal_alt": 200.0, "alt_sigma": 400.0,
        "optimal_humidity": 75.0, "humidity_sigma": 15.0,
        "optimal_pH": 6.2, "pH_sigma_near": 0.5, "pH_sigma_far": 1.5, "pH_range_near": (5.5, 7.0),
        "min_cumulative_rain": 15.0,
        "climate_zones": ["temperate"],
    },
}

STATIC_ATTRS = {
    "altitude": 120.0, "dist_m_water": 50.0, "dist_m_sea": 9000.0,
    "climate_zone": "temperate", "ph_level": 6.2,
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
        conn.execute(text(
            "TRUNCATE TABLE weather_scores, static_geo_attributes, coordinates, boundaries, "
            "zone_season_curves, species"
        ))
    yield eng
    eng.dispose()
    get_database_settings.cache_clear()


@pytest.fixture
def seeded_region(engine):
    """Seed one region ("E2E") with a boundary covering exactly (LAT, LON), one
    species, and that coordinate's static attributes -- everything `run_pipeline`
    reads through the repositories instead of R2/local files."""
    BoundaryRepository(engine).store_boundary("E2E", box(LON - 1, LAT - 1, LON + 1, LAT + 1))
    SpeciesRepository(engine).upsert_species("sp_test", SPECIES_PARAMS["sp_test"])
    CoordinateRepository(engine).upsert_static_attributes(LAT, LON, **STATIC_ATTRS)
    return engine


@pytest.fixture
def config():
    return fp.RegionConfig(
        region="E2E",
        lat_range=(LAT, LAT + 0.01),
        lon_range=(LON, LON + 0.01),
        lat_step=0.1,
        lon_step=0.1,
        ndp=NDP,
        max_workers=2,
    )


@pytest.fixture
def fake_weatherapi(monkeypatch):
    class _Resp:
        status_code = 200

        def json(self):
            return FIXTURE

    def fake_get(url, params=None, timeout=None):
        return _Resp()

    monkeypatch.setattr(fp.requests, "get", fake_get)
    monkeypatch.setenv("WEATHERAPI_KEY", "test-key")
    get_weatherapi_settings.cache_clear()
    yield
    get_weatherapi_settings.cache_clear()


def _expected_scored_rows(lag_days=21):
    """The pre-rewrite pipeline's own scoring path: parse one WeatherAPI response into
    rows, compute lag features and score them with `calculate_mushroom_score` directly
    (the same pure functions `_merge_and_score` calls) -- no repositories involved."""
    rows = fp.parse_forecast_days(FIXTURE, {"Altitude": STATIC_ATTRS["altitude"], **STATIC_ATTRS}, LAT, LON, NDP)
    df = pd.DataFrame(rows)
    df["Wind Speed (m/s)"] = df["Wind Speed (kph)"] / 3.6
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values(["Location_Id", "Date"])
    lag_columns = ["Temperature (C)", "TotalPrecipitation_mm", "Pressure (hPa)", "Humidity (%)"]
    lagged = fp.compute_lag_features(df, lag_columns, days=lag_days)
    scored = fp.calculate_mushroom_score(lagged, SPECIES_PARAMS, zone_curves={})
    scored["sp_test_score"] = scored["sp_test_score"].mask(scored["sp_test_score"] > 9.5, 10).round(2)
    return scored.set_index("Date")["sp_test_score"].to_dict()


def test_full_region_run_matches_pre_rewrite_scoring(seeded_region, config, fake_weatherapi):
    fp.run_pipeline(config, engine=seeded_region)

    rows = WeatherScoreRepository(seeded_region).get_all()
    place = FIXTURE["location"]["name"]
    location_id = f"{place}_{LAT:.{NDP}f}_{LON:.{NDP}f}"

    assert {r["location_id"] for r in rows} == {location_id}
    assert len(rows) == 7  # one row per forecast day

    expected = _expected_scored_rows()
    got = {pd.Timestamp(r["date"]): r["scores"].get("sp_test") for r in rows}
    assert set(got) == set(expected)
    for d, expected_score in expected.items():
        assert got[d] == pytest.approx(expected_score), f"mismatch on {d}"


def test_full_region_run_generates_grid_via_postgis_when_no_coordinates_stored(seeded_region, config, fake_weatherapi):
    assert len(CoordinateRepository(seeded_region).get_coordinates("E2E")) == 0

    fp.run_pipeline(config, engine=seeded_region)

    stored = CoordinateRepository(seeded_region).get_coordinates("E2E")
    assert len(stored) == 1
    assert stored[0][0] == pytest.approx(LAT)
    assert stored[0][1] == pytest.approx(LON)


def test_second_run_rescores_forward_window_and_preserves_frozen_past(seeded_region, config, fake_weatherapi):
    fp.run_pipeline(config, engine=seeded_region)
    repo = WeatherScoreRepository(seeded_region)
    first_run_rows = {pd.Timestamp(r["date"]): r["scores"].get("sp_test") for r in repo.get_all()}

    fp.run_pipeline(config, engine=seeded_region)
    second_run_rows = {pd.Timestamp(r["date"]): r["scores"].get("sp_test") for r in repo.get_all()}

    # Same fixture, same forward window every run (fixture dates are fixed) -> scores unchanged.
    assert second_run_rows == first_run_rows

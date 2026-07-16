from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest
from alembic.config import Config
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend import forecast_pipeline as fp
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings
from funges_backend.weather_scores import WeatherScoreRepository

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _row(location_id="A", d=date(2026, 7, 16), **overrides):
    row = {
        "location_id": location_id,
        "date": d,
        "latitude": 59.33,
        "longitude": 18.07,
        "elevation_m": 120.0,
        "pressure_hpa": 1012.0,
        "total_precipitation_mm": 0.0,
        "humidity_pct": 70.0,
        "wind_speed_ms": 3.0,
        "description": "Sunny",
        "temperature_c_max": 20.0,
        "temperature_c_min": 10.0,
        "temperature_c": 15.0,
        "dist_m_water": 50.0,
        "dist_m_sea": 9000.0,
        "climate_zone": "temperate",
        "ph_level": 6.2,
    }
    row.update(overrides)
    return row


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
        conn.execute(text("TRUNCATE TABLE weather_scores"))
    yield eng
    eng.dispose()
    get_database_settings.cache_clear()


@pytest.fixture
def repo(engine):
    return WeatherScoreRepository(engine)


def test_upsert_overlapping_date_keeps_fresher_row_and_resets_scores(repo):
    repo.upsert_forecast_rows([_row(temperature_c=10.0)])
    repo.write_forward_scores([{"location_id": "A", "date": date(2026, 7, 16), "scores": {"sp": 5.0}}])

    repo.upsert_forecast_rows([_row(temperature_c=15.0)])

    rows = repo.get_history("A")
    assert len(rows) == 1
    assert rows[0]["temperature_c"] == 15.0
    assert rows[0]["scores"] == {}


def test_upsert_non_overlapping_dates_keeps_both_rows(repo):
    repo.upsert_forecast_rows([
        _row(d=date(2026, 7, 16)),
        _row(d=date(2026, 7, 17)),
    ])

    rows = repo.get_history("A")
    assert [r["date"] for r in rows] == [date(2026, 7, 16), date(2026, 7, 17)]


def test_forward_window_rescore_leaves_frozen_past_rows_untouched(repo):
    today = date(2026, 7, 16)
    past = today - timedelta(days=1)
    repo.upsert_forecast_rows([_row(d=past), _row(d=today)])
    repo.write_forward_scores([
        {"location_id": "A", "date": past, "scores": {"sp": 1.0}},
        {"location_id": "A", "date": today, "scores": {"sp": 2.0}},
    ])

    forward = repo.get_forward_window(today)
    assert {r["date"] for r in forward} == {today}

    repo.write_forward_scores([{"location_id": "A", "date": today, "scores": {"sp": 9.0}}])

    rows = {r["date"]: r["scores"] for r in repo.get_history("A")}
    assert rows[past] == {"sp": 1.0}  # frozen past row untouched
    assert rows[today] == {"sp": 9.0}  # forward row rescored


def test_forward_window_spans_multiple_locations(repo):
    today = date(2026, 7, 16)
    repo.upsert_forecast_rows([
        _row(location_id="A", d=today),
        _row(location_id="B", d=today),
        _row(location_id="A", d=today - timedelta(days=1)),
    ])

    forward = repo.get_forward_window(today)

    assert {(r["location_id"], r["date"]) for r in forward} == {("A", today), ("B", today)}


def test_repository_read_data_satisfies_contiguity_guarantee(repo):
    today = date(2026, 7, 16)
    rows = [_row(location_id="A", d=today + timedelta(days=i)) for i in range(4)]
    rows += [_row(location_id="B", d=today + timedelta(days=i)) for i in range(4)]
    repo.upsert_forecast_rows(rows)

    df = pd.DataFrame(repo.get_all()).rename(columns={"location_id": "Location_Id", "date": "Date"})

    fp.assert_window_contiguous(df, today, forward_days=4, lookback=1)


def test_repository_read_data_fails_contiguity_guarantee_on_gap(repo):
    today = date(2026, 7, 16)
    rows = [_row(location_id="A", d=today), _row(location_id="A", d=today + timedelta(days=2))]
    repo.upsert_forecast_rows(rows)

    df = pd.DataFrame(repo.get_all()).rename(columns={"location_id": "Location_Id", "date": "Date"})

    with pytest.raises(AssertionError):
        fp.assert_window_contiguous(df, today, forward_days=4, lookback=1)


def test_get_rows_in_bbox_scopes_to_region_bounding_box(repo):
    today = date(2026, 7, 16)
    repo.upsert_forecast_rows([
        _row(location_id="in_ne", d=today, latitude=60.0, longitude=10.0),
        _row(location_id="in_se", d=today, latitude=40.0, longitude=20.0),
    ])

    rows = repo.get_rows_in_bbox(lat_range=(49.0, 71.5), lon_range=(-25.0, 32.0))

    assert {r["location_id"] for r in rows} == {"in_ne"}


def test_get_rows_for_locations_scopes_to_given_locations_only(repo):
    today = date(2026, 7, 16)
    repo.upsert_forecast_rows([
        _row(location_id="A", d=today),
        _row(location_id="B", d=today),
        _row(location_id="C", d=today),
    ])

    rows = repo.get_rows_for_locations(["A", "B"])

    assert {r["location_id"] for r in rows} == {"A", "B"}


def test_get_rows_for_locations_applies_start_date_filter(repo):
    today = date(2026, 7, 16)
    repo.upsert_forecast_rows([
        _row(location_id="A", d=today - timedelta(days=5)),
        _row(location_id="A", d=today),
    ])

    rows = repo.get_rows_for_locations(["A"], start_date=today)

    assert [r["date"] for r in rows] == [today]


def test_get_rows_for_locations_empty_list_returns_empty(repo):
    assert repo.get_rows_for_locations([]) == []


def test_delete_rows_older_than_removes_only_stale_rows(repo):
    today = date(2026, 7, 16)
    repo.upsert_forecast_rows([
        _row(location_id="A", d=today - timedelta(days=400)),
        _row(location_id="A", d=today),
    ])

    deleted = repo.delete_rows_older_than(today - timedelta(days=365))

    assert deleted == 1
    assert [r["date"] for r in repo.get_history("A")] == [today]


def test_delete_rows_older_than_scoped_to_bbox_leaves_other_regions_untouched(repo):
    today = date(2026, 7, 16)
    stale = today - timedelta(days=400)
    repo.upsert_forecast_rows([
        _row(location_id="in_ne", d=stale, latitude=60.0, longitude=10.0),
        _row(location_id="in_se", d=stale, latitude=40.0, longitude=20.0),
    ])

    deleted = repo.delete_rows_older_than(
        today - timedelta(days=365), lat_range=(49.0, 71.5), lon_range=(-25.0, 32.0),
    )

    assert deleted == 1
    assert {r["location_id"] for r in repo.get_all()} == {"in_se"}

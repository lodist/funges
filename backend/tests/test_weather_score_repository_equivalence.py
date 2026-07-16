"""Proves WeatherScoreRepository is read/write equivalent to the pandas
`merge_master` / `apply_forward_scores` functions it replaces: the same
sequence of forecast-fetch "runs" is replayed through both, and the final
per-(Location_Id, Date) state (weather values + scores) must match.
"""
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

LOCATIONS = ["A", "B"]
N_DAYS = 4
# Overlapping-by-2 rolling windows, like the real 7-day forecast rolling forward
# a few days between runs: [07-01..07-04], [07-03..07-06], [07-05..07-08].
RUN_STARTS = [date(2026, 7, 1), date(2026, 7, 3), date(2026, 7, 5)]


def _temperature(loc, run_index, day_offset):
    return float(100 * run_index + day_offset + (0 if loc == "A" else 50))


def _pipeline_rows(run_index, run_start):
    rows = []
    for loc in LOCATIONS:
        for i in range(N_DAYS):
            temp = _temperature(loc, run_index, i)
            rows.append({
                "Location_Id": loc, "Date": run_start + timedelta(days=i),
                "Latitude": 59.33, "Longitude": 18.07,
                "Elevation (m)": 120.0, "Pressure (hPa)": 1000.0,
                "TotalPrecipitation_mm": 0.0, "Humidity (%)": 70.0,
                "Wind Speed (m/s)": 3.0, "Description": "Sunny",
                "Temperature (C) Max": temp + 5, "Temperature (C) Min": temp - 5,
                "Temperature (C)": temp,
                "dist_m_water": 50.0, "dist_m_sea": 9000.0,
                "climate_zone": "temperate", "ph_level": 6.2,
            })
    return rows


def _repository_rows(run_index, run_start):
    rows = []
    for loc in LOCATIONS:
        for i in range(N_DAYS):
            temp = _temperature(loc, run_index, i)
            rows.append({
                "location_id": loc, "date": run_start + timedelta(days=i),
                "latitude": 59.33, "longitude": 18.07,
                "elevation_m": 120.0, "pressure_hpa": 1000.0,
                "total_precipitation_mm": 0.0, "humidity_pct": 70.0,
                "wind_speed_ms": 3.0, "description": "Sunny",
                "temperature_c_max": temp + 5, "temperature_c_min": temp - 5,
                "temperature_c": temp,
                "dist_m_water": 50.0, "dist_m_sea": 9000.0,
                "climate_zone": "temperate", "ph_level": 6.2,
            })
    return rows


def _replay_old(run_starts):
    existing_df = pd.DataFrame(columns=[
        "Location_Id", "Date", "Latitude", "Longitude", "Elevation (m)", "Pressure (hPa)",
        "TotalPrecipitation_mm", "Humidity (%)", "Wind Speed (m/s)", "Description",
        "Temperature (C) Max", "Temperature (C) Min", "Temperature (C)",
        "dist_m_water", "dist_m_sea", "climate_zone", "ph_level",
    ])
    for run_index, run_start in enumerate(run_starts):
        new_df = pd.DataFrame(_pipeline_rows(run_index, run_start))
        new_df["Date"] = pd.to_datetime(new_df["Date"])
        combined = fp.merge_master(existing_df, new_df)

        mask = fp.forward_window_mask(combined, run_start)
        forward = combined[mask].copy()
        forward["sp_score"] = (forward["Temperature (C)"] / 10.0).round(2)

        existing_df = fp.apply_forward_scores(combined, forward, ["sp_score"])
    return existing_df


def _replay_new(repo, run_starts):
    for run_index, run_start in enumerate(run_starts):
        repo.upsert_forecast_rows(_repository_rows(run_index, run_start))

        forward = repo.get_forward_window(run_start)
        updates = [
            {"location_id": r["location_id"], "date": r["date"], "scores": {"sp": round(r["temperature_c"] / 10.0, 2)}}
            for r in forward
        ]
        repo.write_forward_scores(updates)
    return repo.get_all()


@pytest.fixture(scope="module")
def postgis_container():
    with PostgresContainer("postgis/postgis:16-3.4", driver="psycopg") as container:
        yield container


@pytest.fixture
def repo(monkeypatch, postgis_container):
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

    yield WeatherScoreRepository(eng)

    eng.dispose()
    get_database_settings.cache_clear()


def test_repository_matches_merge_master_and_apply_forward_scores_across_runs(repo):
    old_final = _replay_old(RUN_STARTS)
    new_final = _replay_new(repo, RUN_STARTS)

    old_by_key = {
        (row["Location_Id"], row["Date"].date()): (row["Temperature (C)"], row["sp_score"])
        for _, row in old_final.iterrows()
    }
    new_by_key = {
        (row["location_id"], row["date"]): (row["temperature_c"], row["scores"].get("sp"))
        for row in new_final
    }

    assert set(old_by_key) == set(new_by_key)
    for key, (old_temp, old_score) in old_by_key.items():
        new_temp, new_score = new_by_key[key]
        assert new_temp == pytest.approx(old_temp)
        assert new_score == pytest.approx(old_score)

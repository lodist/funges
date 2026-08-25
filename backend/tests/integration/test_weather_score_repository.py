from pathlib import Path

import pandas as pd
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from testcontainers.community.postgres import PostgresContainer

from funges_backend.forecast_pipeline import apply_forward_scores, merge_master
from funges_backend.repositories.weather_scores import WeatherScoreRepository


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
        yield WeatherScoreRepository(engine)
    finally:
        engine.dispose()
        container.stop()


def fixture_frames():
    existing = pd.DataFrame(
        {
            "Location_Id": ["A", "A"],
            "Date": pd.to_datetime(["2026-08-24", "2026-08-25"]),
            "Latitude": [48.0, 48.0],
            "Longitude": [8.0, 8.0],
            "Temperature (C)": [10.0, 11.0],
            "morel_score": [3.0, 4.0],
        }
    )
    fresh = pd.DataFrame(
        {
            "Location_Id": ["A", "A"],
            "Date": pd.to_datetime(["2026-08-25", "2026-08-26"]),
            "Latitude": [48.0, 48.0],
            "Longitude": [8.0, 8.0],
            "Temperature (C)": [12.0, 13.0],
            "morel_score": [None, None],
        }
    )
    return existing, fresh


@pytest.mark.integration
def test_upsert_matches_keep_last_merge_semantics(repository):
    existing, fresh = fixture_frames()
    repository.upsert_forecast_rows("NE", existing)
    repository.upsert_forecast_rows("NE", fresh)

    expected = merge_master(existing, fresh).sort_values(["Location_Id", "Date"])
    actual = repository.read_all("NE")
    columns = ["Location_Id", "Date", "Latitude", "Longitude", "Temperature (C)", "morel_score"]
    pd.testing.assert_frame_equal(
        actual[columns].reset_index(drop=True),
        expected[columns].reset_index(drop=True),
        check_dtype=False,
    )


@pytest.mark.integration
def test_forward_score_write_preserves_frozen_past(repository):
    combined = repository.read_all("NE")
    scored = combined.copy()
    scored["morel_score"] = [99.0, 7.0, 8.0]
    today = pd.Timestamp("2026-08-25")

    repository.write_forward_scores(scored, today=today, score_columns=["morel_score"])
    actual = repository.read_all("NE")
    expected = apply_forward_scores(
        combined,
        scored[pd.to_datetime(scored["Date"]) >= today],
        ["morel_score"],
    ).sort_values(["Location_Id", "Date"])

    assert actual.loc[actual["Date"] < today, "morel_score"].tolist() == [3.0]
    pd.testing.assert_series_equal(
        actual["morel_score"].reset_index(drop=True),
        expected["morel_score"].reset_index(drop=True),
        check_dtype=False,
        check_names=False,
    )
    repository.assert_contiguous(today, region_id="NE")


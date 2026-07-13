from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text
from testcontainers.postgres import PostgresContainer

from alembic import command
from funges_backend.db.engine import build_engine
from funges_backend.db.settings import get_database_settings

BACKEND_DIR = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def postgis_container():
    with PostgresContainer("postgis/postgis:16-3.4", driver="psycopg") as container:
        yield container


@pytest.fixture
def alembic_config(monkeypatch, postgis_container):
    monkeypatch.setenv("DB_HOST", postgis_container.get_container_host_ip())
    monkeypatch.setenv("DB_PORT", str(postgis_container.get_exposed_port(postgis_container.port)))
    monkeypatch.setenv("DB_NAME", postgis_container.dbname)
    monkeypatch.setenv("DB_USER", postgis_container.username)
    monkeypatch.setenv("DB_PASSWORD", postgis_container.password)
    get_database_settings.cache_clear()

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    yield cfg

    get_database_settings.cache_clear()


def _installed_extensions(url) -> set[str]:
    engine = build_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT extname FROM pg_extension")).scalars().all()
        return set(rows)
    finally:
        engine.dispose()


def test_upgrade_head_then_downgrade_base_round_trips_cleanly(alembic_config):
    url = get_database_settings().sqlalchemy_url

    command.upgrade(alembic_config, "head")
    assert "postgis" in _installed_extensions(url)

    command.downgrade(alembic_config, "base")
    assert "postgis" not in _installed_extensions(url)

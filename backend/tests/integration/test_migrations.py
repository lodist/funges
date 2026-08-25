from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from testcontainers.community.postgres import PostgresContainer


def alembic_config(url: str) -> Config:
    backend_root = Path(__file__).resolve().parents[2]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.mark.integration
def test_postgis_migration_upgrade_and_downgrade_cycle():
    try:
        container = PostgresContainer("postgis/postgis:16-3.4")
        container.start()
    except Exception as error:
        pytest.skip(f"Docker/PostGIS is unavailable: {error}")

    try:
        url = container.get_connection_url().replace("postgresql+psycopg2", "postgresql+psycopg")
        config = alembic_config(url)
        command.upgrade(config, "head")

        engine = create_engine(url)
        with engine.connect() as connection:
            assert connection.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')")
            )

        command.downgrade(config, "base")
        with engine.connect() as connection:
            assert not connection.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')")
            )
        engine.dispose()
    finally:
        container.stop()

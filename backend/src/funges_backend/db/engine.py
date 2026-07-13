from functools import lru_cache

from sqlalchemy import URL, Engine, create_engine

from funges_backend.db.settings import get_database_settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return the shared SQLAlchemy Core engine, built from `DatabaseSettings`.

    Cached so repositories share one connection pool per process.
    """
    return create_engine(get_database_settings().sqlalchemy_url)


def build_engine(url: URL | str) -> Engine:
    """Build a standalone engine for a given URL, bypassing the cached singleton.

    Used by tests (e.g. against a testcontainers-provisioned database) that need
    an engine independent of process-wide settings/caching.
    """
    return create_engine(url)

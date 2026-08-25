"""Shared SQLAlchemy Core engine helpers."""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import Connection

from funges_backend.settings import DatabaseSettings


def create_database_engine(
    settings: DatabaseSettings | None = None,
    *,
    pool_pre_ping: bool = True,
) -> Engine:
    """Create the shared synchronous Postgres engine.

    Settings are validated eagerly when not injected, so a process fails before
    starting a billed pipeline run if database configuration is incomplete.
    """

    resolved = settings or DatabaseSettings()  # type: ignore[call-arg]
    return create_engine(resolved.sqlalchemy_url, pool_pre_ping=pool_pre_ping)


@contextmanager
def transaction(engine: Engine) -> Iterator[Connection]:
    """Yield one committing transaction for repository operations."""

    with engine.begin() as connection:
        yield connection


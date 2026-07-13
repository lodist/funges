from functools import lru_cache

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class DatabaseSettings(BaseSettings):
    """Connection settings for the application's Postgres+PostGIS database.

    Required fields have no defaults, so instantiation fails fast with a
    validation error listing every missing/invalid `DB_*` variable.
    """

    model_config = SettingsConfigDict(
        env_prefix="DB_",
        env_file=(".env", ".env.secret"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    host: str
    port: int = 5432
    name: str
    user: str
    password: str

    @property
    def sqlalchemy_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.user,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.name,
        )


@lru_cache(maxsize=1)
def get_database_settings() -> DatabaseSettings:
    """Load and cache database settings, failing fast on missing/invalid config."""
    try:
        return DatabaseSettings()
    except ValidationError as exc:
        raise RuntimeError(f"Invalid or missing database configuration (DB_* environment variables):\n{exc}") from exc

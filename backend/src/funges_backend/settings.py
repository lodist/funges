"""Validated backend configuration."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class DatabaseSettings(BaseSettings):
    """Postgres connection settings, loaded from ``FUNGES_DB_*`` variables."""

    model_config = SettingsConfigDict(
        env_prefix="FUNGES_DB_",
        env_file=("../.env", "../.env.secret"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = Field(min_length=1)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(min_length=1)
    user: str = Field(min_length=1)
    password: SecretStr

    @property
    def sqlalchemy_url(self) -> URL:
        return URL.create(
            "postgresql+psycopg",
            username=self.user,
            password=self.password.get_secret_value(),
            host=self.host,
            port=self.port,
            database=self.database,
        )


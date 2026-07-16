"""Pipeline-wide settings (WeatherAPI key, R2 tile-upload credentials).

Extends the `pydantic-settings` pattern established by `db.settings.DatabaseSettings`
to the remaining configuration the rewritten pipeline needs: replaces the ad-hoc
`get_required_env("WEATHERAPI_KEY")` / `get_required_env("R2_...")` calls that used
to run mid-pipeline with fail-fast validation at startup.
"""
from functools import lru_cache

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class WeatherApiSettings(BaseSettings):
    """Credentials for the WeatherAPI forecast endpoint."""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.secret"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    weatherapi_key: str


class R2Settings(BaseSettings):
    """Credentials for the R2 bucket the final MBTiles/PMTiles tile artifacts upload to."""

    model_config = SettingsConfigDict(
        env_prefix="R2_",
        env_file=(".env", ".env.secret"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    bucket_name: str


@lru_cache(maxsize=1)
def get_weatherapi_settings() -> WeatherApiSettings:
    """Load and cache WeatherAPI settings, failing fast on missing/invalid config."""
    try:
        return WeatherApiSettings()
    except ValidationError as exc:
        raise RuntimeError(f"Invalid or missing WeatherAPI configuration (WEATHERAPI_KEY):\n{exc}") from exc


@lru_cache(maxsize=1)
def get_r2_settings() -> R2Settings:
    """Load and cache R2 settings, failing fast on missing/invalid config."""
    try:
        return R2Settings()
    except ValidationError as exc:
        raise RuntimeError(f"Invalid or missing R2 configuration (R2_* environment variables):\n{exc}") from exc

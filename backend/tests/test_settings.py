import pytest

from funges_backend.settings import (
    R2Settings,
    get_r2_settings,
    get_weatherapi_settings,
)


def test_missing_weatherapi_key_fails_fast_with_clear_error(monkeypatch):
    monkeypatch.delenv("WEATHERAPI_KEY", raising=False)
    get_weatherapi_settings.cache_clear()

    with pytest.raises(RuntimeError, match="Invalid or missing WeatherAPI configuration"):
        get_weatherapi_settings()

    get_weatherapi_settings.cache_clear()


def test_weatherapi_key_loaded_from_env(monkeypatch):
    monkeypatch.setenv("WEATHERAPI_KEY", "secret-key")
    get_weatherapi_settings.cache_clear()

    assert get_weatherapi_settings().weatherapi_key == "secret-key"

    get_weatherapi_settings.cache_clear()


def test_missing_r2_settings_fail_fast_with_clear_error(monkeypatch):
    for var in ("R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"):
        monkeypatch.delenv(var, raising=False)
    get_r2_settings.cache_clear()

    with pytest.raises(RuntimeError, match="Invalid or missing R2 configuration"):
        get_r2_settings()

    get_r2_settings.cache_clear()


def test_r2_settings_loaded_from_env():
    settings = R2Settings(
        endpoint_url="https://example.r2.cloudflarestorage.com",
        access_key_id="AKIA",
        secret_access_key="secret",
        bucket_name="funges-tiles",
    )

    assert settings.endpoint_url == "https://example.r2.cloudflarestorage.com"
    assert settings.bucket_name == "funges-tiles"

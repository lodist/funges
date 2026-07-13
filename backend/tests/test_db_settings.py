import pytest

from funges_backend.db.settings import DatabaseSettings, get_database_settings


def test_missing_required_settings_fail_fast_with_clear_error(monkeypatch):
    for var in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DB_HOST", "localhost")
    get_database_settings.cache_clear()

    with pytest.raises(RuntimeError, match="Invalid or missing database configuration"):
        get_database_settings()

    get_database_settings.cache_clear()


def test_sqlalchemy_url_uses_psycopg_driver_and_given_fields():
    settings = DatabaseSettings(host="localhost", port=5433, name="funges", user="alice", password="secret")

    url = settings.sqlalchemy_url

    assert url.drivername == "postgresql+psycopg"
    assert url.host == "localhost"
    assert url.port == 5433
    assert url.database == "funges"
    assert url.username == "alice"
    assert url.password == "secret"

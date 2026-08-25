import pytest
from pydantic import ValidationError

from funges_backend.settings import DatabaseSettings


def test_database_settings_build_encoded_sqlalchemy_url():
    settings = DatabaseSettings(
        host="db.internal",
        port=5433,
        database="funges",
        user="worker",
        password="p@ss word",
        _env_file=None,
    )

    assert settings.sqlalchemy_url.drivername == "postgresql+psycopg"
    assert settings.sqlalchemy_url.host == "db.internal"
    assert settings.sqlalchemy_url.password == "p@ss word"


def test_database_settings_fail_fast_when_required_values_are_missing():
    with pytest.raises(ValidationError):
        DatabaseSettings(_env_file=None)


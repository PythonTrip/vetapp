from pathlib import Path

import pytest
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class PostgresQASettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VAT_QA_")

    postgres_dsn: str | None = Field(default=None, repr=False)
    compose: bool = False


@pytest.fixture(scope="session")
def postgres_qa_settings():
    return PostgresQASettings(_env_file=None)


@pytest.fixture(scope="session")
def disposable_postgres_url(postgres_qa_settings):
    dsn = postgres_qa_settings.postgres_dsn
    if not dsn:
        pytest.skip("Set VAT_QA_POSTGRES_DSN to a disposable local PostgreSQL instance")
    url = make_url(dsn)
    if (
        url.drivername not in {"postgresql", "postgresql+psycopg"}
        or url.host not in {"127.0.0.1", "::1"}
        or not url.database
        or url.query
    ):
        pytest.fail(
            "VAT_QA_POSTGRES_DSN must name a local PostgreSQL database without URL options"
        )
    return url.set(drivername="postgresql+psycopg")


@pytest.fixture
def configure_postgres_app(monkeypatch, tmp_path: Path):
    from vetdietderm_api.db import get_engine, get_session_factory
    from vetdietderm_api.settings import get_settings

    def configure(url):
        monkeypatch.setenv("DATABASE_URL", url.render_as_string(hide_password=False))
        monkeypatch.setenv("ATTACHMENT_DIR", str(tmp_path / "attachments"))
        monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")
        monkeypatch.setenv("AUTH_COOKIE_SAMESITE", "lax")
        monkeypatch.setenv("FRONTEND_URL", "http://testserver")
        monkeypatch.setenv("API_ALLOWED_ORIGINS", "[]")
        get_settings.cache_clear()
        get_session_factory.cache_clear()
        get_engine.cache_clear()
        return get_engine()

    yield configure

    if get_engine.cache_info().currsize:
        get_engine().dispose()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
    get_settings.cache_clear()

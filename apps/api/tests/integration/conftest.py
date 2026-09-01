from collections.abc import Iterator
from pathlib import Path
from uuid import UUID
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema, DropSchema


TEST_TOKEN = "integration-secret"


def _scoped_database_url(database_url: str, schema: str) -> str:
    from vetdietderm_api.db import sqlalchemy_url

    url = make_url(sqlalchemy_url(database_url)).update_query_dict(
        {"options": f"-csearch_path={schema}"}
    )
    return url.render_as_string(hide_password=False)


@pytest.fixture
def api_app(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[FastAPI]:
    from vetdietderm_api.settings import Settings, get_settings

    source_settings = Settings()
    schema = f"it_api_{uuid4().hex}"
    assert schema.startswith("it_api_")

    from vetdietderm_api.db import sqlalchemy_url

    admin_engine = create_engine(
        sqlalchemy_url(source_settings.DATABASE_URL),
        pool_pre_ping=True,
        poolclass=NullPool,
    )
    try:
        with admin_engine.begin() as connection:
            connection.execute(CreateSchema(schema))
    except Exception as exc:
        admin_engine.dispose()
        pytest.fail(
            "Integration tests require PostgreSQL connectivity and CREATE privilege "
            f"for an isolated schema: {exc}"
        )

    monkeypatch.setenv(
        "DATABASE_URL",
        _scoped_database_url(source_settings.DATABASE_URL, schema),
    )
    monkeypatch.setenv("INSTANCE_PASSWORD", TEST_TOKEN)
    monkeypatch.setenv("ATTACHMENT_DIR", str(tmp_path / "attachments"))

    from vetdietderm_api.db import Base, get_engine, get_session_factory

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()

    # Importing the application registers every runtime ORM model on Base.metadata.
    from vetdietderm_api.main import create_app

    engine = get_engine()
    application = create_app()

    try:
        Base.metadata.create_all(engine)
        expected_tables = set(Base.metadata.tables)
        actual_tables = set(inspect(engine).get_table_names(schema=schema))
        assert expected_tables <= actual_tables

        with engine.connect() as connection:
            assert connection.scalar(text("SELECT current_schema()")) == schema
            for table_name in expected_tables:
                owner_schema = connection.scalar(
                    text(
                        """
                        SELECT namespace.nspname
                        FROM pg_class AS relation
                        JOIN pg_namespace AS namespace
                          ON namespace.oid = relation.relnamespace
                        WHERE relation.oid = to_regclass(:table_name)
                        """
                    ),
                    {"table_name": table_name},
                )
                assert owner_schema == schema

        yield application
    finally:
        application.dependency_overrides.clear()
        engine.dispose()
        get_session_factory.cache_clear()
        get_engine.cache_clear()
        get_settings.cache_clear()

        assert schema.startswith("it_api_") and len(schema) > len("it_api_")
        with admin_engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
        admin_engine.dispose()


@pytest.fixture
def api_client(api_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(
        api_app,
        headers={"Authorization": f"Bearer {TEST_TOKEN}"},
    ) as client:
        yield client


@pytest.fixture
def unauthenticated_api_client(api_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(api_app) as client:
        yield client


@pytest.fixture
def seeded_nutrients(api_app: FastAPI) -> dict[str, UUID]:
    from vetdietderm_api.catalog.models import Nutrient
    from vetdietderm_api.db import get_session_factory
    from vetdietderm_api.standards import STANDARD_REGISTRY

    provider_nutrients = sorted(
        STANDARD_REGISTRY.active()._data.nutrients.values(),  # noqa: SLF001
        key=lambda item: item.code,
    )
    rows = [
        Nutrient(
            uuid=item.uuid,
            code=item.code,
            name=item.name,
            category=item.category,
            base_unit=item.base_unit,
            sort_order=index,
        )
        for index, item in enumerate(provider_nutrients, start=1)
    ]
    rows.append(
        Nutrient(
            code="ME",
            name="Обменная энергия",
            category="main",
            base_unit="kcal",
            sort_order=0,
        )
    )

    with get_session_factory()() as session:
        session.add_all(rows)
        session.commit()
        return {row.code: row.uuid for row in rows}

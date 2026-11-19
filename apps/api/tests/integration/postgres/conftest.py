from contextlib import contextmanager
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema, DropSchema

from tests.postgres_auth_stub import CSRF, response_for, sign_in_staff


@pytest.fixture
def postgres_admin(disposable_postgres_url):
    engine = create_engine(
        disposable_postgres_url,
        poolclass=NullPool,
        connect_args={"connect_timeout": 5, "options": "-cstatement_timeout=30000"},
    )
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def postgres_database(postgres_admin):
    name = f"vat_qa_{uuid4().hex}"
    with postgres_admin.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
        db.exec_driver_sql(f'CREATE DATABASE "{name}"')
    try:
        yield postgres_admin.url.set(database=name)
    finally:
        with postgres_admin.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as db:
            db.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')


@pytest.fixture
def postgres_application(configure_postgres_app, monkeypatch):
    from vetdietderm_api import auth

    def upstream(method, path, body=None, token=None):
        code, payload = response_for(method, path, body, token)
        return httpx.Response(code, json=payload)

    monkeypatch.setattr(auth, "upstream", upstream)

    def application(url):
        engine = configure_postgres_app(url)
        from vetdietderm_api.main import create_app

        return create_app(), engine

    return application


@pytest.fixture
def api_app(postgres_admin, postgres_application):
    # The parent seeded_nutrients fixture also uses this app and schema.
    from vetdietderm_api.db import Base

    schema = f"vat_qa_{uuid4().hex}"
    url = postgres_admin.url.update_query_dict(
        {
            "application_name": schema,
            "options": f"-csearch_path={schema} -cstatement_timeout=30000",
        }
    )
    with postgres_admin.begin() as db:
        db.execute(CreateSchema(schema))
    try:
        app, engine = postgres_application(url)
        Base.metadata.create_all(engine)
        yield app
    finally:
        with postgres_admin.begin() as db:
            db.execute(DropSchema(schema, cascade=True))


@pytest.fixture
def staff_client():
    @contextmanager
    def signed_in(app, email="owner@example.test"):
        with TestClient(app, headers=CSRF) as client:
            sign_in_staff(client, email)
            yield client

    return signed_in

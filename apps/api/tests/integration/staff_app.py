"""Isolated SQLite-backed app with a signed-in staff client and an anonymous client."""
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from vetdietderm_api import auth
from vetdietderm_api.db import Base
from vetdietderm_api.main import create_app
from vetdietderm_api.owners import sessions as db_dependency


@compiles(JSONB, "sqlite")
def jsonb_sqlite(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture
def staff_app(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    from vetdietderm_api import db as database
    monkeypatch.setattr(database, "get_engine", lambda: engine)
    for module in (auth, db_dependency):
        monkeypatch.setattr(module, "get_session_factory", lambda: factory)
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(
        FRONTEND_URL="http://testserver", AUTH_COOKIE_SECURE=False))
    user = dict(user_id=str(uuid4()), email="Doctor@example.com", display_name="Доктор Иванова",
                account_status="active", email_verified=True,
                organization=dict(org_id=str(uuid4()), name="Клиника", status="active", org_role="member"))

    def remote(method, path, body=None, token=None):
        if path == "/auth/login":
            return httpx.Response(200, json=dict(access_token="staff-access", refresh_token="staff-refresh",
                                                 expires_in=900, refresh_token_expires_in=3600))
        if path == "/me":
            return httpx.Response(200, json=user)
        if path == f"/organizations/{user['organization']['org_id']}/members":
            assert token == "staff-access"
            return httpx.Response(200, json={"members": [
                {"user_id": user["user_id"], "org_role": user["organization"]["org_role"]},
            ]})
        pytest.fail(f"Unexpected authority call: {path}")
    monkeypatch.setattr(auth, "upstream", remote)
    app = create_app()
    headers = {"X-Vetapp-CSRF": "1", "Origin": "http://testserver"}
    with TestClient(app, headers=headers) as staff, TestClient(app, headers=headers) as anonymous:
        staff.post("/auth-service/auth/login", json={})
        yield staff, anonymous, factory, user
    engine.dispose()

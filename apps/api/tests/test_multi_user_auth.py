"""Boundary tests use an isolated SQLite store and a deterministic auth authority."""
import hashlib
import time
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from vetdietderm_api import auth
from vetdietderm_api.db import Base
from vetdietderm_api.patients.models import Client, Patient
from vetdietderm_api.tenancy import TenantSession


@compiles(JSONB, "sqlite")
def jsonb_sqlite(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


def scoped(engine, tenant, user):
    db = TenantSession(bind=engine, expire_on_commit=False)
    db.info.update(tenant_id=str(tenant), user_id=str(user))
    return db


def test_tenant_identity_lookup_join_and_writes(engine):
    a, b, user = uuid4(), uuid4(), uuid4()
    with scoped(engine, a, user) as db:
        owner = Client(name="private A")
        db.add(owner)
        db.commit()
        patient = Patient(name="A pet", client_uuid=owner.uuid, species="dog")
        db.add(patient)
        db.commit()
        owner_id, patient_id = owner.uuid, patient.uuid
        assert owner.tenant_id == a and owner.created_by == user
    with scoped(engine, b, user) as db:
        assert db.get(Client, owner_id) is None
        assert db.get(Patient, patient_id) is None
        assert db.scalars(select(Client)).all() == []
        assert db.execute(select(Patient.name).join(Client)).all() == []
    with scoped(engine, a, user) as db:
        assert db.get(Client, owner_id).name == "private A"
        db.get(Client, owner_id).tenant_id = b
        with pytest.raises(HTTPException):
            db.commit()


def test_legacy_rows_are_not_claimed(engine):
    with Session(engine) as db:
        row = Client(name="legacy")
        db.add(row)
        db.commit()
    with scoped(engine, uuid4(), uuid4()) as db:
        assert db.scalars(select(Client)).all() == []


@pytest.fixture
def bff(engine, monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(
        FRONTEND_URL="http://testserver", AUTH_COOKIE_SECURE=False))
    monkeypatch.setattr(auth, "get_session_factory", lambda: sessionmaker(bind=engine, expire_on_commit=False))
    app = FastAPI()
    app.include_router(auth.router)
    with TestClient(app, headers={"X-Vetapp-CSRF": "1", "Origin": "http://testserver"}) as client:
        yield client


def pair(access="access-1", refresh="refresh-1"):
    return dict(access_token=access, refresh_token=refresh, expires_in=900, refresh_token_expires_in=3600)


def test_cookie_no_tokens_rotation_and_terminal_401(bff, engine, monkeypatch):
    calls = []
    def remote(method, path, body=None, token=None):
        calls.append((path, body, token))
        if path == "/auth/login": return httpx.Response(200, json=pair())
        if path == "/auth/refresh":
            assert body == {"refresh_token": "refresh-1"}
            return httpx.Response(200, json=pair("access-2", "refresh-2"))
        return httpx.Response(401 if token == "access-1" else 200, json={
            "user_id": "11111111-1111-4111-8111-111111111111", "email": "staff@example.com",
            "account_status": "active", "email_verified": True})
    monkeypatch.setattr(auth, "upstream", remote)
    result = bff.post("/auth-service/auth/login", json={"email": "a@example.com", "password": "secret"})
    assert result.json() == {"ok": True}
    assert "HttpOnly" in result.headers["set-cookie"]
    assert "refresh-1" not in result.text and "access-1" not in result.headers["set-cookie"]
    assert bff.get("/auth-service/me").status_code == 200
    assert [p for p, *_ in calls].count("/auth/refresh") == 1
    with Session(engine) as db:
        assert db.scalar(select(auth.BrowserSession)).refresh_token == "refresh-2"
    monkeypatch.setattr(auth, "upstream", lambda *a, **kw: httpx.Response(401, json={"detail": "expired"}))
    assert bff.get("/auth-service/me").status_code == 401
    with Session(engine) as db:
        assert db.scalar(select(auth.BrowserSession)) is None


def test_rotated_pair_survives_following_upstream_failure(bff, engine, monkeypatch):
    def remote(method, path, body=None, token=None):
        if path == "/auth/login": return httpx.Response(200, json=pair())
        if path == "/auth/refresh": return httpx.Response(200, json=pair("new", "successor"))
        raise HTTPException(503, "offline")
    monkeypatch.setattr(auth, "upstream", remote)
    bff.post("/auth-service/auth/login", json={})
    with Session(engine) as db:
        row = db.scalar(select(auth.BrowserSession)); row.access_expires = 0; db.commit()
    assert bff.get("/auth-service/me").status_code == 503
    with Session(engine) as db:
        assert db.scalar(select(auth.BrowserSession)).refresh_token == "successor"


def test_csrf_and_proxy_allowlist(bff):
    assert bff.post("/auth-service/auth/login", headers={"Origin": "https://evil.example"}, json={}).status_code == 403
    assert bff.get("/auth-service/admin/secrets").status_code == 404
    assert bff.get("/auth-service/me").status_code == 401


def test_viewer_cannot_mutate_organization_but_personal_access_is_available():
    from starlette.requests import Request
    def req(path, method):
        return Request({"type": "http", "path": path, "method": method, "headers": [(b"x-vetapp-workspace", b"organization")]})
    user = {"organization": {"org_id": str(uuid4()), "status": "active", "org_role": "viewer"}}
    with pytest.raises(HTTPException) as error:
        auth.require_clinical_access(req("/patients", "POST"), user)
    assert error.value.status_code == 403
    auth.require_clinical_access(req("/patients", "GET"), user)
    auth.require_clinical_access(req("/assessments/energy", "POST"), user)
    with pytest.raises(HTTPException):
        auth.require_clinical_access(req("/patients", "GET"), {})

def test_personal_workspace_is_private_and_separate_from_organization(engine):
    user, other, org = uuid4(), uuid4(), uuid4()
    def personal(who):
        db = TenantSession(bind=engine, expire_on_commit=False)
        db.info.update(tenant_id=None, user_id=str(who))
        return db
    with personal(user) as db:
        row = Client(name='Personal client')
        db.add(row); db.commit()
        row_id = row.uuid
        assert row.tenant_id is None and row.created_by == user
    with personal(other) as db:
        assert db.get(Client, row_id) is None
        assert db.scalars(select(Client)).all() == []
    with scoped(engine, org, user) as db:
        assert db.get(Client, row_id) is None
    with personal(user) as db:
        row = db.get(Client, row_id)
        row.name = 'Updated personal client'; db.commit()
        assert row.name == 'Updated personal client'


def test_account_without_organization_can_read_and_write_personal_workspace():
    from starlette.requests import Request
    user = {'user_id': str(uuid4())}
    for method in ['GET', 'POST', 'PATCH', 'DELETE']:
        request = Request({'type': 'http', 'path': '/clients', 'method': method, 'headers': []})
        auth.require_clinical_access(request, user)
        assert request.state.tenant_id is None

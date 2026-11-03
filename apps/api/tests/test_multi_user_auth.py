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

import vetdietderm_api.main  # noqa: F401  # register every mapped table before create_all
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
            "account_status": "active", "email_verified": True,
            "organization": {"org_id": "22222222-2222-4222-8222-222222222222", "name": "Клиника",
                             "status": "active", "org_role": "owner"}})
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


def test_viewer_cannot_mutate_and_missing_clinic_is_forbidden(monkeypatch):
    from starlette.requests import Request
    monkeypatch.setattr(auth, "ensure_clinic", lambda request, profile: profile)
    monkeypatch.setattr("vetdietderm_api.tenancy.rehome_personal_rows", lambda *args, **kwargs: None)
    def req(path, method):
        return Request({"type": "http", "path": path, "method": method, "headers": [(b"x-vetapp-workspace", b"personal")]})
    user = {"user_id": str(uuid4()), "organization": {"org_id": str(uuid4()), "status": "active", "org_role": "viewer"}}
    with pytest.raises(HTTPException) as error:
        auth.require_clinical_access(req("/patients", "POST"), user)
    assert error.value.status_code == 403
    auth.require_clinical_access(req("/patients", "GET"), user)
    auth.require_clinical_access(req("/assessments/energy", "POST"), user)
    request = req("/clients", "GET")
    auth.require_clinical_access(request, user)
    assert request.state.tenant_id == user["organization"]["org_id"]
    with pytest.raises(HTTPException) as missing:
        auth.require_clinical_access(req("/patients", "GET"), {"user_id": str(uuid4())})
    assert missing.value.status_code == 403
    assert missing.value.detail == "Клиника недоступна"


def test_personal_rows_move_into_the_clinic_once(engine, monkeypatch):
    from vetdietderm_api.db import Base
    from vetdietderm_api.encounter_templates.models import EncounterTemplate
    from vetdietderm_api.ids import uuid6
    from vetdietderm_api.owners.models import JoinCode, OwnerAccount
    from vetdietderm_api.tenancy import rehome_personal_rows
    Base.metadata.create_all(engine)
    user, other, solo, clinic = uuid4(), uuid4(), uuid4(), uuid4()
    personal_code_id, clinic_code_id, solo_code_id = uuid6(), uuid6(), uuid6()
    account_id, solo_account_id = uuid6(), uuid6()
    with Session(engine) as db:
        personal = Client(name="Personal", tenant_id=None, created_by=user)
        untouched = Client(name="Other", tenant_id=None, created_by=other)
        standard = EncounterTemplate(scope="standard", section="anamnesis", specialty="general",
                                     title="Standard", body="text", tenant_id=None, created_by=None)
        owned_standard = EncounterTemplate(scope="standard", section="anamnesis", specialty="general",
                                           title="Owned", body="text", tenant_id=None, created_by=user)
        db.add_all([
            personal, untouched, standard, owned_standard,
            JoinCode(uuid=personal_code_id, code="personal-code", doctor_user_id=user, doctor_label="Doc",
                     workspace="personal", tenant_id=None),
            JoinCode(uuid=clinic_code_id, code="clinic-code", doctor_user_id=user, doctor_label="Doc",
                     workspace="organization", tenant_id=clinic, organization_name="Клиника"),
            OwnerAccount(uuid=account_id, name="Owner", phone="1", doctor_user_id=user,
                         join_code_uuid=personal_code_id, workspace="personal", tenant_id=None),
            JoinCode(uuid=solo_code_id, code="solo-code", doctor_user_id=solo, doctor_label="Solo",
                     workspace="personal", tenant_id=None),
            OwnerAccount(uuid=solo_account_id, name="Solo owner", phone="2", doctor_user_id=solo,
                         join_code_uuid=solo_code_id, workspace="personal", tenant_id=None),
        ])
        db.commit()
        personal_id, untouched_id = personal.uuid, untouched.uuid
        standard_id, owned_id = standard.uuid, owned_standard.uuid
    with Session(engine) as db:
        rehome_personal_rows(db, user, clinic, organization_name="Клиника")
        rehome_personal_rows(db, solo, clinic, organization_name="Клиника Соло")
    with Session(engine) as db:
        with monkeypatch.context() as patch:
            execute = db.execute

            def read_only(statement, *args, **kwargs):
                assert statement.is_select
                return execute(statement, *args, **kwargs)

            def unexpected_commit():
                pytest.fail("A completed rehome must not commit")

            patch.setattr(db, "execute", read_only)
            patch.setattr(db, "commit", unexpected_commit)
            rehome_personal_rows(db, user, clinic, organization_name="Клиника")
        assert db.get(Client, personal_id).tenant_id == clinic
        assert db.get(Client, untouched_id).tenant_id is None
        assert db.get(EncounterTemplate, standard_id).tenant_id is None
        assert db.get(EncounterTemplate, standard_id).created_by is None
        assert db.get(EncounterTemplate, owned_id).tenant_id is None
        assert db.get(JoinCode, personal_code_id) is None
        moved = db.get(OwnerAccount, account_id)
        assert moved.join_code_uuid == clinic_code_id
        assert moved.tenant_id == clinic and moved.workspace == "organization"
        solo_row = db.get(JoinCode, solo_code_id)
        assert solo_row.tenant_id == clinic and solo_row.workspace == "organization"
        assert solo_row.organization_name == "Клиника Соло"
        assert db.get(OwnerAccount, solo_account_id).tenant_id == clinic
        assert db.get(OwnerAccount, solo_account_id).workspace == "organization"
    with pytest.raises(HTTPException) as missing:
        with TenantSession(bind=engine, expire_on_commit=False) as db:
            db.info.update(tenant_id=None, user_id=str(user))
            db.scalars(select(Client)).all()
    assert missing.value.status_code == 403
    assert missing.value.detail == "Клиника недоступна"
    with scoped(engine, clinic, user) as db:
        assert db.get(Client, personal_id).name == "Personal"
        assert db.get(Client, untouched_id) is None
        assert db.get(EncounterTemplate, owned_id) is None
        loaded = db.get(EncounterTemplate, standard_id)
        assert loaded.title == "Standard"
        loaded.title = "Changed"
        with pytest.raises(HTTPException):
            db.commit()


def test_verified_doctor_receives_one_clinic_named_from_the_profile(bff, monkeypatch):
    calls = []
    profile = {"user_id": "11111111-1111-4111-8111-111111111111", "email": "solo@example.com",
               "display_name": "Доктор", "account_status": "active", "email_verified": True}

    def remote(method, path, body=None, token=None):
        calls.append((method, path, body))
        if path == "/auth/login":
            return httpx.Response(200, json=pair())
        if path == "/auth/refresh":
            return httpx.Response(200, json=pair("access-2", "refresh-2"))
        if path == "/organizations" and method == "POST":
            assert body == {"name": "Доктор"}
            profile["organization"] = {"org_id": "33333333-3333-4333-8333-333333333333", "name": "Доктор",
                                       "status": "active", "org_role": "owner"}
            return httpx.Response(201, json=profile["organization"])
        if path == "/me":
            return httpx.Response(200, json=profile)
        pytest.fail(path)

    monkeypatch.setattr(auth, "upstream", remote)
    assert bff.post("/auth-service/auth/login", json={}).status_code == 200
    created = bff.get("/auth-service/me")
    assert created.status_code == 200
    assert created.json()["organization"]["org_role"] == "owner"
    assert created.json()["organization"]["name"] == "Доктор"
    assert bff.get("/auth-service/me").status_code == 200
    assert [call for call in calls if call[1] == "/organizations"] == [("POST", "/organizations", {"name": "Доктор"})]


def test_empty_display_name_uses_email_and_creation_errors_stay_upstream(bff, monkeypatch):
    def remote(method, path, body=None, token=None):
        if path == "/auth/login":
            return httpx.Response(200, json=pair())
        if path == "/auth/refresh":
            return httpx.Response(200, json=pair("access-2", "refresh-2"))
        if path == "/organizations" and method == "POST":
            assert body == {"name": "solo@example.com"}
            return httpx.Response(429, json={"detail": "Too many organization creation attempts"})
        if path == "/me":
            return httpx.Response(200, json={
                "user_id": "11111111-1111-4111-8111-111111111111", "email": "solo@example.com",
                "display_name": "", "account_status": "active", "email_verified": True})
        pytest.fail(path)

    monkeypatch.setattr(auth, "upstream", remote)
    assert bff.post("/auth-service/auth/login", json={}).status_code == 200
    denied = bff.get("/auth-service/me")
    assert denied.status_code == 429
    assert denied.json()["detail"] == "Too many organization creation attempts"

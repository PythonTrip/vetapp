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
    monkeypatch.setattr(auth, "ensure_clinic_link", lambda request, user: None)
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


def test_telegram_cabinet_survives_when_clinic_link_belongs_to_another_doctor(engine, monkeypatch):
    from datetime import datetime, timezone

    from fastapi import Request
    from sqlalchemy import func
    from starlette.responses import Response

    from vetdietderm_api.chat import repository as chat
    from vetdietderm_api.chat.models import ChatMessage, ChatThread
    from vetdietderm_api.ids import uuid6
    from vetdietderm_api.owners import repository as owners
    from vetdietderm_api.owners.models import (
        ClinicLink, JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration, TelegramIdentity,
    )
    from vetdietderm_api.owners.router import telegram_exchange
    from vetdietderm_api.owners.schemas import TelegramLogin
    from vetdietderm_api.settings import Settings
    from vetdietderm_api.tenancy import rehome_personal_rows
    from vetdietderm_api.visits import repository as visits
    from vetdietderm_api.visits.models import VisitRequest

    monkeypatch.setattr("vetdietderm_api.owners.router.get_settings",
                        lambda: Settings(DATABASE_URL="sqlite://", FRONTEND_URL="http://testserver"))
    doctor, other, stranger = uuid4(), uuid4(), uuid4()
    clinic, elsewhere = uuid4(), uuid4()
    personal_code_id, clinic_code_id, stranger_code_id = uuid6(), uuid6(), uuid6()
    account_id, conflict_id, kept_id, stranger_id = uuid6(), uuid6(), uuid6(), uuid6()
    animal_id, registration_id, thread_id = uuid6(), uuid6(), uuid6()
    message_id, visit_id, elsewhere_id = uuid6(), uuid6(), uuid6()
    with Session(engine) as db:
        db.add_all([
            JoinCode(uuid=personal_code_id, code="personal-code", doctor_user_id=doctor, doctor_label="Doc",
                     workspace="personal", tenant_id=None),
            JoinCode(uuid=clinic_code_id, code="clinic-code", doctor_user_id=other, doctor_label="Other",
                     workspace="organization", tenant_id=clinic, organization_name="Клиника"),
            ClinicLink(clinic_id=clinic, code="clinic-code"),
            OwnerAccount(uuid=account_id, name="Owner", phone="1", doctor_user_id=doctor,
                         join_code_uuid=personal_code_id, workspace="personal", tenant_id=None),
            OwnerRegistration(uuid=registration_id, owner_account_uuid=account_id),
            OwnerAnimal(uuid=animal_id, registration_uuid=registration_id, name="Кот", species="cat"),
            ChatThread(uuid=thread_id, owner_animal_uuid=animal_id),
            ChatMessage(uuid=message_id, thread_uuid=thread_id, author_kind="owner", author_id=account_id,
                        author_label="Owner", body="Раньше чесался"),
            VisitRequest(uuid=visit_id, owner_account_uuid=account_id, owner_animal_uuid=animal_id,
                         visit_type="primary", reason="Осмотр", proposed_starts_at=datetime.now(timezone.utc),
                         answers=[]),
            TelegramIdentity(telegram_user_id="111", tenant_id=None, owner_account_uuid=account_id),
            OwnerAccount(uuid=conflict_id, name="Conflict", phone="2", doctor_user_id=doctor,
                         join_code_uuid=personal_code_id, workspace="personal", tenant_id=None),
            TelegramIdentity(telegram_user_id="333", tenant_id=None, owner_account_uuid=conflict_id),
            OwnerAccount(uuid=kept_id, name="Kept", phone="3", doctor_user_id=other,
                         join_code_uuid=clinic_code_id, workspace="organization", tenant_id=clinic),
            TelegramIdentity(telegram_user_id="333", tenant_id=clinic, owner_account_uuid=kept_id),
            JoinCode(uuid=stranger_code_id, code="stranger-code", doctor_user_id=stranger, doctor_label="Stranger",
                     workspace="personal", tenant_id=None),
            OwnerAccount(uuid=stranger_id, name="Stranger", phone="4", doctor_user_id=stranger,
                         join_code_uuid=stranger_code_id, workspace="personal", tenant_id=None),
            TelegramIdentity(telegram_user_id="777", tenant_id=None, owner_account_uuid=stranger_id),
            Client(uuid=elsewhere_id, name="Elsewhere", tenant_id=elsewhere, created_by=other),
        ])
        db.commit()

    def population(db):
        return (
            db.scalar(select(func.count()).select_from(OwnerAccount)),
            db.scalar(select(func.count()).select_from(TelegramIdentity)),
        )

    with Session(engine) as db:
        rehome_personal_rows(db, doctor, clinic, organization_name="Клиника")
        moved = db.get(OwnerAccount, account_id)
        assert moved.uuid == account_id
        assert moved.join_code_uuid == clinic_code_id
        assert moved.tenant_id == clinic and moved.workspace == "organization"
        assert db.get(TelegramIdentity, account_id).tenant_id == clinic
        assert db.get(JoinCode, personal_code_id) is None
        link = db.get(ClinicLink, clinic)
        canonical = db.scalar(select(JoinCode).where(JoinCode.code == link.code))
        assert link.code == "clinic-code"
        assert canonical.uuid == clinic_code_id and canonical.doctor_user_id == other
        assert db.get(OwnerAccount, conflict_id).tenant_id == clinic
        conflict = db.get(TelegramIdentity, conflict_id)
        assert conflict.owner_account_uuid == conflict_id and conflict.tenant_id is None
        kept = db.get(TelegramIdentity, kept_id)
        assert kept.owner_account_uuid == kept_id and kept.tenant_id == clinic and kept.telegram_user_id == "333"
        assert db.get(OwnerAccount, stranger_id).tenant_id is None
        assert db.get(OwnerAccount, stranger_id).join_code_uuid == stranger_code_id
        assert db.get(TelegramIdentity, stranger_id).tenant_id is None
        assert db.get(Client, elsewhere_id).tenant_id == elsewhere
        before = population(db)
        result = telegram_exchange(
            TelegramLogin(code="clinic-code", init_data="signed"),
            Request({"type": "http", "path": "/owner/telegram/login", "headers": [], "method": "POST"}),
            Response(), db, link=False, verified=("111", "digest-cabinet", time.time() + 60))
        assert result["uuid"] == account_id
        owner = db.get(OwnerAccount, account_id)
        assert [animal.name for animal in owners.list_animals(db, owner)] == ["Кот"]
        messages = chat.list_messages(db, chat.owner_target(db, owner, animal_id), owner_view=True)
        assert messages[0].body == "Раньше чесался" and messages[0].uuid == message_id
        assert visits.owner_list(db, owner, animal_id)[0].reason == "Осмотр"
        assert population(db) == before
        rehome_personal_rows(db, doctor, clinic, organization_name="Клиника")
        assert population(db) == before
        assert db.get(TelegramIdentity, kept_id).owner_account_uuid == kept_id
        assert db.get(TelegramIdentity, stranger_id).tenant_id is None
        assert db.get(OwnerAccount, stranger_id).join_code_uuid == stranger_code_id
        assert db.get(Client, elsewhere_id).tenant_id == elsewhere
        assert db.get(ClinicLink, clinic).code == "clinic-code"


def test_promoted_personal_code_keeps_the_telegram_identity(engine):
    from sqlalchemy import func

    from vetdietderm_api.ids import uuid6
    from vetdietderm_api.owners.models import JoinCode, OwnerAccount, TelegramIdentity
    from vetdietderm_api.tenancy import rehome_personal_rows

    doctor, clinic = uuid4(), uuid4()
    code_id, account_id = uuid6(), uuid6()
    with Session(engine) as db:
        db.add_all([
            JoinCode(uuid=code_id, code="solo-code", doctor_user_id=doctor, doctor_label="Solo",
                     workspace="personal", tenant_id=None),
            OwnerAccount(uuid=account_id, name="Solo owner", phone="1", doctor_user_id=doctor,
                         join_code_uuid=code_id, workspace="personal", tenant_id=None),
            TelegramIdentity(telegram_user_id="111", tenant_id=None, owner_account_uuid=account_id),
        ])
        db.commit()
    with Session(engine) as db:
        rehome_personal_rows(db, doctor, clinic, organization_name="Соло")
        code = db.get(JoinCode, code_id)
        assert code.tenant_id == clinic and code.workspace == "organization"
        assert code.organization_name == "Соло"
        owner = db.get(OwnerAccount, account_id)
        assert owner.join_code_uuid == code_id and owner.tenant_id == clinic
        identity = db.get(TelegramIdentity, account_id)
        assert identity.tenant_id == clinic and identity.telegram_user_id == "111"
        before = (
            db.scalar(select(func.count()).select_from(OwnerAccount)),
            db.scalar(select(func.count()).select_from(TelegramIdentity)),
            db.scalar(select(func.count()).select_from(JoinCode)),
        )
        rehome_personal_rows(db, doctor, clinic, organization_name="Соло")
        assert (
            db.scalar(select(func.count()).select_from(OwnerAccount)),
            db.scalar(select(func.count()).select_from(TelegramIdentity)),
            db.scalar(select(func.count()).select_from(JoinCode)),
        ) == before
        assert db.get(TelegramIdentity, account_id).owner_account_uuid == account_id
        assert db.get(OwnerAccount, account_id).uuid == account_id


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


@pytest.fixture
def clinic_transfer(bff, engine, monkeypatch):
    from vetdietderm_api.assessments.models import DietPlan
    from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem
    from vetdietderm_api.encounter_templates.models import EncounterTemplate
    from vetdietderm_api.owners.models import ClinicBot, ClinicLink, JoinCode

    user, source, destination, other = uuid4(), uuid4(), uuid4(), uuid4()
    state = dict(user=user, source=source, destination=destination, other=other,
                 accepted=False, closed=False, fault=None, missing=False, changed=False, calls=[])

    def remote(method, path, body=None, token=None):
        state["calls"].append((method, path))
        if path == "/auth/login":
            return httpx.Response(200, json=pair())
        if path == "/auth/refresh":
            if state["fault"] == "refresh":
                state["fault"] = None
                return httpx.Response(503, json={"detail": "offline"})
            return httpx.Response(200, json=pair("new-access", "new-refresh"))
        if path == "/me":
            profile = {
                "user_id": str(state["user"]), "email": f"{state['user']}@example.com",
                "email_verified": True, "account_status": "active",
            }
            if not state.get("no_source"):
                org = destination if state["closed"] else source
                profile["organization"] = {
                    "org_id": str(org), "name": "Clinic", "status": "active",
                    "org_role": "member" if state["closed"] else "owner"}
            return httpx.Response(200, json=profile)
        if path == "/me/organizations":
            if state.get("no_source"):
                return httpx.Response(200, json={"organizations": []})
            rows = []
            if not state["closed"]:
                rows.append(dict(organization_id=str(source), status="active", org_role="owner"))
            if state["accepted"] and not state["missing"]:
                rows.append(dict(organization_id=str(other if state["changed"] else destination),
                                 status="active", org_role="member"))
            return httpx.Response(200, json={"organizations": rows})
        if path == "/invites/accept":
            assert not state["accepted"], "A consumed invitation must never be accepted again"
            state["accepted"] = True
            if state["fault"] == "accept":
                state["fault"] = None
                raise HTTPException(503, "lost acceptance response")
            return httpx.Response(200, json={"user_id": str(user), "org_role": "member"})
        if method == "DELETE" and path == f"/organizations/{source}":
            if state["fault"] == "close":
                state["fault"] = None
                return httpx.Response(503, json={"detail": "offline"})
            state["closed"] = True
            if state["fault"] == "close_response":
                state["fault"] = None
                raise HTTPException(503, "lost close response")
            return httpx.Response(204)
        pytest.fail(f"Unexpected upstream call: {method} {path}")

    monkeypatch.setattr(auth, "upstream", remote)
    ids = {}
    with Session(engine) as db:
        for name, tenant, author, scope in [
            ("template", source, user, "doctor"), ("standard", None, None, "standard"),
            ("destination_template", destination, other, "clinic"), ("other_template", source, other, "clinic"),
        ]:
            row = EncounterTemplate(title=name, body="body", section="history", specialty="derm",
                                    scope=scope, tenant_id=tenant, created_by=author)
            db.add(row)
            db.flush()
            ids[name] = row.uuid
        item = ClinicalCatalogItem(kind="field", scope="doctor", key="custom", label="Custom",
                                   tenant_id=source, created_by=user)
        plan = DietPlan(name="Reusable", ration_json=[], assessment_snapshot_json={},
                        tenant_id=source, created_by=user)
        db.add_all([item, plan])
        for clinic, author, code in [(source, user, "source"), (destination, other, "destination")]:
            db.add(JoinCode(code=code, doctor_user_id=author, doctor_label="Doctor",
                            workspace="organization", tenant_id=clinic))
            db.flush()
            db.add_all([ClinicBot(clinic_id=clinic, token=f"fixture-{code}", status="connected"),
                        ClinicLink(clinic_id=clinic, code=code)])
        db.commit()
        ids.update(item=item.uuid, plan=plan.uuid)
    state["ids"] = ids
    assert bff.post("/auth-service/auth/login", json={}).status_code == 200
    return state


def assert_transfer_rows(engine, state, *, complete):
    from vetdietderm_api.assessments.models import DietPlan
    from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem
    from vetdietderm_api.encounter_templates.models import EncounterTemplate
    from vetdietderm_api.owners.models import ClinicBot, ClinicLink

    ids, source, destination = state["ids"], state["source"], state["destination"]
    with Session(engine) as db:
        transfer = db.scalar(select(auth.ClinicInviteTransfer))
        assert transfer.phase == "done" if complete else transfer.phase != "done"
        for model, name in [(EncounterTemplate, "template"), (ClinicalCatalogItem, "item"), (DietPlan, "plan")]:
            row = db.get(model, ids[name])
            assert row.tenant_id == (destination if complete else source)
            if hasattr(row, "scope"):
                assert row.scope == ("clinic" if complete else "doctor")
        assert db.get(EncounterTemplate, ids["standard"]).tenant_id is None
        assert db.get(EncounterTemplate, ids["destination_template"]).tenant_id == destination
        assert db.get(EncounterTemplate, ids["other_template"]).tenant_id == source
        for model in (ClinicBot, ClinicLink):
            assert (db.get(model, source) is None) == complete
            assert db.get(model, destination) is not None
        # Only a one-way digest is retained; neither request nor credential is stored.
        values = str(transfer.__dict__)
        assert "invite-secret" not in values and "refresh-1" not in values and "access-1" not in values


@pytest.mark.parametrize("fault", ["accept", "close", "close_response", "refresh", "commit"])
@pytest.mark.parametrize("recovery", ["session", "request"])
def test_clinic_transfer_recovers_after_restart(bff, engine, monkeypatch, clinic_transfer, fault, recovery):
    from sqlalchemy.exc import OperationalError

    state = clinic_transfer
    state["fault"] = fault
    original_commit = Session.commit

    def failing_commit(db):
        if state["fault"] == "commit" and any(
            isinstance(row, auth.ClinicInviteTransfer) and row.phase == "done" for row in db.dirty
        ):
            state["fault"] = None
            raise OperationalError("injected commit failure", {}, Exception("offline"))
        return original_commit(db)

    monkeypatch.setattr(Session, "commit", failing_commit)
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 503
    assert_transfer_rows(engine, state, complete=False)
    # Fresh application, session factory and browser session: no process-local progress.
    monkeypatch.setattr(auth, "get_session_factory", lambda: sessionmaker(bind=engine, expire_on_commit=False))
    app = FastAPI()
    app.include_router(auth.router)
    with TestClient(app, headers={"X-Vetapp-CSRF": "1"}) as restarted:
        assert restarted.post("/auth-service/auth/login", json={}).status_code == 200
        recovered = (restarted.get("/auth-service/me") if recovery == "session" else
                     restarted.post("/auth-service/invites/accept", json={"token": "invite-secret"}))
        assert recovered.status_code == 200, recovered.text
        assert restarted.get("/auth-service/me").json()["organization"]["org_id"] == str(state["destination"])
        assert_transfer_rows(engine, state, complete=True)
        assert restarted.post("/auth-service/invites/accept", json={"token": "invite-secret"}).status_code == 200
    assert state["calls"].count(("POST", "/invites/accept")) == 1


def test_clinic_transfer_does_not_trust_a_client_destination(bff, engine, clinic_transfer):
    state = clinic_transfer
    result = bff.post("/auth-service/invites/accept", json={
        "token": "invite-secret", "destination_id": str(state["other"]), "tenant_id": str(state["other"])})
    assert result.status_code == 200
    assert_transfer_rows(engine, state, complete=True)


def test_clinic_transfer_requires_durable_progress_before_accept(bff, engine, monkeypatch, clinic_transfer):
    from sqlalchemy.exc import OperationalError

    original = Session.commit

    def fail_progress(db):
        if any(isinstance(row, auth.ClinicInviteTransfer) for row in db.new):
            raise OperationalError("injected progress failure", {}, Exception("offline"))
        return original(db)

    monkeypatch.setattr(Session, "commit", fail_progress)
    assert bff.post("/auth-service/invites/accept", json={"token": "invite-secret"}).status_code == 503
    assert not clinic_transfer["accepted"] and not clinic_transfer["closed"]
    with Session(engine) as db:
        assert db.scalar(select(auth.ClinicInviteTransfer)) is None


def test_clinic_transfer_waits_for_unambiguous_acceptance_evidence(bff, engine, monkeypatch, clinic_transfer):
    state = clinic_transfer
    state["fault"] = "accept"
    assert bff.post("/auth-service/invites/accept", json={"token": "invite-secret"}).status_code == 503
    original = auth.upstream

    def ambiguous(*args, **kwargs):
        result = original(*args, **kwargs)
        if args[1] == "/me/organizations":
            data = result.json()
            data["organizations"].append(dict(organization_id=str(state["other"]), status="active", org_role="member"))
            return httpx.Response(200, json=data)
        return result

    monkeypatch.setattr(auth, "upstream", ambiguous)
    assert bff.get("/auth-service/me").status_code == 503
    assert not state["closed"]
    assert_transfer_rows(engine, state, complete=False)
    monkeypatch.setattr(auth, "upstream", original)
    assert bff.get("/auth-service/me").status_code == 200
    assert_transfer_rows(engine, state, complete=True)


def test_clinic_transfer_requires_membership_api_before_mutation(bff, engine, monkeypatch, clinic_transfer):
    original = auth.upstream

    def unavailable(*args, **kwargs):
        if args[1] == "/me/organizations":
            return httpx.Response(404, json={"detail": "Not Found"})
        return original(*args, **kwargs)

    monkeypatch.setattr(auth, "upstream", unavailable)
    assert bff.post("/auth-service/invites/accept", json={"token": "invite-secret"}).status_code == 503
    assert not clinic_transfer["accepted"] and not clinic_transfer["closed"]
    with Session(engine) as db:
        assert db.scalar(select(auth.ClinicInviteTransfer)) is None


@pytest.mark.parametrize("change", ["missing", "changed", "user"])
def test_clinic_transfer_cannot_be_redirected(bff, engine, clinic_transfer, change):
    state = clinic_transfer
    state["fault"] = "refresh"
    assert bff.post("/auth-service/invites/accept", json={"token": "invite-secret"}).status_code == 503
    if change == "user":
        state["user"] = uuid4()
    else:
        state[change] = True
    assert bff.post("/auth-service/auth/login", json={}).status_code == 200
    result = bff.get("/auth-service/me")
    assert result.status_code == (200 if change == "user" else 503)
    assert_transfer_rows(engine, state, complete=False)
    assert state["calls"].count(("POST", "/invites/accept")) == 1


@pytest.mark.parametrize("populated", ["patient", "owner", "authority"])
def test_clinic_transfer_refuses_before_acceptance(bff, engine, monkeypatch, clinic_transfer, populated):
    from vetdietderm_api.owners.models import OwnerAccount

    state = clinic_transfer
    with Session(engine) as db:
        if populated == "patient":
            client = Client(name="Owner", tenant_id=state["source"], created_by=state["user"])
            db.add(client)
            db.flush()
            db.add(Patient(name="Patient", species="dog", client_uuid=client.uuid, tenant_id=state["source"]))
        elif populated == "owner":
            db.add(OwnerAccount(name="Owner", phone="1", tenant_id=state["source"]))
        db.commit()
    if populated == "authority":
        upstream = auth.upstream

        def viewer(*args, **kwargs):
            result = upstream(*args, **kwargs)
            if args[1] == "/me/organizations":
                payload = result.json()
                payload["organizations"][0]["org_role"] = "admin"
                return httpx.Response(200, json=payload)
            return result

        monkeypatch.setattr(auth, "upstream", viewer)
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 409
    assert not state["accepted"] and not state["closed"]
    with Session(engine) as db:
        assert db.scalar(select(auth.ClinicInviteTransfer)) is None


def add_attributed_personal_record(engine, state, kind):
    from vetdietderm_api.owners.models import JoinCode, OwnerAccount

    with Session(engine) as db:
        if kind == "patient":
            client = Client(name="Personal client", tenant_id=None, created_by=state["user"])
            db.add(client)
            db.flush()
            row = Patient(name="Personal pet", species="dog", client_uuid=client.uuid,
                          tenant_id=None, created_by=state["user"])
        else:
            code = JoinCode(code="personal-legacy", doctor_user_id=state["user"], doctor_label="Doc",
                            workspace="personal", tenant_id=None)
            db.add(code)
            db.flush()
            row = OwnerAccount(name="Personal owner", phone="9", doctor_user_id=state["user"],
                               join_code_uuid=code.uuid, workspace="personal", tenant_id=None)
        db.add(row)
        db.commit()
        return row.uuid


@pytest.mark.parametrize("kind", ["patient", "owner"])
@pytest.mark.parametrize("no_source", [False, True])
def test_personal_records_refuse_invite_before_clinical_request(bff, engine, clinic_transfer, kind, no_source):
    from starlette.requests import Request
    from vetdietderm_api.owners.models import ClinicBot, ClinicLink, OwnerAccount

    state = clinic_transfer
    state["no_source"] = no_source
    row_id = add_attributed_personal_record(engine, state, kind)
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 409
    assert result.json()["detail"] == auth.EMPTY_CLINIC_REFUSAL
    assert ("POST", "/invites/accept") not in state["calls"]
    assert not any(method == "DELETE" for method, _path in state["calls"])
    assert not state["accepted"] and not state["closed"]
    with Session(engine) as db:
        assert db.scalar(select(auth.ClinicInviteTransfer)) is None
        if kind == "patient":
            row = db.get(Patient, row_id)
            assert row.tenant_id is None and row.created_by == state["user"]
        else:
            assert db.get(OwnerAccount, row_id).tenant_id is None
        if not no_source:
            assert db.get(ClinicBot, state["source"]).token == "fixture-source"
            assert db.get(ClinicLink, state["source"]) is not None
            assert db.get(ClinicBot, state["destination"]).token == "fixture-destination"
    if no_source:
        return
    # The refused invite leaves the source clinic selected, so the next clinical read stays there.
    auth.require_clinical_access(Request({
        "type": "http", "path": "/patients", "method": "GET", "headers": [],
    }), {
        "user_id": str(state["user"]),
        "organization": {"org_id": str(state["source"]), "name": "Clinic", "status": "active", "org_role": "owner"},
    })
    kept = Patient if kind == "patient" else OwnerAccount
    with Session(engine) as db:
        assert db.get(kept, row_id).tenant_id == state["source"]
    assert ("POST", "/invites/accept") not in state["calls"]
    assert not any(method == "DELETE" for method, _path in state["calls"])


def test_invite_without_source_accepts_when_personal_workspace_is_empty(bff, engine, clinic_transfer):
    state = clinic_transfer
    state["no_source"] = True
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 200
    assert state["accepted"] and not state["closed"]
    assert state["calls"].count(("POST", "/invites/accept")) == 1
    assert not any(method == "DELETE" for method, _path in state["calls"])
    with Session(engine) as db:
        assert db.scalar(select(auth.ClinicInviteTransfer)) is None


def test_unrelated_personal_records_do_not_block_invite(bff, engine, clinic_transfer):
    from vetdietderm_api.owners.models import JoinCode, OwnerAccount

    state = clinic_transfer
    other = state["other"]
    with Session(engine) as db:
        client = Client(name="Other client", tenant_id=None, created_by=other)
        db.add(client)
        db.flush()
        patient = Patient(name="Other pet", species="dog", client_uuid=client.uuid,
                          tenant_id=None, created_by=other)
        code = JoinCode(code="other-personal", doctor_user_id=other, doctor_label="Other",
                        workspace="personal", tenant_id=None)
        db.add(code)
        db.flush()
        owner = OwnerAccount(name="Other owner", phone="8", doctor_user_id=other,
                             join_code_uuid=code.uuid, workspace="personal", tenant_id=None)
        db.add_all([patient, owner])
        db.commit()
        patient_id, owner_id = patient.uuid, owner.uuid
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 200
    assert_transfer_rows(engine, state, complete=True)
    with Session(engine) as db:
        assert db.get(Patient, patient_id).tenant_id is None
        assert db.get(OwnerAccount, owner_id).tenant_id is None
        assert db.get(Patient, patient_id).created_by == other


def test_reusable_personal_records_pass_emptiness_check(bff, engine, clinic_transfer):
    from vetdietderm_api.assessments.models import DietPlan
    from vetdietderm_api.clinical_catalog.models import ClinicalCatalogItem
    from vetdietderm_api.encounter_templates.models import EncounterTemplate

    state = clinic_transfer
    with Session(engine) as db:
        template = EncounterTemplate(title="Personal template", body="body", section="history", specialty="derm",
                                     scope="doctor", tenant_id=None, created_by=state["user"])
        item = ClinicalCatalogItem(kind="field", scope="doctor", key="personal-field", label="Field",
                                   tenant_id=None, created_by=state["user"])
        plan = DietPlan(name="Patientless", ration_json=[], assessment_snapshot_json={},
                        tenant_id=None, created_by=state["user"])
        db.add_all([template, item, plan])
        db.commit()
        ids = (template.uuid, item.uuid, plan.uuid)
    result = bff.post("/auth-service/invites/accept", json={"token": "invite-secret"})
    assert result.status_code == 200
    assert_transfer_rows(engine, state, complete=True)
    with Session(engine) as db:
        for model, row_id in zip((EncounterTemplate, ClinicalCatalogItem, DietPlan), ids, strict=True):
            assert db.get(model, row_id).tenant_id is None


def test_clinic_transfer_migration_persists_without_original_engine(tmp_path):
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = Path(__file__).parents[1] / "alembic/versions/0038_clinic_invite_transfers.py"
    spec = importlib.util.spec_from_file_location("transfer_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    url = f"sqlite:///{tmp_path / 'transfer.db'}"
    first = create_engine(url)
    with first.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
    user, source = uuid4(), uuid4()
    with Session(first) as db:
        db.add(auth.ClinicInviteTransfer(user_id=user, invite_hash="a" * 64, source_id=source,
                                        membership_ids=[str(source)], phase="accepting"))
        db.commit()
    first.dispose()
    second = create_engine(url)
    with Session(second) as db:
        row = db.get(auth.ClinicInviteTransfer, (user, "a" * 64))
        assert row.source_id == source and row.membership_ids == [str(source)] and row.phase == "accepting"
    with second.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.downgrade()
    second.dispose()

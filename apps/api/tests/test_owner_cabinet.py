"""Exercise owner identity boundaries against an isolated store, without external auth."""
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from vetdietderm_api import auth
from vetdietderm_api.db import Base
from vetdietderm_api.main import create_app
from vetdietderm_api.owners import repository as repo
from vetdietderm_api.owners import router as owners
from vetdietderm_api.owners.models import OwnerAccount, OwnerRegistration, OwnerSession, StaffEmailReservation
from vetdietderm_api.patients.models import Client, Patient


@compiles(JSONB, "sqlite")
def jsonb_sqlite(_type, _compiler, **_kw):
    return "JSON"


@pytest.fixture
def cabinet(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    from vetdietderm_api import db as database
    monkeypatch.setattr(database, "get_engine", lambda: engine)
    for module in (auth, owners):
        monkeypatch.setattr(module, "get_session_factory", lambda: factory)
        monkeypatch.setattr(module, "get_settings", lambda: SimpleNamespace(
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
        pytest.fail(f"Unexpected authority call: {path}")
    monkeypatch.setattr(auth, "upstream", remote)
    app = create_app()
    headers = {"X-Vetapp-CSRF": "1", "Origin": "http://testserver"}
    with TestClient(app, headers=headers) as staff, TestClient(app, headers=headers) as owner:
        staff.post("/auth-service/auth/login", json={})
        yield staff, owner, factory, user
    engine.dispose()


def register(owner, code, email="owner@example.com"):
    return owner.post("/owner/register", json=dict(code=code, name="Владелец", email=email,
                                                   phone="+7 900 111 22 33", password=" password with spaces "))


def test_stable_workspace_codes_preview_and_label_refresh(cabinet):
    staff, owner, _, user = cabinet
    personal = staff.get("/join-codes/current").json()
    assert personal["link"] == f"http://testserver/join/{personal['code']}"
    assert personal == staff.get("/join-codes/current").json()
    org = staff.get("/join-codes/current", headers={"X-Vetapp-Workspace": "organization"}).json()
    assert org["code"] != personal["code"] and org["organization_name"] == "Клиника"
    assert staff.get("/join-codes/current").json()["code"] == personal["code"]
    user["display_name"] = "Новое имя"
    assert staff.get("/join-codes/current").json()["doctor_name"] == "Новое имя"
    assert owner.get(f"/owner/join/{personal['code']}").json() == dict(doctor_name="Новое имя", organization_name=None)
    assert owner.get("/owner/join/unknown").json() == {"detail": "Код не найден"}


def test_registration_login_profile_binding_and_cookie_boundaries(cabinet):
    staff, owner, factory, user = cabinet
    code = staff.get("/join-codes/current").json()["code"]
    result = register(owner, code, " OWNER@Example.com ")
    assert result.status_code == 201, result.text
    assert result.json()["email"] == "owner@example.com"
    assert result.json()["doctor_name"] == user["display_name"]
    cookie = result.headers["set-cookie"]
    assert "vetapp_owner_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert owner.get("/patients").status_code == 401
    assert staff.get("/owner/me").status_code == 401
    with factory() as db:
        account = db.scalar(select(OwnerAccount))
        assert account.doctor_user_id == UUID(user["user_id"])
        assert account.tenant_id is None and account.workspace == "personal"
        assert account.password_hash != " password with spaces " and account.password_salt
        assert db.scalar(select(OwnerRegistration)).status == "pending"
        assert db.scalar(select(func.count()).select_from(Client)) == 0
        assert db.scalar(select(func.count()).select_from(Patient)) == 0
    second = staff.get("/join-codes/current", headers={"X-Vetapp-Workspace": "organization"}).json()["code"]
    assert register(owner, second).status_code == 409
    assert owner.patch("/owner/me", json=dict(name="Другое имя", email="changed@example.com", phone="123")).status_code == 200
    assert owner.post("/owner/logout").status_code == 200
    assert owner.get("/owner/me").status_code == 401
    assert owner.post("/owner/login", json=dict(email="changed@example.com", password="wrong")).status_code == 401
    assert owner.post("/owner/login", json=dict(email=" Changed@Example.com ", password=" password with spaces ")).status_code == 200
    with factory() as db:
        assert db.scalar(select(OwnerAccount)).join_code_uuid == account.join_code_uuid
        assert db.scalar(select(func.count()).select_from(OwnerSession)) == 1


def test_email_collisions_and_csrf(cabinet):
    staff, owner, factory, user = cabinet
    code = staff.get("/join-codes/current").json()["code"]
    with factory() as db:
        assert db.get(StaffEmailReservation, "doctor@example.com") is not None
    assert register(owner, code, "Doctor@Example.com").json() == {"detail": repo.TAKEN_EMAIL}
    assert register(owner, code).status_code == 201
    assert staff.post("/auth-service/auth/register", json=dict(email=" OWNER@example.com ")).json() == {"detail": repo.TAKEN_EMAIL}
    owner.post("/owner/logout")
    assert register(owner, code).json() == {"detail": repo.TAKEN_EMAIL}
    assert owner.post("/owner/login", headers={"X-Vetapp-CSRF": "0"}, json={}).status_code == 403
    assert owner.post("/owner/login", headers={"Origin": "https://evil.example"}, json={}).status_code == 403


def test_owner_passports_are_isolated_and_do_not_create_clinical_rows(cabinet):
    staff, owner, factory, _ = cabinet
    code = staff.get("/join-codes/current").json()["code"]
    assert register(owner, code).status_code == 201
    assert owner.get("/owner/animals").json() == []
    minimal = owner.post("/owner/animals", json=dict(name="Тузик", species="dog"))
    assert minimal.status_code == 201, minimal.text
    animal = minimal.json()
    assert animal["sex"] == "unspecified" and animal["birth_date"] is None and animal["breed"] == ""
    full = owner.post("/owner/animals", json=dict(name="Мурка", species="cat", breed="Сибирская",
        sex="female", birth_date="2020-05-10", body_weight_kg=5, allergies=["private"], feeding_notes="private", chronic_conditions=["private"]))
    assert full.status_code == 201
    assert set(full.json()) == {"uuid", "name", "species", "breed", "sex", "birth_date"}
    edited = owner.patch(f"/owner/animals/{animal['uuid']}", json=dict(sex="male", birth_date="2021-01-02", allergies=["private"], body_weight_kg=20))
    assert edited.status_code == 200
    assert edited.json()["name"] == "Тузик" and edited.json()["sex"] == "male"
    assert set(edited.json()) == set(full.json())
    assert owner.patch(f"/owner/animals/{animal['uuid']}", json={"sex": None}).status_code == 422
    assert owner.delete(f"/owner/animals/{animal['uuid']}").status_code == 405
    assert len(owner.get("/owner/animals").json()) == 2
    owner.post("/owner/logout")
    assert register(owner, code, "another@example.com").status_code == 201
    assert owner.get("/owner/animals").json() == []
    assert owner.patch(f"/owner/animals/{animal['uuid']}", json=dict(name="stolen")).status_code == 404
    assert staff.get("/patients", params={"q": "Тузик"}).json() == []
    assert staff.get("/patients").json() == []
    assert staff.get("/clients").json() == []
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Patient)) == 0
        assert db.scalar(select(func.count()).select_from(Client)) == 0


def test_clinician_sex_and_clinical_fields_still_persist(cabinet):
    staff, _, factory, _ = cabinet
    client = staff.post("/clients", json=dict(name="Клиент")).json()
    created = staff.post("/patients", json=dict(client_uuid=client["uuid"], name="Клинический", species="cat",
        body_weight_kg=4, allergies=["рыба"], chronic_conditions=["астма"], feeding_notes="влажный корм"))
    assert created.status_code == 201, created.text
    patient = created.json()
    assert patient["sex"] == "unspecified"
    for sex in ("female", "male", "unspecified"):
        result = staff.patch(f"/patients/{patient['uuid']}", json=dict(sex=sex))
        assert result.status_code == 200, result.text
        assert result.json()["sex"] == sex and result.json()["allergies"] == ["рыба"]
    changed = staff.patch(f"/patients/{patient['uuid']}", json=dict(sex="female", body_weight_kg=4.5,
        feeding_notes="новый корм", chronic_conditions=["диабет"], allergies=["курица"]))
    assert changed.status_code == 200
    reloaded = staff.get(f"/patients/{patient['uuid']}").json()
    assert reloaded["sex"] == "female" and reloaded["body_weight_kg"] == 4.5
    assert reloaded["feeding_notes"] == "новый корм" and reloaded["allergies"] == ["курица"]
    assert reloaded["chronic_conditions"] == ["диабет"]


def pending_registration(staff, owner, workspace="personal"):
    code = staff.get("/join-codes/current", headers={"X-Vetapp-Workspace": workspace}).json()["code"]
    assert register(owner, code).status_code == 201
    animals = [owner.post("/owner/animals", json=dict(name=name, species="cat", sex="female")).json()
               for name in ("Мурка", "Муся")]
    queue = staff.get("/owner-registrations", headers={"X-Vetapp-Workspace": workspace}).json()
    assert len(queue) == 1 and queue[0]["can_accept"]
    assert queue[0]["email"] == "owner@example.com" and len(queue[0]["animals"]) == 2
    assert staff.get("/patients", params={"q": "Мурка"}).json() == []
    assert staff.get("/patients", params={"q": "Владелец"}).json() == []
    assert staff.get("/clients").json() == []
    return queue[0]["uuid"], animals


@pytest.mark.parametrize("workspace", ["personal", "organization"])
def test_accept_new_invitation_workspace_and_owner_contact(cabinet, workspace):
    staff, owner, factory, user = cabinet
    registration, animals = pending_registration(staff, owner, workspace)
    profile = dict(name="Имя перед принятием", email="new@example.com", phone="123")
    assert owner.patch("/owner/me", json=profile).status_code == 200
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(Client)) == 0
    # The selected header must not change the invitation's destination or permissions.
    result = staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"},
                        headers={"X-Vetapp-Workspace": "organization" if workspace == "personal" else "personal"})
    assert result.status_code == 200, result.text
    client_id = UUID(result.json()["client_uuid"])
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 409
    with factory() as db:
        client = db.get(Client, client_id)
        assert (client.name, client.email, client.phone) == tuple(profile.values())
        assert client.created_by == UUID(user["user_id"])
        assert client.tenant_id == (UUID(user["organization"]["org_id"]) if workspace == "organization" else None)
        registration_row = db.get(OwnerRegistration, UUID(registration))
        assert registration_row.status == "accepted" and registration_row.accepted_at
        assert len(list(db.scalars(select(Patient)))) == 2
        from vetdietderm_api.owners.models import OwnerAnimal
        assert all(row.patient_uuid for row in db.scalars(select(OwnerAnimal)))
    headers = {"X-Vetapp-Workspace": workspace}
    assert len(staff.get("/patients", params={"q": profile["name"]}, headers=headers).json()) == 2
    assert staff.get("/patients", params={"q": "Мурка"}, headers=headers).json()[0]["body_weight_kg"] is None
    assert staff.get("/owner-registrations", headers=headers).json() == []
    assert owner.patch("/owner/me", json={**profile, "phone": "456"}).status_code == 200
    assert staff.get(f"/clients/{client_id}", headers=headers).json()["phone"] == "456"
    added = owner.post("/owner/animals", json=dict(name="Новый", species="dog"))
    assert added.status_code == 201
    assert len(staff.get("/patients", params={"q": "Новый"}, headers=headers).json()) == 1
    owner.post("/owner/logout")
    code = staff.get("/join-codes/current", headers=headers).json()["code"]
    assert register(owner, code, "second@example.com").status_code == 201
    owner.post("/owner/animals", json=dict(name="Ожидающий", species="dog"))
    assert staff.get("/patients", params={"q": "Ожидающий"}, headers=headers).json() == []


def test_link_matches_preserve_clinical_data_and_expose_all_passports(cabinet):
    staff, owner, factory, _ = cabinet
    registration, animals = pending_registration(staff, owner)
    client = staff.post("/clients", json=dict(name="Существующий")).json()
    existing = [staff.post("/patients", json=dict(client_uuid=client["uuid"], name=name, species="dog",
        body_weight_kg=12, allergies=["рыба"], chronic_conditions=["астма"], feeding_notes="Корм")).json()
        for name in ("Сопоставляемый", "Ранее созданный")]
    body = dict(mode="link", client_uuid=client["uuid"], matches=[
        dict(owner_animal_id=animal["uuid"], patient_uuid=existing[0]["uuid"]) for animal in animals])
    assert staff.post(f"/owner-registrations/{registration}/accept", json=body).status_code == 422
    with factory() as db:
        assert db.get(OwnerRegistration, UUID(registration)).status == "pending"
        assert db.scalar(select(func.count()).select_from(Patient)) == 2
    body["matches"][1]["patient_uuid"] = None
    result = staff.post(f"/owner-registrations/{registration}/accept", json=body)
    assert result.status_code == 200, result.text
    passports = owner.get("/owner/animals").json()
    assert len(passports) == 3 and any(row["name"] == "Ранее созданный" for row in passports)
    assert all(set(row) == {"uuid", "name", "species", "breed", "sex", "birth_date"} for row in passports)
    assert owner.patch(f"/owner/animals/{existing[0]['uuid']}", json=dict(sex="male", body_weight_kg=99, feeding_notes="changed")).status_code == 200
    patient = staff.get(f"/patients/{existing[0]['uuid']}").json()
    assert patient["name"] == animals[0]["name"] and patient["sex"] == "male"
    assert patient["body_weight_kg"] == 12 and patient["feeding_notes"] == "Корм"
    assert patient["allergies"] == ["рыба"] and patient["chronic_conditions"] == ["астма"]
    assert len(staff.get("/patients").json()) == 3
    assert owner.patch(f"/owner/animals/{animals[0]['uuid']}", json={"sex": "male"}).status_code == 404
    other = staff.post("/clients", json=dict(name="Другой клиент")).json()
    other_patient = staff.post("/patients", json=dict(client_uuid=other["uuid"], name="Чужой", species="cat")).json()
    assert owner.patch(f"/owner/animals/{other_patient['uuid']}", json={"sex": "male"}).status_code == 404


def test_registration_permissions_and_cross_workspace_matches(cabinet):
    staff, owner, factory, user = cabinet
    registration, animals = pending_registration(staff, owner, "organization")
    headers = {"X-Vetapp-Workspace": "organization"}
    personal_client = staff.post("/clients", json=dict(name="Личный клиент")).json()
    org_client = staff.post("/clients", json=dict(name="Клиент организации"), headers=headers).json()
    user["organization"]["org_role"] = "observer"
    queue = staff.get("/owner-registrations", headers=headers).json()
    assert len(queue) == 1 and not queue[0]["can_accept"]
    for chosen_workspace in ("personal", "organization"):
        assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"},
            headers={"X-Vetapp-Workspace": chosen_workspace}).status_code == 403
    user["organization"]["org_role"] = "member"
    assert staff.post(f"/owner-registrations/{registration}/accept", json=dict(mode="link", client_uuid=personal_client["uuid"])).status_code == 404
    with factory() as db:
        assert db.get(OwnerRegistration, UUID(registration)).status == "pending"
    # An organization peer can accept another doctor's organization invitation.
    user["user_id"] = str(uuid4())
    assert staff.post(f"/owner-registrations/{registration}/accept", json=dict(mode="link", client_uuid=org_client["uuid"])).status_code == 200


def test_other_doctor_cannot_read_or_accept_personal_registration(cabinet):
    staff, owner, factory, user = cabinet
    registration, _ = pending_registration(staff, owner)
    user["user_id"] = str(uuid4())
    assert staff.get("/owner-registrations").json() == []
    assert staff.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 403
    with factory() as db:
        assert db.get(OwnerRegistration, UUID(registration)).status == "pending"


def test_invalid_animal_matches_never_partially_accept(cabinet):
    staff, owner, factory, _ = cabinet
    registration, animals = pending_registration(staff, owner)
    client = staff.post("/clients", json=dict(name="Выбранный")).json()
    other_client = staff.post("/clients", json=dict(name="Другой")).json()
    foreign_patient = staff.post("/patients", json=dict(client_uuid=other_client["uuid"], name="Чужой", species="cat")).json()
    payloads = [
        dict(mode="link"),
        dict(mode="create", client_uuid=client["uuid"]),
        dict(mode="link", client_uuid=client["uuid"], matches=[dict(owner_animal_id=str(uuid4()))]),
        dict(mode="link", client_uuid=client["uuid"], matches=[dict(owner_animal_id=animals[0]["uuid"])] * 2),
        dict(mode="link", client_uuid=client["uuid"], matches=[dict(owner_animal_id=animals[0]["uuid"], patient_uuid=foreign_patient["uuid"])]),
    ]
    for payload in payloads:
        result = staff.post(f"/owner-registrations/{registration}/accept", json=payload)
        assert result.status_code == 422, result.text
        with factory() as db:
            assert db.get(OwnerRegistration, UUID(registration)).status == "pending"
            assert db.scalar(select(func.count()).select_from(Client)) == 2
            assert db.scalar(select(func.count()).select_from(Patient)) == 1
    # Matching candidates are scoped to the selected client, with no list-window truncation.
    assert staff.get(f"/owner-registrations/{registration}/patients", params={"client_uuid": client["uuid"]}).json() == []
    assert owner.get("/owner-registrations").status_code == 401
    assert owner.post(f"/owner-registrations/{registration}/accept", json={"mode": "create"}).status_code == 401

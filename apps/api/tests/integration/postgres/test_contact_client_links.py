from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.postgres_auth_stub import CLINIC_ID, STAFF_IDS
from vetdietderm_api import auth
from vetdietderm_api.db import get_engine
from vetdietderm_api.messaging.models import ClinicContact
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.patients.models import Client, Patient

pytestmark = pytest.mark.integration
CLINIC = UUID(CLINIC_ID)
EDITOR = "editor@example.test"


def test_link_move_clear_and_create_client(postgres_database, postgres_application, staff_client, monkeypatch):
    api_app, engine = postgres_application(postgres_database)
    api_root = Path(__file__).resolve().parents[3]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "alembic"))
    command.upgrade(config, "0046_telegram_business_consumed")
    command.upgrade(config, "head")

    foreign_clinic = uuid4()
    with Session(engine) as db, db.begin():
        contact, _ = open_contact(db, CLINIC, 42, 42, "Contact", None)
        foreign_contact, _ = open_contact(db, foreign_clinic, 42, 42, "Foreign", None)
        path, foreign_path = f"/contacts/{contact.uuid}", f"/contacts/{foreign_contact.uuid}"
        first = Client(tenant_id=CLINIC, name="First", email="first@example.test", phone="123")
        second = Client(tenant_id=CLINIC, name="Second")
        foreign = Client(tenant_id=foreign_clinic, name="Foreign")
        db.add_all([first, second, foreign])
        db.flush()
        first_id, second_id, foreign_id = map(str, (first.uuid, second.uuid, foreign.uuid))
        client_count = db.scalar(select(func.count()).select_from(Client))
        patient_count = db.scalar(select(func.count()).select_from(Patient))

    upstream = auth.upstream
    profile = {"display_name": "Editor"}

    def with_profile(method, url, body=None, token=None):
        response = upstream(method, url, body, token)
        if url == "/me":
            payload = response.json()
            payload["organization"]["org_role"] = profile.get("role", "member")
            payload["display_name"] = profile["display_name"]
            return httpx.Response(200, json=payload)
        return response

    monkeypatch.setattr(auth, "upstream", with_profile)
    with staff_client(api_app, EDITOR) as staff:
        for method, kwargs in (
            ("PUT", {"json": {"client_uuid": first_id}}),
            ("POST", {}),
            ("GET", {}),
        ):
            suffix = "/link-events" if method == "GET" else "/client"
            missing = staff.request(method, foreign_path + suffix, **kwargs)
            assert missing.status_code == 404 and missing.json()["detail"] == "Запись не найдена"
        rejected = staff.put(path + "/client", json={"client_uuid": foreign_id})
        assert rejected.status_code == 404 and rejected.json()["detail"] == "Запись не найдена"
        assert staff.get(path + "/link-events").json() == []

        for client_id in (first_id, first_id, second_id, None):
            response = staff.put("/v1/staff" + path + "/client", json={"client_uuid": client_id})
            assert response.status_code == 200, response.text
            assert response.json()["client_uuid"] == client_id

        assert staff.patch(path, json={"local_name": "Current contact name"}).status_code == 200
        profile["display_name"] = ""
        created = staff.post("/v1/staff" + path + "/client")
        assert created.status_code == 201, created.text
        created_id = created.json()["client_uuid"]
        assert staff.get(path).json()["client_uuid"] == created_id

        profile["role"] = "viewer"
        for prefix in ("", "/v1/staff"):
            assert staff.put(prefix + path + "/client", json={"client_uuid": None}).status_code == 403
            assert staff.post(prefix + path + "/client").status_code == 403
            events_response = staff.get(prefix + path + "/link-events")
            assert events_response.status_code == 200, events_response.text
            events = events_response.json()
            assert [(e["previous_client_uuid"], e["new_client_uuid"]) for e in events] == [
                (None, first_id), (first_id, second_id), (second_id, None), (None, created_id),
            ]
            assert [e["actor_label"] for e in events] == ["Editor", "Editor", "Editor", EDITOR]
            assert {e["actor_user_id"] for e in events} == {STAFF_IDS[EDITOR]}
            assert {e["clinic_id"] for e in events} == {CLINIC_ID}

    with Session(engine) as db:
        first = db.get(Client, UUID(first_id))
        assert (first.name, first.email, first.phone) == ("First", "first@example.test", "123")
        created_client = db.get(Client, UUID(created_id))
        assert (created_client.tenant_id, created_client.name) == (CLINIC, "Current contact name")
        assert created_client.email is created_client.phone is None
        assert db.scalar(select(func.count()).select_from(Client)) == client_count + 1
        assert db.scalar(select(func.count()).select_from(Patient)) == patient_count


def test_concurrent_put_of_same_client_appends_one_event(api_app, staff_client):
    with Session(get_engine()) as db, db.begin():
        contact, _ = open_contact(db, CLINIC, 42, 42, None, None)
        client = Client(tenant_id=CLINIC, name="Existing client")
        db.add(client)
        db.flush()
        path, client_id = f"/contacts/{contact.uuid}", str(client.uuid)

    start = Barrier(2, timeout=10)

    def link(_attempt):
        with staff_client(api_app, EDITOR) as staff:
            start.wait()
            response = staff.put(path + "/client", json={"client_uuid": client_id})
            assert response.status_code == 200, response.text
            assert response.json()["client_uuid"] == client_id

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(link, range(2)))

    with staff_client(api_app, EDITOR) as staff:
        events = staff.get(path + "/link-events").json()
        assert [(e["previous_client_uuid"], e["new_client_uuid"]) for e in events] == [(None, client_id)]


def test_client_creation_rolls_back_when_audit_insert_fails(api_app, staff_client):
    with Session(get_engine()) as db, db.begin():
        contact, _ = open_contact(db, CLINIC, 42, 42, None, None)
        contact_id = contact.uuid
        db.execute(text("ALTER TABLE clinic_contact_link_events ADD CHECK (false)"))
        client_count = db.scalar(select(func.count()).select_from(Client))

    with staff_client(api_app, EDITOR) as staff, pytest.raises(IntegrityError):
        staff.post(f"/contacts/{contact_id}/client")

    with Session(get_engine()) as db:
        assert db.get(ClinicContact, contact_id).client_uuid is None
        assert db.scalar(select(func.count()).select_from(Client)) == client_count

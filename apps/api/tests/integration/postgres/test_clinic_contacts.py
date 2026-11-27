from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from tests.postgres_auth_stub import CLINIC_ID
from vetdietderm_api import auth
from vetdietderm_api.messaging.models import ClinicContact, ClinicConversation
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.patients.models import Client, Patient

pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[3]


def test_contact_and_conversation(postgres_database, postgres_application, staff_client, monkeypatch):
    app, engine = postgres_application(postgres_database)
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(config, "0044_drop_communications")
    command.upgrade(config, "head")

    clinic = UUID(CLINIC_ID)
    foreign_clinic = uuid4()
    with Session(engine) as db, db.begin():
        client_count = db.scalar(select(func.count()).select_from(Client))
        patient_count = db.scalar(select(func.count()).select_from(Patient))
        contact, conversation = open_contact(db, clinic, 42, 42, " Анна ", "anna")
        contact_id, conversation_id = contact.uuid, conversation.uuid
        assert contact.local_name == "Анна"
        assert contact_id.version == 6

        reopened, same_conversation = open_contact(db, clinic, 42, 123, "Updated profile", "updated")
        assert (reopened.uuid, same_conversation.uuid) == (contact_id, conversation_id)
        assert (reopened.profile_name, reopened.username) == ("Updated profile", "updated")
        assert (reopened.local_name, reopened.telegram_chat_id, reopened.client_uuid) == ("Анна", 42, None)
        assert db.scalar(select(func.count()).select_from(ClinicContact)) == 1
        assert db.scalar(select(func.count()).select_from(ClinicConversation)) == 1

        fallback, _ = open_contact(db, clinic, 43, 43, " ", " anna ")
        assert fallback.local_name == "anna"
        unnamed, _ = open_contact(db, foreign_clinic, 42, 42, None, None)
        assert unnamed.local_name == "42"
        foreign_id = unnamed.uuid
        assert db.scalar(select(func.count()).select_from(Client)) == client_count
        assert db.scalar(select(func.count()).select_from(Patient)) == patient_count

    for user_id, chat_id, constraint in (
        (42, 99, "uq_clinic_contacts_user"),
        (99, 42, "uq_clinic_contacts_chat"),
    ):
        with pytest.raises(IntegrityError) as error, Session(engine) as db, db.begin():
            db.add(ClinicContact(
                clinic_id=clinic, telegram_user_id=user_id, telegram_chat_id=chat_id, local_name="Duplicate",
            ))
        assert error.value.orig.diag.constraint_name == constraint

    path = f"/contacts/{contact_id}"
    with staff_client(app, "editor@example.test") as staff:
        listing = staff.get("/contacts")
        assert listing.status_code == 200, listing.text
        assert [item["local_name"] for item in listing.json()] == ["Анна", "anna"]
        alias = staff.get("/v1/staff/contacts")
        assert alias.status_code == 200 and alias.json() == listing.json()
        for method, body in (("GET", {}), ("PATCH", {"json": {"local_name": "Other"}})):
            missing = staff.request(method, f"/contacts/{foreign_id}", **body)
            assert missing.status_code == 404 and missing.json()["detail"] == "Запись не найдена"

        upstream = auth.upstream

        def as_viewer(method, url, body=None, token=None):
            response = upstream(method, url, body, token)
            if url == "/me":
                payload = response.json()
                payload["organization"]["org_role"] = "viewer"
                return httpx.Response(200, json=payload)
            return response

        with monkeypatch.context() as viewer:
            viewer.setattr(auth, "upstream", as_viewer)
            assert staff.get(path).status_code == 200
            for prefix in ("", "/v1/staff"):
                denied = staff.patch(prefix + path, json={"local_name": "Forbidden"})
                assert denied.status_code == 403
                message = denied.json()["error"]["message"] if prefix else denied.json()["detail"]
                assert message == "Роль наблюдателя разрешает только просмотр"

        assert staff.patch(path, json={"local_name": "  "}).status_code == 422
        assert staff.patch(path, json={"local_name": "А", "telegram_chat_id": 99}).status_code == 422
        changed = staff.patch(path, json={"local_name": " Новое имя "})
        assert changed.status_code == 200, changed.text
        saved = staff.get(path).json()
        assert saved["local_name"] == "Новое имя"
        assert (saved["telegram_user_id"], saved["telegram_chat_id"]) == (42, 42)
        assert saved["conversation_uuid"] == str(conversation_id)


def test_concurrent_open_contact(api_app):
    from vetdietderm_api.db import get_engine

    engine = get_engine()
    clinic = uuid4()
    start = Barrier(2, timeout=5)

    def open_pair(_attempt):
        with Session(engine) as db, db.begin():
            start.wait()
            contact, conversation = open_contact(db, clinic, 42, 42, None, None)
            return contact.uuid, conversation.uuid

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = pool.map(open_pair, range(2))
    assert first == second

import asyncio
from datetime import timedelta
from uuid import UUID

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from tests.postgres_auth_stub import CLINIC_ID, STAFF_IDS
from vetdietderm_api import auth
from vetdietderm_api.clock import utc_now
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.messaging.delivery import process_next_delivery
from vetdietderm_api.messaging.models import ConversationMessage
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.owners import telegram
from vetdietderm_api.owners.bot_crypto import encrypt_secret
from vetdietderm_api.owners.models import ClinicBot

pytestmark = pytest.mark.integration
CLINIC = UUID(CLINIC_ID)
BOT_ID = 12345
TOKEN = "12345:synthetic-token"
SECRET = "synthetic-webhook-secret"


@pytest.fixture
def delivery_app(monkeypatch, request):
    async def paused_worker():
        await asyncio.Event().wait()

    key = Fernet.generate_key().decode()
    monkeypatch.setenv("CLINIC_BOT_ENCRYPTION_KEY", key)
    monkeypatch.setenv("TELEGRAM_PUBLIC_BASE_URL", "https://clinic.example.test")
    app = request.getfixturevalue("api_app")
    from vetdietderm_api import main

    monkeypatch.setattr(main, "run_delivery_worker", paused_worker)
    with get_session_factory().begin() as db:
        db.add(ClinicBot(
            clinic_id=CLINIC, bot_id=BOT_ID, status="connected",
            token=encrypt_secret(TOKEN, key), webhook_secret_ciphertext=encrypt_secret(SECRET, key),
        ))
    return app


def _contact(chat_id, *, bot_id=BOT_ID, origin="telegram"):
    with get_session_factory().begin() as db:
        contact, conversation = open_contact(db, CLINIC, chat_id, chat_id, None, None)
        db.add(ConversationMessage(
            clinic_id=CLINIC, conversation_uuid=conversation.uuid, direction="inbound",
            channel="telegram", origin=origin, occurred_at=utc_now(), bot_id=bot_id,
        ))
        return f"/contacts/{contact.uuid}/messages"


def _send(staff, path, key, **kwargs):
    return staff.post(path, headers={"Idempotency-Key": key}, **kwargs)


def _stored(message_id):
    with get_session_factory()() as db:
        return db.get(ConversationMessage, UUID(message_id))


def test_staff_composition_and_send_gate(delivery_app, staff_client, monkeypatch):
    path = _contact(42)
    previous = _contact(43, bot_id=BOT_ID - 1)
    migrated = _contact(44, bot_id=None, origin="owner_cabinet")
    pdf = ("sample.pdf", b"%PDF-test", "application/pdf")
    with staff_client(delivery_app, "editor@example.test") as staff:
        assert staff.post(path, data={"text": "Missing key"}).status_code == 422
        assert _send(staff, path, "empty", data={"text": "  "}).status_code == 422
        assert _send(staff, path, "too-many", files=[("file", pdf), ("file", pdf)]).status_code == 422
        for blocked in (previous, migrated):
            assert _send(staff, blocked, "reply", data={"text": "Hello"}).status_code == 422

        first = _send(staff, path, "reply", data={"text": "Your report"}, files={"file": pdf})
        assert first.status_code == 201, first.text
        message = first.json()
        assert message["delivery_status"] == "queued"
        assert message["delivery_attempt_count"] == 0
        assert message["author_user_id"] == STAFF_IDS["editor@example.test"]
        assert message["author_label"] == "editor@example.test"
        assert message["origin"] == "telegram"
        assert _stored(message["uuid"]).target_bot_id == BOT_ID
        assert staff.get(f"/messages/{message['uuid']}/file").content == pdf[1]

        duplicate = _send(staff, path, "reply", data={"text": "Different body"})
        assert duplicate.status_code == 200
        assert duplicate.json()["uuid"] == message["uuid"]
        assert duplicate.json()["body"] == "Your report"
        assert duplicate.json()["has_attachment"]

        upstream = auth.upstream

        def viewer_upstream(*args, **kwargs):
            response = upstream(*args, **kwargs)
            if args[1] == "/me":
                payload = response.json()
                payload["organization"]["org_role"] = "viewer"
                return httpx.Response(200, json=payload)
            return response

        with monkeypatch.context() as viewer:
            viewer.setattr(auth, "upstream", viewer_upstream)
            assert _send(staff, path, "viewer", data={"text": "Forbidden"}).status_code == 403
        with get_session_factory()() as db:
            outbound = db.scalars(select(ConversationMessage).where(ConversationMessage.direction == "outbound"))
            assert [str(row.uuid) for row in outbound] == [message["uuid"]]

        def telegram_post(url, **kwargs):
            assert url == f"https://api.telegram.org/bot{TOKEN}/sendDocument"
            assert kwargs["data"] == {"chat_id": "42", "caption": "Your report"}
            assert kwargs["files"]["document"][1:] == pdf[1:]
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 777}})

        monkeypatch.setattr(telegram.httpx, "post", telegram_post)
        assert process_next_delivery(get_session_factory())
        stored = _stored(message["uuid"])
        assert (stored.delivery_status, stored.bot_id, stored.telegram_message_id) == ("sent", BOT_ID, 777)
        assert staff.post(f"/messages/{message['uuid']}/retry").status_code == 409


def test_definite_retries_wait_and_stop(delivery_app, staff_client, monkeypatch):
    path = _contact(42)
    with staff_client(delivery_app) as staff:
        reply = _send(staff, path, "connection", data={"text": "Hello"})
        assert reply.status_code == 201, reply.text
        message_id = reply.json()["uuid"]

        def connect_error(*args, **kwargs):
            raise httpx.ConnectError("Unable to connect")

        monkeypatch.setattr(telegram.httpx, "post", connect_error)
        for attempt, status in enumerate(("queued", "queued", "failed"), start=1):
            assert process_next_delivery(get_session_factory())
            stored = _stored(message_id)
            assert (stored.delivery_status, stored.delivery_attempt_count) == (status, attempt)
        assert not process_next_delivery(get_session_factory())

        retried = staff.post(f"/messages/{message_id}/retry")
        assert retried.status_code == 200, retried.text
        assert (retried.json()["uuid"], retried.json()["delivery_status"]) == (message_id, "queued")
        assert retried.json()["delivery_attempt_count"] == 0
        before = utc_now()

        def rate_limited(*args, **kwargs):
            return httpx.Response(429, json={
                "ok": False, "description": f"{TOKEN} {SECRET} {'x' * 600}", "parameters": {"retry_after": 5},
            })

        monkeypatch.setattr(telegram.httpx, "post", rate_limited)
        assert process_next_delivery(get_session_factory())
        stored = _stored(message_id)
        assert stored.delivery_status == "queued"
        assert stored.next_attempt_at >= before + timedelta(seconds=5)
        assert stored.delivery_error == "x" * 500
        assert not process_next_delivery(get_session_factory())

        second = _send(staff, path, "new-key", data={"text": "New message"})
        assert second.status_code == 201 and second.json()["uuid"] != message_id


def test_worker_restart_leaves_unconfirmed(delivery_app, staff_client, monkeypatch):
    path = _contact(42)
    with staff_client(delivery_app) as staff:
        reply = _send(staff, path, "crash", data={"text": "Hello"})
        assert reply.status_code == 201, reply.text
        message_id = reply.json()["uuid"]

        class WorkerStopped(BaseException):
            pass

        def stop_during_send(*args, **kwargs):
            stored = _stored(message_id)
            assert (stored.delivery_status, stored.delivery_attempt_count) == ("unconfirmed", 1)
            assert not process_next_delivery(get_session_factory())
            raise WorkerStopped

        monkeypatch.setattr(telegram.httpx, "post", stop_during_send)
        with pytest.raises(WorkerStopped):
            process_next_delivery(get_session_factory())
        assert not process_next_delivery(get_session_factory())
        assert _stored(message_id).delivery_status == "unconfirmed"
        assert staff.post(f"/messages/{message_id}/retry").status_code == 409


@pytest.mark.parametrize(
    ("response", "status"),
    [
        (httpx.Response(503, json={"ok": False}), "unconfirmed"),
        (httpx.Response(200, text="invalid JSON"), "unconfirmed"),
        (httpx.ReadTimeout("Timed out"), "unconfirmed"),
        (httpx.Response(400, json={"ok": False, "description": "Chat unavailable"}), "failed"),
    ],
)
def test_telegram_classifies_send_outcome(monkeypatch, response, status):
    def telegram_post(url, **kwargs):
        assert url == f"https://api.telegram.org/bot{TOKEN}/sendPhoto"
        assert kwargs["data"] == {"chat_id": "42", "caption": "Photo"}
        assert kwargs["files"]["photo"] == ("attachment.png", b"image", "image/png")
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(telegram.httpx, "post", telegram_post)
    result = telegram.send_bot_message(TOKEN, SECRET, 42, "Photo", ("image/png", b"image"))
    assert result.status == status


def test_disconnect_and_bot_replacement(delivery_app, staff_client, monkeypatch):
    path = _contact(42)
    with staff_client(delivery_app) as staff:
        sent = _send(staff, path, "sent", data={"text": "Accepted"}).json()["uuid"]
        monkeypatch.setattr(telegram.httpx, "post", lambda *args, **kwargs: httpx.Response(
            200, json={"ok": True, "result": {"message_id": 12}},
        ))
        assert process_next_delivery(get_session_factory())
        uncertain = _send(staff, path, "uncertain", data={"text": "Waiting for confirmation"}).json()["uuid"]
        monkeypatch.setattr(telegram.httpx, "post", lambda *args, **kwargs: httpx.Response(503))
        assert process_next_delivery(get_session_factory())
        queued = _send(staff, path, "waiting", data={"text": "Waiting"}).json()["uuid"]

        monkeypatch.setattr(telegram, "delete_webhook", lambda token: True)
        assert staff.post("/clinic-bot/disconnect").status_code == 200
        assert _stored(queued).delivery_status == "queued"
        assert not process_next_delivery(get_session_factory())
        assert _send(staff, path, "waiting", data={"text": "Waiting"}).status_code == 200
        assert _send(staff, path, "disconnected", data={"text": "Waiting"}).status_code == 422

        monkeypatch.setattr(telegram, "fetch_bot_identity", lambda token: (BOT_ID + 1, "replacement_bot"))
        monkeypatch.setattr(telegram, "set_webhook", lambda *args: True)
        monkeypatch.setattr(telegram, "get_webhook_info", lambda token: None)
        replacement = staff.put("/clinic-bot", json={"token": "12346:synthetic-token"})
        assert replacement.status_code == 200, replacement.text
        assert (_stored(queued).delivery_status, _stored(sent).delivery_status) == ("failed", "sent")
        assert _stored(uncertain).delivery_status == "unconfirmed"
        assert not process_next_delivery(get_session_factory())
        assert staff.post(f"/messages/{queued}/retry").json()["delivery_status"] == "queued"
        assert process_next_delivery(get_session_factory())
        assert _stored(queued).delivery_status == "failed"
        assert _stored(queued).delivery_attempt_count == 0


def test_replacement_during_attempt_prevents_automatic_retry(delivery_app, staff_client, monkeypatch):
    path = _contact(42)
    with staff_client(delivery_app) as staff:
        reply = _send(staff, path, "replace-in-flight", data={"text": "Hello"})
        assert reply.status_code == 201, reply.text
        message_id = reply.json()["uuid"]

        def replace_and_rate_limit(*args, **kwargs):
            with get_session_factory().begin() as db:
                db.get(ClinicBot, CLINIC).bot_id = BOT_ID + 1
            return httpx.Response(429, json={"ok": False, "parameters": {"retry_after": 5}})

        monkeypatch.setattr(telegram.httpx, "post", replace_and_rate_limit)
        assert process_next_delivery(get_session_factory())
        stored = _stored(message_id)
        assert stored.delivery_status == "failed"
        assert stored.next_attempt_at is None

from concurrent.futures import ThreadPoolExecutor
from time import monotonic, sleep
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from tests.postgres_auth_stub import CLINIC_ID
from vetdietderm_api.chat.models import ChatMessage
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.owners import telegram
from vetdietderm_api.owners.bot_crypto import encrypt_secret
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.patients.models import Client, Patient
from vetdietderm_api.settings import get_settings
from vetdietderm_api.telegram.models import TelegramUpdate
from vetdietderm_api.telegram.worker import unconsumed_updates

SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"


def test_delivery_retry_and_deduplication_are_scoped_to_each_bot(api_app, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("CLINIC_BOT_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    factory = get_session_factory()
    clinics = [uuid4(), uuid4()]
    integrations = [uuid4(), uuid4()]
    with factory.begin() as db:
        for bot_id, (clinic, integration) in enumerate(zip(clinics, integrations), start=1):
            db.add(ClinicBot(
                clinic_id=clinic,
                integration_id=integration,
                token=encrypt_secret(f"test-token-{bot_id}", key),
                webhook_secret_ciphertext=encrypt_secret(f"test-secret-{bot_id}", key),
                bot_id=bot_id,
                status="connected",
            ))
        # Force the insert to fail inside PostgreSQL for the first delivery.
        db.connection().exec_driver_sql(
            "ALTER TABLE telegram_updates ADD CONSTRAINT qa_write_failure CHECK (update_id <> 42)"
        )

    update = {"update_id": 42, "message": {"chat": {"type": "private"}, "text": "original"}}
    # Exercise intake with the lifespan worker stopped so queued state is observable.
    client = TestClient(api_app)
    try:
        def deliver(bot_id, payload):
            return client.post(
                f"/telegram/webhooks/{integrations[bot_id - 1]}",
                json=payload,
                headers={SECRET_HEADER: f"test-secret-{bot_id}"},
            )

        assert deliver(1, update).status_code == 503
        with factory.begin() as db:
            assert db.scalar(select(func.count()).select_from(TelegramUpdate)) == 0
            db.connection().exec_driver_sql("ALTER TABLE telegram_updates DROP CONSTRAINT qa_write_failure")

        for bot_id in (1, 2):
            assert deliver(bot_id, update).status_code == 200
            retry = {**update, "message": {**update["message"], "text": "redelivery"}}
            assert deliver(bot_id, retry).status_code == 200
    finally:
        client.close()

    with factory() as db:
        rows = db.scalars(select(TelegramUpdate).order_by(TelegramUpdate.bot_id)).all()
        assert [(r.bot_id, r.clinic_id, r.integration_id) for r in rows] == [
            (1, clinics[0], integrations[0]), (2, clinics[1], integrations[1]),
        ]
        assert all(r.payload == update and r.transport_status == "queued" for r in rows)


def test_private_telegram_updates_are_committed_once(api_app, staff_client, monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv("CLINIC_BOT_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    monkeypatch.setattr(telegram, "delete_webhook", lambda _token: False)
    clinic_id = UUID(CLINIC_ID)
    integration_id = uuid4()
    headers = {SECRET_HEADER: "test-webhook-secret"}
    factory = get_session_factory()
    with factory.begin() as db:
        db.add(ClinicBot(
            clinic_id=clinic_id,
            integration_id=integration_id,
            token=encrypt_secret("test-bot-token", key),
            webhook_secret_ciphertext=encrypt_secret(headers[SECRET_HEADER], key),
            bot_id=9123456789,
            status="connected",
        ))

    path = f"/telegram/webhooks/{integration_id}"
    private = {
        "update_id": 42,
        "message": {"chat": {"type": "private"}, "text": "A message"},
        "clinic_id": str(uuid4()),
        "integration_id": str(uuid4()),
        "bot_id": 1,
    }
    with TestClient(api_app) as webhook:
        assert webhook.get("/patients").status_code == 401
        assert webhook.get("/ready").status_code == 401
        assert webhook.post(f"/v1/staff{path}", json=private, headers=headers).status_code == 404
        assert webhook.post(f"/telegram/webhooks/{uuid4()}", json=private, headers=headers).status_code == 404
        assert webhook.post(path, json=private).status_code == 401
        assert webhook.post(path, json=private, headers={SECRET_HEADER: "wrong"}).status_code == 401
        assert webhook.post(path, content="{", headers=headers).status_code == 400
        assert webhook.post(path, json={"message": private["message"]}, headers=headers).status_code == 400
        with factory() as db:
            assert db.scalars(select(TelegramUpdate)).all() == []

        def deliver(update):
            return webhook.post(path, json=update, headers=headers).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            assert list(executor.map(deliver, [private, private])) == [200, 200]

        # Read in a fresh transaction after the delivery responses.
        with factory() as db:
            stored = db.scalars(select(TelegramUpdate)).one()
            assert (stored.clinic_id, stored.integration_id, stored.bot_id) == (clinic_id, integration_id, 9123456789)
            assert stored.update_id == 42
            assert stored.update_kind == "message"
            assert stored.attempt_count == 0
            assert stored.payload == private

        assert deliver(private) == 200
        edited = {"update_id": 43, "edited_message": private["message"]}
        assert webhook.post(path, json=edited, headers=headers).status_code == 200
        for ignored in (
            {"message": {"chat": {"type": "group"}}},
            {"edited_message": {"chat": {"type": "supergroup"}}},
            {"channel_post": {"chat": {"type": "channel"}}},
            {"callback_query": {}},
        ):
            assert webhook.post(path, json={"update_id": 44, **ignored}, headers=headers).status_code == 200

        deadline = monotonic() + 5
        while True:
            with factory() as db:
                completed = db.scalars(select(TelegramUpdate).where(TelegramUpdate.transport_status == "complete")).all()
                if len(completed) == 2:
                    assert all(row.transport_completed_at is not None and row.claimed_at is None for row in completed)
                    for model in (Client, Patient, ChatMessage):
                        assert db.scalar(select(func.count()).select_from(model)) == 0
                    break
            assert monotonic() < deadline, "The API worker did not complete both private updates"
            sleep(0.05)

    with staff_client(api_app) as staff:
        assert staff.post("/clinic-bot/disconnect").json()["status"] == "disconnected"
        assert staff.post(path, json={**private, "update_id": 45}, headers=headers).status_code == 401

    with factory() as db:
        stored_updates = db.scalars(
            select(TelegramUpdate).order_by(TelegramUpdate.update_id)
        ).all()
        assert [(update.update_id, update.update_kind) for update in stored_updates] == [
            (42, "message"), (43, "edited_message"),
        ]
        assert stored_updates[1].payload == edited
        assert all(update.transport_status == "complete" for update in stored_updates)
        pending = unconsumed_updates(db)
        assert {update.uuid for update in pending} == {update.uuid for update in stored_updates}
        assert all(update.business_consumed_at is None for update in pending)

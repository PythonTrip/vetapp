import asyncio
from datetime import UTC, datetime
from pathlib import Path
from threading import Event
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from tests.postgres_auth_stub import CLINIC_ID
from vetdietderm_api import auth, main
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.messaging import intake
from vetdietderm_api.messaging.models import ClinicContact, ClinicConversation, ConversationMessage
from vetdietderm_api.patients.models import Client, Patient
from vetdietderm_api.telegram.models import TelegramUpdate

pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[3]
SENT_AT = 1_790_000_000


def queue_update(update_id, message_id, body, *, edited=False, edit_date=None, sender_id=42):
    kind = "edited_message" if edited else "message"
    message = {
        "message_id": message_id,
        "date": SENT_AT,
        "chat": {"id": 42, "type": "private"},
        "from": {
            "id": sender_id,
            "first_name": "Анна" if update_id == 1 else "Anna",
            "last_name": "Example",
            "username": f"anna{update_id}",
        },
    }
    if body is not None:
        message["text"] = body
    if edit_date is not None:
        message["edit_date"] = edit_date
    update = TelegramUpdate(
        clinic_id=UUID(CLINIC_ID),
        integration_id=uuid4(),
        bot_id=4321,
        update_id=update_id,
        update_kind=kind,
        payload={kind: message},
        transport_status="complete",
    )
    with get_session_factory().begin() as db:
        db.add(update)
    return update.uuid


def count(db, model):
    return db.scalar(select(func.count()).select_from(model))


def test_messages_deduplicate_and_keep_the_newest_edit(
    postgres_database, postgres_application, staff_client, monkeypatch,
):
    app, _ = postgres_application(postgres_database)
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(config, "0047_clinic_contact_link_events")
    command.upgrade(config, "head")
    factory = get_session_factory()
    with factory() as db:
        initial_counts = count(db, Client), count(db, Patient)

    first = queue_update(1, 100, "/start")
    intake.process_next_business_update()
    assert intake.process_next_business_update() is None
    with factory.begin() as db:
        contact = db.scalars(select(ClinicContact)).one()
        contact_id = contact.uuid
        contact.local_name = "Clinic alias"
        conversation = db.scalars(select(ClinicConversation)).one()
        message = db.scalars(select(ConversationMessage)).one()
        first_message_id = message.uuid
        assert message.conversation_uuid == conversation.uuid
        assert (message.body, message.direction, message.channel, message.origin) == (
            "/start", "inbound", "telegram", "telegram",
        )
        assert message.occurred_at == datetime.fromtimestamp(SENT_AT, UTC)
        assert (message.author_user_id, message.author_label, message.source_chat_message_uuid) == (None, None, None)
        assert db.get(TelegramUpdate, first).business_consumed_at is not None

    updates = [
        queue_update(2, 100, "Duplicate original"),
        queue_update(3, 100, "New edit", edited=True, edit_date=SENT_AT + 2),
        queue_update(4, 100, "Late original"),
        queue_update(5, 100, "Older edit", edited=True, edit_date=SENT_AT + 1),
        queue_update(7, 100, "Newest edit", edited=True, edit_date=SENT_AT + 2),
        queue_update(6, 100, "Lower update id", edited=True, edit_date=SENT_AT + 2),
        queue_update(8, 101, "Edit first", edited=True, edit_date=SENT_AT + 1),
        queue_update(9, 101, "Original after edit"),
        queue_update(10, 102, None),
        queue_update(11, 103, "No edit date", edited=True),
        queue_update(12, 103, "Newer update id", edited=True),
        queue_update(13, 104, "Original"),
        queue_update(14, 104, "First edit without date", edited=True),
    ]
    for _ in updates:
        assert intake.process_next_business_update() is not None
    assert intake.process_next_business_update() is None
    with factory() as db:
        assert (count(db, Client), count(db, Patient)) == initial_counts
        assert (count(db, ClinicContact), count(db, ClinicConversation)) == (1, 1)
        contact = db.get(ClinicContact, contact_id)
        assert (contact.profile_name, contact.username, contact.local_name) == (
            "Anna Example", "anna14", "Clinic alias",
        )
        messages = db.scalars(select(ConversationMessage).order_by(ConversationMessage.telegram_message_id)).all()
        assert [message.body for message in messages] == [
            "Newest edit", "Edit first", None, "Newer update id", "First edit without date",
        ]
        assert messages[0].uuid == first_message_id
        assert (messages[0].edited_at, messages[0].source_update_id) == (datetime.fromtimestamp(SENT_AT + 2, UTC), 7)
        assert (messages[1].edited_at, messages[1].source_update_id) == (datetime.fromtimestamp(SENT_AT + 1, UTC), 8)
        for uuid in [first, *updates]:
            update = db.get(TelegramUpdate, uuid)
            assert update.business_consumed_at is not None
            assert update.transport_status == "complete"

    path = f"/contacts/{contact_id}/messages"
    clinic_id = CLINIC_ID
    upstream = auth.upstream

    def viewer(method, url, body=None, token=None):
        response = upstream(method, url, body, token)
        if url == "/me":
            payload = response.json()
            payload["organization"].update(org_id=clinic_id, org_role="viewer")
            return httpx.Response(200, json=payload)
        return response

    monkeypatch.setattr(auth, "upstream", viewer)
    with staff_client(app, "editor@example.test") as staff:
        response = staff.get(path)
        assert response.status_code == 200, response.text
        assert [item["uuid"] for item in response.json()] == sorted(str(message.uuid) for message in messages)
        assert staff.get("/v1/staff" + path).json() == response.json()
        clinic_id = str(uuid4())
        assert staff.get(path).status_code == 404


def test_business_worker_rolls_back_on_lifespan_shutdown(api_app, monkeypatch):
    factory = get_session_factory()
    uuid = queue_update(1, 100, "Retry after shutdown")
    transaction_open = Event()
    finish_transaction = Event()
    stopping = Event()
    consume = intake._consume_update

    def hold_transaction(db, update):
        consume(db, update)
        db.flush()
        transaction_open.set()
        assert finish_transaction.wait(5)

    async def release_on_cancellation():
        try:
            assert await asyncio.to_thread(stopping.wait, 5)
        finally:
            finish_transaction.set()

    async def run_and_stop():
        monkeypatch.setattr(intake, "_consume_update", hold_transaction)
        monkeypatch.setattr(intake, "Event", lambda: stopping)
        async with main.lifespan(api_app):
            assert await asyncio.to_thread(transaction_open.wait, 5)
            release = asyncio.create_task(release_on_cancellation())
        await release

    asyncio.run(run_and_stop())
    with factory() as db:
        assert db.get(TelegramUpdate, uuid).business_consumed_at is None
        assert (count(db, ClinicContact), count(db, ConversationMessage)) == (0, 0)

    monkeypatch.setattr(intake, "_consume_update", consume)
    intake.process_next_business_update()
    assert intake.process_next_business_update() is None
    with factory() as db:
        assert db.get(TelegramUpdate, uuid).business_consumed_at is not None
        assert count(db, ConversationMessage) == 1


def test_invalid_update_and_failed_transaction_do_not_block_following_updates(api_app, monkeypatch):
    factory = get_session_factory()
    invalid = queue_update(1, 100, "Missing sender", sender_id=None)
    failing = queue_update(2, 101, "Retry")
    following = queue_update(3, 102, None)
    consume = intake._consume_update

    def fail_after_writing(db, update):
        consume(db, update)
        if update.uuid == failing:
            db.flush()
            raise RuntimeError("simulated failure")

    with monkeypatch.context() as failure:
        failure.setattr(intake, "_consume_update", fail_after_writing)
        position = intake.process_next_business_update()
        assert position[1] == invalid
        position = intake.process_next_business_update(position)
        assert position[1] == failing
        position = intake.process_next_business_update(position)
        assert position[1] == following
        assert intake.process_next_business_update(position) is None

    with factory() as db:
        assert db.get(TelegramUpdate, invalid).business_consumed_at is None
        assert db.get(TelegramUpdate, failing).business_consumed_at is None
        assert db.get(TelegramUpdate, following).business_consumed_at is not None
        assert db.scalars(select(ConversationMessage.telegram_message_id)).all() == [102]
    position = intake.process_next_business_update()
    assert position[1] == invalid
    assert intake.process_next_business_update(position)[1] == failing
    with factory() as db:
        assert db.get(TelegramUpdate, failing).business_consumed_at is not None
        assert count(db, ConversationMessage) == 2

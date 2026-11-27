import asyncio
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from threading import Event
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from fastapi import HTTPException, UploadFile
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from starlette.datastructures import Headers

from tests.postgres_auth_stub import CLINIC_ID
from vetdietderm_api import auth, main
from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.attachments.storage import MAX_ATTACHMENT_BYTES, attachment_root
from vetdietderm_api.db import get_session_factory
from vetdietderm_api.messaging import intake
from vetdietderm_api.messaging.content import validate_staff_composition
from vetdietderm_api.messaging.models import ClinicContact, ClinicConversation, ConversationMessage
from vetdietderm_api.owners.bot_crypto import encrypt_secret
from vetdietderm_api.owners.models import ClinicBot
from vetdietderm_api.patients.models import Client, Patient
from vetdietderm_api.settings import get_settings
from vetdietderm_api.telegram.models import TelegramUpdate

pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[3]
SENT_AT = 1_790_000_000


def queue_update(update_id, message_id, body, *, edited=False, edit_date=None, sender_id=42, **fields):
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
        **fields,
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


def test_patient_tag_follows_current_client_and_survives_relink(
    postgres_database, postgres_application, staff_client, monkeypatch,
):
    app, _ = postgres_application(postgres_database)
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(config, "0049_conversation_attachments")
    queue_update(1, 100, "Inbound before migration")
    # Seed an existing message using the previous schema.
    factory = get_session_factory()
    contact_id, conversation_id, outbound_id = uuid4(), uuid4(), uuid4()
    clinic_id = UUID(CLINIC_ID)
    with factory.begin() as db:
        db.execute(ClinicContact.__table__.insert().values(
            uuid=contact_id, clinic_id=clinic_id,
            telegram_user_id=42, telegram_chat_id=42, local_name="Clinic contact",
        ))
        db.execute(ClinicConversation.__table__.insert().values(
            uuid=conversation_id, clinic_id=clinic_id, contact_uuid=contact_id,
        ))
        db.execute(ConversationMessage.__table__.insert().values(
            uuid=outbound_id, clinic_id=clinic_id, conversation_uuid=conversation_id,
            direction="outbound", channel="telegram", body="Outbound before migration",
            occurred_at=datetime.fromtimestamp(SENT_AT, UTC),
        ))
    command.upgrade(config, "head")
    assert intake.process_next_business_update() is not None

    with factory.begin() as db:
        inbound = db.scalars(select(ConversationMessage).where(ConversationMessage.direction == "inbound")).one()
        inbound_id = inbound.uuid
        assert inbound.patient_uuid is db.get(ConversationMessage, outbound_id).patient_uuid is None
        first_client = Client(name="First", tenant_id=clinic_id)
        second_client = Client(name="Second", tenant_id=clinic_id)
        db.add_all([first_client, second_client])
        db.flush()
        first_client_id, second_client_id = str(first_client.uuid), str(second_client.uuid)
        first = Patient(name="First", species="dog", client_uuid=first_client.uuid, tenant_id=clinic_id)
        replacement = Patient(name="Replacement", species="cat", client_uuid=first_client.uuid, tenant_id=clinic_id)
        other_client = Patient(name="Other client", species="cat", client_uuid=second_client.uuid, tenant_id=clinic_id)
        foreign_clinic = Patient(name="Foreign clinic", species="cat", client_uuid=first_client.uuid, tenant_id=uuid4())
        db.add_all([first, replacement, other_client, foreign_clinic])
        db.flush()
        first_id, replacement_id, other_id, foreign_id = (
            str(patient.uuid) for patient in (first, replacement, other_client, foreign_clinic)
        )

    contact_path = f"/contacts/{contact_id}"
    inbound_path = f"/messages/{inbound_id}"
    outbound_path = f"/v1/staff/messages/{outbound_id}"
    role, request_clinic = "member", CLINIC_ID
    upstream = auth.upstream

    def with_membership(method, url, body=None, token=None):
        response = upstream(method, url, body, token)
        if url == "/me":
            payload = response.json()
            payload["organization"].update(org_role=role, org_id=request_clinic)
            return httpx.Response(200, json=payload)
        return response

    monkeypatch.setattr(auth, "upstream", with_membership)
    with staff_client(app, "editor@example.test") as staff:
        def patch_tag(path, patient_id):
            return staff.patch(path, json={"patient_uuid": patient_id})

        def read_messages():
            response = staff.get(contact_path + "/messages")
            assert response.status_code == 200, response.text
            return {message["uuid"]: message for message in response.json()}

        unlinked = patch_tag(inbound_path, first_id)
        assert unlinked.status_code == 422
        assert unlinked.json() == {"detail": "Пациент не относится к текущему клиенту контакта"}
        assert staff.put(contact_path + "/client", json={"client_uuid": first_client_id}).status_code == 200
        assert patch_tag(inbound_path, other_id).status_code == 422
        assert patch_tag(inbound_path, foreign_id).status_code == 422
        assert patch_tag(f"/messages/{uuid4()}", first_id).status_code == 404
        assert staff.patch(inbound_path, json={}).status_code == 422
        assert staff.patch(inbound_path, json={"patient_uuid": first_id, "body": "Changed"}).status_code == 422

        role = "viewer"
        assert patch_tag(inbound_path, first_id).status_code == 403
        assert read_messages()[str(inbound_id)]["patient_current"] is False
        role = "member"
        request_clinic = str(uuid4())
        assert patch_tag(inbound_path, first_id).status_code == 404
        request_clinic = CLINIC_ID

        for path, message_id in ((inbound_path, inbound_id), (outbound_path, outbound_id)):
            before = read_messages()[str(message_id)]
            tagged = patch_tag(path, first_id)
            assert tagged.status_code == 200, tagged.text
            assert tagged.json() == {**before, "patient_uuid": first_id, "patient_current": True}
        replaced = patch_tag(inbound_path, replacement_id)
        assert replaced.status_code == 200, replaced.text
        assert replaced.json()["patient_uuid"] == replacement_id
        assert read_messages()[str(inbound_id)]["patient_current"] is True
        with factory.begin() as db, pytest.raises(IntegrityError, match="fk_conversation_messages_patient"):
            db.execute(delete(Patient).where(Patient.uuid == UUID(replacement_id)))

        moved = staff.put(contact_path + "/client", json={"client_uuid": second_client_id})
        assert moved.status_code == 200, moved.text
        assert moved.json()["client_uuid"] == second_client_id
        moved_message = read_messages()[str(inbound_id)]
        assert (moved_message["patient_uuid"], moved_message["patient_current"]) == (replacement_id, False)
        assert patch_tag(inbound_path, replacement_id).status_code == 422
        assert staff.post(contact_path + "/client").status_code == 201
        for message_id, patient_id in ((inbound_id, replacement_id), (outbound_id, first_id)):
            message = read_messages()[str(message_id)]
            assert (message["patient_uuid"], message["patient_current"]) == (patient_id, False)

        cleared = patch_tag(inbound_path, None)
        assert cleared.status_code == 200, cleared.text
        assert (cleared.json()["patient_uuid"], cleared.json()["patient_current"]) == (None, False)
        assert patch_tag(inbound_path, replacement_id).status_code == 422
        assert staff.put(contact_path + "/client", json={"client_uuid": None}).status_code == 200
        assert patch_tag(outbound_path, first_id).status_code == 422

        queue_update(2, 101, "New inbound")
        assert intake.process_next_business_update() is not None
        new_inbound = next(message for message in read_messages().values() if message["telegram_message_id"] == 101)
        assert (new_inbound["patient_uuid"], new_inbound["patient_current"]) == (None, False)

    with factory() as db:
        assert db.get(ConversationMessage, inbound_id).patient_uuid is None
        assert db.get(ConversationMessage, outbound_id).patient_uuid == UUID(first_id)


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


def test_message_files_follow_accepted_versions_and_clinic_access(api_app, staff_client, monkeypatch):
    key = Fernet.generate_key().decode("ascii")
    token = "4321:test-token"
    jpeg = b"\xff\xd8\xffphoto"
    pdf = b"%PDF-replacement"
    monkeypatch.setenv("CLINIC_BOT_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    factory = get_session_factory()
    with factory.begin() as db:
        db.add(ClinicBot(
            clinic_id=UUID(CLINIC_ID), bot_id=4321, status="connected", token=encrypt_secret(token, key),
        ))

    requested = []
    files = {"best": jpeg, "pdf": pdf, "bad": jpeg, "oversized-download": pdf.ljust(MAX_ATTACHMENT_BYTES + 1)}

    def telegram_request(_transport, request):
        assert request.url.host == "api.telegram.org"
        if request.url.path == f"/bot{token}/getFile":
            file_id = request.url.params["file_id"]
            requested.append(file_id)
            if file_id == "failed":
                return httpx.Response(302, headers={"Location": "https://elsewhere.invalid/file"})
            return httpx.Response(200, json={"ok": True, "result": {"file_path": f"files/{file_id}"}})
        file_id = request.url.path.removeprefix(f"/file/bot{token}/files/")
        return httpx.Response(200, content=files[file_id])

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", telegram_request)
    photos = [
        {"file_id": "too-large", "file_size": MAX_ATTACHMENT_BYTES + 1},
        {"file_id": "unknown"},
        {"file_id": "small", "file_size": len(jpeg) - 1},
        {"file_id": "best", "file_size": len(jpeg)},
    ]
    initial_update = queue_update(1, 100, None, photo=photos, caption="Фото")
    stopping = Event()
    stopping.set()
    intake.process_next_business_update(stopping=stopping)
    assert list(attachment_root().iterdir()) == []
    with factory() as db:
        assert db.get(TelegramUpdate, initial_update).business_consumed_at is None
    intake.process_next_business_update()
    with factory() as db:
        first = db.scalars(select(ConversationMessage)).one()
        assert (first.body, first.attachment_content_type, first.attachment_byte_size) == ("Фото", "image/jpeg", len(jpeg))
        assert first.has_attachment and not first.unsupported_attachment
        first_key = first.attachment_storage_key
        assert [path.name for path in attachment_root().iterdir()] == [first_key]
        assert count(db, Attachment) == 0
        contact_id = db.scalars(select(ClinicContact.uuid)).one()

    upstream = auth.upstream
    clinic_id = CLINIC_ID

    def viewer(method, url, body=None, token=None):
        response = upstream(method, url, body, token)
        if url == "/me":
            payload = response.json()
            payload["organization"].update(org_id=clinic_id, org_role="viewer")
            return httpx.Response(200, json=payload)
        return response

    monkeypatch.setattr(auth, "upstream", viewer)
    with staff_client(api_app, "editor@example.test") as staff:
        response = staff.get(f"/messages/{first.uuid}/file")
        assert (response.status_code, response.headers["content-type"], response.content) == (200, "image/jpeg", jpeg)

    def document(file_id, size=None):
        return {"file_id": file_id, "mime_type": "application/pdf", "file_size": size}

    queue_update(2, 100, None, edited=True, edit_date=SENT_AT + 1, caption="PDF", document=document("pdf"))
    intake.process_next_business_update(stopping=stopping)
    with factory() as db:
        assert db.get(ConversationMessage, first.uuid).attachment_storage_key == first_key
    assert [path.name for path in attachment_root().iterdir()] == [first_key]
    intake.process_next_business_update()
    queue_update(3, 100, None, photo=photos)
    queue_update(4, 101, None, sticker={"file_id": "sticker"})
    queue_update(5, 102, "/start")
    queue_update(6, 103, None, document=document("too-large", MAX_ATTACHMENT_BYTES + 1))
    queue_update(7, 104, None, document=document("bad"))
    queue_update(8, 105, None, document=document("failed"))
    queue_update(9, 106, None, video={"file_id": "video"})
    queue_update(10, 107, None, document=document("oversized-download"))
    for _ in range(8):
        assert intake.process_next_business_update() is not None
    assert intake.process_next_business_update() is None
    assert requested == ["best", "best", "pdf", "pdf", "bad", "failed", "oversized-download"]
    with factory() as db:
        messages = db.scalars(select(ConversationMessage).order_by(ConversationMessage.telegram_message_id)).all()
        replacement, sticker, start, oversized, invalid, unavailable, video, oversized_download = messages
        assert (replacement.uuid, replacement.body, replacement.attachment_content_type) == (first.uuid, "PDF", "application/pdf")
        assert replacement.attachment_storage_key != first_key
        assert [path.name for path in attachment_root().iterdir()] == [replacement.attachment_storage_key]
        for message in (sticker, oversized, invalid, unavailable, video, oversized_download):
            assert message.unsupported_attachment and message.attachment_storage_key is None
        assert not start.unsupported_attachment
        assert count(db, Attachment) == 0
    with staff_client(api_app, "editor@example.test") as staff:
        file_url = f"/messages/{replacement.uuid}/file"
        for url in (file_url, "/v1/staff" + file_url):
            response = staff.get(url)
            assert (response.status_code, response.headers["content-type"], response.content) == (200, "application/pdf", pdf)
        response = staff.get(f"/contacts/{contact_id}/messages")
        item = next(item for item in response.json() if item["uuid"] == str(replacement.uuid))
        assert item["has_attachment"] and item["attachment_content_type"] == "application/pdf"
        assert "attachment_storage_key" not in item
        assert staff.get(f"/messages/{sticker.uuid}/file").status_code == 404
        clinic_id = str(uuid4())
        assert staff.get(file_url).status_code == 404

    paths = api_app.openapi()["paths"]
    assert set(paths["/messages/{message_id}/file"]) == {"get"}
    assert set(paths["/messages/{message_id}"]) == {"patch"}


def test_staff_composition_requires_text_or_a_supported_file():
    with pytest.raises(HTTPException) as empty:
        validate_staff_composition(None, None)
    assert empty.value.status_code == 422
    assert validate_staff_composition("Ок", None) == ("Ок", None)
    jpeg = b"\xff\xd8\xffphoto"
    file = UploadFile(BytesIO(jpeg), headers=Headers({"content-type": "image/jpeg"}))
    assert validate_staff_composition(None, file) == (None, ("image/jpeg", jpeg))

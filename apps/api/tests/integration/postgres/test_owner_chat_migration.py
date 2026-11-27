from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, insert, select, text
from sqlalchemy.orm import Session

from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.chat.models import ChatMessage, ChatThread
from vetdietderm_api.messaging.audit import ClinicContactLinkEvent
from vetdietderm_api.messaging.migrate_owner_chats import migrate_owner_cabinet_chats
from vetdietderm_api.messaging.models import ClinicContact, ClinicConversation, ConversationMessage
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.owners.models import OwnerAccount, OwnerAnimal, OwnerRegistration, OwnerUpload, TelegramIdentity
from vetdietderm_api.patients.models import Client, Patient

pytestmark = pytest.mark.integration
API_ROOT = Path(__file__).resolve().parents[3]
PREVIOUS = "0050_message_patient_tag"
MIGRATION = "0051_owner_chat_history"
OCCURRED = datetime(2025, 1, 1, tzinfo=UTC)


def _seed_owner(db, clinic, raw_id, *, client=None, tagged_patients=()):
    owner = uuid4()
    registration = uuid4()
    db.execute(insert(OwnerAccount.__table__).values(uuid=owner, name="Owner", phone=str(owner), tenant_id=clinic))
    if raw_id is not None:
        db.execute(insert(TelegramIdentity.__table__).values(
            owner_account_uuid=owner, tenant_id=clinic, telegram_user_id=raw_id,
        ))
    db.execute(insert(OwnerRegistration.__table__).values(
        uuid=registration, owner_account_uuid=owner, client_uuid=client,
        status="accepted" if client else "pending", accepted_at=OCCURRED if client else None,
    ))
    source_messages = []
    for index, patient in enumerate(tagged_patients or (None,)):
        animal, thread, message = uuid4(), uuid4(), uuid4()
        db.execute(insert(OwnerAnimal.__table__).values(
            uuid=animal, registration_uuid=registration, patient_uuid=patient, name="Pet", species="dog",
        ))
        # Accepted-patient threads could have been created without an owner_animal_uuid.
        db.execute(insert(ChatThread.__table__).values(
            uuid=thread, owner_animal_uuid=animal if index == 0 or patient is None else None, patient_uuid=patient,
        ))
        db.execute(insert(ChatMessage.__table__).values(
            uuid=message, thread_uuid=thread, author_kind="owner" if index == 0 else "staff",
            author_id=owner, author_label=f"Author {index}", body=f"Message {index}",
            created_at=OCCURRED + timedelta(minutes=index),
        ))
        source_messages.append((message, animal))
    return owner, source_messages


def _seed_upload(db, owner, message, animal, *, number, kind="chat", content_type="image/png", byte_size=4096):
    db.execute(insert(OwnerUpload.__table__).values(
        uuid=UUID(int=number), owner_account_uuid=owner, animal_uuid=animal, message_uuid=message,
        kind=kind, storage_key=f"original/{number}", filename="upload", content_type=content_type,
        byte_size=byte_size, created_at=OCCURRED,
    ))


@pytest.mark.parametrize("scenario", ["linked", "untagged", "conflicting_with_telegram", "existing_contact"])
def test_owner_chat_history_upgrade_replay_and_downgrade(
    scenario, postgres_database, configure_postgres_app, monkeypatch,
):
    def reject_request(*args, **kwargs):
        pytest.fail("The data migration attempted an HTTP request")

    monkeypatch.setattr(httpx.Client, "send", reject_request)
    engine = configure_postgres_app(postgres_database)
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    command.upgrade(config, PREVIOUS)

    clinic, client, other_client = uuid4(), uuid4(), uuid4()
    patients = (uuid4(), uuid4())
    tags = (patients[0], None) if scenario == "untagged" else patients
    with Session(engine) as db, db.begin():
        for client_id in (client, other_client):
            db.execute(insert(Client.__table__).values(uuid=client_id, name="Same name", tenant_id=clinic))
        for index, patient in enumerate(patients):
            db.execute(insert(Patient.__table__).values(
                uuid=patient, name="Pet", species="dog", tenant_id=clinic,
                client_uuid=other_client if index and scenario == "conflicting_with_telegram" else client,
            ))
        owner, ((first, animal), (second, second_animal)) = _seed_owner(
            db, clinic, "  +0042 ", client=client, tagged_patients=tags,
        )
        _seed_upload(db, owner, first, animal, number=1, kind="document")
        _seed_upload(db, owner, first, animal, number=3, content_type="application/pdf")
        _seed_upload(db, owner, first, animal, number=2, byte_size=8 * 1024**2)
        _seed_upload(db, owner, second, second_animal, number=4, byte_size=8 * 1024**2 + 1)
        _seed_upload(db, owner, second, second_animal, number=5)
        skipped = [(None, "43"), (clinic, None), (clinic, "9223372036854775808"), (clinic, "-9"), (clinic, "x")]
        for tenant_id, user_id in skipped:
            _seed_owner(db, tenant_id, user_id)
        if scenario == "existing_contact":
            contact, conversation = open_contact(db, clinic, 42, 42, "Telegram Name", "telegram_username")
            original_pair = contact.uuid, conversation.uuid
            db.add(ConversationMessage(
                clinic_id=clinic, conversation_uuid=conversation.uuid, direction="inbound",
                channel="telegram", origin="owner_cabinet", occurred_at=OCCURRED, source_chat_message_uuid=uuid4(),
            ))

    command.upgrade(config, MIGRATION)
    with Session(engine) as db, db.begin():
        contact = db.scalars(select(ClinicContact)).one()
        conversation = db.scalars(select(ClinicConversation)).one()
        pair = contact.uuid, conversation.uuid
        assert contact.telegram_chat_id == contact.telegram_user_id == 42
        assert conversation.contact_uuid == contact.uuid
        if scenario == "existing_contact":
            assert pair == original_pair
            assert (contact.profile_name, contact.username, contact.local_name) == (
                "Telegram Name", "telegram_username", "Telegram Name",
            )
        else:
            assert contact.local_name == "42"
        assert contact.client_uuid == (None if scenario == "conflicting_with_telegram" else client)
        assert db.scalar(select(func.count()).select_from(ClinicContactLinkEvent)) == 0
        assert db.scalar(select(func.count()).select_from(Attachment)) == 0

        copied = db.scalars(
            select(ConversationMessage)
            .where(ConversationMessage.source_chat_message_uuid.in_((first, second)))
            .order_by(ConversationMessage.occurred_at)
        ).all()
        assert [message.source_chat_message_uuid for message in copied] == [first, second]
        assert [message.patient_uuid for message in copied] == list(tags)
        assert [message.direction for message in copied] == ["inbound", "outbound"]
        for index, message in enumerate(copied):
            assert message.conversation_uuid == conversation.uuid
            assert message.occurred_at == OCCURRED + timedelta(minutes=index)
            assert (message.origin, message.channel) == ("owner_cabinet", "telegram")
            assert message.bot_id is message.telegram_message_id is None
            assert (message.author_user_id, message.author_label, message.body) == (
                owner, f"Author {index}", f"Message {index}",
            )
            assert message.unsupported_attachment
        assert (copied[0].attachment_storage_key, copied[0].attachment_content_type, copied[0].attachment_byte_size) == (
            "original/2", "image/png", 8 * 1024**2,
        )
        assert not copied[1].has_attachment

        first_counts = [db.scalar(select(func.count()).select_from(model)) for model in (
            ClinicContact, ClinicConversation, ConversationMessage, Attachment,
        )]
        migrate_owner_cabinet_chats(db)
        assert [db.scalar(select(func.count()).select_from(model)) for model in (
            ClinicContact, ClinicConversation, ConversationMessage, Attachment,
        )] == first_counts

        if scenario == "conflicting_with_telegram":
            db.add(ConversationMessage(
                clinic_id=clinic, conversation_uuid=conversation.uuid, direction="inbound",
                channel="telegram", origin="telegram", occurred_at=OCCURRED, telegram_message_id=79,
            ))

    command.downgrade(config, PREVIOUS)
    with Session(engine) as db:
        remaining = db.scalars(select(ConversationMessage)).all()
        if scenario in {"linked", "untagged"}:
            assert remaining == []
            assert db.get(ClinicContact, pair[0]) is db.get(ClinicConversation, pair[1]) is None
        else:
            assert len(remaining) == 1
            assert remaining[0].source_chat_message_uuid not in (first, second)
            assert db.get(ClinicContact, pair[0]) is not None
            assert db.get(ClinicConversation, pair[1]) is not None
        assert db.scalar(select(func.count()).select_from(ChatMessage)) == 7
        assert db.scalar(select(func.count()).select_from(ChatThread)) == 7
        assert db.scalar(select(func.count()).select_from(OwnerUpload)) == 5
        assert db.scalar(select(func.count()).select_from(TelegramIdentity)) == 5
        assert db.scalar(text("SELECT to_regclass('owner_chat_history_rows')")) is None

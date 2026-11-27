import re
from collections import defaultdict
from itertools import chain
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from vetdietderm_api.attachments.storage import ALLOWED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES
from vetdietderm_api.chat.models import ChatMessage, ChatThread
from vetdietderm_api.messaging.models import ConversationMessage
from vetdietderm_api.messaging.repository import open_contact
from vetdietderm_api.owners.models import OwnerAnimal, OwnerRegistration, OwnerUpload, TelegramIdentity
from vetdietderm_api.patients.models import Client, Patient


def _owner_threads(clinic_id: UUID, owner_ids: list[UUID]):
    # Patient-only threads can be attributed only when the Patient has one owner registration.
    patient_owners = (
        select(OwnerAnimal.patient_uuid)
        .where(OwnerAnimal.patient_uuid.is_not(None))
        .group_by(OwnerAnimal.patient_uuid)
        .having(func.count(OwnerAnimal.registration_uuid.distinct()) == 1)
    )
    return (
        select(
            ChatThread.uuid,
            ChatThread.patient_uuid,
            case((Patient.tenant_id == clinic_id, Patient.client_uuid)).label("clinic_client"),
        )
        .select_from(ChatThread)
        .outerjoin(Patient, Patient.uuid == ChatThread.patient_uuid)
        .join(
            OwnerAnimal,
            or_(
                OwnerAnimal.uuid == ChatThread.owner_animal_uuid,
                and_(
                    ChatThread.owner_animal_uuid.is_(None),
                    OwnerAnimal.patient_uuid == ChatThread.patient_uuid,
                    ChatThread.patient_uuid.in_(patient_owners),
                    Patient.tenant_id == clinic_id,
                ),
            ),
        )
        .join(OwnerRegistration, OwnerRegistration.uuid == OwnerAnimal.registration_uuid)
        .where(OwnerRegistration.owner_account_uuid.in_(owner_ids))
        .distinct()
    )


def _uncopied_messages(thread_ids: list[UUID]):
    first_upload = (
        select(
            OwnerUpload.storage_key,
            OwnerUpload.content_type,
            OwnerUpload.byte_size,
            (func.count().over() > 1).label("extra_uploads"),
        )
        .where(OwnerUpload.message_uuid == ChatMessage.uuid, OwnerUpload.kind == "chat")
        .order_by(OwnerUpload.created_at, OwnerUpload.uuid)
        .limit(1)
        .lateral()
    )
    already_copied = select(ConversationMessage.uuid).where(
        ConversationMessage.source_chat_message_uuid == ChatMessage.uuid,
    )
    return (
        select(ChatMessage, first_upload)
        .outerjoin(first_upload, true())
        .where(ChatMessage.thread_uuid.in_(thread_ids), ~already_copied.exists())
        .execution_options(yield_per=500)
    )


def migrate_owner_cabinet_chats(session: Session) -> None:
    """Copy Owner Cabinet history in the caller's transaction."""
    account_groups: dict[tuple[UUID, int], list[UUID]] = defaultdict(list)
    for clinic_id, raw_id, owner_id in session.execute(
        select(TelegramIdentity.tenant_id, TelegramIdentity.telegram_user_id, TelegramIdentity.owner_account_uuid)
        .where(TelegramIdentity.tenant_id.is_not(None))
    ):
        raw_id = raw_id.strip()
        if re.fullmatch(r"\+?[0-9]+", raw_id) and 0 < (user_id := int(raw_id)) < 2**63:
            account_groups[clinic_id, user_id].append(owner_id)

    message_table = ConversationMessage.__table__
    write_messages = insert(message_table).on_conflict_do_nothing(
        index_elements=[message_table.c.source_chat_message_uuid],
        index_where=message_table.c.source_chat_message_uuid.is_not(None),
    )
    for (clinic_id, user_id), owner_ids in sorted(account_groups.items()):
        threads = session.execute(_owner_threads(clinic_id, owner_ids)).all()
        thread_patients = {
            thread_id: patient_id if clinic_client is not None else None
            for thread_id, patient_id, clinic_client in threads
        }
        if not thread_patients:
            continue

        with session.execute(_uncopied_messages(list(thread_patients))) as messages:
            batches = messages.partitions()
            first_batch = next(batches, None)
            if first_batch is None:
                continue
            contact, conversation = open_contact(
                session, clinic_id, user_id, user_id, None, None, refresh_profile=False,
            )
            for batch in chain((first_batch,), batches):
                _copy_messages(session, write_messages, batch, conversation, thread_patients)

        if contact.client_uuid is None:
            client_ids = set(session.scalars(
                select(OwnerRegistration.client_uuid)
                .join(Client, Client.uuid == OwnerRegistration.client_uuid)
                .where(
                    OwnerRegistration.owner_account_uuid.in_(owner_ids),
                    OwnerRegistration.status == "accepted",
                    Client.tenant_id == clinic_id,
                )
            ))
            if len(client_ids) == 1:
                client_id = client_ids.pop()
                if all(patient_id is None or patient_client == client_id for _, patient_id, patient_client in threads):
                    contact.client_uuid = client_id
    session.flush()


def _copy_messages(session, statement, messages, conversation, thread_patients) -> None:
    rows = []
    for message, storage_key, content_type, byte_size, extra_uploads in messages:
        supported = content_type in ALLOWED_CONTENT_TYPES and 0 <= byte_size <= MAX_ATTACHMENT_BYTES
        rows.append({
            "clinic_id": conversation.clinic_id,
            "conversation_uuid": conversation.uuid,
            "source_chat_message_uuid": message.uuid,
            "origin": "owner_cabinet",
            "channel": "telegram",
            "occurred_at": message.created_at,
            "direction": "inbound" if message.author_kind == "owner" else "outbound",
            "author_user_id": message.author_id,
            "author_label": message.author_label,
            "patient_uuid": thread_patients[message.thread_uuid],
            "body": message.body,
            "attachment_storage_key": storage_key if supported else None,
            "attachment_content_type": content_type if supported else None,
            "attachment_byte_size": byte_size if supported else None,
            "unsupported_attachment": bool(extra_uploads or (storage_key is not None and not supported)),
        })
    session.execute(statement, rows)

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from vetdietderm_api.clock import utc_now
from vetdietderm_api.messaging.models import ClinicContact, ClinicConversation, ConversationMessage


def open_contact(
    session: Session,
    clinic_id: UUID,
    telegram_user_id: int,
    telegram_chat_id: int,
    profile_name: str | None,
    username: str | None,
    *,
    refresh_profile: bool = True,
) -> tuple[ClinicContact, ClinicConversation]:
    """Open the pair in the caller's transaction."""
    statement = insert(ClinicContact).values(
        clinic_id=clinic_id,
        telegram_user_id=telegram_user_id,
        telegram_chat_id=telegram_chat_id,
        profile_name=profile_name,
        username=username,
        local_name=(profile_name or "").strip() or (username or "").strip() or str(telegram_user_id),
    )
    # Both paths hold the contact row lock until commit, serializing conversation creation.
    if refresh_profile:
        statement = statement.on_conflict_do_update(
            index_elements=[ClinicContact.clinic_id, ClinicContact.telegram_user_id],
            set_={
                "profile_name": statement.excluded.profile_name,
                "username": statement.excluded.username,
                "updated_at": utc_now(),
            },
        )
    else:
        statement = statement.on_conflict_do_nothing(
            index_elements=[ClinicContact.clinic_id, ClinicContact.telegram_user_id],
        )
    contact = session.scalars(
        statement.returning(ClinicContact),
        execution_options={"populate_existing": True},
    ).one_or_none()
    if contact is None:
        contact = session.scalars(
            select(ClinicContact).where(
                ClinicContact.clinic_id == clinic_id,
                ClinicContact.telegram_user_id == telegram_user_id,
            ).with_for_update(),
            execution_options={"populate_existing": True},
        ).one()
    conversation = session.scalar(
        select(ClinicConversation).where(
            ClinicConversation.clinic_id == clinic_id,
            ClinicConversation.contact_uuid == contact.uuid,
        )
    )
    if conversation is None:
        conversation = ClinicConversation(clinic_id=clinic_id, contact_uuid=contact.uuid)
        session.add(conversation)
        session.flush()
    return contact, conversation


def clinic_contacts(clinic_id: UUID):
    return (
        select(ClinicContact, ClinicConversation.uuid.label("conversation_uuid"))
        .join(
            ClinicConversation,
            (ClinicConversation.contact_uuid == ClinicContact.uuid)
            & (ClinicConversation.clinic_id == ClinicContact.clinic_id),
        )
        .where(ClinicContact.clinic_id == clinic_id)
    )


def clinic_messages(clinic_id: UUID):
    return (
        select(ConversationMessage)
        .select_from(ConversationMessage)
        .join(
            ClinicConversation,
            (ClinicConversation.uuid == ConversationMessage.conversation_uuid)
            & (ClinicConversation.clinic_id == ConversationMessage.clinic_id),
        )
        .join(
            ClinicContact,
            (ClinicContact.uuid == ClinicConversation.contact_uuid)
            & (ClinicContact.clinic_id == ClinicConversation.clinic_id),
        )
        .where(ConversationMessage.clinic_id == clinic_id)
    )

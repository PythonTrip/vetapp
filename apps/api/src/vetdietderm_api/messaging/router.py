from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session, with_expression

from vetdietderm_api.attachments.storage import resolve_file
from vetdietderm_api.db import get_session
from vetdietderm_api.messaging.audit import change_client_link, list_link_events
from vetdietderm_api.messaging.models import ClinicContact, ConversationMessage
from vetdietderm_api.messaging.repository import clinic_contacts, clinic_messages
from vetdietderm_api.messaging.schemas import (
    ContactClientUpdate,
    ContactLinkEventRead,
    ContactRead,
    ContactUpdate,
    ConversationMessageRead,
    MessagePatientUpdate,
)
from vetdietderm_api.patients import repository as patients
from vetdietderm_api.patients.models import Client, Patient
from vetdietderm_api.patients.schemas import ClientCreate

router = APIRouter()
contacts = APIRouter(prefix="/contacts", tags=["contacts"])
messages = APIRouter(prefix="/messages", tags=["messages"])
DatabaseSession = Annotated[Session, Depends(get_session)]


def contact_read(contact: ClinicContact, conversation_uuid: UUID) -> ContactRead:
    return ContactRead(
        uuid=contact.uuid,
        clinic_id=contact.clinic_id,
        telegram_user_id=contact.telegram_user_id,
        telegram_chat_id=contact.telegram_chat_id,
        profile_name=contact.profile_name,
        username=contact.username,
        local_name=contact.local_name,
        client_uuid=contact.client_uuid,
        conversation_uuid=conversation_uuid,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


def get_clinic_contact(
    contact_id: UUID, clinic_id: UUID, db: Session, *, for_update: bool = False,
) -> tuple[ClinicContact, UUID]:
    statement = clinic_contacts(clinic_id).where(ClinicContact.uuid == contact_id)
    if for_update:
        statement = statement.with_for_update(of=ClinicContact)
    row = db.execute(statement).one_or_none()
    if row is None:
        raise HTTPException(404, "Запись не найдена")
    contact, conversation_uuid = row
    return contact, conversation_uuid


@contacts.get("")
def list_contacts(request: Request, db: DatabaseSession) -> list[ContactRead]:
    rows = db.execute(
        clinic_contacts(UUID(str(request.state.tenant_id))).order_by(ClinicContact.created_at, ClinicContact.uuid)
    )
    return [contact_read(contact, conversation_uuid) for contact, conversation_uuid in rows]


@contacts.get("/{contact_id}")
def get_contact(contact_id: UUID, request: Request, db: DatabaseSession) -> ContactRead:
    return contact_read(*get_clinic_contact(contact_id, UUID(str(request.state.tenant_id)), db))


@contacts.get("/{contact_id}/messages")
def get_contact_messages(contact_id: UUID, request: Request, db: DatabaseSession) -> list[ConversationMessageRead]:
    clinic_id = UUID(str(request.state.tenant_id))
    _, conversation_uuid = get_clinic_contact(contact_id, clinic_id, db)
    messages = db.scalars(
        clinic_messages(clinic_id)
        .outerjoin(
            Patient,
            (Patient.uuid == ConversationMessage.patient_uuid)
            & (Patient.client_uuid == ClinicContact.client_uuid)
            & (Patient.tenant_id == ClinicContact.clinic_id),
        )
        .options(with_expression(ConversationMessage.patient_current, Patient.uuid.is_not(None)))
        .where(ConversationMessage.conversation_uuid == conversation_uuid)
        .order_by(ConversationMessage.occurred_at, ConversationMessage.uuid)
    )
    return [ConversationMessageRead.model_validate(message) for message in messages]


@messages.patch("/{message_id}")
def update_message_patient(
    message_id: UUID, body: MessagePatientUpdate, request: Request, db: DatabaseSession,
) -> ConversationMessageRead:
    clinic_id = UUID(str(request.state.tenant_id))
    # Serialize tag validation with relinks and keep the Patient association stable through commit.
    contact = db.execute(
        clinic_messages(clinic_id)
        .with_only_columns(ClinicContact.client_uuid)
        .where(ConversationMessage.uuid == message_id)
        .with_for_update(of=ClinicContact)
    ).one_or_none()
    if contact is None:
        raise HTTPException(404, "Запись не найдена")
    if body.patient_uuid is not None:
        if contact.client_uuid is None or db.scalar(
            select(Patient.uuid)
            .where(
                Patient.uuid == body.patient_uuid,
                Patient.client_uuid == contact.client_uuid,
                Patient.tenant_id == clinic_id,
            )
            .with_for_update(read=True)
        ) is None:
            raise HTTPException(422, "Пациент не относится к текущему клиенту контакта")
    message = db.scalars(
        update(ConversationMessage)
        .where(ConversationMessage.uuid == message_id, ConversationMessage.clinic_id == clinic_id)
        .values(patient_uuid=body.patient_uuid)
        .returning(ConversationMessage)
    ).one_or_none()
    if message is None:
        raise HTTPException(404, "Запись не найдена")
    message.patient_current = body.patient_uuid is not None
    db.commit()
    return ConversationMessageRead.model_validate(message)


@messages.get(
    "/{message_id}/file",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}}}},
)
def get_message_file(message_id: UUID, request: Request, db: DatabaseSession) -> Response:
    # Keep a concurrent edit from replacing the file while this request reads it.
    message = db.scalar(
        select(ConversationMessage)
        .where(ConversationMessage.uuid == message_id, ConversationMessage.clinic_id == UUID(str(request.state.tenant_id)))
        .with_for_update(read=True)
    )
    if message is None or message.attachment_storage_key is None:
        raise HTTPException(404, "Файл не найден")
    try:
        payload = resolve_file(message.attachment_storage_key).read_bytes()
    except FileNotFoundError:
        raise HTTPException(404, "Файл не найден") from None
    return Response(
        payload, media_type=message.attachment_content_type,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@contacts.patch("/{contact_id}")
def update_contact(contact_id: UUID, body: ContactUpdate, request: Request, db: DatabaseSession) -> ContactRead:
    clinic_id = UUID(str(request.state.tenant_id))
    db.execute(
        update(ClinicContact)
        .where(ClinicContact.clinic_id == clinic_id, ClinicContact.uuid == contact_id)
        .values(local_name=body.local_name)
    )
    contact, conversation_uuid = get_clinic_contact(contact_id, clinic_id, db)
    db.commit()
    return contact_read(contact, conversation_uuid)


def save_client_link(db: Session, contact: ClinicContact, client_uuid: UUID | None, request: Request) -> None:
    user = request.state.user
    display_name = user.get("display_name")
    change_client_link(
        db, contact, client_uuid,
        actor_user_id=UUID(str(user["user_id"])),
        actor_label=display_name if isinstance(display_name, str) and display_name else user["email"],
    )
    db.commit()


@contacts.put("/{contact_id}/client")
def set_contact_client(
    contact_id: UUID, body: ContactClientUpdate, request: Request, db: DatabaseSession,
) -> ContactRead:
    clinic_id = UUID(str(request.state.tenant_id))
    contact, conversation_uuid = get_clinic_contact(contact_id, clinic_id, db, for_update=True)
    if body.client_uuid is not None:
        client_uuid = db.scalar(
            select(Client.uuid)
            .where(Client.uuid == body.client_uuid, Client.tenant_id == clinic_id)
            .with_for_update(read=True, key_share=True)
        )
        if client_uuid is None:
            raise HTTPException(404, "Запись не найдена")
    save_client_link(db, contact, body.client_uuid, request)
    return contact_read(contact, conversation_uuid)


@contacts.post("/{contact_id}/client", status_code=201)
def create_contact_client(contact_id: UUID, request: Request, db: DatabaseSession) -> ContactRead:
    clinic_id = UUID(str(request.state.tenant_id))
    contact, conversation_uuid = get_clinic_contact(contact_id, clinic_id, db, for_update=True)
    client = patients.create_client(db, ClientCreate(name=contact.local_name), commit=False)
    save_client_link(db, contact, client.uuid, request)
    return contact_read(contact, conversation_uuid)


@contacts.get("/{contact_id}/link-events")
def get_contact_link_events(contact_id: UUID, request: Request, db: DatabaseSession) -> list[ContactLinkEventRead]:
    clinic_id = UUID(str(request.state.tenant_id))
    get_clinic_contact(contact_id, clinic_id, db)
    return [ContactLinkEventRead.model_validate(event) for event in list_link_events(db, clinic_id, contact_id)]


router.include_router(contacts)
router.include_router(messages)

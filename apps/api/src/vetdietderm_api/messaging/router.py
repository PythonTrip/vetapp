from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.messaging.audit import change_client_link, list_link_events
from vetdietderm_api.messaging.models import ClinicContact
from vetdietderm_api.messaging.repository import clinic_contacts
from vetdietderm_api.messaging.schemas import ContactClientUpdate, ContactLinkEventRead, ContactRead, ContactUpdate
from vetdietderm_api.patients import repository as patients
from vetdietderm_api.patients.models import Client
from vetdietderm_api.patients.schemas import ClientCreate

router = APIRouter(prefix="/contacts", tags=["contacts"])
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


@router.get("")
def list_contacts(request: Request, db: DatabaseSession) -> list[ContactRead]:
    rows = db.execute(
        clinic_contacts(UUID(str(request.state.tenant_id))).order_by(ClinicContact.created_at, ClinicContact.uuid)
    )
    return [contact_read(contact, conversation_uuid) for contact, conversation_uuid in rows]


@router.get("/{contact_id}")
def get_contact(contact_id: UUID, request: Request, db: DatabaseSession) -> ContactRead:
    return contact_read(*get_clinic_contact(contact_id, UUID(str(request.state.tenant_id)), db))


@router.patch("/{contact_id}")
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


@router.put("/{contact_id}/client")
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


@router.post("/{contact_id}/client", status_code=201)
def create_contact_client(contact_id: UUID, request: Request, db: DatabaseSession) -> ContactRead:
    clinic_id = UUID(str(request.state.tenant_id))
    contact, conversation_uuid = get_clinic_contact(contact_id, clinic_id, db, for_update=True)
    client = patients.create_client(db, ClientCreate(name=contact.local_name), commit=False)
    save_client_link(db, contact, client.uuid, request)
    return contact_read(contact, conversation_uuid)


@router.get("/{contact_id}/link-events")
def get_contact_link_events(contact_id: UUID, request: Request, db: DatabaseSession) -> list[ContactLinkEventRead]:
    clinic_id = UUID(str(request.state.tenant_id))
    get_clinic_contact(contact_id, clinic_id, db)
    return [ContactLinkEventRead.model_validate(event) for event in list_link_events(db, clinic_id, contact_id)]

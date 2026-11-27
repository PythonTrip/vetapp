from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.messaging.models import ClinicContact
from vetdietderm_api.messaging.repository import clinic_contacts
from vetdietderm_api.messaging.schemas import ContactRead, ContactUpdate

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


def get_clinic_contact(contact_id: UUID, clinic_id: UUID, db: Session) -> tuple[ClinicContact, UUID]:
    row = db.execute(
        clinic_contacts(clinic_id).where(ClinicContact.uuid == contact_id)
    ).one_or_none()
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

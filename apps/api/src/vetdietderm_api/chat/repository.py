from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from vetdietderm_api.chat.models import ChatMessage, ChatThread
from vetdietderm_api.owners import repository as owners
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal
from vetdietderm_api.patients.models import Patient


ChatTarget = tuple[UUID | None, UUID | None, JoinCode | None]


def owner_target(db: Session, owner: OwnerAccount, animal_id: UUID, *, write=False) -> ChatTarget:
    # Shares acceptance's registration lock, so a first send cannot miss its transfer.
    registration = owners.registration_for_owner(db, owner, lock=True)
    if owner.join_code_uuid is None:
        raise HTTPException(409, "Подключите врача по коду, чтобы пользоваться чатом и заявками")
    code = db.get(JoinCode, owner.join_code_uuid)
    if registration.client_uuid:
        patient = db.scalar(select(Patient).where(Patient.uuid == animal_id,
            Patient.client_uuid == registration.client_uuid, owners.workspace_filter(Patient, code)).with_for_update())
        if patient is not None:
            return None, patient.uuid, code
    else:
        animal = db.scalar(select(OwnerAnimal).where(OwnerAnimal.uuid == animal_id,
            OwnerAnimal.registration_uuid == registration.uuid))
        if animal is not None:
            return animal.uuid, None, code
    raise HTTPException(404, "Животное не найдено")


def link_thread(db: Session, animal_id: UUID, patient_id: UUID):
    pending = db.scalar(select(ChatThread).where(ChatThread.owner_animal_uuid == animal_id))
    if pending is None:
        return
    existing = db.scalar(select(ChatThread).where(ChatThread.patient_uuid == patient_id))
    if existing and existing.uuid != pending.uuid:
        # A matched clinical patient may already have a conversation. Preserve both
        # histories in the pending thread rather than failing the unique constraint.
        db.execute(update(ChatMessage).where(ChatMessage.thread_uuid == existing.uuid).values(thread_uuid=pending.uuid))
        db.delete(existing)
        db.flush()
    pending.patient_uuid = patient_id
    db.flush()

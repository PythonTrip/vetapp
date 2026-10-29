from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from vetdietderm_api.chat.models import ChatMessage, ChatThread
from vetdietderm_api.chat.schemas import MessageCreate, MessageRead
from vetdietderm_api.owners import repository as owners
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal
from vetdietderm_api.patients.models import Patient


def owner_target(db: Session, owner: OwnerAccount, animal_id: UUID, *, write=False):
    # Shares acceptance's registration lock, so a first send cannot miss its transfer.
    registration = owners.registration_for_owner(db, owner, lock=True)
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


def registration_target(db: Session, registration_id: UUID, animal_id: UUID, user: dict, *, write=False):
    registration, _, code = owners.registration_context(db, registration_id, lock=True)
    owners.authorize_registration(code, user, write=write)
    animal = db.scalar(select(OwnerAnimal).where(OwnerAnimal.uuid == animal_id,
        OwnerAnimal.registration_uuid == registration.uuid))
    if animal is None:
        raise HTTPException(404, "Животное не найдено")
    if animal.patient_uuid:
        db.scalar(select(Patient).where(Patient.uuid == animal.patient_uuid).with_for_update())
    return animal.uuid, animal.patient_uuid, code


def patient_target(db: Session, patient_id: UUID, user: dict, tenant_id: str | None, *, write=False):
    # Explicit workspace predicate: chat tables deliberately do not use TenantOwned.
    condition = Patient.tenant_id == UUID(tenant_id) if tenant_id else (
        Patient.tenant_id.is_(None) & (Patient.created_by == UUID(user["user_id"])))
    patient = db.scalar(select(Patient).where(Patient.uuid == patient_id, condition).with_for_update())
    if patient is None:
        raise HTTPException(404, "Пациент не найден")
    if write and tenant_id and (user.get("organization") or {}).get("org_role") not in {"owner", "admin", "member"}:
        raise HTTPException(403, "Роль наблюдателя разрешает только просмотр")
    return None, patient.uuid, None


def thread_for(db: Session, target, *, create=False):
    animal_id, patient_id, _ = target
    condition = ChatThread.patient_uuid == patient_id if patient_id else ChatThread.owner_animal_uuid == animal_id
    thread = db.scalar(select(ChatThread).where(condition))
    if thread is None and create:
        # All callers hold the registration/patient lock before the unique insert.
        thread = ChatThread(owner_animal_uuid=animal_id, patient_uuid=patient_id)
        db.add(thread)
        db.flush()
    return thread


def list_messages(db: Session, target, *, owner_view=False):
    thread = thread_for(db, target)
    if thread is None:
        return []
    messages = db.scalars(select(ChatMessage).where(ChatMessage.thread_uuid == thread.uuid)
        .order_by(ChatMessage.created_at, ChatMessage.uuid))
    result = []
    for message in messages:
        item = MessageRead.model_validate(message)
        if owner_view and message.author_kind == "staff":
            item.author_label = target[2].doctor_label
        elif not owner_view and message.author_kind == "owner":
            item.author_label = "Владелец"
        result.append(item)
    return result


def add_message(db: Session, target, payload: MessageCreate, *, owner: OwnerAccount | None = None, user: dict | None = None):
    thread = thread_for(db, target, create=True)
    message = ChatMessage(thread_uuid=thread.uuid, body=payload.body,
        author_kind="owner" if owner else "staff", author_id=owner.uuid if owner else UUID(user["user_id"]),
        author_label=owner.name if owner else user.get("display_name") or user["email"])
    db.add(message)
    db.flush()
    result = MessageRead.model_validate(message)
    if owner is None:
        return result
    result.author_label = owner.name
    return result


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

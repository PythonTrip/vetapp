from uuid import UUID

from fastapi import APIRouter, Depends, Request

from vetdietderm_api.auth import csrf, require_clinical_access
from vetdietderm_api.chat import repository as repo
from vetdietderm_api.chat.schemas import MessageCreate, MessageRead
from vetdietderm_api.owners.router import DB, Owner

router = APIRouter(tags=["chat"], dependencies=[Depends(csrf)])
clinical = APIRouter(dependencies=[Depends(require_clinical_access)])


@router.get("/owner/animals/{animal_id}/chat", response_model=list[MessageRead])
def owner_messages(animal_id: UUID, owner: Owner, db: DB):
    return repo.list_messages(db, repo.owner_target(db, owner, animal_id), owner_view=True)


@router.post("/owner/animals/{animal_id}/chat", response_model=MessageRead, status_code=201)
def owner_send(animal_id: UUID, body: MessageCreate, owner: Owner, db: DB):
    message = repo.add_message(db, repo.owner_target(db, owner, animal_id, write=True), body, owner=owner)
    db.commit()
    return message


@clinical.get("/patients/{patient_id}/chat", response_model=list[MessageRead])
def patient_messages(patient_id: UUID, request: Request, db: DB):
    target = repo.patient_target(db, patient_id, request.state.user, request.state.tenant_id)
    return repo.list_messages(db, target)


@clinical.post("/patients/{patient_id}/chat", response_model=MessageRead, status_code=201)
def patient_send(patient_id: UUID, body: MessageCreate, request: Request, db: DB):
    target = repo.patient_target(db, patient_id, request.state.user, request.state.tenant_id, write=True)
    message = repo.add_message(db, target, body, user=request.state.user)
    db.commit()
    return message


@clinical.get("/owner-registrations/{registration_id}/animals/{owner_animal_id}/chat", response_model=list[MessageRead])
def registration_messages(registration_id: UUID, owner_animal_id: UUID, request: Request, db: DB):
    target = repo.registration_target(db, registration_id, owner_animal_id, request.state.user)
    return repo.list_messages(db, target)


@clinical.post("/owner-registrations/{registration_id}/animals/{owner_animal_id}/chat", response_model=MessageRead, status_code=201)
def registration_send(registration_id: UUID, owner_animal_id: UUID, body: MessageCreate, request: Request, db: DB):
    target = repo.registration_target(db, registration_id, owner_animal_id, request.state.user, write=True)
    message = repo.add_message(db, target, body, user=request.state.user)
    db.commit()
    return message


router.include_router(clinical)

from uuid import UUID

from fastapi import APIRouter, Depends, Request

from vetdietderm_api.auth import csrf, require_clinical_access
from vetdietderm_api.chat import repository as repo
from vetdietderm_api.chat.service import send_message
from vetdietderm_api.chat.schemas import MessageCreate, MessageRead
from vetdietderm_api.owners.sessions import DB
from vetdietderm_api.owners.uploads import download

router = APIRouter(tags=["chat"], dependencies=[Depends(csrf)])
clinical = APIRouter(dependencies=[Depends(require_clinical_access)])


@clinical.get("/patients/{patient_id}/chat", response_model=list[MessageRead])
def patient_messages(patient_id: UUID, request: Request, db: DB):
    target = repo.patient_target(db, patient_id, request.state.user, request.state.tenant_id)
    return repo.list_messages(db, target)


@clinical.post("/patients/{patient_id}/chat", response_model=MessageRead, status_code=201)
def patient_send(patient_id: UUID, body: MessageCreate, request: Request, db: DB):
    target = repo.patient_target(db, patient_id, request.state.user, request.state.tenant_id, write=True)
    return send_message(db, target, body, user=request.state.user)


@clinical.get("/owner-registrations/{registration_id}/animals/{owner_animal_id}/chat", response_model=list[MessageRead])
def registration_messages(registration_id: UUID, owner_animal_id: UUID, request: Request, db: DB):
    target = repo.registration_target(db, registration_id, owner_animal_id, request.state.user)
    return repo.list_messages(db, target)


@clinical.post("/owner-registrations/{registration_id}/animals/{owner_animal_id}/chat", response_model=MessageRead, status_code=201)
def registration_send(registration_id: UUID, owner_animal_id: UUID, body: MessageCreate, request: Request, db: DB):
    target = repo.registration_target(db, registration_id, owner_animal_id, request.state.user, write=True)
    return send_message(db, target, body, user=request.state.user)


@clinical.get("/patients/{patient_id}/chat/files/{file_id}")
def patient_chat_file(patient_id: UUID, file_id: UUID, request: Request, db: DB):
    target = repo.patient_target(db, patient_id, request.state.user, request.state.tenant_id)
    return download(repo.get_thread_file(db, target, file_id))


@clinical.get("/owner-registrations/{registration_id}/animals/{animal_id}/chat/files/{file_id}")
def registration_chat_file(registration_id: UUID, animal_id: UUID, file_id: UUID, request: Request, db: DB):
    target = repo.registration_target(db, registration_id, animal_id, request.state.user)
    return download(repo.get_thread_file(db, target, file_id))


router.include_router(clinical)

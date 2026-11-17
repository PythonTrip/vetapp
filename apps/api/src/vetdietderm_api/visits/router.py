from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access
from vetdietderm_api.owners.sessions import DB, Owner
from vetdietderm_api.questionnaires.schemas import QuestionRead
from vetdietderm_api.visits import repository as repo, service
from vetdietderm_api.visits.schemas import (
    StaffVisitRead, VisitConfirm, VisitCreate, VisitFileRead, VisitRead, VisitReject, VisitStatus,
)

router = APIRouter(tags=["visit-requests"], dependencies=[Depends(csrf)])
clinical = APIRouter(dependencies=[Depends(require_clinical_access)])


@router.get("/owner/visit-questions", response_model=list[QuestionRead])
def owner_questions(owner: Owner, db: DB):
    return service.owner_questions(db, owner)


@router.get("/owner/animals/{animal_id}/visits", response_model=list[VisitRead])
def owner_visits(animal_id: UUID, owner: Owner, db: DB):
    return repo.owner_list(db, owner, animal_id)


@router.post("/owner/animals/{animal_id}/visits", response_model=VisitRead, status_code=201)
def create_visit(animal_id: UUID, body: VisitCreate, owner: Owner, db: DB):
    return service.create_visit(db, owner, animal_id, body)


@router.post("/owner/visits/{request_id}/withdraw", response_model=VisitRead)
def withdraw_visit(request_id: UUID, owner: Owner, db: DB):
    return service.withdraw_visit(db, request_id, owner)


@router.post("/owner/visits/{request_id}/cancel", response_model=VisitRead)
def cancel_visit(request_id: UUID, owner: Owner, db: DB):
    return service.cancel_visit(db, request_id, owner)


@router.post("/owner/visits/{request_id}/files", response_model=VisitFileRead, status_code=201)
def upload_file(request_id: UUID, file: UploadFile, owner: Owner, db: DB):
    return service.upload_file(db, request_id, file, owner)


def download(db, row, file_id):
    file = repo.get_visit_file(db, row.uuid, file_id)
    try:
        path = resolve_file(file.storage_key)
    except FileNotFoundError:
        raise HTTPException(404, "Файл не найден") from None
    return FileResponse(path, media_type=file.content_type,
                        filename=f"file{extension_for(file.content_type)}", headers={"Cache-Control": "no-store"})


@router.get("/owner/visits/{request_id}/files/{file_id}")
def owner_download(request_id: UUID, file_id: UUID, owner: Owner, db: DB):
    row, _, _ = repo.context(db, request_id, owner=owner)
    return download(db, row, file_id)


@clinical.get("/visit-requests", response_model=list[StaffVisitRead])
def staff_requests(request: Request, db: DB, status: VisitStatus | None = None):
    return repo.staff_list(db, request.state.user, request.state.tenant_id, status)


@clinical.post("/visit-requests/{request_id}/confirm", response_model=VisitRead)
def confirm_visit(request_id: UUID, body: VisitConfirm, request: Request, db: DB):
    return service.confirm_visit(db, request_id, request.state.user, body)


@clinical.post("/visit-requests/{request_id}/reject", response_model=VisitRead)
def reject_visit(request_id: UUID, body: VisitReject, request: Request, db: DB):
    return service.reject_visit(db, request_id, request.state.user, body)


@clinical.get("/visit-requests/{request_id}/files/{file_id}", response_class=FileResponse,
              responses={200: {"content": {"application/octet-stream": {
                  "schema": {"type": "string", "format": "binary"}}}}})
def staff_download(request_id: UUID, file_id: UUID, request: Request, db: DB):
    row, _, _ = repo.context(db, request_id, user=request.state.user)
    return download(db, row, file_id)


router.include_router(clinical)

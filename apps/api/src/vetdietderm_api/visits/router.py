from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access
from vetdietderm_api.owners.sessions import DB
from vetdietderm_api.visits import repository as repo, service
from vetdietderm_api.visits.schemas import (
    StaffVisitRead, VisitConfirm, VisitRead, VisitReject, VisitStatus,
)

router = APIRouter(tags=["visit-requests"], dependencies=[Depends(csrf)])
clinical = APIRouter(dependencies=[Depends(require_clinical_access)])


def download(db, row, file_id):
    file = repo.get_visit_file(db, row.uuid, file_id)
    try:
        path = resolve_file(file.storage_key)
    except FileNotFoundError:
        raise HTTPException(404, "Файл не найден") from None
    return FileResponse(path, media_type=file.content_type,
                        filename=f"file{extension_for(file.content_type)}", headers={"Cache-Control": "no-store"})


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

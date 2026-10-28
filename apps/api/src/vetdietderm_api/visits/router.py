from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from vetdietderm_api.appointments.models import Appointment
from vetdietderm_api.attachments.storage import extension_for, resolve_file
from vetdietderm_api.auth import csrf, require_clinical_access
from vetdietderm_api.owners.models import utc_now
from vetdietderm_api.owners.router import DB, Owner
from vetdietderm_api.questionnaires.schemas import QuestionRead, VisitType
from vetdietderm_api.visits import repository as repo
from vetdietderm_api.visits.models import VisitRequestFile
from vetdietderm_api.visits.schemas import (
    StaffVisitRead, VisitConfirm, VisitCreate, VisitFileRead, VisitRead, VisitReject, VisitStatus,
)

router = APIRouter(tags=["visit-requests"], dependencies=[Depends(csrf)])
clinical = APIRouter(dependencies=[Depends(require_clinical_access)])


@router.get("/owner/visit-questions/{visit_type}", response_model=list[QuestionRead])
def owner_questions(visit_type: VisitType, owner: Owner, db: DB):
    return repo.questions(db, owner.doctor_user_id, visit_type)


@router.get("/owner/animals/{animal_id}/visits", response_model=list[VisitRead])
def owner_visits(animal_id: UUID, owner: Owner, db: DB):
    return repo.owner_list(db, owner, animal_id)


@router.post("/owner/animals/{animal_id}/visits", response_model=VisitRead, status_code=201)
def create_visit(animal_id: UUID, body: VisitCreate, owner: Owner, db: DB):
    with repo.transaction(db):
        row = repo.create(db, owner, animal_id, body)
        result = repo.read(db, row)
    return result


@router.post("/owner/visits/{request_id}/withdraw", response_model=VisitRead)
def withdraw_visit(request_id: UUID, owner: Owner, db: DB):
    with repo.transaction(db):
        row, _, _ = repo.context(db, request_id, owner=owner)
        repo.require_status(row, "requested")
        row.status, row.updated_at = "withdrawn", utc_now()
        db.flush()
        result = repo.read(db, row)
    return result


@router.post("/owner/visits/{request_id}/cancel", response_model=VisitRead)
def cancel_visit(request_id: UUID, owner: Owner, db: DB):
    with repo.transaction(db):
        row, _, _ = repo.context(db, request_id, owner=owner)
        repo.require_status(row, "scheduled")
        appointment = db.scalar(select(Appointment).where(Appointment.uuid == row.appointment_uuid).with_for_update())
        if appointment is None:
            raise HTTPException(409, "Запись недоступна")
        appointment.status, appointment.updated_at = "cancelled", utc_now()
        row.status, row.updated_at = "cancelled", utc_now()
        db.flush()
        result = repo.read(db, row)
    return result


@router.post("/owner/visits/{request_id}/files", response_model=VisitFileRead, status_code=201)
def upload_file(request_id: UUID, file: UploadFile, owner: Owner, db: DB):
    with repo.transaction(db) as keys:
        row, _, _ = repo.context(db, request_id, owner=owner)
        result = VisitFileRead.model_validate(repo.upload(db, row, file, keys))
    return result


def download(db, row, file_id):
    file = db.scalar(select(VisitRequestFile).where(
        VisitRequestFile.uuid == file_id, VisitRequestFile.request_uuid == row.uuid))
    if file is None:
        raise HTTPException(404, "Файл не найден")
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
    with repo.transaction(db) as keys:
        row = repo.confirm(db, request_id, request.state.user, body, keys)
        result = repo.read(db, row)
    return result


@clinical.post("/visit-requests/{request_id}/reject", response_model=VisitRead)
def reject_visit(request_id: UUID, body: VisitReject, request: Request, db: DB):
    with repo.transaction(db):
        row, _, _ = repo.context(db, request_id, user=request.state.user, write=True)
        repo.require_status(row, "requested")
        row.status, row.rejection_reason, row.updated_at = "rejected", body.reason or None, utc_now()
        db.flush()
        result = repo.read(db, row)
    return result


@clinical.get("/visit-requests/{request_id}/files/{file_id}")
def staff_download(request_id: UUID, file_id: UUID, request: Request, db: DB):
    row, _, _ = repo.context(db, request_id, user=request.state.user)
    return download(db, row, file_id)


router.include_router(clinical)

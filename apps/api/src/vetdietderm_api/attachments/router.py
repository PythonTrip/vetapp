from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.attachments import repository
from vetdietderm_api.attachments.schemas import AttachmentKind, AttachmentRead, AttachmentUpdate
from vetdietderm_api.attachments.storage import resolve_file
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter()
patient_attachments = APIRouter(tags=["attachments"])
attachments = APIRouter(prefix="/attachments", tags=["attachments"])


@patient_attachments.get("/patients/{patient_id}/attachments", response_model=list[AttachmentRead])
@logger.catch(reraise=True)
def list_patient_attachments(patient_id: UUID, session: SessionDep) -> list[AttachmentRead]:
    return [AttachmentRead.model_validate(row) for row in repository.list_attachments(session, patient_id)]


@patient_attachments.post(
    "/patients/{patient_id}/attachments",
    response_model=AttachmentRead,
    status_code=201,
)
@logger.catch(reraise=True)
def upload_patient_attachment(
    patient_id: UUID,
    session: SessionDep,
    file: Annotated[UploadFile, File()],
    kind: Annotated[AttachmentKind, Form()] = AttachmentKind.lesion_photo,
    caption: Annotated[str | None, Form()] = None,
    body_region: Annotated[str | None, Form()] = None,
    vas_score: Annotated[int | None, Form()] = None,
    encounter_uuid: Annotated[UUID | None, Form()] = None,
) -> AttachmentRead:
    if vas_score is not None and not 1 <= vas_score <= 10:
        raise HTTPException(status_code=422, detail="VAS должен быть от 1 до 10")
    return AttachmentRead.model_validate(
        repository.create_attachment(
            session,
            patient_id,
            file,
            kind,
            caption,
            body_region,
            vas_score,
            encounter_uuid,
        )
    )


@attachments.get("/{attachment_id}", response_model=AttachmentRead)
@logger.catch(reraise=True)
def read_attachment(attachment_id: UUID, session: SessionDep) -> AttachmentRead:
    return AttachmentRead.model_validate(repository.get_attachment(session, attachment_id))


@attachments.get("/{attachment_id}/file")
@logger.catch(reraise=True)
def download_attachment(attachment_id: UUID, session: SessionDep) -> FileResponse:
    attachment = repository.get_attachment(session, attachment_id)
    path = resolve_file(attachment.storage_key)
    return FileResponse(path, media_type=attachment.content_type, filename=path.name)


@attachments.patch("/{attachment_id}", response_model=AttachmentRead)
@logger.catch(reraise=True)
def patch_attachment(
    attachment_id: UUID,
    payload: AttachmentUpdate,
    session: SessionDep,
) -> AttachmentRead:
    return AttachmentRead.model_validate(repository.update_attachment(session, attachment_id, payload))


@attachments.delete("/{attachment_id}", status_code=204)
@logger.catch(reraise=True)
def remove_attachment(attachment_id: UUID, session: SessionDep) -> Response:
    repository.delete_attachment(session, attachment_id)
    return Response(status_code=204)


router.include_router(patient_attachments)
router.include_router(attachments)

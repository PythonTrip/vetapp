from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.attachments.models import Attachment, utc_now
from vetdietderm_api.attachments.schemas import AttachmentKind, AttachmentUpdate
from vetdietderm_api.attachments.storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_ATTACHMENT_BYTES,
    delete_file,
    write_bytes,
)
from vetdietderm_api.encounters.repository import get_encounter
from vetdietderm_api.owners.models import JoinCode, OwnerAccount
from vetdietderm_api.owners.repository import registration_for_owner, workspace_filter
from vetdietderm_api.patients.models import Patient
from vetdietderm_api.patients.repository import get_patient


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def list_attachments(session: Session, patient_uuid: UUID) -> list[Attachment]:
    get_patient(session, patient_uuid)
    stmt = (
        select(Attachment)
        .where(Attachment.patient_uuid == patient_uuid)
        .order_by(Attachment.created_at.desc())
    )
    return list(session.scalars(stmt).all())


def get_attachment(session: Session, attachment_uuid: UUID) -> Attachment:
    attachment = session.get(Attachment, attachment_uuid)
    if attachment is None:
        raise _not_found("Файл не найден")
    return attachment


def create_attachment(
    session: Session,
    patient_uuid: UUID,
    upload: UploadFile,
    kind: AttachmentKind,
    caption: str | None,
    body_region: str | None,
    vas_score: int | None,
    encounter_uuid: UUID | None,
    *,
    owner_visible: bool = False,
    uploaded_by_owner: bool = False,
) -> Attachment:
    get_patient(session, patient_uuid)
    if encounter_uuid is not None:
        encounter = get_encounter(session, encounter_uuid)
        if encounter.patient_uuid != patient_uuid:
            raise _bad_request("Приём принадлежит другому пациенту")

    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise _bad_request("Допустимы JPEG, PNG, WebP, GIF и PDF")

    payload = upload.file.read()
    if not payload:
        raise _bad_request("Файл пустой")
    if len(payload) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 8 МБ")

    storage_key = write_bytes(content_type, payload)
    attachment = Attachment(
        patient_uuid=patient_uuid,
        encounter_uuid=encounter_uuid,
        kind=kind.value,
        caption=caption.strip() if caption and caption.strip() else None,
        body_region=body_region.strip() if body_region and body_region.strip() else None,
        vas_score=vas_score,
        content_type=content_type,
        byte_size=len(payload),
        storage_key=storage_key,
        owner_visible=owner_visible,
        uploaded_by_owner=uploaded_by_owner,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return attachment


def update_attachment(
    session: Session,
    attachment_uuid: UUID,
    data: AttachmentUpdate,
) -> Attachment:
    attachment = get_attachment(session, attachment_uuid)
    payload = data.model_dump(exclude_unset=True)
    payload.pop("uploaded_by_owner", None)
    if payload.get("owner_visible") is None:
        payload.pop("owner_visible", None)
    if "encounter_uuid" in payload and payload["encounter_uuid"] is not None:
        encounter = get_encounter(session, payload["encounter_uuid"])
        if encounter.patient_uuid != attachment.patient_uuid:
            raise _bad_request("Приём принадлежит другому пациенту")
    if "kind" in payload and payload["kind"] is not None:
        payload["kind"] = payload["kind"].value
    for key, value in payload.items():
        setattr(attachment, key, value)
    attachment.updated_at = utc_now()
    session.commit()
    session.refresh(attachment)
    return attachment


def _linked_patient(session: Session, owner: OwnerAccount, animal_id: UUID) -> Patient:
    registration = registration_for_owner(session, owner)
    code = session.get(JoinCode, owner.join_code_uuid)
    patient = None
    if registration.client_uuid is not None and code is not None:
        patient = session.scalar(
            select(Patient).where(
                Patient.uuid == animal_id,
                Patient.client_uuid == registration.client_uuid,
                workspace_filter(Patient, code),
            )
        )
    if patient is None:
        raise _not_found("Файл не найден")
    return patient


def list_owner_files(session: Session, owner: OwnerAccount, animal_id: UUID) -> list[Attachment]:
    patient = _linked_patient(session, owner, animal_id)
    stmt = (
        select(Attachment)
        .where(Attachment.patient_uuid == patient.uuid, Attachment.owner_visible.is_(True))
        .order_by(Attachment.created_at.desc(), Attachment.uuid.desc())
    )
    return list(session.scalars(stmt).all())


def get_owner_file(session: Session, owner: OwnerAccount, attachment_id: UUID) -> Attachment:
    registration = registration_for_owner(session, owner)
    code = session.get(JoinCode, owner.join_code_uuid)
    attachment = None
    if registration.client_uuid is not None and code is not None:
        attachment = session.scalar(
            select(Attachment)
            .join(Patient, Attachment.patient_uuid == Patient.uuid)
            .where(
                Attachment.uuid == attachment_id,
                Attachment.owner_visible.is_(True),
                Patient.client_uuid == registration.client_uuid,
                workspace_filter(Patient, code),
            )
        )
    if attachment is None:
        raise _not_found("Файл не найден")
    return attachment


def delete_attachment(session: Session, attachment_uuid: UUID) -> None:
    attachment = get_attachment(session, attachment_uuid)
    storage_key = attachment.storage_key
    session.delete(attachment)
    session.commit()
    delete_file(storage_key)

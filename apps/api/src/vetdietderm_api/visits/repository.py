import math
import re
from contextlib import contextmanager
from datetime import date
from uuid import UUID

from fastapi import HTTPException, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from vetdietderm_api.appointments.models import Appointment
from vetdietderm_api.attachments import storage
from vetdietderm_api.attachments.repository import create_attachment
from vetdietderm_api.attachments.schemas import AttachmentKind
from vetdietderm_api.chat.repository import owner_target
from vetdietderm_api.owners import repository as owners
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration, utc_now
from vetdietderm_api.patients.models import Patient
from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire
from vetdietderm_api.questionnaires.schemas import VisitType
from vetdietderm_api.visits.models import VisitRequest, VisitRequestFile
from vetdietderm_api.visits.schemas import VisitFileRead, VisitRead


@contextmanager
def transaction(db: Session):
    keys = []
    try:
        yield keys
        db.commit()
    except Exception:
        db.rollback()
        for key in keys:
            storage.delete_file(key)
        raise


def questions(db: Session, doctor_id: UUID, visit_type: VisitType):
    # Replacement locks the same row: submission copies one complete publication.
    slot = db.scalar(select(VisitQuestionnaire).where(
        VisitQuestionnaire.doctor_user_id == doctor_id,
        VisitQuestionnaire.visit_type == visit_type).with_for_update())
    if slot is None:
        return []
    return list(db.scalars(select(VisitQuestion).where(
        VisitQuestion.questionnaire_uuid == slot.uuid).order_by(VisitQuestion.position)))


def snapshot(published, answers):
    submitted = {answer.question_id: answer.value for answer in answers}
    if len(submitted) != len(answers) or set(submitted) != {q.uuid for q in published}:
        raise HTTPException(422, "Ответьте на все вопросы актуальной анкеты")
    result = []
    for question in published:
        value = submitted[question.uuid]
        options = question.options
        allowed = {option["value"] for option in options}
        valid = False
        match question.kind:
            case "binary":
                valid = isinstance(value, str) and value in {"yes", "no"}
            case "single_select":
                valid = isinstance(value, str) and value in allowed
            case "multi_select":
                valid = (isinstance(value, list) and bool(value)
                         and all(isinstance(v, str) and v in allowed for v in value)
                         and len(value) == len(set(value)))
            case "number":
                valid = type(value) in {int, float}
                if valid:
                    try:
                        valid = math.isfinite(value)
                    except OverflowError:
                        valid = False
            case "text":
                if isinstance(value, str):
                    value = value.strip()
                    valid = 1 <= len(value) <= 4000
            case "date":
                if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    try:
                        date.fromisoformat(value)
                        valid = True
                    except ValueError:
                        pass
        if not valid:
            raise HTTPException(422, f"Проверьте ответ: {question.label}")
        result.append(dict(question_id=str(question.uuid), label=question.label,
                           kind=question.kind, value=value, options=options))
    return result


def read(db: Session, row: VisitRequest):
    result = VisitRead.model_validate(row)
    result.files = [VisitFileRead.model_validate(file) for file in db.scalars(select(VisitRequestFile).where(
        VisitRequestFile.request_uuid == row.uuid).order_by(VisitRequestFile.created_at, VisitRequestFile.uuid))]
    return result


def create(db: Session, owner: OwnerAccount, animal_id: UUID, body):
    animal_id, patient_id, code = owner_target(db, owner, animal_id)
    row = VisitRequest(owner_account_uuid=owner.uuid, owner_animal_uuid=animal_id,
                       patient_uuid=patient_id, visit_type=body.visit_type,
                       proposed_starts_at=body.proposed_starts_at,
                       answers=snapshot(questions(db, code.doctor_user_id, body.visit_type), body.answers))
    db.add(row)
    db.flush()
    return row


def owner_list(db: Session, owner: OwnerAccount, animal_id: UUID):
    animal, patient, _ = owner_target(db, owner, animal_id)
    targets = [VisitRequest.owner_animal_uuid == animal] if animal else [VisitRequest.patient_uuid == patient]
    if patient:
        targets.append(VisitRequest.owner_animal_uuid.in_(select(OwnerAnimal.uuid).where(OwnerAnimal.patient_uuid == patient)))
    rows = db.scalars(select(VisitRequest).where(VisitRequest.owner_account_uuid == owner.uuid,
        or_(*targets)).order_by(VisitRequest.created_at.desc(), VisitRequest.uuid.desc()))
    return [read(db, row) for row in rows]


def context(db: Session, request_id: UUID, *, owner=None, user=None, write=False):
    # Always lock registration before request, matching passport writes and acceptance.
    row = db.get(VisitRequest, request_id)
    if row is None or (owner is not None and row.owner_account_uuid != owner.uuid):
        raise HTTPException(404, "Заявка не найдена")
    account = owner or db.get(OwnerAccount, row.owner_account_uuid)
    registration = owners.registration_for_owner(db, account, lock=True)
    code = db.get(JoinCode, account.join_code_uuid)
    if user is not None:
        owners.authorize_registration(code, user, write=write)
    row = db.scalar(select(VisitRequest).where(VisitRequest.uuid == request_id)
                    .with_for_update().execution_options(populate_existing=True))
    if row.patient_uuid is None and row.owner_animal_uuid:
        animal = db.get(OwnerAnimal, row.owner_animal_uuid)
        if animal and animal.patient_uuid:
            row.patient_uuid = animal.patient_uuid
    return row, registration, code


def require_status(row, status):
    if row.status != status:
        raise HTTPException(409, "Статус заявки уже изменился")


def copy_gallery(db, row, file, keys):
    if row.patient_uuid is None or file.gallery_copied:
        return
    try:
        path = storage.resolve_file(file.storage_key)
    except FileNotFoundError:
        raise HTTPException(404, "Файл заявки не найден") from None
    with path.open("rb") as stream:
        from starlette.datastructures import Headers
        upload = UploadFile(stream, headers=Headers({"content-type": file.content_type}))
        attachment = create_attachment(db, row.patient_uuid, upload,
            AttachmentKind.document if file.content_type == "application/pdf" else AttachmentKind.lesion_photo,
            None, None, None, None, owner_visible=True, uploaded_by_owner=True, commit=False)
    keys.append(attachment.storage_key)
    file.gallery_copied = True


def confirm(db, request_id, user, body, keys):
    row, registration, code = context(db, request_id, user=user, write=True)
    require_status(row, "requested")
    if registration.status == "pending":
        if body.registration is None:
            raise HTTPException(422, "Укажите способ принятия регистрации")
        db.info["user"] = user
        owners.accept_registration(db, registration.uuid, body.registration)
    if row.patient_uuid is None and row.owner_animal_uuid:
        row.patient_uuid = db.get(OwnerAnimal, row.owner_animal_uuid).patient_uuid
    patient = db.scalar(select(Patient).where(Patient.uuid == row.patient_uuid,
        Patient.client_uuid == registration.client_uuid, owners.workspace_filter(Patient, code)))
    if patient is None:
        raise HTTPException(409, "Пациент заявки недоступен")
    appointment = Appointment(patient_uuid=patient.uuid, tenant_id=code.tenant_id,
        created_by=code.doctor_user_id, visit_type=row.visit_type, starts_at=body.starts_at,
        duration_min=body.duration_min, status="scheduled")
    db.add(appointment)
    db.flush()
    row.appointment_uuid = appointment.uuid
    row.confirmed_starts_at = body.starts_at
    row.duration_min = body.duration_min
    row.status = "scheduled"
    row.updated_at = utc_now()
    for file in db.scalars(select(VisitRequestFile).where(VisitRequestFile.request_uuid == row.uuid)):
        copy_gallery(db, row, file, keys)
    db.flush()
    return row


def upload(db, row, upload, keys):
    require_status(row, "requested")
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type not in storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, "Допустимы JPEG, PNG, WebP, GIF и PDF")
    body = upload.file.read(storage.MAX_ATTACHMENT_BYTES + 1)
    if not body:
        raise HTTPException(400, "Файл пустой")
    if len(body) > storage.MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Файл больше 8 МБ")
    key = storage.write_bytes(content_type, body)
    keys.append(key)
    file = VisitRequestFile(request_uuid=row.uuid, storage_key=key, content_type=content_type, byte_size=len(body))
    db.add(file)
    db.flush()
    copy_gallery(db, row, file, keys)
    return file


def staff_list(db, user, tenant_id, status):
    stmt = select(VisitRequest, OwnerAccount, OwnerRegistration, JoinCode).join(
        OwnerAccount, VisitRequest.owner_account_uuid == OwnerAccount.uuid).join(
        OwnerRegistration, OwnerRegistration.owner_account_uuid == OwnerAccount.uuid).join(
        JoinCode, OwnerAccount.join_code_uuid == JoinCode.uuid)
    if tenant_id:
        stmt = stmt.where(JoinCode.tenant_id == UUID(str(tenant_id)))
    else:
        stmt = stmt.where(JoinCode.tenant_id.is_(None), JoinCode.doctor_user_id == UUID(str(user["user_id"])))
    if status:
        stmt = stmt.where(VisitRequest.status == status)
    result = []
    for row, account, registration, code in db.execute(stmt.order_by(VisitRequest.created_at, VisitRequest.uuid)):
        owners.authorize_registration(code, user)
        animal = db.get(OwnerAnimal, row.owner_animal_uuid) if row.owner_animal_uuid else db.get(Patient, row.patient_uuid)
        item = read(db, row).model_dump()
        item.update(registration_uuid=registration.uuid, registration_status=registration.status,
                    owner_name=account.name, animal_name=animal.name if animal else "Животное удалено",
                    can_write=not code.tenant_id or (user.get("organization") or {}).get("org_role") in {"owner", "admin", "member"})
        result.append(item)
    return result

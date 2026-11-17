from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from vetdietderm_api.appointments.models import Appointment
from vetdietderm_api.appointments.schemas import format_amount_rub
from vetdietderm_api.attachments.models import Attachment
from vetdietderm_api.attachments.schemas import OwnerFileRead
from vetdietderm_api.chat.repository import owner_target
from vetdietderm_api.encounters.schemas import EncounterStatus
from vetdietderm_api.owners import repository as owners
from vetdietderm_api.owners.models import JoinCode, OwnerAccount, OwnerAnimal, OwnerRegistration
from vetdietderm_api.patients.models import Patient
from vetdietderm_api.visits.models import VisitRequest, VisitRequestFile
from vetdietderm_api.visits.schemas import VisitFileRead, VisitRead


def read(db: Session, row: VisitRequest):
    result = VisitRead.model_validate(row)
    result.files = [VisitFileRead.model_validate(file) for file in db.scalars(select(VisitRequestFile).where(
        VisitRequestFile.request_uuid == row.uuid).order_by(VisitRequestFile.created_at, VisitRequestFile.uuid))]
    appointment = db.get(Appointment, row.appointment_uuid) if row.appointment_uuid else None
    if appointment and appointment.patient_uuid == row.patient_uuid:
        result.amount_rub = format_amount_rub(appointment.amount_rub)
        result.paid = bool(appointment.paid)
    if appointment and appointment.patient_uuid == row.patient_uuid and appointment.encounter:
        encounter = appointment.encounter
        if encounter.patient_uuid == row.patient_uuid:
            result.encounter_status = EncounterStatus(encounter.status)
            # Never infer visit ownership from dates or from the patient's gallery.
            result.result_files = [OwnerFileRead.model_validate(file) for file in db.scalars(
                select(Attachment).where(
                    Attachment.patient_uuid == row.patient_uuid,
                    Attachment.encounter_uuid == encounter.uuid,
                    Attachment.owner_visible.is_(True),
                    Attachment.uploaded_by_owner.is_(False),
                ).order_by(Attachment.created_at, Attachment.uuid))]
    return result


def direct_charge(appointment: Appointment, owner_animal_uuid: UUID | None) -> VisitRead:
    encounter = appointment.encounter
    linked = encounter is not None and encounter.patient_uuid == appointment.patient_uuid
    return VisitRead(
        uuid=appointment.uuid,
        owner_animal_uuid=owner_animal_uuid,
        patient_uuid=appointment.patient_uuid,
        visit_type=None,
        reason=None,
        proposed_starts_at=appointment.starts_at,
        confirmed_starts_at=appointment.starts_at,
        duration_min=appointment.duration_min,
        status=appointment.status,
        rejection_reason=None,
        answers=[],
        files=[],
        encounter_status=EncounterStatus(encounter.status) if linked else None,
        result_files=[],
        amount_rub=format_amount_rub(appointment.amount_rub),
        paid=bool(appointment.paid),
        read_only=True,
        created_at=appointment.created_at,
    )


def owner_list(db: Session, owner: OwnerAccount, animal_id: UUID):
    animal, patient, _ = owner_target(db, owner, animal_id)
    targets = [VisitRequest.owner_animal_uuid == animal] if animal else [VisitRequest.patient_uuid == patient]
    if patient:
        targets.append(VisitRequest.owner_animal_uuid.in_(select(OwnerAnimal.uuid).where(OwnerAnimal.patient_uuid == patient)))
    rows = db.scalars(select(VisitRequest).where(VisitRequest.owner_account_uuid == owner.uuid,
        or_(*targets)).order_by(VisitRequest.created_at.desc(), VisitRequest.uuid.desc()))
    items = [read(db, row) for row in rows]
    if patient is None:
        return items
    registration = owners.registration_for_owner(db, owner)
    owner_animal_uuid = db.scalar(select(OwnerAnimal.uuid).where(
        OwnerAnimal.patient_uuid == patient, OwnerAnimal.registration_uuid == registration.uuid))
    linked = select(VisitRequest.appointment_uuid).where(VisitRequest.appointment_uuid.is_not(None))
    charged = db.scalars(select(Appointment).where(
        Appointment.patient_uuid == patient,
        Appointment.amount_rub.is_not(None),
        Appointment.uuid.not_in(linked),
    ).options(joinedload(Appointment.encounter)).order_by(Appointment.created_at.desc(), Appointment.uuid.desc()))
    items.extend(direct_charge(row, owner_animal_uuid) for row in charged.unique())
    return items


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


def staff_list(db, user, tenant_id, status):
    if not tenant_id:
        raise HTTPException(403, "Клиника недоступна")
    stmt = select(VisitRequest, OwnerAccount, OwnerRegistration, JoinCode).join(
        OwnerAccount, VisitRequest.owner_account_uuid == OwnerAccount.uuid).join(
        OwnerRegistration, OwnerRegistration.owner_account_uuid == OwnerAccount.uuid).join(
        JoinCode, OwnerAccount.join_code_uuid == JoinCode.uuid).where(
        JoinCode.tenant_id == UUID(str(tenant_id)))
    if status:
        stmt = stmt.where(VisitRequest.status == status)
    result = []
    editors = {"owner", "admin", "member"}
    for row, account, registration, code in db.execute(stmt.order_by(VisitRequest.created_at, VisitRequest.uuid)):
        owners.authorize_registration(code, user)
        animal = db.get(OwnerAnimal, row.owner_animal_uuid) if row.owner_animal_uuid else db.get(Patient, row.patient_uuid)
        item = read(db, row).model_dump()
        item.update(registration_uuid=registration.uuid, registration_status=registration.status,
                    owner_name=account.name, animal_name=animal.name if animal else "Животное удалено",
                    can_write=(user.get("organization") or {}).get("org_role") in editors)
        result.append(item)
    return result



def get_visit_file(db: Session, request_uuid: UUID, file_uuid: UUID) -> VisitRequestFile:
    file = db.scalar(select(VisitRequestFile).where(
        VisitRequestFile.uuid == file_uuid, VisitRequestFile.request_uuid == request_uuid,
    ))
    if file is None:
        raise HTTPException(404, "Файл не найден")
    return file


def lock_appointment(db: Session, appointment_uuid: UUID | None) -> Appointment | None:
    return db.scalar(select(Appointment).where(Appointment.uuid == appointment_uuid).with_for_update())

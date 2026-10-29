from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from vetdietderm_api.appointments.models import Appointment, utc_now
from vetdietderm_api.appointments.schemas import AppointmentUpdate, AppointmentWrite
from vetdietderm_api.encounters.repository import get_encounter
from vetdietderm_api.patients.models import Patient
from vetdietderm_api.patients.repository import get_patient
from vetdietderm_api.questionnaires.schemas import VisitType as BookableVisitType
from vetdietderm_api.visits.models import VisitRequest


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _appointment_stmt():
    return select(Appointment).options(joinedload(Appointment.patient).joinedload(Patient.client))


def list_appointments(
    session: Session,
    patient_uuid: UUID | None,
    starts_from: datetime | None,
    starts_to: datetime | None,
) -> list[Appointment]:
    stmt = _appointment_stmt()
    if patient_uuid is not None:
        get_patient(session, patient_uuid)
        stmt = stmt.where(Appointment.patient_uuid == patient_uuid)
    if starts_from is not None:
        stmt = stmt.where(Appointment.starts_at >= starts_from)
    if starts_to is not None:
        stmt = stmt.where(Appointment.starts_at <= starts_to)
    ordering = (
        Appointment.starts_at.desc()
        if starts_from is None and starts_to is None
        else Appointment.starts_at.asc()
    )
    stmt = stmt.order_by(ordering, Appointment.uuid).limit(200)
    return list(session.scalars(stmt).unique().all())


def get_appointment(session: Session, appointment_uuid: UUID) -> Appointment:
    appointment = (
        session.scalars(_appointment_stmt().where(Appointment.uuid == appointment_uuid)).unique().one_or_none()
    )
    if appointment is None:
        raise _not_found("Запись не найдена")
    return appointment


def _validate_encounter(session: Session, patient_uuid: UUID, encounter_uuid: UUID | None) -> None:
    if encounter_uuid is None:
        return
    encounter = get_encounter(session, encounter_uuid)
    if encounter.patient_uuid != patient_uuid:
        raise _bad_request("Приём принадлежит другому пациенту")


def create_appointment(session: Session, data: AppointmentWrite) -> Appointment:
    patient = get_patient(session, data.patient_uuid)
    _validate_encounter(session, patient.uuid, data.encounter_uuid)
    appointment = Appointment(**data.model_dump())
    session.add(appointment)
    session.commit()
    return get_appointment(session, appointment.uuid)


def update_appointment(session: Session, appointment_uuid: UUID, data: AppointmentUpdate) -> Appointment:
    # Same lock order as owner cancellation: request, then appointment. The
    # statement only runs after verifying the appointment in the current workspace.
    appointment = get_appointment(session, appointment_uuid)
    linked = session.scalar(select(VisitRequest).where(VisitRequest.appointment_uuid == appointment_uuid).with_for_update())
    session.scalar(select(Appointment).where(Appointment.uuid == appointment_uuid).with_for_update()
                   .execution_options(populate_existing=True))
    payload = data.model_dump(exclude_unset=True)
    for field in ("patient_uuid", "starts_at", "duration_min", "visit_type", "status"):
        if field in payload and payload[field] is None:
            raise HTTPException(422, "Обязательное поле не может быть пустым")
    if linked and payload.get("patient_uuid", appointment.patient_uuid) != appointment.patient_uuid:
        raise HTTPException(422, "Нельзя сменить пациента в записи владельца")
    if "visit_type" in payload and payload["visit_type"] not in set(BookableVisitType) and payload["visit_type"] != appointment.visit_type:
        raise HTTPException(422, "Выберите один из четырёх типов визита")
    if "patient_uuid" in payload:
        get_patient(session, payload["patient_uuid"])
    patient_uuid = payload.get("patient_uuid", appointment.patient_uuid)
    if "patient_uuid" in payload or "encounter_uuid" in payload:
        _validate_encounter(session, patient_uuid, payload.get("encounter_uuid", appointment.encounter_uuid))
    if "visit_type" in payload and payload["visit_type"] is not None:
        payload["visit_type"] = payload["visit_type"].value
    if "status" in payload and payload["status"] is not None:
        payload["status"] = payload["status"].value
    for key, value in payload.items():
        setattr(appointment, key, value)
    appointment.updated_at = utc_now()
    if linked:
        linked.confirmed_starts_at = appointment.starts_at
        linked.duration_min = appointment.duration_min
        linked.status = appointment.status
        linked.updated_at = utc_now()
    session.commit()
    return get_appointment(session, appointment.uuid)


def delete_appointment(session: Session, appointment_uuid: UUID) -> None:
    appointment = get_appointment(session, appointment_uuid)
    linked = session.scalar(select(VisitRequest).where(VisitRequest.appointment_uuid == appointment_uuid).with_for_update())
    if linked:
        linked.status, linked.appointment_uuid, linked.updated_at = "cancelled", None, utc_now()
        session.flush()
    session.delete(appointment)
    session.commit()

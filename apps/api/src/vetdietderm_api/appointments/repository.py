from datetime import datetime
from decimal import Decimal
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
    return select(Appointment).options(joinedload(Appointment.patient).joinedload(Patient.client), joinedload(Appointment.encounter), joinedload(Appointment.visit_request))


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


def _positive_amount(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    exponent = value.as_tuple().exponent
    if not value.is_finite() or not isinstance(exponent, int) or exponent < -2 or value <= 0:
        raise HTTPException(422, "Сумма должна быть больше нуля")
    if value > Decimal("9999999999.99"):
        raise HTTPException(422, "Сумма не должна превышать 9999999999.99 руб.")
    return value.quantize(Decimal("0.01"))


def _same_money(left: Decimal | None, right: Decimal | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return left.quantize(Decimal("0.01")) == right.quantize(Decimal("0.01"))


def apply_charge(current: Appointment | None, payload: dict) -> None:
    if "amount_rub" in payload:
        payload["amount_rub"] = _positive_amount(payload["amount_rub"])
    current_amount = None if current is None else current.amount_rub
    current_paid = False if current is None else bool(current.paid)
    if "paid" in payload and payload["paid"] is None:
        del payload["paid"]
    if payload.get("paid") is False and current_paid:
        raise HTTPException(422, "Оплату нельзя отменить")
    if current_paid and "amount_rub" in payload and not _same_money(payload["amount_rub"], current_amount):
        raise HTTPException(422, "Оплаченная сумма не изменяется")
    status_value = payload.get("status", current.status if current is not None else "scheduled")
    status_value = status_value.value if hasattr(status_value, "value") else status_value
    next_paid = payload["paid"] if "paid" in payload else current_paid
    next_amount = payload["amount_rub"] if "amount_rub" in payload else current_amount
    if next_paid and next_amount is None:
        raise HTTPException(422, "Сумма должна быть больше нуля")
    if status_value != "completed":
        introducing = "amount_rub" in payload and payload["amount_rub"] is not None
        same_paid_amount = current_paid and _same_money(payload.get("amount_rub"), current_amount)
        if introducing and not same_paid_amount:
            raise HTTPException(422, "Сумму указывают после проведения визита")
        if not current_paid and not next_paid:
            payload["amount_rub"] = None
            payload["paid"] = False


def create_appointment(session: Session, data: AppointmentWrite) -> Appointment:
    patient = get_patient(session, data.patient_uuid)
    _validate_encounter(session, patient.uuid, data.encounter_uuid)
    payload = data.model_dump()
    apply_charge(None, payload)
    appointment = Appointment(**payload)
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
    apply_charge(appointment, payload)
    if appointment.encounter_uuid is None and payload.get("encounter_uuid") is not None and linked:
        encounter = get_encounter(session, payload["encounter_uuid"])
        if not (encounter.chief_complaint or "").strip() and (linked.reason or "").strip():
            encounter.chief_complaint = linked.reason
            encounter.updated_at = utc_now()
    for key, value in payload.items():
        setattr(appointment, key, value)
    appointment.updated_at = utc_now()
    if linked:
        linked.confirmed_starts_at = appointment.starts_at
        linked.duration_min = appointment.duration_min
        linked.status = appointment.status
        # Bookable type follows the calendar booking. Answers stay the submitted snapshot.
        if "visit_type" in payload and appointment.visit_type in set(BookableVisitType):
            linked.visit_type = appointment.visit_type
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

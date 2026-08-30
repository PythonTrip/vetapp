from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from vetdietderm_api.patients.models import Client, Patient, utc_now
from vetdietderm_api.patients.schemas import ClientCreate, ClientUpdate, PatientCreate, PatientUpdate

LIST_CAP = 50


def _ilike_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def get_client(session: Session, client_uuid: UUID) -> Client:
    client = session.get(Client, client_uuid)
    if client is None:
        raise _not_found("Клиент не найден")
    return client


def search_clients(session: Session, query: str) -> list[Client]:
    stmt = select(Client)
    needle = query.strip()
    if needle:
        pattern = _ilike_pattern(needle)
        stmt = stmt.where(
            or_(
                Client.name.ilike(pattern, escape="\\"),
                Client.email.ilike(pattern, escape="\\"),
                Client.phone.ilike(pattern, escape="\\"),
            )
        )
    stmt = stmt.order_by(Client.updated_at.desc()).limit(LIST_CAP)
    return list(session.scalars(stmt).all())


def create_client(session: Session, data: ClientCreate) -> Client:
    client = Client(**data.model_dump())
    session.add(client)
    session.commit()
    session.refresh(client)
    return client


def update_client(session: Session, client_uuid: UUID, data: ClientUpdate) -> Client:
    client = get_client(session, client_uuid)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(client, key, value)
    client.updated_at = utc_now()
    session.commit()
    session.refresh(client)
    return client


def _patient_stmt():
    return select(Patient).options(joinedload(Patient.client))


def get_patient(session: Session, patient_uuid: UUID) -> Patient:
    patient = session.scalars(_patient_stmt().where(Patient.uuid == patient_uuid)).unique().one_or_none()
    if patient is None:
        raise _not_found("Пациент не найден")
    return patient


def search_patients(session: Session, query: str) -> list[Patient]:
    stmt = _patient_stmt().join(Patient.client)
    needle = query.strip()
    if needle:
        pattern = _ilike_pattern(needle)
        stmt = stmt.where(
            or_(
                Patient.name.ilike(pattern, escape="\\"),
                Client.name.ilike(pattern, escape="\\"),
            )
        )
    stmt = stmt.order_by(Patient.updated_at.desc()).limit(LIST_CAP)
    return list(session.scalars(stmt).unique().all())


def create_patient(session: Session, data: PatientCreate) -> Patient:
    client = get_client(session, data.client_uuid)
    patient = Patient(**data.model_dump())
    patient.client = client
    session.add(patient)
    session.commit()
    return patient


def update_patient(session: Session, patient_uuid: UUID, data: PatientUpdate) -> Patient:
    patient = get_patient(session, patient_uuid)
    payload = data.model_dump(exclude_unset=True)
    if "client_uuid" in payload:
        patient.client = get_client(session, payload["client_uuid"])
    for key, value in payload.items():
        setattr(patient, key, value)
    patient.updated_at = utc_now()
    session.commit()
    return patient

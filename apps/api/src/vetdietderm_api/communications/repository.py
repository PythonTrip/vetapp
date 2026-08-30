from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.communications.models import Communication, utc_now
from vetdietderm_api.communications.schemas import CommunicationUpdate, CommunicationWrite
from vetdietderm_api.patients.repository import get_patient


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def list_communications(session: Session, patient_uuid: UUID) -> list[Communication]:
    get_patient(session, patient_uuid)
    stmt = (
        select(Communication)
        .where(Communication.patient_uuid == patient_uuid)
        .order_by(Communication.occurred_at.desc(), Communication.created_at.desc())
    )
    return list(session.scalars(stmt).all())


def get_communication(session: Session, communication_uuid: UUID) -> Communication:
    row = session.get(Communication, communication_uuid)
    if row is None:
        raise _not_found("Запись журнала не найдена")
    return row


def create_communication(
    session: Session,
    patient_uuid: UUID,
    data: CommunicationWrite,
) -> Communication:
    patient = get_patient(session, patient_uuid)
    payload = data.model_dump()
    occurred_at = payload.pop("occurred_at") or utc_now()
    row = Communication(
        patient_uuid=patient.uuid,
        client_uuid=patient.client_uuid,
        occurred_at=occurred_at,
        **payload,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def update_communication(
    session: Session,
    communication_uuid: UUID,
    data: CommunicationUpdate,
) -> Communication:
    row = get_communication(session, communication_uuid)
    payload = data.model_dump(exclude_unset=True)
    if "channel" in payload and payload["channel"] is not None:
        payload["channel"] = payload["channel"].value
    if "direction" in payload and payload["direction"] is not None:
        payload["direction"] = payload["direction"].value
    for key, value in payload.items():
        setattr(row, key, value)
    row.updated_at = utc_now()
    session.commit()
    session.refresh(row)
    return row


def delete_communication(session: Session, communication_uuid: UUID) -> None:
    row = get_communication(session, communication_uuid)
    session.delete(row)
    session.commit()

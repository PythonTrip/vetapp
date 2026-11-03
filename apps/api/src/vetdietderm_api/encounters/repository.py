from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from vetdietderm_api.encounters.models import Encounter, utc_now
from vetdietderm_api.encounters.schemas import EncounterUpdate, EncounterWrite
from vetdietderm_api.patients.repository import get_patient


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def list_encounters(session: Session, patient_uuid: UUID) -> list[Encounter]:
    get_patient(session, patient_uuid)
    stmt = (
        select(Encounter)
        .where(Encounter.patient_uuid == patient_uuid)
        .order_by(Encounter.occurred_at.desc(), Encounter.created_at.desc())
    )
    return list(session.scalars(stmt).all())


def get_encounter(session: Session, encounter_uuid: UUID) -> Encounter:
    encounter = session.get(Encounter, encounter_uuid)
    if encounter is None:
        raise _not_found("Приём не найден")
    return encounter


def create_encounter(session: Session, patient_uuid: UUID, data: EncounterWrite) -> Encounter:
    get_patient(session, patient_uuid)
    payload = data.model_dump()
    occurred_at = payload.pop("occurred_at") or utc_now()
    anamnesis_data = payload.pop("anamnesis_data")
    prescriptions = payload.pop("prescriptions")
    encounter = Encounter(
        patient_uuid=patient_uuid,
        occurred_at=occurred_at,
        anamnesis_data=anamnesis_data,
        prescriptions=prescriptions,
        **payload,
    )
    session.add(encounter)
    session.commit()
    session.refresh(encounter)
    return encounter


def update_encounter(session: Session, encounter_uuid: UUID, data: EncounterUpdate) -> Encounter:
    encounter = get_encounter(session, encounter_uuid)
    payload = data.model_dump(exclude_unset=True)
    if "anamnesis_data" in payload and payload["anamnesis_data"] is not None:
        payload["anamnesis_data"] = payload["anamnesis_data"]
    if "prescriptions" in payload and payload["prescriptions"] is not None:
        payload["prescriptions"] = payload["prescriptions"]
    for key, value in payload.items():
        setattr(encounter, key, value)
    encounter.updated_at = utc_now()
    session.commit()
    session.refresh(encounter)
    return encounter


def delete_encounter(session: Session, encounter_uuid: UUID) -> None:
    encounter = get_encounter(session, encounter_uuid)
    session.delete(encounter)
    session.commit()

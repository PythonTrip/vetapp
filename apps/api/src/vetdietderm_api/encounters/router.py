from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.encounters import repository
from vetdietderm_api.encounters.schemas import EncounterRead, EncounterUpdate, EncounterWrite

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter()
patient_encounters = APIRouter(tags=["encounters"])
encounters = APIRouter(prefix="/encounters", tags=["encounters"])


@patient_encounters.get("/patients/{patient_id}/encounters", response_model=list[EncounterRead])
@logger.catch(reraise=True)
def list_patient_encounters(patient_id: UUID, session: SessionDep) -> list[EncounterRead]:
    return [EncounterRead.model_validate(row) for row in repository.list_encounters(session, patient_id)]


@patient_encounters.post(
    "/patients/{patient_id}/encounters",
    response_model=EncounterRead,
    status_code=201,
)
@logger.catch(reraise=True)
def create_patient_encounter(
    patient_id: UUID,
    payload: EncounterWrite,
    session: SessionDep,
) -> EncounterRead:
    return EncounterRead.model_validate(repository.create_encounter(session, patient_id, payload))


@encounters.get("/{encounter_id}", response_model=EncounterRead)
@logger.catch(reraise=True)
def read_encounter(encounter_id: UUID, session: SessionDep) -> EncounterRead:
    return EncounterRead.model_validate(repository.get_encounter(session, encounter_id))


@encounters.patch("/{encounter_id}", response_model=EncounterRead)
@logger.catch(reraise=True)
def patch_encounter(
    encounter_id: UUID,
    payload: EncounterUpdate,
    session: SessionDep,
) -> EncounterRead:
    return EncounterRead.model_validate(repository.update_encounter(session, encounter_id, payload))


@encounters.delete("/{encounter_id}", status_code=204)
@logger.catch(reraise=True)
def remove_encounter(encounter_id: UUID, session: SessionDep) -> Response:
    repository.delete_encounter(session, encounter_id)
    return Response(status_code=204)


router.include_router(patient_encounters)
router.include_router(encounters)

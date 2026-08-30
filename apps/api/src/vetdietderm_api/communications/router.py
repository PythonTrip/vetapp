from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.communications import repository
from vetdietderm_api.communications.schemas import (
    CommunicationRead,
    CommunicationUpdate,
    CommunicationWrite,
)
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter()
patient_comms = APIRouter(tags=["communications"])
comms = APIRouter(prefix="/communications", tags=["communications"])


@patient_comms.get(
    "/patients/{patient_id}/communications",
    response_model=list[CommunicationRead],
)
@logger.catch(reraise=True)
def list_patient_communications(patient_id: UUID, session: SessionDep) -> list[CommunicationRead]:
    return [
        CommunicationRead.model_validate(row) for row in repository.list_communications(session, patient_id)
    ]


@patient_comms.post(
    "/patients/{patient_id}/communications",
    response_model=CommunicationRead,
    status_code=201,
)
@logger.catch(reraise=True)
def create_patient_communication(
    patient_id: UUID,
    payload: CommunicationWrite,
    session: SessionDep,
) -> CommunicationRead:
    return CommunicationRead.model_validate(
        repository.create_communication(session, patient_id, payload)
    )


@comms.patch("/{communication_id}", response_model=CommunicationRead)
@logger.catch(reraise=True)
def patch_communication(
    communication_id: UUID,
    payload: CommunicationUpdate,
    session: SessionDep,
) -> CommunicationRead:
    return CommunicationRead.model_validate(
        repository.update_communication(session, communication_id, payload)
    )


@comms.delete("/{communication_id}", status_code=204)
@logger.catch(reraise=True)
def remove_communication(communication_id: UUID, session: SessionDep) -> Response:
    repository.delete_communication(session, communication_id)
    return Response(status_code=204)


router.include_router(patient_comms)
router.include_router(comms)

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.appointments import repository
from vetdietderm_api.appointments.schemas import AppointmentRead, AppointmentUpdate, AppointmentWrite
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[AppointmentRead])
@logger.catch(reraise=True)
def list_appointments(
    session: SessionDep,
    patient_id: Annotated[UUID | None, Query(alias="patientId")] = None,
    starts_from: Annotated[datetime | None, Query(alias="from")] = None,
    starts_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> list[AppointmentRead]:
    return [
        AppointmentRead.model_validate(row)
        for row in repository.list_appointments(session, patient_id, starts_from, starts_to)
    ]


@router.post("", response_model=AppointmentRead, status_code=201)
@logger.catch(reraise=True)
def create_appointment(payload: AppointmentWrite, session: SessionDep) -> AppointmentRead:
    return AppointmentRead.model_validate(repository.create_appointment(session, payload))


@router.get("/{appointment_id}", response_model=AppointmentRead)
@logger.catch(reraise=True)
def read_appointment(appointment_id: UUID, session: SessionDep) -> AppointmentRead:
    return AppointmentRead.model_validate(repository.get_appointment(session, appointment_id))


@router.patch("/{appointment_id}", response_model=AppointmentRead)
@logger.catch(reraise=True)
def patch_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdate,
    session: SessionDep,
) -> AppointmentRead:
    return AppointmentRead.model_validate(repository.update_appointment(session, appointment_id, payload))


@router.delete("/{appointment_id}", status_code=204)
@logger.catch(reraise=True)
def remove_appointment(appointment_id: UUID, session: SessionDep) -> Response:
    repository.delete_appointment(session, appointment_id)
    return Response(status_code=204)

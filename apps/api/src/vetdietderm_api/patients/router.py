from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.patients import repository
from vetdietderm_api.patients.schemas import (
    ClientCreate,
    ClientRead,
    ClientUpdate,
    PatientCreate,
    PatientRead,
    PatientUpdate,
)

SessionDep = Annotated[Session, Depends(get_session)]

clients_router = APIRouter(tags=["clients"])
patients_router = APIRouter(tags=["patients"])


@clients_router.get("/clients", response_model=list[ClientRead])
@logger.catch(reraise=True)
def list_clients(session: SessionDep, q: Annotated[str, Query()] = "") -> list[ClientRead]:
    return [ClientRead.model_validate(row) for row in repository.search_clients(session, q)]


@clients_router.post("/clients", response_model=ClientRead, status_code=201)
@logger.catch(reraise=True)
def create_client(payload: ClientCreate, session: SessionDep) -> ClientRead:
    return ClientRead.model_validate(repository.create_client(session, payload))


@clients_router.get("/clients/{client_id}", response_model=ClientRead)
@logger.catch(reraise=True)
def read_client(client_id: UUID, session: SessionDep) -> ClientRead:
    return ClientRead.model_validate(repository.get_client(session, client_id))


@clients_router.patch("/clients/{client_id}", response_model=ClientRead)
@logger.catch(reraise=True)
def patch_client(client_id: UUID, payload: ClientUpdate, session: SessionDep) -> ClientRead:
    return ClientRead.model_validate(repository.update_client(session, client_id, payload))


@patients_router.get("/patients", response_model=list[PatientRead])
@logger.catch(reraise=True)
def list_patients(session: SessionDep, q: Annotated[str, Query()] = "") -> list[PatientRead]:
    return [PatientRead.model_validate(row) for row in repository.search_patients(session, q)]


@patients_router.post("/patients", response_model=PatientRead, status_code=201)
@logger.catch(reraise=True)
def create_patient(payload: PatientCreate, session: SessionDep) -> PatientRead:
    return PatientRead.model_validate(repository.create_patient(session, payload))


@patients_router.get("/patients/{patient_id}", response_model=PatientRead)
@logger.catch(reraise=True)
def read_patient(patient_id: UUID, session: SessionDep) -> PatientRead:
    return PatientRead.model_validate(repository.get_patient(session, patient_id))


@patients_router.patch("/patients/{patient_id}", response_model=PatientRead)
@logger.catch(reraise=True)
def patch_patient(patient_id: UUID, payload: PatientUpdate, session: SessionDep) -> PatientRead:
    return PatientRead.model_validate(repository.update_patient(session, patient_id, payload))


router = APIRouter()
router.include_router(clients_router)
router.include_router(patients_router)

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.clinical_catalog import repository
from vetdietderm_api.clinical_catalog.schemas import (
    ClinicalCatalogItemRead,
    ClinicalCatalogItemUpdate,
    ClinicalCatalogItemWrite,
)
from vetdietderm_api.db import get_session

SessionDep = Annotated[Session, Depends(get_session)]
router = APIRouter(prefix="/clinical-catalog", tags=["clinical-catalog"])


@router.get("", response_model=list[ClinicalCatalogItemRead])
@logger.catch(reraise=True)
def list_clinical_catalog(
    session: SessionDep,
    doctor_name: Annotated[str | None, Query(alias="doctorName")] = None,
) -> list[ClinicalCatalogItemRead]:
    return [ClinicalCatalogItemRead.model_validate(row) for row in repository.list_items(session, doctor_name)]


@router.post("", response_model=ClinicalCatalogItemRead, status_code=201)
@logger.catch(reraise=True)
def create_clinical_catalog_item(
    payload: ClinicalCatalogItemWrite,
    session: SessionDep,
) -> ClinicalCatalogItemRead:
    return ClinicalCatalogItemRead.model_validate(repository.create_item(session, payload))


@router.patch("/{item_id}", response_model=ClinicalCatalogItemRead)
@logger.catch(reraise=True)
def patch_clinical_catalog_item(
    item_id: UUID,
    payload: ClinicalCatalogItemUpdate,
    session: SessionDep,
) -> ClinicalCatalogItemRead:
    return ClinicalCatalogItemRead.model_validate(repository.update_item(session, item_id, payload))


@router.delete("/{item_id}", status_code=204)
@logger.catch(reraise=True)
def remove_clinical_catalog_item(item_id: UUID, session: SessionDep) -> Response:
    repository.delete_item(session, item_id)
    return Response(status_code=204)

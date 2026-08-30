from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from loguru import logger
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session
from vetdietderm_api.encounter_templates import repository
from vetdietderm_api.encounter_templates.schemas import (
    EncounterTemplateRead,
    EncounterTemplateUpdate,
    EncounterTemplateWrite,
)

SessionDep = Annotated[Session, Depends(get_session)]
router = APIRouter(prefix="/encounter-templates", tags=["encounter-templates"])


@router.get("", response_model=list[EncounterTemplateRead])
@logger.catch(reraise=True)
def list_encounter_templates(
    session: SessionDep,
    doctor_name: Annotated[str | None, Query(alias="doctorName")] = None,
) -> list[EncounterTemplateRead]:
    return [EncounterTemplateRead.model_validate(row) for row in repository.list_templates(session, doctor_name)]


@router.post("", response_model=EncounterTemplateRead, status_code=201)
@logger.catch(reraise=True)
def create_encounter_template(
    payload: EncounterTemplateWrite,
    session: SessionDep,
) -> EncounterTemplateRead:
    return EncounterTemplateRead.model_validate(repository.create_template(session, payload))


@router.patch("/{template_id}", response_model=EncounterTemplateRead)
@logger.catch(reraise=True)
def patch_encounter_template(
    template_id: UUID,
    payload: EncounterTemplateUpdate,
    session: SessionDep,
) -> EncounterTemplateRead:
    return EncounterTemplateRead.model_validate(repository.update_template(session, template_id, payload))


@router.delete("/{template_id}", status_code=204)
@logger.catch(reraise=True)
def remove_encounter_template(template_id: UUID, session: SessionDep) -> Response:
    repository.delete_template(session, template_id)
    return Response(status_code=204)

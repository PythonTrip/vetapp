from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from vetdietderm_api.auth import authenticated_call, require_clinical_access
from vetdietderm_api.db import get_session
from vetdietderm_api.questionnaires import repository
from vetdietderm_api.questionnaires.schemas import QuestionnaireRead, QuestionnaireWrite, VisitType

router = APIRouter(prefix="/visit-questionnaires", tags=["visit-questionnaires"],
                   dependencies=[Depends(require_clinical_access)])
SessionDep = Annotated[Session, Depends(get_session)]


def organization_members(request: Request) -> list[dict]:
    payload = authenticated_call(request, "GET", f"/organizations/{request.state.tenant_id}/members")
    members = payload.get("members") if isinstance(payload, dict) else payload
    if not isinstance(members, list):
        raise HTTPException(502, "Не удалось получить состав клиники")
    return members


@router.get("", response_model=list[QuestionnaireRead])
def list_questionnaires(request: Request, response: Response, session: SessionDep):
    response.headers["Cache-Control"] = "no-store"
    clinic_id = UUID(str(request.state.tenant_id))
    members = organization_members(request) if repository.missing_clinic_types(session, clinic_id) else None
    return repository.list_questionnaires(
        session, clinic_id, UUID(request.state.user["user_id"]), members)


@router.put("/{visit_type}", response_model=QuestionnaireRead)
def replace_questionnaire(visit_type: VisitType, payload: QuestionnaireWrite,
                          request: Request, response: Response, session: SessionDep):
    response.headers["Cache-Control"] = "no-store"
    org = request.state.user.get("organization") or {}
    if org.get("org_role") not in {"owner", "admin"}:
        raise HTTPException(403, "Анкету клиники изменяют владелец и администратор")
    return repository.replace_questionnaire(
        session, UUID(str(request.state.tenant_id)), UUID(request.state.user["user_id"]), visit_type, payload)

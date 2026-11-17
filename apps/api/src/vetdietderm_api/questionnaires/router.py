from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from vetdietderm_api.auth import require_clinical_access
from vetdietderm_api.db import get_session
from vetdietderm_api.questionnaires import service
from vetdietderm_api.questionnaires.schemas import QuestionnaireRead, QuestionnaireWrite, VisitType

router = APIRouter(prefix="/visit-questionnaires", tags=["visit-questionnaires"],
                   dependencies=[Depends(require_clinical_access)])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[QuestionnaireRead])
def list_questionnaires(request: Request, response: Response, session: SessionDep):
    response.headers["Cache-Control"] = "no-store"
    return service.list_questionnaires(session, request)


@router.put("/{visit_type}", response_model=QuestionnaireRead)
def replace_questionnaire(visit_type: VisitType, payload: QuestionnaireWrite,
                          request: Request, response: Response, session: SessionDep):
    response.headers["Cache-Control"] = "no-store"
    org = request.state.user.get("organization") or {}
    if org.get("org_role") not in {"owner", "admin"}:
        raise HTTPException(403, "Анкету клиники изменяют владелец и администратор")
    return service.replace_questionnaire(
        session, UUID(str(request.state.tenant_id)), UUID(request.state.user["user_id"]), visit_type, payload)

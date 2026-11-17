"""Coordinate questionnaire publication with the staff roster and stored questions."""

from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from vetdietderm_api.auth import clinic_members, organization_members, staff_access_tokens
from vetdietderm_api.clock import utc_now
from vetdietderm_api.questionnaires import repository
from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire
from vetdietderm_api.questionnaires.schemas import QuestionnaireRead, QuestionnaireWrite, VisitType


def published_clinic_questionnaire(
    session: Session,
    clinic_id: UUID,
    user_id: UUID | None = None,
    members: list[dict] | None = None,
) -> VisitQuestionnaire:
    """Select the primary or newest publication and seed only an empty clinic."""
    repository.lock_publication(session, clinic_id)
    row = repository.lock_preferred_questionnaire(session, clinic_id)
    if row is not None:
        return row
    if repository.has_legacy_questionnaire(session):
        if members is None:
            tokens = staff_access_tokens(session)
            session.rollback()
            members = clinic_members(clinic_id, tokens)
            repository.lock_publication(session, clinic_id)
        repository.freeze_clinic_questionnaires(session, clinic_id, members)
        row = repository.lock_preferred_questionnaire(session, clinic_id)
        if row is not None:
            return row
    if user_id is None:
        user_id = repository.clinic_doctor_id(session, clinic_id)
    if user_id is None:
        raise HTTPException(503, repository.PUBLICATION_RETRY)
    return repository.ensure_clinic_slot(session, clinic_id, user_id, VisitType.primary)


def published_questions(session: Session, clinic_id: UUID | None) -> list[VisitQuestion]:
    if clinic_id is None:
        return []
    return repository.question_rows(session, published_clinic_questionnaire(session, clinic_id))


def list_questionnaires(session: Session, request: Request) -> list[QuestionnaireRead]:
    clinic_id = UUID(str(request.state.tenant_id))
    members = organization_members(request) if repository.missing_clinic_questionnaire(session, clinic_id) else None
    row = published_clinic_questionnaire(session, clinic_id, UUID(request.state.user["user_id"]), members)
    result = [repository.read_slot(session, row)]
    session.commit()
    return result


def replace_questionnaire(
    session: Session,
    clinic_id: UUID,
    user_id: UUID,
    visit_type: VisitType,
    payload: QuestionnaireWrite,
) -> QuestionnaireRead:
    repository.lock_publication(session, clinic_id)
    if visit_type != VisitType.primary and repository.missing_clinic_questionnaire(session, clinic_id):
        raise HTTPException(404, "Анкета не найдена")
    row = published_clinic_questionnaire(session, clinic_id, user_id)
    if row.visit_type != visit_type:
        raise HTTPException(404, "Анкета не найдена")
    repository.replace_questions(session, row, payload.questions)
    row.tenant_id = clinic_id
    row.updated_at = utc_now()
    session.flush()
    result = repository.read_slot(session, row)
    session.commit()
    return result

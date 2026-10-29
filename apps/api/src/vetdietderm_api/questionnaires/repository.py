from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from vetdietderm_api.ids import uuid6
from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire, utc_now
from vetdietderm_api.questionnaires.schemas import (
    QuestionRead, QuestionnaireRead, QuestionnaireWrite, VisitType,
)


def ensure_slot(session: Session, doctor_id: UUID, visit_type: VisitType) -> VisitQuestionnaire:
    # Upsert and row lock serialize concurrent first saves and replacements.
    session.execute(insert(VisitQuestionnaire).values(
        uuid=uuid6(), doctor_user_id=doctor_id, visit_type=visit_type,
        created_at=utc_now(), updated_at=utc_now(),
    ).on_conflict_do_nothing(index_elements=["doctor_user_id", "visit_type"]))
    return session.scalars(select(VisitQuestionnaire).where(
        VisitQuestionnaire.doctor_user_id == doctor_id,
        VisitQuestionnaire.visit_type == visit_type,
    ).with_for_update()).one()


def read_slot(session: Session, row: VisitQuestionnaire) -> QuestionnaireRead:
    questions = session.scalars(select(VisitQuestion).where(
        VisitQuestion.questionnaire_uuid == row.uuid,
    ).order_by(VisitQuestion.position)).all()
    return QuestionnaireRead(uuid=row.uuid, visit_type=row.visit_type, updated_at=row.updated_at,
                             questions=[QuestionRead.model_validate(q) for q in questions])


def list_questionnaires(session: Session, doctor_id: UUID) -> list[QuestionnaireRead]:
    rows = [ensure_slot(session, doctor_id, kind) for kind in VisitType]
    result = [read_slot(session, row) for row in rows]
    session.commit()
    return result


def replace_questionnaire(session: Session, doctor_id: UUID, visit_type: VisitType,
                          payload: QuestionnaireWrite) -> QuestionnaireRead:
    row = ensure_slot(session, doctor_id, visit_type)
    session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid == row.uuid))
    for position, question in enumerate(payload.questions):
        session.add(VisitQuestion(questionnaire_uuid=row.uuid, position=position,
                                  **question.model_dump(mode="json")))
    row.updated_at = utc_now()
    session.flush()
    result = read_slot(session, row)
    session.commit()
    return result

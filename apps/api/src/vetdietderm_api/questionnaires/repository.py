from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.ids import uuid6
from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire, utc_now
from vetdietderm_api.questionnaires.schemas import (
    QuestionRead, QuestionnaireRead, QuestionnaireWrite, VisitType,
)


def _insert(session: Session):
    return pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert


def _members(members: list[dict]) -> tuple[list[UUID], set[UUID]]:
    ids: list[UUID] = []
    owners: set[UUID] = set()
    for member in members:
        raw = member.get("user_id") if isinstance(member, dict) else None
        if not isinstance(raw, str):
            continue
        try:
            user_id = UUID(raw)
        except ValueError:
            continue
        ids.append(user_id)
        if member.get("org_role") == "owner":
            owners.add(user_id)
    return ids, owners


def missing_clinic_types(session: Session, clinic_id: UUID) -> bool:
    present = set(session.scalars(select(VisitQuestionnaire.visit_type).where(
        VisitQuestionnaire.tenant_id == clinic_id)))
    return any(kind.value not in present for kind in VisitType)


def clinic_slot(session: Session, clinic_id: UUID, visit_type: VisitType) -> VisitQuestionnaire | None:
    return session.scalar(select(VisitQuestionnaire).where(
        VisitQuestionnaire.tenant_id == clinic_id,
        VisitQuestionnaire.visit_type == visit_type,
    ).with_for_update())


def freeze_clinic_questionnaires(session: Session, clinic_id: UUID, members: list[dict]) -> None:
    """Keep one list per visit type: the organization owner's, otherwise the latest save."""
    member_ids, owner_ids = _members(members)
    if not member_ids:
        return
    for visit_type in VisitType:
        if clinic_slot(session, clinic_id, visit_type) is not None:
            continue
        # A list already published for another clinic is not a candidate for this freeze.
        candidates = list(session.scalars(select(VisitQuestionnaire).where(
            VisitQuestionnaire.visit_type == visit_type,
            VisitQuestionnaire.doctor_user_id.in_(member_ids),
            or_(VisitQuestionnaire.tenant_id.is_(None), VisitQuestionnaire.tenant_id == clinic_id),
        ).with_for_update()))
        if clinic_slot(session, clinic_id, visit_type) is not None or not candidates:
            continue
        owner_rows = [row for row in candidates if row.doctor_user_id in owner_ids]
        kept = max(owner_rows or candidates, key=lambda row: (row.updated_at, row.uuid))
        rejected_ids = [row.uuid for row in candidates if row.uuid != kept.uuid]
        if rejected_ids:
            session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid.in_(rejected_ids)))
            session.flush()
            for row in candidates:
                if row.uuid != kept.uuid:
                    session.delete(row)
            session.flush()
        kept.tenant_id = clinic_id
        session.flush()


def ensure_clinic_slot(session: Session, clinic_id: UUID, user_id: UUID, visit_type: VisitType) -> VisitQuestionnaire:
    row = clinic_slot(session, clinic_id, visit_type)
    if row is not None:
        return row
    owned = session.scalar(select(VisitQuestionnaire).where(
        VisitQuestionnaire.doctor_user_id == user_id,
        VisitQuestionnaire.visit_type == visit_type,
    ).with_for_update())
    if owned is not None:
        if owned.tenant_id is not None and owned.tenant_id != clinic_id:
            raise HTTPException(409, "Анкета этого типа уже опубликована в другой клинике")
        owned.tenant_id = clinic_id
        return owned
    now = utc_now()
    try:
        with session.begin_nested():
            session.execute(_insert(session)(VisitQuestionnaire).values(
                uuid=uuid6(), doctor_user_id=user_id, tenant_id=clinic_id, visit_type=visit_type,
                created_at=now, updated_at=now,
            ).on_conflict_do_nothing(index_elements=["doctor_user_id", "visit_type"]))
    except IntegrityError:
        pass
    row = clinic_slot(session, clinic_id, visit_type)
    if row is not None:
        return row
    owned = session.scalar(select(VisitQuestionnaire).where(
        VisitQuestionnaire.doctor_user_id == user_id,
        VisitQuestionnaire.visit_type == visit_type,
    ).with_for_update())
    if owned is not None and (owned.tenant_id is None or owned.tenant_id == clinic_id):
        owned.tenant_id = clinic_id
        return owned
    raise HTTPException(409, "Не удалось опубликовать анкету клиники")


def read_slot(session: Session, row: VisitQuestionnaire) -> QuestionnaireRead:
    questions = session.scalars(select(VisitQuestion).where(
        VisitQuestion.questionnaire_uuid == row.uuid,
    ).order_by(VisitQuestion.position)).all()
    return QuestionnaireRead(uuid=row.uuid, visit_type=row.visit_type, updated_at=row.updated_at,
                             questions=[QuestionRead.model_validate(q) for q in questions])


def list_questionnaires(session: Session, clinic_id: UUID, user_id: UUID,
                        members: list[dict] | None) -> list[QuestionnaireRead]:
    if members is not None:
        freeze_clinic_questionnaires(session, clinic_id, members)
    rows = [ensure_clinic_slot(session, clinic_id, user_id, kind) for kind in VisitType]
    result = [read_slot(session, row) for row in rows]
    session.commit()
    return result


def replace_questionnaire(session: Session, clinic_id: UUID, user_id: UUID, visit_type: VisitType,
                          payload: QuestionnaireWrite) -> QuestionnaireRead:
    row = ensure_clinic_slot(session, clinic_id, user_id, visit_type)
    if row.doctor_user_id != user_id:
        other = session.scalar(select(VisitQuestionnaire).where(
            VisitQuestionnaire.doctor_user_id == user_id,
            VisitQuestionnaire.visit_type == visit_type,
            VisitQuestionnaire.uuid != row.uuid,
        ).with_for_update())
        if other is not None:
            if other.tenant_id is not None and other.tenant_id != clinic_id:
                raise HTTPException(409, "Анкета этого типа уже опубликована в другой клинике")
            session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid == other.uuid))
            session.delete(other)
            session.flush()
        row.doctor_user_id = user_id
    session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid == row.uuid))
    for position, question in enumerate(payload.questions):
        session.add(VisitQuestion(questionnaire_uuid=row.uuid, position=position,
                                  **question.model_dump(mode="json")))
    row.tenant_id = clinic_id
    row.updated_at = utc_now()
    session.flush()
    result = read_slot(session, row)
    session.commit()
    return result

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from vetdietderm_api.ids import uuid6
from vetdietderm_api.questionnaires.models import VisitQuestion, VisitQuestionnaire, utc_now
from vetdietderm_api.questionnaires.schemas import (
    QuestionRead, QuestionnaireRead, QuestionWrite, VisitType,
)

PUBLICATION_RETRY = "Не удалось подтвердить публикацию анкеты клиники. Повторите запрос"
ADMINISTRATOR_ROLES = {"owner", "admin"}


def _insert(session: Session):
    return pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert


def _members(members: list[dict]) -> tuple[list[UUID], set[UUID]]:
    ids: list[UUID] = []
    administrators: set[UUID] = set()
    for member in members:
        raw = member.get("user_id") if isinstance(member, dict) else None
        if not isinstance(raw, str):
            continue
        try:
            user_id = UUID(raw)
        except ValueError:
            continue
        ids.append(user_id)
        if member.get("org_role") in ADMINISTRATOR_ROLES:
            administrators.add(user_id)
    return ids, administrators


def missing_clinic_questionnaire(session: Session, clinic_id: UUID) -> bool:
    return session.scalar(select(VisitQuestionnaire.uuid).where(
        VisitQuestionnaire.tenant_id == clinic_id).limit(1)) is None


def lock_publication(session: Session, clinic_id: UUID) -> None:
    # Same transaction lock for the owner migration and a staff replacement.
    if session.get_bind().dialect.name != "postgresql":
        return
    session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                    {"key": f"vetapp:questionnaires:{clinic_id}"})


def clinic_slot(session: Session, clinic_id: UUID, visit_type: VisitType) -> VisitQuestionnaire | None:
    return session.scalar(select(VisitQuestionnaire).where(
        VisitQuestionnaire.tenant_id == clinic_id,
        VisitQuestionnaire.visit_type == visit_type,
    ).with_for_update())


def question_rows(session: Session, row: VisitQuestionnaire) -> list[VisitQuestion]:
    return list(session.scalars(select(VisitQuestion).where(
        VisitQuestion.questionnaire_uuid == row.uuid,
    ).order_by(VisitQuestion.position)))


def freeze_clinic_questionnaires(session: Session, clinic_id: UUID, members: list[dict]) -> None:
    """Keep one list per visit type: an administrator's, otherwise the latest save.

    Administrators are the organization owner and admin roles. Among the preferred
    rows, and among the rest when no administrator published, the newer save wins
    and an equal timestamp keeps the greater questionnaire id. A list already
    published for another clinic is not a candidate. Empty membership is not an
    empty publication.
    """
    lock_publication(session, clinic_id)
    member_ids, administrator_ids = _members(members)
    if not member_ids:
        raise HTTPException(503, PUBLICATION_RETRY)
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
        preferred = [row for row in candidates if row.doctor_user_id in administrator_ids]
        kept = max(preferred or candidates, key=lambda row: (row.updated_at, row.uuid))
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
    lock_publication(session, clinic_id)
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
    questions = question_rows(session, row)
    return QuestionnaireRead(uuid=row.uuid, visit_type=row.visit_type, updated_at=row.updated_at,
                             questions=[QuestionRead.model_validate(q) for q in questions])


def lock_preferred_questionnaire(session: Session, clinic_id: UUID) -> VisitQuestionnaire | None:
    return session.scalar(
        select(VisitQuestionnaire)
        .where(VisitQuestionnaire.tenant_id == clinic_id)
        .order_by(
            (VisitQuestionnaire.visit_type == "primary").desc(),
            VisitQuestionnaire.updated_at.desc(),
            VisitQuestionnaire.uuid.desc(),
        )
        .limit(1)
        .with_for_update()
    )


def has_legacy_questionnaire(session: Session) -> bool:
    return session.scalar(select(VisitQuestionnaire.uuid).where(
        VisitQuestionnaire.tenant_id.is_(None),
    ).limit(1)) is not None


def clinic_doctor_id(session: Session, clinic_id: UUID) -> UUID | None:
    from vetdietderm_api.owners.models import ClinicLink, JoinCode

    user_id = session.scalar(select(JoinCode.doctor_user_id).join(
        ClinicLink, ClinicLink.code == JoinCode.code,
    ).where(ClinicLink.clinic_id == clinic_id))
    if user_id is None:
        user_id = session.scalar(select(JoinCode.doctor_user_id).where(JoinCode.tenant_id == clinic_id))
    return user_id


def replace_questions(session: Session, questionnaire: VisitQuestionnaire, questions: list[QuestionWrite]) -> None:
    session.execute(delete(VisitQuestion).where(VisitQuestion.questionnaire_uuid == questionnaire.uuid))
    for position, question in enumerate(questions):
        session.add(VisitQuestion(
            questionnaire_uuid=questionnaire.uuid, position=position, **question.model_dump(mode="json"),
        ))

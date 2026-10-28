from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class VisitQuestionnaire(Base):
    __tablename__ = "visit_questionnaires"
    __table_args__ = (UniqueConstraint("doctor_user_id", "visit_type"),)

    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    doctor_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    visit_type: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class VisitQuestion(Base):
    __tablename__ = "visit_questions"
    __table_args__ = (UniqueConstraint("questionnaire_uuid", "position"),)

    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    questionnaire_uuid: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("visit_questionnaires.uuid", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    options: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")

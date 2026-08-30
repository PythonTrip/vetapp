from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6
from vetdietderm_api.patients.models import Patient


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Encounter(Base):
    __tablename__ = "encounters"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    patient_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("patients.uuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    specialty: Mapped[str] = mapped_column(String(32), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    anamnesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    anamnesis_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    exam: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnoses: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    prescriptions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    vas_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    patient: Mapped[Patient] = relationship()

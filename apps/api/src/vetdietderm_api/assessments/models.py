from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6
from vetdietderm_api.patients.models import Patient


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DietPlan(Base):
    __tablename__ = "diet_plans"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    patient_uuid: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("patients.uuid", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ration_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    assessment_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    patient: Mapped[Patient | None] = relationship()

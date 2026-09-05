from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, Index, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ClinicalCatalogItem(Base):
    __tablename__ = "clinical_catalog_items"
    __table_args__ = (
        Index("ix_clinical_catalog_lookup", "kind", "scope", "specialty"),
        Index("ix_clinical_catalog_owner", "doctor_name"),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    specialty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    key: Mapped[str] = mapped_column(String(160), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    doctor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

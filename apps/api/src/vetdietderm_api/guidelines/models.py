"""Minimal persisted metadata for provider-backed nutrition standards.

Normative values and executable rules live exclusively in versioned provider
modules. Historical SQL runtime tables are archived by Alembic revision 0019;
their former ORM mappings remain in ``legacy_models`` for diagnostics only.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GuidelineStandard(Base):
    __tablename__ = "guideline_standards"

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class GuidelineEdition(Base):
    __tablename__ = "guideline_editions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'validated', 'published', 'retired')",
            name="ck_guideline_editions_status",
        ),
        UniqueConstraint(
            "standard_uuid",
            "code",
            "import_version",
            name="uq_guideline_editions_identity",
        ),
        Index(
            "uq_guideline_editions_one_published",
            "standard_uuid",
            unique=True,
            postgresql_where=text("status = 'published'"),
        ),
    )

    uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid6)
    standard_uuid: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("guideline_standards.uuid", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    import_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    source_checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    source_title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    publication_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    clinical_warning_ru: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

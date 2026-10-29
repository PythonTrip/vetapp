from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base
from vetdietderm_api.ids import uuid6
from vetdietderm_api.owners.models import utc_now


class VisitRequest(Base):
    __tablename__ = "visit_requests"

    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    owner_account_uuid: Mapped[UUID] = mapped_column(ForeignKey("owner_accounts.uuid"), index=True)
    owner_animal_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("owner_animals.uuid", ondelete="SET NULL"))
    patient_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("patients.uuid", ondelete="SET NULL"))
    appointment_uuid: Mapped[UUID | None] = mapped_column(ForeignKey("appointments.uuid", ondelete="SET NULL"), unique=True)
    visit_type: Mapped[str] = mapped_column(String(16))
    proposed_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confirmed_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_min: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="requested", server_default="requested", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500))
    answers: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class VisitRequestFile(Base):
    __tablename__ = "visit_request_files"

    uuid: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid6)
    request_uuid: Mapped[UUID] = mapped_column(ForeignKey("visit_requests.uuid", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    # A durable marker prevents re-copying files if their gallery row is deleted.
    gallery_copied: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

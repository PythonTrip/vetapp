"""Database state for staff browser sessions and clinic transfers."""

from uuid import UUID

from sqlalchemy import CheckConstraint, Float, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from vetdietderm_api.db import Base


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    access_token: Mapped[str] = mapped_column(Text)
    refresh_token: Mapped[str] = mapped_column(Text)
    access_expires: Mapped[float] = mapped_column(Float)
    expires: Mapped[float] = mapped_column(Float, index=True)


class ClinicInviteTransfer(Base):
    """Recovery evidence only; never persist invite secrets or session credentials."""
    __tablename__ = "clinic_invite_transfers"
    __table_args__ = (CheckConstraint(
        "phase IN ('accepting', 'accepted', 'closing', 'closed', 'done')",
        name="ck_clinic_invite_transfers_phase"),)
    user_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    invite_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[UUID] = mapped_column(Uuid)
    membership_ids: Mapped[list[str]] = mapped_column(JSON)
    destination_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    phase: Mapped[str] = mapped_column(String(16))
